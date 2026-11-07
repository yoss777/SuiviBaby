const admin = require("firebase-admin");
const appleAuth = require("../../lib/appleAuth");
const { APPLE_KEY_ID, APPLE_PRIVATE_KEY, APPLE_TEAM_ID, secretValue } = require("./secrets");

// Sign in with Apple côté serveur : clés et révocation du refresh token.
// Hors du callable registerAppleRevocation (deletion/apple.js) pour que la purge
// (deletion/purgeUser.js) ne dépende pas d'un module de déclencheur.

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

module.exports = {
  MAX_APPLE_REVOKE_FAILURES,
  getAppleCredentials,
  revokeAppleToken,
};
