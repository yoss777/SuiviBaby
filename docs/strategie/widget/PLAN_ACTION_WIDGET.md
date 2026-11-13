# Plan d'action en sprints : widget SuiviBaby (établi le 13/11/2026)

Sources : [WIDGET_SPEC.md](WIDGET_SPEC.md) (concours de 5 designers et 2 juges) et [BOARD_WIDGET.md](BOARD_WIDGET.md) (3 « financer si », 5,3/10).
## Cadre

- **Sprint** : 2 semaines, du lundi au dimanche, soit environ **6 jours de développement** (hypothèse de 3 j par semaine, à ajuster quand le temps disponible sera fixé).
- **Revue ECC tous les 2 sprints** (fin des sprints 2, 4, 6, 8 et 10). Elle a toujours la même forme, détaillée plus bas : note sur 20, liste P0/P1/P2, et corrections des P0 avant le sprint suivant.
- **Les règles du board** :
  1. **le widget passe en priorité** (décision du fondateur, 13/11/2026), avant le rapport pédiatre et le chantier sur le coût des gratuits, qui reprennent ensuite ;
  2. **le chrono de toute session en cours est visible de tous, gratuitement** ;
  3. **aucune incitation à payer dans le widget** ;
  4. pas de promesse « en direct » sans un test de fiabilité réussi ;
  5. pas de V1.5 sans chiffres d'usage.
- **Rôles** :
  - **Claude** : code, tests, PR, builds, envoi sur les stores ;
  - **Yoss** : décisions, comptes Apple et Google, essais sur téléphone, « go » de fusion pour chaque PR.
- **Chaque PR** :
  - une branche dédiée ;
  - CI complète et verte sur le dernier commit avant de demander le « go » ;
  - tests ajoutés ;
  - jamais de `--force` sur les règles ni les index.
## Vue d'ensemble (révisée le 13/11 au soir)

L'avance prise cette semaine change le plan du matin : la tétée partagée (F1), les prototypes, le socle de données et le widget Android sont faits. Le plan intègre trois décisions du 13/11 : widget **temps réel par push** ([plan-temps-reel.md](design/plan-temps-reel.md)), **un seul calcul partagé app / serveur** ([calcul-serveur-*.md](design/)), et les retours sur la **capture d'un concurrent** ([capture-concurrent-*.md](design/)) : lisibilité au repos d'abord, saisie depuis le widget seulement après le temps réel.

| Sprint | Dates | Contenu | Revue ECC |
|---|---|---|---|
| S0 (fait) | 9/11 → 15/11 | F1 tétée partagée ; widget Android V1 (sessions, chronos natifs, journée, fil du jour) ; widget iOS V1 ; calcul partagé app / serveur ; correctif de l'ID Expo | |
| S1 | 16/11 → 29/11 | **PR widget V1 et version de test** ; **lisibilité au repos** (JS) ; **préparation du push** (ID Expo vérifié, E0, E3) ; **récepteur Android natif** (E4) | |
| S2 | 30/11 → 13/12 | **Diffusion serveur Android** (E5, sur accord) ; **campagne de fiabilité Android** (E6) ; filet de fraîcheur (E10) ; liens profonds par zone | **Revue n° 1** |
| S3 | 14/12 → 27/12 | **Widget iOS aligné** sur Android ; **push iOS en arrière-plan** (E7) ; pictogrammes (si décidé) ; écran d'aide « Ajouter le widget » | |
| S4 | 28/12 → 10/1 | **Notification permanente Android** (chrono, montre Wear OS) ; **Live Activity**, partie 1 ; écran verrouillé iOS ; lancement discret le 7/1 | **Revue n° 2** |
| S5 | 11/1 → 24/1 | **Live Activity démarrée par push** (E9) ; **push WidgetKit iOS 26+** (E8) | |
| S6 | 25/1 → 7/2 | **Test de fiabilité deux plateformes, qualité, release V1** ; lancement public le 2/2 | **Revue n° 3** |
| S7 | 8/2 → 21/2 | Mesures du widget ; reprise du rapport pédiatre A et du coût des gratuits | |
| S8 | 22/2 → 7/3 | Rapport pédiatre A ; coût des gratuits ; **décision V1.5** (saisie depuis le widget) | **Revue n° 4** |
| S9-S10 | 8/3 → 4/4 | **V1.5 si go** : pipi / selle, puis arrêter / changer de côté de tétée, depuis le widget et la notification | **Revue n° 5** |

**Hypothèse** : environ 6 jours de développement par sprint. Si un sprint glisse, on décale la sortie, pas le test de fiabilité. Aucun déploiement de fonction, de règles ni de secret sans le « go » explicite de Yoss.

---

## S0 (9/11 → 15/11) : fait, à fusionner

