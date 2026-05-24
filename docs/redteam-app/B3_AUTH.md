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

## Plan d'action

_À remplir post-recon._

## Tests à ajouter

_À définir post-recon._

## Métriques

_À définir._

## Livraison

_À définir._
