# Runbook SuiviBaby — exploitation

Dernière mise à jour : 2026-11-07 (sprint S13.7). Ce document dit **quoi faire** ;
les détails de configuration sont dans les documents liés, à ne pas recopier ici.

| Sujet | Document de référence |
|---|---|
| Environnements, CI de déploiement, release mobile, numéros de build | [ENVIRONMENTS.md](ENVIRONMENTS.md) |
| Sauvegardes, alertes, budget, Sentry, RevenueCat (commandes) | [FIREBASE_MONITORING.md](FIREBASE_MONITORING.md) |
| App Check : critères et retour arrière | [adr/0002-app-check-enforcement.md](adr/0002-app-check-enforcement.md) |
| Mises à jour OTA : pourquoi pas pour l'instant | [adr/0003-expo-updates.md](adr/0003-expo-updates.md) |
| Échéances, décisions en attente (D1 à D10) | [SUIVI_ACTIONS.md](SUIVI_ACTIONS.md) |
| Plan des sprints et ce qui reste | [PLAN_SPRINTS_AUDIT.md](PLAN_SPRINTS_AUDIT.md) |

Projets : production `samaye-53723` (alias `default` dans `.firebaserc`) ; staging
`samaye-staging` (alias `staging`, **pas encore créé** au 2026-11-07, en attente du
go de Yoss, voir ENVIRONMENTS §1).

---

## 1. Déploiements

### 1.1 Fonctions, règles et index (CI)

Workflow `.github/workflows/deploy-functions.yml`.

