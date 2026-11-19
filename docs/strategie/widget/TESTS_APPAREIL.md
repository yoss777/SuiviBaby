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
| 11 | Chrono : accueil et widgets (iPhone et Android) passent de « 0 min » à « 1 min » au même moment, puis « 59 min » → « 1h00 » ensemble | ✅ 19/11 (1.0.22) | Samsung : widget « 1 → 2 min » à 04:27:00, app « 3 → 4 min » à 04:29:00 (à ±2 s), même règle. « 59 → 1h00 » non observé (format 1h03 vu au test 26). Règle commune : secondes du début ignorées. iPhone 13 Pro Max (iOS 27.2.1) : widget « 1 → 2 → 3 minutes » aux changements de minute 05:40 et 05:41 ; app « 4 → 5 min » entre 05:42:57 et 05:43:01 pour un début à 05:38:03 (secondes du début ignorées). |
| 12 | Appui sur ▶ / ■ du widget : le widget change tout de suite après l'ouverture de l'app (plus d'attente de 2 s) | ✅ 19/11 (1.0.22) | ▶ Balade : widget à jour au retour à l'accueil (~5 s après l'appui, retour compris). ■ : « Balade terminée », retour automatique à l'écran d'accueil. iPhone : ▶ Balade du widget → app ouverte, balade sur le serveur 4 s après l'appui, widget « Balade · 05:38 » au retour à l'accueil ; ■ → « Balade terminée », `endSource: widget` (pas de retour automatique sur iPhone, voulu). |
| 13 | Température notée : le widget affiche « Temp. 37,8 °C » | ✅ 19/11 (1.0.22) | Dans la liste des événements (colonne de droite, qui défile). Visible sur l'écran d'accueil Android sans déverrouillage (choix produit). iPhone 15, grand widget (seule taille avec la liste) : « Temp. 37,8 °C ». |
| 14 | iPhone : démarrer / arrêter une balade dans l'app, retour immédiat à l'écran d'accueil → widget à jour en 1-2 s | ✅ 16/11 (version dev) | Timeline courte (~15 entrées) puis complète 4 s après ; > 5 s avec ~120 entrées, lent avec 29 |
| 15 | iPhone : sieste lancée, app quittée tout de suite ; 20 min plus tard, rouvrir l'app → chrono en minutes (pas de secondes), « il y a » à jour | ✅ 19/11 (1.0.22) | iPhone 13 Pro Max : sieste lancée à 05:58:31, app quittée à 05:58:57. Widget « Sieste en cours depuis 05:58, 21 minutes » à 06:19 ; réouverture à 06:19:25 → « Sieste en cours depuis 21 min » et « 1 change, il y a 34 min » tout de suite — Timeline complète écrite au retour dans l'app |

## Version 1.0.22 (lot 5, jalon 6 et information à la pose) : recette Android le 19/11, iPhone à faire

| # | Test | Statut | Notes |
|---|------|--------|-------|
| 16 | **Information à la pose du widget** : poser un premier widget, rouvrir l'app → fenêtre « Votre widget SuiviBaby » une seule fois. Vérifier le rendu du texte (4 paragraphes, lisible sans mise en forme, défilement si grande police), le texte propre à l'iPhone ou à Android, « En savoir plus » → politique, « J'ai compris » → fermée ; ne revient pas à l'ouverture suivante, ni après une fermeture forcée | ✅ 19/11 (1.0.22) | Samsung, installation neuve : fenêtre à l'ouverture qui suit la pose, 4 paragraphes, texte Android (« Android ne le masque pas »), « En savoir plus » → politique 2.3 dans l'app ; ne revient pas après fermeture forcée.. iPhone 13, réinstallation neuve : fenêtre à l'ouverture qui suit la pose, texte iPhone (« masqué tant que l'iPhone est verrouillé par un code », « par Expo, puis Apple ») ; « J'ai compris » la ferme, elle ne revient ni au lancement à froid ni au retour au premier plan. iPhone 15 : « En savoir plus » → politique 2.3 |
| 17 | iPhone : saisie, puis app quittée en moins de 4 s → 20 min plus tard, sans rouvrir l'app, le « il y a » du widget a avancé | ✅ 19/11 (1.0.22) | iPhone 15, grand widget : saisie à 05:57:50, app quittée 1 s après. Sans réouverture : « Dernier change il y a 23 minutes » à 06:08, « 33 minutes » à 06:18:35. (Premier essai sur l'iPhone 13 faussé : la sieste du test 15 a remplacé la zone « il y a ».) — Jalon 6, A : timeline complète écrite au départ |
| 18 | Sieste démarrée puis arrêtée en mode avion, puis réseau rétabli → la sieste est terminée sur l'autre téléphone et dans le widget | ✅ 19/11 (1.0.22) | Mode avion : sieste 04:41:53 → 04:43:05, « 1 événement en attente » après l'arrêt (fusion). Réseau rétabli à 04:43:22 : un seul événement terminé sur le serveur à 04:43:26, widget « Sieste 1 min ». iPhone 13 (piloté par le câble, mode avion) : sieste 06:23:48 → 06:24:56, « 1 événement en attente » après l'arrêt ; réseau rétabli à 06:25:27, un seul événement terminé sur le serveur à 06:25:33 |
| 19 | Sieste passée minuit arrêtée depuis le widget Android : la question reste affichée (pas de retour automatique à l'écran d'accueil) | ✅ 19/11 (1.0.22) | Sieste en cours reculée à 23:50 la veille (serveur), ■ du widget à 04:49 : « Cette sieste passe minuit » affichée, app toujours au premier plan après 15 s. « Enregistrer comme nuit » → nuit 23:50–04:49 |
| 20 | TalkBack et VoiceOver sur le fil du jour : « Température 37,8 degrés », « Sieste 1 heure et 20 minutes » (jamais « Temp. », « min ») | ✅ 19/11 (1.0.22) | Textes lus du widget : « Température 37,8 degrés », « Sieste 1 minute », « Balade 4 minutes », « 1 minute de sommeil ». Durées en heures non vues (aucune > 1 h ce jour). iPhone (libellés d'accessibilité lus par WebDriverAgent, VoiceOver non activé) : « Température 37,8 degrés », « Sieste 2 heures et 53 minutes », « Balade en cours depuis 05:38, 1 minute », « Arrêter la balade ». |
| 21 | Déconnexion en mode avion : la déconnexion aboutit en 5 s au plus, le widget se vide | ❌ 19/11 (1.0.22), de peu | Samsung, mode avion, rafale de captures horodatées (~0,45 s) : appui sur « Déconnexion » à t0, menu encore affiché jusqu'à t0 + 4,6 s, transition à t0 + 5,0 s, écran de connexion à t0 + 5,6 s ; widget vidé. Cause : la déconnexion attend la fin de `removePushTokens`, bornée à `SIGN_OUT_WAIT_MS` = 5 s (`services/pushTokenService.ts:52`), qui expire hors connexion. Piste : ne pas attendre hors connexion (ou attente plus courte) |
| 22 | Information à la pose sur un petit écran (iPhone SE) et en très grande police : le texte défile, les deux boutons restent visibles. VoiceOver atteint le titre, le texte et les deux boutons | ❌ 19/11 (1.0.22) | iPhone 15 (6,1 pouces), police au maximum, réinstallation neuve : la fenêtre déborde de l'écran, titre coupé en haut (« SuiviBab/y »), « J'ai compris » hors de l'écran en bas, le texte ne défile pas ; seul « En savoir plus » est atteignable. VoiceOver : toute la fenêtre est un seul élément (titre, texte et boutons lus d'un bloc, boutons non atteignables un par un). Vu aussi : formulaire Température aux boutons coupés |
| 23 | Android, widget posé puis retiré, app non rouverte : une saisie sur un autre téléphone ne laisse rien sur ce téléphone (`readReceiveLog` : « nowidget ») | ✅ 19/11 (1.0.22) | Widget retiré, app non rouverte, modification côté serveur à 04:52:36 → journal `WidgetPush` : « w1 … -> nowidget » à 04:52:38. Widget reposé ensuite : vide jusqu'à l'ouverture de l'app |
| 24 | Deux iPhone dans le foyer, pauses ou changements de côté rapprochés : les deux widgets à jour au plus 2 min après | ✅ 19/11 (1.0.22) | Temps réel iPhone activé le temps du test (`ios: true` de 06:54 à 07:01, seuls les iPhone de Yoss concernés). Sieste démarrée sur l'iPhone 13 à 06:54:42 → widget de l'iPhone 15 à jour à 06:55:12 ; arrêtée à 06:56:26 (dans les 2 min de l'envoi précédent, donc rattrapage) → « Sieste 2 min » à 06:57:10 |
| 25 | Android, app fermée : `readReceiveLog` ne montre pas de « fg » (garde de premier plan) | ✅ 19/11 (1.0.22) | Journal `WidgetPush` (logcat) : app en arrière-plan depuis 35 s → « ok » ; depuis 3 s → « ok ». Jamais « fg » hors premier plan. Un « fg » à 04:48:32 : message arrivé avant que l'app passe en arrière-plan. `am kill` refusé par le système : cas « app tuée » non reproduit |
| 26 | Android (Samsung), sieste au-delà d'1 h, téléphone en veille passée l'heure pleine : rallumer l'écran et chronométrer le temps avant que « 3 min » devienne « 1h03 » | ✅ 18/11 (1.0.21) | Sieste depuis 15:52, écran éteint et veille légère de 16:48 à 16:55. Au premier relevé, 7 s après le réveil (déverrouillage compris) : « 1h03 », jamais « 3 min ». **On garde « 5 min »** (règle décidée par Yoss). Veille profonde non forcée (Android l'a refusée, débogage sans fil actif) : à revoir si un cas réel montre une durée fausse |

