# Timeline du widget Android : avis accessibilité (2026-11-14)

Sources : BRIEF_TIMELINE.md, capture widget-2026-11-14-0136.png (S21 Ultra, mode sombre), widgets/BebeMaintenant.android.tsx.
Contrastes calculés à la main (approximatifs, à revérifier avec un outil). Rien testé sur appareil.

## Constats transverses (à traiter quel que soit le choix)

1. **Le fil est invisible pour TalkBack.** Le conteneur racine porte un `contentDescription` (`a11yParts`) qui n'inclut ni `props.recent` ni « Hier ». Les lignes du fil ne sont donc ni lues ni atteignables. Ajouter « Derniers évènements : biberon 18:40, change 17:55… » (3 au plus).
2. **Hauteurs fixes en dp pour du texte en sp.** `fixedLine` (sp×1,25), lignes du fil à 24 dp, items à 48 dp, `size(zoneW, h)` : à 130 % de taille de police le texte rogne, à 200 % il déborde. Tester 100 / 130 / 200 %. Remplacer par des hauteurs minimales si le modifier existe.
3. **Contraste des pastilles en clair** : `#E8785A` et `#5BA4A4` sur blanc font environ 2,9:1 (seuil 3:1, SC 1.4.11). Les textes (`CAT.*.text`) sont conformes AA. Les pastilles sont redondantes avec un mot, donc non bloquant, mais prendre la teinte `text` en clair coûte une ligne. Jaune `#E8C45A` des pictogrammes : environ 1,7:1.
4. Textes : 12 sp mini respecté. Gris `#6b7280` / `#9ca3af` : 4,8 à 5,7:1, AA. Rouge rappel : environ 5,3:1 sombre, 6,5:1 clair. Sleep `#7C6BA4` sur fond sombre : environ 3,1:1, limite.

## Question 1 : pastille seule si le libellé est là ?

Oui. SC 1.4.1 (sens hors couleur) est satisfait dès que le type est écrit en toutes lettres : la couleur devient un renfort. Conditions : (i) `e.label` nomme le type (« Biberon 120 ml », jamais « 120 ml » seul), (ii) pastille à 3:1 (cf. 3), (iii) le fil figure dans la description TalkBack.

| Option | Note | Raison |
| :-- | :-: | :-- |
| (a) pictogramme + heure + libellé | 13/20 | glyphe de 13 dp illisible à cette taille, 17 couleurs dont certaines sous 3:1, dépendance à une vue native `ImageView` |
| (b) heure puis pictogramme | 14/20 | heure alignée à gauche : bon balayage ; mêmes défauts du pictogramme |
| (c) sans pictogramme | 15/20 | le plus robuste et simple, mais perd le repère visuel d'une ligne à l'autre |
| (d) pastille 8 dp | **17/20** | même grammaire que le reste du widget (pastille + mot), 5 teintes seulement, rien à décoder |

**Recommandation : (d)**, pastille en tête de ligne, `contentDescription` absent (décorative), pastille en teinte `text` en mode clair, 10 dp si la place le permet.

## Question 2 : formulation du bloc au repos

Principe : **garder deux formes distinctes**, « 19:37 » pour une heure, « 5h59 » pour une durée. La forme signale la nature du nombre. À 01:36, « 5h59 » et « 19h37 » côte à côte se confondent, et « 5h59 » peut passer pour une heure.

| Option | Note | Raison |
| :-- | :-: | :-- |
| A actuelle « Repas · il y a » / 5h59 / « à 19:37 » | 16/20 | « il y a » collé au nombre, formes distinctes, 3 lignes |
| B « Dernier repas » / « il y a 5h59 » / « à 10h03 » | 11/20 | « il y a 13h38 » ne tient pas à 30 sp dans ~108 dp de colonne ; unifier en « h » supprime l'indice de nature ; « 19h37 » diffère de l'heure système (« 01:36 » en barre d'état) et du reste du widget (`clock()`, « rappel à 16:30 ») |
| C = A + corrections ci-dessous | **17/20** | |

Corrections de C :
- Écart d'un cran : en police 130 %, « Change · il y a » (environ 80 dp + pastille) dépasse la colonne (~108 dp) et « il y a » est rogné, ce qui laisse « 13h38 » sans unité. Si le test le confirme, abréger le libellé en « Change » et mettre « il y a » seul sur la ligne du dessous.
- Voix : TalkBack lit la description statique, qui dit l'heure (« à 19:37 ») et pas la durée, ce qui est juste (la durée vieillirait). Écrire « à 19 heures 37 » dans la description : évite « 19 deux-points 37 » selon le moteur vocal.
- À l'écrit, durée sous 1 h : « 45 min » (déjà le cas) ; « il y a 5h59 » se lit bien comme durée grâce au préfixe.

## Question 3 : colonne de droite, écarts et hauteurs (dp)

Constat : écart de 8 dp seulement entre repas et change, 0 dp entre change et sommeil (visible sur la capture : 109 px puis 77 px). Les trois items (3×48 + 8 = 152 dp) remplissent la zone (~162 dp en 222 dp de haut) : le fil commence hors cadre, sans indice qu'on peut défiler. Le défilement dans un widget d'écran d'accueil entre en conflit avec le balayage entre pages.

| Option | Note | Raison |
| :-- | :-: | :-- |
| 1. Garder, 8 dp partout (+8 dp) | **16/20** | 2 cibles de 48 dp espacées (SC 2.5.8 largement respecté), aucun changement de structure, 2×2 / 4×3 intacts |
| 2. Lignes de 36 dp non cliquables pour laisser voir le fil | 11/20 | les cibles repas/change de droite sont les seules pendant une session en cours |
| 3. Fil par défaut en 4×2, compteurs en 4×3 | 12/20 | perd le résumé du jour là où il sert, mise en page incohérente selon la taille (SC 3.2.3) |

**Recommandation : option 1**, avec :
- Écart de **8 dp entre les trois items** (ajouter `Spacer(height(8))` avant le sommeil).
- Item sommeil non cliquable : 40 dp suffisent (deux lignes 15 + 12 sp), à condition de hauteur minimale.
- Lignes du fil de **24 à 28 dp** (marge pour police 130 %), pictogramme/pastille dans une boîte de 14 dp.
- Titre « Évènements récents » : 26 dp, intertitre « Hier » : 22 dp, inchangés.
- Le fil devient atteignable par TalkBack via la description (constat 1) : c'est le vrai remède à son invisibilité, plus que la mise en page.
