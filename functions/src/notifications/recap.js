const admin = require("firebase-admin");
const { Buffer } = require("node:buffer");
const crypto = require("node:crypto");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const { onRequest } = require("firebase-functions/v2/https");
const { functionsBaseUrl } = require("../../lib/projectConfig");
const { buildRecapHTML } = require("../../emailTemplates");
const reminderLib = require("../../lib/reminders");
const { hasValidHealthConsent } = require("../deletion/consent");
const { JOB_USER_CONCURRENCY, usersWithPendingDeletion } = require("./eligibility");
const { logExpireAt } = require("../shared/logging");
const { newResend } = require("../shared/runtime");
const { RECAP_UNSUBSCRIBE_SECRET, secretValue } = require("../shared/secrets");

// ============================================
// WEEKLY RECAP EMAIL (Scheduled)
// ============================================

/** Deep link opened by the recap e-mail button. */
const RECAP_OPEN_APP_URL = "suivibaby://baby/home";

/** HMAC-SHA256(uid) hex: proves an unsubscribe link was issued by the server. */
function recapUnsubscribeToken(uid, secret) {
  return crypto.createHmac("sha256", secret).update(uid).digest("hex");
}

function recapUnsubscribeUrl(uid, secret) {
  return `${functionsBaseUrl()}/unsubscribeRecap?uid=${encodeURIComponent(uid)}&token=${recapUnsubscribeToken(uid, secret)}`;
}

/** Constant-time check of an unsubscribe token (length checked first: timingSafeEqual throws otherwise). */
function isValidRecapToken(uid, token, secret) {
  if (typeof uid !== "string" || typeof token !== "string" || !secret) return false;
  const expected = Buffer.from(recapUnsubscribeToken(uid, secret));
  const given = Buffer.from(token);
  return given.length === expected.length && crypto.timingSafeEqual(given, expected);
}

/**
 * Formate une date en "9 mars 2026"
 */
function formatDateFr(date) {
  const months = [
    "janvier", "février", "mars", "avril", "mai", "juin",
    "juillet", "août", "septembre", "octobre", "novembre", "décembre",
  ];
  return `${date.getDate()} ${months[date.getMonth()]} ${date.getFullYear()}`;
}

/**
 * sendWeeklyRecap — Envoi du récap hebdomadaire chaque lundi à 8h.
 * L'e-mail ne contient AUCUNE donnée de santé : il dit seulement que le récap
 * est prêt dans l'app. Destinataires : utilisateurs ayant activé l'e-mail,
 * adresse issue de Firebase Auth (vérifiée, compte actif), hors suppression
 * programmée, et seulement pour les enfants dont ils sont owner ou admin.
 * Chaque e-mail porte un lien de désinscription en un clic (unsubscribeRecap).
 */
