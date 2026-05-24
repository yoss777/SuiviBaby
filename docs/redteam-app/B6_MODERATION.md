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

## Plan d'action

_À remplir post-recon._

## Tests à ajouter

_À définir post-recon._

## Métriques

_À définir._

## Livraison

_À définir._
