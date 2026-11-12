# Audit UI/UX — SuiviBaby (Expo SDK 58 / RN 0.88)

Date : 2026-11-12 · Branche lue : `fix/premium-offer-compliance` (lecture seule, rien n'a été modifié)
Méthode : audit natif `impeccable` (5 dimensions, sévérités P0–P3), heuristiques `emil-design-eng` / `apple-design` / `review-animations` / `break-ui`, checklist `make-interfaces-feel-better`, `accessibility` (WCAG 2.2 AA), règles `vercel-react-native-skills`, recherche locale `ui-ux-pro-max` (stack react-native : « hitSlop sur les petites cibles », « Pressable plutôt que TouchableOpacity », « retour visuel au toucher / ripple Android » ; le design-system généré, orienté web/marketing, ne convient pas ici et a été écarté). Les ratios de contraste ont été calculés (formule WCAG) à partir des tokens réels.

Persona de référence : parent épuisé, téléphone dans une main, bébé dans l'autre, 3 h du matin, écran en luminosité minimale, souvent en mode sombre automatique (22 h–7 h, `contexts/ThemeContext.tsx:104-106`).

---

## 0. Note de santé (grille impeccable native)

| # | Dimension | Note | Constat principal |
|---|-----------|------|-------------------|
| 1 | Accessibilité | 2/4 | Beaucoup de libellés (442 `accessibilityLabel`), mais le bouton principal « Ajouter » des formulaires est à 2,5:1 en sombre, les boutons du chrono tétée n'ont aucun libellé, plusieurs cibles < 44 pt |
| 2 | Performance | 3/4 | Listes virtualisées, mémoïsation soignée ; écrans de 1 800 à 2 700 lignes difficiles à maintenir |
| 3 | Apparence et thème | 2/4 | Les tokens existent (`dashboardColors.ts`, très bien documentés côté contraste) mais : aucun token d'espacement, de rayon, de typo ni d'élévation ; 498 couleurs hex en dur ; surfaces claires restées en dur dans des modales du mode sombre |
| 4 | Conformité plateforme | 3/4 | Retour Android géré (FAB, sheets), insets OK ; pas de ripple Android (336 `TouchableOpacity`), 4 familles d'icônes mélangées |
| 5 | Adaptivité | 2/4 | Dynamic Type laissé libre (bien) mais hauteurs fixes (chips, boutons humeur 44 pt) qui vont couper ; aucune mise en page tablette |
| | **Total** | **12/20** | **Acceptable : travail notable à prévoir, surtout sur le système de tokens et le mode nuit** |

Ce qui marche (à garder) : la discipline de contraste documentée dans `dashboardColors.ts` (textLight vs textMuted, `onTodayAccent`, `categoryTextColors`) ; la gestion de « Réduire les animations » (`utils/motion.ts`, `useReduceMotion`) ; le dock vocal avec « rien n'est enregistré sans votre accord » ; aucune offre Premium la nuit (`VoiceCommandModals.tsx:261`) ; le retour Android qui ferme le FAB ; l'annonce de position dans les onglets ; le `SuccessAnimation` qui respecte la réduction des animations ; le résumé accessible des graphiques (`ChartA11ySummary`).

---

## 1. P0 : cassé ou trompeur

### P0-1. Le bouton « Ajouter » de TOUS les formulaires est illisible en mode sombre
- **Où** : `components/ui/FormBottomSheet.tsx:210` (fond `tintColor`) + `:230` (texte `nc.white`). Teinte sombre = `#60a5fa` (`constants/theme.ts:9`).
- **Mesure** : blanc sur `#60a5fa` = **2,54:1** (AA exige 4,5:1). En clair, blanc sur `#0a7ea4` = 4,63:1 (OK).
- **Pourquoi c'est grave** : c'est LE bouton qui conclut chaque saisie, et le mode sombre est forcé la nuit, exactement quand le parent a les yeux à moitié fermés. Le même défaut se retrouve sur les CTA des états vides (`routines.tsx:1727-1733`, `milestones.tsx:1442`, `activities.tsx:1553`, `growth.tsx:1472`), `child-picker.tsx:303/424`, `manage-access.tsx:490/510`, `GlobalSheetManager.tsx:83`.
- **Correctif** : ajouter un token `onTint` dans `constants/theme.ts` (`light: "#ffffff"`, `dark: "#111827"`, comme le FAB le fait déjà à la main dans `GlobalFAB.tsx` : icône `Colors.dark.background` sur la teinte) et l'utiliser partout où un texte est posé sur `tint`. Ajouter une règle de lint ou un test qui interdit `nc.white` sur `tint`/`todayAccent`.

### P0-2. Même erreur sur `todayAccent` alors que le token correctif existe
- **Où** : `app/(auth)/onboarding.tsx:248` et `:252` (bouton « Suivant / Commencer »), `components/ui/PaywallPrompt.tsx:69`, `FirstTrackGuide.tsx:88`, `share-child.tsx:152`, `settings/help.tsx:303`, `settings/export.tsx:1434`, `settings/profile.tsx:173`, `settings/password.tsx:443`, `join-child.tsx:348`.
- **Mesure** : blanc sur `#818cf8` (todayAccent sombre) = 2,98:1. Le fichier de tokens le dit lui-même (`dashboardColors.ts`, `onTodayAccent: "#111827"`), mais `onTodayAccent` n'est utilisé que 7 fois.
- **Pourquoi** : premier écran vu (onboarding) et CTA Premium illisibles en sombre ; pour une app qui vend la « saisie à 3 h du matin », c'est le premier signal de qualité.
- **Correctif** : remplacer `nc.white` par `nc.onTodayAccent` sur tout aplat `todayAccent` (recherche-remplacement guidée, ~12 occurrences).

### P0-3. Boutons gris clair qui éclairent la pièce dans les modales du mode sombre
- **Où** : `components/ui/ConfirmModal.tsx:56-57` (valeurs par défaut `cancelButtonColor = "#f2f2f2"`, `cancelTextColor = "#333"`) ; seuls 4 appels sur ~31 les surchargent. `components/ui/PromptModal.tsx:192-197` (styles en dur, non surchargeables). Concerné en particulier : la suppression sur l'Accueil (`home.tsx:1937-1946`), le Journal (`chrono.tsx:2727`), la Croissance (`croissance.tsx:2149`) et **tout le parcours vocal** (`components/suivibaby/voice/VoiceCommandModals.tsx:87, 112, 188, 208`).
- **Pourquoi** : un rectangle `#f2f2f2` au milieu d'un écran `#111827` à 3 h du matin, c'est un flash d'éblouissement, et dans le parcours vocal, qui est justement celui de la nuit.
- **Correctif** : faire dériver les valeurs par défaut du thème dans le composant (`useColorScheme` puis `nc.backgroundPressed` / `nc.textStrong`) au lieu de couleurs en dur ; idem pour `PromptModal`. Supprimer les props de couleur obligatoires (`backgroundColor`, `textColor`) : le composant doit être correct par défaut.

### P0-4. Les boutons du chrono tétée n'ont pas de libellé et sont trop petits
- **Où** : `components/forms/MealsForm.tsx:728` (lecture/pause gauche), `:746` (remise à zéro gauche), `:842` et suivants (côté droit) : aucun `accessibilityLabel` ni `accessibilityRole`. Tailles : `chronoControlButton` 38×38 (`:1501`), `chronoAdjustButton` 32×32 (`:1521`), `quantityButton` 40×40 (`:1451`), sans `hitSlop`.
- **Pourquoi** : VoiceOver/TalkBack annoncent « bouton » sans plus ; et à une main, en allaitant, 32 pt c'est rater une fois sur deux, avec en prime une remise à zéro collée au bouton pause (perte du minutage).
- **Correctif** : libellés « Démarrer le côté gauche / Mettre en pause le côté gauche / Remettre à zéro le côté gauche », `accessibilityState={{ selected: runningSide === "left" }}` ; cibles ≥ 44 pt (48 dp Android) ; écarter physiquement la remise à zéro (ou la passer en appui long avec confirmation haptique).

### P0-5. Le FAB rapide garde des pastilles claires en mode sombre
- **Où** : `components/suivibaby/GlobalFAB.tsx:72-79` (`FAB_ACTION_COLORS` : `#FEF5F3`, `#d1ecf1`, `#FEF5E7`, `#F3F4F6`, sans variante sombre) ; même problème dans `components/suivibaby/FirstTrackGuide.tsx:132-177` (tuiles `#FEF5F3` / `#d1ecf1`).
- **Mesure** : icône `#17a2b8` sur `#d1ecf1` = 2,46:1 ; libellé corail `#E8785A` sur `#FEF5F3` = 2,69:1.
- **Pourquoi** : le FAB est l'action n°1 de la nuit ; l'ouvrir fait apparaître 4 disques quasi blancs. C'est la cause la plus probable du ressenti « flash » en usage nocturne.
- **Correctif** : dériver ces couleurs de `getCategoryColors(scheme)` (`background` / `primary`) et de `getCategoryTextColors(scheme)` pour le texte ; supprimer le teal Bootstrap `#17a2b8` au profit de `sante.primary`.

---

## 2. P1 : friction réelle

### Hiérarchie et densité (Accueil)
**P1-1. Le carrousel de conseils passe avant le résumé du jour**
- `app/(drawer)/baby/(tabs)/home.tsx:1700-1745` : ordre actuel salutation (28 pt) → date → carrousel de 140 pt → « Résumé d'aujourd'hui ». La question à 3 h du matin est « à quelle heure était le dernier repas ? », pas un conseil éditorial.
- **Correctif** : mettre le résumé (Alimentation, Santé, Sommeil) directement sous l'en-tête, réduire la salutation (20 pt, ou la supprimer la nuit) et descendre les conseils sous le résumé, voire les masquer en mode nuit.

**P1-2. Le carrousel défile tout seul, sans pause ni prise en compte de la réduction des animations**
- `components/suivibaby/dashboard/TipsCarousel.tsx:84-100` et `:138` (`setInterval`) : aucune vérification de `reduceMotion`, du lecteur d'écran ni du mode nuit. Contrevient à WCAG 2.2.2 (Pause, Stop, Hide) et produit du mouvement en haut d'écran la nuit.
- **Correctif** : pas de défilement automatique si `reduceMotion || isNightMode || isScreenReaderEnabled` ; sinon, pause au toucher et à l'arrivée du focus.

**P1-3. L'info clé (« il y a 2 h ») n'est pas lue par VoiceOver/TalkBack et elle est ambiguë à l'écran**
- `components/suivibaby/dashboard/StatsGroup.tsx:261` : le libellé accessible `${title}: ${summary}` laisse tomber `timeSince`. `:106` : `il y a ${h}h${m}` donne « il y a 2h5 » pour 2 h 05 (ça se lit « 2 h 50 »).
- **Correctif** : libellé = `${title}, ${summary}, ${timeSinceLabel} ${timeSince}` + `accessibilityState={{ expanded }}` ; formater les minutes sur deux chiffres (`2h05`), comme le fait déjà `DateTimeSectionRow.formatDuration`. Le type `summary: ReactNode` est un risque latent (« [object Object] » lu à voix haute) : imposer `summary: string` ou ajouter une prop `summaryA11y`.

**P1-4. Valeurs colorées illisibles dans les cartes dépliées**
- `StatsGroup.tsx:375` : la valeur (17 pt gras) est écrite en `item.color`, une couleur d'aplat : biberon corail 2,89:1, croissance `#E8C45A` 1,68:1, activité 2,06:1, bain 2,45:1 sur blanc.
- **Correctif** : texte en `nc.textStrong` et couleur réservée à la pastille d'icône ; ou utiliser `getCategoryTextColors`.

**P1-5. Libellés d'humeur vides de sens pour un lecteur d'écran**
- `home.tsx:1860-1880` : « Humeur 1 sur 5 »… pour 😢 😐 🙂 😄 🥰 (`constants/dashboardConfig.ts:257-263`) ; pas de `accessibilityRole` (`radio` attendu), et des hauteurs fixes de 44 pt qui coupent l'emoji en grande taille de texte.
- **Correctif** : libellés « Pleure », « Grognon », « Calme », « Joyeux », « Câlin » ; `accessibilityRole="radio"` dans un groupe `radiogroup` ; `minHeight` au lieu de `height`.

### Saisie (formulaires)
**P1-6. Biberon : seulement des pas de ±5 ml, 100 ml par défaut, appui déclenché dès le contact**
- `MealsForm.tsx:142-144` (défaut 100 ml, pas la dernière quantité) ; `:595-630` (±5 ml) ; `handlePressIn` (`:190-195`) incrémente sur `onPressIn` : dans une sheet qui défile, poser le pouce sur « + » pour faire défiler ajoute 5 ml en silence. La valeur n'expose ni `accessibilityRole="adjustable"` ni `accessibilityValue`.
- **Correctif** : préremplir avec la dernière quantité saisie pour cet enfant ; ajouter une rangée de presets (60 / 90 / 120 / 150 / 180) ; déclencher au `onPress` et ne garder l'accélération que pour l'appui long ; rendre la valeur `adjustable` avec `onAccessibilityAction` incrément/décrément. Le composant `components/ui/BoundedNumberInput.tsx`, écrit précisément pour factoriser ce stepper, **n'est utilisé nulle part** : le brancher.

**P1-7. Le bouton « Ajouter » se trouve en bas d'un formulaire qui défile**
- `FormBottomSheet.tsx:186-250` : les actions vivent dans le `BottomSheetScrollView`. Sur les formulaires longs (Repas 1 835 lignes, Soins 2 227) ouverts à 75 %, il faut faire défiler pour valider.
- **Correctif** : passer les actions en `footerComponent` de `@gorhom/bottom-sheet` (`BottomSheetFooter`), toujours visible au-dessus du clavier et dans la zone du pouce.

**P1-8. Fermeture d'une sheet sans garde-fou contre la perte de saisie**
- `FormBottomSheet.tsx:95-97` (`pressBehavior="close"`) + `enablePanDownToClose` : un geste accidentel sur le fond ou vers le bas efface la saisie en cours (y compris un chrono tétée en marche). Aucun état « modifié » n'existe dans les formulaires (aucune occurrence de `isDirty`).
- **Correctif** : si le formulaire est modifié (ou si un chrono tourne), le fond passe en `pressBehavior="none"` et un geste vers le bas ouvre « Abandonner la saisie ? » ; ou mieux, conserver le brouillon par type d'événement.

**P1-9. Le chrono tétée dépend de la sheet**
- `MealsForm.tsx:181-260` : le minutage vit dans l'état du formulaire (`setInterval`). Fermer la sheet, changer d'onglet ou un plantage, et le minutage est perdu ; contrairement au sommeil et à la promenade, qui ont un widget persistant sur l'Accueil.
- **Correctif** : traiter la tétée en cours comme le sommeil (`SleepWidget`) : événement « en cours » persisté, widget sur l'Accueil, idéalement Live Activity / notification persistante.

**P1-10. Sur quel enfant est-ce que j'enregistre ?**
- `FormBottomSheet.tsx:150-170` : l'en-tête n'affiche que le type (« Repas ») ; le nom de l'enfant n'apparaît que dans le titre du drawer (`app/(drawer)/_layout.tsx:48-60`). Avec des jumeaux ou une fratrie, une saisie sur le mauvais enfant est facile et invisible. Le sélecteur s'annonce « Changer d'enfant » sans dire qui est actif.
- **Correctif** : sous-titre « pour Léa » dans l'en-tête de sheet (avec la pastille de couleur de l'enfant) ; libellé accessible « Léa, changer d'enfant ».

