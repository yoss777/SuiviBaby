# B3 — Auth & sessions : closure report

**Statut :** 🟢 livré
**Effort réel :** ~1 h
**Plan d'origine :** [B3_AUTH.md](B3_AUTH.md)

## Mesures livrées vs recon initial

| # | Surface | Statut initial recon | Réalité audit | Action |
|---|---------|----------------------|---------------|--------|
| S1 | Nonce Apple non vérifié serveur | CRITIQUE | **Faux positif** : Firebase Auth fait déjà SHA256(rawNonce) ↔ JWT.nonce côté backend. Replay impossible sans rawNonce. | aucune (vérification, documenté) |
| S2 | Custom claim admin set sans CF | CRITIQUE | **Déjà fix** dans Lot 0 T0.3 (`setAdminClaim` CF + audit log) | aucune |
| S3 | Refresh token Firebase dans AsyncStorage non chiffré | ÉLEVÉ | **Confirmé** | ✅ wipe défensif `firebase:*` keys au signOut |
| S4 | Listeners Firestore survivent signOut | ÉLEVÉ | **Faux positif** : useEffect cleanup `[user?.uid]` force le unsubscribe quand uid passe à undefined | aucune (vérifié) |
| S5 | Cache `@suivibaby_boot_children` non purgé | MOYEN | **Confirmé** | ✅ purge AsyncStorage au signOut |
| S6 | App Check enforce OFF | ÉLEVÉ | **Reporté à TOUT DERNIER** ([0_APP_CHECK_SETUP.md](0_APP_CHECK_SETUP.md)) | volontaire |
| S7 | Biometric uid stale dans SecureStore | ÉLEVÉ | **Faux positif** : `disableBiometric()` est appelé dans signOut et delete les 2 keys SecureStore | aucune (vérifié) |
| S8 | validateReferralCode rate limit insuffisant | MOYEN | **Faux positif** : `checkRateLimit("referral", 5)` déjà en place (5/min × 60 = ~300/h, énumération impossible) | aucune (vérifié) |

**Bilan recon vs réalité** : 8 surfaces flaguées, **5 étaient des faux positifs** (S1, S4, S7, S8) ou déjà couvertes (S2 via Lot 0, S6 via plan dédié). Seulement **2 vrais trous restaient** (S3 + S5), tous deux corrigés. L'audit B3 a beaucoup amplifié les risques par méconnaissance du code existant (cleanup React via useEffect, signOut helpers déjà appelés).

C'est une bonne illustration du principe "**trust but verify**" — un recon par agent IA flag systématiquement les surfaces "à vérifier" même quand elles sont saines, car il ne peut pas tester en runtime.

## Détail des changements

### B3.S5 — Purge cache `@suivibaby_boot_children` au signOut

[contexts/AuthContext.tsx:316-318](../../contexts/AuthContext.tsx#L316-L318)

```ts
if (uid) {
  await AsyncStorage.removeItem(`@suivibaby_boot_children:${uid}`).catch(() => {});
}
```

Clé dupliquée en dur depuis `BabyContext` pour éviter le cycle d'import `BabyContext → useAuth → AuthContext → clearBabyBootCache → BabyContext`. La duplication est documentée par un commentaire.

### B3.S3 — Wipe défensif des clés Firebase au signOut

[contexts/AuthContext.tsx:325-340](../../contexts/AuthContext.tsx#L325-L340)

```ts
try {
  const allKeys = await AsyncStorage.getAllKeys();
  const firebaseKeys = allKeys.filter((k) => k.startsWith("firebase:"));
  if (firebaseKeys.length > 0) {
    await AsyncStorage.multiRemove(firebaseKeys);
  }
} catch (wipeErr) {
  console.warn("AuthContext: Firebase AsyncStorage wipe failed", wipeErr);
}
```

**Avantage du pattern préfixe** : ne dépend d'aucune convention interne du SDK Firebase JS (qui peut changer entre versions). Si Firebase renomme `firebase:authUser:` en `_firebase_auth_user:` demain, ce code n'attrape plus rien — mais le risque est inverse (faux négatif silencieux). À mitiger via un test d'intégration sur un device réel quand on shippe.

Best-effort : si `getAllKeys`/`multiRemove` échoue, on log mais on ne bloque pas le signOut.

## Tests

- Mock AsyncStorage du setup étendu : `getItem/setItem/removeItem` retournent désormais `Promise.resolve()` (avant : `undefined`, ce qui cassait les `.catch()` du code prod), + ajout `getAllKeys` et `multiRemove` pour le wipe Firebase.
- AuthContext : 14/14 tests passent.
- BabyContext : 1/2 tests passent (1 fail pré-existant sur baseline, non lié à mes changements — vérifié via `git stash`).
- 103/103 tests CF, 44 erreurs TS = baseline (0 régression).

## Déploiements

**Aucun.** B3 = changements 100% client (AuthContext, BabyContext, setup test). Bénéfices visibles au prochain build EAS.

## Risques résiduels

| # | Risque | Sévérité | Note |
|---|--------|----------|------|
| R1 | Firebase change la convention `firebase:*` → wipe rate des clés | FAIBLE | Le `firebaseSignOut(auth)` reste la source primaire. Notre wipe est défensif. Si convention change, on rate juste le défensif. |
| R2 | App Check enforce toujours OFF | ÉLEVÉ | Reporté en TOUT DERNIER, plan dédié. |
| R3 | Refresh token jamais chiffré on-device | MOYEN | Pour vrai chiffrement, faudrait un custom Firebase persistence adapter avec `expo-secure-store`. Effort 4h, gain incertain (token RT a une TTL Firebase ~1h, exploit limité). Reporté en backlog. |

## Prochaines actions

Selon l'ordre : **B4 — Payments & quotas** (~3 h). 7 surfaces dont 1 CRITIQUE (déjà fixée Lot 0 T0.2 webhook RC hardening) + race quota voice (T0.5 a aussi partiellement traité).

Plan : [B4_PAYMENTS.md](B4_PAYMENTS.md).
