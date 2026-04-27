# Plan — Synchronisation multi-user Promenade & Sommeil (widgets actifs)

Date : 2026-04-23
Auteur : analyse technique pré-implémentation
Statut : **Analyse terminée, implémentation en attente de validation**

---

## 1. Contexte du bug

**Symptôme rapporté** : un utilisateur arrête une promenade depuis `PromenadeWidget`. Sur son propre téléphone, l'UI bascule immédiatement en état "inactive". Sur les téléphones des autres utilisateurs partageant le même bébé, la promenade reste affichée "en cours".

**Même pattern suspecté** pour `SleepWidget` (sieste / nuit en cours).

Le bug est **silencieux** côté écrivain (USER_A) : l'écriture Firestore se passe bien, la CF répond OK. Le problème est côté lecteurs (USER_B, USER_C…).

---

## 2. Architecture actuelle — cartographie

### 2.1 Fichiers impliqués

| Rôle | Fichier | Lignes clés |
|---|---|---|
| Widget UI promenade | [components/suivibaby/dashboard/PromenadeWidget.tsx](components/suivibaby/dashboard/PromenadeWidget.tsx) | L.82-96 (`handleStart`/`handleStop`) |
| Widget UI sommeil | [components/suivibaby/dashboard/SleepWidget.tsx](components/suivibaby/dashboard/SleepWidget.tsx) | L.64-81 (`handleStart`/`handleStop`) |
| Conteneur logique + détection actif | [app/(drawer)/baby/(tabs)/home.tsx](app/(drawer)/baby/(tabs)/home.tsx) | L.1294-1318 (`sommeilEnCours`/`promenadeEnCours`) ; L.1746-1813 (handlers) ; L.2159-2195 (listener Firestore) |
| Formulaire sommeil (submit finalisation) | [components/forms/RoutinesForm.tsx](components/forms/RoutinesForm.tsx) | L.502-542 |
| Formulaire activité (submit finalisation) | [components/forms/ActivitiesForm.tsx](components/forms/ActivitiesForm.tsx) | L.359-390 |
| Service events (listener + CRUD optimiste) | [services/eventsService.ts](services/eventsService.ts) | L.465-571 (`ecouterEvenements`), L.1019-1119 (opérations optimistes), L.1151-1162 (`ecouterEvenementsDuJour`) |
| Store optimiste + merge | [services/optimisticEventsStore.ts](services/optimisticEventsStore.ts) | L.236-295 (`mergeWithFirestoreEvents`) |
| Hook de merge | [hooks/useMergedOptimisticEvents.ts](hooks/useMergedOptimisticEvents.ts) | L.104-107 (`refreshMerged`) |
| Queue offline | [services/offlineQueueService.ts](services/offlineQueueService.ts) | L.131-199, L.263-272 |
| Config Firebase | [config/firebase.ts](config/firebase.ts) | L.37 (`getFirestore(app)`) |

### 2.2 Détection de l'état "en cours"

`home.tsx` L.1294-1318 :

```ts
sommeilEnCours = data.sommeils.find(item =>
  !softDeletedIds.has(item.id) && item.heureDebut && !item.heureFin);

promenadeEnCours = data.activites.find(item =>
  item.typeActivite === "promenade" && item.heureDebut && !item.heureFin);
```

La logique est **correcte**. Le bug n'est pas là : il est dans la fraîcheur de `data.sommeils` / `data.activites`.

### 2.3 Chaîne de données

```
Firestore (events collection)
        │
        ▼  onSnapshot (ecouterEvenementsDuJour, home.tsx:2159)
setFirestoreEvents(events)
        │
        ▼  scheduleMerge() (debounce 50 ms, useMergedOptimisticEvents)
mergeWithFirestoreEvents(firestore + optimisticStore)
        │
        ▼  mergedTodayEvents (home.tsx useEffect L.2197)
buildTodayEventsData → data.sommeils / data.activites
        │
        ▼  useMemo L.1294-1318
sommeilEnCours / promenadeEnCours
        │
        ▼
PromenadeWidget.isActive / SleepWidget.isActive
```

