// Déclare facultatives deux fonctionnalités matérielles que Google Play
// déduit seul et marque obligatoires :
// - android.hardware.screen.portrait (déduite de orientation « portrait ») ;
// - android.hardware.wifi (déduite de la permission ACCESS_WIFI_STATE).
// Sans cela, la vérification rapide de Play signale à chaque version que
// l'app exclut certains appareils (Chromebooks, Android XR, tablettes fixées
// en paysage) ; ignorée pour la 1.0.22 avec « résolution déjà prévue ».
const { withAndroidManifest } = require("@expo/config-plugins");

const OPTIONAL_FEATURES = ["android.hardware.screen.portrait", "android.hardware.wifi"];

/** Ajoute ou corrige <uses-feature android:required="false"> (idempotent). */
function setOptionalFeatures(manifest) {
  const root = manifest.manifest;
  root["uses-feature"] = root["uses-feature"] ?? [];
  for (const name of OPTIONAL_FEATURES) {
    const existing = root["uses-feature"].find((f) => f.$?.["android:name"] === name);
    if (existing) existing.$["android:required"] = "false";
    else root["uses-feature"].push({ $: { "android:name": name, "android:required": "false" } });
  }
  return manifest;
}

const withOptionalHardwareFeatures = (config) =>
  withAndroidManifest(config, (cfg) => {
    cfg.modResults = setOptionalFeatures(cfg.modResults);
    return cfg;
  });

module.exports = withOptionalHardwareFeatures;
module.exports.setOptionalFeatures = setOptionalFeatures;
module.exports.OPTIONAL_FEATURES = OPTIONAL_FEATURES;