### Retour et confirmation
**P1-11. Toasts : position, durée, accessibilité**
- `contexts/ToastContext.tsx:172-174` : `bottom: insets.bottom + 24` pose le toast sur la barre d'onglets et sur le dock vocal ; `:107` : l'« Annuler » dure 4 s ; cible du bouton ~33 pt (`:218-221`, padding 4 + hitSlop 8) ; aucune annonce au lecteur d'écran (pas d'`AccessibilityInfo.announceForAccessibility` ni d'`accessibilityLiveRegion`) ; fond `rgba(20,20,20,.92)` presque invisible sur `#111827`.
- **Correctif** : calculer l'offset depuis la hauteur de la barre d'onglets + `VOICE_DOCK_INSET` ; ≥ 6–8 s quand une action est présente (WCAG 2.2.1) ; bouton ≥ 44 pt ; annoncer le message ; en sombre, fond `nc.backgroundPressed` + bordure `borderLightAlpha`.

**P1-12. Suppression : « irréversible » alors que l'annulation est la bonne réponse**
- `home.tsx:1941`, `chrono.tsx:2727`, `croissance.tsx:2149`, `mealsConfig.tsx:337` : modale bloquante. `showUndoToast` existe (`ToastContext.tsx:107`) mais n'est utilisé nulle part. `ConfirmModal.tsx:70` : `onRequestClose={() => {}}`, le retour Android ne ferme pas la modale.
- **Correctif** : supprimer de façon optimiste + toast « Événement supprimé · Annuler » (8 s), garder la modale pour les suppressions groupées ; `onRequestClose={onCancel}`.

