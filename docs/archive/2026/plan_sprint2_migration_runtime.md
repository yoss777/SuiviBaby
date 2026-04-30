# Sprint 2 — Migration runtime & dépendances

> **Durée cible :** 1 semaine (5 j ouvrés)
> **Branche :** `sprint2/runtime-migration`
> **Préreq :** Sprint 1 mergé en prod
> **Deadline dure :** Node 20 deprecated le **30 avril 2026** par GCP/Firebase

## Objectif

Mettre à jour l'infrastructure backend avant la deprecation Node 20, nettoyer les dépendances dupliquées, sécuriser le pipeline pour la suite.

## Vue d'ensemble

| # | Tâche | Effort | Fichiers |
|---|-------|--------|----------|
| 1 | Migration Cloud Functions Node 20 → 22 | 1,5 j | `functions/package.json`, `firebase.json` |
| 2 | Upgrade `firebase-functions` 4.x → 5.x | 0,5 j | `functions/index.js`, `functions/__tests__/` |
| 3 | Audit & retrait Firebase JS SDK doublon | 0,5 j | `package.json`, `services/appUpdateService.ts` |
| 4 | Migration plan `expo-av` → `expo-audio` (preview) | 0,5 j (analyse) | `services/voice/recorder.ts` |
| 5 | Nettoyage deps non utilisées (`expo-doctor`) | 0,5 j | `package.json`, voir `todo_expo_doctor_warnings.md` |
| 6 | CI : ajouter `expo lint` + coverage seuil | 0,5 j | `.github/workflows/ci.yml` |
| 7 | Docs migration + runbook rollback | 0,5 j | `docs/RUNTIME_MIGRATION_2026.md` |

Sous-total **~4,5 j** de dev.

---

## Tâche 1 — Migration Cloud Functions Node 20 → 22

### Contexte
- GCP Cloud Functions Gen2 deprecate Node 20 le **2026-04-30**.
- Sans migration : nouvelles deploys bloquées, runtime gracieux jusqu'à août 2026 environ.
- Voir `plan_quota_serveur_et_migration_runtime.md` (déjà en cours selon memory).

### Étapes
1. Vérifier compat Node 22 :
   - `firebase-admin@^12` ✅
   - `firebase-functions@4.9.0` → upgrade requis (voir tâche 2)
   - `resend@^6.9.3` ✅
   - `expo-server-sdk@^6.1.0` ✅
2. Mettre à jour `functions/package.json` :
   ```json
   "engines": { "node": "22" }
   ```
3. Mettre à jour `firebase.json` :
   ```json
   "functions": [{ "source": "functions", "runtime": "nodejs22", ... }]
   ```
4. Bumper `node_modules` localement : `cd functions && rm -rf node_modules package-lock.json && npm install`.
5. Lancer la suite tests `npm run test:functions` — corriger toute régression (probablement aucune si on reste sur les mêmes deps).
6. Déployer **uniquement** sur projet staging (`firebase use staging && firebase deploy --only functions`).
7. Smoke test E2E sur staging (création event, vote, transcribe) — 1 h de monitoring.
8. Promouvoir prod en deploy progressif :
   - Phase A : CFs non-critiques (`getUsageQuotaStatus`, `cleanupExpiredShareCodes`)
   - Phase B (24 h après) : CFs critiques (`transcribeAudio`, `revenueCatWebhook`, `validateAndCreateEvent`)
   - Phase C : reste

### Vérifications GCP
- `gcloud functions list --project=samaye-53723` → tous en `nodejs22`
- Logs : aucune `unsupported runtime` warning
- Cold start : mesurer P95 avant/après (regression possible — Node 22 startup légèrement plus long)

### Risque & rollback
- **Rollback :** rebasculer `engines` → `"20"` + redeploy. Tant que Firebase n'a pas hard-deprecated Node 20, c'est possible (~3 mois de window).
- **Risque :** changement comportement V8 sur certaines opérations async. Couvrir par tests intégration.

### Definition of Done
- [ ] Toutes CFs en `nodejs22` confirmé via `gcloud`
- [ ] Tests `npm run test:functions` verts
- [ ] 7 j en prod sans incident remonté
- [ ] Doc `docs/FIREBASE_MONITORING.md` actualisée (runtime ref)

---

## Tâche 2 — Upgrade `firebase-functions` 4.x → 5.x

