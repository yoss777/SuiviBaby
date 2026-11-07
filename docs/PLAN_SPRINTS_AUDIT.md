# Plan des sprints — corrections de l'audit du 2026-11-05

> Source : [AUDIT_COMPLET_2026-11.md](AUDIT_COMPLET_2026-11.md). Suivi :
> [SUIVI_ACTIONS.md](SUIVI_ACTIONS.md) (section 4 quater pour les P0).
> Démarré le 2026-11-06. Cocher chaque tâche, noter la date et le commit.
>
> Statuts : ⏳ à faire · 🔄 en cours · ✅ fait · ⛔ bloqué

## Règles de fonctionnement

- **Un sprint ≈ 1 semaine**, une branche et une PR par sprint, fusion sur
  `main` après CI vert.
- **Tests d'abord** pour chaque correction de bug (test qui échoue, puis
  correctif), comme pour les statistiques.
- **Revue ECC tous les 2 sprints** (relecteurs indépendants, en lecture seule),
  corrections avant de continuer.
- **Ce qui part où** : les sprints marqués « serveur » se déploient avec la CI
  (`deploy-functions.yml` à la fusion) ; ceux marqués « app » partent dans la
  version mobile suivante (« déploie ») ; « site » au prochain
  `firebase deploy --only hosting`.
- **Ordre** : d'abord ce qui fait perdre de l'argent ou des données et ce qui
  engage la responsabilité (S1 à S5), puis la fiabilité et le confort
  (S6 à S10), puis la dette (S11 à S13).

## Décisions à prendre (Yoss) avant ou pendant les sprints

| # | Décision | Sprint | Proposition |
|---|---|---|---|
| Q1 | Créer le DSN Sentry et fixer la région (lié à D3) | S2 | Projet Sentry région UE, DSN en variable EAS production |
| Q2 | `gcloud auth login` pour les sauvegardes, alertes et budget (lié à D1) | S2 | 30 min ensemble |
| Q3 | Relecture des textes de santé par un pédiatre | S5 | Envoyer les textes réécrits ; S5 code prêt avant |
| Q4 | Position « dispositif médical » (MDR) des alertes santé | S5 | Garder des alertes d'orientation (« consultez »), aucune interprétation ; avis juridique si doute |
| Q5 | Contenu du récap hebdomadaire par e-mail | S3 | Plus de chiffres de santé dans l'e-mail, un lien vers l'app ; owner et admin seulement |
| Q6 | Accès en lecture des contributeurs aux événements (D11 dit « photos seulement ») | S4 | Aligner les règles sur D11 |
| Q7 | Offre Famille, courbes OMS, statistiques avancées (déjà 3.2 / 3.3) | S10 | **Tranché 2026-11-07 (Yoss)** : courbes OMS et statistiques avancées gratuites, retirées des avantages Premium ; offre Famille supprimée, Premium seule offre payante (produits Famille laissés dans les stores mais non proposés) |
| Q8 | Projet Firebase de staging (coût, nom) | S12 | `samaye-staging`, plan Blaze avec budget plafonné |
| Q9 | Compte de service Google Play pour automatiser l'envoi Android | S12 | Oui, piste Alpha seulement |

---

## S1 — Ne plus perdre d'argent ni de données · serveur · P0 A1 A2 A3 · ✅ 2026-11-06 (en attente de revue S1+S2 et de déploiement)

But : aucun paiement perdu, plus de Premium gratuit par le parrainage, une
suppression de compte complète et honnête.

User stories :
- En tant qu'abonné, je veux que mon paiement soit pris en compte même si le
  serveur a un incident, afin de ne pas perdre ce que j'ai payé.
- En tant que propriétaire de l'app, je veux qu'un code de parrainage ne serve
  qu'une fois par compte, afin que Premium reste payant.
- En tant que parent qui supprime son compte, je veux que toutes mes données
  disparaissent et ne recevoir la confirmation qu'une fois que c'est vrai.

- [x] **1.1** Webhook RevenueCat : marqueur anti-doublon créé dans la
  transaction qui écrit `subscriptions/{uid}` (ou supprimé si le traitement
  échoue avant la réponse 5xx) ; `webhook_logs.add` non bloquant ; erreurs de
  `getUser` autres que `user-not-found` propagées ; validation de
  `app_user_id` (`^[A-Za-z0-9]{1,128}$`). Test : transaction en échec puis
  retry → abonnement appliqué. (`functions/index.js:2800-2960`)
- [x] **1.2** Parrainage : règles `user_promos` qui interdisent au client
  d'écrire `referredBy`, `referralCode`, `referralCount` ; usage tracé dans
  `referrals/{filleulUid}` créé dans une transaction (refus s'il existe) ;
  code généré côté serveur (`crypto.randomBytes`) ; plafond de récompenses
  par parrain. Tests de règles + test de la fonction (2ᵉ usage refusé même
  après effacement de `referredBy`). (`firestore.rules:499`,
  `functions/index.js:3466-3560`, `services/promoService.ts:198`)
- [x] **1.3** `purgeUserData(uid)` unique, utilisée par
  `processScheduledDeletions` et `deleteUserAccount` : toutes les collections
  (dont `subscriptions`, `user_promos`, `referrals` ×2, `user_content`,
  `webhook_logs`, `user_hidden_photos`, `voice_transcribe_cache`,
  `pending_assemblyai_deletes`, `childDeletionRequests`, `reports` par
  `reporterUid`) ; test qui compare la liste purgée à la liste des
  collections. (`functions/index.js:2600-2726`, `:3874-3935`)
- [x] **1.4** Ordre sûr : photos d'abord (échecs mis en file de reprise,
  comme `pending_assemblyai_deletes`), événements ensuite ; suppression Auth
  en dernier ; si Auth échoue (hors `user-not-found`), garder
  `pendingDeletion` + `deletionFailedAt` pour la reprise et ne pas envoyer
  l'e-mail ; e-mail seulement après succès.
- [x] **1.5** Événements saisis par le parent supprimé dans un dossier
  partagé : anonymisés (`userId: "deleted"`) au lieu d'être effacés, pour que
  l'autre parent garde vaccins et températures.
- [x] **1.6** Tests manquants du cycle de suppression d'enfant :
  `createDeletionRequest`, `voteDeletionRequest`, `cancelChildDeletion`,
  `purgeDeletedChildren` (quorum, annulation, délai de grâce, pas de purge
  d'un enfant annulé). Purge de `recap_history` et `notification_history`
  par `childId`.

Contrôle : `npm --prefix functions test` vert avec les nouveaux tests ;
déploiement des fonctions ; un achat sandbox puis un renouvellement visibles
dans `subscriptions/`.

_Bilan 2026-11-06 (branche `sprint-1/argent-donnees`) :_
- _1.1 : marqueur anti-doublon lu et créé dans la transaction de
  l'abonnement ; 500 (nouvel essai) si la transaction ou la lecture Auth
  échoue ; `app_user_id` validé ; journal d'audit non bloquant. 5 tests._
- _1.2 : codes générés par le serveur (`ensureReferralCode`,
  `referral_codes/{code}`), anciens codes repris s'ils sont libres ; un seul
  parrainage par compte (`referrals/{filleulUid}` créé en transaction, anciens
  parrainages détectés) ; e-mail vérifié exigé ; 10 récompenses maximum par
  parrain ; règles : le client ne peut plus écrire les champs de parrainage.
  11 tests + 5 tests de règles. L'app (`promoService`) demande son code au
  serveur ; les anciennes versions ne peuvent plus créer de code (pas de carte
  parrainage pour un nouveau compte tant qu'il n'a pas mis à jour)._
- _1.3-1.5 : `purgeUserData` unique pour les deux parcours ; liste des
  collections dans `functions/lib/userPurge.js` + test qui échoue si une
  collection (app, fonctions ou règles) n'est ni purgée ni justifiée ; photos
  d'abord (un échec arrête tout et la tâche réessaie), Auth puis
  `users/{uid}` en dernier, e-mail seulement après succès, échec noté dans
  `pendingDeletion.lastFailure` ; événements des dossiers partagés anonymisés
  (`deleted-user`, photos retirées) ; `reports` et `referral_codes` ajoutés.
  7 tests._
- _1.6 : vote de suppression transactionnel ; la purge revérifie la demande et
  l'enfant juste avant de supprimer ; `recap_history`, `notification_history`,
  `croissances`, `sommeils` purgés avec l'enfant ; photos d'un enfant : un
  échec garde la demande pour un nouvel essai. 10 tests._
- _Fonctions : 234 tests (207 avant) ; règles : 138 ; app : 568._

## S2 — Voir ce qui se passe · serveur + app · P0 A6 A7 · 🔄 code fait le 2026-11-06, reste Q1/Q2 avec Yoss

But : être prévenu des erreurs et des incidents, pouvoir restaurer les
données.

User story : en tant que propriétaire de l'app, je veux être alerté d'un crash
ou d'une fonction en échec et pouvoir restaurer la base, afin de réagir avant
les utilisateurs.

- [x] **2.1** Sentry, filtrage d'abord : `beforeBreadcrumb` (supprime la
  catégorie `console` et les corps HTTP), `beforeSend` (retire e-mail, prénom,
  transcriptions), `sendDefaultPii: false` explicite. Test unitaire des
  filtres. (`app/_layout.tsx:34-47`)
