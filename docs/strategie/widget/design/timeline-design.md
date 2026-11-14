# Avis design : fil et lisibilité du widget Android (2026-11-14)

Cellule UI/UX (grille ui-ux-pro-max : accessibilité, cibles, typo, cohérence). Base : capture S21 Ultra 01:36,
`widgets/BebeMaintenant.android.tsx`, `RecentEventsList.tsx`.

**Mesure de départ (capture)** : widget ≈ 356 × 198 dp → innerW 328, innerH 170, zoneH 138, Rw 118, zoneW 185,
colonne au repos 87 dp. Tout se joue au dp près : c'est la largeur, pas le goût, qui tranche la question 1.

## 1. Lignes du fil

| Option | Note | Justification |
|---|---|---|
| (a) pictogramme + heure + libellé | 12/20 | Ordre inverse de l'Accueil (pastille → heure → carte). Glyphe 13 dp illisible la nuit, plusieurs teintes sous 3:1 sur #1f2937 (nuit #5A6BA4, vaccin). Prend 19 dp : « Change · pipi » est coupé à 118 dp. |
| (b) heure puis pictogramme | 14/20 | Même ordre que l'Accueil (heure \| icône + libellé), l'icône va avec le libellé. Même coût en largeur et même problème de lisibilité que (a). |
| (c) sans pictogramme | 13/20 | Laisse le plus de place au libellé, propre, le sens est dans le texte. Mais plus de repère de catégorie : on lit chaque ligne au lieu de parcourir la colonne. |
| **(d) pastille 8 dp de couleur** | **17/20** | C'est le rail de l'Accueil (pastille → heure → libellé). Même langage que les 5 autres pastilles du widget (blocs au repos, colonne Aujourd'hui). Purement décorative (le libellé porte le sens, pas d'exigence 3:1). Prend 14 dp au lieu de 19. |

**Recommandation : (d).** Ligne = `dot(8)` · 6 dp · heure 12 sp `C.soft` · 6 dp · libellé 12 sp `C.strong`, hauteur 22 dp.
Les drawables `sb_wi_*` restent utiles pour iOS ou un 4×3 plus tard, mais ne pas les livrer dans le fil 4×2.
Remarque : même avec (d), il reste environ 75 dp pour le libellé (environ 12 caractères). « Biberon 120 ml » sera coupé.
À prévoir côté serveur : « Pipi », « Selle », « Bib. 120 ml » (le libellé seul suffit, la pastille donne la famille).

## 2. Libellé du bloc au repos

| Option | Note | Justification |
|---|---|---|
| Actuel « ● Repas · il y a » / **5h59** / « à 19:37 » | 14/20 | Pas d'ambiguïté, mais style télégraphique : le « · il y a » se lit mal comme titre. |
| « ● Dernier repas » / **5h59** / « à 19:37 » | 11/20 | Titre naturel, mais à 3 h du matin, « Dernier repas 5h59 » se lit « à 5 h 59 ». Contresens possible. |
| « Dernier repas » / « il y a 5h59 » en petit comme « à 10h03 » | 7/20 | On perd le gros chiffre, la seule chose qu'on lit d'un coup d'œil la nuit. Et deux lignes de même forme l'une sous l'autre. |
| **« ● Dernier repas » / « il y a » / 5h59 / « à 19:37 »** | **18/20** | Se lit de haut en bas comme une phrase. Le gros chiffre ne bouge pas. Tient en largeur (87 dp). |

**Recommandation, lignes exactes** (bloc change identique, avec « Dernier change ») :
1. `● Dernier repas`, 12 sp gras, couleur de catégorie (`CAT.meal.text`).
2. `il y a`, 12 sp normal, `C.soft`, collé au chiffre (écart 0).
3. `5h59`, 30 sp gras (26 si zoneH < 108), `C.strong`. Écart de 2 dp avant et après.
4. `à 19:37`, 12 sp, `C.soft` (ou `biberon 19:37` si colW ≥ 120, comme aujourd'hui).
Rappel dépassé : ligne 1 → `● Repas · rappel` en `C.alert`, les lignes 2 à 4 restent (texte en `C.alert`). Hauteur du bloc :
15 + 15 + 38 + 15 + 4 ≈ 87 dp (+24 avec « Prochain sein »), donc ça tient dans 138.
**Heures : garder « 19:37 » (deux-points), jamais « 19h37 ».** Le « h » est réservé aux durées (« 5h59 »). Ainsi une
heure et une durée ne se confondent pas, et c'est le format de l'Accueil et du fil (toLocaleTimeString fr-FR).
Note « à 19h37 » : 11/20 (norme typographique française, mais même forme que la durée juste au-dessus) ; « à 19:37 » : 17/20.
TalkBack ne change pas : « Dernier repas à 19:37 ».

## 3. Colonne de droite

| Option | Note | Justification |
|---|---|---|
| En l'état | 9/20 | Écart de 8 dp seulement entre repas et change : rythme bancal, et le fil est invisible (rien n'indique qu'il faut défiler). |
| Harmoniser : 48 / 48 / 48 collés, sans écart | 13/20 | Rythme régulier : les cibles de 48 dp contiennent déjà l'espace. Mais 144 dp > 138 dp : le fil reste caché. |
| **Colonne pleine hauteur, sommeil sur une ligne, fil visible** | **17/20** | Récupère les 32 dp de l'en-tête. La première ligne du fil apparaît sans défiler et montre qu'on peut faire défiler. Les cibles de 48 dp sont gardées. |

**Recommandation** : la LazyColumn démarre en haut du widget (hauteur `innerH` = 170 dp, filet vertical sur toute la
hauteur). « Aujourd'hui » devient son premier élément. Espacement en 4×2 (colH < 194 dp) :
- `Aujourd'hui` : 22 dp, texte calé en bas, 12 sp `C.soft`.
- repas : 48 dp ; change : 48 dp. Collés, contenu **aligné en haut avec 6 dp de marge haute**, ce qui donne des écarts de
  texte réguliers (environ 29 dp sans sous-ligne, environ 13 dp avec « dernier 19:37 »).
- sommeil : **24 dp sur une ligne**. Row `● 2h10` (15 sp gras) · 4 dp · `sommeil` (12 sp `C.soft`). Il n'ouvre rien,
  donc pas besoin de 48 dp.
- séparation : 3 dp + filet horizontal 1 dp `C.rule` + 2 dp = 6 dp. Le titre « Évènements récents » disparaît en 4×2.
- fil : lignes de 22 dp (au lieu de 24). Total : 22 + 96 + 24 + 6 = 148, **première ligne entière entre 148 et 170 dp**.
- 4×3 et plus (colH ≥ 194) : sommeil en 48 dp sur deux lignes (`2h10` / `de sommeil`), titre « Évènements récents » de 26 dp.
  Rythme 48/48/48 régulier, et le fil est visible quand même.
- 2×2 : rien ne change (pas de colonne, bande du bas).
Largeur : SEP 25 → 19 (espaceurs de 9 dp) et Rw = clamp(112, 156, innerW × 0,38). Sur la capture : Rw 125 (au lieu de 118),
zoneW 184 (au lieu de 185). La gauche ne perd rien, le libellé du fil gagne 7 dp.
À vérifier sur l'appareil : le défilement de la LazyColumn qui inclut l'en-tête, et la hauteur réelle du 4×2 sur d'autres
lanceurs (180 à 230 dp). La règle colH < 194 couvre les deux cas.
