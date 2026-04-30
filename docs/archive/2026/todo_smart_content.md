# Smart Content System — "Compagnon Parental Intelligent"

> **Vision** : Transformer Samaye d'un simple tracker en un compagnon parental intelligent et contextuel.
> Aucune app de suivi bebe open-source ne propose ce niveau de personnalisation.
> Benchmark premium : Kinedu, Wonder Weeks, Huckleberry — mais integre directement dans le tracker.

---

## Architecture globale

```
┌──────────────────────────────────────────────────────────┐
│  Firestore Collections                                    │
│  ├─ tips/{tipId}           — contenu editorial statique   │
│  ├─ milestones_ref/{id}    — jalons attendus par age      │
│  └─ user_content/{userId}  — etat lecture/bookmarks/tips  │
│     └─ dismissed_tips[]    — tips fermes par l'user       │
│     └─ bookmarks[]         — articles sauvegardes         │
│     └─ seen_changelog[]    — versions vues                │
└──────────────┬───────────────────────────────────────────┘
               │
┌──────────────▼───────────────────────────────────────────┐
│  Smart Content Engine (client-side)                       │
│  services/smartContentService.ts                          │
│  ├─ Age-based tip selection (birthDate → age tier)        │
│  ├─ Data-driven insights (events analysis)                │
│  ├─ Time-of-day contextual tips                           │
│  ├─ Milestone proximity alerts                            │
│  └─ Cross-data correlations (repas↔sommeil, etc.)         │
└──────────────┬───────────────────────────────────────────┘
               │
┌──────────────▼───────────────────────────────────────────┐
│  UI Layer                                                 │
│  ├─ SmartFeedCard (home dashboard widget)                 │
│  ├─ MilestoneTimelineCard (prochains jalons)              │
│  ├─ InsightCard (data-driven, cross-data)                 │
│  ├─ ArticleSheet (bottom sheet lecture complete)           │
│  ├─ ChangelogModal (quoi de neuf post-update)             │
│  └─ ContentHub screen (tous les articles/tips)            │
└──────────────────────────────────────────────────────────┘
```

---

## Phase 1 — Fondations (utils, service, Firestore)

### 1.1 Utilitaire age bebe
- [ ] Creer `utils/ageUtils.ts`
  - `getAgeInDays(birthDate: string | Date): number`
  - `getAgeInWeeks(birthDate): number`
  - `getAgeInMonths(birthDate): number`
  - `getAgeTier(birthDate): AgeTier`
    - `"newborn"` (0-1 mois), `"infant"` (1-6 mois), `"older_infant"` (6-12 mois), `"toddler"` (12-24 mois), `"preschooler"` (24+ mois)
  - `getAgeLabel(birthDate): string` — "2 mois et 3 semaines"
  - Refactorer `calculateAge()` de BabySwitcherModal et CustomDrawerContent pour utiliser ce utils

### 1.2 Collection Firestore `tips`
- [ ] Creer la collection `tips/{tipId}` dans Firestore avec le schema :
  ```typescript
  interface Tip {
    id: string;
    title: string;                    // "L'introduction des solides"
    summary: string;                  // 1-2 phrases pour la card
    body: string;                     // contenu complet (markdown ou HTML leger)
    category: TipCategory;            // "alimentation" | "sommeil" | "sante" | "developpement" | "bien_etre"
    subcategory?: string;             // "diversification", "regression", etc.
    ageMinMonths: number;             // 0
    ageMaxMonths: number;             // 6
    ageTier?: AgeTier[];              // ["infant", "older_infant"]
    icon: string;                     // FA6 icon name
    accentColor: string;              // hex color
    source?: string;                  // "OMS", "HAS", "AAP"
    sourceUrl?: string;               // lien vers la source
    priority: number;                 // 1=haute, 5=basse
    tags: string[];                   // ["diversification", "solides", "allergie"]
    triggerConditions?: TipTrigger[]; // conditions pour affichage contextuel
    readTimeMinutes: number;          // temps de lecture estime
    publishedAt: Timestamp;
    active: boolean;
  }

  interface TipTrigger {
    type: "event_absence" | "event_frequency" | "event_anomaly" | "time_of_day" | "day_of_week" | "season";
    eventType?: EventType;            // "sommeil", "biberon", etc.
    condition: string;                // "no_event_24h", "frequency_drop_30pct", "quality_low_3days"
    params?: Record<string, number>;  // { hours: 24, threshold: 3 }
  }
  ```

