# Proposition de design : widget Android « Bébé maintenant » (angle accessibilité)

Auteur : architecte accessibilité (ECC). Cible : Jetpack Glance via expo-widgets, briques du brief uniquement (Column, Row, Box, Text, Spacer, Image drawable, background, cornerRadius, padding, size/width/height/fill, nœud Chronometer). Aucun weight, aucune bordure, aucune ombre, aucun dégradé.

Notation : W et H sont la taille du widget en dp fournie au rendu. P est la marge extérieure. « Largeur utile » = W - 2P.

---

## 1. Principe

1. On lit dans cet ordre : **quoi** (nom de la session ou du dernier repas), puis **depuis combien de temps** (le chrono, le plus gros élément du widget, en gras), puis l'état de la journée (petit, calme, sur le fond de la carte, sans tuile).
2. Une carte opaque unique. Seules les **sessions en cours** reçoivent un bloc teinté (pâle en clair, bleu-nuit teinté en sombre). La journée n'a plus de blocs : trois colonnes de texte, libellé gris puis valeur en gras.
3. Rien n'est porté par la couleur seule : chaque état a un mot (« En retard », « En pause », « Tétée ») et une icône de forme distincte. Tout ce qui se lit est à 4,5:1 ou plus.

---

## 2. Maquettes ASCII (dp)

Légende : `[icône]` = Image vecteur ; `CHRONO` = nœud Chronometer ; `#` = bloc teinté ; les hauteurs sont notées à gauche. Largeurs calculées pour W = 360 (largeur utile 336) ; les formules sont en section 3.

### 2.1 4×2 au repos (360 × 150)

```
          x=12                                              x=348
y=0   +--------------------------------------------------------+  carte #FFFFFF, rayon 24
y=12  | Léa                                      (13sp gras)   |  h 16
y=28  |  (gap 4)                                               |
y=32  | Tétée à 11:50                            (22sp gras)   |  h 28
y=60  | Dernier repas · prochain sein : droit    (12sp gris)   |  h 16
y=76  |  (gap 12)                                              |
y=88  | --------------------------------------- Box h1 #E5E7EB |  séparateur 1 dp
y=89  |  (gap 13)                                              |
y=102 | Repas           Couches          Sommeil   (12sp gris) |  h 16, 3 colonnes de 112
y=118 | 3 · 240 ml      5 · 11:57        6 h 20    (15sp gras) |  h 20
y=138 |                                                        |  marge basse 12
y=150 +--------------------------------------------------------+
```
Si `nextSide` est absent : ligne 12sp = « Dernier repas ». Si `lastMealLabel` est absent : ligne 22sp = « Aucun repas noté » (16sp gris), pas de seconde ligne.

### 2.2 4×2 avec une session (promenade) (360 × 150)

```
y=0   +--------------------------------------------------------+
y=12  | Léa                                                    |  13sp gras, h 16
y=32  | ################################################## #### |  bloc #F3F9EF, rayon 14
      | # [walk 20]  Promenade                           CHRONO#|  15sp gras | 32sp gras
      | #            depuis 14:32                        12:34 #|  12sp #4B5563
y=94  | ################################################## #### |  h 62, padding 12
y=102 |  (gap 8)                                               |
y=102 | Repas           Couches          Sommeil                |
y=118 | 3 · 240 ml      5 · 11:57        6 h 20                 |
y=150 +--------------------------------------------------------+
```
Dans le bloc : Box de 184 dp (colonne texte) + Box de 128 dp alignée à droite (chrono). Le mot « depuis » est **sous** le nom et l'heure suit : « depuis 14:32 ». Il n'y a plus d'heure en gros au-dessus de « depuis ».

### 2.3 4×2 avec deux sessions (sommeil + promenade) (360 × 150)

