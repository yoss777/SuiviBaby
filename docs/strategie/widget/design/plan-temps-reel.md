# Plan : widget « Bébé maintenant » en temps réel entre aidants

Réponse au brief `BRIEF_TEMPS_REEL.md`. Rédigé le 13/11/2026, d'après le code de la branche `feat/widget-v1` et les docs officielles citées. Aucun fichier du projet n'a été modifié et rien n'a été déployé.

---

## 0. En bref

**Recommandation : le serveur calcule les données du widget, le téléphone les écrit sans lancer JavaScript.**

- **Déclencheur unique côté serveur.** Une Cloud Function Firestore (`onDocumentWritten`) écoute `events/{id}` et `children/{childId}/live/{id}`. Elle couvre les deux chemins d'écriture : les callables, et le `setDoc` direct qu'autorisent les règles.
- **Calcul sur le serveur.** Le serveur recalcule les `NowWidgetProps` de l'enfant **pour chaque appareil**, avec le fuseau de l'appareil, le statut Premium et les seuils de rappel de son utilisateur. Il réutilise la même fonction pure que l'app, en miroir JS testé à l'identique.
- **Android.** Un message FCM **data-only** est envoyé via le service Expo Push, déjà en place. Un **service Kotlin natif** (sous-classe de `ExpoFirebaseMessagingService`) écrit les props dans les SharedPreferences d'expo-widgets, puis redessine le widget. On ne démarre ni React Native ni Firestore : environ 100 ms de travail, sans connexion requise.
- **iOS, trois étages, du plus fiable au moins fiable :**
  1. **Live Activity démarrée et mise à jour par push** (iOS 17.2+) pour les sessions en cours (tétée, sommeil, promenade). C'est le seul vrai « temps réel » garanti sur iPhone.
  2. **Push WidgetKit** (iOS 26+) : il demande au widget de se recharger. Le widget va alors chercher ses données sur un endpoint, ce qui demande un patch natif d'expo-widgets. Ces pushes sont budgétés.
  3. **Push en arrière-plan** (`content-available`), qui porte les props. Un abonné natif à l'AppDelegate les écrit dans l'App Group. C'est du « au mieux » : 2 à 3 par heure selon Apple, et rien après une fermeture forcée.
- **Ordre de livraison :** Android d'abord (gain maximal, risque faible, build local), puis le push en arrière-plan iOS, puis la Live Activity, puis le push WidgetKit iOS 26.
- **Filet de sécurité conservé :** « màj HH:MM » au-delà de 30 min, et « Ouvrir pour actualiser » quand une session est affichée depuis plus de 2 h (`WIDGET_SPEC.md`).

---

## 1. Ce que dit le code aujourd'hui (constat)

| Sujet | Où | Constat utile pour le plan |
|---|---|---|
| Calcul des props | `utils/widgetSnapshot.ts` l. 202-237 (`buildNowWidgetProps`) | Fonction pure, déjà testée (`__tests__/widgetSnapshot.test.ts`). En revanche, `formatClock` (l. 132-135) utilise **le fuseau du téléphone** : le serveur devra formater avec un fuseau explicite. |
| Préparation des entrées | `hooks/useNowWidgetSync.ts` l. 100-173 | Regroupement des repas et des couches, liste `recent`, dernière tétée. Ce code est **dans un hook** : il faut l'extraire en fonction pure pour pouvoir le porter côté serveur. |
| Sommeil du jour | `home.tsx` l. 1604-1640 (`setTodayStats`, `totalSleepMinutes`) | Calculé dans l'écran : à extraire lui aussi. |
| Dernier repas « absolu » | `home.tsx` l. 1543-1550 → `lastAbsoluteMealMs` | Couvre hier et aujourd'hui (fenêtre de `ecouterEvenementsDuJour`, `eventsService.ts` l. 1147-1158). |
| Sessions en cours | `home.tsx` l. 633-656 | Sommeil = événement `sommeil` sans `heureFin`. Promenade = `activite` + `typeActivite: "promenade"` sans `heureFin`. Tétée = document `children/{childId}/live/nursing` (`services/liveNursingService.ts` l. 22-44). |
| Garde contre un autre bébé | `useNowWidgetSync.ts` l. 88-99 ; `props.childId` | Côté app, existe déjà. À reproduire côté natif. |
| Envoi au widget | `services/widgetSync.ts` l. 40-57 | Anti-rebond de 2 s et dédoublonnage par `lastKey`. Attention : après une écriture native, `lastKey` peut empêcher l'app de réécrire (voir étape E4). |
| Stockage Android | `node_modules/expo-widgets/android/.../WidgetObject.kt` l. 24-27, `WidgetsStorage.kt` | SharedPreferences `expo.modules.widgets`, clé `__expo_widgets_BebeMaintenant_props`, valeur en **JSON texte** (`WidgetsJson.stringifyMap`). Le rendu relit cette clé (`ExpoWidgetsPeekWidget.kt`, `WidgetsLayoutRegistry.props`). |
| Redessin Android sans JS | patch `expo-widgets+58.0.28.patch` l. 132-157 (`RefreshAtView`) | On sait déjà redessiner : on diffuse `ACTION_APPWIDGET_UPDATE` vers `${package}.BebeMaintenantProvider` (`WidgetProviderNames.kt`). Le service natif fera la même chose. |
| Réception FCM Android | `expo-notifications/android/.../AndroidManifest.xml` | `ExpoFirebaseMessagingService` est déclaré avec `priority="-1"`, et la classe est `open`. Un message data-only sans titre n'est **pas affiché** (`ExpoHandlingDelegate.kt` l. 131-148). Les données envoyées par Expo Push arrivent dans `data["body"]` sous forme de chaîne JSON (`NotificationData.kt` l. 22). |
| Stockage iOS | `expo-widgets/ios/WidgetObject.swift` l. 20-24 ; `build/Widgets.js` l. 31-39 | App Group, clé `__expo_widgets_BebeMaintenant_timeline`, tableau d'entrées `{timestamp, props}`. |
| Abonné AppDelegate iOS | `expo/ios/Expo/ExpoAppDelegate.swift` l. 147-150 | `didReceiveRemoteNotification` est relayé à **tous** les abonnés : un module natif peut traiter le push sans JS. |
| Live Activity | `expo-widgets/ios/LiveActivity.swift`, `WidgetsModule.swift` l. 135-152 | Jeton de mise à jour (`pushTokenUpdates`) et jeton push-to-start (`pushToStartTokenUpdates`, iOS 17.2+) déjà exposés. `ContentState(name, props: String)`. Activé par l'option `enablePushNotifications` du plugin. |
| Jetons d'appareil | `services/pushTokenService.ts` | Ce service ne stocke que des **jetons Expo**. Il **demande la permission de notification** avant d'obtenir le jeton (l. 38-43) : sans permission, l'appareil n'a pas de jeton, donc pas de widget à jour. Le champ `enabled` est le réglage « push » de l'utilisateur ; il ne doit pas couper le widget. |
| ⚠ ID de projet Expo | `pushTokenService.ts` l. 23 (`0c759940-…`) ≠ `app.json` l. 277 (`a94ef121-…`) | **Non vérifié** : c'est peut-être voulu (transfert de projet), mais à confirmer avant tout chantier push. Un jeton émis pour l'autre projet n'est pas joignable avec les identifiants de ce projet-ci. |
| Écritures directes autorisées | `firestore.rules` l. 244-252 (events), l. 230-233 (live/nursing) | Seul un trigger Firestore voit **toutes** les écritures. Ce n'est pas le cas d'un hook dans les callables. |
| Envoi push existant | `functions/src/notifications/reminders.js` l. 84-182 ; `functions/lib/reminders.js` (`sendPushWithTickets`, `removeDeadTokens`) | Gestion des tickets et des jetons morts : déjà en place, à réutiliser. |
| Fuseau déjà stocké | `functions/lib/quietHours.js` l. 6-30 (`quietHours.timeZone`) ; `utils/quietHours.ts` (« miroir du serveur ») | Le schéma « miroir app/serveur » existe déjà dans le projet. |
| Région | `functions/index.js` l. 7 | `europe-west1`. Un test fige la liste des exports (`functions/__tests__/exportsSnapshot.expected.json`). |

