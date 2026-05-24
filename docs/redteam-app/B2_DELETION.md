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

## Plan d'action

_À remplir post-recon._

## Tests à ajouter

_À définir post-recon._

## Métriques

_À définir._

## Livraison

_À définir._
