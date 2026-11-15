# Synthèse : refonte du widget « Bébé maintenant » (2026-11-14)

Rapporteur. Sources : les six avis du dossier (`design.md`, `architecture.md`, `a11y.md`, `plateformes.md`, `produit.md`, `marche.md`) et le brief `../BRIEF_REFONTE_WIDGET.md`. Dans les maquettes, le prénom, les heures et les aidants sont fictifs. Pour qu'elles restent cohérentes entre elles, il est 03:12, le dernier repas date d'hier à 20:14 et le dernier change de 01:02.

Limite de l'étude de marché : aucun outil Perplexity n'était connecté. La cellule marché a utilisé la recherche web (fiches App Store et Play, aides des éditeurs, presse). Les pages d'aide Huckleberry ont renvoyé une erreur 403, et la fiche Play de Baby Daybook n'a pas pu être lue. Ces deux points sont donc à confirmer.

---

## 1. Points d'accord (les 6 cellules)

1. **On garde les moteurs et on refait le contenu.** Glance, WidgetKit, les vues natives patchées, les liens profonds et le push FCM Android (1,2 s) sont acquis.
2. **Rien ne défile.** Le `LazyColumn` d'Android disparaît. Un contenu caché sous la ligne de flottaison n'est pas un contenu de widget (retour terrain n° 1).
3. **Une seule grammaire pour les deux plateformes**, définie une fois dans `functions/shared/widget`. Aucun concurrent n'a deux formulations différentes selon l'OS.
4. **« Il y a » est le chiffre héros** pour le repas et le change. Les compteurs du jour (« 0 repas ») passent au second plan. C'est aussi la tendance n° 1 du marché (Nara, Mango StandBy, Sprout, FeedRight).
5. **Le rôle entre dans les props** (`canWrite` ou `role`). Un Proche n'a ni zone d'action, ni « Noter un repas », ni « Toucher… pour noter ».
6. **Le push iOS (E7) fixe le plafond de valeur de l'iPhone.** Sans lui, le fil d'événements iOS vieillit, et un fil périmé est pire que pas de fil du tout.
7. **Correctifs d'accessibilité communs** : un libellé par zone (plus de `contentDescription` global), des hauteurs qui suivent la taille de police (`wrap`, tests à 130, 150 et 200 %), des pastilles décoratives (VoiceOver ne lit plus « cercle noir »), l'heure de début écrite en texte à côté de chaque chrono, et aucun sens porté par la couleur seule.
8. **Dette** : le patch expo-widgets doit sortir dans un module Expo local avant la prochaine montée de SDK, quelle que soit l'option retenue (architecture). On supprime `nextSide`, qui est un champ mort.

## 2. Désaccords (maintenus)

| Sujet | Positions |
|---|---|
| **Où apparaît le fil** | Design, plateformes et produit : 3 lignes dès le moyen et le 3×2. Architecture : 1 ligne en 3×2, 3 lignes en 4×2, 7 en grand. Accessibilité : seulement dans le plus grand format. Marché : « ne pas chercher le fil complet dans le moyen iOS », grand « Récents » à la Mango ; le fil est rare chez les concurrents. |
| **Compteurs du jour** | Design : pied « Auj. » dès le moyen. Produit : seulement s'ils dépassent 0, et seulement dans les grandes tailles. Plateformes : seulement dans le grand. Architecture : ils descendent dans le fil. Accessibilité : colonne « Aujourd'hui » en 4×2. Plateformes A : on les garde. |
| **Le chrono de session** | Design, architecture et produit : il reste dans le widget et remplace le bloc repas. Plateformes et marché (tendance n° 2) : il est porté surtout par la Live Activity et la notification permanente, le widget n'en garde qu'une version compacte. |
| **Forme du partage** | Architecture : `cards[]` avec des horodatages bruts, plus une fonction « hier / le 11/11 » de 10 lignes recopiée dans chaque widget et couverte par un test de parité. Plateformes : `widgetView()` renvoie des lignes déjà rédigées. Accessibilité : des `lines[]` rédigées côté serveur font courir un risque en cas de décalage de version entre l'app et le serveur. |
| **Auteur sur le fil** | Produit seul : `recent[].by` hors tétée (« Change — Awa »), car c'est le cœur du relais. Les autres cellules n'en parlent pas. Il faut alors `privacySensitive` sur iOS et un test « jamais d'auteur sur une tétée ». |
| **Format « il y a 6h58 » sur iOS** | Le relatif natif affiche « 7 h 35 min ». Design : prototyper un `timerInterval` compté vers le haut au format h:mm, sans secondes. Architecture : soit accepter le format natif, soit passer par une timeline. Yoss a tranché pour « il y a 6h58 » : on prototype d'abord, et on ne revient vers lui que si le prototype échoue. |
| **Widget actionnable** | Plateformes C et marché (tendance n° 4) : saisie en un geste, comme chez les leaders. Les mêmes jugent ce chantier trop lourd avant le 2/2/2027 (V1.5). Architecture : ce serait une raison de passer au natif (C) plus tard. |
| **Un seul widget ou plusieurs** | Le marché (tendance n° 3 : Mango en propose 14) pousse vers plusieurs widgets spécialisés. Les autres cellules raisonnent sur un seul widget. |

