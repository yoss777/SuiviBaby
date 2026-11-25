# ADR 0002 — Imposer App Check : critères, étapes, retour arrière

- Statut : accepté par Yoss le 2026-11-22. Aucune bascule faite.
- Date : 2026-11-07
- Sprint : S13.6 (audit 2026-11, action S4 du suivi)
- Remplace : la date cible du suivi S4 (2026-11-30, critère « 1.0.6 majoritaire »),
  trop tôt : la 1.0.9 est sortie le 2026-11-06 et l'attestation native n'a pas
  été vérifiée version par version.

## Mise à jour du 2026-11-22

Mesure en production : **aucun appel iOS n'était attesté** (210 sur 210 sans preuve
depuis le 7/11, tous builds). Trois manques se cumulaient :
- le Team ID dans l'app Firebase (renseigné le 22/11) ;
- le droit App Attest (ajouté dans la 1.0.26) ;
- **la cause qui bloquait tout :** `app.config.js` exigeait les fichiers Firebase des
  deux plateformes, alors que le runner iOS n'a que le sien. App Check natif était donc
  désactivé dans ces builds (Sentry SUIVIBABY-Q, build 59 ; preuve `MISSING` dans
  `callable-request-verification`). Corrigé dans la 1.0.27.

V_a est propre à chaque plateforme. La 1.0.27 est `VERIFIED` sur iPhone (TestFlight) et
sur le Samsung (Alpha) depuis le 22/11. Sur 9 anciens échecs Android, 3 tombent dans les fenêtres de test de Google et 6
restent inexpliqués. Les refus Play Integrity observés suivent les envois sur Google Play
(110 sur 110 dans les 4 heures) et viennent au moins en partie d'émulateurs et d'appareils
de test (SUIVIBABY-P).

La 1.0.26 remonte dans Sentry chaque cause distincte d'échec d'attestation
(`service: appCheck`), au plus 5 par opération et par lancement, hors téléphone sans
connexion. Elle remplace le drapeau `deviceInfo.appCheck` prévu plus bas, qui n'aurait
indiqué que la présence des fichiers Firebase, pas l'obtention d'un jeton.

**Décision de Yoss (2026-11-22) :** imposer App Check sur **toutes les fonctions sauf
`revokeDeviceToken`, `resolveReport` et `setAdminClaim`**, sans Firestore ni Storage, dès la première version attestée, sans attendre 95 % d'adoption. Elle
remplace le plan par lots et les critères C2 et C3 ci-dessous. Conséquence acceptée : les
versions antérieures ne pourront plus appeler ces fonctions, et une saisie refusée en ligne
y sera perdue. Cela vaut aussi pour le retrait du consentement et la suppression de compte
dans l'app (la suppression garde un repli par e-mail, `public/delete-account.html`).

App Check est un **anti-abus**, pas une authentification : au seuil Play Integrity
`NO_INTEGRITY`, il écarte les scripts et les clients hors app, pas une app modifiée sur un
appareil compromis. L'autorisation reste portée par Firebase Auth et les règles.

**Check-list avant le « go » de Yoss :**
- [x] tous les appareils en 1.0.27 : l'app n'est pas publique (App Store non publié, Google
  Play en tests fermés), confirmé par Yoss le 22/11. Si elle sort, ce sera avec une version
  attestée ;
- [x] appel `VERIFIED` côté serveur sur iPhone (TestFlight) et Samsung (Alpha) en 1.0.27 ;
- [x] 48 heures sans cause nouvelle ou répétée dans Sentry (`service: appCheck`) ni hausse de
  `unauthenticated` (C4), du 2026-11-22 12:45 UTC au 2026-11-24 12:45 UTC. Sont classés à part
  les appareils de test dans les 4 heures suivant un envoi Play et le Maestro nocturne.
  Bilan du 2026-11-24 : 105 appels sur 105 `VALID` (99 Android, 6 iOS), aucun `MISSING` ni
  `INVALID`, aucune réponse HTTP ≥ 400 ; échanges App Attest (11) et Play Integrity (28) tous
  acceptés ; aucun appel aux fonctions exclues. Sentry : 0 `unauthenticated` (0 aussi les
  48 heures précédentes), 2 `appCheck/token-error` le 22/11 à 20:06 UTC sur un Samsung sans
  réseau (« connection abort », hôte introuvable), pas un refus d'attestation ;
