// Server-side sharing/admin callables reject unverified e-mail addresses with
// `failed-precondition` and `details.reason === "email-not-verified"`. These
// helpers turn that into one stable client error and one UI prompt.
export const EMAIL_NOT_VERIFIED_CODE = "email-not-verified";
export const EMAIL_NOT_VERIFIED_MESSAGE = "Vérifiez votre adresse e-mail pour continuer.";
export const VERIFY_EMAIL_ROUTE = "/(auth)/verify-email";

type ErrorLike = { code?: unknown; details?: { reason?: unknown } | null } | null | undefined;

export function isEmailNotVerifiedError(error: unknown): boolean {
  const e = error as ErrorLike;
  if (!e || typeof e !== "object") return false;
  return e.details?.reason === EMAIL_NOT_VERIFIED_CODE || e.code === EMAIL_NOT_VERIFIED_CODE;
}

/** Stable error thrown by services so screens do not depend on Firebase shapes. */
export function createEmailNotVerifiedError(): Error & { code: string } {
  const error = new Error(EMAIL_NOT_VERIFIED_MESSAGE) as Error & { code: string };
  error.code = EMAIL_NOT_VERIFIED_CODE;
  return error;
}

type AlertFn = (
  title: string,
  message?: string,
  buttons?: { text?: string; onPress?: () => void; style?: "default" | "cancel" | "destructive" }[],
) => void;

/** Clear message with an action leading to the verify-email screen. */
export function showEmailNotVerifiedAlert(
  showAlert: AlertFn,
  router: { push: (href: any) => void },
): void {
  showAlert("E-mail non vérifié", EMAIL_NOT_VERIFIED_MESSAGE, [
    { text: "Plus tard", style: "cancel" },
    { text: "Vérifier mon e-mail", onPress: () => router.push(VERIFY_EMAIL_ROUTE) },
  ]);
}

/**
 * Reload the user then force-refresh the ID token so the `email_verified`
 * claim seen by the server is up to date. Returns the verified state.
 */
export async function refreshEmailVerification(user: {
  reload: () => Promise<void>;
  getIdToken: (forceRefresh?: boolean) => Promise<string>;
  emailVerified: boolean;
}): Promise<boolean> {
  await user.reload();
  await user.getIdToken(true);
  return user.emailVerified;
}
