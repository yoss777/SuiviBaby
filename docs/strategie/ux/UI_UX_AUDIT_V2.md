# Audit UI/UX V2 — SuiviBaby (Expo SDK 58 / RN 0.88) : mesure des progrès

Date : 2026-11-12 · Branche lue : `origin/fix/uiux-audit-all` @ `b3b831a` (lecture seule, worktree temporaire supprimé ensuite)
Référence : audit V1 (`UI_UX_AUDIT.md`, lu sur `fix/premium-offer-compliance` @ `4e88d04`), 12/20, 5 P0 / 25 P1 / 18 P2.
Méthode identique : grille native `impeccable` (audit.native, 5 dimensions notées de 0 à 4), heuristiques `emil-design-eng` / `apple-design` / `review-animations` / `break-ui`, checklist `make-interfaces-feel-better`, `accessibility` (WCAG 2.2 AA), règles `vercel-react-native-skills`, rappels `ui-ux-pro-max` (hitSlop, Pressable/ripple, retour au toucher). Ratios de contraste calculés avec la formule WCAG à partir des tokens réels (`constants/theme.ts`, `constants/dashboardColors.ts`, `constants/eventColors.ts`, `components/ui/accentColors.ts`).

Persona inchangé : parent épuisé, une main libre, 3 h du matin, luminosité minimale, mode sombre automatique de 22 h à 7 h.

---

## 0. Note de santé (même grille)

