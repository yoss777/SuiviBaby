# Plan d'implémentation — Notifications Push & Rappels

## État d'avancement

| Phase | Statut | Détails |
|-------|--------|---------|
| Phase 4.2 — Notifications locales | ✅ FAIT | `localNotificationService.ts` + hook `useReminderScheduler` |
| Phase 1 — Push token registration | ✅ FAIT | `pushTokenService.ts` + AuthContext (register/remove) |
| Phase 1.3 — Règles Firestore | ✅ FAIT | `device_tokens` + `notification_history` déployées |
| Phase 2 — CF checkAndSendReminders | ✅ FAIT | Scheduled 30min, expo-server-sdk, anti-spam 2h |
| Phase 2.3 — Historique anti-spam | ✅ FAIT | Collection `notification_history` + guard 2h |
| Phase 3 — Deep linking | ✅ FAIT | Handler dans `_layout.tsx`, tap → `/baby/home` |
| Toggle push per-device | ✅ FAIT | `setDevicePushEnabled()` dans `device_tokens.enabled` |
| Warning couleur alimentation | ✅ FAIT | `isWarning` sur repas/pompages + toasts |
| Guard Expo Go | ✅ FAIT | Skip `getExpoPushTokenAsync` dans Expo Go |
| Phase 4.1 — UX améliorations | ⏳ À FAIRE | Badge vert push, bouton test, historique rappels |
| Phase 4.3 — Multi-enfants | ✅ FAIT | CF vérifie par enfant, notif inclut prénom |

## Fichiers créés

| Fichier | Rôle |
|---------|------|
| `services/localNotificationService.ts` | Planification/annulation notifs locales par catégorie+enfant |
| `services/pushTokenService.ts` | Register/remove/toggle Expo push token (per-device) |
| `hooks/useReminderScheduler.ts` | Hook React qui re-planifie les notifs quand prefs ou events changent |

## Fichiers modifiés

| Fichier | Modification |
|---------|-------------|
| `app/_layout.tsx` | `setupNotificationHandler()` + deep linking au tap |
| `app/(drawer)/baby/(tabs)/home.tsx` | `useReminderScheduler` + warning alimentation (repas/pompages) + toasts |
| `contexts/AuthContext.tsx` | `registerPushToken` au login, `removePushTokens` + `cancelAllReminders` au signOut |
| `firestore.rules` | Règles `device_tokens` + `notification_history` |
| `functions/index.js` | CF `checkAndSendReminders` (scheduled 30min) + cleanup device_tokens dans deleteUserAccount |
| `functions/package.json` | Ajout `expo-server-sdk` |
| `app/settings/notifications.tsx` | Toggle push → `setDevicePushEnabled()` per-device |
| `app.json` | Plugin `expo-notifications` avec icône Android |

## Architecture finale

```
┌─────────────────────────────────────────────────┐
│  App ouverte (home.tsx)                         │
│  useReminderScheduler → notifs locales          │
│  (planifie/annule à chaque changement)          │
└────────────────────┬────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────┐
│  App fermée / arrière-plan                      │
│  CF checkAndSendReminders (toutes les 30min)    │
│  → Expo Push API → tous les devices activés     │
│  → Anti-spam 2h (notification_history)          │
└─────────────────────────────────────────────────┘
```

## Reste à faire (Phase 4.1 — UX)

- [ ] Indicateur visuel quand les push sont activées (badge vert sur le toggle)
- [ ] Bouton "Tester les notifications" dans l'écran notifications
- [ ] Afficher l'historique des rappels récents (lire `notification_history`)

## Notes techniques

- **Expo Push Token** : format `ExponentPushToken[xxxx]`, obtenu via `Notifications.getExpoPushTokenAsync({ projectId })`
- **expo-server-sdk** : librairie Node.js officielle pour envoyer des push via l'API Expo
- **Rate limiting** : Expo limite à 600 notifs/seconde par projet — largement suffisant
- **Quotas Firebase** : `onSchedule` toutes les 30min = 48 invocations/jour (Blaze plan nécessaire)
- **Offline** : les notifications locales fonctionnent sans connexion, contrairement aux push serveur
- **Per-device** : le toggle push met à jour `device_tokens.enabled`, la CF filtre `where("enabled", "==", true)`
- **Expo Go** : push tokens non disponibles (SDK 53+), guard `Constants.appOwnership === "expo"` en place
