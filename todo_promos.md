# Système Promotionnel & Monétisation — Samaye

> **Contexte** : Le toggle "Offres promotionnelles" (`marketing`) existe dans les préférences notifications et contrôle l'affichage des promos et du parrainage dans le dashboard.

---

## Principes directeurs

- **Confiance d'abord** : une app de suivi bébé touche à l'intime. Toute promo doit apporter de la valeur, pas du bruit.
- **Opt-in strict** : le toggle `marketing: false` par défaut. L'utilisateur choisit activement de recevoir.
- **Pertinence contextuelle** : les promos doivent être liées à l'âge du bébé et aux habitudes de l'utilisateur.
- **Fréquence maîtrisée** : max 1 promo/24h, jamais pendant la nuit (22h-7h).

---

## Statut d'implémentation

### Phase 1 — Infrastructure promo : ✅ FAIT

- [x] **Collection Firestore `promotions/{promoId}`** — lectures users, écritures admin-only
  - Schéma : title, description, shortDescription, imageUrl, promoCode, deepLink, type, category, ageMin/MaxMonths, priority, startDate, endDate, active, maxImpressions
  - Types : `types/promo.ts` (Promotion, UserPromos, PromoType, ReferralTier)

- [x] **Collection Firestore `user_promos/{userId}`** — tracking impressions/clics
  - Schéma : seenPromos[], dismissedPromos[], clickedPromos[], lastPromoShownAt, referralCode, referralCount, referralRewards[]

- [x] **Règles Firestore déployées** :
  - `promotions` : lecture users authentifiés, écriture admin-only
  - `user_promos` : lecture/écriture owner seulement

- [x] **Service `services/promoService.ts`** :
  - `fetchActivePromos(ageMonths)` — filtre par date, âge, priorité
  - `fetchPromoById(promoId)`
  - `trackImpression(promoId)` — marque vu + met à jour lastPromoShownAt
  - `trackClick(promoId)` — marque cliqué
  - `dismissPromo(promoId)` — ne plus afficher
  - `getUserPromoState()` — état complet + génère referralCode si manquant
  - `getReferralCode()` — code unique au format `SAM-XXXX-XXXX`

- [x] **Hook `hooks/usePromos.ts`** :
  - Fetch promos + user state
  - Anti-spam : cooldown 24h entre chaque promo
  - Anti-nuit : pas de promo entre 22h-7h
  - Contrôlé par `marketingEnabled` (lu depuis preferences notifications)
  - Track impression automatique quand un promo s'affiche
  - Optimistic updates sur dismiss/click

### Phase 2 — UI promo : ✅ FAIT

