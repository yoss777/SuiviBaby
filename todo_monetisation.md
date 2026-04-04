# Stratégie de Monétisation — Suivi Baby

> **Vision** : Monétiser sans trahir la confiance parentale. Suivi Baby est un compagnon, pas un produit publicitaire.
> Document de référence unique — stratégie business, implémentation technique et éthique.

---

## Principes directeurs

- **Confiance d'abord** : une app de suivi bébé touche à l'intime. Jamais de dark patterns.
- **Valeur avant paywall** : l'utilisateur doit comprendre la valeur Premium avant qu'on lui propose.
- **Opt-in strict** : promos = `marketing: false` par défaut. L'utilisateur choisit.
- **Zéro publicité** : aucune pub (ni banner, ni interstitiel, ni rewarded ads). Un parent qui enregistre un biberon à 3h du matin ne doit jamais voir de pub. La monétisation repose sur la valeur (Premium + partenariats), pas sur l'attention.
- **Fréquence respectueuse** : max 1 promo/24h, jamais la nuit (22h-7h), jamais pendant un épisode de santé.
- **RGPD & données enfants** : données de santé d'un mineur = catégorie ultra-sensible (RGPD art. 9 + art. 8). Minimisation, consentement parental explicite, droit à l'oubli. Voir section dédiée ci-dessous.

---

## Architecture des tiers

### Tier Gratuit (acquisition & rétention)