### 2.4 Flux start (OK)

`onStart` → `handleStartPromenade` → `ajouterEvenementOptimistic(…, { heureDebut: new Date(), heureFin: undefined })` → optimistic store update + CF async + Firestore create → `onSnapshot` → tous les devices voient le nouveau event avec `heureFin` absent → `promenadeEnCours` détecte → widgets passent `isActive: true` sur tous les devices.

**Ce flux fonctionne correctement en multi-device** (observé en pratique : le démarrage se propage).

### 2.5 Flux stop (bug)

`onStop` → `handleStopPromenade` ouvre une sheet `ActivitiesForm` avec `heureFin` pré-rempli → utilisateur valide → `modifierEvenementOptimistic(childId, eventId, { heureFin: Date, duree: N })` → optimistic store + CF async `validateAndUpdateEvent` → Firestore `updateDoc({ heureFin, duree })`.

Sur USER_A : le merge local intègre immédiatement l'update optimiste → `promenadeEnCours` devient `undefined` → widget passe inactive. **OK.**

Sur USER_B : devrait recevoir le `onSnapshot` via son listener actif (`home.tsx:2159`), appeler `setFirestoreEvents(events)`, déclencher `scheduleMerge`, et voir `heureFin` apparaître. **Ne se produit pas de manière fiable.**

---

## 3. Analyse des causes racines

### 3.1 Hypothèse principale — Listener jamais recréé, cache Firestore potentiellement stale

Le listener `ecouterEvenementsDuJour` est installé **une seule fois** par instance de `home.tsx` :

```ts
// home.tsx L.2159-2195
useEffect(() => {
  const unsubscribe = ecouterEvenementsDuJour(
    activeChild.id,
    (events) => setFirestoreEvents(events),
    { waitForServer: true },
    handleListenerError,
  );
  return () => unsubscribe();
}, [activeChild?.id, currentDay, setFirestoreEvents]);
```

Il n'est recréé que si `activeChild.id` ou `currentDay` change. En théorie, `onSnapshot` en temps réel doit pousser les mises à jour ; en pratique, plusieurs facteurs peuvent bloquer la propagation :

- **Mise en veille longue** : si l'app USER_B est en background/killed, la connexion Firestore est fermée par le système (RN / iOS backgrounding). Au retour au foreground, Firestore tente de reprendre, mais **aucun code ne force un refresh serveur explicite**.
- **App Check / reconnexion silencieuse** : si App Check échoue ou que la socket Firestore ne reconnecte pas proprement, le listener peut rester "installé" mais silencieux.
- **Cache local** : Firestore SDK JS (utilisé ici, pas la variante native RNFirebase) maintient un cache mémoire qui persiste tant que l'app n'est pas killée. Un `onSnapshot` peut renvoyer le cache avant de synchroniser.

**Preuve dans le code** : `home.tsx:1846-1854`, le handler `AppStateChange` ne touche **que `currentTime` et `currentDay`**. Il ne force aucun refresh Firestore. Seul `currentDay` peut recréer le listener — et uniquement au passage à minuit.

```ts
const handleAppStateChange = (nextAppState: string) => {
  if (nextAppState === "active") {
    const now = new Date();
    setCurrentTime(now);
    const newDay = `${now.getFullYear()}-${now.getMonth()}-${now.getDate()}`;
    setCurrentDay((prev) => (prev !== newDay ? newDay : prev));
    scheduleNextUpdate();
  }
};
```

De même, `useFocusEffect` L.2212-2216 appelle `refreshMerged()` au focus d'onglet. Mais `refreshMerged()` **ne refetch rien côté serveur** : il re-fusionne simplement les données déjà en mémoire ([hooks/useMergedOptimisticEvents.ts:104-107](hooks/useMergedOptimisticEvents.ts#L104-L107)).

```ts
const refreshMerged = useCallback(() => {
  lastFingerprintRef.current = "";
  scheduleMerge();  // ← re-merge local, aucun refetch Firestore
}, [scheduleMerge]);
```

