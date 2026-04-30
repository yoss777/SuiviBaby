# Sprint 1 — Sécurité critique

> **Durée cible :** 1 semaine (5 j ouvrés)
> **Branche :** `sprint1/securite-critique`
> **Préreq :** App en production v1.0.3, audit du 2026-04-27 validé

## Objectif

Fermer les **5 trous de sécurité critiques/hauts** détectés dans l'audit, avant tout autre travail. Aucun de ces points ne doit rester ouvert avant la prochaine soumission stores.

## Vue d'ensemble des tâches

| # | Tâche | Sévérité | Effort | Fichiers principaux |
|---|-------|----------|--------|---------------------|
| 1 | Activer App Check enforcement | CRITIQUE | 0,5 j + 7 j monitoring | `functions/index.js:17,80` |
| 2 | Ownership check sur `resolveReport` | CRITIQUE | 0,5 j | `functions/index.js:894-1015` |
| 3 | Queue de modération photo (remplacer auto-hide) | CRITIQUE | 1,5 j | `functions/index.js:759-890`, nouvelles règles |
| 4 | Soft-delete user account (fenêtre 30j) | CRITIQUE | 1,5 j | `functions/index.js:1505-1615`, nouvel écran |
| 5 | Nonce Apple — `crypto.getRandomValues()` | HAUTE | 1 h | `services/socialAuthService.ts:159-170` |
| 6 | Biometric — passer aux refresh tokens | HAUTE | 1 j | `services/biometricAuthService.ts` (refonte complète) |
| 7 | Signed URLs pour photos Storage | MOYENNE | 0,5 j | `utils/photoStorage.ts`, nouvelle CF |

Sous-total **~5,5 j** de dev + monitoring App Check en parallèle.

---

## Tâche 1 — Activer App Check enforcement

### Problème
`functions/index.js:17` lit `APPCHECK_ENFORCE` depuis l'env. Aujourd'hui = `false` en prod → toutes les CFs acceptent les requêtes sans token App Check. Bots peuvent abuser de `transcribeAudio` (coût AssemblyAI), `deleteEventCascade`, `createShareInvitation`.

### Préreq
- Vérifier dans GCP Logs Explorer que **100 % des appels CFs** sur les 7 derniers jours ont `App Check status = VERIFIED` (chercher `[AppCheck]` warnings dans les logs — doit être ~0).
- Tous les builds en prod (iOS + Android, ≥ 1.0.3) ont la config native App Check active. Vérifier via `config/appCheck.ts` + EAS build profile.

### Étapes
1. Lancer un export des logs des 7 derniers jours :
   ```bash
   gcloud logging read 'resource.type="cloud_function" AND textPayload:"AppCheck"' \
     --project=samaye-53723 --freshness=7d --limit=1000 --format=json > /tmp/appcheck-audit.json
   ```
2. Compter les `UNVERIFIED` par fonction. Seuil OK = **< 0,5 %** par CF sur 7 j.
3. Si OK : `firebase functions:config:set appcheck.enforce=true` puis redéployer **uniquement** les CFs critiques d'abord (`transcribeAudio`, `revenueCatWebhook`, `consumeUsageQuota`, `createShareInvitation`).
4. Monitor 24 h Sentry + Cloud Logs : aucun pic d'`unauthenticated` errors côté client.
5. Si OK 24 h : étendre à toutes les autres CFs (`firebase deploy --only functions`).
6. Documenter la rollback (`appcheck.enforce=false` + redeploy) dans `docs/FIREBASE_MONITORING.md`.

### Tests
- Sur un build dev sans App Check token → `transcribeAudio` doit retourner `failed-precondition`.
- Sur le build de prod → succès normal.

### Definition of Done
- [ ] Audit logs 7 j : 0 `UNVERIFIED` non-attendus sur CFs critiques
- [ ] `APPCHECK_ENFORCE=true` déployé et confirmé via `firebase functions:config:get`
- [ ] 48 h post-deploy sans pic d'erreurs côté client (Sentry)
- [ ] `docs/FIREBASE_MONITORING.md` mis à jour avec procédure rollback

### Risque & rollback
- **Risque :** un client legacy (< 1.0.3) sans App Check natif sera bloqué. Mitigation : forcer update banner avant activation.
- **Rollback :** `appcheck.enforce=false` + `firebase deploy --only functions` (5 min).

---

## Tâche 2 — Ownership check sur `resolveReport`

### Problème
`functions/index.js:894-1015` — la CF vérifie le custom claim `admin` (L:908) mais **pas** que cet admin a accès à l'enfant concerné par le report. Un admin rogue peut supprimer une photo de n'importe quel enfant via `reportId`.

