# Refonte du widget : décisions de Yoss (2026-11-14)

Suite de la consultation (`SYNTHESE.md`, 6 cellules + board, vote unanime R2).

## Décisions

1. **R2 « Depuis + fil fixe » adoptée**, avec les conditions du board :
   - correctifs d'abord (droit de saisie dans les données du widget, un libellé vocal par zone, plus de défilement, suppression de `nextSide`) ;
   - prototype iPhone « il y a 6h58 » dès le début ; s'il échoue, un seul format identique sur les deux OS, sans étendre le patch expo-widgets ;
   - le temps réel iPhone (E7) devient un préalable au lancement du 2/2/2027 ;
   - mesures : part des actifs avec le widget, rétention J30, aidants par foyer ; critère « compris en moins de 2 s ».
2. **« dernier à 19:37 / dernier hier à 19:37 / dernier le 11/11 »** : seulement en grand format et dans le texte vocal (ailleurs il répète le « il y a »).
3. **Fil d'événements** :
   - Android : 3 lignes fixes en 3×2, 4 en 4×2, sans défilement ;
   - iPhone : fil dès le **format moyen**, 3 lignes + bouton « ▾ » (bouton interactif iOS 17, déjà géré par expo-widgets : `WidgetUserInteraction`) pour les suivantes, avec « màj HH:MM » en tête si les données ont plus de 2 h ; iOS 16.4 : 3 premières lignes seulement. Décidé **sans attendre E7** (Yoss lève la condition du board). Prototype d'abord.
   - Grand format iPhone : 7 lignes.
4. **Prénom de l'aidant sur le fil** (jamais sur une tétée) : à trancher plus tard (version d'après le lancement).

## Plan

| Lot | Contenu | Estimation |
|---|---|---|
| 1. Correctifs | `canWrite` dans les props (app + serveur, selon le rôle), zones sans action et libellé « consulter » pour un Proche, suppression de `nextSide` | 1 j |
| 2. Contenu partagé v2 | `buildNowWidgetContent()` dans `functions/shared/widget` : emplacements par priorité (sessions, rappel dépassé, repas, change, fil), libellés uniques, texte vocal ; contrat `v:2` envoyé aux binaires `widgetCap>=2` | 2 j |
| 3. Android | nouvelle mise en page sans `LazyColumn` : 2×2, 3×2 (+ 3 lignes), 4×2 (+ 4 lignes + pied « Auj. ») | 1,5 j |
| 4. iPhone | prototype « il y a 6h58 », petit / moyen (+ fil 3 lignes + « ▾ ») / grand (7 lignes, « dernier à ») | 2 j |
| 5. Accessibilité | police à 130/150/200 %, troncatures, VoiceOver/TalkBack par zone | 0,5 j |
| 6. Build et mesure | 1.0.18, retours sur appareils, Sentry, indicateurs | — |

## Chrono du widget (2026-11-15, audit design / architectes / plateformes)

- Sommeil, promenade et « il y a » : secondes pendant la 1re minute, puis minutes seules (« 45 min », « 1h08 »), sur les deux OS (option O2).
- Tétée : « mm:ss » comme Android aujourd'hui, sur les deux OS.
- iPhone : passage par la timeline expo-widgets (une entrée par minute préparée par l'app), le compteur natif `timerInterval` gardant toujours les secondes.

## Bouton sommeil du widget (2026-11-15)

- Libellé gardé : « ▶ Sieste » / « ▶ Nuit » selon l'heure (cellules : Sieste/Nuit 14 + 16, Dodo 17 + 13, Sommeil 12 + 12, Repos 10 + 8). Le bouton annonce ce qui sera enregistré.
- Nuit de 19:00 à 8:00 (avant : 6:00), dans l'app et les deux widgets (`utils/sleepPeriod.ts`).


## Suivi (mis à jour le 2026-11-15)

| Élément | État |
|---|---|
| Lot 1 : droit de saisie (Proche) | **fait**, PR #84 (fusionnée via #85), serveur déployé |
| Boutons du widget : démarrer / arrêter sommeil et promenade, arrêter la tétée (ouvrent l'app) | **fait**, PR #85 |
| Règles métier : une session par type, tétée oubliée 1 h 40 / 40 min, sommeil compté une fois | **fait**, PR #85, serveur déployé |
| Fin de sommeil le lendemain, bandeau tétée sur 2 lignes, Notifications immédiates et écritures partielles, unité « min », pas de « 0 repas » au lancement, nuit 19:00-8:00 | **fait**, PR #85 |
| Chrono : minutes dès le départ sur les deux OS (secondes de la 1re minute abandonnées : redessin Android non fiable), tétée mm:ss, timeline iPhone | **fait**, PR #88 (iPhone non vu sur appareil) |
| Lot 2 : contenu partagé v2 | **à faire** |
| Lot 3 : Android sans défilement | **à faire** |
| Lot 4 : iPhone (petit / moyen avec fil et « ▾ » / grand) | **à faire** (grand format avec fil déjà livré en 1.0.17) |
| Lot 5 : accessibilité (police agrandie, troncatures) | **à faire** |
| Boutons sans ouvrir l'app | à décider (4 à 6 j) |
| E7 temps réel iPhone, notification permanente / Live Activity | **à faire** (plan S3-S5) |

| « Balade » partout (app + widget) | **fait**, PR #88 |
| iPhone : en-tête comme Android | **fait**, PR #88 (non vu sur appareil) |
