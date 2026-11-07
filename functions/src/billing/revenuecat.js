const admin = require("firebase-admin");
const { Buffer } = require("node:buffer");
const crypto = require("node:crypto");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const { onRequest } = require("firebase-functions/v2/https");
const { isEntitledStatus, subscriptionStateFrom } = require("./subscription");
const { BATCH_LIMIT } = require("../shared/batch");
const { logExpireAt } = require("../shared/logging");

/**
 * cleanupExpiredSubscriptions — B4.S5.
 *
 * Force EXPIRATION sur les subscriptions dont expiresAt est dépassé mais
 * dont le status est toujours "active" (ou "cancelled" sans "expired"
 * follow-up). Garde-fou si RevenueCat oublie d'envoyer l'EXPIRATION
 * webhook (réseau, bug RC, etc.).
 *
 * NB : subscriptions.expiresAt est stocké en ISO string par revenueCatWebhook.
 * Pas de query Firestore directe par expiresAt < now (string compare peu
 * fiable). On scan les subs candidates par status, puis on filtre côté
 * code via Date.parse(). Coût accepté : 1 scan/jour avec un volume
 * subscriptions limité (≤ active user count).
 */
const cleanupExpiredSubscriptions = onSchedule(
  { schedule: "every 24 hours", region: "europe-west1" },
  async () => {
    const db = admin.firestore();
    const nowMs = Date.now();
    let lastDoc = null;
    let flipped = 0;
    let scanned = 0;

    // Scan tous les subs avec status susceptible d'être stale.
    // Lifetime n'a pas d'expiresAt → on skip.
    const stalableStatuses = ["active", "cancelled", "billing_issue"];

    for (const status of stalableStatuses) {
      lastDoc = null;
      while (true) {
        let query = db
          .collection("subscriptions")
          .where("status", "==", status)
          .limit(BATCH_LIMIT);
        if (lastDoc) query = query.startAfter(lastDoc);

        const snap = await query.get();
        if (snap.empty) break;
        scanned += snap.size;

        const batch = db.batch();
        let batchCount = 0;
        for (const doc of snap.docs) {
          const data = doc.data();
          // Skip subs sans expiresAt (lifetime ou data incomplete).
          if (!data.expiresAt || typeof data.expiresAt !== "string") continue;
          const parsedMs = Date.parse(data.expiresAt);
          if (!Number.isFinite(parsedMs) || parsedMs > nowMs) continue;

          // Expired : flip à status=expired tier=free.
          batch.set(
            doc.ref,
            {
              status: "expired",
              tier: "free",
              updatedAt: admin.firestore.Timestamp.now(),
              lastEvent: "cleanupExpiredSubscriptions",
            },
            { merge: true }
          );
          batchCount++;
          flipped++;
        }
        if (batchCount > 0) await batch.commit();

        lastDoc = snap.docs[snap.docs.length - 1];
        if (snap.size < BATCH_LIMIT) break;
      }
    }

    console.log(
      `cleanupExpiredSubscriptions: scanned=${scanned}, flipped=${flipped} to expired`
    );
  }
);

// ============================================
// REVENUECAT WEBHOOK
// ============================================

/** RevenueCat app_user_id that can be a Firestore doc id (uid): no anonymous ids, no path separators. */
function isRevenueCatUid(value) {
  return typeof value === "string" && !value.startsWith("$RCAnonymous") && /^[A-Za-z0-9_-]{1,128}$/.test(value);
}

/**
 * RevenueCat TRANSFER: the purchases of one or more app_user_ids moved to
 * others (login on a device that had an anonymous or another id). The event
 * carries `transferred_from` / `transferred_to` and no `app_user_id`, so it
 * is handled before the per-user flow. The entitlement stored for the source
 * account(s) moves to the destination account(s) and the sources fall back to
 * free, in one transaction together with the dedup marker.
 *
 * With no stored entitlement on the sources (anonymous id), the event's own
 * entitlement_ids / expiration are used when present; otherwise there is
 * nothing to move and the next RENEWAL event re-establishes the state.
 */