### Patch
Ajouter une vérification `hasRequiredChildAccess` après la lecture du report (après L:924) :

```js
// L:924 après `const reportData = reportSnap.data();`
if (!reportData.childId) {
  throw new HttpsError("failed-precondition", "Report sans childId.");
}
const accessSnap = await db
  .doc(`children/${reportData.childId}/access/${uid}`)
  .get();
const isChildOwnerOrAdmin =
  accessSnap.exists && ["owner", "admin"].includes(accessSnap.data()?.role);
if (!isChildOwnerOrAdmin) {
  throw new HttpsError(
    "permission-denied",
    "Vous n'avez pas accès à cet enfant.",
  );
}
```

### Étapes
1. Lire `functions/index.js:894-1015` complet.
2. Insérer le check ci-dessus après L:924.
3. Mettre à jour le test `functions/__tests__/cloudFunctions.test.js` (cas : admin sans accès enfant → `permission-denied`).
4. Idem pour `onReportCreated` (L:759-890) — ajouter check côté trigger pour ne pas auto-hide si reporter sans accès enfant (mais reporter accès est déjà vérifié par les rules `firestore.rules:238` au create — vérifier).

### Tests
- Cas 1 : admin global, accès owner sur child → action exécutée ✅
- Cas 2 : admin global, **aucun** accès sur child → `permission-denied` ❌
- Cas 3 : non-admin → `permission-denied` (déjà couvert)

### Definition of Done
- [ ] Patch appliqué et déployé
- [ ] Tests Jest couvrant les 3 cas verts
- [ ] Logs admin actions auditables (uid + childId + action)

---

## Tâche 3 — Queue de modération photo

### Problème
`functions/index.js:840-848` — si `reason === "intimate_child_nudity"` au moment du report, l'event est **immédiatement** marqué `reported: true` (donc caché globalement) sans aucune révision humaine. Un parent malveillant peut signaler à tort la photo de change d'un coparent → photo cachée pour tout le monde sans recours rapide.

### Stratégie
Remplacer l'auto-hide global par un workflow à 2 niveaux :
1. **Hide-for-reporter** (déjà en place L:828-837) — instantané, sans impact pour les autres.
2. **Hide-for-all** = **uniquement** si :
   - Soit le reporter est `owner` de l'enfant, soit
   - Le report est confirmé par 2 utilisateurs distincts ayant accès à l'enfant, soit
   - Modération admin via `resolveReport`.

### Étapes
1. **Supprimer** l'auto-hide L:840-848.
2. Ajouter dans `onReportCreated` une nouvelle logique :
   - Récupérer le rôle du reporter via `children/{childId}/access/{reporterUid}`.
   - Si rôle = `owner` ET `reason === "intimate_child_nudity"` → marquer `reported: true` + log.
   - Sinon : créer/incrémenter un compteur `reports/_counters/{eventId}` (sous-collection technique). Si count ≥ 2 distincts → marquer `reported: true`.
3. Ajouter dans `firestore.rules` règles pour la nouvelle structure de compteur (read = ops only, write = CF only).
4. Ajouter un script ops `scripts/listPendingReports.js` (CLI) qui liste les reports `status=pending` avec context.
5. Documenter le workflow dans `docs/PHOTO_MODERATION_IMPLEMENTATION_PLAN.md` (nouvelle section "v2 — modération graduée").

### Tests
- Reporter = viewer + reason intime → event **non** marqué reported, hide-for-me OK
- Reporter = owner + reason intime → event marqué reported immédiatement
- 2 viewers distincts signalent même event → marqué reported

### Definition of Done
- [ ] Auto-hide systématique supprimé
- [ ] Nouvelle logique en place + tests
- [ ] Doc mise à jour
- [ ] Email ops envoyé pour 100 % des reports (déjà en place L:817-823 — vérifier)

### Risque
- **Risque :** un vrai cas de nudité légitimement signalé reste visible le temps de la modération admin. Mitigation : SLA ops 24 h max, alerting sur backlog reports > 10.

---

## Tâche 4 — Soft-delete user account (fenêtre 30 j)

### Problème
`functions/index.js:1505-1615` — `deleteUserAccount` exécute `admin.auth().deleteUser(uid)` (L:1606) sans fenêtre de récupération. RGPD permet la suppression mais l'UX rend une suppression accidentelle irréversible.

### Stratégie
Calquer sur le workflow enfant existant (`softDeleteChild` L:2752-2820) :
1. **Phase 1 (immediate)** : marquer le compte `deletionScheduledAt: now() + 30j`, désactiver Auth (`disabled: true`), envoyer email avec lien d'annulation.
2. **Phase 2 (cron J+30)** : une CF planifiée parcourt `users` avec `deletionScheduledAt < now()` et exécute la suppression définitive (logique actuelle).
3. **UI** : si user se reconnecte pendant les 30 j (impossible si Auth disabled — donc via un endpoint dédié `cancelAccountDeletion` non-auth qui prend un token signé).

