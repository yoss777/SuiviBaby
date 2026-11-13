# Brief : widget « Bébé maintenant » en temps réel, comme les notifications

## Le problème (décision du fondateur)

Aujourd'hui, le widget n'est mis à jour **que quand l'app tourne sur ce téléphone** : l'app calcule les données (`utils/widgetSnapshot.ts`, `hooks/useNowWidgetSync.ts`) et les envoie au widget (`services/widgetSync.ts`, `updateSnapshot`). Si le père arrête la sieste sur son téléphone, celui de la mère affiche encore « Sieste · 2h10 » tant qu'elle n'ouvre pas l'app. On croit que bébé dort alors qu'il est réveillé depuis 30 min : le widget perd sa raison d'être (une info rapide **et fiable**).

Le fondateur veut du **temps réel, comme les notifications** : quelques secondes après une saisie sur n'importe quel téléphone du foyer, le widget de tous les autres téléphones est juste, app fermée. Un simple indicateur « màj il y a 25 min » a été refusé comme solution (il peut rester en filet de sécurité).

## Ce qui existe

- **Expo SDK** (voir `package.json`), React Native, Firebase (Firestore, Auth, Cloud Functions Node dans `functions/`, région à lire dans le code).
- **Notifications** : `expo-notifications` dans l'app ; jetons Expo enregistrés par appareil (`services/pushTokenService.ts`) ; envoi serveur via `expo-server-sdk` (`functions/src/shared/runtime.js`, `functions/src/notifications/reminders.js`). Pas de `@react-native-firebase/messaging` (seulement `@react-native-firebase/app`), pas d'`expo-task-manager`.
- **Écritures d'événements** : en partie par callables (`functions/src/events/callables.js` : `validateAndCreateEvent`, `validateAndUpdateEvent`, `deleteEventCascade`), en partie en direct (`setDoc` dans `services/eventsService.ts`). La tétée en cours est un document à part, partagé par le foyer (`components/forms/nursingTimer.ts`). Promenade et sommeil en cours : à repérer (`home.tsx`, `promenadeEnCours`, `sommeilEnCours`).
- **Widget Android** : `expo-widgets` ~58.0.28 (Jetpack Glance), patché (`patches/expo-widgets+58.0.28.patch`). Les props sont stockées en SharedPreferences (`__expo_widgets_BebeMaintenant_props`) ; `updateSnapshot` les remplace et redessine. Chronos natifs, réveil programmé `RefreshAtView`.
- **Widget iOS** : WidgetKit via `expo-widgets` (`widgets/BebeMaintenant.ios.tsx`). `expo-widgets` gère aussi les **Live Activities**, avec jeton de push (`node_modules/expo-widgets/ios/LiveActivity*.swift`).
- **Builds** : Android compilé en local (incrémental 2–3 min) ; iOS sur EAS cloud. Pas d'expo-updates.
- Règles du projet : jamais d'auteur pour une tétée (seule la mère allaite) ; aucun déploiement de fonction ou de règles sans accord explicite du fondateur.

## Pistes connues (à vérifier, pas à croire)

- Android : message FCM **data-only** à haute priorité → tâche JS en arrière-plan (`expo-notifications` + `expo-task-manager`, ou `@react-native-firebase/messaging` `setBackgroundMessageHandler`) → recalcul → `updateSnapshot`. Ou bien : le serveur calcule lui-même les props du widget et le téléphone les écrit sans lire Firestore. Question : quel chemin est le plus fiable (Doze, app tuée, Samsung qui tue les apps en arrière-plan, quota de messages haute priorité) ?
- iOS : les notifications silencieuses (`content-available`) sont limitées et non livrées si l'app a été fermée de force. Pistes : **mise à jour de widget par push** (WidgetKit, à vérifier : existe-t-elle, depuis quelle version d'iOS ?) ; **Live Activity** mise à jour par push (ActivityKit) pour les sessions en cours, et peut-être démarrée à distance (push-to-start, iOS 17.2+) ; notification visible + extension de service.
- Où calculer : dupliquer `buildNowWidgetProps` côté serveur (Functions en JS) ou faire relire Firestore par le téléphone en arrière-plan.

## Ce qu'on attend

Un **plan détaillé, en étapes livrables**, écrit dans le fichier indiqué par ton prompt, en français :

1. **Architecture cible** (schéma texte) : déclencheur serveur, contenu du message, réception Android, réception iOS, calcul des données, garde contre les données d'un autre bébé et contre les messages arrivés dans le désordre (horodatage, version).
2. **Choix argumentés** avec preuves : docs officielles (Android, Apple, Expo, Firebase) citées avec leur URL, lignes de code du projet. Marque « non vérifié » ce que tu n'as pas pu vérifier.
3. **Étapes** dans l'ordre, chacune livrable et testable seule : fichiers touchés, dépendances natives ajoutées (donc recompilation), déploiements à demander au fondateur, tests (unitaires, sur appareil : app tuée, téléphone en veille, mode économie Samsung).
4. **Latence attendue** et **fiabilité** par plateforme, avec les cas où ça ne marchera pas.
5. **Coûts** : Functions, FCM/APNs, batterie.
6. **Risques et parades** ; ce qui reste à décider par le fondateur.