### 1.3 Collection Firestore `milestones_ref`
- [ ] Creer `milestones_ref/{id}` — reference des jalons attendus par age
  ```typescript
  interface MilestoneRef {
    id: string;
    title: string;                    // "Premier sourire social"
    description: string;              // "Entre 6 et 8 semaines..."
    category: "moteur" | "cognitif" | "social" | "langage" | "sensoriel";
    ageMinWeeks: number;              // age minimum typique
    ageMaxWeeks: number;              // age maximum typique
    ageTypicalWeeks: number;          // age moyen
    icon: string;
    tips: string;                     // conseil pour stimuler ce jalon
    source: string;                   // "OMS" | "Denver" | "ASQ-3"
    relatedJalonType?: string;        // lien avec JalonType existant ("sourire", "pas", "mot", "dent")
    order: number;                    // tri dans la timeline
  }
  ```

### 1.4 Collection Firestore `user_content/{userId}`
- [ ] Creer `user_content/{userId}` — etat de lecture et preferences
  ```typescript
  interface UserContent {
    dismissedTips: string[];          // tipIds fermes
    bookmarks: string[];              // tipIds sauvegardes
    seenChangelog: string[];          // versions vues (ex: "2.4.0")
    lastTipShownAt: Timestamp;        // anti-spam
    tipFrequency: "daily" | "few_per_week" | "weekly"; // preference frequence
    preferredCategories: TipCategory[]; // categories preferees
  }
  ```

### 1.5 Regles Firestore
- [ ] Ajouter dans `firestore.rules` :
  - `tips` : lecture pour tout user authentifie, ecriture admin-only
  - `milestones_ref` : lecture pour tout user authentifie, ecriture admin-only
  - `user_content/{userId}` : lecture/ecriture owner seulement

### 1.6 Service smartContentService.ts
- [ ] Creer `services/smartContentService.ts`
  - `fetchTipsForAge(ageMonths: number, limit?: number): Promise<Tip[]>`
  - `fetchTipsByCategory(category: TipCategory, ageMonths: number): Promise<Tip[]>`
  - `fetchMilestonesForAge(ageWeeks: number): Promise<MilestoneRef[]>`
  - `getUpcomingMilestones(ageWeeks: number, windowWeeks?: number): Promise<MilestoneRef[]>`
  - `dismissTip(tipId: string): Promise<void>`
  - `bookmarkTip(tipId: string): Promise<void>`
  - `removeBookmark(tipId: string): Promise<void>`
  - `getUserContentState(): Promise<UserContent>`
  - `markChangelogSeen(version: string): Promise<void>`

---

## Phase 2 — Smart Content Engine (analyse des donnees)

### 2.1 Data-driven insights engine
- [ ] Creer `services/insightEngine.ts`
  - Analyse les evenements des 7 derniers jours et genere des insights
  ```typescript
  interface Insight {
    id: string;
    type: "positive" | "warning" | "info" | "milestone";
    icon: string;
    title: string;
    message: string;
    accentColor: string;
    relatedTipId?: string;            // lien vers un tip pour "en savoir plus"
    priority: number;
    category: TipCategory;
  }

  function generateInsights(params: {
    events: Event[];
    babyName: string;
    ageMonths: number;
    now: Date;
  }): Insight[];
  ```

### 2.2 Detecteurs d'insights (pattern existant dans SommeilChart.smartTip)
- [ ] **Alimentation** :
  - Baisse de frequence repas >30% vs semaine precedente → warning
  - Nouveau solide introduit avec reaction → alerte suivi allergie
  - Diversification commencee recemment → tips contextuel
  - Dernier repas il y a longtemps → rappel doux
  - Bonne regularite des repas → encouragement positif

- [ ] **Sommeil** :
  - Refactorer le smartTip de SommeilChart dans insightEngine (DRY)
  - Regression de sommeil detectee (baisse qualite + duree) → tip "regression X mois"
  - Meilleur lieu/moment detecte → "Saviez-vous que {prenom} dort mieux en {lieu} ?"
  - Nb siestes en baisse (normal selon age) → tip transitionnel
  - Nuits qui s'allongent → encouragement

- [ ] **Sante** :
  - Temperature elevee enregistree → tips fievre adaptes a l'age
  - Symptome recurrent → suggestion consultation
  - Vaccin recent → tips post-vaccination normaux
  - Pas de vitamine depuis X jours → rappel doux

