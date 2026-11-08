// Validation of password reset deep links. The oobCode comes from a URL that
// any other app can open, so it is checked before it reaches Firebase or the
// router. Same pattern as public/assets/js/reset-password.js.

/** Firebase action codes are opaque URL-safe tokens. */
const OOB_CODE_RE = /^[A-Za-z0-9_-]{10,512}$/;

export function isValidOobCode(code: unknown): code is string {
  return typeof code === "string" && OOB_CODE_RE.test(code);
}

/**
 * Returns the validated oobCode of a reset link, or null when the URL is not
 * a password reset link or the code is malformed. Accepts the Firebase action
 * URL (mode=resetPassword) and suivibaby://reset-password?oobCode=...
 * Other modes (verifyEmail, recoverEmail...) are ignored.
 */
export function parseResetPasswordUrl(url: string | null | undefined): string | null {
  if (typeof url !== "string" || url.length > 2048) return null;
  const oobCodeMatch = url.match(/[?&]oobCode=([^&#]*)/);
  if (!oobCodeMatch) return null;
  const modeMatch = url.match(/[?&]mode=([^&#]*)/);
  if (modeMatch && modeMatch[1] !== "resetPassword") return null;
  let code: string;
  try {
    code = decodeURIComponent(oobCodeMatch[1]);
  } catch {
    return null;
  }
  return isValidOobCode(code) ? code : null;
}

export type EmailAction = { mode: "resetPassword" | "verifyEmail"; oobCode: string };

/**
 * Firebase e-mail action links all point to the same page (/reset-password,
 * set in the Firebase console), whatever their mode. Returns the validated
 * action for the two modes the app handles, null otherwise.
 * A link without mode (suivibaby://reset-password?oobCode=...) is a reset.
 */
export function parseEmailActionUrl(url: string | null | undefined): EmailAction | null {
  if (typeof url !== "string" || url.length > 2048) return null;
  const modeMatch = url.match(/[?&]mode=([^&#]*)/);
  const mode = modeMatch ? modeMatch[1] : "resetPassword";
  if (mode !== "resetPassword" && mode !== "verifyEmail") return null;
  const oobCodeMatch = url.match(/[?&]oobCode=([^&#]*)/);
  if (!oobCodeMatch) return null;
  let code: string;
  try {
    code = decodeURIComponent(oobCodeMatch[1]);
  } catch {
    return null;
  }
  return isValidOobCode(code) ? { mode, oobCode: code } : null;
}