## 3. Verdict majoritaire : **refonte partielle**

- **5 cellules sur 5 votantes** concluent à une refonte partielle : design, architecture, accessibilité, plateformes et produit. La cellule marché ne vote pas, mais ses conclusions vont dans le même sens : une seule grammaire, aucun défilement, les sessions vers les surfaces live.
- **Personne ne recommande la refonte totale.** Le natif pur (architecture C) obtient 11/20 : il doublerait les langages pour une équipe d'une personne. Le view-model rédigé côté serveur (accessibilité C) obtient 16/20 mais est jugé trop risqué pour l'instant.
- **L'évolution seule est rejetée comme cible.** Elle obtient 12 à 13/20, mais ses correctifs d'accessibilité (`canWrite`, etc.) sont à faire en premier dans tous les cas.

---

## 4. Propositions consolidées

### R1 « Aligner » : évolution, même structure, une seule grammaire

**Principe.** On corrige sans redessiner :
- `canWrite` dans les props et les correctifs d'accessibilité du §1.7 ;
- la grammaire Android portée telle quelle sur iOS ;
- le `LazyColumn` retiré : le fil n'existe plus que dans le grand iOS (et en Android 4×3 ou plus, hors périmètre du brief) ;
- les compteurs gardés en colonne droite.

**Positionnement face au marché.** Parité visuelle d'un OS à l'autre, ce qu'aucun concurrent n'offre sur Android avec du temps réel (Huckleberry n'a pas de widget Android). Mais R1 ne suit aucune des tendances : les compteurs restent visibles, il n'y a pas de surface live, et l'iPhone reste figé. On se retrouve au niveau d'un Baby Tracker (Nighp) sans Live Activity.

```
iOS petit / Android 2×2        iOS moyen / Android 3×2
┌─────────────────┐            ┌──────────────────┬──────────────────┐
│ (Lina)          │            │ (Lina)           │      Aujourd'hui │
│ ● Dernier repas │            │ ● Dernier repas  │ 0 repas          │
│ il y a 6h58     │            │ il y a 6h58      │ dernier hier à   │
│ dernier hier à  │            │ ● Dernier change │   20:14          │
│   20:14         │            │ il y a 2h10      │ 1 change         │
└─────────────────┘            └──────────────────┴──────────────────┘
Android 4×2 : le 3×2, plus « 0 min de sommeil » à droite, sans fil (le fil défilant disparaît)
iOS grand : le moyen, puis « Évènements récents » sur 7 lignes fixes
En session : le chrono remplace le bloc de gauche (comme aujourd'hui)
```

- **Ce qui est partagé** : les données, `canWrite`, et une fonction de libellés (« il y a », « dernier hier à ») recopiée dans les deux widgets avec un test de parité.
- **Ce qui change par rapport à aujourd'hui** :
  - iOS parle comme Android ;
  - le Proche n'a plus d'action ;
  - plus aucun défilement ;
  - Android 4×2 perd son fil caché ;
  - le moyen iOS ne gagne pas de fil.
- **Coût** : 3 à 4 jours (plateformes A 3-4, architecture A 2-3, accessibilité A 1-2 pour la seule partie accessibilité).
- **Risques** :
  - les « 0 repas » occupent toujours la meilleure place le matin (retour n° 5 non réglé) ;
  - régression perçue sur Android 4×2, où le fil disparaît ;
  - l'iPhone reste figé sans E7 ;
  - la dette baisse peu, car la mise en page reste codée deux fois.
- **Notes des cellules** : plateformes A 12/20, architecture A 12/20, accessibilité A 13/20. Design et produit n'ont pas noté d'option équivalente. Les plus proches sont design C (14/20) et produit P3 (11/20) : même périmètre de fil, réservé au grand, mais sans les compteurs.

---

### R2 « Depuis + fil fixe » : refonte partielle du contenu (contrat v2) — **recommandation de 5 cellules sur 5**

**Principe.** Un modèle de contenu partagé, `buildNowWidgetContent()`, produit des emplacements triés par priorité :
1. sessions ;
2. rappel dépassé ;
3. repas ;
4. change ;
5. fil.

Chaque moteur se contente de placer N emplacements selon la taille :
- petit / 2×2 : 2 emplacements ;
- moyen / 3×2 : 2 emplacements et un fil de 3 lignes ;
- 4×2 : 2 emplacements, un fil de 4 lignes et le pied ;
- grand : 2 emplacements, le pied et un fil de 7 lignes.

Autres règles :
- « il y a » est en héros ;
- les compteurs passent dans un pied « Auj. » visible seulement en 4×2 et en grand, et masqué si tout vaut 0 (compromis entre design et produit) ;
- quand une session est en cours, le chrono remplace le bloc repas.

C'est la convergence de design A, architecture B, accessibilité B, produit P1 (sans l'auteur) et plateformes B (partie widget).

