# Matrice des améliorations UX — Samaye

> Suivi des améliorations UX appliquées aux 8 écrans tabs.
> Dernière mise à jour : 2026-03-13

## Écrans concernés

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

## Matrice de déploiement

| ID | Amélioration | PU | DI | ME | SO | RO | GR | AC | MI | Statut |
|----|-------------|----|----|----|----|----|----|----|----|--------|
| P1 | Skeleton shimmer loading | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | Done |
| P2 | LayoutAnimation expand/collapse par jour | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | Done |
| P3 | Enhanced empty state | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | Done |
| P4 | Date chip + clearDate | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | Done |
| P5 | Soft-delete + undo toast | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | Done |
| P6 | Toast on sheet success | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | Done |
| P7 | rangeEndDate init mount | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | Done |
| P8a | Conditional footer | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | Done |
| P8b | Haptic feedback | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | Done |
| P9a | Structured metrics (stats sous dayHeader) | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | n/a | Done |
| P9b | Pull-to-refresh | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | Done |
| P10 | formatSelectedDateLabel | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | Done |
| P11 | Android LayoutAnimation enabler | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | Done |
| P12a | Swipe-to-delete | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | Done |
| P12b | Error boundary | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | Done (root) |
| P13a | Delete confirm modal / soft delete | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | Done |
| P14a | sessionCard nc.* design tokens | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | Done |
| P14b | Export CSV | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | Done (global via plus.tsx) |
| P15a | Accessibility labels | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | Done |
| P15b | Multi-baby switcher | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | Done (global header) |
| P16a | Dark mode nc.* tokens | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | Done |
| P16b | Offline indicator | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | Done (global) |
| P17a | useMemo optimizations | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | Done |
| P17b | Batch delete (SelectionToolbar) | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | Done |
| P18a | Pagination / virtualisation | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | Done |
| P19 | Offline queue (SQLite) | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | Done (global eventsService) |
| P20 | Race condition guards | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | Done |
| P22 | Realtime auto-refresh (onSnapshot) | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | Done |
| P23 | Header ellipsis menu (HeaderMenu) | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | Done |
| P21 | Theme tokens (hardcoded colors) | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | Done |

## Légende

- ✅ = Implémenté et déployé
- 🔴 = À faire (backlog)
- n/a = Non applicable à cet écran
- ~~P13b~~ = Search / filter bar — **Retiré** (les filtres par date suffisent, faible valeur ajoutée)

## Composants partagés créés

| Composant | Fichier | Utilisé par |
|-----------|---------|-------------|
| SelectionToolbar | `components/ui/SelectionToolbar.tsx` | P17b — 8 écrans |
| HeaderMenu | `components/ui/HeaderMenu.tsx` | P23 — 8 écrans |
| useBatchSelect | `hooks/useBatchSelect.ts` | P17b — 8 écrans |

## Score

**30/30 améliorations déployées** (P13b retiré)
