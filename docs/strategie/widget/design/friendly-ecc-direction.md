# Réponse au brief « friendly » : direction artistique et personnalité de marque

Angle : direction artistique (ECC `frontend-design-direction`, puis `make-interfaces-feel-better`).
Sources lues : `BRIEF_FRIENDLY.md`, `widgets/BebeMaintenant.android.tsx`, `components/suivibaby/dashboard/` (StatsGroup, RecentEventsList, SleepWidget, NursingInProgressBanner), `constants/dashboardConfig.ts`, `components/moments/HeroMoodCard.tsx`, `WeekMoodOverview.tsx`, `components/forms/MilestonesForm.tsx`, `proposition-ecc-direction.md`.

**Direction en une phrase : « la veilleuse ».** Une lumière douce qu'on regarde la nuit. Elle dit tout de suite si quelque chose se passe, elle ne réveille pas et elle ne parle pas plus que nécessaire. La chaleur vient du **prénom**, de **l'humeur que le foyer a notée** et des **pictos de l'app**. Elle ne vient pas de mots doux, de couleurs vives ni d'emojis décoratifs.

---

## 1. Verdicts

1. **Icônes à la place du texte : non. Icônes à la place des pastilles de couleur : oui.** Le picto de catégorie prend la place du rond de 8 dp, le mot reste. On ne gagne pas de place, on gagne du sens : la forme s'ajoute à la couleur.
2. **Humeur à côté du prénom : oui, si elle est fraîche** (notée aujourd'hui, il y a moins de 4 h). On l'affiche en emoji, parce que c'est le vocabulaire que l'app montre déjà au parent. La règle « pas d'emoji » reste en vigueur partout ailleurs, cette exception est écrite noir sur blanc. Une humeur ancienne ne s'affiche pas.
3. **Plus friendly : oui, en soustrayant.** Le prénom parle en premier, les libellés sont plus humains, on garde un seul rayon et une grille de 4 dp, et les états vides n'ont pas l'air de reproches. Pas de message rassurant inventé : ce qui rassure, c'est un widget qui ne crie jamais à tort.

---

## 2. Pourquoi

### 2.1 Ce qui rend chaleureux sans être enfantin

| Chaleureux (on garde ou on ajoute) | Enfantin ou bruyant (on écarte) |
| --- | --- |
| Le prénom en premier, dans la pastille de marque | Mascotte, nuages, étoiles, « bébé » au lieu du prénom |
| Les couleurs de catégorie de l'app, en teintes douces sur les tuiles | Fonds saturés, arcs-en-ciel, une couleur par ligne |
| Les pictos de l'app (FA6 `person-breastfeeding`, `bed`, `poop`…) | Pictos « cartoon » propres au widget, différents de l'app |
| L'humeur que le foyer a lui-même notée | Emojis d'ambiance (🌟, 🌤️) qui ne portent aucune donnée |
| Un ton de constat (« il y a 59 min ») | Points d'exclamation, « Bravo ! », « dodo », « miam » |
| Le rouge réservé au rappel dépassé, toujours avec le mot « rappel » | Une alerte dès qu'un compteur paraît « bas » |

Les preuves derrière ce tableau :
- **Cohérence avec l'app.** L'Accueil utilise déjà ces pictos à côté des libellés (`constants/dashboardConfig.ts` l. 323-414, `RecentEventsList.tsx` l. 105-120). Material demande qu'un widget prolonge l'identité de l'app plutôt qu'il n'en invente une autre (Android Developers, *Widget design guidelines*, partie « Consistency with app », non vérifié dans sa version actuelle).
- **Lecture la nuit.** Les teintes douces des tuiles (`#393243`, `#2c3246`…) éclairent moins qu'un aplat vif. Ce qui pèse le plus, c'est la luminance des grandes surfaces (Apple HIG, *Dark Mode* : éviter les grands aplats lumineux, non vérifié mot pour mot).
- **Le registre de l'app.** Dans `HeroMoodCard`, l'humeur basse est formulée « a besoin de câlins », l'humeur moyenne « est un peu grognon ». La marque parle de l'enfant avec tendresse, sans jamais juger le parent. Le widget doit garder ce registre, en moins de mots.

### 2.2 Icônes et texte

- **Ce qu'on gagne.** Aujourd'hui, la pastille ne code qu'une couleur, et deux catégories (repas, couches) suffisent à épuiser ce qu'un œil fatigué distingue. Un picto ajoute la forme : un biberon, une goutte et un bol se reconnaissent sans lire. WCAG 1.4.1 (*Use of Color*) interdit de faire porter le sens à la couleur seule. La pastille actuelle n'est tolérée que parce que le mot est à côté.
- **Pourquoi on garde le mot.** Pipi (`droplet`) et lait maternel (`droplet` aussi dans `dashboardConfig.ts` l. 131) partagent le même picto dans l'app. Seul le mot les distingue. Les études sur l'utilisabilité des icônes concordent : sans libellé, en dehors d'une poignée d'icônes universelles, on les reconnaît mal (Nielsen Norman Group, *Icon Usability*, 2014, non vérifié sur les chiffres). TalkBack lit de toute façon le `contentDescription` global, pas les icônes.
- **Pas de gain de place.** Un picto de 12 dp et 6 dp d'espace prennent la place d'un rond de 8 dp et 6 dp, plus 4 dp. Compter sur les icônes pour faire tenir plus de lignes serait une erreur : le mot reste.
- **Les résumés** (« 3 repas », « 3 couches », « 9h12 de sommeil ») : même règle, le picto remplace la pastille.

### 2.3 L'humeur à côté du prénom

- **Ce qu'on gagne en personnalité.** C'est la seule donnée du widget qui parle de l'enfant et pas des tâches. Elle transforme un tableau de bord en « nouvelles de Samaye ». Le partenaire qui n'a pas noté l'humeur la découvre d'un coup d'œil.
- **Pourquoi l'emoji et pas un dessin.** L'app fixe l'échelle avec 😢 😐 🙂 😄 🥰 (`HeroMoodCard.tsx` l. 56-87, `MilestonesForm.tsx` l. 138-142). Le parent a touché ce visage pour l'enregistrer : un dessin maison de cinq visages serait un second vocabulaire à apprendre. Le rendu change selon le téléphone (Samsung One UI et Noto n'ont pas le même 🥰), mais le sens de chaque visage reste stable d'une police emoji à l'autre. Ce qui varierait vraiment, c'est l'écart avec l'app, et il n'existe pas puisque l'app passe elle aussi par la police du téléphone.
- **Les risques et leurs garde-fous.**
  - *Humeur périmée prise pour l'humeur actuelle* : on ne l'affiche que si elle a été notée aujourd'hui **et** il y a moins de 4 h. Le seuil est un choix produit, non vérifié par des tests. Au-delà, rien ne s'affiche : pas de « — » et pas de visage gris.
  - *Culpabilité* : un 😢 sur l'écran d'accueil toute la journée pèse. Le seuil de 4 h le limite déjà. Le libellé lu à voix haute reprend la formule de l'app (« a besoin de câlins ») et non « Difficile ».
  - *Emoji décoratif* : la règle « pas d'emoji » tient toujours. Celui-ci est une **donnée saisie**, pas un ornement. L'exception s'écrit ainsi : « un seul emoji, celui de l'humeur notée par le foyer, jamais un autre ».
- **Où le placer.** Hors de la pastille, 6 dp à droite, en 14 sp. Dans la pastille, il en fausserait le centrage optique et en ferait un badge.

### 2.4 Micro-détails (ce que le code fait aujourd'hui)

| Principe | Aujourd'hui | Proposé |
| --- | --- | --- |
| Un seul rayon par niveau | Widget 20, tuile seule 16, tuiles en ligne 12, pastille 13 | Widget 20, **toutes les tuiles 12** (20 − 8 de retrait optique, la marge de 14 étant trop large pour la formule stricte), pastille en demi-hauteur |
| Rythme | Espaces de 2, 4, 5, 6, 8, 12, 14, 25 dp | Grille de 4 : 4, 8, 12, 16. On garde 2 dp seulement entre un chiffre et sa légende. `SEP` 25 passe à 24 |
| Chiffres | Roboto, chiffres tabulaires par défaut | Inchangé : c'est ce qui garde les chronos immobiles |
| Hiérarchie | Le titre de tuile en 13 sp gras, comme la valeur des résumés | Le titre de tuile passe en 13 sp **medium** (`fontWeight: "500"`), seul le chrono reste en gras : un seul point fort par zone |
| Ton des libellés | « Pas encore de repas aujourd'hui » | « Aucun repas noté aujourd'hui » : un constat sur la saisie, pas un jugement sur le repas |
| État vide de la journée | Colonne vide si aucun événement | « Rien de noté pour l'instant », 12 sp, couleur douce (même formule que l'Accueil, `RecentEventsList.tsx` l. 253) |
| Titre du fil | « Fil du jour » | « Plus tôt ». Il dit ce que l'on voit, du plus récent au plus ancien, sans jargon |
| Messages rassurants | Aucun | Toujours aucun. Pas de « Tout va bien » : le widget n'en sait rien. Ce qui rassure, c'est que le rouge n'apparaît **que** pour un rappel dépassé |

---

## 3. Maquettes ASCII (4×2, 356 × 198 dp, `PAD` 14 → 328 × 170)

`[◐]` = picto de 14 dp (12 dp dans le fil), `🙂` = emoji d'humeur 14 sp, `▸` = chrono natif.

### 3.1 Au repos, humeur fraîche

```
┌──────────────────────────────────────────────────────────┐ r 20
│ ╭─────────╮                                              │
│ │ Samaye  │ 🙂                        Aujourd'hui        │ 26  pastille 14sp bold · emoji 14sp · 12sp doux
│ ╰─────────╯                                              │
│                                                          │  8
│ [◐] Dernier repas             │ [◐] 3 repas              │ ┐
│ 15:45                         │     dernier 15:45        │ │  repas : picto 14dp + 13sp medium
│ Biberon · il y a ▸59 min      │ [◐] 3 couches            │ │  heure 36sp bold
│ Prochain sein : droit         │     dernière 15:32       │ │ 136
│                               │ [◐] 9h12                 │ │
│                               │     de sommeil           │ │
│                               │ Plus tôt                 │ │
│                               │ [◐] 15:45 Repas solide   │ ┘  fil : picto 12dp, 12sp
└──────────────────────────────────────────────────────────┘
 ←──── zoneW 184 ─────→←12→1←12→←──── Rw 118 ────→
```

### 3.2 Une session en cours, humeur absente ou périmée

```
┌──────────────────────────────────────────────────────────┐ r 20
│ ╭─────────╮                                              │
│ │ Samaye  │                           Aujourd'hui        │ 26  rien après la pastille
│ ╰─────────╯                                              │
│                                                          │  8
│ ╭───────────────────────────╮ │ [◐] 3 repas              │ ┐
│ │ [☾] Sieste · depuis 13:14 │ │     dernier 15:45        │ │  tuile teinte sommeil, r 12, padding 12
│ │                           │ │ [◐] 3 couches            │ │  titre 13sp medium, couleur catégorie
│ │ ▸1h59                     │ │     dernière 15:32       │ │ 136  chrono 36sp bold, texte fort
│ │                           │ │ Plus tôt                 │ │
│ ╰───────────────────────────╯ │ [◐] 15:45 Repas solide   │ ┘
└──────────────────────────────────────────────────────────┘
```

Avec deux ou trois sessions, la tuile seule cède la place aux tuiles empilées actuelles (`rowTile` et `compactTile`), avec le même rayon de 12 et le picto à la place du rond.

---

## 4. Spécification

### 4.1 Pictos (les mêmes que l'app)

| Usage | Picto | Source | Taille |
| --- | --- | --- | --- |
| Tétée | `person-breastfeeding` | Font Awesome 6 Free (solid) | 14 dp en tuile ou en résumé, 12 dp dans le fil |
| Biberon | `baby-bottle` | Material Design Icons | idem |
| Solide | `bowl-food` | Font Awesome 6 Free | idem |
| Repas (résumé, dernier repas) | `utensils` | Font Awesome 6 Free | idem |
| Couche · pipi | `droplet` | Font Awesome 6 Free | idem |
| Couche · selle | `poop` | Font Awesome 6 Free | idem |
| Sommeil (sieste ou nuit) | `bed` (l'app l'utilise) ; `moon` pour la nuit si on veut les distinguer | Font Awesome 6 Free | idem |
| Promenade | celui de l'app (à relever dans `dashboardConfig.ts`) | — | idem |

On exporte en vecteurs Android (`res/drawable/wg_*.xml`). Font Awesome Free est sous CC BY 4.0 pour les icônes, MDI sous Apache 2.0 : à mentionner dans les licences de l'app (non vérifié pour les versions exactes). Les emojis (😢 … 🥰) restent du `Text`.

### 4.2 Couleurs des pictos (contraste non textuel ≥ 3:1, WCAG 1.4.11, calculé)

| Catégorie | Sombre sur `#1f2937` | Clair sur `#ffffff` |
| --- | --- | --- |
| Tétée | `#E88FAE` 6,27 | `#A63D62` 6,06 |
| Sommeil | `#A898D0` 5,64 | `#5B4A85` 7,60 |
| Promenade | `#8BC46B` 7,13 | `#3F7A2A` 5,21 |
| Repas | `#E8785A` 5,08 | `#A83F23` 6,18 |
| Couches | `#5BA4A4` 5,10 | `#2B6A6A` 6,23 |
| Rappel dépassé | `#f87171` | `#b91c1c` |

On prend les couleurs `text` de `CAT` déjà vérifiées, **pas** les couleurs `dot`. En clair, `#8BC46B` (2,06), `#E8785A` (2,89) et `#5BA4A4` (2,88) passent sous 3:1. Pastille du prénom : 8,10 en sombre, 6,07 en clair, inchangée.

### 4.3 Libellés

- Humeur lue par TalkBack : « Samaye va bien, noté à 14:10 », avec les formules de `HeroMoodCard` (`a besoin de câlins`, `est un peu grognon`, `va bien`, `est de bonne humeur`, `rayonne de bonheur`).
- « Aucun repas noté aujourd'hui », « Rien de noté pour l'instant », « Plus tôt ».
- Interdits : points d'exclamation, « bébé » à la place du prénom, diminutifs, toute incitation à payer, tout auteur sur une tétée.

---

## 5. Coût

| Changement | JS seul (envoi du widget) | Recompilation Android (drawables) | iOS |
| --- | --- | --- | --- |
| Humeur (emoji + seuil de 4 h) | Oui : ajouter `mood` et `moodAtMs` au snapshot (`utils/widgetSnapshot.ts`), rendu en `Text` | Non | Oui, en `Text` aussi, même règle |
| Libellés, état vide, « Plus tôt », poids medium | Oui | Non | À reporter dans la version SwiftUI |
| Rayon unique à 12, grille de 4 | Oui | Non | À reporter |
| Pictos à la place des pastilles | Le sous-type de chaque événement du fil (biberon, solide, pipi, selle) doit entrer dans le snapshot : aujourd'hui `recent[].kind` ne distingue que repas et couche | Oui : environ 9 vecteurs, recompilation de 2-3 min. Teinter une `Image` Glance (`ColorFilter`) via `@expo/ui` : **non vérifié**. Sinon, deux jeux de drawables (`drawable` et `drawable-night`) | Les SF Symbols ne reprennent pas les pictos de l'app : prendre `drop.fill`, `moon.zzz.fill`, `fork.knife`… ou exporter les mêmes vecteurs en assets. Choix à trancher |

Ordre conseillé : d'abord le texte, les rayons et l'humeur (JS seul, livrable sans build natif), puis les pictos lors du prochain build natif.
