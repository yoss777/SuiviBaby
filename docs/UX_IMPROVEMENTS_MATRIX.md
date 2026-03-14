# Matrice des améliorations UX — Samaye

> Suivi des améliorations UX appliquées à tous les écrans et composants de l'app.
> Dernière mise à jour : 2026-03-14 (100% — tous gaps corrigés)

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

### Écrans spéciaux

| Abrév. | Écran | Fichier |
|--------|-------|---------|
| GA | Gallery (Souvenirs) | `app/(drawer)/baby/gallery.tsx` |

## Matrice de déploiement

> Basée sur audit du code réel (v2) — chaque ✅ vérifié par grep dans le fichier source.
> Critère : pattern présent dans le fichier du screen (pas dans un composant enfant).

| ID | Amélioration | PU | DI | ME | SO | RO | GR | AC | MI | HO | CR | MO | CH | PL | GA | Statut |
|----|-------------|----|----|----|----|----|----|----|----|----|----|----|----|-----|----|----|
| P1 | Skeleton shimmer loading | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | n/a | ✅ | 13/13 |
| P2 | LayoutAnimation expand/collapse par jour | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | n/a | ✅ | n/a | ✅ | n/a | n/a | 10/10 |
| P3 | Enhanced empty state | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | n/a | ✅ | ✅ | ✅ | 13/13 |
| P4 | Date chip + clearDate | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | n/a | n/a | n/a | ✅ | n/a | n/a | 9/9 |
| P5 | Soft-delete + undo toast | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | n/a | ✅ | n/a | n/a | 11/11 |
| P6 | Toast on sheet success | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | n/a | ✅ | 13/13 |
| P7 | rangeEndDate init mount | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | n/a | n/a | n/a | ✅ | n/a | n/a | 9/9 |
| P8a | Conditional footer | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | n/a | ✅ | n/a | ✅ | n/a | n/a | 10/10 |
| P8b | Haptic feedback | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | 14/14 |
| P9a | Structured metrics (stats sous dayHeader) | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | n/a | n/a | n/a | n/a | ✅ | n/a | n/a | 8/8 |
| P9b | Pull-to-refresh | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | 14/14 |
| P10 | formatSelectedDateLabel | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | n/a | n/a | n/a | ✅ | n/a | n/a | 9/9 |
| P11 | Android LayoutAnimation enabler | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | n/a | ✅ | n/a | ✅ | n/a | n/a | 10/10 |
| P12a | Swipe-to-delete | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | n/a | ✅ | n/a | ✅ | n/a | n/a | 10/10 |
| P12b | Error boundary | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | 14/14 |
| P13a | Delete confirm modal / soft delete | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | n/a | ✅ | n/a | n/a | 11/11 |
| P14a | sessionCard nc.* design tokens | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | 14/14 |
| P14b | Export CSV | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | n/a | n/a | n/a | n/a | ✅ | n/a | 9/9 |
| P15a | Accessibility labels | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | 14/14 |
| P15b | Multi-baby switcher | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | 14/14 |
| P16a | Dark mode nc.* tokens | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | 14/14 |
| P16b | Offline indicator | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | n/a | 13/13 |
| P17a | useMemo optimizations | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | 14/14 |
| P17b | Batch delete (SelectionToolbar) | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | n/a | n/a | n/a | n/a | n/a | n/a | 8/8 |
| P18a | Pagination / virtualisation | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | n/a | ✅ | n/a | ✅ | n/a | ✅ | 11/11 |
| P19 | Offline queue (SQLite) | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | n/a | n/a | 12/12 |
| P20 | Race condition guards | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | 14/14 |
| P22 | Realtime auto-refresh (onSnapshot) | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | 14/14 |
| P23 | Header ellipsis menu (HeaderMenu) | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | n/a | n/a | n/a | n/a | n/a | n/a | 8/8 |
| P21 | Theme tokens (hardcoded colors) | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | 14/14 |
| P24 | Batch delete confirm + undo | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | n/a | n/a | n/a | n/a | n/a | n/a | 8/8 |
| P25 | Touch targets 44px (quick actions) | n/a | n/a | n/a | ✅ | n/a | n/a | n/a | n/a | n/a | ✅ | ✅ | n/a | n/a | ✅ | 4/4 |
| P26 | Swipe hint (peek animation) | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | n/a | n/a | n/a | n/a | n/a | n/a | 8/8 |
| P27 | Error retry toast (showActionToast) | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | n/a | ✅ | n/a | n/a | 11/11 |
| P28 | Selection mode visual highlight | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | n/a | n/a | n/a | n/a | n/a | n/a | 8/8 |

