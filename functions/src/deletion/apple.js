const admin = require("firebase-admin");
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const appleAuth = require("../../lib/appleAuth");
const { monitorAppCheck, withAppCheck } = require("../shared/appCheck");
const { checkRateLimit } = require("../shared/rateLimit");
const { APPLE_KEY_ID, APPLE_PRIVATE_KEY, APPLE_SECRETS, APPLE_TEAM_ID, secretValue } = require("../shared/secrets");

/** Apple key material, or null when the secrets are not configured. */
function getAppleCredentials() {
  const teamId = secretValue(APPLE_TEAM_ID);
  const keyId = secretValue(APPLE_KEY_ID);
  const privateKey = secretValue(APPLE_PRIVATE_KEY);
  // A placeholder value (secret created before the Apple key exists) counts as unset.
  const looksLikeKey = privateKey.includes("PRIVATE KEY");
  return teamId && keyId && looksLikeKey ? { teamId, keyId, privateKey } : null;
}

/** After this many failed revocations the purge goes on (STUCK_APPLE_REVOKE alert). */
const MAX_APPLE_REVOKE_FAILURES = 5;

/**
 * Revokes the user's Sign in with Apple refresh token (apple_tokens/{uid}).
 * No token: nothing to do. Success: returns, the caller deletes the doc with
 * the other by-id documents. Failure: the doc is kept with an incremented
 * `revokeFailures` and the function throws, so the cron retries the whole
 * purge. At MAX_APPLE_REVOKE_FAILURES it logs STUCK_APPLE_REVOKE and returns
 * (the purge goes on and the token doc is deleted).
 */
async function revokeAppleToken(db, uid) {
  const ref = db.doc(`apple_tokens/${uid}`);
  const snap = await ref.get();
  const data = snap.exists ? snap.data() : null;
  const refreshToken = data?.refreshToken;
  if (!refreshToken) return;

  let failure = null;
  try {
    const creds = getAppleCredentials();
    if (!creds) throw new Error("Apple secrets missing");
    await appleAuth.revokeRefreshToken(creds, refreshToken);
  } catch (e) {
    failure = e;
  }
  if (!failure) return;

  const failures = (Number(data.revokeFailures) || 0) + 1;
  const reason = String(failure?.message ?? failure).slice(0, 300);
  if (failures >= MAX_APPLE_REVOKE_FAILURES) {
    console.error(
      `purgeUserData: STUCK_APPLE_REVOKE uid=${uid} failures=${failures}, token NOT revoked at Apple, purge goes on`,
      reason
    );
    return;
  }
  await ref.update({
    revokeFailures: admin.firestore.FieldValue.increment(1),
    lastRevokeError: reason,
    lastRevokeAttemptAt: admin.firestore.FieldValue.serverTimestamp(),
  });
  throw new Error(`Apple revocation failed (${failures}/${MAX_APPLE_REVOKE_FAILURES}): ${reason}`);
}

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
  withAppCheck({ region: "europe-west1", secrets: APPLE_SECRETS }),
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
  revokeAppleToken,
};