- [x] suivi des refus en place : `node scripts/appCheckRefusals.mjs 2h` (ou `24h`, `7d`) lit
  `callable-request-verification`, `verifications.app` à `MISSING` ou `INVALID`, **niveau
  DEBUG inclus**, le croise par trace avec la requête HTTP (code 401, agent HTTP, donc
  plateforme), hors fonctions exclues. Sortie 1 dès qu'un appel n'est pas vérifié, 2 si la
  lecture est vide ou tronquée. `auditAppCheck.sh` ne voit plus les refus après la bascule ;
- [x] `revokeDeviceToken` exclue : sans preuve, un téléphone déconnecté hors ligne garderait
  les rappels de l'ancien compte. Elle reste protégée par le jeton Expo et ses limites ;
- [x] `resolveReport` et `setAdminClaim` exclues : actions d'administration sans écran dans
  l'app, avec compte administrateur vérifié et débit limité. `scripts/resolveReport.mjs`
  est à vérifier : son jeton n'est sans doute pas un jeton d'utilisateur Firebase ;
- [x] Maestro nocturne suspendu le 2026-11-24 (déclenchement manuel conservé) : son émulateur
  sans Play Store sera refusé. Il échouait déjà au téléchargement du build EAS et n'a appelé
  aucune fonction pendant les 48 heures ;
- [x] examen des stores : les appareils d'examen non attestés pourront se connecter mais leurs
  appels de fonctions seront refusés. Aucune soumission publique n'est prévue : décision de
  Yoss du 2026-11-25, c'est une **condition à vérifier avant la première soumission** (App
  Store ou production Google Play), pas un blocage de l'activation ;
- [x] jetons de débogage : vérifiés le 2026-11-25 par l'API App Check (`debugTokens`), aucun
  jeton sur les 9 apps du projet, donc rien à révoquer. Un build de développement contre la
  production demandera d'en créer un, à révoquer ensuite ;
