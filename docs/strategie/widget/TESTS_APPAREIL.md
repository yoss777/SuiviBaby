# Widget « Bébé maintenant » — tests sur téléphone

Tests à faire à la main sur iPhone et Android (Samsung) avant la MEP du 2/2/2027.
Mettre à jour la colonne « Statut » après chaque essai : ✅ OK · ❌ KO (noter le
problème) · ⏳ en cours · — pas encore testé.

## Version 1.0.20

| # | Test | Statut | Notes |
|---|------|--------|-------|
| 1 | Widget au repos : « Dernier repas » / « Dernier change », « rappel / dépassé » bien placé, « dernier à / hier / le JJ/MM » | ✅ 16/11 | Écart de chrono à la 1re minute (accueil 1 min, widget 0 min) et mise à jour lente : corrigés en 1.0.21 (tests 11 et 12) |
| 2 | Boutons « ▶ Sieste », « ▶ Balade », « ■ Arrêter » : un appui agit sans confirmation ; « Annuler » ne supprime que sa propre session | ✅ 16/11 | |
| 3 | Zones d'appui : fond → Accueil ; « Dernier change » → change ; ligne sommeil → formulaire sommeil | ✅ 16/11 | |
| 4 | iPhone : sieste lancée, le chrono et le « il y a » ne restent pas figés sur plusieurs heures (au-delà de 4 h aussi) | ⏳ 16/11 | En observation |
| 5 | Envoi seulement si un widget est posé : sans widget, plus de données reçues ; poser un widget puis rouvrir l'app réactive l'envoi | — | |
| 6 | Effacement à distance : membre retiré du foyer → son widget se vide | — | |
| 7 | Expiration : 24 h sans mise à jour → « Ouvrez SuiviBaby pour mettre à jour » | — | |
| 8 | iPhone verrouillé : widget masqué (écran de verrouillage) | — | |
| 9 | Libellés génériques : médicament, vaccin, « Autre vitamine » sans le nom | ✅ 16/11 | Vitamine D / K affichées en entier : voulu (choix fixes). Température : valeur affichée en 1.0.21 (test 13) |
| 10 | Formulaires : + Sommeil n'affiche que Sieste / Nuit ; + Bain que Bain / Nez | ✅ 16/11 | |

## Version 1.0.21 (à venir)

