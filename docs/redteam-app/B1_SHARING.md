# B1 — Red team partage co-parent : plan d'action

**Statut :** ⚪ recon à faire
**Effort estimé :** 3-4 h

## Périmètre

Mécanismes de partage d'un enfant entre plusieurs comptes :
- `services/childSharingService.ts`
- Collections Firestore : `shareInvitations`, `shareCodes`, `children/{cid}/access`, `user_child_access` (index inverse)
- `utils/permissions.ts` (`grantChildAccess`, `revokeChildAccess`, `updateChildAccess`)
- CFs `cleanupExpiredShareCodes`, `validateReferralCode` (vérifier si applicable)
- Règles Firestore associées dans `firestore.rules`

## Surfaces d'attaque à investiguer

1. **Take-over enfant** — un attaquant peut-il s'octroyer le rôle `owner` d'un enfant qui n'est pas le sien ?
2. **Escalade contributor → admin** — voie cliente directe (Firestore rules) ou via CF mal vérifiée ?
3. **Leak email** — `findUserByEmail` ou listing `user_child_access` expose-t-il des emails non liés à l'attaquant ?
4. **Brute-force share codes** — codes à N chiffres, quel rate limit ? Quelle TTL ?
5. **Race condition acceptation invitation** — 2 acceptations simultanées créent-elles 2 docs `access` ?
6. **Suppression d'accès du propriétaire** — un admin peut-il révoquer l'owner ?
7. **Réutilisation d'invitation après acceptation** — `shareInvitations.status === 'accepted'` est-il vérifié partout ?
8. **Énumération children/{cid}** — un user non-accès peut-il deviner un childId valide ?

## Recon à lancer (sub-agent Explore)

Prompt à utiliser :
> Audit du flux de partage co-parent dans /Users/yoss/Projets/SuiviBaby. Liste tous les chemins client et serveur qui créent, lisent, ou modifient `shareInvitations`, `shareCodes`, `children/{cid}/access`, `user_child_access`. Pour chacun rapporte : qui peut écrire (rules + CF), validation des champs, idempotence, rate limit. Cherche spécifiquement les race conditions (acceptation concurrente, take-over via update du rôle). Sous 500 mots.

## Surfaces identifiées (recon mai 2026)

| # | Surface | Sévérité | File:line | Gap |
|---|---------|----------|-----------|-----|
| S1 | Race condition redeemShareCode | ÉLEVÉ | [childSharingService.ts:110-173](../../services/childSharingService.ts), [firestore.rules:145-150](../../firestore.rules) | Vérif `used==false` + marquage + grantAccess non-transactional. 2 redeems concurrents = 2 accès créés avec 1 code |
| S2 | Escalade contributor→admin via updateChildAccess | (Vérifié OK par rules) | [utils/permissions.ts:140-152](../../utils/permissions.ts) | Rules bloquent : seul owner peut update. Pas de vrai trou, reclassé MOYEN UX. |
| S3 | Réutilisation invitation acceptée concurrente | MOYEN | [childSharingService.ts:470-527](../../services/childSharingService.ts) | acceptInvitation lit status='pending' puis crée access ; 2 acceptations concurrentes créent 2 docs access (setDoc sans merge=true) |
| S4 | Énumération childId via shareCode rules | MOYEN | [firestore.rules:309-343](../../firestore.rules) | Tout user connecté peut lire un shareCode non utilisé. Le doc révèle l'existence d'un childId actif. |
| S5 | Brute-force shareCode sans rate limit | ÉLEVÉ | [childSharingService.ts:117-127](../../services/childSharingService.ts) | redeemShareCode n'est pas une CF → pas de checkRateLimit. 6 chars = ~1B combos, TTL 7j. |
| S6 | findUserByEmail email leak lent | MOYEN | [functions/index.js:1446-1488](../../functions/index.js) | Rate limit 10/min permet énumération emails en ~100h. Confirme existence comptes. |
| S7 | Suppression access par admin | (vérifié OK) | [services/childSharingService.ts:669-694](../../services/childSharingService.ts), [firestore.rules:160-161](../../firestore.rules) | Rules bloquent (`isOwner` only). Mais pas de check "dernier owner" → orphaning risk MOYEN. |
| S8 | cleanupDuplicatePendingInvitations race | FAIBLE | [childSharingService.ts:374-422](../../services/childSharingService.ts) | UX cosmetic, pas de risque sécurité. |

## Plan d'action

### Priorité CRITIQUE
- **S1 → CF transactional `redeemShareCodeCF`** : encapsuler read shareCode + check used + mark used + grantChildAccess dans `db.runTransaction`. Migrer le client vers `httpsCallable`. **Effort: 2-3h.**
- **S5 → rate limit + délai exponentiel** sur la nouvelle CF redeemShareCodeCF : `checkRateLimit(db, uid, "redeem_share", 5)` (5/min). **Inclus dans S1.**

### Priorité ÉLEVÉ
- **S4 → masquer l'existence du shareCode dans les rules** : passer à un check via CF uniquement (`allow read: if false`). Le client n'a pas besoin de read direct sur shareCodes. **Effort: 1h.**
- **S7 → check "dernier owner"** dans `removeParentAccess` : compter les access docs `role==='owner'` du childId, refuser si on s'apprête à supprimer le dernier. **Effort: 1h.**

### Priorité MOYEN
- **S3 → idempotence `grantChildAccess`** : passer `setDoc(..., {merge: true})` ou utiliser transaction. **Effort: 30min.**
- **S6 → réduire rate limit `findUserByEmail`** à 2/min + retour neutre (toujours `{found: true|false}` sans détails). Éventuellement CAPTCHA après 3 essais. **Effort: 1h.**

## Tests à ajouter

_À définir post-recon. Probables :_
- Brute-force share code (N essais, vérifier rate limit)
- Acceptation concurrente d'une invitation
- Revoke owner par admin doit échouer
- Énumération childId par user non-accès doit échouer

## Métriques

_À définir._

## Livraison

_À définir._