const sendWeeklyRecap = onSchedule(
  {
    schedule: "every monday 08:00",
    timeZone: "Europe/Paris",
    region: "europe-west1",
    memory: "256MiB",
    timeoutSeconds: 300,
    secrets: ["RESEND_API_KEY", RECAP_UNSUBSCRIBE_SECRET],
  },
  async () => {
    const startedAt = Date.now();
    console.log("sendWeeklyRecap: START");
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      console.error("sendWeeklyRecap: RESEND_API_KEY not configured");
      return;
    }
    const unsubscribeSecret = secretValue(RECAP_UNSUBSCRIBE_SECRET);
    if (!unsubscribeSecret) {
      console.error("sendWeeklyRecap: RECAP_UNSUBSCRIBE_SECRET not configured, no e-mail sent");
      return;
    }

    const resend = newResend(apiKey);
    const db = admin.firestore();

    // Calculer les bornes de la semaine à récapituler
    const now = new Date();
    const dayOfWeek = now.getDay(); // 0=dim, 1=lun
    const mondayOffset = dayOfWeek === 0 ? 6 : dayOfWeek - 1;

    // Lundi de cette semaine
    const thisMonday = new Date(now);
    thisMonday.setDate(now.getDate() - mondayOffset);
    thisMonday.setHours(0, 0, 0, 0);

    // Si on est lundi (exécution normale), récapituler la semaine précédente
    // Sinon (exécution forcée), récapituler la semaine courante jusqu'à maintenant
    const isMonday = dayOfWeek === 1;

    const lastMonday = new Date(thisMonday);
    if (isMonday) {
      lastMonday.setDate(thisMonday.getDate() - 7);
    }
    // sinon lastMonday = thisMonday (semaine courante)

    const lastSunday = new Date(isMonday ? thisMonday : now);
    if (isMonday) {
      lastSunday.setDate(thisMonday.getDate() - 1);
    }
    lastSunday.setHours(23, 59, 59, 999);

    console.log(`sendWeeklyRecap: date calc — now=${now.toISOString()}, dayOfWeek=${dayOfWeek}, isMonday=${isMonday}, lastMonday=${lastMonday.toISOString()}, lastSunday=${lastSunday.toISOString()}`);

    const weekStart = admin.firestore.Timestamp.fromDate(lastMonday);
    const weekEnd = admin.firestore.Timestamp.fromDate(lastSunday);

    const weekLabel = `${formatDateFr(lastMonday)} au ${formatDateFr(lastSunday)}`;

    // Récupérer tous les utilisateurs avec email activé
    const prefsSnap = await db
      .collection("user_preferences")
      .where("notifications.email", "==", true)
      .get();

    console.log(`sendWeeklyRecap: found ${prefsSnap.size} users with email enabled, weekLabel=${weekLabel}`);

    if (prefsSnap.empty) {
      console.log("sendWeeklyRecap: no users with email recap enabled");
      reminderLib.logJobSummary("sendWeeklyRecap", startedAt, { users: 0, sent: 0, skipped: 0, errors: 0, fallbackReads: 0 });
      return;
    }

    const stats = { sent: 0, skipped: 0, errors: 0, fallbackReads: 0 };

    // Sans consentement valide : aucun traitement. Compte en cours de
    // suppression : plus aucun e-mail. Lectures groupées (pas de N+1).
    const consented = prefsSnap.docs.filter((d) => hasValidHealthConsent(d.data()));
    stats.skipped += prefsSnap.size - consented.length;
    const leaving = await usersWithPendingDeletion(db, consented.map((d) => d.id));

    const processUser = async (prefDoc) => {
      const userId = prefDoc.id;
      if (leaving.has(userId)) {
        stats.skipped++;
        return;
      }

      // L'adresse vient de Firebase Auth uniquement : vérifiée, compte actif.
      let userEmail;
      try {
        const authUser = await admin.auth().getUser(userId);
        if (!authUser.emailVerified || authUser.disabled || !authUser.email) {
          stats.skipped++;
          return;
        }
        userEmail = authUser.email;
      } catch (error) {
        console.warn(`sendWeeklyRecap: no usable Auth user for ${userId}`, error.message);
        stats.skipped++;
        return;
      }

      // Récupérer les enfants de l'utilisateur
      const accessSnap = await db
        .collection("user_child_access")
        .where("userId", "==", userId)
        .get();

      for (const accessDoc of accessSnap.docs) {
        const { childId } = accessDoc.data();
        if (!childId) continue;

        // Seuls les owners et admins reçoivent le récap d'un enfant.
        const roleSnap = await db.doc(`children/${childId}/access/${userId}`).get();
        const role = roleSnap.exists ? roleSnap.data()?.role : null;
        if (role !== "owner" && role !== "admin") {
          stats.skipped++;
          continue;
        }

        // Anti-doublon : vérifier si déjà envoyé pour cette semaine
        const existingSnap = await db
          .collection("recap_history")
          .where("userId", "==", userId)
          .where("childId", "==", childId)
          .where("weekStart", "==", weekStart)
          .limit(1)
          .get();

        if (!existingSnap.empty) {
          console.log(`sendWeeklyRecap: SKIP ${childId} for user ${userId} - already sent this week (docId=${existingSnap.docs[0].id})`);
          stats.skipped++;
          continue;
        }

        // Prénom de l'enfant (seule donnée personnelle du corps du message)
        const childDoc = await db.doc(`children/${childId}`).get();
        if (!childDoc.exists || childDoc.data()?.deletedAt) continue;
        const childName = String(childDoc.data().name || "Bébé").trim().split(/\s+/)[0] || "Bébé";

        // Activité : lue dans children/{id}.lastEventAt.any (requête de repli si absent).
        if (!(await reminderLib.hadActivityInWeek(db, childId, childDoc.data(), weekStart, weekEnd, stats))) {
          console.log(`sendWeeklyRecap: SKIP child=${childId} - no activity this week`);
          stats.skipped++;
          continue;
        }

        const unsubscribeUrl = recapUnsubscribeUrl(userId, unsubscribeSecret);
        const html = buildRecapHTML({ childName, openAppUrl: RECAP_OPEN_APP_URL, unsubscribeUrl });

        // Envoyer via Resend
        console.log(`sendWeeklyRecap: sending uid=${userId} child=${childId}`);
        try {
          const sendResult = await resend.emails.send({
            from: "Suivi Baby <noreply@suivibaby.com>",
            to: userEmail,
            subject: "Le récap de la semaine est prêt",
            html,
            headers: {
              "List-Unsubscribe": `<${unsubscribeUrl}>`,
              "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
            },
          });
          // Resend reports failures in the result instead of throwing.
          if (sendResult?.error) {
            throw new Error(`Resend: ${sendResult.error.name ?? "error"} ${sendResult.error.message ?? ""}`.trim());
          }
          console.log(`sendWeeklyRecap: sent id=${sendResult?.data?.id ?? sendResult?.id ?? "?"}`);

          // Historique : métadonnées seulement (anti-doublon), aucune stat.
          await db.collection("recap_history").add({
            userId,
            childId,
            weekStart,
            weekEnd,
            sentAt: admin.firestore.Timestamp.now(),
            expireAt: logExpireAt(),
          });

          stats.sent++;
        } catch (error) {
          stats.errors++;
          console.error(
            `sendWeeklyRecap: error sending uid=${userId} child=${childId}:`,
            error.message
          );
        }
      }
    };

    await reminderLib.mapInChunks(consented, JOB_USER_CONCURRENCY, async (prefDoc) => {
      try {
        await processUser(prefDoc);
      } catch (error) {
        stats.errors++;
        console.error(`sendWeeklyRecap: user ${prefDoc.id} failed:`, error?.message ?? error);
      }
    });

    console.log(
      `sendWeeklyRecap: sent=${stats.sent}, skipped=${stats.skipped}, users=${prefsSnap.size}`
    );
    reminderLib.logJobSummary("sendWeeklyRecap", startedAt, { users: prefsSnap.size, ...stats });
  }
);

