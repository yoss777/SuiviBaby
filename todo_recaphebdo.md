# Plan d'implémentation — Récap Hebdomadaire par Email

## Contexte

Le toggle "Récap hebdomadaire par email" existe dans l'écran Notifications (`email: boolean` dans `user_preferences`), mais aucune infrastructure email n'est en place. L'objectif est d'envoyer chaque lundi un email résumant la semaine de suivi de chaque enfant.

### Infrastructure existante

- ✅ Préférence `email: boolean` dans `user_preferences/{userId}.notifications`
- ✅ `obtenirStats24h()` dans eventsService.ts (pattern réutilisable pour stats hebdo)
- ✅ `exportAllEventsCSV()` dans exportService.ts (formatage des données par type)
- ✅ Cloud Functions déployées (europe-west1) — pattern `onSchedule` établi
- ✅ Collection `events` avec tous les types + dates
- ✅ `user_child_access` pour lister les enfants par utilisateur
- ✅ Email utilisateur disponible via Firebase Auth (`admin.auth().getUser(uid)`)
- ❌ Pas de service email (SendGrid, Resend, etc.)
- ❌ Pas de template email
- ❌ Pas de CF pour le récap hebdo
- ❌ Pas de stats hebdomadaires (seulement 24h)

---

## Phase 1 — Choix du service email + setup

### 1.1 Recommandation : Resend

**Pourquoi Resend plutôt que SendGrid :**
- API moderne, DX simple (1 appel, pas de templates côté serveur)
- Free tier : 3000 emails/mois (largement suffisant)
- Support React Email pour templates JSX (optionnel mais agréable)
- Pas besoin de vérifier un domaine pour commencer (emails depuis `onboarding@resend.dev`)

**Alternative** : SendGrid (free tier 100/jour), Mailgun, ou Firebase Extension "Trigger Email from Firestore"

### 1.2 Setup

```bash
cd functions && npm install resend
```

- Créer un compte Resend → obtenir une API key
- Stocker la clé via Firebase Secrets Manager :
  ```bash
  firebase functions:secrets:set RESEND_API_KEY
  ```
- Plus tard : vérifier un domaine personnalisé (ex: `notifications@samaye.app`) pour le branding

---

## Phase 2 — Cloud Function `sendWeeklyRecap`

### 2.1 CF scheduled (onSchedule)

Planifiée **chaque lundi à 8h00 (Europe/Paris)** :

```javascript
exports.sendWeeklyRecap = onSchedule(
  {
    schedule: "every monday 08:00",
    timeZone: "Europe/Paris",
    region: "europe-west1",
    memory: "256MiB",
    timeoutSeconds: 300,
    secrets: ["RESEND_API_KEY"],
  },
  async () => { ... }
);
```

### 2.2 Logique

```
1. Requêter tous les user_preferences où notifications.email === true
2. Pour chaque utilisateur :
   a. Récupérer son email via admin.auth().getUser(uid)
   b. Récupérer ses enfants via user_child_access
   c. Pour chaque enfant :
      - Requêter les événements de la semaine écoulée (lundi-dimanche)
      - Calculer les stats hebdo par catégorie
   d. Générer le HTML de l'email
   e. Envoyer via Resend API
   f. Enregistrer dans recap_history
```

### 2.3 Stats hebdomadaires à calculer

Pour chaque enfant, sur la semaine écoulée (lundi 00:00 → dimanche 23:59) :

| Catégorie | Métriques |
|-----------|-----------|
| **Repas** | Nombre total, biberons (count + total ml), tétées (count + total min), solides (count) |
| **Sommeil** | Nombre de nuits + siestes, total heures, moyenne/jour |
| **Changes** | Nombre total mictions + selles |
| **Pompages** | Nombre, total ml |
| **Croissance** | Dernière mesure poids/taille si enregistrée cette semaine |
| **Santé** | Températures, médicaments, symptômes, vaccins |
| **Activités** | Nombre d'activités d'éveil |

Comparaison avec la semaine précédente (tendances ↑↓→) pour les métriques clés.

---

## Phase 3 — Template email HTML

### 3.1 Structure du récap

