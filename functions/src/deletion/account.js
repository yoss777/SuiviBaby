const admin = require("firebase-admin");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { writeAdminAudit } = require("../admin/audit");
const { purgeUserData } = require("./purgeUser");
const { monitorAppCheck, withAppCheck } = require("../shared/appCheck");
const { deleteDocsByFieldBatched } = require("../shared/batch");
const { checkRateLimit } = require("../shared/rateLimit");
const { newResend } = require("../shared/runtime");
const { APPLE_SECRETS } = require("../shared/secrets");

/** Resend reports refusals (unverified domain, quota…) in the result. */
async function sendEmailOrThrow(resend, payload) {
  const result = await resend.emails.send(payload);
  if (result?.error) {
    throw new Error(`Resend: ${result.error.name ?? "error"} ${result.error.message ?? ""}`.trim());
  }
  return result;
}

// ============================================
// ACCOUNT DELETION (RGPD)
// ============================================

/**
 * deleteUserAccount — Suppression complète du compte utilisateur et de toutes ses données.
 * Obligatoire pour conformité RGPD (Apple/Google Store requirement).
 */
const deleteUserAccount = onCall(
  withAppCheck({ region: "europe-west1", timeoutSeconds: 300, memory: "512MiB", secrets: APPLE_SECRETS }),
  async (request) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Authentification requise.");
    }
    monitorAppCheck(request, "deleteUserAccount");

    const uid = request.auth.uid;
    const db = admin.firestore();

    // T4 — This entry point is reserved for platform admins. The user-facing
    // path is the soft-delete workflow (requestAccountDeletion + 30-day
    // pendingDeletion + processScheduledDeletions cron). A direct callable
    // bypassing the grace period was abusable: a malicious client could wipe
    // an account instantly with no recovery window. Enforce admin claim.
    let callerRecord;
    try {
      callerRecord = await admin.auth().getUser(uid);
    } catch {
      throw new HttpsError("internal", "Impossible de vérifier l'identité.");
    }
    if (!callerRecord.customClaims?.admin) {
      throw new HttpsError(
        "permission-denied",
        "Suppression immédiate réservée aux administrateurs. Utilisez la suppression programmée (30 jours) côté application."
      );
    }

    // Optional payload override: admin can target a specific uid.
    const targetUid = request.data?.uid ?? uid;
    if (typeof targetUid !== "string" || !/^[A-Za-z0-9_-]{1,128}$/.test(targetUid)) {
      throw new HttpsError("invalid-argument", "uid invalide.");
    }
    const reason = typeof request.data?.reason === "string"
      ? request.data.reason.trim().slice(0, 500)
      : "";

    if (targetUid !== uid) {
      // T0.6 — quand un admin supprime un AUTRE compte, on exige une raison
      // documentée et on écrit dans adminAuditLog (pas juste un console.log).
      // C'est la voie d'évasion la plus sensible : un admin compromis peut
      // effacer N comptes, on veut une trace traçable a posteriori.
      if (reason.length < 5) {
        throw new HttpsError(
          "invalid-argument",
          "reason requis (5-500 chars) pour supprimer le compte d'un autre utilisateur."
        );
      }
      try {
        await writeAdminAudit(db,{
          type: "deleteUserAccount",
          adminUid: uid,
          adminEmail: callerRecord.email || null,
          targetUid,
          reason,
          at: admin.firestore.FieldValue.serverTimestamp(),
        });
      } catch (e) {
        // Audit log est la défense principale ici — refuser si on n'arrive
        // pas à le tracer.
        console.error("deleteUserAccount: failed to write audit log", e.message);
        throw new HttpsError(
          "internal",
          "Audit log indisponible — opération annulée pour traçabilité."
        );
      }
      console.log(
        `deleteUserAccount: admin ${uid} deleting account ${targetUid} (reason="${reason.slice(0, 80)}")`
      );
    }

    // Rate limit on the admin caller (not the target).
    await checkRateLimit(db, uid, "delete", 1);

    try {
      await purgeUserData(db, targetUid);
    } catch (e) {
      console.error(`deleteUserAccount: purge failed for uid=${targetUid}`, e?.message ?? e);
      throw new HttpsError("internal", "Suppression interrompue, relancez-la : rien n'a été confirmé.");
    }

    console.log(`deleteUserAccount: completed for uid=${targetUid} (admin=${uid})`);
    return { success: true };
  }
);

