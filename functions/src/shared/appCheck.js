
const APP_CHECK_ENFORCED = process.env.APPCHECK_ENFORCE === "true";

/**
 * App Check monitoring.
 *
 * L'enforcement est piloté par APPCHECK_ENFORCE=true au déploiement.
 * Le client prépare maintenant les tokens via Firebase JS SDK + CustomProvider,
 * alimenté par RNFirebase App Check en natif et reCAPTCHA sur le web.
 *
 * Tant que les fichiers natifs Firebase / clés App Check ne sont pas fournis
 * puis redéployés côté app, laisser APPCHECK_ENFORCE=false évite de bloquer
 * les appels légitimes.
 */
function monitorAppCheck(request, functionName) {
  if (request.app) {
    console.log(`[AppCheck] ${functionName}: VERIFIED (uid: ${request.auth?.uid})`);
  } else {
    // En mode non-enforce, logger en warn pour pouvoir tracker le ratio
    // avant d'activer l'enforcement. Vérifier dans Cloud Functions logs
    // que 100% des requêtes sont VERIFIED avant de passer APPCHECK_ENFORCE=true.
    console.warn(`[AppCheck] ${functionName}: UNVERIFIED (uid: ${request.auth?.uid}) — enforcement=${APP_CHECK_ENFORCED}`);
  }
}

function withAppCheck(options) {
  if (!APP_CHECK_ENFORCED) {
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
