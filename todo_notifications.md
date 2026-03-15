# Plan d'implémentation — Notifications Push & Rappels

## Contexte

Les rappels de suivi (repas, pompages, changes, vitamines) sont configurables dans l'écran Notifications, mais seuls les **toasts locaux** sont déclenchés quand l'app est ouverte (home.tsx). Aucune notification push n'est envoyée quand l'app est fermée/en arrière-plan.

### Mapping des catégories de rappels

| Clé threshold | Types d'événements couverts |
|---------------|----------------------------|
| `repas` | biberon, tetee, solide |
| `pompages` | pompage |
| `changes` | miction, selle, couche |
| `vitamines` | vitamine |

### Infrastructure existante

- ✅ `expo-notifications@~0.31.4` installé (non câblé)
- ✅ Préférences rappels stockées dans Firestore `user_preferences/{userId}.notifications.reminders`
- ✅ Cloud Functions déployées (europe-west1) — pattern établi
- ✅ Événements dans `events/{eventId}` avec `childId`, `userId`, `type`, `date`
- ✅ Permissions push demandées dans `notifications.tsx` (mais token non enregistré)
- ✅ Toast d'alerte locale dans `home.tsx` quand threshold dépassé (app ouverte uniquement)
- ❌ Pas de stockage de push token
- ❌ Pas de Cloud Function pour vérifier les rappels
- ❌ Pas d'envoi push via Expo API
- ❌ Pas d'historique de notifications envoyées
- ❌ Pas de deep linking depuis une notification

---

## Phase 1 — Enregistrement du push token

### 1.1 Service `pushTokenService.ts`

Nouveau fichier `services/pushTokenService.ts` :

```
- registerPushToken(): obtenir le token Expo via getExpoPushTokenAsync()
- savePushToken(userId, token): écrire dans Firestore
- removePushToken(userId, token): supprimer au signOut
- refreshPushToken(): mettre à jour si token change
```

### 1.2 Collection Firestore `device_tokens`

```
device_tokens/{docId}
  userId: string
  token: string          // ExponentPushToken[xxx]
  platform: "ios" | "android"
  enabled: boolean
  registeredAt: Timestamp
  lastUsedAt: Timestamp
```

### 1.3 Règles Firestore

```
match /device_tokens/{tokenId} {
  allow read, write: if request.auth != null && request.auth.uid == resource.data.userId;
  allow create: if request.auth != null && request.auth.uid == request.resource.data.userId;
}
```

### 1.4 Intégration dans l'app

- Appeler `registerPushToken()` après login réussi (dans `AuthContext` ou `_layout.tsx`)
- Appeler `removePushToken()` au signOut
- Écouter les changements de token (Expo émet un événement quand le token change)

---

## Phase 2 — Cloud Function de vérification des rappels

### 2.1 Installer `expo-server-sdk` dans `functions/`

```bash
cd functions && npm install expo-server-sdk
```

### 2.2 Cloud Function `checkAndSendReminders` (scheduled)

Planifiée toutes les 30 minutes via `onSchedule` :

```
1. Requêter tous les user_preferences où reminders.enabled === true
2. Pour chaque utilisateur :
   a. Récupérer ses device_tokens actifs
   b. Récupérer la liste des enfants (via children/{childId}/access/{uid})
   c. Pour chaque enfant :
      - Pour chaque catégorie (repas, pompages, changes, vitamines) :
        - Si threshold > 0 :
          - Requêter le dernier événement du type correspondant
          - Calculer: elapsed = (now - lastEvent.date) en heures
          - Si elapsed > threshold :
            - Vérifier qu'on n'a pas déjà envoyé une notif récemment (< 2h)
            - Envoyer la notification push via Expo API
            - Enregistrer dans notification_history
```

### 2.3 Collection `notification_history`

```
notification_history/{docId}
  userId: string
  childId: string
  category: "repas" | "pompages" | "changes" | "vitamines"
  sentAt: Timestamp
  thresholdHours: number
  elapsedHours: number
```

Anti-spam : ne pas renvoyer si une notification de la même catégorie + enfant a été envoyée il y a moins de 2 heures.

### 2.4 Logique de requête des événements

