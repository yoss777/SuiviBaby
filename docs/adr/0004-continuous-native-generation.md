# ADR 0004 — Génération des dossiers natifs (CNG)

- Statut : adopté.
- Date : 2026-11-08
- Contexte de décision : montée d'Expo demandée par Yoss (13.5), audit du
  2026-11-08 (H5 : « dossiers natifs versionnés, prebuild sauté sans ADR »).

## Contexte

- `android/` et `ios/` étaient versionnés. EAS saute alors `expo prebuild` :
  - chaque plugin de `app.json` / `app.config.js` (Sentry, Firebase,
    expo-build-properties…) restait sans effet tant qu'on ne reportait pas son
    résultat à la main ;
  - chaque montée d'Expo aurait demandé de fusionner à la main les modèles
    natifs d'Expo, version après version (53 → 58 : cinq fois).
- Un `expo prebuild --clean` sur la configuration actuelle, comparé aux dossiers
  versionnés, n'a montré que peu de différences faites à la main :
  1. Podfile : en-têtes modulaires des pods Firebase (App Check natif) et fmt
     compilé en C++17 (Xcode 26) ;
  2. `PrivacyInfo.xcprivacy` (manifeste de confidentialité iOS) ;
  3. bloc de signature Android `MYAPP_UPLOAD_*`, inutile avec EAS (identifiants
     distants, injectés au build) ;
  4. `android.suppressUnsupportedCompileSdk`, un avertissement de Gradle sans effet.
  Les entitlements, le manifeste Android, Info.plist et les liens profonds sont
  identiques.

## Décision

Les dossiers natifs ne sont plus versionnés (`/ios` et `/android` dans
`.gitignore`) : EAS (cloud et `--local`) les génère à chaque build avec
`expo prebuild`.

- 1 → `plugins/withIosPodfileFixes.js` (plugin de configuration, testé). Depuis
  Expo 58, il ne garde que fmt : @react-native-firebase 27 résout Firebase par
  Swift Package Manager, les pods Firebase déclarés à la main entraient en conflit ;
- 2 → `expo.ios.privacyManifests` dans `app.json` ;
- 3 et 4 → abandonnés.
- Les fichiers Firebase natifs restent à la racine (`google-services.json`,
  `GoogleService-Info.plist`, ignorés par git, gardés par `.easignore`) ou
  viennent des variables de fichier EAS ; `app.config.js` les passe à prebuild
  (`googleServicesFile`) et `scripts/easCopyFirebaseFiles.js` vérifie le projet
  Firebase avant le build.

## Conséquences

- Toute modification native passe par la configuration (`app.json`,
  `app.config.js`) ou un plugin dans `plugins/`. Ne jamais modifier `ios/` ou
  `android/` à la main : ils sont régénérés.
- Release : seule `expo.version` (`app.json`) change à la main ; les numéros de
  build sont distants (EAS, `appVersionSource: remote`).
- Pour ouvrir le projet dans Xcode ou Android Studio : `npx expo prebuild`
  (ou `npx expo run:ios` / `run:android`).
- Retour arrière : `git revert` du commit qui retire les dossiers.
