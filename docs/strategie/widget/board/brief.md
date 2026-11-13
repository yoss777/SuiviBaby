# Brief du board : le widget SuiviBaby

## L'entreprise (état au 13/11/2026)

- **Ce que c'est** : SuiviBaby, une appli française (iOS et Android) qui sert de carnet de bord partagé du bébé. On y note tétées, biberons, couches, sommeil, promenades, santé, croissance et moments, à plusieurs : les deux parents, la nounou, les grands-parents, en temps réel. On peut aussi noter à la voix. Données hébergées en Europe, sans publicité.
- **Pour qui** : parents français d'enfants de 0 à 3 ans, surtout ceux qui partagent le suivi avec un conjoint ou une nounou.
- **Fondateur** : développeur solo, à temps partiel, qui finance tout lui-même.
- **Statut** : test fermé (environ 12 à 20 testeurs Android, TestFlight sur iOS). Lancement discret prévu le 7/1/2027, lancement public le 2/2/2027 (repli au 16/2).
- **Stratégie retenue** (« architecture A », « Premium — prêt pour chaque examen ») :
  - **Gratuit généreux** : tout le suivi, enfants et partage illimités, courbes OMS, calendrier des examens, 1 rapport pédiatre, 3 commandes vocales par jour.
  - **Premium** : rapports pédiatre illimités et kit d'examen (« rapport pédiatre A », à construire avant le lancement), prédictions de tétée et de sieste (vendues seulement si elles sont justes au moins 7 fois sur 10), voix jusqu'à 30 par jour, PDF illimités.
  - **Prix** : 3,49 € par mois, 24,99 € par an avec 14 jours d'essai, offre Fondateurs à vie à 49,99 € pendant une durée limitée.
- **Rentabilité** (projections, non vérifiées) : pas encore rentable.
  - Marge d'environ 1,53 € par abonné et par mois (70 %).
  - Perte d'environ 812 € en année 1.
  - Le panel simulé : 12 % d'acheteurs, alors que la barre est à 25 %.
  - L'équilibre arrive au mois 13 seulement si trois conditions sont réunies : un utilisateur gratuit qui coûte 0,04 € par mois au lieu de 0,12 €, environ 5 % de payants et environ 200 inscrits par mois.
  - Un précédent board a voté « 3 financer sous conditions », 5,8 sur 10. Son principal reproche : Premium ne donnait pas de raison claire de payer.
- **Concurrents** cités : Huckleberry, Baby Daybook, Nara Baby, Glow Baby, BabyTracker. Plusieurs ont déjà des widgets. Huckleberry est critiqué pour des boutons de widget qui ne démarrent rien.

## L'idée à évaluer : le widget

Il s'agit d'un widget d'écran d'accueil (iOS et Android), complété par :
- une Live Activity et la Dynamic Island sur iPhone ;
- une notification permanente sur Android, pour les minuteurs en cours (tétée G/D, sommeil, promenade).

Spécification issue d'un concours de 5 designers et de 2 juges :
- **Petit widget « Maintenant »** :
  - si une session est en cours, son chrono, que le système fait défiler tout seul ;
  - sinon « Dernier repas il y a 2 h 10 » et le prochain sein.
- **Widget moyen** : à gauche ce qui est en cours, à droite les repas, les couches et le sommeil du jour.
- **Grand widget** en V2.
- **Écran verrouillé et mode StandBy** : StandBy, c'est l'iPhone en charge, posé sur la table de nuit ; c'est l'usage des tétées de nuit.
- **Rappels discrets** : la valeur passe en rouge, avec une petite icône, quand le seuil de rappel réglé par le parent est dépassé (repas, changes, tire-lait, vitamines).
- **V1 en lecture seule** : un tap ouvre le bon écran. Les actions directes (changer de sein, terminer) arrivent en V1.5, sans bouton « Démarrer » sur l'écran d'accueil.
- **Seule la mère allaite.** Le suivi à plusieurs signifie donc :
  - pour la tétée, l'autre parent voit la tétée en cours ;
  - pour le biberon, la sieste, la promenade et les couches, on voit ce qu'a noté la nounou ou le conjoint.
- **Préalable technique** : la tétée en cours n'est aujourd'hui enregistrée que sur le téléphone. Il faut l'enregistrer dans la base partagée (3 à 4 jours). Sinon l'autre parent ne la voit pas.
- **Synchronisation entre aidants** : quand l'app d'un aidant est fermée, il faut une fonction serveur qui envoie des push.
- **Gratuit ou Premium** (proposé par le fondateur) :
  - **comptes gratuits** : un petit widget sans chrono en direct (dernier repas et prochain sein), utile par lui-même. Une ligne discrète « Minuteurs en direct avec Premium » ;
  - **Premium** : le widget complet (chronos en direct, moyen et grand, écran verrouillé, Live Activity, notification, sessions des autres aidants, rappels discrets en rouge, choix du bébé), puis les actions en V1.5.
- **Coût estimé** :
  - V1 : environ 28 à 31 jours de développement, préalable compris ;
  - V1.5 : 8 à 10 jours de plus ;
  - V2 : environ 4 jours.
  - Pour un développeur solo à temps partiel, cela représente plusieurs semaines de calendrier.
- **Accroche paywall envisagée** : « Voyez en direct sur votre écran verrouillé la tétée en cours, la sieste ou la promenade lancée par la nounou ou votre conjoint, sans ouvrir l'app. »

## Les questions posées au board

1. Le widget est-il la bonne priorité stratégique pour rendre SuiviBaby rentable, comparé au rapport pédiatre A et au chantier de réduction du coût des utilisateurs gratuits ?
2. **Quand ?**
   - avant le lancement Premium du 2/2/2027, ce qui pourrait le décaler ;
   - juste après ;
   - ou découpé : une partie avant, le reste après.
3. Comment le positionner :
   - pilier du Premium ou simple bonus ;
   - quel découpage entre gratuit et Premium ;
   - quel message.

Chiffres inconnus à ce jour : taux réel d'installation des widgets, effet réel sur la conversion, coût d'acquisition. Il n'existe aucune donnée d'usage réelle.
