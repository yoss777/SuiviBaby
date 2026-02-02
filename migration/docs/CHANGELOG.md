# CHANGELOG

## 2026-02-02 — Home Dashboard UI/UX Refactoring

### Résumé

Refonte de l'écran Home avec nouveau composant StatsGroup collapsible, optimisation du layout Humeur/Jalons, et amélioration de la timeline des événements récents.

### Summary

Home screen refactoring with new collapsible StatsGroup component, optimized Mood/Milestones layout, and improved recent events timeline.

### StatsGroup Component

- Nouveau composant StatsGroup collapsible pour regrouper les statistiques (Alimentation, Santé & Hygiène).
- Header avec icône, titre, résumé, indicateur "il y a X temps", bouton + pour ajout rapide.
- Expand/collapse avec animation LayoutAnimation, chevron indicateur.
- Items détaillés avec icône, label, valeur, unité, et "il y a X temps" par item.
- État warning pour alertes (ex: pas de couche depuis longtemps).
- Fichiers: components/suivibaby/dashboard/StatsGroup.tsx, components/suivibaby/dashboard/index.ts

### StatsGroup Component (EN)

- New collapsible StatsGroup component to group statistics (Alimentation, Santé & Hygiène).
- Header with icon, title, summary, "X time ago" indicator, + button for quick add.
- Expand/collapse with LayoutAnimation, chevron indicator.
- Detailed items with icon, label, value, unit, and "X time ago" per item.
- Warning state for alerts (e.g., no diaper change for too long).
- Files: components/suivibaby/dashboard/StatsGroup.tsx, components/suivibaby/dashboard/index.ts

### Layout Humeur & Jalons

- Bloc unifié Humeur/Jalons en 2 colonnes avec séparateur vertical.
- Humeur occupe 58% de la largeur pour meilleure visibilité des emojis.
- Jalons occupe 42% avec compteur et chevron de navigation vers Moments.
- Titre "Humeur du jour" pour clarifier le contexte.
- Fichier: app/(drawer)/baby/(tabs)/home.tsx

### Mood & Milestones Layout (EN)

- Unified Mood/Milestones block in 2 columns with vertical separator.
- Mood takes 58% width for better emoji visibility.
- Milestones takes 42% with counter and navigation chevron to Moments.
- Title "Humeur du jour" to clarify context.
- File: app/(drawer)/baby/(tabs)/home.tsx

### Timeline Événements Récents

- Tap sur un événement ouvre directement l'édition (remplace le long press).
- Hint mis à jour: "Appuyez sur un événement pour le modifier".
- Fichier: components/suivibaby/dashboard/RecentEventsList.tsx

### Recent Events Timeline (EN)

- Tap on an event directly opens edit (replaces long press).
- Hint updated: "Appuyez sur un événement pour le modifier".
- File: components/suivibaby/dashboard/RecentEventsList.tsx

---

## 2026-02-02 — Growth Screen & Forms Navigation Refactoring

### Résumé

Ajout du nouvel écran Croissance (Growth) dans Plus, refactoring global de la navigation des formulaires via FormBottomSheet avec SheetContext, et amélioration de l'écran Moments avec intégration des forms.

### Summary

Added new Growth screen in Plus, global refactoring of form navigation via FormBottomSheet with SheetContext, and improved Moments screen with forms integration.

### Nouvel écran Growth

- Nouvel écran Growth accessible via Plus (Croissance: poids, taille, tour de tête).
- Pattern aligné avec les autres écrans: filtres today/past, calendrier, pagination "Voir plus", sheet global.
- Icône seedling avec couleur #8BCF9B cohérente avec croissance.tsx.
- Service `ecouterCroissancesHybrid` avec support date filtering pour pagination.
- Fichiers: app/(drawer)/baby/(tabs)/growth.tsx, app/(drawer)/baby/(tabs)/plus.tsx, constants/eventColors.ts

### New Growth Screen (EN)