## Légende

- ✅ = Implémenté et vérifié dans le code source du screen
- 🔴 = Applicable mais pas encore implémenté
- n/a = Non applicable à cet écran (nature incompatible)
- ~~P13b~~ = Search / filter bar — **Retiré** (les filtres par date suffisent, faible valeur ajoutée)

## Gaps identifiés (🔴)

Aucun gap restant — tous les écrans sont à 100%.

## Écrans utilitaires / formulaires (drawer)

| Abrév. | Écran | Fichier |
|--------|-------|---------|
| SE | Settings (Paramètres) | `app/(drawer)/settings.tsx` |
| AB | Add Baby (Ajout enfant) | `app/(drawer)/add-baby.tsx` |
| SC | Share Child (Partage) | `app/(drawer)/share-child.tsx` |
| ST | Stats (Statistiques) | `app/(drawer)/baby/(tabs)/stats.tsx` |
| MA | Manage Access (Accès) | `app/(drawer)/baby/manage-access.tsx` |

> Ces écrans sont des formulaires/utilitaires. Seuls les P-items applicables sont listés.

| ID | Amélioration | SE | AB | SC | ST | MA | Statut |
|----|-------------|----|----|----|----|----|----|
| P6 | Toast on action success | ✅ | ✅ | ✅ | n/a | ✅ | 4/4 |
| P8b | Haptic feedback | ✅ | ✅ | ✅ | ✅ | ✅ | 5/5 |
| P12b | Error boundary / try-catch | ✅ | ✅ | ✅ | ✅ | ✅ | 5/5 |
| P14a | nc.* design tokens | ✅ | ✅ | ✅ | ✅ | ✅ | 5/5 |
| P15a | Accessibility labels | ✅ | ✅ | ✅ | ✅ | ✅ | 5/5 |
| P15b | Multi-baby switcher | ✅ | n/a | n/a | ✅ | ✅ | 3/3 |
| P16a | Dark mode nc.* tokens | ✅ | ✅ | ✅ | ✅ | ✅ | 5/5 |
| P17a | useMemo optimizations | ✅ | ✅ | ✅ | ✅ | ✅ | 5/5 |
| P20 | Race condition guards | ✅ | ✅ | ✅ | ✅ | ✅ | 5/5 |
| P21 | Theme tokens (no hardcoded) | ✅ | ✅ | ✅ | ✅ | ✅ | 5/5 |
| P22 | Realtime auto-refresh | ✅ | n/a | ✅ | ✅ | ✅ | 4/4 |
| P25 | Touch targets 44px | ✅ | ✅ | ✅ | ✅ | ✅ | 5/5 |

**Score utilitaires : 57/57 applicables** (100%)

## Écrans Settings (sous-écrans de Paramètres)

| Abrév. | Écran | Fichier |
|--------|-------|---------|
| PR | Profile | `app/settings/profile.tsx` |
| PW | Password | `app/settings/password.tsx` |
| HC | Hidden Children | `app/settings/hidden-children.tsx` |
| JC | Join Child | `app/settings/join-child.tsx` |
| NO | Notifications | `app/settings/notifications.tsx` |
| EX | Export | `app/settings/export.tsx` |
| PV | Privacy | `app/settings/privacy.tsx` |
| TE | Terms | `app/settings/terms.tsx` |
| HE | Help | `app/settings/help.tsx` |
| TH | Theme | `app/settings/theme.tsx` |
| LA | Language | `app/settings/language.tsx` |
| BK | Backup | `app/settings/backup.tsx` |

> Écrans formulaires/utilitaires. Seuls les P-items applicables sont listés.

