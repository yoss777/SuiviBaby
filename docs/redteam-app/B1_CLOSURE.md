# B1 — Sharing co-parent : closure report

**Statut :** 🟢 livré
**Effort réel :** ~2 h
**Plan d'origine :** [B1_SHARING.md](B1_SHARING.md)

## Mesures livrées

| Surface | Mesure | Fichier |
|---------|--------|---------|
| S1 race redeem | **CF transactional `redeemShareCodeCF`** | [functions/index.js:2644+](../../functions/index.js) |
| S3 race accept invitation | **CF transactional `acceptInvitationCF`** | [functions/index.js:~2790+](../../functions/index.js) |
| S4 énumération childId via shareCode rules | **Rule read resserrée + update interdit** | [firestore.rules:309-340](../../firestore.rules) |
| S5 brute-force shareCodes | **Rate limit 5/min via CF + format check** | inclus dans S1 |
| S6 findUserByEmail énumération | **Rate limit 10/min → 3/min** | [functions/index.js:1495](../../functions/index.js) |
| S7 dernier owner orphaning | **Check `owners count > 1` avant revoke** | [services/childSharingService.ts:669-720](../../services/childSharingService.ts) |
| S2 escalade contributor→admin via updateChildAccess | (vérifié OK initialement par rules, aucun trou réel) | — |
| S8 cleanup invitation duplicates race | (FAIBLE UX, hors scope B1) | reporté |

## Détail des changements

### B1.1 — `redeemShareCodeCF` (nouvelle CF)

Avant : 3 calls Firestore séparés côté client (read shareCode → update used → setDoc access). Race :
1. User A redeem code "ABC" : read OK, update OK.
2. User B redeem code "ABC" en parallèle : read OK (avant update de A), update FAIL ou OK selon timing → potentiellement 2 accès créés.

Après : un seul appel CF avec `db.runTransaction()`. Le serveur fait :
1. Read shareCode + check `!used && !expired`.
2. Read access doc cible (`children/{cid}/access/{uid}`) → check absence.
3. Update shareCode (`used:true, usedBy, usedByEmail, usedAt`).
4. Set access doc + index `user_child_access`.

Tout dans une transaction Firestore (commit atomique). Race impossible.

**Plus** : rate limit `redeem_share` 5/min/uid, format check `/^[A-Z0-9-]{4,16}$/`, message générique "Code invalide ou expiré" pour les 3 cas (not-found, used, expired) — bloque l'énumération par discrimination de message.

### B1.2 — `firestore.rules` shareCodes lockdown

