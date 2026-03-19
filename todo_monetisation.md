# Stratégie de Monétisation — Samaye

> **Vision** : Monétiser sans trahir la confiance parentale. Samaye est un compagnon, pas un produit publicitaire.
> Ce document fusionne `StrategieDeMonetisation.md` (analyse business) et `todo_promos.md` (implémentation technique + éthique).

---

## Principes directeurs

- **Confiance d'abord** : une app de suivi bébé touche à l'intime. Jamais de dark patterns.
- **Valeur avant paywall** : l'utilisateur doit comprendre la valeur Premium avant qu'on lui propose.
- **Opt-in strict** : promos = `marketing: false` par défaut. L'utilisateur choisit.
- **Zéro publicité** : aucune pub (ni banner, ni interstitiel, ni rewarded ads). Un parent qui enregistre un biberon à 3h du matin ne doit jamais voir de pub. La monétisation repose sur la valeur (Premium + partenariats), pas sur l'attention.
- **Fréquence respectueuse** : max 1 promo/24h, jamais la nuit (22h-7h), jamais pendant un épisode de santé.

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
| Export PDF | **1 par mois** |
| Commandes vocales | **5 par jour** (coût API AssemblyAI) |
| Tips & insights | ✅ Complet (contenu éditorial = rétention) |
| Rappels & notifications | ✅ Complet |

**Philosophie** : ne pas brider le suivi bébé lui-même (ce serait punitif). Brider les features à forte valeur ajoutée et à coût serveur.

### Tier Premium "Samaye+" (~3,99€/mois ou 29,99€/an)

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
| **Badge Premium** sur le profil | Reconnaissance sociale |

### Tier Famille "Samaye+ Famille" (~5,99€/mois ou 39,99€/an)

| Fonctionnalité | Justification |
|---|---|
| Tout Premium | — |
| **5 comptes liés** (co-parents, grands-parents, nounou) | Familles élargies |
| **Dashboard partagé** temps réel | Coordination familiale |
| **Notifications croisées** entre co-parents | "Papa a donné le biberon à 14h" |

### Pricing final (à A/B tester)

| Plan | Prix mensuel | Prix annuel | Économie |
|---|---|---|---|
| Premium | 3,99€ | 29,99€ | -37% |
| Famille | 5,99€ | 39,99€ | -44% |
| Essai gratuit | 14 jours Premium complet | — | — |

---

## Implémentation par phase

### Phase 1 — RevenueCat + Paywall (priorité 1) ⏳ À FAIRE

- [ ] **Intégrer RevenueCat** (`react-native-purchases`)
  - Gestion abonnements cross-platform (iOS + Android)
  - Analytics revenus intégrés
  - A/B testing prix natif
  - Webhooks pour vérification serveur

- [ ] **Créer `contexts/PremiumContext.tsx`**
  - `isPremium: boolean` — état global
  - `premiumTier: "free" | "premium" | "family"`
  - `checkFeatureAccess(feature: string): boolean`
  - Sync avec RevenueCat au login/logout

- [ ] **Collection Firestore `subscriptions/{userId}`**
  - Vérification serveur des receipts
  - Historique d'abonnement
  - Cloud Function pour webhook RevenueCat

- [ ] **Implémenter les limitations tier gratuit**
  - Historique 90 jours : filtrer les queries Firestore
  - Export PDF : compteur mensuel dans `user_preferences`
  - Commandes vocales : compteur quotidien (reset à minuit)
  - Partage : limiter `shareInvitations` à 2

- [ ] **Page de pricing in-app** (`app/settings/premium.tsx`)
  - Comparaison visuelle Gratuit vs Premium vs Famille
  - Bouton "Essai gratuit 14 jours"
  - Témoignages parents (social proof)
  - FAQ (annulation, remboursement)

- [ ] **Paywall contextuel** (proposer Premium au bon moment)
  - Export PDF > 1/mois → "Passez à Premium pour des exports illimités"
  - Commande vocale > 5/jour → "Débloquez la voix illimitée"
  - Historique > 90 jours → "Accédez à tout l'historique"
  - Après 30 jours d'utilisation active → "Vous adorez Samaye ?"
  - **Jamais** pendant un épisode de santé (fièvre, sommeil agité)

### ~~Phase 2 — Publicité~~ ❌ SUPPRIMÉE

> **Décision** : zéro publicité dans Samaye. Ni banner, ni interstitiel, ni rewarded ads. La monétisation repose sur Premium + partenariats + parrainage. La confiance parentale n'est pas monétisable via de la pub.

### Phase 3 — IA Premium (différenciateur clé) ⏳ À FAIRE

C'est le **game changer** par rapport aux concurrents.