**Positionnement face au marché.**
- La hiérarchie « il y a d'abord » rejoint les standards : Nara, Mango StandBy, la complication Sprout.
- Un fil visible dès le moyen, c'est ce que seul Mango propose (en grand uniquement). SuiviBaby s'en sert comme différenciateur multi-aidants face à Huckleberry.
- Gratuit et sans incitation à payer, alors que Huckleberry et Nighp réservent leurs widgets à l'abonnement.
- Avec le push Android, c'est le « vrai pour toute la famille » que les avis reprochent aux concurrents de ne pas tenir.

```
iOS petit / Android 2×2 (= StandBy)
┌─────────────────┐   en session :   ┌─────────────────┐
│ (Lina)          │                  │ (Lina)          │
│ ● Repas         │                  │ ● Tétée · G     │
│ il y a 6h58     │                  │ 12:41           │
│ ● Change        │                  │ depuis 02:59    │
│ il y a 2h10     │                  │ ● Change 2h10   │
└─────────────────┘                  └─────────────────┘

iOS moyen / Android 3×2 (défaut)
┌──────────────────┬────────────────────────┐
│ (Lina)           │ Récents                │
│ ● Repas          │ 01:02 ● Change · pipi  │
│ il y a 6h58      │ 20:14 ● Biberon 150 ml │
│ ● Change         │ 19:30 😊               │
│ il y a 2h10      │            màj 01:03 ¹ │
└──────────────────┴────────────────────────┘
¹ iOS seulement, affiché si la donnée a plus de 2 h (tant qu'E7 n'existe pas)

Android 4×2
┌──────────────────┬────────────────────────┐
│ (Lina)           │ Récents                │
│ ● Repas          │ 01:02 ● Change · pipi  │
│ il y a 6h58      │ 20:14 ● Biberon 150 ml │
│ ● Change         │ 19:30 😊               │
│ il y a 2h10      │ 18:45 ● Bain           │
│ Auj. 0 repas · 1 change · 1h20 de sommeil │
└───────────────────────────────────────────┘

iOS grand
┌───────────────────────────────────────────┐
│ (Lina)                                    │
│ ● Repas              │ ● Change           │
│ il y a 6h58          │ il y a 2h10        │
│ dernier hier à 20:14 │ dernier à 01:02    │
│ Auj. 0 repas · 1 change · 1h20 de sommeil │
│ Évènements récents                        │
│ 01:02 ● Change · pipi                     │
│ 20:14 ● Biberon 150 ml                    │
│ … 7 lignes fixes                          │
└───────────────────────────────────────────┘
Aucun évènement : « aucun noté ». Rappel dépassé : rouge et mot « rappel ».
Proche : mêmes contenus, aucune zone d'action, libellé vocal « consulter ».
```

- **Ce qui est partagé** :
  - l'ordre et les priorités, la règle des emplacements par taille ;
  - les libellés, le texte vocal (`a11y`), les actions (`tap` absent si `canWrite=false`) ;
  - le contrat `v:2` qui servira au FCM aujourd'hui et à l'APNs plus tard.
  
  Forme retenue : les horodatages bruts et une fonction de libellés du jour recopiée dans chaque widget avec un test de parité (proposition architecture). C'est ce qui respecte l'isolation du code widget et évite qu'un décalage de version entre app et serveur casse l'affichage, risque signalé par l'accessibilité. Les chronos restent natifs, côté client.
