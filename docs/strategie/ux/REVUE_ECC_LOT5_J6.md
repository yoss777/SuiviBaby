# Revue ECC de fin de lot 5 (jalon 6) : widget « Bébé maintenant »

Date : 18/11/2026. Faite sur `main` à jour après les PR #109 à #114. Elle reprend les 11 volets de la revue du 16/11, chacun confié à un agent en lecture seule. J'ai vérifié chaque constat retenu dans le code avant de le corriger.

## Notes

| Volet | Agent ECC | 16/11 | 18/11 |
|---|---|---|---|
| Rendu des widgets | `typescript-reviewer` | 17 | 16 |
| Sécurité côté téléphone | `security-reviewer` | 17 | **18** |
| Sécurité serveur et règles | `security-reviewer` | 16 | 16 |
| Accueil et hooks | `react-reviewer` | 16 | 16 |
| Services de l'app | `typescript-reviewer` | 15 | 14 |
| Données de santé et RGPD | `healthcare-reviewer` | 14 | **15** |
| Erreurs silencieuses | `silent-failure-hunter` | 14 | **15** |
| Natif Android | `kotlin-reviewer` | 14 | **15** |
| Exécution par WidgetKit | `swift-reviewer` | 13 | **14** |
| Performance | `performance-optimizer` | 13 | **14** |
| Accessibilité | `a11y-architect` | 13 | **15** |
| **Moyenne** | | **14,7** | **15,3** |

Aucun P0. Les notes en baisse (rendu, services) viennent de trous nouveaux, trouvés plus en profondeur, et non de régressions. Ces notes sont celles d'avant les corrections ci-dessous.

## P1 corrigés (branche `fix/widget-lot5-jalon6`)

