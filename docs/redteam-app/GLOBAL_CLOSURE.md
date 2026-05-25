# Red Team App SuiviBaby — Closure global

**Période :** mai 2026
**Statut :** 🟢 8/9 chantiers livrés ; App Check (0.1) en attente de chantier client final

Ce document fait la synthèse exécutive de l'ensemble du red team app (post-red team voice). Pour le détail par chantier, voir les `*_CLOSURE.md` correspondants ; pour le détail des plans initiaux, voir les `*.md` non-closure.

---

## TL;DR

| Métrique | Valeur |
|---|---|
| Chantiers livrés | 8/9 (Lot 0, A, B1, B2, B3, B4, B5, B6) |
| Chantier en attente | 0.1 App Check (TOUT DERNIER, plan dédié) |
| Surfaces fermées | ~47 sur 53 identifiées |
| Surfaces restantes | 6 (5 décisions produit assumées + 1 = App Check) |
| Tests CF | 116/116 ✅ |
| Tests client | 199+ ✅ |
| Erreurs TypeScript | 44 = baseline (0 régression sur 8 chantiers) |
| Cloud Functions déployées (nouvelles) | 7 (setAdminClaim, retryAssemblyAIDeletes, redeemShareCodeCF, acceptInvitationCF, cleanupExpiredSubscriptions, submitContentReportCF + voice red team) |
| Cloud Functions modifiées | ~15 (resolveReport, deleteUserAccount, revenueCatWebhook, etc.) |
| TTL Firestore activées | 3 (voice_transcribe_cache, revenuecat_webhook_events, adminAuditLog) |
| Firestore rules modifiées | 2 fois (shareCodes lockdown B1.2, reports lockdown B6.S1) |
| Storage rules modifiées | 1 fois (isNotSoftDeleted B5.S4) |
| Effort réel total | ~18 h (vs estimation initiale ~3 semaines) |

---

## Architecture défensive — vue d'ensemble

```
                          ┌─────────────────────────────────┐
                          │  CLIENT (React Native / Expo)    │
                          │                                  │
   ┌──────────────┐       │  ┌──────────────────────────┐   │
   │ Voice forms  │──────►│  │ A — Bornes UI            │   │
   │ Manual forms │       │  │  - BoundedNumberInput    │   │
   └──────────────┘       │  │  - utils/eventBounds.ts  │   │
                          │  │  - DateTimeSectionRow    │   │
                          │  └──────────────────────────┘   │
                          │                                  │
   ┌──────────────┐       │  ┌──────────────────────────┐   │
   │ AuthContext  │──────►│  │ B3 — signOut cleanup     │   │
   │              │       │  │  - Firebase keys wipe    │   │
   │              │       │  │  - Boot cache purge      │   │
   └──────────────┘       │  └──────────────────────────┘   │
                          │                                  │
   ┌──────────────┐       │  ┌──────────────────────────┐   │
   │ contentReport│──────►│  │ → submitContentReportCF  │   │
   │ ShareCode    │       │  │ → redeemShareCodeCF      │   │
   │ AcceptInvite │       │  │ → acceptInvitationCF     │   │
   │ ExportPDF    │       │  │ → consumeUsageQuota(ids) │   │
   └──────────────┘       │  └──────────────────────────┘   │
                          └─────────────────────────────────┘
                                       │
                                       │ httpsCallable
                                       ▼
        ┌──────────────────────────────────────────────────────────┐
        │  CLOUD FUNCTIONS (europe-west1, Node 22)                 │
        │                                                          │
        │  ┌──────────────────────────────────────────────────┐   │
        │  │ Lot 0 — fondations transversales                │   │
        │  │  - withAppCheck (enforce OFF pour l'instant)    │   │
        │  │  - monitorAppCheck (logs VERIFIED/UNVERIFIED)   │   │
        │  │  - checkRateLimit (buckets : voice, events,     │   │
        │  │    transcribe, redeem_share, accept_invite,     │   │
        │  │    referral, report, grandfather, ai_insight)   │   │
        │  │  - checkChildAccess (owner/admin/contributor)   │   │
        │  │  - setAdminClaim (audit log + bootstrap email)  │   │
        │  │  - revenueCatWebhook (HMAC + dedup + replay)    │   │
        │  │  - deleteUserAccount (RGPD orphelins + audit)   │   │
        │  └──────────────────────────────────────────────────┘   │
        │                                                          │
        │  ┌──────────────────────────────────────────────────┐   │
        │  │ Per-feature CFs                                  │   │
        │  │  - voice : T1-T3 hardening (transcribeAudio,    │   │
        │  │    validateAndCreate/UpdateEvent + retry queue) │   │
        │  │  - sharing : B1 redeem/accept transactional     │   │
        │  │  - deletion : B2 wipe Storage + cron expired    │   │
        │  │  - payments : B4 cleanupExpiredSubs cron        │   │
        │  │  - exports/AI : B5 quota scope + LLM sanitize   │   │
        │  │  - moderation : B6 submit + atomic resolve      │   │
        │  └──────────────────────────────────────────────────┘   │
        │                                                          │
        │  ┌──────────────────────────────────────────────────┐   │
        │  │ writeAdminAudit() (B6.S5) →                      │   │
        │  │   adminAuditLog/{id} + expireAt (TTL 90j)        │   │
        │  └──────────────────────────────────────────────────┘   │
        └──────────────────────────────────────────────────────────┘
                                       │
                                       ▼
        ┌──────────────────────────────────────────────────────────┐
        │  FIRESTORE / STORAGE (samaye-53723, europe-west1)        │
        │                                                          │
        │  Rules :                                                 │
        │   - shareCodes : creator/access read only, no client     │
        │     update (CF only)                                     │
        │   - reports : no client create (CF only)                 │
        │   - subscriptions/usage_limits : no client write         │
        │   - storage.rules : isNotSoftDeleted check               │
        │                                                          │
        │  TTL policies actives :                                  │
        │   - voice_transcribe_cache.expireAt (5 min)              │
        │   - revenuecat_webhook_events.expireAt (30 j)            │
        │   - adminAuditLog.expireAt (90 j)                        │
        │                                                          │
        │  Collections avec userId pour purge RGPD :               │
        │   - pending_assemblyai_deletes (T0.5)                    │
        │   - user_hidden_photos (T0.5 cleanup)                    │
        │   - voice_transcribe_cache (T0.5 cleanup)                │
        └──────────────────────────────────────────────────────────┘

   App Check ⏳ chantier final : APP_CHECK_ENFORCED=false actuellement.
   100% des appels CF loggent UNVERIFIED. Flip à true bloquerait tout
   sans la config DeviceCheck/PlayIntegrity côté client.
```

