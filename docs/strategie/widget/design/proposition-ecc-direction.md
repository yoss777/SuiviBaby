# Proposition de design : widget Android « Bébé maintenant »

Direction ECC (`frontend-design-direction`, puis `make-interfaces-feel-better`).
Réponse au brief `BRIEF_REDESIGN_ANDROID.md`. Conçue pour la future liste `lives` (0 à 3 sessions).

---

## 0. Direction en une phrase

**« Le tableau des départs de la chambre. »** Une seule surface calme, sans tuiles colorées. À gauche, *quoi* (icône et mot dans la couleur de la catégorie). À droite, une **colonne de chronos alignés à droite**, en chiffres tabulaires, qu'on lit de haut en bas comme un tableau d'horaires. Sous un filet, la journée en petit.

- **Usage** : coup d'œil d'une seconde, la nuit, d'une main, par un parent fatigué.
- **Ton** : utilitaire et doux, dense mais aéré. Pas de décor.
- **Détail qui marque** : la colonne de chronos alignés à droite. Sa largeur est réservée pour `H:MM:SS` dès le départ, donc rien ne bouge quand un chrono passe une heure. Roboto a des chiffres tabulaires par défaut, donc pas de tremblement à chaque seconde.
- **Contraintes respectées** : `Column`, `Row`, `Box`, `Text`, `Spacer`, `Image` (vecteurs), `Chronometer`, `background`, `cornerRadius`, `padding`, `size`, `width`, `height`. Aucun `weight`, aucune bordure, aucune ombre, aucun dégradé. Le « pousser à droite » est **calculé** à partir de `widthDp`.

---

## 1. Principe (3 lignes)

1. **On lit d'abord les chronos**, la plus grosse valeur, en texte fort, à droite. S'il n'y a pas de session : le temps écoulé depuis le dernier repas.
2. **Ensuite, ce que mesure chaque chrono** : icône et libellé dans la couleur de la catégorie, à gauche, avec « depuis 14:32 » en petit dessous. L'ordre de lecture devient : quoi → combien → depuis quand.
3. **Enfin, la journée** : trois colonnes discrètes (Repas, Couches, Sommeil) sous un filet. Un chiffre fort par colonne, le détail en petit. Le rouge n'apparaît que pour un rappel dépassé, toujours accompagné d'une icône et d'un mot.

---

## 2. Maquettes ASCII

### Conventions

- Référence 4×2 : **356 × 198 dp**. C'est le S21 Ultra de la capture : 936 px / 2,625 ≈ 356 dp. Les formules couvrent 330–420 × 150–225 dp (voir §3.6).
- Référence 2×2 : **150 × 150 dp**.
- `PAD` = marge intérieure du widget. `innerW = W − 2·PAD`, `innerH = H − 2·PAD`.
- `[i]` = icône vectorielle 16 dp (drawable). `▸chrono` = nœud `Chronometer`. `───` = filet de 1 dp (voir §3.4).
- Les nombres en marge sont des hauteurs en dp. Hauteur de ligne estimée : `ceil(1,3 × sp)`.

---

### 2.1 4×2 au repos

```
W = 356, H = 198, PAD = 14  →  innerW = 328, innerH = 170
┌──────────────────────────────────────────────────────────┐ radius 20
│                                                          │ 14 PAD
│ Abebech Lisyäl Aynalem                                   │ 17  nom 13sp bold, soft
│                                                          │  8
│ [i] Dernier repas                              il y a    │ ┐
│     Tétée à 11:50                                        │ │
│     Prochain sein : droit                  ▸2:14:05      │ │ 83  zone « Maintenant »
│                                                          │ ┘   chrono 40sp bold, fort, aligné à droite
│                                                          │ 10
│ ──────────────────────────────────────────────────────── │  1  filet
│                                                          │ 10
│ [i] Repas          [i] Couches         [i] Sommeil       │ 15  libellés 11sp bold, couleur catégorie
│ 4  · 360 ml        5  dernière 11:57   3 h 10            │ 24  valeur 18sp bold fort + détail 12sp soft
│                                                          │ 14 PAD
└──────────────────────────────────────────────────────────┘
 ←18→←10→←──── Lw = 160 ────→←───────── Cw = 140 ─────────→
 (colonne des 3 jours : colW = floor(328 / 3) = 109)
```