---

## 2. Architecture cible

```
 Téléphone A (auteur)                         Firestore (europe-west1)
 ─────────────────────                        ─────────────────────────
 callable validateAndCreateEvent ─┐
 setDoc direct (events)  ─────────┼──────►  events/{id}            ┐
 live/nursing (setDoc)   ─────────┘         children/{c}/live/nursing ┘
                                                     │ onDocumentWritten (2 triggers)
                                                     ▼
                         ┌──────────────── onWidgetSourceWrite ────────────────┐
                         │ 1. filtre : type utile (tetee, biberon, solide,      │
                         │    miction, selle, couche, sommeil, activite         │
                         │    promenade) ET date ≥ now-36 h, ou live/*          │
                         │ 2. lit l'état COURANT de l'enfant (requête           │
                         │    events childId+date ≥ hier 00:00, live/nursing,   │
                         │    dernier repas absolu) → readTime = seq            │
                         │ 3. destinataires : children/{c}/access/* →           │
                         │    device_tokens (userId, widgetChildId == c,        │
                         │    widgetCap ≥ 1)                                    │
                         │ 4. pour chaque appareil : buildNowWidgetProps(       │
                         │    entrées, tz appareil, isPremium(uid),             │
                         │    rappels(uid), now) → toNativeWidgetProps          │
                         │ 5. envoi (voir le tableau ci-dessous)                │
                         └──────────────────────────────────────────────────────┘
        Android                                   iOS
        Expo Push → FCM data-only                 (a) APNs liveactivity (start/update/end)
        priority high (session) /                 (b) APNs widgets {content-changed}  [iOS 26+]
        normal (repas, couche), ttl 900 s         (c) Expo Push contentAvailable + data (props)
              │                                          │
              ▼                                          ▼
  WidgetPushService (Kotlin)                  (a) ActivityKit affiche, sans app
   extends ExpoFirebaseMessagingService       (b) TimelineProvider patché : GET /widgetSnapshot
   - data["body"].t == "w1" ? sinon super     (c) WidgetPushAppDelegateSubscriber (Swift)
   - gardes (enfant, seq, premier plan)            - mêmes gardes → écrit _timeline
   - écrit __expo_widgets_..._props                - WidgetCenter.reloadTimelines
   - broadcast APPWIDGET_UPDATE
```

### 2.1 Contenu du message (une seule forme pour toutes les plateformes)

```json
{ "t": "w1", "c": "<childId>", "s": 1763040123456, "p": { ...NowWidgetProps natifs... } }
```

- `t` : type et version du message. Un appareil qui ne connaît pas `w1` l'ignore.
- `s` (seq) : `readTime` de la lecture Firestore du serveur, en ms. Il vient de l'horloge du serveur et suit l'ordre de fraîcheur. Ce n'est **pas** l'horloge d'un téléphone.
- `p` : props complètes, sans `null` (`toNativeWidgetProps`). Taille estimée : environ 1,7 Ko avec 15 événements `recent`. La limite est de 4096 octets (Expo Push, `MessageTooBig`). Garde-fou : on réduit `recent` à 10, puis à 5, si le JSON dépasse 3,5 Ko.
- Rien de plus que ce que le widget affiche déjà. Il n'y a aucun auteur, ni pour une tétée ni pour un autre événement (règle du projet).

### 2.2 Gardes (sur l'appareil, natif)

