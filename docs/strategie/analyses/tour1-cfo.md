# SuiviBaby — CFO : économie unitaire et trajectoire 12-24 mois

*TESFA SASU — analyse du 2026-11-11 (skill founder-cfo). Ce n'est pas un conseil financier, fiscal ou juridique : faites valider la structure (rémunération du président de SASU, TVA, IS) par votre expert-comptable avant d'engager de l'argent.*

Fichiers de travail (dans le scratchpad, aucun fichier du dépôt modifié) :
- modèle 24 mois : `docs/strategie/analyses/cfo_work/model.py` (+ `sens.py`, `sens2.py`)
- entrées du script de la skill : `.../cfo_work/numbers_pessimiste.json`, `numbers_base.json`, `numbers_optimiste.json`
- sorties brutes de `unit_economics.py` : `.../cfo_work/ue_*.md` (recopiées en annexe ; le script affiche « $ », lire « € »)

---

## 1. La note du CFO (à lire en premier)

**La marge.** Chaque abonné-mois laisse **≈ 1,74 € de contribution** (scénario base) : 2,65 € HT de revenu moyen pondéré − 0,41 € de commission store − 0,50 € de coût vocal. Soit **66 % de marge sur coûts variables** : l'unité est saine.

**Le vrai problème n'est pas l'abonné, c'est l'utilisateur gratuit.** Avec l'hypothèse issue de vos chiffres (infra ≈ 60 €/mois à 500 utilisateurs, soit ≈ 0,09 €/utilisateur actif/mois, + ≈ 0,03 € de vocal gratuit), **chaque utilisateur gratuit coûte ≈ 0,12 €/mois**. Il faut donc qu'environ **7 % des utilisateurs actifs paient** juste pour couvrir l'infra des gratuits, avant même les 118 € de frais fixes SASU + Apple. Or, avec une offre gratuite plus généreuse que la concurrence, le scénario base (4 % de conversion) plafonne à **≈ 5 % d'actifs payants**. Conséquence contre-intuitive : **dans le scénario base, plus de croissance = plus de pertes** (doubler les inscriptions fait passer la perte mensuelle au mois 24 de −299 € à −465 €).

**La ligne à surveiller : le coût infra par utilisateur actif, puis le taux de conversion.** Preuve par les what-if (scénario base, 24 mois) :

| levier | besoin de trésorerie max | résultat mensuel au mois 24 | mois d'équilibre (exploitation) |
| --- | ---: | ---: | --- |
| base tel quel | 2 385 € | −299 € | non atteint en 24 mois |
| infra ramenée à 0,04 €/utilisateur | 314 € | −31 € | après M24 (extrapolation : ≈ M25-26) |
| conversion 6 % (×1,5) | 150 € | −52 € | après M24 (extrapolation : ≈ M26-28) |
| conversion 8 % | 150 € | +195 € | **mois 13** |
| conversion 6 % + infra 0,04 € | 150 € | +216 € | **mois 12** |
| prix +10 % | 1 402 € | −237 € | non atteint |
| plafond vocal utilisé à fond (50 cmd/j, 1,50 €/mois) | 5 436 € | −578 € | non atteint |

**La trésorerie.** Le besoin de cash reste faible en valeur absolue parce que vous ne vous payez pas et que l'acquisition est organique : **≈ 1 900 € sur l'année 1** (sortie du script de la skill, scénario base) et **jusqu'à ≈ 2 400 € (base) / 4 200 € (pessimiste) sur 24 mois**. Plus de la moitié de ce trou vient des 110 €/mois de compta + banque SASU, qui existent avec ou sans l'app. **Prévoir une réserve de 3 000 à 4 500 €** couvre les trois scénarios.

**Trois façons d'améliorer la marge (chiffrées, pas devinées) :**
1. **Faire baisser l'infra par utilisateur actif de 0,09 € à ≤ 0,04 €** (lectures Firestore, Cloud Functions min instances, photos, e-mail hebdo) : besoin de cash base 2 385 € → 314 € ; optimiste : équilibre au **mois 9** au lieu de jamais.
2. **Monter la conversion à 6-8 %** : paywall au bon moment (rapport pédiatre avant chacun des 20 examens obligatoires, 2ᵉ export PDF, 4ᵉ commande vocale du jour), essai sur l'annuel bien mis en avant. Conversion 8 % → équilibre **mois 13** en base.
3. **Prix +10 % net** (par ex. 34,99 €/an, ou 4,49 €/mois) : seuil année 1 de 142 → 123 abonnés, résultat année 1 −1 706 € → −1 517 €. Utile mais moins puissant que les deux premiers leviers ; votre prix reste sous Baby Daybook/Glow/Sprout, il y a de la marge.

