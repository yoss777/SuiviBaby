# CHANGELOG

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
- Badge “Hors ligne” global dans le layout Drawer. Fichier: app/(drawer)/_layout.tsx
- Système de toast global + messages contextualisés sur CRUD en offline (ajout/modif/suppression). Fichiers: contexts/ToastContext.tsx, app/(drawer)/_layout.tsx, app/(drawer)/baby/repas.tsx, app/(drawer)/baby/pompages.tsx, app/(drawer)/baby/excretions.tsx, app/(drawer)/baby/immunos.tsx, app/suivibaby/vitamines.tsx, app/suivibaby/vaccins.tsx, app/suivibaby/mictions.tsx, app/suivibaby/selles.tsx
- Dépendance réseau ajoutée: @react-native-community/netinfo. Fichier: package.json

### Offline UX (EN)
- Global "Hors ligne" banner in the drawer layout. File: app/(drawer)/_layout.tsx
- Global toast system + offline CRUD messages (add/edit/delete). Files: contexts/ToastContext.tsx, app/(drawer)/_layout.tsx, app/(drawer)/baby/repas.tsx, app/(drawer)/baby/pompages.tsx, app/(drawer)/baby/excretions.tsx, app/(drawer)/baby/immunos.tsx, app/suivibaby/vitamines.tsx, app/suivibaby/vaccins.tsx, app/suivibaby/mictions.tsx, app/suivibaby/selles.tsx
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
