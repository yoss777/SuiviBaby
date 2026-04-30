# Stats Screen Enhancement Plan

> **Prompt original (contexte du role):**
> "Tu es un senior UX ayant 15 ans de succes dans des grandes boites de comm, le digital et LOREAL.
> Analyse stats.tsx et dresse un plan d'action pour ne pas perdre le contexte.
> Je veux enrichir le graph des repas solides (les differents solides etc...), et inclure aussi le sommeil (jour/semaine, qualite, etc.).
> On remplacera les textes Repas et Pompages par les icones correspondantes dans l'application, et on ajoutera l'icone pour le sommeil, ca fera donc 3 (voir creer au besoin le fichier SommeilChart).
> Pour le cas du sommeil, je veux savoir quels sont les moments/lieux ou bebe dort le mieux.
> Fais des propositions complementaires que tu jugerais pertinentes.
> A la fin des actions on devra analyser pour s'assurer que c'est prod ready en utilisant la matrice docs/UX_IMPROVEMENTS_MATRIX.md."

---

## Analyse de l'existant

**Fichier** : `app/(drawer)/baby/(tabs)/stats.tsx` (543 LOC)
- 2 onglets texte : "Repas" / "Pompages" avec underline animee
- `RepasChart` : tetees + biberons + solides (stacked bars, Skia), filtre type, vue semaine
- `PompagesChart` : pompages gauche/droite (line + bar, Skia), vue jour/semaine
- Pas de sommeil
- Solides affiches en agrege (count orange) sans detail par typeSolide

**Modele de donnees sommeil** (`SommeilEvent`) :
- `heureDebut`, `heureFin`, `duree` (minutes)
- `location` : "lit" | "cododo" | "poussette" | "voiture" | "autre"
- `quality` : "paisible" | "agite" | "mauvais"
- `isNap` : boolean (sieste vs nuit)
- Listener dispo : `ecouterSommeilsHybrid`

**Modele de donnees solides** (`SolideEvent`) :
- `typeSolide` : "puree" | "compote" | "cereales" | "yaourt" | "morceaux" | "autre"
- `momentRepas` : "petit_dejeuner" | "dejeuner" | "gouter" | "diner" | "collation"
- `quantite` : "peu" | "moyen" | "beaucoup"
- `nouveauAliment`, `nomNouvelAliment`, `allergenes[]`, `reaction`, `aime`

**Icones existantes** (dashboardConfig.ts / FontAwesome6) :
- Repas : `utensils` (ou `bowl-food` pour solides, `baby-bottle` MCI pour biberons, `person-breastfeeding` pour tetees)
- Pompages : `pump-medical`
- Sommeil : `bed`

**Chart library** : `@shopify/react-native-skia` + `react-native-gesture-handler` + `react-native-reanimated`

