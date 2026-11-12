# SuiviBaby — Offre v2 : panel acheteurs et CFO sur les architectures A, B et C (12/11/2026)

> Skills suivies : **founder-consumer** (panel) et **founder-cfo** (économie unitaire).
> Entrée : `v2-offers.md` (A « Prêt pour chaque examen », B « Pack Bébé + Voix+ », C « Famille »).
> Le dépôt n'a pas été modifié.
>
> **Avertissement.** Les acheteurs sont des **personas simulés**, pas de vrais clients. Ils servent à faire remonter des objections, pas à prédire une conversion : un modèle de langage a tendance à être conciliant, donc un taux d'achat simulé est un **plafond**. Les coûts et les conversions du modèle sont des **estimations**. Ce n'est pas un avis financier, fiscal ou juridique : faites vérifier la structure (TVA, IS, rémunération du président) par l'expert-comptable.

Fichiers :
- Panel : `docs/strategie/analyses/v2_panel/` (pitchs `pitch_A.md`, `pitch_B.md`, `pitch_C.md`, `pitch_install_*.md` ; panels `buy_A`, `buy_B`, `buy_C`, `install_A`, `install_B`, `install_C`, chacun avec `results.md`, `answers/` et `briefs/`)
- CFO : `docs/strategie/analyses/v2_cfo/` (`model_v2_cfo.py`, `model_out.json`, `numbers_{A,B,C}_{aujourdhui,apres}.json`, sorties `ue_*.md` de `unit_economics.py`)

---

## 0. En bref

| | A — Prêt pour chaque examen | B — Pack 12,99 € + Voix+ | C — Famille |
|---|---:|---:|---:|
| **Achat (panel simulé, 8 personas)** | 1/8 | 1/8 | 1/8 |
| **Installation et usage pendant 1 semaine** | 6/8 | 6/8 | **4/8** |
| Achèteraient « plus tard, si le rapport gratuit a servi » | 3 | **3 ou 4** | 0 |
| Prix au-delà du seuil « ça devient cher » | 6/8 au-delà de 3,49 €/mois | 5/8 au-delà de 12,99 € | 5/8 placent leur refus à 4,99 €/mois ou en dessous |
| **Valeur vie d'un payant (après chantier coûts)** | 23,7 € | 8,5 € le Pack (+ 11,9 € par Voix+) | **32,3 €** |
| **Part des inscrits qui doit payer** (200 inscrits/mois, SASU incluse, gratuit à 0,04 €) | 4,9 % | 11,8 % de Packs | **3,6 %** |
| Mois d'équilibre (base, gratuit à 0,04 €), avec / sans SASU | M13 / M3 | M13 / M4 | M14 / M4 |
| Mois d'équilibre avec le **coût actuel** (0,12 €) | jamais en 24 mois | jamais | jamais |
| Effort avant de vendre (`v2-offers.md`) | ≈ 16 j | ≈ 19 j | ≈ 21 à 25 j |

**Lecture en trois points :**
1. **Le panel ne départage pas les architectures sur l'achat.** Le même acheteur dit oui dans les trois cas : Seth (P008), le profil « paie volontiers pour gagner du temps ». C'est une progression par rapport au 0/8 du premier tour, mais un seul persona ne prouve rien. Le panel départage en revanche l'**installation** : C perd deux installations (6 → 4). Il montre aussi un **chemin vers l'achat** que C n'a pas : « j'achète après que le rapport gratuit a servi chez le pédiatre ».
2. **Le CFO départage nettement B**, qui est dernier : il faut 2,4 fois plus d'acheteurs que pour A. **Entre A et C, l'écart est faible** : 4,9 % contre 3,6 % de conversion nécessaire, et un équilibre à un mois d'écart.
3. **Le chantier sur les coûts compte plus que le choix d'architecture.** À 0,12 € par utilisateur gratuit, aucune architecture ne s'équilibre en 24 mois. À 0,04 €, les trois s'équilibrent vers M13-M14.

**Verdict sur les preuves : A pour lancer, C comme niveau supérieur après 3 mois de données, B écarté** (détail en §3).

---

## 1. Panel acheteurs (founder-consumer)

### 1.1 Méthode

