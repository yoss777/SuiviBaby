/**
 * Message d'erreur de consentement à l'inscription (écran de connexion).
 * Retourne null quand les deux cases sont cochées.
 */
export function getConsentErrorMessage(
  hasConsented: boolean,
  hasHealthConsent: boolean,
): string | null {
  if (hasConsented && hasHealthConsent) return null;
  if (!hasConsented && !hasHealthConsent) {
    return "Cochez l'acceptation des conditions et le consentement aux données de santé pour créer votre compte.";
  }
  if (!hasConsented) {
    return "Cochez l'acceptation des conditions et de la politique de confidentialité pour créer votre compte.";
  }
  return "Cochez le consentement au traitement des données de santé pour créer votre compte.";
}

/**
 * Message à afficher après un changement de case : tant qu'aucune erreur n'a
 * été montrée (prev === null), on n'en affiche pas ; sinon le message est
 * recalculé à chaque bascule pour toujours décrire ce qui manque vraiment
 * (et disparaît quand les deux cases sont cochées).
 */
export function nextConsentErrorMessage(
  prev: string | null,
  hasConsented: boolean,
  hasHealthConsent: boolean,
): string | null {
  if (prev === null) return null;
  return getConsentErrorMessage(hasConsented, hasHealthConsent);
}