- [ ] **2.2** Sentry, activation : DSN en variable EAS production (Q1) et pour
  le build Android local ; source maps en production (`SENTRY_AUTH_TOKEN` en
  secret EAS, retirer `SENTRY_DISABLE_AUTO_UPLOAD` du profil production) ;
  `release`/`dist` depuis la version et le numéro de build. Contrôle : un
  événement de test reçu, sans donnée de santé.
- [ ] **2.3** Sauvegardes Firestore : quotidienne (7 j) + hebdomadaire (30 j),
  protection contre la suppression, procédure de restauration écrite et testée
  dans un projet jetable (Q2, D1).
- [ ] **2.4** Alertes Cloud Monitoring : erreurs par fonction, échecs des
  tâches planifiées (suppressions, rappels, récap), 5xx du webhook ; budget
  GCP avec seuils ; les 4 alertes Sentry de `FIREBASE_MONITORING.md` ;
  corriger le runbook (`eas update --rollback` et `functions:config:set`
  faux).
- [x] **2.5** Journaux serveur sans données personnelles : e-mails et prénoms
  remplacés par des identifiants (`functions/index.js:3933`, `:4395-4433`) ;
  plus de réponse Resend complète dans les logs.
- [x] **2.6** `release.yml` : retirer le déclenchement par tag `v*` (cassé et
  dangereux) en attendant S12.
- [x] **2.7** Région : `setGlobalOptions({ region: "europe-west1" })` en tête
  de `functions/index.js` (règle 4.5 / D9 pour `cleanupExpiredShareCodes` et
  `purgeDeletedChildren`), miroirs US gardés jusqu'à 1.8.

Contrôle : alerte de test reçue par e-mail ; sauvegarde visible dans la
console ; événement Sentry de test.

_Bilan 2026-11-06 (branche `sprint-2/observabilite`) : filtres Sentry
(`utils/sentryFilters.ts`, 5 tests) branchés dans `Sentry.init` ; journaux des
fonctions sans e-mails ni prénoms, erreurs Resend du récap remontées ;
`setGlobalOptions({ region: "europe-west1" })` et déploiement CI en `--force`
(les deux tâches planifiées passent en Europe au prochain déploiement) ;
`release.yml` en lancement manuel ; runbook corrigé et procédures écrites
(`docs/FIREBASE_MONITORING.md` §9) ; profil EAS `production` lié à
l'environnement `production`. **Reste avec Yoss** : 2.2 (DSN Sentry et jeton
d'envoi des source maps dans EAS, Q1), 2.3 et 2.4 (sauvegardes, alertes,
budget : commandes prêtes, `gcloud auth login` nécessaire, Q2)._