- « il y a » (12sp, soft) est posé **au-dessus** du chrono, dans la même colonne alignée à droite. Une durée comme `12:34` ne peut donc pas être lue comme une heure.
- Sans `nextSide` : la 3e ligne de gauche disparaît.
- Aucun repas connu : à gauche « Aucun repas enregistré », sans chrono.
- Dernier repas il y a plus de 24 h : à la place du chrono, on affiche l'heure fixe « 11:50 » (16sp), précédée de « hier » ou de la date.

### 2.2 4×2 avec une session en cours (promenade)

```
┌──────────────────────────────────────────────────────────┐
│ Abebech Lisyäl Aynalem                                   │ 17
│                                                          │  8
│ [i] Promenade en cours                                   │ ┐  libellé 14sp bold, vert texte
│     depuis 14:32                           ▸12:34        │ │ 83  chrono 40sp bold, fort
│                                                          │ ┘  (Box Cw=140, alignement centre-fin)
│                                                          │ 10
│ ──────────────────────────────────────────────────────── │  1
│                                                          │ 10
│ [i] Repas          [i] Couches         [i] Sommeil       │ 15
│ 4  · 360 ml        5  dernière 11:57   3 h 10            │ 24
└──────────────────────────────────────────────────────────┘
```

Le chrono démarre à `timerStartMs` et défile seul, même app fermée. Au-delà d'une heure, il passe en `1:02:10` sans déplacer la mise en page : la largeur `Cw` est réservée pour 7 caractères dès le départ.

### 2.3 4×2 avec deux sessions en même temps (sommeil + promenade)

Ordre imposé : tétée, sommeil, promenade.

```
┌──────────────────────────────────────────────────────────┐
│ Abebech Lisyäl Aynalem                                   │ 17
│                                                          │  8
│ [i] Sommeil en cours                                     │ ┐ 38  libellé 14sp bold violet texte
│     depuis 13:05                          ▸1:21:40       │ ┘     chrono 28sp bold, Cw = 100
│                                                          │  7
│ [i] Promenade en cours                                   │ ┐ 38
│     depuis 14:32                            ▸12:34       │ ┘
│                                                          │ 10
│ ──────────────────────────────────────────────────────── │  1
│                                                          │ 10
│ [i] Repas          [i] Couches         [i] Sommeil       │ 15
│ 4  · 360 ml        5  dernière 11:57   2 h 05            │ 24
└──────────────────────────────────────────────────────────┘
```

Les deux chronos ont la même taille et sont alignés sur le même bord droit. Aucune session ne domine l'autre : elles sont simultanées et aussi vraies l'une que l'autre.

### 2.3 bis 4×2 avec trois sessions (tétée + sommeil + promenade)

On passe en **lignes simples**. La journée se replie en **une ligne compacte**.

```
┌──────────────────────────────────────────────────────────┐
│ Abebech Lisyäl Aynalem                                   │ 17
│                                                          │  8
│ [i] Tétée · sein gauche  droit 4:10         ▸6:12        │ 33  libellé 14sp bold + détail 12sp soft
│                                                          │  4
│ [i] Sommeil  depuis 13:05                ▸1:21:40        │ 33  chrono 22sp bold, Cw = 79
│                                                          │  4
│ [i] Promenade  depuis 14:32                ▸12:34        │ 33
│                                                          │  8
│ ──────────────────────────────────────────────────────── │  1
│                                                          │  8
│ 4 repas · 5 couches · 2 h 05 de sommeil                  │ 16  12sp soft (chiffres en fort)
└──────────────────────────────────────────────────────────┘
 innerH : 17+8 + 3·33+2·4 + 8+1+8+16 = 165 ≤ 170
```

En mode ligne simple, le libellé « … en cours » perd « en cours » : le chrono qui défile suffit à dire que la session est en cours. Le détail (« depuis 13:05 ») reste sur la même ligne, en 12sp soft, et peut être coupé (`maxLines=1`) si la largeur manque.