- [ ] **Developpement** :
  - Age proche d'un jalon typique → "A surveiller cette semaine"
  - Jalon enregistre → celebration + prochain jalon
  - Activites diversifiees → encouragement
  - Peu d'activites d'eveil → suggestions adaptees a l'age

### 2.3 Correlations cross-data
- [ ] Creer `services/correlationService.ts`
  - **Repas → Sommeil** : heure du dernier repas vs qualite de nuit
    - "Les nuits ou {prenom} mange apres 20h, son sommeil est X min plus court"
  - **Activite → Sommeil** : activite physique vs qualite nuit
    - "Les jours avec activite d'eveil, {prenom} dort X% mieux"
  - **Bain → Sommeil** : bain avant coucher vs qualite
    - "Le bain avant 19h semble aider {prenom} a mieux dormir"
  - **Temperature → Alimentation** : fievre vs appetit
    - "Quand {prenom} a de la fievre, il mange naturellement moins — c'est normal"
  - Calculs bases sur les 30 derniers jours minimum pour fiabilite
  - Afficher seulement si correlation significative (>10 occurrences)

### 2.4 Contextualisation temporelle
- [ ] Tips adaptes au moment de la journee :
  - Matin (6h-10h) : tips alimentation, routine matinale
  - Midi (10h-14h) : tips activites/eveil, sieste
  - Apres-midi (14h-18h) : tips jeux, promenade
  - Soir (18h-22h) : tips sommeil, routine du coucher, bain
  - Nuit (22h-6h) : tips nuit, allaitement nocturne

---

## Phase 3 — Milestones proactifs

### 3.1 Timeline des jalons attendus
- [ ] Creer `components/suivibaby/MilestoneTimeline.tsx`
  - Timeline verticale des jalons a venir selon l'age du bebe
  - Categories : moteur, cognitif, social, langage, sensoriel
  - Chaque jalon montre :
    - Titre + description courte
    - Fourchette d'age typique (barre de progression)
    - Position du bebe sur cette fourchette (marker)
    - Statut : "A venir", "C'est le moment !", "Deja enregistre" (si jalon event existe)
    - Conseil pour stimuler ce jalon

### 3.2 Notifications proactives milestones
- [ ] Dans `insightEngine.ts`, ajouter detecteur milestone :
  - Quand l'age du bebe entre dans la fourchette d'un jalon → insight "milestone"
  - Ex: "A 5 mois et 3 semaines, {prenom} pourrait bientot commencer a s'asseoir seul(e) !"
  - Lier avec l'evenement jalon existant : si deja enregistre, ne pas re-suggerer
  - Priorite haute pour le premier jalon imminent

### 3.3 Celebration des jalons
- [ ] Quand un jalon est enregistre (type "jalon" dans events) :
  - Card celebratoire dans le dashboard ("Bravo ! {prenom} a dit son premier mot !")
  - Suggestion du prochain jalon a surveiller
  - Option de partage (photo + texte pre-rempli)

---

## Phase 4 — UI Components

