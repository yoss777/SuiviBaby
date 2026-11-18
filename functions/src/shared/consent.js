/**
 * Health data consent gate for scheduled processing (rappels, récap) : any
 * version counts as long as `granted` is true (consents given by app 1.0.x stay
 * valid). Hors de deletion/consent.js (callables) pour que les notifications ne
 * dépendent pas d'un module de déclencheur.
 */
function hasValidHealthConsent(prefs) {
  return prefs?.healthDataConsent?.granted === true;
}

/**
 * Widget (envoi des données de santé hors de l'app, via Expo/FCM/APNs) :
 * consentement donné ET d'une version au moins égale à celle dont la
 * politique décrit le widget (2.3). Version exigée réglable sans déploiement
 * (`app_config/widgetPush.minConsentVersion`) : on la passe à « 2.3 » une fois
 * l'app qui recueille ce consentement publiée, sinon le temps réel s'arrêtait
 * pour tous ceux qui n'ont pas encore mis à jour. Les rappels, eux, gardent
 * toute version (ci-dessus).
 */
const WIDGET_MIN_CONSENT_VERSION = "2.2";
/** Première politique qui décrit le widget : repli si le réglage est mal saisi. */
const WIDGET_POLICY_VERSION = "2.3";
const VERSION_RE = /^\d{1,3}(\.\d{1,3}){0,2}$/;

/**
 * Version exigée pour le widget. Réglage absent : valeur par défaut. Réglage
 * présent mais mal saisi (nombre 2.3, espaces…) : jamais un repli plus
 * permissif. Un nombre ou des espaces sont compris ; le reste retombe sur la
 * version de la politique du widget (2.3), avec un avertissement.
 */
function widgetMinConsentVersion(config) {
  const raw = config?.minConsentVersion;
  if (raw === undefined || raw === null) return WIDGET_MIN_CONSENT_VERSION;
  const v = typeof raw === "number" && Number.isFinite(raw) ? String(raw) : typeof raw === "string" ? raw.trim() : "";
  if (VERSION_RE.test(v)) return versionAtLeast(v, WIDGET_MIN_CONSENT_VERSION) ? v : WIDGET_MIN_CONSENT_VERSION;
  console.warn("widget: invalid minConsentVersion, using policy version", { type: typeof raw });
  return WIDGET_POLICY_VERSION;
}

function versionAtLeast(version, min) {
  if (typeof version !== "string") return false;
  const a = version.split(".").map(Number);
  const b = min.split(".").map(Number);
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const x = Number.isFinite(a[i]) ? a[i] : 0;
    const y = Number.isFinite(b[i]) ? b[i] : 0;
    if (x !== y) return x > y;
  }
  return true;
}

function hasWidgetHealthConsent(prefs, min = WIDGET_MIN_CONSENT_VERSION) {
  return hasValidHealthConsent(prefs) && versionAtLeast(prefs.healthDataConsent.version, min);
}

module.exports = {
  hasValidHealthConsent,
  hasWidgetHealthConsent,
  versionAtLeast,
  widgetMinConsentVersion,
  WIDGET_MIN_CONSENT_VERSION,
};