- Déclenchement : push sur `main` (production, tant que la variable de dépôt
  `STAGING_ENABLED` n'est pas `true`), ou lancement manuel avec la cible
  `production` ou `staging`.
- Un job `test` (lint des fonctions, jest avec seuils, règles sur émulateur) doit
  réussir avant tout déploiement.
- Production : **seulement depuis `main`**. Un lancement manuel depuis une autre
  branche saute ce job.
- Règles et index sont déployés **sans** `--force` ; les fonctions **avec** `--force`
  (le code est la source de vérité). Ne jamais ajouter `--force` aux règles et
  index : la CLI supprimerait les index absents du fichier.
- Index à supprimer à la main (S12.5) : deux index `eventLikes` ont été retirés de
  `firestore.indexes.json`, mais le déploiement sans `--force` ne les supprime pas.
  Suppression à faire à la main (console Firestore ou gcloud, au choix) après
  vérification (PLAN, S12.5).

### 1.2 Règles Storage (manuel)

Les règles Storage **ne sont pas** dans la CI. Après fusion d'un changement de
`storage.rules` sur `main` :

```sh
firebase deploy --only storage --project samaye-53723
```

Les buckets (legacy US et `photos-eu`) sont décrits dans `.firebaserc`. Migration en
cours : voir MIGRATION_PHOTOS_EU.md et la section 7.

### 1.3 Site (hosting, manuel)

```sh
bash scripts/checkSiteTodos.sh          # doit sortir en 0 : aucun marqueur « todo » restant
firebase deploy --only hosting --project samaye-53723
```

Le contrôle n'est pas encore branché dans la CI : tant que des cases restent à
trancher (DPO D2, non-entraînement AssemblyAI et IA D4 et D5, médiateur D6, voir
SUIVI_ACTIONS), il faut le lancer à la main avant le déploiement.

---

## 2. Release mobile

Principes : une version publique sur les deux stores avant la mise à jour de
`app_config/latest_version` ; les fonctions déployées **avant** les apps qui les
appellent.

### 2.1 Préalables

1. Fonctions et règles en production (1.1), puis contrôle des fonctions
   `setMemberRole` et `createShareCode` (`ACTIVE`, commandes dans ENVIRONMENTS
   « Ordre de release »). Requis pour toute version ≥ 1.0.10.
2. Numéros de build distants initialisés (`eas build:version:get`). Minimums attendus
   par `release.yml` : iOS 32, Android 13. Si le compteur est trop bas :
   `eas build:version:set --platform <ios|android> --profile production` (une fois).
3. `app.json` : ne plus modifier `ios.buildNumber` / `android.versionCode` à la main
   (source distante, ENVIRONMENTS « Numéros de build distants »).

### 2.2 iOS (EAS cloud)

- Commande locale : `npm run release:ios` (`eas build --platform ios --profile production
  --non-interactive --auto-submit`) ;
- ou workflow `release.yml` (manuel, plateforme `ios`, profil `production`, case
  `functions_ready` cochée).
- Le build est fait sur EAS, puis envoyé automatiquement à App Store Connect.
- Ensuite, dans App Store Connect : soumission à la revue (action de Yoss).
- Contrôle : état « finished » du build EAS, puis build visible dans TestFlight.

### 2.3 Android (`.aab` local, Play Alpha)

- Commande : `npm run release:android` (`eas build --local --platform android
  --profile production --non-interactive`). Prévoir au moins 8 Go libres.
- Envoi : importer le `.aab` dans Play Console, piste **Tests fermés (Alpha)**.
  L'envoi automatique (`eas submit` ou étape de `release.yml`) attend le compte de
  service Google Play (Q9, ENVIRONMENTS §5).
- Passage en production Play : sur accord de Yoss uniquement.
- Noter le numéro atteint (`eas build:version:get --platform android --profile production`).

### 2.4 Après publication sur les deux stores

Mettre à jour `app_config/latest_version` (bannière de mise à jour, `minVersion`) :

- workflow `release.yml` (job « Update app_config », environnement `store-release`,
  validation requise) ; ou
- en local : `MIN_VERSION=<version> npm run update-app-config` (script
  `scripts/updateAppConfig.mjs`). En local, le script utilise le **token de la CLI
  Firebase** (`firebase login` préalable, compte autorisé à écrire dans Firestore) ;
  en CI, il utilise le service account JSON (`GCP_SA_KEY`). Aucune clé d'écriture à
  fournir à la main.

`minVersion` **force** la mise à jour : ne la relever qu'après publication effective
(la version minimale est aujourd'hui 1.0.6, fixée le 2026-11-02 par décision de Yoss ;
SUIVI 1.6).

### 2.5 Pas d'OTA

Il n'y a pas de mise à jour OTA (`expo-updates` absent). Une correction passe par
un nouveau build et une revue (ADR 0003). Ne pas utiliser `eas update --rollback` : la
commande n'existe pas dans ce projet.

---

## 3. Sauvegardes et restauration

Configuration (FIREBASE_MONITORING §9) : sauvegarde quotidienne (7 jours) et
hebdomadaire le dimanche (30 jours) sur `(default)` ; protection contre la suppression
activée ; PITR non activé. Planning créé le 2026-11-06.

**Contrôle hebdomadaire** :

```sh
gcloud firestore backups list --location=eur3 --project=samaye-53723
```

**Test de restauration** (à faire et à noter, décision D1) : toujours dans une base
séparée, jamais sur `(default)`.

```sh
gcloud firestore databases restore \
  --source-backup=projects/samaye-53723/locations/eur3/backups/<ID> \
  --destination-database=restore-test
# vérifier quelques documents, puis supprimer restore-test
```

Le test n'est pas encore fait (PLAN 2.3, « reste »). Tant qu'il ne l'est pas, une
perte de données ne peut pas être garantie récupérable.

---

## 4. Alertes, budget et Sentry

### 4.1 Alertes Cloud Monitoring

Trois métriques sur les journaux (`functions_errors`, `webhook_5xx`,
`scheduled_job_failures`), alerte à plus de 0 sur 15 minutes, vers un canal e-mail.
Création : FIREBASE_MONITORING §9.

Quand une alerte arrive :
1. ouvrir les journaux filtrés sur la métrique (Logging) ;
2. identifier la fonction et l'erreur ;
3. appliquer la section 6 (incident) si l'impact est confirmé.

### 4.2 Budget

Budget GCP de **25 € par mois** (facture d'octobre : 10,37 €), seuils 50 %, 90 %,
100 % et dépense prévue à 100 % (PLAN 2.4). FIREBASE_MONITORING §1 indique encore
des seuils en dollars (10, 25, 50) : ces valeurs sont anciennes, le budget réel fait
foi.

Un budget alerte, il ne coupe rien. Une dépense anormale se traite par la liste des
reads Firestore (FIREBASE_MONITORING §7, « coûts Firestore élevés ») et par la
désactivation de la fonction en cause (section 6).

### 4.3 Sentry

- Projet `suivibaby`, région UE (`ingest.de.sentry.io`). Filtres de confidentialité :
  `utils/sentryFilters.ts` (e-mails, prénoms, transcriptions retirés).
- Tags utiles : `release` (posée par le SDK natif, tâche 2.2) et `environment`.
- Triage d'une issue :
  1. vérifier la release et l'environnement (production, staging, développement) ;
  2. classer : bug de l'app (correctif et build), bug d'une fonction (correctif et
     redéploiement, 1.1), service externe (Resend, AssemblyAI, Anthropic, RevenueCat),
     bruit (filtre dans `utils/sentryFilters.ts`) ;
  3. si une donnée personnelle ou de santé apparaît dans l'événement : traiter comme
     un incident (section 6) et corriger le filtre avant de fermer ;
  4. fermer l'issue avec la release corrective.
- Alertes Sentry à créer : FIREBASE_MONITORING §6.2 (4 alertes), à faire après les
  premiers événements de production (PLAN 2.4).
- Obsolète : FIREBASE_MONITORING §9 « Sentry en production » indique qu'aucun DSN n'est
  fourni ; c'est faux depuis la tâche 2.2 (DSN dans l'environnement EAS `production`).

### 4.4 RevenueCat

Webhook `revenueCatWebhook` (`onRequest`, secret Bearer). Une erreur 5xx déclenche
l'alerte `webhook_5xx`. Procédure dans FIREBASE_MONITORING §6.4.

---

## 5. Secrets et rotation

### 5.1 Inventaire (noms seulement, jamais les valeurs)

| Emplacement | Secrets |
|---|---|
| Firebase Secret Manager (fonctions) | `RESEND_API_KEY`, `ANTHROPIC_API_KEY`, `ASSEMBLYAI_API_KEY`, `REVENUECAT_WEBHOOK_SECRET`, `RECAP_UNSUBSCRIBE_SECRET`, `APPLE_KEY_ID`, `APPLE_TEAM_ID`, `APPLE_PRIVATE_KEY`, `INITIAL_ADMIN_EMAIL` |
| GitHub, cible : environnements `production`, `staging`, `store-release` (déplacements et création en attente, ENVIRONMENTS §3) | `GCP_SA_KEY` (clé JSON, à remplacer par la fédération d'identité, S11.7), `GCP_SA_KEY_STAGING`, `APP_CONFIG_WRITER_KEY`, `GOOGLE_PLAY_SERVICE_ACCOUNT_KEY` |
| GitHub (dépôt, état actuel) | `EXPO_TOKEN`, `MAESTRO_EMAIL`, `MAESTRO_PASSWORD`, `FIREBASE_PROJECT_ID`, et les clés ci-dessus tant que leur déplacement n'est pas fait |
| EAS, environnement `production` | `GOOGLE_SERVICES_JSON`, `GOOGLE_SERVICES_PLIST` (fichiers), `SENTRY_AUTH_TOKEN` (secret) ; `EXPO_PUBLIC_SENTRY_DSN` (non secret, en clair) |
| Local, non versionné | `.env`, dossier `secrets/` (clé Play) |

Les clés Firebase web (`EXPO_PUBLIC_FIREBASE_*`) ne sont pas des secrets au sens
strict : leur sécurité repose sur les règles et App Check.

### 5.2 Procédure de rotation (générique, à valider au premier usage)

1. Créer la nouvelle valeur chez le fournisseur (Resend, Anthropic, AssemblyAI,
   RevenueCat, Apple, Google Cloud, Sentry, Expo).
2. Mettre la nouvelle valeur à l'endroit où elle est lue :
   - fonctions : `firebase functions:secrets:set <NOM>` puis redéploiement des fonctions
     qui l'utilisent (CI, 1.1) ;
   - GitHub : Settings → Secrets (environnement concerné) ;
   - EAS : `npx eas env:create` (nouvelle variable) ou `eas env:update` ;
     un nouveau build est nécessaire pour toute variable lue par l'app.
3. Vérifier : un appel réel (fonction, webhook de test, build), sans erreur dans Sentry
   ni dans les journaux.
4. Révoquer l'ancienne valeur chez le fournisseur.
5. Noter la rotation dans l'historique de `SUIVI_ACTIONS.md` (date, nom du secret,
   jamais la valeur).

Fréquence de rotation : aucune politique n'est écrite à ce jour. Rotation immédiate
en cas de soupçon de fuite (section 6). Le compte de service `GCP_SA_KEY` doit être
remplacé dès que la fédération d'identité est en place (S11.7).

---

## 6. Incident : liste de contrôle

1. **Qualifier** : quoi, depuis quand, quels utilisateurs ; données personnelles ou
   de santé touchées ? paiement touché ?
2. **Contenir** (ordre de préférence) :
   - **Fonction fautive** : `git revert` du commit sur `main`, puis CI (1.1). En
     urgence, redéployer la fonction précédente avec `firebase deploy --only functions:<nom>
     --project samaye-53723` depuis un commit connu. **Attention** : un déploiement
     manuel depuis un ancien commit est écrasé au prochain push sur `main`, car la CI
     redéploie toutes les fonctions depuis `main`. Le `git revert` sur `main` (ou le
     blocage des merges, le temps du correctif) reste donc obligatoire ; le déploiement
     manuel ne sert qu'à gagner quelques minutes. Il n'y a pas d'interrupteur de
     fonction documenté : prévoir un drapeau si ce cas revient.
   - **Règles Firestore ou Storage fautives** : `git revert` de la règle, puis
     `firebase deploy --only firestore:rules --project samaye-53723` (sans `--force`)
     ou `firebase deploy --only storage --project samaye-53723`. Vérifier l'accès après
     déploiement.
   - **App fautive** : pas d'OTA. Suspendre la diffusion progressive (Play : suspendre
     le déploiement ; App Store : mettre en pause la diffusion progressive, à confirmer
     dans les consoles), préparer un correctif (2.2 ou 2.3), puis, si nécessaire,
     relever `minVersion` (2.4) **seulement** lorsque le correctif est publié.
   - **Coût anormal** : contrôler les reads Firestore, désactiver la source (client ou
     fonction) et prévenir Yoss.
   - **Message de santé erroné** : les messages d'alerte sont dans le bundle (ADR 0003),
     donc un correctif de build est nécessaire. Les fiches (`tips`) se corrigent dans
     Firestore (`scripts/publishTips.mjs`, sur accord).