- [x] répétition en production sur `parseVoiceCommand` seule (`APPCHECK_ENFORCE_FUNCTIONS`),
  car staging n'existe pas : appel réel sur iPhone et Samsung, puis retour arrière chronométré.
  Cette fonction retombe sur l'analyse par règles en cas de refus. Faite le 2026-11-24
  (PR #137, déployée à 20:50 UTC) : iPhone à 21:17 et Samsung à 21:18, réponse 200 avec
  `verifications.app` à `VALID` et analyse par l'IA. Retour arrière local en 2 min 58 s
  (fonction libérée 1 min 57 s après le début), retrait committé sur `main` (2d8237b) ;
- [ ] aucune CI en cours, PR dédiée ne contenant que l'activation.

## Contexte

**Côté app.** `config/appCheck.ts` initialise App Check :
- iOS et Android : `@react-native-firebase/app-check` (App Attest / Play
  Integrity), chargé seulement si le fichier Firebase de la plateforme est présent au
  moment du build (`app.config.js`, `extra.appCheck.nativeConfiguredIos` et
  `nativeConfiguredAndroid`) ;
- web : reCAPTCHA v3 (`EXPO_PUBLIC_FIREBASE_APPCHECK_WEB_SITE_KEY`) ;
- développement : attestation native désactivée sauf
  `EXPO_PUBLIC_FIREBASE_APPCHECK_NATIVE_DEV_ENABLED=true`.

**Côté fonctions** (`functions/src/shared/appCheck.js`) :
- `withAppCheck(options, nom)` (nom = nom d'export déployé, ex. `transcribeAudio`)
  ajoute `enforceAppCheck: true` si, au chargement de l'instance (fonctions v2,
  lecture de `process.env`), `APPCHECK_ENFORCE=true` (toutes les fonctions, sauf les trois exceptions) ou si `nom` figure
  dans `APPCHECK_ENFORCE_FUNCTIONS` (liste séparée par des virgules, ex.
  `transcribeAudio,parseVoiceCommand`). Sans variable : surveillance seule ;
- `monitorAppCheck(request, nom)` journalise `[AppCheck] <fonction>: VERIFIED` ou
  `UNVERIFIED` pour chaque appel ; la ligne `UNVERIFIED` indique aussi
  `enforcement=true|false`. C'est la seule
  mesure disponible aujourd'hui ; `scripts/auditAppCheck.sh` la lit dans
  Cloud Logging, à titre indicatif.

**Hors champ.** `revenueCatWebhook` (protégé par son secret Bearer) et `unsubscribeRecap` sont
des `onRequest` : App Check ne s'applique pas à ce type de déclencheur.

**Règles.** Aucune règle Firestore ni Storage n'exige aujourd'hui App Check
(`request.app` absent de `firestore.rules` et `storage.rules`).

**Limite de la mesure.** Le journal `monitorAppCheck` ne contient pas la version de
l'app. Les logs disent combien de requêtes sont non attestées, pas quelles versions
le sont. Il faut donc croiser avec l'adoption des versions.

**Versions en circulation (à la date de l'ADR).**
- 1.0.6 en ligne sur les deux stores depuis le 2026-11-02 ; `minVersion` = 1.0.6
  depuis le même jour (bandeau de mise à jour pour les versions antérieures) ;
- 1.0.6 à 1.0.9 : Android construit en local (`.aab`, ADR 0001), iOS construit sur
  EAS depuis le Mac. Les deux partent du Mac, où les fichiers Firebase sont présents ;
- 1.0.9 (`app.json`, build iOS 31, versionCode 12) : sortie le 2026-11-06.
- Hypothèse d'origine, réfutée pour iOS le 2026-11-22 : les builds 1.0.6 et suivants
  seraient attestés nativement. La présence des fichiers Firebase ne suffit pas.

## Mesurer l'adoption (critère de décision)

Sources, par ordre de préférence :

1. **Sentry Release Health.** `enableAutoSessionTracking: true` dans
   `app/_layout.tsx` ; la release est posée par le SDK natif (`bundle@version+build`,
   tâche 2.2). Part des sessions par version sur 14 jours : c'est la mesure la plus
   proche de « part des utilisateurs actifs ».
2. **Firestore `users/{uid}`.** `updateLastLogin` (`services/userService.ts`, appelé
   par `contexts/AuthContext.tsx`) écrit `lastLogin` et `deviceInfo.version`. Une
   agrégation sur les comptes dont `lastLogin` est dans les 30 derniers jours donne
   la répartition par version. Limites : une seule version par compte (la dernière
   connexion) et aucune information d'attestation. Le champ s'appelle
   `deviceInfo.version`, pas `lastAppVersion`.
3. **Consoles stores** (Play Console, App Store Connect) : répartition par version,
   à consulter dans chaque console. Pour recoupement seulement.

**Ce qui manque : savoir si une version est attestée.** Deux prérequis, à faire
avant de fixer une date :
- confirmé le 22/11 sur iPhone et Samsung en 1.0.27 : appels `[AppCheck] … VERIFIED` ;
- suivre les échecs d'attestation par version dans Sentry (`service: appCheck`,
  depuis la 1.0.26). Ce suivi remplace le drapeau `deviceInfo.appCheck` d'abord prévu.

## Critères d'activation

**Fonctions appelables (`onCall` avec `withAppCheck`)**. Pour cette activation, la
check-list de la mise à jour du 2026-11-22 remplace C2 et C3 ; C1 et C4 restent exigés.

- C1. La première version attestée (V_a) de chaque plateforme est confirmée sur un
  appareil (prérequis ci-dessus).
- C2 (remplacé par la décision du 2026-11-22, non exigé). Au moins 95 % des utilisateurs actifs des 30 derniers jours sont sur une
  version ≥ V_a de leur plateforme (sources 1 ou 2). Relever `minVersion` ne suffit pas : c'est un
  bandeau commun aux deux plateformes, qui ne bloque pas les anciennes versions
  (`services/appUpdateService.ts`).
- C3 (remplacé par la décision du 2026-11-22, non exigé). Pour les fonctions du lot concerné, moins de 0,5 % d'appels non vérifiés parmi
  les versions ≥ V_a, avec un volume suffisant. `scripts/auditAppCheck.sh` doit d'abord
  être fiabilisé : il ne distingue aujourd'hui ni plateforme ni version.
- C4. Aucune hausse d'erreurs `unauthenticated` dans Sentry sur les 48 heures
  précédentes.

**Firestore et Storage** : hors périmètre de la décision du 2026-11-22, à rouvrir seulement
par Yoss. Pour mémoire : tous les critères
ci-dessus, plus 100 % des utilisateurs actifs sur une version ≥ V_a pendant 14 jours
(source 1 ou 2). Ces règles s'appliquent à tous les clients, y compris les anciennes
versions : une bascule trop tôt coupe l'accès aux données. Vérifier aussi qu'aucun
client web (site, `expo start --web`) n'accède à Firestore ou Storage.

Les Cloud Functions utilisent le SDK Admin, qui ne passe pas par App Check : les
écritures serveur ne sont pas touchées.

## Étapes (fonctions appelables)

1. Remplir la check-list de la mise à jour du 2026-11-22.
2. Sur « go » de Yoss, poser `APPCHECK_ENFORCE=true` dans `functions/.env.<projet>` par une
   PR dédiée (fichier versionné : la CI redéploie toutes les fonctions à chaque push sur
   `main`).
3. Surveillance rapprochée 2 heures, puis 48 heures : Sentry (`unauthenticated`), refus 401
   et `callable-request-verification` (`VALID`, `INVALID`, `MISSING`, niveau DEBUG inclus),
   avec `node scripts/appCheckRefusals.mjs 2h`, puis `48h`.
   Un appel refusé n'atteint pas la fonction et n'écrit donc aucune ligne `UNVERIFIED`.
4. Bilan à J+7 : aucun refus 401 inexpliqué sur les clients récents
   (`node scripts/appCheckRefusals.mjs 7d`), sans s'appuyer sur `auditAppCheck.sh`.

## Retour arrière

**Fonctions appelables** (à répéter avant la bascule) :
1. seuil : échec d'un appel réel sur un appareil témoin (iPhone ou Samsung installés depuis
   TestFlight ou Google Play), hors appareils de test après un envoi Play. Une panne d'Apple ou de Google (attestation
   indisponible) justifie aussi ce retour arrière : sans enforcement, les apps peuvent appeler
   les fonctions sans jeton, sans attendre de mise à jour ;
