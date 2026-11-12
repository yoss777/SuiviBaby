# SuiviBaby — Offre et prix (méthode founder-offer + founder-pricing)

> Rédigé le 11 novembre 2026. Base : `CONTEXT.md` (offre décidée le 11/11), `docs/PREMIUM_OFFRE_CIBLE.md`.
> Aucune donnée d'enquête réelle n'existe encore. Tout chiffre « acheteur » ci-dessous est soit une **hypothèse à tester**, soit une **illustration explicitement marquée HYPOTHÉTIQUE**. Ce n'est pas un avis juridique.

Décisions respectées (non remises en cause) : enfants illimités, partage illimité en gratuit, plafond vocal honnête de 50 commandes/jour en Premium.

---

## 0. Le diagnostic en une phrase

Le gratuit de SuiviBaby est plus généreux que celui de presque tous les concurrents (partage, stats, courbes OMS, enfants illimités). Le risque n'est donc pas l'acquisition mais **la conversion** : aujourd'hui Premium = « plus de voix + plus de PDF ». Il faut que Premium se lise comme un **résultat** (« je note sans réfléchir à 3 h du matin, et j'arrive chez le pédiatre avec tout »), pas comme deux quotas relevés. Le prix compte moins que ça.

Test du marché (lentille Offres) :
| Critère | Note | Commentaire |
|---|---|---|
| Douleur massive | 4/5 | Fatigue, oublis (« il a mangé quand ? »), coordination à deux, questions du pédiatre. Réelle mais pas vitale. |
| Pouvoir d'achat | 3/5 | Les parents dépensent beaucoup pour bébé, mais l'app est perçue comme « devrait être gratuite ». |
| Facile à atteindre | 3/5 | ~660 000 naissances/an, communautés parents très actives, mais pas de budget marketing. |
| Marché en croissance | 2/5 | Natalité française en baisse ; marché des apps stable. |

Conclusion : marché correct, pas exceptionnel. L'offre doit gagner sur la **probabilité perçue** (preuve, confiance, données en Europe) et sur l'**effort** (voix), pas sur le prix.

---

## 1. Liste des problèmes (dans les mots du parent)

Sources : décisions produit, avis concurrents connus (Huckleberry, Baby Daybook, Nara, Glow), contraintes du contexte. Pas encore de verbatims de panel : à compléter avec l'enquête (§7).

**Avant d'acheter**
1. « Il y a déjà plein d'apps gratuites, pourquoi payer ? »
2. « Le gratuit me suffit, je ne vois pas ce que Premium m'apporte. »
3. « Je ne veux pas donner ma carte pour un essai, j'ai peur d'oublier de résilier. »
4. « Encore un abonnement… »
5. « Mes données de bébé, elles vont où ? Elles sont revendues ? »
6. « La reconnaissance vocale, ça ne marche jamais, surtout quand je chuchote. »
7. « C'est une petite boîte, l'app sera peut-être abandonnée dans un an. »
8. « J'utilise déjà une autre app, je ne veux pas tout ressaisir. »

**Pendant l'usage**
9. « À 3 h du matin, un bébé dans les bras, je ne peux pas taper. »
10. « J'oublie de noter, puis je ne sais plus à quelle heure il a bu. »
11. « Mon conjoint / la nounou ne note pas pareil, ou pas du tout. »
12. « Le pédiatre me demande combien il boit, combien de couches, depuis quand la fièvre… je ne sais plus. »
13. « Je ne sais pas quand est le prochain examen obligatoire. »
14. « Trop de boutons, trop d'écrans, je n'ai pas le temps d'apprendre. »
15. « 3 commandes vocales par jour, c'est frustrant quand on a pris l'habitude. »
16. « Pas de réseau à la maternité / chez les grands-parents. »
17. « L'app me fait culpabiliser avec des chiffres. »

**Après l'achat**
18. « Si j'arrête de payer, est-ce que je perds mes données ? »
19. « Mon bébé grandit, dans 18 mois je n'en aurai plus besoin : l'annuel ou le à vie ne valent pas le coup. »
20. « Et pour le deuxième enfant, je repaie ? »
21. « Si je veux un remboursement, c'est l'enfer. »
22. « Le prix va augmenter dès que je serai accroché. »
23. « Si j'ai un problème, personne ne répond. »

---

## 2. Solutions, notées et triées