```javascript
// Pour "repas" (threshold en heures)
const repasTypes = ["biberon", "tetee", "solide"];
const lastRepasQuery = query(
  collection(db, "events"),
  where("childId", "==", childId),
  where("type", "in", repasTypes),
  orderBy("date", "desc"),
  limit(1)
);

// Pour "changes"
const changesTypes = ["miction", "selle", "couche"];

// Pour "pompages"
const pompagesTypes = ["pompage"];

// Pour "vitamines"
const vitaminesTypes = ["vitamine"];
```

---

## Phase 3 — Réception et routing des notifications

### 3.1 Handler de notifications dans `_layout.tsx`

```
- Notifications.setNotificationHandler(): définir comportement quand notif reçue (app ouverte)
- Notifications.addNotificationResponseReceivedListener(): gérer le tap sur une notif
```

### 3.2 Deep linking depuis notification

Payload de la notification :
```json
{
  "title": "Rappel repas — Prénom",
  "body": "Plus de 4h depuis le dernier repas",
  "data": {
    "type": "reminder",
    "category": "repas",
    "childId": "xxx",
    "route": "/baby/home"
  }
}
```

Au tap → naviguer vers le screen approprié via `router.push(data.route)`.

---

## Phase 4 — Améliorations UX

### 4.1 Écran notifications

- Indicateur visuel quand les push sont activées (badge vert)
- Bouton "Tester les notifications" pour vérifier que ça marche
- Afficher l'historique des rappels récents

### 4.2 Notifications locales (fallback)

Si pas de connexion ou CF non déclenchée, planifier des notifications locales via `Notifications.scheduleNotificationAsync()` à chaque création d'événement :

```
- Après un biberon → planifier une notif locale dans X heures (threshold repas)
- Après une miction → planifier dans X heures (threshold changes)
- Annuler les précédentes de la même catégorie
```

Avantage : fonctionne même sans backend, hors connexion.

### 4.3 Gestion multi-enfants

- Les rappels doivent être vérifiés **par enfant**
- La notification doit indiquer le prénom de l'enfant
- Un parent avec 2 enfants peut recevoir des rappels pour les deux

---

## Ordre d'implémentation recommandé

| Étape | Priorité | Effort |
|-------|----------|--------|
| Phase 4.2 — Notifications locales (fallback) | 🔴 Haute | Moyen |
| Phase 1 — Push token registration | 🔴 Haute | Faible |
| Phase 2 — CF checkAndSendReminders | 🟠 Moyenne | Élevé |
| Phase 3 — Deep linking depuis notification | 🟡 Basse | Faible |
| Phase 4.1 — UX améliorations | 🟡 Basse | Faible |
| Phase 2.3 — Historique anti-spam | 🟡 Basse | Faible |

**Recommandation** : commencer par les **notifications locales** (Phase 4.2) car elles offrent une valeur immédiate sans dépendance backend, puis ajouter le push serveur progressivement.

---

## Fichiers impactés

| Fichier | Action |
|---------|--------|
| `services/pushTokenService.ts` | **Créer** |
| `functions/index.js` | Ajouter CF `checkAndSendReminders` |
| `functions/package.json` | Ajouter `expo-server-sdk` |
| `firestore.rules` | Ajouter règles `device_tokens`, `notification_history` |
| `app/_layout.tsx` | Initialiser notification handler + token |
| `contexts/AuthContext.tsx` | Appeler register/remove token |
| `app/settings/notifications.tsx` | Ajouter test notification, indicateur push |
| `services/eventsService.ts` | Planifier notif locale après création événement |

---

## Notes techniques

- **Expo Push Token** : format `ExponentPushToken[xxxx]`, obtenu via `Notifications.getExpoPushTokenAsync({ projectId })`
- **expo-server-sdk** : librairie Node.js officielle pour envoyer des push via l'API Expo
- **Rate limiting** : Expo limite à 600 notifs/seconde par projet — largement suffisant
- **Quotas Firebase** : `onSchedule` toutes les 30min = 48 invocations/jour (Blaze plan nécessaire)
- **Offline** : les notifications locales fonctionnent sans connexion, contrairement aux push serveur