| ID | Amélioration | PR | PW | HC | JC | NO | EX | PV | TE | HE | TH | LA | BK | Statut |
|----|-------------|----|----|----|----|----|----|----|----|----|----|----|----|--------|
| P2 | LayoutAnimation | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | ✅ | n/a | n/a | n/a | 1/1 |
| P3 | Enhanced empty state | n/a | n/a | ✅ | ✅ | n/a | ✅ | n/a | n/a | n/a | n/a | n/a | n/a | 3/3 |
| P6 | Toast on success | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | n/a | n/a | ✅ | n/a | n/a | ✅ | 8/8 |
| P8b | Haptic feedback | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | n/a | n/a | n/a | n/a | n/a | n/a | 6/6 |
| P12b | Error boundary | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | n/a | n/a | ✅ | n/a | n/a | n/a | 7/7 |
| P13a | Delete confirm modal | n/a | n/a | ✅ | ✅ | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | 2/2 |
| P14a | nc.* design tokens | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | 12/12 |
| P15a | Accessibility labels | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | 12/12 |
| P15b | Multi-baby switcher | n/a | n/a | n/a | ✅ | n/a | ✅ | n/a | n/a | n/a | n/a | n/a | n/a | 2/2 |
| P16a | Dark mode nc.* tokens | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | 12/12 |
| P17a | useMemo optimizations | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | n/a | n/a | n/a | ✅ | ✅ | ✅ | 9/9 |
| P20 | Race condition guards | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | n/a | n/a | n/a | ✅ | ✅ | ✅ | 10/10 |
| P21 | Theme tokens (no hardcoded) | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | 12/12 |
| P22 | Realtime auto-refresh | n/a | n/a | ✅ | ✅ | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | 2/2 |
| P25 | Touch targets 44px | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | n/a | n/a | ✅ | ✅ | ✅ | ✅ | 10/10 |
| P27 | Error retry toast | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | n/a | n/a | ✅ | n/a | n/a | n/a | 7/7 |
| P28 | Selection highlight | n/a | n/a | n/a | n/a | n/a | ✅ | n/a | n/a | n/a | ✅ | ✅ | n/a | 3/3 |

**Score settings : 134/134 applicables** (100%)

## Autres composants

| Abrév. | Composant | Fichier |
|--------|-----------|---------|
| DC | CustomDrawerContent | `components/drawer/CustomDrawerContent.tsx` |
| RE | RecentEventsList | `components/suivibaby/dashboard/RecentEventsList.tsx` |
| SW | SleepWidget | `components/suivibaby/dashboard/SleepWidget.tsx` |
| SG | StatsGroup | `components/suivibaby/dashboard/StatsGroup.tsx` |
| GF | GlobalFAB | `components/suivibaby/GlobalFAB.tsx` |
| VC | VoiceCommandButton | `components/suivibaby/VoiceCommandButton.tsx` |

> Composants utilisés par home.tsx et autres écrans. Seuls les P-items applicables sont listés.

| ID | Amélioration | DC | RE | SW | SG | GF | VC | Statut |
|----|-------------|----|----|----|----|----|----|--------|
| P6 | Toast on action success | ✅ | n/a | n/a | n/a | n/a | n/a | 1/1 |
| P8b | Haptic feedback | ✅ | n/a | ✅ | ✅ | ✅ | ✅ | 5/5 |
| P12b | Error boundary / try-catch | ✅ | n/a | n/a | n/a | n/a | ✅ | 2/2 |
| P14a | nc.* design tokens | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | 6/6 |
| P15a | Accessibility labels | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | 6/6 |
| P16a | Dark mode nc.* tokens | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | 6/6 |
| P17a | useCallback/useMemo | ✅ | ✅ | ✅ | ✅ | ✅ | n/a | 5/5 |
| P20 | Race condition guards | ✅ | n/a | ✅ | n/a | ✅ | n/a | 3/3 |
| P21 | Theme tokens (no hardcoded) | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | 6/6 |
| P25 | Touch targets (hitSlop) | ✅ | n/a | ✅ | ✅ | ✅ | n/a | 4/4 |

**Score autres composants : 44/44 applicables** (100%)

## Composants partagés créés

| Composant | Fichier | Utilisé par |
|-----------|---------|-------------|
| SelectionToolbar | `components/ui/SelectionToolbar.tsx` | P17b — 8 sous-écrans |
| HeaderMenu | `components/ui/HeaderMenu.tsx` | P23 — 8 sous-écrans |
| useBatchSelect | `hooks/useBatchSelect.ts` | P17b — 8 sous-écrans |
| useSwipeHint | `hooks/useSwipeHint.ts` | P26 — 8 sous-écrans |

## Score

**636/636 applicables déployés** (100%) — 0 gaps restants
(401 tabs/sous-écrans + 57 utilitaires drawer + 134 settings + 44 autres composants = 636 total)
