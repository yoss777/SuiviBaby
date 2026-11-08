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
| Bundle id / package | `com.tesfa.suivibaby` | `com.tesfa.suivibaby` (inchangé ; depuis l'ADR 0004 les dossiers natifs sont générés, un suffixe par environnement devient possible dans `app.config.js`) |

## Comment la config est choisie

- `app.config.js` lit `APP_ENV` (ou `EXPO_PUBLIC_APP_ENV`), refuse toute autre
  valeur que `production` / `staging`, et injecte `extra.appEnv` et
  `extra.firebase` (config web de l'environnement, chaque champ surchargeable
  par `EXPO_PUBLIC_FIREBASE_API_KEY`, `…_AUTH_DOMAIN`, `…_DATABASE_URL`,
  `…_PROJECT_ID`, `…_STORAGE_BUCKET`, `…_MESSAGING_SENDER_ID`, `…_APP_ID`,
  `…_MEASUREMENT_ID`). Un placeholder restant fait échouer un build EAS et
  n'émet qu'un avertissement en local.
- `config/firebaseEnv.ts` relit `extra` à l'exécution (repli : production) et
  lève une erreur au lancement si un placeholder subsiste ou si le
  `projectId` ne correspond pas à l'environnement (`samaye-53723` pour
  production, `samaye-staging` pour staging) ; `app.config.js` fait la même
  vérification au build. Le tag Sentry `environment` suit `APP_ENV`
  (`development` en `__DEV__`) ; le profil EAS `staging` n'envoie pas de
  source maps (`SENTRY_DISABLE_AUTO_UPLOAD`).
- `utils/photoStorage.ts` dérive les buckets de la même config.
- `scripts/easCopyFirebaseFiles.js` (hook `eas-build-pre-install`) copie les
  fichiers natifs et vérifie qu'ils appartiennent au projet attendu par
  `APP_ENV` (voir `docs/adr/0001-android-cloud-build.md`), lit `APP_ENV` puis
  `EXPO_PUBLIC_APP_ENV` comme `app.config.js`.

## Déploiement des fonctions (`.github/workflows/deploy-functions.yml`)

- Tant que la variable de dépôt `STAGING_ENABLED` n'est pas `true` : `main` →
  production, comme avant.
- Avec `STAGING_ENABLED=true` : `main` → staging (`--project staging`, secret
  `GCP_SA_KEY_STAGING`), puis production après validation de l'environnement
  GitHub `production`.
- Un job `test` (lint des fonctions, jest avec seuils de couverture, règles
  Firestore/Storage sur émulateur avec le projet factice `demo-samaye`) précède
  tout déploiement : staging et production en dépendent.
- **Production uniquement depuis `main`** : un lancement manuel depuis une autre
  branche saute le job production (le code part avec `--force`, ce serait celui
  de la branche). Le job production est toujours lié à l'environnement GitHub
  `production` (sans relecteurs ni règle de branche, il ne bloque rien) ; le
  job staging garde son environnement `staging`.
- Concurrence par cible, jamais annulée en cours : `deploy-functions-production`
  et `deploy-functions-staging`.
- Règles et index **sans** `--force`, fonctions **avec** `--force`.
- Lancement manuel : choix `production` / `staging`.
- Authentification par clé JSON jusqu'au go sur Workload Identity Federation
  (S11.7, TODO marqué dans le workflow). `GCP_SA_KEY` n'est lue que par le job
  production, `GCP_SA_KEY_STAGING` que par le job staging.

### Configuration dérivée du projet déployé

`functions/` ne contient plus aucun `samaye-53723` (`functions/lib/projectConfig.js`) :

