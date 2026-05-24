# B4 — Red team paiements & quotas (RevenueCat) : plan d'action

**Statut :** ⚪ recon à faire
**Effort estimé :** 3 h

## Périmètre

- `services/revenueCatService.ts`
- `services/premiumGatingService.ts` (`voiceCommandsPerDay: 3`, etc.)
- `services/premiumUsageService.ts`
- CF `revenueCatWebhook` (signature `REVENUECAT_WEBHOOK_SECRET`)
- CF `consumeUsageQuota`, `getUsageQuotaStatus`
- Collection `subscriptions/{uid}`, `usage_limits/{uid}`
- Helper `hasUnlimitedFeature` côté serveur

## Surfaces d'attaque à investiguer

1. **Feature theft** — un user free peut-il bypass le gating client et écrire directement la feature premium côté Firestore ?
2. **Webhook spoofing** — `revenueCatWebhook` vérifie-t-il bien la signature ? Re-play possible ?
3. **Race quota** — `consumeUsageQuota` est-il transactional ? Concurrent calls = 1 consommation ou N ?
4. **Subscription state stale** — entre la fin d'un abonnement RC et le webhook, le user a-t-il accès premium gratos ?
5. **`grandfatherExistingUsers`** — qui peut l'appeler ? Sécurisée admin claim ?
6. **Refund / churn** — quand RC envoie `CANCELLATION` puis `EXPIRATION`, les flags premium sont-ils bien retirés ?
7. **Cross-platform double-billing** — un user qui paie sur iOS puis se logue sur Android avec le même Apple ID — RC fait quoi ?
8. **`hasUnlimitedFeature`** côté CF — basé sur un cache ? S'il est stale, gating bypassé.

## Recon à lancer

Prompt :
> Audit du flow paiement RevenueCat et quotas dans /Users/yoss/Projets/SuiviBaby. Trace : achat client → webhook serveur → écriture `subscriptions/{uid}` → lecture `hasUnlimitedFeature` dans les CFs gated. Vérifie : signature webhook, idempotence event_id, atomicité de consumeUsageQuota, fraîcheur du state subscription au moment de chaque gating. Liste les features premium et leur point de gating (UI + CF). Sous 500 mots.

## Plan d'action

_À remplir post-recon._

## Tests à ajouter

_À définir post-recon._

## Métriques

_À définir._

## Livraison

_À définir._
