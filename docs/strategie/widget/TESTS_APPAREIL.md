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
| 11 | Chrono : accueil et widgets (iPhone et Android) passent de « 0 min » à « 1 min » au même moment, puis « 59 min » → « 1h00 » ensemble | — | Règle commune : secondes du début ignorées |
| 12 | Appui sur ▶ / ■ du widget : le widget change tout de suite après l'ouverture de l'app (plus d'attente de 2 s) | — | |
| 13 | Température notée : le widget affiche « Temp. 37,8 °C » | — | Visible sur l'écran d'accueil Android sans déverrouillage (choix produit) |
| 14 | iPhone : démarrer / arrêter une balade dans l'app, retour immédiat à l'écran d'accueil → widget à jour en 1-2 s | ✅ 16/11 (version dev) | Timeline courte (~15 entrées) puis complète 4 s après ; > 5 s avec ~120 entrées, lent avec 29 |
| 15 | iPhone : sieste lancée, app quittée tout de suite ; 20 min plus tard, rouvrir l'app → chrono en minutes (pas de secondes), « il y a » à jour | — | Timeline complète écrite au retour dans l'app |

## Après les tests

- Ouvrir le temps réel iPhone (`app_config/widgetPush.ios`) pour les comptes de Yoss, puis tester : une saisie sur un téléphone met à jour le widget de l'autre.
- Lot 5 : voir la mémoire du projet (politique de confidentialité, accessibilité, performance, robustesse), puis nouvelle série de tests ici.
