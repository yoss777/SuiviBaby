// plugins/withFirebaseAppDelegate.js
// Initialise Firebase côté natif iOS (FirebaseApp.configure + fabrique App
// Check) dans AppDelegate.swift.
//
// Pourquoi : depuis le gabarit iOS 27 d'Expo SDK 58, React Native démarre dans
// SceneDelegate. Les plugins @react-native-firebase/app et /app-check cherchent
// `factory.startReactNative(` dans AppDelegate.swift, ne le trouvent plus et
// n'ajoutent rien (« Unable to determine correct Firebase insertion point »).
// Résultat en 1.0.16 iOS : « No Firebase App '[DEFAULT]' has been created »
// à l'initialisation d'App Check (Sentry SUIVIBABY-D).
//
// Ordre imposé par Firebase : la fabrique App Check avant configure()
// (RNFBAppCheckModule est exposé à Swift par le bridging header, ajouté par
// le plugin app-check). Idempotent : si les plugins officiels ont déjà inséré
// l'appel (futur gabarit reconnu), on ne touche à rien.
const { withAppDelegate, WarningAggregator } = require("expo/config-plugins");

const TAG = "// @generated SuiviBaby withFirebaseAppDelegate";
const ANCHOR = /^([ \t]*)let delegate = ReactNativeDelegate\(\)/m;

function addFirebaseConfigure(contents) {
  if (contents.includes("FirebaseApp.configure()")) return contents;
  if (!ANCHOR.test(contents)) {
    WarningAggregator.addWarningIOS(
      "withFirebaseAppDelegate",
      "Ancre « let delegate = ReactNativeDelegate() » introuvable dans AppDelegate.swift : Firebase non initialisé.",
    );
    return contents;
  }
  if (!/^\s*import\s+FirebaseCore\s*$/m.test(contents)) {
    contents = contents.replace(/^(internal import Expo|import Expo)\s*$/m, (m) => `${m}\nimport FirebaseCore`);
  }
  return contents.replace(
    ANCHOR,
    (line, indent) =>
      `${indent}${TAG}\n${indent}RNFBAppCheckModule.sharedInstance()\n${indent}FirebaseApp.configure()\n${line}`,
  );
}

module.exports = function withFirebaseAppDelegate(config) {
  return withAppDelegate(config, (cfg) => {
    if (cfg.modResults.language === "swift") {
      cfg.modResults.contents = addFirebaseConfigure(cfg.modResults.contents);
    }
    return cfg;
  });
};

module.exports.addFirebaseConfigure = addFirebaseConfigure;
