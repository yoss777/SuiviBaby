# B4 — Payments & quotas (RevenueCat) : closure report

**Statut :** 🟢 livré
**Effort réel :** ~1 h
**Plan d'origine :** [B4_PAYMENTS.md](B4_PAYMENTS.md)

## Mesures livrées vs recon initial

| # | Surface | Statut | Action |
|---|---------|--------|--------|
| S1 | Webhook RC Bearer plain-text | CRITIQUE | **Déjà fix Lot 0 T0.2** (constant-time compare + dedup event.id + anti-replay timestamp) |
| S2 | Pas d'idempotence webhook par event.id | ÉLEVÉ | **Déjà fix Lot 0 T0.2** (revenuecat_webhook_events avec TTL 30j) |
| S3 | Race `reserveVoiceQuota` (transaction OK mais merge:true) | ÉLEVÉ | **Faux positif** : `db.runTransaction` garantit déjà OCC. La race n'existe pas. |
| S4 | Cache stale subscription state | ÉLEVÉ | **Faux positif partiel** : pas de cache CF, chaque call read frais. Fenêtre théorique 1s entre webhook EXPIRATION et CF read, négligeable. |
| **S5** | CANCELLATION sans EXPIRATION follow-up | MOYEN | ✅ **Cron `cleanupExpiredSubscriptions` (daily)** |
| **S6** | `grandfatherExistingUsers` admin claim sans audit | MOYEN | ✅ **Rate limit 1/h + reason obligatoire + audit log** |
| S7 | Firestore rules subscriptions write OFF | (vérifié OK) | aucune |

**Bilan recon vs réalité** : 7 surfaces flaguées, **3 déjà fix (S1, S2 via Lot 0)**, **2 faux positifs (S3, S4)**, **2 vrais trous corrigés (S5, S6)**. Le webhook (la surface la plus critique) était déjà couvert par Lot 0.

## Détail des changements

### B4.S5 — `cleanupExpiredSubscriptions` (nouvelle scheduled CF)

[functions/index.js:444-540](../../functions/index.js)

Cron quotidien qui scan `subscriptions` où `status ∈ {active, cancelled, billing_issue}` et flip à `status=expired, tier=free` si `expiresAt` (ISO string) est dépassé. Garde-fou si RevenueCat oublie d'envoyer le webhook EXPIRATION pour cause de bug RC / réseau / mauvaise config.

**Pattern utilisé** : scan paginé (`BATCH_LIMIT`) puis filtre côté code (Date.parse) parce que `expiresAt` est stocké en ISO string, pas Timestamp Firestore — query directe `where("expiresAt", "<=", now)` peu fiable en string compare.

**Coût** : 1 scan/jour, volume ≤ active user count.

### B4.S6 — `grandfatherExistingUsers` hardening

[functions/index.js:2548-2630](../../functions/index.js)

Trois renforcements :
1. **Rate limit `1/heure/admin`** via `checkRateLimit("grandfather", 1)`. Évite qu'un admin compromis lance des batches en boucle.
2. **Reason obligatoire (5-500 chars)**. Force le contexte d'usage à être documenté.
3. **Audit log obligatoire** dans `adminAuditLog` avec `type=grandfatherExistingUsers`, adminUid, adminEmail, cutoffDate, count, reason. Failure du log = log warning mais pas rollback (les commits batch déjà faits ne sont pas réversibles facilement).

**Impact business** : avant, un admin compromis pouvait grandfather toute la base en 1 appel → cadeau premium massif, perte de revenue indétectable. Maintenant : 1 batch/heure max, et chaque action laisse une trace traçable.

## Tests

104/104 tests CF passent (103 + 1 nouveau B4.S6 reason validation). 44 erreurs TS = baseline.

Les tests existants `grandfatherExistingUsers` mis à jour pour ajouter `reason` au payload.

## Déploiements

| Composant | Action |
|-----------|--------|
| `cleanupExpiredSubscriptions` (nouvelle scheduled) | ✅ créée europe-west1, run quotidien |
| `grandfatherExistingUsers` (update) | ✅ updated |
| Commits `6379b00` + `dcb073d` pushed | ✅ |

## Risques résiduels

| # | Risque | Sévérité | Note |
|---|--------|----------|------|
| R1 | Si RC change schéma `event_timestamp_ms` ou retire `event.id` | FAIBLE | Le webhook fail safely (timestamp out of bounds = 200 OK skip, missing id = pas de dedup mais le reste passe). Re-monitor si breaking change RC documenté. |
| R2 | `cleanupExpiredSubscriptions` race avec un webhook RENEWAL qui arrive juste après | FAIBLE | Cron passe à minuit, RC envoie webhook quasi instant à l'expiration. Très improbable d'avoir une intersection. Si ça arrive : status flippé en `expired` puis re-flippé en `active` par le webhook. Net : OK. |
| R3 | `grandfatherExistingUsers` : pas de rollback si audit log fail | FAIBLE | Trade-off : on accepte un grandfathering partiel sans trace audit complète plutôt que de bloquer l'opération légitime. À monitor via Cloud Logs si on observe des warnings. |

## Prochaines actions

Selon l'ordre : **B5 — Exports, AI insights, photos** (~4 h). 6 surfaces dont 1 ÉLEVÉ (export quota non scopé par childId), 2 MOYEN (prompt injection LLM, photos cachées dans export), 3 FAIBLE.

Plan : [B5_EXPORTS_AI_PHOTOS.md](B5_EXPORTS_AI_PHOTOS.md).
