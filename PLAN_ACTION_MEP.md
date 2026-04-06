# PLAN D'ACTION MEP — SuiviBaby v1.0.0

> **Date :** 5 avril 2026
> **Source :** Audit approfondi par 9 agents spécialisés (13 rapports, ~389 KB)
> **Score qualité actuel :** 7.1/10 (DBA), 3.2/5 (UX), ~3% coverage tests
> **Objectif :** Production-ready pour soumission App Store + Play Store
> **Cible :** fin mai 2026

---

## RÉSUMÉ EXÉCUTIF

L'audit identifie **89 items actionnables** dont **15 CRITICAL**, **28 HIGH**, **32 MEDIUM**, **14 LOW**.

**5 bloqueurs unanimes (tous les rapports concordent) :**
1. Privacy Policy sans URL HTTPS publique — rejet store garanti
2. Firebase keys committées dans git — fuite sécurité
3. Coverage tests < 3% — déploiement en aveugle
4. Branding incohérent Samaye/SuiviBaby — confusion stores
5. Firestore rules faille sur eventLikes/eventComments — fuite données cross-enfant

**Forces du projet :**
- Architecture Cloud Functions solide (21 CFs, validation, rate limiting)
- Offline-first complet (SQLite queue, optimistic store)
- RGPD exemplaire (soft-delete 30j, multi-owner voting, purge auto)
- Voice service bien refactoré (9 modules)
- RevenueCat intégré avec webhook

---

## PHASE 0 — URGENCES IMMÉDIATES (J+1, 1 jour) ✅ TERMINÉE (6 avril 2026)

> Actions à exécuter **immédiatement**, avant tout autre développement.
> Aucune dépendance, chaque action est indépendante.

### 0.1 — Supprimer les Firebase keys du git
- **Sévérité :** CRITICAL
- **Fichiers :** `google-services.json`, `GoogleService-Info.plist`
- **Action :** `git rm --cached`, ajouter dans `.gitignore`, rotation des clés Firebase si nécessaire
- **Effort :** 0.5j
- **Validation :** `git log --all -- google-services.json` ne retourne rien après rewrite

### 0.2 — Corriger la faille Firestore eventLikes/eventComments
- **Sévérité :** CRITICAL
- **Fichier :** `firestore.rules`
- **Action :** Remplacer `isSignedIn() && limit <= 10000` par `isSignedIn() && hasAccess(resource.data.childId)` sur les règles `list` de `eventLikes` et `eventComments`
- **Effort :** 30 min
- **Validation :** Test avec @firebase/rules-unit-testing : un user sans accès au child ne peut pas lister

### 0.3 — Sécuriser revenueCatWebhook
- **Sévérité :** CRITICAL
- **Fichier :** `functions/index.js` (revenueCatWebhook)
- **Action :** Rendre le Bearer secret OBLIGATOIRE (supprimer le `if (secret && ...)` conditionnel). Rejeter toute requête sans secret valide.
- **Effort :** 30 min (1 ligne)
- **Validation :** `curl -X POST` sans header Authorization → 401

### 0.4 — Bloquer delete events client-side
- **Sévérité :** CRITICAL
- **Fichier :** `firestore.rules`
- **Action :** Changer `allow delete: if canWriteEvents(...)` en `allow delete: if false` sur la collection `events`. Seul `deleteEventCascade` CF doit pouvoir supprimer.
- **Effort :** 30 min
- **Validation :** Tentative de delete client-side → permission denied

### 0.5 — Nettoyer le repo git
- **Sévérité :** HIGH
- **Action :**
  - `git rm --cached build-1775398366592.apk` (138 MB)
  - `git rm --cached *.DS_Store pglite-debug.log firestore-debug.log`
  - Ajouter dans `.gitignore` : `*.apk`, `*.DS_Store`, `*-debug.log`, `google-services.json`, `GoogleService-Info.plist`
  - Supprimer `functions/seedUsers.js` du déploiement production
- **Effort :** 0.5j
- **Validation :** `git status` propre, `.gitignore` à jour

### 0.6 — Activer App Check enforcement
- **Sévérité :** CRITICAL
- **Fichier :** `config/appCheck.ts`, variables d'environnement
- **Action :** Mettre `APPCHECK_ENFORCE=true` après 7 jours de monitoring des métriques
- **Prérequis :** Vérifier que tous les clients (iOS, Android) envoient bien un token App Check
- **Effort :** 1j (incluant monitoring)
- **Validation :** Requête CF sans App Check token → rejet