## Défauts trouvés pendant la recette 1.0.22 (19/11)

Corrigés pour la 1.0.23 (branche `fix/recette-1.0.22`) : le P1, les deux P2, la déconnexion hors ligne (test 21) et l'avertissement Play sur le portrait et le Wi-Fi. Les P3 restent à faire.

- **P1 — lancement à froid sans réseau** (`contexts/AuthContext.tsx:284-292`) : la lecture du profil échoue, l'app affiche « Erreur — Impossible de charger vos données » sur l'écran de connexion, et **OK déconnecte le compte** (`firebaseSignOut`), widget vidé. Vu sur l'iPhone 13 en mode avion.
- P3 — bandeau « HORS LIGNE » affiché quelques secondes à l'ouverture depuis le widget alors que le réseau est là (iPhone).
- P3 — durée enregistrée arrondie au plus proche (`Math.round`, `useStopTimedEventWithUndo.ts:73`) alors que le chrono ignore les secondes : chrono « 5 min » à l'arrêt, balade enregistrée « 6 min ».
- **P2 — fenêtre d'information en très grande police** : déborde de l'écran, « J'ai compris » inatteignable, texte qui ne défile pas (test 22).
- **P2 — fenêtres de l'app et VoiceOver** : le fond assombri est un `Pressable` (accessible par défaut) qui regroupe toute la fenêtre en un seul élément (`ConfirmModal.tsx:136`, `InfoModal.tsx:111`, sans doute `PromptModal`) ; correction : `accessible={false}` sur ce fond.
- P3 — police au maximum : boutons du formulaire Température coupés (« Annul/er », « Ajout/er », − et + tronqués).
- P3 (revue de la correction) — `InfoModal` et `PromptModal` n'ont pas de zone qui défile comme `ConfirmModal` : à police extrême, le contenu peut déborder de la boîte limitée à 88 %.
- P2 existant (revue de la correction) — déconnexion hors ligne : le jeton `device_tokens` n'est pas supprimé et rien ne réessaie ; les rappels et notifications du compte peuvent continuer d'arriver sur ce téléphone jusqu'à la connexion suivante. Déjà le cas avant (attente de 5 s puis abandon). Piste : mémoriser une suppression en attente.

