# Proposition : widget Android « Bébé maintenant »

Auteur : designer mobile (guidé par le skill ui-ux-pro-max : règles « contraste 4,5:1 », « jamais la couleur seule », « hiérarchie de lecture », « mode sombre »).
Cible : Jetpack Glance via expo-widgets, avec seulement les briques du brief (Column, Row, Box, Text, Spacer, Image, Chronometer, background, cornerRadius, padding, size/width/height/fill). Pas de weight, de bordure, d'ombre ni de dégradé.

---

## 1. Principe

1. **Une règle visuelle unique : un fond teinté avec un gros chrono, c'est qu'une session tourne.** Au repos, la zone « Maintenant » n'a pas de fond : seule l'heure du dernier repas s'y affiche en gros.
2. **On lit d'abord le chrono, ensuite ce que c'est, enfin depuis quand** (tétée, sommeil, promenade, dans cet ordre). Toutes les sessions en cours sont empilées, chacune avec son propre chrono.
3. **La journée est un résumé neutre** dans une colonne de texte sans tuile, à droite : on la lit après le reste. Le rouge sert uniquement aux rappels dépassés, et toujours avec une icône et un mot.

---

## 2. Maquettes ASCII

### Grille commune (4×2)

Référence des maquettes : **W = 360 dp, H = 180 dp**. Toutes les valeurs se recalculent à partir de `widthDp` et `heightDp`.

```
PAD     = 14                       marge intérieure du widget
innerW  = W - 2*PAD                = 332
innerH  = H - 2*PAD                = 152
HEAD_H  = 16, HEAD_GAP = 6         ligne d'en-tête
zoneH   = innerH - HEAD_H - HEAD_GAP           = 130
SEP     = 12 + 1 + 12              espace, filet de 1 dp, espace = 25
Rw      = clamp(round(innerW*0.36), 112, 150)  = 120   colonne Journée
Lw      = innerW - Rw - SEP                    = 187   zone Maintenant
```

Le filet vertical est une `Box` de 1 × zoneH dp avec un `background` : ce n'est pas une bordure.
Pour aligner à droite sans weight, on place le contenu dans une `Box(width = largeur calculée, contentAlignment = centerEnd)`.

Légende : `▓` = fond teinté de la catégorie ; `[ic]` = icône vectorielle 16 dp ; `⏱` = nœud Chronometer qui défile.

---

### 2.1 4×2 au repos

```
┌──────────────────────────────────────────────────────────────┐  360 × 180, rayon 20
│ Abebech                              │ Aujourd'hui           │  en-tête 16 dp
│                                      │                       │  6 dp
│ [ic repas] Dernier repas             │ [ic] 4 repas          │
│                                      │      dernier 11:50    │
│ 11:50                                │                       │
│                                      │ [ic] 3 couches        │
│ Tétée · il y a ⏱2:14:05              │      dernière 11:57   │
│ Prochain sein : droit                │                       │
│                                      │ [ic] 2 h 10           │
│                                      │      de sommeil       │
└──────────────────────────────────────────────────────────────┘
 |<-------- Lw 187, sans fond -------->|25|<----- Rw 120 ----->|
```

- Zone Maintenant (Column, centrée verticalement, sans fond) :
  - ligne 1 : `[ic_widget_meal]` 16 dp + 6 dp + « Dernier repas » ;
  - ligne 2 : « 11:50 » en gros ;
  - ligne 3 : un Row avec le Text « Tétée · il y a » puis un Chronometer (début = `lastMealMs`) de même taille et de même couleur. Le type de repas vient de `lastMealLabel` avant « à », et il est omis quand il vaut « Repas » ;
  - ligne 4 (seulement si `nextSide` existe) : « Prochain sein : droit » / « gauche ».
- Si `lastMealMs` est absent : une seule ligne, « Pas encore de repas aujourd'hui » (14 sp, texte secondaire, sur 2 lignes au maximum).
- Si `zoneH < 108` : le gros chiffre passe à 30 sp et les espacements internes à 0.