async function handleRevenueCatTransfer(db, event, eventId, eventTs, res) {
  const fromIds = [...new Set((Array.isArray(event.transferred_from) ? event.transferred_from : []).filter(isRevenueCatUid))].slice(0, 20);
  const toIds = [...new Set((Array.isArray(event.transferred_to) ? event.transferred_to : []).filter(isRevenueCatUid))].slice(0, 20);
  if (toIds.length === 0) {
    res.status(200).send("OK - transfer without destination");
    return;
  }

  // Destination accounts that no longer exist must not get a ghost document.
  const targets = [];
  for (const uid of toIds) {
    try {
      await admin.auth().getUser(uid);
      targets.push(uid);
    } catch (err) {
      if (err?.code === "auth/user-not-found") continue;
      console.error("revenueCatWebhook: TRANSFER getUser check failed:", err?.message ?? err);
      res.status(500).send("Auth lookup failed");
      return;
    }
  }

  const dedupRef = eventId ? db.doc(`revenuecat_webhook_events/${eventId}`) : null;
  const now = Date.now();
  const stamp = {
    lastEvent: "TRANSFER",
    updatedAt: admin.firestore.Timestamp.now(),
    ...(eventTs !== null && { lastEventTimestampMs: eventTs }),
  };
  const isNewerThanEvent = (data) =>
    eventTs !== null && typeof data.lastEventTimestampMs === "number" && data.lastEventTimestampMs > eventTs;
  const expiryOf = (data) => (data.expiresAt ? Date.parse(data.expiresAt) : Infinity);

  let duplicate = false;
  try {
    await db.runTransaction(async (tx) => {
      const dedupSnap = dedupRef ? await tx.get(dedupRef) : null;
      if (dedupSnap?.exists) {
        duplicate = true;
        return;
      }
      const sources = [];
      for (const uid of fromIds) {
        const snap = await tx.get(db.doc(`subscriptions/${uid}`));
        if (snap.exists) sources.push({ uid, data: snap.data() });
      }
      const targetSnaps = [];
      for (const uid of targets) {
        const snap = await tx.get(db.doc(`subscriptions/${uid}`));
        targetSnaps.push({ uid, data: snap.exists ? snap.data() : {} });
      }

      if (dedupRef) {
        tx.create(dedupRef, {
          eventId,
          eventType: "TRANSFER",
          receivedAt: admin.firestore.FieldValue.serverTimestamp(),
          expireAt: admin.firestore.Timestamp.fromMillis(now + 30 * 24 * 60 * 60 * 1000),
        });
      }

      // Entitlement to move: the stored one that lasts longest, else the event's own.
      const entitled = sources
        .filter(({ data }) => !isNewerThanEvent(data))
        .filter(({ data }) => (data.tier || "free") !== "free" && isEntitledStatus(subscriptionStateFrom({ exists: true, data: () => data }), now))
        .sort((a, b) => expiryOf(b.data) - expiryOf(a.data));
      let moved = null;
      if (entitled.length > 0) {
        const { tier, status, billingPeriod, expiresAt, productId } = entitled[0].data;
        moved = { tier, status, billingPeriod: billingPeriod || "unknown", ...(expiresAt && { expiresAt }), ...(productId && { productId }) };
      } else if (Array.isArray(event.entitlement_ids) && event.entitlement_ids.length > 0) {
        const ids = event.entitlement_ids;
        const tier = ids.includes("family") ? "family" : ids.includes("premium") ? "premium" : null;
        if (tier) {
          const productId = event.product_id || "";
          const expiryMs = event.expiration_at_ms;
          moved = {
            tier,
            status: "active",
            billingPeriod: productId.includes("lifetime") ? "lifetime" : productId.includes("annual") ? "annual" : productId.includes("monthly") ? "monthly" : "unknown",
            ...(Number.isFinite(expiryMs) && expiryMs > 0 && { expiresAt: new Date(expiryMs).toISOString() }),
            ...(productId && { productId }),
          };
        }
      }
      if (!moved) return;

      // Sources lose the entitlement (unless a later event already updated them).
      for (const { uid, data } of sources) {
        if ((data.tier || "free") === "free" || isNewerThanEvent(data)) continue;
        tx.set(db.doc(`subscriptions/${uid}`), { tier: "free", status: "expired", ...stamp }, { merge: true });
      }
      // Destinations receive it, except one that already holds a longer entitlement.
      for (const { uid, data } of targetSnaps) {
        if (isNewerThanEvent(data)) continue;
        const holdsLonger = (data.tier || "free") !== "free" &&
          isEntitledStatus(subscriptionStateFrom({ exists: true, data: () => data }), now) &&
          expiryOf(data) >= expiryOf(moved);
        if (holdsLonger) continue;
        tx.set(db.doc(`subscriptions/${uid}`), { ...moved, ...stamp, transferredFrom: fromIds }, { merge: true });
      }
    });
  } catch (err) {
    console.error(`revenueCatWebhook: TRANSFER failed for event ${eventId ?? "(no id)"}:`, err);
    res.status(500).send("Processing failed");
    return;
  }
  if (duplicate) {
    console.log(`revenueCatWebhook: duplicate TRANSFER ${eventId}, skipping`);
    res.status(200).send("OK - duplicate");
    return;
  }
  console.log(`revenueCatWebhook: TRANSFER from [${fromIds.length}] to [${targets.length}] ids processed`);
  res.status(200).send("OK");
}