3. **Données** : restaurer dans `restore-test` (section 3), copier seulement les
   documents nécessaires, jamais écraser `(default)` sans accord écrit de Yoss.
4. **Notifier** : en cas de violation de données personnelles, vérifier avec le DPO
   (décision D2 dans SUIVI) les obligations de notification (RGPD, délai de 72 heures à
   partir de la connaissance du fait). Ne pas décider seul.
5. **Clore** : ajouter une entrée dans l'historique de `SUIVI_ACTIONS.md` (date, cause,
   actions, contrôle). Si la cause est une absence de test, ajouter le test au plan.

---

## 7. Maintenance et scripts

Les scripts de backfill (`backfillLastEventAt.js`, `backfillRetention.js`) font une
simulation par défaut et n'écrivent qu'avec `--apply` (vérifié dans leurs en-têtes).
Les lancer depuis le Mac avec un compte de service (`GOOGLE_APPLICATION_CREDENTIALS`)
ou une session `gcloud`.

| Fréquence | Script | Commande | Note |
|---|---|---|---|
| Chaque semaine | `scripts/backfillLastEventAt.js` | `node scripts/backfillLastEventAt.js --apply --recompute --project=samaye-53723` | D'abord sans `--apply` pour voir le nombre de corrections. `--project` obligatoire avec `--apply` (ENVIRONMENTS, maintenance). |
| Chaque semaine, jusqu'à 1.9 | `scripts/migratePhotosToEu.mjs` | `node scripts/migratePhotosToEu.mjs` | Attendu : « 0 à copier ». Sinon relancer avec `--apply` (SUIVI 1.5). |
| Une fois (à vérifier) | `scripts/backfillRetention.js` | `node scripts/backfillRetention.js` puis `--apply` | Renseigne `expireAt` sur les historiques anciens (TTL). Mode simulation par défaut. Statut d'exécution non noté : à vérifier avant de relancer. |
| Pendant la transition App Check | `scripts/auditAppCheck.sh` | `./scripts/auditAppCheck.sh 7d` | Doit afficher `READY` (ADR 0002). |
| Avant tout nouvel envoi de fiches | `scripts/compareTipsWithSeed.mjs` | `node scripts/compareTipsWithSeed.mjs` | Lecture seule. Le re-semis (`scripts/seedViaFirestore.mjs`) seulement sur accord. |
| Lundi | (pas de script) | relire `docs/SUIVI_ACTIONS.md` | Le document demande une relecture chaque lundi. |