| # | Test | Statut | Notes |
|---|------|--------|-------|
| 11 | Chrono : accueil et widgets (iPhone et Android) passent de « 0 min » à « 1 min » au même moment, puis « 59 min » → « 1h00 » ensemble | 🟡 Android ✅ 19/11 (1.0.22) | Samsung : widget « 1 → 2 min » à 04:27:00, app « 3 → 4 min » à 04:29:00 (à ±2 s), même règle. « 59 → 1h00 » non observé (format 1h03 vu au test 26). Reste l'iPhone Règle commune : secondes du début ignorées |
| 12 | Appui sur ▶ / ■ du widget : le widget change tout de suite après l'ouverture de l'app (plus d'attente de 2 s) | 🟡 Android ✅ 19/11 (1.0.22) | ▶ Balade : widget à jour au retour à l'accueil (~5 s après l'appui, retour compris). ■ : « Balade terminée », retour automatique à l'écran d'accueil. Reste l'iPhone |
| 13 | Température notée : le widget affiche « Temp. 37,8 °C » | 🟡 Android ✅ 19/11 (1.0.22) | Dans la liste des événements (colonne de droite, qui défile). Reste l'iPhone Visible sur l'écran d'accueil Android sans déverrouillage (choix produit) |
| 14 | iPhone : démarrer / arrêter une balade dans l'app, retour immédiat à l'écran d'accueil → widget à jour en 1-2 s | ✅ 16/11 (version dev) | Timeline courte (~15 entrées) puis complète 4 s après ; > 5 s avec ~120 entrées, lent avec 29 |
| 15 | iPhone : sieste lancée, app quittée tout de suite ; 20 min plus tard, rouvrir l'app → chrono en minutes (pas de secondes), « il y a » à jour | — | Timeline complète écrite au retour dans l'app |

## Version 1.0.22 (lot 5, jalon 6 et information à la pose) : recette Android le 19/11, iPhone à faire

| # | Test | Statut | Notes |
|---|------|--------|-------|
| 16 | **Information à la pose du widget** : poser un premier widget, rouvrir l'app → fenêtre « Votre widget SuiviBaby » une seule fois. Vérifier le rendu du texte (4 paragraphes, lisible sans mise en forme, défilement si grande police), le texte propre à l'iPhone ou à Android, « En savoir plus » → politique, « J'ai compris » → fermée ; ne revient pas à l'ouverture suivante, ni après une fermeture forcée | 🟡 Android ✅ 19/11 (1.0.22) | Samsung, installation neuve : fenêtre à l'ouverture qui suit la pose, 4 paragraphes, texte Android (« Android ne le masque pas »), « En savoir plus » → politique 2.3 dans l'app ; ne revient pas après fermeture forcée. Reste l'iPhone (texte iPhone, « J'ai compris ») |
| 17 | iPhone : saisie, puis app quittée en moins de 4 s → 20 min plus tard, sans rouvrir l'app, le « il y a » du widget a avancé | — | Jalon 6, A : timeline complète écrite au départ |
| 18 | Sieste démarrée puis arrêtée en mode avion, puis réseau rétabli → la sieste est terminée sur l'autre téléphone et dans le widget | 🟡 Android ✅ 19/11 (1.0.22) | Mode avion : sieste 04:41:53 → 04:43:05, « 1 événement en attente » après l'arrêt (fusion). Réseau rétabli à 04:43:22 : un seul événement terminé sur le serveur à 04:43:26, widget « Sieste 1 min ». Reste la vérification sur l'iPhone |
| 19 | Sieste passée minuit arrêtée depuis le widget Android : la question reste affichée (pas de retour automatique à l'écran d'accueil) | ✅ 19/11 (1.0.22) | Sieste en cours reculée à 23:50 la veille (serveur), ■ du widget à 04:49 : « Cette sieste passe minuit » affichée, app toujours au premier plan après 15 s. « Enregistrer comme nuit » → nuit 23:50–04:49 |
| 20 | TalkBack et VoiceOver sur le fil du jour : « Température 37,8 degrés », « Sieste 1 heure et 20 minutes » (jamais « Temp. », « min ») | 🟡 TalkBack ✅ 19/11 (1.0.22) | Textes lus du widget : « Température 37,8 degrés », « Sieste 1 minute », « Balade 4 minutes », « 1 minute de sommeil ». Durées en heures non vues (aucune > 1 h ce jour). Reste VoiceOver |
| 21 | Déconnexion en mode avion : la déconnexion aboutit en 5 s au plus, le widget se vide | 🟡 19/11 (1.0.22), à refaire | Samsung, mode avion : déconnexion aboutie, widget vidé (« SuiviBaby, Aucun repas noté »). Délai mesuré entre 5 et 7,5 s (relevé trop grossier, toutes les 2,5 s) : refaire avec un enregistrement d'écran pour trancher le « 5 s au plus » |
| 22 | Information à la pose sur un petit écran (iPhone SE) et en très grande police : le texte défile, les deux boutons restent visibles. VoiceOver atteint le titre, le texte et les deux boutons | — | Revue en profondeur, P |
| 23 | Android, widget posé puis retiré, app non rouverte : une saisie sur un autre téléphone ne laisse rien sur ce téléphone (`readReceiveLog` : « nowidget ») | ✅ 19/11 (1.0.22) | Widget retiré, app non rouverte, modification côté serveur à 04:52:36 → journal `WidgetPush` : « w1 … -> nowidget » à 04:52:38. Widget reposé ensuite : vide jusqu'à l'ouverture de l'app |
| 24 | Deux iPhone dans le foyer, pauses ou changements de côté rapprochés : les deux widgets à jour au plus 2 min après | — | Revue en profondeur, M |
| 25 | Android, app fermée : `readReceiveLog` ne montre pas de « fg » (garde de premier plan) | ✅ 19/11 (1.0.22) | Journal `WidgetPush` (logcat) : app en arrière-plan depuis 35 s → « ok » ; depuis 3 s → « ok ». Jamais « fg » hors premier plan. Un « fg » à 04:48:32 : message arrivé avant que l'app passe en arrière-plan. `am kill` refusé par le système : cas « app tuée » non reproduit |
| 26 | Android (Samsung), sieste au-delà d'1 h, téléphone en veille passée l'heure pleine : rallumer l'écran et chronométrer le temps avant que « 3 min » devienne « 1h03 » | ✅ 18/11 (1.0.21) | Sieste depuis 15:52, écran éteint et veille légère de 16:48 à 16:55. Au premier relevé, 7 s après le réveil (déverrouillage compris) : « 1h03 », jamais « 3 min ». **On garde « 5 min »** (règle décidée par Yoss). Veille profonde non forcée (Android l'a refusée, débogage sans fil actif) : à revoir si un cas réel montre une durée fausse |

## Après les tests

- Ouvrir le temps réel iPhone (`app_config/widgetPush.ios`) pour les comptes de Yoss, puis tester : une saisie sur un téléphone met à jour le widget de l'autre.
- Lot 5 : voir la mémoire du projet (politique de confidentialité, accessibilité, performance, robustesse), puis nouvelle série de tests ici.
