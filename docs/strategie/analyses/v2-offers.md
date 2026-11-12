# SuiviBaby — Offre v2 : trois architectures Gratuit / Payant (12/11/2026)

> Méthodes suivies : founder-competitors (rafraîchissement ciblé), founder-offer, founder-pricing.
> Base : `CONTEXT.md`, `FEATURE_MAP.md` (commit `eeed711`), et les sorties du premier tour (`board-competitors.md`, `offer-pricing.md`, `cfo.md` + `cfo_work/`, `consumer-brand-marketing.md`, `launch-ops.md`, `plan/summary.md`).
> Fichiers de travail : `docs/strategie/analyses/v2_work/model_v2.py` (modèle par cohorte, sorties recopiées ici).
> Le dépôt n'a pas été modifié.
>
> **À lire avec prudence.** Les prix acheteurs viennent d'un panel **simulé**. Les coûts par fonctionnalité sont des **estimations tirées du code**, car aucune facture détaillée ni télémétrie n'existe. Les taux de conversion sont des hypothèses. Rien de tout cela n'est un avis juridique, fiscal ou financier.

---

## 0. En bref

| | **A — « Prêt pour chaque examen »** | **B — « Pack Bébé » + abonnement Voix** | **C — « Famille »** |
|---|---|---|---|
| Idée | Un Premium par abonnement qui vend un résultat : le pédiatre préparé, et savoir quand viendra la prochaine tétée | Un **achat unique** pour tout ce qui ne nous coûte rien à servir, et un **petit abonnement** pour ce qui coûte chaque mois (voix, photos) | Un abonnement **par famille** : un parent paie, tous les aidants en profitent. Gratuit généreux, avec des limites calées sur nos coûts (voix, photos) |
| Payant | Rapport pédiatre complet, kit des examens, prédictions tétée et sieste, voix 30/jour, PDF illimités ; widget en V2 | Pack : rapport, kit, prédictions, PDF illimités, widget en V2. Voix+ : voix 50/jour et photos au-delà du quota | Tout A, plus : Premium partagé avec tous les aidants, voix 50/jour par Parent, photos illimitées, notifications croisées, récap enrichi |
| Prix TTC | **3,49 €/mois · 24,99 €/an** (essai 14 j) · à vie 49,99 € pendant l'Offre Fondateurs uniquement | **Pack 12,99 €** une fois (puis 14,99 € quand le widget sort) · Voix+ **1,99 €/mois ou 14,99 €/an** | **4,99 €/mois · 39,99 €/an** (essai 1 mois) ; fondateurs : 29,99 € la 1ʳᵉ année ; pas d'achat à vie |
| Effort avant de vendre | **≈ 16 j** (+ widget en V2 : 10 à 15 j) | ≈ 19 j | ≈ 21 à 25 j |
| Coût d'un payant / mois | ≈ 0,33 € | Pack : ≈ 0,05 € ; Voix+ : ≈ 0,33 € | ≈ 0,69 € (jusqu'à ≈ 2 € au plafond) |
| Conversion nécessaire* | **4,8 %** des inscrits | Pack **11,5 %** (avec 1,5 % de Voix+) | **3,6 %** des inscrits (≈ 7 % des familles) |
| Risque principal | Le widget gratuit chez Nara, et un rapport jugé « sympa » sans être indispensable | Un revenu unique trop faible face à des coûts qui durent. Il faut plus de 11 % d'acheteurs | Prix au-dessus du seuil « trop cher » du panel, chantier le plus long, quota photos mal vécu |

\* Seuil d'équilibre à l'état stable, avec 200 inscrits par mois, des frais fixes de 129 €/mois (SASU, Apple et infra fixe) et un utilisateur gratuit ramené à **0,04 €/mois**. À **0,12 €/mois** (coût actuel), les seuils doublent presque : A 9,0 %, B 23 %, C 6,7 %. Détail en §8.

**Classement : 1. A, 2. C, 3. B.**
- **A** est le plus court à construire. C'est l'architecture la plus fidèle au créneau (« arriver prêt à chaque examen ») et la seule dont le prix tombe dans la fourchette acceptable du panel.
- **C** a la meilleure économie par famille, mais il coûte plus de développement et son prix est plus risqué. C'est l'**évolution naturelle de A** après 3 mois de données.
- **B** répond au souhait du panel (« un petit achat unique »), mais il ne s'équilibre qu'à plus de 11 % d'acheteurs, un niveau qu'aucune donnée publique ne rend probable.

Dans les trois cas, deux préalables comptent plus que l'architecture : **ramener le gratuit à 0,04 €** (§4.3) et **faire le nettoyage avant lancement** (§4.4).

---

## 1. Ce qui reste fixe, ce qui change

**Contraintes non négociables (consigne de Yoss) :**
1. Aucune limite sur le nombre d'enfants.
2. Le partage entre aidants reste gratuit : c'est la boucle d'acquisition.
3. On ne bloque jamais la saisie, de nuit comme de jour : aucun quota sur les événements, et le manuel reste toujours possible quand la voix est épuisée.
4. On ne vend que ce qui existe déjà ou qui est construit **avant** d'être vendu.

**Ce que le premier tour a établi :**
- Le gratuit couvre l'essentiel.
- 0 acheteur sur 8 dans le panel simulé.
- Un utilisateur gratuit coûte environ 0,12 €/mois, donc il faut environ 7 % d'actifs payants pour équilibrer.
- Le panel demandait :
  - des avis visibles ;
  - une recommandation par une sage-femme ;
  - un petit achat unique (vers 10 €) ;
  - une fonction qui fait gagner du temps chaque jour ;
  - des prédictions de sieste et de tétée ;
  - une garantie d'export si l'app ferme.

**Ce qui change dans cette v2 :** tout le reste. Le prix, le contenu de Premium, le plafond vocal, l'existence de l'achat à vie, la forme de l'essai et le modèle (abonnement, achat unique ou famille).

---

## 2. Concurrents : ce qu'ils font payer, ce qui convertit (rafraîchissement)

Le premier tour (`board-competitors.md` §5) reste valable pour la carte et les plaintes. Cette passe ne regarde que **la frontière gratuit / payant** et **ce qui fait payer**.