---

## PHASE 1 — FONDATIONS SÉCURITÉ & QUALITÉ (Semaines 1-2, Sprint 1)

> Objectif : corriger toutes les failles CRITICAL restantes et poser les bases tests.

### 1.1 — Sécuriser les Cloud Functions
- **Effort total :** 3j

| Action | Fichier | Effort | Priorité |
|--------|---------|--------|----------|
| `deleteEventCascade` : utiliser batch write (atomicité) | `functions/index.js` | 0.5j | CRITICAL |
| `grandfatherExistingUsers` : vrai admin check (custom claim `admin: true`) | `functions/index.js` | 0.5j | HIGH |
| `validateReferralCode` : ajouter rate limiting | `functions/index.js` | 0.5j | HIGH |
| `voteDeletionRequest`, `transferAndLeave`, `cancelChildDeletion` : rate limiting | `functions/index.js` | 0.5j | HIGH |
| `migrateUsersPublicRemoveEmail` : vérification admin | `functions/index.js` | 0.5j | HIGH |
| `rejectInvitation()` : vérifier que le caller est le destinataire | `functions/index.js` | 0.5j | MEDIUM |

### 1.2 — Durcir les Firestore rules
- **Effort total :** 1j

| Action | Effort |
|--------|--------|
| `children` create : valider champs requis (`name`, `birthDate`, types) | 0.25j |
| Events update : protéger `createdAt` contre mutation client | 0.25j |
| Supprimer fallback legacy `parentIds.hasAny` dans `children` get/update | 0.25j |
| Limiter referral count par sponsor (max 5) | 0.25j |

### 1.3 — Ajouter 4 index Firestore manquants
- **Sévérité :** CRITICAL
- **Fichier :** `firestore.indexes.json`
- **Effort :** 0.5j
- **Index à ajouter :**
  1. Events : `childId` + `date` (range queries par période)
  2. Events : `childId` + `type` + `date` (filtre multi-type)
  3. Events : `userId` (export données utilisateur RGPD)
  4. `user_child_access` : `userId` + `role` (listing enfants par rôle)

### 1.4 — Tests prioritaires P0 (+15-20% coverage)
- **Effort total :** 5j

| Suite de tests | Fichier cible | Tests | Effort |
|----------------|---------------|-------|--------|
| AuthContext | `contexts/AuthContext.tsx` | login, logout, race conditions, guard isMounted | 1j |
| PremiumContext + gating | `contexts/PremiumContext.tsx`, `services/premiumGatingService.ts` | tiers, gating, offline fallback | 0.5j |
| childSharingService | `services/childSharingService.ts` | create code, redeem, revoke, multi-owner | 1j |
| revenueCatService | `services/revenueCatService.ts` | purchase, restore, listener, webhook sync | 0.5j |
| Firestore rules | `firestore.rules` | 10 scénarios (via @firebase/rules-unit-testing) | 1j |
| Cloud Functions (top 5) | `functions/index.js` | validateAndCreateEvent, deleteEventCascade, revenueCatWebhook, transcribeAudio, createDeletionRequest | 1j |

### 1.5 — Sentry : capturer les erreurs services
- **Effort :** 1j
- **Action :** Remplacer `console.warn(error)` par `Sentry.captureException(error)` dans tous les catch blocks des 39 services
- **Fichiers :** Tous les fichiers dans `services/`
- **Validation :** Sentry dashboard reçoit les erreurs