| Fonctionnalité | Limite |
|---|---|
| Suivi bébé | **Illimité** (multi-bébé complet — ne pas brider l'essentiel) |
| Toutes catégories de suivi (18 types) | ✅ Complet |
| Historique | **90 jours** (suffisant pour le quotidien) |
| Partage co-parent | **2 co-parents** |
| Statistiques | Basiques (derniers événements, graphiques semaine) |
| Export PDF | **1 gratuit au total** (pas par mois — 1/mois suffirait à la majorité et tuerait la conversion) |
| Commandes vocales | **3 par jour** (suffisant pour montrer la valeur, pas pour remplacer Premium) |
| Tips & insights | ✅ Complet (contenu éditorial = rétention) |
| Rappels & notifications | ✅ Complet |

**Philosophie** : ne pas brider le suivi bébé lui-même (ce serait punitif). Brider les features à forte valeur ajoutée et à coût serveur.

### Tier Premium "SuiviBaby+" (~3,99€/mois ou 29,99€/an)

| Fonctionnalité | Justification |
|---|---|
| **Historique complet** (illimité) | Rétention long terme, valeur pédiatre |
| **Export PDF illimité** + graphiques enrichis | Les parents adorent montrer les courbes au pédiatre |
| **Commandes vocales illimitées** | Coût API = justifie le paywall |
| **Partage illimité** (grands-parents, nounou) | Rôles déjà implémentés |
| **Stats avancées** : corrélations cross-data, tendances 3 mois | Différenciateur clé |
| **Courbes OMS** superposées aux données de bébé | Forte valeur santé |
| **Insights IA avancés** (voir Phase IA ci-dessous) | Game changer |
| **Widgets iOS/Android** | Confort au quotidien |
| **Zéro pub** | Argument de vente fort |
| **Mode Nuit** (22h-7h) | Interface optimisée 3h du matin — dark mode, grands boutons, saisie rapide |
| **Milestones & capsules souvenir** | Célébrations automatiques + capsule mensuelle shareable |
| **Intégration Apple Health / Google Health Connect** | Hub santé bébé, différenciateur ASO fort |

### Tier Famille "SuiviBaby+ Famille" (~6,99€/mois ou 44,99€/an)

| Fonctionnalité | Justification |
|---|---|
| Tout Premium | — |
| **5 comptes liés** (co-parents, grands-parents, nounou) | Familles élargies |
| **Dashboard partagé** temps réel | Coordination familiale |
| **Notifications croisées** entre co-parents | "Papa a donné le biberon à 14h" |

> **Note pricing Famille** : l'écart avec Premium doit être suffisant (3€+) pour justifier un tier séparé. Si la conversion Famille reste < 1% après 3 mois, envisager de fusionner avec Premium et simplifier l'offre.

### Pricing final (à A/B tester)

| Plan | Prix mensuel | Prix annuel | Économie |
|---|---|---|---|
| Premium | 3,99€ | 29,99€ | -37% |
| Famille | 6,99€ | 44,99€ | -46% |
| Lifetime | — | **79,99€** one-time | Ponctuel uniquement (lancement, Product Hunt) — pas permanent dans le paywall |
| Essai gratuit | 14 jours Premium complet | — | — |

---

## Implémentation par phase

### Phase 1 — RevenueCat + Paywall (priorité 1) 🔧 EN COURS

#### Étape A — Infra Premium (sans API keys) ✅ FAIT

- [x] **`contexts/PremiumContext.tsx`** ✅
  - `isPremium`, `premiumTier: "free" | "premium" | "family"`, `checkFeatureAccess()`
  - Cache local AsyncStorage (TTL 7 jours) pour offline access
  - Mode dev : `devOverrideTier()` pour simuler Premium sans store
  - Listener Firestore `subscriptions/{userId}` en temps réel
  - Support `grandfathered`, `billing_issue`, `trial`
  - Intégré dans `_layout.tsx` (14ème provider)

- [x] **`services/premiumGatingService.ts`** ✅
  - `FREE_LIMITS` : 3 voix/jour, 1 export PDF total, 90j historique, 2 co-parents
  - Compteurs AsyncStorage avec reset auto (voix = quotidien, export = lifetime)
  - `getHistoryCutoffDate()` pour filtrage queries
  - `PAYWALL_MESSAGES` : 6 messages contextuels avec titre, description, CTA

- [x] **Collection Firestore `subscriptions/{userId}`** ✅
  - Règles Firestore : lecture owner-only, écriture serveur-only
  - Schéma : tier, status, expiresAt, grandfathered, startDate

- [ ] **Migration users existants (Grandfather Plan)**
  - Flag `grandfathered: true` pour comptes existants avant le paywall
  - À exécuter via script/Cloud Function au moment du lancement Premium

#### Étape B — Paywall UI ✅ FAIT

- [x] **Page pricing in-app** (`app/settings/premium.tsx`) ✅
  - Comparaison visuelle Gratuit vs Premium vs Famille
  - Toggle Mensuel/Annuel avec badge économie
  - Bouton "Essai gratuit 14 jours"
  - FAQ accordion (3 questions)
  - Bouton "Restaurer mes achats"
  - Banner grandfathered pour les early adopters
  - Mentions légales renouvellement auto

- [x] **Composant `PaywallPrompt`** réutilisable ✅
  - Variantes `inline` (compact) et `banner` (détaillé avec CTA + dismiss)
  - 6 triggers : voice_limit, export_limit, history_limit, sharing_limit, advanced_stats, ai_insights
  - Navigation vers `/settings/premium`

- [x] **Gating intégré** dans les écrans existants ✅
  - Export PDF : vérification compteur + PaywallPrompt banner (`app/settings/export.tsx`)
  - Commandes vocales : vérification quotidienne + modal limite (`VoiceCommandButton.tsx`)
  - Lien "SuiviBaby+" en haut des settings (`app/(drawer)/settings.tsx`)
  - Historique : `getHistoryCutoffDate()` prêt à intégrer dans les queries

- [x] **Grace period & billing retry UI** ✅
  - État `billing_issue` dans PremiumContext (prêt pour RevenuCat)
  - Le banner sera affiché quand le status passe en `billing_issue`

#### Étape C — RevenueCat SDK ✅ FAIT

- [x] **`react-native-purchases` installé** (v9.15.1) ✅
- [x] **`services/revenueCatService.ts`** ✅
  - Init SDK avec clé publique test
  - Login/logout avec Firebase UID
  - getOfferings() → prix localisés par store
  - purchasePackage() → flow natif Apple/Google
  - restorePurchases() → obligatoire stores
  - addCustomerInfoListener() → changements temps réel
  - getTierFromCustomerInfo() / getStatusFromCustomerInfo()
- [x] **PremiumContext connecté à RevenuCat** ✅
  - Source primaire : RevenuCat SDK (listener temps réel)
  - Fallback : Firestore `subscriptions/{userId}`
  - Cache offline AsyncStorage (TTL 7j)
  - Login RC au login Firebase, logout au signout
- [x] **Page pricing connectée aux vrais achats** ✅
  - Chargement offerings RC au mount (prix localisés)
  - purchasePackage() sur le bouton "Essai gratuit"
  - restorePurchases() sur "Restaurer mes achats"
  - Modals succès/erreur

- [ ] **Webhooks serveur** (à implémenter quand en production)
  - Cloud Function pour recevoir les événements RevenueCat
  - Mettre à jour `subscriptions/{userId}` en temps réel

- [ ] **Winback flow** (rétention des churners)
  - Notification push J+7 à J+14 après annulation
  - Offre réduite : 2,49€/mois pendant 3 mois

**RevenuCat Dashboard** : Entitlements `premium` + `family`, 5 produits, 2 offerings configurés.
**Clé API** : `test_BHbHbhlPMXdgMEKwlhISZchIPkO` (Test Store — remplacer par clés prod iOS/Android au déploiement)

### Phase 1b — Onboarding "Moment Magie" J0–J7 (PRIORITÉ 1) ✅ FAIT

> **Risque #1 identifié par l'audit UX** : sans onboarding structuré, même le meilleur paywall ne convertira pas. Le pic de churn est à J7 — c'est la fenêtre critique.

- [x] **Slides onboarding enrichis** (5 slides, teaser Premium) ✅
  - Bienvenue → Saisie rapide → Famille connectée → Sécurité → Insights IA
  - Fichier : `app/(auth)/onboarding.tsx`

- [x] **Flow d'activation post-inscription** ✅
  1. `boot.tsx` détecte 0 enfant → redirige vers `add-baby` avec `firstRun=true`
  2. `add-baby.tsx` affiche message d'accueil + indicateur "Étape 1/2"
  3. Après ajout du bébé → redirige vers dashboard avec `firstTrack=true`
  4. `FirstTrackGuide.tsx` affiche guide "Étape 2/2" avec 3 boutons rapides (Biberon, Tétée, Couche)
  - Fichiers : `app/boot.tsx`, `app/(drawer)/add-baby.tsx`, `components/suivibaby/FirstTrackGuide.tsx`

- [x] **Célébration visuelle** au 1er tracking ✅
  - Animation fade-in + emoji + message personnalisé : "Bravo ! [prénom] est bien suivi(e) !"
  - Bouton "C'est parti !" pour fermer le guide
  - Fichier : `components/suivibaby/FirstTrackGuide.tsx`

- [x] **Métriques onboarding** (tracking local AsyncStorage) ✅
  - 10 événements trackés : `onboarding_completed`, `onboarding_skipped`, `signup_completed`, `health_consent_granted`, `first_baby_added`, `first_track_completed`, `first_track_skipped`...
  - Service : `services/onboardingAnalytics.ts` (funnel calculable, prêt pour flush vers Firebase Analytics)
  - Fichier : `services/onboardingAnalytics.ts`

- [ ] **Invitation co-parent** (à ajouter dans le guide post-premier-tracking)
  - Partage = engagement x2, mais peut attendre la phase parrainage

### Phase 1c — RGPD & Conformité données enfants (PRIORITÉ 1) ✅ PARTIELLEMENT FAIT

> **Obligatoire avant soumission store.** Données de santé d'un mineur en UE = catégorie ultra-sensible. Un article négatif peut tuer le produit.

- [x] **Consentement parental explicite** ✅
  - Checkbox séparée à l'inscription : "J'autorise le traitement des données de santé de mon enfant"
  - Distincte de l'acceptation CGU (exigence RGPD art. 9 — consentement non-bundled)
  - Preuve horodatée dans `user_preferences/{uid}.healthDataConsent` (granted, grantedAt, version)
  - Fichiers : `app/(auth)/login.tsx`, `services/userPreferencesService.ts`

- [x] **Minimisation des données IA** ✅
  - Service `services/dataAnonymizationService.ts` :
    - `anonymizeChildData()` : nom → omis, date de naissance → âge en mois, UIDs → omis
    - `anonymizeEvent()` : supprime childId, userId, notes potentiellement identifiantes
    - `stripPII()` : nettoie texte libre des noms connus, emails, numéros de téléphone
  - À intégrer dans tous les appels LLM futurs (Phase 3 IA)

- [ ] **Durée de rétention post-désabonnement**
  - Données conservées 12 mois après désabonnement (l'utilisateur peut les exporter)
  - Après 12 mois : notification "Vos données seront supprimées dans 30 jours"
  - Suppression automatique sauf si l'utilisateur se réabonne

- [x] **Droit à l'oubli** ✅
  - Bouton "Supprimer toutes mes données" dans les settings (existant)
  - Cloud Function `deleteUserAccount` pour suppression cascade (existant)
  - **Délai de grâce 30 jours** avec annulation possible depuis les settings
  - Service : `requestAccountDeletion()`, `cancelAccountDeletion()`, `getPendingDeletionDate()`
  - Banner visuel dans les settings avec date de suppression + bouton "Annuler"
  - Cloud Function schedulée `processScheduledDeletions` (toutes les 24h)
  - Fichiers : `services/accountDeletionService.ts`, `app/(drawer)/settings.tsx`, `functions/index.js`

- [x] **Email de confirmation** ✅
  - Email à la demande de suppression (CF `sendDeletionRequestEmail` via Resend)
  - Email après suppression effective (dans `processScheduledDeletions`)
  - Contient les instructions pour annuler si non sollicité

- [x] **Politique de confidentialité** ✅ (existant)
  - Page dédiée `app/settings/privacy.tsx` (7 sections, RGPD art. 9 référencé)
  - CGU dans `app/settings/terms.tsx` (11 sections)
  - Lien depuis l'écran de login

### Phase 1d — Mode Nuit (PRIORITÉ 1) ✅ FAIT

> **Différenciateur UX majeur** : le moment le plus fréquent d'utilisation est 3h du matin — et aucun concurrent n'optimise l'UX pour ce cas. Hook marketing : *"La seule app pensée pour le parent à 3h du matin."*

- [x] **Dark mode adaptatif automatique** (22h–7h) ✅
  - Détection horaire dans `ThemeContext.tsx` — force dark mode entre 22h et 7h quand preference = auto
  - Re-check toutes les 60 secondes (transition fluide)
  - Palette sombre existante (`neutralColorsDark`) — pas de blanc pur (#111827)
  - Flag `isNightMode` exposé dans le context pour adaptation UI

- [x] **Saisie rapide nocturne** ✅
  - Hook `useNightMode.ts` : adapte boutons (56px min), police, animations, haptic
  - GlobalFAB adapté : boutons plus grands la nuit, animations pulse désactivées
  - Retour haptique plus prononcé la nuit (Heavy/Medium au lieu de Light)
  - Hit slop augmenté (12px au lieu de 8px)

- [x] **Accessibilité de base** ✅ (déjà en place)
  - 362 `accessibilityLabel` dans 79 fichiers
  - VoiceOver / TalkBack fonctionnel (roles, labels, states)
  - Dynamic Type supporté par défaut (React Native, pas de `maxFontSizeMultiplier` bloquant)
  - Contraste dark mode : palette indigo-400 sur fond gray-900 (ratio > 4.5:1)

**Fichiers** : `contexts/ThemeContext.tsx`, `hooks/useNightMode.ts`, `components/suivibaby/GlobalFAB.tsx`

### ~~Phase 2 — Publicité~~ ❌ SUPPRIMÉE

> **Décision** : zéro publicité dans Suivi Baby. Ni banner, ni interstitiel, ni rewarded ads. La monétisation repose sur Premium + partenariats + parrainage. La confiance parentale n'est pas monétisable via de la pub.

### Phase 3 — IA Premium (différenciateur clé) ✅ FAIT

C'est le **game changer** par rapport aux concurrents.

| Feature IA | Description | Statut |
|---|---|---|
| **Insights sommeil avancés** | "Bébé dort mieux quand couché avant 19h30" | ✅ insightEngine (rule-based) |
| **Prédiction tétées/biberons** | "Prochaine tétée estimée dans ~45min" | ✅ `predictNextFeeding()` local |
| **Prédiction siestes** | "Prochaine sieste vers 14h30" | ✅ `predictNextSleep()` local |
| **Résumé quotidien** | Synthèse du jour (highlights + alertes) | ✅ `generateDailySummary()` local |
| **Alerte anomalies** | "Moins de couches que d'habitude" | ✅ insightEngine + dailySummary |
| **Insights IA enrichis** | Claude Haiku via CF proxy (données anonymisées) | ✅ CF `generateAiInsight` |
| **Commandes vocales NLP** | LLM au lieu du regex actuel | ⏳ P3 |
| **Assistant parent chatbot** | "Est-ce normal que bébé..." | ⏳ P3 |
| **Corrélations avancées** | Analyse 3+ mois de données | ✅ correlationService existant |

- [x] **Service IA** (`services/aiInsightsService.ts`) ✅
  - `predictNextFeeding()` — calcul local basé sur intervalles moyens + coefficient de variation
  - `predictNextSleep()` — idem pour les siestes
  - `generateDailySummary()` — résumé local (highlights, concerns, suggestion)
  - `generateAiEnhancedInsight()` — appel CF Claude Haiku (données anonymisées)
  - `predictionToInsight()` — convertit prédiction en Insight affichable
- [x] **Cloud Function `generateAiInsight`** ✅
  - Proxy Claude Haiku (claude-haiku-4-5), rate limité 10 req/h/user
  - 3 modes : advanced_insight, daily_summary, predictions
  - Données anonymisées via dataAnonymizationService
  - Secret `ANTHROPIC_API_KEY` via Firebase Secrets Manager
- [x] **Gating IA** : insights basiques (insightEngine) = gratuit, prédictions + IA Claude = Premium
- [ ] **Rapport Pédiatre PDF Premium** (chantier ~2-3 semaines, post-lancement)
  - Document A4 structuré avec courbes OMS
  - Stack : `react-native-pdf-lib` ou service cloud

### Phase 4 — Système promotionnel : ✅ FAIT

- [x] **Infrastructure** : types/promo.ts, services/promoService.ts, hooks/usePromos.ts
- [x] **Collections Firestore** : promotions (admin-only), user_promos (owner-only)
- [x] **PromoBanner** : accent doré, code promo copiable, deeplink, dismiss
- [x] **Anti-spam** : 1 promo/24h, pas la nuit, contrôlé par toggle marketing
- [x] **4 promos seedées** : Premium, Joone, Good Goût, Petit Bateau

### Phase 5 — Programme de parrainage : ✅ FAIT

- [x] **ReferralCard** : code unique SAM-XXXX-XXXX, Share API, Clipboard
- [x] **Tiers gamifiés** : Parrain (1+), Ambassadeur (3+), Super Parent (10+)
- [x] **Progression visuelle** vers le prochain palier

- [x] **Backend parrainage** ✅
  - Cloud Function `validateReferralCode` : valide le code, empêche auto-parrainage et double utilisation
  - Incrémente `referralCount` du parrain
  - Attribue 1 mois Premium au parrain + filleul (via `subscriptions/{uid}`)
  - Collection `referrals/{docId}` pour tracking
  - Batch atomique (5 opérations en une transaction)

### Phase 6 — Partenariats & contenu sponsorisé ⏳ À FAIRE

- [ ] **Partenariats bébé** (quand base > 5K users)
  - Couches : Pampers, Joone, Lotus Baby
  - Alimentation : Blédina, Good Goût, Babybio
  - Puériculture : Babymoov, Chicco
  - Vêtements : Petit Bateau, Kiabi
  - Modèle : affiliation (5-15%) + codes promo exclusifs

- [ ] **Ciblage intelligent** (différenciateur)
  - Par âge du bébé + habitudes + saison
  - Jamais pendant un épisode de santé
  - Max 1 promo/semaine en push, 1/24h in-app

- [ ] **Contenu sponsorisé** (dans le carousel tips)
  - Badge "Sponsorisé" obligatoire
  - Max 1 sponsorisé pour 5 éditoriaux
  - Validé par l'équipe, conforme OMS/HAS
  - Jamais de promo lait infantile (Code OMS)

- [ ] **Partenariats B2B** (pédiatres, maternités)
  - Distribution via maternités : code promo 3 mois Premium offerts
  - Partenariat PMI : version adaptée pour le suivi public

### Phase 6b — Tier "Suivi Baby Pro" pour professionnels de santé ⏳ À FAIRE (quand base > 10K users)

> 1 pédiatre convaincu = 500 familles converties sur 3 ans. Canal d'acquisition à ROI exceptionnel.

- [ ] **Dashboard multi-patients** pour pédiatres et sages-femmes libérales
  - Suivi de 10–50 bébés, alertes automatiques, export dossier patient
  - **Pricing** : 29€/mois ou 199€/an par professionnel
- [ ] **Données anonymisées** (avec accord IRB) pour partenariats de recherche
  - Renforce la crédibilité scientifique de l'app

### Phase 6c — Milestones & Capsule Souvenir ✅ FAIT

- [x] **Service de détection** (`services/milestoneCelebrationService.ts`) ✅
  - 6 types : tracking_duration, event_count, sleep_record, growth, first, streak
  - Détection automatique : 1/3/6/12 mois de suivi, 100/500/1000 événements, 100e repas, première nuit 6h+, séries 7j/30j
  - Persistance locale des milestones déjà célébrés (AsyncStorage)
  - Gratuit : milestones basiques / Premium : séries (gamification)
- [x] **Modal de célébration** (`components/suivibaby/MilestoneCelebrationModal.tsx`) ✅
  - Animation spring + emoji + titre + message
  - Bouton "Partager" (Share API natif) + "Merci !"
  - Partage formaté pour Instagram/WhatsApp
- [ ] **Capsule mensuelle PDF/image** (Premium, post-lancement)
- **Impact estimé** : réduction churn M3–M6 de ~15%, acquisition organique via partages

### Phase 6d — Intégration Apple Health / Google Health Connect ⏳ À FAIRE

- [ ] **Synchronisation bidirectionnelle** : poids, taille, sommeil
  - Positionne Suivi Baby comme hub santé bébé dans l'écosystème santé du parent
  - Différenciateur ASO fort ("Compatible Apple Health" sur la fiche store)
  - Aucun concurrent FR ne l'a implémenté correctement

### Phase 7 — App update & engagement : ✅ FAIT

- [x] **UpdateBanner** : détection nouvelle version via Firestore app_config
- [x] **ChangelogModal** : "Quoi de neuf" après mise à jour
- [x] **Deeplink store** : bouton "Installer" ouvre App Store / Play Store
- [x] **Contrôlé par toggle `updates`** dans les préférences

---

## Plan d'acquisition utilisateurs

### Réalité : sans plan d'acquisition, pas de revenus

L'app est techniquement solide mais **personne ne s'occupe de l'acquisition**. Sans stratégie active, les installs organiques seront de ~50-100/mois via l'App Store. Il faut un plan concret.

### Canal 1 — ASO (App Store Optimization) — Gratuit, long terme

- [ ] **Optimiser la fiche store** :
  - Titre : "Suivi Baby — Suivi bébé intelligent" (mots-clés dans le titre)
  - Sous-titre : "Tétées, sommeil, couches, croissance" (4 mots-clés forts)
  - Description : structurée par bénéfice, pas par feature
  - Screenshots : 6 captures montrant les écrans clés (pas des mockups vides)
  - Vidéo preview (30s) montrant le parcours quotidien d'un parent
  - Mots-clés : "suivi bébé", "allaitement", "sommeil bébé", "carnet santé", "biberon"
- [ ] **Encourager les avis** : prompt in-app après 14 jours d'utilisation active (StoreKit)
- **Impact estimé** : x2-3 les installs organiques → 100-300/mois
- **Coût** : 0€ (temps seulement)

### Canal 2 — Contenu organique (réseaux sociaux) — Gratuit, moyen terme

> **Réalité solo dev** : mieux vaut 1 canal en excellence que 4 canaux médiocres. Prioriser Instagram Reels (format viral, audience parentale forte).

- [ ] **Compte Instagram @suivibaby.app** (canal principal) :
  - Reels courts (15-30s) : "Mon bébé ne dort pas → voici ce que les données m'ont montré"
  - Infographies parentales (réutiliser le contenu des tips !)
  - Fréquence réaliste : **2 posts/semaine** (pas 3 posts + 2 stories/jour = insoutenable en solo)
- [ ] **Groupes Facebook parentaux** (canal secondaire) :
  - Identifier 10 groupes francophones actifs (jeunes parents, allaitement, diversification)
  - Poster des conseils utiles + mentionner l'app quand pertinent (pas de spam)
- [ ] **TikTok** (optionnel, si le contenu Instagram se réutilise facilement)
- **Impact estimé** : 100-300 installs/mois si régulier
- **Coût** : 0€ (1-2h/semaine de création de contenu)

### Canal 3 — Partenariats maternités/PMI — Gratuit, lent mais puissant

- [ ] **Kit maternité** : flyer A5 avec QR code + "3 mois Premium offerts"
  - Distribué dans les maternités partenaires
  - Coût impression : ~0.05€/flyer
- [ ] **Pédiatres** : carte de visite avec QR code dans la salle d'attente
  - "Recommandé par votre pédiatre" = confiance immédiate
  - Pitch : "Vos patients arrivent avec des courbes de croissance claires"
- [ ] **PMI (Protection Maternelle et Infantile)** :
  - Version adaptée ou partenariat institutionnel
  - Les PMI suivent des milliers de familles
- **Impact estimé** : 50-200 installs/maternité partenaire/mois
- **Coût** : ~100€ d'impression + temps de démarchage
- **Délai** : 3-6 mois pour les premiers partenariats

### Canal 4 — Publicité payante — Budget nécessaire

- [ ] **Facebook/Instagram Ads** ciblant :
  - Parents 25-40 ans, enfants 0-2 ans
  - Intérêts : allaitement, diversification, sommeil bébé
  - Lookalike audiences des users existants
  - Budget : 500-2000€/mois pour commencer
  - CPI estimé (coût par install) : 1-3€ → 250-2000 installs/mois
- [ ] **Apple Search Ads** :
  - Mots-clés : "suivi bébé", "allaitement", "carnet santé"
  - Budget : 300-1000€/mois
  - CPI estimé : 0.50-2€ (très efficace sur niche)
- [ ] **Google UAC (Universal App Campaigns)** :
  - Automatisé, multi-réseau (Search, YouTube, Play Store)
  - Budget : 500-1500€/mois
- **Impact estimé** : 500-3000 installs/mois selon budget
- **Coût** : 1000-4000€/mois

### Canal 5 — Programme de parrainage — Quasi-gratuit, viral

- [x] **Infrastructure faite** (ReferralCard, code unique, tiers gamifiés)
- [ ] **Activer le backend** (Cloud Function pour valider les codes)
- [ ] **Incentive** : 1 mois Premium offert au parrain + filleul
- **Impact estimé** : coefficient viral 0.2-0.5 (chaque user amène 0.2 à 0.5 nouveaux users)
- **Coût** : coût du mois Premium offert (~0€ en marginal)

---

## Estimations de revenus (réalistes)

### Scénario A — Organique seul (0€ budget pub)

**Timeline** : 12 mois pour atteindre ~2K users actifs

| Mois | Users actifs | Canal principal |
|------|-------------|----------------|
| M1-M3 | 100-300 | ASO + bouche à oreille |
| M3-M6 | 300-800 | + réseaux sociaux + parrainage |
| M6-M12 | 800-2000 | + premiers partenariats maternités |

| Source | Hypothèse | Revenu/an |
|---|---|---|
| Premium (4% conversion) | 80 × 30€ | **2 400€** |
| Famille (1% conversion) | 20 × 40€ | **800€** |
| Partenariats | 2 × 100€/mois | **2 400€** |
| **Total an 1** | | **~5 600€** |

### Scénario B — Budget marketing modéré (1-2K€/mois)

**Timeline** : 12 mois pour atteindre ~8K users actifs

| Mois | Users actifs | Investissement/mois |
|------|-------------|---------------------|
| M1-M3 | 500-1500 | 1 000€ (ads + ASO) |
| M3-M6 | 1500-4000 | 1 500€ (ads + contenu) |
| M6-M12 | 4000-8000 | 2 000€ (ads + partenariats) |

| Source | Hypothèse | Revenu/an |
|---|---|---|
| Premium (5% conversion) | 400 × 30€ | **12 000€** |
| Famille (2% conversion) | 160 × 40€ | **6 400€** |
| Partenariats | 4 × 200€/mois | **9 600€** |
| **Total an 1** | | **~28 000€** |
| **Investissement pub** | 12 × 1 500€ | **-18 000€** |
| **Net an 1** | | **~10 000€** |

### Scénario C — Croissance accélérée (5K€/mois + B2B)

**Timeline** : 18 mois pour atteindre ~30K users actifs

| Source | Hypothèse | Revenu/an 2 |
|---|---|---|
| Premium (6% conversion) | 1800 × 30€ | **54 000€** |
| Famille (2% conversion) | 600 × 40€ | **24 000€** |
| Partenariats | 8 × 400€/mois | **38 400€** |
| B2B (pédiatres/maternités) | 5 × 500€/an | **2 500€** |
| **Total an 2** | | **~119 000€** |
| **Investissement pub** | 12 × 5 000€ | **-60 000€** |
| **Net an 2** | | **~59 000€** |

### Facteurs clés de succès

- **Rétention** > acquisition : un user qui reste 12 mois vaut 10x un user qui part après 1 mois
- **Taux de conversion Premium** : dépend de la qualité du paywall contextuel et de la valeur perçue de l'IA
- **Parrainage** : si le coefficient viral dépasse 0.5, la croissance devient exponentielle
- **Partenariats maternités** : canal le plus rentable (0€ pub, confiance immédiate) mais le plus lent à activer

### Métriques à tracker (KPIs critiques)

| Métrique | Objectif | Outil |
|---|---|---|
| **Trial activation rate** | > 30% des users qui voient le paywall activent l'essai | RevenueCat |
| **Trial-to-paid conversion** | > 50% des essais convertissent | RevenueCat |
| **Time-to-premium** | < 10 jours entre install et abonnement | RevenueCat + Analytics |
| **Paywall conversion par trigger** | Identifier quel contexte convertit le mieux | Custom events Firebase |
| **LTV par canal d'acquisition** | Savoir où investir (ASO vs Ads vs Parrainage) | RevenueCat + Attribution |
| **Churn cohort analysis** | À quel mois les users partent (M1, M3, M6 ?) | RevenueCat |
| **MRR (Monthly Recurring Revenue)** | Croissance mois/mois | RevenueCat Dashboard |
| **ARPU (Average Revenue Per User)** | Tous users, pas seulement payants | Calculé |

---

## Avantages concurrentiels

| vs Concurrent | Notre force |
|---|---|
| **Baby Tracker** | Commandes vocales (mains occupées = killer feature) + IA insights |
| **Huckleberry** | IA en français + multi-bébé + partage familial avec rôles |
| **Kinedu** | Tout gratuit sauf Premium (pas de paywall agressif) + tips OMS/HAS gratuits |
| **Baby+** | Focus data + smart content contextuel (pas de contenu éditorial lourd) |
| **Tous** | Éthique promo (charte, pas de pub dans la saisie, respect du sommeil) |
| **Tous** | Mode Nuit optimisé 3h du matin (0 concurrent ne l'adresse) |
| **Tous** | Offline-first (SQLite queue déjà en place — parent dans l'avion ou zone blanche) |

---

## Stratégie de localisation (levier x10 — An 2)

> Le marché FR seul est limité (~750K naissances/an). L'extension francophone puis internationale est le levier de croissance le plus évident.

### Phase 1 — Francophonie (coût quasi nul)
- Belgique, Suisse romande, Québec, Afrique francophone
- Même langue, adaptation mineure (terminologie médicale locale)
- ASO : ajouter des mots-clés spécifiques par pays

### Phase 2 — Espagnol/Portugais (18M+ naissances/an)
- Marché Latam + Espagne + Brésil
- Traduction i18n (l'infra Expo supporte déjà `expo-localization`)
- Adaptation : normes OMS identiques, terminologie médicale à valider

### Phase 3 — Anglais (marché premium)
- Marché US/UK/AU : forte capacité de paiement
- Concurrence intense mais aucun concurrent n'a l'éthique comme positionnement central

---

## Ordre d'implémentation recommandé

```
Phase 1  (RevenueCat + Paywall)       — ✅ FAIT (A+B+C : infra, paywall UI, SDK branché)
  └─ Reste : webhooks serveur + winback flow (post-lancement)
Phase 1b (Onboarding J0–J7)           — ✅ FAIT (slides, flow activation, célébration, métriques)
Phase 1c (RGPD & conformité)          — ✅ PARTIELLEMENT FAIT (consentement, anonymisation, droit oubli, emails)
Phase 1d (Mode Nuit)                  — ✅ FAIT (dark adaptatif, saisie rapide, a11y)
Phase 3  (IA Premium + Rapport PDF)   — ✅ FAIT (prédictions, résumé, CF Claude Haiku)
Phase 5  backend (parrainage serveur) — ✅ FAIT (CF validateReferralCode + 1 mois Premium)
Phase 6  (Partenariats + B2B + Pro)   — quand base > 5K users
Phase 6c (Milestones)                 — ✅ FAIT (détection, modal célébration, partage)
Phase 6d (Apple Health / Health Connect) — positionnement hub santé
Localisation (Francophonie → ES → EN)  — levier x10 an 2
```

### Checklist pré-production (avant soumission store)

- [ ] Restore Purchases fonctionne (test sur device réel)
- [ ] Grandfather Plan actif pour les comptes existants
- [ ] Grace period / billing retry UI en place
- [ ] Offline cache du statut Premium
- [ ] CGV/CGU mises à jour avec mention abonnement
- [x] Politique de confidentialité à jour (RGPD art. 8 + 9, données enfants + IA)
- [x] Consentement parental explicite à l'inscription (checkbox santé séparée)
- [x] Droit à l'oubli fonctionnel (suppression cascade + délai de grâce 30j)
- [x] Minimisation données IA (service `dataAnonymizationService.ts`)
- [x] Onboarding J0–J7 implémenté et mesuré (funnel via onboardingAnalytics)
- [x] Mode Nuit fonctionnel (dark mode adaptatif 22h–7h)
- [x] Accessibilité de base (VoiceOver/TalkBack, Dynamic Type, contraste AA)
- [ ] Test sandbox Apple + Google (achats test)
- [ ] Deep link paywall fonctionnel
- [ ] Winback flow configuré dans RevenueCat (J+7 à J+14)

---

## Fichiers existants

| Fichier | Rôle | Statut |
|---------|------|--------|
| `types/promo.ts` | Types Promotion, UserPromos, ReferralTier | ✅ |
| `services/promoService.ts` | CRUD promos + tracking + referral | ✅ |
| `hooks/usePromos.ts` | Orchestration promos + anti-spam | ✅ |
| `components/suivibaby/dashboard/PromoBanner.tsx` | Bannière promo dashboard | ✅ |
| `components/suivibaby/dashboard/ReferralCard.tsx` | Carte parrainage | ✅ |
| `components/ui/UpdateBanner.tsx` | Banner mise à jour app | ✅ |
| `components/ui/AppUpdateManager.tsx` | Orchestration updates + changelog | ✅ |
| `services/appUpdateService.ts` | Version check Firestore | ✅ |
| `data/promos_seed.json` | 4 promos sample | ✅ |
| `services/dataAnonymizationService.ts` | Anonymisation données avant envoi IA (RGPD) | ✅ |
| `services/accountDeletionService.ts` | Suppression avec délai de grâce 30j + annulation | ✅ |
| `hooks/useNightMode.ts` | Hook mode nuit (boutons, polices, animations, haptic) | ✅ |
| `components/suivibaby/FirstTrackGuide.tsx` | Guide premier tracking + célébration | ✅ |
| `services/onboardingAnalytics.ts` | Tracking funnel onboarding (local AsyncStorage) | ✅ |
| `contexts/PremiumContext.tsx` | État premium global, cache offline, dev toggle | ✅ |
| `services/premiumGatingService.ts` | Limites tier gratuit, compteurs, messages paywall | ✅ |
| `components/ui/PaywallPrompt.tsx` | Composant paywall contextuel (inline/banner) | ✅ |
| `app/settings/premium.tsx` | Page pricing in-app (3 plans, FAQ, restore, RevenuCat) | ✅ |
| `services/revenueCatService.ts` | Wrapper RevenuCat SDK (init, achats, restore, listener) | ✅ |
| `services/aiInsightsService.ts` | Prédictions, résumé quotidien, insights IA Claude | ✅ |
| `services/milestoneCelebrationService.ts` | Détection milestones + persistance célébrés | ✅ |
| `components/suivibaby/MilestoneCelebrationModal.tsx` | Modal célébration avec animation + partage | ✅ |

---

*Dernière mise à jour : 2026-04-04 — Phases 1+1b+1c+1d+3+5+6c + webhooks + grandfather*