- **Ce qui change par rapport à aujourd'hui** :
  - le `LazyColumn` disparaît ;
  - le moyen iOS gagne un fil ;
  - les compteurs quittent la colonne droite ;
  - le widget Android passe d'environ 745 à environ 350 lignes (estimation) ;
  - le fanout envoie `v:2` aux binaires qui déclarent `widgetCap>=2`, les autres restent en v1.
  
  Écart assumé à un choix tranché : le format « dernier à 19:37 / dernier hier à 19:37 / dernier le 11/11 » est conservé, mais il n'apparaît qu'en grand et dans le texte vocal. Ailleurs, il répète le « il y a » juste au-dessus (argument de la cellule design). Si Yoss tient à le voir partout, on le remet sous le chiffre en petit / 2×2, au détriment de la ligne change.
- **Coût** : 6 à 8 jours (architecture 6-8, produit 5-7, plateformes 5-6, design 4-5, accessibilité B 3-4 sans le contrat v2). Ordre : modèle partagé et `canWrite`, puis Android, puis iOS.
- **Risques** :
  - fil iOS périmé tant qu'E7 n'existe pas (parade : « màj HH:MM », lu à voix haute) ;
  - prototype « il y a 6h58 » à valider sur iOS (`timerInterval` compté vers le haut, sans secondes) ;
  - période de double compatibilité v1/v2 ;
  - troncature des libellés du fil en 3×2 ;
  - grand iOS jamais vu sur appareil ;
  - le patch reste en place, même s'il n'est plus étendu.