| App | Gratuit | Payant | Prix relevé | Source |
|---|---|---|---|---|
| **Huckleberry** | Suivi sommeil et repas, rapports de base, **synchronisation multi-appareils** | **Plus** : prédictions SweetSpot, conseils et mini-plans, créateur de planning, **« AI logging », widgets, écran verrouillé, Apple Watch**, rapports enrichis. **Premium** : plans de sommeil personnalisés, chat IA « Berry » | Plus 5,74 $/mois facturé à l'année ; Premium 9,99 $/mois facturé à l'année ; « deux semaines » d'accès gratuit | [huckleberrycare.com/pricing](https://huckleberrycare.com/pricing) |
| **Baby Daybook** | Suivi ; « **les courbes de croissance sont désormais gratuites** » (notes de version) | « Premium » (contenu non détaillé sur la fiche) | Mensuel 1,99 à 7,99 € ; annuel 26,99 à 43,99 € ; à vie 43,99 € (affiché « -40 % ») | [App Store FR](https://apps.apple.com/fr/app/id1446283219) |
| **Glow Baby** | Suivi des repas, du sommeil, des couches et des jalons | « Comparative Insights » (« est-ce normal ? »), articles premium ; formule Famille dans certains pays | 59,99 $/an après 7 j d'essai ; à vie 79,99 $ (relevés contradictoires) | [App Store](https://apps.apple.com/app/id1077177456), synthèse via recherche web (fiabilité moyenne) |
| **Nara** | Suivi, **partage avec les proches, widgets**, sans pub | Rien de vérifiable (une source dit « pas d'achats intégrés », un agrégateur parle d'un abonnement) | — | [App Store US](https://apps.apple.com/us/app/id1444639029), [SlashGear](https://www.slashgear.com/1864409/best-baby-tracking-apps-parents-2025), [AppsHunter](https://appshunter.io/ios/topics/nara-baby) |
| **BabyTime** | Suivi, avec pub | **Achats uniques** : aidants supplémentaires 1,99 $, retrait de la pub 3,99 $ (US) | — | [App Store](https://apps.apple.com/app/id1052459780) |

**Repères de conversion (secteur, sources secondaires) :**
- Rapport RevenueCat 2026 : les essais de 17 à 32 jours convertissent à environ 42,5 %, contre 25,5 % pour les essais de 4 jours ou moins. En Santé & Forme, le revenu médian par installation est de 0,48 $ à J14 et de 0,66 $ à J60 ([RevenueCat SOSA 2026](https://www.revenuecat.com/state-of-subscription-apps-2026/), résumé par [SaaStr](https://www.saastr.com/the-top-10-learnings-from-revenuecats-state-of-subscription-apps/)).
- Édition 2025 : en Santé & Forme, la conversion essai → payant médiane est de 39,9 % (68,3 % pour le top 10 %), et elle est environ 2 fois plus forte sur iOS que sur Android.
- Ces chiffres n'ont pas été vérifiés dans le rapport complet (pages en aperçu seulement).

**Ce qu'on en retient pour la v2 :**
1. **Chez le leader, le partage et la synchro sont gratuits.** Notre partage gratuit est donc la norme, pas un avantage unique. Il reste notre meilleure accroche d'installation (panel B : 7/8).
2. **Ce qui se vend :**
   - la **prédiction** (sieste, planning) ;
   - la **saisie plus rapide** (widgets, montre, saisie IA) ;
   - les **rapports enrichis** ;
   - le **contenu expert** (plans, chat).

   C'est exactement le contenu de l'architecture A.
3. **La tendance est de libérer les bases** : Baby Daybook a rendu les courbes gratuites. Faire payer l'historique ou les courbes irait à contre-courant, et c'est déjà une plainte (`board-competitors.md` §5.4, thème 2).
4. **Le widget est gratuit chez Nara.** Un widget « simple » ne justifie pas un abonnement à lui seul : il doit apporter la prochaine estimation et l'ajout en un geste.
5. **Huckleberry a déjà une « saisie IA ».** Son support du français n'a pas été vérifié : c'est la menace la plus directe sur notre argument vocal.
6. **Personne ne vend la préparation aux examens obligatoires français.** Le créneau tient toujours.
7. Les essais longs convertissent mieux, et nos prédictions ont besoin de quelques jours de données : **un essai de 14 jours ou plus est cohérent**, ce que l'essai de 7 jours du 11/11 n'était pas.

---

## 3. Les obstacles de l'acheteur, et ce qui y répond

Repris de `offer-pricing.md` §1 (23 obstacles) et complétés par le panel v2. La colonne de droite indique où chaque architecture y répond.

| # | Obstacle (mots du parent) | Réponse | Où |
|---|---|---|---|
| 1 | « Le gratuit me suffit, Premium ne m'apporte rien » (9 citations, raison n° 1) | Vendre un **résultat** récurrent (examen préparé, prochaine tétée), pas un quota | A, C |
| 2 | « Je ne vais pas payer un abonnement pour un PDF » | Premier rapport d'examen **gratuit** ; achat unique en B | A, B, C |
| 3 | « Un petit prix unique, autour de 10 € » | Pack 12,99 € (B) ; à vie fondateurs 49,99 € (A) | B, A |
| 4 | « Des prédictions comme Huckleberry » | Estimation de la prochaine tétée et de la prochaine sieste, calculée **sur l'appareil** | A, B, C |
| 5 | « Si ça ferme, je perds tout » | **Garantie de pérennité** : export complet gratuit à tout moment et préavis de 6 mois avant toute fermeture | Commun |
| 6 | « L'autre parent n'installera pas » | Partage gratuit ; en C, le Premium est partagé : un seul paiement | Commun, C |
| 7 | « Petite boîte inconnue » | Avis visibles (marketing), recommandation sage-femme : le kit examen donne une **raison** de recommander | Commun |
| 8 | « Peur d'oublier de résilier » | Rappel 2 jours avant la fin de l'essai, résiliation en deux touches | Commun |
| 9 | « 3 voix par jour, c'est frustrant » | Semaine découverte à 30 ou 50 voix par jour, puis 3/jour ; saisie manuelle jamais bloquée | Commun |
| 10 | « Je n'en aurai plus besoin dans un an » | Mensuel résiliable, données gardées ; prix annuel bas (A) | A |
| 11 | « Et le 2ᵉ enfant ? » | Enfants illimités sur le même compte, dans toutes les architectures | Commun |
| 12 | « Le prix va monter » | Prix fondateur bloqué tant que l'abonnement reste actif | A, C |
| 13 | « Mes photos vont-elles être bloquées ? » | Jamais : un quota ne s'applique qu'aux **nouveaux** envois, l'existant reste visible et exportable | B, C |
| 14 | « Importer depuis Huckleberry » | Pas maintenant (coût 5/5, formats propriétaires) | — |

---

## 4. Le socle commun aux trois architectures

### 4.1 Toujours gratuit, quelle que soit l'architecture

- Les 18 types d'événements, l'accueil, le bouton +, le journal, les minuteurs synchronisés, le mode hors ligne, le mode nuit.
- **Le partage illimité et les rôles** (Parent / Proche), pour des enfants illimités.
- Les alertes santé (fièvre selon l'âge), non masquables : une question d'éthique et d'image.
- Les courbes OMS et les statistiques de base. Le marché les a rendues gratuites.
- Les rappels de base, les insights déterministes, les conseils par âge, le récap hebdo (version simple).
- **Le calendrier des examens obligatoires** : les dates sont une information publique. Le faire payer serait mesquin, et c'est le meilleur déclencheur vers Premium (« Examen du 2ᵉ mois dans 5 jours »).
- **L'export CSV et JSON complet**, ainsi que la suppression du compte (RGPD art. 20 et 17). Il faut vérifier que l'export inclut **les photos** (ou un lien pour les télécharger) : ce sont des données fournies par l'utilisateur.
- 3 commandes vocales par jour après une **semaine découverte** (voix au niveau payant pendant 7 jours, sans carte).
- **1 rapport pédiatre complet gratuit** : la valeur se découvre au premier examen.

### 4.2 Garanties communes (« Zéro piège »), toutes tenables

1. Essai avec **rappel 2 jours avant la fin** (notification locale et e-mail), 0,5 à 1 j de dev.
2. **Résiliation en deux touches** : lien direct vers la gestion d'abonnement du store.
3. **Vos données ne sont jamais prises en otage** : à la fin du payant, tout reste consultable, partagé et exportable.
4. **Garantie de pérennité** : export complet gratuit à tout moment, et engagement écrit dans les CGU à **prévenir 6 mois avant** toute fermeture du service. Coût : 0 € et une ligne de CGU. C'est la réponse à l'objection de pérennité.
5. Réponse humaine sous 48 h ouvrées.

À **ne pas** promettre : « satisfait ou remboursé » sans nuance. Sur iOS, seul Apple rembourse. La seule formulation honnête :
> « Écrivez-nous dans les 14 jours : sur Android nous remboursons, sur iPhone nous vous guidons vers Apple. »

### 4.3 Rendre l'utilisateur gratuit moins cher : de 0,12 € vers 0,04 €/mois

Point de départ (CFO) : 0,088 € d'infra variable et 0,03 € de voix gratuite par utilisateur actif et par mois. **Aucune facture détaillée n'existe** : les gains ci-dessous sont des ordres de grandeur estimés à partir du code (`FEATURE_MAP.md` §5). Il faut d'abord **mesurer**.

| # | Levier | Pourquoi ça coûte aujourd'hui | Gain estimé €/mois/actif | Effort |
|---|---|---|---:|---:|
| 0 | **Mesurer** : export de la facturation GCP vers BigQuery, alertes de budget, compteurs de lectures par écran (Sentry ou logs) | Sans mesure, l'objectif est invérifiable | — | 1 j |
| 1 | **Supprimer le canal push serveur des rappels** et garder les notifications locales (corrige aussi le bug de double notification) | `checkAndSendReminders` tourne 48 fois par jour, avec plusieurs lectures par utilisateur opt-in, **même inactif** | 0,010 à 0,015 | 1 j |
| 2 | **Listeners Moments** : limiter likes et commentaires à 50 documents au lieu de 500, ne les attacher qu'à l'ouverture de l'onglet Moments, et relire en incrémental (`updatedAt > dernière synchro`) au lieu de tout relire après 30 min hors ligne | Jusqu'à environ 1 000 lectures par ouverture pour une famille active | 0,020 à 0,030 | 2 à 3 j |
| 3 | Limiter `useForegroundServerRefresh` à une relecture toutes les 15 min, et garder en cache les plages des stats | Relectures à chaque retour dans l'app | 0,005 à 0,010 | 1 j |
| 4 | **Voix gratuite moins chère** : (a) corriger la fuite de `parseVoiceCommand`, liée au quota ; (b) parseur local déterministe pour les phrases simples (« biberon 120 », « selle ») avant d'appeler Haiku ; (c) modèle de transcription moins cher, ou reconnaissance sur l'appareil, pour le gratuit (qualité à tester en chuchotant) | AssemblyAI `best` et Haiku à chaque commande | 0,015 à 0,025 (voix gratuite : 0,03 → 0,005-0,015) | 3 à 5 j |
| 5 | `minInstances: 1` → 0 sur `transcribeAudio`, ou réservé aux heures de pointe (démarrage à froid de quelques secondes à tester de nuit) | Environ 5 €/mois fixes, soit 0,01 € par utilisateur à 500 utilisateurs | 0,01 (à 500 utilisateurs) | 0,1 à 1 j |
| 6 | Photos : 1 280 px à qualité 70 (150 à 250 Ko au lieu de 300 à 600), miniatures partout dans les grilles, cache disque ; **fin du miroir US** (forcer une version minimale via `app_config`) | Stockage cumulatif, egress, double stockage US/UE | 0,005 à 0,010 | 1 à 2 j |
| | **Total** | | **0,065 à 0,10** → **≈ 0,03 à 0,05 €/mois** | **≈ 9 à 13 j** |

Conclusion : **0,04 €/mois est atteignable, sans garantie**. Les leviers 1, 2 et 4 font l'essentiel. Le levier 1 a un effet supplémentaire : un utilisateur **inactif** (bébé grandi, app plus ouverte) ne coûte presque plus rien, hors stockage. Le CFO a montré que c'est le levier le plus puissant (besoin de trésorerie de 2 385 € → 314 €). **Il vaut plus que n'importe quel choix de prix.**

### 4.4 À retirer ou corriger avant de vendre (toutes architectures)

| Priorité | Élément | Problème | Action | Effort |
|---|---|---|---|---:|
| P0 | `app/settings/backup.tsx` | UI factice (date et taille codées en dur, succès simulés) | **Supprimer le fichier** ; la vraie sauvegarde, c'est l'export JSON | 0,1 j |
| P0 | `ReferralCard` + `validateReferralCode` | Promet « 1 mois Premium offert », mais personne ne peut saisir de code. Même accordé, ce Premium serait invisible dans l'app. Un mécanisme maison de déblocage est aussi risqué au regard d'Apple 3.1.1 | **Retirer la carte et désactiver la callable.** Pour un parrainage futur, passer par les codes d'offre Apple et les codes promo Google | 0,3 j |
| P0 | `PremiumContext` | Ignore le `tier` serveur quand RevenueCat répond. En secours Firestore, `isPremium` ne regarde pas `status` | Fusionner RevenueCat et serveur, et vérifier `status`. Indispensable pour les droits accordés côté serveur (testeurs, grandfathering, famille en C) | 1 à 1,5 j |
| P0 | Promesse aux testeurs « **Premium offert à vie au lancement** » (`RECRUTEMENT_ET_SONDAGE.md`) | Ambiguë selon l'architecture (en B, inclut-elle Voix+ ? en C, la famille ?) | **La définir par écrit avant d'envoyer le message** : « toutes les fonctions payantes, présentes et futures, pour votre compte ». L'accorder via un droit promotionnel RevenueCat « à vie ». Coût : environ 20 testeurs × 0,33 à 0,69 € = 7 à 14 €/mois | 0,5 j |
| P0 | `parseVoiceCommand` | Plafond de 200 appels/jour sans lien avec le quota voix : fuite de coût | Exiger un jeton émis par `transcribeAudio`, ou décompter le même quota | 0,5 à 1 j |
| P0 | Textes stores (`docs/STORE_SUBMISSION.md`) | Promettent « Historique illimité » et « Partage famille étendu » ; sous-titre « Suivi bébé intelligent » | Réécrire selon l'architecture retenue | 0,5 j |
| P0 | Types `PremiumFeature` sans effet (`unlimited_history`, `ai_insights`, `night_mode_premium`, `widgets`, `pediatre_report`) | Gating sans fonctionnalité | Supprimer ceux qui ne seront pas vendus, câbler les autres au moment de leur livraison | 0,3 j |
| P0 | Séries de jours consécutifs réservées au Premium (`HomeMilestoneCelebration`) | Restriction non annoncée dans le paywall | **Rendre gratuit** (coût nul) | 0,1 j |
| P0 | Quota PDF consommé côté client | Contournable | Le passer côté serveur si le rapport devient payant (A, B, C) | 0,5 j |
| P1 | `aiInsightsService` + `dataAnonymizationService` | Code mort (la CF n'existe pas) | Supprimer, et retirer toute mention d'« insights IA » de la politique de confidentialité et de l'onboarding | 0,3 j |
| P1 | Rappels en double canal | Double notification probable | Voir le levier 1 | (inclus) |
| P1 | Récap hebdo désactivé par défaut | La meilleure fonctionnalité de rétention est invisible | Proposer l'opt-in à l'onboarding, ou après 7 jours d'usage | 0,5 j |
| P1 | Seuils d'alerte température | Pas relus par un pédiatre | Relecture externe **avant** toute démarche auprès des sages-femmes | externe |
| P1 | Pas d'analytics produit | Impossible de mesurer la conversion | Événements agrégés, internes et sans tiers (activation J1/J7, paywall vu, essai, achat), cohérents avec la promesse « sans traqueur » | 1 à 2 j |
| P2 | `language.tsx`, `pending-requests.tsx` + `babyAttachmentService` (e-mail factice), `OfflineBanner`, modules jamais importés | Code orphelin | Supprimer | 0,5 j |
| P2 | `immunizations.tsx` (2 409 lignes, inaccessible) | Écran caché | Récupérer sa logique d'historique vaccinal pour le rapport pédiatre, puis supprimer l'écran | inclus dans le rapport |

**Total du nettoyage P0 et P1 : ≈ 6 à 8 j.**

---

## 5. Architecture A — « Prêt pour chaque examen »

**Promesse :** « Arrivez à chaque examen avec tout, et sachez quand viendra la prochaine tétée. »
**Nom :** Premium. Offre de lancement : « Offre Fondateurs ».
**Principe :** abonnement par compte. Tout ce qui est payant se calcule sur l'appareil, à coût nul, sauf la voix.

### 5.1 Gratuit / payant

| Fonctionnalité | Gratuit | Premium | État | Effort |
|---|---|---|---|---:|
| Socle §4.1 (suivi, partage, OMS, stats, alertes, export) | ✓ | ✓ | existe | 0 |
| Calendrier des examens obligatoires et rappel J-3 | ✓ | ✓ | petit chantier | 1 j |
| **Rapport pédiatre complet** (période depuis le dernier examen, courbes OMS, repas, sommeil, couches, santé, vaccins, allergies, notes) | 1 gratuit | illimité | petit chantier (le PDF existe, partiel) | 4 à 6 j |
| **Kit examen** : « préparer la visite » (rapport de la période, questions notées au fil des jours, check-list de l'examen issue du carnet de santé) | — | ✓ | petit chantier | 2 à 3 j |
| **Prédictions** : prochaine tétée (intervalle médian des 3 derniers jours, selon l'heure) et prochaine sieste (fenêtres d'éveil selon l'âge et l'historique), en fourchette, désactivables | — | ✓ | petit chantier (le moteur d'insights local existe) | 5 à 7 j |
| Voix | 3/jour (semaine découverte à 30) | **30/jour** | existe (réglage) | 0,1 j |
| Exports PDF | 1 | illimités | existe | 0,5 j (quota serveur) |
| **Widget** (dernière tétée, couche ou sommeil, prochaine estimation, bouton d'ajout qui ouvre la feuille) | — | ✓ **V2, vendu seulement une fois livré** | gros chantier | 10 à 15 j |

Le plafond vocal passe de 50 à 30 par jour : l'usage réel estimé est d'environ 15, et le pire cas coûte deux fois moins.

**Effort avant de vendre : ≈ 16 j** (rapport 5, kit 2,5, prédictions 6, divers 2), plus le socle commun (§4.3 et §4.4 : ≈ 15 à 20 j). Le widget vient ensuite, sans hausse de prix pour les abonnés existants.

### 5.2 Prix (founder-pricing)

| Formule | Prix TTC | Net encaissé (TVA 20 %, store 15 %) | Commentaire |
|---|---:|---:|---|
| Mensuel | **3,49 €** | 2,47 €/mois | Sous le seuil « trop cher » du panel simulé (PME ≈ 4,10 €) |
| Annuel (mis en avant) | **24,99 €** | 17,70 €/an (1,48 €/mois) | Équivaut à 7,2 mois de mensuel. Le panel situait le « cher » vers 30 à 35 € par an |
| À vie | **49,99 €**, Offre Fondateurs uniquement | 33,33 € (moyenne Apple 15 % et Google 25 %) | Sous Glow (69,99), proche de Baby Daybook (43,99). Retiré à la date annoncée |

**Arbitrage chiffré.** Baisser le prix n'est pas gratuit. À 3,99 € / 29,99 € / 79,99 €, la valeur nette par payant est de 30,3 € et le seuil de conversion de 3,8 %. À 3,49 € / 24,99 € / 49,99 €, ces chiffres passent à 23,8 € et 4,8 %. La baisse ne paie que si elle augmente la conversion d'au moins 26 %. Le panel simulé (IPP ≈ 2,54 €/mois, 3,99 € « pile sur le seuil cher ») le suggère sans le prouver. **À trancher par le sondage** : Gabor-Granger sur l'annuel à 24,99 € et à 29,99 €, et sur le mensuel à 2,99 €, 3,49 € et 3,99 €.

**Essai : 14 jours sur l'annuel.** Les prédictions ont besoin d'environ une semaine de données, et les essais longs convertissent mieux (RevenueCat 2026). L'essai est complété par **1 rapport complet gratuit** pour tous, qui sert d'essai par l'usage au premier examen.

### 5.3 Garantie, offre de lancement

- **Garantie :** « Zéro piège » (§4.2), plus une garantie de résultat qu'on peut tenir :
  > « Si le rapport ne vous a pas servi à votre prochain examen, écrivez-nous. »

  Sur Android, on rembourse depuis la Console. Sur iPhone, on guide vers Apple. Coût modélisé (premier tour) : environ 16 € par an à 500 utilisateurs.
- **Offre Fondateurs** (du lancement public jusqu'à J+60, date affichée) : prix bloqué tant que l'abonnement reste actif ; achat à vie à 49,99 € proposé seulement pendant cette période ; ligne directe avec le fondateur. **Pas de prix barré.**

### 5.4 Coût par utilisateur

- **Gratuit :** environ 0,04 € après les leviers (§4.3), 0,12 € avant.
- **Premium :** environ 0,33 €/mois. Détail : voix à 15 commandes/jour, environ 0,30 € après le parseur local (0,50 € avant), et environ 0,03 € d'infra en plus. Rapport, kit, prédictions et widget sont calculés sur l'appareil, donc gratuits pour nous. Pire cas (30 voix/jour tous les jours) : environ 0,60 à 1,00 €, toujours couvert par chaque formule.

### 5.5 Contraintes légales et stores

- **Apple 3.1.2(a)** : un abonnement doit apporter une valeur continue. C'est le cas ici : rapport à chacun des examens de 0 à 2 ans, prédictions quotidiennes, voix.
- **3.1.2(c)** : prix, durée, renouvellement et essai affichés avant l'achat, plus un lien vers les CGU et la politique de confidentialité. Le paywall de la PR #70 est déjà conforme sur ce point.
- **Bouton « Restaurer les achats »** obligatoire, à cause de l'achat à vie.
- **Contenu santé :**
  - le kit reprend le calendrier du carnet de santé officiel, **sourcé et relu**, sans diagnostic ;
  - les prédictions sont présentées comme « une estimation à partir de vos saisies, pas un avis médical » ;
  - aucune promesse du type « améliore le sommeil » ;
  - une estimation de tétée ou de sieste n'a pas de finalité médicale, ce qui écarte a priori la qualification de dispositif médical. À vérifier si un jour une fonction « détecte » quelque chose.
- **Droit français :**
  - Offre Fondateurs datée et réellement retirée (L121-4, 7° : pas de fausse urgence) ;
  - pas de prix de référence fictif (L112-1-1) ;
  - « à vie » défini dans les CGU (durée de vie du service, avec la garantie d'export et de préavis) ;
  - médiateur désigné avant la première vente (L612-1).
- **Google :** commission de 25 % sur les achats uniques dans l'EEE (CONTEXT), d'où le net moyen de l'achat à vie.

### 5.6 Équation de valeur (1 à 10)

| Levier | Offre du 11/11 | A | Ce qui la fait bouger |
|---|---:|---:|---|
| Résultat rêvé | 5 | 8 | « Prêt pour chaque examen » et « je sais quand il aura faim » |
| Probabilité perçue | 4 | 7 | Premier rapport gratuit (preuve), garantie de pérennité, semaine vocale |
| Délai | 6 | 8 | Prédictions dès la 2ᵉ semaine ; examen du 1ᵉʳ mois |
| Effort et sacrifice | 5 | 8 | Essai de 14 jours avec rappel J-2, prix plus bas, résiliation en deux touches |

### 5.7 Risque principal et parade

**Risque :** le rapport reste « sympa » (« je montre l'app au médecin ») et les prédictions déçoivent, comme celles de Huckleberry, souvent jugées fausses.

**Parades :**
- afficher une **fourchette** et le volume de données utilisé ;
- mesurer l'usage réel du rapport (combien de « préparer la visite » par utilisateur) dès le soft launch ;
- passer à C si les familles partagées sont celles qui convertissent.

---

## 6. Architecture B — « Pack Bébé » (achat unique) + « Voix+ » (abonnement)

**Promesse :** « Payez une fois ce qui ne nous coûte rien, et au mois seulement ce qui nous coûte chaque mois. »

Le principe est très honnête : le prix suit le coût. Il répond directement au « petit prix unique » du panel.

### 6.1 Gratuit / payant

| Fonctionnalité | Gratuit | Pack Bébé (une fois) | Voix+ (abonnement) | État | Effort |
|---|---|---|---|---|---:|
| Socle §4.1 | ✓ | ✓ | ✓ | existe | 0 |
| Calendrier des examens | ✓ | ✓ | — | petit chantier | 1 j |
| Rapport pédiatre complet | 1 gratuit | illimité | — | petit chantier | 4 à 6 j |
| Kit examen | — | ✓ | — | petit chantier | 2 à 3 j |
| Prédictions tétée et sieste | — | ✓ | — | petit chantier | 5 à 7 j |
| Exports PDF | 1 | illimités | — | existe | 0,5 j |
| Widget | — | ✓ en V2 (inclus pour les acheteurs, **non vendu avant livraison**) | — | gros chantier | 10 à 15 j |
| Voix | 3/jour (semaine découverte à 50) | 3/jour | **50/jour** | existe | 0,1 j |
| Photos de jalons | **20 nouvelles par mois et par enfant** (l'existant n'est jamais touché) | idem | **illimitées** | petit chantier | 2 à 3 j |
| Achat non consommable, restauration, paywall à deux produits | — | — | — | petit chantier | 1,5 à 2 j |

**Effort avant de vendre : ≈ 19 j**, plus le socle commun.

### 6.2 Prix

| Produit | Prix TTC | Net | Commentaire |
|---|---:|---:|---|
| **Pack Bébé** | **12,99 €** au lancement, **14,99 €** quand le widget sort (vraie hausse, sans prix barré ; les acheteurs gardent tout) | 8,66 € (moyenne Apple 15 % et Google 25 %) ; 9,99 € à 14,99 € | Proche des « 10 € » du panel. Le panel E situe le « cher » vers 25 € en achat unique |
| Voix+ mensuel | **1,99 €** | 1,41 €/mois | Couvre environ 0,30 € de voix, avec de la marge |
| Voix+ annuel | **14,99 €** | 10,62 €/an | — |
| Essai | Pas d'essai sur le Pack, remplacé par le rapport gratuit et la démo des prédictions (aperçu flouté de 3 jours) ; 7 jours sur Voix+ annuel | — | — |

### 6.3 Garantie, offre de lancement

- **Garantie :**
  > « Achat unique, pas d'abonnement caché. Le Pack reste à vous. »

  Plus la garantie de pérennité et le remboursement Android sous 14 jours.
- **Lancement :** le Pack est à 12,99 € jusqu'à la sortie du widget, puis passe à 14,99 €. C'est vrai et daté par un événement, mais **il ne faut pas promettre une date de widget**. On peut dire : « Le prix passera à 14,99 € à la sortie du widget ; si vous avez déjà le Pack, vous l'aurez sans rien payer. » Cet engagement n'est tenable que si le widget est réellement développé ; sinon, ne rien dire.

### 6.4 Coût par utilisateur

- **Gratuit :** environ 0,04 € (le quota photos limite la croissance du stockage).
- **Acheteur du Pack :** environ 0,05 €/mois d'infra, sur environ 12,5 mois d'usage, soit environ 0,25 € face à 8,66 € nets. Très rentable par acheteur.
- **Voix+ :** environ 0,33 €/mois.
- Point faible : **un revenu unique face à un coût mensuel**. Sur 24 mois, un gros utilisateur vocal resté en gratuit ne rapporte rien.

### 6.5 Contraintes légales et stores

- **Apple 3.1.1** : le Pack est un achat intégré non consommable, avec un bouton « Restaurer » obligatoire. Le partage familial Apple peut être activé sur le Pack, mais c'est **irréversible** et propre à iOS (asymétrie avec Android) : à décider en connaissance de cause.
- **3.1.2(a)** : Voix+ a une valeur continue (service serveur). Le quota photos se justifie comme un service de stockage.
- **Google** : 25 % de commission sur l'achat unique dans l'EEE, contre 15 % sur l'abonnement. C'est intégré au net.
- **Droit français :**
  - la hausse de 12,99 € à 14,99 € est légale si elle est annoncée sans fausse réduction ;
  - ne jamais afficher « 14,99 € → 12,99 € » avant que 14,99 € ait réellement été pratiqué (L112-1-1) ;
  - le quota photos doit être annoncé **avant** l'envoi d'une photo ;
  - au-delà du quota, rien n'est supprimé, et l'export (photos comprises) reste gratuit.

### 6.6 Équation de valeur

Résultat 7 (le même contenu que A, sans prix bloqué), probabilité 7, délai 8, **effort 9** (un seul paiement, pas d'abonnement).

### 6.7 Risque principal

**L'économie.** Avec 200 inscrits par mois, des frais fixes de 129 € et un gratuit à 0,04 € :
- à 12,99 €, il faut **11,5 % d'acheteurs du Pack** (avec 1,5 % de Voix+) pour s'équilibrer ;
- à 9,99 €, il en faut 15 % ;
- à 0,12 €/mois de coût gratuit, il en faut **23 %**.

Pour 8 % d'acheteurs, il faudrait environ **366 inscrits par mois**, presque le double de A ou C. Le panel E demandait un achat unique, mais « vers 10 € » n'est pas « 1 personne sur 9 achète ». Aucun repère public ne soutient un tel taux pour un achat unique en freemium.

**Parade :** ne garder de B que l'idée d'un petit achat unique, à tester (voir le classement).

---

## 7. Architecture C — « Famille » : un abonnement, toute la famille

**Promesse :** « Un abonnement pour toute la famille : les deux parents, la nounou, les grands-parents. »

C'est la seule architecture où le partage, notre boucle d'acquisition, **augmente** la valeur du payant au lieu de la diluer.

### 7.1 Gratuit / payant

| Fonctionnalité | Gratuit | Famille | État | Effort |
|---|---|---|---|---:|
| Socle §4.1 | ✓ | ✓ | existe | 0 |
| **Premium partagé** : tout ce qui suit vaut pour **tous les aidants** des enfants dont le payeur est Propriétaire ou Parent | — | ✓ | chantier moyen (droit côté serveur rattaché à l'enfant ; correctif `PremiumContext` ; contrôles dans les CF) | 3 à 4 j |
| Calendrier des examens | ✓ | ✓ | petit chantier | 1 j |
| Rapport pédiatre et kit examen | 1 rapport | illimité, pour tous | petit chantier | 6 à 9 j |
| Prédictions tétée et sieste | — | ✓ | petit chantier | 5 à 7 j (option V1.1) |
| Voix | 3/jour par compte (semaine découverte) | **50/jour pour chaque Parent** | existe ; quota par utilisateur, droit par famille | 0,5 j |
| Photos | **30 nouvelles par mois et par enfant** | illimitées, avec un **album de l'année** (PDF prêt à imprimer) | quota : petit chantier ; album : petit chantier | 2 à 3 j + 3 à 5 j (album en V1.1) |
| **Notifications croisées** (« Papa a donné le biberon à 14 h »), regroupées, en respectant les heures calmes | — | ✓ | chantier moyen (trigger Firestore, push, préférences) | 3 à 4 j |
| Récap hebdo enrichi (graphiques, plusieurs enfants, à tous les aidants) | simple | enrichi | petit chantier | 2 à 3 j |
| Widget | — | V2 | gros chantier | 10 à 15 j |

**Effort avant de vendre :** ≈ 21 j sans album ni prédictions, ≈ 25 j avec les prédictions. Plus le socle commun. C'est l'architecture la plus longue.

### 7.2 Prix

| Formule | Prix TTC | Net | Commentaire |
|---|---:|---:|---|
| Mensuel | **4,99 €** | 3,53 €/mois | **Au-dessus** du seuil « trop cher » du panel (≈ 4,10 €). À justifier par « par famille, soit environ 2 € par parent » |
| Annuel | **39,99 €** | 28,33 €/an | Sous Huckleberry Plus (environ 69 $), Glow (59,99 $), Baby Connect (59,99 €) |
| Fondateurs | **29,99 € la 1ʳᵉ année, puis 39,99 €/an** (offre de lancement des stores, affichée en toutes lettres) | 21,24 € la 1ʳᵉ année | Le prix régulier est réellement pratiqué ensuite : ce n'est pas un faux ancrage |
| À vie | **Aucun** | — | Les coûts sont récurrents (voix de plusieurs adultes, photos illimitées) : un achat à vie serait un passif. On le dit franchement |
| Essai | **1 mois sur l'annuel** | — | Le temps que l'autre parent et la nounou rejoignent l'app : c'est là que la valeur apparaît |

### 7.3 Garantie, offre de lancement

- **Garantie :** « Zéro piège », plus :
  > « Si vous arrêtez, vos photos restent visibles et téléchargeables : seuls les nouveaux envois au-delà de 30 par mois attendent. »

  Plus la garantie de pérennité.
- **Lancement :** 1ʳᵉ année à 29,99 € pour les abonnements souscrits avant J+60. Prix bloqué ensuite à 39,99 € tant que l'abonnement reste actif.

### 7.4 Coût par utilisateur

- **Gratuit :** environ 0,04 €.
- **Famille :** environ **0,69 €/mois**. Détail : voix de 2 Parents à environ 0,30 € chacun, photos environ 0,03 €, notifications croisées environ 0,01 €, infra environ 0,05 €.
- **Pire cas :** 2 Parents à 50 voix par jour, soit environ 2 €/mois. Le mensuel reste positif (3,53 € nets), mais l'annuel fondateur (1,77 €/mois) passe **sous le coût** pour ces familles-là. Il faut surveiller la part de familles au plafond.

### 7.5 Contraintes légales et stores

- **Apple et Google :** un abonnement qui débloque un **espace partagé** pour d'autres comptes est une pratique courante (espaces de travail payés par un membre), mais il faut l'**écrire clairement** dans la fiche et le paywall :
  > « L'abonnement d'un parent débloque Famille pour tous les aidants des enfants qu'il suit. »
- **3.1.2(c) :** l'offre de lancement doit afficher le prix de la première année **et** le prix ensuite, avec la même lisibilité.
- **RGPD :**
  - les notifications croisées révèlent l'activité d'un aidant aux autres : il faut un **réglage par aidant** (activé ou non), et une mise à jour de la politique de confidentialité ;
  - les photos doivent être exportables gratuitement (art. 20) ;
  - le quota ne s'applique qu'aux nouveaux envois.
- **Droit français :** pas de « -25 % » (on présente un prix de première période, pas une réduction) ; médiateur ; CGU qui précisent ce qui se passe quand le payeur quitte l'enfant (la famille repasse en gratuit, rien n'est perdu).

### 7.6 Équation de valeur

Résultat 8 (toute la famille alignée et le pédiatre préparé), probabilité 7, délai 7 (il faut que les autres rejoignent), effort 7 (prix plus élevé, mais un seul payeur).

### 7.7 Risque principal

**Le prix et la durée du chantier.**
- 4,99 € dépasse le seuil du panel.
- Le quota photos touche les grands-parents, c'est-à-dire la boucle d'acquisition émotionnelle, et peut faire naître des avis négatifs.
- C'est 5 à 9 jours de plus que A avant de vendre.

L'économie, en revanche, est la meilleure des trois : **3,6 % des inscrits suffisent**, soit environ 7 % des familles si une famille compte environ 2 inscrits (estimation). À 4,5 % de conversion, l'équilibre arrive dès environ 136 inscrits par mois.

---

## 8. Comparaison chiffrée (modèle `v2_work/model_v2.py`)

**Hypothèses (CFO base, sauf mention) :**
- attrition des actifs 8 %/mois, soit 12,5 mois d'usage moyen ;
- renouvellement annuel 35 % ;
- churn mensuel 8 % ;
- TVA 20 %, commission 15 % sur les abonnements, 20 % en moyenne sur les achats uniques (Apple 15 %, Google 25 %) ;
- frais fixes 129 €/mois (110 € SASU, 8,25 € Apple, environ 11 € d'infra fixe sans `minInstances`) ;
- mix A : 40 % mensuel, 50 % annuel, 10 % à vie ; mix C : 30 % mensuel, 70 % annuel.

« Seuil » = part des inscrits qui doit payer pour équilibrer à l'état stable.

| | Valeur nette d'un payant | Seuil (gratuit 0,04 €) | Seuil (gratuit 0,12 €) | Inscrits/mois nécessaires à la conversion visée |
|---|---:|---:|---:|---:|
| A (3,49 / 24,99 / 49,99) | 23,8 € | **4,8 %** | 9,0 % | 187 à 5 % |
| A au prix du 11/11 (3,99 / 29,99 / 79,99), pour comparer | 30,3 € | 3,8 % | 7,1 % | 127 à 5 % |
| B (Pack 12,99 + Voix+ à 1,5 %) | 8,4 € par Pack | **11,5 %** de Packs | 23,4 % | 366 à 8 % |
| B (Pack 14,99) | 9,7 € par Pack | 9,9 % | 20,2 % | ≈ 200 à 10 % |
| C, prix régulier | 32,3 € | **3,6 %** | 6,7 % | 206 à 3,5 % ; 136 à 4,5 % |
| C, 1ʳᵉ année fondateurs | 27,3 € | 4,2 % | 7,9 % | — |

**Lecture honnête :**
1. **Aucune architecture n'est rentable à 500 utilisateurs actifs, une fois les frais SASU comptés** : à environ 40 inscrits par mois, il faudrait 12 à 16 % de payants. Les 110 €/mois de compta et de banque existent avec ou sans l'app. **L'objectif réaliste des 12 premiers mois est de couvrir l'infra et la voix, pas la SASU.** L'équilibre complet demande environ 190 à 210 inscrits par mois (A ou C).
2. Le **coût du gratuit pèse plus que le choix d'architecture** : passer de 0,12 € à 0,04 € divise les seuils par environ 1,9.
3. La baisse de prix de A coûte 26 % de valeur par payant : à justifier par le sondage, pas par intuition.

---

## 9. Prix : ce que disent les trois sources (founder-pricing)

1. **Acheteurs (simulés, 8 personas, outil `van_westendorp.py`) :**
   - Variante A, réponses plutôt mensuelles : fourchette acceptable **1,10 à 4,10 €**, IPP 2,54 €. Le panel est dans `panel-v2/A/answers`.
   - Variante E : unités mélangées (mensuel, annuel, achat unique), fourchette 3,05 à 25,10 €, **inexploitable** en l'état.
   - Données simulées : elles servent à choisir **quoi tester**, pas à prouver quoi que ce soit.
2. **Concurrents :** l'annuel payant se situe entre 26,99 € (Baby Daybook) et 118 à 130 € (Huckleberry Premium), avec une médiane de 55 à 60 €. Les offres à 60 € et plus vendent de la prédiction et du contenu expert.
3. **Besoin de l'entreprise :** §8.

**Recommandation :**
- architecture **A à 3,49 €/mois et 24,99 €/an**, essai de 14 jours, achat à vie à 49,99 € pour les fondateurs seulement ;
- échelle : Gratuit → Premium annuel (mis en avant) → À vie fondateurs ;
- après 3 mois, si les familles partagées sont celles qui convertissent, ajouter **« Famille » (C) à 39,99 €/an** en niveau supérieur. Cela fait un vrai bon / mieux / meilleur : Gratuit, Premium, Famille.

**Objections de prix à préparer** (panel simulé, à remplacer par de vrais verbatims) :
- « Je n'ai jamais payé un abonnement d'app » ;
- « Je ne vais pas payer pour un PDF avant le rendez-vous du 1ᵉʳ mois » ;
- « Une petite app française : sera-t-elle encore là dans un an ? »

---

## 10. Ce qu'il faut tester avec de vrais parents (avant le 5/1/2027)

1. **Sondage monadique :** chaque répondant ne voit **qu'une** des trois architectures (A, B ou C), décrite en 5 lignes avec son prix. Viser au moins 25 réponses par variante, en recrutant les testeurs Android et les groupes de parents (`RECRUTEMENT_ET_SONDAGE.md`). Mesurer :
   - l'intention d'achat (échelle de 1 à 5) ;
   - le Van Westendorp **avec une unité imposée** (« par mois » pour A et C, « une fois » pour le Pack) ;
   - la fonction qui compte le plus ;
   - la réponse à « qui paierait dans votre foyer ? ».
2. **Règles de décision écrites à l'avance :**
   - A est retenu si son intention « probablement » ou « certainement » dépasse 25 % et si 24,99 € reste sous le PME ;
   - C passe devant si son intention par famille est au moins égale à celle de A **et** si 4,99 € reste sous le PME ;
   - B n'est retenu que si plus de 40 % déclarent qu'ils achèteraient le Pack à 12,99 €.
3. **Soft launch iOS :** mesurer l'usage du rapport gratuit (combien de « préparer la visite » par utilisateur actif), le taux essai → payant et la part d'annuels. Seuil de poursuite : au moins 3 % des actifs à J30 en essai ou en payant.

---

## 11. Limites

- Coûts par fonctionnalité **estimés** à partir du code, faute de facture détaillée : le levier 0 (mesurer) passe avant le reste.
- Conversions **supposées** (4 à 5 % en A, 3,5 à 4,5 % en C, 6 à 10 % de Packs en B), cohérentes avec la fourchette freemium santé du CFO (2 à 5 %), mais non mesurées.
- Le panel est **simulé** ; l'étape « re-tester l'offre sur le panel » de founder-offer n'a pas été relancée. Le re-test se fera avec le sondage réel du §10.
- Chiffres de concurrents relevés le 12/11/2026, à revérifier avant publication. Glow et Nara : sources secondaires.
- Repères RevenueCat issus de résumés publics, pas du rapport complet.

**Sources :**
- [huckleberrycare.com/pricing](https://huckleberrycare.com/pricing)
- [Baby Daybook — App Store FR](https://apps.apple.com/fr/app/id1446283219)
- [Glow Baby — App Store](https://apps.apple.com/app/id1077177456)
- [Nara — App Store US](https://apps.apple.com/us/app/id1444639029)
- [SlashGear 2025](https://www.slashgear.com/1864409/best-baby-tracking-apps-parents-2025)
- [AppsHunter Nara](https://appshunter.io/ios/topics/nara-baby)
- [BabyTime — App Store](https://apps.apple.com/app/id1052459780)
- [RevenueCat SOSA 2026](https://www.revenuecat.com/state-of-subscription-apps-2026/)
- [SaaStr, synthèse RevenueCat](https://www.saastr.com/the-top-10-learnings-from-revenuecats-state-of-subscription-apps/)
- [Adapty 2026](https://adapty.io/state-of-in-app-subscriptions-2026)
