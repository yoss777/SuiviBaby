/**
 * Health data consent gate for scheduled processing (rappels, récap) : any
 * version counts as long as `granted` is true (consents given by app 1.0.x stay
 * valid). Hors de deletion/consent.js (callables) pour que les notifications ne
 * dépendent pas d'un module de déclencheur.
 */
function hasValidHealthConsent(prefs) {
  return prefs?.healthDataConsent?.granted === true;
}

module.exports = {
  hasValidHealthConsent,
};
