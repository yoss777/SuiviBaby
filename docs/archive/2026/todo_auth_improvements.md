# Auth Improvements — Analyse comparative StockPro vs SuiviBaby

Date: 2026-03-28
Derniere mise a jour : 2026-04-05

## Contexte

Analyse comparative approfondie du workflow d'authentification entre StockPro (Supabase) et SuiviBaby (Firebase Auth). L'objectif est d'identifier les patterns eprouves de StockPro a adapter dans SuiviBaby.

## Ce que SuiviBaby fait deja bien

- Biometric login (Face ID / Touch ID) — implemente
- Offline queue scopee par uid (SQLite)
- Cleanup exhaustif au signOut (5 etapes : cache, queue, notifs, push tokens, auth)
- Memory leak prevention (isMountedRef pattern)
- useReducer pour l'auth state (evite les race conditions multi-setState)
- Race condition signup geree (retry 1.5s si doc Firestore pas encore ecrit)

## Ameliorations identifiees

### 1. Deplacer le prompt biometrique apres l'onboarding (HAUT)

- [x] **Deplacer le prompt Face ID / Touch ID de boot.tsx vers la fin de l'onboarding**

**Statut** : FAIT — Le prompt biometrique est dans onboarding.tsx (fin du carousel). boot.tsx ne contient plus de prompt biometrique. login.tsx affiche uniquement le bouton si deja active.

### 2. Centraliser les permissions dans un fichier dedie (HAUT)

- [x] **Creer `utils/permissions.ts` avec une matrice centralisee**

**Statut** : FAIT — `utils/permissions.ts` contient DEFAULT_ROLE_PERMISSIONS, calculatePermissions(), grantChildAccess(), updateChildAccess(), revokeChildAccess(). Hook `hooks/useChildPermissions.ts` avec listener Firestore temps reel.

### 3. Social sign-in Google / Apple (HAUT)

- [x] **Implementer Google Sign-In et Apple Sign-In**

**Statut** : FAIT — `services/socialAuthService.ts` avec Google (@react-native-google-signin v16) + Apple (expo-apple-authentication). Boutons dans login.tsx. Profil Firestore cree automatiquement. SignOut Google dans AuthContext. Universal Links configures pour iOS (AASA + Associated Domains).

### 4. Guard layout-level pour futur paywall (MOYEN)

- [x] **Preparer un subscription guard dans les layouts**

**Statut** : FAIT — Implemente via `PremiumContext` + `PremiumProvider` dans `_layout.tsx`. `checkFeatureAccess()` verifie les permissions par feature. `premiumGatingService.ts` gere les compteurs et limites. `PaywallPrompt` s'affiche contextuellement quand une feature Premium est bloquee. Pas de redirect hard (approche douce adaptee a une app familiale).

### 5. Email verification sur signup (BAS)

- [x] **Ajouter la verification email**

**Statut** : FAIT — `sendEmailVerification()` appele apres `createUserWithEmailAndPassword()` dans login.tsx. Ecran dedie `app/(auth)/verify-email.tsx` avec bouton "Renvoyer" + cooldown. Redirection automatique apres verification.

### 6. Token refresh coordonne avec AppState (BAS)

- [ ] **Suspendre les listeners Firestore quand l'app est en background**

**Statut** : NON FAIT — AppState est utilise pour analytics et chrono, mais pas pour le token refresh ou les listeners Firestore.

**Pourquoi** : StockPro coordonne le refresh Supabase avec AppState (start/stop auto-refresh). Firebase Auth JS SDK fait du lazy refresh, mais les listeners Firestore continuent en background → battery drain potentiel.

**Implementation** :
- Listener AppState dans un hook `useAppStateSync`
- Background → desactiver les listeners Firestore (ou reduire la frequence)
- Foreground → reactiver et forcer un refresh
- Impact surtout sur les devices plus anciens

## Priorite recommandee (mise a jour)

1. ~~Biometric apres onboarding~~ — FAIT
2. ~~Centraliser permissions~~ — FAIT
3. ~~Social sign-in~~ — FAIT
4. ~~Guard layout paywall~~ — FAIT (PremiumContext + PaywallPrompt)
5. ~~Email verification~~ — FAIT (sendEmailVerification + verify-email.tsx)
6. **AppState token refresh** — Optimisation, bas priorite (en attente)

## Score : 5/6 FAIT (reste AppState token refresh — optimisation bas priorite)

## Notes

- Le CAPTCHA (Cloudflare Turnstile dans StockPro) n'est pas necessaire pour SuiviBaby — Firebase Auth a son propre rate limiting cote serveur
- Le custom fetch interceptor de StockPro n'est pas necessaire — le pattern `isNetworkError()` dans eventsService.ts fait le meme job
- L'onboarding role-based de StockPro n'est pas pertinent — SuiviBaby n'a pas de roles dans l'onboarding