### 2.4 4×2 avec tétée en cours (sein actif et autre sein)

```
┌──────────────────────────────────────────────────────────┐
│ Abebech Lisyäl Aynalem                                   │ 17
│                                                          │  8
│ [i] Tétée · sein gauche                                  │ ┐  14sp bold, rose texte
│     droit 4:10 · depuis 14:32                ▸6:12       │ │ 83  chrono = sein actif, 40sp bold
│                                                          │ ┘
│                                                          │ 10
│ ──────────────────────────────────────────────────────── │  1
│                                                          │ 10
│ [i] Repas          [i] Couches         [i] Sommeil       │ 15
│ 4  · 360 ml        5  dernière 11:57   3 h 10            │ 24
└──────────────────────────────────────────────────────────┘
```

- Le chrono mesure le **sein actif**. Le libellé le nomme en toutes lettres (« sein gauche ») et l'autre sein est donné en clair (« droit 4:10 »). `otherSideLabel` (« D 4:10 ») est réécrit au rendu : `G` → « gauche », `D` → « droit ».
- **Jamais d'auteur** sur une tétée. Aucun nom d'aidant n'apparaît nulle part sur cette ligne.
- **En pause** (`pausedAtMs` présent) :

```
│ [i] Tétée · en pause                                     │   libellé 14sp bold, rose texte
│     sein gauche · droit 4:10                 ▸6:12       │   chrono figé, couleur SOFT (pas fort)
```

  La pause est dite par le **mot** « en pause » **et** par le chrono figé en couleur secondaire. Jamais par la couleur seule.

### 2.5 4×2 avec un rappel dépassé

**a) Au repos, rappel repas dépassé** (`now ≥ alerts.mealAtMs`) :

```
┌──────────────────────────────────────────────────────────┐
│ Abebech Lisyäl Aynalem                                   │
│                                                          │
│ [i] Dernier repas                      [!] Rappel        │  12sp bold ROUGE + icône alerte 12dp rouge
│     Tétée à 11:50                                        │
│     Prochain sein : droit                  ▸3:31:05      │  chrono 40sp bold ROUGE
│                                                          │
│ ──────────────────────────────────────────────────────── │
│ [i] Repas          [i] Couches         [i] Sommeil       │
│ 4  · 360 ml        5  dernière 11:57   3 h 10            │
└──────────────────────────────────────────────────────────┘
```

Au-dessus du chrono, « il y a » est remplacé par `[!] Rappel`. Aucun fond rouge, aucun clignotement.

**b) Session en cours et rappel couches dépassé** (`now ≥ alerts.diaperAtMs`) : seule la colonne Couches change.

```
│ [i] Repas          [i] Couches         [i] Sommeil       │
│ 4  · 360 ml        5  [!] rappel       3 h 10            │  « 5 » en ROUGE bold, « [!] rappel » 12sp bold ROUGE
```

Le **libellé** « Couches » garde sa couleur de catégorie, donc la colonne reste identifiable. La valeur et le mot passent en rouge, et le mot remplace « dernière 11:57 ».
Le même traitement s'applique à la colonne Repas quand une session occupe la zone « Maintenant ».

En ligne compacte (3 sessions) : `4 repas · [!] 5 couches, rappel · 2 h 05 de sommeil`. Le segment en retard est en rouge bold, les autres restent en soft.

### 2.6 2×2 au repos et en cours

```
Au repos                          1 session                        Tétée en cours
W=H=150, PAD=12 → 126×126
┌──────────────────────┐         ┌──────────────────────┐         ┌──────────────────────┐
│ Abebech Lisyäl…      │ 16      │ Abebech Lisyäl…      │         │ Abebech Lisyäl…      │  12sp bold soft
│                      │  6      │                      │         │                      │
│ [i] Repas il y a     │ 16      │ [i] Promenade        │         │ [i] Sein gauche      │  12sp bold, catégorie
│ ▸2:14:05             │ 39      │ ▸12:34               │         │ ▸6:12                │  30sp bold fort
│ Prochain : sein droit│ 15      │ depuis 14:32         │         │ droit 4:10           │  11sp soft
│                      │  8      │                      │         │                      │
│ 4 repas · 5 couches  │ 15      │ 4 repas · 5 couches  │         │ 4 repas · 5 couches  │  11sp soft
└──────────────────────┘         └──────────────────────┘         └──────────────────────┘
 16+6+16+2+39+2+15+8+15 = 119 ≤ 126
```

