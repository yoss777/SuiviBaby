# Brief : faut-il refondre le widget « Bébé maintenant » pour qu'il soit aussi efficace sur Android que sur iPhone ? (2026-11-14)

Demande de Yoss : statuer sur le contenu du widget, à partir des retours terrain et des blocages rencontrés. Si une refonte (totale ou partielle) s'impose, faire des propositions. Toutes les cellules donnent leur avis, puis le board tranche.

## Le produit

SuiviBaby (Expo SDK 58, React Native 0.88) : suivi de bébé pour parents (tétées, biberons, solides, changes, sommeil, promenades, santé, jalons). Rôles : propriétaire, Parent (écrit), Proche (lecture seule). Premium (lancement 2/2/2027) : rappels du change, etc. Règle produit : **aucune incitation à payer dans le widget**. Règle : **jamais d'auteur ni de nounou sur une tétée** (la tétée = la mère).

## Le widget aujourd'hui (fichiers à lire)

- `widgets/BebeMaintenant.android.tsx` : Android, Jetpack Glance via expo-widgets 58 (patché, `patches/expo-widgets+58.0.28.patch` : vues natives `ChronometerView`, `ElapsedClockView`, `RefreshAtView`, lien `openUrl`).
- `widgets/BebeMaintenant.ios.tsx` : iOS, SwiftUI via @expo/ui (WidgetKit).
- `functions/shared/widget/index.js` + `.d.ts` : données communes (props), construites par l'app ET par le serveur (temps réel).
- `functions/src/widget/fanout.js` : push serveur → widget (Android : FCM data, reçu même app fermée ; iOS : pas encore, étape E7).
- `utils/widgetSnapshot.ts`, `services/widgetSync.ts`, `hooks/useNowWidgetSync.ts`, `hooks/useWidgetDeepLink.ts`.
- `app/settings/widget.tsx` : aide « Widget ».
- Specs et plans : `docs/strategie/widget/WIDGET_SPEC.md`, `PLAN_ACTION_WIDGET.md`, `BOARD_WIDGET.md`, `board/`.
- Avis précédents des cellules : `docs/strategie/widget/design/*.md` (timeline, repos horizontal, il y a, dernier à…).
- Captures Android (contiennent des données perso : ne pas les recopier, ne pas les committer) : `docs/strategie/widget/design/widget-2026-11-14-*.png`, `widget_actuel.png`.

### Contenu Android (4×2 sur S21 Ultra ≈ 332×185 dp, défaut désormais 3×2, redimensionnable ; 2×2 = cellules compactes)
- En-tête : prénom dans une pastille, « Aujourd'hui » à droite.
- Zone gauche : session(s) en cours (tétée G/D avec chrono, sieste/nuit, promenade) OU au repos deux blocs empilés « Dernier repas / il y a 6h58 » et « Dernier change / il y a 18h23 » (grand chiffre qui avance seul ; ≥ 23h50 → « N j » ; rappel dépassé en rouge).
- Colonne droite (LazyColumn qui défile) : « 0 repas / dernier hier à 19:37 », « 0 change / dernier à 11:57 », « 7 min / de sommeil » (avance pendant une sieste), puis titre « Évènements récents » et les 7 derniers événements des 24 h (pastille couleur du type, heure, libellé ; humeur = emoji seul).
- Zones touchables : repas / change ouvrent le formulaire (pas pour un Proche), tétée en cours la reprend.
- Temps réel : quand un autre aidant saisit, le serveur pousse les données ; mesuré 1,2 s en veille profonde.

### Contenu iOS
- Petit : session en cours (chrono qui défile seul) ou « Dernier repas » relatif.
- Moyen : maintenant à gauche, journée à droite (Repas à HH:MM / N repas, Change, Sommeil). **Pas de fil d'événements.**
- Grand (ajouté en 1.0.17, non vu sur appareil) : le moyen + « Évènements récents » (7 lignes).
- Écran verrouillé : rectangulaire et en ligne.
- Mise à jour : seulement quand l'app écrit le snapshot (pas encore de push iOS). Apple limite les rechargements en arrière-plan (budget quotidien) ; Live Activity prévue (S4/S5) pour les sessions.

## Retours terrain et blocages (vécus le 13-14/11)

1. iPhone : « le swipe vertical n'est pas visible, je ne vois pas les événements récents » — un widget iOS ne défile pas ; Android cache aussi le fil sous la ligne de flottaison en 4×2 (il faut défiler).
2. Le widget Android par défaut devait être 3×2 et non 2×2.
3. Deux plateformes, deux codes de rendu, deux grammaires différentes : Android « Dernier repas / il y a 6h58 / dernier à 19:37 », iOS « Repas / à 19:37 / N repas ». L'utilisateur voit deux produits.
4. Itérations nombreuses sur Android (pictos → pastilles, libellés, espacements, « aucun noté », « Prochain sein » retiré à la demande de Yoss), changement d'enfant qui restait figé, horloge native qui arrondissait (« 59 min »).
5. Les compteurs « 0 repas » le matin ont peu de valeur ; ce qui compte au réveil : depuis quand il a mangé / été changé, et ce qui est en cours.
6. Rôle Proche : le widget annonce encore « Noter un repas » (TalkBack) alors qu'il ne peut pas saisir.
7. Contraintes techniques : Glance (pas de Compose libre, vues natives limitées, RemoteViews, alarmes inexactes) ; WidgetKit (pas de défilement, pas d'interaction riche avant App Intents, budget de rechargement, timeline) ; isolation du code widget (pas de hooks, pas d'imports hors Expo UI).

Choix déjà tranchés par Yoss à respecter sauf argument fort : durée « il y a 6h58 » (« il y a » avant), heure « 19:37 », « dernier à 19:37 / dernier hier à 19:37 / dernier le 11/11 », « aucun noté », pas de « Prochain sein », pastilles de couleur, humeur en emoji seul.

## Ce qu'on attend de chaque cellule

Lire le code et les docs ci-dessus (pas seulement ce brief), puis rendre :
1. Diagnostic (ce qui marche, ce qui ne marche pas, par plateforme).
2. Verdict : évolution, refonte partielle ou refonte totale — et pourquoi.
3. 2 à 3 propositions concrètes et différentes (maquette ASCII par taille : iOS petit/moyen/grand, Android 2×2/3×2/4×2), avec ce qui est partagé entre plateformes.
4. Coût et risques (jours, dette, temps réel, accessibilité).
5. Note /20 de chaque proposition selon son angle.
