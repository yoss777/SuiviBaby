# B6 — Moderation & reports : closure report

**Statut :** 🟢 livré
**Effort réel :** ~1 h 30
**Plan d'origine :** [B6_MODERATION.md](B6_MODERATION.md)

## Mesures livrées

| # | Surface | Sévérité | Action |
|---|---------|----------|--------|
| **S1** | Report flooding (pas de rate limit) | ÉLEVÉ | ✅ `submitContentReportCF` + `checkRateLimit("report", 5)` |
| **S2** | Report sur contenu inexistant | MOYEN | ✅ Vérification `eventDoc.exists` + `childId match` |
| **S3** | Auto-report (parent signale son propre contenu) | MOYEN | ✅ Refus si `event.userId === reporter.uid` |
| S4 | Admin claim abuse + scope childId | CRITIQUE | **Déjà fix Lot 0 T0.3 (setAdminClaim) + T0.4 (resolveReport scope)** |
| **S5** | `adminAuditLog` rétention infinie | MOYEN | ✅ TTL 90j via wrapper `writeAdminAudit` + script |
| S6 | Reporter identity dans email opérateur | FAIBLE | (vérifié OK : pas exposé au reported user) |
| **S7** | Race resolveReport (2 admins simultanés) | FAIBLE | ✅ Transaction atomique `open → resolving → resolved` |
| S8 | Photo moderation Phase 2 | INFO | (décision produit documentée, hors scope) |

## Détail des changements

### B6.S1+S2+S3 — `submitContentReportCF` (nouvelle CF)

[functions/index.js submitContentReportCF ~1370+](../../functions/index.js)

Remplace l'addDoc client direct. Validations serveur :
- **Rate limit** 5/min/uid (`checkRateLimit("report", 5)`) → un user ne peut pas créer 1000 reports en rafale.
- **Validation champs** : `childId` string non vide, `reason` ∈ enum, `message` ≤ 1000 chars, `eventId`/`photoPath` types.
- **`checkChildAccess`** (conservé de l'ancien rules).
- **S2 event exists** : `db.doc('events/{eventId}').get()` + check `childId match`. Si pas trouvé → 404.
- **S3 anti auto-report** : `event.userId !== reporter.uid`. Empêche le hack "hide my own photo from co-parents en s'auto-reportant".

[firestore.rules:232-241](../../firestore.rules) : `allow create: if false` pour `reports/{reportId}`. Tout passe par la CF (admin SDK bypass rules).

Migration client [services/contentReportService.ts](../../services/contentReportService.ts) :
- `httpsCallable("submitContentReportCF")` au lieu de `addDoc`.
- Mapping des `functions/*` errors en messages français user-friendly (rate limit → "Trop de signalements...", not-found → "Le contenu signalé n'existe plus", failed-precondition → message brut de la CF, permission-denied → "Vous n'avez pas accès").

### B6.S5 — `adminAuditLog` TTL 90 jours

[functions/index.js writeAdminAudit ~232-238](../../functions/index.js)

Wrapper centralisé qui injecte `expireAt` (now + 90j) sur tous les writes. 7 sites refactorés (resolveReport × 2, setAdminClaim × 2, deleteUserAccount cross-user, grandfatherExistingUsers, resolveReport_denied).

[functions/scripts/enable-admin-audit-ttl.js](../../functions/scripts/enable-admin-audit-ttl.js) : one-shot pour activer la TTL policy Firestore sur `adminAuditLog.expireAt`. Exécuté post-deploy, operation lancée.

**Note** : les entrées pré-existantes n'ont pas `expireAt`, elles ne seront pas auto-purgées. À nettoyer manuellement via un script one-shot si besoin (ou les laisser, charge DB négligeable sur l'historique passé).

### B6.S7 — `resolveReport` atomic claim

[functions/index.js resolveReport ~1480-1530](../../functions/index.js)

Avant :
```js
// Read non-atomic
const reportData = reportSnap.data();
if (reportData.status === "resolved") throw already-exists;
// ... 80 lines of action exec ...
// Update final non-atomic
await reportRef.update({ status: "resolved", ... });
```

Race : 2 admins simultanés passent le check, exécutent les actions (double-delete photo, double-notif email reporter, double-audit-log).

Après : transaction `runTransaction` au début qui flip `status: open → resolving + resolvingBy + resolvingAt`. La 2e tx voit `resolving` et throw `already-exists` avec message dédié ("en cours de traitement par un autre admin"). Le code de fin garde son `update({status: "resolved"})` qui flip `resolving → resolved`.

## Tests

**116/116 tests CF passent** (107 + 9 nouveaux B6) :
- `submitContentReportCF` : auth, missing childId, invalid reason, message > 1000, S2 not found, S3 auto-report, success.
- `resolveReport B6.S7 atomic claim` : status=resolving rejected, status=resolved rejected.

Bug détecté & corrigé pendant les tests : mon `replace_all` sur `db.collection("adminAuditLog").add(` avait aussi modifié la définition du helper → récursion infinie. Fix en réécrivant la définition.

44 erreurs TS = baseline (0 régression).

## Déploiements

| Composant | Action |
|-----------|--------|
| `submitContentReportCF` (nouvelle) | ✅ créée europe-west1 |
| `resolveReport` (transaction + TTL audit) | ✅ updated |
| `setAdminClaim` (TTL audit) | ✅ updated |
| `deleteUserAccount` (TTL audit) | ✅ updated |
| `grandfatherExistingUsers` (TTL audit) | ✅ updated |
| `firestore.rules` (reports allow create: false) | ✅ released |
| TTL Firestore `adminAuditLog.expireAt` | ✅ operation lancée |
| Commits `58e739d` + `d44de4b` pushed | ✅ |

## Risques résiduels

| # | Risque | Sévérité | Note |
|---|--------|----------|------|
| R1 | Entrées `adminAuditLog` pré-deploy sans `expireAt` | FAIBLE | Charge DB négligeable. Cleanup manuel si besoin. |
| R2 | Le `status: resolving` peut bloquer indéfiniment si la CF crash entre claim et update final | FAIBLE | Pas de timeout/release auto. Un admin peut manuellement remettre `status: open` via Firestore Console. Si récurrent, ajouter une scheduled CF qui release après 1h. |
| R3 | B6.S6 photo moderation Phase 2 non implémentée | INFO | Décision produit documentée dans `docs/PHOTO_MODERATION_IMPLEMENTATION_PLAN.md`. Phase 2 attendue si volume signalement augmente. |

## Prochaines actions

🎉 **Tous les chantiers B (B1→B6) sont livrés.**

Reste uniquement :
- **App Check (0.1)** — TOUT DERNIER, plan dans [0_APP_CHECK_SETUP.md](0_APP_CHECK_SETUP.md). Effort 1-2 jours côté client + 1 jour observation.
- **EAS build final** avec tous les fixes client (A bornes UI + B1-B6 mappings client) accumulés depuis le bundle preview précédent.
- **Closure report global** du red team app complet.