| # | Volet | Constat | Correction |
|---|---|---|---|
| A | Rendu, WidgetKit | iPhone : après une saisie, l'app quittée avant 4 s n'écrivait jamais la timeline complète. Les « il y a » restaient figés au-delà de 8 min. | Timeline complète écrite au passage en arrière-plan. Échéance d'une tétée en pause ajoutée aux entrées exactes. |
| B | Performance | Plusieurs urgents écartés pendant le même écart iPhone (pauses, changements de côté) donnaient chacun un rattrapage : plafond d'Apple dépassé, instances occupées 2 min pour rien. | Un seul rattrapage par fin d'écart, réservé par transaction dans `widget_fanout/{enfant}`. Les autres s'arrêtent tout de suite. Le marqueur est écrit en fusion. |
| C | Android (et iPhone) | Heure du téléphone reculée après une écriture de l'app : tous les messages étaient refusés jusqu'à ce que l'horloge rattrape. | Une écriture « dans le futur » ne compte plus comme récente. Même règle sur Android et sur iPhone. |
| D | Erreurs silencieuses | iPhone : disque illisible, tous les messages écartés comme « enfant inconnu », sans trace. Séquence non notée, mais « nouvelles données » annoncées à iOS. | Raison « state » distincte, échecs signalés une fois par lancement. iOS reçoit « échec » si la séquence n'est pas notée. |
| E | Accueil et hooks | Question « sieste passée minuit », puis changement de bébé par un lien du widget : « Enregistrer comme nuit » écrivait sous l'autre bébé. | Bébé figé au moment de la question. « Corriger l'heure de fin » ne fait rien si le bébé a changé. |
| F | Accueil et hooks | Android : le retour automatique partait pendant la question ou le formulaire. | Le retour n'est programmé que si l'arrêt est écrit (valeur rendue par l'arrêt). |
| G | Services | Sieste démarrée puis arrêtée hors ligne : seul le démarrage partait, et la session restait ouverte. | La modification est fusionnée dans la création en file (une valeur nulle retire le champ). Si la création est déjà partie, un message le dit. Le contenu de la ligne est relu au moment de l'envoi. |
| H | Services | Déconnexion pendant le rejeu de la file : les envois restants passaient en échec, voire sous un autre compte. | Le cycle s'arrête dès que le compte change, sans tentative consommée. |
| I | Services | Hors ligne, la suppression des jetons bloquait la déconnexion. | Attente bornée à 5 s, signalée. |
| J | Santé et RGPD | Un réglage `minConsentVersion` mal saisi retombait en silence sur 2.2. | Nombre et espaces compris. Un réglage illisible retombe sur 2.3, avec un avertissement. Jamais en dessous de 2.2. |
| K | Sécurité serveur, Santé | Relever la version exigée n'effaçait pas les widgets déjà remplis sous l'ancienne. | Effacement à distance au premier envoi qui suit, une fois par appareil. Registre mis à jour. |
| L | Accessibilité | Fil du jour lu « Temp. », « 1h20 », « min ». | Lu « Température 37,8 degrés », « 1 heure et 20 minutes », « 45 minutes » (iPhone et Android). |

Accessibilité, rôle « bouton » sur Android : impossible avec Glance, dont `semantics` n'accepte que la description. Les zones restent annoncées comme activables par TalkBack, parce qu'elles sont cliquables. Limite notée.

## P2 corrigés au passage

- Android : `clear` et `noteAppSnapshot` prennent le verrou du récepteur. Un message en cours ne peut plus réécrire le widget après la déconnexion.
- Android : données d'un « w0 » validées (version, enfant, champs lus sans garde). `logError` est synchronisé. Le journal illisible est signalé. Le journal système ne reçoit plus que la classe de l'erreur.
- Serveur : les appareils sans widget posé ne sont plus lus. Un fuseau illisible est signalé. Des rappels absents ne font plus échouer l'envoi.
- File hors ligne : le verrou du cycle est pris avant l'attente réseau. Le seuil d'épuisement suit `MAX_RETRIES`.
- Règles : `app_config/widgetPush` (liste des bêta-testeurs, réglages serveur) n'est plus lisible par l'app.

## Reste à faire

**Par Yoss (responsable du traitement) :**
- Publier la politique 2.3 avant de diffuser la 1.0.22, même aux testeurs, avec la vraie date d'entrée en vigueur, sur le site et dans l'app. Bloqué par le choix du médiateur.
- Faire l'AIPD, obligatoire avant la MEP.
- Établir les garanties de transfert par prestataire. Expo n'a ni DPF ni CCT confirmés, alors qu'il voit tout le résumé. À défaut, envoyer directement à FCM et APNs (voir SESSIONS_EN_DIRECT.md).
- ~~Arbitrer : le parent peut-il couper le widget d'un invité ?~~ **Décidé par Yoss le 18/11 : non.** Le widget d'un invité dépend de son seul consentement, et le parent garde le retrait de l'accès, qui efface son widget à distance. À consigner dans l'AIPD.

**Code, suivi P2 :**
- Message d'information à la pose du widget : absent.
- `live/nursing` : pas de débit limité, chaque écriture part en urgent vers tout le foyer.
- Reprise d'un jeton d'appareil par un autre compte : risque accepté, car le serveur revérifie l'accès avant tout envoi.
- Jetons restés en place après une déconnexion hors ligne : le serveur continue d'envoyer, le téléphone ignore les messages.
- iPhone :
  - timeline de 70 à 125 entrées avec les mêmes données répétées (taille à mesurer) ;
  - politique `.atEnd` d'expo-widgets sur une timeline expirée ;
  - `getSnapshot` qui prend la première entrée ;
  - `privacySensitive` partiel sur l'écran verrouillé.
- Android :
  - durée d'une session qui repart à 0 après 24 h (`H'h'mm`) ;
  - bascule « min » vers « h » tributaire d'une alarme inexacte ;
  - garde de premier plan trop large.
- Dialogues :
  - `showConfirm` sans clé de dédoublonnage ;
  - focus de lecteur d'écran non placé sur le titre.
- Retour automatique : seuls TalkBack et VoiceOver sont détectés (pas Switch Access ni le clavier).
- Option D : chrono de session et « il y a » au-delà de 4 h affichés au pas de 5 min et d'une heure. Choix assumé, à documenter côté produit.

## Vérifications

- 2 366 tests de l'app et 717 tests des fonctions passent.
- 17 tests Kotlin passent, dont le nouveau sur le recul d'horloge, et le module Android compile.
- `tsc` et lint sont propres.
- Les nouveaux tests échouent sur l'ancien code : le rattrapage iPhone en double, et la sieste démarrée puis arrêtée hors ligne.
- Les tests des règles (`app_config/widgetPush`) tournent dans la CI, car la CLI Firebase n'est pas installée sur ce Mac.
