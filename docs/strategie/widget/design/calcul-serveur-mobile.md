# Calcul serveur du widget : angle plateforme mobile

Réponse de l'agent ECC « kotlin-reviewer » au brief `BRIEF_CALCUL_SERVEUR.md` (2026-11-13). URLs citées de mémoire ; chiffres marqués « non vérifié ».

## Verdict
L'option C (signal seul, le téléphone relit Firestore et calcule) est nettement moins fiable que A/B (props calculées par le serveur) sur Android, un peu moins sur iOS. Retenir A ou B ; pour la plateforme elles sont équivalentes, B évite la divergence.

## Pourquoi
- Android : seul un FCM haute priorité ouvre une courte fenêtre CPU + réseau en Doze (https://firebase.google.com/docs/cloud-messaging/android-message-priority). `onMessageReceived` doit finir en ~10-20 s (non vérifié). Buckets App Standby et déclassement des data-only : communs à toutes les options.
- C impose dans cette fenêtre : démarrage à froid RN + Hermes (0,5-3 s, non mesuré), restauration de session (AsyncStorage, `config/firebase.ts`), rafraîchissement du jeton (> 1 h), connexion Firestore à froid (pas de cache persistant). `expo-task-manager` absent. En natif pur, il faudrait réécrire auth et calcul en Kotlin : un troisième exemplaire.
- A/B : un `FirebaseMessagingService` Kotlin écrit `__expo_widgets_BebeMaintenant_props` et appelle `WidgetsUpdater.reload` (~100 lignes).
- iOS : notification silencieuse limitée et non livrée après fermeture forcée, ~30 s ; C y ajoute réveil complet + réseau. Push WidgetKit (iOS 26) et Live Activity supposent du contenu prêt côté serveur.

## Scénarios où C casse
Nuit en Doze (la relecture dépasse la fenêtre) ; jeton expiré ; bucket « rare » ; veille profonde Samsung ; budget iOS épuisé. App arrêtée de force : tout échoue, A/B/C confondues.

## Filets communs
Chronos natifs, libellé « màj HH:MM », rafraîchissement complet à l'ouverture.

## À mesurer
Livraison data-only haute priorité sur 2-3 appareils (dont Samsung) après 12 h sans ouverture ; taux de déclassement ; durée du premier rendu Hermes du widget à froid.
