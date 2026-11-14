# Bloc au repos en lignes horizontales : avis design (2026-11-14)

Lu : BRIEF_REPOS_HORIZONTAL.md, capture `widget-2026-11-14-0233.png`, `restDualZone`.
Gabarits mesurés sur la capture (S21 Ultra) : durée 30 sp gras « 14h35 » ≈ 77 dp, « 6h56 » ≈ 63 dp ;
12 sp gras « ● Dernier change » ≈ 112 dp ; 12 sp normal ≈ 6,3 dp/caractère. Zone : 169 × 139 dp.

## Notes /20
| Variante | Note | Pourquoi |
|---|---|---|
| V0 (actuel) | 13 | Grand chiffre lisible, mais « Repas/Change » tronqués, deux colonnes de 80 dp se disputent l'œil, le rappel à venir ajoute une ligne par colonne. |
| H1 | 12 | Durées alignées à droite (bonne comparaison), mais ne tient pas : 105 + 77 = 182 dp > 169 à 30 sp. Il faut tomber à 22 sp ou couper le libellé. « à 19:37 · il y a » se lit mal. |
| H2 | 14 | Libellé complet sur sa ligne (bien), mais « 14h37 il y a · à 19:37 » ≈ 77 + 8 + 100 = 185 dp : déborde. |
| H3 | 8 | Plus de grand chiffre : on perd la lecture de nuit d'un coup d'œil. « Dernier change il y a 14h37 » déborde lui aussi. |
| **H2′ (proposée)** | **17** | H2 sans « il y a » affiché, avec une petite pile à droite du chiffre. Tout tient, et les deux chiffres sont alignés à gauche, l'un sous l'autre. |

## Recommandation : H2′
```
● Dernier repas
6h58    à 19:37
● Dernier change
14h37   rappel        ← rouge (dépassé)
        à 11:57
Prochain sein : gauche
```
Mesures (zone de 169 dp de large, contenu centré verticalement dans la zone) :
- Ligne libellé : `labelRow` (point 8 dp + 6 dp, 12 sp gras), hauteur 16 dp. Toujours « Dernier repas » / « Dernier change » (≤ 112 dp).
- Écart libellé → chiffre : 2 dp.
- Ligne chiffre : `Row` de 35 dp de haut. Colonne durée de 84 dp fixes = `fixedLine(28, elapsed…)` (ceil(28 × 1,25) = 35). 84 dp couvrent « 23h59 » (≈ 74) et « 59 min » (≈ 82). Ensuite un écart de 8 dp, puis la pile d'infos (77 dp, 12 sp, maxLines 1, alignée en bas sur 35 dp pour que « à 19:37 » tombe au pied du chiffre).
- Bloc = 16 + 2 + 35 = 53 dp. Tout le bloc porte `linkMods(meal|diaper)` : zone tactile de 53 dp ≥ 48.
- Écart entre les blocs : 8 dp. Puis « Prochain sein » : écart de 6 dp, 13 sp gras, 17 dp.
- Total : 53 + 8 + 53 + 6 + 17 = **137 dp ≤ 139** (sans le sein : 114 dp).
- Largeur : 84 + 8 + 77 = 169 dp. Pire pile : « rappel 22:30 » ≈ 72 dp, ça tient.

Contenu de la pile (une ou deux lignes de 16 dp) :
- Normal : « à 19:37 » (gris). Repas : « tétée 19:37 » si le mot tient dans 77 dp (« biberon 19:37 » ≈ 82 dp → « à 19:37 »).
- Rappel à venir : « à 19:37 » puis « rappel 22:30 » (gris). C'est la forme courte de `upcoming()` : « rappel à 22:30 » fait ≈ 88 dp et ne tient pas.
- Rappel dépassé : « rappel » (rouge, gras) puis « à 19:37 » (rouge). Le point et le chiffre passent aussi en rouge, le libellé garde son texte. La couleur n'est pas le seul signal : le mot « rappel » est là.
- « Pas encore » : « — » 28 sp gris dans la colonne durée, « pas encore » dans la pile. La hauteur reste la même, rien ne saute.
- Prochain sein : sous les deux blocs, aligné à gauche sur les chiffres, couleur `CAT.nursing.text`.

« il y a » n'est plus affiché : le grand chiffre sous « Dernier repas », suivi de « à 19:37 », se comprend seul.
Si Yoss y tient, on le remet en première ligne de la pile seulement dans le cas normal (« il y a » / « à 19:37 »).
Il reste toujours dans la phrase TalkBack : « Dernier repas, il y a 6 h 58, à 19 h 37, rappel dépassé ». Une phrase par bloc (`a11yLast`).

## Garde-fous
- Zone basse (h < 137, par ex. 4×2 de 175 dp → zoneH 115) : chiffre en 24 sp (boîte de 30 dp), écart entre blocs de 4 dp.
  Blocs : 48 + 4 + 48 = 100 dp. Si h < 120 avec le sein, garder V0 (≈ 113 dp), qui tient déjà.
- 2×2 non touché (`restDual` exige `!small`). Le 4×3 a plus d'air : 30 sp et 10 dp entre les blocs si h ≥ 145.
- Architecture : on réutilise `labelRow`, `fixedLine`, `elapsed`, `txt`, `linkMods`. Seuls `restDualZone` et un `upcomingShort` changent.
  Coût faible. La zone `Aujourd'hui` à droite ne bouge pas.