- les déclencheurs Storage (miniatures, miroir de l'ancien bucket) lisent le
  nom de leur bucket dans des paramètres `defineString` (`PHOTOS_BUCKET`,
  `LEGACY_PHOTOS_BUCKET`), que la CLI résout au déploiement dans
  `functions/.env.<projectId>` : `.env.samaye-53723` (valeurs de production,
  inchangées) et `.env.samaye-staging` ;
- à l'exécution, les noms de buckets et l'URL des fonctions (lien de
  désinscription du récap) viennent de `GCLOUD_PROJECT` ; si aucun projet n'est
  connu, la fonction lève au lieu de viser la production.

Le job staging échoue si `grep -R "samaye-53723" functions/*.js functions/lib`
trouve quelque chose (seul le fichier `.env.samaye-53723` peut le nommer).

À vérifier à la création du projet staging : `mirrorLegacyPhoto*` est déclarée
en `us-central1` (région de l'ancien bucket de production). Le bucket par défaut
`samaye-staging.firebasestorage.app` doit être dans la même région, sinon
déployer ces deux fonctions dans la région réelle du bucket (ou les omettre en
staging, elles n'ont de sens que tant que l'ancien bucket de production vit).

## Release mobile (`.github/workflows/release.yml`)

Manuel, entrées `platform` (ios / android), `profile` (production / staging) et
`functions_ready` : contrôle qualité → build EAS attendu → envoi de **ce** build
(`eas submit --id`, production seulement : App Store Connect, ou Play piste
`alpha`) → mise à jour de `app_config/latest_version` après validation de
l'environnement `store-release`, à donner **seulement quand la version est
publique sur les deux stores** (le document est commun aux deux plateformes).

### Ordre de release (fonctions avant apps)

Les apps ≥ 1.0.10 appellent `setMemberRole` et `createShareCode` ; elles ne
doivent pas partir sur les stores avant que ces fonctions existent en
production. Le workflow n'a pas d'identifiants gcloud : pour le profil
`production`, il exige la case `functions_ready` cochée, après ce contrôle
manuel :

```sh
for f in setMemberRole createShareCode; do
  gcloud functions describe $f --region europe-west1 --project samaye-53723 --gen2 \
    --format='value(name,state)'      # attendu : ACTIVE
done
```

Ordre : 1) fusion sur `main` et déploiement des fonctions et règles
(`deploy-functions.yml`), 2) contrôle ci-dessus, 3) build et envoi des apps.
Les règles contiennent des branches de **transition** pour les apps ≤ 1.0.9
(création de code de partage, changement de rôle par le propriétaire) : elles
restent tant que `app_config.minVersion` ≤ 1.0.9 (voir le plan, S12).

### Numéros de build distants (`appVersionSource: remote`)

Le compteur vit chez EAS. Avant chaque build `production`, `release.yml` lance
`eas build:version:get --platform <p> --profile production --json` et échoue,
avec la commande à lancer, si le compteur n'a jamais été initialisé ou s'il est
inférieur au dernier numéro connu :

| Plateforme | Dernier numéro connu | Minimum accepté par le workflow |
|---|---|---|
| iOS (`buildNumber`) | 32 (dernier build EAS) | 32 |
| Android (`versionCode`) | 12 (committé dans `android/app/build.gradle`) | 13 |

Quand un build dépasse ces valeurs de façon durable, relever les minimums dans
`release.yml` (étape « Check the remote build number ») **et** ce tableau.