### 1.6 — Corriger le branding Samaye → SuiviBaby
- **Sévérité :** CRITICAL
- **Effort :** 0.5j
- **Fichiers :**
  - `package.json` : `"name": "samaye"` → `"suivibaby"`
  - `app.json` : `"slug": "Samaye"` → `"suivibaby"`
  - `associatedDomains` : vérifier les deep links
  - `onboarding.tsx` : AsyncStorage key `@samaye_onboarding_done` → `@suivibaby_onboarding_done` (+ migration de l'ancien key)

**Critère de fin Sprint 1 :** 0 faille CRITICAL ouverte, coverage > 15%, Sentry actif, branding cohérent.

---

## PHASE 2 — UX & STORE READINESS (Semaines 3-4, Sprint 2)

> Objectif : lever tous les bloqueurs de soumission store.

### 2.1 — Privacy Policy & Terms of Service
- **Sévérité :** CRITICAL (bloqueur store)
- **Effort :** 1j
- **Actions :**
  - Rédiger ou générer (Termly/Iubenda) Privacy Policy et ToS conformes RGPD + CCPA
  - Héberger sur une URL HTTPS publique (suivibaby.com/privacy, suivibaby.com/terms)
  - Remplacer le contenu stub de `app/(auth)/privacy.tsx` (80 bytes) et `app/(auth)/terms.tsx` (74 bytes) par WebView pointant vers les URLs
  - Ajouter les liens dans app.json pour les stores

### 2.2 — Réduire la TabBar de 15 à 5 tabs
- **Sévérité :** CRITICAL (UX catastrophique sur petit écran)
- **Effort :** 2j
- **Action :** Regrouper en 5 tabs maximum :
  1. **Accueil** (dashboard today)
  2. **Journal** (timeline événements)
  3. **Ajouter** (+ central, bottom sheet)
  4. **Insights** (stats, IA, courbes)
  5. **Plus** (social, moments, exports, settings)
- **Fichiers :** `app/(drawer)/baby/(tabs)/_layout.tsx`, réorganisation des routes
- **Validation :** Test sur iPhone SE (320pt largeur)

### 2.3 — Finaliser l'onboarding
- **Effort :** 1.5j
- **Fichier :** `app/(auth)/onboarding.tsx`
- **Actions :**
  - Ajouter slide "Créer mon premier bébé" en fin d'onboarding
  - Forcer la création du premier profil bébé post-inscription
  - Ajouter CTA Premium trial en slide 5
  - Corriger AsyncStorage key legacy (`@samaye_onboarding_done`)
  - Tester le flow complet inscription → onboarding → premier bébé → dashboard

### 2.4 — Paywall interstitiel full-screen
- **Effort :** 3j
- **Actions :**
  - Designer et implémenter un PaywallScreen full-screen (vs inline actuel)
  - Points de déclenchement : post-onboarding, limite feature gratuite atteinte, settings
  - Intégrer RevenueCat offerings
  - A/B test : soft wall (dismiss possible) vs hard wall
- **Fichiers :** Nouveau `app/premium/paywall.tsx`, `services/premiumGatingService.ts`

### 2.5 — Écran "Mon abonnement"
- **Effort :** 2j
- **Action :** Créer un écran dans settings affichant : tier actuel, date renouvellement, historique paiements, bouton gérer/annuler (lien store), progression features utilisées
- **Fichier :** `app/settings/subscription.tsx`

### 2.6 — Contact support in-app
- **Effort :** 1j
- **Fichier :** `app/settings/help.tsx`
- **Action :** Ajouter formulaire de contact (email pré-rempli), lien vers FAQ, option signaler un bug

### 2.7 — Metadata stores
- **Effort :** 3j
- **Actions :**
  - Screenshots (6 écrans min, iPhone 6.7" + 6.5" + iPad optionnel)
  - Description app (court + long), mots-clés ASO
  - Feature graphic (Play Store)
  - Catégorie : Health & Fitness / Parenting
  - Déclaration Data Safety (Play Store)
  - Déclaration permissions (RECORD_AUDIO justification)
  - Age rating / PEGI
  - Privacy Policy URL dans les deux stores

### 2.8 — Nettoyage fichiers parasites
- **Effort :** 0.5j
- **Actions :**
  - Supprimer `splash-demo.tsx` du build production
  - Résoudre duplication `growth.tsx` / `croissance.tsx`
  - Supprimer `modal.tsx` stub (703 bytes)
  - Unifier les icon libraries (choisir FontAwesome6, migrer les imports FA5/Ionicons)

**Critère de fin Sprint 2 :** Tous les bloqueurs store levés, paywall fonctionnel, screenshots prêtes, Privacy Policy en ligne.

---

## PHASE 3 — QUALITÉ & DETTE TECHNIQUE (Semaines 5-6, Sprint 3)

> Objectif : stabiliser le code, augmenter la confiance, supprimer le legacy.

### 3.1 — Supprimer le code migration legacy
- **Effort :** 1j
- **Fichiers à supprimer :**
  - `migration/eventsDoubleWriteService.ts` (18 KB)
  - `migration/eventsHybridService.ts` (6 KB)
  - `migration/MigrationProvider.tsx` (371 bytes)
  - `contexts/PermissionsMigrationContext.tsx`
- **Actions :**
  - Vérifier qu'aucun import n'est actif (grep)
  - Supprimer les fichiers
  - Supprimer `ajouterEvenementAvecId()` de eventsService (utilisé uniquement par migration)
  - Tester que le CRUD events fonctionne sans dual-write
- **Impact :** -25 KB code, -50% coûts writes Firestore

### 3.2 — Refactorer useVoiceCommand
- **Sévérité :** HIGH
- **Effort :** 2j
- **Fichier :** `hooks/useVoiceCommand.ts` (46 KB)
- **Action :** Découper en 3 hooks :
  1. `useAudioRecorder` — gestion enregistrement/permissions
  2. `useVoiceParser` — appel transcription + parsing
  3. `useVoiceEventCreator` — création événement Firebase à partir du résultat
- **Validation :** Tests unitaires sur chaque hook

### 3.3 — Tests Cloud Functions (coverage 100% CFs critiques)
- **Effort :** 3j
- **Setup :** Jest + Firebase Emulator Suite dans `functions/`
- **CFs à tester :** Les 21 CFs, priorité sur :
  1. `validateAndCreateEvent` / `validateAndUpdateEvent` (validation, rate limit)
  2. `deleteEventCascade` (atomicité batch)
  3. `revenueCatWebhook` (sécurité, idempotence)
  4. `createDeletionRequest` / `processScheduledDeletions` (RGPD)
  5. `transcribeAudio` (rate limit, quota)
- **Validation :** `npm test` dans `functions/` → 100% pass

### 3.4 — Tests voice modules
- **Effort :** 2j
- **Fichiers :** `services/voice/*.ts`
- **Actions :** Tester les regex de `detectors.ts` (23 KB) avec cas limites, phoneticNormalizer, timestampParser, commandParser
- **Validation :** 80%+ coverage voice modules

### 3.5 — Correction performance queries
- **Effort :** 1.5j

| Action | Fichier | Effort |
|--------|---------|--------|
| `ecouterEvenements` : ajouter `limit(50)` par défaut + pagination | `services/eventsService.ts` | 0.5j |
| `STALE_THRESHOLD_MS` : augmenter de 20s à 60s | `services/optimisticEventsStore.ts` | 0.1j |
| `todayEventsCache` : persister en AsyncStorage (éviter 30 reads/restart) | `services/todayEventsCache.ts` | 0.5j |
| Offline queue : traitement en batch (pas sériel) | `services/offlineQueueService.ts` | 0.5j |

### 3.6 — CI/CD release workflow
- **Effort :** 2j
- **Fichier :** `.github/workflows/release.yml`
- **Actions :**
  - Trigger : push tag `v*` ou manual dispatch
  - Steps : lint → typecheck → test → EAS Build production → EAS Submit (App Store + Play Store)
  - Secrets GitHub : `EXPO_TOKEN`, `APPLE_ID`, `ASC_KEY`, `GOOGLE_SERVICE_ACCOUNT_KEY`
- **Validation :** Dry run avec `--no-submit`

### 3.7 — Monitoring Firebase coûts
- **Effort :** 0.5j
- **Action :** Configurer Firebase Budget Alerts (seuils : $10, $25, $50/mois)
- **Validation :** Email d'alerte reçu au dépassement seuil test

**Critère de fin Sprint 3 :** Migration supprimée, coverage > 30%, CI/CD release en place, performance queries OK.

---

## PHASE 4 — MONÉTISATION & POLISH (Semaines 7-8, Sprint 4)

> Objectif : monétisation complète, accessibilité, polish UX.

### 4.1 — AdMob (si scope v1.0)
- **Effort :** 5j
- **Actions :**
  - Installer `react-native-google-mobile-ads`
  - Configurer les ad units (banner, interstitiel, rewarded)
  - Afficher ads uniquement sur tier gratuit (conditionné par `PremiumContext`)
  - Placements : bas de l'écran Journal, interstitiel entre événements, rewarded pour débloquer feature premium temporairement
  - Tester sur devices réels (AdMob test IDs)
- **Note :** Si AdMob n'est pas dans le scope v1.0, décaler en v1.1. La monétisation par subscription seule est viable.

### 4.2 — Gating côté serveur (premium)
- **Effort :** 2j
- **Actions :**
  - Dans chaque CF pertinente, vérifier le statut premium de l'utilisateur (query `subscriptions/{userId}`)
  - `transcribeAudio` : quota gratuit 5/jour, illimité premium
  - `generateAiInsight` : gratuit 1/jour, illimité premium
  - `validateAndCreateEvent` : limite événements/jour tier gratuit
- **Fichier :** `functions/index.js`
- **Validation :** User gratuit → rejet CF après quota atteint

### 4.3 — Promo codes côté serveur
- **Effort :** 1j
- **Action :** Migrer la validation de promo codes de `services/promoService.ts` (client) vers une Cloud Function callable
- **Fichier :** Nouveau CF `validatePromoCode` dans `functions/index.js`

### 4.4 — Accessibilité WCAG 2.1 Level AA
- **Effort total :** 2.5j

| Action | Effort |
|--------|--------|
| Implémenter `useReduceMotion` hook, conditionner toutes les animations | 0.5j |
| Audit contraste : vérifier `nc.textLight`, `nc.textMuted`, boutons disabled | 0.5j |
| Touch targets : minimum 44x44pt partout (skipButton onboarding, icons) | 0.5j |
| `accessibilityElementsHidden` sur icons décoratives | 0.25j |
| `accessibilityLabel` sur slides onboarding, FlatList items, modals | 0.25j |
| Focus trap `BabySwitcherModal` : `importantForAccessibility` | 0.25j |
| Legal text `premium.tsx` : fontSize 13 minimum, contraste 4.5:1 | 0.25j |

### 4.5 — UX polish
- **Effort :** 2j

| Action | Effort |
|--------|--------|
| Skeleton shimmer sur home.tsx et activities.tsx | 0.5j |
| Fix `OfflineBanner` doublon (_layout.tsx et drawer/_layout.tsx) | 0.25j |
| Messages d'erreur contextuels (pas "Veuillez réessayer") | 0.5j |
| `DateTimePickerRow` : résoudre les bugs du todo (14 KB) | 0.5j |
| Unifier animations (supprimer LayoutAnimation, garder Reanimated) | 0.25j |

### 4.6 — RevenueCat webhook robustesse
- **Effort :** 1j
- **Actions :**
  - Ajouter HMAC body verification (en plus du Bearer secret)
  - Utiliser transaction Firestore pour éviter race condition double webhook
  - Log les événements webhook dans une collection `webhook_logs` pour debug
- **Fichier :** `functions/index.js` (revenueCatWebhook)

**Critère de fin Sprint 4 :** Monétisation complète (subscriptions + gating serveur + promo serveur), accessibilité AA, UX polished.

---

## PHASE 5 — STABILISATION & SOUMISSION (Semaines 9-10, Sprint 5)

> Objectif : tests finaux, profiling, soumission stores.

### 5.1 — Performance profiling
- **Effort :** 2j
- **Actions :**
  - Mesurer startup time (target < 3s)
  - Analyser bundle size (`npx expo export --dump-sourcemaps`, source-map-explorer)
  - Évaluer `@shopify/react-native-skia` v2.0.0-next.4 (alpha) : si instable, downgrade ou remplacer
  - Vérifier nombre de listeners Firestore actifs simultanément
  - Sentry Performance : ajouter traces startup, navigation, CF calls
- **Validation :** Bundle < 30 MB, startup < 3s, 0 crash en 24h test

### 5.2 — Tests E2E (Maestro)
- **Effort :** 3j
- **Actions :**
  - Setup Maestro
  - 10 flows critiques :
    1. Inscription email → onboarding → créer bébé → dashboard
    2. Login Google OAuth
    3. Ajouter événement (formulaire) → vérifier apparition timeline
    4. Commande vocale → événement créé
    5. Partage enfant → acceptation invitation
    6. Achat Premium → feature débloquée
    7. Suppression événement
    8. Mode offline → sync retour online
    9. Suppression compte (RGPD flow)
    10. Navigation complète (toutes les tabs, drawer, modals)
- **Validation :** 10/10 flows passent sur iOS + Android

### 5.3 — Vérification deleteUserData scope RGPD
- **Effort :** 0.5j
- **Action :** Vérifier que la CF `deleteUserData` supprime bien : `user_content`, `notification_history`, `recap_history`, `webhook_logs`, push tokens, images Storage
- **Fichier :** `functions/index.js`

### 5.4 — Beta test interne
- **Effort :** 2j
- **Actions :**
  - Build preview → TestFlight (iOS) + Internal Testing (Play Store)
  - 5-10 testeurs internes pendant 3-5 jours
  - Collecter feedback, corriger bugs critiques
  - Vérifier Sentry : 0 crash, 0 error non gérée

### 5.5 — Soumission stores
- **Effort :** 2j
- **Prérequis :** Tous les sprints précédents terminés
- **Actions :**
  - `eas build --profile production --platform all`
  - `eas submit --platform ios` + `eas submit --platform android`
  - Remplir les questionnaires store (content rating, data safety, permissions)
  - Vérifier que Privacy Policy URL est accessible et conforme
  - Monitorer la review (délai : 1-3 jours iOS, 1-7 jours Android)

**Critère de fin Sprint 5 :** App soumise sur les deux stores, 0 crash en beta, E2E passent.

---

## POST-MEP — BACKLOG v1.1+ (à prioriser après lancement)

| ID | Action | Effort | Priorité |
|----|--------|--------|----------|
| POST-1 | Refactorer `eventsService.ts` (1076 LOC → 3 modules) | 2j | MEDIUM |
| POST-2 | Refactorer `childSharingService.ts` (757 LOC → 3 services) | 2j | MEDIUM |
| POST-3 | Refactorer `functions/index.js` (2609 LOC → modules) | 3j | MEDIUM |
| POST-4 | Repository pattern (découplage Firebase SDK) | 5j | LOW |
| POST-5 | Évaluer 5 services santé legacy (croissance, sommeil, vitamines, vaccins, pompages) | 2j | LOW |
| POST-6 | Sentry Performance SDK complet (breadcrumbs, sessions) | 1j | MEDIUM |
| POST-7 | Monitoring Cloud Functions (Firebase Alerting, Sentry CF) | 1j | MEDIUM |
| POST-8 | Offline queue : dead-letter handling, depth limit, replay ordering | 2j | MEDIUM |
| POST-9 | Support tablette iPad (`supportsTablet: true`) | 3j | LOW |
| POST-10 | README.md complète pour developer onboarding | 1j | LOW |
| POST-11 | Onboarding personnalisé par rôle (parent/nounou/grand-parent) | 2j | LOW |
| POST-12 | `transcribeAudio` : passer en async (éviter timeout 120s) | 2j | MEDIUM |
| POST-13 | `weeklyRecap` : optimiser reads (agrégation pré-calculée) | 1j | LOW |
| POST-14 | `checkRateLimit` : migration vers compteur atomique (vs array Firestore) | 1j | MEDIUM |
| POST-15 | Offline queue : conflict resolution et garantie d'ordre | 2j | MEDIUM |

---

## TABLEAU RÉCAPITULATIF PAR SPRINT

| Sprint | Semaines | Focus | Effort | Coverage cible |
|--------|----------|-------|--------|----------------|
| **Phase 0** | J+1 | Urgences sécurité | 1j | — |
| **Sprint 1** | S1-2 | Sécurité + Tests P0 + Branding | 12j | 15% |
| **Sprint 2** | S3-4 | UX + Store readiness | 14j | 20% |
| **Sprint 3** | S5-6 | Qualité + Dette + CI/CD | 12j | 35% |
| **Sprint 4** | S7-8 | Monétisation + A11Y + Polish | 13.5j | 40% |
| **Sprint 5** | S9-10 | Perf + E2E + Soumission | 9.5j | 45% |
| **TOTAL** | **10 semaines** | | **~62j** | **45%+** |

---

## ESTIMATION ÉQUIPE & PLANNING

| Scénario | Équipe | Durée | Risque |
|----------|--------|-------|--------|
| **1 dev solo** | 1 dev fullstack | 12-14 semaines | ÉLEVÉ — pas de review, burnout |
| **2 devs** (recommandé) | 1 dev fullstack + 1 dev frontend | 7-8 semaines | MOYEN — review croisée, parallélisation |
| **2 devs + 1 designer** | + UX designer (partiel) | 6-7 semaines | FAIBLE — UX pro, parallélisation maximale |
| **Équipe complète** | 2 devs + 1 designer + 1 QA | 5-6 semaines | MINIMAL — couverture optimale |

**Recommandation :** 2 devs, soumission stores fin mai 2026.

---

## DÉPENDANCES CRITIQUES (CHEMIN CRITIQUE)

```
Phase 0 (J+1)
  ├── SEC-1 (git rm keys) ──────────────────────────────────┐
  ├── SEC-3 (fix rules likes/comments) ─────────────────────┤
  ├── SEC-5 (fix webhook secret) ───────────────────────────┤
  └── SEC-12 (block client delete) ─────────────────────────┤
                                                             │
Sprint 1 (S1-2)                                              │
  ├── 1.1 Sécuriser CFs ◄──────────────────────────────────┘
  ├── 1.2 Durcir Firestore rules
  ├── 1.3 Index manquants ──────────────────────────────────┐
  ├── 1.4 Tests P0 (15% coverage) ─────────────────────────┤
  ├── 1.5 Sentry services ─────────────────────────────────┤
  └── 1.6 Branding Samaye→SuiviBaby ───────────────────────┤
                                                             │
Sprint 2 (S3-4)                                              │
  ├── 2.1 Privacy Policy URL ◄─────────────────────────────┘
  ├── 2.2 Réduire TabBar 15→5 tabs
  ├── 2.3 Finaliser onboarding ──► 2.4 Paywall full-screen
  ├── 2.7 Metadata stores ─────────────────────────────────┐
  └── 2.8 Nettoyage fichiers                                │
                                                             │
Sprint 3 (S5-6)                                              │
  ├── 3.1 Supprimer migration/ ◄────────────────────────────┘
  ├── 3.3 Tests CFs
  ├── 3.5 Performance queries
  └── 3.6 CI/CD release.yml ───────────────────────────────┐
                                                             │
Sprint 4 (S7-8)                                              │
  ├── 4.1 AdMob (si v1.0) ◄────────────────────────────────┘
  ├── 4.2 Gating serveur
  ├── 4.4 Accessibilité
  └── 4.5 UX polish ───────────────────────────────────────┐
                                                             │
Sprint 5 (S9-10)                                             │
  ├── 5.1 Performance profiling ◄───────────────────────────┘
  ├── 5.2 Tests E2E
  ├── 5.4 Beta interne ──► 5.5 Soumission stores
  └── LANCEMENT 🚀
```

---

## KPIs DE SUIVI

| KPI | Valeur actuelle | Cible MEP | Mesure |
|-----|----------------|-----------|--------|
| Test coverage | ~3% | 45%+ | `jest --coverage` |
| Crash-free rate | non mesuré | 99.5%+ | Sentry dashboard |
| Startup time | non mesuré | < 3s | Sentry Performance |
| Bundle size | non mesuré | < 30 MB | `expo export --dump-sourcemaps` |
| Failles CRITICAL | 15 | 0 | Ce plan (Phase 0 + Sprint 1) |
| Failles HIGH | 28 | 0 | Ce plan (Sprint 1-4) |
| Listeners Firestore actifs | non mesuré | < 10 simultanés | Firebase console |
| OWASP Mobile Top 10 | Non conforme | Level AA | Checklist audit |
| Privacy Policy URL | Absente | En ligne | Accessible HTTPS |
| Store metadata | Absente | Complète | Stores connect |

---

## FICHIER DE RÉFÉRENCE

Ce document est la **source de vérité** pour toutes les actions à mener avant la MEP de SuiviBaby v1.0.0.

- **Rapports d'audit source :** `/Users/yoss/ai-dev-team/output/rapport_*_20260405_202023.md` (13 rapports, ~389 KB)
- **Mise à jour :** Ce fichier doit être mis à jour après chaque sprint pour refléter la progression.
- **Tracking :** Chaque item complété doit être marqué ✅ avec la date de completion.

---

*Généré le 5 avril 2026 — Basé sur l'audit multi-agents (9 agents, 13 rapports)*