**→ Si le listener temps réel de USER_B est "endormi" ou a raté l'update, rien ne le réveille.**

### 3.2 Hypothèse secondaire — Soft-delete / cache contamination

`softDeletedIds` (home.tsx:L.1304-1306) filtre les events marqués comme supprimés localement. Si une incohérence de sync ajoute l'eventId ici indûment, l'event serait masqué. **Peu probable** comme cause racine car le bug est "promenade reste active" (event toujours affiché), pas "event disparu".

### 3.3 Hypothèse tertiaire — CF partielle / rules refusant l'update

Si `validateAndUpdateEvent` échoue silencieusement côté USER_A (CF rejette, rules bloquent), l'optimistic store afficherait localement `heureFin` sur USER_A mais Firestore ne serait jamais mis à jour → USER_B ne voit rien changer. À vérifier avec les logs Firebase. **À écarter avant fix** via test empirique.

### 3.4 Hypothèse quaternaire — Offline queue bloque l'update

Si USER_A était offline au moment du stop, l'update est mis en queue SQLite ([services/offlineQueueService.ts](services/offlineQueueService.ts)). L'update ne part qu'au retour en ligne. Pendant ce laps, USER_B ne peut évidemment rien voir — comportement attendu, pas un bug. Mais il faut vérifier que la queue **se vide effectivement** (statut, `retryCount`).

---

## 4. Effets de bord du système optimistic actuel

1. **Divergence perçue** : USER_A voit l'UI mise à jour instantanément par le merge optimiste. USER_B dépend uniquement du listener Firestore. Toute dégradation du listener est invisible pour USER_A (qui sait que "ça a marché") mais bloquante pour USER_B.

2. **`refreshMerged()` trompeur** : son nom suggère un refresh réseau, il ne fait qu'un recompute local. Les 3 `useFocusEffect` qui l'appellent donnent un faux sentiment de sécurité.

3. **Écriture silencieuse de la feuille de validation** : stopper une promenade passe par `ActivitiesForm` / `RoutinesForm` — le flux "tap stop → je valide la sheet" peut être interrompu (user ferme la sheet sans submit). Dans ce cas **rien n'est écrit**, mais c'est une UX attendue, pas un bug multi-device.

4. **Pas de heartbeat ni de version field** : rien ne permet de détecter qu'un listener est "endormi". Aucun field `updatedAt` exploité côté client pour forcer une reconnexion périodique.

5. **`waitForServer: true` peut retarder l'update initial**, mais pas les deltas. Donc n'explique pas le bug en cours de session.

6. **Logs verbeux** : `ecouterEvenements` log `[L:xxxx] SNAP …` à chaque snapshot. Utile pour diagnostiquer — à examiner sur USER_B pendant reproduction du bug.

---

## 5. Risques

| Risque | Probabilité | Impact | Mitigation |
|---|---|---|---|
| Recréer le listener à chaque foreground cause un flash de l'UI (données "vides" transitoires) | Moyen | Moyen | Garder les events précédents pendant la recréation (pattern `preserveExisting` existe déjà dans `setFirestoreEvents`) |
| Multiplier les reconnexions augmente la conso réseau / App Check tokens | Faible | Faible | Ne recréer que si l'app a été >30 s en background |
| Un `disableNetwork/enableNetwork` global impacte **tous** les listeners d'un coup (diapers, meals, routines, etc.) | Moyen | Moyen | Préférer une recréation ciblée du listener home, pas un reset global |
| Forcer `getDocsFromServer` bypasse le cache mais coûte en reads Firestore | Faible | Faible | Utiliser uniquement sur AppState→active, pas en boucle |
| Régression sur flux start (déjà fonctionnel) | Faible | Fort | Ne pas toucher au flux `ajouterEvenementOptimistic`. Les fixes doivent être côté listener/refresh, pas côté write |
| Un fix qui marche en dev (connexion rapide) mais pas en prod (réseau dégradé) | Moyen | Fort | Tester en conditions dégradées : 3G throttle + background 5 min |

---

## 6. Plan d'action

### Étape 0 — Diagnostic empirique (PRÉREQUIS — ne pas sauter)