const escapeHtmlText = (str) =>
  String(str).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function unsubscribePage(title, bodyHtml) {
  return `<!DOCTYPE html>
<html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><meta name="robots" content="noindex"><title>${title}</title>
<style>body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#f4f6f8;margin:0;padding:48px 16px;color:#1e2a36}main{max-width:440px;margin:0 auto;background:#fff;border-radius:16px;padding:32px;text-align:center}button{background:#0891b2;color:#fff;border:0;border-radius:12px;padding:14px 28px;font-size:16px;font-weight:600;cursor:pointer}</style></head>
<body><main><h1 style="font-size:20px">${title}</h1>${bodyHtml}</main></body></html>`;
}

/**
 * unsubscribeRecap — HTTPS, public. GET ?uid=…&token=… shows a confirmation
 * page; POST (button, or one-click unsubscribe from the mail client, RFC 8058)
 * sets user_preferences/{uid}.notifications.email = false.
 * token = hex HMAC-SHA256(uid) with RECAP_UNSUBSCRIBE_SECRET.
 * URL: https://europe-west1-<projet>.cloudfunctions.net/unsubscribeRecap
 */
const unsubscribeRecap = onRequest(
  { region: "europe-west1", secrets: [RECAP_UNSUBSCRIBE_SECRET] },
  async (req, res) => {
    res.set("Content-Type", "text/html; charset=utf-8");
    // The page must never be framed (clickjacking of the unsubscribe button).
    res.set("X-Frame-Options", "DENY");
    res.set("Content-Security-Policy", "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'");
    if (req.method !== "GET" && req.method !== "POST") {
      res.set("Allow", "GET, POST");
      res.status(405).send(unsubscribePage("Méthode non autorisée", ""));
      return;
    }

    const secret = secretValue(RECAP_UNSUBSCRIBE_SECRET);
    if (!secret) {
      console.error("unsubscribeRecap: RECAP_UNSUBSCRIBE_SECRET not configured");
      res.status(500).send(unsubscribePage("Service indisponible", "<p>Réessayez plus tard.</p>"));
      return;
    }

    const uid = req.query?.uid;
    const token = req.query?.token;
    if (typeof uid !== "string" || uid.length === 0 || uid.length > 128) {
      res.status(400).send(unsubscribePage("Lien invalide", "<p>Ce lien de désinscription est incomplet.</p>"));
      return;
    }
    if (!isValidRecapToken(uid, token, secret)) {
      res.status(403).send(unsubscribePage("Lien invalide", "<p>Ce lien de désinscription n'est pas valide. Vous pouvez aussi désactiver les récaps dans l'application, rubrique Notifications.</p>"));
      return;
    }

    if (req.method === "GET") {
      const action = `${functionsBaseUrl()}/unsubscribeRecap?uid=${encodeURIComponent(uid)}&token=${token}`;
      res.status(200).send(unsubscribePage(
        "Se désabonner des récaps",
        `<p>Vous ne recevrez plus le récap hebdomadaire par e-mail.</p>
<form method="POST" action="${escapeHtmlText(action)}"><button type="submit">Me désabonner</button></form>`
      ));
      return;
    }

    try {
      // update(): never creates a preferences document for an arbitrary uid.
      // A missing document means there is nothing to unsubscribe from: success.
      await admin.firestore().doc(`user_preferences/${uid}`).update({ "notifications.email": false });
    } catch (e) {
      if (e?.code !== 5 && e?.code !== "not-found") {
        console.error(`unsubscribeRecap: write failed for uid=${uid}`, e?.message ?? e);
        res.status(500).send(unsubscribePage("Une erreur est survenue", "<p>Réessayez plus tard.</p>"));
        return;
      }
    }
    res.status(200).send(unsubscribePage("Vous êtes désabonné", "<p>Vous ne recevrez plus le récap hebdomadaire par e-mail. Vous pouvez le réactiver à tout moment dans l'application.</p>"));
  }
);

module.exports = {
  sendWeeklyRecap,
  unsubscribeRecap,
};
