# Plan d'action - Propagation add/edit d'events avec optimistic UI

Date: 2026-03-29
Contexte: audit du flux d'ajout / édition des events dans l'application React Native, avec focus sur la propagation à travers les écrans, la cohérence du rendu temps réel, et la compatibilité avec le système optimistic existant.

Checklist runtime associée: `docs/RUNTIME_VALIDATION_CHECKLIST.md`

## Avancement

### Phase 1 - Stabiliser le contrat optimistic/offline

Statut: en grande partie réalisé

Fait:

- ajout d'un statut `queued_offline` dans le store optimistic;
- correction du fallback offline pour ne plus considérer une mutation queueée comme confirmée;
- conservation de l'overlay optimistic jusqu'à convergence Firestore;
- réconciliation des créations via `idempotencyKey`;
- réconciliation des updates quand le snapshot Firestore rejoint l'état optimistic;
- ajout de tests unitaires ciblés sur la réconciliation create/update.

Reste à valider:

- exécution réelle des tests dans un environnement disposant de Node/Jest.

Limite de l'environnement courant:

- la toolchain Node/Jest n'est pas chargée par défaut dans le shell agent; les validations doivent être lancées via `source ~/.nvm/nvm.sh && ...`.

### Phase 2 - Extraire une couche de lecture unifiée

Statut: réalisée pour le hook partagé, en extension via phase 2 bis

Fait:

- extraction du hook partagé `hooks/useMergedOptimisticEvents.ts`;
- centralisation du triptyque:
  - merge Firestore + optimistic
  - debounce
  - fingerprint
- migration de `hooks/useMomentsData.ts` sur ce hook partagé;
- migration de `app/(drawer)/baby/(tabs)/immunizations.tsx` sur ce hook partagé pour la reconstruction de liste.

Reste:

- valider en runtime le comportement des écrans migrés;
- décider plus tard si le hook doit rester un helper de merge seul ou devenir une couche complète incluant aussi l'abstraction du listener Firestore.

### Phase 2 bis - Migrer les tabs qui dupliquent encore le merge optimistic

Statut: réalisée

Fait:

- migration de `app/(drawer)/baby/(tabs)/activities.tsx` sur `hooks/useMergedOptimisticEvents.ts`.
- migration de `app/(drawer)/baby/(tabs)/pumping.tsx`;
- migration de `app/(drawer)/baby/(tabs)/growth.tsx`;
- migration de `app/(drawer)/baby/(tabs)/routines.tsx`.
- migration de `app/(drawer)/baby/(tabs)/meals.tsx`;
- migration de `app/(drawer)/baby/(tabs)/diapers.tsx`;
- migration de `app/(drawer)/baby/(tabs)/milestones.tsx`;
- migration de `app/(drawer)/baby/(tabs)/croissance.tsx`;
- migration de `app/(drawer)/baby/(tabs)/soins.tsx`;
- migration de `app/(drawer)/baby/(tabs)/chrono.tsx`.
- migration de `app/(drawer)/baby/(tabs)/home.tsx`;
- migration de `app/(drawer)/baby/(tabs)/stats.tsx`.

Point d'attention:

- cette phase 2 bis a migré le lot de tabs ciblé pour supprimer la duplication locale du merge Firestore + optimistic;
- `home` et `stats` ont été traités via dérivation locale depuis le hook partagé plutôt que via un simple rendu direct de liste;
- une validation runtime écran reste nécessaire malgré les validations TypeScript et Jest désormais disponibles.

### Phase 3 - Unifier les points d'entrée d'écriture hors pipeline optimistic

Statut: largement réalisée

Fait:

- migrer les écritures de `immunizations`;
- migrer l'ajout rapide d'humeur dans `hooks/useMomentsActions.ts`;
- migrer les ajouts et modifications de `hooks/useVoiceCommand.ts`.

Reste à consolider:

- vérifier qu'aucun autre point d'entrée UI standard ne contourne encore la couche optimistic.