- F1 : tétée en cours dans `children/{childId}/live/nursing`, visible de tout le foyer (commit `dc094c7`).
- Widget Android : toutes les sessions en cours avec chronos natifs, sieste ou nuit, journée (repas, changes, sommeil) pour tous, fil du jour de tous les événements avec un emoji par type, prénom en pastille, libellé TalkBack, dernier repas et dernier change côte à côte au repos.
- Widget iOS V1 (à aligner en S3).
- Calcul du widget dans `functions/shared/widget/` : un seul code pour l'app et le futur serveur, fuseau injecté, testé (étapes E1-E2 du plan temps réel faites).
- `pushTokenService.ts` : ID du projet Expo lu dans `app.json` (l'ancien ID datait d'avant le transfert vers `yoss7`).

## S1 (16/11 → 29/11) : fusion, lisibilité, préparation du push (6 j)

1. **PR `feat/widget-v1`** (0,5 j) : CI verte, « go » de Yoss, version de test (Android en local puis Tests fermés – Alpha ; iOS sur EAS avec soumission automatique).
2. **Lisibilité au repos, JS seul** (2 j), d'après la cellule design et l'accessibilité :
   - « il y a 2h10 » en valeur principale, l'heure en petit dessous ;
   - une place fixe par catégorie (repas, change, sommeil), la session en cours prend la place de sa catégorie ;
   - « rappel dans 10 min » avant le dépassement, puis « rappel » en rouge avec un mot, jamais la couleur seule ;
   - le widget utilise `sinceMs` et `lastMealKind` au lieu de découper des libellés, et masque les compteurs de la veille grâce à `dayStartMs` (redessin à minuit) ;
   - contrastes 4,5:1 et phrase TalkBack complète par bloc.
3. **Préparation du push** (1,5 j) :
   - vérifier les identifiants FCM et APNs du projet Expo `@yoss7/suivibaby`, puis un envoi réel de test ;
   - E0 : décisions de Yoss (voir plus bas) et protocole du test de fiabilité ;
   - E3 : l'appareil enregistre `tz`, `widgetChildId`, `widgetCap`, `widgetPush`, `appVersion` dans `device_tokens` ;
   - CI : tests du module partagé lancés aussi côté Functions, et `functions/shared/**` dans le déclenchement de `deploy-functions.yml`.
4. **E4, récepteur Android natif** (2 j) : service Kotlin qui reçoit le message, vérifie l'enfant et l'ordre des messages, écrit les données du widget et le redessine sans démarrer l'app. Build local, test de non-régression des rappels.

## S2 (30/11 → 13/12) : temps réel Android, puis revue n° 1 (6 j)

1. **E5, diffusion serveur Android** (1,5 j) : déclencheur sur les événements et `live/*`, calcul avec le module partagé (en deux étages : par enfant et fuseau, puis par aidant pour Premium et rappels), envoi aux appareils du foyer. **Déploiement sur accord de Yoss.**
2. **E6, campagne de fiabilité Android** (2 j) : 2-3 téléphones dont un Samsung ; app fermée, veille, nuit, réseau coupé ; mesure du délai médian et des messages déclassés.
3. **E10, filet de fraîcheur** (0,5 j) : « màj HH:MM » discret si le widget n'a pas été mis à jour depuis longtemps.
4. **Liens profonds par zone** (1,5 j) : un appui sur repas, change ou tétée ouvre directement l'écran de saisie de cette catégorie (patch du pont si un lien par zone n'existe pas).
5. Mesure 0.3 (foyers à plusieurs aidants), si autorisée.
6. **Revue ECC n° 1** (format plus bas).

## S3 (14/12 → 27/12) : iOS (6 j)

