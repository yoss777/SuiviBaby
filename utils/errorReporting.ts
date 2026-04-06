import * as Sentry from "@sentry/react-native";

/**
 * Capture une erreur dans Sentry avec contexte optionnel.
 * Remplace les console.error/warn silencieux dans les services.
 */
export function captureServiceError(
  error: unknown,
  context: { service: string; operation: string; extra?: Record<string, unknown> },
): void {
  const err = error instanceof Error ? error : new Error(String(error));

  Sentry.withScope((scope) => {
    scope.setTag("service", context.service);
    scope.setTag("operation", context.operation);
    if (context.extra) {
      scope.setExtras(context.extra);
    }
    Sentry.captureException(err);
  });
}
