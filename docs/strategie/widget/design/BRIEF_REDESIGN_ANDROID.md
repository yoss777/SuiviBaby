# Brief : redesign du widget Android « Bébé maintenant »

## Le produit

SuiviBaby est une app de suivi de bébé (repas, couches, sommeil, promenades, tétées) pour les parents et les aidants du foyer. Le widget d'écran d'accueil sert à **voir d'un coup d'œil** :
- ce qui se passe maintenant : tétée, sommeil ou promenade en cours, avec le temps écoulé ;
- l'état de la journée : repas, couches, sommeil.

Il est lu en une seconde, souvent la nuit, d'une main, par un parent fatigué.

## Ce que le fondateur reproche à la version actuelle

Capture : `widget_actuel.png` (dans ce dossier, thème sombre, widget 4×2 sur Samsung S21 Ultra).

1. « Le visuel est très moche. »
2. Une session en cours (promenade, sommeil) ne s'affiche pas comme sur l'Accueil de l'app : **le temps écoulé n'apparaît pas**. L'Accueil montre un chrono qui défile (« 12:34 » ou « 1:02:10 »).
3. L'heure de début est affichée en gros **au-dessus** du mot « depuis » : l'ordre de lecture est faux.
4. Les tuiles « Journée » sont lourdes : trois blocs de couleur sombre, chiffres sans hiérarchie.

## Règles produit (non négociables)

- Le chrono d'une session en cours est visible de **tous**, gratuitement.
- **Toutes les sessions en cours sont affichées, chacune avec son chrono** (demande du fondateur). Exemple réel : une promenade et un sommeil en même temps (le bébé dort dans la poussette). Jusqu'à 3 sessions : tétée, sommeil, promenade. Ordre : tétée, sommeil, promenade.
- Tétée : seule la mère allaite. Ne jamais afficher d'auteur sur une tétée. Afficher le sein actif (G/D) et le temps de l'autre sein.
- **Aucune incitation à payer** dans le widget : pas de cadenas, pas de « Premium ».
- Rappels dépassés (repas, couches) : valeur en rouge discret (`#b91c1c` en clair, `#f87171` en sombre), avec une icône ou un mot. Pas de fond rouge vif, pas de clignotement.
- Pas d'emoji. Sobre, épuré, dans le style de l'app.

## Style de l'app (à suivre)

- Texte fort `#1f2937` / sombre `#f9fafb` ; texte secondaire `#6b7280` / sombre `#9ca3af`.
- Fond carte `#ffffff` / sombre `#1f2937` (bleu nuit). Fond écran `#f9fafb`.
- Bordures `#e5e7eb`. Teinte de marque `#08739a` (sombre `#60a5fa`).
- Couleurs de catégorie (accent) et fonds pâles en clair :
  - tétée `#D66B8F` / `#FDF0F4` ;
  - sommeil `#7C6BA4` / `#F5F3F8` ;
  - promenade `#8BC46B` / `#F3F9EF` ;
  - repas `#E8785A` / `#FEF5F3` ;
  - couches `#5BA4A4` / `#F0F7F7`.
- Composants de référence dans le repo :
  - `components/suivibaby/dashboard/PromenadeWidget.tsx`
  - `components/suivibaby/dashboard/SleepWidget.tsx`
  - `components/suivibaby/dashboard/NursingInProgressBanner.tsx`
  - `components/suivibaby/dashboard/StatsGroup.tsx`

## Contraintes techniques réelles (Android, Jetpack Glance via expo-widgets)

Le widget est **une fonction de rendu**, sans état ni animation. Elle est redessinée à chaque envoi de l'app (changement de données) et quand la taille change.

**Briques disponibles, et rien d'autre**
- `Column`, `Row` (alignement vertical/horizontal : start, center, end), `Box` (contenu aligné).
- `Text` : couleur, taille (sp), graisse normal/bold, `maxLines`.
- `Spacer` à taille fixe. `Image` à partir d'une ressource drawable de l'app (vecteurs possibles, à ajouter).
- `LinearProgressIndicator` et `CircularProgressIndicator` (valeur 0..1, couleur).
- Modificateurs : `background(couleur)`, `cornerRadius(dp)`, `padding`, `size`, `width`, `height`, `fillMaxWidth/Height/Size`.

**Pas disponible**
- Pas de poids (`weight`), donc pas de « pousser à droite ». Mais **la taille exacte du widget en dp est connue** au rendu : on peut calculer les largeurs.
- Pas de bordure, pas d'ombre, pas de dégradé, pas de police personnalisée.

**Nouveau, ajouté par nous : un nœud `Chronometer`**
- Un vrai chrono Android qui **défile seul**, même app fermée.
- Paramètres : heure de début, éventuelle pause (chrono figé), couleur, taille, gras.
- Format `MM:SS`, puis `H:MM:SS` après une heure.

**Tailles à couvrir**
- 2×2 : environ 150 × 150 dp.
- 4×2 : environ 330–420 × 150–225 dp. C'est la taille principale.
- Le widget est redimensionnable.

## Données disponibles au rendu

Voir `utils/widgetSnapshot.ts`, type `NowWidgetProps`.

- `childName`.
- `live` : session en cours ou null.
  - `kind` : nursing, sleep ou walk.
  - `timerStartMs`, `pausedAtMs`.
  - `side` (G/D) et `otherSideLabel` (« D 4:10 »).
  - `sinceLabel` (« depuis 14:32 »).
  - `alsoKind` : seconde session en cours.
- **Évolution prévue** : `live` deviendra une liste `lives` (0 à 3 sessions, mêmes champs), pour afficher toutes les sessions. Conçois pour cette liste.
- `lastMealMs` et `lastMealLabel` (« Tétée à 11:50 ») ; `nextSide` (prochain sein, seulement s'il est certain).
- `day` :
  - `mealsCount`, `bottleMl`, `lastMealMs` ;
  - `diapersCount`, `lastDiaperMs` ;
  - `sleepMinutes`.
- `alerts` : `mealAtMs`, `diaperAtMs` (heure de passage au rouge).

## Ce qu'on attend de toi

Une proposition de design **implémentable avec ces briques**, écrite dans le fichier indiqué par ton prompt. Elle contient :

1. **Principe** en 3 lignes : hiérarchie et ce qu'on lit en premier.
2. **Maquettes ASCII** précises, en dp, pour chaque cas :
   - 4×2 au repos ;
   - 4×2 avec une session en cours (promenade) ;
   - 4×2 avec **deux sessions en même temps** (promenade + sommeil), puis trois ;
   - 4×2 avec tétée en cours (sein actif et autre sein) ;
   - 4×2 avec un rappel dépassé ;
   - 2×2 au repos et en cours.
3. **Spécification exacte** :
   - tailles de texte (sp) et graisses ;
   - couleurs, en clair **et** en sombre ;
   - marges, espacements, rayons ;
   - libellés français exacts.
4. **Ce que tu retires** de la version actuelle, et pourquoi.
5. **Accessibilité** : contrastes (vise WCAG AA), lisibilité de nuit, sens jamais porté par la couleur seule.

Reste sobre : un parent doit comprendre le widget en une seconde.
