const { defineSecret } = require("firebase-functions/params");

// Sign in with Apple key (Apple Developer > Keys). Bound only to the functions
// that call Apple: registerAppleRevocation and every caller of purgeUserData.
const APPLE_TEAM_ID = defineSecret("APPLE_TEAM_ID");
const APPLE_KEY_ID = defineSecret("APPLE_KEY_ID");
const APPLE_PRIVATE_KEY = defineSecret("APPLE_PRIVATE_KEY");
const APPLE_SECRETS = [APPLE_TEAM_ID, APPLE_KEY_ID, APPLE_PRIVATE_KEY];
// HMAC key of the weekly recap unsubscribe links.
const RECAP_UNSUBSCRIBE_SECRET = defineSecret("RECAP_UNSUBSCRIBE_SECRET");

/** Reads a secret from the environment without the SDK warning when it is unset. */
function secretValue(secret) {
  return process.env[secret.name] || "";
}

module.exports = {
  APPLE_KEY_ID,
  APPLE_PRIVATE_KEY,
  APPLE_SECRETS,
  APPLE_TEAM_ID,
  RECAP_UNSUBSCRIBE_SECRET,
  secretValue,
};
