# Audit UI/UX V3 — SuiviBaby (Expo SDK 58 / RN 0.88) : mesure après les tours 2 et 3

Date : 2026-11-12 · Branche lue : `origin/fix/uiux-audit-all` @ `8d49646` (lecture seule, worktree temporaire supprimé ensuite)
Références : V1 (`UI_UX_AUDIT.md`, 12/20 : 5 P0 / 25 P1 / 18 P2) et V2 (`UI_UX_AUDIT_V2.md`, `b3b831a`, 13/20 : 1 P0 / 14 P1 / 7 P2 restants, plus 2 P1 / 6 P2 nouveaux).
Écart lu : 15 commits, 145 fichiers, +4 098 / −2 294 lignes.

Méthode identique à V1 et V2 : grille native `impeccable` (5 dimensions notées de 0 à 4), heuristiques `emil-design-eng` / `apple-design` / `review-animations` / `break-ui`, checklist `make-interfaces-feel-better`, `accessibility` (WCAG 2.2 AA), règles `vercel-react-native-skills`, rappels `ui-ux-pro-max` (Pressable/ripple, cibles, retour au toucher). Les contrastes sont recalculés avec la formule WCAG, à partir des tokens réels et en réimplémentant `getAccentColors` (script dans le scratchpad). Le rendu n'a pas été vérifié sur appareil : les points marqués « à vérifier sur appareil » en dépendent.

Persona inchangé : parent épuisé, une main libre, 3 h du matin, luminosité minimale, mode sombre automatique de 22 h à 7 h.

---

## 0. Note de santé (même grille)

| # | Dimension | V1 | V2 | V3 | Constat principal V3 |
|---|-----------|----|----|----|----------------------|
| 1 | Accessibilité | 2 | 3 | **3** (solide) | Le P0 est corrigé : le bouton « Ajouter » atteint au moins 4,5:1 pour les 15 types dans les deux thèmes, et un test le verrouille. Le Journal passe à 44 pt. Les actions d'accessibilité existent sur les listes principales. Trois choses empêchent d'aller à 4 : environ 10 aplats destructifs restent en blanc sur `#ef4444` (3,76:1), dont la barre de suppression groupée ; 5 listes secondaires n'ont toujours que le glissement ; aucune passe Dynamic Type. |
| 2 | Performance | 3 | 3 | **3** | Le chrono est isolé dans `NursingElapsedText` et MealsForm ne se re-rend plus à chaque tick. Les bandeaux portent leur propre minuteur (15 s). Restent les fichiers géants, qui grossissent encore (MealsForm 2 110 lignes, SoinsForm 2 234), et `SheetFooter.setNode` appelé à chaque rendu. |
| 3 | Apparence et thème | 2 | 2 | **3** | Les tokens sont adoptés : 48 fichiers importent `tokens.ts`, 415 lignes utilisent `space.*`/`radius.*`, et le nombre de couleurs hex en dur passe de 435 à 182 (−58 %). Une seule palette de catégories : `eventColors` dérive de `itemColors`, Repas est corail partout. Un seul fond, et une teinte d'onglet corrigée. Restent deux rouges, l'élévation non tokenisée et quelques écrans figés en clair. |
| 4 | Conformité plateforme | 3 | 3 | **3** (haut de fourchette) | FA6 partout (avec un test de glyphes), feuille d'actions iOS et dialogue Android à l'appui long, ripple sur l'Accueil, le Journal et les formulaires. Mais 95 ripples sur 128 sont posés sur des formes arrondies sans `overflow: "hidden"`, 206 `TouchableOpacity` restent hors de ce périmètre et il y a toujours 3 familles d'icônes. |
| 5 | Adaptivité | 2 | 2 | **2** | Pas de progrès : `maxFontSizeMultiplier` apparaît 4 fois, les steppers restent en 48×48 fixes (`MealsForm.tsx:1684-1687`), il y a 22 hauteurs fixes dans les formulaires et le tableau de bord, et aucune mise en page tablette. |
| | **Total** | **12/20** | **13/20** | **14/20** | **Bon (bande 14-17).** Il n'y a plus de P0. Pour atteindre 16 : passer les aplats destructifs sur `destructive`, faire une passe Dynamic Type à 200 % (Adaptivité à 3) et borner les ripples (Plateforme à 4). |

### Bilan avant/après des 48 constats V1

