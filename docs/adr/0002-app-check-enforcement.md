# ADR 0002 — Imposer App Check : critères, étapes, retour arrière

- Statut : proposé, en attente de validation (Yoss). Aucune bascule faite.
- Date : 2026-11-07
- Sprint : S13.6 (audit 2026-11, action S4 du suivi)
- Remplace : la date cible du suivi S4 (2026-11-30, critère « 1.0.6 majoritaire »),
  trop tôt : la 1.0.9 est sortie le 2026-11-06 et l'attestation native n'a pas
  été vérifiée version par version.

## Contexte

**Côté app.** `config/appCheck.ts` initialise App Check :
- iOS et Android : `@react-native-firebase/app-check` (App Attest / Play
  Integrity), chargé seulement si `GoogleService-Info.plist` **et**
  `google-services.json` sont présents au moment du build (`app.config.js`,
  `extra.appCheck.nativeConfigured`) ;
- web : reCAPTCHA v3 (`EXPO_PUBLIC_FIREBASE_APPCHECK_WEB_SITE_KEY`) ;
- développement : attestation native désactivée sauf
  `EXPO_PUBLIC_FIREBASE_APPCHECK_NATIVE_DEV_ENABLED=true`.

**Côté fonctions** (`functions/src/shared/appCheck.js`) :
- `withAppCheck(options)` ajoute `enforceAppCheck: true` seulement si la variable
  `APPCHECK_ENFORCE=true` est présente au déploiement (fonctions v2, lecture de
  `process.env`) ;
- `monitorAppCheck(request, nom)` journalise `[AppCheck] <fonction>: VERIFIED` ou
  `UNVERIFIED` pour chaque appel ; la ligne `UNVERIFIED` indique aussi
  `enforcement=true|false`. C'est la seule
  mesure disponible aujourd'hui ; `scripts/auditAppCheck.sh` la lit dans
  Cloud Logging (seuil : moins de 0,5 % UNVERIFIED par fonction).

**Hors champ.** `revenueCatWebhook` est un `onRequest` protégé par son secret
Bearer : App Check ne s'applique pas à ce type de déclencheur.

**Règles.** Aucune règle Firestore ni Storage n'exige aujourd'hui App Check
(`request.app` absent de `firestore.rules` et `storage.rules`).

**Limite de la mesure.** Le journal `monitorAppCheck` ne contient pas la version de
l'app. Les logs disent combien de requêtes sont non attestées, pas quelles versions
le sont. Il faut donc croiser avec l'adoption des versions.