**Couleurs chart** (`dashboardColors.ts`) :
- sommeil category : purple (#7C6BA4), sieste (#7C6BA4), nuit (#5A6BA4)
- Pas encore de palette `chartColors.sommeil` — a creer

---

## Plan d'action

### Phase 1 — Refonte de la navigation par onglets (icones)

- [ ] **1.1** Remplacer les 2 onglets texte ("Repas" / "Pompages") par 3 onglets icones
  - Icone Repas : `utensils` (FA6) — regroupe tetees + biberons + solides
  - Icone Pompages : `pump-medical` (FA6)
  - Icone Sommeil : `bed` (FA6)
  - Taille icone : 22px, couleur active = `Colors[colorScheme].tint`, inactive = `nc.textMuted`
  - Label court sous l'icone (10px, optionnel) : "Repas", "Pompages", "Sommeil"
  - Ajuster `underlineX` animation pour 3 positions (0, tabWidth, tabWidth*2)
  - Type `selectedTab` : `"tetees" | "pompages" | "sommeil"`

- [ ] **1.2** Gerer le parametre URL `tab=sommeil` dans `useLocalSearchParams`
  - Ajouter le cas `rawTab === "sommeil"` dans le `useEffect` initial

- [ ] **1.3** Ajouter les etats de chargement pour le sommeil
  - `sommeilLoaded`, `sommeilEmptyDelayDone` (meme pattern que tetees/pompages)
  - `isSommeilLoading` derive

### Phase 2 — Enrichissement du graphique Solides dans RepasChart

- [ ] **2.1** Sous-filtre solides par `typeSolide` dans RepasChart
  - Quand `typeFilter === "solides"`, afficher un sous-filtre chips : Tout | Purees | Compotes | Cereales | Yaourts | Morceaux
  - Chaque typeSolide a sa propre couleur (palette orange degrade) :
    - puree: #E89A5A
    - compote: #E8785A
    - cereales: #D4A574
    - yaourt: #F5C6A0
    - morceaux: #C97B3A
    - autre: #BFA88C

- [ ] **2.2** Stacked bars par typeSolide en vue solides
  - Chaque barre journaliere empilee par type de solide
  - Tooltip enrichi : nombre par type + ingredients si dispo

- [ ] **2.3** Metriques solides enrichies
  - "Nouveaux aliments cette semaine" (count `nouveauAliment === true`)
  - "Aliment prefere" (le `typeSolide` le plus frequent)
  - "Reactions" : badge warning si `reaction !== "aucune"` cette semaine
  - Distribution par `momentRepas` (petit bar horizontal ou donut)

- [ ] **2.4** Vue introduction alimentaire (timeline)
  - Mini-timeline des `nomNouvelAliment` avec icone coeur (aime) ou alerte (reaction)
  - Utile pour le suivi diversification alimentaire (forte valeur UX parentale)

### Phase 3 — Creation du SommeilChart

- [ ] **3.1** Creer `components/suivibaby/SommeilChart.tsx`
  - Props : `{ sommeils: SommeilEvent[], colorScheme, screenWidth }`
  - Meme architecture que RepasChart/PompagesChart (Skia, gestures, tooltips)

- [ ] **3.2** Palette couleurs sommeil dans `dashboardColors.ts`
  - Ajouter `chartColors.sommeil` :
    - surface, ink, muted, border (light/dark)
    - purple: #7C6BA4 (principal)
    - purpleDeep: #5A4D7A
    - lavender: #B8A9D4 (siestes)
    - navy: #5A6BA4 (nuits)
    - quality.paisible: #7EE0A8 (vert)
    - quality.agite: #F0C674 (jaune)
    - quality.mauvais: #E07E7E (rouge)

- [ ] **3.3** Vue hebdomadaire — Stacked bars jour/nuit
  - Axe X : 7 jours (Lun-Dim)
  - Axe Y : heures de sommeil
  - Barre empilee : nuit (navy) + siestes (lavender)
  - Tooltip : total heures, nb siestes, duree nuit
  - Ligne de reference : recommandation OMS par age (affichee en pointille)

- [ ] **3.4** Vue journaliere — Timeline hypnogramme
  - Barre horizontale 0h-24h montrant les plages de sommeil
  - Couleur par qualite (paisible=vert, agite=jaune, mauvais=rouge)
  - Tap sur une plage = tooltip avec duree + location + qualite

- [ ] **3.5** Insights "Ou bebe dort le mieux" (feature cle demandee)
  - **Classement par location** : bar horizontal ou radar chart
    - Pour chaque location (lit, cododo, poussette, voiture, autre) :
      - Duree moyenne
      - Score qualite moyen (paisible=3, agite=2, mauvais=1)
      - Nombre de sessions
    - Tri par score qualite descendant
    - Icone par location : lit=`bed`, cododo=`people-group`, poussette=`baby-carriage`, voiture=`car`, autre=`location-dot`
  - **Classement par moment** :
    - Matin (6h-12h), Apres-midi (12h-18h), Soir (18h-22h), Nuit (22h-6h)
    - Meme metriques (duree moy, qualite moy)
  - **"Meilleur spot"** : card highlight avec le lieu + moment qui donne le meilleur score qualite

- [ ] **3.6** Metriques sommeil
  - Total heures/jour (moyenne semaine)
  - Nombre de siestes/jour (moyenne)
  - Plus longue nuit de la semaine
  - Ratio nuit/sieste
  - Tendance semaine vs semaine precedente (fleche haut/bas + %)

### Phase 4 — Integration dans stats.tsx

- [ ] **4.1** Ajouter le listener sommeil dans stats.tsx
  - `ecouterSommeilsHybrid` (import depuis `eventsHybridService`)
  - `useEffect` avec `setSommeils`, `setSommeilLoaded`
  - Cleanup dans le return

- [ ] **4.2** Ajouter le panel SommeilChart
  - 3eme `<View style={[styles.tabPanel, ...]}>`
  - Meme pattern de loading (IconPulseDots avec couleur sommeil)

- [ ] **4.3** Mettre a jour le refreshControl
  - `refreshTintColor` pour le cas sommeil : `chartColors.sommeil.purple`
  - `isSommeilLoading` dans la condition de fin de refresh

- [ ] **4.4** Gerer le deep link `tab=sommeil` depuis home/chrono/plus
  - Ajouter les liens dans les widgets dashboard qui pointent vers stats avec `tab=sommeil`

### Phase 5 — Propositions complementaires (valeur UX elevee)

- [ ] **5.1** Correlation repas/sommeil (insight cross-data)
  - Mini-card "Dernier repas avant la nuit" : heure du dernier repas vs heure de coucher
  - Objectif : aider les parents a identifier si un repas tardif impacte le sommeil
  - Afficher en bas du SommeilChart comme "insight" optionnel

- [ ] **5.2** Export PDF du rapport hebdomadaire
  - Bouton dans le header menu (HeaderMenu deja present sur 8 ecrans)
  - PDF avec les 3 charts + metriques cles de la semaine
  - Utile pour les rendez-vous pediatriques (forte valeur L'Oreal-like premium UX)

- [ ] **5.3** Comparaison semaine precedente
  - Toggle "vs semaine precedente" sur chaque chart
  - Barres fantomes (opacity 0.3) de la semaine N-1 derriere les barres N
  - Indicateur tendance (hausse/baisse) sur les metriques

- [ ] **5.4** Mode "Resume" (dashboard condense)
  - Vue condensee des 3 categories sur un seul ecran (sans tabs)
  - 3 mini-cards avec sparkline + metrique principale
  - Tap sur une card = bascule vers le tab detail
  - Ideal pour un coup d'oeil rapide (pattern L'Oreal brand dashboard)

- [ ] **5.5** Animations de transition inter-tabs
  - Swipe horizontal natif entre les 3 tabs (PagerView ou Reanimated)
  - Plutot que le fade actuel, un slide gauche/droite plus naturel
  - Dots indicator sous les tabs pour feedback visuel

- [ ] **5.6** Notification intelligente sommeil
  - Si le score qualite baisse sur 3 jours consecutifs, afficher un tip contextuel
  - Ex: "Le sommeil de {prenom} semble agite depuis 3 jours. Essayez de verifier la temperature de la chambre."
  - Pattern "caring AI" tres differenciateur sur le marche

### Phase 6 — Validation prod-ready (Matrice UX)

> Reference : `docs/UX_IMPROVEMENTS_MATRIX.md`
> Le screen stats.tsx (abrv PL) doit satisfaire tous les P-items applicables.

- [ ] **6.1** Audit P-items applicables au nouveau stats.tsx enrichi :

| P-item | Description | Applicable ? | Action |
|--------|------------|-------------|--------|
| P1 | Skeleton shimmer loading | Oui (SommeilChart) | Utiliser IconPulseDots (deja fait pour tetees/pompages) |
| P3 | Enhanced empty state | Oui | Ajouter empty state sommeil ("Pas encore de donnees sommeil") |
| P8b | Haptic feedback | Deja present | Verifier sur le 3eme tab |
| P9b | Pull-to-refresh | Deja present | Etendre au sommeil (refreshKey) |
| P12b | Error boundary | Deja present | Verifier que handleListenerError couvre sommeil |
| P14a | nc.* design tokens | Deja present | Verifier SommeilChart |
| P15a | Accessibility labels | Oui | Ajouter accessibilityLabel sur le 3eme onglet + SommeilChart |
| P15b | Multi-baby switcher | Deja present | Verifier reset sommeil sur changement bebe |
| P16a | Dark mode nc.* tokens | Oui | Verifier palette sommeil light/dark |
| P17a | useMemo optimizations | Oui | Memoiser les donnees sommeil derivees |
| P20 | Race condition guards | Oui | sommeilLoaded flag + cleanup |
| P21 | Theme tokens (no hardcoded) | Oui | Audit 0 couleur hardcodee dans SommeilChart |
| P22 | Realtime auto-refresh | Oui | ecouterSommeilsHybrid (listener temps reel) |

- [ ] **6.2** Mettre a jour la matrice dans `docs/UX_IMPROVEMENTS_MATRIX.md`
  - Ajouter les nouveaux P-items valides pour PL/ST
  - Confirmer 100% de couverture

- [ ] **6.3** Tests de non-regression
  - Verifier que les 2 charts existants (RepasChart, PompagesChart) fonctionnent identiquement
  - Tester le deep link `tab=sommeil`, `tab=biberons`, `tab=pompages`
  - Tester le changement de bebe (reset etats)
  - Tester offline (empty state gracieux)
  - Tester dark mode sur les 3 tabs

---

## Ordre d'execution recommande

```
Phase 1 (tabs icones)          ~2h   — prerequis pour tout le reste
Phase 3.1-3.2 (SommeilChart)   ~4h   — composant + palette
Phase 4 (integration stats)    ~1h   — brancher le tout
Phase 3.3-3.4 (vues chart)     ~4h   — stacked bars + timeline
Phase 3.5-3.6 (insights)       ~3h   — "ou bebe dort le mieux"
Phase 2 (solides enrichis)     ~3h   — sous-filtres + stacked
Phase 5 (complementaires)      ~4h   — prioriser 5.1 et 5.4
Phase 6 (validation)           ~1h   — audit matrice
```

## Fichiers a creer/modifier

| Fichier | Action |
|---------|--------|
| `components/suivibaby/SommeilChart.tsx` | **CREER** — nouveau composant chart |
| `app/(drawer)/baby/(tabs)/stats.tsx` | MODIFIER — 3 tabs, listener sommeil |
| `components/suivibaby/RepasChart.tsx` | MODIFIER — sous-filtre solides, stacked bars typeSolide |
| `constants/dashboardColors.ts` | MODIFIER — ajouter palette `chartColors.sommeil` |
| `docs/UX_IMPROVEMENTS_MATRIX.md` | MODIFIER — valider couverture P-items |

---

## Statut d'implementation

### Phase 1 — Refonte tabs icones : FAIT ✅
- 3 onglets icones (utensils, pump-medical, bed) avec label 10px
- Animation underline sur 3 positions
- Deep link `tab=sommeil` supporte
- Couleur active par onglet (bleu/vert/violet)

### Phase 2 — Enrichissement solides dans RepasChart : FAIT ✅
- Stacked bars par typeSolide (puree/compote/cereales/yaourt/morceaux/autre)
- Palette 6 couleurs solides (light + dark)
- Legende dynamique (affiche que les types presents)
- Tooltip enrichi avec detail par type
- Insight enrichi : type favori, nouvelles introductions, reactions
- weeklyData enrichi avec `solidesByType`

### Phase 3 — SommeilChart : FAIT ✅
- `components/suivibaby/SommeilChart.tsx` cree (~850 LOC)
- Vue hebdo stacked bars nuit (navy) + siestes (lavender)
- Metriques : moyenne/jour, siestes/jour, plus longue nuit
- Tooltip interactif (Skia + gesture handler)
- **"Ou bebe dort le mieux"** : ranking par location + moment + qualite
- Best spot card highlight
- Distribution qualite (paisible/agite/mauvais en %)
- Insight textuel resume
- Palette `chartColors.sommeil` dans dashboardColors.ts (light + dark)

### Phase 4 — Integration stats.tsx : FAIT ✅
- Listener `ecouterSommeilsHybrid` branche
- 3 panels avec loading/empty/chart
- sommeilLoaded / sommeilEmptyDelayDone flags
- Refresh tint color adaptatif par tab
- Reset complet sur changement de bebe

### Phase 6 — Validation P-items : FAIT ✅
- P1 IconPulseDots : ✅ (3 tabs)
- P3 Enhanced empty state : ✅ (SommeilChart)
- P8b Haptic feedback : ✅ (tab change)
- P9b Pull-to-refresh : ✅ (RefreshControl avec tint sommeil)
- P12b Error boundary : ✅ (handleListenerError couvre sommeil)
- P14a nc.* tokens : ✅
- P15a Accessibility labels : ✅ (accessibilityRole/Label/State/Hint)
- P15b Multi-baby : ✅ (reset via parent stats.tsx)
- P16a Dark mode : ✅ (palette sommeil light/dark)
- P17a useMemo : ✅ (weeklyData, metrics, locationInsights, bars)
- P20 Race condition guards : ✅ (sommeilLoaded flag + cleanup)
- P21 Theme tokens : ✅ (hardcoded #ffffff remplace par nc.white)
- P22 Realtime : ✅ (ecouterSommeilsHybrid)
- P25 Touch targets : ✅ (hitSlop ajoute sur buttons)
- **TypeScript : 0 erreurs**

### Phase 5 — Propositions complementaires : FAIT ✅
- [x] 5.1 Correlation repas/sommeil — card "Dernier repas avant la nuit" avec gap moyen et qualite
- [x] 5.2 Export PDF — bouton PDF dans resume row, genere HTML+PDF via expo-print, partage via expo-sharing
- [x] 5.3 Comparaison semaine N vs N-1 — ghost bars (opacity 0.5) + badge tendance % (fleche haut/bas)
- [x] 5.4 Mode resume — 3 mini-cards (repas/pompages/sommeil) avec count total, tap = navigation vers tab
- [x] 5.5 Swipe horizontal — PagerView remplace le fade, dots indicator en bas, haptic sur swipe
- [x] 5.6 Smart tip sommeil — detecte 3 jours agites consecutifs, affiche conseil contextuel avec prenom

*Derniere mise a jour : 2026-03-16*
