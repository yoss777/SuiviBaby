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