2. annuler tout run `deploy-functions.yml` en cours, sinon il réimposerait App Check ;
3. depuis une copie propre de `main`, lancer `cd functions && npm ci`, retirer de
   `functions/.env.samaye-53723` la variable posée (`APPCHECK_ENFORCE=true` ou
   `APPCHECK_ENFORCE_FUNCTIONS=…`, celle de la répétition), puis, à la racine,
   `firebase deploy --only functions --project samaye-53723` ;
4. committer aussitôt ce retrait sur `main`, sinon le prochain déploiement réimpose App Check.

Durée mesurée lors de la répétition du 2026-11-24 : 2 min 58 s du début de la procédure à la
fin du déploiement, fonction libérée au bout de 1 min 57 s (dépendances déjà installées dans
une copie propre : prévoir une à deux minutes de plus sinon). Ne pas utiliser
`firebase functions:config:unset appcheck.enforce` : c'est la configuration v1, sans effet
sur les fonctions v2.

**Firestore / Storage** : repasser en non appliqué dans la console Firebase. L'effet
est attendu en quelques minutes (non testé : pas de staging).

**Client** : une attestation en échec sur une version précise se corrige par un build ; si
elle bloque des utilisateurs, appliquer d'abord le retour arrière serveur.

## Conséquences

- L'activation suit la décision du 2026-11-22 : fonctions seules, avec ses conditions.
- Le suivi S4 (`docs/SUIVI_ACTIONS.md`) reprend ces critères.
- La procédure opérationnelle est celle de cet ADR.

## Actions

- [x] Yoss : décision du 2026-11-22, toutes les fonctions sauf trois exceptions, sans Firestore ni Storage.
- [ ] Imposer App Check sur toutes les fonctions après la check-list.
- [x] iPhone et Samsung en 1.0.27 `VERIFIED` (22/11).
- [ ] Expliquer les 6 anciens échecs Android restants grâce à Sentry.
- [x] Garder en file une saisie refusée en `unauthenticated` pour un compte connecté (1.0.26).
- [x] Attendre l'initialisation d'App Check avant le rejeu de la file (1.0.26).
- [ ] Après l'activation : couvrir les suppressions et écritures non optimistes refusées.
- [ ] Journaliser l'état App Check de `ensureReferralCode`, `validateReferralCode` et `sendDeletionRequestEmail`.
- [x] Suivi des échecs d'attestation par version dans Sentry (1.0.26), à la place de `deviceInfo.appCheck`.
- [x] Corriger `docs/FIREBASE_MONITORING.md` §8.
- [ ] Ajouter une requête d'agrégation des versions (Firestore) à la procédure.