### 2.2 4×2 : une session en cours (promenade)

```
┌──────────────────────────────────────────────────────────────┐
│ Abebech                              │ Aujourd'hui           │
│ ┌▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓┐ │                       │
│ │▓ [ic marche] Promenade en cours  ▓│ │ [ic] 4 repas          │
│ │▓                                 ▓│ │      dernier 11:50    │
│ │▓ ⏱ 42:17                         ▓│ │ [ic] 3 couches        │
│ │▓                                 ▓│ │      dernière 11:57   │
│ │▓ depuis 14:32                    ▓│ │ [ic] 2 h 10           │
│ └▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓┘ │      de sommeil       │
└──────────────────────────────────────────────────────────────┘
   tuile Lw × zoneH = 187 × 130, rayon 16, padding 12
```

- Ordre de lecture corrigé : nom de la session, **chrono**, puis « depuis 14:32 » **en dessous**, en petit. Le mot « depuis » est collé à son heure.
- Chrono : `chronoSp = min(36, floor((Lw - 24) / 4.3))`, soit 36 sp ici et 32 sp à W = 330. Il garde sa place en `H:MM:SS` après une heure (7 caractères × 0,6 em environ).

### 2.3 4×2 : deux sessions en même temps (promenade + sommeil)

Ordre fixe : tétée, sommeil, promenade.

```
┌──────────────────────────────────────────────────────────────┐
│ Abebech                              │ Aujourd'hui           │
│ ┌▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓┐ │ [ic] 4 repas          │
│ │▓ [ic lune] Sommeil · depuis 14:40▓│ │      dernier 11:50    │  rangée 62 dp
│ │▓ ⏱ 34:05                         ▓│ │                       │
│ └▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓┘ │ [ic] 3 couches        │
│                                 6 dp │      dernière 11:57   │
│ ┌▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓┐ │                       │
│ │▓ [ic marche] Promenade · 14:32   ▓│ │ [ic] 2 h 10           │  rangée 62 dp
│ │▓ ⏱ 42:17                         ▓│ │      de sommeil       │
│ └▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓┘ │                       │
└──────────────────────────────────────────────────────────────┘
```

- `rowH = floor((zoneH - (n-1)*6) / n)`, soit 62 dp ici (47 dp à H = 150).
- Chaque rangée est une tuile teintée de sa catégorie (rayon 12, padding horizontal 10, vertical 6) qui contient une Column de 2 lignes :
  - ligne 1 : icône 16 dp + 6 dp + libellé + « · depuis HH:MM ». Si la largeur manque (`Lw < 200`), on retire le mot « depuis » et on garde l'heure (`maxLines 1`) ;
  - ligne 2 : chrono à 26 sp si `rowH ≥ 58`, sinon 22 sp.

### 2.4 4×2 : trois sessions

```
┌──────────────────────────────────────────────────────────────┐
│ Abebech                              │ Aujourd'hui           │
│ ┌▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓┐ │ [ic] 4 repas          │
│ │▓ Tétée G            ⏱    12:04  ▓│ │      dernier 11:50    │  rangée 39 dp
│ └▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓┘ │ [ic] 3 couches        │
│ ┌▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓┐ │      dernière 11:57   │
│ │▓ Sommeil            ⏱    34:05  ▓│ │                       │  rangée 39 dp
│ └▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓┘ │ [ic] 2 h 10           │
│ ┌▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓┐ │      de sommeil       │
│ │▓ Promenade          ⏱  1:02:10  ▓│ │                       │  rangée 39 dp
│ └▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓┘ │                       │
└──────────────────────────────────────────────────────────────┘
   |10|<- label 74 ->|<-- Box chrono, centerEnd -->|10|
```

- Chaque rangée est un Row sur une seule ligne :
  - à gauche, le libellé dans une Column de 74 dp (« Tétée G », « Tétée D », « Sommeil », « Promenade ») ;
  - à droite, le chrono dans `Box(width = Lw - 20 - 74, centerEnd)`.
