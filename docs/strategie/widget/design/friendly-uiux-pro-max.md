# Réponse au brief « friendly » : angle design visuel et UX

Auteur : designer mobile, cadré par le skill ui-ux-pro-max (règles « No Emoji as Structural Icons », « Color Only », « Icon Contrast 3:1 », « Contextual Semantics », « Filled vs Outline Discipline »). Lus : `BRIEF_FRIENDLY.md`, `proposition-*.md`, `widgets/BebeMaintenant.android.tsx`, `constants/dashboardConfig.ts` (`EVENT_CONFIG`), `components/moments/HeroMoodCard.tsx`, `VerticalMoodTimeline.tsx` et `components/forms/MilestonesForm.tsx`.

---

## 1. Verdicts

1. **Icônes à la place du texte** : **oui, à condition** que l'icône **remplace la pastille de couleur et pas le mot**. On garde un libellé court à côté (« Biberon 100 ml », « Pipi »). Pas d'icône seule dans les résumés.
2. **Emoji d'humeur à côté du prénom** : **non**. On garde la règle « pas d'emoji ». L'humeur va dans le **Fil du jour**, comme un événement **horodaté**, avec une icône dessinée monochrome et son mot (« 10:20 · Content »).
3. **Plus « friendly »** : **oui**. On ajoute de la chaleur avec les **icônes de l'app** colorées par catégorie, des tuiles plus douces et des formulations au présent, sans ajouter de couleur ni de texte à la première lecture.

---

## 2. Pourquoi

### 2.1 Icônes

- **Ce qu'on y gagne** : aujourd'hui, les pastilles de 8 dp distinguent les catégories **seulement par la couleur** (`dot()` l. 117). Le repas `#E8785A` et la tétée `#D66B8F` sont deux teintes chaudes proches, que l'on confond la nuit et en cas de deutéranopie. C'est la règle « Color Only » (WCAG 1.4.1). Une forme différente par catégorie corrige ce défaut **sans prendre de place de plus** : une icône de 14 dp remplace une pastille de 8 dp et son espace de 6 dp.
- **La place gagnée est faible**. Dans le Fil du jour, « Couche · pipi » devient « Pipi », ce qui libère environ 40 dp. Cela permet d'afficher le volume ou le côté de la tétée. Il ne faut **pas** supprimer le mot : pipi, selle et mixte, ou biberon, tétée et solide, sont des distinctions fines qu'un parent fatigué ne lit pas de façon sûre sur un glyphe de 14 dp. La pratique d'iOS et de Material est de mettre une icône **avec** un libellé dès que le sens n'est pas universel (Apple HIG, *SF Symbols* et *Icons* ; Material 3, *Icons* : non vérifié pour la formulation exacte).
- **Cohérence avec l'app** : l'app utilise déjà ces glyphes partout (`EVENT_CONFIG`, `QUICK_ADD_ACTIONS`, `mealsConfig`, `diapersConfig`). Le parent les reconnaît donc sans apprentissage : c'est le vrai gain de « compréhension sans lire ».
- **Accessibilité** : une icône placée à côté d'un mot est décorative, donc sans description TalkBack. Le `contentDescription` racine existant (l. 395) suffit. Le contraste minimal d'une icône porteuse de sens est de **3:1** (WCAG 1.4.11). Les couleurs de catégorie brutes ne l'atteignent pas en clair (repas 2,89, couches 2,88, promenade 2,06 sur blanc). Il faut donc colorer les icônes avec les **teintes « texte »** déjà validées dans `CAT.*.text` (voir la section 4).

### 2.2 Humeur

- **Dans l'app**, l'humeur est rendue en emoji (😢 😐 🙂 😄 🥰) **toujours accompagnés d'un mot** (« Difficile », « Content »…) et d'une heure (`VerticalMoodTimeline`). L'emoji y est un contenu expressif posé sur une grande carte, pas une icône d'interface.
- **Dans le widget, l'emoji casse la hiérarchie.** Un 🥰 ou un 😢 à 14 sp est l'élément **le plus saturé et le plus lumineux** de la surface (jaune sur `#1f2937`). La nuit, l'œil va donc d'abord vers l'humeur, alors que la règle produit veut qu'on lise d'abord le temps et les sessions en cours. Son rendu dépend aussi du constructeur (Samsung, Google, Xiaomi), et on ne peut ni le teinter ni l'atténuer en mode sombre (règle pro-rules « No Emoji as Structural Icons » : *font-dependent, cannot be controlled via design tokens*).
- **À côté du prénom, une humeur passée se lit comme actuelle.** Une valeur saisie à 8 h et encore visible à 23 h ment, et « Difficile » affiché en permanence sur l'écran d'accueil culpabilise le parent et se voit par-dessus son épaule. Dans le **Fil du jour**, l'heure à gauche date l'information, et elle descend naturellement dans la liste quand d'autres événements arrivent. Le problème de l'humeur ancienne est réglé sans aucune règle d'expiration.
- **Icône dessinée plutôt qu'emoji** : les cinq visages FontAwesome 6 Free existent dans le projet (`face-sad-tear`, `face-meh`, `face-smile`, `face-laugh-beam`, `face-grin-hearts`, vérifiés dans `FontAwesome6Free.json`). Ils sont monochromes, de la même famille que les autres icônes, et se teintent en `C.soft`. Ils ne sont **pas colorés par niveau** : pas de rouge pour « Difficile », pour éviter l'effet alarme et la culpabilité.