1. **Bon bébé** : `c` doit être égal à l'enfant affiché par ce widget. Le natif lit `childId` dans les props stockées. L'app écrit aussi une clé dédiée `__sb_widget_child` à chaque `pushNowWidget`. Le serveur filtre déjà par `device_tokens.widgetChildId` : cette garde est la deuxième barrière.
2. **Ordre** : on applique seulement si `s` > `__sb_widget_seq`, la dernière valeur serveur appliquée. Un message en retard (Doze, livraison tardive) ne remplace jamais un plus récent. Les écritures de l'app au premier plan ne modifient pas `__sb_widget_seq`, car leur horloge n'est pas comparable.
3. **App au premier plan** : on ignore le message. Les écouteurs Firestore de l'Accueil sont déjà à jour et `useNowWidgetSync` fait foi. Sur Android, on le détecte avec `ProcessLifecycleOwner` (la même méthode qu'`ExpoHandlingDelegate.isAppInForeground`).
4. **Version** : on rejette si `p.v` est inconnu ou si le JSON est invalide, sans planter : on encadre par `runCatching` et on journalise localement.
5. **Côté serveur** : on n'envoie qu'aux utilisateurs qui ont un document `children/{c}/access/{uid}`, contrôle déjà fait par `reminders.js` l. 108-115. Tant qu'il n'existe pas de consentement santé valide (`hasValidHealthConsent`), rien n'est envoyé.

### 2.3 Messages arrivés dans le désordre, ou en double

- Les triggers Firestore sont livrés **au moins une fois**, et pas dans l'ordre. Chaque exécution relit l'**état courant** au lieu d'utiliser l'événement reçu : l'exécution la plus tardive porte toujours le `readTime` le plus grand, donc l'état le plus frais.
- Les doublons sont sans effet : même `s` ou `s` inférieur, donc le message est ignoré.
- Côté transport, on regroupe les messages en attente : `collapseId`/clé de regroupement par enfant, si Expo l'expose pour Android (**non vérifié** : la doc Expo ne mentionne `collapseId` que pour iOS). À défaut, la garde de séquence suffit.

### 2.4 Où calculer (choix)

