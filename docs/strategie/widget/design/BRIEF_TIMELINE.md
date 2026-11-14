# Brief : timeline et lisibilité du widget Android « Bébé maintenant » (2026-11-14)

Capture réelle (Samsung S21 Ultra, 01:36, donc journée à 0) : `docs/strategie/widget/design/widget-2026-11-14-0136.png`.
Code : `widgets/BebeMaintenant.android.tsx` (Glance via expo-widgets, primitives Box/Row/Column/LazyColumn/Text, vue native "ImageView" pour drawables teintés).
Calcul des données : `functions/shared/widget/index.js` (fil = 7 derniers événements sur 24 h, comme le fil « Évènements récents » de l'Accueil, `components/suivibaby/dashboard/RecentEventsList.tsx`).

Disposition actuelle (widget 4×2 environ) :
- gauche, au repos : deux blocs « ● Repas · il y a » / grand « 5h59 » / « à 19:37 », idem « ● Change · il y a ».
- droite (LazyColumn défilante, largeur 112–150 dp) : « Aujourd'hui », 0 repas, 0 change, 0 min de sommeil (items 48 dp, écart 8 dp entre repas et change seulement), puis titre « Évènements récents » et lignes du fil [pictogramme teinté 13 dp][HH:MM][libellé], intertitre « Hier ». Le fil n'est visible qu'en faisant défiler.

Questions de Yoss (trancher, noter chaque option /20, recommander) :
1. Lignes du fil : (a) actuel pictogramme + heure + libellé ; (b) heure puis pictogramme ; (c) sans pictogramme ; (d) pastille de couleur (dot 8 dp, couleur du type comme l'Accueil) à la place du pictogramme.
2. Libellé du bloc au repos : actuel « Repas · il y a » / 5h59 / « à 19:37 » contre « Dernier repas » / en dessous « il y a 5h59 » écrit comme « à 10h03 » (forme exacte à proposer : « 10h03 » vs « 10:03 », place du « il y a »).
3. Colonne de droite : le fil n'est pas visible sans défiler. Garder en l'état mais harmoniser l'espacement entre repas, change et sommeil ? Ou autre arrangement (sans casser les tailles 2×2 / 4×2 / 4×3).

Contraintes : texte 12 sp minimum, cibles 48 dp, contraste AA clair/sombre, le sens ne tient jamais à la seule couleur/icône, TalkBack, rien de Premium affiché dans le widget, Glance (pas d'animation, polices système).
