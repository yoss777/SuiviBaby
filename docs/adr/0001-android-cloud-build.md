# ADR 0001 — Android EAS cloud build: why it failed, local workaround, fix

> Mise à jour 2026-11-08 : les dossiers natifs ne sont plus versionnés (ADR 0004).
> `scripts/easCopyFirebaseFiles.js` copie désormais les variables à la racine du
> projet, d'où `expo prebuild` les reprend.

- Statut : accepté (code prêt, en attente des variables EAS — voir « Actions »)
- Date : 2026-11-07
- Sprint : S12.2 (audit 2026-11)

## Contexte

Depuis le 2026-05-25 (dernier build Android cloud réussi : `preview`,
versionCode 4, build `2b2d9452`), aucun build Android n'a abouti sur EAS
cloud. Les versions 1.0.6 à 1.0.9 ont été construites en local
(`eas build --local --platform android --profile production`, `.aab` signé
avec la clé hébergée par Expo, alias `samaye-key`) puis envoyées à la main sur
la piste Play « Tests fermés – Alpha ». iOS, lui, se construit sans souci sur
EAS cloud.

Particularité du projet : les dossiers natifs `android/` et `ios/` sont
**versionnés**. EAS saute donc `expo prebuild` (journal :
« Skipped running "expo prebuild" because the "android" directory already
exists ») : tout ce que `app.config.js` déclare pour le natif
(`android.googleServicesFile`, `package`, nom…) n'atteint pas le build ; seul
compte le contenu de `android/`.

## Historique des builds Android cloud (EAS, `eas build:list`)

| Date | Build | Profil | Origine | Résultat | Erreur |
|---|---|---|---|---|---|
| 2026-05-24/25 | `fa6244b7`, `2b2d9452` | preview | Mac | ✅ | — |
| 2026-10-31 | `acb7d324` | production | Mac | annulé | — |
| 2026-11-01 | `0b6308c0` (commit `c07efed`) | production | Mac | ❌ | `:app:releaseCompileClasspath` — « No matching variant of project :react-native-async-storage_async-storage… No variants exist » (idem datetimepicker, etc.) |
| 2026-11-01 | `a67e5760` (commit `f108cff`) | production | Mac | ❌ | même erreur d'autolinking |
| 2026-11-01 | `7f476b9f` (commit `56ce0c6`, correctif) | production | Mac | annulé (passage au build local) | — |
| 2026-11-05 | `f8dbd68e` (commit « Merge … into … ») | preview | GitHub Actions (PR) | ❌ | `:app:processReleaseGoogleServices` — « File google-services.json is missing » |
| 2026-11-05 | `ffcbd284` | preview | GitHub Actions (PR) | annulé | — |

Les journaux ont été lus le 2026-11-07 (fichiers de log EAS des trois builds
en échec).

## Causes

### Cause 1 — confirmée : `google-services.json` absent des builds lancés hors du Mac

- `google-services.json` et `GoogleService-Info.plist` sont dans `.gitignore`.
- Depuis le Mac, ils partent quand même dans l'archive envoyée à EAS, parce que
  `.easignore` (qui remplace `.gitignore` pour EAS) ne les exclut pas, et
  `android/app/google-services.json` existe en local (récupéré avec
  `firebase apps:sdkconfig`).
- Depuis GitHub Actions (checkout propre), le fichier n'existe pas ; prebuild
  étant sauté, rien ne le crée ; le plugin Gradle `com.google.gms.google-services`
  (appliqué dans `android/app/build.gradle`) échoue. **Confirmé** par le
  journal de `f8dbd68e` (chemins cherchés listés, dont
  `android/app/google-services.json`).
- Conséquence : tout build cloud lancé par la CI (`release.yml`, `preview.yml`,
  `maestro-nightly.yml`) ne pouvait pas réussir.

### Cause 2 — confirmée (erreur), cause probable (origine) : cache d'autolinking Gradle envoyé depuis le Mac

- Les deux builds production du 2026-11-01 lancés depuis le Mac échouent à la
  résolution des modules autolinkés (« No variants exist » pour chaque module
  natif). **Confirmé** par les journaux de `0b6308c0` et `a67e5760`.