```
2 sessions (la journée disparaît)  3 sessions (nom et libellés disparaissent)
┌──────────────────────┐         ┌──────────────────────┐
│ Abebech Lisyäl…      │ 16      │ [i]          ▸6:12   │ 34  icône 18dp + chrono 22sp aligné à droite
│                      │  6      │                      │  6
│ [i] Sommeil          │ 16      │ [i]        ▸1:21:40  │ 34
│ ▸1:21:40             │ 31      │                      │  6
│                      │  8      │ [i]         ▸12:34   │ 34
│ [i] Promenade        │ 16      │                      │
│ ▸12:34               │ 31      └──────────────────────┘
└──────────────────────┘          3·34 + 2·6 = 114 ≤ 126
 16+6+47+8+47 = 124 ≤ 126 (chrono 24sp)
```

Avec trois sessions sur 2×2, **l'icône est le seul libellé** : sa forme (sein, lune, poussette) porte le sens, et son contraste dépasse 3:1 (voir §5). Pour la tétée, l'icône est suivie de la lettre du sein : `[i] G  ▸6:12`.

---

## 3. Spécification exacte

### 3.1 Échelle typographique (Roboto système, 2 graisses seulement)

| Rôle | sp | Graisse | Couleur |
|---|---|---|---|
| Chrono, 1 session (4×2) / repos 4×2 | **40** | bold | `strong` (rouge si rappel ; `soft` si en pause) |
| Chrono, 2 sessions (4×2) | **28** | bold | idem |
| Chrono, 3 sessions (4×2) | **22** | bold | idem |
| Chrono 2×2 : repos ou 1 session / 2 sessions / 3 sessions | **30 / 24 / 22** | bold | idem |
| Libellé de session (« Promenade en cours ») 4×2 | 14 | bold | texte de la catégorie |
| Libellé de session 2×2 | 12 | bold | texte de la catégorie |
| Détail (« depuis 14:32 », « droit 4:10 »), « il y a » | 12 (2×2 : 11) | normal | `soft` |
| Nom de l'enfant | 13 (2×2 : 12) | bold | `soft` |
| Libellé de la journée (« Repas ») | 11 | bold | texte de la catégorie |
| Valeur de la journée (« 4 », « 3 h 10 ») | 18 | bold | `strong` (rouge si rappel) |
| Détail de la journée (« · 360 ml ») | 12 | normal | `soft` |
| Ligne compacte de la journée | 12 (2×2 : 11) | normal ; chiffres en bold `strong` | `soft` |
| « Rappel » / « rappel » | 12 | bold | `alert` |

Il y a **4 tailles d'appui** (40 → 18 → 14 → 12), plus 11 pour les petits libellés. L'écart de 40 à 14 crée la hiérarchie à lui seul, sans fond coloré.
Tous les `Text` ont `maxLines = 1`. La troncature se fait par ellipse, jamais par débordement.

### 3.2 Couleurs

| Jeton | Clair | Sombre | Usage |
|---|---|---|---|
| `bg` | `#ffffff` | `#1f2937` | fond du widget (une seule surface) |
| `strong` | `#1f2937` | `#f9fafb` | chronos, valeurs |
| `soft` | `#6b7280` | `#9ca3af` | nom, détails, « il y a », chrono en pause |
| `hairline` | `#e5e7eb` | `#374151` | filet de séparation |
| `alert` | `#b91c1c` | `#f87171` | rappel dépassé (valeur + mot + icône) |
| texte tétée | `#B23C66` | `#E89AB4` | libellé et icône tétée |
| texte sommeil | `#5B4A85` | `#A898D0` | libellé et icône sommeil (tokens app `categoryTextColors`) |
| texte promenade | `#4A7F33` | `#8BC46B` | libellé et icône promenade |
| texte repas | `#A83F23` | `#E8785A` | libellé et icône repas (tokens app) |
| texte couches | `#2B6A6A` | `#5BA4A4` | libellé et icône couches (tokens app) |

