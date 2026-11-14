# Compte rendu : chantier widget SuiviBaby

*13 novembre 2026*

## En bref

- **Le projet** : un widget d'écran d'accueil pour iPhone et Android.
  - Au repos, il affiche le temps écoulé depuis le dernier repas et le prochain sein.
  - Quand une tétée, un sommeil ou une promenade est en cours, son chrono prend toute la place.
  - Il s'accompagne d'un minuteur sur l'écran verrouillé (Live Activity sur iPhone, notification permanente sur Android).
- **Verdict du board** : bonne idée, mais pas prioritaire.
- **Arbitrage du fondateur** : le widget passe **en priorité**, avant le rapport pédiatre. Il commence par l'enregistrement de la tétée en cours dans la base partagée (aujourd'hui, l'autre parent ne la voit pas).
- **Calendrier visé** : widget V1 pour le lancement public du 2/2/2027, puis une décision sur les actions directes (V1.5) vers mi-mars, au vu des chiffres d'usage.

## Comment la décision a été prise

**1. Recherche**
- Faisabilité avec Expo SDK 58 : expo-widgets, Live Activities, notifications Android.
- Analyse des widgets de cinq concurrents.
- Relevé du design et des données de l'app.

**2. Concours de 5 designers**, chacun avec une méthode différente, notés par 2 juges (sur 80) :

| Proposition | Note |
|---|---|
| « Maintenant », carte calme (impeccable) | **64**, gagnante |
| Natif d'abord (Swift, SwiftUI, Kotlin) | 63 |
| Un seul chrono (Emil Kowalski, apple-design) | 61 |
| « Depuis quand ? » (product-lens) | 61 |
| « Coup d'œil » (ui-ux-pro-max) | 60 |

**3. Board stratégique**, avec trois lentilles d'analyse :
- **Vote** : 3 « financer sous conditions », 5,3/10 en moyenne (Offre 6, Monopole 4, Produit 6) ;
- **Raison** : le widget améliore le quotidien, mais il ne règle aucune des trois conditions de rentabilité (raison de payer, coût des utilisateurs gratuits, inscriptions). Le rapport pédiatre passe donc avant.

## Ce qui a été décidé

**Structure**

| Surface | Contenu |
|---|---|
| Petit widget (et StandBy, sur la table de nuit) | Chrono en cours, sinon « dernier repas il y a… » et le prochain sein |
| Widget moyen | À gauche ce qui est en cours, à droite les repas, les couches et le sommeil du jour |
| Écran verrouillé, Live Activity, notification Android | Minuteurs en direct (tétée G/D, sommeil, promenade) |
| Grand widget | Plus tard (V2) |

**Principes**
- **V1 en lecture seule** : un tap ouvre le bon écran de l'app. Les actions directes (changer de sein, terminer) arrivent seulement après des mesures. Jamais de bouton « Démarrer » sur l'écran d'accueil.
- **Seule la mère allaite** : aucun auteur n'est affiché sur une tétée. Le suivi à plusieurs concerne l'autre parent (tétée en cours) et la nounou ou la famille (biberon, sieste, promenade, couches).
- **Rappels discrets (Premium)** : une valeur passe en rouge, avec une petite icône, quand le délai réglé par le parent est dépassé. Sans fond rouge ni clignotement.
- **Aucune incitation à payer dans le widget** : la version Premium est présentée uniquement dans l'app.
- **Le chrono de toute session en cours est visible de tous, gratuitement** (tétée, sommeil, promenade), comme dans l'app : petit widget, écran verrouillé, Live Activity, notification Android, y compris les sessions lancées par un autre aidant.
- **Premium** : le widget moyen complet (repas, couches, sommeil du jour), les rappels discrets, le choix du bébé par widget, puis les actions directes.

## Plan en sprints de 2 semaines

| Sprints | Contenu |
|---|---|
| S1 (16 au 29/11) | Tétée en cours dans la base partagée, début des prototypes |
| S2 | Fin des prototypes, socle de données |
| S3 | Petit et moyen widgets, rappels discrets |
| S4 | Liens profonds, écran verrouillé, début de la Live Activity (lancement discret le 7/1) |
| S5 | Live Activity, notification Android, direct entre aidants |
| S6 | Test de fiabilité, qualité, sortie de la V1 (lancement public le 2/2) |
| S7 et S8 | Mesures, puis reprise du rapport pédiatre et du coût des gratuits ; décision V1.5 |

**Revue ECC tous les 2 sprints** : code, sécurité, natif, UI/UX et erreurs silencieuses, avec une note sur 20. Les problèmes bloquants sont corrigés avant le sprint suivant.

**Coût estimé** :
- V1 : environ 28 à 31 jours de développement ;
- V1.5 : 8 à 10 jours ;
- V2 : environ 4 jours.

## Points de vigilance

1. **Fiabilité** : un chrono ou un rappel faux en pleine nuit fait perdre plus de confiance que l'absence de widget. Un test sur 50 sessions avec un critère d'échec écrit à l'avance (plus de 2 % de valeurs fausses, ou plus de 30 s de délai médian) conditionne toute promesse « en direct ».
2. **Inconnue clé** : la part des foyers qui ont vraiment au moins deux aidants actifs. Elle dimensionne le coût des push entre aidants, désormais gratuits.
3. **Mesures après la sortie** : au moins 40 % des abonnés Premium avec un widget installé à 30 jours, et une meilleure rétention. Pas de V1.5 sans ces chiffres.

## Décisions en attente

1. Widget complet pour les comptes inscrits avant le Premium (proposition : oui).
2. Autorisation de mesurer les foyers à plusieurs aidants (lecture seule).
3. Temps de développement disponible par semaine.

*Documents détaillés : [spécification](WIDGET_SPEC.md), [avis du board](BOARD_WIDGET.md), [plan d'action](PLAN_ACTION_WIDGET.md). Les notes et les estimations sont des projections, sans données d'usage réelles pour l'instant.*