// ============================================
// ACCOUNT DELETION REQUEST (server side)
// ============================================

const ACCOUNT_DELETION_GRACE_DAYS = 30;
/** A deletion request needs a login at most this old (seconds). */
const RECENT_LOGIN_MAX_AGE_S = 5 * 60;

/**
 * Sends the "deletion scheduled" e-mail to the Auth address of `uid` and keeps
 * that address with the request (the confirmation can still be sent after the
 * Auth account is gone). Throws HttpsError; shared by sendDeletionRequestEmail
 * (app 1.0.8) and requestAccountDeletion.
 */
async function deliverDeletionRequestEmail(db, uid, deletionDateIso) {
  let email = "";
  try {
    const userRecord = await admin.auth().getUser(uid);
    email = userRecord.email || "";
  } catch {
    throw new HttpsError("internal", "Impossible de recuperer l'email.");
  }

  if (!email) {
    throw new HttpsError("failed-precondition", "Aucun email associe au compte.");
  }

  const deletionDate = new Date(deletionDateIso).toLocaleDateString("fr-FR");

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.error("deliverDeletionRequestEmail: RESEND_API_KEY not configured");
    throw new HttpsError("unavailable", "Envoi d'e-mail indisponible.");
  }

  await db.doc(`users/${uid}`).update({ "pendingDeletion.email": email }).catch((e) => {
    console.error(`deliverDeletionRequestEmail: could not store e-mail for uid=${uid}`, e);
  });

  const resend = newResend(apiKey);
  await sendEmailOrThrow(resend, {
    from: "Suivi Baby <noreply@suivibaby.com>",
    to: email,
    subject: "Demande de suppression de votre compte Suivi Baby",
    html: `
        <div style="font-family: -apple-system, sans-serif; max-width: 500px; margin: 0 auto; padding: 20px;">
          <h2 style="color: #1a1a1a;">Suppression programmee</h2>
          <p>Vous avez demande la suppression de votre compte Suivi Baby.</p>
          <p>Votre compte et toutes vos donnees seront definitivement supprimes le <strong>${deletionDate}</strong>.</p>
          <p>Si vous changez d'avis, vous pouvez annuler cette demande a tout moment depuis les <strong>Parametres</strong> de l'application.</p>
          <p>Si vous n'etes pas a l'origine de cette demande, connectez-vous immediatement a l'application et annulez la suppression, puis changez votre mot de passe.</p>
          <p style="color: #666; font-size: 12px; margin-top: 30px;">Cet email a ete envoye automatiquement par Suivi Baby. Conformite RGPD art. 17.</p>
        </div>
      `,
  });
  return email;
}

/**
 * requestAccountDeletion — Schedules the account deletion (30-day grace
 * period) on the server. Input: {}. Output: { deletionDate: ISO string, emailSent?: boolean }.
 * Needs a login at most 5 minutes old (token auth_time), otherwise
 * failed-precondition with details.reason "recent-login-required".
 * Writes users/{uid}.pendingDeletion = { scheduledAt, deletionDate, email }
 * (ISO strings, the shape app 1.0.8 writes and processScheduledDeletions
 * queries), deletes the device tokens and sends the confirmation e-mail
 * (a failed e-mail does not undo the request). Idempotent: an existing request
 * keeps its date.
 */