Valeur pour le parent (1-5) et coût de livraison (1-5, 5 = cher), avec les chiffres du CFO (voix ≈ 0,1 cent/commande ; usage réel ≈ 15/jour ≈ 0,50 €/mois).

| # | Problème(s) | Solution | Valeur | Coût | Garder ? |
|---|---|---|---|---|---|
| A | 9, 10, 15 | **Voix jusqu'à 50/jour** (déjà décidé) | 5 | 1 | Oui — cœur |
| B | 12 | **Rapport pédiatre PDF** (période, OMS, repas/sommeil/couches, santé, vaccins, notes) — à construire avant lancement (3-5 j) | 5 | 2 | Oui — cœur |
| C | 12, 13 | **Kit rendez-vous pédiatre** : rappel des examens obligatoires (calendrier indicatif du carnet de santé) + bouton « préparer la visite » qui génère le rapport de la période depuis le dernier examen + zone « questions à poser » | 4 | 2 | Oui — bonus 1 |
| D | 2, 9, 15 | **Semaine découverte vocale** : chaque nouveau compte a 50 commandes/jour pendant 7 jours, sans carte, puis retour à 3/jour | 5 | 1 (≈ 0,10 € par nouvel utilisateur actif, ≈ 25-50 € pour 500 comptes) | Oui — mécanique de conversion |
| E | 3, 21 | **Rappel avant la fin de l'essai** (notification J-2 + e-mail) + lien direct « gérer mon abonnement » | 4 | 1 | Oui — garantie |
| F | 18 | **Pas de prise d'otage** : si Premium s'arrête, tous les enfants, l'historique et le partage restent accessibles gratuitement | 5 | 0 (déjà le cas) | Oui — garantie. Conséquence : **abandonner la limite d'historique 90 jours** prévue dans `PREMIUM_OFFRE_CIBLE.md` §1 |
| G | 22, 7 | **Tarif fondateur garanti** : le prix payé ne bouge pas tant que l'abonnement reste actif | 4 | 1 (manque à gagner futur seulement) | Oui — urgence honnête |
| H | 23, 7 | **Support par le fondateur** : réponse humaine sous 48 h ouvrées, par e-mail | 4 | 2 (temps de Yoss) | Oui — bonus 2, réservé à la période fondateurs |
| I | 6 | **Guide « 30 phrases qui marchent »** (exemples vocaux, chuchotement, heures, quantités) dans l'app | 3 | 1 | Oui — dans l'onboarding (pas un bonus, du service) |
| J | 5 | **Message données** : hébergement UE, pas de pub, pas de revente, pas de traqueur | 4 | 0 | Oui — dans le paywall, pas un bonus |
| K | 20 | Enfants illimités sur le même abonnement | 4 | 0 | Oui (déjà décidé) — à dire explicitement |
| L | 11 | Partage illimité avec rôles | 5 | 0 | Gratuit (décidé) — argument d'acquisition |
| M | 8 | Import depuis d'autres apps | 3 | 5 (formats propriétaires) | Non |
| N | 14 | Widget ajout rapide | 4 | 4 | Plus tard (déclencheur de la hausse de prix, §6) |
| O | 17 | Pas de « score » ni de jugement, ton neutre | 3 | 0 | Oui — principe de rédaction |
| P | 21 | Remboursement « satisfait ou remboursé » garanti | 3 | — | **Non promettable sur iOS** (seul Apple décide). Voir §3.3 |

---

## 3. L'offre empilée (« Grand Slam », version honnête)

### 3.1 Le cœur, décrit par le résultat

**SuiviBaby Premium — « Les mains libres, la tête tranquille »**

> Notez tout à la voix, même à 3 h du matin, et arrivez chez le pédiatre avec un rapport clair.

- Jusqu'à **50 commandes vocales par jour** (« biberon de 150 ml à 14 h 30 ») — plafond affiché tel quel, sans « illimité ».
- **Rapport pédiatre PDF** : courbes OMS, repas, sommeil, couches, épisodes de santé, vaccins, vos notes. Factuel, sans interprétation médicale.
- **Exports PDF illimités.**
- Pour **tous vos enfants**, sur le même abonnement.

Ce qui reste gratuit, et qu'on dit fièrement : enfants et partage illimités, 18 types d'événements, stats et courbes OMS, rappels, mode nuit, 3 commandes vocales/jour, 1 export PDF.

### 3.2 Bonus (chacun tue une objection précise)

