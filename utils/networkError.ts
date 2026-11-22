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

/**
 * Refus `unauthenticated`. Pour un compte connecté, il peut venir d'un jeton
 * App Check absent ou expiré : l'écriture reste valide et doit être rejouée.
 */
export function isUnauthenticatedError(error: unknown): boolean {
  return errorCode(error).endsWith("unauthenticated");
}

const PERMANENT_CODES = [
  "invalid-argument",
  "permission-denied",
  "not-found",
  "unauthenticated",
  "failed-precondition",
  "already-exists",
  "out-of-range",
  "aborted",
];

/**
 * Refus définitif du serveur : le même envoi échouera toujours. Ni nouvelle
 * tentative automatique, ni « Réessayer » (le bug de la durée > 24 h
 * relançait trois fois une écriture refusée, puis proposait de recommencer).
 */
export function isPermanentError(error: unknown): boolean {
  const code = errorCode(error);
  return PERMANENT_CODES.some((c) => code.endsWith(c));
}

/**
 * Raison lisible d'un refus, à ajouter au message d'échec. Les messages
 * `invalid-argument` du serveur sont déjà en français (validation.js).
 */
export function failureReason(error: unknown): string | undefined {
  const code = errorCode(error);
  if (code.endsWith("invalid-argument") || code.endsWith("failed-precondition") || code.endsWith("out-of-range")) {
    const msg = errorMessage(error).trim();
    if (!msg || msg.length > 160) return undefined;
    return /[.!?…]$/.test(msg) ? msg : `${msg}.`;
  }
  if (code.endsWith("permission-denied")) return "Vous n'avez pas le droit de modifier cet enfant.";
  if (code.endsWith("not-found")) return "Cet événement a été supprimé entre-temps.";
  if (code.endsWith("aborted")) return "Il a été modifié entre-temps sur un autre appareil.";
  if (code.endsWith("unauthenticated")) return "Votre session a expiré, reconnectez-vous.";
  return undefined;
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
  // Un refus définitif dont le texte contient « internal », « fetch »… n'est
  // pas une panne réseau : il ne doit pas partir en file pour être rejoué.
  if (isPermanentError(error)) return false;
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

/**
 * Pas de connexion au serveur Firestore/Firebase (code `unavailable`, client
 * hors ligne, lecture `source: "server"` impossible). Attendu sur mobile : le
 * signaler à Sentry ne dit rien de l'app (SUIVIBABY-A, 1.0.11+15). Plus étroit
 * que isNetworkError, qui couvre aussi les erreurs serveur à surveiller.
 */
export function isConnectivityError(error: unknown): boolean {
  if (errorCode(error).endsWith("unavailable")) return true;
  if (errorCode(error).endsWith("network-request-failed")) return true;
  return /client is offline|failed to get documents? from server/i.test(errorMessage(error));
}