- **Notes des cellules** : design A 17/20, architecture B 17/20, accessibilité B 17/20 (elle réservait le fil au plus grand format), produit P1 17/20 (avec l'auteur, qui passe ici en R3), plateformes B 17/20 (pour la partie widget seulement ; la note complète suppose les surfaces live de R3).

---

### R3 « Famille en direct » : R2 plus les surfaces live, le push iOS, l'auteur et un widget Actions

**Principe.** Chaque information va là où l'OS la sert le mieux, et tous les aidants voient la même chose :
1. **Écran d'accueil** : R2, avec l'auteur ajouté au fil hors tétée (« Change · pipi — Awa », « Sieste en cours — lancée par Awa »).
2. **Sessions** : Live Activity et Dynamic Island sur iOS, notification permanente sur Android (en Live Update à partir d'Android 16). Les deux reprennent la `card` de session de R2, avec chrono G/D et jamais d'auteur sur une tétée. Dans le widget, le chrono passe en version compacte.
3. **Push iOS (E7)** : le même `cards[]` part en APNs, ce qui rend possible une Live Activity partagée entre aidants (comme Nara).
4. **V1.5, après le lancement** : un second widget « Actions », réservé aux Parents, avec des boutons App Intents sur iOS 17 et `actionRunCallback` sur Glance. Le widget principal n'est pas alourdi (tendance n° 3 du marché).

**Positionnement face au marché.**
- R3 rattrape les leaders sur leurs points forts : Live Activity (Huckleberry, Nighp, Nara, Sprout), Live Update Android (Huckleberry, Dobbin), saisie en un geste (Sprout, Baby Daybook, Mango).
- Il les dépasse sur leurs faiblesses : affichage synchronisé pour toute la famille sur les deux OS (la Live Activity de Huckleberry est propre à l'appareil), et un widget Android complet et gratuit.
- C'est le seul à occuper les 3 manques repérés par la cellule marché.

```
iOS petit / Android 2×2 : identique à R2 (StandBy)

iOS moyen / Android 3×2
┌──────────────────┬───────────────────────────┐
│ (Lina)           │ Récents                   │
│ ● Sieste en cours│ 01:02 ● Change · pipi —Awa│
│ 0:42 — lancée    │ 20:14 ● Biberon 150 ml    │
│   par Awa        │ 19:30 😊                  │
│ ● Repas 6h58     │                           │
└──────────────────┴───────────────────────────┘
(la tétée n'a jamais d'auteur : « ● Tétée · G 12:41 »)

Android 4×2 / iOS grand : R2, plus l'auteur sur les lignes hors tétée

Surfaces live
Live Activity / Dynamic Island         Notification permanente Android (Live Update 16+)
┌──────────────────────────────┐       ┌──────────────────────────────┐
│ (Lina) ● Tétée · G    12:41  │       │ SuiviBaby · Lina             │
│ depuis 02:59                 │       │ ● Tétée · G en cours  12:41  │
└──────────────────────────────┘       │ depuis 02:59                 │
                                       └──────────────────────────────┘
Widget « Actions » (V1.5, Parent uniquement ; non proposé à un Proche)
iOS petit / Android 2×2        iOS moyen / Android 3×2
┌─────────────────┐            ┌─────────────────────────────────┐
│ [+ Repas]       │            │ [+ Repas] [+ Change] [Tétée G]  │
│ [+ Change]      │            │ [Sieste]  [Biberon]  [Tétée D]  │
└─────────────────┘            └─────────────────────────────────┘
```

- **Ce qui est partagé** : tout R2, plus :
  - le type `card` de session commun au widget, à la Live Activity et à la notification ;
  - `recent[].by`, avec un test unitaire qui garantit l'absence d'auteur sur une tétée ;
  - une seule charge utile pour FCM et APNs (estimée à moins de 2 Ko).
- **Ce qui change par rapport à aujourd'hui** :
  - l'iPhone suit en temps réel ;
  - les sessions sortent de l'écran d'accueil vers l'écran verrouillé ;
  - le prénom de l'aidant s'affiche sur l'écran d'accueil ;
  - un deuxième widget apparaît en V1.5.
- **Coût** : R2 (6-8 j), plus Live Activity et notification (4 j, déjà au plan S4/S5), plus E7 (3-5 j), plus l'auteur (environ 1 j). Cela fait **14 à 18 jours avant le 2/2/2027**, puis le widget Actions : **8 à 10 jours en V1.5**. Total : 22 à 28 jours.
- **Risques** :
  - Live Activity limitée à 8 h, désactivée la nuit par défaut ;
  - Android 16 refuse la promotion en Live Update si la vue est personnalisée ;
  - budget de push silencieux iOS ; push direct de widget (iOS 26) à vérifier dans expo-widgets ;
  - confidentialité de l'auteur (`privacySensitive`, et la nounou doit savoir que son prénom s'affiche) ;
  - pour le widget Actions : jeton widget, Cloud Function idempotente, file hors ligne, revue de sécurité, risque de double saisie.
  
  Charge totale élevée pour une équipe d'une personne avant le lancement.
- **Notes des cellules** :
  - plateformes : B 17/20 pour l'ensemble avec surfaces live et E7 ; C (actions) 11/20 maintenant, 15/20 en V1.5 ;
  - produit : P1 17/20 pour l'auteur ; P2 « Relais » 13/20 (R3 en reprend l'auteur, mais pas l'état « dernier passage », jugé trop cher) ;
  - architecture C (natif) 11/20 : non applicable, R3 reste sur les moteurs actuels ; l'architecture rappelle que les App Intents pourraient un jour justifier ce passage ;
  - design et accessibilité n'ont pas noté de surfaces live.

---

## 5. Tableau récapitulatif

| | R1 Aligner | R2 Depuis + fil fixe | R3 Famille en direct |
|---|---|---|---|
| Nature | Évolution | Refonte partielle (contenu) | Refonte partielle et extension multi-surfaces |
| Jours | 3-4 | 6-8 | 14-18 avant le 2/2, puis 8-10 en V1.5 |
| Défilement | Aucun | Aucun | Aucun |
| Fil visible | Grand iOS seulement | Moyen / 3×2 et plus | Moyen / 3×2 et plus, avec auteur |
| iPhone temps réel | Non | Non (« màj HH:MM ») | Oui (E7) |
| Notes | 12, 12, 13 | 17 ×5 | 17 (plateformes, produit), 11→15 (actions) |
| Tendances du marché suivies | 0 sur 5 | 1 et 5 (différenciation) | 1, 2, 3, 4 et 5 |

**Lecture du rapporteur.** R2 obtient l'unanimité comme cible du widget. R3 est surtout l'ordre de marche que proposent les cellules plateformes et produit, avec E7 et Live Activity déjà au plan. Le board doit trancher deux questions :
1. Valide-t-on R2 seul, ou R2 et la partie « avant le 2/2 » de R3 ?
2. Faut-il afficher l'auteur sur le fil hors tétée ? C'est l'arbitrage de confidentialité porté par la cellule produit.

Dans tous les cas, on commence par les correctifs de R1 (`canWrite`, accessibilité).
