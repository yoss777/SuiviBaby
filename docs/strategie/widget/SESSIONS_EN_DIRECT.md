# Sessions en direct entre téléphones : cadrage et plan

Cadrage du 18/11/2026. Il fait suite à la décision de Yoss du même jour : « on ne peut pas se permettre 20 min de retard entre les appareils ». Seules les **sessions** sont concernées (tétée et ses côtés, sieste ou nuit, balade). Les autres saisies restent comme aujourd'hui.

Neuf agents ont contribué, chacun en lecture seule et sur un seul sujet :

| Sujet | Agent |
|---|---|
| Plan par phases | `ecc:planner` |
| Architecture | `ecc:architect` |
| Faisabilité iPhone (expo-widgets 58) | `ecc:swift-reviewer` |
| Faisabilité Android (récepteur natif) | `ecc:kotlin-reviewer` |
| Sécurité et RGPD | `ecc:security-reviewer` |
| Produit | `ecc:product-lens` |
| Design | `impeccable` |
| Accessibilité | `ecc:a11y-architect` |
| Faits Apple et Google vérifiés | recherche documentaire sur les sources officielles |

Ce document les consolide et tranche leurs désaccords. Les points qui reviennent à Yoss sont notés **[D1]** à **[D12]** et regroupés au § 10 ; il les a tous tranchés le 18/11 en retenant les recommandations.

Spécification produit de référence : [WIDGET_SPEC.md](WIDGET_SPEC.md) (§ 1 rôles, Live Activity V1 sans boutons, notification Android, remède n° 1 « Live Activity démarrée par push »). État de départ : [LOT5_JALON4_PERF.md](LOT5_JALON4_PERF.md).

---

## 1. Ce que les plateformes permettent (faits vérifiés le 18/11)

### iPhone

- **Widget d'un autre iPhone :** mis à jour par notifications silencieuses. Leur livraison n'est pas garantie : Apple dit « pas plus de deux ou trois par heure », et elles sont jetées si l'app a été fermée de force. D'où le retard actuel, jusqu'à 2 min.
- **Live Activity** (écran verrouillé, Dynamic Island) : mise à jour à distance par APNs, type `liveactivity`.
  - Priorité 10 dans un budget horaire non chiffré par Apple. `NSSupportsLiveActivitiesFrequentUpdates` élargit ce budget, mais l'utilisateur peut le couper. La priorité 5 ne compte pas dans le budget.
  - **Démarrage à distance (push-to-start) :** depuis iOS 17.2, avec une **alerte obligatoire**, qui allume l'écran.
  - **Durée :** 8 h actives au plus, puis jusqu'à 4 h sur l'écran verrouillé. **Une nuit de 10 à 12 h ne tient pas dans une seule activité.**
  - **Taille :** 4 Ko de données au plus.
  - **Nombre :** environ 5 activités par app.
- **Service d'Expo :** il n'envoie ni les pushs de Live Activity ni ceux de widget. Le serveur doit parler **directement à Apple**, avec une clé APNs (.p8).
- **Notifications propres aux widgets (iOS 26, vérifiées) :** type `widgets`, `content-changed: true`, jeton fourni par `WidgetPushHandler`, budget distinct, livraison « opportuniste ». Elles ne font que recharger la timeline. **expo-widgets ne les gère pas.**
- **Canaux de diffusion (iOS 18) :** prévus pour une large audience, avec 10 000 canaux au plus par app. Ils ne conviennent pas à un foyer.

### Android

- **Messages FCM de haute priorité :** livrés en quelques secondes, même en Doze. Mais FCM les rétrograde s'ils n'aboutissent pas à une notification visible : afficher une notification les protège.
- **Live Updates d'Android 16 :** notification permanente « promue », avec puce dans la barre d'état et Now Bar Samsung.
  - Conditions : permission `POST_PROMOTED_NOTIFICATIONS`, style standard, pas de couleur de fond.
  - **Google interdit de promouvoir une activité déclenchée par quelqu'un d'autre.** Sur les autres téléphones du foyer, ce sera donc une notification permanente **classique**, non promue. Seul le téléphone de l'auteur peut avoir la version promue.

