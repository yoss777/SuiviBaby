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

## Estimations de revenus

### Scénario 10K utilisateurs actifs (objectif 6 mois)

| Source | Hypothèse | Revenu/an |
|---|---|---|
| Abonnements Premium (6% conversion) | 600 × 30€/an | **18 000€** |
| Abonnements Famille (2% conversion) | 200 × 40€/an | **8 000€** |
| Partenariats/affiliation | 5 partenaires × 200€/mois | **12 000€** |
| **Total** | | **~38 000€/an** |

### Scénario 50K utilisateurs actifs (objectif 18 mois)

| Source | Hypothèse | Revenu/an |
|---|---|---|
| Abonnements Premium (7% conversion) | 3500 × 30€/an | **105 000€** |
| Abonnements Famille (3% conversion) | 1500 × 40€/an | **60 000€** |
| Partenariats | 10 partenaires × 500€/mois | **60 000€** |
| **Total** | | **~225 000€/an** |

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
