# Environnements et livraison (S12.1 – S12.3)

Deux environnements, choisis par `APP_ENV` :

| | production (défaut) | staging |
|---|---|---|
| Projet Firebase | `samaye-53723` | `samaye-staging` (à créer, Q8) |
| Alias `.firebaserc` | `default` | `staging` |
| Profil EAS | `production` (store), `preview` (interne) | `staging` (APK interne) |
| Environnement EAS | `production` | `preview` |
| Config web Firebase | `config/firebaseEnvironments.json` → `production` | idem → `staging` (valeurs `STAGING_PLACEHOLDER_*` à remplacer) |
| Fichiers natifs | variables EAS fichier `GOOGLE_SERVICES_JSON` / `GOOGLE_SERVICES_PLIST` (repli : fichiers locaux) | mêmes noms, environnement EAS `preview` |
| Bundle id / package | `com.tesfa.suivibaby` | `com.tesfa.suivibaby` (inchangé : codé dans `android/` et `ios/` versionnés) |

## Comment la config est choisie

- `app.config.js` lit `APP_ENV` (ou `EXPO_PUBLIC_APP_ENV`), refuse toute autre
  valeur que `production` / `staging`, et injecte `extra.appEnv` et
  `extra.firebase` (config web de l'environnement, chaque champ surchargeable
  par `EXPO_PUBLIC_FIREBASE_API_KEY`, `…_AUTH_DOMAIN`, `…_DATABASE_URL`,
  `…_PROJECT_ID`, `…_STORAGE_BUCKET`, `…_MESSAGING_SENDER_ID`, `…_APP_ID`,
  `…_MEASUREMENT_ID`). Un placeholder restant fait échouer un build EAS et
  n'émet qu'un avertissement en local.
- `config/firebaseEnv.ts` relit `extra` à l'exécution (repli : production) et
  lève une erreur au lancement si un placeholder subsiste.
- `utils/photoStorage.ts` dérive les buckets de la même config.
- `scripts/easCopyFirebaseFiles.js` (hook `eas-build-pre-install`) copie les
  fichiers natifs et vérifie qu'ils appartiennent au projet attendu par
  `APP_ENV` (voir `docs/adr/0001-android-cloud-build.md`).

## Déploiement des fonctions (`.github/workflows/deploy-functions.yml`)

- Tant que la variable de dépôt `STAGING_ENABLED` n'est pas `true` : `main` →
  production, comme avant.
- Avec `STAGING_ENABLED=true` : `main` → staging (`--project staging`, secret
  `GCP_SA_KEY_STAGING`), puis production après validation de l'environnement
  GitHub `production`.
- Règles et index **sans** `--force`, fonctions **avec** `--force`.
- Lancement manuel : choix `production` / `staging`.
- Authentification par clé JSON (`GCP_SA_KEY`) jusqu'au go sur Workload
  Identity Federation (S11.7, TODO marqué dans le workflow).

## Release mobile (`.github/workflows/release.yml`)

Manuel, entrées `platform` (ios / android) et `profile` (production /
staging) : contrôle qualité → build EAS attendu → envoi de **ce** build
(`eas submit --id`, production seulement : App Store Connect, ou Play piste
`alpha`) → mise à jour de `app_config/latest_version` après validation de
l'environnement `store-release`, à donner **seulement quand la version est
publique sur les deux stores** (le document est commun aux deux plateformes).

## Commandes à lancer une fois (Yoss)

Rien de ceci n'a été exécuté.

### 1. Projet `samaye-staging` (Q8 : Blaze, budget plafonné)

```sh
gcloud projects create samaye-staging --name="Suivi Baby staging"
gcloud billing projects link samaye-staging --billing-account=<BILLING_ACCOUNT_ID>
# Budget avec alertes (un budget GCP alerte, il ne coupe pas tout seul)
gcloud billing budgets create --billing-account=<BILLING_ACCOUNT_ID> \
  --display-name="samaye-staging cap" --budget-amount=10EUR \
  --filter-projects=projects/samaye-staging \
  --threshold-rule=percent=0.5 --threshold-rule=percent=0.9 --threshold-rule=percent=1.0
firebase projects:addfirebase samaye-staging
# Firestore (même région que la production : vérifier avec
#   gcloud firestore databases describe --project samaye-53723)
gcloud firestore databases create --project samaye-staging --location=<REGION>
# Buckets (cibles de .firebaserc)
gcloud storage buckets create gs://samaye-staging-photos-eu --project samaye-staging --location=europe-west1
#   le bucket par défaut samaye-staging.firebasestorage.app se crée depuis la console Storage
# Applications : web, Android et iOS, mêmes identifiants que la production
firebase apps:create web "Suivi Baby staging" --project samaye-staging
firebase apps:create android "Suivi Baby staging" --package-name com.tesfa.suivibaby --project samaye-staging
firebase apps:create ios "Suivi Baby staging" --bundle-id com.tesfa.suivibaby --project samaye-staging
firebase apps:sdkconfig web     <WEB_APP_ID>     --project samaye-staging   # → config/firebaseEnvironments.json "staging"
firebase apps:sdkconfig android <ANDROID_APP_ID> --project samaye-staging -o staging/google-services.json
firebase apps:sdkconfig ios     <IOS_APP_ID>     --project samaye-staging -o staging/GoogleService-Info.plist
```