| Option | Pour | Contre | Verdict |
|---|---|---|---|
| **A. Le serveur calcule les props, le téléphone les écrit (natif)** | Pas de démarrage de React Native, pas d'authentification, pas de réseau sur l'appareil. Tient dans la fenêtre de traitement FCM, qui dure « quelques secondes ». Même logique sur iOS (abonné AppDelegate) et pour le push WidgetKit (endpoint). | Logique en double (TS dans l'app, JS dans Functions). Le serveur a besoin du fuseau de l'appareil et des préférences de l'utilisateur. | **Retenue.** Le doublon est maîtrisé par des fixtures partagées et un test de parité, comme pour `quietHours`. |
| B. Signal seul, le téléphone relit Firestore en tâche JS d'arrière-plan | Une seule logique. | `expo-task-manager` à ajouter. Il faut démarrer le bundle RN « headless », restaurer l'authentification Firebase JS et faire 1 à 2 requêtes Firestore : plusieurs secondes sur un Android d'entrée de gamme, ce qui dépasse la fenêtre conseillée de 10 s environ (doc FCM). Sur iOS, la tâche d'arrière-plan n'existe pas après une fermeture forcée. | Écartée comme chemin principal. |
| C. Le widget lit le réseau lui-même | Fraîcheur à l'affichage. | Le runtime JS d'expo-widgets n'a pas de réseau (`WIDGET_SPEC.md`). Côté Android, il faudrait un worker natif. | Seulement pour iOS 26, avec le push WidgetKit (étape E8). |

---

## 3. Choix argumentés, avec preuves

### Android

- **Un message data-only arrive dans `onMessageReceived`, même en arrière-plan.** Firebase : « data-only messages go to `onMessageReceived` in the background ». Le temps de traitement est court : environ 10 s, puis WorkManager au-delà. Source : <https://firebase.google.com/docs/cloud-messaging/android/receive>. → Le service natif ne fait qu'une écriture locale et une diffusion, bien en dessous de cette limite.
- **La haute priorité réveille l'appareil en Doze**, mais elle est **rétrogradée** si elle ne produit pas de notification visible. Firebase : « FCM attempts to deliver high priority messages immediately, allowing FCM to wake a sleeping device » et « If FCM detects a pattern in which messages don't result in user-facing notifications, your messages may be deprioritized ». Sources : <https://firebase.google.com/docs/cloud-messaging/android/message-priority> et <https://firebase.blog/posts/2025/04/fcm-on-android>. Android 13+ : « System now downgrades the high priority messages if it detects an app consistently sending high-priority messages that don't result in a notification ». Source : <https://developer.android.com/about/versions/13/changes/battery>.
  - **Conséquence pour la conception :**
    - priorité **haute** seulement pour le **début et la fin d'une session** (tétée, sommeil, promenade). À terme, ces messages mettent aussi à jour la **notification permanente** prévue en S5 (`PLAN_ACTION_WIDGET.md` l. 182-185), qui est visible : la haute priorité devient alors légitime ;
    - priorité **normale** pour les événements ponctuels (biberon, couche, repas). Ils sont livrés dès la fenêtre de maintenance de Doze, ou tout de suite si l'écran est allumé ;
    - les pauses et reprises de tétée restent en priorité normale : le chrono natif défile seul.
- **Notifications refusées = messages rétrogradés.** Le blog Firebase : « If the user has disabled the notification permission for your app … your messages will be deprioritized ». Source : <https://firebase.blog/posts/2025/04/fcm-on-android>. → Un aidant qui refuse les notifications aura un widget en retard. On l'affiche honnêtement grâce au filet « màj HH:MM ».
- **Arrêt forcé : rien n'est livré.** Firebase classe « App is force-stopped » parmi les échecs de livraison. Source : <https://firebase.blog/posts/2024/07/understand-fcm-delivery-rates/>. Sur Samsung, la « veille profonde » produit un effet comparable (**source non officielle** : <https://dontkillmyapp.com/samsung>). → Cas d'échec connu, voir §5.
- **Expo Push sait faire du data-only.** Expo : envoyer seulement `data` + `_contentAvailable: true` produit une « Headless Background Notification » ; sur Android, c'est un message data. Priorités `default | normal | high` ; par défaut, normale sur Android. Limite de 4096 octets. Sources : <https://docs.expo.dev/push-notifications/what-you-need-to-know/> et <https://docs.expo.dev/push-notifications/sending-notifications/>. → Pas de nouvel identifiant ni de nouveau SDK côté serveur (`expo-server-sdk` est déjà là).
- **Un service natif plutôt qu'une tâche JS.** `ExpoFirebaseMessagingService` est `open` et déclaré en `priority="-1"`. Notre service (priorité par défaut 0) passe donc avant lui, et appelle `super` pour tous les messages qui ne sont pas des widgets. La règle de résolution d'Android quand deux services déclarent `MESSAGING_EVENT` reste **non vérifiée** dans la doc officielle : à valider sur appareil dès l'étape E4, avec une notification de rappel classique qui doit toujours s'afficher.

### iOS

- **Le push en arrière-plan est limité et coupé par la fermeture forcée.** Apple : « don't try to send more than two or three per hour ». Le push exige `apns-push-type: background` et `apns-priority: 5`. Apple encore : « If something force quits or kills the app, the system discards the held notification ». L'app dispose de 30 s. Source : <https://developer.apple.com/documentation/usernotifications/pushing-background-updates-to-your-app>. → Ce n'est qu'un **complément**.
- **Le push WidgetKit existe, depuis iOS 26.** `WidgetPushHandler` est disponible à partir d'« iOS 26.0 » (<https://developer.apple.com/documentation/widgetkit/widgetpushhandler>). Il exige `apns-push-type: widgets`, un topic `<bundleID>.push-type.widgets` et `"content-changed": true`. Le widget **recharge sa timeline** : le push ne porte pas de données. Apple : « the system budgets WidgetKit push notifications and delivers them opportunistically ». Le jeton s'obtient par WidgetKit, pas par UserNotifications. Il faut l'entitlement push sur l'extension. Source : <https://developer.apple.com/documentation/widgetkit/updating-widgets-with-widgetkit-push-notifications>. Un développeur signale que `getTimeline` n'est parfois pas appelé malgré un HTTP 200 (forum, non confirmé par Apple) : <https://developer.apple.com/forums/thread/839182>.
- **Le budget des widgets est d'environ 40 à 70 rechargements par jour.** Les rechargements demandés quand l'app est au premier plan ne comptent pas. Source : <https://developer.apple.com/documentation/widgetkit/keeping-a-widget-up-to-date>. Un rechargement déclenché par un push en arrière-plan **compte** (déduction : l'app n'est pas au premier plan).
- **La Live Activity par push est la surface fiable pour les sessions.**
  - Le **démarrage par push** n'existe pas en iOS 17.1 et avant ; la mise à jour et la fin, si.
  - Le démarrage exige `event: start`, `attributes-type`, `attributes` et **une `alert`**.
  - En-têtes : `apns-push-type: liveactivity`, topic `<bundleID>.push-type.liveactivity`, priorité 5 (hors budget) ou 10 (budgétée).
  - `NSSupportsLiveActivitiesFrequentUpdates` élargit le budget ; `stale-date` et `dismissal-date` sont disponibles.
  - Le système ignore une mise à jour reçue après la fin de l'activité.
  - Source : <https://developer.apple.com/documentation/activitykit/starting-and-updating-live-activities-with-activitykit-push-notifications>.
  - FCM HTTP v1 sait aussi le faire (`live_activity_token`), mais il faut alors le SDK FCM sur iOS : <https://firebase.google.com/docs/cloud-messaging/customize-messages/live-activity>. → **APNs direct** depuis Functions (clé .p8, connexion par jeton), plus simple que d'ajouter `@react-native-firebase/messaging`.
- **Expo Push ne couvre ni `liveactivity` ni `widgets`.** La page d'envoi n'en parle pas : <https://docs.expo.dev/push-notifications/sending-notifications/>. → Un petit client APNs HTTP/2 est nécessaire dans Functions : `node:http2` et un jeton JWT ES256, sans dépendance obligatoire.
- **Le push en arrière-plan traité sans JS** passe par un `ExpoAppDelegateSubscriber` natif, relayé par `ExpoAppDelegateSubscriberManager` (`expo/ios/Expo/ExpoAppDelegate.swift` l. 147-150). `expo-notifications` reçoit aussi le message, sans conflit : son abonné est `NotificationsAppDelegateSubscriber.swift` l. 23. La fusion des `fetchCompletionHandler` est **à vérifier sur appareil**.

### Expo (côté app)

- `registerTaskAsync` exige `expo-task-manager` et `TaskManager.defineTask` (<https://docs.expo.dev/push-notifications/what-you-need-to-know/>). Ce **n'est pas** retenu comme chemin principal (option B, §2.4). Il reste un secours si le service natif Android posait problème.

---

## 4. Étapes livrables

Chaque étape se livre et se teste seule. « Natif » signifie qu'il faut recompiler : Android en local (2 à 3 min en incrémental), iOS par un build EAS dans le cloud, puis envoi à App Store Connect. Il n'y a pas d'expo-updates : une étape JS seule n'atteint les utilisateurs qu'avec la prochaine version publiée sur les stores.

### E0. Décisions et mesure de départ (0,5 j, aucun natif, aucun déploiement)
- Le fondateur tranche les points du §7.
- Vérifier l'**ID de projet Expo** (`pushTokenService.ts` l. 23 contre `app.json` l. 277).
- Écrire le protocole de test (critères repris de `PLAN_ACTION_WIDGET.md`, S6) :
  - échec si plus de 2 % d'affichages faux ;
  - échec si la médiane dépasse 30 s ;
  - cible pour ce chantier : **p50 < 10 s sur Android, écran allumé ou en veille légère**.

### E1. Extraire les entrées du widget en fonction pure (1 j, JS seul)
- Nouveau `utils/widgetInputs.ts` : `buildNowWidgetInput(rawEvents, nursing, prefs, now, tz)`. Il reprend `useNowWidgetSync.ts` l. 100-173, le calcul de `totalSleepMinutes` (`home.tsx` vers l. 1604-1640) et la détection sommeil/promenade (`home.tsx` l. 633-656).
- `utils/widgetSnapshot.ts` : `formatClock(ms, tz?)` et le jour « aujourd'hui » acceptent un fuseau IANA, avec `Intl.DateTimeFormat`. Par défaut, celui du téléphone : comportement actuel inchangé.
- `hooks/useNowWidgetSync.ts` appelle la fonction extraite. Le comportement est identique.
- Tests : `__tests__/widgetInputs.test.ts`, plus des **fixtures JSON partagées** dans `__tests__/fixtures/widget/*.json` (entrées brutes → props attendues), dont :
  - un fuseau différent ;
  - le passage de minuit ;
  - une tétée en pause ;
  - deux sessions ;
  - des événements d'un autre enfant.

### E2. Miroir serveur (1 j, JS seul, pas de déploiement)
- `functions/lib/widgetSnapshot.js` et `functions/lib/widgetInputs.js` (CommonJS), en tête : « Miroir de utils/… : garder les deux alignés », sur le modèle de `quietHours`.
- Test de parité : `functions/__tests__/widgetSnapshotParity.test.js` rejoue les mêmes fixtures (lecture du dossier `__tests__/fixtures/widget`). L'app a aussi un test qui `require` le fichier serveur, comme `__tests__/voiceLlmMapper.test.ts` le fait déjà avec `functions/lib`.
- `functions/lib/widgetAudience.js` :
  - lecture des accès ;
  - lecture des appareils (`device_tokens` où `userId` est dans les accès, `widgetChildId == childId`, `widgetCap >= 1`) ;
  - statut Premium via `subscriptions/{uid}` et la règle de `billing/subscription.js` (`hasUnlimitedFeature` / `isEntitledStatus`). L'équivalence avec `usePremium` côté app **reste à confirmer**.
- Tests unitaires avec `functions/__tests__/memoryFirestore.js`.

### E3. Enregistrement de l'appareil pour le widget (0,5 j, JS seul)
- `services/pushTokenService.ts` (ou nouveau `services/widgetDeviceService.ts`) écrit dans `device_tokens/{id}` :
  - `tz` (`Intl.DateTimeFormat().resolvedOptions().timeZone`) ;
  - `widgetChildId` (enfant affiché, mis à jour par `useNowWidgetSync` au changement de bébé, avec un anti-rebond) ;
  - `widgetCap` (1 = récepteur Android natif présent, 2 = abonné iOS présent, 3 = jeton WidgetKit) ;
  - `widgetPush: true`, distinct de `enabled`, qui reste le réglage des notifications.
- Les règles `device_tokens` (`firestore.rules` l. 550-570) ne limitent pas les clés : **pas de déploiement de règles**. À confirmer en relisant le bloc entier.
- Android : obtenir le jeton même sans permission de notification. Le comportement de `getExpoPushTokenAsync` sans permission sur Android est **non vérifié** : à tester. Il faut accepter que les messages soient alors rétrogradés.
- Ce code ne sert qu'avec E4/E5. Il peut sortir dans la même version.

### E4. Récepteur Android natif (2 j, natif, build Android local)
- Nouveau module local `modules/widget-push/`. Il contient :
  - `expo-module.config.json` ;
  - `android/.../WidgetPushService.kt`, qui étend `expo.modules.notifications.service.ExpoFirebaseMessagingService` :
    - `onMessageReceived` : lire `data["body"]` (JSON Expo), sinon `data`. Si `t == "w1"`, appliquer les gardes du §2.2, écrire `__expo_widgets_BebeMaintenant_props` et `__sb_widget_seq` (`commit = true`), puis diffuser `ACTION_APPWIDGET_UPDATE` vers `${packageName}.BebeMaintenantProvider` avec les ids du widget. Ne **pas** appeler `super` dans ce cas : aucune notification ni tâche à lancer. Sinon, `super.onMessageReceived` ;
    - noter `receivedAt` et `s` dans un petit journal circulaire en SharedPreferences (20 entrées), pour la mesure ;
  - un plugin de config qui déclare le `<service>` avec l'intent-filter `com.google.firebase.MESSAGING_EVENT` (priorité 0 ou plus).
- Dépendances : `expo-notifications` (déjà présent) et Firebase Messaging (transitif). **Aucune nouvelle dépendance npm.** Si le module devait ajouter une dépendance Gradle explicite, elle serait **à vérifier**.
- Côté JS :
  - `services/widgetSync.ts` : `invalidateWidgetKey()`, appelé au retour au premier plan. Sinon, après une écriture native, l'app pourrait ne jamais réécrire un contenu égal à son ancien `lastKey` (l. 41-42) ;
  - écrire `__sb_widget_child` via un petit `Function` du module ;
  - au démarrage, envoyer le journal de réception (`widget_push_stats`, sans donnée personnelle) pour mesurer la latence.
- Tests :
  - un test unitaire Kotlin pour les gardes (JVM, Robolectric si disponible, **à vérifier**) ;
  - un test sur appareil avec un message envoyé à la main depuis l'outil Expo (<https://expo.dev/notifications>) ou par un script `functions/scripts/sendWidgetTestPush.js` : app tuée par balayage, écran éteint ;
  - un **test de non-régression** : un rappel classique (`reminders.js`) doit toujours s'afficher.

### E5. Cloud Function de diffusion, Android seulement (1,5 j, déploiement à demander)
- `functions/src/widget/fanout.js` :
  - `onWidgetEventWrite = onDocumentWritten("events/{eventId}")` ;
  - `onWidgetLiveWrite = onDocumentWritten("children/{childId}/live/{sessionId}")` ;
  - région europe-west1, `memory: 256MiB`, `concurrency` élevée, `retry: false` (le prochain événement corrige).
- Le filtre arrive tôt : type et date avant toute lecture. Un événement modifié compte s'il se termine (`heureFin`) ou si sa date ou sa quantité change. Les suppressions passent par `deleteEventCascade` et un `delete` reste un `write` : elles sont couvertes.
- Interrupteur `config/widgetPush` (`enabled`, `allowUids[]`) pour la bêta. Journaux structurés sans prénom ni contenu (le modèle de `logJobSummary`).
- Exports dans `functions/index.js`, mise à jour de `exportsSnapshot.expected.json`. Index `events(childId, date)` : il existe déjà (`firestore.indexes.json` l. 22-34).
- Envoi : `sendPushWithTickets` et `removeDeadTokens` (`functions/lib/reminders.js`) ; `priority` selon §3 ; `ttl: 900`. Ne pas envoyer à l'appareil d'où vient l'écriture n'est pas possible depuis un trigger (l'appareil y est inconnu). Ce n'est pas grave : la garde « premier plan » l'ignore.
- **À demander au fondateur** : `firebase deploy --only functions:onWidgetEventWrite,functions:onWidgetLiveWrite`, d'abord pour la liste d'utilisateurs autorisés.
- Tests :
  - unitaires : filtre, audience, regroupement, taille du message ;
  - émulateur Firestore (`npm run test:functions`) ;
  - terrain, voir E6.

### E6. Campagne de fiabilité Android (2 j, aucun code)
- Au moins 2 téléphones, dont **un Samsung**. 50 actions par cas, latence mesurée (serveur `sentAt` contre `receivedAt` du journal E4) :
  1. app au premier plan, puis en arrière-plan ;
  2. app **tuée par balayage** ;
  3. écran éteint depuis 1 h, puis **Doze forcé** : `adb shell dumpsys deviceidle force-idle` ;
  4. bucket `restricted` : `adb shell am set-standby-bucket com.tesfa.suivibaby restricted` ;
  5. Samsung : « Mettre l'appli en veille », puis « veille profonde » ;
  6. permission de notification refusée ;
  7. **arrêt forcé** (échec attendu, on le documente) ;
  8. hors ligne 10 min, puis retour du réseau.
- Suivi de `getOriginalPriority()` contre `getPriority()` dans le journal, pour voir les rétrogradations.
- Décision « go / no go » pour tous les utilisateurs, avec le fondateur.

### E7. iOS, push en arrière-plan + abonné natif (1,5 j, build EAS)
- `app.json` : `ios.infoPlist.UIBackgroundModes: ["remote-notification"]`.
- Module `modules/widget-push/ios/WidgetPushAppDelegateSubscriber.swift` (`ExpoAppDelegateSubscriber`) :
  - ignore le message si `t != "w1"` ;
  - mêmes gardes ;
  - écrit `__expo_widgets_BebeMaintenant_timeline = [{timestamp, props}]` dans l'App Group (format de `build/Widgets.js` l. 35-39 ; le dictionnaire exact est **à confirmer** dans `WidgetsRecords.swift`) ;
  - appelle `WidgetCenter.shared.reloadTimelines(ofKind: "BebeMaintenant")` puis `completionHandler(.newData)`.
- Serveur : `contentAvailable: true`, `priority: "normal"` (APNs 5), sans titre ; on n'en envoie **qu'au plus 2 ou 3 par heure et par appareil** (débit limité via `device_tokens.lastWidgetPushAt`), en donnant la priorité aux débuts et fins de session.
- Tests : appareil réel en TestFlight ; app en arrière-plan, app suspendue, **app fermée de force (échec attendu)**, mode Économie d'énergie.

### E8. iOS 26+, push WidgetKit (3 j, build EAS, patch expo-widgets, nouveau secret)
- Patch `expo-widgets` (iOS) :
  - `WidgetPushHandler` qui reçoit le jeton dans `pushTokenDidChange`, le range dans l'App Group, et le donne à l'app au prochain lancement ; c'est l'app qui l'envoie à `device_tokens.widgetApnsToken`. Envoyer depuis l'extension serait possible mais demanderait l'authentification dans l'extension ;
  - `.pushHandler(...)` sur la configuration, sous `if #available(iOS 26, *)` ;
  - dans `WidgetsTimelineProvider.getTimeline`, un `URLSession` vers un endpoint HTTPS `widgetSnapshot?d=<deviceId>` signé par une **clé de widget par appareil**, générée par l'app et rangée dans le trousseau partagé de l'App Group. Le serveur ne garde que son hash. L'extension écrit la réponse dans `_timeline`, puis rend le widget, avec un repli sur les données en cache si le délai est dépassé (environ 5 s).
- Entitlement push sur la cible de l'extension (plugin `withWidgets`, ou patch du plugin, **à vérifier**) et profil EAS de l'extension.
- Serveur : `functions/lib/apns.js` (HTTP/2 et JWT ES256). Secrets `APNS_KEY_P8`, `APNS_KEY_ID`, `APNS_TEAM_ID` via `firebase functions:secrets:set` (**à faire par le fondateur**). Nouvel endpoint `widgetSnapshot` (onRequest), avec contrôle d'accès à l'enfant.
- Tests : iPhone sous iOS 26, widget visible et caché, 30 pushes en 1 h pour **observer le budget réel**, qu'Apple ne documente pas.

### E9. Live Activity démarrée par push pour les sessions (4 à 5 j, build EAS, déjà prévue en S4-S5)
- Côté app : `enablePushNotifications: true` dans le plugin `expo-widgets` ; enregistrement du jeton push-to-start (`onPushToStartTokenReceived`) et des jetons d'activité (`onTokenReceived`) dans `device_tokens` ; mise en page de la Live Activity (`ContentState.props` = props JSON).
- Côté serveur, dans le même trigger :
  - session démarrée par **un autre** aidant → `event: start` avec une `alert` obligatoire (texte sobre, **sans auteur pour une tétée**) ;
  - mises à jour en priorité 5 ;
  - fin → `event: end` avec `dismissal-date` ;
  - `stale-date` à l'expiration du brouillon (3 h pour une tétée, `nursingTimer.ts` l. 38-39).
- Limites : une activité dure au plus 8 h (le sommeil de nuit est désactivé par défaut, `WIDGET_SPEC.md`) ; l'utilisateur doit avoir autorisé les Live Activities.

### E10. Filet de fraîcheur (0,5 j, JS et mise en page)
- `widgets/BebeMaintenant.*.tsx` affichent « màj HH:MM » si `now - generatedAtMs > 30 min`, et « Ouvrir pour actualiser » si une session est affichée depuis plus de 2 h. Côté Android, `RefreshAtView` (déjà patché) programme le redessin au passage des 30 min.

---

## 5. Latence et fiabilité attendues

Les latences sont des **ordres de grandeur à mesurer en E6 et E7** : aucune doc officielle ne donne de chiffre.

| Plateforme / cas | Chemin | Latence attendue | Fiabilité |
|---|---|---|---|
| Android, écran allumé ou app en arrière-plan | FCM data, natif | 1 à 5 s (trigger ≈ 0,5-2 s, Expo → FCM < 1 s) | Haute |
| Android, écran éteint, Doze, message de session (haute priorité) | idem | 1 à 10 s | Haute tant que FCM ne rétrograde pas. Le risque grandit si l'app envoie beaucoup de messages haute priorité sans notification visible : d'où E9/S5 (notification permanente) |
| Android, Doze, repas ou couche (priorité normale) | idem | Jusqu'à la prochaine fenêtre de maintenance (de quelques minutes à plus d'une heure en Doze profond) | Livré, mais en retard |
| Android, bucket `restricted`, Samsung « veille profonde » | idem | Retard important, voire **non livré** | Faible. Il faut demander à l'utilisateur de désactiver l'optimisation de batterie (écran d'aide) |
| Android, **arrêt forcé** | — | **Jamais** avant la prochaine ouverture | Nulle (documenté par Firebase) |
| Android, notifications refusées | idem | Rétrogradé (comme la priorité normale) | Moyenne |
| iOS 17.2+, session démarrée ou arrêtée par un autre aidant | Live Activity par push | Quelques secondes | Haute. Elle dépend de l'autorisation Live Activities et du budget (priorité 10 réservée au début et à la fin) |
| iOS 26+, widget d'écran d'accueil | push WidgetKit → endpoint | Secondes à minutes (« opportunistically ») | Moyenne, budget non publié |
| iOS < 26, widget | push en arrière-plan | Secondes à heures (au plus 2 ou 3 par heure, regroupés) | Faible à moyenne |
| iOS, app **fermée de force** | push en arrière-plan | **Jamais** avant le prochain lancement | Nulle. La Live Activity et le push WidgetKit ne dépendent pas de l'app et restent valables (**à confirmer sur appareil**) |
| Tous, hors ligne | — | Au retour du réseau, dans la limite du `ttl` (900 s) ; au-delà, prochain événement ou ouverture de l'app | Filet « màj HH:MM » |

**Cas où ça ne marchera pas** : arrêt forcé (sur les deux plateformes), veille profonde Samsung ou bucket `restricted`, iOS < 26 avec l'app fermée de force (le widget ne bouge pas, seule la Live Activity reste juste), utilisateur sans aucun jeton (ancienne version de l'app, ou notifications refusées sur iOS).

---

## 6. Coûts

Hypothèse : un foyer actif = 1 enfant, 3 appareils, environ 40 écritures utiles par jour (repas, couches, sessions et environ 10 bascules de tétée).

- **Functions** : 40 invocations par jour et par enfant, soit environ 1 200 par mois. Une lecture coûte environ 40 à 60 documents (les événements d'hier et d'aujourd'hui, les accès, les appareils, les préférences, l'abonnement), soit environ 60 000 lectures par mois et par enfant actif. En ordre de grandeur, environ 0,02 à 0,04 € par mois et par enfant actif. Les tarifs exacts de Firestore et de Functions en europe-west1 sont **à vérifier** sur la console de facturation. Le palier gratuit des invocations (2 M par mois) couvre des milliers de foyers. Optimisation possible plus tard : un document dénormalisé `children/{c}/widget/state` maintenu par le trigger.
- **Les écritures ponctuelles des autres types d'événements** (jalon, photo, etc.) s'arrêtent au filtre, sans aucune lecture : seule l'invocation est facturée.
- **FCM, APNs, Expo Push** : gratuits. Expo Push limite à 600 notifications par seconde et par projet (doc Expo), sans effet à cette échelle.
- **Batterie Android** : le chemin natif réveille le processus quelques centaines de millisecondes, sans démarrer React Native ni ouvrir de connexion Firestore. C'est négligeable devant une tâche JS « headless » (option B : 1 à 3 s de CPU et du réseau à chaque message).
- **Batterie iOS** : la Live Activity et le push WidgetKit sont gérés par le système. Le push en arrière-plan est plafonné par Apple.
- **Temps de développement** : environ 9 j pour Android (E1-E6), 1,5 j pour iOS en arrière-plan, 3 j pour iOS 26 WidgetKit, 4 à 5 j pour la Live Activity (déjà prévue au plan S4-S5).

---

## 7. Risques et parades

| Risque | Parade |
|---|---|
| FCM rétrograde les messages data haute priorité (aucune notification visible) | Haute priorité seulement au début et à la fin des sessions. Notification permanente Android (S5) pour que ces messages soient « visibles ». Suivi de `getOriginalPriority` contre `getPriority`. |
| Deux services `MESSAGING_EVENT` : résolution d'Android incertaine | Test de non-régression E4 sur les rappels. En secours : patch de `expo-notifications` (`FirebaseMessagingDelegate.onMessageReceived`), au lieu d'un second service. |
| Écart de calcul entre l'app et le serveur (fuseau, regroupements, minuit) | Fixtures partagées et test de parité dans les deux suites. Le widget affiche toujours des heures recalculées dans son propre rendu (`clock()` dans la mise en page Android) à partir des `ms`. Les libellés préformatés (`sinceLabel`, `lastMealLabel`) sont calculés avec le `tz` de l'appareil. |
| Données d'un autre bébé | Filtre serveur `widgetChildId`, garde native `c == childId`, et l'app réécrit au premier plan. |
| Message ancien qui écrase un récent | Séquence = `readTime` du serveur ; on n'applique que si elle est strictement supérieure. |
| `lastKey` bloque la réécriture par l'app après une écriture native | `invalidateWidgetKey()` au retour au premier plan (E4). |
| Patch `expo-widgets` à rebaser à chaque montée de version (déjà le cas) | Garder E8 (iOS) dans un fichier de patch séparé et documenté. Prévoir un test de démarrage « `nativeLevel` » comme l'existant. |
| Confidentialité : le push transporte des données de santé (heures de repas, couches) | Chiffrement en transit (TLS jusqu'à FCM et APNs). Aucun nom d'aidant. Seul le prénom de l'enfant, déjà affiché par le widget. Contrôle `access` et consentement santé avant tout envoi. À mentionner dans la politique de confidentialité (sous-traitants Google, Apple, Expo : **à confirmer avec le fondateur**). |
| Jetons Expo émis pour un autre projet (ID différent) | À vérifier en E0, avant tout le reste. |
| Coût d'un emballement (boucle d'écriture) | Le trigger n'écrit jamais dans `events` ni dans `live` : pas de boucle. Interrupteur `config/widgetPush`. Plafond par enfant (au plus 1 diffusion toutes les 2 s, en mémoire de l'instance) : « au mieux », car il peut y avoir plusieurs instances. |
| iOS 26 : `getTimeline` pas toujours appelé (forum) | Le push WidgetKit reste un complément. La Live Activity couvre les sessions. |
| Live Activity démarrée par push = alerte obligatoire (bruit la nuit) | Réglage par aidant (« Afficher les sessions des autres aidants »), avec les heures calmes existantes (`quietHours`). Pas de démarrage de nuit par défaut. |

### À décider par le fondateur

1. **Accepter la logique en double app/serveur** (option A), contrôlée par les tests de parité, plutôt qu'une tâche JS d'arrière-plan moins fiable.
2. **Périmètre iOS** : Live Activity démarrée par push (avec une alerte visible à chaque début de session d'un autre aidant) ? Et à partir de quelle étape ? Le push WidgetKit est réservé à iOS 26+ : quelle part du parc ?
3. **Notifications et priorité Android** : accepter que repas et couches arrivent « dès que possible », parfois avec plusieurs minutes de retard écran éteint, et que seuls les débuts et fins de session soient immédiats. Avancer ou non la notification permanente Android (S5) pour sécuriser la haute priorité.
4. **Envoyer le widget même si l'aidant a coupé les notifications** (`enabled: false`) : recommandé oui, avec un champ séparé `widgetPush`.
5. **Déploiements à autoriser** :
   - les 2 triggers et l'endpoint `widgetSnapshot` (E5, E8) ;
   - le document `config/widgetPush` ;
   - les secrets APNs (E8/E9, la clé .p8 est créée par le fondateur dans le compte Apple Developer) ;
   - la mise à jour de la politique de confidentialité si elle est jugée nécessaire.
6. **Écran d'aide « optimisation de batterie »** (Samsung, Xiaomi) : le montrer à qui ? Seulement si le widget est posé et que le journal E4 montre des retards ?
7. **Confirmer l'ID du projet Expo** (point E0).

---

## Sources

**Apple**
- [Updating widgets with WidgetKit push notifications](https://developer.apple.com/documentation/widgetkit/updating-widgets-with-widgetkit-push-notifications)
- [WidgetPushHandler (iOS 26.0+)](https://developer.apple.com/documentation/widgetkit/widgetpushhandler)
- [Keeping a widget up to date](https://developer.apple.com/documentation/widgetkit/keeping-a-widget-up-to-date)
- [Starting and updating Live Activities with ActivityKit push notifications](https://developer.apple.com/documentation/activitykit/starting-and-updating-live-activities-with-activitykit-push-notifications)
- [Pushing background updates to your App](https://developer.apple.com/documentation/usernotifications/pushing-background-updates-to-your-app)
- [Forum : push WidgetKit iOS 26 et getTimeline (non officiel)](https://developer.apple.com/forums/thread/839182)

**Firebase et Android**
- [FCM : priorité des messages Android](https://firebase.google.com/docs/cloud-messaging/android/message-priority)
- [FCM : réception sur Android](https://firebase.google.com/docs/cloud-messaging/android/receive)
- [Blog Firebase : FCM sur Android (2025)](https://firebase.blog/posts/2025/04/fcm-on-android)
- [Blog Firebase : taux de livraison FCM (arrêt forcé)](https://firebase.blog/posts/2024/07/understand-fcm-delivery-rates/)
- [FCM : Live Activity](https://firebase.google.com/docs/cloud-messaging/customize-messages/live-activity)
- [Android 13 : batterie et FCM haute priorité](https://developer.android.com/about/versions/13/changes/battery)
- [Android : App Standby Buckets](https://developer.android.com/topic/performance/appstandby)
- [dontkillmyapp : Samsung (non officiel)](https://dontkillmyapp.com/samsung)

**Expo**
- [Expo : what you need to know (notifications headless)](https://docs.expo.dev/push-notifications/what-you-need-to-know/)
- [Expo : envoyer avec Expo Push (priority, contentAvailable, 4096 octets, 600/s)](https://docs.expo.dev/push-notifications/sending-notifications/)
