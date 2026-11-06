// utils/networkError.ts
// Classement des erreurs d'appel serveur : réseau / serveur indisponible
// (l'écriture est valide, on peut la rejouer) ou conflit de version.

function errorCode(error: unknown): string {
  return String((error as { code?: unknown } | null)?.code ?? "").toLowerCase();
}

/** Conflit de version (T2.2) : rejouer la même écriture ne peut jamais réussir. */
export function isConflictError(error: unknown): boolean {
  return errorCode(error).endsWith("aborted");
}

export function isNetworkError(error: unknown): boolean {
  if (isConflictError(error)) return false;
  const msg =
    `${errorCode(error)} ${error instanceof Error ? error.message : String(error)}`.toLowerCase();
  return (
    msg.includes("network") ||
    msg.includes("timeout") ||
    msg.includes("fetch") ||
    msg.includes("failed to connect") ||
    msg.includes("internet") ||
    msg.includes("offline") ||
    msg.includes("unavailable") ||
    // Saturation / indisponibilité serveur : l'écriture est valide et doit
    // repartir en queue offline plutôt que d'être perdue via failOptimistic.
    msg.includes("no available instance") ||
    msg.includes("resource-exhausted") ||
    msg.includes("deadline-exceeded") ||
    msg.includes("billing")
  );
}
