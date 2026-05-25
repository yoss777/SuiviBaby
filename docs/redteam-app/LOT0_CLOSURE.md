# Lot 0 — Red Team App : closure report

**Statut :** 🟢 livré
**Période :** mai 2026
**Effort réel :** ~6 h de code + déploiement
**Suite :** voir [README.md](README.md) pour B1 → B6.

## TL;DR

5 mesures critiques transversales livrées, qui forment la **fondation** des chantiers B1-B6 :

| # | Mesure | Pourquoi maintenant |
|---|--------|---------------------|
| T0.1 | App Check enforce | ⏸ **Reporté en TOUT DERNIER** ([plan dédié](0_APP_CHECK_SETUP.md)) |
| T0.2 | revenueCatWebhook hardening | Webhook spoofing trivial → forge totale d'abonnements |
| T0.3 | setAdminClaim CF + audit | Source unique pour le claim admin, zéro audit avant |
| T0.4 | resolveReport scope childId | Admin global pouvait supprimer events de N'IMPORTE quel enfant |
| T0.5 | deleteUserAccount RGPD complet | 3 collections orphelines RGPD + AssemblyAI sans userId |
| T0.6 | deleteUserAccount cross-user audit | Suppression by tiers loggée Firestore (pas juste console) |

**Tests :** 89/89 CF passent (78 + 11 nouveaux Lot 0). 0 régression TS.

**Décision App Check :** [mémoire `project_appcheck_deferred.md`](../../../.claude/projects/-Users-yoss-Projets-SuiviBaby/memory/project_appcheck_deferred.md) — flip en TOUT DERNIER. Logs prod montrent 100% UNVERIFIED actuellement (flip = blocage prod).

---

## Mesures livrées (détail)

### T0.2 — `revenueCatWebhook` hardening

**Avant** : `if (authHeader !== "Bearer ${secret}") return 401`.
**Après** :
- Constant-time compare (`crypto.timingSafeEqual`) — anti timing attack.
- Validation `event.event_timestamp_ms` : refus si > 5 min futur ou > 7 j passé.
- Dédoublonnage par `event.id` via `revenuecat_webhook_events/{id}` avec TTL Firestore 30 j (script `enable-rc-webhook-ttl.js` exécuté, `state: ACTIVE` confirmée).
- Check `admin.auth().getUser(appUserId)` : skip silencieux si user supprimé, évite user fantôme dans `subscriptions/` (B2-S2, B2-S7).

**Coût d'exploitation mitigé** : $100-500/mois estimés (recon B4), maintenant fermé.

### T0.3 — `setAdminClaim` CF + audit log

**Avant** : claim `admin` settable **uniquement** via Firebase Console manuel. Zéro audit, zéro traçabilité.
**Après** : CF unique avec :
- Auth obligatoire + caller doit déjà être admin **OU** avoir l'email seed `INITIAL_ADMIN_EMAIL` **ET** aucun admin n'existe encore.
- Validation `targetUid` + `value` (boolean) + `reason` (string, 5-500 chars **obligatoire**).
- Refus de self-demotion (évite œuf-et-poule sans admin).
- Audit log `adminAuditLog` avec `type: setAdminClaim`, adminUid/Email, targetUid/Email, value, reason, bootstrapMode flag.
- Retourne `requiresTokenRefresh: true` pour signaler au client le `getIdToken(true)`.

**Bootstrap initial admin** : voir section "Procédure post-déploiement" en bas.

### T0.4 — `resolveReport` scope childId

**Avant** : admin claim suffisait pour modérer N'IMPORTE quel report (B6-S4 CRITIQUE).
**Après** : en plus du claim admin, requis `hasAccess(report.childId)` ∈ {owner, admin}. Refus avec audit log `type: resolveReport_denied` avant le throw, pour tracer les tentatives.

**Impact** : un admin compromis ou rogue ne peut plus toucher les events d'enfants où il n'a pas explicitement été ajouté. Limite drastiquement le rayon d'action.

### T0.5 — `deleteUserAccount` RGPD complet

