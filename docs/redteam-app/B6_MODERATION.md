# B6 — Red team modération & reports : plan d'action

**Statut :** ⚪ recon à faire
**Effort estimé :** 2 h

## Périmètre

- `services/contentReportService.ts`
- CF `resolveReport` (admin claim + audit log — déjà partiellement testée)
- Collection `reports`
- Photo moderation (cf. `docs/PHOTO_MODERATION_IMPLEMENTATION_PLAN.md` existant)

## Surfaces d'attaque à investiguer

1. **Report flooding** — un user peut-il créer 1000 reports en rafale (rate limit ?)
2. **Report sur contenu inexistant** — `reports/{eventId}` qui ne correspond à rien — comportement ?
3. **Auto-report** — un user peut-il reporter son propre contenu pour fake-flag ?
4. **Admin claim abuse** — `resolveReport` vérifie le custom claim `admin`. Qui peut set ce claim ? Est-ce auditable ?
5. **Reporter identity leak** — `reporterUserId` exposé au reported user ?
6. **Race condition resolve** — 2 admins résolvent simultanément, double action ?
7. **Photo moderation pipeline** (si existant) — bypass possible si upload sans déclencher la check ?

## Recon à lancer

Prompt :
> Audit du flow modération dans /Users/yoss/Projets/SuiviBaby. Trace : création d'un report client → écriture `reports/` → traitement admin via resolveReport. Vérifie : rate limit, ownership, idempotence resolve, exposition reporter identity, qui peut setter admin claim. Vérifie aussi l'état du pipeline photo moderation (cf docs/PHOTO_MODERATION_IMPLEMENTATION_PLAN.md). Sous 400 mots.

## Surfaces identifiées (recon mai 2026)

| # | Surface | Sévérité | File:line | Gap |
|---|---------|----------|-----------|-----|
| S1 | Report flooding : aucun rate limit | ÉLEVÉ | [contentReportService.ts:19-41](../../services/contentReportService.ts), [firestore.rules:238-259](../../firestore.rules) | Pas de `checkRateLimit("reports", N)`. 1000 reports/seconde possible → spam queue + email opérateur |
| S2 | Report sur contenu inexistant | MOYEN | [firestore.rules:238-259](../../firestore.rules), [functions/index.js:1050-1200](../../functions/index.js) | Pas de `exists()` check sur eventId/childId → erreurs cascade dans onReportCreated |
| S3 | Auto-report sur son propre contenu | MOYEN | [contentReportService.ts:19-41](../../services/contentReportService.ts) | Parent peut hide sa photo de tous co-parents en s'auto-reportant (auto-hide + `reported:true` si owner) |
| S4 | **Admin claim abuse : pas de CF set, pas d'audit, pas de scope childId** | CRITIQUE | [functions/index.js:1241-1380](../../functions/index.js) | Admin claim setté via Firebase Console manuellement (zéro audit). `resolveReport` ne check pas `hasAccess(childId)` → admin global peut supprimer events de n'importe quel enfant |
| S5 | `adminAuditLog` sans TTL — rétention infinie | MOYEN | [functions/index.js:1281-1290](../../functions/index.js) | RGPD risk + charge DB. Reports résolus 2020 toujours là. |
| S6 | Reporter identity dans email opérateur | FAIBLE | [functions/index.js:1086](../../functions/index.js) | `${reporterEmail}` log côté ops. Pas exposé au reported user. OK. |
| S7 | Race resolveReport non transactional | FAIBLE | [functions/index.js:1273-1378](../../functions/index.js) | 2 admins simultanés = double notif + double audit log + suppression photo 2x |
| S8 | Photo moderation Phase 2 (mediaAssets quarantine) non implémentée | (info) | [docs/PHOTO_MODERATION_IMPLEMENTATION_PLAN.md](../PHOTO_MODERATION_IMPLEMENTATION_PLAN.md) | Décision produit documentée : V1 = signalement manuel suffit. Pas une vuln. |

## Plan d'action

### Priorité CRITIQUE
- **S4 → CF `grantAdminStatus(uid, reason, grantedBy)`** + audit log initial obligatoire. ET ajouter dans `resolveReport` après le check admin claim : vérification `hasAccess(reportData.childId)` ∈ {owner, admin}. **Effort: 2-3h.**

### Priorité ÉLEVÉ
- **S1 → `checkRateLimit(db, uid, "reports", 5)`** dans `onReportCreated` ou rules Firestore (préférable côté CF pour le bucket partagé). **Effort: 30min.**

### Priorité MOYEN
- **S2 → ajouter `exists()` check dans firestore.rules**. **Effort: 30min.**
- **S3 → refus auto-report** : `request.resource.data.reporterUserId != eventAuthorId` (nécessite read event côté rules — limite Firestore, donc le faire côté CF dans `onReportCreated`). **Effort: 1h.**
- **S5 → TTL Firestore policy sur `adminAuditLog.createdAt`** : 90 jours. Via script `enable-admin-audit-ttl.js` similaire au cache voice. **Effort: 30min.**

### Priorité FAIBLE
- **S7 → transaction atomique resolveReport** (precondition `status==="open"`). **Effort: 1h.**

## Tests à ajouter

_À définir post-recon._

## Métriques

_À définir._

## Livraison

_À définir._