| Bonus | Objection tuée | Coût |
|---|---|---|
| **1. Kit rendez-vous pédiatre** : rappel des examens obligatoires + « préparer la visite » (rapport depuis le dernier examen + questions notées) | « À quoi ça me sert de payer ? » (#2, #12, #13) | 1-2 jours de dev en plus du rapport ; contenu statique |
| **2. Ligne directe avec le fondateur** (période fondateurs) : réponse sous 48 h ouvrées, vos idées lues et votées | « Petite boîte, personne ne répond » (#7, #23) | Temps de Yoss ; soutenable jusqu'à quelques centaines d'abonnés |
| **3. Tarif fondateur garanti** : votre prix ne bouge pas tant que vous restez abonné | « Le prix va monter » (#22) | Manque à gagner futur seulement |

Plus, pour tout nouveau compte (pas un bonus payant, une mécanique) : **Semaine découverte vocale** — 7 jours à 50 commandes/jour, sans carte bancaire. C'est la meilleure preuve possible que la voix marche (#6), au moment où le besoin est le plus fort.

**Ne pas afficher de « valeur » fictive en euros** à côté de chaque bonus (« valeur 49 € ») : il n'y a pas de prix de référence réel, ce serait un ancrage trompeur (art. L121-2 C. conso) et contraire à la règle « pas de faux ancrage ».

### 3.3 La garantie : « Zéro piège »

Ce que SuiviBaby contrôle réellement, et peut donc promettre :

1. **Essai gratuit 7 jours** sur l'annuel, avec **rappel 2 jours avant la fin** (notification + e-mail).
2. **Résiliation en deux touches** depuis l'app (lien direct vers la gestion d'abonnement du store).
3. **Vos données ne sont jamais prises en otage** : si vous arrêtez Premium, tout reste consultable et partagé gratuitement, pour tous vos enfants.
4. **Une question, un souci ? Écrivez-nous** : réponse humaine sous 48 h ouvrées.

Pourquoi pas « satisfait ou remboursé 30 jours » : sur iOS, le remboursement relève d'Apple seul (reportaproblem.apple.com), le développeur ne peut pas le garantir. Sur Google Play, le développeur peut rembourser depuis la Console. Une promesse inégale ou non tenable serait trompeuse. Formulation possible, si Yoss la veut, et seulement celle-ci :
> « Pas convaincu après un prélèvement ? Écrivez-nous dans les 14 jours : sur Android, nous vous remboursons ; sur iPhone, nous vous guidons pour la demande auprès d'Apple. »
Coût modélisé (Android seulement) : à 5 % de demandes sur un annuel à 21,24 € net, ≈ 1,06 € par abonné Android recruté ; à 500 utilisateurs et ~5 % de conversion (≈ 25 abonnés, dont ~60 % Android), ≈ 16 €/an. Négligeable. Recommandation : commencer par « Zéro piège » (points 1-4), ajouter cette phrase si l'enquête montre que la peur de payer pour rien est l'objection n° 1.

Coût de la garantie « Zéro piège » : ≈ 0,5 jour de dev (rappel J-2, lien de gestion), 0 € récurrent.

### 3.4 Urgence et rareté — vraies, datées, légales en France

**« Offre Fondateurs » — ouverte du lancement public jusqu'au 31 janvier 2027 inclus** (ou lancement + 60 jours ; la date doit être fixée et affichée, puis respectée).

Ce qu'elle contient, uniquement des choses vraies :
- **Prix bloqué** tant que l'abonnement reste actif (les deux stores permettent de garder les abonnés existants à l'ancien prix lors d'une hausse).
- **Achat à vie (79,99 €) proposé seulement pendant la période fondateurs**, puis retiré. C'est une vraie rareté temporelle, à condition de le retirer réellement à la date dite.
- **Ligne directe avec le fondateur**.

Pourquoi c'est honnête : il est prévu d'augmenter le prix public quand le widget et le kit pédiatre seront livrés (§6). Le tarif fondateur protège donc d'une hausse réelle. Si Yoss ne compte pas augmenter, il ne faut pas utiliser cet argument.

À ne pas faire (droit français) :
- Pas de prix barré « 39,99 € → 29,99 € » : une annonce de réduction doit se référer au prix le plus bas pratiqué dans les 30 jours précédents (art. L112-1-1 C. conso) ; un prix jamais pratiqué est un faux ancrage.
- Pas de compte à rebours qui se réinitialise, pas de « plus que 3 places » : déclarer faussement qu'une offre n'est disponible que très peu de temps est une pratique commerciale trompeuse en toutes circonstances (art. L121-4, 7°).
- Pas d'allégation de santé (« améliore le sommeil de bébé », « détecte… ») : rester sur l'organisation et la mémoire.
- Avant de vendre : médiateur de la consommation désigné et affiché (art. L612-1 ; CM2C recommandé), informations d'abonnement claires (prix, durée, renouvellement automatique, essai) conformes à la guideline App Store 3.1.2, mise à jour des CGU §9 si l'à vie devient limité dans le temps.

### 3.5 Le nom

- **Plan** : garder **« Premium »** dans les stores et le paywall. Clair, attendu, déjà dans le code et les CGU ; un nom « créatif » coûte de la compréhension pour rien.
- **Promesse affichée** : « Premium — les mains libres, la tête tranquille » (ou une des accroches proposées : « À 3 h du matin, dites-le. SuiviBaby note. »).
- **Offre de lancement** : « Offre Fondateurs ».
- Écarter « Plus », « Pro », « Famille » (Famille a déjà été abandonnée et créerait la confusion avec le partage gratuit).

### 3.6 Paywall type (texte proposé)

> **À 3 h du matin, dites-le. SuiviBaby note.**
> Premium, c'est jusqu'à 50 notes vocales par jour, le rapport pédiatre en PDF et le kit rendez-vous, pour tous vos enfants.
>
> **Offre Fondateurs jusqu'au 31 janvier 2027** : votre prix ne bougera pas tant que vous restez abonné.
>
> ○ Annuel — 29,99 €/an, soit 2,50 €/mois · 7 jours gratuits
> ○ Mensuel — 4,99 €/mois (voir §6)
> ○ À vie — 79,99 € une fois · disponible jusqu'au 31 janvier 2027
>
> Zéro piège : rappel 2 jours avant la fin de l'essai · résiliation en deux touches · vos données restent à vous, même sans Premium.
> Hébergé en Europe. Sans pub. Jamais revendu.

---

## 4. Équation de valeur : avant / après

Notes de 1 à 10 (pour délai et effort : 10 = très rapide / très peu d'effort).

| Levier | Avant (offre du 11/11) | Après | Ce qui fait bouger |
|---|---|---|---|
| Résultat rêvé | 5 — « plus de voix, plus de PDF » | 7 — « mains libres la nuit + pédiatre préparé » | Rédaction par le résultat, rapport pédiatre, kit rendez-vous |
| Probabilité perçue | 4 — petite app inconnue, voix « ça ne marche jamais » | 7 | Semaine découverte vocale (preuve par l'usage), données UE, ligne directe fondateur, « Zéro piège » |
| Délai avant résultat | 6 | 8 | La voix sert dès la première nuit ; le kit sert au prochain examen (au plus quelques semaines au début) |
| Effort et sacrifice | 5 — carte pour l'essai, peur d'oublier, peur de perdre ses données | 8 | Rappel J-2, résiliation 2 touches, pas de prise d'otage, enfants illimités sur un seul abonnement |

### Re-test

L'étape « re-tester sur un panel d'acheteurs simulés » n'a pas été lancée ici (pas de panel `founder/` existant, et la consigne est de ne rien inventer comme si c'était réel). Le re-test se fera avec de vrais parents, via l'enquête du §7 (questions 12-14 : intention d'achat avant / après présentation des bonus et de la garantie). Si l'intention ne bouge pas, le problème est le marché ou la valeur du cœur, pas l'emballage.

---

## 5. Prix — ce qu'on sait déjà

### 5.1 Ce que disent les acheteurs

**Rien encore.** Pas d'enquête, pas de panel. Pas de fourchette inventée : voir le plan d'enquête (§7). Une illustration de la méthode, **sur données fictives**, est donnée en annexe A.

### 5.2 Concurrents (App Store FR, relevé du 11/11)

| App | Prix | Ce que le prix inclut |
|---|---|---|
| Huckleberry | Plus 69,99 €/an ; Premium 118-130 €/an ; essai 14 j | Prédictions de sommeil (SweetSpot), IA, widgets, Apple Watch |
| May (FR) | 59,99-119,99 €/an ; essai 15 j | Contenus parentalité, experts |
| Baby Connect | 59,99 €/an | Suivi complet, partage |
| Glow Baby | 32,99-58,99 €/an ; à vie 69,99 | Suivi, partage payant |
| Sprout | 33-70 €/an | Suivi, croissance |
| Baby Daybook | 26,99-43,99 €/an ; à vie 43,99 | Suivi, sync famille |
| Nara | 7,99-9,99 €/mois ; à vie 59,99-99,99 | Suivi, partage |
| BabyTime | quasi gratuit (aidants 1,99, sans pub 3,99) | Suivi |
| **SuiviBaby** | **29,99 €/an ; 3,99 €/mois ; à vie 79,99** | Voix 50/j, PDF illimités, rapport pédiatre ; **partage, stats et OMS gratuits** |

Lecture : à 29,99 €/an SuiviBaby est dans le bas-milieu. Les apps à 60-130 €/an vendent de la **prédiction** (sommeil, IA) ou du **contenu expert**, que SuiviBaby n'a pas. Monter aujourd'hui ne serait pas crédible ; descendre ne servirait à rien (le concurrent « gratuit » existe déjà, et le gratuit de SuiviBaby fait déjà le travail d'acquisition).

### 5.3 Ce dont l'entreprise a besoin (chiffres CFO du 11/11)

| Formule | Prix TTC | Net après TVA 20 % et store 15 % | Net / mois | Coût voix gros utilisateur | Marge / mois |
|---|---|---|---|---|---|
| Mensuel 3,99 € (actuel) | 3,99 | 2,83 €/mois | 2,83 | ≈ 0,50 | ≈ 2,33 |
| Mensuel 4,99 € (proposé) | 4,99 | 3,53 €/mois | 3,53 | ≈ 0,50 | ≈ 3,03 |
| Annuel 29,99 € | 29,99 | 21,24 €/an | 1,77 | ≈ 0,50 | ≈ 1,27 |
| Annuel 34,99 € (après widget) | 34,99 | 24,78 €/an | 2,07 | ≈ 0,50 | ≈ 1,57 |
| À vie 79,99 € | 79,99 | ≈ 56,66 € Apple / ≈ 50,00 € Google | — | ≈ 6 €/an | Équivaut à ~2,4-2,7 ans d'annuel |

(Net = prix / 1,2 × 0,85 ; Google à vie × 0,75.) Point mort ≈ 75 abonnés en incluant les frais SASU (calcul CFO). Le gros utilisateur vocal reste rentable sur toutes les formules.

---

## 6. Recommandation de prix

### 6.1 Le prix

| Formule | Décidé le 11/11 | Recommandé au lancement | Pourquoi |
|---|---|---|---|
| **Annuel** | 29,99 € + essai 7 j | **29,99 € + essai 7 j — garder** | Bas-milieu du marché, cohérent avec un Premium encore « fin ». C'est la formule à pousser (meilleure rétention, cash d'avance). |
| **Mensuel** | 3,99 € | **4,99 € — à valider par l'enquête** | À 3,99 €, l'annuel ne vaut que 7,5 mois : un parent qui paie 3 mois pendant la phase nouveau-né rapporte 8,50 € net. À 4,99 €, l'annuel = 6 mois (« la moitié du prix »), ce qui fait basculer vers l'annuel, et le mensuel rapporte +25 % net. 4,99 € reste sous Nara (7,99 €). Si l'enquête place 4,99 € au-dessus du PME, rester à 3,99 €. |
| **À vie** | 79,99 € permanent | **79,99 €, mais uniquement pendant l'Offre Fondateurs** | Trésorerie utile pour un fondateur seul au démarrage ; vraie rareté datée ; limite le passif long terme (coût vocal sans revenu récurrent). Rationnellement, l'à vie ne vaut le coup qu'avec un 2ᵉ enfant prévu : c'est un public réel mais petit. Ne pas baisser à 69,99 € (cannibaliserait l'annuel à ~2 ans). |
| **Essai** | 7 j sur l'annuel | **Garder 7 j** + Semaine découverte vocale sans carte pour tous | 7 jours = ~7 nuits, assez pour vivre la valeur vocale. 14 jours (Huckleberry) se justifient quand l'app vend des prédictions qui mettent du temps à apprendre ; pas ici. La semaine découverte sans carte fait le travail de preuve sans la peur de la carte bancaire. Tester 14 j plus tard si la conversion essai → payant est bonne mais le démarrage d'essai faible. |

### 6.2 L'échelle (bon / mieux / meilleur)

- **Gratuit** (bon) : tout le suivi, à plusieurs, sans limite d'enfants. Raison de monter : la voix bute à 3/jour, et le premier rendez-vous pédiatre.
- **Premium annuel** (mieux, mis en avant) : mains libres + rapport et kit pédiatre. Raison de choisir l'annuel plutôt que le mensuel : moitié prix, prix fondateur bloqué.
- **À vie, fondateurs** (meilleur) : pour les familles qui prévoient un autre enfant. Raison : un seul paiement pour tous les enfants à venir, offre qui ferme le 31/01/2027.

Pas de 2ᵉ niveau payant : avec 500 utilisateurs visés, un seul Premium est plus lisible (et Famille a déjà échoué à se différencier).

### 6.3 L'offre d'ouverture

L'Offre Fondateurs (§3.4) **sans remise** : pas de « -40 % », donc pas d'habitude d'attendre les soldes et pas de problème de prix de référence. Elle protège d'une hausse future réelle et ferme à une date affichée.

### 6.4 La hausse prévue (conditionnelle)

Quand **widget ajout rapide + kit pédiatre** sont en production et que la conversion est mesurée (≥ 3 mois de données) : annuel nouveaux abonnés **34,99 €**, mensuel inchangé ; fondateurs gardent leur prix. Ne monter que si l'enquête (Gabor-Granger, Q10) montre que ≥ 40 % des intéressés restent « probablement / certainement » acheteurs à 34,99 €.

### 6.5 Ce qu'il faut tester avec de vrais acheteurs

1. **Mensuel 3,99 € vs 4,99 €** : d'abord par l'enquête (§7). Ensuite en réel : RevenueCat Experiments (offre payante de RevenueCat, à vérifier) ou test séquentiel (4 semaines à 4,99 €, comparer part annuel/mensuel et conversion — biais de période à garder en tête).
2. **Annuel 29,99 € vs 34,99 €** : enquête seulement avant la hausse ; ne pas faire de vrai A/B de prix différents pour la même offre au même moment sans y avoir réfléchi (perception d'injustice entre parents qui se parlent).
3. **Effet des bonus et de la garantie** sur l'intention d'achat (Q12-14).

### 6.6 Objections de prix à préparer (hypothèses, à remplacer par les verbatims de l'enquête)

1. « Les autres apps sont gratuites. » → Réponse : le gratuit SuiviBaby est complet ; Premium ne vend que les mains libres et le pédiatre.
2. « Je n'en aurai plus besoin dans un an. » → L'annuel = 2,50 €/mois, résiliable en deux touches ; données gardées.
3. « Un abonnement de plus… » → Pour tous vos enfants, sans pub, sans revente de données.

---

## 7. Plan d'enquête prix (à lancer dès maintenant)

### 7.1 Objectif

Obtenir une fourchette de prix réelle (Van Westendorp) pour le **mensuel** de Premium, une courbe d'intention d'achat pour l'**annuel** (Gabor-Granger), l'intérêt pour l'**à vie**, et le classement des éléments de l'offre. Résultats exploitables par `van_westendorp.py`.

### 7.2 Qui interroger

- **Cible** : parents (ou futurs parents à ≥ 6 mois de grossesse) d'un enfant de 0 à 3 ans, vivant en France. Filtre éliminatoire en Q1-Q2.
- **Testeurs de la bêta fermée (6 à 12 personnes)** : trop peu et trop proches de Yoss pour une statistique. On les utilise pour (a) **entretiens de 20 minutes** (pourquoi paieraient-ils, ce qui les ferait payer, réaction au paywall réel), (b) prétest du questionnaire, (c) relais de diffusion (chacun partage à 5-10 parents). Leurs réponses sont **segmentées à part** dans l'analyse.
- **Hors testeurs** : réseaux des testeurs, groupes Facebook de parents (« mamans/papas 2026 », groupes de naissance par mois), groupes WhatsApp de crèches et de cours de préparation, Instagram/LinkedIn de Yoss, forums parents. Le recrutement sert aussi à trouver les **6 testeurs manquants** pour l'accès production Google Play.

### 7.3 Taille d'échantillon

- **Minimum directionnel : 30 réponses complètes** (le script en exige 5, mais en dessous de 30 les courbes sautent).
- **Cible : 100 à 150 réponses complètes**, pour pouvoir séparer au moins deux segments d'environ 50 (ex. déjà payé une app bébé / jamais ; enfant < 6 mois / ≥ 6 mois).
- Durée : 2 semaines de collecte.

### 7.4 Comment le mener

- **Outil** : Tally (société belge, données UE) ou Google Forms ; formulaire **anonyme**, aucune donnée sur l'enfant au-delà d'une tranche d'âge, pas d'e-mail obligatoire (champ facultatif séparé pour être prévenu du lancement / devenir testeur).
- **Mention RGPD** en tête : finalité (étude de prix), anonymat, durée de conservation (6 mois), contact.
- **Ordre crucial** : présenter Premium (texte + capture du paywall **sans les prix**) **avant** les questions de prix, et ne jamais montrer 3,99 / 29,99 avant les questions Van Westendorp (sinon ancrage).
- **Contrôle qualité** : rejeter les réponses incohérentes (le script le fait : trop bon marché ≤ bonne affaire ≤ cher ≤ trop cher).
- **Incitation** : facultative et modeste, par exemple tirage au sort de 10 codes « 3 mois de Premium » (codes d'offre Apple / codes promo Google) une fois les paiements activés. Le dire honnêtement (« quand l'offre sera disponible »).
- **En bêta fermée** : on peut ajouter dans l'app un lien « Donnez votre avis sur le prix (3 min) ». Pas de faux paywall qui ferait croire à un achat ; si on mesure l'intérêt, l'écran doit dire clairement « Premium arrive bientôt — être prévenu ».

### 7.5 Questionnaire (en français)

*Introduction* : « SuiviBaby est une application française pour noter les repas, le sommeil, les couches, la santé et la croissance de votre bébé, à plusieurs. Ce questionnaire anonyme prend 4 minutes et nous aide à fixer un prix juste. »

**Filtre**
1. Avez-vous un enfant de moins de 3 ans, ou en attendez-vous un ? (Oui, enfant 0-6 mois / Oui, 6-12 mois / Oui, 1-3 ans / Enceinte ou futur parent / Non → fin)
2. Vivez-vous en France ? (Oui / Non → fin)

**Contexte**
3. Utilisez-vous (ou avez-vous utilisé) une application pour suivre votre bébé ? (Non / Oui, gratuite / Oui, payante — laquelle ?)
4. Avez-vous déjà payé un abonnement pour une application liée à votre enfant ? (Oui / Non)
5. Qui note les informations sur votre bébé chez vous ? (Moi seul·e / Moi et l'autre parent / Aussi la nounou, la crèche ou la famille)

**Présentation de Premium** (texte du §3.1 + capture sans prix)

6. Sur une échelle de 1 à 5, à quel point ces éléments vous seraient utiles ? (noter la voix à 3 h du matin ; rapport pédiatre PDF ; rappel des examens obligatoires et préparation de la visite ; exports illimités ; données hébergées en Europe sans revente)

**Van Westendorp — prix d'un abonnement MENSUEL à Premium** (réponse libre en euros)
7a. À partir de quel prix par mois trouveriez-vous Premium **si bon marché** que vous douteriez de sa qualité ?
7b. À quel prix par mois trouveriez-vous Premium **avantageux**, une bonne affaire ?
7c. À quel prix par mois Premium commencerait-il à vous sembler **cher**, tout en restant envisageable ?
7d. À quel prix par mois Premium serait-il **trop cher** pour que vous l'achetiez ?

**(Option Newton-Miller-Smith, pour estimer un taux d'achat)**
8a. Au prix que vous avez jugé avantageux (7b), quelle est la probabilité que vous preniez Premium ? (1 Certainement pas … 5 Certainement)
8b. Au prix que vous avez jugé cher (7c), même question.

**Formule préférée**
9. Si vous preniez Premium, quelle formule choisiriez-vous ? (Mensuel / Annuel / Paiement unique à vie / Aucune)

**Gabor-Granger — ANNUEL** (montrer un prix à la fois, ordre décroissant pour limiter l'ancrage à la baisse)
10. « Premium coûte **39,99 € par an** (7 jours d'essai gratuit). Le prendriez-vous ? » (Certainement pas / Probablement pas / Je ne sais pas / Probablement / Certainement) — répéter à **34,99 €**, **29,99 €**, **24,99 €**.

**À vie**
11. Un paiement unique de **79,99 €** pour Premium, pour tous vos enfants, à vie : (Trop cher / Intéressant si j'ai un autre enfant / Intéressant / Je préfère un abonnement)

**Re-test de l'offre**
12. Votre intention de prendre Premium (1-5), avant toute autre information.
13. On ajoute : 7 jours de commandes vocales illimitées sans carte bancaire à l'inscription, un rappel avant la fin de l'essai, la résiliation en deux touches, et vos données conservées gratuitement si vous arrêtez. Votre intention (1-5) ?
14. On ajoute : pour les premiers abonnés, un prix bloqué tant que vous restez abonné et un contact direct avec le fondateur. Votre intention (1-5) ?

**Ouvert**
15. Qu'est-ce qui vous empêcherait de payer pour Premium ? (texte libre — source des verbatims d'objection)
16. (Facultatif) Votre e-mail pour être prévenu du lancement ou devenir testeur.

### 7.6 Analyse et règles de décision

1. Exporter en CSV ; renommer 7a-7d en `too_cheap, cheap, expensive, too_expensive` ; lancer :
   `python3 van_westendorp.py reponses_reelles.csv --price 4.99 --out pricing-curve.md` (le script affiche « $ » : lire « € »).
2. Refaire l'analyse par segment (testeurs / hors testeurs ; déjà payeurs / jamais ; âge de l'enfant).
3. **Mensuel** : si 4,99 € est entre PMC et PME et proche de l'IPP → 4,99 €. Si 4,99 € > PME → rester à 3,99 €.
4. **Annuel** : garder 29,99 € au lancement si ≥ 50 % des intéressés sont « probablement/certainement » à ce prix ; planifier 34,99 € (après widget) si ≥ 40 % le restent à 34,99 €.
5. **À vie** : si < 10 % choisissent « à vie » (Q9) et Q11 majoritairement « trop cher », le retirer purement après la période fondateurs (déjà prévu) ; si fort intérêt, garder 79,99 € sans baisser.
6. **Offre** : comparer Q12 → Q13 → Q14 ; l'élément qui fait le plus monter l'intention passe en tête du paywall.
7. Top 3 des verbatims de Q15 → réponses dans le paywall, la fiche store et la FAQ.

### 7.7 Calendrier

| Semaine | Action |
|---|---|
| S1 (à partir du 16/11) | Prétest avec 3 testeurs, 6 entretiens de 20 min, mise en ligne |
| S1-S2 | Diffusion (testeurs, groupes parents, réseaux) — viser 100+ |
| S3 | Analyse, décision mensuel 3,99/4,99, verbatims |
| Avant soumission stores | Créer les produits RevenueCat/stores aux prix retenus, essai 7 j, rappel J-2, textes du paywall |

---

## 8. Prochaines actions (ordre recommandé)

1. Lancer l'enquête (§7) — elle sert aussi à recruter les 6 testeurs Google Play manquants.
2. Construire le rapport pédiatre + kit rendez-vous (3-5 j + 1-2 j).
3. Semaine découverte vocale (quota serveur 50/jour pendant 7 jours après création du compte) + rappel J-2 + lien de gestion d'abonnement (≈ 1 j).
4. Acter par écrit : pas de limite d'historique en gratuit (cohérence avec « Zéro piège »).
5. Fixer la date de fin de l'Offre Fondateurs ; mettre à jour CGU §9 (à vie limité dans le temps), paywall, site `#tarifs`, fiches stores.
6. Prérequis légaux de vente : médiateur (CM2C), contrats Apple/Google, statut de professionnel DSA.
7. Ensuite : `/founder-cfo` pour recalculer avec 4,99 € et l'à vie limité, puis `/founder-marketing`.

---

## Annexe A — Illustration de la méthode (**DONNÉES HYPOTHÉTIQUES, PAS DES RÉPONSES RÉELLES**)

Pour montrer ce que produira l'outil, 60 réponses **fictives** ont été générées aléatoirement (fichier `HYPOTHETIQUE_vw_mensuel.csv` à côté de ce document) et passées dans `van_westendorp.py --price 3.99`. **Ces chiffres ne disent rien du marché réel et ne doivent pas servir à décider.**

| Point | Prix (fictif) | Sens |
|---|---|---|
| PMC | 1,99 € | En dessous, trop de gens doutent de la qualité |
| OPP | 2,50 € | Autant de « trop bon marché » que de « trop cher » |
| IPP | 3,48 € | Autant de « bonne affaire » que de « cher » |
| PME | 5,49 € | Au-dessus, trop de gens n'achètent pas |

Lecture type : avec de tels résultats, 3,99 € et 4,99 € seraient tous deux dans la fourchette acceptable (1,99-5,49 €), 4,99 € plus près du PME, donc plus risqué. C'est exactement la question que l'enquête réelle doit trancher.