### 4.1 SmartFeedCard (widget dashboard)
- [ ] Creer `components/suivibaby/dashboard/SmartFeedCard.tsx`
  - Card compacte pour le dashboard home
  - Affiche 1 tip ou insight a la fois (le plus pertinent)
  - Layout : icone + titre + resume (2 lignes max)
  - Actions : "Lire" (ouvre ArticleSheet), "Plus tard" (dismiss), "Sauvegarder" (bookmark)
  - Swipe horizontal pour voir le tip suivant (si plusieurs)
  - Couleur accent par categorie :
    - alimentation: orange (#E89A5A)
    - sommeil: purple (#7C6BA4)
    - sante: red (#E07E7E)
    - developpement: green (#7EE0A8)
    - bien_etre: blue (Colors.tint)
  - Badge "Nouveau" si tip non vu
  - Respecte la preference `tips: false` dans notifications → ne pas afficher

### 4.2 InsightCard (data-driven)
- [ ] Creer `components/suivibaby/dashboard/InsightCard.tsx`
  - Card plus riche pour les insights data-driven
  - Layout : type badge (positif/warning/info) + message + "En savoir plus"
  - Exemples :
    - (positif) "Samaye dort 30 min de plus que la semaine derniere"
    - (warning) "Les repas de Samaye ont diminue de 25% cette semaine"
    - (info) "Les nuits ou Samaye se baigne, il dort 20 min de plus"
  - "En savoir plus" ouvre le tip lie si disponible

### 4.3 MilestoneTimelineCard (widget dashboard)
- [ ] Creer `components/suivibaby/dashboard/MilestoneTimelineCard.tsx`
  - Mini-timeline des 2-3 prochains jalons
  - Barre de progression montrant l'age du bebe vs fourchette typique
  - Tap → ouvre la timeline complete (MilestoneTimeline)

### 4.4 ArticleSheet (bottom sheet lecture)
- [ ] Ajouter `ContentSheetProps` dans SheetContext
  - Type guard `isContentSheetProps()` dans GlobalSheetManager
  - Composant `ArticleReader.tsx` :
    - Header : titre + categorie + source + temps de lecture
    - Body : contenu markdown rendu (react-native-markdown-display ou simple Text)
    - Footer : bookmark toggle + partage + "Cet article vous a ete utile ?" (thumbs up/down)
    - Scroll indicator
  - Ouvre via `openSheet({ type: "content", tipId, ... })`

### 4.5 ChangelogModal (Quoi de neuf)
- [ ] Creer `components/ui/ChangelogModal.tsx`
  - Modal full-screen semi-transparent
  - Affiche les nouveautes de la derniere version
  - Slides swipeable (comme l'onboarding existant)
  - Bouton "Compris" qui marque la version comme vue
  - Se declenche automatiquement apres mise a jour (version check dans _layout.tsx)
  - Respecte preference `updates: true/false`

### 4.6 ContentHub screen
- [ ] Creer `app/(drawer)/baby/content.tsx` ou `app/settings/content.tsx`
  - Ecran dedie avec tous les articles/tips
  - Filtres par categorie (chips horizontaux)
  - Section "Sauvegardes" (bookmarks)
  - Section "Pour vous" (tips adaptes a l'age)
  - Section "Populaires" (les plus lus)
  - Search par tag/mot-cle
  - Accessible via drawer menu + lien depuis SmartFeedCard

---

## Phase 5 — Integration dashboard

### 5.1 Hooks
- [ ] Creer `hooks/useSmartContent.ts`
  - Combine tips Firestore + insights engine + milestones
  - Input : events[], babyBirthDate, babyName, userPreferences
  - Output : `{ currentTip, insights[], upcomingMilestones[], isLoading }`
  - Logique de selection : priorite = insights data-driven > milestone imminent > tip age-based > tip general
  - Anti-spam : max 1 tip + 2 insights par session
  - Cache local (AsyncStorage) pour ne pas re-fetch a chaque mount

### 5.2 Integration home.tsx
- [ ] Ajouter les widgets dans le dashboard home :
  - Position dans le scroll : apres SleepWidget, avant RecentEventsList
  - Ordre : InsightCard (si insight dispo) → SmartFeedCard (tip du jour) → MilestoneTimelineCard
  - Animation d'entree StaggeredCard (meme pattern existant)
  - Conditionnel sur `tips: true` dans preferences

### 5.3 Deep links
- [ ] Ajouter les deep links pour le contenu :
  - `samaye://content/{tipId}` → ouvre ArticleSheet
  - `samaye://milestones` → ouvre MilestoneTimeline
  - Utilisable dans les push notifications

---

## Phase 6 — Contenu editorial (seed data)

### 6.1 Redaction du contenu initial
- [ ] Creer `data/tips_seed.json` avec 50+ tips initiaux couvrant :

  **Alimentation (15 tips)** :
  - Allaitement : positions, frequence par age, tire-lait, conservation lait
  - Biberons : preparation, sterilisation, quantites par age
  - Diversification : calendrier introduction, allergenes, BLW vs purees
  - Signes de faim/satiete par age

  **Sommeil (12 tips)** :
  - Routine du coucher par age
  - Regressions du sommeil (4m, 8m, 12m, 18m)
  - Environnement optimal (temperature, bruit, obscurite)
  - Transition nombre de siestes (3→2, 2→1)
  - Cododo securitaire
  - Endormissement autonome

  **Sante (10 tips)** :
  - Fievre : quand s'inquieter par age
  - Post-vaccination : reactions normales
  - Poussees dentaires : signes et soulagement
  - Poids et croissance : courbes normales
  - Premiers secours bebe

  **Developpement (10 tips)** :
  - Eveil sensoriel par age
  - Motricite libre (Montessori/Pikler)
  - Langage : stimulation par age
  - Jeux adaptes par tranche d'age
  - Tummy time : progressions

  **Bien-etre parental (5 tips)** :
  - Baby blues vs depression post-partum
  - Charge mentale parentale
  - Relais et delegation
  - Self-care rapide
  - Couple apres bebe

### 6.2 Script de seed Firestore
- [ ] Creer `scripts/seedTips.ts` pour peupler la collection tips
- [ ] Creer `scripts/seedMilestones.ts` pour peupler milestones_ref
  - 30+ jalons couvrant 0-24 mois (sources OMS, Denver II)

---

## Phase 7 — Cloud Function intelligence avancee

### 7.1 CF generatePersonalizedTips (optionnel, V2)
- [ ] Cloud Function scheduled quotidienne qui :
  - Analyse les patterns de chaque enfant sur 7 jours
  - Genere des insights personnalises dans `user_content/{userId}.daily_insights`
  - Envoie push notification si insight critique + preference push activee
  - Ex: "La diversification de Samaye progresse bien ! 3 nouveaux aliments cette semaine."

### 7.2 CF communityInsights (optionnel, V3)
- [ ] Comparaison anonymisee avec la communaute (opt-in strict) :
  - Moyennes par tranche d'age (sommeil, repas, poids)
  - "Samaye dort dans la moyenne haute pour son age" (sans donner de chiffres individuels)
  - Necessite un volume minimum d'utilisateurs (>100 par tranche)

---

## Phase 8 — Validation UX Matrix

### 8.1 Audit P-items pour le systeme Smart Content
| P-item | Applicable a | Action |
|--------|-------------|--------|
| P1 | SmartFeedCard, ContentHub | Skeleton shimmer au chargement |
| P3 | ContentHub | Empty state "Pas encore de contenu pour cet age" |
| P6 | Bookmark, dismiss | Toast "Article sauvegarde" |
| P8b | Toutes les cards | Haptic au tap |
| P9b | ContentHub | Pull-to-refresh |
| P14a | Tout | nc.* tokens uniquement |
| P15a | Tout | accessibilityLabel, role, hint |
| P16a | Tout | Dark mode complet |
| P17a | Hooks | useMemo sur insights, tips, milestones |
| P20 | useSmartContent | Race condition guards (isMounted) |
| P21 | Tout | 0 couleur hardcodee |
| P22 | Dashboard | Realtime via listener events existants |
| P25 | Cards, boutons | Touch targets 44x44 min |
| P27 | Fetch tips | Error retry toast |

---

## Ordre d'execution recommande

```
Phase 1 (fondations)              — prerequis pour tout
Phase 6.1-6.2 (seed contenu)     — avoir du contenu a afficher
Phase 4.1-4.2 (SmartFeedCard)    — premiere UI visible
Phase 2.1-2.2 (insight engine)   — intelligence contextuelle
Phase 5 (integration home)       — visible dans le dashboard
Phase 3 (milestones proactifs)   — forte valeur parentale
Phase 4.3-4.4 (ArticleSheet)     — lecture complete
Phase 2.3 (correlations)         — analyse cross-data avancee
Phase 4.5 (Changelog)            — engagement retention
Phase 4.6 (ContentHub)           — hub complet
Phase 7 (CF avancees)            — V2/V3 optionnel
Phase 8 (validation UX)          — audit final
```

---

## Impact differenciateur

| Feature | Huckleberry | Baby Tracker | Kinedu | **Samaye** |
|---------|:-----------:|:------------:|:------:|:----------:|
| Tracking events | oui | oui | partiel | **oui** |
| Tips par age | non | non | oui (payant) | **oui (gratuit)** |
| Insights data-driven | partiel (sommeil) | non | non | **oui (cross-data)** |
| Correlations cross-events | non | non | non | **oui** |
| Milestones proactifs | non | non | oui (payant) | **oui (gratuit)** |
| Contenu source OMS/HAS | non | non | partiel | **oui** |
| Personnalisation IA | non | non | non | **V2 (CF)** |
| Comparaison communaute | sommeil only | non | non | **V3 (opt-in)** |

**Positionnement** : Samaye = le seul tracker bebe gratuit qui transforme les donnees en intelligence parentale actionnable.

---

*Derniere mise a jour : 2026-03-18*