- **Personas :** les 8 du premier tour, distribués à l'identique (même `customer.json`, n = 8, graine 2026 ; vérifié identique à `panel-v2/A/personas.json`). Il s'agit de parents français d'un enfant de 0 à 2 ans, répartis en 5 segments (mère primipare, père en horaires décalés, co-parent en garde alternée, nounou, parent très organisé) et 7 comportements d'achat.
- **Pitchs :** un par architecture, rédigé comme le diraient le paywall ou la fiche store, avec les prix et sans rien promettre qui ne soit pas construit (le widget n'est pas vendu). Ils sont dans `v2_panel/pitch_A.md`, `pitch_B.md` et `pitch_C.md`.
- **Deux questions, deux panels par architecture :**
  - « acheter » = souscrire l'offre payante ;
  - « installer » = installer et utiliser vraiment pendant une semaine (même pitch, seule la définition change).
- **Exécution :** 48 sous-agents, un brief par persona, réponses vérifiées et comptées par `python3 -I panel.py check/tally`. Aucune réponse n'a été écrite par le modérateur.

### 1.2 Résultats

| | A | B | C |
|---|---:|---:|---:|
| Achat | **1/8 (12 %)** | **1/8 (12 %)** | **1/8 (12 %)** |
| Qui achète | Seth (P008) : annuel après l'essai de 14 j | Seth (P008) : le Pack, pas Voix+ | Seth (P008) : annuel fondateurs, essai d'un mois |
| Pourquoi | « Arriver chez le pédiatre avec tout prêt au lieu de remonter nos messages WhatsApp » | « Pour 12,99 € une seule fois j'ai l'estimation de la prochaine sieste et tétée » | « Si la notif "Papa a donné le biberon" m'évite les dix messages WhatsApp par jour avec la nounou » |
| Installation (1 semaine) | **6/8** | **6/8** | **4/8** |
| Refusent d'installer | Tomas (nounou), Ravi (épuisée) | Tomas, Ravi | Tomas, Ravi, **Isla (avis)**, **Dev (garde alternée)** |
| Motifs de refus d'achat | need 5, trust 1, price 1, habit 1 | need 6, trust 1, habit 1 | need 5, price 2, trust 1 |

Premier tour, pour comparer : 0/8 en achat et 6/8 en installation (`panel-v2/A`, `panel-install/A`).

### 1.3 Pourquoi ils ne paient pas (citations simulées, pas des témoignages)

1. **« Le gratuit suffit »** : 16 refus sur 21. Le 1ᵉʳ rapport pédiatre gratuit et le calendrier des examens gratuit ont **renforcé** cette réponse : « même un rapport pédiatre offert » (Priya, P004, en A).
2. **« La prochaine tétée, je la devine »** : la prédiction ne convainc pas.
   > « La prochaine tétée, c'est mon bébé qui me la dit, et une fourchette ne m'apporte rien. » (P004, A)
   >
   > « Huckleberry fait déjà les prédictions… ici l'estimation n'est qu'une fourchette. » (P008, A, B et C)
3. **Confiance et pérennité** : « petite app française inconnue, sera-t-elle encore là ? ». Isla (P002) et Ravi (P007) le disent dans les trois cas. La garantie de préavis de 6 mois est perçue comme « une promesse ».
4. **Spécifique à C : qui paie ?**
   > « En garde alternée, qui paie ? Je ne vais pas sortir 40 € par an pour que l'autre parent en profite. » (Dev, P005)
   >
   > « Payer 40 € par an de ma poche pour l'enfant de quelqu'un d'autre. » (Tomas, nounou)

   Le partage « gratuit, la norme » vide aussi le cœur de l'offre : « le partage en direct est déjà gratuit, donc je paie surtout pour les notifs » (P008).
5. **Spécifique à B : le prix du Pack** se situe au-dessus du seuil « cher » pour 5 personas sur 8. Quinn (P003) ne l'achèterait pas au-delà de 12 €.

### 1.4 Ce qui les ferait changer d'avis

- **Le rapport qui a fait ses preuves à un examen**, puis un achat. C'est le chemin le plus cité :
  - en **B** par Priya (P004), Dev (P005) et Elle (P006), pour le Pack : « si le pédiatre trouve le rapport utile, je prendrais le Pack à 12,99 € au prochain examen » ;
  - en **A** par Quinn (P003) et Dev (P005), qui prendraient l'achat à vie « s'il passait sous 20 € », et par Elle (P006) pour l'annuel ;
  - en **C**, personne : les seuls déclencheurs cités supposent de **réduire le gratuit**, ce qui est contraire aux contraintes de Yoss.
- **Des avis visibles** (note ≥ 4,5 avec des avis récents) et le bouche-à-oreille dans les groupes de mamans : Isla et Ravi, dans les trois cas.
- **Pour la nounou :** être invitée par les parents, ou recommandée par la PMI ou le RPE. Une offre « assistante maternelle » est demandée en C.
- **Pour Ravi (épuisée) :** noter en un geste depuis l'écran verrouillé, c'est-à-dire le widget.

### 1.5 Prix déclarés (simulés, unités non imposées dans le brief, donc à prendre avec prudence)

- **A :** 6 personas sur 8 situent « ça devient cher » vers 2,50-2,99 €/mois et « trop cher » vers 4-5 €/mois. Le prix de 3,49 € se trouve entre les deux. Seuls Seth et Isla l'acceptent sans réserve.
- **B :** la médiane de « bonne affaire » pour le Pack est de 4,5 €, celle de « cher » de 9,5 € et celle de « trop cher » de 15 €. À 12,99 €, le Pack est dans la zone « cher mais possible ». À 14,99 € (après la sortie du widget), il atteint le seuil de refus de 4 personas sur 8.
- **C :** 4 personas placent le refus à 4,99 €/mois, exactement le prix demandé. Ceux qui ont raisonné à l'année placent le « trop cher » à 30 € (Dev), 60 € (Isla) et 80 € (Seth).

### 1.6 Ce qu'il faut en retenir

- Le panel **ne prouve pas** qu'une architecture vend mieux qu'une autre : 1/8 partout, le même acheteur à chaque fois.
- Il donne **deux signaux exploitables** :
  - C fait **reculer l'installation**. Mettre l'abonnement dans le titre et parler de 40 €/an refroidit les profils « lit les avis » et « garde alternée ». Avec 8 personas, c'est un écart de 2 personnes : une tendance, pas une mesure ;
  - le déclencheur d'achat le plus crédible est **le rapport gratuit qui sert à un vrai examen**. Ce mécanisme est présent dans A et B, absent dans C.
- **Limite :** 8 personas, c'est un « quick » très réduit (la skill recommande 20 à 100). Il faut le confirmer par le sondage monadique réel de `v2-offers.md` §10.

---

## 2. CFO (founder-cfo)

### 2.1 Hypothèses

Ce sont celles du CFO de base du 11/11 et de `v2-offers.md`. Toutes sont des estimations.

| Hypothèse | Valeur |
|---|---|
| Inscrits | 200 au mois 1, puis +6 %/mois (CFO base) ; la sensibilité fait varier ce point de départ |
| Attrition des actifs | 8 %/mois (environ 12,5 mois d'usage) ; churn mensuel 8 % ; renouvellement annuel 35 % |
| Conversion de base (par inscrit) | A 5 % ; B 8 % de Packs + 1,5 % de Voix+ ; C 3,5 % (hypothèses de `v2-offers.md`, non mesurées) |
| Mix | A : 40/50/10 (mensuel/annuel/à vie) pendant l'Offre Fondateurs (M1-M2), puis 45/55 ; C : 30/70 avec 1ʳᵉ année à 29,99 € en M1-M2 ; Voix+ : 50/50 |
| Net après TVA et store | A 2,47 €/mois · 17,70 €/an · 33,33 € à vie ; B Pack 8,66 € · Voix+ 1,41 €/mois · 10,62 €/an ; C 3,53 €/mois · 28,33 €/an (21,24 € la 1ʳᵉ année fondateurs) |
| **Cas « aujourd'hui »** | Gratuit 0,12 €/actif/mois ; surcoût d'un payant : A 0,53 €, Voix+ 0,53 €, Pack 0,01 €, C 1,09 € (voix à 0,50 € par parent, avant le parseur local) |
| **Cas « après chantier coûts »** | Gratuit 0,04 € ; surcoût d'un payant : A 0,33 €, Voix+ 0,33 €, Pack 0,01 €, C 0,69 € |
| Frais fixes | 19,25 €/mois (Apple 8,25 € et infra fixe 11 €), **+ 110 € de SASU** (compta et banque) dans les cas « avec SASU » |
| Démarrage | 150 € (médiateur, estimation) ; le temps de développement n'est pas compté en cash |
| CAC | 0 € (organique) ; le plafond de CAC est calculé à part |

Le modèle (`v2_cfo/model_v2_cfo.py`) prolonge `v2_work/model_v2.py`, avec une simulation mensuelle sur 24 mois **en trésorerie** : l'annuel et l'achat à vie sont encaissés d'avance. Le « mois d'équilibre » est le premier mois où le résultat **lissé** devient positif (annuel réparti sur 12 mois, achat à vie sur 24 mois, Pack sur 12,5 mois). Les seuils calculés recoupent ceux de `v2-offers.md` (A 4,9 contre 4,8 % ; B 11,8 contre 11,5 % ; C 3,6 contre 3,6 %).

### 2.2 Économie d'un payant

| | A | B (Pack) | C |
|---|---:|---:|---:|
| Contribution par payant-mois, aujourd'hui → après | 1,30 € → **1,50 €** | 0,68 € → 0,68 € (Pack lissé) | 1,53 € → **1,93 €** |
| Durée de vie moyenne d'un payant | 15,8 mois | 12,5 mois (usage) | 16,7 mois |
| **Valeur vie (LTV) d'un payant**, aujourd'hui → après | 20,5 € → **23,7 €** | 8,5 € (+ Voix+ : 8,8 € → 11,9 €) | 25,6 € → **32,3 €** |
| Valeur nette d'un **inscrit** (conversion de base, moins son coût gratuit sur 12,5 mois), aujourd'hui → après | −0,47 € → **+0,68 €** | −0,69 € → +0,36 € | −0,60 € → **+0,63 €** |
| **Plafond de CAC par payant**, après | **14 €** | 5 € | **18 €** |
| Plafond de CAC par installation, après | ≈ 0,68 € | ≈ 0,36 € | ≈ 0,63 € |

**À retenir :**
- Avec les coûts actuels, **chaque inscrit fait perdre de l'argent**, quelle que soit l'architecture.
- Après le chantier coûts, une installation vaut 0,36 à 0,68 €. Une installation payante d'app parentalité coûte plus de 1,5 € : **pas de publicité payante, dans aucun cas**.

### 2.3 Part des utilisateurs qui doit payer pour s'équilibrer

État stable, inscrits constants. Le premier chiffre est la conversion par inscrit, le second (entre parenthèses) la part des utilisateurs actifs qui paient.

| Cas | A | B (Packs, + 1,5 % Voix+) | C |
|---|---:|---:|---:|
| 200 inscrits/mois, SASU, gratuit 0,04 € | **4,9 %** (6,1 % des actifs) | 11,8 % (13,7 %) | **3,6 %** (4,8 %) |
| 200 inscrits/mois, sans SASU, 0,04 € | 2,5 % (3,2 %) | 5,1 % (6,9 %) | 1,8 % (2,5 %) |
| 200 inscrits/mois, SASU, gratuit 0,12 € | 10,5 % (13,2 %) | 24,5 % (26,3 %) | 8,4 % (11,2 %) |
| 200 inscrits/mois, sans SASU, 0,12 € | 7,8 % (9,8 %) | 17,8 % (19,6 %) | 6,2 % (8,3 %) |
| **≈ 500 actifs** (40 inscrits/mois), SASU, 0,04 € | 15,8 % (20 %) | 43 % (45 %) | 11,6 % (15,5 %) |
| ≈ 500 actifs, sans SASU, 0,04 € | 4,2 % (5,3 %) | 9,8 % (11,6 %) | 3,0 % (4,1 %) |
| ≈ 500 actifs, SASU, 0,12 € | 23 % (29 %) | 56 % (58 %) | 19 % (25 %) |

**Point d'honnêteté sur C :** un abonnement C couvre une famille, soit environ 2 comptes actifs. « 4,8 % des actifs » représente donc **environ 9 à 10 % des familles**, alors que pour A, il s'agit de 6,1 % des comptes. La comparaison « par foyer qui décide » rapproche fortement A et C.

**À 500 actifs, avec la SASU, aucune architecture n'est atteignable** (12 à 45 % de payants). L'objectif de la 1ʳᵉ année est de couvrir l'infra et la voix, ce qui demande 3 à 5 % hors SASU.

### 2.4 Trajectoire sur 24 mois (scénario base : 200 inscrits/mois, +6 %/mois)

| | A | B | C |
|---|---:|---:|---:|
| **Après chantier coûts (0,04 €), avec SASU** | | | |
| Mois d'équilibre | **M13** | M13 | M14 |
| Résultat mensuel à M24 | **+170 €** | +97 € | +140 € |
| Trésorerie cumulée à M24 | +2 015 € | +2 426 € | +2 446 € |
| Besoin de trésorerie maximal | 216 € | 150 € | 210 € |
| Part des actifs qui paient à M24 | 6,2 % | 9,8 % | 4,5 % |
| **Après chantier coûts, sans SASU** | M3 · +280 €/mois à M24 | M4 · +207 € | M4 · +250 € |
| **Aujourd'hui (0,12 €), avec SASU** | | | |
| Mois d'équilibre | jamais | jamais | jamais |
| Résultat mensuel à M24 | −347 € | −370 € | −409 € |
| Besoin de trésorerie sur 24 mois | **3 763 €** | 2 818 € | 3 687 € |
| **Aujourd'hui, sans SASU** | jamais · −237 €/mois · 1 123 € | jamais · −260 € · 178 € | jamais · −299 € · 1 047 € |

**Pourquoi B paraît moins gourmand en trésorerie :** le Pack est encaissé d'un coup. Mais son résultat mensuel à M24 est le plus faible, car il ne renouvelle rien.

**Script de la skill (`unit_economics.py`, année 1, unité = payant-mois, lissé et non en trésorerie) :**

| | A aujourd'hui → après | B aujourd'hui → après | C aujourd'hui → après |
|---|---:|---:|---:|
| Seuil (payants actifs) | 211 → 118 | 334 → 206 | 193 → **97** |
| Payants à la fin de l'année 1 | 145 | 231 | 107 |
| Résultat de l'année 1 | −2 200 € → −812 € | −2 130 € → −870 € | −2 439 € → −971 € |
| Besoin de trésorerie (lissé) | 2 350 € → 1 025 € | 2 280 € → 1 046 € | 2 589 € → 1 140 € |

Le script affiche « $ » et « par jour » : lire « € » et « par mois ». L'écart avec le besoin de trésorerie du modèle vient de l'encaissement d'avance de l'annuel, que le script ne voit pas.

### 2.5 Sensibilité

**À la conversion** (après chantier coûts, SASU incluse ; résultat mensuel à M24, puis mois d'équilibre) :

| Conversion par inscrit | 2 % | 3 % | 4 % | 5 % | 6 % | 8 % | 10 % |
|---|---:|---:|---:|---:|---:|---:|---:|
| A | −144 €, jamais | −39 €, jamais | +65 €, M19 | **+170 €, M13** | +274 €, M10 | +483 €, M7 | +692 €, M6 |
| B (Packs) | −182 € | −135 € | −89 € | −42 €, jamais | +4 €, M24 | **+97 €, M13** | +190 €, M10 |
| C | −71 €, jamais | +70 €, M18 | **+211 €, M12** | +352 €, M9 | +493 €, M8 | +774 €, M6 | +1 056 €, M5 |

Au coût actuel (0,12 €), il faut **10 % pour A (équilibre M16)** et 8 % pour C (M17), et B ne s'équilibre pas même à 12 %.

**Aux inscrits par mois** (point de départ, +6 %/mois ; après chantier coûts, avec SASU) :

| Inscrits au mois 1 | 50 | 100 | 200 | 300 |
|---|---:|---:|---:|---:|
| A (5 %) | jamais (−55 €/mois à M24) | M22 (+20 €) | M13 (+170 €) | **M9** (+319 €) |
| B (8 % de Packs) | jamais (−73 €) | jamais (−16 €) | M13 (+97 €) | M10 (+211 €) |
| C (3,5 %) | jamais (−62 €) | M24 (+6 €) | M14 (+140 €) | M11 (+275 €) |

**Au coût actuel, plus d'inscrits signifie plus de pertes**, dans les trois architectures. Pour A, la perte mensuelle à M24 passe de −184 € avec 50 inscrits à −455 € avec 300. C'est la confirmation du premier tour : **il ne faut pas pousser l'acquisition avant d'avoir baissé le coût du gratuit.**

### 2.6 Note du CFO

- **La marge :** un payant A laisse 1,50 € par mois après le store et la voix (70 % de son prix HT), un payant C 1,93 € (62 %), un Pack 0,68 € par mois d'usage.
- **La ligne à surveiller : le coût de l'utilisateur gratuit.** Passer de 0,12 € à 0,04 € fait passer l'équilibre de « jamais » à M13-M14, et le besoin de trésorerie de 2 800-3 800 € à 150-220 €. Aucun choix d'architecture ou de prix ne fait autant.
- **Trésorerie :** avec le chantier coûts, 150 à 220 € suffisent. Sans lui, prévoir 3 000 à 4 000 € sur 24 mois, dont l'essentiel correspond aux 110 €/mois de SASU qui existent avec ou sans l'app.
- **Trois leviers chiffrés :**
  1. le coût du gratuit : 0,12 € → 0,04 € (voir ci-dessus) ;
  2. la conversion : pour A, passer de 4 à 6 % fait passer le résultat à M24 de +65 € à +274 € et avance l'équilibre de M19 à M10 ;
  3. le volume : pour A, passer de 100 à 300 inscrits au départ avance l'équilibre de M22 à M9, **mais seulement une fois les coûts baissés**.
- **Conditions du board :** aucun `founder/board.md` n'existe, elles n'ont donc pas été évaluées.

---

## 3. Quelle architecture gagne sur les preuves

| Critère | Gagnant | Chiffre décisif |
|---|---|---|
| Achat (panel) | égalité | 1/8 partout, même persona |
| Installation (panel) | A = B | 6/8, contre 4/8 pour C |
| Chemin crédible vers l'achat (panel) | A, B | 3 personas « après le rapport gratuit », 0 en C |
| Prix acceptés (panel) | A (de peu) | 3,49 € entre « cher » et « trop cher » ; C à 4,99 € = refus pour 4 sur 8 |
| Valeur par payant | **C** | 32,3 € contre 23,7 € (A) et 8,5 € (B) |
| Conversion nécessaire | **C** | 3,6 % contre 4,9 % (A) et 11,8 % (B) ; par famille, C ≈ A |
| Équilibre et trésorerie | A ≈ C ≈ B | M13 à M14 ; 150 à 220 € |
| Effort et risque | **A** | 16 j contre 19 j (B) et 21-25 j (C) |

**Conclusion :**
- **B perd sur les chiffres.** Il exige 11,8 % d'acheteurs, soit 2,4 fois A. Son plafond de CAC est de 5 € par payant et il ne renouvelle rien. À retenir quand même : le panel aime l'idée d'un achat unique déclenché par un rapport qui a servi. On peut la tester comme option dans A, avec un achat à vie bas (le panel cite « moins de 20 € »), sans en faire l'architecture.
- **C gagne sur le papier** (valeur par payant +36 %, seuil −1,3 point). Mais ce gain repose sur une conversion par famille que le panel ne soutient pas : installation à 4/8, la question « qui paie ? » en garde alternée et chez la nounou, aucun déclencheur hors réduction du gratuit. Le chantier dure aussi 5 à 9 jours de plus.
- **A est le meilleur pari pour lancer.** Il garde l'installation, il a un déclencheur d'achat observé (le rapport) et il se construit le plus vite. Son seuil n'est que 1,3 point au-dessus de C.
- **Ajouter C comme niveau « Famille » après 3 mois**, si les données montrent que les familles partagées convertissent.
- **Condition préalable commune :** le chantier qui ramène le gratuit à 0,04 € **avant** toute acquisition. Sans lui, aucune des trois ne s'équilibre en 24 mois.

**Ce qui pourrait inverser ce verdict :** dans le sondage réel, une intention d'achat par foyer au moins égale pour C, et 4,99 € sous le seuil du « trop cher ». Les règles de décision sont dans `v2-offers.md` §10.
