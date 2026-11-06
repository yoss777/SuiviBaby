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