- [x] **PromoBanner** (`components/suivibaby/dashboard/PromoBanner.tsx`)
  - Accent doré (#D4A017) pour différencier du contenu éditorial
  - Badge type (Partenaire, Premium, Saisonnier, Parrainage)
  - Bouton "Copier le code" avec Clipboard + toast
  - Bouton "Voir l'offre" avec deeplink
  - Bouton dismiss avec haptic
  - Dark mode, nc.* tokens, accessibilityRole/Label/Hint

- [x] **Intégration home.tsx** — contrôlé par `marketing` toggle
  - `useFocusEffect` relit la préférence marketing à chaque focus
  - Si `marketing: false` → aucune promo/referral affiché
  - Si `marketing: true` → PromoBanner + ReferralCard en bas du dashboard

- [ ] **PromoSheet** — bottom sheet pour les détails (à faire si besoin)
  - Image large + description complète
  - Bouton "Copier le code" + "Ouvrir" deeplink
  - Conditions : date de validité, CGU

### Phase 5 — Parrainage : ✅ FAIT

- [x] **ReferralCard** (`components/suivibaby/dashboard/ReferralCard.tsx`)
  - Code parrainage unique (généré automatiquement : `SAM-XXXX-XXXX`)
  - Partage via Share API (SMS, WhatsApp, email)
  - Bouton "Copier" avec Clipboard + toast
  - Progression gamifiée vers le prochain palier
  - 3 paliers : Parrain (1+), Ambassadeur (3+), Super Parent (10+)

- [x] **4 promotions seedées dans Firestore** :
  - Samaye Premium (essai gratuit)
  - Joone couches éco (-15%, code SAMAYE15)
  - Good Goût diversification (-20%, code SAMAYE20, 4-12 mois)
  - Petit Bateau printemps (-25%, code SAMSPRING25)

### Phase 3 — Samaye Premium (monétisation directe) : ⏳ À FAIRE

- [ ] **Offre Premium** — fonctionnalités avancées payantes
  - Export PDF illimité
  - Insights avancés (corrélations cross-data détaillées)
  - Stockage photos illimité
  - Mode multi-bébé illimité
  - Support prioritaire
  - Badge "Premium" sur le profil

- [ ] **Paywall contextuel** — proposer Premium au bon moment
  - Quand l'utilisateur essaie d'exporter un 2ème PDF → "Passez à Premium"
  - Quand le stockage photo approche la limite → "Besoin de plus d'espace ?"
  - Après 30 jours d'utilisation active → "Vous adorez Samaye ? Découvrez Premium"
  - **Jamais** pendant un moment stressant (fièvre enregistrée, sommeil agité)

- [ ] **Pricing** (à valider) :
  - Mensuel : 2,99€/mois
  - Annuel : 19,99€/an (économie 45%)
  - Famille : 29,99€/an (jusqu'à 5 enfants + 3 co-parents)

- [ ] **Implémentation** :
  - `react-native-purchases` (RevenueCat) recommandé : analytics, A/B testing, cross-platform, webhooks
  - Collection Firestore `subscriptions/{userId}` pour vérification serveur
  - Cloud Function pour valider les receipts

### Phase 4 — Partenariats bébé (revenus partenaires) : ⏳ À FAIRE

- [ ] **Types de partenariats pertinents** :
  - **Couches** : Pampers, Lotus Baby, Joone, marques éco → codes promo mensuels
  - **Alimentation bébé** : Blédina, Good Goût, Babybio → promos diversification
  - **Puériculture** : Babymoov, Chicco, Bébé Confort → réductions équipement
  - **Santé** : laboratoires (vitamines D, probiotiques) → réductions
  - **Vêtements** : Petit Bateau, Kiabi, Vertbaudet → offres saisonnières
  - **Apps complémentaires** : méditation parent, recettes bébé, suivi grossesse

- [ ] **Modèle économique** :
  - Affiliation : commission sur chaque vente via lien Samaye (5-15%)
  - Sponsoring : placement dans le carousel tips (identifié "Sponsorisé")
  - Codes promo exclusifs : négociés en échange de visibilité

- [ ] **Ciblage intelligent** (différenciateur clé) :
  - Bébé de 4-6 mois → promos diversification alimentaire
  - Beaucoup de biberons enregistrés → promos lait infantile
  - Été → promos crème solaire bébé, maillots
  - Post-vaccination → promos paracétamol pédiatrique
  - **Jamais de promo pendant un épisode de santé en cours** (éthique)

### Phase 6 — Contenu sponsorisé (dans le carousel tips) : ⏳ À FAIRE

- [ ] **Tip sponsorisé** — article/tip payé par un partenaire
  - Badge "Sponsorisé" clairement visible (transparence RGPD)
  - Même format que les tips éditoriaux (cohérence UX)
  - Contenu validé par l'équipe (pas de contenu partenaire brut)
  - Max 1 tip sponsorisé pour 5 tips éditoriaux
  - Exemple : article "La vitamine D pour bébé" sponsorisé par un labo

- [ ] **Règles éthiques** :
  - Jamais de contenu sponsorisé contredisant les recommandations OMS/HAS
  - Jamais de promo pour du lait infantile (Code OMS de commercialisation)
  - Toujours identifier clairement le contenu sponsorisé
  - L'utilisateur peut signaler un contenu inapproprié

---

## Différenciateurs vs concurrence

### Ce que les concurrents font (et qu'on peut améliorer)

| Feature | Baby Tracker | Huckleberry | Kinedu | **Samaye** |
|---------|:------------:|:-----------:|:------:|:----------:|
| Promos in-app | Bannières génériques | Non | Paywall agressif | **Contextuel + éthique** |
| Partenariats | Non | Non | Contenu payant | **Codes promo pertinents par âge** |
| Parrainage | Non | Non | Non | **Programme gamifié** |
| Respect opt-out | Pas de toggle | N/A | Pas de choix | **Toggle granulaire** |
| Ciblage intelligent | Non | Non | Par âge seulement | **Par âge + habitudes + saison** |
| Éthique promo | Variable | N/A | Variable | **Charte éthique stricte** |

### Ce que personne ne fait (nos innovations)

1. **Promos anti-stress** : jamais de promo pendant un épisode de santé détecté. Si bébé a de la fièvre, pas de bannière. C'est du respect, pas du marketing.

2. **Promos contextuelles intelligentes** : basées sur les données réelles de l'app (âge, type d'alimentation, saison, événements récents). Pas du spam générique.

3. **Transparence totale** : badge "Sponsorisé" sur tout contenu payé, charte éthique publique, pas de dark patterns.

4. **Valeur bidirectionnelle** : les promos doivent faire économiser l'utilisateur, pas juste générer du revenu. Si un code promo fait économiser 10€ au parent, tout le monde y gagne.

5. **Fréquence respectueuse** : max 1 promo/24h, jamais la nuit, jamais pendant un moment stressant. La fatigue parentale n'est pas un levier marketing.

6. **Programme ambassadeur gamifié** : badges, paliers, récompenses cumulables. Les parents qui recommandent l'app sont récompensés durablement.

---

## Fichiers créés/modifiés

| Fichier | Rôle |
|---------|------|
| `types/promo.ts` | Types Promotion, UserPromos, ReferralTier |
| `services/promoService.ts` | CRUD Firestore promos + tracking + referral |
| `hooks/usePromos.ts` | Orchestration promos avec anti-spam et night guard |
| `components/suivibaby/dashboard/PromoBanner.tsx` | Bannière promo dashboard |
| `components/suivibaby/dashboard/ReferralCard.tsx` | Carte parrainage avec partage |
| `data/promos_seed.json` | 4 promos sample |
| `scripts/seedPromos.mjs` | Script de seed Firestore |
| `firestore.rules` | Collections promotions + user_promos |
| `app/(drawer)/baby/(tabs)/home.tsx` | Intégration contrôlée par marketing toggle |

---

## KPIs à suivre

- **Taux d'opt-in marketing** : % d'utilisateurs avec `marketing: true` (objectif > 30%)
- **CTR promos** : clics / impressions (objectif > 5%)
- **Taux de conversion promo** : achats / clics (objectif > 2%)
- **Parrainages / utilisateur actif** : (objectif > 0.3)
- **Revenue per user (ARPU)** : revenu moyen mensuel par utilisateur
- **Churn rate post-promo** : % de désactivation du toggle après une promo (alerte si > 5%)

---

## Ordre d'implémentation restant

```
Phase 3 (Premium + RevenueCat)    — monétisation directe, nécessite compte RevenueCat
Phase 4 (Partenariats)            — quand la base utilisateurs justifie les négociations
Phase 6 (Contenu sponsorisé)      — quand le carousel tips a prouvé son engagement
```

---

*Dernière mise à jour : 2026-03-19*