- New Growth screen accessible via Plus (Growth: weight, height, head circumference).
- Pattern aligned with other screens: today/past filters, calendar, "Voir plus" pagination, global sheet.
- Seedling icon with #8BCF9B color consistent with croissance.tsx.
- `ecouterCroissancesHybrid` service with date filtering support for pagination.
- Files: app/(drawer)/baby/(tabs)/growth.tsx, app/(drawer)/baby/(tabs)/plus.tsx, constants/eventColors.ts

### Refactoring Navigation Forms

- GlobalSheetManager supporte désormais tous les types de formulaires via `formType` discriminé.
- Écrans refactorisés pour utiliser `openSheet({ formType: 'xxx', ... })`: meals, pumping, diapers, routines, activities, milestones, soins, croissance.
- Ajout de `onSuccess` callback pour rafraîchir les données après création/modification.
- Ajout de `ensureTodayInRange()` pour s'assurer que les événements créés aujourd'hui sont visibles.
- FormBottomSheet: backdrop cliquable (pressBehavior="close"), opacité 0.5, swipe-down activé par défaut.
- Fichiers: components/ui/GlobalSheetManager.tsx, components/ui/FormBottomSheet.tsx, contexts/SheetContext.tsx

### Forms Navigation Refactoring (EN)

- GlobalSheetManager now supports all form types via discriminated `formType`.
- Screens refactored to use `openSheet({ formType: 'xxx', ... })`: meals, pumping, diapers, routines, activities, milestones, soins, croissance.
- Added `onSuccess` callback to refresh data after create/edit.
- Added `ensureTodayInRange()` to ensure today's events are visible after creation.
- FormBottomSheet: clickable backdrop (pressBehavior="close"), 0.5 opacity, swipe-down enabled by default.
- Files: components/ui/GlobalSheetManager.tsx, components/ui/FormBottomSheet.tsx, contexts/SheetContext.tsx

### Améliorations Moments

- Écran Moments utilise désormais le SheetContext pour ouvrir les formulaires (humeur, photo, milestone).
- Handlers `handleAddMood`, `handleAddPhoto`, `handleAddMilestone`, `handleEditPhoto` via openSheet.
- Fichier: app/(drawer)/baby/(tabs)/moments.tsx

### Moments Improvements (EN)

- Moments screen now uses SheetContext to open forms (mood, photo, milestone).
- Handlers `handleAddMood`, `handleAddPhoto`, `handleAddMilestone`, `handleEditPhoto` via openSheet.
- File: app/(drawer)/baby/(tabs)/moments.tsx

### SwipeGallery & Interactions Sociales

- Nouveau composant SwipeGallery pour navigation swipe entre photos avec PagerView animé.
- Cards animées avec scale/opacity pendant le swipe, carte "Ajouter" en première position.
- Barre sociale sous chaque photo: like (cœur animé), commentaires, téléchargement.
- Système de likes optimiste: mise à jour UI immédiate avant confirmation serveur.
- Affichage des likes: "Aimé par Papa et Mamie", "Aimé par Papa, Mamie et 3 autres".
- CommentsBottomSheet: bottom sheet pour commentaires en temps réel via Firebase.
- Commentaires: écoute temps réel, ajout, suppression (long press sur ses propres commentaires).
- Toast local dans la modal pour feedback (téléchargement réussi, etc.).
- Overlay temporaire (tap) avec titre et date de la photo.
- Indicateurs de navigation: dots (≤10 photos), hints "Plus récent" / "Plus ancien".
- Fichiers: components/moments/SwipeGallery.tsx, components/moments/CommentsBottomSheet.tsx

### SwipeGallery & Social Interactions (EN)

