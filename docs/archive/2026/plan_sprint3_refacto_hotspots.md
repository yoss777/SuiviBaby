# Sprint 3 — Refactoring hot spots

> **Durée cible :** 2 semaines (10 j ouvrés)
> **Branche :** `sprint3/refacto-hotspots`
> **Préreq :** Sprints 1 & 2 mergés
> **Risque dette :** dette technique concentrée sur 3 fichiers (~5 350 LOC) qui freinent toute évolution

## Objectif

Découper les 3 fichiers monstres identifiés par l'audit, consolider les services dupliqués, éliminer les `any` sur les payloads de données, ajouter des ErrorBoundaries granulaires.

## Vue d'ensemble

| # | Tâche | Effort | Fichiers |
|---|-------|--------|----------|
| 1 | Split `home.tsx` (3067 LOC → 4 composants) | 3 j | `app/(drawer)/baby/(tabs)/home.tsx` |
| 2 | Split `eventsService.ts` (1278 LOC → core + event-types/) | 3 j | `services/eventsService.ts` |
| 3 | Refactorer `BabyContext` `syncState` deps | 1 j | `contexts/BabyContext.tsx` |
| 4 | `MomentsNotificationContext` consolidation state | 1 j | `contexts/MomentsNotificationContext.tsx` |
| 5 | Consolidation services single-export (vaccin, vitamine, sommeil, pompage, croissance) | 1,5 j | `services/{vaccins,vitamines,sommeil,pompages,croissance}Service.ts` |
| 6 | Élimination des `any` sur payloads | 1 j | divers |
| 7 | ErrorBoundaries granulaires (charts, modals, forms) | 0,5 j | nouveaux composants wrappers |

Sous-total **~11 j** — possible de paralléliser tâches 4-7 sur 2 devs si dispo.

---

## Tâche 1 — Split `home.tsx`

### Constat
- `app/(drawer)/baby/(tabs)/home.tsx` : **3067 LOC**
- 31 useState, 7 useRef, 4 hooks custom, 5 useEffect
- HomeSkeleton inliné (94 LOC)
- AppState handler, refresh control, undo logic, insights, stats, recent events tous mélangés

### Stratégie
Découper en 5 composants + 1 hook orchestrateur :

```
app/(drawer)/baby/(tabs)/
├── home.tsx                       # Orchestration only (~400 LOC)
└── home/
    ├── HomeSkeleton.tsx           # ~100 LOC
    ├── HomeStats.tsx              # ~500 LOC — stats panel + 24h summary
    ├── HomeInsights.tsx           # ~400 LOC — insights carousel + dismiss
    ├── HomeRecentEvents.tsx       # ~600 LOC — list + undo + edit
    ├── HomeFooter.tsx             # ~200 LOC — tips, changelog
    └── useHomeAppState.ts         # custom hook — AppState + foreground refresh
```

### Étapes
1. **Audit préalable** (0,5 j) :
   - Lire `home.tsx` complet
   - Cartographier les 31 useState : qui les lit, qui les set
   - Identifier les states "UI ephemeral" (refresh, modal open) vs "logique métier" (dismissed insights)
2. **Extraction `HomeSkeleton`** (0,25 j) :
   - Couper L:72-165 dans `home/HomeSkeleton.tsx`
   - Tester rendering en isolation (Storybook ou test snapshot)
3. **Extraction `useHomeAppState`** (0,5 j) :
   - Sortir l'AppState listener et le foreground refresh dans un hook
   - Signature : `useHomeAppState({ activeChildId, onRefresh })`
4. **Extraction `HomeStats`** (0,75 j) :
   - Identifier le block JSX correspondant aux stats
   - Faire passer `events`, `activeChild` par props (pas par context — composant pur)
   - Mémoriser via `React.memo` + comparator custom
5. **Extraction `HomeInsights`** (0,75 j) :
   - Inclure `dismissedInsights` state + persistance AsyncStorage dans le composant
   - Pattern : composant gère son propre state, expose `onInsightAction(action)` au parent
6. **Extraction `HomeRecentEvents`** (0,75 j) :
   - Inclut `selectedEventId` undo state
   - Reçoit `onEventEdit`, `onEventDelete` callbacks
7. **`HomeFooter`** (0,25 j) — bloc tips/changelog
8. **Réécriture `home.tsx`** (0,5 j) :
   - Devient un composant d'orchestration : récupère contexts, compose les sous-composants
   - Cible : ≤ 400 LOC
