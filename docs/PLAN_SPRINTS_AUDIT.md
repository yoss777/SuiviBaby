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
| Q7 | Offre Famille, courbes OMS, statistiques avancées (déjà 3.2 / 3.3) | S10 | À trancher avant le déploiement du site |
| Q8 | Projet Firebase de staging (coût, nom) | S12 | `samaye-staging`, plan Blaze avec budget plafonné |
| Q9 | Compte de service Google Play pour automatiser l'envoi Android | S12 | Oui, piste Alpha seulement |

---

## S1 — Ne plus perdre d'argent ni de données · serveur · P0 A1 A2 A3 · ⏳

But : aucun paiement perdu, plus de Premium gratuit par le parrainage, une
suppression de compte complète et honnête.

User stories :
- En tant qu'abonné, je veux que mon paiement soit pris en compte même si le
  serveur a un incident, afin de ne pas perdre ce que j'ai payé.
- En tant que propriétaire de l'app, je veux qu'un code de parrainage ne serve
  qu'une fois par compte, afin que Premium reste payant.
- En tant que parent qui supprime son compte, je veux que toutes mes données
  disparaissent et ne recevoir la confirmation qu'une fois que c'est vrai.

- [ ] **1.1** Webhook RevenueCat : marqueur anti-doublon créé dans la
  transaction qui écrit `subscriptions/{uid}` (ou supprimé si le traitement
  échoue avant la réponse 5xx) ; `webhook_logs.add` non bloquant ; erreurs de
  `getUser` autres que `user-not-found` propagées ; validation de
  `app_user_id` (`^[A-Za-z0-9]{1,128}$`). Test : transaction en échec puis
  retry → abonnement appliqué. (`functions/index.js:2800-2960`)
- [ ] **1.2** Parrainage : règles `user_promos` qui interdisent au client
  d'écrire `referredBy`, `referralCode`, `referralCount` ; usage tracé dans
  `referrals/{filleulUid}` créé dans une transaction (refus s'il existe) ;
  code généré côté serveur (`crypto.randomBytes`) ; plafond de récompenses
  par parrain. Tests de règles + test de la fonction (2ᵉ usage refusé même
  après effacement de `referredBy`). (`firestore.rules:499`,
  `functions/index.js:3466-3560`, `services/promoService.ts:198`)
- [ ] **1.3** `purgeUserData(uid)` unique, utilisée par
  `processScheduledDeletions` et `deleteUserAccount` : toutes les collections
  (dont `subscriptions`, `user_promos`, `referrals` ×2, `user_content`,
  `webhook_logs`, `user_hidden_photos`, `voice_transcribe_cache`,
  `pending_assemblyai_deletes`, `childDeletionRequests`, `reports` par
  `reporterUid`) ; test qui compare la liste purgée à la liste des
  collections. (`functions/index.js:2600-2726`, `:3874-3935`)
- [ ] **1.4** Ordre sûr : photos d'abord (échecs mis en file de reprise,
  comme `pending_assemblyai_deletes`), événements ensuite ; suppression Auth
  en dernier ; si Auth échoue (hors `user-not-found`), garder
  `pendingDeletion` + `deletionFailedAt` pour la reprise et ne pas envoyer
  l'e-mail ; e-mail seulement après succès.
- [ ] **1.5** Événements saisis par le parent supprimé dans un dossier
  partagé : anonymisés (`userId: "deleted"`) au lieu d'être effacés, pour que
  l'autre parent garde vaccins et températures.
