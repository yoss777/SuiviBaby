# B2 — Red team suppression de données (RGPD) : plan d'action

**Statut :** ⚪ recon à faire
**Effort estimé :** 4 h

## Périmètre

- `services/accountDeletionService.ts`
- `services/childDeletionService.ts`
- Collections `deletion-requests`, `children` (tombstones, `pendingDeletionAt`)
- CFs `processScheduledDeletions`, `purgeDeletedChildren`, `deleteEventCascade`
- Storage rules (photos liées à un enfant supprimé)
- Constantes `CHILD_DELETION_RETENTION_DAYS = 30`, `DELETION_REQUEST_EXPIRY_DAYS = 7`

## Surfaces d'attaque à investiguer

1. **Suppression incomplète** — un user supprime son compte, mais ses events/photos/notifications restent ?
2. **Retention au-delà du légal** — 30 jours OK, mais sous-collections oubliées (likes, commentaires, eventLikes, optimistic queue) ?
3. **Suppression par tiers** — un contributor peut-il déclencher la suppression d'un enfant ?
4. **Restoration race** — entre la marque `pendingDeletionAt` et la purge effective (30j), un user peut-il restaurer ?
5. **AssemblyAI transcripts orphelins** — la queue `pending_assemblyai_deletes` est-elle vidée si compte supprimé ?
6. **Cleanup AsyncStorage / SecureStore** — données locales effacées au signOut ? Au delete ?
7. **Webhook RevenueCat post-deletion** — un webhook arrivant après la suppression crée-t-il un user fantôme ?
8. **Backup expo / iCloud** — données privées dans le backup auto OS ?

## Recon à lancer

Prompt :
> Audit du flow de suppression de compte et d'enfant dans /Users/yoss/Projets/SuiviBaby. Trace : depuis le bouton "supprimer mon compte" jusqu'à l'effacement effectif. Liste TOUTES les collections/sous-collections/buckets Storage qui contiennent des données rattachées à un user/enfant. Vérifie que chaque référence est purgée (ou anonymisée) dans le délai légal. Note les chemins qui pourraient laisser des orphelins (queue offline, AssemblyAI, AsyncStorage, push tokens). Sous 600 mots.

## Surfaces identifiées (recon mai 2026)

| # | Surface | Sévérité | File:line | Gap |
|---|---------|----------|-----------|-----|
| S1 | **7 collections orphelines au delete user** | CRITIQUE RGPD | [functions/index.js:2104-2143](../../functions/index.js) | `user_content`, `user_promos`, `user_hidden_photos`, `voice_transcribe_cache`, `pending_assemblyai_deletes`, `webhook_logs`, `referrals` jamais purgés |
| S2 | Asymétrie restoration vs purge | ÉLEVÉ | [accountDeletionService.ts:9,65-67](../../services/accountDeletionService.ts), [functions/index.js:2667](../../functions/index.js) | GRACE_PERIOD_DAYS=30 mais aucun verrou idempotence : webhook RC tardif recrée user fantôme |
| S3 | **deleteUserAccount accepte admin override → suppression by tiers** | CRITIQUE | [functions/index.js:2031-2050](../../functions/index.js) | Admin peut supprimer n'importe quel compte sans audit détaillé |
| S4 | Race soft-delete child vs cancelChildDeletion | MOYEN | [functions/index.js:3319-3341,3700-3750](../../functions/index.js) | T1 mark deletedAt, T2 delete access (non-atomique). Cancel entre T1 et T2 = enfant orphelin |
| S5 | **AssemblyAI orphelins sans userId** | CRITIQUE RGPD | [functions/index.js:682-691,753-823](../../functions/index.js) | `pending_assemblyai_deletes` ne stocke pas userId → impossible de nettoyer au delete user. Audio enfant chez tiers indéfiniment. |
| S6 | Cleanup AsyncStorage insuffisant + pas de distinction signOut vs delete | MOYEN | [offlineQueueService.ts:230-241](../../services/offlineQueueService.ts), [pushTokenService.ts:98-111](../../services/pushTokenService.ts) | Queue offline avec uid='' (legacy) jamais purgée |
| S7 | **Webhook RC post-suppression recrée user** | ÉLEVÉ | [functions/index.js:2163-2290,2659-2783](../../functions/index.js) | `set(..., {merge:true})` sans check Auth user exists → user fantôme dans subscriptions |
| S8 | Sous-collections enfant oubliées | ÉLEVÉ | [functions/index.js:117-148,3358-3360](../../functions/index.js) | `reports` (data abuse) jamais supprimée lors child delete |
| S9 | **Photos Storage accessibles pendant 30j de soft-delete** | ÉLEVÉ RGPD | [functions/index.js:3819-3828](../../functions/index.js), [storage.rules:40-48](../../storage.rules) | Storage rules ne check pas Firestore deletedAt → photos lisibles via URL directe |
| S10 | Pas de countdown UI vs purgeAt | MOYEN | [accountDeletionService.ts:47-51](../../services/accountDeletionService.ts) | User pas informé de "point of no return" |

## Plan d'action

### Priorité CRITIQUE
- **S1 → étendre `deleteUserAccount` aux 7 collections orphelines** : ajouter chaque `deleteDocsByFieldBatched`. Inclure aussi `processScheduledDeletions:2716-2726`. **Effort: 2h.**
- **S3 → restreindre `deleteUserAccount` à self-deletion** + audit log si admin override (rare cas réel). **Effort: 1h.**
- **S5 → ajouter `userId` à `pending_assemblyai_deletes`** + propager au scheduled retry + purger au delete user. Nécessite migration data (back-fill). **Effort: 3h.**

### Priorité ÉLEVÉ
- **S2+S7 → check Auth user exists dans tous les webhooks/cron** qui pourraient recréer un user fantôme (RC, push tokens, etc.). **Effort: 2h.**
- **S8 → ajouter `reports` à `deleteChildDataBatched`**. **Effort: 30min.**
- **S9 → wipe storage immédiat au soft-delete** (au lieu d'attendre 30j) OU étendre Storage rules pour check `firestore.children/{cid}.deletedAt`. **Effort: 2-3h selon approche.**

### Priorité MOYEN
- **S4 → transaction atomique pour soft-delete child + access cleanup**. **Effort: 1h.**
- **S6 → `deleteUserDataLocal()` distinct de `onSignOut()`** : purge SQLite complète + AsyncStorage multiRemove. **Effort: 1h.**
- **S10 → exposer `purgeAt` dans response `createDeletionRequest`** + UI countdown. **Effort: 1h (back) + 1h (front).**

## Tests à ajouter

_À définir post-recon._

## Métriques

_À définir._

## Livraison

_À définir._