9. **Tests** (0,5 j) :
   - Tests unitaires pour chaque sous-composant
   - Test E2E inchangé : la home doit se charger comme avant

### Critères de validation
- `wc -l app/(drawer)/baby/(tabs)/home.tsx` ≤ 400
- Aucune régression visuelle (screenshots avant/après)
- Performance : temps de mount mesuré via `<Profiler>`, pas de régression > 10 %
- Tests existants verts

### Definition of Done
- [ ] 5 composants + 1 hook créés
- [ ] `home.tsx` ≤ 400 LOC
- [ ] Pas de duplication state entre parent/enfants
- [ ] Tests à jour
- [ ] Test manuel sur device : refresh, undo, dismiss insight, navigation

### Risque
- **Risque :** régression subtile sur la sync optimiste (les hooks `useMergedOptimisticEvents` doivent rester appelés au même endroit). Mitigation : tester création + delete event en mode offline.

---

## Tâche 2 — Split `eventsService.ts`

### Constat
- `services/eventsService.ts` : **1278 LOC**
- CRUD core + 25 fonctions spécialisées (`ajouterTemperature`, `ajouterVitamine`, `ajouterBiberon`, `ajouterCouche`, etc.)
- Listeners real-time, stats 24h, optimistic store, offline queue tous mélangés
- Map globale `pendingOptimisticCreateUpdates` (L:39-42) mutée par side-effects

### Stratégie
```
services/
├── eventsService.ts               # Core CRUD only (~300 LOC)
├── events/
│   ├── eventTypes.ts              # Map type → builder + validator
│   ├── builders/
│   │   ├── biberon.ts
│   │   ├── temperature.ts
│   │   ├── vaccin.ts
│   │   ├── vitamine.ts
│   │   ├── couche.ts
│   │   ├── sommeil.ts
│   │   └── ... (tous les types)
│   ├── eventListeners.ts          # ecouterEvenementsDuJour, etc.
│   ├── eventStats.ts              # obtenirStats24h
│   └── optimisticBridge.ts        # pendingOptimisticCreateUpdates encapsulé
```

### Étapes
1. **Audit** (0,5 j) :
   - Lister tous les exports de `eventsService.ts`
   - Catégoriser : core CRUD / builder par type / listener / stats / utility
2. **Création de la structure `services/events/`** (0,25 j)
3. **Extraction des builders par type** (1 j) :
   - Pour chaque type, créer un module avec :
     ```ts
     export const biberonBuilder = {
       type: "biberon" as const,
       buildPayload(data: BiberonData): EventPayload { ... },
       validate(data: BiberonData): ValidationResult { ... },
     };
     ```
   - Le pattern factory permet à `ajouterEvenement` de dispatcher selon `type`
4. **Encapsulation `optimisticBridge.ts`** (0,5 j) :
   - Extraire la Map `pendingOptimisticCreateUpdates`
   - Exposer une API typée : `register(tempId, updater)`, `consume(tempId, realId)`, `cleanup(tempId)`
   - Ajouter un `Map`-with-mutex pattern (ou simple lock via `tempId` UUID) pour éliminer la race potentielle
5. **Extraction listeners** (0,5 j) → `eventListeners.ts`
6. **Extraction stats** (0,25 j) → `eventStats.ts`
7. **Réécriture core** (0,5 j) :
   - `eventsService.ts` ne contient plus que `ajouterEvenement`, `modifierEvenement`, `supprimerEvenement`, dispatch via `eventTypes.ts`
   - Déprécier les 25 wrappers `ajouterTemperature` etc. → garder pendant 1 release avec `console.warn` puis supprimer Sprint 4
8. **Migration des callers** (0,5 j) :
   - Remplacer `ajouterTemperature(data)` par `ajouterEvenement({ type: "temperature", data })`
   - Faire un `grep -rn "from.*eventsService" --include="*.tsx" --include="*.ts"` pour lister tous les callers
9. **Tests** (0,5 j) :
   - Tests existants doivent rester verts (les wrappers dépréciés délèguent au core)
   - Ajouter tests pour le dispatch via `eventTypes.ts`

### Critères de validation
- `wc -l services/eventsService.ts` ≤ 300
- Tous les builders typés (zéro `any`)
- Tests `__tests__/services/eventsService.test.ts` verts
- Tests manuels : création de 3 types d'events différents, modification, suppression

### Definition of Done
- [ ] Architecture `services/events/` en place
- [ ] 25 wrappers dépréciés (warning logs en dev)
- [ ] Race condition `pendingOptimisticCreateUpdates` éliminée
- [ ] Tests verts
- [ ] Doc `services/events/README.md` expliquant comment ajouter un nouveau type

