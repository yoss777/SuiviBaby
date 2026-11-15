# Refonte du widget « Bébé maintenant » : avis de la cellule design (2026-11-14)

# Cellule design : contenu du widget « Bébé maintenant »

Sources lues : le brief, les deux fichiers `widgets/BebeMaintenant.*.tsx`, `WIDGET_SPEC.md` et la capture D4. Outil d'appui : ui-ux-pro-max. Ses règles qui comptent ici : une échelle de tailles de texte cohérente, un contraste d'au moins 4,5:1 et le principe « ne jamais porter le sens par la couleur seule ».

## 1. Diagnostic

**Ce qui marche**
- **Android au repos** : « Dernier repas / il y a 7h35 » se lit en moins de 2 s. Le chiffre fait environ 34 sp, en gras, et la pastille prénom permet de repérer le widget.
- **iOS** : la session en cours (chrono `timerInterval`) est la meilleure lecture rapide des deux plateformes.

**Ce qui ne marche pas**
- **La hiérarchie est inversée dans la colonne droite d'Android.** Le gras 15 sp est donné à « 0 repas / 0 change / 0 min », donc à l'information la moins utile la nuit (retour terrain n° 5). L'information utile, « hier 19:37 », est en gris 12 sp. Elle répète en plus la gauche : « il y a 7h35 » et « hier 19:37 » disent la même chose deux fois.
- **Le fil d'événements est invisible partout.** Sur Android 4×2, il est sous la ligne de flottaison d'une `LazyColumn` qu'on ne devine pas. Sur iOS moyen, il est absent. Un contenu qu'il faut faire défiler n'est pas un contenu de widget.
- **Les deux plateformes ont deux grammaires.** iOS affiche « Repas / à 19:37 / N repas », Android « il y a 6h58 / dernier hier à 19:37 ». La même ligne n'a ni le même verbe ni la même hiérarchie.
- **iOS au repos donne une durée sans repère.** Le `dateStyle="relative"` affiche « 7 h 35 min », sans « il y a », et ne montre que le repas, sans le change.
- **Accessibilité** : un Proche entend « Toucher le repas… pour noter » alors qu'il ne peut pas saisir. Le gris `#9ca3af` en 11-12 sp sur `#1f2937` est limite pour un œil mal réveillé.

## 2. Verdict : refonte partielle

C'est le **contenu** qu'il faut refondre, pas le moteur de rendu. Les deux moteurs (Glance et WidgetKit) restent, avec le temps réel, les vues natives patchées et les liens profonds, qui sont acquis. On réécrit en revanche **un seul modèle de contenu commun** : quels blocs, dans quel ordre, avec quels mots. Il est décrit dans `functions/shared/widget` et les deux rendus l'appliquent.

Règles :
1. Rien ne défile.
2. Le chiffre le plus gros répond à « depuis quand ? ».
3. Le fil d'événements a une hauteur fixe et un nombre de lignes calculé selon la place.
4. Les compteurs du jour descendent en note de bas de widget.

Une refonte totale coûterait cher et réglerait des défauts qui ne viennent pas du moteur.

## 3. Propositions

Le prénom, l'heure et les noms d'aidants sont fictifs dans toutes les maquettes.

### A. « Depuis + fil fixe » (recommandée)

Partagé entre plateformes : le bloc Maintenant (sessions, sinon « il y a » pour le repas et le change), le fil de N lignes et le pied « Auj. ».

```
iOS petit / Android 2×2         iOS moyen / Android 4×2
┌─────────────────┐   ┌──────────────────────────────────────┐
│ (Lina)          │   │ (Lina)               Récents          │
│ ● Repas         │   │ ● Repas        │ 05:40 ● Biberon 120 │
│ il y a 7h35     │   │ il y a 7h35    │ 03:10 ● Change      │
│ ● Change        │   │ ● Change       │ 01:55 ● Tétée G     │
│ il y a 2h02     │   │ il y a 2h02    │                     │
└─────────────────┘   │ Auj. 1 repas · 1 change · 0h40 dodo   │
                      └──────────────────────────────────────┘
Android 3×2 : comme le 4×2, fil limité à 2 lignes, sans heure à la ligne.
iOS grand : le moyen, puis 7 lignes de fil et le pied.
En session : le chrono (34) remplace le bloc repas ;
« Change il y a » passe dessous en 15 sp.
```

### B. « Fil d'abord »

Le widget devient une chronologie. L'en-tête porte l'état, en dessous viennent les événements du plus récent au plus ancien.

```
iOS moyen / Android 4×2              iOS petit / Android 2×2
┌───────────────────────────────┐    ┌─────────────────┐
│ (Lina)   Repas il y a 7h35    │    │ (Lina)          │
│ 05:40 ● Biberon 120 ml        │    │ 05:40 Biberon   │
│ 03:10 ● Change                │    │ 03:10 Change    │
│ 01:55 ● Tétée G · 14 min      │    │ il y a 7h35     │
└───────────────────────────────┘    └─────────────────┘
Android 3×2 : 2 lignes. iOS grand : 9 lignes.
```

### C. « Deux questions »

Le minimalisme maximal : seulement le repas et le change en très grand. Le fil n'existe que dans iOS grand et Android 4×3.

```
iOS moyen / Android 3×2 et 4×2
┌───────────────────────────────┐
│ (Lina)                        │
│  REPAS         CHANGE         │
│  il y a        il y a         │
│  7h35          2h02           │
└───────────────────────────────┘
iOS petit / Android 2×2 : les deux empilés.
iOS grand : en plus, le fil de 7 lignes.
```

## 4. Coût et risques

| | A | B | C |
|---|---|---|---|
| Jours | 4-5 (2 Android, 1,5 iOS, 1 spécification et tests) | 4 | 2,5 |
| Dette | En baisse : un seul modèle, la `LazyColumn` disparaît | Moyenne : calcul du nombre de lignes, troncature des libellés | Faible |
| Temps réel | Inchangé sur Android. Sur iOS, le fil vieillit tant que le push E7 n'existe pas | Plus exposé : le fil est le cœur du widget, donc un fil périmé se voit tout de suite sur iOS | Le moins exposé : deux dates qui avancent seules |
| Accessibilité | Lecture dans l'ordre visuel. Libellé « Noter » retiré pour un Proche | Les durées de session sont lues en heure, pas « il y a » | La meilleure lisibilité |

Risque commun : sur iOS, le relatif natif s'écrit « 7 h 35 min ». Pour respecter la grammaire tranchée « il y a 7h35 », il faut poser « il y a » à côté d'un `timerInterval` compté vers le haut, au format h:mm. C'est à prototyper, car il faut éviter l'affichage des secondes.

## 5. Notes /20 (angle : coup d'œil de 2 s la nuit, cohérence iPhone/Android)

- **A : 17/20.** Une seule grammaire, l'essentiel en grand, et le fil visible sans défiler. On perd un peu de place pour le fil en 3×2.
- **C : 14/20.** Lecture imbattable, mais les autres aidants ne voient plus « ce qui s'est passé », alors que c'est le différenciateur du produit.
- **B : 11/20.** Il faut lire au lieu de constater, et le fil sans push iOS ment.

Recommandation au board : **A**, implémentée d'abord dans le modèle partagé, puis sur Android, puis sur iOS.