- [ ] **1.6** Tests manquants du cycle de suppression d'enfant :
  `createDeletionRequest`, `voteDeletionRequest`, `cancelChildDeletion`,
  `purgeDeletedChildren` (quorum, annulation, délai de grâce, pas de purge
  d'un enfant annulé). Purge de `recap_history` et `notification_history`
  par `childId`.

Contrôle : `npm --prefix functions test` vert avec les nouveaux tests ;
déploiement des fonctions ; un achat sandbox puis un renouvellement visibles
dans `subscriptions/`.

## S2 — Voir ce qui se passe · serveur + app · P0 A6 A7 · ⏳

But : être prévenu des erreurs et des incidents, pouvoir restaurer les
données.

User story : en tant que propriétaire de l'app, je veux être alerté d'un crash
ou d'une fonction en échec et pouvoir restaurer la base, afin de réagir avant
les utilisateurs.

- [ ] **2.1** Sentry, filtrage d'abord : `beforeBreadcrumb` (supprime la
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
- [ ] **2.5** Journaux serveur sans données personnelles : e-mails et prénoms
  remplacés par des identifiants (`functions/index.js:3933`, `:4395-4433`) ;
  plus de réponse Resend complète dans les logs.
- [ ] **2.6** `release.yml` : retirer le déclenchement par tag `v*` (cassé et
  dangereux) en attendant S12.
- [ ] **2.7** Région : `setGlobalOptions({ region: "europe-west1" })` en tête
  de `functions/index.js` (règle 4.5 / D9 pour `cleanupExpiredShareCodes` et
  `purgeDeletedChildren`), miroirs US gardés jusqu'à 1.8.

Contrôle : alerte de test reçue par e-mail ; sauvegarde visible dans la
console ; événement Sentry de test.

**Revue ECC (S1 + S2)** : `security-reviewer`, `silent-failure-hunter`.

## S3 — Droits des utilisateurs (RGPD) · app + serveur · P0 A4 · ⏳

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

- [ ] **3.1** Écran de consentement santé bloquant après connexion sociale et
  au démarrage pour les comptes existants sans consentement ; texte complet
  (symptômes, médicaments, vaccins, photos, transferts hors UE).
- [ ] **3.2** Preuve de consentement côté serveur : collection en ajout seul
  (fonction), version de la politique, conservation selon la politique.
- [ ] **3.3** Suppression de compte par ré-authentification selon le
  fournisseur (`GoogleAuthProvider`, `OAuthProvider('apple.com')`) ;
  révocation du jeton Sign in with Apple côté serveur
  (`appleid.apple.com/auth/revoke`). (`services/accountDeletionService.ts:61`,
  `app/(drawer)/settings.tsx:806-850`)
- [ ] **3.4** Export JSON gratuit et illimité (limite de débit seulement) ;
  PDF reste Premium. (`app/settings/export.tsx:765`, `functions/index.js:33`)
- [ ] **3.5** Récap hebdomadaire (Q5) : adresse de Firebase Auth (vérifiée),
  owner et admin seulement, arrêt pendant `pendingDeletion`, en-tête
  `List-Unsubscribe`, contenu sans chiffres de santé si validé.
  (`functions/index.js:4326-4417`)
- [ ] **3.6** Transfert de propriété : `owner` prioritaire, jamais de lecteur
  ou contributeur promu automatiquement ; sans co-owner ni admin, demander un
  choix avant de programmer la suppression ; décrire ce transfert dans
  `delete-account.html`. (`functions/index.js:484-514`)

## S4 — Données sur l'appareil, voix et sécurité restante · app + serveur · ⏳

But : ne rien laisser traîner (appareil, journaux, prestataires) et fermer les
derniers points de sécurité.

- [ ] **4.1** Audio de commande vocale supprimé après transcription
  (`finally` + `deleteAsync`) ; corriger « l'audio n'est jamais stocké ».
  (`services/voice/recorder.ts`)
- [ ] **4.2** Politique de confidentialité (app + site) : prénom transmis à
  Anthropic dans la transcription (ou remplacé par un jeton avant envoi),
  cache supprimé sous 24 h (TTL) ou suppression explicite, information au
  moment d'utiliser la voix ; transcriptions AssemblyAI abandonnées signalées.
- [ ] **4.3** Exports écrits dans `cacheDirectory` et supprimés après le
  partage ; `offlineQueueService.onAccountDelete()` appelé à la demande de
  suppression ; règles de sauvegarde Android excluant AsyncStorage, SQLite et
  les exports (ou `allowBackup=false`).
- [ ] **4.4** Signalements : `escapeHtml` sur tous les champs des e-mails
  opérateur et de résolution ; `childId`/`eventId` validés ; `photoPath`
  limité à `children/{childId}/` et présent dans `event.photos` ; même
  vérification dans `deleteUserEventPhotos` et `photoRefToPath`.
- [ ] **4.5** `createShareInvitation` : limite de débit, `childName` lu dans
  `children/{id}`, réponse neutre si l'e-mail n'a pas de compte.
- [ ] **4.6** `setAdminClaim` : `email_verified` exigé, bootstrap désactivé
  après le premier admin.
- [ ] **4.7** Lien de réinitialisation Android : `/.well-known/assetlinks.json`
  + App Links vérifiés ; `oobCode` validé par expression régulière dans l'app.
- [ ] **4.8** Règles `events`/`eventComments` : champs modifiables limités
  (`affectedKeys`), `childId`/`eventId` figés, contributeurs alignés sur D11
  (Q6) ; `validateAndUpdateEvent` interdit `createdAt` et `reported`.
- [ ] **4.9** Supprimer les fonctions inutilisées : `generateAiInsight`,
  `migrateUsersPublicRemoveEmail`, `grandfatherExistingUsers` si terminée ;
  `npm audit fix` et montée de `firebase-admin` / `firebase-functions` dans
  `functions/`.
- [ ] **4.10** S5 (`email_verified` pour invitations et codes) et S14
  (TRANSFER) traités ici s'ils ne l'ont pas été dans le chantier abonnements.

**Revue ECC (S3 + S4)** : `healthcare-reviewer`, `security-reviewer`.

## S5 — Messages de santé sûrs · app (+ contenu) · P0 A5 · ⏳

But : aucun message de l'app ne rassure à tort ni n'encourage un couchage à
risque.

User stories :
- En tant que parent d'un bébé de moins de 3 mois, je veux être alerté
  clairement dès que je saisis une température ≥ 38 °C, afin de consulter en
  urgence.
- En tant que parent, je veux des conseils de sommeil conformes aux
  recommandations françaises.

- [ ] **5.1** Alerte à la saisie d'une température, selon l'âge :
  < 3 mois et ≥ 38 °C → modale non masquable « consultez en urgence /
  appelez le 15 » ; 3 à 6 mois → consultation rapide ; < 36 °C → alerte
  hypothermie ; signes de gravité affichés. (`SoinsForm.tsx:609-626`,
  `services/insightEngine.ts:349-376`)
- [ ] **5.2** Conseil « fièvre » des insights : âge pris en compte, non
  masquable pour les moins de 3 mois.
- [ ] **5.3** Retirer « C'est normal » du conseil fièvre et appétit.
  (`services/correlationService.ts:348`)
- [ ] **5.4** « Meilleur endroit » limité au lit ; rappel de couchage sûr si
  siestes fréquentes en voiture ou poussette. (`insightEngine.ts:298-341`)
- [ ] **5.5** Fiche cododo réécrite (même chambre, pas le même lit avant
  4-6 mois) ; fiche fièvre complétée (« appelez le 15 ») ; coquille « Évry » ;
  vérifier que la collection `tips` en production correspond au seed.
- [ ] **5.6** Bornes de température identiques dans le formulaire et le
  serveur (34-43) ; courbes OMS qui ne disparaissent plus au-delà de
  731 jours.
- [ ] **5.7** Relecture pédiatre (Q3) et décision MDR (Q4) notées ici avant la
  version.

Contrôle : tests unitaires des seuils par âge ; textes validés.

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

## S7 — Performance de l'app · app (+ serveur) · ⏳

But : appliquer à toute l'app ce qui a été fait pour les statistiques.
Mesure de référence d'abord (même méthode que `STATS_PERF_REFONTE.md`).

User stories :
- En tant que parent, je veux que l'app s'ouvre et revienne de l'arrière-plan
  sans se figer.
- En tant que parent, je veux une galerie qui défile sans saccade.

- [ ] **7.0** Mesures de référence : lectures Firestore à l'ouverture et au
  retour de l'arrière-plan, rendus de l'accueil et du journal, temps de
  démarrage.
- [ ] **7.1** Relecture au retour de l'arrière-plan réservée à l'écran
  affiché (`useIsFocused`) ou supprimée quand un écouteur est actif ; garde
  d'enfant (pas d'écriture dans le mauvais enfant).
  (`hooks/useForegroundServerRefresh.ts`)