### Contexte
- v5 supporte Node 22 nativement
- v5 introduit changements API mineurs (notamment sur `onCall` typing + `HttpsError` import)
- Breaking changes documentés : https://firebase.google.com/docs/functions/beta

### Étapes
1. `cd functions && npm install firebase-functions@^5.1.0 --save`
2. Lire le CHANGELOG v5 pour breaking changes :
   - Imports : `const { onCall } = require("firebase-functions/v2/https")` reste valide ✅
   - `HttpsError` : `const { HttpsError } = require("firebase-functions/v2/https")` ✅
   - Vérifier les triggers Firestore (`functions.firestore.document(...)` style legacy v1) — doivent passer en v2 (`onDocumentCreated` etc.) si pas déjà fait
3. Migrer `functions.firestore` v1 → v2 :
   ```js
   // Avant
   exports.onReportCreated = functions.firestore
     .document("reports/{reportId}")
     .onCreate(async (snap, context) => { ... });
   // Après
   const { onDocumentCreated } = require("firebase-functions/v2/firestore");
   exports.onReportCreated = onDocumentCreated(
     { document: "reports/{reportId}", region: "europe-west1" },
     async (event) => {
       const snap = event.data;
       const reportId = event.params.reportId;
       ...
     }
   );
   ```
4. Faire le même travail pour **toutes** les CFs `functions.firestore.*` et `functions.scheduler.*` (chercher `grep -n "functions\\." functions/index.js`).
5. Refaire passer les tests + smoke staging.

### Definition of Done
- [ ] `firebase-functions@^5.1.0` installé
- [ ] Aucune utilisation de l'API v1 dans `functions/index.js` (`grep -n "functions\\.\\(firestore\\|https\\|scheduler\\|auth\\)" functions/index.js` doit retourner 0)
- [ ] Tests + staging verts

---

## Tâche 3 — Audit Firebase JS SDK doublon

### Constat
- `firebase` (^12.2.1) — utilisé partout (Firestore client, Auth, Storage)
- `@react-native-firebase/app` + `@react-native-firebase/app-check` (^23.8.8) — **uniquement** pour App Check natif (`config/appCheck.ts:84`)

Ce n'est **pas** un vrai doublon : `@react-native-firebase` est requis pour l'App Check natif iOS/Android (le JS SDK ne supporte pas les attestations natives sur RN). Mais ça vaut la peine d'auditer si on l'utilise correctement.

### Étapes
1. `grep -rn "@react-native-firebase" /Users/yoss/Projets/SuiviBaby/{services,contexts,components,app,config,utils}` → vérifier que **seul** `config/appCheck.ts` l'importe.
2. Si oui : c'est OK, garder. Documenter dans `config/appCheck.ts` un commentaire expliquant le pourquoi.
3. Si d'autres fichiers l'utilisent : déterminer si on peut consolider sur le JS SDK.
4. Vérifier la version `@react-native-firebase` compat Expo SDK 53 (devrait être 21.x ou 22.x — actuellement 23.8.8 = potentiellement trop avancée).
5. Tester un build EAS preview iOS + Android pour confirmer App Check natif actif.

### Definition of Done
- [ ] Doc dans `config/appCheck.ts` explicitant le rôle du package
- [ ] `@react-native-firebase` version verrouillée à un range compatible Expo 53
- [ ] Build EAS preview validé

---

## Tâche 4 — Plan migration `expo-av` → `expo-audio`

### Contexte
- `expo-av` (16.0.8) est marqué deprecated dans Expo SDK 53
- Sera supprimé dans SDK 54 (probable Q3 2026)
- Utilisé dans `services/voice/recorder.ts` (recording AssemblyAI)

### Étapes (analyse uniquement ce sprint, exécution sprint 4 ou 5)
1. Lire `services/voice/recorder.ts`
2. Lister les APIs `expo-av` utilisées :
   - `Audio.Recording.createAsync(...)`
   - `Audio.setAudioModeAsync(...)`
   - `Audio.RecordingOptionsPresets.*`
