# Système Promotionnel & Monétisation — Samaye

> **Contexte** : Le toggle "Offres promotionnelles" (`marketing`) existe dans les préférences notifications mais n'est branché sur rien. Ce document définit la stratégie et l'implémentation pour le rendre fonctionnel.

---

## Principes directeurs

- **Confiance d'abord** : une app de suivi bébé touche à l'intime. Toute promo doit apporter de la valeur, pas du bruit.
- **Opt-in strict** : le toggle `marketing: false` par défaut. L'utilisateur choisit activement de recevoir.
- **Pertinence contextuelle** : les promos doivent être liées à l'âge du bébé et aux habitudes de l'utilisateur.
- **Fréquence maîtrisée** : max 1 promo/semaine, jamais pendant la nuit (22h-7h).

---

## Stratégie par phase

### Phase 1 — Infrastructure promo (prêt à activer)

- [ ] **Collection Firestore `promotions/{promoId}`**
  ```typescript
  interface Promotion {
    id: string;
    title: string;              // "10% sur les couches Pampers"
    description: string;        // Description détaillée
    imageUrl?: string;          // Bannière visuelle
    promoCode?: string;         // Code promo à copier
    deepLink: string;           // URL vers le partenaire ou la page interne
    type: "partner" | "premium" | "referral" | "seasonal";
    category?: TipCategory;     // Lier aux catégories bébé (alimentation, sommeil...)
    ageMinMonths?: number;      // Ciblage par âge
    ageMaxMonths?: number;
    priority: number;
    startDate: Timestamp;
    endDate: Timestamp;
    active: boolean;
    maxImpressions?: number;    // Limite d'affichage globale
  }
  ```

- [ ] **Collection `user_promos/{userId}`** — tracking impressions/clics
  ```typescript
  interface UserPromos {
    seenPromos: string[];           // promoIds vus
    dismissedPromos: string[];      // promoIds fermés
    clickedPromos: string[];        // promoIds cliqués
    lastPromoShownAt?: Timestamp;   // Anti-spam
    referralCode?: string;          // Code parrainage unique
    referralCount: number;          // Nb de parrainages réussis
  }
  ```

- [ ] **Règles Firestore** :
  - `promotions` : lecture users authentifiés, écriture admin-only
  - `user_promos` : lecture/écriture owner seulement

- [ ] **Service `promoService.ts`** :
  - `fetchActivePromos(ageMonths: number): Promise<Promotion[]>`
  - `trackImpression(promoId: string): Promise<void>`
  - `trackClick(promoId: string): Promise<void>`
  - `dismissPromo(promoId: string): Promise<void>`

### Phase 2 — UI promo

- [ ] **PromoBanner component** — banner discret dans le dashboard
  - Position : en bas du scroll, après la chronologie récente
  - Layout : image/icône + titre + description + CTA ("Voir l'offre" / "Copier le code")
  - Dismiss : bouton X + haptic
  - Style : bordure dorée subtile pour différencier du contenu éditorial
  - Badge "Partenaire" ou "Premium" pour la transparence

- [ ] **PromoSheet** — bottom sheet pour les détails
  - Image large + description complète
  - Bouton "Copier le code" avec Clipboard + toast
  - Bouton "Ouvrir" avec deeplink vers le partenaire
  - Conditions : date de validité, CGU

- [ ] **Intégration home.tsx** — contrôlé par `marketing` toggle
  - Si `marketing: false` → aucune promo affichée
  - Si `marketing: true` → max 1 promo/session, anti-spam 24h

### Phase 3 — Samaye Premium (monétisation directe)

- [ ] **Offre Premium** — fonctionnalités avancées payantes
  - Export PDF illimité (actuellement limité ?)
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
  - `expo-in-app-purchases` ou `react-native-purchases` (RevenueCat)
  - RevenueCat recommandé : analytics, A/B testing, cross-platform, webhooks
  - Collection Firestore `subscriptions/{userId}` pour vérification serveur

### Phase 4 — Partenariats bébé (revenus partenaires)

- [ ] **Types de partenariats pertinents** :
  - **Couches** : Pampers, Lotus Baby, marques éco → codes promo mensuels
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

### Phase 5 — Programme de parrainage

- [ ] **Mécanique** :
  - Chaque utilisateur a un code parrainage unique (généré à l'inscription)
  - Partage via : SMS, WhatsApp, email, copier le lien
  - Le filleul s'inscrit avec le code → les deux reçoivent un avantage

- [ ] **Récompenses** :
  - Parrain : 1 mois Premium offert par parrainage (cumulable)
  - Filleul : 1 mois Premium offert à l'inscription
  - Paliers : 3 parrainages → badge "Ambassadeur", 10 → "Super Parent"

- [ ] **UI** :
  - Écran dédié dans Settings : "Inviter des parents"
  - Card dans le dashboard (contrôlé par `marketing` toggle)
  - Compteur de parrainages + historique

### Phase 6 — Contenu sponsorisé (dans le carousel tips)

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

1. **Promos anti-stress** : jamais de promo pendant un épisode de santé détecté. Si bébé a de la fièvre, pas de bannière "Achetez du Doliprane". C'est du respect, pas du marketing.

2. **Promos contextuelles intelligentes** : basées sur les données réelles de l'app (âge, type d'alimentation, saison, événements récents). Pas du spam générique.

3. **Transparence totale** : badge "Sponsorisé" sur tout contenu payé, charte éthique publique, pas de dark patterns.

4. **Valeur bidirectionnelle** : les promos doivent faire économiser l'utilisateur, pas juste générer du revenu. Si un code promo Pampers fait économiser 10€ au parent, tout le monde y gagne.

5. **Fréquence respectueuse** : max 1 promo/semaine, jamais la nuit, jamais pendant un moment stressant. La fatigue parentale n'est pas un levier marketing.

6. **Programme ambassadeur gamifié** : badges, paliers, récompenses cumulables. Les parents qui recommandent l'app sont récompensés durablement, pas avec un one-shot.

---

## KPIs à suivre

- **Taux d'opt-in marketing** : % d'utilisateurs avec `marketing: true` (objectif > 30%)
- **CTR promos** : clics / impressions (objectif > 5%)
- **Taux de conversion promo** : achats / clics (objectif > 2%)
- **Parrainages / utilisateur actif** : (objectif > 0.3)
- **Revenue per user (ARPU)** : revenu moyen mensuel par utilisateur
- **Churn rate post-promo** : % de désactivation du toggle après une promo (alerte si > 5%)

---

## Ordre d'implémentation recommandé

```
Phase 1 (infrastructure)     — préparer sans rien afficher
Phase 5 (parrainage)          — acquisition gratuite, forte viralité
Phase 3 (Premium)             — monétisation directe, RevenueCat
Phase 2 (UI promo)            — afficher les promos quand le contenu est prêt
Phase 4 (partenariats)        — quand la base utilisateurs justifie les négociations
Phase 6 (contenu sponsorisé)  — quand le carousel tips a prouvé son engagement
```

---

*Dernière mise à jour : 2026-03-18*
