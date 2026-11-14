# Brief : icônes, humeur et un widget plus « friendly »

## Contexte

Widget d'écran d'accueil « Bébé maintenant » de SuiviBaby (suivi de bébé pour le foyer). Lu en une seconde, souvent la nuit, d'une main, par un parent fatigué.

État actuel (Android, `widgets/BebeMaintenant.android.tsx`, 4×2 sur Samsung S21 Ultra, thème sombre) :
- en-tête : prénom dans une pastille bleue (14 sp gras), « Aujourd'hui » à droite ;
- gauche : sessions en cours en tuiles teintées (« ● Sieste · depuis 13:14 » puis « 1h59 » en gros) ; au repos, « Dernier repas », l'heure en gros et « il y a 59 min » ;
- droite : « 3 repas / dernier 15:45 », « 3 couches / dernière 15:32 », « 9h12 / de sommeil », puis un « Fil du jour » qui défile : « ● 15:45 Repas solide », « ● 11:57 Couche · pipi », « ● 11:57 Biberon 100 ml ». Les pastilles sont des ronds de couleur (catégorie).

Lis les propositions de design déjà faites dans `docs/strategie/widget/design/` (`proposition-*.md`, `BRIEF_REDESIGN_ANDROID.md`) et le code du widget.

## Les trois questions du fondateur

1. **Icônes à la place du texte des événements** (Fil du jour, et peut-être les résumés) : quel gain réel ? Lisibilité, place gagnée, compréhension sans lire, risque d'ambiguïté (pipi / selle / biberon / tétée / solide), accessibilité (le sens ne doit jamais tenir à la seule icône ni à la seule couleur).
2. **L'emoji de l'humeur de bébé à côté du prénom.** L'app enregistre l'humeur comme un « jalon » de type `humeur`, valeur 1 à 5 (`services/events/types.ts` l. 194-198, `hooks/useMomentsData.ts`). Regarde comment l'app l'affiche (cherche `humeur` dans `components/`). Gain, risques (humeur ancienne affichée comme actuelle, culpabilité d'un parent, emoji qui rend différemment selon le téléphone), et la règle du brief initial « pas d'emoji » : faut-il la garder, l'assouplir pour ce cas, ou dessiner une icône à la place ?
3. **Comment rendre le widget plus « friendly »** (chaleureux, rassurant) sans perdre la lecture en une seconde ni la sobriété du style de l'app.

## Contraintes techniques réelles

- Android (Jetpack Glance via `expo-widgets`) : `Text`, `Row`, `Column`, `Box`, `Spacer`, `LazyColumn`, `Image` à partir d'une ressource drawable de l'app (vecteurs à ajouter dans le projet natif, donc recompilation de 2–3 min) ; pas de police personnalisée, pas d'ombre, pas de dégradé, pas d'animation. Les emoji passent en `Text` (police emoji du téléphone).
- iOS (SwiftUI via `@expo/ui`) : SF Symbols disponibles (`Image systemName`), emoji en `Text`.
- Couleurs de catégorie : tétée `#D66B8F`, sommeil `#7C6BA4`, promenade `#8BC46B`, repas `#E8785A`, couches `#5BA4A4`. Fond sombre `#1f2937`, clair `#ffffff`. Marque `#08739a`.
- Règles produit : aucune incitation à payer dans le widget ; jamais d'auteur sur une tétée ; le temps et les sessions en cours restent la première lecture.

## Ce qu'on attend

Écris ta réponse dans le fichier indiqué par ton prompt, en français, 1 à 2 pages :

1. **Verdict** sur chacune des trois questions (oui / non / oui à condition que…), en une ligne chacune.
2. **Pourquoi**, selon ton angle, avec des preuves (guides Material/Apple, WCAG, études, pratiques des apps de suivi de bébé) plutôt que des goûts. Marque « non vérifié » ce que tu n'as pas pu vérifier.
3. **Maquette ASCII en dp** du widget 4×2 après tes changements (au repos, et avec une session en cours).
4. **Spécification** : icônes retenues (nom, source, taille), libellés, couleurs clair et sombre, contrastes.
5. **Coût** : ce qui passe par le JS seul, ce qui demande une recompilation (drawables), ce qui touche iOS.