- Chrono : 20 sp si `rowH ≥ 36`, sinon 16 sp (H = 150 donne `rowH = 29`). Pas d'icône ni de « depuis » à ce niveau de densité : le libellé texte porte le sens.
- La colonne Journée reste affichée. Sous H = 150, ses sous-lignes disparaissent (voir 3.4).

### 2.5 4×2 : tétée en cours (sein actif et autre sein)

```
┌──────────────────────────────────────────────────────────────┐
│ Abebech                              │ Aujourd'hui           │
│ ┌▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓┐ │ [ic] 4 repas          │
│ │▓ [ic allait.] Tétée · gauche     ▓│ │      dernier 09:20    │
│ │▓                                 ▓│ │ [ic] 3 couches        │
│ │▓ ⏱ 8:42                          ▓│ │      dernière 11:57   │
│ │▓                                 ▓│ │ [ic] 2 h 10           │
│ │▓ droit 4:10 · depuis 14:32       ▓│ │      de sommeil       │
│ └▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓┘ │                       │
└──────────────────────────────────────────────────────────────┘
```

- Le chrono affiche le sein actif (`timerStartMs` de la session). La ligne du bas donne l'autre sein (`otherSideLabel` avec G/D écrit en entier : « D 4:10 » devient « droit 4:10 ») puis le début.
- **Aucun auteur, jamais.**
- En pause : libellé « Tétée en pause · gauche », icône `ic_widget_pause` à la place de l'icône allaitement, chrono figé (`pausedAtMs`) affiché en couleur texte normal au lieu de texte fort. La pause se lit donc au mot et à l'icône, pas à la couleur.
- En rangée (2 sessions) : « Tétée · gauche · droit 4:10 ». En rangée compacte (3 sessions) : « Tétée G ».

### 2.6 4×2 : rappel dépassé

Cas A, au repos, rappel repas dépassé :

```
┌──────────────────────────────────────────────────────────────┐
│ Abebech                              │ Aujourd'hui           │
│ [ic alerte] Dernier repas · rappel   │ [ic] 4 repas          │   ligne rouge discret
│                                      │      dernier 08:10    │
│ 08:10                                │ [ic] 3 couches        │   valeur rouge discret
│                                      │      dernière 11:57   │
│ Biberon · il y a ⏱3:42:10            │ [ic] 2 h 10           │   ligne en secondaire
│                                      │      de sommeil       │
└──────────────────────────────────────────────────────────────┘
```

Cas B, session en cours et rappel couches dépassé (colonne Journée) :

```
│ ┌▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓┐ │ [ic] 4 repas          │
│ │▓ [ic lune] Sommeil en cours      ▓│ │      dernier 11:50    │
│ │▓ ⏱ 34:05                         ▓│ │ [!]  3 couches        │  icône alerte + valeur rouge
│ │▓ depuis 14:40                    ▓│ │      rappel · 08:10   │  mot « rappel » en rouge
│ └▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓┘ │ [ic] 2 h 10           │
```

- Pas de fond rouge, pas de tuile d'alerte. Seuls changent : l'icône (catégorie remplacée par `ic_widget_alert`), la couleur de la valeur et le mot « rappel ».
- Repas dépassé pendant une session : même traitement sur la ligne Repas de la colonne Journée, avec « rappel · 11:50 ».

### 2.7 2×2 (150 × 150) au repos et en cours

Grille : `PAD 12`, inner 126 × 126, en-tête 14 dp + 4 dp, donc `zoneH = 108`. Pas de colonne Journée. Une bande de trois mini-statistiques s'affiche en bas tant qu'il y a au plus une session.