Avant : `allow read if signed-in AND (creator OR hasAccess OR (used=false && expiresAt > now))`. La 3e branche permettait à un utilisateur authentifié quelconque de :
- Lire un shareCode arbitraire (s'il devine le code).
- Confirmer l'existence d'un childId via le `shareCode.childId` retourné.

Après :
- `allow read` : `creator OR hasAccess(childId)` uniquement.
- `allow update: if false` : tout passe par la CF.

Le client n'a plus besoin de read direct sur `shareCodes/*` (la CF utilise admin SDK qui bypass rules).

### B1.3 — `removeParentAccess` check dernier owner

Avant : owner pouvait retirer un autre owner sans vérification. Si seul autre owner restant après → enfant orphelin.

Après : si la cible est `role: owner`, query `count(owners) where role==='owner'`. Si `<= 1` (seul owner restant) → refuse avec message "Promouvez d'abord un autre parent".

Mitigation partielle (race théorique sur 2 suppressions concurrentes), mais couvre le cas humain réaliste.

### B1.4 — `acceptInvitationCF` (nouvelle CF)

Même pattern que B1.1 : transaction Firestore qui :
1. Read invitation + check status `pending`.
2. Check destinataire (uid ou email match).
3. Read access existant → si présent, juste mark invitation accepted (idempotent).
4. Sinon : create access + index.
5. Mark invitation `accepted`.

Race "2 acceptations concurrentes" impossible (transaction atomique).

### B1.5 — `findUserByEmail` rate limit

Avant : 10/min/uid. 14400 tentatives/jour permettent l'énumération d'une base de 100k users en ~7 jours.

Après : 3/min/uid. ~23 jours pour la même base. Pas une protection forte contre un attaquant déterminé, mais le coût d'opportunité augmente significativement. Une CAPTCHA après 3 essais reste à considérer si on observe des abus en logs.

### Migration client

[services/childSharingService.ts](../../services/childSharingService.ts) :
- `redeemShareCode()` : 67 lignes de logique Firestore → 22 lignes d'appel CF + mapping d'erreurs.
- `acceptInvitation()` : 57 → 25 lignes idem.
- Imports `httpsCallable` ajouté, `grantChildAccess`/`updateDoc`/etc plus utilisés dans ces deux fonctions (gardés pour d'autres flows).

Code client beaucoup plus simple et moins error-prone.

## Tests

**14 nouveaux tests CF** dans `functions/__tests__/cloudFunctions.test.js` :

`redeemShareCodeCF` :
- requires auth, missing email, invalid format (empty, too short, invalid chars)
- code not found, already-used (anti info-leak : même message), expired, already-has-access
- success path : asserts `txUpdate(used:true,...)` + `txSet × 2` (access + index)

`acceptInvitationCF` :
- requires auth, missing invitationId
- wrong recipient, already-accepted
- success creates access + marks accepted
- idempotent if access already exists

**1 test rules modifié** dans `__tests__/firestore.rules.test.ts` :
- Renommé "valid unused code readable by any user" → "B1.2 — non-creator CANNOT read share code (anti-enumeration)".
- Reflète le nouveau comportement. (Nécessite emulator pour exécution réelle.)

**Résultats** : 103/103 tests CF passent. 44 erreurs TS = baseline (0 régression).

## Déploiements

| Composant | Action |
|-----------|--------|
| CF `redeemShareCodeCF` (nouvelle) | ✅ créée europe-west1 |
| CF `acceptInvitationCF` (nouvelle) | ✅ créée europe-west1 |
| CF `findUserByEmail` (update rate limit) | ✅ updated |
| `firestore.rules` | ✅ released to cloud.firestore |
| Commits | ✅ `81a7d92` (code) + `4839701` (tests) pushed |

## Risques résiduels

| # | Risque | Sévérité | Note |
|---|--------|----------|------|
| R1 | Race théorique 2 owners se suppriment simultanément | FAIBLE | Réaliste : très improbable en usage humain. Mitigation totale = CF transactional. |
| R2 | `findUserByEmail` énumération encore possible à 3/min | MOYEN | Avec CAPTCHA après N tentatives = mitigation totale, à faire si abus observé. |
| R3 | Migration client : ancien code mort `grantChildAccess`/`updateDoc` shareCodes plus appelé depuis ces 2 flows mais reste dans d'autres flows. Pas une régression. | FAIBLE | OK. |
| R4 | B1-S8 cleanup invitation duplicates race | FAIBLE | UX cosmétique, hors scope B1. |

## Métriques à surveiller (24 h post-déploiement)

| Métrique | Source | Seuil d'alerte |
|----------|--------|----------------|
| Logs `redeemShareCodeCF transaction error` | Cloud Logs | > 1% des appels = bug logique CF |
| Logs `Code invalide ou expiré` (404 du CF) | Cloud Logs | Pic anormal = tentative brute-force |
| Logs `Vous avez déjà accès` (409) | Cloud Logs | Normal pour UX duplicate, monitor |
| Logs `acceptInvitationCF transaction error` | Cloud Logs | idem |
| Rate limit `redeem_share` (429) | Cloud Logs | Pic = brute-force détecté |

## Prochaines actions

Selon l'ordre : **B2 — Deletion RGPD** (~4 h). 10 surfaces identifiées dont 3 CRITIQUES (orphelins, escalation admin override, AssemblyAI sans userId — déjà partiellement couvert par Lot 0 T0.5).

Plan : [B2_DELETION.md](B2_DELETION.md).
