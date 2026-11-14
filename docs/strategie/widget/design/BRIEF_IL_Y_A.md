# Brief : « il y a 6h58 » et heure du dernier dans la colonne de droite (2026-11-14)

Capture actuelle (S21 Ultra, 4×2 ≈ 332 × 185 dp, zone gauche ≈ 169 × 125 dp, colonne droite ≈ 116 dp) : `docs/strategie/widget/design/widget-2026-11-14-0250-H2prime.png`.
Code : `widgets/BebeMaintenant.android.tsx` (`restDualZone`, `dayColumn`, `item`, `mealSub`/`diaperSub`). Le grand chiffre est la vue native `ElapsedClockView` (largeur inconnue, mise dans une Box de largeur fixe ; elle avance seule chaque minute, motif « m' min' » / « H'h'mm »).

Actuel au repos (H2′) :
```
● Dernier repas            │ ● 0 repas
7h13   il y a              │
       à 19:37             │ ● 0 change
● Dernier change           │
14h52  il y a              │ ● 0 min
       à 11:57             │   de sommeil
```
(au repos, `mealSub`/`diaperSub` sont vides à droite pour ne pas doubler l'heure ; en session ils valent « dernier 20:02 »)

Proposition de Yoss :
1. « il y a 6h58 » : « il y a » AVANT le chiffre (« 6h58 il y a » n'est pas logique en français).
2. L'heure du dernier passe dans la colonne de droite en 2e ligne (« 0 repas / dernier 19:37 », « 0 change / dernier 11:57 »), donc plus de « à 19:37 » à gauche.

Variantes à noter /20 (design et architecture) et recommander, avec mesures :
- P1 = proposition complète : gauche « ● Dernier repas » puis ligne [« il y a » 12 sp aligné en bas][grand chiffre] ; droite « dernier 19:37 ».
- P2 = « il y a » avant le chiffre, mais l'heure reste aussi à gauche (« il y a 6h58 · à 19:37 » sur 2 lignes) et rien à droite.
- P3 = P1 + garder « à 19:37 » à gauche en petit sous le chiffre (doublon assumé).
- Autre variante si meilleure.
Cas à couvrir : rappel dépassé (rouge, mot « rappel »), rappel à venir (« rappel 22:30 »), « pas encore », Prochain sein, session en cours (la colonne de droite affiche déjà « dernier HH:MM »), TalkBack, 4×3.
Contraintes : 12 sp min, cibles ≥ 48 dp, heure « 19:37 » / durée « 6h58 » (convention figée), pas d'alignement de ligne de base en Glance (haut/centre/bas seulement).