| Feature IA | Description | Priorité |
|---|---|---|
| **Insights sommeil avancés** | "Bébé dort mieux quand couché avant 19h30" | P1 — partiellement fait (insightEngine) |
| **Prédiction tétées/biberons** | "Prochaine tétée estimée dans ~45min" | P2 |
| **Résumé quotidien IA** | Rapport du jour envoyé par notif push | P2 |
| **Alerte anomalies** | "Moins de couches que d'habitude, vérifiez l'hydratation" | P1 — partiellement fait |
| **Commandes vocales NLP** | LLM (Claude Haiku) au lieu du regex actuel | P3 |
| **Assistant parent** | Chatbot contextuel : "Est-ce normal que bébé..." | P3 |
| **Corrélations avancées** | Analyse 3+ mois de données, patterns saisonniers | P2 — infra faite (correlationService) |

- [ ] **Gating IA** : insights basiques = gratuit, insights avancés + prédictions = Premium
- [ ] **Coût API** : Claude Haiku ~0.001€/requête → 100 requêtes/mois/user = 0.10€ (largement rentable à 3.99€)

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

- [ ] **Backend parrainage** (à implémenter) :
  - Cloud Function pour valider un code parrainage à l'inscription
  - Incrémenter `referralCount` du parrain
  - Attribuer 1 mois Premium au parrain + filleul
  - Collection `referrals/{docId}` pour tracking

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

- [ ] **Partenariats B2B** (pediatres, maternités)
  - Version "Pro" pour pédiatres : dashboard multi-patients
  - Distribution via maternités : code promo 3 mois Premium offerts
  - Partenariat PMI : version adaptée pour le suivi public

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
  - Titre : "Samaye — Suivi bébé intelligent" (mots-clés dans le titre)
  - Sous-titre : "Tétées, sommeil, couches, croissance" (4 mots-clés forts)
  - Description : structurée par bénéfice, pas par feature
  - Screenshots : 6 captures montrant les écrans clés (pas des mockups vides)
  - Vidéo preview (30s) montrant le parcours quotidien d'un parent
  - Mots-clés : "suivi bébé", "allaitement", "sommeil bébé", "carnet santé", "biberon"
- [ ] **Encourager les avis** : prompt in-app après 14 jours d'utilisation active (StoreKit)
- **Impact estimé** : x2-3 les installs organiques → 100-300/mois
- **Coût** : 0€ (temps seulement)

### Canal 2 — Contenu organique (réseaux sociaux) — Gratuit, moyen terme

- [ ] **Compte Instagram @samaye.app** :
  - Infographies parentales (réutiliser le contenu des tips !)
  - "Saviez-vous que..." tirés des articles OMS/HAS
  - Témoignages parents (avec autorisation)
  - Reels : "Comment j'utilise Samaye au quotidien" (30s)
  - Fréquence : 3 posts/semaine + 2 stories/jour
- [ ] **TikTok** : vidéos courtes "La vie de parent avec Samaye"
  - Format : problème → solution avec l'app
  - "Mon bébé ne dort pas → voici ce que les données de Samaye m'ont montré"
  - Potentiel viral si authentique (pas de pub déguisée)
- [ ] **Groupes Facebook parentaux** : partager l'app dans les groupes (avec modération, pas du spam)
  - Identifier 20 groupes francophones actifs (jeunes parents, allaitement, diversification)
  - Poster des conseils utiles + mentionner l'app quand pertinent
- **Impact estimé** : 200-500 installs/mois si régulier
- **Coût** : 0€ (2-3h/semaine de création de contenu)

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

---

## Avantages concurrentiels

| vs Concurrent | Notre force |
|---|---|
| **Baby Tracker** | Commandes vocales (mains occupées = killer feature) + IA insights |
| **Huckleberry** | IA en français + multi-bébé + partage familial avec rôles |
| **Kinedu** | Tout gratuit sauf Premium (pas de paywall agressif) + tips OMS/HAS gratuits |
| **Baby+** | Focus data + smart content contextuel (pas de contenu éditorial lourd) |
| **Tous** | Éthique promo (charte, pas de pub dans la saisie, respect du sommeil) |

---

## Ordre d'implémentation recommandé

```
Phase 1 (RevenueCat + Paywall)       — fondation monétisation, indispensable
Phase 3 (IA Premium)                  — différenciateur, justifie le pricing
Phase 5 backend (parrainage serveur)  — acquisition virale
Phase 6 (Partenariats + B2B)         — quand base > 5K users
```

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
| `contexts/PremiumContext.tsx` | État premium global | ⏳ À créer |
| `app/settings/premium.tsx` | Page pricing in-app | ⏳ À créer |

---

*Dernière mise à jour : 2026-03-19*