Ensuite : activer Auth (e-mail, Google, Apple), App Check, et déployer règles,
index et fonctions une première fois (`firebase deploy --project staging`,
règles/index sans `--force`). Les secrets des fonctions (Secret Manager) sont à
recréer dans le projet staging.

**Limite connue** : `functions/index.js` et `functions/thumbnails.js` codent en
dur `samaye-53723` (buckets, URL des fonctions). À rendre paramétrables
(`process.env.GCLOUD_PROJECT`) avant le premier déploiement staging, sinon les
fonctions staging écriront dans les buckets de production.

### 2. Compte de service de déploiement staging + secret GitHub

```sh
gcloud iam service-accounts create github-deploy --project samaye-staging
for role in roles/firebase.admin roles/cloudfunctions.admin roles/iam.serviceAccountUser \
            roles/run.admin roles/artifactregistry.admin roles/secretmanager.viewer; do
  gcloud projects add-iam-policy-binding samaye-staging \
    --member=serviceAccount:github-deploy@samaye-staging.iam.gserviceaccount.com --role=$role
done
gcloud iam service-accounts keys create key.json \
  --iam-account=github-deploy@samaye-staging.iam.gserviceaccount.com
gh secret set GCP_SA_KEY_STAGING < key.json && rm key.json
```

(Aligner la liste des rôles sur celle du compte de production existant.)

### 3. GitHub : environnements et variable

```sh
REPO=<owner>/<repo>
gh api -X PUT repos/$REPO/environments/production \
  -F 'reviewers[][type]=User' -F "reviewers[][id]=$(gh api users/<login-yoss> -q .id)"
gh api -X PUT repos/$REPO/environments/staging
gh api -X PUT repos/$REPO/environments/store-release \
  -F 'reviewers[][type]=User' -F "reviewers[][id]=$(gh api users/<login-yoss> -q .id)"
# Seulement quand staging est déployable :
gh variable set STAGING_ENABLED --body true
```

### 4. EAS : numéros de build distants et fichiers Firebase

```sh
eas build:version:set --platform ios --profile production      # 32 (dernier build EAS)
eas build:version:set --platform android --profile production  # 13 (12 committé + marge)

eas env:create --environment production --name GOOGLE_SERVICES_JSON  --type file --value ./google-services.json --visibility secret
eas env:create --environment production --name GOOGLE_SERVICES_PLIST --type file --value ./GoogleService-Info.plist --visibility secret
# Quand staging existe :
eas env:create --environment preview --name GOOGLE_SERVICES_JSON  --type file --value ./staging/google-services.json --visibility secret
eas env:create --environment preview --name GOOGLE_SERVICES_PLIST --type file --value ./staging/GoogleService-Info.plist --visibility secret
```

### 5. Compte de service Google Play (Q9 : piste Alpha seulement)

1. Google Cloud (projet lié à la Play Console) :
   `gcloud iam service-accounts create play-submit --project samaye-53723`
   puis `gcloud iam service-accounts keys create play-key.json --iam-account=play-submit@samaye-53723.iam.gserviceaccount.com`.
2. Play Console → Utilisateurs et autorisations → inviter
   `play-submit@samaye-53723.iam.gserviceaccount.com`, sur l'app
   `com.tesfa.suivibaby` uniquement, droits « Publier sur les canaux de test »
   (pas la production).
3. `gh secret set GOOGLE_PLAY_SERVICE_ACCOUNT_KEY < play-key.json`, et pour un
   envoi depuis le Mac : `mkdir -p secrets && mv play-key.json secrets/google-play-service-account.json`
   (chemin de `eas.json` → `submit.production.android.serviceAccountKeyPath`,
   ignoré par git et EAS).

## Ce qui reste manuel

- Publication publique iOS (après TestFlight) et passage Play Alpha →
  Production : décision de Yoss.
- Validation `store-release` (mise à jour de la bannière de mise à jour) et
  `production` (déploiement des fonctions une fois staging actif).
- Remplir les valeurs staging de `config/firebaseEnvironments.json`.