---

## Tâche 3 — Refactor `BabyContext` `syncState`

### Constat
- `contexts/BabyContext.tsx` : 9 useEffect, dépendances circulaires indirectes via `syncState` (useCallback recréé quand `children` change → re-trigger les useEffect dépendants)
- Memory dit "0 N+1 re-render" mais l'audit voit encore des cascades potentielles

### Stratégie
1. Sortir `syncState` de `useCallback` → utiliser une **ref mutable** `syncStateRef` mise à jour à chaque render
2. Les useEffect ne dépendent plus de `syncState` directement, mais appellent `syncStateRef.current(...)`
3. Pattern "stable callback" classique pour éviter les recréations

### Patch type
```tsx
// Avant
const syncState = useCallback((updates) => { ... }, [children, hiddenChildrenIds, ...]);

useEffect(() => {
  // utilise syncState
}, [user, syncState]);  // <-- syncState change, useEffect re-run

// Après
const syncStateRef = useRef<typeof syncState | null>(null);
useEffect(() => {
  syncStateRef.current = (updates) => { /* implementation utilisant les states courants via refs */ };
});

useEffect(() => {
  // utilise syncStateRef.current(...)
}, [user]);  // <-- ne dépend plus de syncState
```

### Étapes
1. Lire `contexts/BabyContext.tsx` complet
2. Cartographier les 9 useEffect : quelles deps sont stables vs changeantes
3. Identifier celles qui changent à cause de `syncState` (vs changements légitimes)
4. Appliquer le pattern "callback dans une ref"
5. Tester :
   - Connexion / déconnexion
   - Création / suppression enfant
   - Switch enfant actif
   - Hidden children toggle
   - Reminder prefs change
6. Mesurer le nombre de re-renders via React DevTools Profiler avant/après — cible : –50 % minimum.

### Definition of Done
- [ ] `syncState` plus dans les deps des useEffect
- [ ] Tests `__tests__/contexts/BabyContext.test.tsx` verts
- [ ] Profiler montre réduction des re-renders
- [ ] Pas de régression fonctionnelle

---

## Tâche 4 — `MomentsNotificationContext` consolidation

### Constat
- État fragmenté : `Set<string>`, `Map<string, NotificationType>`, 3 refs, 2 booleans, 1 number
- Logique de merge pas mémorisée → recompute à chaque render
- O(n) sur chaque update

### Stratégie
1. Consolider en un single state object via `useReducer` :
   ```ts
   type State = {
     hasNew: boolean;
     count: number;
     newEventIds: Set<string>;          // au lieu de useState séparé
     newEventTypes: Map<string, NotificationType>;
     counts: { jalons: number; likes: number; comments: number };
     eventIds: { jalons: Set<string>; likes: Set<string>; comments: Set<string> };
   };
   type Action =
     | { type: "MERGE_SNAPSHOT"; payload: { ... } }
     | { type: "MARK_SEEN"; payload: { eventId: string } }
     | { type: "RESET" };
   ```
2. Reducer pure, plus facile à tester
3. Mémoriser le context value via `useMemo`
4. Refs supprimées (sauf si besoin de tracker quelque chose entre renders sans re-trigger)

### Étapes
1. Lire `contexts/MomentsNotificationContext.tsx` complet
2. Reprendre la logique des 3 listeners onSnapshot
3. Réécrire avec `useReducer`
4. Conserver l'API publique (les composants consommateurs ne doivent pas changer)
5. Tester :
   - Notification arrive → badge se met à jour
   - Mark as seen → badge décrémente
   - Switch enfant → reset

### Definition of Done
- [ ] Refonte useReducer en place
- [ ] API publique inchangée (vérifier les callers)
- [ ] Profiler : moins de re-renders descendants
- [ ] Tests verts

---

## Tâche 5 — Consolidation services single-export

### Constat
5 services (`vaccinsService`, `vitaminesService`, `sommeilService`, `pompagesService`, `croissanceService`) refont le même pattern :
- Validation
- Build payload
- Appel CF `validateAndCreateEvent`
- Optimistic update

### Stratégie
Avec la tâche 2 (`services/events/builders/`), ces 5 services deviennent **redondants** : leur logique est portée par les builders + `ajouterEvenement` core.