```
y=0   +--------------------------------------------------------+
y=12  | Léa                                         13sp gras  |  h 16
y=32  | #### [moon 20] Sommeil                          CHRONO #|  lignes de 38 dp, #F5F3F8
      | ####           depuis 13:05                    1:42:10 #|  13sp gras / 12sp ; 22sp gras
y=70  |  (gap 6)                                               |
y=76  | #### [walk 20] Promenade                        CHRONO #|  #F3F9EF
      | ####           depuis 14:32                      12:34 #|
y=114 |  (gap 8)                                               |
y=122 | Repas 3 · Couches 5 · Sommeil 6 h 20            12sp   |  journée en une ligne, h 16
y=138 |                                                  marge 12
y=150 +--------------------------------------------------------+
```
Ligne : padding horizontal 12, icône 20, espace 8, colonne texte 192, Box chrono 92 alignée à droite. La journée passe en une seule ligne (mode « J1 », voir 3.6).

### 2.4 4×2 avec trois sessions (tétée + sommeil + promenade) (360 × 150)

```
y=0   +--------------------------------------------------------+
y=12  | Léa                                         13sp gras  |
y=32  | #### [breast 18] Tétée · G · autre D 4:10       CHRONO #|  lignes de 32 dp, une seule ligne
y=64  |  (gap 5)                                      3:05     #|  20sp gras
y=69  | #### [moon 18]   Sommeil · depuis 13:05         CHRONO #|
y=101 |  (gap 5)                                    1:42:10    #|
y=106 | #### [walk 18]   Promenade · depuis 14:32       CHRONO #|
y=138 |                                                  marge 12
y=150 +--------------------------------------------------------+
```
Dans chaque ligne : nom en 13sp gras puis « · détail » en 12sp (même Row, deux Text). Ligne : padding 10, icône 18, espace 8, colonne 206, Box chrono 84. La journée disparaît à cette hauteur (mode « J0 ») et revient dès que la place existe (par exemple H = 225 : lignes de 43 dp sur deux lignes, plus la journée en 3 colonnes).

### 2.5 4×2 avec tétée en cours (360 × 150)

