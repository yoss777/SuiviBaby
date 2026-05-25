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

## Plan d'action (révisé après audit)

### Audit du code existant ✅ (fait)

**Bonne nouvelle** : l'infrastructure côté client est **déjà entièrement codée** :
- [config/appCheck.ts](../../config/appCheck.ts) (175 lignes) gère web + native, debug + prod, avec fallback gracieux.
- Appelé au boot via `ensureFirebaseAppCheck()` dans [app/_layout.tsx:56](../../app/_layout.tsx#L56).
- `nativeConfigured` détecté automatiquement par `app.config.js` quand les fichiers Google Services sont présents.
- Les 2 fichiers Google Services sont présents à la racine du projet.
- En prod : `playIntegrity` (Android) + `appAttestWithDeviceCheckFallback` (iOS).
- En dev : `provider: "debug"` (gated par `EXPO_PUBLIC_FIREBASE_APPCHECK_NATIVE_DEV_ENABLED=true`).

**Donc le code client est OK**. Les 100% UNVERIFIED en prod viennent forcément de la config Firebase Console manquante.

### Étape 1 — Configurer les providers Firebase Console (30 min, par toi)

1. **Aller sur Firebase Console** : https://console.firebase.google.com/project/samaye-53723/appcheck/apps
2. Pour l'app **iOS** (com.yoss7.samaye) :
   - Cliquer "Manage" → "App Attest"
   - Activer App Attest (nécessite iOS 14+).
   - Optionnel mais recommandé : activer aussi DeviceCheck en fallback (pour iOS < 14 et simulateurs).
3. Pour l'app **Android** (com.yoss7.samaye) :
   - Cliquer "Manage" → "Play Integrity"
   - Activer Play Integrity. **Pré-requis** : l'app doit être publiée sur Play Console (au moins en track interne). Si pas encore le cas, activer aussi "SafetyNet" en backup (deprecated mais permet de débuter).
4. Pour le **web** (samaye-53723.firebaseapp.com) :
   - Cliquer "Manage" → "reCAPTCHA v3"
   - Suivre les instructions, copier le site key.
   - Ajouter `EXPO_PUBLIC_FIREBASE_APPCHECK_WEB_SITE_KEY=xxx` dans `.env.production`.
5. **TTL token** : par défaut 1h. Laisser tel quel sauf si problème.

### Étape 2 — Debug tokens pour preview/dev (15 min, par toi)

Pour que les builds EAS preview puissent envoyer des tokens valides sans device enrollé Play Integrity / App Attest, on utilise des **debug tokens**.

1. Lancer l'app en mode dev une fois (ou un build preview), regarder les logs natifs Xcode/Android Studio → ils affichent un debug token au premier appel App Check.
2. Copier ce token dans Firebase Console > App Check > Manage debug tokens.
3. **Pour ces builds EAS** preview, ajouter ces variables d'env dans le profil `preview` de `eas.json` :
   ```json
   "preview": {
     ...
     "env": {
       ...
       "EXPO_PUBLIC_FIREBASE_APPCHECK_NATIVE_DEV_ENABLED": "true",
       "EXPO_PUBLIC_FIREBASE_APPCHECK_DEBUG_TOKEN_ANDROID": "xxx-from-step-2",
       "EXPO_PUBLIC_FIREBASE_APPCHECK_DEBUG_TOKEN_APPLE": "xxx-from-step-2"
     }
   }
   ```
4. Rebuild EAS preview avec les nouvelles env vars.

### Étape 3 — Rebuild + tester (30 min build + 24h observation)

1. **Rebuild EAS preview** Android (+ iOS si tu veux) : `eas build --profile preview --platform android --non-interactive --no-wait`.
2. **Installer l'APK** sur device test, ouvrir l'app, naviguer (déclencher des appels CF : voice command, share code, etc.).
3. **Vérifier les logs Cloud Functions** :
   ```bash
   firebase functions:log --lines 200 | grep AppCheck
   ```
   Attendu : les logs montrent maintenant `VERIFIED (uid: ...)` au lieu de `UNVERIFIED`.
4. **Observer pendant 24h** au minimum :
   - Compter le ratio `VERIFIED` / total.
   - Si < 99%, identifier les flows ratés (utilisateur sur ancienne version de l'app ? device incompatible ?).
   - **Tant que ratio < 99%, NE PAS flipper enforce** sinon les utilisateurs concernés sont bloqués.

### Étape 4 — Flip APPCHECK_ENFORCE=true (15 min, après validation)

```bash
firebase functions:secrets:set APPCHECK_ENFORCE  # entrer "true"
# OU via env var de runtime (préféré) — à confirmer selon votre setup
```

Puis redéployer **toutes** les CFs concernées (toutes celles wrappées par `withAppCheck`) :

```bash
firebase deploy --only functions --force
```

**Monitor en continu pendant 24h** :
- Logs `[AppCheck] xxx: UNVERIFIED` doivent **disparaître** (sinon les enforce les rejette en 401 avant le log).
- Compter les **HttpsError code 16 (UNAUTHENTICATED)** dans les logs des CFs.
- Si > 0.1% des appels rejetés → **revert immédiat** : `firebase functions:secrets:set APPCHECK_ENFORCE` → "false" puis redeploy.

### Étape 5 — Cleanup post-flip (15 min)

Une fois enforce stable depuis 7 jours :
- Retirer les debug tokens des builds prod (garder seulement preview/dev).
- Supprimer les debug tokens obsolètes dans Firebase Console.
- Marquer ce chantier 🟢 dans `docs/redteam-app/README.md`.

## Risque résiduel pendant le chantier

Tant que `APPCHECK_ENFORCE=false`, toutes les défenses serveur (Lots 1-3 voice + 0.2 à 0.6 ci-dessous) sont **bypassables via curl** :
- Quota voice contournable
- Optimistic lock contournable (un attaquant CSRF-like authentifié peut spammer)
- Bornes serveur contournables côté `validateAndCreateEvent` ...

**Mitigation partielle :** l'attaquant doit quand même être **authentifié** (Firebase Auth) pour appeler les CFs. Un attaquant non-utilisateur ne peut rien. Un utilisateur malveillant peut spam au-delà des quotas.

## Décision produit nécessaire

- Acceptable de garder ce chantier ouvert tant qu'on n'a pas un cas réel d'abus ?
- Ou priorité immédiate dès qu'un dev backend/mobile peut s'y consacrer ?