| Priorité | Total V1 | V2 corrigés | **V3 corrigés** | V3 partiels | V3 non corrigés | Régressés |
|----------|---------|-------------|-----------------|-------------|-----------------|-----------|
| P0 | 5 | 3 | **5** | 0 | 0 | 0 |
| P1 | 25 | 11 | **16** | 8 | 1 | 0 |
| P2 | 18 | 11 | **14** | 3 | 1 | 0 |
| **Total** | **48** | **25 (52 %)** | **35 (73 %)** | **11 (23 %)** | **2 (4 %)** | **0** |

Constats nouveaux de V2 (N1 à N8) : **7 corrigés, 1 partiel** (N7, les rouges destructifs). Le partiel devient le P1 N-V3-1.
Nouveaux constats V3 : **0 P0, 1 P1** (N7 qui s'aggrave), **6 P2**. Aucune régression mesurable sur un constat déjà corrigé.

Constats ouverts au total : **0 P0, 10 P1, 10 P2** (V2 : 1 P0, 16 P1, 13 P2).

---

## 1. Vérification des annonces de l'équipe

| Annonce | Verdict | Preuve |
|---|---|---|
| Bouton « Ajouter » ≥ 4,5:1 pour les 15 types, dans les deux thèmes | **Vrai** | `components/ui/accentColors.ts:129-139` (`getFilled` : en clair, on fonce jusqu'à 30 % ; au-delà, texte `#111827` ; en sombre, texte `#111827` sur un aplat éclairci). Les 8 formulaires utilisent `filledBg` + `filledText` (par ex. `MealsForm.tsx:1551/1560`, `CroissanceForm.tsx:316/328`, `RoutinesForm.tsx:1085/1097`). Test : `__tests__/accentContrast.test.ts`. Ratios recalculés au §4 : minimum 4,51:1 (Repas en clair), maximum 10,54:1. |
| Un seul rouge destructif | **Partiel** | `DESTRUCTIVE_COLOR = neutralColors.destructive` (`ConfirmModal.tsx:45`), et `normalizeConfirmColor` convertit les anciens `nc.error`. Mais environ 10 aplats posent encore du blanc sur `nc.error` `#ef4444` (3,76:1) : voir N-V3-1. |
| Contraste de l'onglet actif | **Vrai** | `constants/theme.ts:13` : `tintColorLight = '#08739a'`, soit 5,11:1 sur `#f9fafb`. Onglet inactif `#687076` : 4,82:1. En sombre : 6,98 et 6,79:1. |
| Palette de catégories unifiée | **Vrai** | `constants/eventColors.ts` dérive de `itemColors`. `plus.tsx` ne contient plus aucun hex (`eventColors.*.dark`). |
| Hex 441 → 189 | **Vrai** (182 comptés en littéraux entre guillemets dans `app/`, `components/`, `hooks/`) | Points chauds restants : `RepasChart.tsx` (17), `croissance.tsx` (14), `chrono.tsx` (14), `pending-requests.tsx` (8). |
| Tokens d'espacement et de rayon (422 lignes) | **Vrai** (415 lignes, 48 fichiers importeurs contre 4 en V2) | `constants/tokens.ts`. L'élévation n'est pas adoptée : `elevation.card/raised` n'a qu'un seul usage, contre 32 `flatInDark`. |
| Le brouillon de tétée ne détourne plus les autres types (bandeau Reprendre/Abandonner, expiration 1 h en pause, 3 h en marche) | **Vrai** | `components/forms/nursingTimer.ts:38-39` (TTL), `:141-150` (`resolveNursingDraftOnOpen` : resume / offer / none), `:157-166` (`proposedMealDate` : l'heure de début ne s'applique qu'à une tétée). `MealsForm.tsx:592-605` (bandeau), `:379-397` (abandon confirmé + `clearNursingTimer`). Voir les effets de bord N-V3-5/6/7. |
| Faux positifs du garde-fou corrigés, feuille redimensionnable | **Vrai** | `MealsForm.tsx:412-432` (type exclu en création, `dateHeureDirty`, `resetBaseline` après restauration), `RoutinesForm.tsx:361`. `GlobalSheetManager.tsx:379-380` et suivants : seul `enablePanDownToClose` dépend de `isDirty`, `enablePanGestures={!isInPicker}`. |
| Re-rendus du chrono isolés | **Vrai** | `components/forms/NursingTimerDisplay.tsx:34-42,57-80`. Plus aucun `setInterval` dans MealsForm. |
| Suppression immédiate + annulation 8 s (confirmation seulement pour groupe, enfant, compte) | **Partiel** | Listes : `utils/softDeleteNow.ts` est adopté par home, chrono, croissance, routines, soins, growth, activities et milestones, et `ConfirmModal` ne sert plus qu'à la suppression groupée. Mais le bouton **« Supprimer » dans la feuille d'édition** des 8 formulaires passe toujours par `showConfirm`, supprime sans annulation et affiche un toast simple : `MealsForm.tsx:553-582`, `ActivitiesForm.tsx:396`, `DiapersForm.tsx:227`, `PumpingForm.tsx:186`, `CroissanceForm.tsx:196`, `RoutinesForm.tsx:531`, `MilestonesForm.tsx:399`, `SoinsForm.tsx:816`. Voir R-P1-12. |
| Menu à l'appui long + actions d'accessibilité dans le Journal et les listes | **Partiel** | Présents dans `chrono.tsx:1301-1320`, `RecentEventsList.tsx:544-566`, `croissance.tsx:693-710` et `EventListScreen.tsx:143-160` (meals, diapers, pumping), via `utils/rowActions.ts`. Absents de `routines.tsx:1284`, `soins.tsx:1186`, `activities.tsx:1159`, `milestones.tsx:1039` et `growth.tsx:1117`, qui n'ont que le glissement. |
| Boucles décoratives coupées la nuit et avec Réduire les animations | **Vrai** | `PulsingAura`, `PolaroidGallery`, `HeroMoodCard` et `GlobalFAB` consomment `useNightMode`. `SleepWidget.tsx:131-133` et `PromenadeWidget.tsx:84` coupent la nuit, et `startLoop` gère Réduire les animations. Les shimmers de chargement restent, ce qui est acceptable. |
| Inset du toast seulement au-dessus des onglets | **Vrai** | `utils/toastInset.ts:11-25`, `(tabs)/_layout.tsx:80-88` (`useIsFocused`, clavier). |
| Bandeau « Tétée en cours » sur l'Accueil | **Vrai** | `components/suivibaby/dashboard/NursingInProgressBanner.tsx`, monté dans `home.tsx:1695-1701`. Relu au focus, à la fermeture de la feuille et au retour au premier plan. `minHeight` suit le mode nuit. |
| Aperçu croissance-fusion seulement avec SHOW_PREVIEWS | **Vrai** | `constants/featureFlags.ts:8-26`, `croissance-fusion.tsx:45` (`Redirect`), `plus.tsx:251`. Le profil `internal-preview` est un APK, et le workflow iOS vaut `false` par défaut. |
| FontAwesome 5 entièrement remplacé par FA6 (test de glyphes) | **Vrai** | Aucun import FA5. `__tests__/fontAwesome6Glyphs.test.ts`. Les noms d'icônes des constantes `mci`/Ionicons ont été vérifiés contre les glyphmaps : rien ne manque. |
| Pressable + ripple sur l'Accueil, le Journal et les formulaires (118 conversions ; 208 restants ailleurs) | **Vrai, avec un défaut** | 0 `TouchableOpacity` dans `components/forms`, `home.tsx` et `chrono.tsx` ; 206 `<TouchableOpacity` dans 51 fichiers ailleurs (V2 : 325). Mais **95 des 128 Pressables à ripple sont arrondis sans `overflow: "hidden"`** : voir N-V3-2. |

---

## 2. Statut de chaque constat V1 (V2 → V3)

### P0

| # | V2 | V3 | Preuve |
|---|----|----|--------|
| P0-1 Bouton « Ajouter » illisible | Partiel | **Corrigé** | §1, §4 |
| P0-2 Blanc sur `todayAccent` | Résidu | **Corrigé** | `AllergiesEditor.tsx:152,163` : `nc.onTodayAccent` |
| P0-3 Modales sombres | Corrigé (résidu child-picker) | **Corrigé** | `app/child-picker.tsx` : plus aucun hex |
| P0-4 Chrono tétée | Corrigé | Corrigé | inchangé |
| P0-5 Pastilles du FAB | Corrigé | Corrigé | inchangé |

### P1

| # | V2 | V3 | Preuve V3 |
|---|----|----|-----------|
| P1-1 à P1-8 | Corrigés | Corrigés | inchangés ; P1-8 consolidé (N3 corrigé) |
| P1-9 Tétée invisible hors feuille | Partiel | **Corrigé** (dans l'app) | `NursingInProgressBanner.tsx`. La notification persistante ou la Live Activity restent une piste, mais ne sont pas bloquantes. |
| P1-10 Sélecteur d'enfant | Partiel | **Corrigé** | `app/(drawer)/_layout.tsx:84-86` (« Léa, changer d'enfant ») |
| P1-11 Toasts | Corrigé (N4) | **Corrigé** | N4 corrigé (`toastInset.ts`) |
| P1-12 Modale « irréversible » + Annuler | Partiel | **Partiel** | Listes : corrigé. Feuilles d'édition : confirmation, pas d'annulation (8 formulaires, voir §1). |
| P1-13 Supprimer au glissement seulement | Non corrigé | **Partiel** | Journal, Accueil, croissance, meals/diapers/pumping : corrigé. routines, soins, activities, milestones, growth : non. |
| P1-14 Mode nuit limité | Partiel | **Partiel** | 10 consommateurs (Accueil, FAB, voix, moments, bandeau, Skeleton) ; toujours aucun dans `FormBottomSheet`/`SheetFooterHost`/steppers. |
| P1-15 `PulsingAura` la nuit | Non corrigé | **Corrigé** | `PulsingAura.tsx` (`useNightMode`, `decorative`) |
| P1-16 Couleurs incohérentes | Partiel | **Corrigé** | `eventColors.ts` ← `itemColors` ; `plus.tsx` sans hex |
| P1-17 Tokens non adoptés | Partiel | **Partiel (avancé)** | 48 importeurs, hex 435 → 182. Résidus : `app/suivibaby/pending-requests.tsx:97,103,225-290` (écran entièrement en couleurs claires statiques, sans thème sombre : `#fff3cd`, `#d1ecf1`, `#e3f2fd`) ; `immunizations.tsx:2268-2278` (`#f5f6f8`, `#d7dbe0`, `#4a4f55`). |
| P1-18 Élévation non tokenisée | Partiel | **Partiel** | `elevation.*` : 1 usage ; `flatInDark` : 32 ; `chrono.tsx:664-668` (ombre en dur) |
| P1-19 Deux écrans Croissance | Non corrigé | **Non corrigé** | `croissance.tsx` (onglet) + `growth.tsx` (Plus > `/baby/growth`, `plus.tsx:116`). L'aperçu est masqué, mais rien n'a été tranché. |
| P1-20, P1-21 | Corrigés | Corrigés | |
| P1-22 Biométrie avant le compte | Partiel | **Partiel** | `app/(auth)/onboarding.tsx:99-104`, toujours proposée dans l'onboarding |
| P1-23 Pseudo obligatoire | Partiel | **Partiel** | `app/(auth)/login.tsx:404-405` (`validateNickname`) |
| P1-24 Cibles du Journal | Non corrigé | **Corrigé** | `chrono.tsx:557` (`filterChip` `minHeight: 44`), `:518` (`rangeChip`), `:810-811` (jours du calendrier 44×44), action Supprimer sur `destructive` (4,83:1) |
| P1-25 Dynamic Type | Partiel | **Partiel** (sans progrès) | `MealsForm.tsx:1684-1687` (48×48 fixe), 4 `maxFontSizeMultiplier` |

### P2

| # | V2 | V3 | Preuve V3 |
|---|----|----|-----------|
| P2-1, 2, 3, 9, 10, 11, 13, 14, 15, 16, 18 | Corrigés | Corrigés | |
| P2-4 Familles d'icônes | Non corrigé | **Partiel** | 3 familles au lieu de 4 : FA6 (80 imports), Ionicons (39 fichiers), MaterialCommunityIcons (14) |
| P2-5 Ripple | Partiel | **Partiel** | 128 `android_ripple`, mais 206 `TouchableOpacity` restent (settings, login, graphiques, immunizations, drawer) et le ripple n'est pas borné (N-V3-2) |
| P2-6 Vocabulaire | Partiel | **Partiel** | `plus.tsx:75` (« Mictions et selles »), `dashboardConfig.ts:83,350` (« Miction ») |
| P2-7 Nom de l'app | Partiel | **Corrigé** | `stats.tsx:906`, `ReferralCard.tsx:46` → `APP_NAME` |
| P2-8 Décimales | Partiel | **Corrigé** | `chrono.tsx:372`, `routines.tsx:1229` (`toDecimalInputFr` + espace insécable `°C`) |
| P2-12 Composants morts | Partiel | **Corrigé** | `BoundedNumberInput` supprimé (`db6acf7`) |
| P2-17 Fichiers géants | Non corrigé | **Non corrigé** (en hausse) | chrono 2 754, immunizations 2 409, SoinsForm 2 234 (contre 2 203), MealsForm 2 110 (contre 1 972) |

### Nouveaux constats V2

| # | V3 | Preuve |
|---|----|--------|
| N1 Brouillon de tétée qui détourne la feuille | **Corrigé** | §1 |
| N2 Aperçu en production | **Corrigé** | §1 |
| N3 Faux positifs du garde-fou, feuille figée | **Corrigé** | §1 |
| N4 Inset de toast global | **Corrigé** | §1 |
| N5 Re-rendu à 500 ms | **Corrigé** | `NursingElapsedText` ; `SheetFooter.tsx:31-33` (`setNode` à chaque rendu) reste sans conséquence maintenant que le formulaire ne tique plus |
| N6 Teinte d'onglet 4,43:1 | **Corrigé** | `#08739a` : 5,11:1 |
| N7 Trois rouges destructifs | **Partiel** | Voir N-V3-1 |
| N8 Doublons de tokens, `ONBOARDING_ACCENT` | **Corrigé** | `theme.ts:44` (`background: neutralColors.background`), `onboarding.tsx:36,148-150,225,235` (`nc.todayAccent`), slides mortes retirées |

---

## 3. Constats ouverts, classés

### P0 (0)

Aucun.

### P1 (10)

**N-V3-1 (nouveau, issu de N7). Environ 10 aplats destructifs restent en blanc sur `#ef4444` (3,76:1), et deux rouges coexistent dans les actions de glissement**
- Où :
  - suppression groupée : `components/ui/SelectionToolbar.tsx:47,53-54` (« Supprimer (n) ») ;
  - glissement : `routines.tsx:104`, `soins.tsx:91`, `activities.tsx:179`, `milestones.tsx:177` (alors que chrono, Accueil et EventListScreen utilisent `#dc2626`) ;
  - modale du drawer « Masquer » : `components/drawer/CustomDrawerContent.tsx:475,481` ;
  - `app/(auth)/pending-deletion.tsx:172,188` (« **Annuler la suppression** », une action de récupération affichée en rouge destructif : sens inversé, et 3,76:1) ;
  - `app/settings/join-child.tsx:437` (opacité 0,85, soit **3,19:1**) ;
  - `app/settings/export.tsx:1183` ;
  - `app/(auth)/login.tsx:883` (bouton principal passé en `#ef4444` en cas d'erreur de consentement, texte blanc en clair : 3,76:1) ;
  - `MealsForm.tsx:2042-2043` (« n'a pas aimé » en `#ef4444` en dur).
- Pourquoi : la suppression groupée est l'action la plus lourde de conséquences, et son libellé est le moins lisible. `errorTextColorGuard.test.ts` ne vérifie que les **textes** en `nc.error`, pas les aplats.
- Correctif :
  - remplacer `backgroundColor: nc.error` par `nc.destructive` et le texte par `nc.onDestructive` (4,83:1) partout où un texte est posé dessus ;
  - pour pending-deletion, utiliser `tint` + `onTint` (c'est une action positive) ;
  - pour join-child, retirer l'opacité ;
  - étendre le test de garde au motif `backgroundColor: nc.error` lorsqu'un `nc.white` suit dans les 10 lignes.

**R-P1-12. Deux modèles de suppression : listes immédiates + « Annuler », feuilles d'édition confirmées sans annulation**
- Où : `MealsForm.tsx:553-582` et les 7 autres `showConfirm` des formulaires (§1). La suppression est définitive dès la confirmation, et le `showToast` qui suit écrase (via `flushPendingUndo`) toute annulation encore en attente.
- Pourquoi : dans le Journal, toucher une ligne ouvre la feuille d'édition. Son bouton « Supprimer » est donc le chemin de suppression le plus visible, et c'est le seul sans filet. L'utilisateur apprend deux comportements contradictoires.
- Correctif : `onDelete` du formulaire → fermer la feuille, puis `softDeleteNow` côté écran (même message, même toast 8 s), sans confirmation. Garder la confirmation pour la suppression groupée, l'enfant et le compte.

**R-P1-13. Glissement seul sur 5 listes secondaires**
- Où : `routines.tsx:1284`, `soins.tsx:1186`, `activities.tsx:1159`, `milestones.tsx:1039`, `growth.tsx:1117`.
- Correctif : reprendre `buildRowAccessibilityActions` / `handleRowAccessibilityAction` / `showRowActionMenu` (`utils/rowActions.ts`), comme dans `EventListScreen.tsx:143-160`. L'idéal est de faire migrer ces écrans vers `EventListScreen`.

| # | Constat | Où | Correctif |
|---|---------|----|-----------|
| R-P1-14 | Mode nuit absent des formulaires | `FormBottomSheet.tsx`, `SheetFooterHost.tsx`, steppers | `minButtonSize` (56 pt) pour le pied et les steppers ; ou adoucir la promesse de l'onboarding |
| R-P1-17 | Écrans figés en clair, hex résiduels | `pending-requests.tsx:97-290`, `immunizations.tsx:2268-2278`, `RepasChart.tsx` (17) | Tokens thématiques ; règle ESLint `no-restricted-syntax` sur les hex dans `app/` et `components/` |
| R-P1-18 | Élévation non tokenisée | `chrono.tsx:664-668`, `home/styles.ts`, `StatsGroup.tsx`, 32 `flatInDark` | `elevation.card(scheme)` puis retirer `flatInDark` |
| R-P1-19 | Deux écrans Croissance | `croissance.tsx`, `growth.tsx`, `plus.tsx:116` | Trancher : l'onglet absorbe les outils de growth ; Plus > Croissance ouvre l'onglet |
| R-P1-22 | Biométrie avant le compte | `onboarding.tsx:99-104` | La proposer après la première saisie réussie |
| R-P1-23 | Pseudo obligatoire | `login.tsx:404-405` | Optionnel (prénom Apple/Google ou début de l'e-mail) |
| R-P1-25 | Dynamic Type | `MealsForm.tsx:1684-1687` et steppers des autres formulaires, 22 hauteurs fixes | `minWidth`/`minHeight` ; tester à 200 % (Accueil, Repas, Journal) |

### P2 (10)

**Nouveaux (6)**

| # | Constat | Où | Correctif |
|---|---------|----|-----------|
| N-V3-2 | **Ripple non borné aux coins arrondis** : 95 des 128 Pressables à `android_ripple` ont un `borderRadius` sans `overflow: "hidden"`. Sous Android, le ripple de RN utilise un masque rectangulaire : coins carrés au toucher sur le bouton « Ajouter » (rayon 14), les puces en pilule (999), les cartes du Journal et de l'Accueil, le bandeau Tétée. Le propre commentaire de `components/ui/pressFeedback.ts:7-10` l'exige pourtant. Double retour sur `NursingInProgressBanner.tsx:85-95` (fond changé au toucher + ripple). À vérifier sur appareil. | `chrono.tsx:884,960,1294`, `MealsForm.tsx:613…1547` (22), `SoinsForm` (14), `RoutinesForm` (10), `PumpingForm` (8), `DiapersForm` (7), `RecentEventsList.tsx:532`, `SleepWidget.tsx:226-304`, `NursingInProgressBanner.tsx:85`… (liste complète via `scratchpad/v3tools/ripple.py`) | `overflow: "hidden"` sur Android seulement (`Platform.select`) pour garder les ombres iOS, ou un wrapper arrondi ; supprimer le changement de fond quand le ripple est actif ; ajouter un test de garde (ripple + borderRadius ⇒ overflow) |
| N-V3-3 | **Appui long invisible** : aucun indice visuel, aucun retour haptique à l'ouverture du menu, aucun indice d'accessibilité. Le glissement reste le seul geste visible. | `utils/rowActions.ts:48-90`, `chrono.tsx:1301` | `Haptics.impactAsync(Medium)` à l'appui long ; indice unique dans le Journal (« Appui long : modifier ou supprimer ») ; ou un bouton « … » discret en fin de ligne |
| N-V3-4 | **Annulation à emplacement unique** : tout toast suivant (y compris le toast de suppression d'un formulaire, « La tétée reste chronométrée » ou une confirmation d'enregistrement) valide aussitôt la suppression en attente. Deux suppressions de suite : seule la dernière reste annulable, sans que l'interface le dise. Sur les écrans de pile (routines, soins…), quitter l'écran avant 8 s perd `hiddenIds` : la ligne réapparaît jusqu'à la suppression serveur. | `contexts/ToastContext.tsx:95-104,125-126,143-145`, `utils/softDeleteNow.ts:35-38` | Pile de suppressions en attente (« 2 éléments supprimés · Annuler ») ; ne pas vider pour un toast informatif (le mettre en file) ; garder les ids masqués dans un store partagé (contexte) plutôt que dans l'état de l'écran |
| N-V3-5 | **Tétée en pause perdue en silence** : à la fermeture de la feuille, le toast ne s'affiche que si un côté tourne. Une tétée en pause et non enregistrée n'est signalée que par le bandeau de l'Accueil, puis supprimée sans trace au bout d'une heure (`loadNursingTimer` → `removeItem`). | `MealsForm.tsx:352-361`, `nursingTimer.ts:38,124-127,216-218` | Toast aussi en pause (« Tétée de 12 min non enregistrée · Enregistrer ») ; à l'expiration, proposer « Enregistrer / Effacer » au lieu d'effacer ; ou porter le TTL de la pause à 3 h |
| N-V3-6 | **Bouton « Abandonner » du bandeau de brouillon** : `textLight` sur `softBg` corail = **4,21:1** en clair (4,06:1 sur `#f9fafb`) | `MealsForm.tsx:600` (`mutedText: nc.textLight`) | `mutedText: nc.textNormal` (≥ 7:1), ou `accentColors.softText` |
| N-V3-7 | **Live region bavarde** : le libellé du bandeau (`accessibilityLiveRegion="polite"`) change chaque minute pendant une tétée en cours, et TalkBack relit « Tétée en cours · N min » tant que la feuille est ouverte | `NursingTimerDisplay.tsx:131-134` | Retirer la live region (l'apparition du bandeau peut être annoncée une fois via `announceForAccessibility`) |

**Restants (4)** : P2-4 (3 familles d'icônes : migrer les Ionicons de settings/drawer vers FA6), P2-5 (206 `TouchableOpacity`, en priorité `immunizations.tsx` 12, `premium.tsx` 11, `edit-child.tsx` 11, `login.tsx` 11), P2-6 (`plus.tsx:75`, `dashboardConfig.ts:83,350` → « Couche pipi », « Couche selle »), P2-17 (découper chrono, immunizations, SoinsForm et MealsForm ; extraire `NursingSection` et `SolideSection` de MealsForm).

À vérifier sur appareil, sans le classer : un toast affiché pendant qu'une feuille est ouverte sur un onglet se pose à `tabBarHeight + 12` (`toastInset.ts:35-39`), c'est-à-dire sur le pied collant « Annuler / Ajouter » de la feuille. Les toasts sans action ne bloquent pas le toucher (`pointerEvents="none"`), mais ils masquent le bouton.

---

## 4. Contrastes recalculés (tokens réels)

**Bouton principal des formulaires (`getAccentColors(eventColors[t].dark, scheme)`)**

| Type | Accent | Clair : fond / texte / ratio | Sombre : fond / ratio (texte `#111827`) |
|---|---|---|---|
| Repas | `#E8785A` | `#b55e46` / blanc / **4,51** | `#E8785A` / 6,14 |
| Tétée | `#D66B8F` | `#af5875` / blanc / 4,69 | 5,37 |
| Tire-lait | `#6BA47C` | `#538061` / blanc / 4,54 | 6,10 |
| Miction | `#5BA4A4` | `#457d7d` / blanc / 4,68 | 6,16 |
| Selle | `#A47C5B` | `#906d50` / blanc / 4,68 | 4,74 |
| Vitamine | `#E8A85A` | `#E8A85A` / `#111827` / 8,60 | 8,60 |
| Vaccin | `#8B7CB4` | `#7a6d9e` / blanc / 4,66 | 4,76 |
| Sommeil | `#7C6BA4` | `#7C6BA4` / blanc / 4,67 | `#897aad` / 4,60 |
| Bain | `#5AADE8` | `#3f79a2` / blanc / 4,70 | 7,25 |
| Température | `#E85A5A` | `#c84d4d` / blanc / 4,54 | 5,10 |
| Médicament | `#5A8BE8` | `#4c75c3` / blanc / 4,53 | 5,32 |
| Symptôme | `#E85A8B` | `#c34c75` / blanc / 4,55 | 5,29 |
| Activité | `#8BC46B` | `#8BC46B` / `#111827` / 8,62 | 8,62 |
| Jalon | `#E8A85A` | `#E8A85A` / `#111827` / 8,60 | 8,60 |
| Croissance | `#E8C45A` | `#E8C45A` / `#111827` / 10,54 | 10,54 |
| Nez | `#6BA4A4` | `#517d7d` / blanc / 4,59 | 6,31 |

15 sur 15 passent, dans les deux thèmes. Deux remarques : en clair, plusieurs boutons sont juste au-dessus du seuil (4,51 à 4,55), et l'aplat foncé change de teinte (Repas passe du corail au terre cuite `#b55e46`). C'est acceptable, mais la marge est mince : ne pas éclaircir les accents sans relancer le test.

**Autres paires**

| Paire | Ratio | Verdict |
|---|---|---|
| Onglet actif clair `#08739a` / `#f9fafb` | 5,11 | OK (N6 corrigé) |
| Onglet inactif clair `#687076` / `#f9fafb` ; sombre `#9BA1A6` / `#111827` | 4,82 ; 6,79 | OK |
| `onTint` sombre `#111827` / `#60a5fa` | 6,98 | OK |
| `onDestructive` blanc / `#dc2626` | 4,83 | OK |
| Blanc / `nc.error` `#ef4444` (SelectionToolbar, glissements secondaires, drawer, pending-deletion, export, login) | **3,76** | ✗ N-V3-1 |
| Blanc / `#ef4444` à 0,85 sur blanc (join-child) | **3,19** | ✗ N-V3-1 |
| Bandeau Accueil « Reprendre » `#A83F23` / `#FEF5F3` ; sombre `#E8785A` / `#2d1a14` | 5,76 ; 5,72 | OK |
| Bandeau brouillon « Abandonner » `#6b7280` / `#fcece8` | **4,21** | ✗ N-V3-6 |
| Bandeau brouillon « Abandonner » sombre `#9ca3af` / `#402d32` | 5,05 | OK |
| Toast `#fff` / `#374151` ; action `#93c5fd` | 10,31 ; 5,72 | OK |

---

## 5. Feuille de route

**Avant le prochain build (environ une demi-journée)**
1. N-V3-1 : `nc.error` → `nc.destructive` + `onDestructive` sur les ~10 aplats ; pending-deletion en `tint`. Étendre le test de garde aux aplats. Environ 45 min.
2. N-V3-6 et N-V3-7 : couleur d'« Abandonner », retrait de la live region. 10 min.
3. N-V3-2 : `overflow: "hidden"` (Android) sur les boutons du pied et les puces des formulaires, au minimum ; test de garde. Environ 1 h.

**Court terme (2 à 3 jours)**
- R-P1-12 : suppression depuis la feuille d'édition → `softDeleteNow` + annulation, sans confirmation.
- R-P1-13 : actions d'accessibilité et appui long sur routines, soins, activities, milestones et growth (ou migration vers `EventListScreen`).
- N-V3-4 (pile d'annulation), N-V3-5 (tétée en pause non perdue), N-V3-3 (haptique et indice d'appui long).

**Chantiers**
- Passe Dynamic Type à 200 % (R-P1-25) : c'est le levier pour faire passer l'Adaptivité à 3.
- Décision Croissance (R-P1-19), biométrie après la première saisie, pseudo optionnel (R-P1-22/23).
- Élévation tokenisée, écrans figés en clair (R-P1-17/18), mode nuit dans les formulaires (R-P1-14).
- Migration des 206 `TouchableOpacity` restants, familles d'icônes, découpage des fichiers géants (P2-4/5/17).

Projection : N-V3-1 + R-P1-12/13 donnent une Accessibilité proche de 4 ; Dynamic Type donne une Adaptivité à 3 ; ripples bornés + migration Pressable donnent une Plateforme à 4. Cible **16 à 17/20**.
