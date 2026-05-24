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

## Plan d'action (à remplir post-recon)

_Section à compléter une fois le recon terminé._

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