```
Repos                         1 session                      2 sessions                    3 sessions
┌──────────────────────┐      ┌──────────────────────┐       ┌──────────────────────┐      ┌──────────────────────┐
│ Abebech              │      │ Abebech              │       │ Abebech              │      │ Abebech              │
│ [ic] Dernier repas   │      │┌▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓┐│       │┌▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓┐│      │┌▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓┐│
│ 11:50                │      ││▓[ic] Promenade    ▓││       ││▓[ic] Sommeil      ▓││      ││▓[ic]     ⏱ 12:04 ▓││
│ il y a ⏱2:14:05      │      ││▓⏱ 42:17           ▓││       ││▓⏱ 34:05           ▓││      │└▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓┘│
│                      │      ││▓depuis 14:32      ▓││       │└▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓┘│      │┌▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓┐│
│                      │      │└▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓┘│       │┌▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓┐│      ││▓[ic]     ⏱ 34:05 ▓││
│ [ic]4 [ic]3 [ic]2h10 │      │ [ic]4 [ic]3 [ic]2h10 │       ││▓[ic] Promenade    ▓││      │└▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓┘│
└──────────────────────┘      └──────────────────────┘       ││▓⏱ 42:17           ▓││      │┌▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓┐│
                                                             │└▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓┘│      ││▓[ic]   ⏱ 1:02:10 ▓││
                                                             └──────────────────────┘      │└▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓┘│
                                                                                           └──────────────────────┘
```

- Repos :
  - « Dernier repas » 12 sp, « 11:50 » 30 sp, « il y a » suivi d'un chrono de 12 sp ;
  - `nextSide`, s'il existe, prend la place de « il y a » : « Prochain sein : D » ;
  - bande du bas : trois colonnes de `floor(126/3) = 42` dp, chacune avec une icône 12 dp + 3 dp + la valeur en 13 sp gras (« 4 », « 3 », « 2h10 »). Si un rappel est dépassé, l'icône de la colonne concernée devient `ic_widget_alert` et la valeur passe en rouge discret.
- 1 session : tuile de 126 × (108 − 26) = 82 dp avec libellé 12 sp, chrono `min(28, floor((126-20)/4.3)) = 24` sp et « depuis HH:MM » 12 sp. La bande du bas est conservée.
- 2 sessions : la bande disparaît. Deux tuiles de 51 dp chacune : icône + libellé 12 sp sur la première ligne, chrono 22 sp sur la seconde.
- 3 sessions : trois tuiles de 32 dp, avec l'icône 14 dp à gauche et le chrono 18 sp dans `Box(width = 126 - 20 - 14 - 6, centerEnd)`. À cette taille, l'icône remplace le libellé ; sa forme diffère pour chaque catégorie, et chaque icône a une `contentDescription`.
- Nom : seulement le premier mot de `childName` en 2×2 (`split(" ")[0]`). En 4×2, nom complet avec `maxLines 1`.

---

## 3. Spécification exacte

### 3.1 Typographie (police système Roboto, `normal` ou `bold` seulement)

| Rôle | 4×2 | 2×2 | Graisse | Couleur |
|---|---|---|---|---|
| Nom (en-tête gauche) | 12 sp | 11 sp | bold | secondaire |
| « Aujourd'hui » (en-tête droit) | 12 sp | — | normal | secondaire |
| Libellé de session ou « Dernier repas » | 13 sp | 12 sp | bold | texte catégorie |
| Chrono, 1 session | 36 sp (formule 2.2) | 24 sp | bold | fort |
| Chrono, 2 sessions | 26 / 22 sp | 22 sp | bold | fort |
| Chrono, 3 sessions | 20 / 16 sp | 18 sp | bold | fort |
| Heure du dernier repas (repos) | 36 sp (30 si zone basse) | 30 sp | bold | fort (rouge si rappel) |
| « depuis 14:32 », « il y a » + chrono, autre sein | 13 sp | 12 sp | normal | secondaire sur tuile (voir 3.2) |
| « Prochain sein : droit » | 13 sp | 12 sp | bold | texte tétée |
| Valeur Journée (« 4 repas ») | 15 sp | 13 sp | bold | fort (rouge si rappel) |
| Sous-ligne Journée (« dernier 11:50 ») | 12 sp | — | normal | secondaire (rouge si rappel) |

Aucun texte à lire ne descend sous 11 sp. Tous les Text sont en `maxLines = 1`, sauf « Pas encore de repas aujourd'hui » (2 lignes).