### Incertain (forums, non documenté)

- **App fermée de force sur l'iPhone B :** une Live Activity démarrée à distance s'affiche, mais l'app n'est pas réveillée. Le **jeton qui permet de la mettre à jour ou de la terminer ne remonte pas au serveur** avant la prochaine ouverture de l'app. C'est le risque n° 1 du chantier (R1), à vérifier par prototype.
- **Chiffres des budgets Apple :** aucun n'est publié.

Sources : [ActivityKit push](https://developer.apple.com/documentation/activitykit/starting-and-updating-live-activities-with-activitykit-push-notifications), [Live Activities](https://developer.apple.com/documentation/activitykit/displaying-live-data-with-live-activities), [WidgetKit push](https://developer.apple.com/documentation/widgetkit/updating-widgets-with-widgetkit-push-notifications), [WidgetPushHandler](https://developer.apple.com/documentation/widgetkit/widgetpushhandler), [push en arrière-plan](https://developer.apple.com/documentation/usernotifications/pushing-background-updates-to-your-app), [canaux de diffusion](https://developer.apple.com/documentation/usernotifications/setting-up-broadcast-push-notifications), [priorité FCM](https://firebase.google.com/docs/cloud-messaging/android/message-priority), [Live Updates Android](https://developer.android.com/develop/ui/views/notifications/live-update), [expo-widgets](https://docs.expo.dev/versions/latest/sdk/widgets/). Forums : [834923](https://developer.apple.com/forums/thread/834923), [805324](https://developer.apple.com/forums/thread/805324).

## 2. Objectifs et critères de réussite

| Surface | Aujourd'hui | Cible V1 (p95, téléphone en ligne) | Plafond accepté |
|---|---|---|---|
| iPhone B : Live Activity | widget : 2 min au plus | **≤ 5 s** entre l'écriture et l'affichage | 15 s ; au-delà, état « à vérifier » (`staleDate`) |
| Android B : notification permanente | widget : quelques secondes | **≤ 5 s** | 15 s (Doze profond) |
| Téléphone de l'auteur (A) | réécriture locale | **≤ 1 s** (activité ou notification locale) | — |
| Widgets d'écran d'accueil | — | inchangés (2 min pour une session, 20 min le reste sur iPhone) | — |

Règles communes :

- Le chrono défile **sur le téléphone** (`Text(timerInterval:)`, `setUsesChronometer`). Un envoi n'a lieu qu'à un changement visible : début, côté, pause, reprise, fin.
- Aucune session ne reste affichée après sa fin, un retrait d'accès, un retrait de consentement ou une suppression de compte. Cible : 1 min, « au mieux » pour un téléphone hors ligne, borné par `staleDate` et les 8 h d'Apple.
- **Indicateurs produit**, seuils fixés à l'avance :
  - délai médian < 5 s ;
  - opt-in gardé à 14 jours ≥ 70 % ;
  - désactivation sous 7 jours < 20 % ;
  - affichages faux < 2 %.

## 3. Périmètre

**V1, en lecture seule :**

- **iPhone :** Live Activity, **une par enfant** et par appareil.
  - Elle démarre localement sur le téléphone de l'auteur, et à distance (push-to-start) sur les autres, à partir d'iOS 17.2.
  - Mises à jour et fin par APNs direct.
- **Android :** notification permanente avec chrono système.
  - Version promue (Live Update) seulement sur le téléphone de l'auteur, sous Android 16.
  - Notification classique sur les autres téléphones.
- **Réglages** par appareil :
  - activé ou non, par type de session ;
  - masquage sur l'écran verrouillé ;
  - heures calmes [D8].
- **Fins garanties :** effacement à distance (comme `w0`), tâche de balayage des sessions oubliées, interrupteur d'urgence `app_config/liveSessions`.
- **Gratuit** (décision du 13/11 : la visibilité entre aidants n'est jamais payante).

**Plus tard :**

- **V1.5 :** boutons « Changer de sein » et « Terminer » (App Intents, actions de notification), idempotents, avec « Annuler » pendant 10 s (spec § 4).
- **Notifications de widget d'iOS 26.** Écartées de la V1 : expo-widgets ne les gère pas, et elles ne font que recharger la timeline. Sans fournisseur de timeline natif qui lit le serveur, le widget relirait le même instantané. À réétudier avec un module natif (V2).
- iOS 16.1 à 17.1 : pas de démarrage à distance ; le widget reste la seule surface.
- Apple Watch, Wear OS.

## 4. Architecture

### 4.1 Flux : une tétée démarre sur A, s'affiche sur B

1. **A (app) :**
   - écrit `children/{c}/live/nursing` avec `originDevice` (identifiant d'installation aléatoire) ;
   - écrit une « réservation » `live_activities/{deviceId}_{sessionKey}` (`origin: "local"`) ;
   - démarre sa propre Live Activity, ou sa notification sur Android.
2. **Serveur :** nouveaux déclencheurs `onLiveSessionNursingWrite` et `onLiveSessionEventWrite` (sommeil, balade), **séparés** du fan-out du widget : pas de regroupement de 2 s, pas de plafond de 2 min, un échec reste isolé. Ils appellent `syncLiveSession(childId)`.
3. **`syncLiveSession` :**
   - relit l'état avec les fonctions partagées (`usableNursing`, `splitEvents`) ;
   - en tire un descripteur `{ kind, startMs, side, sideSecs, paused, sessionKey, stateHash }` ;
   - écarte un état identique au dernier envoyé (`live_sessions/{childId}`, TTL) ;
   - **garde d'ordre** : n'envoie que si `seq > lastSeq`, et plus rien après la fin.
4. **Destinataires :** les membres de `children/{c}/access`, avec **les mêmes filtres** que le widget (consentement de la version exigée [D3], comptes en suppression, `allowUids`), plus la préférence `liveSessions.<kind>`, les heures calmes et le rôle [D9]. Les appareils sont lus par `userId`, pas par `widgetChildId` : une Live Activity n'exige pas de widget posé.
5. **Choix par appareil :**
   - iPhone avec jeton d'activité pour ce couple enfant et session : `event: update` ;
   - iPhone avec jeton de démarrage, sans réservation pour cette session, différent de `originDevice` : `event: start` ;
   - Android avec `liveCap ≥ 1` : message de données `s1`, priorité haute, lu par le récepteur natif.
6. **B :** iOS affiche l'activité sans lancer l'app, puis l'app enregistre le jeton d'activité (voir 4.2 et R1). Sur Android, `WidgetPushHandler` passe le message à `LiveSessionNotifier`.

**Clé de session stable :**

- tétée : `n:{startedAtMs}` ;
- sommeil et balade : `e:{eventId}`.

Une session correspond à une seule activité par appareil.

### 4.2 Jetons iPhone

- **Jeton de démarrage**, un par appareil : `addPushToStartTokenListener` au démarrage de l'app. Il est écrit dans `device_tokens/{id}` avec `laStartToken`, `laEnv` (`sandbox` ou `production`), `laEnabled` et `laFrequent`, ces deux derniers lus par `ActivityAuthorizationInfo` exposé par `modules/widget-push/ios`.
- **Jeton par activité :** `getInstances()` à chaque lancement, puis `addPushTokenListener`. Il va dans `live_activities`.
- **Manque d'expo-widgets :** il n'observe pas `Activity.activityUpdates`. Une activité démarrée à distance n'est donc vue que quand le JS tourne. Correctif prévu : un **patch** d'expo-widgets (`WidgetsModule.swift`) qui observe les activités et leurs jetons dès le lancement, même en arrière-plan. À valider en phase 0, avec `input-push-token` d'iOS 18.
- **Mise en page :** `createLiveActivity("SessionEnCours", layout)` doit s'exécuter à chaque démarrage de l'app. Sinon, une activité démarrée à distance s'affiche vide. Il n'existe pas de mise en page embarquée pour les Live Activities. L'app doit donc avoir été ouverte au moins une fois depuis l'installation ou la mise à jour.
- **Forme imposée par expo-widgets :**
  - `content-state = { name: "SessionEnCours", props: "<JSON en chaîne>" }` ;
  - au démarrage, `attributes-type: "LiveActivityAttributes"` et `attributes: { url }`.

### 4.3 Envoi à Apple (`functions/src/apns/`)

- `node:http2` natif, sans dépendance. Une session HTTP/2 par instance, réutilisée.
- Jeton JWT ES256 (`node:crypto`), en cache 40 min, jamais régénéré avant 20 min.
- Secrets `APNS_KEY_ID` et `APNS_AUTH_KEY` dans Secret Manager, attachés seulement aux fonctions qui envoient. Yoss les dépose ; personne ne les lit, les affiche ni ne les journalise [D11].
- **En-têtes :**
  - `apns-push-type: liveactivity` ;
  - `apns-topic: com.tesfa.suivibaby.push-type.liveactivity` ;
  - `apns-expiration` : maintenant + 10 min.
- **Priorité :** 10 pour début, fin, pause et reprise. 5 pour un changement de côté, ou après un refus pour budget (429).
- **Charge utile :**
  - `timestamp` = `readTime` en secondes ;
  - `stale-date`, `dismissal-date` ;
  - 4 Ko au plus, vérifié par test.
- **Erreurs :**

| Réponse | Action |
|---|---|
| 410 ou `BadDeviceToken` | jeton effacé |
| 403 (clé expirée) | JWT régénéré une fois |
| 429 | compté, pas de nouvel essai immédiat |
| 5xx ou réseau | un seul nouvel essai après 1 s |

- **Journal `liveSessionPush`** : compteurs et durées seulement (`kind`, `event`, `status`, `writeToSendMs`, `sendMs`), jamais de jeton, d'enfant ni d'uid.

### 4.4 Contenu envoyé (minimal)

`{ k: "n|s|w", st: startMs, pa: pausedAtMs|null, acc: msAccumulés, sd: "L|R"|null, sl: secondesG, sr: secondesD, en: endMs|null, s: seq }`.

- Pas d'auteur pour une tétée (spec), pas de texte libre, pas de quantité.
- Le prénom et l'auteur d'une sieste ou d'une balade ne sont **pas** dans la charge utile : s'ils sont affichés [D2][D4], ils viennent d'un cache local de l'app, vidé à la déconnexion.
- L'alerte obligatoire du démarrage à distance contient un texte neutre, sans donnée de santé [D7].

### 4.5 Android (récepteur natif existant)

- **Nouveau type de message** `s1` (et `s0` pour la fin), séparé du widget. Il couvre **tous les enfants du foyer**, pas seulement celui affiché sur le widget, avec une garde d'ordre propre à chaque session (`__sb_live_seq_<childId>`).
- **`LiveSessionNotifier.kt` :**
  - canal « Sessions en direct », importance basse, sans son ;
  - `setOngoing`, `setOnlyAlertOnce` ;
  - `setUsesChronometer` + `setWhen(début du côté actif − décalage d'horloge estimé)` ;
  - en pause, chrono arrêté et temps figé ;
  - `VISIBILITY_PRIVATE` avec une version publique neutre ;
  - promotion (`setRequestPromotedOngoing`) **seulement pour la session de l'auteur** ;
  - `setTimeoutAfter`, en filet de sécurité.
- **Pas de doublon chez l'auteur :** rien tant que l'app est au premier plan. Au passage en arrière-plan, une notification locale, puis le serveur prend le relais avec le même identifiant, ce qui remplace la notification sans la doubler.
- **Effacement :** `w0`, la déconnexion et le retrait d'accès annulent les notifications.
- **Permissions :** `POST_NOTIFICATIONS`, demandée à l'activation de la fonction et non à froid. `POST_PROMOTED_NOTIFICATIONS` est déclarée dans le manifeste. Vérifier `compileSdk`/`targetSdk` 36.

### 4.6 Fin, sessions oubliées, limites

- **Fin :** `event: end` avec un état final (« Tétée terminée · 16 min ») et `dismissal-date` [D5]. Sur le téléphone de l'auteur, la fin est locale, et l'envoi du serveur sert de filet.
- **`staleDate`** et état « à vérifier, ouvrir » :
  - tétée : 3 h en marche, 1 h en pause ;
  - sieste : 6 h ;
  - balade : environ 7 h 55, à cause de la limite d'Apple.
- **Limite des 8 h sur iPhone :**
  - la nuit est désactivée par défaut (spec) ;
  - si elle est activée, l'activité se termine proprement vers 7 h 55 avec « Toujours en cours, ouvrez l'app » [D6] ;
  - le widget reste la source de vérité.
- **Tâche `liveSessionsSweep`** (toutes les 15 min) : termine les activités dont la session est finie, expirée ou supprimée, et rejoue les fins en échec.
- **Plusieurs sessions d'un même enfant :** une seule activité, qui montre la session prioritaire (tétée, puis sommeil, puis balade) avec une ligne « aussi : balade ». La limite d'Apple d'environ 5 activités par app reste ainsi loin.

## 5. Interface (synthèse ; détail dans le rapport design, § 11)

```
Écran verrouillé (iPhone)                  Dynamic Island
┌───────────────────────────────────────┐   compact : ( (o) G ········· 12:04 )
│ (o) Tétée [· Lina]        depuis 14:20 │   minimal : ( (o) )
│ Gauche ▶ 12:04         Droit 4:10      │   étendue : Tétée … 12:04 / G 12:04 · D 4:10
│ + Balade 0:42                          │
└───────────────────────────────────────┘
Android : « Tétée [· Lina] », chrono système, « Sein gauche · D 4:10 » ;
écran verrouillé : version publique « Session en cours ».
```

- **En pause :** chronos figés, « En pause ».
- **« Oubliée ? » :** texte ambre et ligne « Ouvrez pour terminer » ; jamais d'arrêt automatique.
- **Fin :** « Tétée terminée · 16 min ».
- **Dynamic Island :** toujours sombre.
- **Grand texte :** le chrono n'est jamais retiré ; on enlève d'abord le reste.
- Les crochets `[ ]` désignent ce qui dépend de [D2] et [D4].

## 6. Accessibilité

- **Phrases parlées communes** au widget, à la Live Activity et à la notification : une source unique dans `functions/shared/widget`, et les mêmes textes sur iPhone et Android, vérifiés par test.
- **Le chrono qui défile n'est jamais lu seconde par seconde.** Il est masqué pour le lecteur d'écran (Android : `accessibilityLiveRegion="none"`) ; l'élément parent porte « Sieste en cours depuis 14:20 ».
- **Annonces :** seulement aux changements d'état (début, pause, changement de sein, fin, « oubliée ? »). Aucune abréviation parlée (« min », « G/D » sont interdits) ; les mots sont complets : « sein gauche », « en pause », « oubliée ? à vérifier ».
- **Dynamic Island compacte :** pas de troncature qui change le sens ; l'étiquette parlée porte la phrase complète.
- **Couleur :** jamais seule porteuse d'information. Contraste vérifié en clair, en sombre et sur un écran verrouillé teinté.

## 7. Sécurité et RGPD

- **Nouveau canal.** La Live Activity et la notification sont durables sur l'écran verrouillé, démarrées à distance sur le téléphone d'un autre aidant, et passent par Apple en direct. La politique 2.3 décrit le widget, pas ce canal : **une version 2.4** est recommandée [D3]. Elle s'accompagne d'un filtre serveur dédié (`liveSessions.minConsentVersion`) et d'un **opt-in distinct**, désactivé tant que la personne ne l'a pas activé [D10].
- **Données transmises :** strict minimum (§ 4.4) ; aucune donnée de santé dans l'alerte du démarrage à distance.
- **Jetons :**
  - stockés côté serveur seulement (règles : création limitée au propriétaire avec un accès valide, champs serveur protégés) ;
  - TTL ;
  - purgés à la déconnexion, au retrait d'accès ou de consentement et à la suppression du compte ou de l'enfant ;
  - jamais journalisés.
- **Fin à distance** sur effacement : `endLiveSessionsForUser`, appelée aux mêmes endroits que `wipeWidgetForUser`. Un ex-membre hors ligne garde l'affichage « au mieux », borné par `staleDate` et les 8 h d'Apple, comme pour le widget.
- **Clé .p8 :**
  - Secret Manager, accès limité au compte de service des fonctions ;
  - `*.p8` dans `.gitignore` ;
  - rotation documentée dans le RUNBOOK.
- **Documents à mettre à jour :**
  - `public/privacy.html` (2.4) ;
  - texte de consentement dans l'app ;
  - registre (traitement 5 étendu ou nouveau traitement, sous-traitant Apple APNs direct, DPF à confirmer) ;
  - **AIPD** ;
  - étiquette de confidentialité de l'App Store et fiche Data Safety de Google Play ;
  - test de couverture des purges (`live_activities`, `live_sessions`).

## 8. Phases

### Phase 0 : prototypes jetables, 3 jours, go/no-go

1. **iPhone 15** + script local + clé APNs de développement :
   - démarrage à distance, mise à jour, fin, **app fermée normalement et app fermée de force** ;
   - remontée du jeton d'activité, avec et sans le patch ;
   - `input-push-token` ;
   - rendu dans la Dynamic Island ;
   - lecture par VoiceOver du chrono natif.
2. **Samsung :**
   - notification avec chrono ;
   - promotion sur Android 16, si disponible ;
   - message `s1` reçu app tuée.
3. **Résultat attendu :** go sur l'approche par jetons, ou repli. Le repli consiste à ne pas démarrer à distance sur un iPhone fermé de force : le widget y fait foi, et l'activité démarre à l'ouverture de l'app. **Les phases suivantes dépendent de ce résultat.**

### Phase 1 : serveur, derrière l'interrupteur coupé

- **À créer :**
  - `functions/src/apns/jwt.js` et `client.js` ;
  - `functions/src/live/session.js` (pur et testable : descripteur, clé, `stateHash`, charge utile) ;
  - `functions/src/live/sync.js` (déclencheurs, `syncLiveSession`, `endLiveSessionsForUser`, `liveSessionsSweep`) ;
  - `app_config/liveSessions` (`enabled`, `ios`, `android`, `allowUids`, `minConsentVersion`).
- **À modifier :**
  - `functions/src/shared/secrets.js` et `functions/src/shared/consent.js` ;
  - `wipe.js` et `deletion/*.js` ;
  - `functions/index.js` ;
  - `firestore.rules` et `firestore.indexes.json` (TTL).

### Phase 2 : iPhone (build par GitHub Actions)

- `app.json` : options expo-widgets `enablePushNotifications` et `frequentUpdates`. Vérifier que `aps-environment` vaut `production` dans les builds de distribution.
- Patch d'expo-widgets : observation des activités et de leurs jetons.
- `widgets/SessionEnCours.ios.tsx` (mise en page), `services/liveActivityIos.ts` (démarrage local, réservation, `reconcile()` au lancement, jetons).
- `modules/widget-push/ios` : `liveActivitiesEnabled()` et `frequentUpdatesEnabled()`.
- `services/pushTokenService.ts`, `services/liveNursingService.ts`, formulaires de sommeil et de balade (`originDevice`).

### Phase 3 : Android (.aab en local)

- `LiveSessionNotifier.kt`, `LiveSessionGuards.kt` (logique pure, testée sur la JVM) et leurs tests.
- `WidgetPushHandler.kt` (`s1`/`s0`, `w0` annule), `WidgetPushService.kt`, `WidgetPushModule.kt` (notification locale de l'auteur, permission, `clear`).
- Manifeste du module (`POST_PROMOTED_NOTIFICATIONS`), `build.gradle` (`compileSdk`).

### Phase 4 : réglages, RGPD, textes

- Écran Réglages « Sessions en direct » : par type de session, masquage sur l'écran verrouillé, heures calmes. Nuit désactivée par défaut.
- Politique 2.4, consentement, registre, AIPD, fiches des stores, RUNBOOK (rotation de la clé).

### Phase 5 : bêta et montée en charge

- `allowUids` réduit au foyer de Yoss pendant une semaine, puis TestFlight et Alpha, puis tout le monde.
- **Ne parler de « direct » dans le marketing** que si les seuils du § 2 sont tenus.

**Ordre :** la phase 0 d'abord. Puis la phase 1. Les phases 2 et 3 sont indépendantes l'une de l'autre : Android peut partir avant l'iPhone. La phase 4 doit être terminée avant toute activation en dehors du foyer de Yoss.

## 9. Tests, mesure, retour arrière, risques

**Tests :**

- **Serveur :**
  - descripteur pour chaque transition (tétée, sommeil, balade), dédoublonnage, garde d'ordre ;
  - choix entre démarrage, mise à jour ou rien, exclusion de l'auteur ;
  - filtres de consentement, de suppression et de rôle ;
  - charge utile ≤ 4 Ko ;
  - codes APNs 200, 403, 410, 429 et 5xx (HTTP/2 simulé) ;
  - effacement, balayage.
  - **Chaque garde est vérifiée par mutation**, comme au jalon 4.
- **App :**
  - `liveActivityIos` : réconciliation, doublons, jetons ;
  - phrases parlées, identiques sur iPhone et Android ;
  - Kotlin `LiveSessionNotifierTest` : base du chrono, pause, ordre.
- **Appareils** (iPhone 13 sous iOS 17.x, iPhone 15 sous iOS 18 ou 26, Samsung) :
  - début, côté, pause, reprise et fin filmés sur deux écrans, latence notée ;
  - app de B tuée ;
  - économie d'énergie ;
  - mises à jour fréquentes coupées ;
  - deux enfants ;
  - nuit de 9 h ;
  - retrait d'accès en cours de session ;
  - suppression de compte ;
  - A sans réseau ;
  - VoiceOver, TalkBack, grand texte.

**Mesure en production :**

- Journal `liveSessionPush` : `writeToSendMs` p50/p95 (cible < 1,5 s), répartition des codes de réponse, refus pour budget, envois par session.
- Alerte si les erreurs dépassent 2 % sur 1 h.

**Retour arrière :**

- `app_config/liveSessions.enabled = false` : plus aucun envoi, et le balayage termine les activités ouvertes, sans déploiement. `ios: false` ou `android: false` permettent de couper une seule plateforme.
- Les jetons et `live_sessions` sont inertes et purgés par TTL.
- Le widget du jalon 4 reste le filet de sécurité.

**Risques :**

| # | Risque | Parade |
|---|---|---|
| R1 | iPhone B fermé de force : jeton d'activité non remonté, donc ni mise à jour ni fin à distance | Phase 0 ; patch d'expo-widgets ; `input-push-token` ; `staleDate` court ; repli « démarrage à l'ouverture » |
| R2 | Budget Apple épuisé, mises à jour fréquentes coupées | Envois aux seuls changements visibles, dédoublonnage, priorité 5 pour le côté et après un 429 |
| R3 | Doublon chez l'auteur | Réservation + `originDevice` exclu + `reconcile()` |
| R4 | Données de santé sur l'écran verrouillé | Contenu minimal, [D2], consentement 2.4, opt-in |
| R5 | Alerte du démarrage à distance qui allume l'écran, la nuit | Heures calmes [D8], texte neutre [D7] |
| R6 | Revue Apple | Vraie activité en cours, texte neutre, notes de revue avec vidéo |
| R7 | Live Updates refusées sur les téléphones des autres (règle Google) | Notification classique pour eux, promotion seulement chez l'auteur |
| R8 | Fuite de la clé .p8 | Secret Manager, IAM ciblé, jamais journalisée, rotation |
| R9 | Retard du lot 5, MEP du 2/2 | Interrupteur coupé par défaut, Android indépendant de l'iPhone, [D1] |

## 10. Décisions de Yoss

**Tranché le 18/11/2026 : toutes les recommandations ci-dessous sont retenues.** Deux précisions :

- **D9 et D10 ensemble.** Personne ne reçoit de session en direct sans l'avoir activé (D10, RGPD : pas de case précochée). Le rôle détermine seulement qui se voit *proposer* l'activation : les parents (propriétaire, administrateur) reçoivent l'invitation à la première session lancée par un autre aidant ; les autres rôles ne sont pas sollicités et peuvent l'activer dans les réglages.
- **D12, résultat du 18/11** (requête en lecture seule sur la production, agrégats seulement) : 6 enfants suivis, dont 3 partagés entre au moins 2 membres ; 5 enfants actifs sur 30 jours (721 saisies), dont 2 partagés et **1 seul avec au moins 2 auteurs distincts**. Les sessions pèsent 202 saisies sur 721 (sommeil 114, tétée 72, activité 16). L'échantillon est celui de la bêta fermée et ne dit rien du marché : la requête est à refaire un mois après la MEP, et la phase 5 (§ 8) en dépend.

| # | Décision | Recommandation consolidée (retenue) |
|---|---|---|
| **D1** | Calendrier : dans la MEP du 2/2/2027, ou juste après ? | Développer après le lot 5, derrière l'interrupteur coupé. Activer à la MEP seulement si la phase 0 et les seuils du § 2 passent ; sinon, juste après. Android peut partir avant l'iPhone. |
| **D2** | Écran verrouillé : que montrer par défaut ? Le design propose prénom et côté ; la sécurité propose type et chrono seulement. | Par défaut : type, chrono et côté du sein (c'est l'information utile), **sans prénom**. Prénom en option dans les réglages. Android : version publique neutre. |
| **D3** | Nouvelle version du consentement (2.4) ? | Oui : ce canal n'est pas couvert par la 2.3. |
| **D4** | Auteur pour la sieste et la balade (« par Awa ») ? Jamais pour une tétée. | Pas en V1. Il n'est pas dans la charge utile ; à ajouter plus tard en option si c'est demandé. |
| **D5** | Après la fin : retrait immédiat, ou résumé gardé un moment ? | Immédiat sur le téléphone de l'auteur, résumé de 10 min sur les autres. |
| **D6** | Nuit (au-delà de 8 h sur iPhone) | Désactivée par défaut (spec). Si activée : fin propre vers 7 h 55 avec « Toujours en cours, ouvrez l'app ». |
| **D7** | Texte de l'alerte du démarrage à distance (qui allume l'écran) | « Session en cours », sans son ni donnée de santé. |
| **D8** | Heures calmes | Bloquer seulement le démarrage à distance ; une activité déjà affichée continue de se mettre à jour. |
| **D9** | Qui reçoit ? | Activé par défaut pour les parents (propriétaire, administrateur) ; désactivé pour les autres rôles (nounou, Proches), qui peuvent l'activer. |
| **D10** | Opt-in | Distinct, désactivé tant que la personne ne l'a pas activé (RGPD). Proposé à l'occasion de la première session lancée par un autre aidant. |
| **D11** | Clé APNs | À créer par Yoss dans le compte Apple Developer et à déposer dans Secret Manager avant la phase 1. |
| **D12** | Mesurer la part des foyers à plusieurs aidants actifs (requête en lecture seule sur la production) | Oui : c'est le chiffre qui dit pour combien de foyers on construit. |

## 11. Annexes : points de détail des rapports

- **Design :** banner, compact, minimal, étendu ; états pause, « oubliée ? » et fin ; dark mode ; Dynamic Type (plafond `xLarge`, puis `large` dans la Dynamic Island) ; Android replié et déplié ; puce Android 16 (`setShortCriticalText`).
- **Accessibilité :** liste de tests (phrases, interdiction des abréviations, égalité iPhone et Android, compteur de sessions, ordre de lecture stable) et vérifications sur appareil.
- **Faisabilité iPhone :** forme exacte de `content-state`, `attributes-type: "LiveActivityAttributes"`, `pauseTime` pour la pause, environ 5 activités par app, iOS 17.2 minimum pour le démarrage à distance, boutons qui ouvrent l'app (AppIntent en V1.5).
- **Faisabilité Android :** message séparé du widget, garde d'ordre par session, bascule premier plan et arrière-plan chez l'auteur, `setTimeoutAfter` en filet, risques constructeurs (Samsung, Xiaomi) et diagnostic sans permission.