### Étapes
1. Une fois la tâche 2 mergée :
2. Pour chaque service, vérifier qu'il n'y a **rien d'unique** à part le builder déjà extrait.
3. Si oui : marquer le service `@deprecated`, faire pointer ses exports vers `ajouterEvenement({ type: "...", data })` pour la compat
4. `grep -rn` les imports → mettre à jour les callers (forms surtout)
5. Supprimer le fichier service à la prochaine release

### Definition of Done
- [ ] 5 services dépréciés (jsdoc + warning runtime dev)
- [ ] Tous les callers migrés vers `ajouterEvenement`
- [ ] Tests verts

---

## Tâche 6 — Élimination des `any` sur payloads

### Constat
62 `any` détectés. Acceptables : SDK tiers (`GoogleSignin`, `AppleAuthentication`). Inacceptables : payloads de données (`vitaminesService.ts:3`, `aiInsightsService.ts:45`, etc.).

### Étapes
1. `grep -rn ": any" services/ contexts/ components/ hooks/ --include="*.ts" --include="*.tsx" > /tmp/any-list.txt`
2. Trier en 3 catégories :
   - **A — SDK tiers** : laisser, ajouter `// eslint-disable-next-line @typescript-eslint/no-explicit-any` avec justification
   - **B — Data payloads** : créer le type approprié dans `types/`
   - **C — Quick wins** : remplacer par `unknown` + type guard
3. Cible : passer de 62 → 15 `any` (uniquement catégorie A)
4. Activer ESLint rule `@typescript-eslint/no-explicit-any: error` (avec exclusions précises pour la cat. A)

### Definition of Done
- [ ] Liste réduite à ≤ 15 `any` justifiés
- [ ] ESLint rule active
- [ ] Type checking strict toujours vert

---

## Tâche 7 — ErrorBoundaries granulaires

### Constat
- Une seule `ErrorBoundary` au root (`app/_layout.tsx:3`)
- Si un chart Skia plante → toute l'app affiche l'erreur fallback root

### Étapes
1. Créer `components/SafeBoundary.tsx` :
   ```tsx
   export function SafeBoundary({
     children,
     fallback,
     onError,
   }: { children: React.ReactNode; fallback: React.ReactNode; onError?: (e: Error) => void }) {
     return (
       <ErrorBoundary fallback={fallback} onError={(e) => { Sentry.captureException(e); onError?.(e); }}>
         {children}
       </ErrorBoundary>
     );
   }
   ```
2. Wrapper individuellement :
   - Chaque chart Skia (`TeteesChartSkia`, `PompagesChartSkia`, `RepasChart`, `SommeilChart`) avec un fallback "Graphique indisponible, on a notifié l'équipe"
   - Chaque form complexe (`SoinsForm`, `MealsForm`) avec fallback "Impossible d'afficher le formulaire — relancez l'app"
   - Le bottom sheet de modale globale
3. Tester en injectant un `throw new Error("test")` dans chaque section

### Definition of Done
- [ ] `SafeBoundary` créé
- [ ] 4 charts + 2 forms + bottom sheet wrappés
- [ ] Test manuel : injecter un crash dans un chart → seul le chart affiche le fallback
- [ ] Sentry capture les erreurs séparément

---

## Tests transverses Sprint 3

| Test | Status |
|------|--------|
| `home.tsx` ≤ 400 LOC | ⚠️ requis |
| `eventsService.ts` ≤ 300 LOC | ⚠️ requis |
| `BabyContext` re-renders divisés par 2 (Profiler) | ⚠️ cible |
| Tests unitaires existants verts | ⚠️ requis |
| Tests E2E (Maestro) inchangés | ⚠️ requis |
| Bundle size : pas de régression > 5 % | ⚠️ requis |

## Definition of Done globale Sprint 3

- [ ] 7 tâches mergées
- [ ] Métriques avant/après documentées
- [ ] Code coverage en hausse (les nouveaux composants testés isolément)
- [ ] Bump version `1.2.0` (refacto significatif, pas de feature)
- [ ] Demo interne avant prod
- [ ] Déploiement progressif via TestFlight + Play Console internal track 7 j

## Risques globaux

- **Risque :** régression sur les flows critiques (création event, sync optimiste). Mitigation : tests E2E Maestro renforcés avant le sprint.
- **Risque scope creep** : on peut être tenté de refactorer plus loin (charts, forms). À ne pas faire dans ce sprint — créer un Sprint 5 si besoin.
- **Risque temps :** 2 semaines est ambitieux pour 11 j de travail. Si glissement : prioriser tâches 1-3 (les hot spots), reporter 5-7 au Sprint 4.
