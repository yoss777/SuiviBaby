# Widget multi-bébés : angle architecture et faisabilité technique

Réponse de l'agent ECC « architect » au brief `BRIEF_MULTI_BEBES.md` (2026-11-13).

## 1. Recommandation

**Maintenant (V1), on garde A.** Sur ce téléphone, le widget suit le bébé actif de l'app. On n'ajoute ni swipe ni bouton « bébé suivant ».
**Ensuite, deux étapes.** En V1.1, une ligne « autres bébés en cours » (JS seulement). En V2, un bébé épinglé par widget : simple sur iOS, à patcher sur Android. Le swipe horizontal est à **abandonner** : techniquement impossible sur iOS, hors du pont sur Android.

## 2. Pourquoi (preuves dans les sources)

**Le swipe n'existe nulle part dans le pont.**
- iOS : WidgetKit n'a aucun geste.
- Android : le convertisseur `ExpoWidgetEmittableTree.kt` ne connaît que Box, Row, Column, LazyColumn, Button, etc. Il n'a ni `AdapterViewFlipper` ni `StackView`. Pour en ajouter un, il faudrait sortir des RemoteViews de collection : Glance 1.2 ne les expose pas, et le rendu varie selon le lanceur.

**Le bouton existe déjà dans le pont, sur les deux plateformes, sans notre patch.**
- Android :
  - `toPeekButton` pose l'action (`ExpoWidgetEmittableTree.kt` l. 435-461) ;
  - le clic envoie un broadcast (`WidgetInteractionAction.kt` l. 29-53), intercepté par `ExpoWidgetsAppWidgetProvider.onReceive` ;
  - `WidgetsInteraction.handle` (l. 56-68) relance la fonction JS du widget, fusionne les props renvoyées par `onClick`, puis recharge le widget.
- iOS 17+ : `WidgetButtonView` + l'App Intent `WidgetUserInteraction` (`Buttons.swift` l. 12-37, `AppIntent.swift` l. 50-100).
- Côté JS : `__expoWidgetHandlePress` (`bundle/index.ts` l. 80-118).

**Mais le choix fait par bouton est fragile, pour trois raisons.**
1. **L'app l'écrase.** `updateSnapshot` remplace toutes les props : sur Android, `WidgetObject.kt` l. 25-28 écrit `__expo_widgets_${name}_props` en entier ; sur iOS, `updateTimeline` réécrit la timeline (`WidgetObject.swift` l. 20-27). Le bébé choisi au bouton saute donc au prochain envoi de l'app.
2. **Le choix vaut pour tous les widgets Android.** L'état est rangé par nom de widget, pas par instance. `ExpoWidgetsPeekWidget.provideRoot` reçoit `id` sans s'en servir (l. 18-38), et `WidgetsUpdater` (l. 47-49) dessine toutes les instances avec les mêmes props. Deux widgets côte à côte ne peuvent donc pas montrer deux bébés.
3. **Risque d'ANR (application figée) sur Android.** `handle` évalue Hermes dans `onReceive`. À froid, il recharge tout le bundle (`WidgetsJSRuntime.kt` l. 39-44), dans la limite de 10 s d'un broadcast.

**Le choix d'un bébé par widget existe déjà sur iOS.**
- Le plugin génère une `AppIntentConfiguration` avec un paramètre enum dynamique dès qu'on déclare `ios.configuration` dans `app.json` (`plugin/src/ios/withWidgetSourceFiles.ts` l. 375-403 et 487).
- La valeur arrive dans `environment.configuration` (l. 450-459), et la liste des bébés se remplit à l'exécution avec `setConfigurationParameterEnum` (`Widgets.ts` l. 91-96, `WidgetObject.swift` l. 37-47).
- Le choix appartient au système, par instance, et l'app ne l'écrase jamais.
- Android ne l'a pas : `getWidgetEnvironment` renvoie `"configuration" to emptyMap()` (`WidgetsUtils.kt` l. 12).

**Coût Firestore et fraîcheur.**
- L'Accueil n'ouvre qu'un écouteur d'événements, sur le bébé actif : `ecouterEvenementsDuJour(activeChild.id)` (`home.tsx` l. 1299-1335, `eventsService.ts` l. 1147-1158). S'y ajoute un écouteur de tétée par enfant (`nursingTimer.ts` l. 351).
- Chaque bébé en plus ajoute environ 2 écouteurs. Pour 2 bébés, cela fait de l'ordre de 1 000 à 2 000 lectures par jour au pire, soit moins de 0,002 $. **Le coût n'est pas un critère.**
- **Le vrai critère, c'est la fraîcheur** : ces écouteurs ne tournent que quand l'app est ouverte. Un bébé non actif affiché dans le widget a les données de la dernière fois que l'app l'a écouté.