- [ ] **7.2** Likes et commentaires : un seul écouteur par enfant dans un
  provider partagé (notifications, Moments, Galerie), borné par date pour le
  badge. (`contexts/MomentsNotificationContext.tsx`, `services/socialService.ts`)
- [ ] **7.3** Photos : redimensionnement à l'upload (`expo-image-manipulator`,
  1600 px), miniatures 400 px générées par une fonction Storage, miniatures
  dans les grilles, `priority` normale, `recyclingKey`.
- [ ] **7.4** Galerie paginée (60 par page), pas tout l'historique des jalons.
- [ ] **7.5** Démarrage : préchargement en parallèle du délai minimal, une
  seule lecture du jour (mutualisée avec `BabyContext`).
- [ ] **7.6** Accueil : lecture de 7 jours différée, filtrée par type, mise en
  cache par jour ; minute isolée dans les widgets qui l'affichent.
- [ ] **7.7** Journal : `currentTime` passé seulement aux événements en cours ;
  formateurs de date mis en cache ; fenêtre élargie par tranche au lieu de
  tout relire.
- [ ] **7.8** `useChildPermissions` partagé (un seul écouteur) ; menu latéral
  sans relectures à chaque ouverture.
- [ ] **7.9** Fonctions d'écriture d'événements : SDK lourds chargés à la
  demande ; décision `minInstances` sur `validateAndCreateEvent` (coût vs
  démarrage à froid).

Contrôle : mesures avant/après dans ce document.

## S8 — Robustesse React · app · ⏳

- [ ] **8.1** `ModalContext`, `ToastContext`, `SheetContext`,
  `SuccessAnimationContext` : fonctions en `useCallback`, valeurs en
  `useMemo`, contexte « actions » séparé de l'état ; `AuthContext` lit
  `showAlert` par ref (plus de réabonnement, plus de boucle possible).