### 2.3 « Friendly »

Pour que le widget paraisse rassurant, il doit montrer ce qui se passe (des icônes connues, l'heure en clair) et faire disparaître l'urgence quand il n'y en a pas. Ajouter des décorations n'y aide pas. Concrètement :

- les **icônes de l'app** prennent la place des points, ce qui fait le principal gain de chaleur ;
- au repos, le titre « Dernier repas » est précédé de l'icône du type de repas (biberon, sein ou bol). La donnée est la même, mais elle est plus parlante ;
- les rayons des tuiles en cours sont harmonisés à 16 dp (12 dp aujourd'hui pour 2 ou 3 sessions). Les angles plus ronds se lisent comme plus doux (non vérifié : effet rapporté dans la littérature sur les formes arrondies, pas de mesure propre aux widgets) ;
- la formulation « Pas encore de repas aujourd'hui » est conservée : elle est déjà neutre et ne fait pas de reproche ;
- **à ne pas faire** : mascotte, dégradé (impossible de toute façon), message de bienvenue, ou couleur supplémentaire sur la pastille du prénom.

---

## 3. Maquettes ASCII (4×2, W = 420 dp, H = 222 dp, valeurs par défaut du code)

`PAD 14 · HEAD_H 26 · zoneH 162 · zoneW 226 · SEP 25 · Rw 141`. Légende : `[bib]` correspond à l'icône `baby-bottle` en 14 dp, `▓` à la tuile teintée, `⏱` au chrono natif.

### 3.1 Au repos

```
┌────────────────────────────────────────────────────────────────────┐ r 20
│ ( Samaye )                              │ Aujourd'hui              │ 26
│                                         │                          │ 6
│                                         │ [bol]  3 repas           │ 40
│ [bib] Dernier repas            13 sp    │        15:45 · 100 ml    │
│ 15:45                          36 sp b  │ [goutte] 3 couches       │ 40
│ Biberon · il y a ⏱59 min       13 sp    │        dernière 15:32    │
│ Prochain sein : droit          13 sp b  │ [lune] 9h12              │ 40
│                                         │        de sommeil        │
│                                         │ Fil du jour     12 sp    │ 26
│                                         │ [bol]  15:45 Solide      │ 24
│                                         │ [smile] 14:10 Content    │ 24
│                                         │ [goutte] 11:57 Pipi      │ 24 ↕
└────────────────────────────────────────────────────────────────────┘
 |<------------ 226 sans fond ---------->|25|<-------- 141 --------->|
```

### 3.2 Une session en cours

```
┌────────────────────────────────────────────────────────────────────┐
│ ( Samaye )                              │ Aujourd'hui              │
│ ┌▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓┐  │ [bol]  3 repas           │
│ ▓ [lit] Sieste · depuis 13:14  13 b  ▓  │        15:45 · 100 ml    │
│ ▓                                    ▓  │ [goutte] 3 couches       │
│ ▓ ⏱1h59                       36 sp  ▓  │        dernière 15:32    │
│ ▓                                    ▓  │ [lune] 9h12 de sommeil   │
│ └▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓┘  │ Fil du jour              │
│   226 × 162, r 16, padding 12           │ [bib]  11:57 Bib. 100 ml │
└────────────────────────────────────────────────────────────────────┘
```

Avec 2 sessions, chaque tuile mesure 226 × 78 (r 16) et l'icône passe devant le titre. Avec 3 sessions, en compact : 226 × 50 avec icône, libellé et chrono. En 2×2, la bande du bas affiche icône et nombre (`[bol] 3 · [goutte] 3 · [lune] 9h12`). Dans ce cas, et seulement là, l'icône est presque seule : elle reçoit donc une description TalkBack, ce que fait déjà le `contentDescription` racine.

---

## 4. Spécification

| Usage | Icône (source) | Taille | Libellé gardé |
|---|---|---|---|
| Tétée | `person-breastfeeding` (FA6 Free) | 14 dp (16 dp dans une tuile) | « Tétée · gauche » |
| Biberon | `baby-bottle` (MaterialCommunityIcons) | 14 dp | « Bib. 100 ml » |
| Solide | `bowl-food` (FA6) | 14 dp | « Solide » |
| Pipi | `droplet` (FA6, comme dans `QUICK_ADD`) | 14 dp | « Pipi » |
| Selle / mixte | `poop` (FA6) | 14 dp | « Selle » / « Pipi + selle » |
| Sommeil (sieste / nuit) | `bed` / `moon` (FA6, comme `SleepWidget`) | 14 / 16 dp | « Sieste », « Nuit » |
| Promenade | `person-walking` (FA6, comme `PromenadeWidget`) | 14 / 16 dp | « Promenade » |
| Humeur 1→5 | `face-sad-tear`, `face-meh`, `face-smile`, `face-laugh-beam`, `face-grin-hearts` (FA6) | 14 dp | « Difficile », « Mitigé », « OK », « Content », « Rayonnant » |

Pour les résumés de droite : repas = `bowl-food`, couches = `droplet`, sommeil = `moon`. On utilise un seul style, **plein (solid)**, pour toutes les icônes (règle « Filled vs Outline Discipline »). L'espace entre l'icône et le texte est de 6 dp, et l'icône est centrée verticalement sur la ligne.

**Couleurs des icônes** (contraste calculé avec la formule WCAG) :

| Catégorie | Sombre, sur `#1f2937` | Clair, sur `#ffffff` |
|---|---|---|
| Tétée | `#E88FAE` 6,27:1 | `#A63D62` 6,06:1 |
| Sommeil | `#A898D0` 5,64:1 (le `#7C6BA4` brut ne fait que 3,14) | `#5B4A85` 7,60:1 |
| Promenade | `#8BC46B` 7,13:1 | `#3F7A2A` 5,21:1 |
| Repas | `#E8785A` 5,08:1 | `#A83F23` 6,18:1 |
| Couches | `#5BA4A4` 5,10:1 | `#2B6A6A` 6,23:1 |
| Humeur (neutre) | `#9ca3af` 5,78:1 | `#6b7280` 4,83:1 |
| Rappel dépassé | `C.alert`, l'icône vire au rouge **et** le mot « rappel » reste affiché | idem |

Dans les tuiles en cours, on garde les couleurs `text` : `#E88FAE` sur `#393243` donne 5,24:1, `#A898D0` sur `#2c3246` donne 4,88:1. Toutes les valeurs dépassent 3:1 (seuil pour les icônes) et 4,5:1 (seuil pour le texte).

---

## 5. Coût

- **JS seul**, sans recompilation : libellés raccourcis (« Pipi », « Bib. 100 ml »), humeur ajoutée au flux `recent` (nouveau `kind: "mood"` dans `utils/widgetSnapshot.ts` et `services/widgetSync.ts`), rayons des tuiles harmonisés à 16 dp, choix des couleurs. Une **version transitoire** est possible en gardant les pastilles et en ajoutant seulement le mot.
- **Recompilation Android** (environ 2 à 3 min, puis nouveau build) : environ 12 vector drawables (`ic_widget_*.xml`) convertis depuis les SVG FA6 et MDI, ajoutés par un config plugin (`android/` est régénéré par prebuild : ne pas les poser à la main). La teinte se fait via `ColorFilter.tint` dans Glance. Il faut vérifier que le binding `Image` d'`@expo/ui/jetpack-compose` accepte une ressource et une teinte (non vérifié ; sinon, prévoir un ajout au patch `expo-widgets`). **Licence** : les icônes FA6 Free sont sous CC BY 4.0 et doivent être mentionnées dans les crédits de l'app (MDI : Apache 2.0).
- **iOS** : pas de drawables. On utilise les SF Symbols équivalents : `drop.fill`, `moon.fill`, `bed.double.fill`, `figure.walk`, `fork.knife`, et pour l'humeur `face.smiling` et `face.dashed`. Il n'existe pas d'équivalent exact pour l'allaitement ni pour le biberon : soit on importe ces deux glyphes en *custom symbol* dans l'asset catalog de l'extension (recompilation EAS), soit on garde la pastille et le mot pour ces deux-là (non vérifié : liste des symboles disponibles selon la version d'iOS ciblée).
