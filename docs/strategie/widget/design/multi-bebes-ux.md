# Multi-bébés dans le widget : l'angle expérience et ergonomie

*Grille de lecture : UI/UX Pro Max (priorités 1 Accessibilité, 2 Toucher et interaction, 9 Navigation). Dans ce document, « vérifié » veut dire lu dans le code du dépôt ou dans `node_modules`. « Plateforme » renvoie à la documentation Android et Apple, citée de mémoire et pas revérifiée en ligne ici.*

## 1. Recommandation

**Pas de swipe (B écarté pour de bon).** **Maintenant (V1.x)** : on garde A, mais on rend sans ambiguïté le bébé affiché (nom promu, initiale, « 1 sur 2 », libellé accessible). **V2** : un **sélecteur de bébé en pastilles qu'on touche** dans l'en-tête du widget, sur iOS et Android. Sur iOS s'ajoute l'option « Bébé affiché » à la configuration du widget, ce qui permet de poser deux widgets côte à côte. C'est gratuit : rien d'un paywall dans le widget.

## 2. Pourquoi

**a. Le swipe est le geste le plus mal placé possible sur un écran d'accueil.**
- **Android.** La doc des widgets limite les gestes d'un widget au toucher et au swipe **vertical**, parce que le swipe horizontal appartient au lanceur, qui l'utilise pour changer de page (plateforme). Glance n'a d'ailleurs pas de pager horizontal (brief). `AdapterViewFlipper` et `StackView` se comportent différemment selon le lanceur. Des utilisateurs Samsung se plaignent que les piles de widgets « attrapent » le swipe de page ([fil Samsung Community](https://us.community.samsung.com/t5/Galaxy-S25/Widget-stack-swiping/td-p/3131890)).
- **La nuit, d'une main, au pouce.** Un pouce qui glisse en diagonale déclenche tantôt le widget, tantôt la page voisine. Le parent perd alors **et** le bébé **et** sa page.
- **iOS.** Le swipe est impossible (brief). B créerait donc un modèle d'interaction propre à Android, alors que la cohérence entre plateformes est un critère du brief.
- **Découvrabilité.** Le swipe est invisible. Il faudrait des points de pagination (6 à 8 dp), illisibles à 3 h du matin, ou un tutoriel, et un widget n'en a pas.
- **Accessibilité.** Avec TalkBack ou VoiceOver, un swipe d'un doigt **déplace le focus**, il ne fait pas défiler le widget. Le choix du bébé deviendrait inaccessible sans actions personnalisées, que le pont n'expose pas. Une pastille touchable, elle, est un bouton natif.

**b. Le toucher est déjà dans le pont, sur les deux plateformes (vérifié).** Le travail d'ingénierie est donc plus petit que ce que le brief supposait.
- **Android.** `ExpoWidgetEmittableTree.kt:430-455` (`toPeekButton`) transforme un `Button` doté d'un `target` en `clickable(actionSendBroadcast)` (`WidgetInteractionAction.kt:29`). `WidgetsInteraction.handle` (l. 56-67) réexécute la fonction du widget avec `environment.target`, fusionne les props renvoyées dans le stockage, puis recharge le widget **sans ouvrir l'app**.
- **iOS.** `ios/Widgets/AppIntent.swift`, `WidgetUserInteraction` (App Intent, iOS 17+), fait la même chose : `evaluateWidgetButtonPress` avec `environment["target"]`.
- **iOS, configuration par widget.** `plugin/build/ios/withWidgetSourceFiles.js:293-335` génère un `WidgetConfigurationIntent` avec un enum **dynamique** (`DynamicOptionsProvider`, alimenté par l'app). La valeur choisie est passée au rendu dans `environment.configuration`. « Ce widget = Noé » est donc possible sur iOS.
- **Android, pas de configuration par widget.** Les props sont rangées **par type de widget**, pas par instance : `__expo_widgets_${source}_props` (`WidgetInteractionAction.kt`), et `WidgetsUpdater.kt:47` rafraîchit toutes les instances avec le même contenu. Deux widgets Android afficheraient toujours le même bébé, et le choix fait d'un toucher s'applique à toutes les instances.

**c. Le vrai risque n'est pas « quel bébé », c'est « croire voir l'autre ».**
- Sur la capture actuelle (`widget_actuel.png`), le nom est la donnée la **plus faible** de l'écran : 12 sp, gras, couleur `soft` (#9ca3af sur #1f2937). Le chrono est en 40 sp et plus (`BebeMaintenant.android.tsx:365`, en petit format 11 sp l. 353, iOS 12 pt `.ios.tsx:131`).
- Lu d'un coup d'œil, l'œil va au chrono et ne remonte jamais au nom. Avec des jumeaux, « Tétée 12:34 » n'apprend rien si on ne sait pas de qui il s'agit.
- Côté Android, aucun `contentDescription` n'est posé dans le widget (grep vide), alors que le pont le gère (`ExpoWidgetEmittableTree.kt:395`). Côté iOS, seul le bloc « en cours » a un `accessibilityLabel` (l. 107), et il ne contient pas le prénom.
- Ce correctif sert **toutes** les options. C'est pour ça qu'il passe en premier.

**d. Les références (« un widget = un élément ; plusieurs = plusieurs widgets ou un sélecteur explicite »).**
- Météo d'Apple : une ville par widget, choisie via « Modifier le widget ». La Smart Stack sert à faire tourner les widgets (plateforme). Google Météo et At a Glance suivent le même modèle.
- Côté apps bébé, je n'ai pas pu vérifier comment Huckleberry, Piper ou Robin choisissent l'enfant dans le widget. Leurs fiches confirment seulement le multi-profils dans l'app ([Huckleberry, App Store](https://apps.apple.com/us/app/huckleberry-baby-tracker/id1169136078)). C'est à vérifier en main (§5).

## 3. Ce qui casse avec B (swipe) et avec A tel quel

- **3 h 02, jumeaux, Android, B.** La mère allaite Lina, le père prépare le biberon de Noé. Il glisse le pouce pour voir Noé. Le lanceur change de page. Il revient, retente, et tombe sur Lina. Il lit « Repas 1 · 100 ml » en croyant que c'est Noé, conclut que Noé a mangé, et décale le biberon. **Le danger est l'erreur de lecture, pas le geste raté.**
- **B et TalkBack.** Un parent malvoyant ne peut tout simplement pas atteindre le second bébé.
- **B et le deuxième passage.** Le widget a gardé la page « Noé » choisie par le père. Une heure plus tard, la mère jette un œil en croyant voir Lina, comme dans l'app où elle est restée sur Lina. Un état caché, déplacé par un geste involontaire, est le pire cas pour un coup d'œil d'une seconde.
- **A tel quel, aîné et bébé.** L'aîné de 3 ans est actif dans l'app, parce qu'on y a noté un repas à 19 h. À 3 h, le widget montre l'aîné : « Sommeil 0 min ». Le parent ne voit pas le prénom en gris 12 sp et croit que le bébé n'a pas dormi.
- **A et le changement par l'autre parent.** Le père change de bébé sur **son** téléphone. Le widget de la mère ne bouge pas. C'est attendu, puisque le bébé actif est propre à chaque appareil, mais personne ne l'a expliqué à la mère.

## 4. Maquette hybride (V2) et coût

**Widget 4×2 Android** (420 × 222 dp, comme le repli de `BebeMaintenant.android.tsx:83-84` ; marge `PAD` 14) :

```
┌──────────────────────────── 420 dp ────────────────────────────┐
│ pad 14                                                         │
│ ╭────────────╮ ╭──────────╮                Aujourd'hui         │ en-tête 40 dp
│ │(L) Lina  ✓ │ │ (N) Noé  │  ← pastilles-boutons, h 40, l ≥ 72 │ (au lieu de 16)
│ ╰────────────╯ ╰──────────╯    écart 8 dp                      │
│ espace 6                                                       │
│ ┌──── zone maintenant 226 dp ────┐ │ ┌──── jour 141 dp ──────┐ │
│ │ (L) Tétée en cours · gauche    │ │ │ Repas    1 · 100 ml   │ │ zone 148 dp
│ │ 12:34                          │ │ │ Couches  1 · 11:57    │ │ (au lieu de 172)
│ │ depuis 03:02                   │ │ │ Sommeil  0 min        │ │
│ └────────────────────────────────┘ │ └───────────────────────┘ │
│ pad 14                         séparateur 25 dp                │
└────────────────────────────────────────────────────────────────┘
```

Calcul de la zone : 222 − 2×14 − 40 − 6 = 148 dp.

**Petit format** (< 250 dp, environ 180 × 180) : tout l'en-tête est **un seul** bouton de 40 dp de haut, `(L) Lina · 1/2 ›`. Un toucher passe au bébé suivant. À 3 bébés ou plus en 4×2 : `(L) Lina ✓` suivi de `+2 ›`, qui fait tourner les bébés.

Règles :
- Le **prénom passe en 14 sp, gras, couleur `strong`**, dans une pastille. L'initiale entourée `(L)` est reprise sur la tuile en cours, ce qui permet de vérifier deux fois. Pas de couleur par bébé seule : les 5 teintes de catégorie sont déjà prises, et une couleur seule ne suffit pas.
- L'état « affiché » se lit à la coche, au fond plein et à la graisse, pas à la couleur. Contraste AA.
- Le reste du widget ouvre l'app, comme aujourd'hui (clic racine, `ExpoWidgetEmittableTree.kt:132`).
- Libellés accessibles :
  - racine : « SuiviBaby, Lina, tétée en cours depuis 03 h 02 » ;
  - pastille : « Afficher Noé, bouton » ou « Lina, affichée ».
- Un foyer d'un seul bébé ne voit **rien** de tout ça : en-tête actuel, nom promu en `strong`.
- Si les données d'un bébé ont plus de 30 min, on affiche « à jour à 02:41 » à la place de « Aujourd'hui ».

**Coût :**

| Étape | Fichiers | Natif à recompiler |
|---|---|---|
| V1.x (nom promu, initiale, libellés accessibles) | `widgets/BebeMaintenant.android.tsx`, `widgets/BebeMaintenant.ios.tsx` | Non, JS seul |
| V2 sélecteur | `NowWidgetProps` (`utils/widgetSnapshot.ts`) : liste `children[]` et `selectedChildId` ; `hooks/useNowWidgetSync.ts` (écoute de tous les bébés) ; `services/widgetSync.ts` (l'envoi doit **conserver** le `selectedChildId` choisi dans le widget) ; les 2 widgets ; la config iOS dans `app.json` (paramètre enum dynamique) | Oui. Android : rebuild de 1 à 2 min. iOS : build EAS, car la config regénère le Swift |

Risques V2 :
- le coût Firestore et les écouteurs pour tous les bébés (brief) ;
- le poids des props, qui grossit d'environ N fois ;
- sur Android, le choix fait dans le widget s'applique à toutes les instances.

## 5. Ce qui reste incertain et comment le vérifier

1. **Un `Button` posé dans un widget dont la racine est cliquable (patch) gagne-t-il le toucher ?** Il faut le vérifier sur appareil, avec Pixel Launcher et One UI. Si ce n'est pas le cas, la racine ne doit plus être cliquable sous l'en-tête.
2. **L'envoi suivant de l'app écrase-t-il le choix fait dans le widget ?** `WidgetsInteraction` fusionne dans les mêmes props. Test : toucher « Noé », ouvrir l'app sur Lina, puis voir ce qu'affiche le widget. Il faut décider qui l'emporte. Je propose : le dernier geste dans le widget, jusqu'au prochain changement de bébé actif dans l'app.
3. **Délai de réponse au toucher.** La réexécution Hermes plus le rechargement prennent-ils moins de 500 ms ? Sur iOS, le budget de rechargement de WidgetKit s'applique-t-il aux App Intents ? Normalement non, selon la plateforme, mais c'est à mesurer.
4. **Fraîcheur des données du bébé non actif** (§2, contrainte A) : c'est ce qui justifie le « à jour à… ».
5. **Pratique réelle des concurrents** : installer Huckleberry ou Baby Tracker avec 2 profils et regarder le widget. Je ne l'ai pas vérifié.
6. **Libellés de lecteur d'écran** : à valider avec TalkBack et VoiceOver activés, sur un appareil de chaque plateforme.