**Avant** : 7 collections orphelines selon recon B2-S1, dont `pending_assemblyai_deletes` qui n'avait même pas de `userId` field (B2-S5 CRITIQUE).
**Après** :
- Ajout 3 collections au cleanup : `user_hidden_photos`, `pending_assemblyai_deletes` (via nouveau field `userId`), `voice_transcribe_cache`.
- `enqueueAssemblyAIDelete()` accepte maintenant `userId` paramètre et le persiste.
- `adminAuditLog` volontairement conservé (trace légale d'investigation).
- Note : les docs `pending_assemblyai_deletes` créés AVANT ce déploiement n'ont pas de `userId` → seront purgés par le cleanup planifié (5 attempts max → abandonnés).

**Conformité** : Art. 17 RGPD respecté pour les chemins identifiés. Les chemins déjà gérés (`user_promos`, `user_content`, `webhook_logs`, `referrals`) étaient en fait déjà OK — le recon B2 avait sous-estimé l'état initial. Vérification au passage.

### T0.6 — `deleteUserAccount` cross-user audit

**Avant** : un admin pouvait supprimer un autre compte avec juste un `console.log` (pas d'audit Firestore).
**Après** :
- Exige `reason` (5-500 chars) **obligatoire** quand `targetUid !== uid`.
- Audit log `adminAuditLog` (type: `deleteUserAccount`, adminUid/Email, targetUid, reason) **AVANT** l'opération.
- Si l'écriture audit échoue → **refus de l'opération** (trace = défense principale).

---

## Déploiements effectués

| Composant | Action | Notes |
|-----------|--------|-------|
| CF `setAdminClaim` (nouvelle) | ✅ créée europe-west1 | IAM grant sur secret `INITIAL_ADMIN_EMAIL` auto-fait par Firebase |
| CF `revenueCatWebhook` | ✅ updated | T0.2 |
| CF `resolveReport` | ✅ updated | T0.4 |
| CF `deleteUserAccount` | ✅ updated | T0.5 + T0.6 |
| CF `transcribeAudio` | ✅ updated --force | T0.5 (helper enqueueAssemblyAIDelete) — `minInstances:1` exige --force |
| Secret `INITIAL_ADMIN_EMAIL` | ✅ configuré | Set par user via `firebase functions:secrets:set` |
| TTL Firestore `revenuecat_webhook_events.expireAt` | ✅ operation lancée | Script `enable-rc-webhook-ttl.js`, provisioning ~5 min |
| Commits | ✅ pushed | `e7dd03a` (code) + `20d5ed8` (tests/docs) |

---

## ⚠️ Procédure post-déploiement : bootstrap initial admin

Le seed `INITIAL_ADMIN_EMAIL` est configuré et la CF `setAdminClaim` accepte un appel non-admin SI ET SEULEMENT SI :
1. L'appelant a cet email.
2. Aucun admin n'existe encore (vérifié via `adminAuditLog.where("type","==","setAdminClaim").where("value","==",true)`).

**À faire pour devenir admin** (une seule fois) :

1. Trouver ton `uid` dans Firebase Console > Authentication > Users (chercher `nessy107@gmail.com`).
2. Depuis l'app connectée avec ce compte (ou via un script Node admin), appeler :
   ```ts
   import { getFunctions, httpsCallable } from "firebase/functions";
   const fns = getFunctions(undefined, "europe-west1");
   const setAdmin = httpsCallable(fns, "setAdminClaim");
   await setAdmin({
     targetUid: "<ton-uid>",
     value: true,
     reason: "bootstrap initial admin via INITIAL_ADMIN_EMAIL seed",
   });
   ```
3. **Force refresh du token** côté client :
   ```ts
   await auth.currentUser.getIdToken(true);
   ```
4. Vérifier : un nouvel appel CF protégée (ex: `resolveReport`) devrait passer le check admin.
5. **Le seed est maintenant cuit** : la CF refuse tout futur bootstrap car au moins un admin existe.

**Si tu veux un 2e admin plus tard** : appelle `setAdminClaim` en étant déjà admin, avec une raison documentée.

---

## Risques résiduels

| # | Risque | Sévérité | Mitigation |
|---|--------|----------|-----------|
| R1 | App Check non enforcé → CFs bypassables via curl par un user authentifié | ÉLEVÉ | Plan dédié `0_APP_CHECK_SETUP.md`, exécution en TOUT DERNIER |
| R2 | `adminAuditLog` sans TTL — rétention infinie (B6-S5) | MOYEN | À traiter avec B6 quand on l'attaquera (90j TTL planifié) |
| R3 | `pending_assemblyai_deletes` antérieurs à T0.5 sans userId | FAIBLE | Auto-purge via cleanup mensuel (5 tentatives) — pas de back-fill |
| R4 | Race condition `consumeUsageQuota` (B4-S3) | MOYEN | À traiter avec B4 (FieldValue.increment) |
| R5 | Cache subscription stale 5-10s entre webhook EXPIRATION et CF check (B4-S4) | MOYEN | À traiter avec B4 |

---

## Métriques à surveiller (24 h post-déploiement)

| Métrique | Source | Seuil d'alerte |
|----------|--------|----------------|
| Logs `revenueCatWebhook: duplicate event` | Cloud Logs | > 5%/jour des appels = RC retry trop agressif |
| Logs `revenueCatWebhook: user ... no longer exists` | Cloud Logs | Croissance lente OK ; pic = bug ailleurs |
| Docs `pending_assemblyai_deletes` avec userId | Firestore | Compteur > 0 attendu post-fix |
| Docs `adminAuditLog` type `setAdminClaim` | Firestore | 1 attendu après bootstrap, 0 si non-fait |
| Docs `adminAuditLog` type `deleteUserAccount` | Firestore | 0 sauf admin action légitime |
| Docs `revenuecat_webhook_events` | Firestore | Croissance régulière ; TTL purge auto à 30j |

---

## Prochaines actions

1. **Bootstrap admin** (toi, 5 min) — voir procédure ci-dessus.
2. **A — Bornes UI** ([plan](A_BORNES_UI.md)) — chantier client, ~1 jour, 13 gaps.
3. **B1 — Sharing** ([plan](B1_SHARING.md)) — race conditions + brute-force shareCodes.
4. **B2 — Deletion** ([plan](B2_DELETION.md)) — finir les 7 surfaces restantes après T0.5/T0.6.
5. **B3 — Auth** — partiellement déjà couvert par T0.3, reste S3/S4/S5/S7/S8.
6. **B4 — Payments** — partiellement couvert par T0.2, reste S3/S4/S5/S6.
7. **B5 — Exports/AI/Photos**.
8. **B6 — Moderation** — partiellement couvert par T0.4, reste S1/S2/S3/S5/S7.
9. **0.1 — App Check** — TOUT DERNIER.
