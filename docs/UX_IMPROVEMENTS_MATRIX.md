# Matrice des améliorations UX — Samaye

> Suivi des améliorations UX appliquées aux 13 écrans tabs (8 sous-écrans + 5 tabs principaux).
> Dernière mise à jour : 2026-03-14 (audit code réel v2)

## Écrans concernés

### Sous-écrans (via Plus)

| Abrév. | Écran | Fichier |
|--------|-------|---------|
| PU | Pumping (Tire-lait) | `app/(drawer)/baby/(tabs)/pumping.tsx` |
| DI | Diapers (Couches) | `app/(drawer)/baby/(tabs)/diapers.tsx` |
| ME | Meals (Repas) | `app/(drawer)/baby/(tabs)/meals.tsx` |
| SO | Soins | `app/(drawer)/baby/(tabs)/soins.tsx` |
| RO | Routines | `app/(drawer)/baby/(tabs)/routines.tsx` |
| GR | Growth (Croissance) | `app/(drawer)/baby/(tabs)/growth.tsx` |
| AC | Activities (Activités) | `app/(drawer)/baby/(tabs)/activities.tsx` |
| MI | Milestones (Jalons) | `app/(drawer)/baby/(tabs)/milestones.tsx` |

### Tabs principaux (bottom bar)

| Abrév. | Écran | Fichier |
|--------|-------|---------|
| HO | Home (Accueil) | `app/(drawer)/baby/(tabs)/home.tsx` |
| CR | Croissance (Courbes) | `app/(drawer)/baby/(tabs)/croissance.tsx` |
| MO | Moments | `app/(drawer)/baby/(tabs)/moments.tsx` |
| CH | Chrono (Journal) | `app/(drawer)/baby/(tabs)/chrono.tsx` |
| PL | Plus / Stats | `app/(drawer)/baby/(tabs)/plus.tsx` / `stats.tsx` |

## Matrice de déploiement

> Basée sur audit du code réel (v2) — chaque ✅ vérifié par grep dans le fichier source.
> Critère : pattern présent dans le fichier du screen (pas dans un composant enfant).

