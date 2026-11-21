# Suivi des actions — échéances et contrôles

> Créé le 2026-11-01. **À relire chaque lundi.** Mettre à jour le statut et la
> date dès qu'une action avance ; ajouter toute nouvelle échéance ici.
>
> Statuts : ⏳ à faire · 🔄 en cours · ✅ fait · ⛔ bloqué

## 0. Revue ECC du 2026-11-19 : ce qui reste réellement

Revue par 4 relecteurs ECC (silent-failure-hunter, security-reviewer,
code-explorer, code-reviewer) sur `main` f87b49d, en lisant le code. Plusieurs
lignes étaient périmées : S6 (fiabilité, 6.1-6.9), S14 (TRANSFER), A4, 4.5 et
2.3 étaient déjà faits ; leurs statuts ci-dessous sont corrigés.

**Code — avant le lancement payant**

| Id | Sujet | Taille | Preuve / reste |
|---|---|---|---|
| R1 | **Clés RevenueCat de production encore provisoires** : en version publiée, `getApiKey()` renvoie `null`, donc aucun achat possible | S (après création des apps RevenueCat par Yoss) | `services/revenueCatService.ts:19-22`. Débloque P4 du plan stratégique (tests achat, restauration, remboursement, fin d'essai sur les deux OS) |
| R2 | ✅ 1.0.24 (à vérifier avec un abonnement test annulé, et un achat à vie) — Abonnement expiré encore vu Premium dans le repli Firestore et le cache (7 j). Corrigé : même règle que le serveur, `expiresAt` gardé dans la copie locale, retour en gratuit à l'échéance app ouverte ; achat à vie reconnu comme actif | S | `utils/premiumEntitlement.ts`, `services/revenueCatService.ts` (`getStatusFromCustomerInfo`), `contexts/PremiumContext.tsx` |
| R3 | ✅ corrigé sur la branche 1.0.24, en ligne après fusion et déploiement du site — Site faux par rapport à l'offre. Aligné sur l'écran Premium de l'app : partage illimité gratuit pour tous (plus « 2 co-parents »), Premium « jusqu'à 50 commandes vocales par jour » (plus « illimitées »), « Partage illimité » retiré du Premium, badge « Le plus choisi » retiré (aucune donnée), « Sombre la nuit » réglable ; FAQ et données structurées alignées. Rapport PDF gardé (1 en gratuit, illimité en Premium : exact) | S | `public/index.html` (tarifs, FAQ, partage, JSON-LD) |
| R4 | App Check non imposé en production | S (feu vert Yoss) | S4 ; commencer par les fonctions sensibles (`APPCHECK_ENFORCE_FUNCTIONS`) |
| R5 | Rapport pédiatre (décision A du 11/11) inexistant | L | Conditionne O2, O3, O4, P2 du plan stratégique |
| R6 | Mesure « rapport → essai » (O3) et liens `ref` par canal (M1) | M chacun | Aucun outil d'analyse aujourd'hui (`services/onboardingAnalytics.ts` reste local) |
| R7 | Essai proposé à J-5 d'un examen (O2) | L | Aucun calendrier des examens dans le code |
| R8 | Prédictions (porte P1 du 18/12) | M à L | Aucune prédiction avec fourchette dans le code : construire ou retirer de l'offre (décision Yoss) |

**Code — reste de la recette 1.0.22 et du widget**

| Id | Sujet | Taille | Preuve |
|---|---|---|---|
| R9 | ✅ 1.0.24 Android, ⚠️ iPhone → R22 — Jeton `device_tokens` non supprimé après une déconnexion hors ligne. La déconnexion ne supprime plus que le jeton de ce téléphone (avant : tous les appareils du compte perdaient notifications et widget). Android : si le document n'a pas pu être supprimé (hors ligne, délai, déconnexion forcée), le jeton FCM est supprimé (`unregisterForNotificationsAsync`) et le serveur efface le document au prochain envoi (DeviceNotRegistered) ; hors ligne, terminé au lancement suivant. iPhone : pas d'équivalent (la désinscription ne rend pas le jeton invalide et peut empêcher la réinscription, vérification ECC du 20/11) | M | `services/pushTokenService.ts` (`removePushTokens`, `stopPushOnThisDevice`, `stopPushAfterSessionEnd`), `contexts/AuthContext.tsx` |
| R10 | ✅ 1.0.24 — InfoModal et PromptModal sans défilement en grande police : `DialogScroll` dans les quatre fenêtres (Confirmation, Information, Saisie, Choix) | S | `components/ui/DialogParts.tsx` (`DialogScroll`) |
| R11 | ✅ 1.0.24 — Bandeau « Pas de connexion internet » qui clignote à l'ouverture : venait de `components/ui/OfflineBanner.tsx`, jamais monté (code mort), supprimé. Le bandeau réellement affiché est « Hors ligne » dans `app/(drawer)/_layout.tsx`, qui ne s'affiche que si le téléphone est sûr d'être hors ligne (pas de clignotement) | S | `app/(drawer)/_layout.tsx:188` |
| R12 | ✅ 1.0.24 — Durée enregistrée arrondie, chrono tronqué : minutes entières (`Math.floor`), comme le chrono | S | `hooks/useStopTimedEventWithUndo.ts` (`Math.floor`) |
| R13 | ✅ 1.0.24 (à vérifier police au maximum) — Boutons du formulaire Température coupés en très grande police : pied des 8 formulaires sur une ligne (réduit si besoin), signes − et + plafonnés ×1,4 | S | `SoinsForm.tsx` |
| R14 | 🟡 PR ouverte (fonctions, déployées à la fusion) — Écritures live/nursing toutes « urgentes », sans limite de débit. Corrigé : par enfant, 5 s au moins entre deux envois urgents (une rafale = un envoi urgent différé avec l'état récent), urgence héritée par la saisie qui prend la main, 60 urgents par fenêtre d'une heure (au-delà : normal sur Android, iPhone inchangé). Détail : `docs/strategie/widget/LOT5_JALON4_PERF.md` § R14 | M | `functions/src/widget/fanout.js` (`claimUrgentSlot`, `sendUrgent`) |
| R15 | 🟡 1.0.25 en deux temps — Règle `invitations` sans `email_verified`. 1) 1.0.25 : l'app ne cherche plus les invitations par une adresse non vérifiée, et une recherche refusée n'efface plus les invitations liées au compte (sans cela, la règle aurait vidé la liste des invitations dans la 1.0.24 des comptes non vérifiés). 2) Règle (branche `fix/r15-invitation-rules`) : à fusionner quand la 1.0.25 est installée par tous (`app_config` minVersion ≥ 1.0.25) | S | `services/childSharingService.ts` (`canQueryByEmail`) ; `firestore.rules` (`emailMatches`) |
| R16 | Retrait du bucket photos US et des miroirs (1.8, le 02/12) puis règles de transition (12.7 du plan d'audit, le 07/12) | M | `utils/photoStorage.ts:14,16` |
| R17 | Captures du site avec l'app actuelle (2.5) | M | images inchangées depuis le 30/10 |
| R18 | Workload Identity Federation au lieu de `GCP_SA_KEY` (11.7 du plan d'audit) | M | `.github/workflows/deploy-functions.yml:7-19` |
| R19 | Lien du site dans les partages de célébration : code prêt en 1.0.24 (`buildShareMessage`, `SHARE_APP_URL`), coupé par la constante `SHARE_INCLUDE_APP_LINK` (`constants/app.ts`). Activer = ajouter l'adresse du site en dernière ligne du message partagé : passer la constante à `true` dans la version de MEP (2/2/2027) une fois les fiches stores publiques et la page d'accueil corrigée (R3). Avis board + ECC du 20/11 : 7 « oui sous conditions », 13,9/20 ; lien = `https://suivibaby.com`, sans code parrain (décision de Yoss), prénom gardé | S | `services/milestoneCelebrationService.ts`, `constants/app.ts` |
| R20 | Suivi des clics du lien de partage (`utm_source=celebration`) : seulement quand les analyses (R6) et la politique de confidentialité seront à jour. Bilan après environ 4 semaines | S | dépend de R6 |
| R21 | Patch `patches/expo-router+58.0.30.patch` (navigation perdue quand Android recrée l'activité) : à chaque mise à jour d'expo-router, vérifier si le correctif est intégré en amont, puis retirer ou refaire le patch. Un test échoue volontairement si la version change | S | `__tests__/expoRouterBridgePatch.test.tsx` |
| R22 | 🟡 Serveur déployé le 20/11 (PR #125, `revokeDeviceToken` ACTIVE), côté app dans la 1.0.25 (décision de Yoss du 20/11) — iPhone : après une déconnexion hors ligne ou forcée, l'ancien compte pouvait recevoir ses rappels (prénom de l'enfant, type de soin, temps écoulé) sur ce téléphone jusqu'à la prochaine connexion. Défaut antérieur à la 1.0.24. Corrigé : fonction Cloud sans compte `revokeDeviceToken({ token, userId })` qui supprime `device_tokens/<jeton>` seulement si le jeton et l'ancien compte correspondent (jamais le document d'un compte qui a repris le jeton), 10 appels/min par IP, réponse identique dans tous les cas ; l'app met le jeton en attente quand la déconnexion n'a pas pu supprimer le document et l'envoie sans faire attendre la déconnexion, puis au retour du réseau, au lancement et avant toute nouvelle inscription. À vérifier sur iPhone après déploiement et build 1.0.25 | M | `functions/src/notifications/deviceToken.js`, `services/pushTokenService.ts` (`queueTokenRevocation`, `flushTokenRevocation`), `contexts/AuthContext.tsx` |
| R23 | Écritures client de `children/{c}/live/nursing` sans limite (chaque écriture déclenche la fonction : coût non borné par R14, qui ne borne que les envois). Piste (revue ECC 21/11) : règle refusant deux écritures à moins de 500 ms à 1 s (`serverUpdatedAt`). À mesurer d'abord : fréquence réelle des écritures de l'app (changements de côté rapides) ; s'applique aussi aux apps installées | S | `firestore.rules` (live) |

**Tests sur téléphone** : 27 à 31 (1.0.23), 5 à 8 encore « — », un test
d'effacement des widgets restés en consentement 2.2, A4 avec de vrais comptes
Google et Apple.

**Décisions et actions de Yoss** : médiateur CM2C (2.2, puis site 2.4) ;
prix et durée d'essai (O1 : le plan dit 24,99 € / 14 j, l'app et le site
29,99 € / 7 j) ; widget gratuit ou Premium ; historique 90 jours ; gel du
périmètre (P3) ; activation iOS du widget en direct ; minConsentVersion 2.3
après la politique en ligne ; AIPD et garanties de transfert Expo ; test de
restauration des sauvegardes (A7) ; événement de test Sentry (A6) ; secrets
Apple réels ; relecture pédiatre (A5) ; réglages RevenueCat et stores
(3.1, 3.4, 3.5).

**Hors priorité (après le 2/2/2027)** : bloc « En cours » (P1), boutons du
petit widget iPhone (P2), découpage du formulaire des routines.

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
| 2.3 | Compléter les 4 cases jaunes de `privacy.html` : DPO (→ D2), sauvegardes (→ D1), région Sentry (→ D3), non-entraînement des IA (→ D5) | 2026-11-30 | Yoss (décisions) / Claude (intégration) | Section 5 | `grep -c 'class="todo"' public/*.html` → 0 | ✅ vérifié le 2026-11-19 : 0 case jaune dans `privacy.html` ; les 2 restantes (`terms.html:190`, `mentions-legales.html:86`) sont celles du médiateur (2.2) |
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
| 4.5 | Passer `cleanupExpiredShareCodes` et `purgeDeletedChildren` en `europe-west1` (aujourd'hui `us-central1`, sans région explicite) pour que « fonctions serveur dans l'UE » soit exact | 2026-11-15 | Claude (feu vert Yoss) | — | `firebase functions:list` : plus aucune fonction en us-central1 hors miroirs (supprimés en 1.8) | ✅ vérifié le 2026-11-19 : `setGlobalOptions({ region: "europe-west1" })` (commit 2eee015) ; `firebase functions:list` → 46 fonctions en europe-west1, seules les deux miroirs (1.8) restent en us-central1 |

## 4 bis. Sécurité — audit ECC du 2026-11-02

| # | Action | Échéance | Qui | Dépend de | Contrôle | Statut |
|---|---|---|---|---|---|---|
| S1 | **Critique.** Règles Firestore : un membre pouvait se déclarer `owner` via une invitation ou un code de partage, réécrire une invitation (`childId`), un admin pouvait changer `ownerId` | immédiat | Claude | — | Tests de règles (`npm run test:rules`) : 126/126 | ✅ corrigé et déployé le 2026-11-02 |
| S2 | Contrôler en production qu'aucun accès `owner` ne diffère de `children.ownerId` (exploitation passée de S1) | 2026-11-04 | Claude (Yoss : `gcloud auth application-default login`) | S1 | Script d'audit en lecture seule : 0 suspect | ✅ 2026-11-02 : 6 accès owner, 1 seul ≠ `ownerId` (`LWZFCdDkjLymDv7I1E9O`, co-propriétaire ajouté par l'owner lui-même) → légitime |
| S3 | `functions/accessControl.js` (`canWriteEvents`) : le rôle n'est pas vérifié comme dans les règles | 2026-11-15 | Claude | — | Test unitaire viewer refusé | ✅ 2026-11-02 : `hasChildRole` strict pour le partage (`createShareInvitation`, quota de partage) ; un contributeur ne peut plus inviter. Écriture d'événements inchangée (`canWriteEvents`) ; déployé le 2026-11-02 |
| S4 | Activer App Check côté fonctions (`APPCHECK_ENFORCE=true`) après vérification des versions installées | 2026-11-30 | Claude (feu vert Yoss) | 1.0.6 majoritaire | Appels sans jeton refusés, aucune hausse d'erreurs Sentry | ⏳ |
| S5 | Invitations par e-mail : exiger un e-mail vérifié (`email_verified`) dans `acceptInvitationCF` et les règles | 2026-11-30 | Claude | décision sur la vérification à l'inscription | Compte non vérifié refusé | 🔄 fonctions faites (`assertVerifiedEmail` dans createShareInvitation, acceptInvitationCF, redeemShareCodeCF, roles ; commit 8c9ecc2). Reste la règle `invitations` (`firestore.rules:360`, TODO M2) : l'invité peut refuser sans e-mail vérifié, impact faible |
| S6 | Limitation de débit des fonctions non transactionnelle (contournable en parallèle) | 2026-11-30 | Claude | — | Test de charge simple | ✅ corrigé le 2026-11-02 (lecture + écriture du compteur dans une transaction) |
| S7 | Lancer les tests de règles dans le CI (`ci.yml`, émulateur) | 2026-11-15 | Claude | — | Job CI vert, échoue si une règle régresse | ✅ 2026-11-02 : job « Security rules tests (emulator) » vert sur GitHub (run 41407045523) |
| S8 | Premium coupé dès l'annulation au lieu de `expiresAt` ; ordre des événements du webhook RevenueCat non vérifié (`functions/index.js`) | 2026-11-15 | Claude | — | Tests du webhook | ✅ 2026-11-02 : Premium (voix, analyses) gardé jusqu'à `expiresAt` après annulation ou incident de paiement ; ordre des events basé sur `event_timestamp_ms` (`lastEventTimestampMs`) ; déployé le 2026-11-02 |
| S9 | Relecture ECC (2026-11-02) : index `user_child_access` falsifiable, bootstrap `ownerId` réutilisable pour se restaurer, propriétaire principal supprimable par un co-owner, codes de partage lisibles par un viewer et sans contrôle d'expiration, invitations créables en direct (contournait le quota) | immédiat | Claude | — | Tests de règles 133/133 | ✅ corrigé et déployé le 2026-11-02 |
| S10 | Changement de rôle : les droits d'écriture restaient en place (un viewer rétrogradé gardait `canWriteEvents`) | prochaine version de l'app | Claude | build 1.0.7 | Test `updateChildAccess` ; vérifier en prod les accès viewer avec `canWriteEvents: true` | 🔄 corrigé dans le code (`utils/permissions.ts`), à livrer en 1.0.7 ; audit prod du 2026-11-02 : 0 accès sur 10 avec des droits au-delà de son rôle |
| S11 | Webhook RevenueCat : types d'événements inconnus réécrivaient l'abonnement en « active » (tier possiblement free) ; remboursement gardait Premium ; période de grâce ignorée | avec le push | Claude | — | Tests webhook | ✅ déployé le 2026-11-02 (push `0969178`, 35/35 fonctions) |
| S12 | `createShareInvitation` résolvait l'invité via `users.email` (modifiable par chacun) → via Firebase Auth | avec le push | Claude | — | Test dédié | ✅ déployé le 2026-11-02 (push `0969178`) |
| S13 | Restes de la relecture : `acceptInvitationCF`/`redeemShareCodeCF` ne vérifient pas un enfant en suppression ; `findUserByEmail` lit encore `users.email` ; événements TRANSFER non gérés ; parrainage qui peut rétrograder un abonné Famille ; codes générés avec `Math.random` | 2026-11-30 | Claude | — | Tests dédiés | ✅ corrigé le 2026-11-02 : enfant en suppression et émetteur toujours owner/admin vérifiés à l'acceptation et au code ; `findUserByEmail` via Firebase Auth ; parrainage (plantage `exists()` + ne rétrograde plus un abonné payant) ; codes générés par `expo-crypto` (app, 1.0.7). TRANSFER : ne vient plus des restaurations/achats (« Keep with original App User ID » renvoie une erreur au lieu de transférer), mais d'autres sources restent possibles (doc RevenueCat muette) ; l'événement est aujourd'hui ignoré par le webhook (pas d'`app_user_id`) → à gérer (S14) |
| S14 | Webhook : gérer TRANSFER (`transferred_from` → free, `transferred_to` → tier des `entitlement_ids`) pour que les quotas serveur suivent un éventuel transfert | 2026-11-30 | Claude | — | Test webhook TRANSFER | ✅ vérifié le 2026-11-19 : `handleRevenueCatTransfer` (`functions/src/billing/revenuecat.js:107`, commit 8c9ecc2), tests `functions/__tests__/sprint4.test.js:436-526`. Pas de relecture via l'API REST RevenueCat (basse priorité) |
| D11 | **Décision** : le rôle « Contributeur » est décrit « Peut liker et commenter uniquement » (permissions par défaut de l'app), mais les invitations et codes de partage créent les contributeurs avec `canWriteEvents: true` | — | Yoss | — | — | ✅ tranché le 2026-11-02 (Yoss) : contributeur = likes et commentaires sur les photos uniquement, aucun événement ; les invitations et codes de partage n'accordent plus `canWriteEvents` (déployé le 2026-11-02, `0969178`) |

## 4 ter. Performance de l'écran Statistiques — audit ECC du 2026-11-04

Plan détaillé, user stories et mesures : [STATS_PERF_REFONTE.md](STATS_PERF_REFONTE.md). Branche `stats-review`.

| # | Action | Échéance | Qui | Dépend de | Contrôle | Statut |
|---|---|---|---|---|---|---|
| P0 | Sprint 0 — mesure de référence (jeu de 3 000 événements, profils sur le Samsung) | 2026-11-07 | Claude | — | Tableau « Mesures » rempli (avant) | ✅ 2026-11-05 : référence 28 ms de calcul par rendu, 21 rendus de l'écran, 3 graphiques montés (Node, 3 000 événements) |
| P1 | Sprint 1 — calculs des graphiques stables et rapides (memo, une passe, corrélation repas/sommeil) | 2026-11-10 | Claude | P0 | Tests d'agrégation verts, chiffres identiques | ✅ 2026-11-05 : 32 tests d'équivalence (Paris, UTC, São Paulo) |
| P2 | Sprint 2 — écran réactif (React.memo, onglet actif seul, état de chargement unique, sans délai de 300 ms) | 2026-11-13 | Claude | P1 | 1 graphique monté à l'ouverture, aucune tâche JS > 100 ms | ✅ 2026-11-05 : 1 graphique monté à l'ouverture, plus de délai de 300 ms ; revue ECC corrigée |
| P3 | Sprint 3 — requêtes bornées, semaines anciennes à la demande, PDF par requête ponctuelle | 2026-11-18 | Claude | P2 | Volume chargé indépendant de l'ancienneté, PDF identique | ✅ 2026-11-05 : 3 écouteurs sur 3 semaines (132 événements au lieu de 3 000) |
| P4 | Sprint 4 — cache affiché tout de suite, fusion optimiste allégée | 2026-11-21 | Claude | P3 | Ouverture sans spinner quand des données sont en cache | ✅ 2026-11-05 : cache affiché d'abord ; revue ECC corrigée (courses, hors ligne, PDF partiel) |
| P5 | Sprint 5 — nettoyage (logs, code mort `*ChartSkia.tsx`, gestes) et mesure finale | 2026-11-24 | Claude | P4 | Mesures « après » remplies, branche prête à fusionner | ✅ 2026-11-05 : nettoyage fait ; reste la mesure sur le Samsung et la fusion sur `main` |

## 4 quater. Audit complet ECC du 2026-11-05 — actions P0

Rapport complet (P0, P1, P2, feuille de route) : [AUDIT_COMPLET_2026-11.md](AUDIT_COMPLET_2026-11.md). Plan des 13 sprints : [PLAN_SPRINTS_AUDIT.md](PLAN_SPRINTS_AUDIT.md) (A1-A3 → S1, A6-A7 → S2, A4 → S3, A5 → S5).

| # | Action | Échéance | Qui | Dépend de | Contrôle | Statut |
|---|---|---|---|---|---|---|
| A1 | Webhook RevenueCat : marqueur anti-doublon dans la transaction (aucun paiement perdu sur erreur) | 2026-11-12 | Claude | — | Test : transaction en échec puis retry → abonnement appliqué | ✅ code vérifié le 2026-11-19 (marqueur `revenuecat_webhook_events/{eventId}` dans la transaction) |
| A2 | Parrainage : champs non modifiables par le client, usage tracé côté serveur, code serveur | 2026-11-12 | Claude | — | Tests de règles + test : 2ᵉ usage refusé même après effacement de `referredBy` | ✅ code vérifié le 2026-11-19 (`firestore.rules:695-701`, `functions/src/billing/referral.js`) |
| A3 | Une seule purge `purgeUserData` pour les deux parcours de suppression ; e-mail seulement après succès Auth ; photos avant événements | 2026-11-12 | Claude | — | Test qui compare les collections purgées | ✅ code vérifié le 2026-11-19 (`functions/src/deletion/purgeUser.js`) |
| A4 | Comptes Apple/Google : consentement santé bloquant + suppression de compte par ré-authentification fournisseur + révocation Apple | 2026-11-19 | Claude | — | Parcours testé avec un compte Google et un compte Apple | ✅ code vérifié le 2026-11-19 (commit fefaeb5, correctifs e11519b et df3ef13) : écran `app/(auth)/health-consent.tsx`, ré-auth `services/accountDeletionService.ts:206-240`, révocation Apple `functions/src/deletion/apple.js`. Reste : parcours testé avec un vrai compte Google et Apple ; vérifier que les secrets Apple ne sont pas factices (sinon révocation ignorée, `apple.js:43`) |
| A5 | Messages de santé : alerte fièvre selon l'âge à la saisie, « C'est normal », « meilleur endroit », fiche cododo | 2026-11-26 | Claude (code) / Yoss (relecture pédiatre) | relecture pédiatre | Textes validés et notés | 🔄 code fait (commits ae0b5a3, e94c2e6 : `utils/temperatureAlert.ts`, fiche cododo dans `data/tips_seed.json`). Reste la relecture pédiatre (= 5.7 de PLAN_SPRINTS_AUDIT) et vérifier que les conseils sont poussés en prod (`compareTipsWithSeed.mjs`) |
| A6 | Sentry en production : filtrage des données de santé, DSN EAS, source maps, release/dist | 2026-11-12 | Claude / Yoss (DSN) | D3 | Événement de test reçu, sans donnée de santé | 🔄 DSN (UE) et jeton dans EAS, source maps activées (PR #14) ; événement de test à la prochaine version |
| A7 | Sauvegardes Firestore + protection contre la suppression + alertes serveur et budget | 2026-11-19 | Yoss (gcloud) / Claude | D1 | Sauvegarde visible, restauration testée, alerte de test reçue | 🔄 Sauvegardes 7 j / 30 j, protection, 3 alertes e-mail, budget 25 €/mois en place ; test de restauration après la 1ʳᵉ sauvegarde |

## 4 quinquies. Après la MEP — pistes produit validées

| # | Action | Échéance | Qui | Dépend de | Contrôle | Statut |
|---|---|---|---|---|---|---|
| P1 | Accueil : bloc « En cours » en haut, qui regroupe toutes les sessions actives (tétée, sieste, balade) et n'apparaît que s'il y en a une ; les cartes Sommeil et Balade du bas restent les boutons de démarrage. Avis ECC (UX et architecture, 2026-11-17) : ne pas le faire avant la MEP ; un composant partagé `ActiveSessionCard`, à faire avec le découpage Sommeil / Hygiène des formulaires ; annoncer l'apparition du bloc aux lecteurs d'écran | après le 2/2/2027 | Claude | MEP | Une tétée et une sieste en cours apparaissent côte à côte en haut ; rien quand aucune session ; lecteur d'écran annonce le bloc | ⏳ |
| P2 | Petit widget iPhone : reconnaître le ■ touché (boutons interactifs iOS 17+, patch natif d'expo-widgets : intent qui ouvre l'app avec le bon lien). Aujourd'hui l'app demande « Arrêter quelle session ? » | v1.1 | Claude | MEP | Prototype iOS 18 sur appareil, puis iOS 17 | ⏳ |

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
