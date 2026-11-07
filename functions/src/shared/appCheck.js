/**
 * App Check : surveillance et enforcement.
 *
 * Le client prépare les tokens via Firebase JS SDK + CustomProvider, alimenté
 * par RNFirebase App Check en natif et reCAPTCHA sur le web.
 *
 * Enforcement, lu au chargement du module (donc au déploiement, fonctions v2) :
 * - rien de posé (défaut) : surveillance seule, aucun appel n'est bloqué ;
 * - APPCHECK_ENFORCE_FUNCTIONS=a,b : seules les fonctions nommées (nom d'export
 *   exact, séparées par des virgules) imposent App Check. C'est la bascule
 *   partielle de l'ADR 0002 ;
 * - APPCHECK_ENFORCE=true : toutes les fonctions appelables.
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

function isEnforced(functionName) {
  return ENFORCE_ALL || ENFORCED_FUNCTIONS.has(functionName);
}

function monitorAppCheck(request, functionName) {
  if (request.app) {
    console.log(`[AppCheck] ${functionName}: VERIFIED (uid: ${request.auth?.uid})`);
  } else {
    // En mode non-enforce, logger en warn pour pouvoir tracker le ratio
    // avant d'activer l'enforcement. Vérifier dans Cloud Functions logs
    // que 100% des requêtes sont VERIFIED avant d'enforcer la fonction.
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
  monitorAppCheck,
  withAppCheck,
};
