# B3 — Red team authentification & sessions : plan d'action

**Statut :** ⚪ recon à faire
**Effort estimé :** 3-4 h

## Périmètre

- `contexts/AuthContext.tsx` (state management session)
- `services/socialAuthService.ts` (Apple / Google sign-in, nonce, PKCE)
- `services/biometricAuthService.ts` (Face ID / Touch ID gate)
- App Check (`@react-native-firebase/app-check`)
- Custom claims (`admin`, etc.)
- Règles Firestore qui dépendent de `request.auth` et `request.auth.token`
- Persistence sessions : `expo-secure-store` ? AsyncStorage ?

## Surfaces d'attaque à investiguer

1. **Session fixation** — un attaquant peut-il préparer un état d'auth qu'un autre user adoptera ?
2. **Token persistence** — refresh token stocké dans SecureStore ou AsyncStorage (vulnérable au backup) ?
3. **Bypass biométrique** — biometric gate peut-il être contourné par un attaquant qui a accès à l'app ouverte ?
4. **App Check bypass** — debug tokens en prod ? `APPCHECK_ENFORCE` réellement true partout ?
5. **Apple Sign-in nonce** — bien vérifié côté serveur ? Replay possible ?
6. **Custom claim `admin`** — qui peut le set ? `grandfatherExistingUsers` ou autre CF expose-t-il une voie ?
7. **Account take-over via email change** — `setEmail` dans Firebase Auth re-vérifie-t-il ?
8. **Race condition au signOut** — listeners Firestore qui survivent au signOut → cross-user data leak ?
9. **Multi-account sur même device** — switch d'account nettoie-t-il bien le cache local (`@suivibaby_boot_children:*`, etc.) ?

## Recon à lancer

Prompt :
> Audit du système d'auth dans /Users/yoss/Projets/SuiviBaby. Liste tous les flows : sign-up, sign-in (Apple/Google/email), sign-out, refresh, biometric gate, App Check. Pour chacun : où est stocké le token, qui peut le lire, comment il est invalidé. Vérifie : nonce verification côté Apple, custom claims setting paths, app check enforcement. Note les caches qui survivent au signOut. Sous 600 mots.

## Surfaces identifiées (recon mai 2026)

| # | Surface | Sévérité | File:line | Gap |
|---|---------|----------|-----------|-----|
| S1 | Nonce Apple non re-validé serveur | CRITIQUE (à vérifier) | [socialAuthService.ts:87-115](../../services/socialAuthService.ts) | Firebase SDK gère côté client mais pas de double-check CF. Replay possible si JWT Apple leaked. |
| S2 | Custom claim `admin` setté hors-band, sans CF dédiée | CRITIQUE | [functions/index.js:1254-1256,2309](../../functions/index.js) | Le claim est READ par `resolveReport`/`grandfatherExistingUsers` mais aucune CF ne le SET. Set manuel via Firebase Admin SDK uniquement → pas d'audit log. |
| S3 | Refresh token Firebase dans AsyncStorage non chiffré | ÉLEVÉ | [config/firebase.ts:26-31](../../config/firebase.ts) | `getReactNativePersistence(AsyncStorage)` → token extractible jailbreak/root + backup iCloud non chiffré. signOut async, si fail token persiste. |
| S4 | Listeners Firestore BabyContext survivent à signOut | ÉLEVÉ | [contexts/BabyContext.tsx:406-526](../../contexts/BabyContext.tsx) | Cleanup uniquement au unmount du composant. Si signOut sans unmount → listener ancien user reste actif, cache nouveau user hydraté avec données de l'ancien. |
| S5 | Cache `@suivibaby_boot_children:{uid}` non purgé au signOut | MOYEN | [BabyContext.tsx:40,56-98](../../contexts/BabyContext.tsx), [AuthContext.tsx:300-323](../../contexts/AuthContext.tsx) | TTL 7j. Multi-account sur même device : user B voit cache de A. |
| S6 | **`APP_CHECK_ENFORCED=false` par défaut** | ÉLEVÉ | [functions/index.js:18,80-89](../../functions/index.js) | `process.env.APPCHECK_ENFORCE !== "true"` → logs warn UNVERIFIED mais accepte. CFs exploitables via curl. |
| S7 | Biometric unlock retourne uid stale de SecureStore | ÉLEVÉ | [biometricAuthService.ts:108-177](../../services/biometricAuthService.ts) | `enableBiometric(uid)` stocke uid ; sur switch account, l'unlock peut retourner l'ancien uid si race entre token refresh et comparaison. |
| S8 | `validateReferralCode` sans rate limit | MOYEN | [functions/index.js:1449-1485,2360](../../functions/index.js) | Énumération emails couplée à `findUserByEmail` (déjà rate-limité 10/min). |

## Plan d'action

### Priorité CRITIQUE
- **S6 → activer `APPCHECK_ENFORCE=true` en prod** : vérifier que 100% des clients envoient un token App Check via logs, puis flip le flag dans Firebase Functions config. **Effort: 30min + 1 semaine d'observation des logs avant flip.**
- **S2 → CF `setAdminClaim(uid, value)` admin-only + audit log** : tracker dans `admin_audit/{timestamp}` qui set/unset le claim, quand, et pourquoi. **Effort: 2h.**
- **S1 → vérifier vraiment** : Firebase JS SDK valide-t-il le nonce Apple côté serveur via le JWT signed ? **Action: lire la doc Firebase Auth + tester un replay sur un environnement de dev. Effort: 2h.**

### Priorité ÉLEVÉ
- **S3 → migrer le refresh token Firebase vers SecureStore** : il faut un adapter custom (Firebase persistence API). Alternative pragmatique : ajouter un wipe explicite de la clé AsyncStorage Firebase au signOut. **Effort: 4h (custom adapter) ou 1h (wipe).**
- **S4 → cleanup explicite des listeners BabyContext au signOut** : ajouter un AuthListener dans BabyContext qui unsubscribe quand `auth.currentUser === null`. **Effort: 2h.**
- **S7 → invalider biometric secret au signOut** : `disableBiometric()` est appelé ([AuthContext:314](../../contexts/AuthContext.tsx#L314)) mais à vérifier que ça wipe vraiment le SecureStore. Ajouter un test e2e. **Effort: 1h + test.**

### Priorité MOYEN
- **S5 → purger `@suivibaby_boot_children:{uid}` au signOut** : 1 ligne `AsyncStorage.removeItem(getBabyCacheKey(uid))` dans `AuthContext.signOut`. **Effort: 15min.**
- **S8 → rate limit `validateReferralCode`** : `checkRateLimit(db, uid, "referral", 5)`. **Effort: 15min.**

## Tests à ajouter

_À définir post-recon._

## Métriques

_À définir._

## Livraison

_À définir._
