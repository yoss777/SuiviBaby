# ADR 0002 — Imposer App Check : critères, étapes, retour arrière

- Statut : proposé, en attente de validation (Yoss). Aucune bascule faite.
- Date : 2026-11-07
- Sprint : S13.6 (audit 2026-11, action S4 du suivi)
- Remplace : la date cible du suivi S4 (2026-11-30, critère « 1.0.6 majoritaire »),
  trop tôt : la 1.0.9 est sortie le 2026-11-06 et l'attestation native n'a pas
  été vérifiée version par version.

## Mise à jour du 2026-11-22

Mesure en production : **aucun appel iOS n'était attesté** (210 sur 210 sans preuve
depuis le 7/11, tous builds). Il manquait le Team ID dans l'app Firebase (renseigné le
22/11) et le droit App Attest (ajouté dans la 1.0.26). Android : 145 appels sur 154
vérifiés depuis le 18/11, 9 échecs à expliquer. V_a est désormais propre à chaque plateforme. iOS :
au plus tôt la 1.0.26, à confirmer par un appel `VERIFIED` depuis un iPhone. Android : à
établir, car les requêtes Android ne portent pas leur version.

La 1.0.26 remonte dans Sentry chaque cause distincte d'échec d'attestation
(`service: appCheck`), au plus 5 par opération et par lancement, hors téléphone sans
connexion. Elle remplace le drapeau `deviceInfo.appCheck` prévu plus bas, qui n'aurait
indiqué que la présence des fichiers Firebase, pas l'obtention d'un jeton.

**Prérequis des lots autres que la voix :**
- `minVersion` est commun aux deux plateformes et son écran n'est qu'un bandeau, l'app
  reste utilisable : il ne bloque pas les anciennes versions. Le critère retenu est
  donc celui des 95 % d'adoption (C2) ;
- la 1.0.26 garde en file une saisie refusée en `unauthenticated` pour un compte
  connecté, en ligne comme hors ligne. **Les versions antérieures la perdent en ligne**
  et n'ont pas de mise à jour à distance : ne pas imposer les fonctions d'événements
  avant C2 ;
- `scripts/auditAppCheck.sh` doit distinguer plateforme et version, exiger un volume
  minimal par fonction et échouer si le volume est nul ou tronqué ;
- la file attend l'initialisation d'App Check avant son premier rejeu (1.0.26, attente
  bornée), mais pas le premier jeton : un rejeu trop tôt est refusé, puis repris ;
- une suppression ou une écriture non optimiste refusée en ligne échoue visiblement
  sans passer en file : à traiter avant d'imposer les fonctions d'événements ;
- `ensureReferralCode`, `validateReferralCode` et `sendDeletionRequestEmail` doivent
  journaliser leur état App Check ;
- après la bascule, suivre aussi les refus 401 : un appel refusé n'écrit pas de ligne
  `UNVERIFIED` ;
- ne pas utiliser `APPCHECK_ENFORCE=true` tant que la suppression de compte, le retrait
  du consentement et `revokeDeviceToken` n'ont pas fait l'objet d'une décision
  explicite ;
- révoquer les jetons de débogage enregistrés dans la console Firebase ;
- expliquer les 9 échecs Android.

Le 2026-12-07 reste une date de revue pour ces lots, pas une date de bascule.

**Décision de Yoss (2026-11-22) :** activer dès la 1.0.26, en commençant par
`transcribeAudio` et `parseVoiceCommand`, une fois un appel `VERIFIED` constaté sur
iPhone et la 1.0.26 disponible sur les stores. Ce premier lot n'attend pas C2 : sur une
version antérieure, seule la voix cesse de fonctionner, sans perte d'événement. Tous
les autres lots restent soumis à C1 à C4.

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
- `withAppCheck(options, nom)` (nom = nom d'export déployé, ex. `transcribeAudio`)
  ajoute `enforceAppCheck: true` si, au chargement de l'instance (fonctions v2,
  lecture de `process.env`), `APPCHECK_ENFORCE=true` (toutes les fonctions) ou si `nom` figure
  dans `APPCHECK_ENFORCE_FUNCTIONS` (liste séparée par des virgules, ex.
  `transcribeAudio,parseVoiceCommand`). Sans variable : surveillance seule ;
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
- confirmer sur un appareil réel, avec un build 1.0.26 : une requête Cloud Functions
  affiche `[AppCheck] … VERIFIED` (et non `UNVERIFIED`) ;
- suivre les échecs d'attestation par version dans Sentry (`service: appCheck`,
  depuis la 1.0.26). Ce suivi remplace le drapeau `deviceInfo.appCheck` d'abord prévu.

## Critères d'activation

**Fonctions appelables (`onCall` avec `withAppCheck`)**, tous les critères réunis :

- C1. La première version attestée (V_a) de chaque plateforme est confirmée sur un
  appareil (prérequis ci-dessus).
- C2. Au moins 95 % des utilisateurs actifs des 30 derniers jours sont sur une
  version ≥ V_a de leur plateforme (sources 1 ou 2). Relever `minVersion` ne suffit pas : c'est un
  bandeau commun aux deux plateformes, qui ne bloque pas les anciennes versions
  (`services/appUpdateService.ts`).
