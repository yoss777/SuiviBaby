# Brief : faut-il une copie côté serveur du calcul du widget pour le temps réel ?

## Contexte

Le widget « Bébé maintenant » (SuiviBaby, Expo / React Native, Firebase) doit devenir temps réel : quelques secondes après une saisie sur n'importe quel téléphone du foyer, le widget des autres téléphones est juste, app fermée. Le plan actuel est dans `docs/strategie/widget/design/plan-temps-reel.md` (lis-le).

Aujourd'hui, l'app calcule les props du widget sur le téléphone :
- `utils/widgetSnapshot.ts` (`buildNowWidgetProps`, `countGroups`, `otherEventLabel`) : fonctions pures, testées (`__tests__/widgetSnapshot.test.ts`) ;
- `hooks/useNowWidgetSync.ts` : rassemble les données du jour depuis l'Accueil (`app/(drawer)/baby/(tabs)/home.tsx`), applique des règles (biberons comptés comme repas selon `typeBiberon`, regroupement des repas à 30 min et des changes à 2 min, minuit local, rappels, Premium…) et appelle `pushNowWidget` (`services/widgetSync.ts`).

Le plan propose : déclencheur Firestore → Cloud Function qui **recalcule les props côté serveur** (copie de la logique) → push data Expo → service Kotlin natif qui écrit les props et redessine, sans démarrer React Native. Sur iOS : Live Activity push-to-start et mise à jour WidgetKit par push (iOS 26+).

Les Functions sont en JavaScript (CommonJS, `functions/src/`, région europe-west1), déployées séparément de l'app.

## La question du fondateur

« Accepter une copie côté serveur du calcul du widget : est-ce nécessaire pour le temps réel ? » Il veut trancher.

## Options à juger (tu peux en proposer d'autres)

- **A. Copie serveur** : le serveur calcule les props complètes et les pousse. Le téléphone les écrit telles quelles.
- **B. Code partagé, pas de copie** : un seul module pur (ex. `shared/widget/`) importé par l'app et par les Functions (build, bundling, ou paquet local). Le serveur calcule avec le même code.
- **C. Pas de calcul serveur** : le push dit seulement « quelque chose a changé pour l'enfant X » ; le téléphone se réveille, relit Firestore et calcule lui-même. Android : tâche JS en arrière-plan (expo-task-manager / Headless JS) ou code natif ; iOS : notification silencieuse ou extension.
- **D. Serveur minimal** : le serveur pousse seulement l'état des sessions en cours (tétée, sommeil, promenade : début, fin) et les heures du dernier repas / change ; le reste (fil du jour, compteurs) est mis à jour quand l'app s'ouvre.

Points à peser : fiabilité réelle app fermée (Doze, Samsung, app tuée, iOS), latence, divergence app / widget, fuseau horaire et minuit (le serveur ne connaît pas l'heure locale du téléphone ?), Premium et réglages par utilisateur, coût, effort, maintenance, tests.

## Ce qu'on attend

Réponse en français, 1 page, dans le fichier indiqué par ton prompt :
1. **Verdict** en 2 lignes : la copie serveur est-elle nécessaire ? Quelle option ?
2. **Pourquoi**, avec des preuves (lignes de code du projet, docs officielles avec URL ; « non vérifié » sinon).
3. **Ce qui casse** dans les options écartées, en scénarios concrets.
4. **Coût** de l'option retenue (fichiers, natif, déploiements).

Ne modifie aucun fichier du projet en dehors de ta réponse.
