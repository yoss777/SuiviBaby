# Brief : que retenir de la capture d'un concurrent ?

Image : `docs/strategie/widget/design/concurrent-widget-capture.png` (lis-la avec l'outil Read). C'est une capture de fiche de store d'une app concurrente de suivi de bébé : « Accès rapide à vos données — visualisez et enregistrez les activités de votre bébé directement depuis les widgets et votre montre ». On y voit :
- une barre horizontale sur l'écran d'accueil / verrouillé : avatar, puis par catégorie une icône et « il y a » (tétée en cours 16 min 20 s (L), change 30 min, biberon 1 h 5 min avec cloche, solide 20 min, sommeil 4 h 48 min), et un chevron ;
- un widget en liste : en-tête coloré avec photo et prénom, une ligne par catégorie (icône, « il y a », sous-ligne rappel « In 10min » ou en rouge « Exp. 12:35 »), et des **boutons d'action** à droite (Stop L / Play R pour la tétée, pipi / selle, +) ;
- une montre : tétée en cours, boutons L / R, temps par sein.

## Notre widget aujourd'hui
`widgets/BebeMaintenant.android.tsx` (4×2, Jetpack Glance via expo-widgets patché ; iOS : `widgets/BebeMaintenant.ios.tsx`). Prénom en pastille, sessions en cours à gauche avec chrono natif, au repos dernier repas et dernier change côte à côte ; à droite repas / changes / sommeil du jour et un « Fil du jour » qui défile, avec un emoji par type d'événement (en cours). Lecture seule : un appui ouvre l'app. Décisions déjà prises : temps réel par push avec calcul serveur partagé (`plan-temps-reel.md`, `calcul-serveur-*.md`) ; widget qui suit le bébé actif (`multi-bebes-*.md`) ; design « friendly » (`friendly-*.md`). Règles : aucune incitation à payer dans le widget ; jamais d'auteur sur une tétée ; le temps et les sessions en cours restent la première lecture.

Techniquement, des boutons existent dans le pont expo-widgets (Android : broadcast vers `WidgetsInteraction.handle`, qui relance le JS du widget dans Hermes ; iOS 17+ : App Intents), mais le widget ne peut ni lire ni écrire Firestore lui-même (voir `multi-bebes-architecture.md` §2).

## Ce qu'on attend
En français, 1 page, renvoyée comme texte final :
1. **Ce qui est meilleur chez eux** et qu'on devrait reprendre (avec raison), **ce qui est moins bon** que chez nous.
2. **Saisie depuis le widget** (boutons démarrer / arrêter tétée, pipi / selle) : faut-il le faire, quand, et à quelles conditions (ton angle).
3. Les 3 changements prioritaires pour notre widget, du plus utile au moins utile, avec leur coût (JS seul / recompilation / serveur).
Ne recopie pas leur design : on parle de principes. Ne modifie aucun fichier du projet.