- C3. Pour les fonctions du lot concerné, moins de 0,5 % d'appels non vérifiés parmi
  les versions ≥ V_a, avec un volume suffisant. `scripts/auditAppCheck.sh` doit d'abord
  être fiabilisé : il ne distingue aujourd'hui ni plateforme ni version.
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

1. Lot voix (décision du 2026-11-22) : constater un appel `VERIFIED` sur iPhone en
   1.0.26 et attendre que la 1.0.26 soit disponible sur les stores.
2. Lots suivants : traiter leurs prérequis et réunir C1 à C4. Revue : 2026-12-07.
3. Bascule du lot voix :
   `APPCHECK_ENFORCE_FUNCTIONS=transcribeAudio,parseVoiceCommand` dans
   `functions/.env.<projet>` (pas `APPCHECK_ENFORCE=true`, qui vise toutes les
   fonctions). La CI redéploie toutes les fonctions à chaque push sur `main` : la
   variable doit donc rester dans le fichier d'environnement versionné ou fourni à
   la CI, sinon le prochain déploiement repasse les fonctions en surveillance.
   Les autres fonctions restent non imposées.
4. Surveillance 48 heures : Sentry (`unauthenticated`) et refus 401 dans Cloud Logging.
   Un appel refusé n'atteint pas la fonction et n'écrit donc aucune ligne `UNVERIFIED`.
5. Extension, une fois C1 à C4 réunis : ajouter les autres noms à
   `APPCHECK_ENFORCE_FUNCTIONS`. Poser
   `APPCHECK_ENFORCE=true` (déploiement complet par la CI `deploy-functions.yml`)
   seulement après la décision explicite sur la suppression de compte, le retrait du
   consentement et `revokeDeviceToken`.
6. Audit à J+7 : aucun refus 401 inexpliqué sur les clients récents.
7. Firestore puis Storage : console Firebase → App Check, dans un second temps et
   après un nouveau point de décision. Surveiller les métriques App Check avant de
   passer en application.

## Retour arrière

**Fonctions appelables** (procédure à vérifier avant la première bascule) :
1. retirer le nom de la fonction de `APPCHECK_ENFORCE_FUNCTIONS` (ou retirer
   `APPCHECK_ENFORCE=true` / le mettre à `false`) dans `functions/.env.<projet>` ;
2. redéployer les fonctions concernées depuis un `main` propre
   (`firebase deploy --only functions:<noms>`), ou par la CI `deploy-functions.yml` ;
3. committer ce changement sur `main`, sinon le prochain déploiement réimpose la
   fonction.

Durée : celle du déploiement, quelques minutes. Ne pas utiliser
`firebase functions:config:unset appcheck.enforce` : c'est la configuration v1, sans
effet sur les fonctions v2. Cette commande figure encore dans
`docs/FIREBASE_MONITORING.md` §8 et doit être corrigée (voir Conséquences).

**Firestore / Storage** : repasser en non appliqué dans la console Firebase. L'effet
est attendu en quelques minutes (à vérifier lors d'un essai hors production).

**Client** : une attestation native en échec sur une nouvelle version relève de la
mise à jour forcée ou d'un correctif de build, pas d'un retour arrière serveur.

## Conséquences

- Le lot voix suit la décision du 2026-11-22. Aucun autre lot avant la revue du
  2026-12-07 et ses prérequis.
- Correction nécessaire dans `docs/FIREBASE_MONITORING.md` §8 :
  - la commande de retour arrière (`functions:config:unset`) est fausse pour les
    fonctions v2 ;
  - `revenueCatWebhook` ne doit pas figurer dans la liste des fonctions à passer en
    `APPCHECK_ENFORCE`.
- Le suivi S4 (`docs/SUIVI_ACTIONS.md`) reprend ces critères.
- La procédure opérationnelle est reprise dans `docs/RUNBOOK.md`.

## Actions

- [x] Yoss : principe validé le 2026-11-22, voix d'abord dès la 1.0.26.
- [ ] Imposer `transcribeAudio` et `parseVoiceCommand` après l'appel `VERIFIED` sur iPhone.
- [ ] Revue des lots suivants le 2026-12-07.
- [ ] Vérifier sur un iPhone en 1.0.26 que les appels sont `VERIFIED` (V_a iOS).
- [ ] Établir V_a Android et expliquer les 9 échecs.
- [x] Garder en file une saisie refusée en `unauthenticated` pour un compte connecté (1.0.26).
- [ ] Fiabiliser `scripts/auditAppCheck.sh` (plateforme, version, volume minimal, volume nul ou tronqué).
- [x] Attendre l'initialisation d'App Check avant le rejeu de la file (1.0.26).
- [ ] Couvrir les suppressions et écritures non optimistes refusées en `unauthenticated`.
- [ ] Journaliser l'état App Check de `ensureReferralCode`, `validateReferralCode` et `sendDeletionRequestEmail`.
- [ ] Suivre les refus 401 après la bascule.
- [ ] Décider du sort de la suppression de compte, du consentement et de `revokeDeviceToken`.
- [ ] Révoquer les jetons de débogage dans la console Firebase.
- [x] Suivi des échecs d'attestation par version dans Sentry (1.0.26), à la place de `deviceInfo.appCheck`.
- [ ] Corriger `docs/FIREBASE_MONITORING.md` §8.
- [ ] Ajouter une requête d'agrégation des versions (Firestore) à la procédure.