**Budget de rechargement.**
- `pushNowWidget` ne part que depuis l'app au premier plan, avec un anti-rebond de 2 s et seulement si le contenu change (`widgetSync.ts` l. 40-57).
- D'après la doc Apple « Keeping a widget up to date », un rechargement demandé quand l'app est au premier plan ne compte pas dans le budget. Passer à plusieurs bébés ne change donc presque rien au budget.
- Taille des données : N × environ 2 Ko, négligeable pour UserDefaults (iOS) et SharedPreferences (Android).

**A est la seule option dont chaque donnée affichée est garantie fraîche et vérifiée.** La garde anti-mélange est dans `useNowWidgetSync.ts` l. 88-99.

## 3. Ce qui casse dans les options écartées

- **B (swipe ou bouton), 3 h du matin, jumeaux.**
  - La mère allaite Léa, son app est sur Léa. Le père donne un biberon à Tom sur son téléphone.
  - Sur le widget de la mère, on passe à Tom : on voit « dernier repas il y a 4 h ». C'est faux : son téléphone n'écoute pas Tom, donc le biberon du père n'est jamais arrivé.
  - Pire : l'app de la mère renvoie les données de Léa 2 s plus tard (fin de la tétée), et le widget revient sur Léa sans qu'elle ait touché à rien.
- **Bouton sur Android, deux widgets posés (un par jumeau).** Un appui sur l'un fait basculer les deux.
- **A, ce qui casse réellement (acceptable en V1).** La mère passe l'app sur Tom juste pour noter une couche : son widget bascule sur Tom, et la tétée de Léa en cours n'apparaît plus. C'est ce trou que vise la ligne « autres bébés en cours » de la V1.1.

## 4. Coût de la recommandation

| Étape | Fichiers | Natif | Risques |
|---|---|---|---|
| **V1 : A tel quel** | aucun | non | aucun nouveau |
| **V1.1 : ligne « Tom · Sommeil 2:14 » sous le bébé principal** | `utils/widgetSnapshot.ts` (`others: {childId, name, live}[]`), nouveau `hooks/useHouseholdLiveSessions.ts` (sessions des autres enfants, via `children` de `BabyContext`), `hooks/useNowWidgetSync.ts` (filtrer par `childId` au lieu de tout bloquer), `home.tsx` l. 691-732, les deux `widgets/BebeMaintenant.*.tsx`, `__tests__/widgetSnapshot.test.ts` | non, mais nouvelle version sur les stores (pas d'expo-updates) : .aab Android en local, build EAS pour iOS | place en hauteur sur Android 2×2 ; sur iOS, la ligne ne vaut que pour `systemMedium` |
| **V2 : un bébé épinglé par widget** | `app.json` (`ios.configuration`, enum dynamique `child`, défaut « bébé actif »), appel à `setConfigurationParameterEnum` quand `children` change, props `{ byChild, activeId }`, les deux widgets, lien profond avec `?childId=`, patch Kotlin : `appWidgetId` passé au rendu + choix rangé par instance + écran de configuration ou bouton (environ 60 à 100 lignes, plus le plugin pour `android:configure`) | **oui** : build EAS iOS, recompilation Android (1 à 2 min) | **(a)** Le widget configurable n'est déclaré que dans `if #available(iOS 17.0, *)` (`withWidgetSourceFiles.ts` l. 194-197), alors que le pod vise iOS 16.4 : sur iOS 16.x, le widget disparaît. Parade : garder le widget statique et ajouter un second type « Bébé épinglé ». **(b)** Il faut écouter tous les bébés et afficher « màj HH:MM » par bébé. **(c)** Le patch du module est à rebaser à chaque montée d'`expo-widgets`. |

Premium ou non : techniquement, cela ne coûte rien à faire tourner. C'est une décision produit, et l'éventuel verrou doit rester dans l'app, jamais dans le widget.

## 5. Incertain, et comment le vérifier

1. **Les rechargements déclenchés par un bouton (App Intent) iOS sont-ils hors budget ?** Probable, non vérifié. Test sur appareil : 50 appuis, puis voir si les mises à jour continuent (Console.app, filtre `chronod`).
2. **Le clic sur un bouton Android l'emporte-t-il sur notre clic racine plein écran** (`ExpoWidgetEmittableTree.kt` l. 130-133) ? Test sur Pixel et sur un lanceur Samsung.
3. **Temps d'un clic Android à froid.** Mesurer `WidgetsInteraction.handle` avec `adb logcat` sur un téléphone d'entrée de gamme, après avoir tué le processus.
4. **Requête des sessions en cours des autres bébés.** Firestore ne sait pas chercher les documents où `heureFin` est absent : vérifier si `heureFin: null` est écrit explicitement ; sinon, réutiliser `ecouterEvenementsDuJour` en limitant les types.
5. **Part des utilisateurs sur iOS 16.x.** À lire dans App Store Connect avant de décider du second type de widget en V2.
6. **Nom du rappel de bouton dans le code du widget.** `onClick` sur Android, mais typé `() => void` (`@expo/ui/.../Button/index.tsx` l. 33) : à vérifier avec un prototype qui renvoie des props.
