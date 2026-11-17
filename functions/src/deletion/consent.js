const admin = require("firebase-admin");
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { monitorAppCheck, withAppCheck } = require("../shared/appCheck");
const { checkRateLimit } = require("../shared/rateLimit");
const { versionAtLeast } = require("../shared/consent");

/** Version of the privacy policy the health data consent refers to (public/privacy.html). */
const HEALTH_CONSENT_VERSION = "2.3";
/**
 * Versions accepted from the app. 2.2: apps ≤ 1.0.21 still ask for it (the
 * widget is not described there: the widget server push requires
 * app_config/widgetPush.minConsentVersion, see shared/consent.js).
 */
const ACCEPTED_CONSENT_VERSIONS = new Set(["2.2", HEALTH_CONSENT_VERSION]);
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

    if (!ACCEPTED_CONSENT_VERSIONS.has(data.version)) {
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
      version: data.version,
      granted: true,
      grantedAt: admin.firestore.FieldValue.serverTimestamp(),
    };
    if (typeof platform === "string") record.platform = platform;
    await db.collection("consent_records").add(record);

    // Consent already granted for a more recent version (e.g. 2.3 from a
    // newer app, then an old app on another device asks for 2.2): the proof
    // above records what was accepted, but the preference keeps the most
    // recent version — never downgraded (widget wiped, newer app asking again).
    const prefsRef = db.doc(`user_preferences/${uid}`);
    const current = (await prefsRef.get()).data()?.healthDataConsent;
    if (current?.granted === true && current.version !== data.version && versionAtLeast(current.version, data.version)) {
      return { version: data.version };
    }

    // mergeFields replaces the whole healthDataConsent map (no deep merge):
    // a previous withdrawnAt or an older field must not survive a new grant.
    await prefsRef.set(
      {
        healthDataConsent: {
          granted: true,
          grantedAt: new Date().toISOString(),
          version: data.version,
        },
      },
      { mergeFields: ["healthDataConsent"] }
    );

    return { version: data.version };
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
