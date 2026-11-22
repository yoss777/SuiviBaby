/**
 * App Check : surveillance et enforcement.
 *
 * Le client prépare les tokens via Firebase JS SDK + CustomProvider, alimenté
 * par RNFirebase App Check en natif et reCAPTCHA sur le web.
 *
 * Enforcement, lu au chargement du module (donc au déploiement, fonctions v2) :
 * - rien de posé (défaut) : surveillance seule, aucun appel n'est bloqué ;
 * - APPCHECK_ENFORCE_FUNCTIONS=a,b : seules les fonctions nommées (nom d'export
 *   exact, séparées par des virgules) imposent App Check, hors exceptions ;
 * - APPCHECK_ENFORCE=true : toutes les fonctions appelables, sauf les exceptions
 *   ci-dessous, qui ne sont jamais imposées, même nommées dans la liste.
 *
 * Attention : la CI redéploie toutes les fonctions, donc la variable doit être
 * présente dans functions/.env.<projet> à chaque déploiement.
 */
const ENFORCE_ALL = String(process.env.APPCHECK_ENFORCE || "").trim().toLowerCase() === "true";

const ENFORCED_FUNCTIONS = new Set(
  String(process.env.APPCHECK_ENFORCE_FUNCTIONS || "")
    .split(",")
    .map((n) => n.trim())
    .filter(Boolean),
);

// Exceptions décidées le 2026-11-22 (ADR 0002). Liste dans le code, et non dans
// l'environnement : en retirer ou en ajouter une passe par une revue.
// Garder synchronisée avec la liste `exempt` de scripts/auditAppCheck.sh.
const APP_CHECK_EXEMPT_FUNCTIONS = new Set([
  // Sans preuve, un téléphone déconnecté garderait les rappels de l'ancien compte.
  // Protégée par le jeton Expo du téléphone et des limites de débit.
  "revokeDeviceToken",
  // Actions d'administration, sans écran dans l'app : un outil hors de l'app ne
  // peut pas fournir de preuve. Compte administrateur vérifié et débit limité.
  "resolveReport",
  "setAdminClaim",
]);

for (const name of ENFORCED_FUNCTIONS) {
  if (APP_CHECK_EXEMPT_FUNCTIONS.has(name)) {
    console.warn(`[AppCheck] ${name} est une exception : APPCHECK_ENFORCE_FUNCTIONS l'ignore.`);
  }
}

function isEnforced(functionName) {
  if (APP_CHECK_EXEMPT_FUNCTIONS.has(functionName)) return false;
  return ENFORCE_ALL || ENFORCED_FUNCTIONS.has(functionName);
}

function monitorAppCheck(request, functionName) {
  if (request.app) {
    console.log(`[AppCheck] ${functionName}: VERIFIED (uid: ${request.auth?.uid})`);
  } else {
    // Sans enforcement, garde la trace des appels sans preuve (voir ADR 0002).
    console.warn(`[AppCheck] ${functionName}: UNVERIFIED (uid: ${request.auth?.uid}) — enforcement=${isEnforced(functionName)}`);
  }
}

/**
 * Options onCall de la fonction `functionName` (nom d'export déployé).
 * Ajoute `enforceAppCheck: true` si la fonction est concernée.
 */
function withAppCheck(options, functionName) {
  if (!isEnforced(functionName)) {
    return options;
  }

  return {
    ...options,
    enforceAppCheck: true,
  };
}

module.exports = {
  APP_CHECK_EXEMPT_FUNCTIONS,
  monitorAppCheck,
  withAppCheck,
};
