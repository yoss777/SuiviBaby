const admin = require("firebase-admin");
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const appleAuth = require("../../lib/appleAuth");
const { monitorAppCheck, withAppCheck } = require("../shared/appCheck");
const { checkRateLimit } = require("../shared/rateLimit");
const { getAppleCredentials } = require("../shared/apple");
const { APPLE_SECRETS } = require("../shared/secrets");

// ============================================
// SIGN IN WITH APPLE — token revocation on account deletion
// ============================================

/**
 * registerAppleRevocation — Exchanges the Sign in with Apple authorization
 * code for a refresh token and keeps it (server-only apple_tokens/{uid}) so
 * purgeUserData can revoke it at Apple. Input: { authorizationCode }.
 * Output: { stored: boolean }. Never blocks the user: missing secrets or an
 * Apple refusal give { stored: false } and are logged, not thrown.
 */
const registerAppleRevocation = onCall(
  withAppCheck({ region: "europe-west1", secrets: APPLE_SECRETS }, "registerAppleRevocation"),
  async (request) => {
    monitorAppCheck(request, "registerAppleRevocation");
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Authentification requise.");
    }
    const uid = request.auth.uid;
    const code = request.data?.authorizationCode;
    if (typeof code !== "string" || code.length === 0 || code.length > 1000) {
      throw new HttpsError("invalid-argument", "Code d'autorisation Apple invalide.");
    }

    const db = admin.firestore();
    await checkRateLimit(db, uid, "apple", 5);

    const userRecord = await admin.auth().getUser(uid);
    if (!userRecord.providerData?.some((p) => p.providerId === "apple.com")) {
      throw new HttpsError("failed-precondition", "Ce compte n'utilise pas Sign in with Apple.");
    }

    const creds = getAppleCredentials();
    if (!creds) {
      console.warn("registerAppleRevocation: Apple secrets not configured, token not stored");
      return { stored: false };
    }

    try {
      const refreshToken = await appleAuth.exchangeAuthorizationCode(creds, code);
      await db.doc(`apple_tokens/${uid}`).set({
        refreshToken,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      return { stored: true };
    } catch (e) {
      console.error(`registerAppleRevocation: failed for uid=${uid}`, e?.message ?? e);
      return { stored: false };
    }
  }
);

module.exports = {
  registerAppleRevocation,
};
