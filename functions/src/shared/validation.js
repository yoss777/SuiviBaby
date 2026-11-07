const { HttpsError } = require("firebase-functions/v2/https");

/**
 * Sharing someone's child (invitations, share codes) and administering the app
 * require an e-mail address the account really owns: an unverified password
 * account can claim any address (sprint 4.10).
 */
function assertVerifiedEmail(request) {
  if (request.auth?.token?.email_verified !== true) {
    throw new HttpsError(
      "failed-precondition",
      "Vérifiez votre adresse e-mail pour continuer.",
      { reason: "email-not-verified" },
    );
  }
}

/** Firestore document ids the app generates: no slash, no dot, bounded length. */
function isValidDocId(value) {
  return typeof value === "string" && /^[A-Za-z0-9_-]{1,128}$/.test(value);
}

module.exports = {
  assertVerifiedEmail,
  isValidDocId,
};