- New SwipeGallery component for swipe navigation between photos with animated PagerView.
- Animated cards with scale/opacity during swipe, "Add" card in first position.
- Social bar below each photo: like (animated heart), comments, download.
- Optimistic likes system: immediate UI update before server confirmation.
- Likes display: "Liked by Papa and Mamie", "Liked by Papa, Mamie and 3 others".
- CommentsBottomSheet: bottom sheet for real-time comments via Firebase.
- Comments: real-time listener, add, delete (long press on own comments).
- Local toast in modal for feedback (download success, etc.).
- Temporary overlay (tap) with photo title and date.
- Navigation indicators: dots (≤10 photos), hints "More recent" / "Older".
- Files: components/moments/SwipeGallery.tsx, components/moments/CommentsBottomSheet.tsx

### Corrections

- croissanceService.ts: orderBy `date` au lieu de `createdAt` pour cohérence avec le nouveau système.
- FormBottomSheet: fermeture possible via swipe-down et clic sur backdrop (était désactivé).

### Fixes (EN)

- croissanceService.ts: orderBy `date` instead of `createdAt` for consistency with new system.
- FormBottomSheet: close via swipe-down and backdrop click now enabled (was disabled).

## 2026-01-30 — Routines / Jalons / Activités (MVP)

### Résumé

Ajout des écrans Routines, Jalons (Milestones) et Activités, avec intégration complète Home/Chrono et nouveaux types d’événements.

### Summary

Added Routines, Milestones, and Activities screens, with full Home/Chrono integration and new event types.

### Routines

- Nouvel écran Routines (Sommeil + Bain) aligné sur les autres écrans (filtres, calendrier, pagination, sheet).
- Sommeil: gestion sieste/nuit, sommeil en cours, durée et fin, validations dates, affichage fin/début.
- Bain: durée + température eau + produits, mêmes patterns de saisie que les autres.
- Timeline Home/Chrono: icônes spécifiques (lit/lune) et labels sieste/nuit.

### Routines (EN)

- New Routines screen (Sleep + Bath) aligned with other screens (filters, calendar, pagination, sheet).
- Sleep: nap/night handling, ongoing sleep, duration/end, date validations, start/end display.
- Bath: duration + water temperature + products, same input patterns as other screens.
- Home/Chrono timeline: specific icons (bed/moon) and nap/night labels.

### Jalons / Milestones

- Nouvel écran Jalons (Milestones) avec types prédéfinis + “Autre moment”, photo, description, humeur.
- Humeur du jour: quick add dans Home (sans redirection sheet).
- Timeline Home/Chrono: label par type de jalon (ou titre pour “Autre”), description en détail, emoji humeur en détail.
- Upload photo (1 image) via image picker + stockage Firebase.

### Milestones (EN)

- New Milestones screen with predefined types + “Other moment”, photo, description, mood.
- Mood quick add in Home (no sheet redirect).
- Home/Chrono timeline: label from milestone type (or title for “Other”), description in details, mood emoji in details.
- Photo upload (single image) via image picker + Firebase storage.

### Activités / Activities

- Nouvel écran Activités (Plus) avec types d’activité prédéfinis.
- Pagination et grouping identiques aux autres écrans.
- Intégration Home/Chrono pour ajout/édition.

### Activities (EN)

- New Activities screen (Plus) with predefined activity types.
- Pagination and grouping aligned with other screens.
- Home/Chrono integration for add/edit.

### Événements / Events

- Nouveaux types: `sommeil`, `bain`, `activite`, `jalon`.
- Services migration (double-write + hybride) et cache Today mis à jour pour ces types.

### Events (EN)

- New types: `sommeil`, `bain`, `activite`, `jalon`.
- Migration services (double-write + hybrid) and Today cache updated for these types.

## 2026-01-30 — Soins / Santé (MVP)

### Résumé

Création de l’écran Soins, ajout des nouveaux types santé, et intégration Home/Chrono avec quick add et édition directe.

### Summary

Introduced the Soins screen, added new health event types, and wired Home/Chrono for quick add and direct edit.

### Soins / Santé

