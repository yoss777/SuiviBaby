// Sign in with Apple server calls (token exchange and revocation). Apple
// requires an account's tokens to be revoked when the account is deleted.
// Uses Node crypto only (ES256 JWT), no dependency.
const { Buffer } = require("node:buffer");
const crypto = require("node:crypto");

const APPLE_AUDIENCE = "https://appleid.apple.com";
const APPLE_TOKEN_URL = `${APPLE_AUDIENCE}/auth/token`;
const APPLE_REVOKE_URL = `${APPLE_AUDIENCE}/auth/revoke`;
/** Apple "client_id" for a native app is its bundle identifier (app.json). */
const APPLE_CLIENT_ID = "com.tesfa.suivibaby";
const FETCH_TIMEOUT_MS = 10000;

const b64url = (input) => Buffer.from(input).toString("base64url");

/**
 * ES256 client secret (JWT) signed with the Apple key.
 * @param {{teamId: string, keyId: string, privateKey: string}} creds
 */
function buildAppleClientSecret({ teamId, keyId, privateKey }, nowSeconds = Math.floor(Date.now() / 1000)) {
  const header = b64url(JSON.stringify({ alg: "ES256", kid: keyId, typ: "JWT" }));
  const payload = b64url(JSON.stringify({
    iss: teamId,
    iat: nowSeconds,
    exp: nowSeconds + 300, // single use: Apple accepts up to 6 months
    aud: APPLE_AUDIENCE,
    sub: APPLE_CLIENT_ID,
  }));
  // Secrets set from a shell often carry escaped newlines.
  const key = privateKey.includes("\\n") ? privateKey.replace(/\\n/g, "\n") : privateKey;
  const signature = crypto.sign("sha256", Buffer.from(`${header}.${payload}`), {
    key,
    dsaEncoding: "ieee-p1363", // JWS wants r||s, not DER
  });
  return `${header}.${payload}.${b64url(signature)}`;
}

async function postForm(url, params) {
  return fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(params).toString(),
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
}

/** Exchanges an authorization code. Returns the refresh token, or throws. */
async function exchangeAuthorizationCode(creds, authorizationCode) {
  const response = await postForm(APPLE_TOKEN_URL, {
    grant_type: "authorization_code",
    code: authorizationCode,
    client_id: APPLE_CLIENT_ID,
    client_secret: buildAppleClientSecret(creds),
  });
  if (!response.ok) {
    throw new Error(`Apple token exchange refused: HTTP ${response.status} ${(await response.text()).slice(0, 200)}`);
  }
  const body = await response.json();
  if (!body?.refresh_token || typeof body.refresh_token !== "string") {
    throw new Error("Apple token exchange returned no refresh_token");
  }
  return body.refresh_token;
}

/** Revokes a refresh token. Throws when Apple refuses. */
async function revokeRefreshToken(creds, refreshToken) {
  const response = await postForm(APPLE_REVOKE_URL, {
    token: refreshToken,
    token_type_hint: "refresh_token",
    client_id: APPLE_CLIENT_ID,
    client_secret: buildAppleClientSecret(creds),
  });
  if (!response.ok) {
    throw new Error(`Apple revoke refused: HTTP ${response.status} ${(await response.text()).slice(0, 200)}`);
  }
}

module.exports = { APPLE_CLIENT_ID, buildAppleClientSecret, exchangeAuthorizationCode, revokeRefreshToken };
