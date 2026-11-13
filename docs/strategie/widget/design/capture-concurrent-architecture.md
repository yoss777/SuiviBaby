# Capture d'un concurrent : angle architecture (ECC architect, 2026-11-13)

## Constat technique
Le JS du widget (Hermes isolé, `WidgetsInteraction.handle` sur le thread principal) n'a ni réseau ni Firebase : il ne peut que changer l'affichage. Le natif n'a pas la session Firebase (gérée par le SDK JS). iOS : `WidgetUserInteraction.perform()` idem.

## Architecture faisable pour la saisie
1. Patch Android : interception native des actions dans `onReceive`, anti-rebond, `idempotencyKey`, état « en attente », file WorkManager (hors ligne). iOS : AppIntent dédié + file dans l'App Group.
2. Auth par clé de widget par appareil (même clé que l'étape E8 du temps réel), endpoint `widgetAction` avec `checkChildAccess`, révocation à la déconnexion, boutons masqués pour contributeur/observateur.
3. Doublons : `idempotentEventId` existant (`callables.js` l. 46-89), heure = heure de l'appui.
4. Tétée partagée : envoyer une intention (« basculer gauche »), appliquée par le serveur en transaction ; « Stop » crée l'événement et la fin de session dans un même batch ; jamais d'auteur.
5. Accusé de réception dans le push temps réel pour lever l'état « en attente ».

## Verdict
Oui, après le temps réel Android. Pipi / selle d'abord, puis la tétée par intention. Pas d'action depuis l'écran verrouillé sans déverrouillage.
Écran verrouillé et montre : notification permanente de session sur Android (relayée sur Wear OS avec ses actions) ; Live Activity sur iOS. App de montre dédiée : à différer.

## Trois priorités
1. Temps réel Android (E1-E5) avec accusé de réception.
2. Notification permanente (Android) et Live Activity (iOS) avec Pause / côté / Fin.
3. Boutons pipi / selle ; en JS seul : côté actif de la tétée et « rappel dans X min ».