**But** : confirmer l'hypothèse 3.1 avant d'implémenter.

1. **Reproduire le bug** avec 2 comptes partageant un bébé, en observant les logs `[L:xxxx] SNAP …` côté USER_B.
   - Cas A : les 2 apps au foreground, USER_A stop promenade → USER_B reçoit-il un SNAP ? (attendu oui)
   - Cas B : USER_B met l'app en background 2 min, USER_A stop promenade, USER_B revient au foreground → reçoit-il un SNAP ? (hypothèse : non / tardif)
   - Cas C : USER_B kill l'app, USER_A stop, USER_B relance → (attendu oui, nouveau listener)
2. **Vérifier côté Firestore console** que `heureFin` est bien écrit dans le doc événement après stop côté USER_A. Valide / invalide l'hypothèse 3.3.
3. **Vérifier l'offline queue** sur USER_A (`offline_events_queue` SQLite) : rien ne doit rester en `pending` après retour en ligne. Valide / invalide 3.4.

**Critère de passage à l'étape 1** : le bug est reproductible dans le cas B et la donnée est bien écrite sur Firestore. Si ce n'est pas le cas, revoir le plan (la cause n'est pas le listener endormi).

---

### Étape 1 — Force-refresh du listener au retour en foreground

**Fichier** : [app/(drawer)/baby/(tabs)/home.tsx](app/(drawer)/baby/(tabs)/home.tsx) L.1846-1855

**Changement** : étendre le handler `handleAppStateChange` pour forcer un refetch serveur du jour courant quand l'app redevient active après >30 s de background.

Approche recommandée : au passage `active`, déclencher un fetch one-shot via `obtenirEvenementsDuJour` (existe déjà, L.1144-1148) et appeler `setFirestoreEvents(events, { preserveExisting: false })`. Le hook `useMergedOptimisticEvents` est déjà équipé pour ne re-render que si le fingerprint change — pas de flash.

Alternative : recréer le listener (unsubscribe + resubscribe). Plus agressif, mais garantit une reconnexion propre de la socket Firestore.

**Critère d'acceptation** :
- Au retour au foreground après ≥30 s, `data.sommeils` et `data.activites` reflètent l'état Firestore réel dans ≤2 s.
- Pas de flash UI vide.
- Pas de double-fetch si l'app est foreground <30 s.

---

### Étape 2 — Renommer / clarifier `refreshMerged`

**Fichier** : [hooks/useMergedOptimisticEvents.ts](hooks/useMergedOptimisticEvents.ts) L.104-107

**Changement** : le nom ment. À minima, ajouter un commentaire `// local re-merge only, does NOT refetch Firestore`. Idéalement renommer en `recomputeMerged` et introduire un vrai `refreshFromServer` qui appelle `obtenirEvenementsDuJour`.

**Critère d'acceptation** :
- Les 3 appels existants (`home.tsx` L.2214, et 2 autres via `useFocusEffect`) sont relus et chacun utilise la bonne fonction.
- Aucune régression de comportement.

---

### Étape 3 — Bouton "Terminer" direct sur le widget actif (dé-risque UX)

**Fichiers** : [components/suivibaby/dashboard/PromenadeWidget.tsx](components/suivibaby/dashboard/PromenadeWidget.tsx) L.164-175 ; home.tsx L.1787-1813

**Observation** : actuellement `handleStopPromenade` **ouvre une sheet** — l'utilisateur doit taper "Terminer" puis re-valider dans le formulaire. Sur un autre utilisateur, tant que la sheet n'est pas validée, **aucune écriture n'a lieu**. Le widget de USER_A peut déjà afficher "en cours" correctement si USER_A n'a pas validé.

**À confirmer en Étape 0** : le bug est-il un "vrai" bug de sync (Étape 1) ou un malentendu UX (l'utilisateur croit avoir stoppé mais n'a pas validé la sheet) ?

Si malentendu UX : proposer un tap direct "Terminer" qui écrit `heureFin: now, duree: elapsed` sans passer par la sheet (la sheet reste accessible via un bouton secondaire "éditer avant d'enregistrer"). Réduit le risque d'oubli de validation.

**Critère d'acceptation** :
- Tap "Terminer" sur le widget → écriture immédiate sans sheet.
- Option "éditer avant d'enregistrer" toujours disponible.
- Pas d'écriture double si l'utilisateur tape puis ouvre la sheet.

---

### Étape 4 — Vérifier / tester l'offline queue pour les updates de fin

**Fichier** : [services/offlineQueueService.ts](services/offlineQueueService.ts)

**Action** : test manuel — passer USER_A en avion, stopper une promenade (la sheet écrit via `modifierEvenementOptimistic`, qui enqueue si offline). Revenir en ligne et vérifier que l'update part (logs `processQueue`), que Firestore reçoit `heureFin`, et que USER_B voit la fin.

**Critère d'acceptation** :
- Un stop fait offline est systématiquement synchronisé au retour en ligne.
- Aucun event ne reste en statut `pending` ou `syncing` >60 s après reconnexion.

---

### Étape 5 — (Optionnel) Instrumentation légère pour détecter les listeners endormis

**Fichier** : [services/eventsService.ts](services/eventsService.ts) L.465-571

**Changement** : logger la durée depuis le dernier snapshot reçu. Si >5 min sans snapshot et l'app est active, remonter une alerte Sentry pour diagnostiquer en prod.

**Critère d'acceptation** :
- Un compteur `lastSnapshotAt` par listener.
- Un warning en prod si >5 min d'inactivité snapshot pour un listener actif.
- Pas d'impact perf (timer cheap).

---

## 7. Ordre d'exécution

1. **Étape 0** — diagnostic empirique (bloquant, sans commit)
2. **Étape 1** — force-refresh au foreground (fix principal)
3. **Étape 4** — validation offline queue (fix adjacent, test seul)
4. **Étape 2** — clarification `refreshMerged` (cleanup, à faire avec Étape 1)
5. **Étape 3** — tap direct sur widget (UX, à décider selon résultat Étape 0)
6. **Étape 5** — instrumentation (prod monitoring, indépendant)

---

## 8. Tests de non-régression

- ✅ Démarrer une promenade sur USER_A → visible ≤2 s sur USER_B (flux existant)
- ✅ Démarrer une sieste sur USER_A → visible ≤2 s sur USER_B
- ✅ Arrêter une promenade sur USER_A → disparaît de USER_B ≤2 s (app au foreground)
- ✅ USER_B en background 2 min, USER_A arrête → au retour de USER_B, état à jour ≤2 s **(scénario du bug actuel)**
- ✅ USER_A offline arrête, revient en ligne → USER_B voit la fin ≤5 s après reconnexion
- ✅ USER_A stop, n'ouvre/valide pas la sheet → widget reste "en cours" sur les 2 devices (comportement attendu, pas un bug)
- ✅ Scroll/tab navigation sur USER_B n'altère pas l'état affiché
- ✅ Pas de flash "données vides" au retour foreground
- ✅ Aucun nouveau warning / erreur Sentry
- ✅ Pas d'augmentation significative des reads Firestore (mesurer avant/après sur 24 h)

---

## 9. Hors-scope (à documenter mais ne pas traiter ici)

- Migration vers Firestore local persistence explicite (nécessiterait `initializeFirestore` + `persistentLocalCache`) — changement transversal.
- Passage du SDK JS à `@react-native-firebase/firestore` — refonte majeure.
- Suppression du pattern sheet pour tous les events de type "chrono" — UX globale, à discuter séparément.

---

## 10. Checklist de validation finale

- [ ] Étape 0 terminée, cause racine confirmée
- [ ] Fix implémenté selon le plan
- [ ] Tous les tests de non-régression §8 passent sur 2 devices réels
- [ ] Test en réseau dégradé (3G throttle) OK
- [ ] Aucune fuite mémoire / listener non désabonné (React DevTools + Firebase console)
- [ ] Logs `[L:xxxx] SNAP` propres en prod (pas de spam)
- [ ] PR review par pair