- Origine attribuée par le commit `56ce0c6` : un build de dev local avait
  laissé `android/build/` (cache d'autolinking contenant les chemins absolus de
  la machine), téléversé avec le projet. `56ce0c6` ajoute `android/build/` à
  `.easignore`. **Probable, non vérifié** : le build `7f476b9f` lancé avec ce
  correctif a été annulé avant la fin ; aucun build cloud n'a tourné depuis.

### Autres pistes examinées — non retenues

- Signature : `credentialsSource: remote`, même clé qu'en local, aucun
  journal ne montre d'erreur de signature.
- SDK / Gradle : AGP 8.8.2 / Gradle 8.13 identiques en local, où le build passe.
- `appVersionSource: local` + `autoIncrement` : n'empêche pas le build mais
  fait dériver les numéros (versionCode incrémenté à chaque tentative, à
  remettre à la main ; iOS build 32 construit sur EAS le 2026-11-07 alors que
  `app.json` indique 31). Traité par la décision ci-dessous.

## Décision

1. **Fichiers Firebase en variables EAS de type fichier**, une valeur par
   environnement EAS :
   - `GOOGLE_SERVICES_JSON` (Android) et `GOOGLE_SERVICES_PLIST` (iOS) ;
   - environnement EAS `production` → fichiers de `samaye-53723` (profils
     `production` et `preview`) ; environnement `preview` → fichiers de
     `samaye-staging` (profil `staging`, `APP_ENV=staging`).
2. **Hook `eas-build-pre-install`** (`scripts/easCopyFirebaseFiles.js`, sans
   dépendance) : copie la variable vers `android/app/google-services.json` /
   `ios/SuiviBaby/GoogleService-Info.plist`, vérifie que le `project_id`
   correspond à `APP_ENV` (un build staging ne peut pas embarquer la
   production, ni l'inverse) et fait échouer le build tout de suite si le
   fichier de la plateforme manque. Nécessaire parce que prebuild est sauté :
   `googleServicesFile` dans `app.config.js` ne suffit pas.
3. **`appVersionSource: remote`** : EAS tient les numéros de build ; plus de
   bump de `buildNumber` / `versionCode` à committer, plus de dérive entre
   cloud et local. `version` (1.0.x) reste dans `app.json` /
   `build.gradle` / `Info.plist`.
4. **`eas submit` Android** vers la piste `alpha` avec un compte de service Play
   (Q9), clé hors dépôt (`secrets/`, ignoré par git et par EAS).
5. Le build local reste la **solution de repli** documentée tant qu'un build
   cloud Android n'a pas réussi avec ce montage.

## Conséquences

- Un build Android cloud lancé depuis la CI devient possible dès que les
  variables EAS existent ; sans elles, il échoue en quelques secondes avec un
  message qui nomme la variable manquante.
- Les builds locaux continuent de fonctionner (le hook laisse en place le
  fichier local s'il correspond à `APP_ENV`).
- `app.json` `ios.buildNumber` / `android.versionCode` ne sont plus la source :
  ne plus les bumper ; la procédure de release locale (mémoire
  « Builds de release ») doit être mise à jour en conséquence.
- Le bundle id / package reste `com.tesfa.suivibaby` pour tous les
  environnements (codé dans les dossiers natifs) : une build staging
  s'installe à la place de la build de production sur un même appareil.

## Actions (Yoss)

```sh
# Numéros de build distants, une seule fois (valeur courante ; le prochain
# build avec autoIncrement prendra +1). iOS : 32 est le dernier build EAS
# (2026-11-07). Android : 12 est committé ; 13 couvre un éventuel .aab local
# non committé (sans risque : un versionCode doit seulement croître).
eas build:version:set --platform ios --profile production      # saisir 32
eas build:version:set --platform android --profile production  # saisir 13

# Fichiers Firebase de production (environnement EAS production)
eas env:create --environment production --name GOOGLE_SERVICES_JSON \
  --type file --value ./google-services.json --visibility secret
eas env:create --environment production --name GOOGLE_SERVICES_PLIST \
  --type file --value ./GoogleService-Info.plist --visibility secret
```

Puis valider avec un build `preview` Android cloud
(`eas build --platform android --profile preview`) avant de remplacer le build
local par `release.yml`.