**P1-13. Supprimer dans le Journal se fait uniquement au glissement**
- `chrono.tsx:1425-1441` : `ReanimatedSwipeable` sans `accessibilityActions` (une seule occurrence dans tout le projet, `ChartA11ySummary.tsx:92`). Un utilisateur VoiceOver/Switch Control doit ouvrir l'édition pour supprimer.
- **Correctif** : `accessibilityActions={[{ name: "delete", label: "Supprimer" }, { name: "activate", label: "Modifier" }]}` sur `TimelineCard` (et sur `RecentEventsList.tsx:480`).

### Mode nuit
**P1-14. Le « mode nuit » ne touche que 4 composants**
- `hooks/useNightMode.ts` fournit `minButtonSize` 56, des polices plus grandes et un `hitSlop` élargi, mais il n'est utilisé que par `GlobalFAB`, `VoiceBar`, `VoiceDock`, `Skeleton`. Formulaires, cartes, modales et toasts l'ignorent ; l'onboarding promet pourtant un « Mode nuit automatique » (`onboarding.tsx:42`).
- **Correctif** : brancher `useNightMode` dans `FormBottomSheet` (boutons 56 pt), dans les steppers, le chrono et `StatsGroup` ; la nuit, masquer les conseils et les animations décoratives, et baisser encore les surfaces (fond `#0b1220`, cartes `#141c2b`).

