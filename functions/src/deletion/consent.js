const admin = require("firebase-admin");
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { monitorAppCheck, withAppCheck } = require("../shared/appCheck");
const { checkRateLimit } = require("../shared/rateLimit");

/** Version of the privacy policy the health data consent refers to (public/privacy.html). */
const HEALTH_CONSENT_VERSION = "2.2";
/** Proof of consent is kept this long after the account is deleted. */
const CONSENT_RETENTION_YEARS = 5;

// ============================================
// HEALTH DATA CONSENT PROOF (RGPD art. 7.1)
// ============================================

/**
 * recordHealthConsent — Server-side proof of the explicit consent to health
 * data processing. Input: { version, platform? }. Output: { version }.
 * Appends to consent_records (server-only, kept 5 years after account
 * deletion) and sets user_preferences/{uid}.healthDataConsent, which the app
 * reads to gate access (clients cannot write that field, see firestore.rules).
 */
const recordHealthConsent = onCall(
  withAppCheck({ region: "europe-west1" }, "recordHealthConsent"),
  async (request) => {
    monitorAppCheck(request, "recordHealthConsent");
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Authentification requise.");
    }
    const uid = request.auth.uid;
    const data = request.data || {};

    if (data.version !== HEALTH_CONSENT_VERSION) {
      throw new HttpsError("invalid-argument", "Version de la politique de confidentialité invalide.");
    }
    const { platform } = data;
    if (platform !== undefined && platform !== null &&
      (typeof platform !== "string" || !/^[A-Za-z0-9._-]{1,20}$/.test(platform))) {
      throw new HttpsError("invalid-argument", "Plateforme invalide.");
    }

    const db = admin.firestore();
    await checkRateLimit(db, uid, "consent", 10);

    const record = {
      uid,
      type: "health_data",
      version: HEALTH_CONSENT_VERSION,
      granted: true,
      grantedAt: admin.firestore.FieldValue.serverTimestamp(),
    };
    if (typeof platform === "string") record.platform = platform;
    await db.collection("consent_records").add(record);

    // mergeFields replaces the whole healthDataConsent map (no deep merge):
    // a previous withdrawnAt or an older field must not survive a new grant.
    await db.doc(`user_preferences/${uid}`).set(
      {
        healthDataConsent: {
          granted: true,
          grantedAt: new Date().toISOString(),
          version: HEALTH_CONSENT_VERSION,
        },
      },
      { mergeFields: ["healthDataConsent"] }
    );

    return { version: HEALTH_CONSENT_VERSION };
  }
);

/**
 * withdrawHealthConsent — Withdraws the consent to health data processing
 * (GDPR art. 7.3). Input: {}. Output: { success: true }.
 * Appends the withdrawal to consent_records (proof, never edited) and replaces
 * user_preferences/{uid}.healthDataConsent with { granted: false, withdrawnAt,
 * version }. Scheduled jobs (reminders, recaps) stop processing the user.
 */
const withdrawHealthConsent = onCall(
  withAppCheck({ region: "europe-west1" }, "withdrawHealthConsent"),
  async (request) => {
    monitorAppCheck(request, "withdrawHealthConsent");
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Authentification requise.");
    }
    const uid = request.auth.uid;
    const db = admin.firestore();
    await checkRateLimit(db, uid, "consent", 10);

    await db.collection("consent_records").add({
      uid,
      type: "health_data",
      granted: false,
      withdrawnAt: admin.firestore.FieldValue.serverTimestamp(),
      version: HEALTH_CONSENT_VERSION,
    });
    await db.doc(`user_preferences/${uid}`).set(
      {
        healthDataConsent: {
          granted: false,
          withdrawnAt: new Date().toISOString(),
          version: HEALTH_CONSENT_VERSION,
        },
      },
      { mergeFields: ["healthDataConsent"] }
    );
    return { success: true };
  }
);

module.exports = {
  CONSENT_RETENTION_YEARS,
  recordHealthConsent,
  withdrawHealthConsent,
};
