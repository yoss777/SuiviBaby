# Écran Statistiques — performance et fluidité

> Démarré le 2026-11-05 sur la branche `stats-review`. Suivi pas à pas : cocher
> chaque tâche, noter la date et les mesures à la fin de chaque sprint.
>
> Statuts : ⏳ à faire · 🔄 en cours · ✅ fait · ⛔ bloqué

## Constat

L'écran Statistiques (onglet **Plus** → Statistiques, route `/baby/stats`) est
lent à s'ouvrir et l'interface est figée pendant le chargement. Audit ECC du
2026-11-04 (performance-optimizer, react-reviewer, code-explorer,
react-native-patterns), en lecture du code, sans mesure sur appareil :

| # | Cause | Où | Impact |
|---|---|---|---|
| A1 | 5 écouteurs Firestore sur **tout l'historique** (aucun `depuis` / `limite`), avec `includeMetadataChanges` | `stats.tsx:312-365`, `eventsService.ts:320-410` | Volume ×10 à ×100 selon l'âge du compte |
| A2 | `useMemo` inopérants : `start` / `end` recréés à chaque rendu, `getChartColors()` renvoie un objet neuf, `weeklyData` / `filteredTetees` hors `useMemo` | `RepasChart.tsx:230-297`, `SommeilChart.tsx:191-222`, `PompagesChart.tsx:180-315`, `constants/dashboardColors.ts:238` | Tous les calculs refaits à chaque rendu |
| A3 | Corrélation repas/sommeil en O(nuits × repas) avec copies et tris | `SommeilChart.tsx:327-361` | Plus gros blocage de l'onglet Sommeil |
| A4 | Les 3 pages du `PagerView` montées ensemble, aucun graphique en `React.memo` | `stats.tsx:1008-1114` | Le premier affichage paie 3 graphiques au lieu d'un |
| A5 | Cascade d'états : 5 `*Loaded`, 3 `*EmptyDelayDone` (+300 ms), `onWeekChange` au montage, reset déclaré après les écouteurs | `stats.tsx:115-122`, `392-478` | 10 à 15 rendus de l'écran au chargement |
| A6 | Attente du serveur (repli 800 ms) au lieu d'afficher le cache ; pas de cache persistant (`getFirestore(app)`) | `eventsService.ts:386-407`, `config/firebase.ts:37` | Spinner à chaque ouverture |
| A7 | Fusion optimiste : empreinte `JSON.stringify` de tout l'historique ×3, double tri, re-fusion forcée au focus | `useMergedOptimisticEvents.ts`, `optimisticEventsStore.ts:395-410`, `stats.tsx:86-91`, `384-390` | Coût à chaque snapshot et à chaque retour |
| A8 | `toLocaleDateString` dans les boucles, `console.log` par snapshot, rafraîchissement qui recrée les écouteurs, gestes recréés, `GestureHandlerRootView` imbriqués, code mort `*ChartSkia.tsx` | divers | Secondaire |

Index Firestore : complets (`firestore.indexes.json:3-34`). Rendu Skia : pas en
cause (20 à 40 nœuds par Canvas). Historique de la fusion optimiste :
[EVENT_OPTIMISTIC_PROPAGATION_PLAN.md](EVENT_OPTIMISTIC_PROPAGATION_PLAN.md).

## Utilisateurs

- **Parent** : consulte les tendances de son bébé, souvent d'une main, parfois la nuit.
- **Co-parent / proche invité** : consulte les mêmes statistiques depuis son compte.
- **Parent d'un bébé suivi depuis longtemps** : plusieurs milliers d'événements.
- **Équipe (Yoss / Claude)** : doit pouvoir mesurer et faire évoluer l'écran sans régression.

## Cas d'usage et user stories

Chaque story porte un identifiant `US-x.y` repris dans les sprints.

### UC1 — Ouvrir les statistiques

**US-1.1** — En tant que parent, je veux que l'écran Statistiques s'affiche
presque instantanément quand j'ouvre l'onglet, afin de consulter les tendances
sans attendre.
- Avec des données déjà chargées dans la session, le graphique de l'onglet
  affiché apparaît en moins de 300 ms (cible à confirmer au sprint 0).
