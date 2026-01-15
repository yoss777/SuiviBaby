# Settings Changelog

This file summarizes all the changes applied to the Settings area of the app during this session.

## Summary

- Refactored Settings UI for clearer navigation and states.
- Implemented profile, password, notifications, theme, export, privacy, and help updates.
- Introduced reusable modal components and improved consistency across Settings screens.

## Changes by Screen

### Settings Home (app/(drawer)/settings.tsx)

- Added right-side value display for items (e.g., Theme, Language) and improved disabled states.
- Removed the Email item from the list (email is now shown in Profile only).
- Added modal for "About" instead of alerts.
- Synced theme label with Theme preference (Auto/Light/Dark).

### Profile (app/settings/profile.tsx)

- Simplified to only two fields: Pseudo (editable) and Email (read-only).
- Added validation (min 6 chars), disabled save when invalid or unchanged.
- Wired save to Firestore via `modifierNomUtilisateur` and refresh user context.
- Replaced alerts with InfoModal.
- Added helper text and improved error handling.

### Password (app/settings/password.tsx)

- Wired real password change with Firebase re-auth + updatePassword.
- Added password rules, strength bar, and inline validation.
- Added "Mot de passe oublie" flow using email reset.
- Replaced alerts with InfoModal.
- Improved accessibility (textContentType, autoCapitalize).

### Notifications (app/settings/notifications.tsx)

- Removed medical reminders section and SMS channel (not supported).
- Simplified to Push + Email + Info topics (Updates, Tips, Marketing).
- Persisted settings in `user_preferences.notifications`.
- Added push permission check with OS settings redirect if denied.
- Replaced alerts with InfoModal.

### Theme (app/settings/theme.tsx)

- Implemented theme preference persistence in Firestore (light/dark/auto).
- Added ThemeContext and global application of theme.
- Refactored Theme screen to settings-style list.
- Updated navigation theme + StatusBar based on selected theme.

### Export (app/settings/export.tsx)

- Implemented real JSON export (local file + share) for baby tracking only.
- Added child selection (only visible children) + event-type filtering.
- Added summary modal with per-child counts and carousel navigation.
- Added loading indicator for children list (IconPulseDots).
- Added export metadata (exportDate, exportBy).
- Disabled export if no child or no types selected.

### Privacy (app/settings/privacy.tsx)

- Replaced policy content with MVP RGPD-friendly text.
- Added placeholders for legal details (company, address, hosting region, DPO).

### Terms (app/settings/terms.tsx)

- Replaced CGU content with MVP version adapted to the app.
- Added placeholders for legal entity and jurisdiction.

### Help (app/settings/help.tsx)

- Rewrote FAQ to match actual flows and capabilities.
- Removed phone/chat support options (not supported).
- Replaced alerts with InfoModal for feedback.

## Supporting Changes

- Added InfoModal component (components/ui/InfoModal.tsx).
- Added ThemeContext and theme preference handling.
- Extended user_preferences service with notifications + theme + language handling.
- Added Expo Notifications, FileSystem, and Sharing dependencies.

## Files Touched

- app/(drawer)/settings.tsx
- app/settings/profile.tsx
- app/settings/password.tsx
- app/settings/notifications.tsx
- app/settings/theme.tsx
- app/settings/export.tsx
- app/settings/privacy.tsx
- app/settings/terms.tsx
- app/settings/help.tsx
- components/ui/InfoModal.tsx
- contexts/ThemeContext.tsx
- hooks/use-color-scheme.ts
- hooks/use-color-scheme.web.ts
- services/userPreferencesService.ts
- app/_layout.tsx
- package.json

## Notes / Follow-ups

- Replace placeholders in privacy and terms with legal entity details.
- Run `npx expo install expo-notifications expo-file-system expo-sharing`.
- Consider wiring the help contact form to a real support channel.
