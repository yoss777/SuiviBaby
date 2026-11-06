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

/**
 * Élément déjà absent côté serveur (`not-found`). Pour une SUPPRESSION c'est un
 * succès : l'objectif (l'élément n'existe plus) est atteint, par exemple parce
 * qu'un envoi précédent est bien passé mais que sa réponse a été perdue.
 */
export function isNotFoundError(error: unknown): boolean {
  return errorCode(error).endsWith("not-found");
}

function errorMessage(error: unknown): string {
  const message = (error as { message?: unknown } | null)?.message;
  return typeof message === "string" ? message : String(error);
}

/**
 * Erreur d'infrastructure : réseau coupé, serveur indisponible ou en panne.
 * L'écriture est valide et peut être rejouée telle quelle. Source unique : la
 * file hors ligne (isTransientError) et les écritures optimistes s'y réfèrent.
 */
export function isNetworkError(error: unknown): boolean {
  if (isConflictError(error)) return false;
  const msg = `${errorCode(error)} ${errorMessage(error)}`.toLowerCase();
  return (
    msg.includes("network") ||
    msg.includes("timeout") ||
    msg.includes("fetch") ||
    msg.includes("failed to connect") ||
    msg.includes("internet") ||
    msg.includes("offline") ||
    msg.includes("unavailable") ||
    // Erreur interne du serveur (`internal`) : le même envoi peut passer plus
    // tard ; la file plafonne les essais (MAX_TRANSIENT_FAILURES).
    msg.includes("internal") ||
    // Saturation / indisponibilité serveur : l'écriture est valide et doit
    // repartir en queue offline plutôt que d'être perdue via failOptimistic.
    msg.includes("no available instance") ||
    msg.includes("resource-exhausted") ||
    msg.includes("deadline-exceeded") ||
    msg.includes("billing")
  );
}