_Suite 2026-11-06 (Q1, Q2 réglés) :_
- _2.2 : Sentry en région UE (`ingest.de.sentry.io`) ; `EXPO_PUBLIC_SENTRY_DSN`
  et `SENTRY_AUTH_TOKEN` (secret, jeton d'organisation) dans l'environnement
  EAS `production` et dans le `.env` local (build Android) ;
  `SENTRY_DISABLE_AUTO_UPLOAD` retiré du profil `production` (PR #14) ;
  `release`/`dist` posés par le SDK natif. Ancien jeton inutilisé révoqué.
  **Reste** : événement de test reçu après la prochaine version._
- _2.3 : planning quotidien (7 j) et hebdomadaire le dimanche (30 j) sur
  `(default)` (eur3) ; protection contre la suppression activée ; PITR non
  activé. **Reste** : test de restauration dans une base séparée dès la
  première sauvegarde (planning créé le 2026-11-06 à 00:18 UTC)._
- _2.4 : métriques de journaux `functions_errors`, `webhook_5xx`,
  `scheduled_job_failures` ; 3 alertes (> 0 sur 15 min) vers un canal e-mail ;
  budget GCP de 25 €/mois (facture d'octobre : 10,37 €) avec seuils 50, 90,
  100 % et dépense prévue 100 %. **Reste** : les 4 alertes Sentry
  (`FIREBASE_MONITORING.md` §6.2), à créer dans Sentry une fois les premiers
  événements reçus._

**Revue ECC (S1 + S2)** : `security-reviewer`, `silent-failure-hunter`.

### Revue ECC des sprints 1 et 2 (2026-11-06) · ✅

`ecc:security-reviewer` et `ecc:silent-failure-hunter`. Corrigé :

- **Critique** : une relance de la purge après interruption pouvait supprimer
  un enfant encore utilisé par l'autre parent (`size <= 1` sans vérifier qui
  restait). Désormais : enfant supprimé seulement si le compte en est le seul
  membre ; document de l'enfant supprimé en premier ; transfert de propriété
  seulement si le compte est encore le propriétaire enregistré. Test de
  relance ajouté.
- Photos : seuls les chemins sous `children/{childId de l'événement}/` sont
  supprimés (les chemins viennent du client) ; chaque bucket est traité même
  si l'autre échoue ; échec de la suppression douce signalé en erreur.
- Purge : compte désactivé et sessions révoquées avant tout ; compteur
  d'échecs et libellé `STUCK` au 3ᵉ échec (alerte) ; échec d'écriture de la
  cause journalisé ; e-mail de confirmation : erreurs Resend vérifiées,
  adresse conservée dans `pendingDeletion.email` à la demande.
- Suppression d'enfant : une approbation dont la suppression douce a échoué
  est reprise par la tâche quotidienne ; la purge réserve la demande en
  transaction (`purging`) et l'annulation se fait en transaction.
- Webhook : `event.id`, type de `app_user_id` et date d'expiration validés ;
  événement hors délai journalisé en erreur.
- Parrainage : état d'abonnement relu dans la transaction ; ancien code
  partagé par deux comptes refusé ; ancien code au format invalide remplacé.
- App : `trackImpression` / `dismissPromo` en `merge` ; un seul appel
  `ensureReferralCode` à la fois, pas de rafale après un échec.
- Sentry : données trop profondes tronquées, tags filtrés, transactions et
  spans filtrés (`beforeSendTransaction`), clés de santé ajoutées.

Reportés (sprints suivants) : enfants sans entrée d'index ou suppression
simultanée des deux parents (job de ramasse-miettes, S12) ; champs
`ownerVotes` / `seenByUserIds` d'autres demandes (S3) ; robustesse du récap
hebdomadaire (S3, tâche 3.5) ; limiter l'abus du parrainage par création de
comptes (App Check, S13 / S4) ; fidélité de la base de test en mémoire
(atomicité, `update` sur document absent) à améliorer avec les tests sur
émulateur (S11).

## S3 — Droits des utilisateurs (RGPD) · app + serveur · P0 A4 · ✅ 2026-11-06 (PR en attente)

But : chaque utilisateur, quel que soit son mode de connexion, donne son
consentement santé, peut récupérer et supprimer ses données.

User stories :
- En tant que parent connecté avec Apple ou Google, je veux pouvoir supprimer
  mon compte depuis l'app, sans mot de passe que je n'ai pas.
- En tant que parent, je veux donner mon consentement aux données de santé
  quel que soit mon mode d'inscription, en sachant exactement ce qui est
  collecté.
- En tant que parent, je veux exporter toutes mes données gratuitement, autant
  de fois que nécessaire.

- [x] **3.1** Écran de consentement santé bloquant après connexion sociale et
  au démarrage pour les comptes existants sans consentement ; texte complet
  (symptômes, médicaments, vaccins, photos, transferts hors UE).
- [x] **3.2** Preuve de consentement côté serveur : collection en ajout seul
  (fonction), version de la politique, conservation selon la politique.
- [x] **3.3** Suppression de compte par ré-authentification selon le
  fournisseur (`GoogleAuthProvider`, `OAuthProvider('apple.com')`) ;
  révocation du jeton Sign in with Apple côté serveur
  (`appleid.apple.com/auth/revoke`). (`services/accountDeletionService.ts:61`,
  `app/(drawer)/settings.tsx:806-850`)
- [x] **3.4** Export JSON gratuit et illimité (limite de débit seulement) ;
  PDF reste Premium. (`app/settings/export.tsx:765`, `functions/index.js:33`)
- [x] **3.5** Récap hebdomadaire (Q5) : adresse de Firebase Auth (vérifiée),
  owner et admin seulement, arrêt pendant `pendingDeletion`, en-tête
  `List-Unsubscribe`, contenu sans chiffres de santé si validé.
  (`functions/index.js:4326-4417`)
- [x] **3.6** Transfert de propriété : `owner` prioritaire, jamais de lecteur
  ou contributeur promu automatiquement ; sans co-owner ni admin, demander un
  choix avant de programmer la suppression ; décrire ce transfert dans
  `delete-account.html`. (`functions/index.js:484-514`)

## S4 — Données sur l'appareil, voix et sécurité restante · app + serveur · ✅ 2026-11-06 (PR en attente)

But : ne rien laisser traîner (appareil, journaux, prestataires) et fermer les
derniers points de sécurité.

- [x] **4.1** Audio de commande vocale supprimé après transcription
  (`finally` + `deleteAsync`) ; corriger « l'audio n'est jamais stocké ».
  (`services/voice/recorder.ts`)
- [x] **4.2** Politique de confidentialité (app + site) : prénom transmis à
  Anthropic dans la transcription (ou remplacé par un jeton avant envoi),
  cache supprimé sous 24 h (TTL) ou suppression explicite, information au
  moment d'utiliser la voix ; transcriptions AssemblyAI abandonnées signalées.
- [x] **4.3** Exports écrits dans `cacheDirectory` et supprimés après le
  partage ; `offlineQueueService.onAccountDelete()` appelé à la demande de
  suppression ; règles de sauvegarde Android excluant AsyncStorage, SQLite et
  les exports (ou `allowBackup=false`).
- [x] **4.4** Signalements : `escapeHtml` sur tous les champs des e-mails
  opérateur et de résolution ; `childId`/`eventId` validés ; `photoPath`
  limité à `children/{childId}/` et présent dans `event.photos` ; même
  vérification dans `deleteUserEventPhotos` et `photoRefToPath`.
- [x] **4.5** `createShareInvitation` : limite de débit, `childName` lu dans
  `children/{id}`, réponse neutre si l'e-mail n'a pas de compte.
- [x] **4.6** `setAdminClaim` : `email_verified` exigé, bootstrap désactivé
  après le premier admin.
- [x] **4.7** Lien de réinitialisation Android : `/.well-known/assetlinks.json`
  + App Links vérifiés ; `oobCode` validé par expression régulière dans l'app.
- [x] **4.8** Règles `events`/`eventComments` : champs modifiables limités
  (`affectedKeys`), `childId`/`eventId` figés, contributeurs alignés sur D11
  (Q6) ; `validateAndUpdateEvent` interdit `createdAt` et `reported`.
- [x] **4.9** Supprimer les fonctions inutilisées : `generateAiInsight`,
  `migrateUsersPublicRemoveEmail`, `grandfatherExistingUsers` si terminée ;
  `npm audit fix` et montée de `firebase-admin` / `firebase-functions` dans
  `functions/`.
- [x] **4.10** S5 (`email_verified` pour invitations et codes) et S14
  (TRANSFER) traités ici s'ils ne l'ont pas été dans le chantier abonnements.

**Revue ECC (S3 + S4)** : `healthcare-reviewer`, `security-reviewer` · ✅ 2026-11-06

Décisions de Yoss : récap sans chiffres de santé (Q5) ; contributeur = lecture
de tous les événements, écriture limitée aux j'aime et commentaires des photos
(Q6) ; transfert de propriété dès la demande de suppression ; rapport PDF
réservé à Premium et Famille (un essai gratuit), export JSON gratuit.

Corrigé après revue :
- `transferAndLeave` en transaction, seul le propriétaire principal transfère
  (un co-owner pouvait évincer le propriétaire).
- Suppression de compte par fonction serveur (connexion récente exigée, date
  calculée côté serveur, jetons push supprimés) ; règle de transition pour
  1.0.8 : `pendingDeletion` ≥ 29 jours.
- Enfant jamais laissé sans responsable : choix « Supprimer le suivi » par
  défaut, avertissement avant de confier à un contributeur ou lecteur,
  suppression douce côté serveur à défaut de co-owner ou admin.
- Retrait du consentement (Réglages et écran de consentement, suppression
  accessible depuis cet écran) ; rappels et récap coupés sans consentement ou
  pendant une suppression ; texte de consentement v2.2.
- Accès et index créés par le serveur seulement ; réponses neutres des
  invitations ; `findUserByEmail` supprimé ; Storage par rôle.
- AssemblyAI : suppression toujours tentée puis mise en file ; TTL 90 jours
  sur les historiques techniques (script de rattrapage à lancer).
- Export JSON complet pour owner/admin ; révocation Apple retentée.
- Bugs trouvés en production : la purge lisait le rôle dans l'index
  (transfert jamais exécuté) ; demandes de suppression d'enfant effacées avec
  le compte (enfant jamais purgé).

Reportés : endpoint UE d'AssemblyAI et suppression des téléversements sans
transcription (S12) ; exclusion iCloud de la file hors-ligne SQLite (module
natif, S13) ; création des codes de partage par le client (S12) ; fin de la
règle de transition 1.0 (après adoption de la version suivante).

## S5 — Messages de santé sûrs · app (+ contenu) · P0 A5 · 🔄 code fait le 2026-11-06 (revue clinique incluse), reste la relecture pédiatre (Q3)

But : aucun message de l'app ne rassure à tort ni n'encourage un couchage à
risque.

User stories :
- En tant que parent d'un bébé de moins de 3 mois, je veux être alerté
  clairement dès que je saisis une température ≥ 38 °C, afin de consulter en
  urgence.
- En tant que parent, je veux des conseils de sommeil conformes aux
  recommandations françaises.

- [x] **5.1** Alerte à la saisie d'une température, selon l'âge :
  < 3 mois et ≥ 38 °C → modale non masquable « consultez en urgence /
  appelez le 15 » ; 3 à 6 mois → consultation rapide ; < 36 °C → alerte
  hypothermie ; signes de gravité affichés. (`alertForTemperature` dans
  `components/forms/SoinsForm.tsx`, `temperatureAlertInsights` dans
  `services/insightEngine.ts`, décision dans `utils/temperatureAlert.ts`)
- [x] **5.2** Conseil « fièvre » des insights : âge pris en compte, non
  masquable pour les moins de 3 mois.
- [x] **5.3** Retirer « C'est normal » du conseil fièvre et appétit.
  (`feverAppetiteCorrelation` dans `services/correlationService.ts`)
- [x] **5.4** « Meilleur endroit » limité au lit ; rappel de couchage sûr si
  siestes fréquentes en voiture, poussette ou cododo. (`sommeilInsights` dans
  `services/insightEngine.ts`)
- [x] **5.5** Fiche cododo réécrite (même chambre, pas le même lit avant
  4-6 mois) ; fiche fièvre complétée (« appelez le 15 ») ; coquille « Évry » ;
  vérifier que la collection `tips` en production correspond au seed
  (`node scripts/compareTipsWithSeed.mjs`, lecture seule).
- [x] **5.6** Bornes de température identiques dans le formulaire et le
  serveur (34-43) ; courbes OMS qui ne disparaissent plus au-delà de
  731 jours.
- [ ] **5.7** Relecture pédiatre (Q3) et décision MDR (Q4) notées ici avant la
  version.

Contrôle : tests unitaires des seuils par âge ; textes validés.

### Notes de réalisation S5

Code livré dans le commit `ae0b5a3` (« feat(health): safe health messages
(S5) »), présent dans la branche `sprint-6/fiabilite` ; la revue clinique
ci-dessous est faite dans le répertoire de travail de cette branche (rien de
commité par l'agent, rien de déployé, rien écrit en production). Reste à faire avant la version : relecture pédiatre (Q3)
et, pour la fiche `tips`, lancer `node scripts/compareTipsWithSeed.mjs` puis
re-semer (`seedViaFirestore.mjs`) sur accord du propriétaire.

**Décision dispositif médical (Q4), prise par le propriétaire.** Les messages
de santé sont de l'ORIENTATION uniquement (« consultez », « appelez le 15 »).
Ils ne contiennent ni diagnostic, ni interprétation, ni formule rassurante du
type « c'est normal ». Les seuils suivent les repères publics français (HAS,
Santé publique France, ameli.fr). Le seuil « < 36 °C » vient du plan S5 et n'a
pas de source officielle française vérifiée : il reste signalé « à valider »
dans le code et dans la liste pédiatre.

**Seuils (`utils/temperatureAlert.ts`, source commentée à côté de chaque seuil)**
- fièvre : ≥ 38 °C ; température basse : < 36 °C (tout âge, non masquable avant
  3 mois ou si l'âge est inconnu) ;
- moins de 3 mois = date de la mesure avant le jour du 3e anniversaire mensuel
  de la naissance (mois calendaires ; fin de mois ramenée au dernier jour : né le
  31 janvier, 3 mois = 30 avril) : ≥ 38 °C, modale non masquable ;
- 3 à 6 mois = du 3e au 6e anniversaire mensuel exclu : ≥ 38 °C, consultation rapide ;
- 6 mois et plus : message de fièvre générique ; date de naissance inconnue :
  message générique qui couvre le cas « moins de 3 mois », alerte non masquable
  (jamais « normal »).

**Textes de santé modifiés (à relire par un pédiatre, Q3)**

Alerte de température (saisie, `SoinsForm`, voix) et insight « Température
élevée enregistrée » / « Température basse enregistrée » (`{prénom} : ` précède
le message dans l'insight). Textes à jour (revue clinique du 2026-11-06) ; chaque
message est suivi de « Appelez le 15 sans attendre si : difficultés à respirer,
peau pâle, grise ou marbrée, bébé mou, très difficile à réveiller ou qui gémit,
fontanelle bombée ou nuque raide, signes de déshydratation (moins de couches
mouillées, refus de boire), vomissements répétés, éruption qui ne s'efface pas à
la pression, pleurs inhabituels, convulsions. » (source : ameli.fr, « La fièvre
de l'enfant »). Chaque palier contient « Si un des signes ci-dessous apparaît,
appelez le 15. » :
- moins de 3 mois, titre « Température élevée », non masquable, boutons
  « J'ai compris » et « Appeler le 15 » (`tel:15`) : « Température de {T} °C
  chez un bébé de moins de 3 mois. Consultez en urgence un médecin ou appelez
  le 15. Si un des signes ci-dessous apparaît, appelez le 15. »
- 3 à 6 mois : « Température de {T} °C chez un bébé de 3 à 6 mois : consultez
  rapidement un médecin. Si un des signes ci-dessous apparaît, appelez le 15.
  En cas de doute, appelez le 15. »
- 6 mois et plus : « Température de {T} °C. Consultez un médecin si la fièvre
  persiste. Si un des signes ci-dessous apparaît, appelez le 15. En cas de
  doute, appelez le 15. »
- âge inconnu, non masquable : « Température de {T} °C. L'âge de l'enfant n'est
  pas renseigné : s'il a moins de 3 mois, consultez en urgence un médecin ou
  appelez le 15. Sinon, consultez un médecin si la fièvre persiste. Si un des
  signes ci-dessous apparaît, appelez le 15. »
- hypothermie, titre « Température basse », 3 mois et plus : « Température de
  {T} °C, inférieure à 36 °C. Appelez un médecin ou le 15. Si un des signes
  ci-dessous apparaît, appelez le 15. » ; moins de 3 mois (non masquable) : « …,
  inférieure à 36 °C chez un bébé de moins de 3 mois. Appelez le 15 ou consultez
  en urgence un médecin. Si un des signes ci-dessous apparaît, appelez le 15. » ;
  âge inconnu (non masquable) : « …, inférieure à 36 °C. L'âge de l'enfant n'est
  pas renseigné : s'il a moins de 3 mois, appelez le 15 ou consultez en urgence
  un médecin. Sinon, appelez un médecin ou le 15. Si un des signes ci-dessous
  apparaît, appelez le 15. »

Autres insights (`services/insightEngine.ts`, `services/correlationService.ts`) :
- Fièvre et appétit. Avant : « Quand {prénom} a de la fièvre, son appétit
  diminue naturellement. C'est normal — privilégiez l'hydratation. » Après :
  carte supprimée avant 3 mois ou si l'âge est inconnu ; de 3 à 6 mois :
  « Quand {prénom} a de la fièvre, son appétit a diminué. Proposez le sein ou le
  biberon plus souvent, et consultez rapidement un médecin si la fièvre persiste
  ou si {prénom} refuse de s'alimenter. Si un des signes d'alerte de la fiche
  fièvre apparaît, appelez le 15. » ; 6 mois et plus : « … Proposez
  régulièrement à boire et consultez un médecin si la fièvre persiste ou si
  {prénom} refuse de boire ou de s'alimenter. Si un des signes d'alerte de la
  fiche fièvre apparaît, appelez le 15. »
- Baisse d'appétit : ajout de « Si cette baisse se poursuit ou si {prénom}
  refuse de s'alimenter, demandez conseil à votre médecin. »
- Sommeil en baisse : « Une régression de sommeil est possible à cet âge » est
  retiré (non borné par l'âge) ; remplacé par « Si cela vous inquiète, parlez-en
  à votre médecin. »
- Post-vaccination. Avant : « ... Une légère fièvre ou irritabilité est normale
  dans les 48h. » Après : « {prénom} a été vacciné(e) il y a N jour(s). Si de la
  fièvre ou des signes inhabituels apparaissent, consultez un médecin ou appelez
  le 15 en cas de doute. »
- Meilleur endroit (uniquement si le lit est le meilleur endroit ; jamais
  cododo, poussette ou voiture) : « {prénom} dort le mieux dans son lit.
  Couchez toujours bébé sur le dos, dans son propre lit à barreaux ou berceau,
  avec un espace de couchage vide (ni oreiller, ni tour de lit, ni peluche). »
- Couchage sûr (nouveau, au moins 3 siestes en voiture, poussette ou cododo sur
  7 jours ; seuil produit, pas un seuil médical) : « {prénom} a fait N siestes
  en voiture, en poussette ou en cododo cette semaine. Un siège auto, une
  poussette, une écharpe ou le lit des parents ne remplacent pas son lit : dès
  que possible, recouchez bébé sur le dos dans son propre lit, dans la chambre
  des parents (lit à barreaux ou berceau, espace de couchage vide). Ne le
  laissez pas dormir sans surveillance dans un siège auto à l'arrêt. »

Fiches `data/tips_seed.json` (textes complets dans le fichier) :
- `sommeil_cododo_securite` : réécrite. Titre « Dormir dans la chambre des
  parents, dans son propre lit » ; résumé « Pour réduire le risque de mort
  inattendue du nourrisson, bébé dort dans la chambre des parents, mais dans son
  propre lit. » ; « Bébé dort dans la chambre des parents, dans son propre lit
  (lit à barreaux ou berceau), au minimum jusqu'à ses 6 mois » ; « Pas de
  partage du lit avec les parents, ni avec un frère ou une sœur » ; source
  « Santé publique France ». L'ancien contenu (cododo dans le lit, « le berceau
  cododo : le meilleur compromis ») est supprimé.
- `sante_fievre_guide` : réécrite. Titre « La fièvre chez bébé : quand
  consulter ? » ; « Moins de 3 mois : dès 38°C, consultez en urgence un médecin
  ou appelez le 15 » ; « De 3 à 6 mois : dès 38°C, consultez rapidement un
  médecin » ; « Après 6 mois : consultez un médecin si la fièvre persiste ou si
  l'un des signes ci-dessous apparaît » ; « En cas de doute, à tout âge :
  appelez le 15 » ; les 7 signes (liste portée à 9 par la revue clinique, voir
  plus bas). Retirés : seuils 39/40 °C et durées 24/48 h
  (absents du plan), « La température varie normalement entre 36.5 et 37.5 »,
  « la fièvre n'est pas une maladie », paracétamol / ibuprofène et dosages (remplacés par
  « Ne donnez aucun médicament sans avis d'un médecin ou d'un pharmacien »),
  « ajouter 0°C » (incohérent).
- `sante_poussees_dentaires` : retiré « Ce qui est normal : fièvre légère
  (< 38.5°C) » et « Ce qui n'est pas dû aux dents (> 38.5°C) ». Ajouté :
  « Ne mettez pas une fièvre sur le compte des dents : suivez les consignes de la
  fiche « La fièvre chez bébé » ». Paracétamol remplacé par « Demandez conseil
  à votre médecin ou à votre pharmacien avant tout médicament ».
- `sante_post_vaccination` : titre « Après la vaccination : que surveiller ? »
  (avant : « ... réactions normales ») ; section « Réactions normales »
  remplacée par « Dans les 48 heures » ; seuils 38.5 / 39.5 °C et paracétamol
  retirés ; « Consultez un médecin ou appelez le 15 » avec les signes de gravité.
- `sante_croissance` : retiré « mais c'est normal si c'est sa courbe »,
  « = parfait », « = à surveiller » ; remplacés par « Seul un professionnel de
  santé peut interpréter la courbe de votre enfant » et « Parlez de la courbe
  de bébé à votre médecin à chaque consultation ». Les seuils « Quand
  consulter » (2 couloirs, stagnation 2-3 semaines) et les poids moyens sont
  inchangés : à valider.
- `alim_eau_hydratation` : « Évry » : marques retirées (voir compléments).

**Reste « rassurant » mais hors santé stricte, non modifié (à trancher)** :
`bienetre_baby_blues` (« Baby blues (normal) »), `sommeil_regression_4mois` /
`_8mois`, `dev_tummy_time`, `dev_motricite_libre`, `bienetre_couple`.

**Bornes et courbes (5.6)**
- Température 34-43 °C : formulaire aligné sur `utils/eventBounds.ts` (le
  contrôle à l'envoi acceptait jusqu'à 45) ; serveur déjà à 34-43 en création et
  modification (`validateEventData`), durci contre NaN/Infinity, tests aux bornes.
- Courbes OMS : les tables embarquées couvrent 0-731 jours (24 mois), pas plus.
  Une seule mesure au-delà masquait toute la courbe ; maintenant seules les
  mesures hors plage perdent leur référence (`utils/omsCurve.ts`). Au-delà de
  24 mois il n'y a toujours pas de référence : décision propriétaire (embarquer
  les tables OMS 2-5 ans ou afficher un message).

**Compléments S5 (suite de la revue)**
1. Âges en mois calendaires (`addMonths` avec fin de mois, équivalent date-fns),
   plus en 90 / 180 jours : l'urgence ne s'arrête jamais avant 3 mois pleins.
   Tests à la veille et au jour des 3 et 6 mois, dont naissances un 31 janvier,
   un 30 novembre, tranche inconnue.
2. Saisie vocale : `executeCommand` / `executeModify` (`hooks/useVoiceEventCreator.ts`)
   affichent la même alerte via `temperatureAlertDialog` (branchée dans
   `hooks/useVoiceCommand.ts`), à l'âge de la mesure, à la place du message de
   succès. Seuls SoinsForm et la voix créent des températures.
3. `sommeil_cododo_securite` : `ageMaxMonths` passe à 12.
4. `alim_eau_hydratation` : plus aucune marque ; « Si eau en bouteille : choisir
   une eau adaptée à la préparation des biberons (mention sur l'étiquette) ».
   La ligne « résidu sec < 500 mg/L » (sans source) est retirée avec les marques.
5. `alim_blw_introduction` : phrase « haut-le-cœur normal » retirée, sans
   description de la différence haut-le-cœur / étouffement. Section Sécurité :
   « Toujours surveiller bébé pendant le repas, sans le quitter des yeux »,
   « Installez-le assis bien droit, jamais allongé ni en train de marcher ou de
   jouer », « Apprenez les gestes de premiers secours en cas d'étouffement du
   nourrisson : une formation aux premiers secours (Croix-Rouge, protection
   civile, pompiers...) vous y prépare », « En cas d'étouffement ou de
   difficulté à respirer : appelez le 15 ».
6. Courbes OMS : au-delà de 731 jours, la note « Courbes OMS disponibles jusqu'à
   24 mois » s'affiche sous le graphique.

**Revue clinique des 2026-11-06 (corrections après relecture)**

Règle propriétaire (Q4) : orientation uniquement, jamais de diagnostic ni de
rassurance, sources françaises (ameli.fr, Santé publique France, HAS, ANSM)
citées en commentaire. Quand un chiffre officiel actuel n'est pas sûr, il est
retiré, remplacé par une phrase d'orientation (« demandez à votre médecin ou à
votre pharmacien ») et la question est ajoutée à la liste pédiatre ci-dessous.
- H1 formulaire Soins : température + symptôme validés ensemble avant toute
  écriture (`utils/soinsSubmit.ts`), alerte de température affichée en dernier.
  `ModalContext` : une alerte non masquable ou avec appel du 15 n'est jamais
  remplacée par un `showAlert` / `showConfirm` ultérieur (file d'attente) et
  `hide()` ne la ferme pas.
- H2 signes d'alerte : titre « Appelez le 15 sans attendre si : », 9 signes,
  chaque palier dit d'appeler le 15 si un des signes apparaît (app et fiche
  fièvre).
- H3 courbe de croissance : bandes neutres « P3–P15 », « P15–P85 », « P85–P97 »,
  ligne « Repères OMS — seul un professionnel de santé interprète la courbe »,
  plus aucune couleur « bon / mauvais ».
- H4 fiches : « Un tissu avec votre odeur dans le lit » retiré
  (`dev_eveil_sensoriel`) ; doudou / tissu retiré de `sommeil_regression_8mois`
  (remplacé par « Lit vide : avant 12 mois, ni doudou, ni tissu, ni peluche dans
  le lit (espace de couchage vide) »).
- M1 l'empreinte de `useSmartContent` = id + type + valeur + date + updatedAt.
- M2 alertes de température calculées même si les insights sont désactivés et
  sans date de naissance (message d'âge inconnu) ; les autres insights restent
  conditionnés.
- M3 les températures optimistes ou en file hors ligne (API publique du store
  optimiste, lecture seule) alimentent l'alerte de l'accueil.
- M4 température vocale sans valeur : rien n'est enregistré, message
  « La température n'a pas été enregistrée : la valeur n'a pas été comprise.
  Redites-la, par exemple « température 38,5 ». » suivi d'une orientation selon
  l'âge.
- M5 plusieurs événements vocaux : l'alerte santé est dans la même modale que le
  résumé (résumé en tête), jamais dessous ; un événement non enregistré n'est
  plus compté comme un succès.
- M6 corrélation fièvre / appétit : supprimée avant 3 mois ou âge inconnu ;
  « proposez le sein ou le biberon plus souvent » avant 6 mois (pas d'eau).
- M7 / M8 < 36 °C avant 3 mois, ou âge inconnu : non masquable avec « Appeler le
  15 ». Seuil à valider.
- M9 modèles de médicaments : le nom seul (« Paracétamol », « Ibuprofène »), le
  champ « Dosage » reste libre et éditable comme avant.
- M10 le cododo compte dans le rappel de couchage sûr.
- M11 fiches : `sante_vitamine_d` 400 à 800 UI/jour de 0 à 18 mois (consensus
  français 2022, SFP) ; `sante_post_vaccination` calendrier détaillé retiré
  (carnet de santé, médecin) ; `alim_diversification_debut` Santé publique
  France 2021 (tous les groupes d'aliments entre 4 et 6 mois, calendrier par
  étapes et délais de 3 jours retirés) ; `alim_conservation_lait` 48 heures au
  réfrigérateur (ameli.fr), autres durées retirées ;
  `alim_biberon_preparation` stérilisation non obligatoire, lavage soigneux, ~70
  °C, dosage poudre, quantités par âge et durées retirés ; `alim_eau_hydratation`
  boissons végétales inadaptées, quantités en ml retirées ;
  `bienetre_baby_blues` 3114 ; `dev_tummy_time` « toujours éveillé et sous
  surveillance ».
- L2 alerte aussi quand seule la date d'une mesure ≥ 38 °C change le palier.
- L4 « Température élevée enregistrée » (plus « Fièvre détectée ») ; régression
  de sommeil retirée du texte ; « Baisse d'appétit » avec orientation.
- L5 plus de `console.log` du contenu vocal ; la note de l'utilisateur n'est
  plus écrasée par « Modifié par commande vocale ».
- L7 cette section : références de lignes remplacées par des noms de fonctions,
  statut S5, branche et seuils à jour.
- **Hors périmètre, à faire (suivi)** : L1, fuseau horaire de la date de
  naissance (l'âge à la date de la mesure peut différer d'un jour selon le
  fuseau).

**Questions ouvertes pour le pédiatre (Q3)**
- Conseils médicaments retirés (paracétamol, ibuprofène, dosages) des fiches
  fièvre, dents et post-vaccination : faut-il les réintroduire, avec quelle source ?
- Formulation DME / étouffement ci-dessus : suffisante, ou faut-il décrire la
  différence haut-le-cœur / étouffement ?
- `sante_croissance` : seuils de la section « Quand consulter » (2 couloirs,
  stagnation 2-3 semaines, périmètre crânien) et poids moyens / rythmes de
  croissance : à valider ou retirer.
- Fiches qui parlent encore de « normal » ou rassurent : `bienetre_baby_blues`
  (« Baby blues (normal) »), `sommeil_regression_4mois`, `sommeil_regression_8mois`,
  `dev_tummy_time`, `dev_motricite_libre`, `bienetre_couple`.
- Textes d'alerte température : formulations et signes de gravité ci-dessus.

**Questions pédiatre de la revue clinique (12)**
1. Mois calendaires ou jours pour les paliers d'âge (< 3 mois, 3 à 6 mois) ?
2. Source et validité du palier 3 à 6 mois (« consultez rapidement ») ?
3. « Si la fièvre persiste » : au bout de combien de temps consulter ?
4. Seuil « < 36 °C » (alerte température basse) : valeur et conduite à tenir,
   y compris non masquable avant 3 mois.
5. Mode de mesure (rectale, axillaire, frontale, tympanique) : quel mode
   privilégier, et quelle correction éventuelle ?
6. Liste finale des signes d'appel du 15 (9 signes aujourd'hui, sources
   ameli.fr) : complète, trop longue ?
7. Courbes OMS ou AFPA / Carnet de santé pour la croissance en France ?
8. Que recouvre « cododo » pour l'app (même lit, même chambre, lit accolé) et
   quel message pour le rappel de couchage sûr ?
9. Textes retirés ou reformulés à valider : vitamine D (400-800 UI/jour 0-18
   mois, vitamine K), vaccination (renvoi au carnet de santé), diversification
   (SpF 2021, allergènes, textures), conservation du lait maternel (48 h au
   frigo ; durées ambiante / congélation / décongélation retirées), préparation
   du biberon (eau, quantités, durées retirées), boissons végétales.
10. Appeler le 15 ou le 112 à l'étranger (voyage) : que dit l'alerte ?
11. Modèles de médicaments : faut-il garder « Paracétamol » / « Ibuprofène »
    comme noms préremplis, sans dose ?
12. Fièvre après vaccination à 2 mois : conduite à tenir exacte (la fiche
    renvoie à la fiche fièvre : avant 3 mois, dès 38 °C, urgence).

**Relecture pédiatre (Q3) et décision MDR (Q4)**
- [x] Décision MDR (Q4) : orientation uniquement, voir ci-dessus.
- [ ] Relecture pédiatre (Q3) de tous les textes ci-dessus : à faire avant la version.

## S6 — Fiabilité : plus d'action perdue en silence · app + serveur · ⏳

But : ce que l'utilisateur saisit est enregistré une fois, ou il est prévenu.

User stories :
- En tant que parent hors connexion, je veux que mes saisies partent une seule
  fois au retour du réseau, et être prévenu si l'une échoue.
- En tant que parent, je veux savoir quel ajout a échoué et pouvoir le
  réessayer.

- [ ] **6.1** File hors ligne : `idempotencyKey` générée pour tout `create` ;
  dédoublonnage serveur transactionnel (document à identifiant déterministe
  créé par `create()`). (`services/eventsService.ts:200`,
  `functions/index.js:2341`)
- [ ] **6.2** `aborted` (conflit de version) traité comme définitif ;
  plafond d'échecs transitoires par élément puis passage au suivant (plus de
  file bloquée). (`services/offlineQueueService.ts:44-62`, `:274-297`)
- [ ] **6.3** Échecs définitifs : `captureServiceError`, message à
  l'utilisateur, `getExhaustedEvents` affiché dans l'écran de
  synchronisation, compteur cohérent.
- [ ] **6.4** Échec de mise en file : `failOptimistic` + Sentry au lieu d'un
  `catch` vide ; `failOptimistic` porte le type d'événement et propose
  « Réessayer » avec les données conservées.
- [ ] **6.5** Messages honnêtes : voix (« introuvable » vs erreur réseau),
  suppression mise en file (« synchronisation en attente »).
- [ ] **6.6** Photo de jalon : délai maximal, message réseau distinct, photo
  supprimée si la création échoue, ancienne photo supprimée à la modification.
- [ ] **6.7** Suppression avec annulation exécutée tout de suite si l'app
  passe en arrière-plan ; retry sans fermeture périmée.
- [ ] **6.8** E-mail de demande de suppression vérifié (erreur Resend
  remontée) ; « Restaurer mes achats » : messages distincts (configuration,
  réseau, autre compte), cas `null` géré.
- [ ] **6.9** Tests : intégration hors ligne (création, reconnexion,
  dédoublonnage, échec visible) ; `ajouterEvenementOptimistic` /
  `modifierEvenementOptimistic` ; `useStopTimedEventWithUndo` (promesse
  attendue).

**Revue ECC (S5 + S6)** : `healthcare-reviewer`, `silent-failure-hunter`.

## S7 — Performance de l'app · app (+ serveur) · ✅ (revue ECC faite ; mesures sur appareil à faire)

But : appliquer à toute l'app ce qui a été fait pour les statistiques.
Mesure de référence d'abord (même méthode que `STATS_PERF_REFONTE.md`).

User stories :
- En tant que parent, je veux que l'app s'ouvre et revienne de l'arrière-plan
  sans se figer.
- En tant que parent, je veux une galerie qui défile sans saccade.

- [x] **7.0** Mesures de référence : lectures Firestore à l'ouverture et au
  retour de l'arrière-plan, rendus de l'accueil et du journal, temps de
  démarrage.
- [x] **7.1** (focus et garde d'enfant ; la variante « pas de relecture si un écouteur est actif » n'est pas faite) Relecture au retour de l'arrière-plan réservée à l'écran
  affiché (`useIsFocused`) ou supprimée quand un écouteur est actif ; garde
  d'enfant (pas d'écriture dans le mauvais enfant).
  (`hooks/useForegroundServerRefresh.ts`)
- [x] **7.2** Likes et commentaires : un seul écouteur par enfant dans un
  provider partagé (notifications, Moments, Galerie), borné par date pour le
  badge. (`contexts/MomentsNotificationContext.tsx`, `services/socialService.ts`)
- [x] **7.3** Photos : redimensionnement à l'upload (`expo-image-manipulator`,
  1600 px), miniatures 400 px générées par une fonction Storage, miniatures
  dans les grilles, `priority` normale, `recyclingKey`.
- [x] **7.4** Galerie paginée (60 par page), pas tout l'historique des jalons.
- [x] **7.5** Démarrage : préchargement en parallèle du délai minimal, une
  seule lecture du jour (mutualisée avec `BabyContext`).
- [x] **7.6** Accueil : lecture de 7 jours différée, filtrée par type, mise en
  cache par jour ; minute isolée dans les widgets qui l'affichent.
- [x] **7.7** Journal : `currentTime` passé seulement aux événements en cours ;
  formateurs de date mis en cache ; fenêtre élargie par tranche au lieu de
  tout relire.
- [x] **7.8** `useChildPermissions` partagé (un seul écouteur) ; menu latéral
  sans relectures à chaque ouverture.
- [x] **7.9** Fonctions d'écriture d'événements : SDK lourds chargés à la
  demande ; décision `minInstances` sur `validateAndCreateEvent` (coût vs
  démarrage à froid).

Contrôle : mesures avant/après dans ce document.

**Mesures (2026-11-07, analyse du code et tests jest, sans appareil) :**

| Mesure | Avant | Après |
|---|---|---|
| Lectures « événements du jour » au démarrage | 2 (boot + BabyContext) | 1 (`loadTodayEventsOnce`) |
| Préchargement au démarrage | après le délai minimal (0,5–1,2 s) | en parallèle |
| Lecture 7 jours de l'accueil | immédiate, tous types, à chaque montage | après le premier rendu, 11 types, cache 15 min ; le jour courant vient de l'écouteur temps réel (alerte fièvre à jour) |
| Rendus de l'accueil dus à la minute | 60/h | 0 (seuls les widgets à durée) |
| Relectures au retour de l'arrière-plan | une par onglet monté | celle de l'écran affiché |
| Journal : rendus de lignes par minute (50 lignes) | 50 | 1 (ligne en cours) |
| Journal : élargir 14 → 30 jours | relecture 30 j (44 jours-unités) | tranche de 16 j (30) |
| Écouteurs likes/commentaires (badge + Moments + Galerie) | 6, jusqu'à 3000 docs | 2, au plus 1000 |
| Galerie à l'ouverture | tout l'historique des jalons | 60 jalons, pages suivantes au défilement |
| Écouteurs de droits par enfant | un par écran (8+) + `getDoc` dans le menu | 1 |
| Photo envoyée / affichée en grille | brute 2–5 Mo / originale | 1600 px ~300–500 Ko / miniature 400 px ~20–40 Ko (estimations) |
| `require` de `functions/index.js` (Mac, Node 22) | ~480 ms | ~250 ms (SDK Expo, Resend, Anthropic chargés à la demande) |

Décision 7.9 : pas de `minInstances` sur `validateAndCreateEvent` (~7,5 €/mois pour ~1 s évitée après inactivité, invisible grâce aux écritures optimistes ; tarifs à reconfirmer). Réévaluer avec la latence p95 dans les logs.

À faire hors code : déployer `storage.rules` à la main après fusion (chemin `thumbs/`) ; miniatures des photos existantes non générées (repli sur l'original) ; vérifications sur appareil listées dans la PR.

## S8 — Robustesse React · app · ✅

- [x] **8.1** `ModalContext`, `ToastContext`, `SheetContext`,
  `SuccessAnimationContext` : fonctions en `useCallback`, valeurs en
  `useMemo`, contexte « actions » séparé de l'état ; `AuthContext` lit
  `showAlert` par ref (plus de réabonnement, plus de boucle possible).
- [x] **8.2** `ErrorBoundary` : « Relancer » recharge vraiment l'app ;
  `SafeBoundary` autour du gestionnaire de feuilles et de chaque formulaire.
- [x] **8.3** `GlobalSheetManager` : clé dérivée du formulaire et de
  l'événement (plus de double montage ni d'état d'un autre événement) ;
  retirer les 10 `useEffect` de réinitialisation avec `eslint-disable`.
- [x] **8.4** Écrans de liste : état dérivé en `useMemo` au lieu de
  `useEffect` + `useState` ; dépendances déclarées avant usage (retrait des
  `@ts-expect-error`) — en attendant l'écran générique (S13).
- [x] **8.5** Voix : nettoyage au démontage, commande en attente annulée au
  changement d'enfant ; `useVoiceEventCreator` renommé en service.
- [x] **8.6** Divers : `useUserInfo` annulable, `useMinuteTick` dans le
  journal, `BabyContext` dépend de `user?.uid`, `console.log` hors `__DEV__`.

Notes S8 (2026-11-07) : `expo-updates` absent, donc « Relancer » remonte tout
l'arbre React (clé) en production, `DevSettings.reload` en dev ; 8 effets de
réinitialisation retirés (pas 10) ; `useVoiceEventCreator` devenu
`services/voiceEventCreator.ts` ; 60 `console.log` passés sous `__DEV__`.

**Revue ECC (S7 + S8)** : `performance-optimizer`, `react-reviewer`.
Faite le 2026-11-07 : aucun CRITICAL ; 1 HIGH (feuille bloquée après un crash
hors formulaire) et 9 MEDIUM/LOW (galerie bloquée sur un jalon supprimé, droits
figés après une erreur, caches non vidés à la déconnexion, image de l'enfant
précédent après un changement d'enfant, filtres « aujourd'hui » figés après
minuit…) corrigés avec tests (1182 tests app, 439 fonctions, 219 règles).

## S9 — Accessibilité · app + site · ✅ 2026-11-07

User story : en tant que parent malvoyant ou utilisant VoiceOver/TalkBack, je
veux lire tous les textes, connaître les valeurs des graphiques et des dates,
et ne pas subir d'animations si je les ai désactivées.

- [x] **9.1** Palette : `textMuted` réservé au décoratif, `textLight` pour le
  texte, `textMuted` sombre relevé ; erreurs en `errorText` ; variantes
  foncées des couleurs de catégorie pour le texte et les icônes ; test
  automatique des contrastes de la palette.
- [x] **9.2** `useReduceMotion` branché dans `useNightMode` et les animations
  (FAB, barre vocale, confettis, splash).
- [x] **9.3** Graphiques : résumé textuel par jour et actions pour parcourir
  les jours.
- [x] **9.4** FAB et menus : actions cachées hors de l'arbre d'accessibilité
  quand fermés, fonds « Fermer le menu », `expanded`, bouton « Fermer » sur
  les feuilles.
- [x] **9.5** Formulaires : valeur des dates annoncée, sexe en
  `radio`/`radiogroup`, erreurs annoncées et textuelles (cases de
  consentement), cibles ≥ 44 pt réelles.
- [x] **9.6** Textes ≥ 12 pt, hauteurs minimales au lieu de fixes,
  `maxFontSizeMultiplier` sur la barre d'onglets et la barre vocale ; badge
  Moments annoncé.
- [x] **9.7** Site : `h2` dans la section fonctionnalités, bouton de pause
  sans double sens, `aria-live` réduit sur les tarifs, alerte de
  `reset-password` annoncée.

## S10 — Site et stores · site · ✅ 2026-11-07 (10.2 : 4 mentions à compléter par Yoss ; 10.5 : consoles à mettre à jour ; 10.6 : déploiement après fusion)

- [x] **10.1** Décisions Q7 appliquées : site aligné sur ce que l'app fait
  vraiment (OMS, statistiques avancées, Famille) ; −37 % / −46 % par offre.
  Fait 2026-11-07 : carte Famille retirée du site et du paywall (onglet
  masqué, produits et tier `family` conservés), courbes OMS et statistiques
  sorties des avantages Premium (`isAlwaysFreeFeature`), section « Famille »
  du site renommée « Partage » (`#partage`), remise annuelle affichée
  **−37 %** (Premium seul : 29,99 € contre 12 × 3,99 € = 47,88 €), FAQ et
  JSON-LD alignés, CGU §9 (site 2.1 et app) sans Famille.
- [~] **10.2** 2.3 (cases « À compléter »), 2.5 (captures avec texte
  alternatif), garde-fou `grep -c 'class="todo"'` avant déploiement.
  Fait : durée des sauvegardes (7 j quotidiennes / 30 j hebdomadaires),
  `alt` en français sur les 5 captures, `scripts/checkSiteTodos.sh`. Restent
  4 cases à trancher par Yoss : médiateur (CGU, mentions légales), DPO,
  non-entraînement AssemblyAI / Anthropic (`privacy.html`).
  **Contrôle avant déploiement du site** : `bash scripts/checkSiteTodos.sh`
  doit sortir en 0 avant tout `firebase deploy --only hosting` (pas encore
  branché dans la CI tant que des cases restent).
- [x] **10.3** `cleanUrls`, `favicon.ico`, logo 72 px et `apple-touch-icon`
  180 px, og-image en JPEG, JSON-LD enrichi (captures, fonctionnalités,
  `sameAs`). Réécritures devenues inutiles retirées ; `no-cache` étendu aux
  URL sans extension.
- [x] **10.4** CSP : styles inline déplacés pour retirer `'unsafe-inline'` ;
  `connect-src` vérifié pour la page de réinitialisation (aucun appel
  réseau : simple redirection vers l'app, `'self'` suffit).
- [x] **10.5** Fiches « Confidentialité » (App Store) et « Sécurité des
  données » (Google Play) comparées aux flux réels (Sentry, Anthropic,
  AssemblyAI, Resend, RevenueCat) et mises à jour.
- [ ] **10.6** 2.4 : déploiement du site.

**Revue ECC (S9 + S10)** : `a11y-architect`, `seo-specialist`.
Faite le 2026-11-07 : a11y 3 HIGH (texte blanc sur le choix du sexe, `error`
en texte, ligne âge/date du menu) et 14 MEDIUM ; SEO 1 HIGH (lien de
parrainage `/invite/…` en 404, antérieur au sprint) et 4 MEDIUM ; corrigés
avec tests (1243 tests). Restent ouverts : boutons à texte blanc sur
`todayAccent` en mode sombre hors abonnement (à passer en `onTodayAccent`) ;
aucun écran de l'app ne permet de saisir un code de parrainage
(`validateReferralCode` existe côté serveur) — `invite.html` renvoie vers le
support en attendant une décision.

**Backlog (Yoss, 2026-11-07)** : champ « allergies » dans la fiche enfant
(ajout, modification, règles, export) — la politique les mentionne déjà.

## S11 — Tests et CI · ✅ 2026-11-07 (11.7 en attente du go IAM ; revue ECC S11+S12 à faire)

- [x] **11.1** `collectCoverageFrom` pour mesurer la vraie couverture, seuils
  recalés sur la nouvelle mesure.
- [x] **11.2** Tests des tâches planifiées : `checkAndSendReminders`
  (déclenchement, dédoublonnage, jeton invalide), `sendWeeklyRecap`.
- [x] **11.3** `eventsService` : test paramétré de tous les `ajouterX`.
- [x] **11.4** Écrans d'authentification et garde de navigation (non
  connecté, non vérifié, suppression en attente).
- [x] **11.5** E2E multi-utilisateur sur émulateurs (A invite B en lecteur,
  B lit sans écrire, A révoque) ; Maestro (01, 03, 05) la nuit en CI.
- [x] **11.6** CI : `expo-doctor`, lint des fonctions, Dependabot ; tests
  tautologiques retirés (`firebaseConfig.test.ts`).
Notes S11 (2026-11-07) : couverture réelle de l'app 23,4 % instructions
(seuils 22/18/18/22 ; les anciens 55 % ne comptaient que les fichiers
importés par les tests), fonctions 87,3 % (seuils 86/76/90/87) ;
`expo-doctor` non bloquant (16/17 : champs de config non synchronisés car
`android/` et `ios/` sont versionnés) ; Maestro la nuit demande les secrets
`EXPO_TOKEN`, `MAESTRO_EMAIL`, `MAESTRO_PASSWORD` et un build Android
`preview` sur EAS. Défauts trouvés par 11.2 : jeton push mort jamais retiré
(→ 12.4) ; aucune plage de nuit pour les rappels (décision produit).

- [ ] **11.7** Workload Identity Federation à la place de la clé `GCP_SA_KEY`.

## S12 — Environnements et livraison · ⏳

- [ ] **12.1** Projet `samaye-staging` (Q8) : config choisie par `APP_ENV`,
  alias `.firebaserc`, `main` déploie en staging, production derrière un
  environnement GitHub avec validation.
- [ ] **12.2** Android : fichiers Firebase en variables EAS de type fichier,
  build cloud réparé (cause notée dans un ADR), `appVersionSource: remote`,
  compte de service Play (Q9) pour `eas submit` vers Alpha.
- [ ] **12.3** `release.yml` réécrit (build attendu, envoi du bon build,
  `app_config` mis à jour après publication) ou supprimé.
- [ ] **12.4** Rappels et récap capables de tenir la charge : `lastEventAt`
  par catégorie sur l'enfant, concurrence bornée, durée mesurée.
- [ ] **12.5** TTL déclarés dans `firestore.indexes.json` ; rétention de
  `webhook_logs`, `notification_history`, `recap_history` ; job nocturne de
  réconciliation des accès (`children/*/access` vs `user_child_access`) ;
  index `eventLikes` redondants supprimés.
- [ ] **12.6** Deux rôles affichés, « Parent » (`admin` : saisit, modifie,
  exporte tout le suivi) et « Proche » (`contributor` : lit tout, like et
  commente les photos, exporte ses seules interactions). `viewer` reste dans
  le code mais n'est plus proposé. Décision Yoss du 2026-11-07 : un code de
  partage ou une invitation donne toujours « Proche » (un code qui fuit ne
  donne jamais plus) ; seul le propriétaire passe un membre en « Parent » ou
  le repasse en « Proche », depuis la fiche de l'enfant, via une Cloud
  Function (les accès restent écrits côté serveur). Codes de partage créés
  côté serveur dans le même lot. Mettre à jour le message de l'export
  (`app/settings/export.tsx`, « enfant partagé avec vous ») avec les
  nouveaux libellés.

**Revue ECC (S11 + S12)** : `architect`, `pr-test-analyzer`.

## S13 — Dette structurelle (mois 3) · ⏳

- [ ] **13.1** Découpage de `functions/index.js` par domaine (partage,
  événements, voix, facturation, suppression, notifications, modération,
  admin) et des tests associés.
- [ ] **13.2** Écran de liste générique piloté par configuration, migré écran
  par écran (repas, pompages, couches d'abord) ; `toDate` unique dans
  `utils/date`.
- [ ] **13.3** Couche d'accès aux données (`services/*Repository.ts`) et règle
  ESLint qui interdit `firebase/firestore` hors `services/`.
- [ ] **13.4** Code mort : 5 services par type, `app/backups/*.txt`,
  `app-example/` ; `explore.tsx` renommé.
- [ ] **13.5** Montée d'Expo SDK (une version à la fois, testée en staging) ;
  Skia stable ou graphiques en SVG ; suppression de `scripts/patch-expo.js`.
- [ ] **13.6** S4 : App Check imposé quand la nouvelle version est
  majoritaire ; décision `expo-updates` (retour arrière OTA) dans un ADR.
- [ ] **13.7** Documentation : `docs/README.md` (index), `docs/RUNBOOK.md`,
  `docs/adr/`, `todo_*` de la racine archivés.

**Revue ECC (S13)** : `architect`, `code-reviewer`.

## Correspondance audit → sprints

| Audit | Sprint |
|---|---|
| A1 webhook, A2 parrainage, A3 suppression | S1 |
| A6 Sentry, A7 sauvegardes et alertes, journaux, `release.yml`, région | S2 |
| A4 comptes Apple/Google, export, récap, transfert de propriété | S3 |
| Données sur l'appareil, voix, sécurité P1 (signalements, invitations, admin, App Links, règles) | S4 |
| A5 messages de santé, MDR | S5 |
| Erreurs silencieuses (file hors ligne, toasts, uploads) | S6 |
| Performance hors statistiques | S7 |
| Qualité React | S8 |
| Accessibilité | S9 |
| Site, promesses Premium, fiches des stores | S10 |
| Tests et CI | S11 (et tests ciblés dans chaque sprint) |
| Environnements, Android, tâches planifiées, modèle de données | S12 |
| Découpages, écran générique, SDK, documentation | S13 |