---

## Récap par chantier

### Lot 0 — Fondations transversales (5 critiques)
**Closure :** [LOT0_CLOSURE.md](LOT0_CLOSURE.md) · **Commits :** `e7dd03a`, `20d5ed8`, `0295715`

- **T0.2** revenueCatWebhook : constant-time Bearer + dedup event.id (TTL 30j) + anti-replay timestamp + skip user supprimé.
- **T0.3** setAdminClaim CF + audit log + bootstrap via INITIAL_ADMIN_EMAIL.
- **T0.4** resolveReport scope childId (admin global ne peut plus toucher events d'enfants random).
- **T0.5** deleteUserAccount RGPD complet (+3 collections orphelines, userId dans pending_assemblyai_deletes).
- **T0.6** deleteUserAccount cross-user : reason obligatoire + audit log.

### A — Bornes UI (13 gaps sur 8 forms)
**Closure :** [A_CLOSURE.md](A_CLOSURE.md) · **Commits :** `ef96c28`, `e192cb6`, `7e1703d`

- **F1** `BoundedNumberInput` partagé (stepper +/- borné, long-press, haptics).
- **F2** `DateTimeSectionRow` accepte min/maxDate (défauts = now+5min / now-365j).
- **F3** `utils/eventBounds.ts` source unique (NUMERIC_BOUNDS, STRING_LENGTH_LIMITS, helpers).
- **Fixes CRITIQUE/HAUTE/MOYEN** sur Croissance, Pumping, Soins, Activities, Routines, Meals, Milestones.

### B1 — Sharing co-parent (7 surfaces)
**Closure :** [B1_CLOSURE.md](B1_CLOSURE.md) · **Commits :** `81a7d92`, `4839701`, `54ee799`

- **S1** redeemShareCodeCF (transactional, anti-race, anti brute-force).
- **S2** firestore.rules shareCodes lockdown (read resserré, update interdit).
- **S3** removeParentAccess check "dernier owner".
- **S4** acceptInvitationCF (transactional, idempotent).
- **S5** findUserByEmail rate limit 10→3/min.

### B2 — Deletion RGPD (10 surfaces, 5 fix B2 + 5 fix Lot 0)
**Closure :** [B2_CLOSURE.md](B2_CLOSURE.md) · **Commits :** `ce50e13`, `50f066e`, `bc6fb87`

- **S1** wipe Storage immédiat au softDeleteChild (RGPD S9).
- **S2** reports cascade au delete child (S8).
- **S3** ordre snapshot puis deletedAt (anti-race cancel, S4).
- **S4** cleanupOrphanedEvents purge events > 60j (S6).
- **S5** countdown UI grace period (S10).

### B3 — Auth & sessions (8 surfaces, 2 vrais fixes + 6 vérifiés OK)
**Closure :** [B3_CLOSURE.md](B3_CLOSURE.md) · **Commits :** `b0296d7`, `23207ff`

- **S3** wipe défensif clés `firebase:*` AsyncStorage au signOut.
- **S5** purge cache `@suivibaby_boot_children:{uid}` au signOut.
- 6 surfaces faux positifs documentées : nonce Apple, listeners React, biometric, referral rate limit, admin claim, App Check.

### B4 — Payments & quotas (7 surfaces, 2 vrais fixes + Lot 0 + faux positifs)
**Closure :** [B4_CLOSURE.md](B4_CLOSURE.md) · **Commits :** `6379b00`, `dcb073d`, `143fbba`

- **S5** cleanupExpiredSubscriptions (cron daily — flip status=expired si RC oublie l'EXPIRATION webhook).
- **S6** grandfatherExistingUsers : rate limit 1/h + reason + audit log.
- Faux positifs documentés : race quota voice (transaction OCC en place), cache stale (pas de cache CF).

### B5 — Exports / AI / Photos (6 surfaces, 4 vrais fixes)
**Closure :** [B5_CLOSURE.md](B5_CLOSURE.md) · **Commits :** `933c9a1`, `35985f6`, `5ee930c`

- **S1** consumeUsageQuota valide childIds access (anti-exfiltration multi-enfants).
- **S2** generateAiInsight anti prompt injection (sanitize stricte + system prompt renforcé).
- **S3** exportAllEventsCSV filter hiddenEventIds.
- **S4** storage.rules `isNotSoftDeleted` (défense en profondeur après B2.1).

### B6 — Moderation & reports (8 surfaces, 4 vrais fixes + Lot 0)
**Closure :** [B6_CLOSURE.md](B6_CLOSURE.md) · **Commits :** `58e739d`, `d44de4b`, `bff8452`

- **S1+S2+S3** submitContentReportCF : rate limit + exists check + anti auto-report.
- **S5** adminAuditLog TTL 90j (`writeAdminAudit` wrapper + script).
- **S7** resolveReport atomic claim (transaction status open→resolving).
- S4 déjà couvert par Lot 0 T0.3+T0.4.

### Voice (pré-red team app, mais référence)
**Closure :** [VOICE_PIPELINE_REDTEAM_REPORT.md](../VOICE_PIPELINE_REDTEAM_REPORT.md) · **Commits :** voir le rapport.

3 lots (Critique, Élevé, Moyen) avec 14 mesures défensives sur le pipeline `recorder → AssemblyAI → parser → CF → Firestore`. Posé les fondations du pattern Lot 0 (rate limit, idempotency, quota refund, retry queue).

---

## Patterns récurrents émergés

Plusieurs solutions ont émergé naturellement à travers les chantiers :

1. **Transactional CFs au lieu de write client direct.** Quand une opération critique demande check-then-write (redeem code, accept invitation, claim report), on remplace le code client par une CF qui utilise `db.runTransaction` pour garantir l'atomicité. Pattern : B1.1, B1.4, B6.S7, T2.2 voice.

2. **Rate limit par bucket via `checkRateLimit`.** Tous les flows qui peuvent être abusés (brute-force codes, report flooding, énumération emails, admin operations) ont maintenant un bucket dédié. Voir la liste exhaustive dans le schéma.

3. **TTL Firestore via field `expireAt` + script one-shot.** 3 collections (`voice_transcribe_cache`, `revenuecat_webhook_events`, `adminAuditLog`) utilisent ce pattern. Activation via `functions/scripts/enable-*-ttl.js`.

4. **Audit log obligatoire pour les admin actions.** `writeAdminAudit(db, payload)` wrapper avec TTL 90j. Pas de rollback si audit fail = défense en profondeur.

5. **Sanitization stricte avant injection LLM ou prompt assemblé.** Pattern B5.S2 : whitelist d'enums, regex pour timestamp, bornes int strictes. Empêche les prompt injections.

6. **Recon agent IA = trust but verify.** B3 et B4 ont montré qu'~50% des surfaces flaguées sont des faux positifs ou déjà couvertes. Vérification du code réel avant fix = règle obligatoire.

---

## Risques résiduels acceptés

| Risque | Sévérité | Mitigation |
|---|---|---|
| App Check OFF | ÉLEVÉ | Plan dédié `0_APP_CHECK_SETUP.md`, chantier final 1-2j |
| Refresh token Firebase dans AsyncStorage non chiffré | MOYEN | Mitigé par wipe défensif au signOut (B3.S3). Custom adapter SecureStore en backlog. |
| Cancel après wipe Storage = photos perdues | MOYEN UX | Trade-off RGPD assumé. UX warning à ajouter au prochain sprint produit. |
| Entrées `adminAuditLog` pré-deploy sans `expireAt` | FAIBLE | Charge DB négligeable. |
| Status `resolving` sans timeout/release | FAIBLE | Reset manuel possible. Scheduled CF release à ajouter si récurrent. |
| Race théorique 2 owners se suppriment | FAIBLE | Très improbable en usage humain. |
| Quota AI insights par enfant (multi-children abuse) | FAIBLE | Coût marginal (~4¢/jour/user). Décision produit. |
| Photo moderation Phase 2 non implémentée | INFO | Décision produit (V1 = signalement manuel suffit jusqu'au volume X). |

---

## Métriques à surveiller en prod

Voir le détail dans chaque closure. Synthèse des dashboards à mettre en place :

| Dashboard | Source | Seuil d'alerte |
|---|---|---|
| `voice_quota_refunds` count/j | Cloud Logs `transcribeAudio` | > 5% des appels |
| `pending_assemblyai_deletes` size | Firestore | > 100 docs |
| `pending_assemblyai_deletes.abandonedAt` | Firestore query | ≥ 1 (cleanup manuel + audit) |
| `revenueCatWebhook duplicate event` | Cloud Logs | > 5%/j |
| `revenueCatWebhook user no longer exists` | Cloud Logs | Pic anormal |
| `cleanupExpiredSubscriptions flipped` count/j | Cloud Logs | > 0 = RC oublie d'envoyer EXPIRATION |
| `setAdminClaim` events | adminAuditLog query | Toute promotion doit être justifiée |
| `deleteUserAccount` cross-user | adminAuditLog query | Toute suppression doit être justifiée |
| `submitContentReportCF` rate limit hits (429) | Cloud Logs | Pic = report flooding |
| `redeemShareCodeCF` not-found (404) | Cloud Logs | Pic = brute-force |
| HttpsError `aborted` sur validateAndUpdateEvent | Cloud Logs | > 1% des appels = UX optimistic lock à revoir |
| App Check `UNVERIFIED` ratio | Cloud Logs | **Vérifier avant flip enforce** : doit être 0% |
| Latence p50 `transcribeAudio` | Cloud Monitoring | > 8s |

---

## Effort réel vs estimation

| Chantier | Estimé | Réel | Ratio |
|---|---|---|---|
| Lot 0 | 1 j | 6 h | 0.75x |
| A — Bornes UI | 1 j | 3 h | 0.4x |
| B1 — Sharing | 4 h | 2 h | 0.5x |
| B2 — Deletion | 4 h | 2 h | 0.5x |
| B3 — Auth | 4 h | 1 h | 0.25x |
| B4 — Payments | 3 h | 1 h | 0.33x |
| B5 — Exports | 4 h | 1.5 h | 0.38x |
| B6 — Moderation | 2 h | 1.5 h | 0.75x |
| **Total** | **~25 h** | **~18 h** | **0.72x** |

L'efficacité est venue de :
- **Lot 0 d'abord** : poser les helpers transversaux (checkRateLimit, checkChildAccess, audit log wrapper) a accéléré tous les B.
- **Vérification systématique du recon** : ~50% des surfaces B3/B4 étaient des faux positifs, évité du sur-engineering.
- **Patterns réutilisables** : la 5e CF transactional s'écrit en 30 min vs 2h pour la première.

---

## Prochaines étapes

### Immédiat (cette semaine)
1. ✅ **EAS build preview Android** (en cours, `bff8452`) — valider l'accumulation des fixes client.
2. ⏳ **Tests manuels sur device** des scénarios principaux : voice command, share code redeem, account deletion countdown, content report.

### Court terme
3. ⏳ **App Check chantier final** ([0_APP_CHECK_SETUP.md](0_APP_CHECK_SETUP.md)) — checklist dédiée en parallèle.
4. ⏳ **iOS preview build** si nécessaire.

### Moyen terme (backlog)
5. UI warning "photos perdues à l'approbation du soft-delete" (B2.1 R1).
6. Custom Firebase persistence adapter avec SecureStore (B3 R3).
7. Scheduled CF pour release `status: resolving` après 1h timeout (B6 R2).
8. CAPTCHA après N tentatives sur `findUserByEmail` si abus observé (B1.5 R2).

---

**Auteurs :** Claude Opus 4.7 (1M context) + Yoss.
**Dernière mise à jour :** mai 2026, après commit `bff8452`.