3. Mapper vers `expo-audio` API (preview, https://docs.expo.dev/versions/latest/sdk/audio/) :
   - `useAudioRecorder()` hook
   - `AudioRecorder.startAsync()` / `stopAsync()`
4. Évaluer effort réel (probable 1-2 j)
5. Créer ticket `docs/MIGRATION_EXPO_AUDIO.md` détaillant le diff exact à faire.

### Definition of Done
- [ ] Doc `docs/MIGRATION_EXPO_AUDIO.md` créée avec inventaire APIs + estimation
- [ ] Décision documentée : exécution Sprint 4 ou Sprint 5

---

## Tâche 5 — Nettoyage `expo-doctor` warnings

### Source
`todo_expo_doctor_warnings.md` (existant, non commité)

### Étapes
1. Relire `todo_expo_doctor_warnings.md` complet
2. Pour chaque warning, décision : Fix / Ignore / Plan plus tard
3. Cibles confirmées de ce sprint :
   - Multiple lockfiles → supprimer `pnpm-lock.yaml` si présent
   - `app.json` schema warnings → migrer vers `expo-build-properties` plugin
   - Native folders + `app.config` → documenter la stratégie bare/managed
   - `react-native-sticky-parallax-header` : `grep -rn "sticky-parallax\|StickyHeader" components/ app/` → si 0 résultat, retirer du `package.json`
4. Lancer `npx expo-doctor` → cible : 0 warning
5. Lancer `npx expo install --check` → installer les versions exactes recommandées

### Definition of Done
- [ ] `npx expo-doctor` clean (ou warnings restants documentés et acceptés)
- [ ] Bundle size mesuré avant/après (`npx expo export --platform android` puis `du -sh dist/`)
- [ ] Diff `package.json` revu

---

## Tâche 6 — CI : `expo lint` + coverage seuil

### Constat
- `package.json` a un script `lint` mais il n'est jamais exécuté en CI
- 67 erreurs lint + 157 warnings restantes (selon audit produit)
- Coverage tests existante mais pas de seuil bloquant

### Étapes
1. Ouvrir `.github/workflows/ci.yml`
2. Ajouter une step après `typecheck` :
   ```yaml
   - name: ESLint
     run: npm run lint -- --max-warnings 0
   ```
3. Avant de merger : faire un sprint d'effacement des 67 erreurs (peut être moitié déjà résoluble par `--fix`). Si trop coûteux pour ce sprint : `--max-warnings 200` puis durcir progressivement.
4. Coverage : ajouter à `jest.config.js` :
   ```js
   coverageThreshold: {
     global: { lines: 60, functions: 55, branches: 50 }
   }
   ```
5. Step CI : `npm run test:coverage`
6. Optionnel : badge coverage dans `README.md` via codecov ou github actions artifacts.

### Definition of Done
- [ ] CI échoue si lint errors > seuil
- [ ] CI échoue si coverage < seuil
- [ ] README mis à jour avec les badges
- [ ] Sprint suivant peut compter sur ces garde-fous

---

## Tâche 7 — Doc migration + runbook rollback

### Étapes
Créer `docs/RUNTIME_MIGRATION_2026.md` contenant :
- Versions avant/après (Node, firebase-functions, etc.)
- Procédure rollback CF par CF
- Liste des CFs migrées en v2 triggers
- Checklist post-migration (logs à vérifier, métriques baseline)
- Liens vers les PRs concernées

### Definition of Done
- [ ] Doc créée et commitée
- [ ] Lien dans `README.md` section "Infrastructure"

---

## Tests transverses Sprint 2

| Test | Status |
|------|--------|
| `npm run test:all` (app + functions) vert | ⚠️ requis |
| `npm run typecheck` zéro erreur | ⚠️ requis |
| `npx expo-doctor` clean | ⚠️ requis |
| Smoke E2E staging : login, créer event, transcribe, partage | ⚠️ requis |
| Cold start P95 CFs < 3 s | ⚠️ requis |

## Definition of Done globale Sprint 2

- [ ] CFs en Node 22 + firebase-functions 5.x en prod sans incident 7 j
- [ ] CI durcie (lint + coverage)
- [ ] Plan `expo-audio` documenté
- [ ] Bundle app cleané (deps inutiles retirées)
- [ ] Bump version : `1.1.1` (patch infra, pas de feature user-facing)

## Risques globaux

- **Risque deadline :** si Node 22 migration glisse au-delà du 30 avril, deploys CFs bloquées. Mitigation : commencer Sprint 2 immédiatement après Sprint 1.
- **Risque API breakage :** `firebase-functions` v5 a changé l'API des triggers v1. Tester chaque CF migrée individuellement.
- **Risque CI** : durcissement lint/coverage peut bloquer des PRs. Phase d'avertissement 1 semaine avant blocking.
