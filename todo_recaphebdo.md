# Plan d'implémentation — Récap Hebdomadaire par Email

## État d'avancement

| Phase | Statut | Détails |
|-------|--------|---------|
| Phase 1 — Setup Resend + secret | ✅ FAIT | `resend` installé, `RESEND_API_KEY` dans Firebase Secrets |
| Phase 2 — CF sendWeeklyRecap | ✅ FAIT | Scheduled lundi 8h, stats hebdo, tendances, anti-doublon |
| Phase 3 — Template HTML responsive | ✅ FAIT | `functions/emailTemplates.js`, sections par catégorie |
| Phase 4 — Collection recap_history + rules | ✅ FAIT | Rules déployées, cleanup dans deleteUserAccount |
| Phase 5 — Deep link désabonnement | ✅ FAIT | `samaye://settings/notifications` |
| Default email pref → false | ✅ FAIT | Opt-in, pas opt-out |
| Email lu depuis Firestore users/ | ✅ FAIT | Pas depuis Firebase Auth |
| **Vérifier un domaine sur Resend** | ❌ BLOQUANT | Sans domaine vérifié, Resend refuse d'envoyer à des destinataires externes |

## Action requise — Domaine Resend

Resend en mode test n'autorise l'envoi qu'à l'email du propriétaire du compte (`u1193621432@gmail.com`). Pour envoyer à n'importe quel utilisateur :

### Option A — Acheter un domaine (recommandé)
1. Acheter un domaine (ex: `samaye.fr` ~5€/an, `samaye.app` ~12€/an)
2. Sur https://resend.com/domains → ajouter le domaine
3. Ajouter les enregistrements DNS fournis par Resend (DKIM, SPF, DMARC)
4. Attendre la vérification (~5 min)
5. Mettre à jour le `from` dans la CF :
   ```javascript
   from: "Samaye <notifications@samaye.app>"
   ```
6. Redéployer : `firebase deploy --only functions:sendWeeklyRecap`

### Option B — Tester en attendant
- Changer temporairement l'email dans `users/{userId}` à `u1193621432@gmail.com`
- Vider `recap_history`
- Forcer l'exécution depuis Cloud Scheduler
- Vérifier le rendu du récap

## Fichiers créés/modifiés

| Fichier | Rôle |
|---------|------|
| `functions/emailTemplates.js` | Template HTML responsive du récap |
| `functions/index.js` | CF `sendWeeklyRecap` (scheduled lundi 8h) + `computeWeeklyStats()` |
| `functions/package.json` | Ajout `resend` |
| `firestore.rules` | Règles `recap_history` (lecture user, écriture CF only) |
| `services/userPreferencesService.ts` | Default `email: false` (opt-in) |

## Bugs corrigés pendant l'implémentation

- **Email récupéré depuis Firebase Auth au lieu de Firestore** → corrigé, lit `users/{userId}.email`
- **Default `email: true`** → changé en `false` (opt-in obligatoire)
- **Calcul des dates** → ajusté pour supporter l'exécution forcée hors lundi

## Architecture

```
Cloud Scheduler (lundi 8h Europe/Paris)
  └→ CF sendWeeklyRecap
       ├→ Query user_preferences (notifications.email === true)
       ├→ Pour chaque user :
       │    ├→ Lire email depuis users/{userId}
       │    ├→ Lister enfants via user_child_access
       │    └→ Pour chaque enfant :
       │         ├→ computeWeeklyStats (semaine courante)
       │         ├→ computeWeeklyStats (semaine précédente → tendances)
       │         ├→ buildRecapHTML (template responsive)
       │         ├→ Resend API → envoyer email
       │         └→ Écrire recap_history (anti-doublon)
       └→ Log sent/skipped/users
```

## Notes techniques

- **Resend free tier** : 3000 emails/mois, 100/jour
- **Quotas CF** : 1 invocation/semaine (lundi 8h) — négligeable
- **RGPD** : lien de désabonnement dans chaque email (deep link)
- **Anti-doublon** : `recap_history` par userId + childId + weekStart
- **Multi-enfants** : un email par enfant (pas un email groupé)
- **Expéditeur actuel** : `Samaye <onboarding@resend.dev>` → à changer après vérification domaine