- Nouveaux types d’événements: température, symptôme, médicament, vaccin, vitamine.
- Écran Soins (Plus) aligné avec les autres écrans (filtres, calendrier, pagination, sheet).
- Sheet Soins: breadcrumbs vaccin/vitamine, recherche + sélection, “Autre” avec champ libre.
- Vaccins: dose affichée (readonly sauf “Autre”), affichage de la dose dans la liste.
- Vitamines D/K: quantité en gouttes avec picker +/− (auto-repeat).
- Température: picker +/− borné 34–45°C, mode de prise requis (défaut axillaire).
- Température + Symptôme: création simultanée possible, même date/heure (chips principales).

### Soins / Health (EN)

- New event types: temperature, symptom, medication, vaccine, vitamin.
- New Soins screen aligned with other screens (filters, calendar, pagination, sheet).
- Soins sheet: vaccine/vitamin breadcrumbs, search + selection, “Other” with free text.
- Vaccines: dose displayed (readonly except “Other”), dose shown in list.
- Vitamins D/K: drop quantity with +/- picker (auto-repeat).
- Temperature: +/- picker capped 34–45°C, intake mode required (default axillary).
- Temperature + Symptom: can be created together at the same date/time (main chips).

### Navigation & UX

- Home: quick add Soins avec type pré‑sélectionné.
- Home/Chrono: édition des events santé redirigée vers Soins.

### Navigation & UX (EN)

- Home: quick add Soins with preselected type.
- Home/Chrono: health event edits routed to Soins.

## 2026-01-24 — Share & Invitations

### Résumé

Amélioration du flow de partage (invitations et codes), déduplication des notifications, et purge globale des codes expirés via Cloud Function.

### Summary

Sharing flow improvements (invites and codes), notification de-duplication, and global purge of expired codes via Cloud Function.

### Partage / Invitations

- Déduplication côté listener pour éviter les doubles popups.
- Nettoyage automatique des invitations en double et déjà liées (Join + listener global).
- Blocage si le destinataire est déjà parent ou si une invitation est déjà en attente.
- Ajout du champ `invitedUserId` pour fiabiliser l’écoute des invitations.
- Écoute des invitations par `invitedEmail` + `invitedUserId`.
- Bouton “Voir les invitations” dans Explore (redirige vers Join).
- Auto-dismiss des modales info sans bouton OK.
- Suppression des modales de succès redondantes (acceptation/ajout).

### Sharing / Invitations (EN)

- Listener-side de-duplication to avoid double popups.
- Automatic cleanup of duplicate/already-linked invites (Join + global listener).
- Block send if recipient is already a parent or a pending invite exists.
- Added `invitedUserId` for more reliable invite delivery.
- Listen by `invitedEmail` + `invitedUserId`.
- “See invitations” button in Explore (routes to Join).
- Auto-dismiss info modals without OK buttons.
- Removed redundant success modals (accept/add).

### Codes de partage

- Vérification d’unicité avec retry lors de la génération.
- Écoute temps réel du code actif pour le masquer après usage.
- Purge globale des codes expirés via Cloud Function (Node 20).

### Share Codes (EN)

- Uniqueness retry on code generation.
- Live active-code listener to hide used codes.
- Global purge of expired codes via scheduled Cloud Function (Node 20).

### Loader / UX

- Loader d’acceptation harmonisé avec Boot (Dots + Pulse Icons, teinte tint).

### Loader / UX (EN)

- Invite-accept loader aligned with Boot (Dots + Pulse Icons, tint color).

## 2026-01-20 — Navigation + Chrono/Growth Unification

### Résumé

Refonte de la navigation (onglet Plus), intégration d'une timeline cohérente dans Home/Chrono, et ajout du suivi Croissance avec intégration events/migration.

### Summary

Navigation refactor (Plus tab), consistent timeline styling across Home/Chrono, and new Growth tracking wired into events/migration services.

### Navigation & IA d'affichage

