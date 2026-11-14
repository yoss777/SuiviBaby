# Brief : libellé de la 2e ligne de la colonne de droite (2026-11-14)

Capture (S21 Ultra, 4×2) : `docs/strategie/widget/design/widget-2026-11-14-0312-D4.png`. Code : `widgets/BebeMaintenant.android.tsx`, `dayColumn` (`item`, `mealSub`, `diaperSub`, `whenShort`, `lateSub`). Colonne de droite `Rw` ≈ 116 dp ; texte de la sous-ligne après pastille 8 dp + 8 dp ≈ 100 dp ; 12 sp, une ligne (`maxLines` 1, troncature sans « … »).

Actuel (D4) : « dernier 19:37 » / « hier 19:37 » / « le 11/11 » ; rappel dépassé « rappel · hier 19:37 » (« rappel · hier » si Rw < 130) ; avec biberon et Rw ≥ 140 : « 19:37 · 120 ml ».

Proposition de Yoss : « dernier à 19:37 », « dernier hier à 19:37 », « dernier le 11/11 ».

À noter /20 (design et architecture), recommander, texte exact de chaque cas et largeurs estimées en 12 sp (police système Roboto, chiffres ≈ 6,9 dp, espace ≈ 3 dp) :
- L1 : proposition telle quelle.
- L2 : proposition, repli automatique quand ça ne tient pas (ex. « hier à 19:37 », « dernier le 11/11 »).
- L3 : actuel D4.
- Autre variante si meilleure (ex. sous-ligne sur 2 lignes : l'item fait 48 dp, valeur 15 sp gras).
Cas : aujourd'hui, hier, ≥ 2 jours, rappel dépassé, biberon ml, session en cours (même colonne), 4×3 (Rw jusqu'à 156 dp), police agrandie, TalkBack.
