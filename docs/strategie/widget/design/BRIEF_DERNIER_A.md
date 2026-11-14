# Brief : 3e ligne « dernier à » / « hier à » / « il y a x jours » (2026-11-14)

Capture actuelle (S21 Ultra, 4×2, zone gauche ≈ 169 × 125 dp) : `docs/strategie/widget/design/widget-2026-11-14-0302-P4.png`.
Code : `widgets/BebeMaintenant.android.tsx` (`restDualZone`, `dayColumn`), vue native `ElapsedClockView` (patch `patches/expo-widgets+58.0.28.patch`) : durée qui avance seule chaque minute, motif « m' min' » (< 1 h) ou « H'h'mm » ; au-delà de 24 h l'affichage n'est pas fiable (relevé P2 de la revue ECC n° 1).

Actuel (P4, validé hier soir) :
```
● Dernier repas            │ ● 0 repas
il y a 7h25                │   dernier 19:37
● Dernier change           │ ● 0 change
il y a 15h04               │   dernier 11:57
[Prochain sein : droit]    │ ● 0 min / de sommeil
```
« Prochain sein » (13 sp gras, sous les deux blocs) vient d'être réparé : il doit avoir sa place.

Proposition de Yoss : une 3e ligne à gauche sous le chiffre pour gérer les heures et les jours :
- même jour : « dernier à 19:37 » (ou « à 19:37 ») ;
- veille : « hier à 19:37 » ;
- plus ancien : « il y a 3 jours » (le grand chiffre « il y a 75h » n'a plus de sens au-delà de 24 h).
Question corollaire : que devient alors la 2e ligne de la colonne de droite (« dernier 19:37 ») : on la garde (doublon) ou on la retire / remplace (ex. « 120 ml », rien) ?

Variantes à noter /20 (design et architecture), recommander, avec mesures et texte exact de chaque cas :
- D1 : proposition telle quelle (3 lignes par bloc à gauche), droite sans heure.
- D2 : 3e ligne seulement quand ce n'est pas aujourd'hui (« hier à 19:37 », « il y a 3 jours »), sinon rien ; droite garde « dernier 19:37 ».
- D3 : au-delà de 24 h, le grand chiffre devient « 3 j » (texte, plus la vue native) et la petite ligne dit « hier à 19:37 » / « le 11/11 » ; droite inchangée.
- Autre variante si meilleure.
Contraintes : tout doit tenir dans ≈ 125 dp de haut avec « Prochain sein », cibles ≥ 48 dp par bloc, 12 sp minimum, « 19:37 » / « 6h58 » (convention), rappel (pile « rappel / dépassé » ou « rappel / 22:30 » à droite du chiffre), « pas encore », TalkBack, 4×3, session en cours (droite « dernier HH:MM »). Le widget ne se redessine pas tout seul à minuit sauf `RefreshAt` programmé (le libellé « hier » doit rester vrai).
