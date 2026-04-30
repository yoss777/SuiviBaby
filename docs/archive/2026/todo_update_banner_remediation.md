# Remédiation — Bandeau de mise à jour app

**Date** : 2026-04-08
**Contexte** : Le bandeau de mise à jour ne s'affichait plus alors que l'app `1.0.1` est publiée sur le Play Store. Cause racine : Firestore `app_config/latest_version.latestVersion` était resté à `"1.0.0"`, donc `compareSemver("1.0.1", "1.0.0") === 1`, donc `updateAvailable === false`.

---

## ✅ Fait

- **Firestore corrigé** via [scripts/updateAppConfig.mjs](scripts/updateAppConfig.mjs) → `latestVersion: "1.0.1"`, `releaseNotes: "Corrections et améliorations de stabilité"`. Les users encore sur `1.0.0` verront le bandeau au prochain login.

---

## 🟡 À faire — Code (validé fonctionnellement, en attente d'exécution)

### 1. Refactor `components/ui/AppUpdateManager.tsx`

**Objectif** : visibilité Sentry sur les échecs + recheck en foreground pour les sessions longues.

**Changements précis** :

1. **Imports à ajouter** :
   ```ts
   import { captureServiceError } from "@/utils/errorReporting";
   import { AppState, type AppStateStatus } from "react-native";
   ```

2. **Constante de throttle** (6 heures, justification : compromis entre fraîcheur et coût Firestore) :
   ```ts
   const RECHECK_THROTTLE_MS = 6 * 60 * 60 * 1000;
   ```

3. **Refs d'état** dans le composant :
   ```ts
   const lastVersionCheckRef = useRef<number>(0);
   const isCheckingRef = useRef<boolean>(false);
   ```

4. **Extraction de `runVersionCheck`** (useCallback stable) — bloc actuel `checkForUpdate` + gestion AsyncStorage + setState banner. Catche avec `captureServiceError({ service: "appUpdate", operation: "managerVersionCheck" })`. Met à jour `lastVersionCheckRef.current = Date.now()` en `finally`. Garde anti-réentrance avec `isCheckingRef`.

5. **Extraction de `runChangelogCheck`** (useCallback stable) — bloc actuel `getUserContentState` → `setShowChangelog`. Catche avec `operation: "managerChangelogCheck"`.

6. **`useEffect [firebaseUser]` initial** : appelle séquentiellement `runVersionCheck()` puis `runChangelogCheck()`. Comportement actuel préservé.