### Phase 4 - Couvrir explicitement tous les types d'events

Statut: largement réalisée

Fait:

- formalisation de la matrice de couverture ciblée dans `docs/EVENT_TYPE_COVERAGE_MATRIX.md`;
- décision explicite sur `couche`: type backend/legacy conservé, mais hors périmètre UI moderne de premier niveau;
- nettoyage de `chrono` pour ne plus présenter `couche` comme un type UI autonome;
- documentation du contrat moderne dans `services/todayEventsCache.ts` et `services/eventsService.ts`;
- ajout de `services/eventTypeSupport.ts` comme source de vérité des types modernes et legacy;
- clarification des flux annexes (`export`, `notifications locales`, `voice formatter`, `voice detectors/types`) pour garder `couche` seulement comme compatibilité backend/legacy.

Reste:

- valider le comportement final en runtime.

### Phase 5 - Centraliser le feedback global

Statut: réalisée côté câblage applicatif

Fait:

- déplacement du branchement `setOnFailure(...)` hors de `home`;
- ajout d'un bridge global dans `app/_layout.tsx` pour relier les échecs optimistic au `ToastProvider`;
- suppression du couplage entre le store optimistic et un écran particulier.

Reste:

- valider en runtime qu'un échec optimistic remonte bien un toast depuis n'importe quel tab.

### Phase 6 - Durcir la détection de changement

Statut: largement réalisée

Fait:

- suppression du fingerprint tronqué aux 30 premiers items dans `services/optimisticEventsStore.ts`;
- calcul d'une empreinte sur la liste mergée complète pour détecter les mutations hors du haut de liste.
- stabilisation du hook partagé `hooks/useMergedOptimisticEvents.ts` pour ne plus dépendre d'une `transformMerged` recréée à chaque render;
- stabilisation des écrans migrés (`chrono`, `meals`, `diapers`, `growth`, `stats`, `croissance`, `soins`, `routines`) avec des callbacks `transformMerged` stables;
- correction de la régression `Maximum update depth exceeded` observée sur `chrono`;
- confirmation du bornage `chrono` à `7/14/30j`, y compris au rechargement des préférences persistées.

Reste:

- valider en runtime l'impact perf sur les listes les plus longues;
- compléter si besoin par une stratégie de hash incrémental plus légère.

### Phase 7 - Tests de non-régression

Statut: partiellement réalisée

Fait:

- extension de `__tests__/optimisticEventsStore.test.ts` sur les scénarios create/update offline déjà couverts;
- ajout d'un test pour la visibilité d'un create confirmé avant arrivée du snapshot Firestore;
- ajout d'un test pour vérifier que `buildEventFingerprint(...)` détecte aussi une mutation hors de l'ancien seuil des 30 items;
- ajout d'un test sur `failOptimistic(...)` pour couvrir le rollback update et le callback d'échec.
- exécution réussie de `npx tsc --noEmit`;
- exécution réussie de `npx jest --runInBand __tests__/eventsService.test.ts __tests__/todayEventsCache.test.ts __tests__/optimisticEventsStore.test.ts` (`13/13` tests OK);
- validation ciblée de la couche commune utilisée par `chrono`, `meals` et `diapers`.

Reste:

- compléter plus tard par des tests d'intégration UI cross-screen si l'outillage de test est disponible.
- compléter plus largement la suite Jest si l'on veut couvrir d'autres services/écrans touchés par la migration.

## Objectif

Garantir que l'ajout et l'édition d'un event:

- se propagent immédiatement dans l'UI;
- restent visibles et cohérents pendant les latences réseau;
- fonctionnent aussi en offline avec la queue existante;
- se réconcilient correctement quand Firestore et les Cloud Functions confirment l'écriture;
- couvrent tous les points d'entrée et tous les types d'events réellement supportés.

## Résumé de l'architecture actuelle

### Source de vérité d'écriture