- Aucun délai artificiel (suppression des 300 ms d'« anti-vide »).

**US-1.2** — En tant que parent, je veux pouvoir faire défiler, changer d'onglet
ou revenir en arrière pendant que les données arrivent, afin de ne jamais avoir
l'impression que l'app est bloquée.
- Aucune tâche JS de plus de 100 ms pendant le chargement (profiler Hermes).
- Le bouton retour et les onglets répondent pendant le chargement.

**US-1.3** — En tant que parent, je veux voir les cartes résumé de la semaine
dès que leurs données sont prêtes, afin d'avoir l'essentiel tout de suite.
- Chaque carte (repas, pompages, sommeil) s'affiche indépendamment ; la plus
  lente ne bloque plus les autres.
- Un squelette léger remplace la carte tant qu'elle n'est pas prête.

**US-1.4** — En tant que parent d'un bébé suivi depuis longtemps, je veux que
l'écran s'ouvre aussi vite que pour un nouveau compte, afin que l'app ne se
dégrade pas avec le temps.
- Le volume chargé à l'ouverture est borné (2 à 3 semaines), indépendant de
  l'ancienneté du compte.
- Test avec un jeu de 3 000 événements : temps d'ouverture du même ordre
  qu'avec 50.

### UC2 — Changer d'onglet (Repas / Pompages / Sommeil)

**US-2.1** — En tant que parent, je veux passer d'un onglet à l'autre sans
saccade, afin de comparer rapidement repas et sommeil.
- Seul l'onglet visible est calculé à l'ouverture ; les autres se montent à
  leur première visite, puis restent montés.
- Le changement d'onglet ne recalcule pas les graphiques déjà affichés.

### UC3 — Naviguer entre les semaines

**US-3.1** — En tant que parent, je veux passer à la semaine précédente ou
suivante sans attendre, afin de suivre l'évolution.
- Semaines déjà chargées : changement immédiat (< 100 ms).
- La comparaison avec la semaine précédente (tendance) reste juste.

**US-3.2** — En tant que parent, je veux pouvoir remonter loin dans
l'historique, afin de revoir une période passée.
- En arrivant au bord de la fenêtre chargée, les semaines plus anciennes se
  chargent à la demande, avec un indicateur discret sur le graphique seulement
  (pas de spinner plein écran).
- Les semaines déjà chargées restent en mémoire pendant la session.

### UC4 — Revenir sur l'écran

**US-4.1** — En tant que parent, je veux retrouver mes statistiques
immédiatement quand je reviens sur l'écran (depuis un autre onglet ou après
avoir mis l'app en arrière-plan), afin de ne pas revivre le chargement.
- Retour sur l'onglet : aucun recalcul si aucune donnée n'a changé.
- Retour d'arrière-plan (> 30 s) : rafraîchissement silencieux limité à la
  fenêtre affichée, sans spinner.

### UC5 — Rafraîchir manuellement

**US-5.1** — En tant que parent, je veux tirer pour rafraîchir sans que l'écran
se vide, afin de vérifier que tout est à jour.
- Les données affichées restent visibles pendant le rafraîchissement.
- Le rafraîchissement relit la fenêtre affichée côté serveur sans recréer les
  écouteurs.

### UC6 — Exporter le PDF

**US-6.1** — En tant que parent, je veux exporter le bilan PDF des 12 dernières
semaines, même si l'écran ne charge que quelques semaines, afin de le montrer
au pédiatre.
- Le PDF reste complet (12 semaines, mêmes chiffres qu'aujourd'hui).
- Pendant la préparation, un indicateur s'affiche sur le bouton ; l'écran reste
  utilisable.

### UC7 — Voir tout de suite un événement ajouté

**US-7.1** — En tant que parent, je veux qu'un repas, un pompage ou un sommeil
que je viens d'ajouter (y compris à la voix) apparaisse dans les statistiques
sans attendre le serveur, afin d'avoir confiance dans les chiffres.
- L'ajout optimiste reste visible dans le graphique de la semaine en cours.
- Pas de doublon quand la confirmation serveur arrive.

**US-7.2** — En tant que co-parent, je veux voir les ajouts de l'autre parent
apparaître en direct, afin que nous ayons les mêmes chiffres.
- Les écouteurs temps réel restent actifs sur la fenêtre affichée.

### UC8 — Réseau lent ou hors ligne

**US-8.1** — En tant que parent avec un réseau faible (la nuit, en déplacement),
je veux voir les dernières données connues au lieu d'un spinner, afin de
consulter les tendances malgré tout.
- Si des données sont en cache, elles s'affichent immédiatement, puis sont
  corrigées à l'arrivée du serveur.
- L'écran vide n'est affiché que si le serveur a confirmé l'absence de données.

### UC9 — Interagir avec un graphique

**US-9.1** — En tant que parent, je veux que toucher une barre ou glisser sur la
courbe réagisse sans latence, afin de lire une valeur précise.
- Le tap sur une barre ne recalcule pas les agrégats de la semaine.
- Le glissement sur la courbe des pompages reste fluide même si le thread JS
  est occupé.

### Stories techniques (équipe)

**US-T1** — En tant qu'équipe, je veux une mesure de référence avant/après,
afin de prouver le gain et éviter les régressions.

**US-T2** — En tant qu'équipe, je veux les calculs des graphiques dans des
fonctions pures testées, afin de les optimiser sans changer les chiffres affichés.

**US-T3** — En tant qu'équipe, je veux supprimer le code mort et les logs
bruyants, afin de garder un code lisible.

## Sprints

Chaque sprint se termine par : `npm run lint`, `npx tsc --noEmit`, `npm test`
verts, une vérification sur le Samsung (build de dev) et une mesure comparée à
la référence du sprint 0. Un commit par tâche cohérente, sur `stats-review`.

### Sprint 0 — Mesure de référence · US-T1 · ✅ 2026-11-05

But : savoir d'où on part, pour fixer des cibles chiffrées.

- [x] **0.1** Jeu de données de test : un enfant avec environ 3 000 événements
  (repas, pompages, sommeils sur 12 mois) dans l'émulateur Firestore, via un
  script `scripts/seedStatsPerf.mjs`.
  _Fait : générateur déterministe `scripts/statsPerfFixtures.js` (partagé
  tests / émulateur) ; `scripts/seedStatsPerf.mjs` refuse de tourner hors
  émulateur._
- [x] **0.2** Instrumentation `__DEV__` : temps entre le montage de
  `StatsScreen` et le premier graphique affiché ; nombre de rendus de l'écran
  et de chaque graphique (compteur), nombre de snapshots reçus.
  _Fait : `utils/statsPerf.ts` (compteurs toujours actifs, logs seulement en
  dev avec `EXPO_PUBLIC_STATS_PERF=1`, lisibles par `adb logcat | grep stats-perf`)._
- [ ] **0.3** Profils de référence sur le Samsung : React DevTools Profiler
  (ouverture, changement d'onglet, semaine précédente) et profiler Hermes
  (tâches > 100 ms).
  _Remplacé pour l'instant par deux mesures reproductibles : benchmark
  `STATS_BENCH=1 npx jest __tests__/statsAggregations.test.ts -t bench` et
  compteurs de rendus de `__tests__/StatsScreen.test.tsx` (snapshots livrés un
  par un, 100 ms d'écart). Profil sur le Samsung à faire avec un build de dev._
- [x] **0.4** Noter les chiffres dans la section « Mesures » ci-dessous et
  ajuster les cibles des US-1.1, 1.2, 3.1.

Fin de sprint : tableau « Mesures » rempli (avant).

### Sprint 1 — Calculs des graphiques stables et rapides · US-T2, US-1.2, US-3.1, US-9.1 · ✅ 2026-11-05

But : un graphique ne recalcule que quand ses données ou sa semaine changent,
et chaque calcul est en une passe. Aucun changement visible pour l'utilisateur.

- [x] **1.1** Tests de non-régression d'abord : extraire les agrégations dans
  `utils/statsAggregations.ts` (fonctions pures : semaine courante, semaine
  précédente, totaux par jour, nouveaux aliments, réactions, `thisWeekCounts`,
  corrélation repas/sommeil) et figer leurs résultats actuels dans
  `__tests__/statsAggregations.test.ts` sur un jeu fixe.
- [x] **1.2** Semaine stable : `startMs = getStartOfWeek(currentWeek).getTime()`
  et `start` / `end` en `useMemo([startMs])` dans les 3 graphiques
  (`RepasChart.tsx:230`, `SommeilChart.tsx:191`, `PompagesChart.tsx:286`).
- [x] **1.3** Couleurs stables : palettes précalculées au niveau du module dans
  `constants/dashboardColors.ts`, ou `useMemo([colorScheme])` dans chaque graphique.
- [x] **1.4** Une passe mémoïsée par graphique : `useMemo(() => aggregate(data,
  startMs, filtre), [data, startMs, filtre])`, timestamps numériques, jour de la
  semaine via `(d.getDay() + 6) % 7` au lieu de `toLocaleDateString`.
- [x] **1.5** Corrélation repas/sommeil : timestamps des repas triés une fois
  (`useMemo([repas])`), recherche binaire du dernier repas dans la fenêtre de
  6 h avant chaque nuit, sans copie ni tri par nuit (`SommeilChart.tsx:338-346`).
- [x] **1.6** Pompages du jour : filtrer par plage de millisecondes avant de
  construire les objets (`PompagesChart.tsx:168-186`) ; `dailyValues` /
  `dailyLabels` mémoïsés pour que `chartPoints`, `linePath`, `fillPath` le soient.
- [ ] **1.7** Chemins Skia (`makeRRect`) construits dans le `useMemo` de `bars`
  (`RepasChart.tsx:1225`, `1255`, SommeilChart).
- [x] **1.8** `thisWeekCounts` (`stats.tsx:484-513`) sur timestamps, une passe.

Fin de sprint : tests 1.1 verts sans changer les attendus ; rendus par tap
divisés (compteur 0.2) ; chiffres affichés identiques sur le Samsung.

_Bilan 2026-11-05 : `utils/statsAggregations.ts` + 23 tests qui comparent
chaque calcul à l'ancien code sur 3 000 événements (semaine courante, semaine
passée, semaine du changement d'heure, 4 filtres repas ; fuseaux Paris et UTC).
Les 3 graphiques ne recalculent plus que si les données, la semaine ou le
filtre changent ; `getChartColors` renvoie un objet stable par thème ; plus
aucun `toLocaleDateString` dans les boucles (jour via `getDay()`, ce qui évite
aussi des jours non reconnus si Intl renvoie une autre langue) ; corrélation
repas/sommeil par recherche binaire ; compteurs de la semaine et PDF en une
passe (le PDF anticipe la tâche 3.4). 1.7 (chemins Skia dans `bars`) reporté
au sprint 5 : une vingtaine de chemins, gain négligeable une fois les rendus
réduits._

### Sprint 2 — Écran réactif pendant le chargement · US-1.1, US-1.2, US-1.3, US-2.1, US-4.1 · ⏳

But : l'utilisateur ne voit plus jamais l'écran figé ; un seul graphique se
calcule à l'ouverture.

- [ ] **2.1** `React.memo` sur `RepasChart`, `PompagesChart`, `SommeilChart` ;
  `extras` de `SafeBoundary` mémoïsé (`stats.tsx:1035`, `1067`, `1098`).
- [ ] **2.2** Pages paresseuses : ne monter le graphique que si l'onglet est
  actif ou déjà visité (`visitedTabs`), placeholder léger sinon ; les
  `ScrollView` restent en place pour ne pas casser les index du pager.
- [ ] **2.3** `onWeekChange` : garde d'égalité dans les setters
  (`stats.tsx:470-478`, retourner `prev` si `getTime()` identique) ; ne plus
  l'appeler au montage depuis les graphiques, seulement sur navigation.
- [ ] **2.4** État de chargement unique : un `useReducer` `loaded` par source à
  la place des 5 `*Loaded` ; reset fusionné dans l'effet d'abonnement, avant
  les `ecouterEvenements` (supprime la course possible avec un snapshot synchrone).
- [ ] **2.5** Suppression des 3 `*EmptyDelayDone` et de leurs timers de 300 ms
  (`stats.tsx:430-467`) ; état vide affiché directement (ou apparition animée).
- [ ] **2.6** Cartes résumé indépendantes (`stats.tsx:887-890`) avec squelette
  (`components/ui/Skeleton.tsx`).
- [ ] **2.7** Graphique monté après la transition d'ouverture
  (`InteractionManager.runAfterInteractions` ou `startTransition`), squelette
  pendant ce temps.
- [ ] **2.8** `useFocusEffect` (`stats.tsx:384-390`) : ne plus forcer la
  re-fusion au focus si rien n'a changé.
- [ ] **2.9** Onglet initial via `initialPage` calculé depuis le paramètre `tab`
  (`stats.tsx:168-179`, `1011`) ; `handlePageSelected` sans dépendance à
  `selectedTab` (`stats.tsx:200-210`).
- [ ] **2.10** Tests : `__tests__/StatsScreen.test.tsx` (seul l'onglet actif
  monte un graphique, cartes affichées indépendamment, pas de recalcul au
  focus sans changement).

Fin de sprint : un seul graphique rendu à l'ouverture ; aucune tâche > 100 ms
pendant le chargement (profil Hermes) ; changement d'onglet fluide.

### Sprint 3 — Charger seulement ce qui est affiché · US-1.4, US-3.2, US-5.1, US-6.1, US-7.1, US-7.2 · ⏳

But : le volume chargé ne dépend plus de l'ancienneté du compte.

- [ ] **3.1** Fenêtre bornée : écouteurs avec `depuis` = début de la semaine
  affichée − 2 semaines (couvre la tendance « semaine précédente », le conseil
  sur 3 jours et la fenêtre de 6 h de la corrélation).
- [ ] **3.2** Moins d'écouteurs : un seul pour les repas
  (`type: ["tetee", "biberon", "solide"]`), puis répartition par type côté
  client ; passer de 5 à 3 écouteurs (ou 1 requête multi-types, à trancher
  selon la lisibilité).
- [ ] **3.3** Semaines anciennes à la demande : quand la semaine affichée sort
  de la fenêtre, requête ponctuelle `obtenirEvenements` sur la tranche
  manquante, fusionnée avec ce qui est déjà en mémoire ; indicateur sur le
  graphique seulement.
- [ ] **3.4** Export PDF : requête ponctuelle sur 12 semaines au clic, calcul
  hors rendu (fonction pure de 1.1, index de semaine par
  `Math.floor((ts - start) / 604800000)`) ; indicateur sur le bouton.
- [ ] **3.5** Tirer pour rafraîchir : `obtenirEvenements` borné en
  `source: "server"` sans détruire les écouteurs (`stats.tsx:524-533`).
- [ ] **3.6** Retour d'arrière-plan : `useForegroundServerRefresh` borné à la
  fenêtre (`stats.tsx:281-300`).
- [ ] **3.7** Ajouts optimistes et temps réel : vérifier qu'un événement ajouté
  (dont à la voix) et un ajout du co-parent apparaissent sans doublon.
- [ ] **3.8** Tests : `__tests__/eventsService.test.ts` (requêtes bornées,
  fusion des tranches), PDF identique à l'actuel sur le jeu fixe.

Fin de sprint : avec 3 000 événements, volume chargé à l'ouverture limité à la
fenêtre ; PDF identique ; navigation arrière jusqu'au début de l'historique OK.

### Sprint 4 — Afficher le cache tout de suite, fusion allégée · US-1.1, US-8.1, US-7.1 · ⏳

But : plus d'attente du serveur quand des données sont déjà connues.

- [ ] **4.1** Afficher le cache immédiatement (stale-while-revalidate) : ne plus
  ignorer le snapshot local dans `ecouterEvenements` pour cet écran ; garder
  l'anti-flash de vide uniquement quand le cache est vide ; retirer
  `includeMetadataChanges` ici (`eventsService.ts:367-407`).
- [ ] **4.2** Empreinte de fusion par `id + updatedAt` (ou longueur + référence)
  au lieu du `JSON.stringify` complet (`optimisticEventsStore.ts:395-410`).
- [ ] **4.3** Supprimer le second tri `sortRepasEvents` (`stats.tsx:86-91`),
  `mergeWithFirestoreEvents` trie déjà ; remplacer le `findIndex` par entrée
  optimiste par une `Map`.
- [ ] **4.4** Étude (1 jour max) d'un cache persistant pour un démarrage à
  froid : `persistentLocalCache` du SDK web dépend d'IndexedDB, absent sous
  React Native ; piste réaliste : instantané de la fenêtre dans AsyncStorage
  sur le modèle de `services/todayEventsCache.ts`. Décision notée ici avant
  toute implémentation.
- [ ] **4.5** Tests : `__tests__/useMergedOptimisticEvents.test.ts` et
  `__tests__/optimisticEventsStore.test.ts` étendus (empreinte, pas de
  doublon, ordre conservé).

Fin de sprint : ouverture avec données en cache sans spinner ; nombre de
fusions par snapshot réduit (compteur 0.2).

### Sprint 5 — Nettoyage · US-T3, US-9.1 · ⏳

- [ ] **5.1** `console.log` d'`eventsService.ts` (lignes 365, 371, 395, 398,
  401, 409) supprimés ou sous `__DEV__`.
- [ ] **5.2** Supprimer `components/suivibaby/PompagesChartSkia.tsx` et
  `TeteesChartSkia.tsx` (importés nulle part) ; vérifier
  `services/events/stats.ts` (`obtenirStats24h`, aucun appelant).
- [ ] **5.3** Gestes mémoïsés (`Gesture.Tap()` / `Pan()`), suppression des
  `GestureHandlerRootView` internes aux graphiques (déjà présent dans
  `app/_layout.tsx`).
- [ ] **5.4** Glissement de la courbe des pompages calculé dans un worklet,
  retour au JS seulement quand l'index change (`PompagesChart.tsx:265-275`).
- [ ] **5.5** Largeur des onglets internes de Repas calculée depuis
  `screenWidth` au lieu de `onLayout` → `setState` (`RepasChart.tsx:777`, `840`) ;
  indice d'aide (`TAP_HINT_KEY`) lu une fois au niveau de l'écran.
- [ ] **5.6** Constantes (`jours`) sorties des composants ; commentaire sur
  l'effet `initialTypeFilter` (`RepasChart.tsx:195-205`).
- [ ] **5.7** Mesure finale (même protocole que le sprint 0) et mise à jour de
  `docs/SUIVI_ACTIONS.md`.

Fin de sprint : mesures « après » remplies ; branche prête à fusionner sur
`main` puis à livrer dans la version suivante.

## Correspondance stories → sprints

| Story | Sprints |
|---|---|
| US-1.1 Ouverture rapide | 2, 4 |
| US-1.2 Jamais figé | 1, 2 |
| US-1.3 Cartes résumé progressives | 2 |
| US-1.4 Indépendant de l'ancienneté | 3 |
| US-2.1 Changement d'onglet fluide | 2 |
| US-3.1 Semaine suivante / précédente immédiate | 1 |
| US-3.2 Historique à la demande | 3 |
| US-4.1 Retour sur l'écran sans rechargement | 2, 3 |
| US-5.1 Rafraîchir sans vider l'écran | 3 |
| US-6.1 PDF 12 semaines complet | 3 |
| US-7.1 Ajout visible tout de suite | 3, 4 |
| US-7.2 Ajouts du co-parent en direct | 3 |
| US-8.1 Réseau faible : dernières données | 4 |
| US-9.1 Interaction graphique sans latence | 1, 5 |
| US-T1 Mesure | 0, 5 |
| US-T2 Calculs testés | 1 |
| US-T3 Nettoyage | 5 |

## Mesures

À remplir au sprint 0 (avant) et après chaque sprint. Appareil : Samsung de
test, build de dev, jeu de 3 000 événements.

Mesures reproductibles (Node sur le Mac, 3 000 événements sur 12 mois ; sur
un Android d'entrée de gamme sous Hermes, compter 5 à 20 fois plus) :

| Mesure | Avant | S1 | S2 | S3 | S4 | Après | Cible |
|---|---|---|---|---|---|---|---|
| Calcul des 3 graphiques par rendu (ms) | 28,3 (Repas 12,1 · Pompages 2,6 · Sommeil 15,6) | 2,3 quand les données ou la semaine changent, 0 sinon | | | | | < 3 |
| Rendus de `StatsScreen` jusqu'aux données | 21 | | | | | | ≤ 8 |
| Rendus des graphiques (Repas / Pompages / Sommeil) | 11 / 6 / 2 | | | | | | ≤ 2 chacun |
| Calcul estimé au chargement (ms) | ≈ 180 | | | | | | < 20 |
| Graphiques montés à l'ouverture | 3 | | | | | | 1 |
| Écouteurs Firestore | 5 | | | | | | 3 |
| Événements lus à l'ouverture | tout l'historique (3 000) | | | | | | fenêtre (≈ 3 semaines) |
| Ouverture → premier graphique sur le Samsung (ms) | à mesurer | | | | | | < 300 avec cache |

## Hors périmètre

- Refonte visuelle des graphiques ou nouvelles statistiques.
- Écrans Croissance (`growth.tsx`, `croissance.tsx`) et tableau de bord de l'accueil.
- Contenus réservés à Premium (décision D8 : courbes OMS, statistiques avancées).