**P1-15. Animations décoratives infinies sans prise en compte du mode nuit**
- `components/moments/PulsingAura.tsx:25-53` (4 `withRepeat(-1)`), utilisé dans `HeroMoodCard.tsx:271` : aucun contrôle de `isNightMode`. (Reanimated respecte la réduction système par défaut, mais pas le mode nuit de l'app.)
- **Correctif** : n'animer que si `useNightMode().animations.decorative` est vrai.

### Cohérence visuelle
**P1-16. Une couleur ne veut pas dire la même chose d'un écran à l'autre**
- Accueil : Alimentation = corail `#E8785A`, Santé = teal `#5BA4A4` (`dashboardColors.ts`). Plus : Repas = bleu `#4A90E2`, Couches = `#17a2b8`, Santé = violet `#9C27B0`, Tire-lait = `#28a745` (`plus.tsx:30-110`). FAB : change = `#17a2b8`. Modales : vert `#28a745` / rouge `#dc3545` (`InfoModal.tsx:60, 191`). Il reste une palette Bootstrap héritée.
- **Pourquoi** : la couleur sert de repère pré-attentif (« le corail, c'est manger ») ; la changer d'un écran à l'autre oblige à relire.
- **Correctif** : Plus, FAB, FirstTrackGuide et modales doivent consommer `getCategoryColors`/`itemColors` ; supprimer les couleurs Bootstrap ; `InfoModal` par défaut en `tint` + `onTint`.

**P1-17. Aucun token d'espacement, de rayon, de typographie ni d'élévation**
- `constants/theme.ts` ne contient que 6 couleurs et des familles de polices. Relevé sur `app/` + `components/` : **25 valeurs de `borderRadius`** (12×189, 10×74, 8×62, 14×52, 20×45, 16×42, …), **20 tailles de police** (12, 13, 14, 15, 16, 17, 18…), `fontWeight` `"bold"` et `"700"` mélangés, 20 valeurs de padding, 498 couleurs hex en dur (record : `immunizations.tsx`, 62).
- **Correctif** : `constants/tokens.ts` avec `space` (4/8/12/16/20/24/32), `radius` (sm 8, md 12, lg 16, pill 999), `type` (caption 12, footnote 13, body 15, callout 16, title3 20, title1 28, avec la graisse), `elevation` (voir P1-18), et des couleurs sémantiques `onTint` / `onAccent` / `surfaceRaised`. Migrer écran par écran, en commençant par Accueil et formulaires.

**P1-18. Élévation et mode sombre : la parité iOS/Android n'est pas tokenisée (en lien avec le cadre visible sur Android)**
- `StatsGroup.tsx:400-407`, `SleepWidget.tsx:317-322`, `PromenadeWidget.tsx:238-243`, `components/suivibaby/home/styles.ts:57-65` (carte humeur), `RecentEventsList.tsx:838-842` : `shadowOpacity: 0.08` (iOS : invisible sur `#111827`) + `elevation: 3` (Android **ignore `shadowOpacity`** et dessine l'ombre de l'outline en pleine intensité ; depuis l'API 28, RN mappe aussi `shadowColor` sur la couleur de l'ombre Android). Sur un fond `#111827` (pas noir), ce halo plus sombre ressort comme un cadre ; il s'ajoute à `borderColor` (`categoryColorsDark.*.border`) et à `overflow: "hidden"`. En actif, `SleepWidget.tsx:156-158` / `PromenadeWidget.tsx:137-139` passent `shadowColor` à la couleur d'accent : sur Android, cela produit un halo coloré au lieu d'une lueur douce. **À recouper avec l'agent qui diagnostique le cadre sur Android.**
- **Correctif (au niveau du token)** : `elevation.card = scheme === "dark" ? { elevation: 0, shadowOpacity: 0 } : Platform.select({ ios: {shadow…}, android: { elevation: 2 } })` ; en sombre, la profondeur vient du ton de surface (`backgroundCard` plus clair que `background`), conformément au Material 3 tonal elevation et à la HIG (pas d'ombre en sombre).

**P1-19. Deux écrans « Croissance » qui divergent**
- Onglet `croissance.tsx` (courbe OMS, « Tour de tête ») et `growth.tsx` accessible depuis Plus (liste, « périmètre crânien » `:1468`), avec deux UI de suppression différentes (`croissance.tsx:2148` vs `growth.tsx:1525`). Plus propose aussi « Croissance », qui existe déjà en onglet.
- **Correctif** : un seul écran Croissance (courbe + liste), retiré de Plus ou transformé en lien vers l'onglet.

**P1-20. Les écarts de poids sont colorés comme des erreurs**
- `growth.tsx:1233` (et 1254, 1275) : baisse = `errorText` rouge + flèche descendante. Une perte de poids des premiers jours est physiologique : le rouge pose un jugement médical que l'app dit ne pas faire (`settings/terms.tsx:42`).
- **Correctif** : écarts en couleur neutre (`textNormal`), avec seulement le signe +/− ; garder les alertes pour un éventuel système validé médicalement, avec renvoi vers un professionnel.

### Navigation
**P1-21. L'ordre des onglets ne suit pas la fréquence d'usage**
- `app/(drawer)/baby/(tabs)/_layout.tsx:79-85` : Accueil, **Croissance** (saisie mensuelle) en position 2, Moments, **Journal** (consulté plusieurs fois par jour) en 4. À une main, les positions 1-2 sont les plus faciles à atteindre pour un pouce gauche, la 4-5 pour un pouce droit.
- **Correctif** : Accueil, Journal, Moments, Croissance, Plus (à valider avec l'analytics des onglets).

### Onboarding et 5 premières minutes
**P1-22. Trop d'étapes avant la première saisie**
- Parcours : 5 slides (`onboarding.tsx:30-66`) → proposition biométrie **avant même d'avoir un compte** (`:104-115`) → connexion/inscription (email + pseudo + mot de passe + confirmation + 2 cases à cocher) → consentement santé → vérification de l'email → ajout du bébé → FirstTrackGuide. La slide 2 promet « Un tap suffit » alors qu'il en faut au moins 3 (FAB → action → Ajouter).
- **Correctif** : 3 slides maximum (ou une seule avec « Commencer ») ; proposer la biométrie après la première saisie réussie ; mettre Apple/Google **au-dessus** du formulaire email (`login.tsx:800-840` sont sous le formulaire) ; remplacer « Un tap suffit » par une promesse exacte (« Trois touches, ou votre voix »).

**P1-23. Frictions dans le formulaire d'inscription**
- `login.tsx:665` et `:742` : `autoComplete="password"` en inscription et pour la confirmation : iOS ne propose pas de mot de passe fort (il faut `"new-password"` / `textContentType="newPassword"`). Erreurs affichées en modale (`:465-495`) plutôt qu'en ligne sous le champ. Le pseudo est obligatoire à l'inscription (`:364`) et l'écran de profil impose 6 caractères minimum (`settings/profile.tsx:59`) : « Léa » ou « Tom » sont refusés.
- **Correctif** : `new-password` ; erreurs en ligne avec `accessibilityLiveRegion` ; pseudo optionnel (prénom déduit de l'email ou du compte Apple/Google), minimum 2 caractères.

### Accessibilité transverse
**P1-24. Cibles tactiles sous 44 pt dans le Journal**
- `chrono.tsx:794-799` (jours du calendrier : texte 12 pt + padding 6, ~28 pt, sans rôle, libellé ni état sélectionné, `:2589`) ; puces de filtre `:540-548` (~32 pt) ; badge blanc sur couleur de catégorie (`:562-565`, ex. blanc sur doré 2,06:1).
- **Correctif** : `minHeight: 44`, `accessibilityRole="button"`, `accessibilityState={{ selected }}`, libellé « mardi 10 novembre » ; badge en texte foncé (`categoryTextColors`) sur fond teinté.

**P1-25. Dynamic Type : hauteurs fixes**
- Aucun `allowFontScaling={false}` (bien) mais `maxFontSizeMultiplier` n'apparaît que 3 fois ; or des conteneurs ont une `height` fixe autour du texte (`moodEmojiButton` 44, `quantityButton` 40, puces). En « Très grand », les textes vont être coupés.
- **Correctif** : `minHeight` partout ; tester à 200 % (méthode `break-ui`) sur Accueil, sheet Repas et Journal ; plafonner à 1,3–1,5 seulement les éléments de chrome (barre d'onglets, déjà fait).

---

## 3. P2 : finition

| # | Constat | Où | Correctif |
|---|---------|----|-----------|
| P2-1 | Couleur de fond différente entre en-tête et écran en clair : `#fff` (Colors.light.background) vs `#f9fafb` (nc.background), d'où une ligne de couture visible | `constants/theme.ts:15` vs `dashboardColors.ts` ; `app/(drawer)/_layout.tsx:320-325`, `app/_layout.tsx:223-226` | Une seule source pour la couleur de fond (navigation = `nc.background`) |
| P2-2 | Cœur de Moments qui passe au rouge `#e63946` en dur quand l'onglet est actif ; point de badge `#E8A85A` en dur | `(tabs)/_layout.tsx:140-148` | Utiliser la teinte active comme les autres onglets, ou `categoryColors.moments` |
| P2-3 | Icônes de 28 pt dans la barre d'onglets (la norme est 24–25 pt) et mélange FontAwesome5 (onglets) / FontAwesome6 (reste) : glyphes incohérents | `(tabs)/_layout.tsx:3, 115…` | FA6 partout à 24 pt ; à terme, une seule famille (Ionicons ou SF Symbols via `expo-symbols`) |
| P2-4 | 4 familles d'icônes (FA6 ×63, Ionicons ×35, FA5 ×23, MCI ×15) | global | Choisir une famille principale + MCI pour les pictos bébé introuvables ailleurs |
| P2-5 | Pas de ripple Android : 336 `TouchableOpacity` vs 142 `Pressable` | global | Nouveau code en `Pressable` + `android_ripple` ; migrer d'abord les composants partagés (FormBottomSheet, ConfirmModal, chips) |
| P2-6 | Vocabulaire mélangé : « Change » (FAB), « Couches » (Plus), « Miction/Selle » (formulaires), « Pipi » (voix) ; « 120ml bib · 80ml pomp » | `GlobalFAB.tsx:85-88`, `plus.tsx:47`, `home.tsx:815-817` | Lexique unique, parent plutôt que clinique : « Couche (pipi / selle) », « 120 ml biberon · 80 ml tiré » |
| P2-7 | Nom de l'app multiple : « Suivi Baby », « SuiviBaby », « SuiviBaby+ », « Suivi Enfant » (repli du titre), « Samaye » | `onboarding.tsx:33`, `settings.tsx:349`, `_layout.tsx:59` | Un seul nom, avec une constante `APP_NAME` |
| P2-8 | Décimales anglo-saxonnes : « 38.5°C », preset « 38.5° rectale » | `SoinsForm.tsx:397, 1309` ; `growth.tsx:356` | `toLocaleString("fr-FR", { minimumFractionDigits: 1 })` donne « 38,5 °C » (espace insécable) |
| P2-9 | « Ajouter un enfant » ouvre en fait « Entrer un code ou accepter une invitation » | `app/(drawer)/settings.tsx:410-411` | « Rejoindre un suivi (code ou invitation) » ; « Ajouter un enfant » réservé à la création |
| P2-10 | `accessibilityLiveRegion="polite"` sur un minuteur qui change chaque minute : TalkBack annonce en continu | `SleepWidget.tsx` (~l.188) | Retirer la live region ; l'annonce se fait au démarrage et à l'arrêt |
| P2-11 | Bouton « déplier » imbriqué dans un en-tête `Pressable` accessible : inatteignable à VoiceOver et sans rôle | `StatsGroup.tsx:300-315` | Un seul élément accessible avec `accessibilityState.expanded` ; le chevron devient décoratif |
| P2-12 | Composants morts qui gardent des styles non compatibles avec le mode sombre (risque de réutilisation) : `StatsCard`, `MoodCard`, `MealCard`, `ReusableModal`, `FloatingBlob`, `FloatingParticle`, `moments/FloatingActionButton` (commenté), `BoundedNumberInput` (inutilisé, cf. P1-6) | `components/suivibaby/dashboard/StatsCard.tsx:181` (`"white"`), `MoodCard.tsx:83`, `ui/MealCard.tsx:94`… | Supprimer, ou brancher (BoundedNumberInput) |
| P2-13 | Squelette de conseils de 140 pt qui disparaît s'il n'y a pas de conseil : saut de mise en page juste au moment où l'on vise une carte | `home.tsx:1700-1712` | Réserver la place seulement si des conseils sont attendus, ou placer les conseils sous le résumé (P1-1) |
| P2-14 | Pulsation du FAB au montage (2 cycles) : décorative, et appelle l'attention à chaque ouverture d'écran | `GlobalFAB.tsx:256-275` | Seulement à la première session (onboarding), puis jamais |
| P2-15 | Les modales vocales utilisent `Colors.background` (= fond de l'écran) comme fond de carte : pas de séparation en sombre | `VoiceCommandModals.tsx:96, 107, 156…` | `nc.backgroundCard` + bordure `borderLightAlpha` |
| P2-16 | Slides d'onboarding en arc-en-ciel (indigo, vert, ambre, **rouge pour « Données sécurisées »**, violet) : le rouge évoque le danger sur le message de confiance | `onboarding.tsx:37-65` | Une seule couleur de marque ; icônes monochromes |
| P2-17 | Énormes fichiers d'écran (chrono 2 737, immunizations 2 409, soins 2 227 lignes) : les incohérences visuelles naissent de la duplication | `app/(drawer)/baby/(tabs)/*` | Extraire les briques partagées (en-tête d'écran, état vide, carte de liste, puce) dans `components/ui` |
| P2-18 | Styles d'états vides recodés à chaque écran (`emptyCta` dans routines, milestones, activities, growth) | voir P0-1 | Composant `EmptyState` unique (icône, phrase utile, CTA `tint`/`onTint`) |

---

## 4. Pistes complémentaires (non bloquantes, à valider)
- **Saisie rapide personnalisée** : le FAB propose toujours Repas / Change / Vitamine (`GlobalFAB.tsx:35`). Un bébé nourri au biberon n'a pas besoin du même premier bouton qu'un bébé allaité ; ordonner selon les 7 derniers jours (le rail `QuickAddRow` existe déjà dans `components/ui`).
- **Répétition du dernier événement** : un appui long sur une carte du résumé (« Alimentation ») pour « refaire le dernier biberon (150 ml) maintenant », c'est la vraie saisie en un seul geste promise par l'onboarding.
- **Surface la nuit** : en mode nuit, réduire la saturation des couleurs de catégorie (corail `#E8785A`, doré `#E8A85A`) d'environ 15 % ; ce sont les éléments les plus lumineux de l'écran sombre.

---

## 5. Feuille de route priorisée

### Gains rapides (< 1 jour chacun, fort impact)
1. **Token `onTint` + remplacement de `nc.white` sur `tint`/`todayAccent`** (P0-1, P0-2) : ~25 occurrences, recherche-remplacement guidée. Environ 2 h.
2. **Valeurs par défaut de `ConfirmModal` / `PromptModal` liées au thème** + `onRequestClose={onCancel}` (P0-3, P1-12 partiel). Environ 1 h.
3. **Couleurs du FAB et du FirstTrackGuide dérivées des tokens de catégorie** (P0-5). Environ 1 h.
4. **Libellés + cibles 44 pt du chrono tétée et des steppers** (P0-4). Environ 2 h.
5. **Libellé accessible de StatsGroup incluant « il y a… », format `2h05`, valeurs en `textStrong`** (P1-3, P1-4). Environ 1 h.
6. **Libellés d'humeur + rôle radio** (P1-5). 30 min.
7. **Toast : offset au-dessus du dock, 8 s si action, annonce au lecteur d'écran, fond sombre lisible** (P1-11). Environ 2 h.
8. **Arrêt du défilement automatique du carrousel la nuit, avec réduction des animations ou lecteur d'écran** (P1-2). 30 min.
9. **`new-password` à l'inscription, pseudo à 2 caractères minimum** (P1-23 partiel). 30 min.
10. **Écarts de croissance en neutre** (P1-20). 15 min.
11. **Élévation à 0 en sombre sur les cartes du tableau de bord** (P1-18, à coordonner avec l'agent du cadre Android). 30 min.

### Moyen terme (2 à 5 jours)
- Footer collant pour `FormBottomSheet` + garde-fou contre la perte de saisie (P1-7, P1-8).
- Biberon : dernière quantité par défaut, presets, `BoundedNumberInput` adjustable (P1-6).
- Résumé avant les conseils sur l'Accueil, nom de l'enfant dans les sheets (P1-1, P1-10).
- Suppression optimiste + Annuler, `accessibilityActions` sur les lignes glissables (P1-12, P1-13).
- Branchement de `useNightMode` dans formulaires, cartes et animations décoratives (P1-14, P1-15).
- Unification des couleurs Plus / FAB / modales sur les tokens de catégorie (P1-16).
- Cibles et rôles du Journal (P1-24) ; passe Dynamic Type à 200 % (P1-25).

### Plus gros chantiers (1 à 3 semaines)
- **Système de tokens complet** (`space`, `radius`, `type`, `elevation`, couleurs sémantiques `on*`) et migration progressive, avec règle de lint contre les hex en dur (P1-17, P1-18, P2-*).
- **Tétée en cours persistante** (widget Accueil + notification/Live Activity) (P1-9).
- **Onboarding raccourci** : 1 à 3 slides, connexion sociale en premier, biométrie après la première saisie, première saisie guidée en moins de 60 s (P1-22).
- **Fusion des deux écrans Croissance** et revue de l'ordre des onglets avec les données d'usage (P1-19, P1-21).
- **Découpage des écrans de plus de 1 800 lignes** en composants partagés (`EmptyState`, `ScreenHeader`, `ListCard`, `Chip`) (P2-17, P2-18).
- Migration `TouchableOpacity` → `Pressable` + ripple Android, et une seule famille d'icônes (P2-3 à P2-5).