const requestAccountDeletion = onCall(
  withAppCheck({ region: "europe-west1", secrets: ["RESEND_API_KEY"] }),
  async (request) => {
    monitorAppCheck(request, "requestAccountDeletion");
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Authentification requise.");
    }
    const uid = request.auth.uid;
    const authTime = Number(request.auth.token?.auth_time);
    if (!Number.isFinite(authTime) || Date.now() / 1000 - authTime > RECENT_LOGIN_MAX_AGE_S) {
      throw new HttpsError(
        "failed-precondition",
        "Reconnectez-vous pour confirmer la suppression du compte.",
        { reason: "recent-login-required" }
      );
    }

    const db = admin.firestore();
    await checkRateLimit(db, uid, "account_deletion", 5);

    const userSnap = await db.doc(`users/${uid}`).get();
    const existing = userSnap.exists ? userSnap.data()?.pendingDeletion : null;
    if (existing?.deletionDate) {
      return { deletionDate: String(existing.deletionDate) };
    }

    const scheduledAt = new Date();
    const deletionDate = new Date(scheduledAt.getTime() + ACCOUNT_DELETION_GRACE_DAYS * 24 * 60 * 60 * 1000);
    let email = "";
    try {
      email = ((await admin.auth().getUser(uid)).email || "").toLowerCase();
    } catch (e) {
      console.warn(`requestAccountDeletion: no Auth e-mail for uid=${uid}`, e?.message ?? e);
    }
    const pendingDeletion = {
      scheduledAt: scheduledAt.toISOString(),
      deletionDate: deletionDate.toISOString(),
      email,
    };
    // mergeFields: replaces the whole map and works when users/{uid} is missing.
    await db.doc(`users/${uid}`).set({ pendingDeletion }, { mergeFields: ["pendingDeletion"] });

    // No push for an account that is leaving.
    await deleteDocsByFieldBatched(db, "device_tokens", "userId", uid);

    // Une erreur d'e-mail n'annule pas la demande, mais elle est signalée au
    // client (emailSent) pour qu'il ne promette pas un e-mail qui ne vient pas.
    let emailSent = true;
    try {
      await deliverDeletionRequestEmail(db, uid, pendingDeletion.deletionDate);
    } catch (e) {
      emailSent = false;
      console.error(`requestAccountDeletion: confirmation e-mail failed for uid=${uid}`, e?.message ?? e);
    }
    return { deletionDate: pendingDeletion.deletionDate, emailSent };
  }
);

/**
 * cancelAccountDeletion — Removes users/{uid}.pendingDeletion during the grace
 * period. Input: {}. Output: { success: true }.
 */
const cancelAccountDeletion = onCall(
  withAppCheck({ region: "europe-west1" }),
  async (request) => {
    monitorAppCheck(request, "cancelAccountDeletion");
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Authentification requise.");
    }
    const uid = request.auth.uid;
    const db = admin.firestore();
    await db.doc(`users/${uid}`).set(
      { pendingDeletion: admin.firestore.FieldValue.delete() },
      { merge: true }
    );
    return { success: true };
  }
);

// ============================================
// ACCOUNT DELETION REQUEST EMAIL
// ============================================

/**
 * sendDeletionRequestEmail — Envoie un email confirmant la demande de suppression.
 * Appelé côté client après que l'utilisateur a programmé la suppression.
 */
const sendDeletionRequestEmail = onCall(
  withAppCheck({ region: "europe-west1", secrets: ["RESEND_API_KEY"] }),
  async (request) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Authentification requise.");
    }

    const uid = request.auth.uid;
    const db = admin.firestore();

    const userDoc = await db.doc(`users/${uid}`).get();
    const userData = userDoc.data();
    if (!userData?.pendingDeletion) {
      throw new HttpsError("failed-precondition", "Aucune suppression programmee.");
    }

    await deliverDeletionRequestEmail(db, uid, userData.pendingDeletion.deletionDate);

    return { success: true };
  }
);

// ============================================
// SCHEDULED ACCOUNT DELETION (Grace period 30 days)
// ============================================

const MIN_DELETION_WINDOW_MS = 29 * 24 * 60 * 60 * 1000;

/** Millis of an ISO string, Timestamp, Date or number; null when unusable. */
function pendingDateMillis(value) {
  if (value === null || value === undefined) return null;
  const ms = typeof value?.toMillis === "function" ? value.toMillis()
    : value instanceof Date ? value.getTime()
      : typeof value === "number" ? value
        : typeof value === "string" ? new Date(value).getTime() : NaN;
  return Number.isFinite(ms) ? ms : null;
}

/**
 * processScheduledDeletions — Exécutée toutes les 24h.
 * Traite les comptes marqués `pendingDeletion` dont la date est dépassée.
 * Appelle la même logique que deleteUserAccount pour chaque compte expiré.
 */