**Conditions du board :** aucun `founder/board.md` n'existe ; non évalué.

---

## 2. Prix nets : ce qu'il reste vraiment par abonné

TVA 20 % puis commission store (Small Business Program 15 % ; Google 25 % sur les achats uniques EEE depuis le 2026-06-30).

| offre | prix TTC | HT | commission | net encaissé | net / mois |
| --- | ---: | ---: | ---: | ---: | ---: |
| Mensuel | 3,99 € | 3,325 € | 15 % | **2,83 €/mois** | 2,83 € |
| Annuel (essai 7 j) | 29,99 € | 24,99 € | 15 % | **21,24 €/an** | 1,77 € |
| À vie | 79,99 € | 66,66 € | 15 % Apple / 25 % Google | **56,66 € / 50,00 €** (≈ 53,33 € à 50/50) | 2,22 € si amorti sur 24 mois |

Coût variable par abonné premium : **0,50 €/mois** de vocal (≈ 15 commandes/j × ≈ 0,1 centime). Au plafond de 50 commandes/j : **1,50 €/mois**, ce qui ramène l'annuel à **0,27 €/mois** de contribution. Le plafond de 50/j est un risque de marge si une minorité d'utilisateurs l'atteint chaque jour.

---

## 3. Hypothèses (toutes explicites)

Sources : CONTEXT.md (prix, commissions, coûts vocaux et infra calculés le 2026-11-11) ; `docs/PREMIUM_OFFRE_CIBLE.md` et `docs/archive/2026/todo_monetisation_2026-11.md` (CPI 0,5-3 € estimés, conversions 4-6 % envisagées). Tout le reste est **estimation de ma part**, marquée comme telle.