**Release locale** (Android `.aab` construit sur le Mac, cf. mémoire de
l'équipe) sous versionnement distant :

1. `eas build:version:get --platform android --profile production` : doit afficher un
   numéro ≥ au minimum ci-dessus (sinon `eas build:version:set`, une fois).
2. `eas build --platform android --profile production --local` : EAS
   **incrémente lui-même le compteur distant** (`autoIncrement`). Ne plus
   modifier `versionCode` / `buildNumber` à la main dans `app.json`
   (les dossiers natifs sont générés, ADR 0004) : ces valeurs sont ignorées avec la source
   distante, et deux numéros qui divergent finissent par un envoi refusé.
3. Récupérer le `.aab`, l'envoyer sur Play (Tests fermés – Alpha), puis
   `eas build:version:get` pour noter le numéro atteint.
Un build iOS part toujours sur EAS cloud (`release.yml` ou `eas build`).

### Nightly Maestro (`maestro-nightly.yml`)

Seuls les parcours en lecture seule 01 (inscription) et 02 (connexion) tournent
la nuit tant qu'il n'y a pas de projet staging : 03 (ajout d'événement) et 05
(partage) créent des données et reviendront avec staging. Le job échoue si le
dernier build `preview` a plus de 14 jours et affiche son `gitCommitHash`.

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

Les noms de buckets et URL des fonctions se déduisent du projet
(`functions/.env.samaye-staging`, voir « Configuration dérivée du projet
déployé ») : rien à modifier dans le code avant le premier déploiement staging.

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

### 3. GitHub : environnements, secrets et variable

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

Portée des secrets (revue ECC, M2). Les workflows ne lisent plus les clés que
dans les jobs liés à leur environnement ; il reste à faire côté GitHub :

1. **Restreindre les environnements à `main`** : Settings → Environments →
   `production` et `store-release` → *Deployment branches and tags* →
   « Selected branches » → `main` (le job production est déjà lié à
   l'environnement `production` dans tous les cas, sans relecteurs il ne
   bloque rien).
2. **Déplacer `GCP_SA_KEY` dans les secrets de l'environnement `production`**
   (puis la supprimer des secrets de dépôt) :
   `gh secret set GCP_SA_KEY --env production < key.json`
   `gh secret delete GCP_SA_KEY` (secret de dépôt). Idem `GCP_SA_KEY_STAGING`
   dans l'environnement `staging`, et `FIREBASE_PROJECT_ID` si on veut le
   limiter aussi.
3. **Compte de service dédié à `app_config`**, avec le seul rôle
   `roles/datastore.user`, pour l'environnement `store-release` (le job qui
   écrit `app_config/latest_version` n'a plus besoin de la clé de déploiement) :
   ```sh
   gcloud iam service-accounts create app-config-writer --project samaye-53723
   gcloud projects add-iam-policy-binding samaye-53723 \
     --member=serviceAccount:app-config-writer@samaye-53723.iam.gserviceaccount.com \
     --role=roles/datastore.user
   gcloud iam service-accounts keys create key.json \
     --iam-account=app-config-writer@samaye-53723.iam.gserviceaccount.com
   gh secret set APP_CONFIG_WRITER_KEY --env store-release < key.json && rm key.json
   ```
   Tant que ce secret n'existe pas, l'étape `publish-app-config` échoue avec un
   message clair (repli : `npm run update-app-config` depuis le Mac).

### 4. EAS : numéros de build distants et fichiers Firebase

```sh
eas build:version:set --platform ios --profile production      # 32 (dernier build EAS)
eas build:version:set --platform android --profile production  # 13 (12 committé + marge)
# Contrôle : eas build:version:get --platform <ios|android> --profile production
# (release.yml fait ce contrôle avant chaque build production, voir « Numéros de build distants »)

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

## Maintenance hebdomadaire

- `children.lastEventAt` n'est pas verrouillé pour les écritures client sur
  `events` (versions en circulation inconnues) : un client peut encore écrire un
  événement sans passer par `validateAndCreateEvent`, et la valeur dérive alors.
  Le champ lui-même est protégé en écriture (règle `children`). Chaque semaine,
  depuis le Mac avec un compte de service :
  `node scripts/backfillLastEventAt.js --apply --recompute --project=samaye-53723`
  (d'abord sans `--apply` pour voir le nombre de corrections ; `--project`
  est obligatoire avec `--apply`).
- Retirer les règles de transition (code de partage client, rôle par le client)
  dès que `app_config.minVersion` > 1.0.9 (tâche datée dans le plan, S12).

## Ce qui reste manuel

- Publication publique iOS (après TestFlight) et passage Play Alpha →
  Production : décision de Yoss.
- Validation `store-release` (mise à jour de la bannière de mise à jour) et
  `production` (déploiement des fonctions une fois staging actif).
- Remplir les valeurs staging de `config/firebaseEnvironments.json`.