const processScheduledDeletions = onSchedule(
  { schedule: "every 24 hours", region: "europe-west1", timeoutSeconds: 540, memory: "512MiB", secrets: ["RESEND_API_KEY", ...APPLE_SECRETS] },
  async () => {
    const db = admin.firestore();
    const now = new Date().toISOString();

    const snapshot = await db
      .collection("users")
      .where("pendingDeletion.deletionDate", "<=", now)
      .limit(50)
      .get();

    if (snapshot.empty) {
      console.log("processScheduledDeletions: no accounts to delete");
      return;
    }

    console.log(`processScheduledDeletions: processing ${snapshot.size} accounts`);

    for (const userDoc of snapshot.docs) {
      const uid = userDoc.id;
      const pending = userDoc.data()?.pendingDeletion || {};
      // M1: a request must leave the 30-day grace period (29 days tolerated
      // for DST). A shorter or undated window is never executed.
      const scheduledMs = pendingDateMillis(pending.scheduledAt);
      const deletionMs = pendingDateMillis(pending.deletionDate);
      if (scheduledMs === null || deletionMs === null || deletionMs - scheduledMs < MIN_DELETION_WINDOW_MS) {
        console.error(
          `processScheduledDeletions: INVALID_PENDING_DELETION uid=${uid} ignored (deletion window shorter than 29 days or undated)`
        );
        continue;
      }
      try {
        const purged = await purgeUserData(db, uid);
        // Auth may already be gone on a retry: fall back to the address kept
        // with the request.
        const email = purged.email || pending.email || "";

        // E-mail only once everything is really gone (Auth included).
        const apiKey = process.env.RESEND_API_KEY;
        if (!email || !apiKey) {
          console.error(`processScheduledDeletions: no confirmation e-mail for uid=${uid} (${!email ? "no address" : "RESEND_API_KEY missing"})`);
        } else {
          try {
            await sendEmailOrThrow(newResend(apiKey), {
              from: "Suivi Baby <noreply@suivibaby.com>",
              to: email,
              subject: "Votre compte Suivi Baby a ete supprime",
              html: `
                <div style="font-family: -apple-system, sans-serif; max-width: 500px; margin: 0 auto; padding: 20px;">
                  <h2 style="color: #1a1a1a;">Suppression confirmee</h2>
                  <p>Votre compte Suivi Baby et toutes les donnees associees ont ete definitivement supprimes, conformement a votre demande.</p>
                  <p>Les saisies faites dans le carnet d'un enfant partage avec d'autres parents restent visibles pour eux, sans votre nom.</p>
                  <p>Si vous n'etes pas a l'origine de cette suppression, contactez-nous immediatement a <a href="mailto:privacy@suivibaby.com">privacy@suivibaby.com</a>.</p>
                  <p style="color: #666; font-size: 12px; margin-top: 30px;">Cet email a ete envoye automatiquement par Suivi Baby. Conformite RGPD art. 17.</p>
                </div>
              `,
            });
          } catch (emailErr) {
            console.error(`processScheduledDeletions: confirmation e-mail failed for uid=${uid}`, emailErr?.message ?? emailErr);
          }
        }

        console.log(`processScheduledDeletions: deleted uid=${uid}`);
      } catch (e) {
        // users/{uid} (and its pendingDeletion) still exists: the next run
        // retries. No confirmation e-mail has been sent.
        const failureCount = (Number(pending.failureCount) || 0) + 1;
        // Stable labels for the log-based alert (docs/FIREBASE_MONITORING.md §9).
        console.error(
          `processScheduledDeletions: error processing uid=${uid} failures=${failureCount}${failureCount >= 3 ? " STUCK" : ""}`,
          e?.stack ?? e?.message ?? e
        );
        await userDoc.ref
          .update({
            "pendingDeletion.lastFailureAt": now,
            "pendingDeletion.lastFailure": String(e?.message ?? e).slice(0, 300),
            "pendingDeletion.failureCount": failureCount,
          })
          .catch((writeErr) => {
            console.error(`processScheduledDeletions: could not record the failure for uid=${uid}`, writeErr);
          });
      }
    }
  }
);

module.exports = {
  cancelAccountDeletion,
  deleteUserAccount,
  processScheduledDeletions,
  requestAccountDeletion,
  sendDeletionRequestEmail,
};
