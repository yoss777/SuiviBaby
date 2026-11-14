# Refonte du widget « Bébé maintenant » : avis de la cellule plateformes mobiles (2026-11-14)

# Cellule plateformes mobiles : avis sur le widget « Bébé maintenant »

## 1. Diagnostic

**Ce que chaque OS permet vraiment** (vérifié dans le code et dans `node_modules/expo-widgets` 58) :
- **WidgetKit** : aucun défilement, jamais. Les seules choses qui avancent sans dépenser de rechargement sont `Text timerInterval` (le chrono) et `Text date relative`. Apple accorde environ 40 à 70 rechargements par jour en arrière-plan. Depuis iOS 17, `Button`/`Toggle` passent par des App Intents (expo-widgets 58 émet `UserInteractionEvent`). StandBy réutilise le petit format, en monochrome rouge la nuit. expo-widgets 58 sait déjà faire des Live Activities (`createLiveActivity`, jetons push-to-start), mais rien n'est branché dans le code.
- **Glance** : `LazyColumn` défile, mais rien ne signale qu'il y a du contenu plus bas. On ne peut donc rien y mettre d'essentiel. Le push FCM data arrive même app fermée (1,2 s mesurées). expo-widgets 58 fournit aussi `CustomNotification` (Android), ce qui permet une notification permanente avec chrono, et une Live Update sur Android 16 si on garde le style standard.

**Ce qui marche** : chronos natifs des deux côtés, push Android, rappels dépassés en rouge doublés d'un mot, jour périmé masqué, écran verrouillé iOS (rectangulaire et en ligne).

**Ce qui ne marche pas** :
1. **iPhone figé** : sans push iOS (étape E7), le widget ne bouge pas quand un autre aidant saisit. C'est le premier écart d'efficacité entre les deux OS, avant la mise en page.
2. **Contenu caché** : le fil d'événements est sous la ligne de flottaison en 4×2, et absent du moyen iOS. Le grand iOS (1.0.17) n'a pas été vu sur appareil.
3. **Deux grammaires** dans deux rendus séparés (Android « il y a / dernier à », iOS « Repas à / N repas »), sans modèle commun : les props sont partagées, les textes non.
4. **Rôle absent des props** : TalkBack annonce « Noter un repas » à un Proche.
5. Les compteurs « 0 repas » occupent de la place utile le matin.
6. Le chrono sur l'écran d'accueil fait double emploi avec la Live Activity et la notification permanente, prévues par la spec mais pas encore faites.

## 2. Verdict : refonte partielle, pas totale

Les deux moteurs de rendu (Glance, SwiftUI) restent, et ils sont mûrs. Il faut refaire **le contenu** :
- un modèle de vue partagé (textes, priorités, rôle) ;
- des tailles qui se correspondent d'un OS à l'autre ;
- **rien d'essentiel dans une zone qui défile** ;
- les sessions qui passent en priorité sur les surfaces « live » (Live Activity, notification permanente) ;
- le push iOS, sans lequel aucune mise en page ne rend l'iPhone aussi efficace qu'Android.

## 3. Propositions

Point commun aux trois : une fonction `widgetView(props, taille, rôle)` dans `functions/shared/widget` renvoie des lignes déjà rédigées (« il y a 6h58 », « dernier à 19:37 »). Les deux rendus ne font plus que la mise en page. On ajoute `canWrite` aux props. Correspondance des tailles : 2×2 = petit, 3×2 = moyen, 4×2 = moyen élargi, grand = 4×3 ou plus.

### A. Alignement strict (évolution)
Même contenu des deux côtés, compteurs gardés, fil seulement dans le grand. Le `LazyColumn` est retiré sous 4×3.
```
iOS petit / And 2×2   iOS moyen / And 3×2            And 4×2 : 3×2 + « 7 min sommeil » à droite
┌──────────┐          ┌───────────────┬────────────┐
│ Prénom   │          │ Dernier repas │ 0 repas    │
│ Repas    │          │ il y a 6h58   │ dern. 19:37│
│ il y a   │          │ Dernier change│ 0 change   │
│ 6h58     │          │ il y a 18h23  │ dern. 11:57│
└──────────┘          └───────────────┴────────────┘
iOS grand / And 4×3+ : le moyen + 7 événements fixes
```

