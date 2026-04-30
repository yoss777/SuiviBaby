# Migration runtime 2026 — Cloud Functions Node 22 + firebase-functions v5

> Sprint 2 — exécuté 2026-04-29
> Statut : prêt à déployer

## Pourquoi

GCP/Firebase a déprécié Node 20 le **2026-04-30**. Sans migration, plus aucun déploiement de Cloud Functions n'est accepté à partir de cette date (le runtime reste exécuté quelques mois en mode gracieux, mais aucun fix ne peut être poussé).

`firebase-functions` v4 supporte Node 22 mais l'API v1 (`functions.firestore.document(...).onCreate(...)`) y est dépréciée. v5 la supprime franchement et réoriente tout vers les triggers v2 (`onDocumentCreated`, `onSchedule`, etc.). Migrer les deux ensemble évite un sprint en deux temps.

## Versions

| Composant | Avant | Après |
|-----------|-------|-------|
| Node (Cloud Functions) | 20 | **22** |
| `firebase-functions` | ^4.9.0 | **^5.1.1** |
| `firebase-admin` | ^12.7.0 | inchangé |
| `expo-server-sdk` | ^6.1.0 | inchangé |
| `resend` | ^6.9.3 | inchangé |
| Région | europe-west1 | inchangé |
| Triggers v1 restants | 1 (`onReportCreated`) | 0 |

Côté `firebase.json` :
```json
"functions": {
  "source": "functions",
  "runtime": "nodejs22"
}
```

Côté `functions/package.json` :
```json
"engines": { "node": "22" },
"dependencies": {
  "firebase-functions": "^5.1.1"
}
```

## Liste des CFs (toutes en v2 après migration)

`onCall` (`firebase-functions/v2/https`) :
- `transcribeAudio`
- `validateAndCreateEvent`
- `validateAndUpdateEvent`
- `deleteEventCascade`
- `deleteUserAccount`
- `resolveReport`
- `createShareInvitation`
- `getUsageQuotaStatus`
- `consumeUsageQuota`
- `cancelDeletionRequest`
- `voteDeletionRequest`
- `createDeletionRequest`
- `sendDeletionRequestEmail`
- `validateReferralCode`
- `generateAiInsight`

`onRequest` (`firebase-functions/v2/https`) :
- `revenueCatWebhook`

`onSchedule` (`firebase-functions/v2/scheduler`) :
- `cleanupExpiredShareCodes` (24 h)
- `processScheduledDeletions` (24 h)
- `purgeDeletedChildren` (24 h)
- `checkAndSendReminders` (4 h)
- `sendWeeklyRecap` (cron hebdo)

`onDocumentCreated` (`firebase-functions/v2/firestore`) :
- `onReportCreated` ← **migré dans S2-T2**

## Procédure de déploiement

### Préreq local
- Node 22 actif (`nvm use 22` ou `volta`).
- `gcloud` authentifié sur le projet `samaye-53723`.
- `firebase login` à jour.

### Phase A — staging (24 h soak)
```bash
firebase use staging
cd functions && rm -rf node_modules package-lock.json && npm install
npx jest --config jest.config.js
firebase deploy --only functions
```

Smoke test depuis l'app staging :
1. Login + création d'event
2. Commande vocale (déclenche `transcribeAudio` + `consumeUsageQuota`)
3. Création d'un report sur une photo (déclenche `onReportCreated`)
4. Demande de suppression de compte (déclenche `requestAccountDeletion` côté client)

Surveiller pendant 24 h :
- `gcloud functions list --project=samaye-staging` → toutes en `nodejs22`
- Cloud Logging : aucun `unsupported runtime`
- Cold start P95 mesuré avant/après — Node 22 est légèrement plus lent au démarrage, ne pas s'inquiéter sous 200 ms d'écart

### Phase B — prod, par vagues
**Vague 1** (CFs non-critiques, faible volume) :
```bash
firebase use production
firebase deploy --only \
  functions:cleanupExpiredShareCodes,\
functions:purgeDeletedChildren,\
functions:processScheduledDeletions
```
Attendre 1 h. Vérifier les logs.

**Vague 2** (CFs critiques business + revenu) :
```bash
firebase deploy --only \
  functions:transcribeAudio,\
functions:revenueCatWebhook,\
functions:consumeUsageQuota,\
functions:validateAndCreateEvent,\
functions:validateAndUpdateEvent
```
Attendre 4 h. Surveiller :
- Sentry : pic d'erreurs `unauthenticated`, `internal`, `failed-precondition`
- Console Firebase Functions → onglet "Health" pour chaque CF

**Vague 3** (le reste) :
```bash
firebase deploy --only functions
```

## Rollback

Tant que GCP n'a pas hard-deprecated Node 20 (fenêtre estimée jusqu'à août 2026), le rollback est possible :

```bash
# 1. Revenir le commit
git revert <sha-S2-T1> <sha-S2-T2>

# 2. Restaurer les deps
cd functions && rm -rf node_modules package-lock.json && npm install

# 3. Redéployer
firebase deploy --only functions
```

Coût : 1 fenêtre de 5 min downtime potentielle si une CF est en cours d'exécution au moment du redeploy. Le déploiement Firebase est atomique par CF — pas de rollback partiel sale.

## Checklist post-déploiement

- [ ] `gcloud functions list --project=samaye-53723 --format="value(runtime)" | sort -u` retourne uniquement `nodejs22`
- [ ] Aucun warning `unsupported runtime` dans Cloud Logging sur 7 j
- [ ] P95 latency `transcribeAudio` < 8 s (baseline pré-migration : ~6 s)
- [ ] Cron `processScheduledDeletions` a tourné au moins une fois sans erreur
- [ ] `revenueCatWebhook` reçoit toujours les events RC (vérifier RevenueCat dashboard)
- [ ] Sentry : pas de spike d'erreurs CF post-deploy
- [ ] Mettre à jour `docs/FIREBASE_MONITORING.md` section runtime

## Tests

`npm run test:functions` retourne **51/51 verts** sous Node 22 + firebase-functions 5.1.1. Le mock `firebase-functions/v2/firestore` ajouté dans `functions/__tests__/setup.js` permet aux nouveaux triggers `onDocumentCreated` d'être testables comme les `onCall` / `onSchedule`.

## Liens

- Commit S2-T1 (Node 22) : `8ff8fbd`
- Commit S2-T2 (firebase-functions 5) : `3073df5`
- Branche : `sprint2/runtime-migration`
- Plan d'origine : `plan_sprint2_migration_runtime.md`