- Onglets visibles réduits a Home/Chrono/Stats/Plus, avec acces aux ecrans detail via Plus. Fichier: app/(drawer)/baby/\_layout.tsx, app/(drawer)/baby/plus.tsx
- Timeline recente integree a Home avec styles Chrono (dot + ligne + icones). Fichier: app/(drawer)/baby/home.tsx

### Navigation & Display (EN)

- Visible tabs reduced to Home/Chrono/Stats/Plus, with detail screens routed via Plus. File: app/(drawer)/baby/\_layout.tsx, app/(drawer)/baby/plus.tsx
- Recent timeline integrated into Home using Chrono styles (dot + line + icons). File: app/(drawer)/baby/home.tsx

### Croissance

- Nouvel ecran Croissance avec graphe + liste timeline, edition via bottom sheet global. Fichier: app/(drawer)/baby/croissance.tsx
- Nouveau service de persistance Croissance (collection legacy) + integration double-write/hybride. Fichiers: services/croissanceService.ts, migration/eventsDoubleWriteService.ts, migration/eventsHybridService.ts
- Extension des types events pour inclure Croissance. Fichier: services/eventsService.ts

### Growth (EN)

- New Growth screen with chart + timeline list, edits via global bottom sheet. File: app/(drawer)/baby/croissance.tsx
- New Growth persistence service (legacy collection) + double-write/hybrid integration. Files: services/croissanceService.ts, migration/eventsDoubleWriteService.ts, migration/eventsHybridService.ts
- Events types extended to include Growth. File: services/eventsService.ts

### Bottom sheet global

- GlobalSheetManager centralise l'affichage du FormBottomSheet et stabilise les retours d'ecran. Fichiers: components/ui/GlobalSheetManager.tsx, contexts/SheetContext.tsx, app/\_layout.tsx
- Ecrans repas/pompages/couches/immunos migrés vers l'ouverture via contexte. Fichiers: app/(drawer)/baby/meals.tsx, app/(drawer)/baby/pumping.tsx, app/(drawer)/baby/diapers.tsx, app/(drawer)/baby/immunizations.tsx

### Global bottom sheet (EN)

- GlobalSheetManager centralizes FormBottomSheet rendering and stabilizes navigation returns. Files: components/ui/GlobalSheetManager.tsx, contexts/SheetContext.tsx, app/\_layout.tsx
- Meals/Pumping/Diapers/Immunos screens migrated to context-based opening. Files: app/(drawer)/baby/meals.tsx, app/(drawer)/baby/pumping.tsx, app/(drawer)/baby/diapers.tsx, app/(drawer)/baby/immunizations.tsx

### Chargement

- Loader Chrono harmonise et evite le flash "aucun evenement" au chargement initial. Fichier: app/(drawer)/baby/chrono.tsx

### Loading (EN)

- Chrono loader harmonized and avoids the initial "no events" flash. File: app/(drawer)/baby/chrono.tsx

## 2025-01-12 — UX & Offline Stabilization

### Résumé

Cette itération améliore la fluidité perçue (pagination progressive, loaders stables), harmonise les confirmations de suppression, et introduit un feedback offline clair (badge + toast).

### Summary

This iteration improves perceived smoothness (progressive pagination, stable loaders), harmonizes delete confirmations, and introduces clear offline feedback (badge + toast).

### UI/UX

- Boutons du FormBottomSheet clarifiés: primaire en bleu avec libellé, annuler en secondaire discret, suppression en danger secondaire avec icône et positionnée sous la ligne principale. Fichier: components/ui/FormBottomSheet.tsx
- Le choix de vaccin dans Immunos devient un “step” interne avec breadcrumb (plus de modal plein écran). Fichier: app/(drawer)/baby/immunos.tsx
- Recherche insensible aux accents pour les listes de vaccins. Fichiers: app/(drawer)/baby/immunos.tsx, app/suivibaby/vaccins.tsx, utils/text.ts

### UI/UX (EN)

