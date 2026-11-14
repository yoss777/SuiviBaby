# Repos horizontal : avis architecture (2026-11-14)

Agent `ecc:architect`, en lecture seule, sur `BRIEF_REPOS_HORIZONTAL.md`. Hauteur de zone calculée : ≈ 115 dp (le brief disait 139).

| Variante | Note | Raison |
|---|---|---|
| V0 (actuel, colonnes) | 13/20 | validé, mais libellés tronqués, « 14h37 » coupé à police 1,3× |
| H1 (durée à droite) | 15/20 | simple en Glance (Row + Box fixe `centerEnd`), une disposition ; « Dernier repas » toujours trop long à côté d'un 30 sp |
| H2 (durée + heure sur une ligne) | 11/20 | ligne ≈ 186 dp pour 169, pas d'alignement de ligne de base en Glance, déborde en hauteur |
| H3 (ligne compacte) | 8/20 | ne tient pas, perd le grand chiffre |

Points retenus pour toute variante : colonne fixe pour la vue native (sa largeur est inconnue), chaque bloc zone tactile ≥ 48 dp, police système agrandie à traiter (transmettre `fontScale` dans l'environnement natif), TalkBack via la description globale.

Arbitrage : H2′ de la cellule design (17/20) retenue, car elle lève les deux objections faites à H2 (colonne fixe de 3 × la taille du chiffre, pile de 12 sp alignée en bas à côté, rien sur une seule ligne trop large). Compacte en 4×2 (24 sp, 4 dp entre blocs), 28-30 sp en 4×3. Capture : `widget-2026-11-14-0250-H2prime.png`.
