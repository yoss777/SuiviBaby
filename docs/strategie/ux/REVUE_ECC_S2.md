# Revue ECC n° 1 (fin de S2) : widget « Bébé maintenant »

Date : 2026-11-13 · Branche `feat/widget-v1` contre `main` (16 commits, ~78 fichiers).
Périmètre : tétée partagée (F1), widget Android, calcul partagé app / serveur (`functions/shared/widget`), lisibilité au repos, enregistrement de l'appareil (E3), récepteur natif Android (E4, `modules/widget-push`), diffusion serveur (E5, non déployée), filet de fraîcheur (E10), liens profonds par zone.

Cinq volets lus en parallèle, lecture seule, chaque constat vérifié dans le code par l'agent :

| Volet | Agent | Note |
|---|---|---|
| Code TS / React Native | `ecc:typescript-reviewer` | 14 / 20 |
| Sécurité | `ecc:security-reviewer` | 15,5 / 20 |
| Natif Android | `ecc:kotlin-reviewer` | 14 / 20 |
| UI/UX (grille des audits V1-V3) | cellule UI/UX (`ui-ux-pro-max`) | 14 / 20 |
| Erreurs silencieuses | `ecc:silent-failure-hunter` | 11 / 20 |
| **Moyenne** | | **13,7 / 20** |

Vérifications d'exécution faites pendant la revue : 1 991 tests app, 637 tests Functions, 264 tests de règles (émulateur), 9 tests Kotlin JVM, `tsc` et lint propres. Essai réel sur Samsung S21 Ultra : lisibilité au repos et lien profond « Change » vérifiés ; envoi de test vers le récepteur **refusé par Expo (`InvalidCredentials`)**.

## Fait marquant hors code

Le projet Expo actuel `@yoss7/suivibaby` n'a **aucune clé FCM** : toute notification à distance vers Android échoue (widget et rappels). À faire par Yoss : clé de compte de service Firebase importée via `eas credentials -p android` (FCM V1). Bloque E4 sur appareil et E6.

## P0 (corrigés avant le sprint suivant)

| # | Constat | Correction | Commit |
|---|---|---|---|
| P0-1 | Tickets Expo en erreur (InvalidCredentials…) comptés sans journal : fanout du widget « sent, errors: 0 » alors que rien ne part | `sendPushWithTickets` journalise en erreur les codes reçus ; fanout : `failed`, motif « failed » | `e2bf902` |
| P0-2 | Même défaut dans les rappels (`continue` silencieux) | compteur `ticketFailures` + journal d'erreur | `e2bf902` |

## P1

| # | Volet | Constat | Statut |
|---|---|---|---|
| S1 | Sécurité / code | Le widget garde prénom et données de santé après déconnexion | **Corrigé** `68d5478` (widget vidé, récepteur réinitialisé) |
| S2 | Sécurité | `updatedBy` (auteur) stocké dans `live/nursing`, lisible par le foyer | **Corrigé côté app** `68d5478` ; règle tolérante pour les anciennes versions, **déploiement des règles à autoriser** |
| N0 | Sécurité / natif | Message appliqué si aucun bébé n'est affiché | **Corrigé** `68d5478` |
| C2-C3 | Code | `setWidgetChild` : cache non remis à zéro à la déconnexion ; aucun nouvel essai si le jeton n'est pas encore connu | **Corrigé** `389e206` |
| C4 | Code | Au changement de bébé, la tétée de l'ancien bébé peut partir dans le widget du nouveau | **Corrigé** `389e206` |
| C5 | Code | Aucun test pour `useNowWidgetSync` ni `widgetSync` | **Corrigé** `389e206` |
| C6 | Code | Tétée en pause : clé de contenu instable, widget réécrit à chaque passage | **Corrigé** `389e206` |
| C7 | Code | Lien profond au démarrage à froid effacé avant le chargement des bébés | **Corrigé** `389e206` |
| N1 | Natif | Chrono en pause : la durée dérive quand le lanceur réapplique les vues | à corriger (patch) |
| N2 | Natif | Repli incomplet si un message du widget fait planter le traitement (peut finir en notification) | **Corrigé** `70ff605` |
| U1 | UI/UX | Rappel repas dépassé non annoncé à TalkBack pendant une session | **Corrigé** `70ff605` |
| U2 | UI/UX | « 1h51 » au repos se lit comme une heure : dire « il y a » | **Corrigé** `70ff605` |
| U3 | UI/UX | Mode clair : tuiles « en cours » invisibles (1,07-1,11:1) | **Corrigé** `70ff605` |
| U4 | UI/UX | Cibles de la colonne du jour à 40 dp, collées | **Corrigé** `70ff605` |
| U5 | UI/UX | Zones cliquables sans libellé ; « Toucher pour ouvrir SuiviBaby » devenu faux | **Corrigé** `70ff605` |
| U6 | UI/UX | Bande 2×2 : couleur seule | **Corrigé** `70ff605` |
| U7 | UI/UX | Info périmée : le chrono reste en grand et en blanc | **Corrigé** `70ff605` |
| U8 | UI/UX | iOS non aligné (liens morts, une seule session) | planifié S3 |
| F1 | Silences | Échecs d'envoi au widget invisibles hors développement | **Corrigé** `389e206` |
| F2 | Silences | Aucun jeton enregistré sans signal si l'ID de projet manque | **Corrigé** `389e206` |
| F3 | Silences | Erreur de lecture confondue avec « jeton d'un autre compte » : peut réactiver des notifications coupées | **Corrigé** `389e206` |
| F4 | Silences | Tétée partagée : refus d'écriture et erreurs d'écoute avalés | **Corrigé** `389e206` |
| F5 | Silences | Filet de fraîcheur limité aux sessions en cours | **Corrigé** `70ff605` |

Tous les P1 hors iOS (U8, planifié S3) sont corrigés. Vérifications après corrections : 2 001 tests app (un test ancien, hors widget, a échoué une fois sur quatre passages : instable, à isoler), 637 tests Functions, 264 tests de règles, 10 tests Kotlin.

## P2 retenus (suivi)

Plafonnement de la diffusion par enfant (anti-rafale) ; `widgetPush` et réglage « notifications » (décision Yoss n° 3 du temps réel) ; données de santé chez Expo/FCM à mentionner dans la politique de confidentialité ; validation des champs `device_tokens` dans les règles ; ordre `noteAppSnapshot` avant `updateSnapshot` ; détection du premier plan (accepter VISIBLE) ; tolérance d'horloge du récepteur ; `ElapsedClockView` au-delà de 24 h ; alarmes inexactes en Doze ; emoji du fil contre pictogrammes (décision Yoss) ; fil du jour absent de TalkBack ; tailles de police système ; fond blanc pur la nuit ; `tz` mis à jour seulement à l'enregistrement ; fanout séquentiel.

## Pour la revue n° 2

Objectif 16/20 : P1 ci-dessus corrigés, iOS aligné (S3), E6 mesuré une fois la clé FCM en place.