- Sur fond blanc, les accents purs du brief (`#D66B8F`, `#8BC46B`, `#7C6BA4`) ne passent pas en texte (3,3:1, 2,1:1 et 4,4:1 environ). En clair, on utilise donc les **teintes texte** de l'app (`constants/dashboardColors.ts`, `categoryTextColors`), complétées pour la tétée (`#B23C66`) et la promenade (`#4A7F33`), qui n'y ont pas encore de teinte texte. En sombre, les primaires passent (sauf le violet, d'où `#A898D0`, comme dans l'app).
- Les fonds pâles de catégorie (`#FDF0F4`…) **ne sont plus utilisés** dans le widget (voir §4).

### 3.3 Marges, espacements, rayons

| Élément | 4×2 | 2×2 |
|---|---|---|
| `PAD` (marge intérieure, 4 côtés) | 14 dp (12 si `W < 340` ou `H < 170`) | 12 dp |
| Rayon du conteneur | 20 dp (le lanceur Android 12+ peut le recouper à son propre rayon) | 20 dp |
| Nom → zone « Maintenant » | 8 dp | 6 dp |
| Icône → libellé | 10 dp (icône 18 dp) ; lignes simples : 8 dp (icône 16 dp) | 6 dp (icône 14 dp ; 18 dp avec 3 sessions) |
| Libellé → détail (même colonne) | 2 dp | 2 dp |
| Entre deux sessions | 7 dp (2 sessions), 4 dp (3 sessions) | 8 dp (2), 6 dp (3) |
| Zone « Maintenant » → filet → journée | 10 + 1 + 10 dp (compact : 8 + 1 + 8) | pas de filet ; 8 dp avant la ligne de journée |
| Libellé de la journée → valeur | 2 dp | — |
| Icône de journée → libellé | 4 dp (icône 12 dp) | — |

**Rayons** : un seul rayon (20 dp) et **aucune surface imbriquée**. La règle de rayons concentriques (`extérieur = intérieur + padding`) devient sans objet, parce qu'il n'y a plus de carte dans la carte. C'est voulu.

### 3.4 Le filet

C'est une `Box` avec `fillMaxWidth()`, `height(1)` et `background(hairline)`. Ce **n'est pas une bordure** : c'est un aplat de 1 dp, construit avec les briques autorisées.
Si le fondateur la refuse, on la remplace par `Spacer(height = 21)`. La séparation tient alors par l'espace et le changement d'échelle typographique.

### 3.5 Libellés français exacts

| Cas | Gauche, ligne 1 | Gauche, ligne 2 (et 3) | Au-dessus du chrono |
|---|---|---|---|
| Repos | `Dernier repas` (2×2 : `Repas il y a`) | `Tétée à 11:50` (= `lastMealLabel`) ; `Prochain sein : droit` (2×2 : `Prochain : sein droit`, qui remplace la ligne 2) | `il y a` |
| Repos, rappel dépassé | `Dernier repas` | idem | `[!] Rappel` |
| Repos, aucun repas | `Aucun repas enregistré` | — | — (pas de chrono) |
| Tétée | `Tétée · sein gauche` / `Tétée · sein droit` (2×2 : `Sein gauche`) | `droit 4:10 · depuis 14:32` | — |
| Tétée en pause | `Tétée · en pause` | `sein gauche · droit 4:10` | — |
| Sommeil | `Sommeil en cours` (ligne simple : `Sommeil`) | `depuis 13:05` | — |
| Promenade | `Promenade en cours` (ligne simple : `Promenade`) | `depuis 14:32` | — |
| Journée | `Repas` · `Couches` · `Sommeil` | `4` + `· 360 ml` · `5` + `dernière 11:57` (ou `· 11:57` si `colW < 106`) · `3 h 10` / `45 min` / `0 min` | — |
| Journée, rappel | — | `5` + `[!] rappel` | — |
| Ligne compacte | `4 repas · 5 couches · 2 h 05 de sommeil` (2×2 : `4 repas · 5 couches`) | | |
| Pas de données (`day` absent, `childName` vide) | nom : `SuiviBaby` ; zone : `Ouvrez l'app pour commencer` (14sp, soft) | | |