7. **Nouveau `useEffect [firebaseUser, runVersionCheck]`** :
   - Listener `AppState.addEventListener("change", handler)`.
   - Handler : si `nextAppState === "active"` ET `Date.now() - lastVersionCheckRef.current > RECHECK_THROTTLE_MS` → `runVersionCheck()` (PAS le changelog).
   - Cleanup : `subscription.remove()` (pattern identique à [home.tsx:1799-1811](app/(drawer)/baby/(tabs)/home.tsx#L1799-L1811)).

8. **Remplacer les `catch {}` silencieux** par les logs Sentry via `captureServiceError`.

**Garanties** :
- Aucun changement de comportement pour les users actifs (login = même flow qu'avant).
- Le changelog ne se rouvrira pas en boucle (la garde `seenChangelog` reste effective).
- Pas de hammer Firestore : throttle 6h + garde réentrance.
- Pas de race condition (isCheckingRef).

**Risques identifiés** : aucun. Refactor purement additif.

---

### 2. Workflow `.github/workflows/release.yml` — Sync Firestore automatique

**Objectif** : ne plus jamais oublier de sync Firestore après une release.

**Nouveau job à ajouter** (après le job `submit`) :

```yaml
sync-app-config:
  name: Sync Firestore app_config
  needs: submit
  if: github.event_name == 'push' && startsWith(github.ref, 'refs/tags/v')
  runs-on: ubuntu-latest
  steps:
    - uses: actions/checkout@v4
      with:
        fetch-depth: 0  # nécessaire pour récupérer les annotations de tag

    - uses: actions/setup-node@v4
      with:
        node-version: 22
        cache: npm

    - run: npm ci

    - name: Extract release notes from tag annotation
      id: notes
      run: |
        NOTES=$(git tag -l --format='%(contents)' "${GITHUB_REF_NAME}")
        if [ -z "$NOTES" ]; then
          NOTES=$(git log -1 --pretty=format:'%s')
        fi
        echo "notes<<EOF" >> $GITHUB_OUTPUT
        echo "$NOTES" >> $GITHUB_OUTPUT
        echo "EOF" >> $GITHUB_OUTPUT

    - name: Update Firestore app_config/latest_version
      run: node scripts/updateAppConfig.mjs
      env:
        GCP_SA_KEY: ${{ secrets.GCP_SA_KEY }}
        RELEASE_NOTES: ${{ steps.notes.outputs.notes }}
```

**Justification des choix** :

- **`needs: submit`** : ne sync Firestore que si le submit aux stores a réussi. Évite d'annoncer une version qui n'existe pas.
- **`if: tag push`** : bloque les `workflow_dispatch` ad-hoc (un build manuel ne doit pas écraser Firestore).
- **`fetch-depth: 0`** : nécessaire pour `git tag -l` qui a besoin de l'historique complet.
- **Tag annotation > commit message** : convention sémantique pour les notes de release.
- **`GCP_SA_KEY`** : déjà disponible dans les secrets (utilisé par `deploy-functions`), réutilisé tel quel par `updateAppConfig.mjs`.
- **Pas de `IOS_STORE_URL`** : placeholder conservé jusqu'à publication App Store (le script garde le default existant).
- **Pas de `MIN_VERSION`** : reste à `"1.0.0"`, pas de force update accidentel.

**Risques résiduels** :

- Si Apple rejette mais Android passe : le job s'exécute (submit a "réussi" du point de vue eas), Firestore annonce 1.0.X aux users iOS qui ne pourront pas l'installer. → **Mitigation future** : split du job par plateforme avec sync conditionnelle. Acceptable tant qu'iOS n'est pas publié.
- Si on dispatch un build manuel sans tag : Firestore ne sera pas sync, il faudra lancer le script à la main (acceptable, c'est le comportement attendu).

---

### 3. Script npm utilitaire

✅ **Déjà présent** : [package.json:19](package.json#L19) expose `update-app-config`. Pas de modif nécessaire.

Usage local :
```bash
RELEASE_NOTES="Hotfix crash login" npm run update-app-config
```

---

## 🔵 À faire — Améliorations recommandées (non bloquantes)

### 4. Garde anti-régression dans `updateAppConfig.mjs`

Avant de PATCH, faire un GET et vérifier que `newVersion >= currentVersion` (semver). Refuser sinon. Évite qu'un revert de tag pousse une version inférieure en prod.

**Effort** : ~20 lignes dans le script. **Impact** : sécurité release.

### 5. Préférence `updates` réactive

Aujourd'hui, si l'utilisateur change la préférence "Mises à jour" pendant la session, `AppUpdateManager` ne le voit pas. Brancher sur un context ou un eventBus.

**Effort** : moyen (nécessite un Context dédié ou réutilisation de l'existant). **Impact** : faible (cas d'usage rare).

### 6. Tests unitaires `appUpdateService`

Aucun test sur `compareSemver` ni `checkForUpdate`. Ajouter :
- `compareSemver` : cases (équal, patch, minor, major, missing parts).
- `checkForUpdate` : mocks Firestore retournant les 3 cas (à jour / outdated / force update).

**Effort** : ~80 lignes. **Impact** : couverture du chemin critique de release.

### 7. Corriger le storeUrl iOS placeholder

[services/appUpdateService.ts:91](services/appUpdateService.ts#L91) et [scripts/updateAppConfig.mjs:44](scripts/updateAppConfig.mjs#L44) contiennent `id0000000000`. À remplacer le jour de la publication App Store par le vrai Apple ID.

**Effort** : trivial. **Impact** : bloquant le jour de la sortie iOS.

### 8. Checklist de release dans `PLAN_ACTION_MEP.md`

Ajouter explicitement la ligne « bump Firestore `app_config/latest_version` (auto via workflow OU manuel via `npm run release:publish-version`) » dans la checklist de release pour que la procédure soit redondante (humain + auto).

---

## Ce que je ne fais PAS

- ❌ Ajouter une réactivité sur la préférence `updates` (hors scope, comportement existant inchangé).
- ❌ Ajouter des tests (pas de framework de test sur ces composants, à faire dans un suivi dédié).
- ❌ Modifier `appUpdateService.ts` (le service est déjà correct, pas besoin de toucher).
- ❌ Toucher au placeholder iOS (non bloquant, pas publié).
- ❌ Commit / push (mémoire `[No commit/push without asking]` respectée).

---

## Ordre d'exécution suggéré

1. **Code** : modifications 1 (AppUpdateManager) + 3 (script npm) → 1 commit "fix: app update banner robustness"
2. **CI** : modification 2 (release.yml) → 1 commit "ci: auto-sync Firestore app_config on release"
3. **Améliorations** : 4 (garde régression), 6 (tests), 8 (checklist) → ordre libre
4. **À planifier** : 5 (préférence réactive), 7 (storeUrl iOS) → quand pertinent

---

## Notes contextuelles

- Mémoire `[No commit/push without asking]` à respecter : aucun commit/push sans validation explicite.
- Le script `scripts/updateAppConfig.mjs` est déjà fonctionnel et a été testé avec succès le 2026-04-08 pour pousser `1.0.1`.
- Les règles Firestore (`firestore.rules:486-489`) autorisent déjà la lecture de `app_config` à tout user authentifié — pas de modification de rules nécessaire.
- Le composant `AppUpdateManager` est monté une seule fois dans `app/_layout.tsx:103` — pas de risque de listeners dupliqués.