- [ ] **8.2** `ErrorBoundary` : « Relancer » recharge vraiment l'app ;
  `SafeBoundary` autour du gestionnaire de feuilles et de chaque formulaire.
- [ ] **8.3** `GlobalSheetManager` : clé dérivée du formulaire et de
  l'événement (plus de double montage ni d'état d'un autre événement) ;
  retirer les 10 `useEffect` de réinitialisation avec `eslint-disable`.
- [ ] **8.4** Écrans de liste : état dérivé en `useMemo` au lieu de
  `useEffect` + `useState` ; dépendances déclarées avant usage (retrait des
  `@ts-expect-error`) — en attendant l'écran générique (S13).
- [ ] **8.5** Voix : nettoyage au démontage, commande en attente annulée au
  changement d'enfant ; `useVoiceEventCreator` renommé en service.
- [ ] **8.6** Divers : `useUserInfo` annulable, `useMinuteTick` dans le
  journal, `BabyContext` dépend de `user?.uid`, `console.log` hors `__DEV__`.

**Revue ECC (S7 + S8)** : `performance-optimizer`, `react-reviewer`.

## S9 — Accessibilité · app + site · ⏳

User story : en tant que parent malvoyant ou utilisant VoiceOver/TalkBack, je
veux lire tous les textes, connaître les valeurs des graphiques et des dates,
et ne pas subir d'animations si je les ai désactivées.

- [ ] **9.1** Palette : `textMuted` réservé au décoratif, `textLight` pour le
  texte, `textMuted` sombre relevé ; erreurs en `errorText` ; variantes
  foncées des couleurs de catégorie pour le texte et les icônes ; test
  automatique des contrastes de la palette.
- [ ] **9.2** `useReduceMotion` branché dans `useNightMode` et les animations
  (FAB, barre vocale, confettis, splash).
- [ ] **9.3** Graphiques : résumé textuel par jour et actions pour parcourir
  les jours.
- [ ] **9.4** FAB et menus : actions cachées hors de l'arbre d'accessibilité
  quand fermés, fonds « Fermer le menu », `expanded`, bouton « Fermer » sur
  les feuilles.
- [ ] **9.5** Formulaires : valeur des dates annoncée, sexe en
  `radio`/`radiogroup`, erreurs annoncées et textuelles (cases de
  consentement), cibles ≥ 44 pt réelles.
- [ ] **9.6** Textes ≥ 12 pt, hauteurs minimales au lieu de fixes,
  `maxFontSizeMultiplier` sur la barre d'onglets et la barre vocale ; badge
  Moments annoncé.
- [ ] **9.7** Site : `h2` dans la section fonctionnalités, bouton de pause
  sans double sens, `aria-live` réduit sur les tarifs, alerte de
  `reset-password` annoncée.

## S10 — Site et stores · site · ⏳

- [ ] **10.1** Décisions Q7 appliquées : site aligné sur ce que l'app fait
  vraiment (OMS, statistiques avancées, Famille) ; −37 % / −46 % par offre.
- [ ] **10.2** 2.3 (cases « À compléter »), 2.5 (captures avec texte
  alternatif), garde-fou `grep -c 'class="todo"'` avant déploiement.
- [ ] **10.3** `cleanUrls`, `favicon.ico`, logo 72 px et `apple-touch-icon`
  180 px, og-image en JPEG, JSON-LD enrichi (captures, fonctionnalités,
  `sameAs`).
- [ ] **10.4** CSP : styles inline déplacés pour retirer `'unsafe-inline'` ;
  `connect-src` vérifié pour la page de réinitialisation.
- [ ] **10.5** Fiches « Confidentialité » (App Store) et « Sécurité des
  données » (Google Play) comparées aux flux réels (Sentry, Anthropic,
  AssemblyAI, Resend, RevenueCat) et mises à jour.
- [ ] **10.6** 2.4 : déploiement du site.

**Revue ECC (S9 + S10)** : `a11y-architect`, `seo-specialist`.

## S11 — Tests et CI · ⏳

- [ ] **11.1** `collectCoverageFrom` pour mesurer la vraie couverture, seuils
  recalés sur la nouvelle mesure.
- [ ] **11.2** Tests des tâches planifiées : `checkAndSendReminders`
  (déclenchement, dédoublonnage, jeton invalide), `sendWeeklyRecap`.
- [ ] **11.3** `eventsService` : test paramétré de tous les `ajouterX`.
- [ ] **11.4** Écrans d'authentification et garde de navigation (non
  connecté, non vérifié, suppression en attente).
- [ ] **11.5** E2E multi-utilisateur sur émulateurs (A invite B en lecteur,
  B lit sans écrire, A révoque) ; Maestro (01, 03, 05) la nuit en CI.
- [ ] **11.6** CI : `expo-doctor`, lint des fonctions, Dependabot ; tests
  tautologiques retirés (`firebaseConfig.test.ts`).
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