Singulier : `1 repas`, `1 couche`. Le libellé de colonne reste `Couches`. Heures au format `HH:MM` sur 24 h, comme `formatClock`.

### 3.6 Calcul des largeurs et hauteurs (sans `weight`)

```
innerW = W − 2·PAD
iconW  = 18 (ligne double) | 16 (ligne simple) ; gap = 10 | 8
Cw     = ceil(3.4 × chronoSp) + 4        // réservé pour « H:MM:SS » : 40sp→140, 28sp→100, 22sp→79
Lw     = innerW − iconW − gap − Cw        // colonne libellé/détail
Row { Image(iconW) · Spacer(gap) · Column(width=Lw){…} · Box(width=Cw, contentAlignment=CenterEnd){ Chronometer } }

Journée : colW = floor(innerW / 3), trois Column(width=colW).
Au repos, la colonne de droite est une Column(width=Cw, horizontalAlignment=End) { « il y a » ; Spacer(2) ; Chronometer }.
```

**Choix du mode selon la hauteur disponible** (`n` = nombre de sessions, `innerH = H − 2·PAD`) :

| Condition (4×2, `W ≥ 250`) | Zone « Maintenant » | Journée |
|---|---|---|
| `n ≤ 1` | 1 bloc, chrono 40sp (36sp si `H < 170`) | 3 colonnes si `innerH ≥ 150`, sinon ligne compacte |
| `n = 2` | 2 lignes doubles, chrono 28sp | 3 colonnes si `innerH ≥ 165`, sinon ligne compacte (et lignes simples si `innerH < 140`) |
| `n = 3` | 3 lignes simples, chrono 22sp | ligne compacte si `innerH ≥ 150`, sinon **masquée** |

Ordre de priorité quand la place manque : **sessions** (jamais retirées) > **nom** > **journée**. C'est la règle du fondateur : toutes les sessions, chacune avec son chrono.

**Taille de police du système** : les `sp` grossissent avec le réglage d'accessibilité, alors que `Cw` et les hauteurs sont calculés en dp à l'échelle 1. Recommandation : faire passer `fontScale` par le même patch que `widthDp`/`heightDp`, puis multiplier `chronoSp` dans `Cw` et les hauteurs de ligne. Au-delà de 1,3, retomber d'un cran de mode (par exemple, ligne compacte de journée).

### 3.7 Ressources à ajouter (vecteurs, `res/drawable`)

Ce sont `ic_widget_nursing`, `_sleep`, `_walk`, `_meal`, `_diaper` et `_alert`. **Chacune en deux variantes**, `_light` et `_dark`, colorées avec la teinte texte de la catégorie (§3.2), puisque l'`Image` n'a pas de teinte dynamique. Cela fait 12 fichiers.
Les formes reprennent les FontAwesome de l'app : `person-breastfeeding`, `moon`, `person-walking`, `utensils`/`bottle`, `baby` et `circle-exclamation`.

---

## 4. Ce que je retire, et pourquoi