Les scripts de `scripts/` qui ne figurent pas dans ce tableau (migrations anciennes,
diagnostics ponctuels) ne doivent pas être lancés sans relecture : voir la liste
des scripts non utilisés dans le rapport S13.4.

---

## 8. Règles de transition à retirer

**Tâche 12.7 (revue le 2026-12-07)** : retirer de `firestore.rules` les deux règles de
transition destinées aux apps ≤ 1.0.9 (création de code de partage et changement de
rôle par le client), avec leurs tests (`firestore.rules.test.ts`,
`multiUser.rules.test.ts`).

Condition : `app_config.minVersion` > 1.0.9. **Non remplie au 2026-11-07** : `minVersion`
vaut 1.0.6, donc des utilisateurs 1.0.6 à 1.0.9 dépendent encore de ces règles. Ne pas
retirer avant que la condition soit vraie.

---

## 9. Dates à surveiller

| Date | Action | Référence |
|---|---|---|
| 2026-12-02 | Bascule finale : retirer `LEGACY_STORAGE_BUCKET` et les miroirs | SUIVI 1.8 |
| 2026-12-07 | Revue des règles de transition et décision App Check | PLAN 12.7, ADR 0002 |
| 2026-12-16 | Supprimer le bucket US (après purge des orphelins) | SUIVI 1.9 (action irréversible de Yoss) |
| 2027-01-15 | Réévaluation d'`expo-updates` (au plus tôt à la fin de S13.5) | ADR 0003 |

---

## 10. Ce qui reste manuel (au 2026-11-07)

Le détail est dans SUIVI_ACTIONS.md (décisions D1 à D10) et dans PLAN_SPRINTS_AUDIT.md
(« Reste pour Yoss » du sprint 12). En résumé :

- création du projet staging et des environnements GitHub (ENVIRONMENTS §1 à §3) ;
- compte de service Google Play (Q9) et envoi Android automatique ;
- test de restauration des sauvegardes (section 3) ;
- alertes Sentry (4) et sauvegardes : vérification après les premiers événements ;
- relecture pédiatre des textes de santé (Q3), décision MDR (Q4) ;
- publication iOS et passage Play Alpha → Production (décisions de Yoss) ;
- index `eventLikes` à supprimer à la main (1.1 ci-dessus) ;
- domaine d'expédition des e-mails : l'adresse actuelle est `noreply@suivibaby.com` ;
  vérifier que ce domaine est vérifié dans Resend (le todo récap évoquait un autre
  domaine, bloquant à l'époque).