### B. « Depuis quand + en cours », chrono déporté (recommandée)
L'écran d'accueil répond à la question de la nuit. Le chrono vit dans la Live Activity et la notification permanente. Les compteurs ne restent que dans le grand. Trois événements fixes à partir du moyen.
```
iOS petit / And 2×2 (= StandBy)
┌──────────────┐  en session :  ┌──────────────┐
│ ● Repas      │                │ ● Tétée · G  │
│ il y a 6h58  │                │ 12:41 ▶      │
│ ● Change     │                │ depuis 02:10 │
│ il y a 18h23 │                └──────────────┘
└──────────────┘
iOS moyen / And 3×2
┌──────────────────┬──────────────────┐
│ ● Repas          │ 05:40 ● Biberon  │
│ il y a 6h58      │ 03:12 ● Change   │
│ ● Change         │ 01:55 ● Sieste   │
│ il y a 18h23     │                  │
└──────────────────┴──────────────────┘
And 4×2 : 3×2 avec 4 lignes de fil, sans défilement
iOS grand / And 4×3+
┌──────────────────────────────────────┐
│ Repas il y a 6h58 · Change il y 18h23│
│ ● Sieste en cours 0h42               │
│ Aujourd'hui : 3 repas · 4 changes ·  │
│ 2h10 de sommeil                      │
│ 7 événements récents (fixes)         │
└──────────────────────────────────────┘
Surfaces live : Live Activity / Dynamic Island,
notification permanente (Live Update Android 16)
→ chrono G/D, sans auteur sur une tétée
```

### C. Widget actionnable
B, plus des boutons « + Repas » et « + Change » (App Intents iOS 17 ; `actionRunCallback` Glance). Pour un Proche, les boutons sont remplacés par du texte.
```
iOS moyen / And 3×2
┌──────────────────┬────────┐
│ Repas il y a 6h58│[+Repas]│
│ Change il y 18h23│[+Chg]  │
│ 05:40 ● Biberon  │        │
└──────────────────┴────────┘
petit / 2×2 : sans boutons (StandBy, trop petit)
```

## 4. Coût et risques

| | Jours | Risques |
|---|---|---|
| A | 3-4 | Faible. Garde la faible valeur des « 0 repas » ; iPhone toujours figé sans E7. |
| B | 5-6, + Live Activity et notification 4 (déjà au plan), + push iOS E7 3-5 | Live Activity limitée à 8 h (nuit désactivée par défaut) ; Android 16 refuse la promotion si la vue est personnalisée ; budget iOS : un push silencieux qui réveille l'app pour recharger le widget est limité par Apple. Le push direct de widget (iOS 26) est à vérifier dans expo-widgets. |
| C | B + 8-10 | Jeton widget, Cloud Function idempotente, file hors ligne, revue de sécurité ; double saisie si l'appui est mal confirmé. C'est la V1.5. |

**Accessibilité** : dans les trois cas, le libellé lu tient compte du rôle (`canWrite`). Toute information doit rester lisible sans couleur (StandBy rouge, écran verrouillé monochrome) : mots et G/D écrits. Pour les trois, la dette baisse avec le modèle partagé, testé une fois en Jest.

## 5. Notes (angle plateformes)

- **A : 12/20.** Parité visuelle, mais n'exploite aucune surface live et laisse l'iPhone figé.
- **B : 17/20.** Chaque information va là où l'OS la sert le mieux : réponse fixe sur l'écran d'accueil, chrono sur l'écran verrouillé ou dans la notification. Aucun défilement, parité réelle, une fois le push iOS en place.
- **C : 11/20** maintenant, 15/20 en V1.5. Coût et sécurité trop lourds avant le lancement Premium ; à garder pour après B.

**Ordre recommandé** : modèle partagé et `canWrite`, puis B, puis push iOS (E7) et Live Activity / notification permanente, puis C.
