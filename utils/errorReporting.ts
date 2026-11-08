import * as Sentry from "@sentry/react-native";

import { isConnectivityError } from "@/utils/networkError";

/**
 * Capture une erreur dans Sentry avec contexte optionnel.
 * Remplace les console.error/warn silencieux dans les services.
 */
export function captureServiceError(
  error: unknown,
  context: { service: string; operation: string; extra?: Record<string, unknown> },
): void {
  // Perte de connexion : attendue sur mobile, gardée comme fil d'Ariane seulement.
  if (isConnectivityError(error)) {
    Sentry.addBreadcrumb({
      category: context.service,
      message: `${context.operation}: connexion indisponible`,
      level: "warning",
    });
    return;
  }
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

export type BreadcrumbLevel = "info" | "warning" | "error";

/**
 * Thin wrapper around Sentry.addBreadcrumb so callers (services, stores) stay
 * decoupled from the Sentry SDK and can be mocked cleanly in tests. Data must
 * be derived (booleans, ids, counts, age_ms) — never user-facing payloads.
 */
export function addBreadcrumb(
  category: string,
  message: string,
  data: Record<string, unknown>,
  level: BreadcrumbLevel = "info",
): void {
  Sentry.addBreadcrumb({ category, message, data, level });
}