| ID | Amélioration | PU | DI | ME | SO | RO | GR | AC | MI | HO | CR | MO | CH | PL | Statut |
|----|-------------|----|----|----|----|----|----|----|----|----|----|----|----|-----|--------|
| P1 | Skeleton shimmer loading | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | 🔴 | 🔴 | ✅ | 🔴 | n/a | 9/12 |
| P2 | LayoutAnimation expand/collapse par jour | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | n/a | 🔴 | n/a | 🔴 | n/a | 8/10 |
| P3 | Enhanced empty state | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | 🔴 | 🔴 | n/a | ✅ | ✅ | 10/12 |
| P4 | Date chip + clearDate | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | n/a | n/a | n/a | 🔴 | n/a | 8/9 |
| P5 | Soft-delete + undo toast | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | 🔴 | 🔴 | n/a | 🔴 | n/a | 8/11 |
| P6 | Toast on sheet success | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | 🔴 | 🔴 | 🔴 | 🔴 | n/a | 8/12 |
| P7 | rangeEndDate init mount | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | n/a | n/a | n/a | 🔴 | n/a | 8/9 |
| P8a | Conditional footer | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | n/a | ✅ | n/a | ✅ | n/a | 10/10 |
| P8b | Haptic feedback | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | 13/13 |
| P9a | Structured metrics (stats sous dayHeader) | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | n/a | n/a | n/a | n/a | ✅ | n/a | 8/8 |
| P9b | Pull-to-refresh | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | 13/13 |
| P10 | formatSelectedDateLabel | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | n/a | n/a | n/a | 🔴 | n/a | 8/9 |
| P11 | Android LayoutAnimation enabler | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | n/a | 🔴 | n/a | 🔴 | n/a | 8/10 |
| P12a | Swipe-to-delete | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | n/a | ✅ | n/a | ✅ | n/a | 10/10 |
| P12b | Error boundary | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | 13/13 |
| P13a | Delete confirm modal / soft delete | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | n/a | ✅ | n/a | 11/11 |
| P14a | sessionCard nc.* design tokens | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | 13/13 |
| P14b | Export CSV | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | n/a | n/a | n/a | n/a | ✅ | 9/9 |
| P15a | Accessibility labels | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | 13/13 |
| P15b | Multi-baby switcher | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | 13/13 |
| P16a | Dark mode nc.* tokens | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | 13/13 |
| P16b | Offline indicator | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | 13/13 |
| P17a | useMemo optimizations | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | 13/13 |
| P17b | Batch delete (SelectionToolbar) | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | n/a | n/a | n/a | n/a | n/a | 8/8 |
| P18a | Pagination / virtualisation | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | n/a | ✅ | n/a | ✅ | n/a | 10/10 |
| P19 | Offline queue (SQLite) | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | n/a | 12/12 |
| P20 | Race condition guards | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | 🔴 | ✅ | ✅ | ✅ | 12/13 |
| P22 | Realtime auto-refresh (onSnapshot) | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | 13/13 |
| P23 | Header ellipsis menu (HeaderMenu) | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | n/a | n/a | n/a | n/a | n/a | 8/8 |
| P21 | Theme tokens (hardcoded colors) | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | 13/13 |
| P24 | Batch delete confirm + undo | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | n/a | n/a | n/a | n/a | n/a | 8/8 |
| P25 | Touch targets 44px (quick actions) | n/a | n/a | n/a | ✅ | n/a | n/a | n/a | n/a | n/a | ✅ | ✅ | n/a | n/a | 3/3 |
| P26 | Swipe hint (peek animation) | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | n/a | n/a | n/a | n/a | n/a | 8/8 |
| P27 | Error retry toast (showActionToast) | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | 🔴 | 🔴 | n/a | 🔴 | n/a | 8/11 |
| P28 | Selection mode visual highlight | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | n/a | n/a | n/a | n/a | n/a | 8/8 |

## Légende

- ✅ = Implémenté et vérifié dans le code source du screen
- 🔴 = Applicable mais pas encore implémenté
- n/a = Non applicable à cet écran (nature incompatible)
- ~~P13b~~ = Search / filter bar — **Retiré** (les filtres par date suffisent, faible valeur ajoutée)

## Gaps identifiés (🔴)

| Écran | Améliorations manquantes | Count |
|-------|--------------------------|-------|
| **HO** (Home) | P1 (skeleton), P3 (empty state), P5 (soft-delete+undo), P6 (toast sheet), P27 (error retry) | 5 |
| **CR** (Croissance) | P1 (skeleton), P2 (LayoutAnimation), P3 (empty state), P5 (soft-delete+undo), P6 (toast sheet), P11 (Android LA), P20 (race guards), P27 (error retry) | 8 |
| **MO** (Moments) | P6 (toast sheet) | 1 |
| **CH** (Chrono) | P1 (skeleton), P2 (LayoutAnimation), P4 (date chip), P5 (soft-delete+undo), P6 (toast sheet), P7 (rangeEndDate), P10 (formatDateLabel), P11 (Android LA), P27 (error retry) | 9 |
| **PL** (Plus/Stats) | — | 0 |

## Composants partagés créés

| Composant | Fichier | Utilisé par |
|-----------|---------|-------------|
| SelectionToolbar | `components/ui/SelectionToolbar.tsx` | P17b — 8 sous-écrans |
| HeaderMenu | `components/ui/HeaderMenu.tsx` | P23 — 8 sous-écrans |
| useBatchSelect | `hooks/useBatchSelect.ts` | P17b — 8 sous-écrans |
| useSwipeHint | `hooks/useSwipeHint.ts` | P26 — 8 sous-écrans |

## Score

**278/301 applicables déployés** (92%) — 23 gaps restants sur 4 tabs principaux (HO, CR, MO, CH)