```
y=12  | Léa                                                    |
y=32  | ################################################## #### |  bloc #FDF0F4, rayon 14
      | # [breast 20]  Tétée · sein G                    CHRONO#|  15sp gras | 32sp gras
      | #              Autre sein : D 4:10               4:10  #|  12sp
y=94  | ################################################## #### |
      | Repas           Couches          Sommeil                |
      | 3 · 240 ml      5 · 11:57        6 h 20                 |
```
- Le chrono est celui du **sein actif** (comportement de `timerStartMs`). Le nom l'indique : « sein G ».
- En pause : ligne 1 « Tétée en pause », ligne 2 « Sein G · autre D 4:10 ». Chrono figé. Le mot « pause » porte le sens (aucun changement de couleur n'est nécessaire).
- Sans `otherSideLabel` : ligne 2 = « depuis 14:32 ».
- Jamais d'auteur, jamais de nom d'aidante.

### 2.6 4×2 avec rappel dépassé

**Au repos, repas et couches en retard (360 × 150)** : la ligne de détail devient rouge, la colonne couches gagne une troisième ligne.

```
y=12  | Léa                                                    |
y=32  | [alert 16] Tétée à 11:50                 22sp gras ROUGE|  #B91C1C / #F87171
y=60  | Repas en retard · prochain sein : droit                 |  « Repas en retard » 12sp gras rouge,
y=76  |                                                (gap 10) |  « · prochain… » 12sp gris
y=86  | Repas           Couches                Sommeil          |
y=102 | 3 · 240 ml      [alert 14] 5 · 11:57   6 h 20           |  valeur couches en rouge gras
y=122 |                 En retard (12sp gras rouge)             |  troisième ligne, h 16
y=138 |                                                  marge 12
```
**Avec une session en cours** : la journée est en une ligne (J1), le segment en retard passe en rouge gras avec l'icône : `Repas 3 · [alert 12] Couches en retard 5 · Sommeil 6 h 20`. Le bloc de session ne perd jamais de place pour un rappel.

Pas de fond rouge, pas de clignotement : le rouge est limité au texte et à l'icône.

### 2.7 2×2 (150 × 150, P = 10, largeur utile 130)

**Au repos**
```
y=10  | Léa                              12sp gras  h 16
y=30  | Dernier repas                    12sp gris  h 16
y=46  | Tétée à 11:50                    17sp gras  h 22
y=68  | Prochain sein : D                12sp gris  h 16   (absent si nextSide absent)
y=84  |                                  (gap 28)
y=112 | [bottle 14] 3  [diaper 14] 5  [moon 14] 6 h 20     12sp gras, h 20
y=140 |                                  marge 10
```
Les trois icônes ont une forme distincte et une description pour TalkBack. Repas en retard : la ligne 17sp et l'icône alerte passent en rouge, la ligne grise devient « En retard » (rouge gras).

**Une session (promenade), 2×2**
```
y=10  | Léa                              12sp gras
y=30  | ###############################  bloc teinté, rayon 14, h 82, padding 10
      | # Promenade                   #  13sp gras
      | # 12:34                       #  CHRONO 26sp gras
      | # depuis 14:32                #  12sp
y=112 | ###############################
y=120 | [bottle]3 [diaper]5 [moon]6 h 20     (icônes + valeurs, h 20)
```
Tétée : « Tétée · sein G » / chrono / « Autre sein : D 4:10 ».

**Deux sessions, 2×2** : pas de journée. Deux blocs de 52 dp séparés de 6 : nom 12sp gras (15) puis chrono 24sp gras (29), padding 4 / 10.

**Trois sessions, 2×2** : trois lignes de 32 dp séparées de 4 : icône 18, espace 8, chrono 20sp gras. Pas de libellé (la place manque) : le sens est porté par la **forme** de l'icône (sein, lune, marcheur) et par la description TalkBack.

---

## 3. Spécification exacte

### 3.1 Géométrie et rayons

| Élément | Valeur |
| :-- | :-- |
| Marge extérieure P | 12 dp (4×2), 10 dp (2×2 et W < 200) |
| Rayon de la carte | 24 dp |
| Rayon des blocs de session | 14 dp (comme `NursingInProgressBanner`) |
| Espaces verticaux | 4 (sous le nom), 6 (entre deux blocs), 8 (avant la journée), 4 à 5 (3 sessions) |
| Séparateur au repos | Box 1 dp de haut, fillMaxWidth, `#E5E7EB` / `#374151` (décoratif) |
| Colonnes de la journée | `(W - 2P) / 3` chacune, via Box de largeur fixe |
| Alignement à droite | jamais d'espace « poussé » : Box de largeur calculée, contenu aligné en fin |

Formules (4×2) :
- Bloc d'une session, ligne texte : `texteW = largeurUtile - 2*12 - chronoW` (et `- icône - 8` pour les lignes à icône).
- `chronoW` = largeur pire cas « 12:05:33 » = 3,9 em, soit 3,9 × taille en sp, arrondie : 32sp -> 128, 22sp -> 92, 20sp -> 84, 26sp -> 104, 24sp -> 96. Multiplier par `fontScale` si le système le fournit.
- Hauteur disponible `A = H - 2P - 16 (nom) - 4`. Hauteur minimale des sessions : 1 session = 56, 2 sessions = 82 (2 × 38 + 6), 3 sessions = 106 (3 × 32 + 2 × 5).

### 3.2 Choix du mode de la journée (selon la place)

| Mode | Contenu | Hauteur |
| :-- | :-- | :-- |
| J3 | trois colonnes (libellé 12sp + valeur 15sp) | 36 (+16 si une valeur est en retard) |
| J1 | une ligne « Repas 3 · Couches 5 · Sommeil 6 h 20 » en 12sp | 16 |
| J0 | masqué | 0 |

Règle : prendre le plus riche des modes (J3, J1, J0) qui laisse aux sessions leur hauteur minimale (en comptant 8 dp d'espace). Vérifié à H = 150 : 1 session -> J3 (62 dp de bloc), 1 session avec retard -> J1, 2 sessions -> J1, 3 sessions -> J0. À H = 225 tout tient en J3. Quand la hauteur du bloc d'une session unique dépasse 100 dp, le bloc passe en vertical (nom, détail, chrono 40sp en dessous). Le surplus de hauteur va au bloc de session, jamais à des marges.

### 3.3 Tailles de texte (aucune en dessous de 12sp)

| Rôle | Taille | Graisse |
| :-- | :-- | :-- |
| Nom de l'enfant | 13sp (12sp en 2×2) | gras |
| Chrono, 1 session, 4×2 | 32sp (40sp si bloc vertical) | gras |
| Chrono, 1 session, 2×2 | 26sp | gras |
| Chrono, 2 sessions | 22sp (4×2), 24sp (2×2) | gras |
| Chrono, 3 sessions | 20sp | gras |
| Nom de session | 15sp (1 session), 13sp (2 à 3 sessions) | gras |
| Détail de session (« depuis », autre sein) | 12sp | normal |
| Dernier repas au repos | 22sp (4×2), 17sp (2×2) | gras |
| Ligne de détail du repas | 12sp | normal ; « Repas en retard » en gras |
| Libellé de la journée | 12sp | normal |
| Valeur de la journée | 15sp | gras |

Tous les `Text` : `maxLines = 1`. Le nom de l'enfant est tronqué en dernier recours.

### 3.4 Couleurs (clair et sombre) et contrastes calculés

Contrastes calculés avec la formule WCAG (luminance relative sRGB). Ratio = (L1 + 0,05) / (L2 + 0,05).

**Fonds**

| Rôle | Clair | Sombre |
| :-- | :-- | :-- |
| Carte | `#FFFFFF` | `#1F2937` |
| Bloc tétée | `#FDF0F4` | `#3A2230` |
| Bloc sommeil | `#F5F3F8` | `#2A2340` |
| Bloc promenade | `#F3F9EF` | `#1F3326` |
| Séparateur | `#E5E7EB` | `#374151` |

Les fonds de la journée (repas, couches) ne sont plus utilisés : la journée vit sur la carte.

**Textes et contrastes**

| Texte | Clair | Contraste | Sombre | Contraste |
| :-- | :-- | :-- | :-- | :-- |
| Fort (chrono, valeurs) sur carte | `#1F2937` | 14,7:1 | `#F9FAFB` | 14,0:1 |
| Fort sur bloc (pire fond) | `#1F2937` | 13,2:1 | `#F9FAFB` | 12,9:1 |
| Secondaire sur carte | `#4B5563` | 7,6:1 | `#9CA3AF` | 5,8:1 |
| Secondaire sur bloc | `#4B5563` | 6,8:1 | `#D1D5DB` | 9,1:1 |
| Rouge discret (retard) sur carte | `#B91C1C` | 6,5:1 | `#F87171` | 5,1:1 |
| Nom de session tétée | `#9D2F57` | 6,4:1 | `#F29BB8` | 7,0:1 |
| Nom de session sommeil | `#5B4A85` | 6,9:1 | `#A898D0` | 5,7:1 |
| Nom de session promenade | `#065F46` | 7,2:1 | `#A7F3D0` | 10,5:1 |

Tous les couples dépassent 4,5:1 (WCAG AA texte normal) et 3:1 pour les icônes. Les couleurs de nom de session pour le sommeil, la promenade, l'alimentation et le sombre proviennent des variantes texte déjà présentes dans l'app (`categoryTextColors`, `SleepWidget`, `PromenadeWidget`). Seule la tétée est nouvelle (`#9D2F57` / `#F29BB8`), à ajouter dans `constants/dashboardColors.ts` (hors périmètre de ce document).

**Couleurs de catégorie du brief non utilisées pour du texte**
- `#8BC46B` (promenade) sur blanc : 2,1:1. Échoue, c'est le vert du libellé actuel en clair.
- `#D66B8F` (tétée) sur blanc : 3,3:1. Insuffisant pour du texte.
- `#E8785A` sur blanc : 2,9:1 ; `#5BA4A4` sur blanc : 2,9:1.
Ces teintes restent réservées aux fonds pâles du brief (blocs clairs), jamais au texte.

**Écart volontaire avec l'app** : le texte secondaire clair est `#4B5563` et non `#6B7280`. `#6B7280` fait 4,8:1 sur blanc mais seulement environ 4,3:1 sur les fonds pâles des blocs, donc sous AA.

**Icônes** (vecteurs à ajouter, versions `drawable` clair et `drawable-night` sombre, qui s'appliquent seules selon le thème du système) :
`ic_widget_breast`, `ic_widget_moon`, `ic_widget_walk` (couleurs = nom de session ci-dessus), `ic_widget_bottle` (`#A83F23` / `#E8785A`, 6,2:1 et 5,1:1 sur la carte), `ic_widget_diaper` (`#2B6A6A` / `#5BA4A4`, 6,2:1 et 5,1:1), `ic_widget_alert` (triangle avec point d'exclamation, `#B91C1C` / `#F87171`). Chaque icône a une forme unique, lisible sans couleur.

### 3.5 Libellés français exacts

| Cas | Libellé |
| :-- | :-- |
| Nom de session | « Tétée · sein G » ou « Tétée · sein D » ; « Sommeil » ; « Promenade » |
| Tétée en pause | « Tétée en pause » ; détail « Sein G · autre D 4:10 » |
| Détail tétée | « Autre sein : D 4:10 » (sans `otherSideLabel` : « depuis 14:32 ») |
| Détail sommeil, promenade | `sinceLabel` : « depuis 14:32 » |
| Ligne compacte (3 sessions) | « Tétée · G · autre D 4:10 », « Sommeil · depuis 13:05 », « Promenade · depuis 14:32 » |
| Dernier repas | `lastMealLabel` : « Tétée à 11:50 » ; aucun repas : « Aucun repas noté » |
| Détail du repas | « Dernier repas · prochain sein : gauche » ou « droit » ; sans `nextSide` : « Dernier repas » |
| Retard repas | « Repas en retard · prochain sein : droit » (sans `nextSide` : « Repas en retard ») |
| Libellés de la journée | « Repas », « Couches », « Sommeil » |
| Valeurs | « 3 · 240 ml » (sans biberon : « 3 ») ; « 5 · 11:57 » (aucune couche : « 0 ») ; « 6 h 20 », « 45 min », « 0 min » |
| Retard couches | troisième ligne « En retard » |
| Journée en une ligne (J1) | « Repas 3 · Couches 5 · Sommeil 6 h 20 » |
| Nom de l'enfant vide | ligne masquée |

Aucun emoji, aucun cadenas, aucune mention de Premium.

### 3.6 Données : liste `lives`

Le rendu parcourt `lives` (0 à 3) dans l'ordre reçu (tétée, sommeil, promenade). Le nombre n détermine le mode : 0 = repos ; 1 = bloc unique ; 2 = deux lignes à deux lignes de texte ; 3 = trois lignes compactes (ou deux lignes de texte si H ≥ 190). Chaque session utilise son propre `timerStartMs` et `pausedAtMs`. `alsoKind` devient inutile.

---

## 4. Ce que je retire de la version actuelle, et pourquoi

| Retiré | Pourquoi |
| :-- | :-- |
| Les trois tuiles de couleur de la journée (brun, vert, violet foncés) | Lourdes, et trois fonds teintés à contraste faible. Remplacées par trois colonnes de texte sur la carte, avec une icône de forme distincte. |
| Le libellé vert « Promenade en cours » | Vert `#8BC46B` à 2,1:1 sur blanc. Remplacé par le nom en variante foncée, avec chrono. |
| L'heure de début en gros au-dessus de « depuis » | Ordre de lecture faux. Le chrono défile à droite, et « depuis 14:32 » est un détail en petit sous le nom. |
| Le texte « Repas · 1 · 100 ml » avec les libellés colorés | Couleur seule pour identifier la catégorie. Remplacée par libellé gris + icône + valeur en gras. |
| Les tuiles tronquées au bord droit (visibles sur la capture) | Largeurs fixes et mal calculées. Remplacées par des Box à largeur calculée depuis W. |
| L'alternative « une session principale + `alsoKind` » | Remplacée par l'affichage de toutes les sessions, chacune avec son chrono. |

---

## 5. Accessibilité

### 5.1 Contrastes (WCAG 1.4.3, 1.4.11)
Voir 3.4 : tous les textes de lecture à 4,5:1 ou plus, en clair et en sombre (minimum mesuré : 5,1:1). Séparateur et rayons des blocs sont décoratifs, ils n'ont pas besoin de 3:1.

### 5.2 Lisibilité de nuit
- Thème sombre : texte `#F9FAFB` sur `#1F2937`, 14:1 sans éblouissement (pas de blanc pur, pas d'aplat saturé).
- Le rouge `#F87171` est un texte et une icône, jamais un fond. Pas de clignotement ni d'animation.
- Le chrono est l'élément le plus gros (20 à 40sp, gras), lisible d'un regard à bout de bras.
- Les blocs de session sont plus clairs que la carte en sombre : on les repère sans bordure.

### 5.3 Sens jamais porté par la couleur seule (WCAG 1.4.1)
- Type de session : nom écrit + icône de forme distincte (sein, lune, marcheur). En 2×2 avec trois sessions, la forme de l'icône seule distingue les trois.
- Retard : mot « en retard » + icône triangle alerte + rouge. Retirer la couleur ne perd rien.
- Pause de tétée : mot « en pause » + chrono figé.
- Sein actif : « sein G » / « sein D » écrit.

### 5.4 Texte et taille (WCAG 1.4.4, 1.4.12)
- Aucune taille sous 12sp, `maxLines = 1` partout, hauteurs calculées avec le pire cas (« 12:05:33 »).
- Si `fontScale` est disponible au rendu : multiplier les largeurs de chrono, et au-delà de 1,3 passer d'un cran vers J1 puis J0 (sessions d'abord).
- Sinon, l'ordre de suppression est : détail des sessions, journée, séparateur. Le chrono et le nom ne sont jamais supprimés.

### 5.5 Lecteur d'écran (TalkBack) (WCAG 4.1.2)
- L'ordre visuel est l'ordre de lecture : nom, sessions, journée.
- Le chrono défile chaque seconde : **ne pas** le placer dans une région vive. Le nœud lit l'état au moment où il prend le focus.
- Demande technique : une description de contenu (`contentDescription`) sur chaque Image et sur la racine. Si Glance ne l'expose pas via expo-widgets, l'ajouter au même titre que Chronometer. Exemple de racine : « Léa. Promenade en cours depuis 14 h 32. Aujourd'hui : 3 repas, 240 millilitres ; 5 couches, dernière à 11 h 57 ; sommeil 6 h 20. Dernier repas à 11 h 50, en retard. » Les icônes décoratives en texte adjacent portent une description vide, les icônes seules (2×2, trois sessions) portent le nom de la session.

### 5.6 Cible tactile (WCAG 2.5.8)
Le widget n'a qu'une seule action : toucher n'importe où ouvre l'app. Aucune petite cible, aucun geste multipoint, une main suffit.

### 5.7 Limites à connaître
- **Le widget ne se redessine pas seul** : seul le chrono défile. Le rouge « en retard » ne s'allumerait qu'au prochain envoi de l'app. Je recommande de programmer un rafraîchissement à `alerts.mealAtMs` et `alerts.diaperAtMs`, sinon le rappel peut s'afficher en retard sur le retard.
- Pour la même raison, la proposition utilise des **heures** (« 11:50 », « depuis 14:32 ») et non des « il y a 2 h », qui seraient faux dès que le temps passe.
- Une carte opaque blanche sur fond d'écran clair se détache sans bordure ; c'est le comportement standard des widgets Android 12 et plus.

---

## 6. Récapitulatif de la validation WCAG 2.2 AA

| Critère | Statut |
| :-- | :-- |
| 1.1.1 Contenu non textuel | Icônes avec description, ou décoratives avec texte adjacent |
| 1.3.2 Ordre de lecture significatif | Nom, sessions, journée |
| 1.4.1 Utilisation de la couleur | Mot + icône pour retard, pause, type de session |
| 1.4.3 Contraste (minimum) | Tous les textes de 5,1:1 à 14,7:1 |
| 1.4.4 Redimensionnement du texte | Pire cas de largeur, modes J3/J1/J0, `maxLines = 1` |
| 1.4.11 Contraste des éléments non textuels | Icônes de 5,1:1 à 7,6:1 |
| 2.2.2 Pause, arrêt, masquage | Aucun clignotement ni animation (le chrono est un compteur de fait) |
| 2.5.8 Taille de la cible | Un seul contrôle plein widget |
| 4.1.2 Nom, rôle, valeur | `contentDescription` racine et icônes (dépendance technique 5.5) |
