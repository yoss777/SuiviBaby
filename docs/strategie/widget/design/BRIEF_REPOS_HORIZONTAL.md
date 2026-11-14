# Brief : bloc au repos « Dernier repas / Dernier change » en lignes horizontales (2026-11-14)

Capture réelle (S21 Ultra, widget 4×2 ≈ 332 × 175 dp) : `docs/strategie/widget/design/widget-2026-11-14-0233.png`.
Code : `widgets/BebeMaintenant.android.tsx`, `restDualZone` (Glance via expo-widgets ; « il y a » en grand = vue native `ElapsedClockView` qui prend toute la hauteur disponible, d'où `fixedLine(sp, …)` en boîte de hauteur fixe).

Aujourd'hui : deux colonnes côte à côte (≈ 80 dp chacune), chacune empilée verticalement :
```
● Repas      ● Change
il y a       il y a
6h58         14h37      (30 sp gras)
à 19:37      à 11:57
```
« Dernier repas » ne tient pas (≈ 105 dp en 12 sp gras) : repli sur « Repas ».
Zone gauche disponible : ≈ 169 dp de large × ≈ 139 dp de haut (colonne de droite « Aujourd'hui » ≈ 116 dp, séparateur 19 dp).

Proposition de Yoss : les deux blocs en horizontal (deux lignes empilées) plutôt que deux colonnes verticales côte à côte. Variantes à noter /20 (design et architecture), en recommander une, avec mesures en dp/sp :

H1, une ligne par bloc, libellés à gauche, durée à droite :
```
● Dernier repas          6h58
  à 19:37 · il y a
● Dernier change        14h37
  à 11:57 · il y a
```
H2, libellé au-dessus, durée et heure sur la même ligne :
```
● Dernier repas
6h58  il y a · à 19:37
● Dernier change
14h37  il y a · à 11:57
```
H3, ligne compacte unique par bloc :
```
● Dernier repas  il y a 6h58
  à 19:37
● Dernier change il y a 14h37
  à 11:57
```
V0, l'actuel (colonnes côte à côte).

Contraintes : 12 sp minimum, durée lisible d'un coup d'œil la nuit (grand chiffre), zones tactiles ≥ 48 dp (repas et change ouvrent chacun leur formulaire), « rappel » en rouge quand le rappel est dépassé, ligne « rappel à HH:MM » à l'avance possible, « Prochain sein : gauche/droit » sous les blocs (tétée sur un seul sein), 2×2 et 4×3 à ne pas casser, heure « 19:37 » et durée « 6h58 » (convention figée), TalkBack.