1. **Widget iOS aligné** sur Android (2 j) : toutes les sessions, sieste ou nuit, journée, fil du jour, « il y a » au repos, VoiceOver.
2. **E7, push iOS en arrière-plan** (1,5 j) : un abonné natif écrit les données reçues et recharge le widget (limité par Apple, d'où E8 et E9).
3. **Pictogrammes** (1,5 j, si Yoss les préfère aux emojis) : SF Symbols sur iOS, vecteurs sur Android (recompilation), toujours avec le mot.
4. **Écran d'aide « Ajouter le widget »** (1 j) dans Réglages, seul endroit où le Premium du widget est présenté.

## S4 (28/12 → 10/1) : écran verrouillé et montre, puis revue n° 2 (6 j)

1. **Notification permanente Android** (2 j) pendant une session : chrono natif, relayée sur Wear OS. Elle rend aussi légitime la haute priorité des messages.
2. **Live Activity, partie 1** (2,5 j) : démarrage, mise à jour et fin depuis l'app, pour la tétée, le sommeil et la promenade.
3. **Écran verrouillé iOS** (1,5 j) : formats rectangular, circular et inline, option « Masquer sur l'écran verrouillé ».
4. Lancement discret le 7/1, widget en test. **Revue ECC n° 2.**

## S5 (11/1 → 24/1) : temps réel iOS (6 j)

1. **E9, Live Activity démarrée par push** (3 j, iOS 17.2+) : la session lancée par un autre aidant apparaît sur l'écran verrouillé et l'Apple Watch. Secret APNs créé par Yoss.
2. **E8, push WidgetKit** (3 j, iOS 26+) : point d'accès serveur qui sert les données déjà calculées. **Déploiement sur accord.**

## S6 (25/1 → 7/2) : fiabilité, qualité, release V1, puis revue n° 3

1. **Test de fiabilité** (2 j) sur Android et iPhone, protocole écrit en S1 : échec si plus de 2 % d'affichages faux ou un délai médian au-dessus de 30 s. En cas d'échec, pas de promesse « en direct ».
2. **Qualité** (2 j) : TalkBack et VoiceOver, grand texte, prénoms longs (`break-ui`), deux sessions en même temps, jumeaux.
3. Release V1, lancement public le 2/2. **Revue ECC n° 3.**

## S7-S8 (8/2 → 7/3) : mesures, plan stratégique, revue n° 4

- Reprise du rapport pédiatre A et du coût des gratuits.
- Indicateurs suivis 4 semaines après la sortie :

| Indicateur | Seuil fixé à l'avance |
|---|---|
| Foyers actifs avec au moins un widget à 30 jours | première mesure, sans seuil |
| Premium avec le medium installé à 30 jours | au moins 40 % |
| Rétention à 60 jours des Premium avec widget, comparée aux Premium sans widget | écart positif |
| Sessions « juste pour regarder » (moins de 5 s sans saisie) | en baisse |
| Délai médian de mise à jour entre aidants (production) | sous 30 s |
| Valeurs fausses signalées | 0 cas non corrigé sous 7 jours |

- **Décision V1.5 vers mi-mars** sur ces chiffres. **Revue ECC n° 4.**

## S9-S10 (8/3 → 4/4) : V1.5, saisie depuis le widget (si go), revue n° 5

Ordre recommandé par l'architecte, la cellule design et l'accessibilité ([capture-concurrent-*.md](design/)) :
1. **Pipi / selle** depuis le widget : une action, sans conflit.
2. **Arrêter la tétée, changer de côté** depuis le widget et la notification : le serveur applique l'intention en transaction (le widget n'envoie jamais un état).
Conditions : clé de widget par appareil révocable, point d'accès `widgetAction` idempotent, file hors ligne (WorkManager, App Group), boutons de 48 dp espacés de 8 dp avec texte, « Annuler » pendant 10 s, échec affiché en texte, rien depuis l'écran verrouillé sans déverrouillage, jamais d'auteur sur une tétée. Pas de bouton « Démarrer » sur l'écran d'accueil. **Revue ECC n° 5.**

## La revue ECC (tous les 2 sprints)

Même format à chaque fois, pour comparer les notes d'une revue à l'autre :

| Volet | Outil | Ce qui est vérifié |
|---|---|---|
| Code | `ecc:code-review` + `ecc:react-review` (TS/React Native) | Bugs, régressions, code mort, tests manquants |
| Sécurité | `ecc:security-review` | Règles Firestore, Cloud Functions, jetons, données personnelles dans les journaux |
| Natif (à partir de S2) | `ecc:swift-reviewer`, `ecc:kotlin-reviewer` | Extension widget, Live Activity, module de notification |
| UI/UX | Audit UI/UX (même grille que les audits V1 à V3) avec `impeccable` et `ui-ux-pro-max` | Fidélité au design, accessibilité, mode sombre, cohérence du widget avec l'app |
| Silences | `ecc:silent-failure-hunter` | Erreurs avalées (synchro, push, snapshot) |

**Livrable** : `docs/strategie/ux/REVUE_ECC_Sxx.md`, avec une note sur 20 et des constats P0, P1 et P2.
- Les **P0 sont corrigés avant le sprint suivant**.
- Les P1 sont planifiés dans le sprint suivant.
## Décisions en attente (Yoss)

1. Widget complet pour les comptes inscrits avant le Premium (proposition : oui, c'est un ajout).
2. Autorisation d'exécuter la requête 0.3 en lecture seule sur la production.
3. Temps de développement par semaine (pour confirmer les dates).
4. Temps réel (E0) : Live Activity démarrée par push sur iOS, avec une alerte à chaque début de session d'un autre aidant ? Repas et changes « dès que possible » sur Android écran éteint ? Mise à jour du widget même si l'aidant a coupé les notifications ?
5. Emojis ou pictogrammes dessinés dans le fil du jour (S3).
6. Déploiements du temps réel, au fil des sprints : déclencheurs (S2), secret APNs (S5), point d'accès WidgetKit (S5).

Décidé le 13/11 : chrono de toute session en cours visible de tous gratuitement ; aucune incitation à payer dans le widget ; widget en priorité ; F1 lancé ; revue ECC tous les 2 sprints ; temps réel par push avec un seul calcul partagé app / serveur ; widget qui suit le bébé actif (pas de swipe) ; saisie depuis le widget seulement après le temps réel.
