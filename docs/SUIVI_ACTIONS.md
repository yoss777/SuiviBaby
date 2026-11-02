# Suivi des actions — échéances et contrôles

> Créé le 2026-11-01. **À relire chaque lundi.** Mettre à jour le statut et la
> date dès qu'une action avance ; ajouter toute nouvelle échéance ici.
>
> Statuts : ⏳ à faire · 🔄 en cours · ✅ fait · ⛔ bloqué

## 1. Migration des photos vers l'UE

Détail technique : [MIGRATION_PHOTOS_EU.md](MIGRATION_PHOTOS_EU.md).

| # | Action | Échéance | Qui | Prérequis | Contrôle | Statut |
|---|---|---|---|---|---|---|
| 1.1 | Bucket `samaye-53723-photos-eu` (europe-west1), règles, 7 fonctions, copie de 52 photos, 28 URL réécrites | 2026-11-01 | Claude | — | `node scripts/migratePhotosToEu.mjs` → « 0 à copier », « 0 URL à réécrire » | ✅ |
| 1.2 | Fusionner `feat/voice-bar-refonte` sur `main` | 2026-11-04 | Yoss | Tests de la barre vocale validés sur téléphone | CI verte sur `main` (lint, tsc, tests) | ✅ 2026-11-01 |
| 1.3 | Version **1.0.6** — iOS : `npm run release:ios` (cloud + envoi automatique App Store Connect) ; Android : `npm run release:android` (`.aab` local, ≥ 8 Go libres) | 2026-11-08 | Claude | 1.2 | Build EAS « finished » sur iOS et Android | ✅ iOS build 28 (cloud, envoyé sur App Store Connect) ; Android 9 (`.aab` local, signé `samaye-key`) |
| 1.4 | Publier la 1.0.6 : iOS → soumettre à la revue depuis App Store Connect (build 28 déjà envoyé) ; Android → importer `build-1793566274714.aab` dans Play Console | 2026-11-15 | Yoss | 1.3 | Version 1.0.6 « disponible » dans les deux consoles | ✅ 2026-11-02 : 1.0.6 en ligne sur l'App Store et Google Play |
| 1.5 | Contrôle hebdomadaire de la synchronisation US → UE | chaque lundi jusqu'à 1.9 | Claude ou Yoss | 1.1 | `node scripts/migratePhotosToEu.mjs` doit afficher « 0 à copier » ; sinon relancer avec `--apply` et vérifier les journaux de `mirrorLegacyPhotoUpload` | 🔄 |
| 1.6 | Imposer la mise à jour : `MIN_VERSION=1.0.6 node scripts/updateAppConfig.mjs` (`app_config/latest_version`) | 2026-12-15 | Yoss | 1.4 | Une app en 1.0.5 affiche l'écran « mise à jour obligatoire » | ✅ 2026-11-02 (avancé, décision Yoss) : minVersion 1.0.6 ; vérifier l'écran sur un appareil en 1.0.5 |
| 1.7 | Politique de confidentialité site + app : « photos stockées dans l'UE (europe-west1) », retirer le transfert US pour les photos | 2026-11-09 | Claude | 1.6 | `public/privacy.html` et `app/settings/privacy.tsx` ne mentionnent plus us-central1 | 🔄 textes modifiés le 2026-11-02 (v2.1) ; en ligne au déploiement du site (2.4) et au prochain build de l'app |
| 1.8 | Bascule finale : retirer `LEGACY_STORAGE_BUCKET` (app + fonctions), supprimer `mirrorLegacyPhotoUpload` / `mirrorLegacyPhotoDelete` | 2026-12-02 | Claude | 1.6 depuis 30 jours ; 1.5 à « 0 à copier » | Plus aucun accès au bucket US dans les journaux depuis 30 jours | ⏳ |
| 1.9 | Supprimer le bucket `samaye-53723.firebasestorage.app` (purger les ~12 orphelins avant) | 2026-12-16 | Yoss (action irréversible) | 1.8 | Bucket absent de la console ; photos visibles dans l'app | ⏳ |

## 2. Site web et mentions légales

