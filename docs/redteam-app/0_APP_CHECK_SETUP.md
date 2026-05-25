# 0.1 — App Check setup (chantier dédié)

**Statut :** 🔴 bloqué — configuration client manquante
**Effort estimé :** 1-2 jours
**Découvert le :** 2026-05-24, lors de la vérification logs pré-flip

## Constat

Lors du red team B3, on a identifié `APP_CHECK_ENFORCED=false` comme un bloqueur critique : sans App Check enforce, toutes les défenses CF (rate limit, quota, validation, optimistic lock) sont contournables via curl depuis n'importe où, vu que [withAppCheck()](../../functions/index.js#L80) retourne juste `options` (sans `enforceAppCheck: true`) tant que la variable d'env est false.

**Action initiale prévue :** flip `APPCHECK_ENFORCE=true` après vérification des logs.

**Constat vérification logs (24 mai 2026) :**
```
firebase functions:log --lines 2000 | grep "AppCheck"
→ 4 lignes, 100% UNVERIFIED
```

Aucune requête en prod n'envoie un token App Check valide. **Activer enforce maintenant bloquerait 100% des utilisateurs.**

## Cause

App Check n'est pas (ou mal) initialisé dans le bundle client. Pourtant `@react-native-firebase/app-check` est dans `package.json` (visible dans le brief initial). Possibles raisons :

1. **`firebase.initializeAppCheck(...)` pas appelé au boot** dans [config/firebase.ts](../../config/firebase.ts) ou un provider proche.
2. **Clés App Check pas configurées côté Firebase Console** :
   - iOS : DeviceCheck App Attest (besoin d'un Team ID + Key ID Apple)
   - Android : Play Integrity (besoin d'enregistrer l'app sur Google Play Console)
3. **Debug tokens** pas configurés pour les builds dev/preview (les tests internes échoueraient sans).
4. **Le SDK utilisé** (`@react-native-firebase` vs `firebase` JS web) pas aligné avec ce que les CFs attendent.

## Plan d'action

### Étape 1 — Audit configuration actuelle (1h)
- [ ] Lire [config/firebase.ts](../../config/firebase.ts) : `initializeAppCheck` présent ?
- [ ] Vérifier `app.json` / `app.config.js` : section `appCheck` ?
- [ ] Vérifier Firebase Console > App Check : providers configurés pour com.yoss7.samaye ?
- [ ] Vérifier qu'au moins un debug token existe pour les tests dev.

### Étape 2 — Activer App Check côté client (4-6h)
- [ ] Initialiser App Check au boot, AVANT toute autre call Firebase :
  ```ts
  import { initializeAppCheck, ReCaptchaV3Provider } from "firebase/app-check"; // web
  // OU @react-native-firebase/app-check pour RN natif
  ```
- [ ] iOS : provider `DeviceCheck` ou `AppAttest` (iOS 14+) — nécessite enrollement.
- [ ] Android : provider `PlayIntegrity` — nécessite app enregistrée Play Console.
- [ ] Debug provider pour builds EAS preview/dev.

### Étape 3 — Build EAS preview + vérification logs (1 jour + 1 jour d'observation)
- [ ] `eas build --profile preview --platform all`
- [ ] Installer sur device test, ouvrir l'app.
- [ ] `firebase functions:log` → vérifier que les logs montrent `VERIFIED` au lieu de `UNVERIFIED`.
- [ ] Idéalement, observer pendant 24h pour s'assurer que tous les flows touchent les CFs avec token valide.

### Étape 4 — Flip enforce (30 min, après validation)
- [ ] `firebase functions:secrets:set APPCHECK_ENFORCE=true` (ou env var)
- [ ] Redeploy toutes les CFs concernées.
- [ ] Monitor en continu pendant 24h. Si > 0.1% des appels échouent avec App Check rejection, **revert immédiat**.

## Risque résiduel pendant le chantier

Tant que `APPCHECK_ENFORCE=false`, toutes les défenses serveur (Lots 1-3 voice + 0.2 à 0.6 ci-dessous) sont **bypassables via curl** :
- Quota voice contournable
- Optimistic lock contournable (un attaquant CSRF-like authentifié peut spammer)
- Bornes serveur contournables côté `validateAndCreateEvent` ...

**Mitigation partielle :** l'attaquant doit quand même être **authentifié** (Firebase Auth) pour appeler les CFs. Un attaquant non-utilisateur ne peut rien. Un utilisateur malveillant peut spam au-delà des quotas.

## Décision produit nécessaire

- Acceptable de garder ce chantier ouvert tant qu'on n'a pas un cas réel d'abus ?
- Ou priorité immédiate dès qu'un dev backend/mobile peut s'y consacrer ?