- Les writes passent par `services/eventsService.ts`.
- Les Cloud Functions serveur sont:
  - `validateAndCreateEvent`
  - `validateAndUpdateEvent`
  - `deleteEventCascade`
- La création a une clé d'idempotence côté client et une déduplication côté serveur.
- L'update convertit les champs `null` en `deleteField()` côté serveur.

### Couche optimistic actuelle

- Le store optimistic mémoire est dans `services/optimisticEventsStore.ts`.
- Les formulaires récents passent majoritairement par:
  - `ajouterEvenementOptimistic`
  - `modifierEvenementOptimistic`
- Le rendu optimistic côté lecture repose sur:
  - `mergeWithFirestoreEvents(...)`
  - `buildEventFingerprint(...)`
  - `subscribe(...)`

### Couche de lecture

- Il n'y a pas de cache global unifié type React Query.
- Chaque écran qui veut du rendu optimistic doit lui-même:
  - écouter Firestore;
  - stocker le dernier snapshot brut;
  - fusionner ce snapshot avec le store optimistic;
  - rerender sur événement optimistic.

## Constat initial

Les sections ci-dessous décrivent l'état observé avant les phases d'implémentation. Elles sont conservées comme historique de cadrage; l'avancement réel et l'état courant font foi dans la section `## Avancement`.

### 1. Le flux optimistic existe, mais il n'est pas centralisé

Le pattern est bon dans son principe, mais il est recopié écran par écran.

Conséquence:

- la propagation dépend du fait que chaque écran implémente le merge local;
- un écran oublié ou partiellement migré ne reflète pas l'optimistic;
- les comportements divergent selon les tabs.

Écrans déjà alignés sur ce pattern:

- `home`
- `chrono`
- `meals`
- `diapers`
- `activities`
- `routines`
- `milestones`
- `pumping`
- `growth`
- `croissance`
- `stats`
- `useMomentsData`

Écrans déjà migrés sur le hook partagé:

- `useMomentsData`
- `immunizations`
- `activities`
- `pumping`
- `growth`
- `routines`
- `meals`
- `diapers`
- `milestones`
- `croissance`
- `soins`
- `chrono`
- `home`
- `stats`

Écrans encore sur implémentation locale du merge optimistic:

- aucun des tabs principaux couverts par la phase 2 bis;
- d'éventuelles surfaces annexes restent à vérifier au fil des futures évolutions.

### 2. Le mode offline casse actuellement la logique optimistic

Dans `ajouterEvenementOptimistic` et `modifierEvenementOptimistic`, si l'appel réseau échoue puis bascule en queue offline:

- l'opération peut être considérée comme confirmée trop tôt;
- ou l'entrée optimistic peut être supprimée;
- alors que l'écriture n'existe pas encore dans Firestore.

Conséquence:

- un event peut disparaître visuellement après ajout offline;
- une édition offline peut revenir à l'ancien état jusqu'au vrai sync;
- le ressenti utilisateur n'est pas cohérent avec la promesse optimistic.

Problème structurel:

- le store mélange aujourd'hui `pending`, `confirmed`, `failed`;
- mais il manque un état métier intermédiaire du type `queued_offline`.

### 3. Tous les points d'entrée n'utilisent pas la couche optimistic

Plusieurs flux écrivent encore via les wrappers classiques:

- `hooks/useMomentsActions.ts` pour l'ajout rapide d'humeur;
- `hooks/useVoiceCommand.ts` pour les commandes vocales;
- `app/(drawer)/baby/(tabs)/immunizations.tsx` pour vaccins et vitamines.

Conséquence:

- l'expérience varie selon le point d'entrée;
- certains events apparaissent instantanément, d'autres non;
- certains parcours utilisent offline + optimistic, d'autres offline seul.

État courant:

- `hooks/useMomentsActions.ts`, `hooks/useVoiceCommand.ts` et `app/(drawer)/baby/(tabs)/immunizations.tsx` ont été migrés sur la couche optimistic;
- ce point reste maintenant un contrôle de non-régression plutôt qu'un gap structurel ouvert.