| # | Dimension | V1 | V2 | Constat principal V2 |
|---|-----------|----|----|----------------------|
| 1 | Accessibilité | 2 | **3** | Le lecteur d'écran fonctionne maintenant sur les parcours clés : chrono tétée, cartes du résumé (avec « il y a… »), humeur en radio, toasts annoncés, carrousel sans défilement automatique pour VoiceOver et TalkBack, Réduire les animations respecté. Reste un trou majeur : le **bouton « Ajouter » réel des formulaires** est sous 4,5:1 dans les deux thèmes (voir P0-1). C'est un 3 fragile. |
| 2 | Performance | 3 | **3** | Inchangé dans l'ensemble. Nouveau : le chrono tétée fait re-rendre deux fois par seconde un formulaire de 1 972 lignes et son pied collant. |
| 3 | Apparence et thème | 2 | **2** (haut de fourchette) | Les éblouissements du mode sombre ont disparu (modales, FAB, FirstTrackGuide, toast, couture d'en-tête). Il y a maintenant des tokens (`onTint`, `tokens.ts`, `destructive`) mais seuls 4 fichiers les utilisent. Il reste 435 couleurs hex en dur (536 en V1, soit −19 %), trois rouges « destructifs » et deux fonds « background ». |
| 4 | Conformité plateforme | 3 | **3** | Retour Android correct sur les modales et sur la feuille protégée, ripple sur les composants partagés, une seule famille d'icônes (FA6, 24 pt) dans la barre d'onglets. La majorité des boutons restent en `TouchableOpacity`, sans ripple. |
| 5 | Adaptivité | 2 | **2** | Les boutons d'humeur sont en `minHeight`, les libellés d'onglets plafonnés. Ailleurs, les hauteurs fixes restent (puces, steppers 48×48) et il n'y a toujours pas de mise en page tablette. |
| | **Total** | **12/20** | **13/20** | **Acceptable (bande 10-13), au seuil de « Bon ». Corriger P0-1 fait passer l'accessibilité à un 3 solide ; adopter les tokens fait passer le thème à 3 : on arrive alors à 15/20.** |

### Bilan avant/après des 48 constats V1

| Priorité | Total V1 | Corrigés | Partiels | Non corrigés | Régressés |
|----------|---------|----------|----------|--------------|-----------|
| P0 | 5 | 3 | 2 | 0 | 0 |
| P1 | 25 | 11 | 10 | 4 | 0 |
| P2 | 18 | 11 | 5 | 2 | 0 |
| **Total** | **48** | **25 (52 %)** | **17 (35 %)** | **6 (13 %)** | **0** |

Nouveaux constats introduits par les correctifs : **0 P0, 2 P1, 6 P2** (dont une petite régression de contraste sur la barre d'onglets, N6).

Ce qui est nettement mieux : la saisie nocturne (pied collant, garde-fou de perte, chrono horodaté et persisté, stepper à l'appui et non au contact, presets biberon, dernière quantité reprise), le lecteur d'écran sur l'Accueil, les modales qui suivent le thème, le FAB lisible la nuit, l'ordre des onglets, l'onboarding raccourci, le composant `EmptyState`, et les tests qui verrouillent ces règles (`onTintTextGuard`, `uiuxHomeRules`, `fabColors`, `nursingTimer`, `MealsFormNursing`, `StatsGroupAccessibility`).

---

## 1. Statut de chaque constat V1

### P0

| # | Statut | Preuve (branche) |
|---|--------|------------------|
| P0-1 Bouton « Ajouter » illisible en sombre | **Partiellement corrigé : le correctif vise le mauvais composant** | Le token `onTint` existe (`constants/theme.ts:20,31,40` ; sombre `#111827` sur `#60a5fa` = 6,98:1, clair blanc sur `#0a7ea4` = 4,63:1). Il est appliqué à `FormBottomSheet.tsx:243-245`, mais ces boutons ne s'affichent que si `showActions` est vrai, or toutes les feuilles de `GlobalSheetManager` passent `showActions={false}`. Le **vrai** bouton est rendu par chaque formulaire dans `<SheetFooter>` : blanc sur `accentColors.filledBg` (couleur d'événement). Exemple : `MealsForm.tsx:1429` (fond) et `:1443` (`color: nc.white`). La racine est `components/ui/accentColors.ts:82` (`filledText: "#ffffff"` en dur). Voir le tableau des ratios plus bas. Les états vides (`EmptyState`), le FAB, le Journal et `GlobalSheetManager` sont, eux, corrigés. |
| P0-2 Blanc sur `todayAccent` | **Corrigé, à un résidu près** | onboarding, PaywallPrompt, FirstTrackGuide, share-child, help, export, profile, password et join-child passent sur `nc.onTodayAccent` (sombre `#111827` sur `#818cf8` = 5,95:1 ; clair blanc sur `#4f46e5` = 6,29:1). Résidu : `components/forms/AllergiesEditor.tsx:146` + `:155`, blanc sur `todayAccent`, soit **2,98:1 en sombre** (add-baby, edit-child). Le test de garde exclut `components/forms`. |
| P0-3 Boutons gris clair dans les modales sombres | **Corrigé** | `ConfirmModal.tsx:62-69` et `PromptModal.tsx:67-72` dérivent leurs couleurs du thème (`backgroundPressed`, `textStrong`, `getReadableTextColor`) ; `onRequestClose` est branché (`ConfirmModal.tsx:75`, `PromptModal.tsx:79`) ; les modales vocales n'imposent plus `Colors.background`. Résidu, hors modales partagées : `app/child-picker.tsx:659` (`#f0f0f0`) et `:662-665` (`#666` : 2,56:1 sur la carte sombre), voir R-P1-17. |
| P0-4 Chrono tétée sans libellés, cibles trop petites | **Corrigé** | `MealsForm.tsx:907-940` : libellés Démarrer/Reprendre/Mettre en pause, `accessibilityState.selected`, bouton 56×56 (`:1631-1638`) ; remise à zéro 44×44, écartée de 20 pt (`:1629`) et confirmée (`:239-253`) ; ±1 min en 44×44 (`:1658-1660`) ; quantité 48×48 (`:1557-1559`). |
| P0-5 Pastilles claires du FAB en sombre | **Corrigé** | `constants/quickActionColors.ts:26-35` dérive des catégories : sombre corail `#E8785A` sur `#2d1a14` = 5,72:1, teal 5,21:1, doré 7,83:1 ; clair 5,59 à 5,76:1. Même traitement dans `FirstTrackGuide.tsx` (tuiles `cc.*.background` + `ct.*`). |

**Ratios du bouton « Ajouter » réel (blanc sur `eventColors.*.dark`, identique en clair et en sombre)**

| Formulaire | Fond | Ratio | |
|---|---|---|---|
| Croissance | `#8BCF9B` | **1,83:1** | ✗ |
| Symptôme | `#f59f00` | 2,13:1 | ✗ |
| Vitamine | `#FF9800` | 2,16:1 | ✗ |
| Nettoyage nez | `#06b6d4` | 2,43:1 | ✗ |
| Activités | `#10b981` | 2,54:1 | ✗ |
| Miction / couche | `#17a2b8` | 3,04:1 | ✗ |
| Tire-lait | `#28a745` | 3,13:1 | ✗ |
| Repas | `#4A90E2` | 3,29:1 | ✗ |
| Médicament | `#2f9e44` | 3,45:1 | ✗ |
| Jalon | `#ec4899` | 3,53:1 | ✗ |
| Bain | `#3b82f6` | 3,68:1 | ✗ |
| Température | `#e03131` | 4,51:1 | OK de justesse |
| Selle | `#dc3545` | 4,53:1 | OK de justesse |
| Vaccin | `#9C27B0` | 6,30:1 | OK |
| Sommeil | `#6f42c1` | 6,51:1 | OK |

12 types de saisie sur 15 échouent. Comme le pied est désormais collant, ce bouton sous-contrasté est visible en permanence.

### P1

| # | Statut | Preuve |
|---|--------|--------|
| P1-1 Conseils avant le résumé | **Corrigé** | `home.tsx` : résumé juste sous l'en-tête, conseils en dessous (`:1869-1898`) et masqués la nuit (`!isNightMode`) ; salutation 28 → 22 pt (`home/styles.ts:31-33`). |
| P1-2 Défilement automatique du carrousel | **Corrigé** | `utils/tipsAutoScroll.ts:16-25` (nuit, Réduire les animations, lecteur d'écran), `TipsCarousel.tsx:89-134` (règle relue à chaque tick). Le rôle `adjustable` qui masquait les boutons a été retiré. |
| P1-3 « il y a… » non lu, format « 2h5 » | **Corrigé** | `StatsGroup.tsx:272-277` (`buildStatsGroupA11yLabel` avec `timeSince`) et `:285` (`expanded`) ; `utils/timeSince.ts:10-17` (« 2 h 05 », espaces insécables) ; `summary: string` (`home.tsx:748`). |
| P1-4 Valeurs colorées illisibles | **Corrigé** | `StatsGroup.tsx` : la couleur reste sur la pastille, le chiffre passe en `textStrong`. |
| P1-5 Humeurs sans sens | **Corrigé** | `home.tsx:1825-1858` : `radiogroup`/`radio`, `checked`, libellés Difficile, Mitigé, OK, Content, Rayonnant (`dashboardConfig.ts:270-276`) ; `minHeight: 44` (`home/styles.ts:84`). |
| P1-6 Biberon ±5 ml au contact | **Corrigé** | `useRepeatPress.ts` (déclenche à `onPress`, répète à l'appui long) ; `adjustable` + `accessibilityValue` (`MealsForm.tsx:739-742`) ; presets ≥ 44 pt (`:1587-1589`) ; dernière quantité reprise (`nursingTimer.ts:199-221`, `MealsForm.tsx:327-334`). `BoundedNumberInput` reste inutilisé, voir P2-12. |
| P1-7 « Ajouter » en bas du défilement | **Corrigé** | `SheetFooter.tsx`, `SheetFooterHost.tsx` (`BottomSheetFooter`, zone de sécurité) et l'espaceur, adoptés par les 8 formulaires. |
| P1-8 Fermeture sans garde-fou | **Corrigé** (effets de bord en N3) | `formGuard.tsx`, `GlobalSheetManager.tsx:258-323` : fond, Fermer/Annuler et retour Android passent par « Abandonner la saisie ? » ; glissement bloqué quand la saisie est modifiée (`:379` etc.). |
| P1-9 Chrono tétée dépendant de la feuille | **Partiel** | Horodaté et persisté par enfant (`nursingTimer.ts`, `MealsForm.tsx:303-352`), avec un toast à la fermeture (`:359`). Il manque toujours un **widget Accueil, une notification ou une Live Activity** : rien à l'écran n'indique qu'une tétée tourne. Effet de bord en N1. |
| P1-10 Pour quel enfant ? | **Partiel** | `SheetChildLabel` (`GlobalSheetManager.tsx:134-147`, « Pour Léa »). Le sélecteur du drawer s'annonce toujours « Changer d'enfant » sans dire qui est actif (`app/(drawer)/_layout.tsx:84`). |
| P1-11 Toasts | **Corrigé** (résidu en N4) | `ToastContext.tsx:37,164` (8 s minimum avec une action), `:68-72` (annonce), `:271-273` (cible 44 pt), `:244-246` (`#374151` + liseré ; texte 10,31:1, action `#93c5fd` 5,72:1), offset au-dessus des onglets et du dock (`(tabs)/_layout.tsx:77-79`). |
| P1-12 Suppression « irréversible » + Annuler | **Partiel** | L'annulation fonctionne (`useDeleteWithUndo`, 8 s), mais la modale bloquante passe d'abord et affirme « Cette action est irréversible. » (`home.tsx:1952`, `chrono.tsx:2726`, `croissance.tsx:2151`, `mealsConfig.tsx:337`) : deux étapes, et un message qui contredit le toast « Annuler ». |
| P1-13 Supprimer au glissement seulement | **Non corrigé** | `chrono.tsx:1427` (`ReanimatedSwipeable`) sans `accessibilityActions` ; aucune occurrence non plus dans `RecentEventsList`. |
| P1-14 Mode nuit limité à 4 composants | **Partiel** | 5 consommateurs de `useNightMode` (s'y ajoute Accueil, qui masque les conseils). Formulaires, cartes et modales l'ignorent. L'onboarding promet toujours un « Mode nuit automatique, pensé pour les parents fatigués ». |
| P1-15 Animations décoratives infinies la nuit | **Non corrigé** | `components/moments/PulsingAura.tsx:25` (`withRepeat`) sans `isNightMode` ni `animations.decorative`. |
| P1-16 Couleurs incohérentes d'un écran à l'autre | **Partiel** | FAB, FirstTrackGuide, `QUICK_ADD_ACTIONS` (`dashboardConfig.ts:321-445` → `itemColors`) et modales sont alignés. Restent : Plus (`plus.tsx:52-153` : `#4A90E2`, `#17a2b8`, `#9C27B0`, `#28a745`…) et `constants/eventColors.ts` (palette Bootstrap, qui colore l'icône et le bouton de chaque formulaire). Dans la feuille Repas, Repas est **bleu**, alors qu'il est **corail** sur l'Accueil et le FAB. |
| P1-17 Pas de tokens d'espacement, rayon, typo | **Partiel** | `constants/tokens.ts` (space, radius, typography, elevation, `minTouchTarget`). Seuls 4 fichiers l'importent (ConfirmModal, PromptModal, InfoModal, EmptyState). Hex en dur : 536 → 435. Surfaces claires en dur restantes : `child-picker.tsx:659`, `immunizations.tsx:2092/2202/2236/2272`, `AddChildModal.tsx:171/193`, `pending-requests.tsx:178/204`, `SwipeGallery.tsx:1353…` (à vérifier au cas par cas : certaines sont peut-être surchargées en ligne). |
| P1-18 Élévation non tokenisée | **Partiel** | `elevation.card/raised` (`tokens.ts:83-87`) est quasi inutilisé ; les cartes restent sur `shadowOpacity 0.08 + elevation 3` neutralisés par `flatInDark` (déjà présent en V1) : `home/styles.ts:58-68`, `StatsGroup.tsx:458-460`, `SleepWidget.tsx:333-335`. |
| P1-19 Deux écrans Croissance | **Non corrigé** (aperçu seulement, voir N2) | `croissance.tsx` et `growth.tsx` coexistent ; un **troisième** point d'entrée a été ajouté (`plus.tsx:109-117`). |
| P1-20 Écarts de poids en rouge | **Corrigé** | `growth.tsx:1233-1283` : badge neutre (`backgroundPressed` + `textNormal`, 6,87:1 en clair et 7,00:1 en sombre), signe seul. |
| P1-21 Ordre des onglets | **Corrigé** | `(tabs)/_layout.tsx:87-93,120-189` : Accueil, Journal, Moments, Croissance, Plus/Stats ; libellés de position cohérents. |
| P1-22 Trop d'étapes avant la 1re saisie | **Partiel** | 3 slides (`onboarding.tsx` `SLIDES`), promesse exacte (« Trois touches, ou votre voix »), Google/Apple au-dessus du formulaire (`login.tsx:598-633`). La biométrie est **toujours proposée avant le compte** (`onboarding.tsx:134-146`). |
| P1-23 Frictions à l'inscription | **Partiel** | `new-password` / `newPassword` (`login.tsx:743-744,833-834`), erreurs en ligne avec `alert` + live region (`:92-93,866-867`), minimum 2 caractères (`utils/nickname.ts:5`). Le pseudo reste **obligatoire** à l'inscription (`login.tsx:403-404`). |
| P1-24 Cibles < 44 pt dans le Journal | **Non corrigé** | `chrono.tsx` est quasi intact (5 lignes modifiées) : jours du calendrier, puces de filtre et badges blancs sur couleur de catégorie sont inchangés. |
| P1-25 Dynamic Type : hauteurs fixes | **Partiel** | Humeur en `minHeight`, emoji plafonné à 1,5 ; `maxFontSizeMultiplier` n'apparaît que 4 fois ; puces et steppers gardent des dimensions fixes. Pas de passe à 200 % visible. |

### P2

| # | Statut | Preuve |
|---|--------|--------|
| P2-1 Couture en-tête/écran | Corrigé | `app/_layout.tsx:228-229`, `app/(drawer)/_layout.tsx` → `nc.background` (régression collatérale en N6) |
| P2-2 Cœur rouge en dur | Corrigé | `(tabs)/_layout.tsx:150-163` (teinte active, cœur plein) |
| P2-3 Icônes d'onglets 28 pt, FA5/FA6 mélangés | Corrigé | FA6 à 24 pt (`(tabs)/_layout.tsx:9,18`) |
| P2-4 4 familles d'icônes | Non corrigé | inchangé |
| P2-5 Pas de ripple | Partiel | `pressFeedback.ts` ; `android_ripple` 3 → 10 occurrences ; occurrences de `TouchableOpacity` 751 → 718 |
| P2-6 Vocabulaire | Partiel | « Nouvelle couche » (`GlobalSheetManager.tsx:577`), « 120 ml biberon · 80 ml tiré » (`home.tsx:823-824`), FAB « Couche » ; restent Plus « Couches / Mictions et selles » (`plus.tsx:63-64`) et les actions rapides « Miction » / « Selle » (`dashboardConfig.ts:84`) |
| P2-7 Nom de l'app multiple | Partiel | `constants/app.ts` (`APP_NAME`) ; restent « Suivi Baby » dans le PDF des stats (`stats.tsx:904`) et dans le message de parrainage (`ReferralCard.tsx:42`) |
| P2-8 Décimales anglo-saxonnes | Partiel | formulaires et growth corrigés (`utils/frenchNumber.ts`, `SoinsForm.tsx:372-392`) ; listes encore en `${value}°C` : `soins.tsx:270`, `chrono.tsx:364,385`, `routines.tsx:1258` (« 38.5°C ») |
| P2-9 « Ajouter un enfant » trompeur | Corrigé | `settings.tsx:411-412` |
| P2-10 Live region du minuteur sommeil | Corrigé | `SleepWidget.tsx` + `useAnnounceActiveChange` |
| P2-11 Chevron imbriqué inatteignable | Corrigé | `StatsGroup.tsx:286-296,322-352` |
| P2-12 Composants morts | Partiel | StatsCard, MoodCard, MealCard, ReusableModal, FloatingBlob, FloatingParticle et FloatingActionButton supprimés ; `components/ui/BoundedNumberInput.tsx` reste inutilisé |
| P2-13 Saut du squelette des conseils | Corrigé | squelette retiré, conseils sous le résumé |
| P2-14 Pulsation du FAB à chaque écran | Corrigé | `GlobalFAB.tsx` (`FAB_PULSE_SEEN_KEY`, première session uniquement) |
| P2-15 Modales vocales sans séparation | Corrigé | défaut `nc.backgroundCard` |
| P2-16 Onboarding arc-en-ciel | Corrigé | `ONBOARDING_ACCENT` unique (mais en dur, voir N8) |
| P2-17 Fichiers géants | Non corrigé | chrono 2 736, immunizations 2 409, SoinsForm 2 203, MealsForm 1 972 lignes |
| P2-18 États vides recodés | Corrigé | `components/ui/EmptyState.tsx` (CTA `tint`/`onTint`, 44 pt, titre `header`) |

---

## 2. Constats restants, classés

### P0 (1)

**R-P0-1. Bouton principal des formulaires sous 4,5:1 dans les deux thèmes (12 types sur 15 ; Croissance 1,83:1)**
- Où : `components/ui/accentColors.ts:80-82` (`filledBg: accent`, `filledText: "#ffffff"`), utilisé par `MealsForm.tsx:1429/1443`, `CroissanceForm.tsx:311/321`, `DiapersForm.tsx:572`, `MilestonesForm.tsx:709`, `PumpingForm`, `SoinsForm`, `RoutinesForm.tsx:1058`, `ActivitiesForm.tsx:601`.
- Pourquoi : c'est le bouton qui conclut chaque saisie. Il est maintenant collé en bas de l'écran, toujours visible ; à 3 h, en luminosité minimale, « Ajouter » en blanc sur vert pâle ne se lit pas.
- Correctif (2 options) :
  1. Simple et cohérent : aplat `Colors[scheme].tint` + texte `onTint` pour tous les « Ajouter / Enregistrer » ; la couleur de catégorie reste dans l'icône d'en-tête et les puces actives (c'est ce que fait déjà `FormBottomSheet`).
  2. Garder la couleur d'événement : `filledText: getReadableTextColor(accent)` dans `getAccentColors`. Croissance, Vitamine, Symptôme, Activités et Nez passent alors en texte `#111827` ; ou foncer `filledBg` (mix 25-35 % de noir en clair) pour que le blanc atteigne 4,5:1.
- Verrouiller : étendre `__tests__/onTintTextGuard.test.ts` à `components/forms` (`ROOTS`, l. 13) et aux ternaires (le motif `NOT_SOLID` exclut `? `, l. 24), puis ajouter un test qui vérifie `contrastRatio(filledText, filledBg) >= 4.5` pour chaque `eventColors`.

### P1 restants (14, dont 1 résidu de P0)

| # | Constat | Où | Correctif |
|---|---------|----|-----------|
| R-P0-2 | Blanc sur `todayAccent` : 2,98:1 en sombre | `components/forms/AllergiesEditor.tsx:146,155` | `nc.onTodayAccent` |
| R-P1-9 | Aucune trace à l'écran d'une tétée en cours | Accueil (pas de consommateur de `loadNursingTimer` hors MealsForm) | Widget « Tétée en cours · gauche 6 min » sur le modèle de `SleepWidget`, ouvrant Repas ; à terme, notification persistante ou Live Activity |
| R-P1-10 | Sélecteur d'enfant sans nom actif | `app/(drawer)/_layout.tsx:84` | `accessibilityLabel={\`${name}, changer d'enfant\`}` |
| R-P1-12 | Modale « irréversible » puis toast « Annuler » | `home.tsx:1949-1958`, `chrono.tsx:2723-2730`, `croissance.tsx:2148-2156`, `mealsConfig.tsx:337` | Supprimer la modale pour une suppression unitaire (optimiste + toast 8 s) ; la garder seulement pour la sélection multiple, avec un message vrai |
| R-P1-13 | Suppression uniquement au glissement | `chrono.tsx:1427`, `RecentEventsList.tsx` | `accessibilityActions` delete/activate + `onAccessibilityAction` |
| R-P1-14 | Mode nuit cantonné à l'Accueil, au FAB et à la voix | `hooks/useNightMode.ts` (5 consommateurs) | Brancher dans `FormBottomSheet`/`SheetFooterHost` (boutons 56 pt), les steppers et `StatsGroup` ; ou adoucir la promesse de l'onboarding |
| R-P1-15 | `PulsingAura` boucle la nuit | `components/moments/PulsingAura.tsx:25-53` | `if (!useNightMode().animations.decorative) return` |
| R-P1-16 | Palette Bootstrap dans Plus et dans les formulaires | `plus.tsx:52-153`, `constants/eventColors.ts` | Faire dériver `eventColors` de `itemColors`/catégories (Repas = corail partout), Plus de `getCategoryColors` |
| R-P1-17 | Tokens créés mais non adoptés ; surfaces claires en dur | `tokens.ts` (4 importeurs) ; `child-picker.tsx:659-665`, `immunizations.tsx:2092…`, `AddChildModal.tsx:171,193`, `pending-requests.tsx:178,204` | Règle ESLint `no-restricted-syntax` sur les hex dans `app/` et `components/`, migration de l'Accueil et des formulaires d'abord |
| R-P1-18 | Élévation : token non utilisé | `home/styles.ts:58-68`, `StatsGroup.tsx:458`, `SleepWidget.tsx:333`, `PromenadeWidget.tsx:251`, `RecentEventsList.tsx:841` | Remplacer les ombres en dur par `elevation.card(scheme)` puis retirer `flatInDark` |
| R-P1-19 | Deux écrans Croissance (et trois entrées) | `croissance.tsx`, `growth.tsx`, `plus.tsx:101-117` | Décider : l'onglet enrichi des outils de `growth` (filtre, multi-sélection, pagination) ; Plus > Croissance ouvre l'onglet |
| R-P1-22 | Biométrie proposée avant le compte | `onboarding.tsx:134-146` | La proposer après la première saisie réussie |
| R-P1-23 | Pseudo obligatoire à l'inscription | `login.tsx:403-404` | Optionnel (prénom d'Apple/Google ou début de l'e-mail) |
| R-P1-24 | Journal : cibles ~28-32 pt, badge blanc sur doré (2,06:1) | `chrono.tsx` (calendrier, puces, badges) | `minHeight: 44`, rôle, état `selected`, libellé de date complet ; badge en `categoryTextColors` |
| R-P1-25 | Dynamic Type : hauteurs fixes | puces, steppers, `quantityButton` 48×48 | `minHeight`/`minWidth` ; tester à 200 % (Accueil, Repas, Journal) |

### P2 restants (7)
P2-4 (familles d'icônes), P2-5 (ripple : migrer `TouchableOpacity` → `Pressable` + `usePressRipple` dans les formulaires), P2-6 (Plus « Couches / Mictions et selles », actions rapides « Miction »), P2-7 (`stats.tsx:904`, `ReferralCard.tsx:42` → `APP_NAME`), P2-8 (`soins.tsx:270`, `chrono.tsx:364,385`, `routines.tsx:1258` → `formatDecimalFr` + « °C » avec espace insécable), P2-12 (supprimer ou brancher `BoundedNumberInput`), P2-17 (découpage des fichiers géants).

---

## 3. Nouveaux constats introduits par les correctifs

### P1 (2)

**N1. La reprise du chrono tétée détourne les autres saisies Repas, et une tétée lancée par erreur ne s'abandonne pas**
- Où : `components/forms/MealsForm.tsx:315-330`. Dès qu'un brouillon existe (en pause depuis moins de 6 h ou en marche depuis moins de 12 h), il est chargé quel que soit le type demandé : `if (draft.runningSide) setMealType("tetee")` (`:323`) fait basculer en Tétée une feuille ouverte pour un **biberon**, et `setDateHeure(new Date(draft.startedAt))` (`:325`) met la date de début de la tétée (parfois plusieurs heures plus tôt) sur un biberon ou un solide, sans que la date ait été « touchée ». Le garde-fou exclut le chrono (`:368-384`), « Annuler » et « Abandonner » n'effacent rien (pas de `onDiscard`), et le brouillon revient à chaque ouverture pendant 6 à 12 h.
- Scénario : à 2 h, démarrage par erreur du côté gauche, puis Annuler ; à 4 h, FAB > Repas > Biberon : la feuille s'ouvre en Tétée, en cours depuis 2 h. Si l'on repasse en Biberon, l'heure proposée est 2 h.
- Correctif : n'appliquer `startedAt` à `dateHeure` que si `mealType === "tetee"` ; ne pas forcer le type si l'ouverture vient d'un autre type explicite (afficher plutôt un bandeau « Tétée en cours, 1 h 58 · Reprendre ») ; ajouter « Abandonner la tétée » (efface le brouillon, avec confirmation) et passer `onDiscard: () => clearNursingTimer(childId)` au garde-fou ; afficher l'âge du brouillon à la reprise.

**N2. L'écran d'aperçu « croissance-fusion » part en production**
- Où : `app/(drawer)/baby/(tabs)/plus.tsx:109-117` (entrée « Croissance (aperçu fusion) », icône `flask`), `croissance-fusion.tsx`. Aucune garde `__DEV__` ni feature flag : tout parent gestionnaire le voit.
- Problèmes : trois entrées Croissance (onglet + 2 dans Plus), ce qui aggrave P1-19 ; du vocabulaire interne (« Aperçu : un seul écran Croissance », « La version fusionnée y ajouterait… ») ; un en-tête dépliable de 32 pt (`:86`, < 44) ; `CroissanceScreen` monté deux fois (onglet + aperçu : listeners Firestore et graphique en double) ; « Comparer » fait un `router.replace` qui casse la pile de retour.
- Correctif : encapsuler l'entrée Plus et la route dans `if (__DEV__ || flags.growthMergePreview)` avant le prochain build, ou trancher P1-19 et supprimer l'aperçu.

### P2 (6)

| # | Constat | Où | Correctif |
|---|---------|----|-----------|
| N3 | Garde-fou de saisie : **faux positifs** (passer Tétée → Biberon, ou Sieste → Bain, remet `new Date()` et marque la saisie comme modifiée, d'où « Abandonner la saisie ? » alors que rien n'a été saisi) et **feuille figée** (une fois la saisie modifiée, glissement du contenu et de la poignée désactivés : impossible d'agrandir la feuille) | `RoutinesForm.tsx:309-346` + `:354` ; `MealsForm.tsx:368-371` (`mealType` dans la ligne de base) ; `FormBottomSheet.tsx:145-147` ; `GlobalSheetManager.tsx:379…` | Exclure le type et les valeurs par défaut réinitialisées du calcul (`resetBaseline` au changement de type) ; ne désactiver que `enablePanDownToClose` et laisser le glissement entre crans (ou intercepter la fermeture via `onAnimate` vers -1) |
| N4 | Toasts : un seul inset global. Sur un écran de pile posé au-dessus des onglets (Réglages, partage…), les onglets restent montés, l'inset (~83 à 140 pt) reste actif et le toast flotte au milieu de l'écran ; même chose quand le clavier masque la barre | `ToastContext.tsx:79-82,212`, `(tabs)/_layout.tsx:77-79` | Déclarer l'inset sur le focus (`useFocusEffect`) et le remettre à 0 au blur ; ignorer l'inset quand le clavier est visible |
| N5 | Pied collant : `setNode(children)` à chaque rendu (`useLayoutEffect` sans dépendances) et chrono à 500 ms, d'où un re-rendu complet de MealsForm (1 972 lignes) et du pied deux fois par seconde pendant une tétée | `SheetFooter.tsx:31-33`, `MealsForm.tsx:295-300` | Isoler l'affichage du temps dans un petit composant `<ElapsedText since=…/>` qui porte seul l'intervalle (1 s suffit) ; mémoïser le contenu du pied |
| N6 | **Régression légère** : la barre d'onglets prend le fond `nc.background` (`#f9fafb`) ; la teinte active `#0a7ea4` passe de 4,63 à **4,43:1**, sous 4,5 pour un libellé de 12 pt | `app/_layout.tsx:229` (`card`) | `card: nc.backgroundCard` (`#fff`) pour la barre, ou foncer `tintColorLight` (`#08739a` dépasse 5:1) |
| N7 | Trois rouges destructifs : `DESTRUCTIVE_COLOR #dc3545` (`ConfirmModal.tsx:38`), `nc.destructive #dc2626` (nouveau token) et `nc.error #ef4444` passé par Accueil, Journal et Croissance (`home.tsx:1955`, `croissance.tsx:2155`). `getReadableTextColor` pose alors un texte **foncé** sur `#ef4444` (4,71:1) ici, et blanc ailleurs : le bouton « Supprimer » change d'aspect d'un écran à l'autre. `growth.tsx:1722` garde `#ef4444` en dur | idem | Un seul token `destructive`/`onDestructive` ; `DESTRUCTIVE_COLOR = nc.destructive` ; retirer `confirmButtonColor={nc.error}` |
| N8 | Doublons de tokens : `Colors.light.background #fff` et `nc.background #f9fafb` coexistent (tout ce qui lit `Colors.background`, ThemedView ou la modale de `child-picker.tsx:351`, n'a pas le même fond) ; `ONBOARDING_ACCENT = "#6366f1"` en dur ≠ `todayAccent` (`#4f46e5` / `#818cf8`), à 3,97:1 sur fond sombre pour l'icône ; `ALL_SLIDES[3..4]` est du contenu mort | `constants/theme.ts:29`, `app/(auth)/onboarding.tsx` (`ONBOARDING_ACCENT`, `ALL_SLIDES`) | Aligner `Colors.*.background` sur `nc.background` (ou le déprécier) ; `ONBOARDING_ACCENT = nc.todayAccent` ; supprimer les slides mortes |

---

## 4. Contrastes recalculés (tokens réels)

| Paire | Ratio | Verdict |
|---|---|---|
| `onTint` sombre `#111827` / tint `#60a5fa` | 6,98 | OK |
| `onTint` clair `#fff` / tint `#0a7ea4` | 4,63 | OK (juste) |
| `onTodayAccent` sombre `#111827` / `#818cf8` | 5,95 | OK |
| `onTodayAccent` clair `#fff` / `#4f46e5` | 6,29 | OK |
| `onDestructive` `#fff` / `#dc2626` | 4,83 | OK |
| `#fff` / `DESTRUCTIVE_COLOR #dc3545` | 4,53 | OK (juste) |
| `#fff` / `nc.error #ef4444` | 3,76 | ✗ (évité par `getReadableTextColor`, d'où le texte foncé de N7) |
| Toast `#fff` / `#374151` ; action `#93c5fd` | 10,31 ; 5,72 | OK |
| FAB sombre (corail, teal, doré sur fonds de catégorie) | 5,72 ; 5,21 ; 7,83 | OK |
| FAB clair (textes de catégorie sur fonds pâles) | 5,76 ; 5,74 ; 5,59 | OK |
| Badge d'écart `#4b5563` / `#f3f4f6` ; sombre `#d1d5db` / `#374151` | 6,87 ; 7,00 | OK |
| Lien `todayAccent` sombre / carte `#1f2937` | 4,92 | OK |
| Onglet actif `#0a7ea4` / `#f9fafb` | 4,43 | ✗ (N6) |
| `textMuted` sombre `#7b8494` / carte | 3,89 | décoratif uniquement |
| `#666` / carte sombre (child-picker) | 2,56 | ✗ |
| Blanc / `eventColors` (bouton « Ajouter ») | 1,83 à 3,68 pour 11 types | ✗ (R-P0-1) |

---

## 5. Feuille de route mise à jour

**Avant le prochain build (moins d'une journée)**
1. R-P0-1 : texte du bouton principal des formulaires (`accentColors.ts:82` → `getReadableTextColor`, ou aplat `tint` + `onTint`), puis extension du test de garde à `components/forms` et aux ternaires. Environ 1 h.
2. N2 : masquer l'aperçu croissance-fusion derrière `__DEV__` ou un flag. 10 min.
3. N1 : ne plus imposer type ni date depuis le brouillon de tétée, ajouter « Abandonner la tétée ». Environ 2 h.
4. R-P0-2 (`AllergiesEditor`), N6 (fond de la barre d'onglets), N7 (un seul rouge destructif). Environ 45 min.

**Court terme (2 à 4 jours)**
- R-P1-12 (supprimer la modale avant l'annulation), R-P1-13 (`accessibilityActions`), R-P1-24 (Journal 44 pt), R-P1-15 (`PulsingAura`), R-P1-10 (libellé du sélecteur d'enfant), N3 (faux positifs du garde-fou et feuille figée), N4 (inset des toasts au focus), N5 (minuteur isolé).
- R-P1-9 : widget « Tétée en cours » sur l'Accueil.

**Chantiers**
- Adoption des tokens (règle de lint, migration de `eventColors` vers les catégories, Plus), élévation tokenisée (R-P1-16/17/18).
- Décision et fusion Croissance (R-P1-19), biométrie après la première saisie, pseudo optionnel (R-P1-22/23).
- Passe Dynamic Type à 200 %, migration `Pressable` + ripple, découpage des fichiers géants (R-P1-25, P2-5, P2-17).

Projection : R-P0-1 + N1 + N2 corrigés donnent Accessibilité 3 (solide) ; avec l'adoption des tokens, Thème 3 ; total visé **15/20 (Bon)**.