| hypothèse | pessimiste | base | optimiste | justification (estimation) |
| --- | ---: | ---: | ---: | --- |
| Nouveaux inscrits mois 1 | 80 | 200 | 300 | organique seul : ASO FR, bouche-à-oreille, invitations de partage (2 parents + proches par bébé), groupes de parents |
| Croissance mensuelle des inscriptions | +3 % | +6 % | +8 % | → 158 / 764 / 1 761 inscrits au mois 24 (0,3 % à 3 % des ~55 000 naissances mensuelles) |
| Attrition des utilisateurs actifs / mois | 12 % | 8 % | 6 % | usage lié à l'âge du bébé (0-2 ans), abandon fort après J7 |
| **Conversion gratuit → payant** (par cohorte d'inscrits) | **2 %** | **4 %** | **6 %** | freemium santé 2-5 % ; offre gratuite très généreuse = bas de fourchette |
| Mix mensuel / annuel / à vie | 55/40/5 | 40/50/10 | 30/55/15 | essai 7 j uniquement sur l'annuel |
| Churn mensuel des abonnés mensuels | 12 % | 8 % | 6 % | |
| Renouvellement de l'annuel à 12 mois | 25 % | 35 % | 45 % | bébé grandit, besoin de suivi baisse |
| Durée d'usage d'un « à vie » | 24 mois | 24 mois | 24 mois | sert à l'amortir et au calcul du coût vocal |
| **CAC** | **0 €** | **0 €** | **0 €** | organique ; un test payant est modélisé à part (§6) |
| Infra | 16 € + 0,088 €/utilisateur actif | idem | idem | tiré de « 16 € à 0, 60 € à 500 » ; à mesurer réellement |
| Vocal gratuit | 0,03 €/utilisateur gratuit actif | idem | idem | ≈ 1 commande/j utilisée sur 3 |
| Fixes hors infra | 110 € SASU + 8,25 € Apple Developer | idem | idem | 99 €/an ; à retirer si déjà compté dans les 16 € |
| Dépense de démarrage | 150 € | 150 € | 150 € | adhésion médiateur (CM2C), **estimation à vérifier sur devis** |
| Rémunération du fondateur | 0 € | 0 € | 0 € | voir §5 pour le seuil qui vous paie |
| RevenueCat | 0 € | 0 € | 0 € | gratuit sous 2 500 $ de MTR, seuil approché seulement vers M24 en optimiste (revenu brut ≈ 2 000 €/mois) |

Mois 1 = premier mois où le paiement est en ligne en production (au plus tôt décembre 2026 – janvier 2027 : accord Apple Paid Apps, compte marchand Google, produits RevenueCat et 12 testeurs × 14 jours restent à faire). **Chaque mois de retard coûte ≈ 130-240 € de frais fixes sans revenu.**

---

## 4. LTV, plafond de CAC et payback

LTV = contribution nette (après commission et coût vocal), non actualisée.

| | pessimiste | base | optimiste |
| --- | ---: | ---: | ---: |
| LTV mensuel (2,33 €/mois ÷ churn) | 19,4 € | 29,1 € | 38,8 € |
| LTV annuel ((21,24 − 6) ÷ (1 − renouvellement)) | 20,3 € | 23,5 € | 27,7 € |
| LTV à vie (53,33 − 18 mois de vocal) | 44,3 € | 44,3 € | 44,3 € |
| **LTV pondérée par le mix** | **21 €** | **28 €** | **34 €** |
| **Plafond de CAC par abonné payant (LTV ÷ 3)** | **7 €** | **9 €** | **11 €** |
| Plafond de coût par installation (× conversion) | 0,14 € | 0,37 € | 0,67 € |
| Payback d'un CAC au plafond (÷ contribution 1,65-1,87 €/mois) | ≈ 4 mois | ≈ 5 mois | ≈ 7 mois |

Pour l'annuel et l'à vie, l'encaissement est immédiat (21,24 € ou ≈ 53 €) : un CAC sous ces montants est remboursé dès l'achat, mais le **renouvellement** décide de la rentabilité.

---

## 5. Seuils d'équilibre en nombre d'abonnés

Contribution par abonné-mois : 1,87 € (pessimiste, plus de mensuels) / 1,74 € (base) / 1,65 € (optimiste, plus d'annuels).

| | pessimiste | base | optimiste |
| --- | ---: | ---: | ---: |
| Fixes moyens année 1 (infra incluse) | 169 €/mois | 245 €/mois | 327 €/mois |
| **Abonnés payants actifs pour l'équilibre (année 1)** | **≈ 91** | **≈ 142** | **≈ 198** |
| Fixes moyens année 2 | 211 €/mois | 483 €/mois | 884 €/mois |
| Abonnés pour l'équilibre (année 2) | ≈ 113 | ≈ 278 | ≈ 534 |
| Abonnés réellement atteints au mois 24 | 30 | 290 | 974 |
| Part d'actifs payants au mois 24 | 2,8 % | 5,2 % | 7,4 % |

Le seuil monte avec la base gratuite : c'est pourquoi le chiffre de CONTEXT (≈ 75 abonnés « avec frais SASU ») n'est vrai qu'à ~500 utilisateurs. **Règle simple : l'équilibre exige ≈ 7 % d'actifs payants + ~80 abonnés pour les fixes.**

**Se payer :** pour 2 000 € net/mois au fondateur (coût ≈ 3 600 € chargé en salaire de président de SASU, **estimation à valider par le comptable**), il faut **≈ 2 100 à 2 400 abonnés payants actifs** en plus de l'équilibre. Aucun des trois scénarios n'y arrive en 24 mois : c'est un projet complémentaire à un revenu, pas un salaire à 2 ans, sauf conversion et croissance nettement au-dessus de l'optimiste.

---

## 6. Trajectoires sur 24 mois (modèle `model.py`)

« Résultat d'exploitation » = MRR net + achats à vie amortis sur 24 mois − coûts variables − fixes. « Trésorerie cumulée » = encaissements réels (l'annuel et l'à vie sont payés d'avance) − dépenses − 150 € de démarrage.

### Pessimiste (80 inscrits/mois, +3 %, conversion 2 %)

| mois | inscrits | actifs | abonnés (mens./ann./à vie) | MRR net | coûts | résultat expl. | tréso cumulée |
| ---: | ---: | ---: | --- | ---: | ---: | ---: | ---: |
| 1 | 80 | 80 | 1 / 1 / 0 | 4 € | 144 € | −141 € | −274 € |
| 6 | 93 | 389 | 4 / 4 / 1 | 19 € | 184 € | −164 € | −982 € |
| 12 | 111 | 645 | 7 / 9 / 1 | 36 € | 218 € | −180 € | −1 972 € |
| 18 | 132 | 855 | 9 / 12 / 2 | 48 € | 245 € | −194 € | −3 049 € |
| 24 | 158 | 1 059 | 12 / 15 / 3 | 60 € | 272 € | −207 € | **−4 212 €** |

Équilibre : **jamais** (il faudrait ≈ 113 abonnés, on en a 30). Besoin de cash : **≈ 4 200 €** sur 24 mois. Décision implicite : si les chiffres réels ressemblent à ça à M6, revoir l'offre (resserrer le gratuit) ou arrêter les frais de SASU dédiés.

### Base (200 inscrits/mois, +6 %, conversion 4 %)

| mois | inscrits | actifs | abonnés (mens./ann./à vie) | MRR net | coûts | résultat expl. | tréso cumulée |
| ---: | ---: | ---: | --- | ---: | ---: | ---: | ---: |
| 1 | 200 | 200 | 3 / 4 / 1 | 16 € | 162 € | −144 € | −175 € |
| 6 | 268 | 1 160 | 19 / 28 / 6 | 102 € | 295 € | −181 € | −446 € |
| 12 | 380 | 2 349 | 38 / 67 / 13 | 226 € | 466 € | −210 € | −1 042 € |
| 18 | 539 | 3 759 | 60 / 105 / 25 | 357 € | 665 € | −253 € | −1 658 € |
| 24 | 764 | 5 591 | 89 / 159 / 41 | 535 € | 925 € | −299 € | **−2 385 €** |

≈ 10 200 inscrits cumulés et ≈ 290 payants à M24 ; revenu normalisé ≈ 1 550 € (année 1) puis ≈ 5 240 € (année 2). Équilibre : **non atteint en 24 mois** à infra et conversion inchangées ; **mois 12** si conversion 6 % + infra 0,04 €/utilisateur. Besoin de cash : **≈ 2 400 €**.

### Optimiste (300 inscrits/mois, +8 %, conversion 6 %)

| mois | inscrits | actifs | abonnés (mens./ann./à vie) | MRR net | coûts | résultat expl. | tréso cumulée |
| ---: | ---: | ---: | --- | ---: | ---: | ---: | ---: |
| 1 | 300 | 300 | 5 / 10 / 3 | 33 € | 178 € | −139 € | +41 € |
| 6 | 441 | 1 922 | 35 / 73 / 20 | 226 € | 420 € | −150 € | +1 006 € |
| 12 | 699 | 4 376 | 79 / 188 / 51 | 555 € | 797 € | −128 € | +2 356 € |
| 18 | 1 110 | 7 859 | 141 / 331 / 101 | 985 € | 1 323 € | −113 € | +4 996 € |
| 24 | 1 761 | 13 103 | 236 / 558 / 180 | 1 654 € | 2 121 € | −67 € | +9 197 € |

Trésorerie positive dès M1 **mais c'est un piège** : ce sont des abonnements annuels et à vie payés d'avance (revenu à « servir » pendant 12-24 mois). En exploitation, l'équilibre est frôlé (−67 €/mois à M24) ; il est atteint au **mois 9** si l'infra tombe à 0,04 €/utilisateur, au **mois 8** avec 9 % de conversion. Besoin de cash : **≈ 150 €** (démarrage) en trésorerie, ≈ 1 500 € en vision « exploitation » (script de la skill).

### Récapitulatif

| | pessimiste | base | optimiste |
| --- | ---: | ---: | ---: |
| Utilisateurs actifs M12 / M24 | 645 / 1 059 | 2 349 / 5 591 | 4 376 / 13 103 |
| Abonnés payants M12 / M24 | 17 / 30 | 119 / 290 | 318 / 974 |
| MRR net M12 / M24 | 36 € / 60 € | 226 € / 535 € | 555 € / 1 654 € |
| Coûts totaux M24 | 272 €/mois | 925 €/mois | 2 121 €/mois |
| Mois d'équilibre (exploitation) | jamais | > 24 (M12 avec leviers 1+2) | > 24 de peu (M9 avec levier 1) |
| Besoin de cash max (24 mois) | ≈ 4 200 € | ≈ 2 400 € | ≈ 150 € (≈ 1 500 € en exploitation) |

---

## 7. Test d'acquisition payante (à faire, mais petit)

Modélisé sur le scénario base : **200 €/mois pendant 3 mois (600 €)**, Apple Search Ads ou Meta ciblé « jeunes parents FR ».

| CPI (coût par installation) | installations | payants (4 %) | CAC par payant | LTV / CAC | effet trésorerie à M24 |
| ---: | ---: | ---: | ---: | ---: | ---: |
| 1,50 € | 400 | 16 | 38 € | 0,7 | −692 € |
| 2,50 € | 240 | 10 | 62 € | 0,45 | −655 € |
| 4,00 € | 150 | 6 | 100 € | 0,28 | −634 € |

Le plafond rentable est **≈ 0,37 € par installation** : aucun canal payant réaliste ne l'atteint aujourd'hui. **Le test n'a de sens que comme mesure** (vraie conversion J30 par source, vraie rétention J7) **et seulement une fois le paywall en production**. Règle d'arrêt : stop si CAC par payant > 3 × la LTV mesurée après 300 installations, ou si la conversion J30 de la cohorte payante < 3 %. Le canal à prioriser reste gratuit : invitations de partage (boucle virale native), ASO, maternités/PMI/sages-femmes (flyers ≈ 100 € d'impression).

---

## 8. Les métriques à suivre chaque semaine

1. **Nouveaux inscrits** par source (store organique, invitation de partage, site, test payant).
2. **Activation** : % d'inscrits avec ≥ 3 événements saisis entre J1 et J7 ; rétention J7 et J30.
3. **Entonnoir paywall** : vues du paywall par déclencheur → débuts d'essai → conversion essai → payant (objectif > 50 %).
4. **Conversion cohorte J30** : % des inscrits de la semaine qui paient à J30 (cible ≥ 6 %).
5. **Part d'actifs payants** (payants actifs ÷ utilisateurs actifs 30 j) : **la métrique reine, cible ≥ 7 %**.
6. **MRR net** (après TVA et commission, RevenueCat) et mix mensuel / annuel / à vie.
7. **Churn** : résiliations des mensuels, % d'annuels ayant coupé le renouvellement automatique, remboursements.
8. **Coût vocal par abonné** (commandes/jour moyennes et % d'abonnés > 30 commandes/j).
9. **Coût infra par utilisateur actif** (facture GCP/Firebase ÷ actifs 30 j) : **cible ≤ 0,04 €**.
10. **Trésorerie** : solde et mois de réserve restants.

---

## 9. Principaux risques financiers

1. **Conversion faible à cause d'un gratuit trop généreux** (partage, stats, courbes OMS, enfants illimités : payants chez la concurrence). Chaque point de conversion vaut ≈ 75 abonnés à M24 en base. Mitigation : paywall contextuel autour du rapport pédiatre ; ne pas hésiter à resserrer le gratuit (2ᵉ export, historique long) si la conversion J30 reste < 3 % à M3.
2. **Les gratuits coûtent plus qu'ils ne rapportent** tant que la part de payants est < 7 % : la croissance aggrave la perte. Mesurer le vrai coût par actif dès le lancement et optimiser avant de pousser l'acquisition.
3. **Coût vocal en cas d'usage intensif** : au plafond de 50/j, la contribution d'un annuel tombe à 0,27 €/mois ; besoin de cash base ×2,3 (5 400 €). Envisager un plafond plus bas (30/j) ou un suivi des « gros utilisateurs ».
4. **Cycle de vie court de la catégorie** : le bébé grandit, l'annuel se renouvelle peu (35 % supposés). Le « à vie » à 79,99 € (≈ 2,5 ans d'annuel net, et 25 % de commission sur Google) cannibalise peu ici, mais le retirer ne fait pas gagner : sans lui, besoin de cash base 3 700 € au lieu de 2 400 €. À garder, idéalement en offre de lancement.
5. **Retard de mise en vente** : paiements pas encore configurés (accord Apple, compte marchand Google, RevenueCat, 12 testeurs × 14 j, médiateur obligatoire). Chaque mois de retard = 130-240 € de fixes sans revenu.
6. **Acquisition payante non rentable** (CAC par payant 38-100 € pour une LTV de 21-34 €). Ne pas y mettre plus que le test de 600 €.
7. **Dépendance aux stores** (commission, rejet de review, changement de règles comme les 25 % de Google) et **coûts en dollars** (AssemblyAI, Anthropic, Apple Developer) : risque de change.
8. **Frais fixes de la SASU** (110 €/mois) qui pèsent 45-65 % des coûts : ils existent même sans app ; à négocier (banque en ligne, comptable forfait micro-activité).
9. **Temps du fondateur** non rémunéré : à 2 ans, même l'optimiste ne paie pas un salaire. Fixer un point de décision à M6 (part de payants, conversion J30) et à M12.

---

## 10. Annexe : sorties du script `unit_economics.py` (année 1, unité = abonné-mois)

Méthode : `price` = revenu HT moyen pondéré par le mix (à vie amorti sur 24 mois) ; variables = commission store + vocal ; fixes = moyenne de l'année 1 (infra incluse, qui grandit avec les gratuits) ; `days_per_month` = 1 et `ramp_per_day` = abonnés payants actifs de chaque mois (sortis du modèle 24 mois). Le script tient les fixes constants : il est un peu plus optimiste que le modèle 24 mois en fin d'année (d'où un passage au positif au mois 9 en optimiste, que le modèle à fixes croissants ne montre pas). Les montants sont en euros même si le script affiche « $ ».


### Scénario pessimiste

#### Unit economics: SuiviBaby Premium - scenario pessimiste (annee 1)

Every number below comes from the input file. Nothing is looked up or guessed.

##### One abonne-mois

| line | per abonne-mois |
| --- | ---: |
| Price | $2.80 |
| Commission store (15 % abo, 20 % lifetime moy.) | -$0.43 |
| Cout vocal (AssemblyAI + Haiku, ~15 cmd/j) | -$0.50 |
| **Contribution** (what each abonne-mois leaves to pay the fixed costs) | **$1.87** (67%) |

##### The margin that matters

Fixed costs: $169 a month (Infra Firebase/Cloud (moy. annee 1, gratuits inclus) $51, Compta + banque SASU $110, Apple Developer (99 EUR/an) $8).

- **Break-even: 91 abonne-moiss a day.** Below that you lose money every month.
- **Profit margin at your plan** (17 a day): **-282%** of every sale, after every cost.

##### Year 1, month by month

| month | abonne-moiss a day | revenue | profit | cumulative (after $150 startup) |
| ---: | ---: | ---: | ---: | ---: |
| 1 | 2 | $4 | -$166 | -$316 |
| 2 | 3 | $9 | -$163 | -$479 |
| 3 | 5 | $13 | -$160 | -$639 |
| 4 | 6 | $17 | -$158 | -$797 |
| 5 | 8 | $21 | -$155 | -$952 |
| 6 | 9 | $25 | -$152 | -$1,104 |
| 7 | 10 | $29 | -$150 | -$1,254 |
| 8 | 12 | $33 | -$147 | -$1,401 |
| 9 | 13 | $37 | -$144 | -$1,545 |
| 10 | 14 | $41 | -$142 | -$1,687 |
| 11 | 16 | $45 | -$139 | -$1,826 |
| 12 | 17 | $48 | -$137 | -$1,962 |

- **Year 1 operating profit: -$1,812** on $321 of revenue.
- After the $150 startup spend: -$1,962.
- Startup money earned back: not within year 1.
- Cash you need before it pays for itself: **$1,962**.

##### What if

| scenario | margin at plan | break-even a day | year 1 profit |
| --- | ---: | ---: | ---: |
| Base plan | -282% | 91 | -$1,812 |
| Price -10% | -324% | 107 | -$1,845 |
| Volume -20% | -369% | 91 | -$1,855 |
| Unit costs +15% | -287% | 98 | -$1,828 |

##### Red flags

- Year 1 loses money on operations (-$1,812).
- The startup spend is not earned back within year 1.

### Scénario base

#### Unit economics: SuiviBaby Premium - scenario base (annee 1)

Every number below comes from the input file. Nothing is looked up or guessed.

##### One abonne-mois

| line | per abonne-mois |
| --- | ---: |
| Price | $2.65 |
| Commission store (15 % abo, 20 % lifetime moy.) | -$0.41 |
| Cout vocal (AssemblyAI + Haiku, ~15 cmd/j) | -$0.50 |
| **Contribution** (what each abonne-mois leaves to pay the fixed costs) | **$1.74** (66%) |

##### The margin that matters

Fixed costs: $245 a month (Infra Firebase/Cloud (moy. annee 1, gratuits inclus) $127, Compta + banque SASU $110, Apple Developer (99 EUR/an) $8).

- **Break-even: 142 abonne-moiss a day.** Below that you lose money every month.
- **Profit margin at your plan** (119 a day): **-13%** of every sale, after every cost.

##### Year 1, month by month

| month | abonne-moiss a day | revenue | profit | cumulative (after $150 startup) |
| ---: | ---: | ---: | ---: | ---: |
| 1 | 8 | $21 | -$232 | -$382 |
| 2 | 16 | $43 | -$217 | -$599 |
| 3 | 25 | $65 | -$202 | -$801 |
| 4 | 34 | $89 | -$187 | -$988 |
| 5 | 43 | $113 | -$171 | -$1,160 |
| 6 | 52 | $138 | -$155 | -$1,315 |
| 7 | 62 | $164 | -$138 | -$1,453 |
| 8 | 72 | $191 | -$120 | -$1,573 |
| 9 | 83 | $220 | -$101 | -$1,674 |
| 10 | 94 | $250 | -$82 | -$1,755 |
| 11 | 106 | $281 | -$61 | -$1,816 |
| 12 | 119 | $314 | -$39 | -$1,856 |

- **Year 1 operating profit: -$1,706** on $1,889 of revenue.
- After the $150 startup spend: -$1,856.
- Startup money earned back: not within year 1.
- Cash you need before it pays for itself: **$1,856**.

##### What if

| scenario | margin at plan | break-even a day | year 1 profit |
| --- | ---: | ---: | ---: |
| Base plan | -13% | 142 | -$1,706 |
| Price -10% | -25% | 167 | -$1,895 |
| Volume -20% | -32% | 142 | -$1,953 |
| Unit costs +15% | -18% | 154 | -$1,803 |

##### Red flags

- Year 1 loses money on operations (-$1,706).
- The startup spend is not earned back within year 1.

### Scénario optimiste

#### Unit economics: SuiviBaby Premium - scenario optimiste (annee 1)

Every number below comes from the input file. Nothing is looked up or guessed.

##### One abonne-mois

| line | per abonne-mois |
| --- | ---: |
| Price | $2.56 |
| Commission store (15 % abo, 20 % lifetime moy.) | -$0.40 |
| Cout vocal (AssemblyAI + Haiku, ~15 cmd/j) | -$0.50 |
| **Contribution** (what each abonne-mois leaves to pay the fixed costs) | **$1.65** (65%) |

##### The margin that matters

Fixed costs: $327 a month (Infra Firebase/Cloud (moy. annee 1, gratuits inclus) $209, Compta + banque SASU $110, Apple Developer (99 EUR/an) $8).

- **Break-even: 198 abonne-moiss a day.** Below that you lose money every month.
- **Profit margin at your plan** (318 a day): **24%** of every sale, after every cost.

##### Year 1, month by month

| month | abonne-moiss a day | revenue | profit | cumulative (after $150 startup) |
| ---: | ---: | ---: | ---: | ---: |
| 1 | 18 | $46 | -$298 | -$448 |
| 2 | 37 | $95 | -$266 | -$713 |
| 3 | 58 | $147 | -$232 | -$946 |
| 4 | 79 | $202 | -$196 | -$1,142 |
| 5 | 102 | $262 | -$158 | -$1,300 |
| 6 | 127 | $325 | -$117 | -$1,417 |
| 7 | 154 | $393 | -$73 | -$1,490 |
| 8 | 182 | $466 | -$26 | -$1,517 |
| 9 | 212 | $543 | $24 | -$1,493 |
| 10 | 245 | $627 | $78 | -$1,415 |
| 11 | 280 | $717 | $136 | -$1,278 |
| 12 | 318 | $814 | $199 | -$1,080 |

- **Year 1 operating profit: -$930** on $4,637 of revenue.
- After the $150 startup spend: -$1,080.
- Startup money earned back: not within year 1.
- Cash you need before it pays for itself: **$1,517**.

##### What if

| scenario | margin at plan | break-even a day | year 1 profit |
| --- | ---: | ---: | ---: |
| Base plan | 24% | 198 | -$930 |
| Price -10% | 16% | 234 | -$1,393 |
| Volume -20% | 14% | 198 | -$1,529 |
| Unit costs +15% | 19% | 216 | -$1,175 |

##### Red flags

- Year 1 loses money on operations (-$930).
- The startup spend is not earned back within year 1.