| Retiré | Pourquoi |
|---|---|
| **Les 4 tuiles colorées** (grande tuile « Maintenant » et 3 tuiles « Journée ») | Elles créent des cartes dans la carte, alourdissent l'ensemble (reproche 4) et font baisser le contraste en sombre. Une seule surface, plus la typographie, suffit à hiérarchiser. |
| **L'heure de début en héros** (« 11:59 ») | C'est une heure, pas un temps écoulé (reproche 2). Elle est remplacée par le **Chronometer** et rétrogradée en détail, « depuis 14:32 ». |
| **« depuis » sous le chiffre** | L'ordre de lecture était faux (reproche 3). « depuis 14:32 » devient une seule phrase, sous le libellé. |
| **Le partage 55/45 entre héros et journée** | Il gaspillait la largeur et ne permettait pas plusieurs sessions. La zone « Maintenant » prend toute la largeur, et la journée passe dessous. |
| **`alsoKind` affiché nulle part** | Toutes les sessions ont désormais leur propre ligne et leur propre chrono. |
| **Libellés de catégorie en accent pur sur fond pâle** | Plusieurs passaient sous 4,5:1. Ils sont remplacés par les teintes texte de l'app. |
| **« Sommeil 0 min » en gros dans une tuile** | Il garde sa place, mais en petit, dans la colonne de journée. |
| **Le fond rouge de rappel (`alertTile`)** | Le brief l'interdit. Il est remplacé par une valeur rouge, une icône et le mot « rappel ». |

---

## 5. Accessibilité

**Contrastes** (calculés, WCAG 2.x) :

| Paire | Clair | Sombre | Seuil visé |
|---|---|---|---|
| `strong` sur `bg` (chronos, valeurs) | 14,7:1 | 14,1:1 | AA 4,5 |
| `soft` sur `bg` (détails 11–12sp) | 4,8:1 | 5,8:1 | AA 4,5 ✓ |
| `alert` sur `bg` | 6,5:1 | 5,3:1 | AA 4,5 ✓ |
| Tétée `#B23C66` / `#E89AB4` | 5,6:1 | 6,8:1 | ✓ |
| Sommeil `#5B4A85` / `#A898D0` | 7,6:1 | 5,6:1 | ✓ |
| Promenade `#4A7F33` / `#8BC46B` | 4,8:1 | 7,1:1 | ✓ |
| Repas `#A83F23` / `#E8785A` | 6,2:1 | 5,1:1 | ✓ |
| Couches `#2B6A6A` / `#5BA4A4` | 6,2:1 | 5,1:1 | ✓ |
| Filet `hairline` | 1,2:1 | 1,4:1 | décoratif (n'est pas porteur de sens) |

Les icônes utilisent les mêmes teintes, donc ≥ 4,5:1. C'est au-dessus des 3:1 exigés pour un élément graphique, et cela compte surtout en 2×2 avec trois sessions, où l'icône est le seul libellé.

**Lisibilité de nuit**
- Le thème sombre suit le système. Le fond `#1f2937` est un bleu nuit, pas un noir pur. Il n'y a **aucun aplat clair** en sombre : seuls les chiffres sont clairs, donc aucune zone n'éblouit.
- Le chrono principal fait 40sp en bold et se lit sans lunettes à bout de bras. Il n'y a pas de couleur saturée en grande surface.
- Aucun clignotement ni aucune animation. Seules les secondes du chrono défilent, et elles ne bougent pas la mise en page (largeur réservée, chiffres tabulaires).

**Le sens ne passe jamais par la couleur seule**
- Catégorie : icône (forme) + mot. En 2×2 avec trois sessions : la forme de l'icône, plus « G »/« D » pour la tétée.
- Pause : le mot « en pause » + chrono figé.
- Rappel dépassé : icône `[!]` + le mot « Rappel »/« rappel » + couleur.
- Sein actif : en toutes lettres, « sein gauche » ou « sein droit ».

**Limites connues, à vérifier sur appareil**
- Il faut vérifier si `Image` et `Chronometer` acceptent une description de contenu (TalkBack) dans notre pont expo-widgets. Si c'est le cas : « Tétée en cours, sein gauche, depuis 14 h 32 ». Sinon, le texte voisin porte l'information.
- Les tailles de police d'accessibilité nécessitent `fontScale` (§3.6). Sans lui, un réglage au-delà de 1,3 peut tronquer les libellés (par une ellipse, sans débordement).
- Les maquettes sont estimées à partir de métriques Roboto (chiffres ≈ 0,56 em, deux-points ≈ 0,27 em, ligne ≈ 1,3 × sp). Il faut les contrôler sur le S21 Ultra en 4×2 et en 2×2, en clair et en sombre, avec 0, 1, 2 et 3 sessions et un rappel.