### Étapes
1. Refactorer `deleteUserAccount` (L:1505-1615) pour faire **uniquement** :
   - Set `users/{uid}.deletionScheduledAt = now + 30 days`
   - Set `users/{uid}.deletionRequestedBy = uid`
   - `admin.auth().updateUser(uid, { disabled: true })`
   - Envoyer email avec lien `https://samaye-53723.web.app/cancel-deletion?token=<signed>`
2. Créer une nouvelle CF `cancelAccountDeletion` (`onRequest`, public, validation token JWT signé avec `ACCOUNT_DELETION_SECRET`) qui :
   - Vérifie le token (uid + exp)
   - Réactive l'auth, supprime `deletionScheduledAt`, redirige vers une page de confirmation
3. Créer une CF planifiée `purgeDeletedAccounts` (cron quotidien) qui exécute la logique actuelle de `deleteUserAccount` pour tous les uids dont `deletionScheduledAt < now`.
4. Ajouter un écran `app/(auth)/pending-deletion.tsx` (déjà existant — vérifier qu'il affiche la date de suppression effective et le bouton "Annuler la suppression").
5. Mettre à jour `accountDeletionService.ts` côté client.

### Tests
- Création request → user disabled, email envoyé, doc Firestore correct
- Click cancel link valid → user réactivé
- Click cancel link expiré → erreur 410
- Cron J+30 → données effectivement supprimées (réutiliser tests existants de `deleteUserAccount`)

### Definition of Done
- [ ] CF refactorée, déployée
- [ ] CF cron planifiée tournant tous les jours à 03:00 UTC
- [ ] Email transactionnel template testé (Resend)
- [ ] Écran `pending-deletion.tsx` opérationnel
- [ ] Doc `docs/ACCOUNT_DELETION_WORKFLOW.md` créée

### Risque
- **Risque RGPD :** délai 30 j doit être documenté dans la privacy policy. Mettre à jour `public/privacy.html` section "Droit à l'oubli".

---

## Tâche 5 — Nonce Apple cryptographique

### Problème
`services/socialAuthService.ts:163-166` utilise `Math.random()` pour générer le nonce Apple Sign-In. Non cryptographiquement sûr, prédictible, exploitable pour rejeu.

### Patch
```ts
// Remplacer L:159-170
import * as Crypto from "expo-crypto";

function generateNonce(length: number): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  const bytes = Crypto.getRandomBytes(length);
  let result = "";
  for (let i = 0; i < length; i++) {
    result += chars[bytes[i] % chars.length];
  }
  return result;
}
```

`expo-crypto` est déjà en deps (`package.json`) et déjà importé dans le fichier (L:27). Aucun préreq.

### Étapes
1. Appliquer le patch.
2. Tester un Sign-In Apple bout en bout (build local iOS).
3. Supprimer le commentaire trompeur "Math.random fallback".

### Definition of Done
- [ ] Patch appliqué
- [ ] Test manuel Apple Sign-In OK
- [ ] Aucun appel à `Math.random` restant dans `services/` (`grep -rn "Math.random" services/`)

---

## Tâche 6 — Biometric : passer aux refresh tokens

### Problème
`services/biometricAuthService.ts:14-15,68-93` stocke `email` + `password` en clair dans SecureStore. Sur device jailbreaké/rooté, ces credentials sont récupérables. Si l'utilisateur a réutilisé son mot de passe ailleurs → compromission croisée.

### Stratégie
Ne **plus jamais** stocker de password. Utiliser le pattern "biometric unlocks a refresh token" :
1. Au premier login, après succès Firebase, récupérer le refresh token Firebase (`user.stsTokenManager.refreshToken` ou via `user.getIdTokenResult()` → en réalité Firebase JS SDK gère la persistance via `setPersistence` + AsyncStorage).
2. Stocker un **flag** `biometric_enabled = true` + **opaque marker** (UUID lié au user) en SecureStore — pas de credentials.
3. Au déverrouillage biométrique : ne **rien** signer côté Firebase, juste vérifier que `auth.currentUser` existe et que le marker correspond. Si oui, l'utilisateur reste connecté (la session Firebase persiste déjà).

### Étapes
1. Lire `services/biometricAuthService.ts` complet.
2. Refonte API :
   - `enableBiometric(userId: string)` — stocke uniquement `userId` + flag, jamais de password
   - `getBiometricUserId(): string | null` — retourne le uid attendu, sans secrets
   - `disableBiometric()` — supprime tout
3. Mettre à jour les callers (probablement `app/(auth)/login.tsx`, settings/security).
4. Migration : au premier launch après déploiement, supprimer **tous** les anciens entries `samaye_bio_password` et `samaye_bio_email` via `SecureStore.deleteItemAsync`. Ajouter un flag `biometric_migrated_v2 = true` pour ne le faire qu'une fois.
5. Tester :
   - Activation biométrique sur device de test
   - Désactivation
   - Mauvaise empreinte → fallback password classique
   - Migration depuis ancienne version (vérifier que les anciens secrets sont bien purgés)

### Definition of Done
- [ ] Aucun appel `SecureStore.setItemAsync(BIOMETRIC_PASSWORD_KEY, ...)` restant
- [ ] Migration purgeant les anciens secrets
- [ ] Tests manuels iOS + Android verts
- [ ] Constantes renommées (`samaye_bio_*` → `suivibaby_bio_*` v2)

---

## Tâche 7 — Signed URLs pour photos Storage

### Problème
`utils/photoStorage.ts` retourne probablement des URLs `?alt=media` non signées. Si l'ID du fichier est devinable (chemin `children/{childId}/photos/{eventId}-{ts}.jpg`), une enumération est théoriquement possible. Storage rules limitent l'accès par auth, mais les URLs publiques contournent partiellement ce contrôle si jamais elles fuient.

### Stratégie
Générer des signed URLs côté CF (TTL 1 h) au lieu d'URLs directes Storage.

### Étapes
1. Créer une CF `getPhotoSignedUrl({ photoPath })` :
   - Vérifier que `request.auth.uid` a accès au child correspondant (parser le path `children/{childId}/...`)
   - Générer signed URL : `bucket.file(photoPath).getSignedUrl({ action: "read", expires: Date.now() + 3600 * 1000 })`
   - Retourner `{ url, expiresAt }`
2. Côté client : `utils/photoStorage.ts` expose `getSignedPhotoUrl(path)` qui appelle la CF + cache local 50 min.
3. Refactorer `components/PhotoImage.tsx` pour passer par cette résolution avant le `<ExpoImage source={{ uri }}>`.
4. Migration progressive : feature flag `USE_SIGNED_URLS` (default true) pour pouvoir rollback sans redeploy.

### Tests
- URL signée valide → image affichée
- URL expirée → re-signature transparente
- User sans accès child → CF retourne `permission-denied`

### Definition of Done
- [ ] CF `getPhotoSignedUrl` déployée
- [ ] `PhotoImage` migré, cache 50 min en place
- [ ] Tests E2E : photo ouverte > 1 h après chargement initial → still works
- [ ] Storage rules durcies : `allow read: if false;` côté client direct (forcer le passage par CF)

### Risque
- **Risque coût :** chaque ouverture de galerie = N appels CF. Mitigation : batch endpoint `getPhotoSignedUrls(paths[])` + cache agressif.

---

## Tests transverses Sprint 1

À ajouter dans `__tests__/` ou `functions/__tests__/` :

| Test | Fichier |
|------|---------|
| `appCheckEnforcement.test.js` — bot sans token bloqué | `functions/__tests__/` |
| `resolveReport.ownership.test.js` — admin sans accès child rejeté | `functions/__tests__/` |
| `photoModeration.workflow.test.js` — auto-hide ne se déclenche que pour owner | `functions/__tests__/` |
| `softDeleteUser.test.js` — workflow complet incl. cancel | `functions/__tests__/` |
| `nonce.test.ts` — `generateNonce` produit des bytes via `expo-crypto` | `__tests__/` |
| `biometric.migration.test.ts` — anciens secrets purgés au premier launch | `__tests__/` |
| `signedUrl.test.js` — CF rejette user sans accès | `functions/__tests__/` |

## Definition of Done globale Sprint 1

- [ ] Toutes les 7 tâches mergées dans `sprint1/securite-critique`
- [ ] CI verte (`npm test && npm run test:functions`)
- [ ] Privacy policy mise à jour (point #4)
- [ ] `docs/FIREBASE_MONITORING.md` mis à jour (point #1)
- [ ] PR review par 1 dev + 1 ops
- [ ] Déploiement progressif : staging 24 h, puis prod
- [ ] Bump version `1.1.0` (changement majeur sécurité)
- [ ] Release notes claires sur soft-delete + biometric (impact user)

## Risques globaux

- **Communication user** : changement biometric et soft-delete impactent l'UX → préparer un email + in-app message avant déploiement.
- **Compatibilité legacy clients** : App Check enforcement bloque les builds < 1.0.3 → forcer update banner avant.
- **Backlog ops** : nouveau workflow modération crée du travail manuel → définir SLA + alerting Slack.
