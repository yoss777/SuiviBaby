// Android : relancée depuis l'écran des apps récentes après que le système
// a tué le processus, l'activité reçoit de nouveau le lien qui l'avait
// ouverte. React Native le redonne comme lien d'ouverture (getInitialURL ne
// regarde pas FLAG_ACTIVITY_LAUNCHED_FROM_HISTORY). Un lien du widget
// (« démarrer une sieste », « arrêter la promenade »…) était alors rejoué,
// parfois sans confirmation. On efface le lien dans ce cas : l'app s'ouvre
// simplement sur l'accueil. Revue ECC 1.0.24.
const { withMainActivity } = require("@expo/config-plugins");
const { mergeContents } = require("@expo/config-plugins/build/utils/generateCode");

const KOTLIN_GUARD = [
  "    if ((intent.flags and android.content.Intent.FLAG_ACTIVITY_LAUNCHED_FROM_HISTORY) != 0) {",
  "      intent.data = null",
  "    }",
].join("\n");

/** Insère le garde juste avant super.onCreate (idempotent grâce au tag). */
function addRecentsGuard(contents) {
  return mergeContents({
    src: contents,
    newSrc: KOTLIN_GUARD,
    tag: "suivibaby-ignore-link-from-recents",
    anchor: /super\.onCreate\(/,
    offset: 0,
    comment: "    //",
  }).contents;
}

const withIgnoreLinkFromRecents = (config) =>
  withMainActivity(config, (cfg) => {
    if (cfg.modResults.language !== "kt") {
      throw new Error("withIgnoreLinkFromRecents : MainActivity Kotlin attendue");
    }
    cfg.modResults.contents = addRecentsGuard(cfg.modResults.contents);
    return cfg;
  });

module.exports = withIgnoreLinkFromRecents;
module.exports.addRecentsGuard = addRecentsGuard;