### 3.2 Couleurs

| Jeton | Clair | Sombre |
|---|---|---|
| Fond du widget | `#ffffff` | `#1f2937` |
| Texte fort | `#1f2937` | `#f9fafb` |
| Texte secondaire, sur fond du widget | `#6b7280` | `#9ca3af` |
| Texte secondaire, **sur tuile teintée** | `#4b5563` | `#d1d5db` |
| Filet vertical (Box 1 dp) | `#e5e7eb` | `#374151` |
| Rappel dépassé | `#b91c1c` | `#f87171` |
| Chrono en pause | `#4b5563` | `#d1d5db` |

Teintes par catégorie. Les tuiles n'existent que pour les sessions en cours. La teinte sombre correspond à 14 % de l'accent sur `#1f2937`.

| Catégorie | Accent (référence) | Tuile clair | Tuile sombre | Texte catégorie clair | Texte catégorie sombre |
|---|---|---|---|---|---|
| Tétée | `#D66B8F` | `#FDF0F4` | `#393243` | `#A63D62` | `#E88FAE` |
| Sommeil | `#7C6BA4` | `#F5F3F8` | `#2c3246` | `#5B4A85` | `#A898D0` |
| Promenade | `#8BC46B` | `#F3F9EF` | `#2e3f3e` | `#3F7A2A` | `#8BC46B` |
| Repas | `#E8785A` | (pas de tuile) | (pas de tuile) | `#A83F23` | `#E8785A` |
| Couches | `#5BA4A4` | (pas de tuile) | (pas de tuile) | `#2B6A6A` | `#5BA4A4` |

Les textes de catégorie sombres reprennent `categoryTextColorsDark` de l'app. `#A63D62` (tétée) et `#3F7A2A` (promenade) sont de nouveaux tons foncés, construits sur le même principe que `categoryTextColors`.

Les accents bruts (`#8BC46B`, `#E8785A`…) ne servent **jamais** de couleur de texte sur fond clair : ils font 2,1 et 2,9:1.

### 3.3 Icônes (drawables vectoriels à ajouter)