**Versions en circulation (à la date de l'ADR).**
- 1.0.6 en ligne sur les deux stores depuis le 2026-11-02 ; `minVersion` = 1.0.6
  depuis le même jour (mise à jour forcée pour les versions antérieures) ;
- 1.0.6 à 1.0.9 : Android construit en local (`.aab`, ADR 0001), iOS construit sur
  EAS depuis le Mac. Les deux partent du Mac, où les fichiers Firebase sont présents ;
- 1.0.9 (`app.json`, build iOS 31, versionCode 12) : sortie le 2026-11-06.
- Hypothèse à confirmer, pas encore vérifiée : les builds 1.0.6 et suivants sont
  attestés nativement. Les builds lancés depuis GitHub Actions n'ont pas les fichiers
  Firebase (cf. ADR 0001) et ne le seraient donc pas.

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
- confirmer sur un appareil réel, avec un build 1.0.6 : une requête Cloud Functions
  affiche `[AppCheck] … VERIFIED` (et non `UNVERIFIED`) ;
- ajouter le drapeau au journal de connexion : `deviceInfo.appCheck` =
  `Constants.expoConfig.extra.appCheck.nativeConfigured`, dans
  `updateLastLogin`. Petite modification de l'app, pour la prochaine version (1.0.10).
  Sans elle, le critère « part des utilisateurs sur une version attestée » reste une
  estimation.

## Critères d'activation

**Fonctions appelables (`onCall` avec `withAppCheck`)**, tous les critères réunis :

- C1. La première version attestée (V_a) est confirmée sur un appareil (prérequis
  ci-dessus).
- C2. `minVersion` dans `app_config/latest_version` est au moins égal à V_a. Les
  versions non attestées sont alors bloquées par l'écran de mise à jour forcée
  (`services/appUpdateService.ts`). Alternative si la mise à jour forcée est jugée
  trop brutale : au moins 95 % des utilisateurs actifs des 30 derniers jours sur une
  version ≥ V_a (sources 1 ou 2).
- C3. `./scripts/auditAppCheck.sh 7d` affiche `STATUS: READY`.
- C4. Aucune hausse d'erreurs `unauthenticated` dans Sentry sur les 48 heures
  précédentes.

**Firestore et Storage** (une décision séparée, plus tard) : tous les critères
ci-dessus, plus 100 % des utilisateurs actifs sur une version ≥ V_a pendant 14 jours
(source 1 ou 2). Ces règles s'appliquent à tous les clients, y compris les anciennes
versions : une bascule trop tôt coupe l'accès aux données. Vérifier aussi qu'aucun
client web (site, `expo start --web`) n'accède à Firestore ou Storage.

Les Cloud Functions utilisent le SDK Admin, qui ne passe pas par App Check : les
écritures serveur ne sont pas touchées.

## Étapes (fonctions appelables)

1. Activer le prérequis (confirmation V_a, drapeau `deviceInfo.appCheck`) et attendre
   que les critères C1 à C4 soient réunis. Date de revue prévue : 2026-12-07.
2. Audit : `./scripts/auditAppCheck.sh 7d` doit afficher `READY`.
3. Bascule partielle sur 2 à 3 fonctions à fort impact (coût ou abus) :
   `APPCHECK_ENFORCE=true` dans l'environnement de la fonction (`functions/.env.<projet>`),
   puis déploiement de ces fonctions seulement.
4. Surveillance 48 heures : Sentry (`unauthenticated`), Cloud Logging
   (`UNVERIFIED` par fonction).
5. Extension à toutes les `onCall` (déploiement complet par la CI
   `deploy-functions.yml`).
6. Audit à J+7 : toutes les fonctions à 100 % `VERIFIED` sur les clients récents.
7. Firestore puis Storage : console Firebase → App Check, dans un second temps et
   après un nouveau point de décision. Surveiller les métriques App Check avant de
   passer en application.

## Retour arrière

**Fonctions appelables** (procédure à vérifier avant la première bascule) :
1. retirer `APPCHECK_ENFORCE=true` (ou le mettre à `false`) dans
   `functions/.env.<projet>` ;
2. redéployer les fonctions concernées (`firebase deploy --only functions:<noms>`, ou
   la CI `deploy-functions.yml` depuis `main`).

Durée : celle du déploiement, quelques minutes. Ne pas utiliser
`firebase functions:config:unset appcheck.enforce` : c'est la configuration v1, sans
effet sur les fonctions v2. Cette commande figure encore dans
`docs/FIREBASE_MONITORING.md` §8 et doit être corrigée (voir Conséquences).

**Firestore / Storage** : repasser en non appliqué dans la console Firebase. L'effet
est attendu en quelques minutes (à vérifier lors d'un essai hors production).

**Client** : une attestation native en échec sur une nouvelle version relève de la
mise à jour forcée ou d'un correctif de build, pas d'un retour arrière serveur.

## Conséquences

- Aucune bascule avant la revue du 2026-12-07 et les prérequis ci-dessus.
- Correction nécessaire dans `docs/FIREBASE_MONITORING.md` §8 :
  - la commande de retour arrière (`functions:config:unset`) est fausse pour les
    fonctions v2 ;
  - `revenueCatWebhook` ne doit pas figurer dans la liste des fonctions à passer en
    `APPCHECK_ENFORCE`.
- Le suivi S4 (`docs/SUIVI_ACTIONS.md`, ligne 61) doit reprendre cette date et ces
  critères.
- La procédure opérationnelle est reprise dans `docs/RUNBOOK.md`.

## Actions

- [ ] Yoss : valider le principe et la revue du 2026-12-07.
- [ ] Vérifier sur un appareil 1.0.6 que les appels sont `VERIFIED` (V_a).
- [ ] Ajouter `deviceInfo.appCheck` à `updateLastLogin` dans la prochaine version.
- [ ] Corriger `docs/FIREBASE_MONITORING.md` §8.
- [ ] Ajouter une requête d'agrégation des versions (Firestore) à la procédure.