| # | Action | Échéance | Qui | Prérequis | Contrôle | Statut |
|---|---|---|---|---|---|---|
| 2.1 | Téléphone de TESFA dans les mentions légales | 2026-11-08 | Yoss (fournir) / Claude (intégrer) | — | Plus de `[À COMPLÉTER]` téléphone dans `public/mentions-legales.html` | ✅ 2026-11-02 (+33 7 67 55 48 80) |
| 2.2 | **Adhérer à un médiateur de la consommation** (obligatoire pour vendre des abonnements) puis l'indiquer dans CGU + mentions | 2026-11-30 | Yoss | — | Nom, adresse, site du médiateur dans `public/terms.html` et `public/mentions-legales.html` | ⏳ |
| 2.3 | Compléter les 4 cases jaunes de `privacy.html` : DPO (→ D2), sauvegardes (→ D1), région Sentry (→ D3), non-entraînement des IA (→ D5) | 2026-11-30 | Yoss (décisions) / Claude (intégration) | Section 5 | `grep -c 'class="todo"' public/*.html` → 0 | ⏳ |
| 2.4 | Déployer le site : `firebase deploy --only hosting` | 2026-11-30 | Claude | 2.1 à 2.3, 2.5 | https://suivibaby.com affiche la nouvelle version ; pages légales sans surlignage jaune | ⏳ |
| 2.5 | Refaire les captures du site avec la **1.0.6** (barre vocale + `+` en bas) : accueil, timeline, écran vocal (proposition à confirmer) ; thème clair, profil **Léo** sans photo ; remplacer `public/assets/img/screens/*.webp` ; aligner la démo animée du hero sur la barre livrée (phase 3 de `VOICE_BAR_REFONTE.md`) | 2026-11-15 | Claude (captures sur le Samsung branché, app du Store 1.0.6) | 1.4 | Les images du site montrent la barre vocale ; démo du hero cohérente avec l'app | ⏳ |

## 3. Abonnements et RevenueCat