Les icônes sont des vecteurs de 24 × 24 affichés en 16 dp (12 ou 14 dp en 2×2). Il en faut deux variantes, `_light` et `_dark`, peintes avec la couleur « texte catégorie », parce que la brique `Image` ne propose pas de teinte :
`ic_widget_nursing` (personne qui allaite, comme dans NursingInProgressBanner), `ic_widget_sleep` (lune), `ic_widget_walk` (personne qui marche, comme dans PromenadeWidget), `ic_widget_meal` (biberon), `ic_widget_diaper` (couche), `ic_widget_pause`, `ic_widget_alert` (cercle avec un point d'exclamation, peint en `#b91c1c` / `#f87171`).

Elles reprennent les pictogrammes FontAwesome 6 déjà utilisés dans l'app. Chacune a une `contentDescription` en français.

### 3.4 Marges, espacements, rayons

| Élément | Valeur |
|---|---|
| Widget | rayon 20, padding 14 (4×2) ou 12 (2×2) |
| En-tête | 16 dp (4×2) ou 14 dp (2×2), puis 6 dp (4×2) ou 4 dp (2×2). En 4×2, le nom est dans `width(Lw)`, puis vient `width(SEP)`, puis « Aujourd'hui » dans `width(Rw)`. « Aujourd'hui » est donc aligné sur la colonne Journée. |
| Tuile 1 session | `size(Lw, zoneH)`, rayon 16, padding 12, contenu centré verticalement. Espacements : libellé, 4 dp, chrono, 2 dp, « depuis ». |
| Rangées de session (2 ou 3) | rayon 12, padding horizontal 10, espace de 6 dp entre les rangées |
| Séparateur des colonnes | 12 dp + Box 1 × zoneH + 12 dp |
| Colonne Journée | 3 lignes de `itemH = floor((zoneH - 16) / 3)` (38 dp à H = 180), 8 dp entre elles. Chaque ligne : icône 16, 8 dp, puis une Column (valeur, sous-ligne). La sous-ligne est masquée si `itemH < 34`. |
| Icône + texte | 6 dp entre les deux (8 dp dans la colonne Journée) |
| Bande du bas (2×2) | 8 dp au-dessus, 3 colonnes de 42 dp, hauteur 18 dp |

Cas `day == null` : pas de colonne Journée, la zone Maintenant prend toute la largeur (`Lw = innerW`) et on supprime « Aujourd'hui ».
Seuil 2×2 / 4×2 : `W < 250` donne la mise en page 2×2.

### 3.5 Chronometer

| Session | `base` | `paused` | Taille et gras | Couleur |
|---|---|---|---|---|
| Tétée, sommeil, promenade | `timerStartMs` | `pausedAtMs` (tétée), sinon aucun | voir 3.1, bold | texte fort (en pause : couleur pause) |
| « il y a » du dernier repas | `lastMealMs` | aucun | taille du texte voisin, normal | secondaire, ou rouge si rappel |

Format natif : `MM:SS`, puis `H:MM:SS` après une heure. Les largeurs prévues (formules 2.2 à 2.7) tiennent compte du format `H:MM:SS`.

### 3.6 Libellés français exacts

- En-tête : prénom de l'enfant, ou « SuiviBaby » s'il est vide ; « Aujourd'hui ».
- Session seule (pleine tuile) : « Tétée · gauche », « Tétée · droit », « Tétée en pause · gauche », « Sommeil en cours », « Promenade en cours ». En dessous : « depuis 14:32 ». Pour la tétée : « droit 4:10 · depuis 14:32 ».
- Rangées (2 sessions) : « Tétée · gauche · droit 4:10 », « Sommeil · depuis 14:40 », « Promenade · depuis 14:32 ».
- Rangées compactes (3 sessions) : « Tétée G », « Tétée D », « Sommeil », « Promenade ».
- Repos : « Dernier repas », « Tétée · il y a » + chrono (ou « Biberon · il y a », ou « il y a » seul pour « Repas »), « Prochain sein : droit » / « gauche », « Pas encore de repas aujourd'hui ».
- Rappel : « Dernier repas · rappel » (zone Maintenant) ; « rappel · 08:10 » (sous-ligne Journée).
- Journée :
  - « 1 repas » / « 4 repas », puis « dernier 11:50 ». Si `Rw ≥ 140` et `bottleMl > 0` : « 11:50 · 360 ml » ;
  - « 1 couche » / « 3 couches », puis « dernière 11:57 ». Sans couche : « 0 couche », sous-ligne masquée ;
  - « 2 h 10 » / « 45 min » / « 0 min », puis « de sommeil ».
- 2×2, bande : « 4 », « 3 », « 2h10 » (compact, chaque icône a une `contentDescription` : « repas », « couches », « sommeil »).

---

## 4. Ce que je retire, et pourquoi

| Retiré | Pourquoi |
|---|---|
| Les trois tuiles colorées de la Journée | Ce sont elles qui alourdissent le widget : trois aplats sombres font concurrence à la session en cours. On les remplace par une colonne de texte neutre, l'icône jouant le rôle d'accent. La couleur reste réservée à ce qui tourne. |
| L'heure de début en gros avec « depuis » dessous | Ordre de lecture faux, et l'information ne bouge pas. Le gros chiffre devient le chrono qui défile (Chronometer) ; « depuis 14:32 » passe en petit, après. |
| Le format « 1 · 100 ml », « 1 · 11:57 » | Le point médian entre un compte et une heure ne veut rien dire. On écrit à la place « 4 repas / dernier 11:50 », « 3 couches / dernière 11:57 ». |
| La tuile de la zone Maintenant au repos (repas teinté) | Si le fond est teinté en permanence, il ne signale plus une session en cours. |
| La tuile d'alerte rose (`alertTile`) | La règle produit demande un rouge discret sur la valeur. On garde l'icône, le mot et la couleur du texte, sans fond. |
| L'unique session principale avec `alsoKind` ignoré | Contraire à la règle « toutes les sessions avec leur chrono ». On conçoit pour `lives[]`. |
| Le nom complet en 2×2 | « Abebech Lisyäl Aynalem » ne tient pas en 126 dp : on affiche le premier prénom. |

---

## 5. Accessibilité

**Contrastes mesurés (WCAG 2.x)**

| Paire | Clair | Sombre |
|---|---|---|
| Texte fort / fond du widget | 14,7:1 | 14,1:1 |
| Texte fort / tuile (pire cas) | 13,2:1 (tétée) | 10,6:1 (promenade) |
| Secondaire / fond du widget (`#6b7280` / `#9ca3af`) | 4,8:1 | 5,8:1 |
| Secondaire sur tuile (`#4b5563` / `#d1d5db`) | ≥ 6,8:1 | ≥ 7,5:1 |
| Texte catégorie / tuile | 4,9 à 6,9:1 | 4,9 à 5,4:1 |
| Texte catégorie Repas et Couches / fond du widget | 6,2:1 | 5,1:1 |
| Rappel / fond du widget (`#b91c1c` / `#f87171`) | 6,5:1 | 5,3:1 |

Tout le texte lisible atteint **AA (≥ 4,5:1)**. Le secondaire `#6b7280` posé sur une tuile pâle tombait à 4,4:1 : c'est pour cela qu'on passe à `#4b5563` sur les tuiles. Le rouge sombre `#f87171` n'est **jamais** posé sur une tuile (4,0:1 sur la promenade) : les rappels n'apparaissent que sur le fond du widget.

**Lisibilité de nuit**
- En sombre, les tuiles sont très peu saturées (accent à 14 %) : pas d'aplat lumineux qui éblouit. Le seul élément clair est le chrono `#f9fafb`, c'est-à-dire l'information recherchée.
- Le chrono le plus gros fait 36 sp en bold, et le plus petit en 4×2 fait 16 sp en bold : lisible à bout de bras.
- Aucun clignotement, aucun fond rouge. Le chrono défile en natif, sans redessin.

**Le sens n'est jamais porté par la couleur seule**
- Session en cours : un chrono qui défile, plus un libellé (« en cours », nom de la catégorie).
- Pause : le mot « en pause », l'icône pause et le chrono figé.
- Rappel : l'icône `ic_widget_alert`, le mot « rappel » et le rouge.
- Catégories : un libellé texte, ou en 2×2 compact une icône de forme distincte avec `contentDescription`.

**TalkBack** : chaque tuile reçoit une `contentDescription` complète, par exemple « Promenade en cours depuis 14 h 32 », « Tétée en cours, sein gauche, sein droit 4 minutes 10 », « 3 couches aujourd'hui, rappel dépassé, dernière à 8 h 10 ». Les chronos ne sont pas annoncés en continu.

**Taille de police système** : les tailles en sp grossissent avec le réglage d'accessibilité. Tous les Text sont en `maxLines 1` (ellipse) et les formules de chrono gardent environ 10 % de marge. Au-delà, les sous-lignes disparaissent avant les valeurs (seuils `itemH` et `rowH`).

---

## Notes d'implémentation (hors design, pour le développeur)

- `buildNowWidgetProps` doit exposer `lives: WidgetLive[]` (0 à 3, triées tétée, sommeil, promenade) à la place de `live` et `alsoKind`.
- « D 4:10 » devient « droit 4:10 » par simple remplacement de la première lettre côté widget, ou via un champ `otherSide` ajouté au snapshot.
- Sur Android, « il y a » utilise un Chronometer à partir de `lastMealMs`. Il défile donc même si l'app n'a rien envoyé, ce qui corrige le « temps depuis le dernier repas » figé.
- Le rouge des rappels est décidé au rendu (`now >= alerts.*AtMs`). Comme Glance ne redessine pas tout seul, il faut une mise à jour planifiée à `min(mealAtMs, diaperAtMs)` pour que le rouge apparaisse à l'heure. C'est un point à traiter côté code.
