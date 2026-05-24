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

## Surfaces identifiées (recon mai 2026)

| # | Surface | Sévérité | File:line | Gap |
|---|---------|----------|-----------|-----|
| S1 | **Webhook RC : signature Bearer plain-text, pas de HMAC** | CRITIQUE | [functions/index.js:2177-2189](../../functions/index.js) | `authHeader === \`Bearer ${secret}\`` simple compare. Pas de Svix/HMAC-SHA256 alors que `svix` est dans node_modules. Pas de timestamp TTL. Si secret leak → forge totale. |
| S2 | Pas d'idempotence webhook par `event_id` | ÉLEVÉ | [functions/index.js:2259-2274](../../functions/index.js) | Replay même webhook = double update. 2 webhooks concurrents avec même ts = race, ordre non garanti. |
| S3 | Race `reserveVoiceQuota` (transaction OK mais merge :true) | ÉLEVÉ | [functions/index.js:216-266](../../functions/index.js) | Transaction utilisée mais `set(..., {merge:true})` permet à 2 calls concurrents de lire `used=2` puis tous deux d'écrire `used=3`. 1 consommation perdue → 4-5 appels/jour au lieu de 3. |
| S4 | Cache stale subscription state entre webhook EXPIRATION et CF check | ÉLEVÉ | [contexts/PremiumContext.tsx:206-224](../../contexts/PremiumContext.tsx), [functions/index.js:170](../../functions/index.js) | Window 5-10s entre EXPIRATION webhook et `getSubscriptionState` qui lit Firestore. User a accès premium "gratuit" pendant ce délai. |
| S5 | CANCELLATION sans EXPIRATION follow-up | MOYEN | [functions/index.js:2223-2231](../../functions/index.js) | Si RC oublie d'envoyer EXPIRATION, flag premium reste indéfiniment. Pas de cron de nettoyage `expired sub > now`. |
| S6 | `grandfatherExistingUsers` admin-claim, pas rate-limited | MOYEN | [functions/index.js:2301-2350](../../functions/index.js) | Si admin claim leak → grandfathered tous users en batch sans throttle. |
| S7 | Firestore rules subscriptions write OFF | (vérifié OK) | [firestore.rules:466-469](../../firestore.rules) | Read seul pour user, write réservé CF. Pas de bypass client. |

**Liste des features gated identifiée :**

| Feature | CF gating | UI gating | Free limit |
|---------|-----------|-----------|-----------|
| Voice | reserveVoiceQuota | PremiumContext+VoiceButton | 3/jour |
| Export PDF | consumeUsageQuota | export.tsx:858 | 1 total |
| Sharing | getSharingQuotaStatus | CF only | 2 invites |
| History | local filter | UI hide | 90 jours |
| Stats avancés | UI check | — | premium only |
| AI insights | UI check | — | premium only |

## Plan d'action

### Priorité CRITIQUE
- **S1 → migrer vers Svix verification** (package déjà installé). Lire signature `webhook-id` + `webhook-timestamp` + `webhook-signature` headers, vérifier HMAC, refuser si timestamp > 5min. **Effort: 2h.**

### Priorité ÉLEVÉ
- **S2 → dédoublonnage par `event.event_id`** : check Firestore `revenuecat_webhook_events/{event_id}` exists avant traitement. TTL 30 jours. **Effort: 1h.**
- **S3 → counter Firestore `FieldValue.increment(1)`** pour le quota voice (au lieu de read-modify-write transactional). Garantie atomique sans race. **Effort: 1h + migration data.**
- **S4 → real-time listener côté CF** : trop coûteux. Alternative : cache TTL 10s côté CF + check `subscriptions.updatedAt` pour invalider. **Effort: 2h.**

### Priorité MOYEN
- **S5 → scheduled CF `cleanupExpiredSubs` (daily)** : compare `subscriptions.expiresAt < now AND status==='active'` → flip à `expired`. **Effort: 1h.**
- **S6 → rate limit + audit log sur `grandfatherExistingUsers`** : max 1 appel/heure, log à chaque batch. **Effort: 30min.**

**Coût d'exploitation actuel estimé** (avant fixes) : $100-500/mois (5-10% des free users → premium stale + 3-4 voice appels surplus). Surtout dépendant de la prévalence d'attaquants techniques dans la userbase.

## Tests à ajouter

_À définir post-recon._

## Métriques

_À définir._

## Livraison

_À définir._