```
┌──────────────────────────────────────┐
│  🍼 Récap semaine — {Prénom}         │
│  Semaine du {date} au {date}         │
├──────────────────────────────────────┤
│                                      │
│  🍽️ Alimentation                     │
│  42 repas · 12 biberons (2400ml)     │
│  18 tétées · 12 solides              │
│  ↑ +3 repas vs semaine précédente    │
│                                      │
│  😴 Sommeil                          │
│  14h20 en moyenne/jour               │
│  7 nuits · 21 siestes                │
│  → Stable vs semaine précédente      │
│                                      │
│  🧷 Changes                          │
│  48 changes (28 pipis · 20 selles)   │
│                                      │
│  🤱 Tire-lait                        │
│  8 pompages · 1200ml total           │
│                                      │
│  📏 Croissance                       │
│  Poids: 5.2kg · Taille: 58cm        │
│  (si mesure cette semaine)           │
│                                      │
│  💊 Santé                            │
│  2 vitamines · 0 médicament          │
│  Aucun symptôme signalé ✓            │
│                                      │
├──────────────────────────────────────┤
│  Ouvrir Samaye →                     │
│  (deep link vers le dashboard)       │
│                                      │
│  Se désabonner                       │
└──────────────────────────────────────┘
```

### 3.2 Approche template

Option simple : HTML inline dans la CF (pas de dépendance supplémentaire).
Le HTML doit être responsive (compatible Gmail, Apple Mail, Outlook).

Utiliser un helper `buildRecapHTML(childName, weekRange, stats, previousStats)` dans un fichier séparé `functions/emailTemplates.js`.

---

## Phase 4 — Collections Firestore

### 4.1 `recap_history`

```
recap_history/{docId}
  userId: string
  childId: string
  weekStart: Timestamp      // Lundi 00:00
  weekEnd: Timestamp        // Dimanche 23:59
  sentAt: Timestamp
  stats: {                  // Snapshot des stats pour référence
    meals: { count, biberonsMl, ... },
    sleep: { totalMinutes, avgPerDay, ... },
    ...
  }
```

Anti-doublon : ne pas renvoyer si un recap existe déjà pour le même userId + childId + weekStart.

### 4.2 Règles Firestore

```
match /recap_history/{docId} {
  // Lecture seule pour l'utilisateur (écriture par CF uniquement)
  allow read: if isSignedIn() && resource.data.userId == request.auth.uid;
  allow write: if false;
}
```

---

## Phase 5 — Lien de désabonnement

### 5.1 Approche

Le lien "Se désabonner" dans l'email doit permettre de couper les récaps sans ouvrir l'app.

Options :
1. **Simple** : deep link `samaye://settings/notifications` → ouvre l'app sur l'écran notifications
2. **Sans app** : CF HTTPS `unsubscribeRecap?token=xxx` → page web qui met `email: false` dans Firestore

Recommandation : commencer par l'option 1 (deep link), ajouter l'option 2 plus tard si nécessaire.

---

## Ordre d'implémentation

| Étape | Priorité | Effort |
|-------|----------|--------|
| Phase 1 — Setup Resend + secret | 🔴 Haute | Faible |
| Phase 2 — CF sendWeeklyRecap (stats + envoi) | 🔴 Haute | Élevé |
| Phase 3 — Template HTML responsive | 🟠 Moyenne | Moyen |
| Phase 4 — Collection recap_history + rules | 🟡 Basse | Faible |
| Phase 5 — Lien désabonnement | 🟡 Basse | Faible |

---

## Fichiers impactés

| Fichier | Action |
|---------|--------|
| `functions/index.js` | Ajouter CF `sendWeeklyRecap` |
| `functions/emailTemplates.js` | **Créer** — helper HTML du récap |
| `functions/package.json` | Ajouter `resend` |
| `firestore.rules` | Ajouter règles `recap_history` |
| `app/settings/notifications.tsx` | Déjà fait (toggle "Récap hebdomadaire") |

---

## Notes techniques

- **Resend free tier** : 3000 emails/mois, 100/jour — suffisant pour des centaines d'utilisateurs
- **Quotas CF** : 1 invocation/semaine (lundi 8h) — négligeable
- **Payload** : chaque email ≈ 5-10 KB HTML — pas de pièce jointe
- **Timezone** : `Europe/Paris` pour le schedule (l'app est en français)
- **Multi-enfants** : un email séparé par enfant, ou un seul email avec sections par enfant
- **RGPD** : lien de désabonnement obligatoire dans chaque email
- **Domaine** : commencer avec `onboarding@resend.dev`, migrer vers `notifications@samaye.app` après vérification DNS