| # | Action | Échéance | Qui | Prérequis | Contrôle | Statut |
|---|---|---|---|---|---|---|
| 3.1 | Accès Premium promotionnel à vie pour `PTKG0fc5f6dhSEw8FAn0Bqiq6SJ3` dans RevenueCat (Firestore déjà Premium) | 2026-11-08 | Yoss | Client visible dans RevenueCat (ouvrir l'app connecté, ou accorder par App User ID) | L'écran Premium de ce compte affiche l'abonnement | ⏳ |
| 3.2 | Trancher l'offre **Famille** (limiter le partage Premium et réserver 5 comptes à Famille, ou fusionner Famille dans Premium) | 2026-11-30 | Yoss | — | Décision notée dans `docs/PREMIUM_OFFRE_CIBLE.md` | ⏳ |
| 3.3 | Courbes OMS et statistiques avancées : les réserver à Premium, ou les retirer des avantages Premium | 2026-11-30 | Yoss (décision) / Claude | 3.2 | Paywall, site et code cohérents | ⏳ |
| 3.4 | Vérifier la configuration de l'achat « à vie » (RevenueCat + stores) et de l'essai gratuit | 2026-11-30 | Yoss | — | Produits présents et actifs dans les deux stores | ⏳ |
| 3.5 | Tester « Restaurer mes achats » depuis un autre compte (achat sandbox) → message « abonnement lié à un autre compte » | à la 1.0.6 (test interne) | Yoss | 1.3 | Message affiché, abonnement resté sur le compte d'origine | ⏳ |

## 4. Données et conformité

| # | Action | Échéance | Qui | Prérequis | Contrôle | Statut |
|---|---|---|---|---|---|---|
| 4.1 | Vérifier que la suppression d'un **compte** efface les photos de ses enfants dans Storage (les deux buckets pendant la migration) | 2026-11-15 | Claude | — | Test sur un compte de test : plus aucun objet sous `children/{id}/` | ✅ corrigé et déployé le 2026-11-02 (`6ca9e03`) ; test sur un compte de test encore à faire |
| 4.2 | Enfants refusés par les règles (`Qd3RJtmHuafDAiUKgqQA`, `obhMXGzb8ooEcXdCbKID`) : vérifier s'il s'agit de suppressions en cours ou d'accès orphelins à nettoyer | 2026-11-15 | Claude | — | Plus d'avertissement « permission denied » au démarrage | ✅ 2026-11-02 : enfants inexistants, 2 entrées `user_child_access` orphelines supprimées (sauvegardées) |
| 4.3 | Désinstaller la version de développement `com.yoss7.samaye` du Samsung une fois les tests finis | fin des tests | Yoss | — | Seule l'app du Store reste installée | ⏳ |
| 4.4 | Vérifier le workflow « Deploy Cloud Functions » réparé : lancement manuel (`gh workflow run deploy-functions.yml`) — redéploie les 35 fonctions à l'identique | 2026-11-04 | Claude (feu vert Yoss) | — | Exécution verte dans GitHub Actions | ✅ 2026-11-02 : exécution verte de bout en bout au push `1a41925` (run 41400889208) — 35/35 fonctions mises à jour, dont les 7 planifiées |
| 4.5 | Passer `cleanupExpiredShareCodes` et `purgeDeletedChildren` en `europe-west1` (aujourd'hui `us-central1`, sans région explicite) pour que « fonctions serveur dans l'UE » soit exact | 2026-11-15 | Claude (feu vert Yoss) | — | `firebase functions:list` : plus aucune fonction en us-central1 hors miroirs (supprimés en 1.8) | ⏳ |

## 4 bis. Sécurité — audit ECC du 2026-11-02

| # | Action | Échéance | Qui | Dépend de | Contrôle | Statut |
|---|---|---|---|---|---|---|
| S1 | **Critique.** Règles Firestore : un membre pouvait se déclarer `owner` via une invitation ou un code de partage, réécrire une invitation (`childId`), un admin pouvait changer `ownerId` | immédiat | Claude | — | Tests de règles (`npm run test:rules`) : 126/126 | ✅ corrigé et déployé le 2026-11-02 |
| S2 | Contrôler en production qu'aucun accès `owner` ne diffère de `children.ownerId` (exploitation passée de S1) | 2026-11-04 | Claude (Yoss : `gcloud auth application-default login`) | S1 | Script d'audit en lecture seule : 0 suspect | ✅ 2026-11-02 : 6 accès owner, 1 seul ≠ `ownerId` (`LWZFCdDkjLymDv7I1E9O`, co-propriétaire ajouté par l'owner lui-même) → légitime |
| S3 | `functions/accessControl.js` (`canWriteEvents`) : le rôle n'est pas vérifié comme dans les règles | 2026-11-15 | Claude | — | Test unitaire viewer refusé | ✅ 2026-11-02 : `hasChildRole` strict pour le partage (`createShareInvitation`, quota de partage) ; un contributeur ne peut plus inviter. Écriture d'événements inchangée (`canWriteEvents`) |
| S4 | Activer App Check côté fonctions (`APPCHECK_ENFORCE=true`) après vérification des versions installées | 2026-11-30 | Claude (feu vert Yoss) | 1.0.6 majoritaire | Appels sans jeton refusés, aucune hausse d'erreurs Sentry | ⏳ |
| S5 | Invitations par e-mail : exiger un e-mail vérifié (`email_verified`) dans `acceptInvitationCF` et les règles | 2026-11-30 | Claude | décision sur la vérification à l'inscription | Compte non vérifié refusé | ⏳ |
| S6 | Limitation de débit des fonctions non transactionnelle (contournable en parallèle) | 2026-11-30 | Claude | — | Test de charge simple | ⏳ |
| S7 | Lancer les tests de règles dans le CI (`ci.yml`, émulateur) | 2026-11-15 | Claude | — | Job CI vert, échoue si une règle régresse | ✅ 2026-11-02 : job `rules-test` (émulateur, Java 21) ajouté à `ci.yml` ; à confirmer vert au prochain push |
| S8 | Premium coupé dès l'annulation au lieu de `expiresAt` ; ordre des événements du webhook RevenueCat non vérifié (`functions/index.js`) | 2026-11-15 | Claude | — | Tests du webhook | ✅ 2026-11-02 : Premium (voix, analyses) gardé jusqu'à `expiresAt` après annulation ou incident de paiement ; ordre des events basé sur `event_timestamp_ms` (`lastEventTimestampMs`) |
| S9 | Relecture ECC (2026-11-02) : index `user_child_access` falsifiable, bootstrap `ownerId` réutilisable pour se restaurer, propriétaire principal supprimable par un co-owner, codes de partage lisibles par un viewer et sans contrôle d'expiration, invitations créables en direct (contournait le quota) | immédiat | Claude | — | Tests de règles 133/133 | ✅ corrigé et déployé le 2026-11-02 |
| S10 | Changement de rôle : les droits d'écriture restaient en place (un viewer rétrogradé gardait `canWriteEvents`) | prochaine version de l'app | Claude | build 1.0.7 | Test `updateChildAccess` ; vérifier en prod les accès viewer avec `canWriteEvents: true` | 🔄 corrigé dans le code (`utils/permissions.ts`), à livrer |
| S11 | Webhook RevenueCat : types d'événements inconnus réécrivaient l'abonnement en « active » (tier possiblement free) ; remboursement gardait Premium ; période de grâce ignorée | avec le push | Claude | — | Tests webhook | 🔄 corrigé, à déployer (push) |
| S12 | `createShareInvitation` résolvait l'invité via `users.email` (modifiable par chacun) → via Firebase Auth | avec le push | Claude | — | Test dédié | 🔄 corrigé, à déployer (push) |
| S13 | Restes de la relecture : `acceptInvitationCF`/`redeemShareCodeCF` ne vérifient pas un enfant en suppression ; `findUserByEmail` lit encore `users.email` ; événements TRANSFER non gérés ; parrainage qui peut rétrograder un abonné Famille ; codes générés avec `Math.random` | 2026-11-30 | Claude | — | Tests dédiés | ⏳ |
| D11 | **Décision** : le rôle « Contributeur » est décrit « Peut liker et commenter uniquement » (permissions par défaut de l'app), mais les invitations et codes de partage créent les contributeurs avec `canWriteEvents: true` | — | Yoss | — | — | ⏳ à trancher |

## 5. Décisions en attente (questions détaillées)

> Chaque question indique le contexte, ce qui a été **vérifié** dans le projet
> (date de la vérification), les options, la recommandation et la réponse
> attendue. Répondre directement dans la conversation (« D1 : oui », etc.) ;
> la décision est ensuite reportée ici et dans l'action liée.

### D1 — Sauvegardes de la base de données ⚠️ prioritaire

- **Contexte.** La politique de confidentialité doit indiquer une durée de
  conservation des sauvegardes (case jaune « Sauvegardes » de `privacy.html`).
  Surtout, l'app conserve l'historique de santé des enfants : une perte serait
  définitive.
- **Constat (vérifié le 2026-11-02 par l'API Firestore / Storage).**
  - Firestore `(default)`, région eur3 : **aucune planification de sauvegarde,
    aucune sauvegarde existante**.
  - Récupération à un instant donné (PITR) : **désactivée** ; seules les versions
    de la dernière heure sont conservées (réglage par défaut).
  - Protection contre la suppression de la base : **désactivée**.
  - Storage (deux buckets) : corbeille (« soft delete ») de **7 jours** ; pas de
    versions d'objets.
- **Options.**
  1. Sauvegarde **quotidienne** conservée **7 jours** + protection contre la
     suppression. Coût : faible au volume actuel (facturation au stockage des
     sauvegardes). *Recommandé.*
  2. Sauvegarde quotidienne 7 jours + **hebdomadaire 30 jours** : plus de marge
     pour découvrir un problème tard ; coût un peu plus élevé ; texte RGPD
     « jusqu'à 30 jours ».
  3. Activer en plus le **PITR** (retour à n'importe quelle minute des 7 derniers
     jours) : le plus sûr, coût plus élevé.
  4. Ne rien activer : texte « aucune sauvegarde de la base ; les fichiers
     supprimés restent récupérables 7 jours » — risque de perte totale assumé.
- **Recommandation.** Option 1 (ou 2), protection contre la suppression dans
  tous les cas. Texte associé : « Sauvegardes : 7 jours glissants, puis
  effacement définitif ; fichiers supprimés récupérables 7 jours ».
- **Réponse attendue.** « D1 : option 1 » (ou 2, 3, 4). Claude active la
  planification (`gcloud firestore backups schedules create` ou API) et la
  protection, puis remplit la case jaune.

### D2 — Délégué à la protection des données (DPO)

- **Contexte.** Case jaune « Délégué à la protection des données » de
  `privacy.html`. Le RGPD (art. 37) impose un DPO quand l'activité principale
  consiste à traiter des données de santé **à grande échelle**.
- **Constat.** Petite base d'utilisateurs aujourd'hui ; données de santé
  d'enfants = catégorie sensible ; un contact dédié existe déjà
  (privacy@suivibaby.com).
- **Options.**
  1. « **Non désigné à ce jour** ; pour toute question : privacy@suivibaby.com ».
     *Recommandé à ce stade*, à revoir quand le nombre de familles augmente.
  2. Désigner un DPO interne (toi), déclaré à la CNIL.
  3. DPO externe mutualisé (prestataire, abonnement mensuel).
- **Réponse attendue.** « D2 : option 1 » (ou 2 avec le nom, ou 3 avec le
  prestataire).

### D3 — Sentry : région et fonctionnement en production

- **Contexte.** Case jaune « Sentry » de `privacy.html` (États-Unis ou UE) ; et
  savoir si le suivi des erreurs fonctionne réellement.
- **Constat (2026-11-02).** L'app lit `EXPO_PUBLIC_SENTRY_DSN`
  (`app/_layout.tsx`). Cette variable n'est ni dans le dépôt ni dans les
  variables EAS visibles ; le `.env` local est exclu des builds par
  `.easignore`. **Risque : Sentry ne reçoit rien en production** (DSN vide).
  Lecture des secrets bloquée par le garde-fou : à vérifier par toi.
- **À vérifier dans Sentry.**
  1. Des événements de la version **1.0.6** arrivent-ils (Issues / Releases) ?
  2. Région de l'organisation : Settings → Organization → **Data Storage
     Location** (US ou EU / Germany ; l'adresse DSN contient `ingest.de.sentry.io`
     pour l'UE).
- **Si rien n'arrive.** Ajouter le DSN dans les variables EAS (environnement
  production) et dans le build Android local, puis nouveau build.
- **Réponse attendue.** « D3 : région US/EU ; événements 1.0.6 oui/non ».

### D4 — Transcription vocale (AssemblyAI) en Europe

- **Contexte.** Aujourd'hui la commande vocale envoie l'audio au point d'accès
  américain `api.assemblyai.com` (constaté dans `functions/index.js`) ; la
  politique déclare donc AssemblyAI aux États-Unis.
- **Option.** AssemblyAI propose un point d'accès **européen**
  (`api.eu.assemblyai.com`). La bascule mettrait la transcription dans l'UE ; il
  ne resterait qu'Anthropic (interprétation du texte) aux États-Unis.
- **À vérifier.** Que ton compte AssemblyAI a accès à la région UE (et si une
  clé API distincte est nécessaire), et que les modèles utilisés y sont
  disponibles.
- **Recommandation.** Étudier puis basculer : changement limité aux Cloud
  Functions de transcription (URL + éventuellement clé), test, déploiement,
  mise à jour de la politique.
- **Réponse attendue.** « D4 : étudie » ou « D4 : non ».

### D5 — Non-utilisation des données pour entraîner les IA

- **Contexte.** Case jaune de `privacy.html` : la politique affirme que les
  prestataires d'IA n'utilisent pas les données pour entraîner leurs modèles,
  à confirmer.
- **À vérifier.**
  - **Anthropic** : conditions commerciales de l'API — par défaut, les données
    envoyées par l'API ne servent pas à l'entraînement (à confirmer sur ton
    compte / contrat, et l'éventuelle rétention de sécurité de 30 jours).
  - **AssemblyAI** : réglages du compte et conditions (option d'opt-out de
    l'amélioration des modèles, durée de rétention des transcriptions ;
    l'app supprime déjà la transcription après traitement).
- **Réponse attendue.** « D5 : Anthropic ok, AssemblyAI ok/opt-out activé » —
  Claude adapte alors le texte (ou le nuance si un point n'est pas garanti).

### D6 — Médiateur de la consommation (→ action 2.2)

- **Obligation.** Code de la consommation, art. L.612-1 : médiation gratuite
  pour le consommateur ; coordonnées à afficher (CGU, mentions légales) ;
  amende jusqu'à 15 000 € pour une société (art. L.641-1).
- **Comment.** Choisir un médiateur référencé par la CECMC (liste sur
  economie.gouv.fr), adhérer (abonnement annuel, parfois coût par dossier),
  transmettre nom + adresse + site.
- **Exemples généralistes avec saisine en ligne.** CM2C, MEDICYS, CNPM
  Médiation Consommation, Médiation Net Consommateurs.
- **Réponse attendue.** Nom, adresse postale et site du médiateur choisi.

### D7 — Offre Famille (→ action 3.2)

- **Constat.** Côté serveur, Famille donne exactement les mêmes droits que
  Premium (partage illimité pour les deux ; la limite « 5 comptes » n'est
  appliquée nulle part — `functions/index.js`, `FREE_MAX_SHARED_USERS`).
- **Options.** (a) Limiter le partage Premium (ex. 3 personnes) et réserver
  5 comptes à Famille, appliqué côté serveur ; (b) fusionner Famille dans
  Premium et retirer l'offre.
- **Réponse attendue.** « D7 : a » (avec la limite Premium souhaitée) ou « D7 : b ».

### D8 — Courbes OMS et statistiques avancées (→ action 3.3)

- **Constat.** Présentées comme Premium (paywall, site) mais accessibles à tous
  dans le code.
- **Options.** (a) Les réserver réellement à Premium (gating dans l'app) ;
  (b) les laisser gratuites et les retirer des avantages Premium affichés.
- **Réponse attendue.** « D8 : a » ou « D8 : b ».

### D9 — Fonctions planifiées en `us-central1` (→ action 4.5)

- **Constat.** `cleanupExpiredShareCodes` et `purgeDeletedChildren` tournent en
  `us-central1` (pas de région explicite) alors que la politique dit « fonctions
  serveur dans l'UE ».
- **Proposition.** Ajouter `region: "europe-west1"`, déployer (Firebase
  supprime l'ancienne fonction américaine et crée la nouvelle ; tâche de
  nettoyage, sans impact utilisateur).
- **Réponse attendue.** « D9 : go ».

### D10 — Vérification finale du workflow de déploiement (→ action 4.4) ✅ réglé

- **Résolu le 2026-11-02.** Le push `1a41925` a déclenché le workflow, vert de
  bout en bout (35/35 fonctions, Cloud Scheduler compris). Plus rien à lancer.


- **Constat.** Le CI déploie désormais les fonctions ; le rôle Cloud Scheduler
  manquant a été ajouté. Il reste à constater une exécution verte de bout en bout.
- **Action.** Lancer `gh workflow run deploy-functions.yml --ref main`
  (redéploie les 35 fonctions à l'identique) — bloqué pour Claude par le
  garde-fou : à lancer par toi (`! gh workflow run …`), Claude surveille.
- **Réponse attendue.** Lancer la commande, ou « D10 : plus tard ».

## Historique

| Date | Action |
|---|---|
| 2026-11-01 | Bucket UE créé ; règles Storage et 7 fonctions déployées ; 52 photos copiées ; 28 URL réécrites ; miroir testé |
| 2026-11-01 | Comptes `PcpPyt8mWHRxAQDt8Xgmfux65bB2` (RevenueCat + Firestore) et `PTKG0fc5f6dhSEw8FAn0Bqiq6SJ3` (Firestore) passés Premium |
| 2026-11-01 | RevenueCat : comportement de restauration réglé sur « Keep with original App User ID » |
| 2026-11-01 | Branche `feat/voice-bar-refonte` fusionnée sur `main` (CI verte) ; workflow de déploiement des fonctions réparé (en échec depuis mai 2026) |
| 2026-11-01 | Version 1.0.6 : builds EAS de production lancés — Android `0b6308c0-1c82-4bf4-bfde-cbbeddcf32cd`, iOS `058dd2a8-25e3-4580-9aab-806929c3331a` |
| 2026-11-01 | Builds 27/8 en échec (yarn.lock parasite, fichier Firebase iOS absent, cache d'autolinking local, apostrophes de la CSP dans firebase.json) — corrigés ; iOS 1.0.6 build 28 terminé (`af2a1170-4111-4b04-b175-5bcc3a4141ff`) |
| 2026-11-01 | iOS build 28 envoyé sur App Store Connect (`eas submit`) ; Android `.aab` versionCode 9 compilé en local, signature vérifiée (SHA-1 AB:65:66:08…) |
| 2026-11-02 | 1.0.6 : iOS build 28 dans TestFlight ; Android en analyse chez Google. Contrôle photos US→UE : 0 à copier. 4.2 réglé ; 4.1 corrigé dans le code |
| 2026-11-02 | **1.0.6 en ligne sur les deux stores.** Début de la période de transition (1.6 : imposer la 1.0.6 vers le 2026-12-15, selon l'adoption) |
| 2026-11-02 | `app_config/latest_version` : latestVersion 1.0.6 (invitation à mettre à jour), minVersion 1.0.0, lien App Store corrigé (id6773195663) |
| 2026-11-02 | **Mise à jour forcée** : minVersion 1.0.6 (écrit à 05:42 UTC). Calendrier avancé : 1.7 au 9 nov., 1.8 au 2 déc., 1.9 au 16 déc. |
| 2026-11-02 | Vérifications : aucune sauvegarde Firestore (PITR et protection désactivés), corbeille Storage 7 j, AssemblyAI en US, DSN Sentry introuvable dans les builds → questions D1 à D10 (section 5) |