- FormBottomSheet actions clarified: primary blue button with label, subtle secondary cancel, delete as a secondary danger action with icon placed below the main row. File: components/ui/FormBottomSheet.tsx
- Vaccine selection in Immunos becomes an internal step with breadcrumb (no full-screen modal). File: app/(drawer)/baby/immunos.tsx
- Accent-insensitive search for vaccine lists. Files: app/(drawer)/baby/immunos.tsx, app/suivibaby/vaccins.tsx, utils/text.ts

### Pagination & Loading

- Pagination par fenêtre de 14 jours + “Voir plus” sur tous les écrans concernés, avec auto‑load limité à 5 tentatives. Fichiers: app/(drawer)/baby/repas.tsx, app/(drawer)/baby/pompages.tsx, app/(drawer)/baby/excretions.tsx, app/(drawer)/baby/immunos.tsx, app/suivibaby/vitamines.tsx, app/suivibaby/vaccins.tsx, app/suivibaby/mictions.tsx, app/suivibaby/selles.tsx, constants/pagination.ts
- hasMore recalculé uniquement au chargement initial et lors des changements de fenêtre (daysWindow). Même fichiers.
- Fallback après timeout pour waitForServer afin d’éviter un loader infini en offline cache vide. Fichier: services/eventsService.ts

### Pagination & Loading (EN)

- 14-day window pagination + "Voir plus" across relevant screens, with auto-load capped at 5 attempts. Files: app/(drawer)/baby/repas.tsx, app/(drawer)/baby/pompages.tsx, app/(drawer)/baby/excretions.tsx, app/(drawer)/baby/immunos.tsx, app/suivibaby/vitamines.tsx, app/suivibaby/vaccins.tsx, app/suivibaby/mictions.tsx, app/suivibaby/selles.tsx, constants/pagination.ts
- hasMore recalculated only on initial load and when the window (daysWindow) changes. Same files.
- waitForServer timeout fallback to avoid infinite loaders when offline with empty cache. File: services/eventsService.ts

### Offline UX

- Badge “Hors ligne” global dans le layout Drawer. Fichier: app/(drawer)/\_layout.tsx
- Système de toast global + messages contextualisés sur CRUD en offline (ajout/modif/suppression). Fichiers: contexts/ToastContext.tsx, app/(drawer)/\_layout.tsx, app/(drawer)/baby/repas.tsx, app/(drawer)/baby/pompages.tsx, app/(drawer)/baby/excretions.tsx, app/(drawer)/baby/immunos.tsx, app/suivibaby/vitamines.tsx, app/suivibaby/vaccins.tsx, app/suivibaby/mictions.tsx, app/suivibaby/selles.tsx
- Dépendance réseau ajoutée: @react-native-community/netinfo. Fichier: package.json

### Offline UX (EN)

- Global "Hors ligne" banner in the drawer layout. File: app/(drawer)/\_layout.tsx
- Global toast system + offline CRUD messages (add/edit/delete). Files: contexts/ToastContext.tsx, app/(drawer)/\_layout.tsx, app/(drawer)/baby/repas.tsx, app/(drawer)/baby/pompages.tsx, app/(drawer)/baby/excretions.tsx, app/(drawer)/baby/immunos.tsx, app/suivibaby/vitamines.tsx, app/suivibaby/vaccins.tsx, app/suivibaby/mictions.tsx, app/suivibaby/selles.tsx
- Network dependency added: @react-native-community/netinfo. File: package.json

### Confirmations de suppression

- Remplacement des Alert par un modal de confirmation partagé. Fichier: components/ui/ConfirmModal.tsx
- Intégration sur tous les écrans CRUD listés ci‑dessus.

### Delete confirmations (EN)

- Replaced Alert dialogs with a shared confirmation modal. File: components/ui/ConfirmModal.tsx
- Integrated across all CRUD screens listed above.

### Divers

- Centralisation de MAX_AUTO_LOAD_ATTEMPTS. Fichier: constants/pagination.ts

### Misc (EN)

- Centralized MAX_AUTO_LOAD_ATTEMPTS. File: constants/pagination.ts