## Version 1.0.23 (corrections de la recette 1.0.22)

| # | Test | Statut | Notes |
|---|------|--------|-------|
| 27 | Lancement à froid en mode avion (app fermée complètement) : écran « Connexion indisponible » + Réessayer, **jamais** de déconnexion ; réseau rétabli → l'app se charge seule, sans appui | — | `AuthContext` : mode dégradé au lieu de l'alerte qui déconnectait ; `boot.tsx` : nouvel essai au retour du réseau |
| 28 | Information à la pose, police au maximum (iPhone 15 et petit écran) : la fenêtre tient dans l'écran, titre et texte défilent, « J'ai compris » et « En savoir plus » toujours visibles | — | Boîte limitée à 88 % de la hauteur, texte des boutons plafonné à ×2 |
| 29 | VoiceOver et TalkBack sur une fenêtre de l'app (information à la pose, confirmation de suppression) : titre, texte et chaque bouton atteints un par un | — | Fond des fenêtres non accessible (`accessible={false}`) |
| 30 | Déconnexion en mode avion : écran de connexion en moins de 2 s, widget vidé (refait du test 21) | — | Plus d'attente du jeton hors connexion |
| 31 | Play Console, envoi de la 1.0.23 : plus d'avertissement « fonctionnalités matérielles requises » (portrait, Wi-Fi), 0 appareil perdu | — | Plugin `withOptionalHardwareFeatures` |

## Après les tests

- Ouvrir le temps réel iPhone (`app_config/widgetPush.ios`) pour les comptes de Yoss, puis tester : une saisie sur un téléphone met à jour le widget de l'autre.
- Lot 5 : voir la mémoire du projet (politique de confidentialité, accessibilité, performance, robustesse), puis nouvelle série de tests ici.
