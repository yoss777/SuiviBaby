# Brief : quel bébé le widget affiche-t-il quand le foyer en a plusieurs ?

## Le produit

SuiviBaby (Expo / React Native, Firebase) suit les repas, couches, sommeils, promenades et tétées d'un ou plusieurs bébés, partagés par le foyer (parents, nounou). Le widget d'écran d'accueil « Bébé maintenant » (iOS et Android) montre d'un coup d'œil, pour **un** bébé :
- à gauche, les sessions en cours (tétée, sommeil, promenade) avec un chrono natif qui défile seul ;
- à droite, la journée : repas, couches, sommeil, et un « Fil du jour » qui défile verticalement.

Il est lu en une seconde, souvent la nuit, d'une main, par un parent fatigué. Aucune incitation à payer dans le widget.

## La question à trancher

Un foyer avec plusieurs enfants (jumeaux, ou un bébé et un aîné encore suivi). Aujourd'hui, le widget **suit le bébé actif de l'app** : quand le parent change de bébé dans l'app, l'app renvoie les données du nouveau bébé au widget. Le fondateur hésite entre :

- **A. Rafraîchir à chaque changement de bébé actif** (comportement actuel) : le widget montre toujours le bébé choisi en dernier dans l'app.
- **B. Swipe horizontal** dans le widget pour passer d'un bébé à l'autre, sans ouvrir l'app.

Tu peux proposer une variante ou un hybride si elle est meilleure (par exemple : un bébé choisi par widget à l'ajout, plusieurs widgets côte à côte, des flèches ou un bouton « bébé suivant », un mode empilé qui montre tous les bébés en cours). Juge-les sur les mêmes critères.

## Ce qu'on sait déjà (vérifié)

- **Bug réel rencontré** avec A : au changement de bébé, l'Accueil affichait un instant le nouveau nom avec les données de l'ancien, et le widget l'a reçu. Corrigé : l'envoi est bloqué tant qu'une donnée appartient à un autre enfant (`hooks/useNowWidgetSync.ts`).
- Avec A, le widget n'est à jour **que si l'app a tourné** : l'app calcule tout (le widget ne lit pas Firestore). Un changement fait par l'autre parent sur un autre téléphone n'arrive que quand l'app de ce téléphone le reçoit (listener Firestore, app au premier plan ou récente).
- Aujourd'hui, l'Accueil n'écoute que les données du **bébé actif**. Le widget de B demanderait les données de **tous** les bébés (plus de listeners, plus de données envoyées, plus de lectures Firestore).

## Contraintes techniques réelles

**Android** : `expo-widgets` ~58.0.28 rend via Jetpack Glance (fork `glance-appwidget 1.2.0-peek-0.3.3`). Le widget est une fonction JS exécutée dans un runtime Hermes isolé, qui reçoit un objet `props` (envoyé par l'app avec `updateSnapshot`) et renvoie un arbre de nœuds. Nous avons patché le module (`patches/expo-widgets+58.0.28.patch`, sources dans `node_modules/expo-widgets/android/`) : clic racine qui ouvre l'app, chronos natifs (`ChronometerView`, `ElapsedClockView`), réveil programmé (`RefreshAtView`), taille en dp dans l'environnement. Pas de `weight`. `LazyColumn` défile verticalement. Glance n'a **pas** de pager horizontal ; les RemoteViews ont `AdapterViewFlipper` / `StackView` (lanceurs variables). Un bouton dans le widget est possible en natif (`actionRunCallback`, broadcast) mais n'existe pas encore dans notre pont : à évaluer dans les sources.

**iOS** : WidgetKit + SwiftUI via `@expo/ui` (`widgets/BebeMaintenant.ios.tsx`, sources dans `node_modules/expo-widgets/ios/`). **Pas de swipe** dans un widget iOS. iOS 17+ permet des boutons interactifs (App Intents) ; iOS permet aussi la configuration d'un widget par l'utilisateur (choisir une option à l'ajout, `AppIntentConfiguration`). Vérifie dans les sources ce qu'`expo-widgets` expose réellement.

**Budget** : WidgetKit limite les rechargements ; l'app envoie avec un anti-rebond de 2 s, seulement si le contenu change (`services/widgetSync.ts`).

**Données** : type `NowWidgetProps` dans `utils/widgetSnapshot.ts` (un seul bébé aujourd'hui).

## Ce qu'on attend de toi

Écris ta réponse dans le fichier indiqué par ton prompt, en français, courte (1 à 2 pages) :

1. **Recommandation** en 2 lignes : A, B ou une variante, et pour quand (maintenant, V2, Premium ?).
2. **Pourquoi**, selon ton angle, avec des preuves (lignes de code, docs de plateforme) plutôt que des intuitions.
3. **Ce qui casse** dans l'option que tu écartes, en scénarios concrets (« 3 h du matin, jumeaux, la mère allaite l'un, le père donne un biberon à l'autre… »).
4. **Coût** de ta recommandation : fichiers touchés, natif à recompiler ou non (Android : 1–2 min ; iOS : build EAS cloud), risques.
5. Ce qui reste **incertain** et comment le vérifier.

Ne modifie aucun fichier du projet en dehors de ta réponse.