/**
 * revenueCatWebhook — Reçoit les événements RevenuCat et met à jour Firestore.
 * URL à configurer dans RevenuCat Dashboard → Integrations → Webhooks.
 *
 * Hardening Lot 0 (T0.2) :
 *  - Comparaison constant-time du Bearer pour éviter timing attacks.
 *  - Idempotence par event.id : rejet duplicate si déjà traité (cache 30j
 *    via TTL Firestore sur revenuecat_webhook_events.expireAt).
 *  - Validation timestamp event : refus si > 5min futur ou > 7j passé
 *    (anti-replay grossier).
 *  - Skip si Firebase Auth user n'existe plus (évite user fantôme post-
 *    suppression de compte) — voir T0.5 RGPD orphelins.
 */
const revenueCatWebhook = onRequest(
  { region: "europe-west1", secrets: ["REVENUECAT_WEBHOOK_SECRET"] },
  async (req, res) => {
    // Vérifier la méthode
    if (req.method !== "POST") {
      res.status(405).send("Method not allowed");
      return;
    }

    // Vérifier le secret — OBLIGATOIRE, rejeter si non configuré
    const secret = process.env.REVENUECAT_WEBHOOK_SECRET;
    if (!secret) {
      console.error("revenueCatWebhook: REVENUECAT_WEBHOOK_SECRET not configured");
      res.status(500).send("Webhook not configured");
      return;
    }
    const authHeader = req.headers.authorization || "";
    const expected = `Bearer ${secret}`;
    // Constant-time compare : évite que la durée de la comparaison string
    // révèle combien de caractères du secret sont corrects (timing attack).
    if (
      authHeader.length !== expected.length ||
      !crypto.timingSafeEqual(Buffer.from(authHeader), Buffer.from(expected))
    ) {
      console.warn("revenueCatWebhook: invalid auth header");
      res.status(401).send("Unauthorized");
      return;
    }

    const event = req.body?.event;
    if (!event) {
      res.status(400).send("Missing event");
      return;
    }

    // T0.2 — anti-replay grossier sur le timestamp. RC envoie event_timestamp_ms.
    // Si l'event est étiqueté très loin dans le futur ou le passé, suspect.
    const eventTs = typeof event.event_timestamp_ms === "number"
      ? event.event_timestamp_ms
      : null;
    if (eventTs !== null) {
      const now = Date.now();
      const FIVE_MIN = 5 * 60 * 1000;
      const SEVEN_DAYS = 7 * 24 * 60 * 60 * 1000;
      if (eventTs > now + FIVE_MIN || eventTs < now - SEVEN_DAYS) {
        console.error(
          `revenueCatWebhook: timestamp out of bounds (${eventTs} vs now=${now}), event ignored`
        );
        // 200 OK pour éviter que RC retry — on accepte le rejet silencieux.
        res.status(200).send("OK - timestamp rejected");
        return;
      }
    }

    // T0.2 — idempotence par event.id (UUID unique par event RC). Le marqueur
    // est lu et créé DANS la transaction qui écrit l'abonnement (plus bas) :
    // si le traitement échoue, rien n'est marqué et le retry de RevenueCat
    // retraite l'événement au lieu de le prendre pour un doublon.
    const eventId = typeof event.id === "string" && /^[A-Za-z0-9_-]{1,200}$/.test(event.id)
      ? event.id
      : null;
    if (event.id !== undefined && !eventId) {
      console.error("revenueCatWebhook: invalid event id, skipping");
      res.status(200).send("OK - invalid event id");
      return;
    }
    const db = admin.firestore();
    const dedupRef = eventId ? db.doc(`revenuecat_webhook_events/${eventId}`) : null;

    // TRANSFER n'a pas d'app_user_id : traité à part, avant le flux par utilisateur.
    if (event.type === "TRANSFER") {
      await handleRevenueCatTransfer(db, event, eventId, eventTs, res);
      return;
    }

    const appUserId = event.app_user_id;
    if (!appUserId || (typeof appUserId === "string" && appUserId.startsWith("$RCAnonymous"))) {
      // Ignorer les utilisateurs anonymes
      res.status(200).send("OK - skipped anonymous");
      return;
    }
    // app_user_id = uid Firebase : refuser tout ce qui pourrait former un
    // autre chemin Firestore (ex. "a/b") dans subscriptions/{appUserId}.
    if (typeof appUserId !== "string" || !/^[A-Za-z0-9_-]{1,128}$/.test(appUserId)) {
      console.warn("revenueCatWebhook: invalid app_user_id, skipping");
      res.status(200).send("OK - invalid user id");
      return;
    }

    // T0.2 + T0.5 — skip si le user Firebase Auth n'existe plus (compte
    // supprimé). Évite de recréer un user fantôme dans subscriptions/
    // via un webhook RC en retard. RC retry pendant ~3 jours → check
    // côté Auth tant qu'on est dans cette fenêtre.
    try {
      await admin.auth().getUser(appUserId);
    } catch (err) {
      if (err?.code === "auth/user-not-found") {
        console.log(
          `revenueCatWebhook: user ${appUserId} no longer exists in Auth, skipping`
        );
        res.status(200).send("OK - user deleted");
        return;
      }
      // Autre erreur (réseau Auth, etc.) : 500 pour que RevenueCat réessaie
      // (rien n'est encore marqué comme traité).
      console.error(`revenueCatWebhook: getUser check failed:`, err?.message ?? err);
      res.status(500).send("Auth lookup failed");
      return;
    }

    const eventType = event.type;
    const entitlements = event.entitlement_ids || [];

    // Déterminer le tier
    let tier = "free";
    if (entitlements.includes("family")) tier = "family";
    else if (entitlements.includes("premium")) tier = "premium";

    // Déterminer le status
    let status = "active";
    // BILLING_ISSUE : la période de grâce du store (si activée) est portée par
    // grace_period_expiration_at_ms ; l'accès reste ouvert jusque-là.
    const expiryMs =
      eventType === "BILLING_ISSUE" && typeof event.grace_period_expiration_at_ms === "number"
        ? event.grace_period_expiration_at_ms
        : event.expiration_at_ms;
    const expiresAt = Number.isFinite(expiryMs) && expiryMs > 0 ? new Date(expiryMs).toISOString() : null;

    switch (eventType) {
      case "INITIAL_PURCHASE":
      case "RENEWAL":
      case "PRODUCT_CHANGE":
      case "UNCANCELLATION":
      case "NON_RENEWING_PURCHASE":
      case "SUBSCRIPTION_EXTENDED":
      case "TEMPORARY_ENTITLEMENT_GRANT":
        status = "active";
        break;
      case "CANCELLATION":
        // CUSTOMER_SUPPORT = remboursement : l'accès est retiré tout de suite.
        // Les autres raisons (désabonnement, erreur de paiement…) gardent
        // l'accès jusqu'à expiresAt.
        if (event.cancel_reason === "CUSTOMER_SUPPORT") {
          status = "expired";
          tier = "free";
        } else {
          status = "cancelled";
        }
        break;
      case "BILLING_ISSUE":
        status = "billing_issue";
        break;
      case "EXPIRATION":
        status = "expired";
        tier = "free";
        break;
      case "SUBSCRIBER_ALIAS":
        // Juste un alias, pas de changement de status
        res.status(200).send("OK - alias");
        return;
      default:
        // TEST, SUBSCRIPTION_PAUSED, INVOICE_ISSUANCE… : ne pas
        // écraser l'abonnement avec un status "active" et un tier déduit
        // d'entitlement_ids éventuellement vides.
        console.log(`revenueCatWebhook: unhandled event type ${eventType}, skipping`);
        res.status(200).send("OK - ignored");
        return;
    }

    // Mettre à jour Firestore
    // Déterminer le billing period depuis le product ID
    const productId = event.product_id || "";
    let billingPeriod = "unknown";
    if (productId.includes("lifetime")) billingPeriod = "lifetime";
    else if (productId.includes("annual")) billingPeriod = "annual";
    else if (productId.includes("monthly")) billingPeriod = "monthly";

    const subscriptionData = {
      tier,
      status,
      billingPeriod,
      ...(expiresAt && { expiresAt }),
      ...(productId && { productId }),
      ...(eventTs !== null && { lastEventTimestampMs: eventTs }),
      updatedAt: admin.firestore.Timestamp.now(),
      lastEvent: eventType,
    };

    // Transaction : marqueur anti-doublon + abonnement écrits ensemble (ou pas
    // du tout). Évite aussi les race conditions entre deux webhooks simultanés.
    let duplicate = false;
    try {
      await db.runTransaction(async (tx) => {
        const subRef = db.doc(`subscriptions/${appUserId}`);
        const dedupSnap = dedupRef ? await tx.get(dedupRef) : null;
        if (dedupSnap?.exists) {
          duplicate = true;
          return;
        }
        const existing = await tx.get(subRef);
        const existingData = existing.exists ? existing.data() : {};
        if (dedupRef) {
          tx.create(dedupRef, {
            eventId,
            eventType: eventType ?? "unknown",
            receivedAt: admin.firestore.FieldValue.serverTimestamp(),
            // TTL field — Firestore TTL policy auto-purge après expireAt.
            // Provisionner avec functions/scripts/enable-rc-webhook-ttl.js.
            expireAt: admin.firestore.Timestamp.fromMillis(
              Date.now() + 30 * 24 * 60 * 60 * 1000
            ),
          });
        }

        // Ne pas écraser l'état avec un event plus ancien que le dernier traité
        // (RevenueCat ne garantit pas l'ordre de livraison ni des retries).
        // On compare les horodatages des events, pas l'heure de traitement.
        if (eventTs !== null &&
            typeof existingData.lastEventTimestampMs === "number" &&
            existingData.lastEventTimestampMs > eventTs) {
          console.log(`revenueCatWebhook: skipping out-of-order event for ${appUserId}`);
          return;
        }

        tx.set(subRef, subscriptionData, { merge: true });
      });
    } catch (err) {
      console.error(`revenueCatWebhook: processing failed for event ${eventId ?? "(no id)"}:`, err);
      res.status(500).send("Processing failed");
      return;
    }
    if (duplicate) {
      console.log(`revenueCatWebhook: duplicate event ${eventId}, skipping`);
      res.status(200).send("OK - duplicate");
      return;
    }

    // Log webhook pour debug et audit — non bloquant : l'abonnement est déjà
    // écrit et l'événement marqué ; un échec ici ne doit pas renvoyer 5xx.
    try {
      await db.collection("webhook_logs").add({
        source: "revenuecat",
        appUserId,
        eventType,
        tier,
        status,
        productId,
        processedAt: admin.firestore.Timestamp.now(),
        expireAt: logExpireAt(),
      });
    } catch (err) {
      console.error("revenueCatWebhook: webhook_logs write failed:", err?.message ?? err);
    }

    console.log(`revenueCatWebhook: uid=${appUserId}, type=${eventType}, tier=${tier}, status=${status}`);
    res.status(200).send("OK");
  }
);

module.exports = {
  cleanupExpiredSubscriptions,
  revenueCatWebhook,
};