### 4. Immunizations est en dehors du contrat cible

L'écran `immunizations`:

- n'utilise pas `ajouterEvenementOptimistic` / `modifierEvenementOptimistic`;
- ne merge pas le store optimistic dans ses données lues;
- reconstruit sa liste à partir de deux listeners Firestore purs.

Conséquence:

- `vaccin` et `vitamine` sont des types partiellement exclus du système optimistic réel;
- la propagation n'est pas homogène avec le reste de l'application.

État courant:

- `immunizations` lit désormais via le hook partagé et écrit via `ajouterEvenementOptimistic` / `modifierEvenementOptimistic`;
- `vaccin` et `vitamine` sont inclus dans le contrat moderne supporté.

### 5. Le type `couche` n'est pas couvert de bout en bout

Le type `couche` existe dans le modèle et côté backend, mais sa prise en charge UI est incomplète.

Constats:

- pas de bucket dédié dans `todayEventsCache`;
- pas de parcours clair d'édition dédié dans le flux moderne;
- l'écran couches travaille surtout sur `miction` et `selle`.

Conséquence:

- on ne peut pas affirmer que "tous les events" sont couverts tant que `couche` n'est pas explicitement traité.

État courant:

- le point a été tranché produit/architecture: `couche` reste supporté côté backend et compatibilité, mais n'est plus un type UI moderne de premier niveau;
- le domaine moderne "couches" s'appuie sur `miction` et `selle`, y compris pour le rendu cross-screen et l'optimistic.

### 6. Le feedback d'erreur optimistic n'est pas branché globalement

Le callback de notification d'échec du store optimistic est branché depuis `home`.

Conséquence:

- le toast d'erreur n'est pas garanti si l'utilisateur est ailleurs;
- la gestion d'erreur dépend d'un écran particulier, alors que le store est global.

### 7. La stratégie de fingerprint est utile mais imparfaite

`buildEventFingerprint` ne prend qu'un sous-ensemble des events.

Conséquence:

- une mutation sur un event ancien peut ne pas déclencher le rerender attendu;
- le système peut sembler "marcher la plupart du temps" tout en ratant des cas réels.

## Cible technique

Nous voulons un contrat unique:

1. Toute mutation event passe par une même couche applicative.
2. Cette couche applique immédiatement un état optimistic local.
3. Si le réseau répond:
   - la mutation est réconciliée avec Firestore;
   - l'ID temporaire est remplacé proprement si nécessaire.
4. Si le réseau est indisponible:
   - la mutation reste visible;
   - elle passe dans un état `queued_offline`;
   - elle est rejouée plus tard sans perte visuelle.
5. Tous les écrans lisant des events utilisent un merge partagé et non une implémentation ad hoc.

## Plan d'action détaillé

### Phase 1 - Stabiliser le contrat optimistic/offline

Objectif:

- corriger la sémantique du store pour que offline ne casse jamais le rendu.

Travaux:

- Introduire un statut dédié pour les opérations mises en queue offline:
  - `queued_offline`
  - ou équivalent clair côté store
- Ne plus marquer comme `confirmed` une opération simplement queueée.
- Ne plus supprimer l'entrée optimistic tant que le snapshot Firestore réel n'a pas absorbé la mutation.
- Conserver pour chaque create:
  - `tempId`
  - `idempotencyKey`
  - `childId`
  - payload normalisé
- Conserver pour chaque update:
  - `eventId`
  - `previousEvent`
  - payload d'update
  - état de sync
- Définir explicitement les transitions d'état:
  - `pending_remote -> confirmed`
  - `pending_remote -> queued_offline`
  - `queued_offline -> confirmed`
  - `pending_remote/queued_offline -> failed`

Livrables:

- store optimistic refactoré;
- logique `ajouterEvenementOptimistic` corrigée;
- logique `modifierEvenementOptimistic` corrigée.

Critères d'acceptation:

- ajout offline visible immédiatement et toujours visible après fallback queue;
- édition offline visible immédiatement et persistante jusqu'au sync;
- aucun rollback visuel parasite lors d'une bascule réseau.

### Phase 2 - Extraire une couche de lecture unifiée

Objectif:

- supprimer la duplication du pattern "snapshot Firestore + optimistic merge + fingerprint".

Travaux:

- Créer un hook ou helper partagé, par exemple:
  - `useMergedEventsListener`
  - ou `listenMergedEvents`
- Responsabilités de cette couche:
  - écouter Firestore;
  - stocker le dernier snapshot;
  - fusionner avec le store optimistic;
  - notifier sur changement optimistic;
  - gérer debounce;
  - exposer un fingerprint cohérent;
  - optionnellement intégrer les soft deletes d'écran.

Écrans cibles pour migration:

- `home`
- `chrono`
- `meals`
- `diapers`
- `activities`
- `routines`
- `milestones`
- `pumping`
- `growth`
- `croissance`
- `stats`
- `useMomentsData`
- `immunizations`

Livrables:

- hook partagé documenté;
- premier écran migré comme référence;
- migration progressive des autres écrans.

Critères d'acceptation:

- même comportement optimistic sur tous les écrans migrés;
- moins de logique dupliquée;
- moins de divergences entre tabs.

### Phase 3 - Unifier tous les points d'entrée d'écriture

Objectif:

- faire passer toute création / édition d'event par la même API applicative.

Travaux:

- Migrer `hooks/useMomentsActions.ts` pour l'humeur rapide.
- Migrer `hooks/useVoiceCommand.ts`.
- Migrer `app/(drawer)/baby/(tabs)/immunizations.tsx`.
- Vérifier les actions rapides du dashboard/home.
- Vérifier les flows de démarrage/arrêt chrono:
  - sommeil
  - promenade

Décision d'architecture recommandée:

- interdire les appels directs aux wrappers non-optimistic dans l'UI;
- réserver les fonctions non-optimistic:
  - aux scripts;
  - aux jobs;
  - à des cas techniques spécifiques clairement documentés.

Critères d'acceptation:

- pour un même type d'event, le comportement est identique quel que soit le point d'entrée;
- plus aucun flux UI standard ne contourne l'optimistic.

### Phase 4 - Couvrir explicitement tous les types d'events

Objectif:

- fermer le gap entre "types supportés dans le modèle" et "types réellement supportés dans le produit".

Avancement réel:

- matrice de couverture créée dans `docs/EVENT_TYPE_COVERAGE_MATRIX.md`;
- `vaccin`, `vitamine`, `jalon`, `nettoyage_nez`, `activite` chrono et `sommeil` chrono sont maintenant explicitement dans le contrat supporté;
- `couche` a été tranché comme type backend/legacy hors périmètre UI moderne de premier niveau.

Travaux:

- Dresser la matrice de couverture par type:
  - add
  - edit
  - delete
  - optimistic create
  - optimistic update
  - rendu home
  - rendu chrono
  - rendu écran dédié
  - offline
- Cas à traiter explicitement:
  - `vaccin`
  - `vitamine`
  - `couche`
  - `nettoyage_nez`
  - `jalon`
  - `activite` chrono
  - `sommeil` chrono

Décision actée sur `couche`:

- type backend conservé mais retiré du périmètre UI moderne de premier niveau;
- le domaine produit "couches" est représenté dans l'UI par `miction` et `selle`;
- `chrono` et les caches modernes ne doivent donc plus reconsidérer `couche` comme un type affiché autonome.

Critères d'acceptation:

- plus aucun type "semi-supporté";
- documentation claire de ce qui est supporté ou non.

### Phase 5 - Centraliser le feedback global

Objectif:

- faire de la gestion d'erreur optimistic une responsabilité applicative globale.

Travaux:

- Déplacer le branchement `setOnFailure(...)` hors de `home`.
- Le connecter à un provider global de toast, probablement au niveau app/layout.
- Garantir le feedback même si l'utilisateur est dans un autre tab.

Critères d'acceptation:

- un échec optimistic remonte toujours une erreur visible;
- aucun écran individuel n'est requis pour activer ce comportement.

### Phase 6 - Durcir la détection de changement

Objectif:

- éviter les non-rerenders silencieux.

Travaux:

- Revoir `buildEventFingerprint`.
- Éviter un fingerprint tronqué aux 30 premiers items si cela peut masquer des edits.
- Options:
  - fingerprint complet;
  - fingerprint par hash incrémental;
  - combinaison taille + ids + updatedAt/date + version optimistic;
  - ou séparation entre "visible list hash" et "full list revision".

Critères d'acceptation:

- modification d'un item ancien visible sans navigation forcée;
- pas de régression perf notable.

### Phase 7 - Tests de non-régression

Objectif:

- sécuriser la refonte.

Tests unitaires à ajouter:

- create optimistic online -> confirmation Firestore;
- create optimistic offline -> queue + maintien visuel;
- update optimistic online -> remplacement local correct;
- update optimistic offline -> overlay conservé;
- create retry avec idempotencyKey -> pas de doublon;
- update avec `null` -> suppression réelle de champ;
- merge create + snapshot Firestore;
- merge update + snapshot Firestore;
- cleanup des entrées confirmées;
- cleanup sans disparition prématurée des entrées queueées offline.

Tests d'intégration recommandés:

- ajout depuis formulaire puis visibilité dans:
  - home
  - chrono
  - écran dédié
- édition depuis un écran puis répercussion sur les autres;
- comportement identique pour:
  - vaccin
  - vitamine
  - jalon humeur
  - commande vocale

## Ordre d'exécution recommandé

### Priorité P0

- Corriger la sémantique offline dans la couche optimistic.
- Migrer `immunizations`.
- Migrer les points d'entrée hors pipeline:
  - humeur rapide
  - commandes vocales

### Priorité P1

- Extraire le hook partagé de lecture merge Firestore + optimistic.
- Migrer progressivement les tabs existants.
- Globaliser le callback d'erreur optimistic.

### Priorité P2

- Traiter explicitement `couche`.
- Revoir le fingerprint.
- Compléter la matrice de tests.

## Risques à surveiller

- duplication d'events si la réconciliation create/tempId/realId est incomplète;
- disparition visuelle d'un event offline si le statut de sync reste ambigu;
- régression sur les events chrono:
  - `sommeil`
  - `activite/promenade`
- divergence entre les écrans si une migration reste partielle;
- effets de bord sur suppression soft-delete vs snapshot réel.

## Définition du succès

Le chantier sera considéré terminé si:

- tous les parcours add/edit UI standard passent par la même couche optimistic;
- tous les écrans qui affichent ces events reflètent immédiatement la mutation;
- offline conserve un rendu stable jusqu'au sync réel;
- aucun type d'event supporté n'est exclu du contrat;
- les erreurs sont visibles globalement;
- les tests couvrent les transitions critiques.

## Fichiers clés du chantier

- `services/eventsService.ts`
- `services/optimisticEventsStore.ts`
- `services/offlineQueueService.ts`
- `migration/eventsHybridService.ts`
- `migration/eventsDoubleWriteService.ts`
- `functions/index.js`
- `services/todayEventsCache.ts`
- `hooks/useMomentsActions.ts`
- `hooks/useVoiceCommand.ts`
- `app/(drawer)/baby/(tabs)/home.tsx`
- `app/(drawer)/baby/(tabs)/chrono.tsx`
- `app/(drawer)/baby/(tabs)/immunizations.tsx`
- `components/forms/*`

## Note de suivi

Ce document reste la référence de cadrage et de suivi du chantier. Toute décision qui change le périmètre, notamment sur `couche` ou sur le contrat offline, doit être consignée ici avant d'étendre les modifications.
