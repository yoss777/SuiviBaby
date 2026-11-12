# SuiviBaby : panel consommateurs, marque et marketing (11/11/2026)

Méthode : skills founder-consumer, founder-brand et founder-marketing, appliqués au cas réel. Les sources sont `CONTEXT.md`, `docs/STORE_SUBMISSION.md` et `public/index.html`. Aucun fichier du dépôt n'a été modifié.

> **Avertissement.** Le panel ci-dessous est **simulé**. Ce sont des personas jouées par des sous-agents IA, pas de vrais clients. Il sert à faire remonter des objections, des segments et des formulations. Il ne prédit pas un taux de conversion : les modèles ont tendance à être complaisants, donc les taux sont un **plafond**. Aucune phrase du panel ne doit servir de témoignage dans une publicité ou sur une fiche store.

---

## Partie 1 : panel consommateurs (founder-consumer)

### 1.1 Protocole

- **Profil client** (`customer.json`) : parents français d'un bébé de 0 à 2 ans, en 5 segments :
  - mère primipare en congé (32 %) ;
  - père en horaires décalés (20 %) ;
  - co-parent séparé en garde alternée (16 %) ;
  - assistante maternelle ou nounou (14 %) ;
  - parent « profil puéricultrice » très organisé (18 %).
- **Comportements d'achat** : 7, dont « essaie tout gratuit, paie rarement », « lit tous les avis », « déjà sur Huckleberry ou le carnet papier », « méfiant sur les données », « suit la sage-femme, la PMI ou Instagram », « épuisé, veut du simple », « paie pour gagner du temps ».
- **Objections** : 8, tirées du contexte et de l'étude concurrents.
- **Plan apparié** : les mêmes 8 personas (seed 2026) voient chaque variante. Les écarts viennent donc du texte, pas du tirage. Les personas sont Tomas (nounou), Isla (parent organisée, lit les avis), Quinn (père en décalé, ne paie jamais), Priya (primipare, ne paie jamais), Dev (garde alternée, déjà sur Huckleberry), Elle (mère d'un bébé dont le père est en décalé, méfiante sur les données), Ravi (primipare épuisée) et Seth (primipare, paie volontiers).
- **Pitch commun** : offre gratuite et Premium exactes au 11/11, prix TTC, mention « pas un dispositif médical ». Seule la **première ligne** change :
  - **A** : « À 3 h du matin, dites-le. SuiviBaby note. »
  - **B** : « Les deux parents, la même page. Sans pub, sans stress. »
  - **C** : « Votre bébé, vos données : hébergées en Europe, jamais revendues. »
  - **D** (angle de la fiche store actuelle) : « Suivi Baby — Suivi bébé intelligent. L'app intelligente pour suivre l'alimentation, le sommeil et la croissance de votre bébé. »
- **Trois questions posées** :
  1. Souscrire Premium ? (variante A, offre actuelle)
  2. Installer et utiliser une semaine ? (variantes A à D), pour tester l'accroche.
  3. Souscrire Premium si Premium inclut le **rapport pédiatre** ? (variante E = accroche B, Premium enrichi du rapport avant chaque examen obligatoire)
- **Volume** : 48 réponses, toutes valides (`panel.py check`). Ce petit échantillon (8 par variante) suffit pour lire des tendances, pas pour trancher au point près.

Fichiers (tous dans `docs/strategie/analyses/`) :
- `customer.json`, `pitch_A.md` à `pitch_E.md`, `pitch_install_A.md` à `pitch_install_D.md` ;
- `panel-v2/A/` (Premium, offre actuelle), `panel-v2/E/` (Premium avec rapport pédiatre), `panel-install/A` à `panel-install/D/`. Chaque dossier contient `results.md`, `answers/` et `briefs/`.
- Le dossier `panel/` est un premier tirage abandonné, dont les âges étaient incohérents (65 ans pour un parent primipare). Il n'a jamais été exécuté et peut être supprimé.

### 1.2 Résultats

| Variante | Question | Oui | Non |
|---|---|---:|---:|
| A (3 h du matin) | Souscrire Premium | **0** | 8 |
| E (accroche B, Premium avec rapport pédiatre) | Souscrire Premium | **0** | 8 |
| A (3 h du matin) | Installer et utiliser 1 semaine | 6 | 2 |
| **B (les deux parents)** | Installer et utiliser 1 semaine | **7** | 1 |
| C (vos données) | Installer et utiliser 1 semaine | 6 | 2 |
| D (« suivi bébé intelligent ») | Installer et utiliser 1 semaine | 6 | 2 |

**Ce qu'il faut retenir**

1. **L'acquisition passe, la monétisation non.** Six à sept personas sur huit installeraient, quelle que soit l'accroche. Aucune ne paierait Premium, ni avec l'offre actuelle ni avec le rapport pédiatre. Le motif dominant est « need » : *« La version gratuite fait déjà tout ce dont j'ai besoin »* (P001, P004, P006, P007, P008 en variante A). Cela confirme le risque déjà identifié dans `CONTEXT.md` : le palier gratuit est plus généreux que chez la plupart des concurrents.
2. **Seule l'accroche B a fait basculer quelqu'un.** Tomas, la nounou, refuse en A, C et D (*« personne de la PMI ni d'Instagram ne me l'a conseillée »*). En B, elle installe : *« une appli gratuite sans pub où je partage avec les parents, ça m'évite les messages WhatsApp »*. Le partage est la raison d'installer la plus citée dans toutes les variantes (P003, P004, P006 et P008 en particulier).
3. **L'accroche C (données) se retourne contre elle chez les méfiants.** Elle n'ajoute aucune installation. Les profils méfiants la lisent comme un slogan : *« je veux lire les permissions et la politique de données avant de croire un slogan »* (Elle, P006). Le message sur la confidentialité doit être une **preuve** (export, suppression, hébergement UE, pas de traceurs), pas un titre.
4. **L'accroche D (« intelligent ») ne fait pas moins bien que A en installation, mais ne différencie rien.** Aucun persona ne cite « intelligent ». C'est aussi un mot à risque depuis le retrait des « AI insights ».
5. **Le rapport pédiatre ne débloque pas l'achat sous sa forme abonnement.** Il est jugé « sympa » (Seth, P008), voire « m'intéresse vraiment » (Isla, P002), mais :
   - *« je peux montrer l'appli sur mon téléphone au médecin »* (Seth, P008) ;
   - *« je ne vais pas payer pour un PDF avant le rendez-vous du 1er mois »* (Ravi, P007) ;
   - *« le rapport pédiatre, c'est pour les parents […], pas pour moi »* (Tomas, la nounou, P001).

**Pourquoi ils ne paient pas (codes de raison, variantes A et E réunies)**

| Raison | Nombre | Formulation type |
|---|---:|---|
| need | 9 | « Je ne vois pas ce que Premium m'apporte. 50 commandes vocales et des PDF, ce n'est pas pour moi. » (Tomas, P001, A) |
| trust | 3 | « Une petite app française que je ne connais pas : sera-t-elle encore là dans un an ? » (Isla, P002, A) |
| price | 3 | « Je n'ai jamais payé un abonnement d'app » (Quinn, P003, E) |
| habit | 2 | « J'ai déjà Huckleberry et mes notes » (Dev, P005) |

**Les autres objections qui reviennent, installation comprise**

- **Pérennité et perte d'historique** (Isla P002, Ravi P007, dans presque toutes les variantes) : *« si je saisis six mois de données et que ça ferme, je perds tout mon historique »*.
- **Prédictions de sommeil comme chez Huckleberry** (Tomas P001, Seth P008) : citées à presque chaque passage.
- **Adoption par l'autre parent** (Dev P005, Seth P008) : *« si l'autre parent n'installe pas l'app, ça ne remplace pas WhatsApp »*.
- **Coût de migration** (Dev P005) : *« tout ressaisir et convaincre l'autre parent »*. Il demande un import Huckleberry.
- **Permissions** (Elle P006, Quinn P003) : micro, données de santé, « qui est derrière ».

**Ce qui ferait changer d'avis (réponses les plus fréquentes)**

1. Des **avis visibles** : une note App Store, des avis récents, des retours dans les groupes de mamans (Isla P002, Ravi P007).
2. Une **recommandation de confiance** : sage-femme, PMI, pédiatre (« un rapport que mon médecin me demande explicitement »), ou des parents qui demandent à la nounou d'utiliser l'app.
3. Un **paiement unique bas, autour de 10 €** (Quinn P003 et Priya P004 en E, Dev P005 en E « à un prix unique très bas », Elle P006 en E « à un petit prix unique ou à l'unité »).
4. Une vraie fonction qui fait gagner du temps : **prédiction de sieste ou de prochaine tétée** (Tomas P001 et Seth P008 en A, Seth P008 en E).
5. Un **export complet des données garanti** si l'app ferme (Isla P002, Ravi P007).
6. L'**import depuis Huckleberry** (Dev P005).

**Prix déclarés pour Premium**

Les unités varient d'une réponse à l'autre (mensuel, annuel, à vie), donc ce sont des ordres de grandeur. Sur les réponses mensuelles :
- « bonne affaire » vers 1,5 à 2 € ;
- « cher mais possible » vers 3 à 5 € ;
- « trop cher » vers 5 à 8 €.

Le prix de **3,99 €/mois** tombe pile sur le seuil « cher ». En annuel, les rares réponses donnent une bonne affaire vers 15 à 20 €, un prix cher vers 30 à 35 € et un prix trop cher vers 50 à 60 €. **29,99 €/an est donc au plafond de l'acceptable.** Pour une analyse Van Westendorp propre, il faudrait reposer la question avec une unité imposée (founder-pricing).

### 1.3 Ce que le panel suggère de changer avant de dépenser quoi que ce soit

Ces pistes relèvent de founder-offer et founder-pricing. Ce sont des hypothèses à valider avec de vrais utilisateurs, pas des décisions.

- **Le problème n'est pas le titre du paywall, c'est le contenu de Premium.** Aucune accroche ne fait payer, parce que Premium ne touche aucune douleur ressentie : 3 commandes vocales et 1 PDF suffisent à la plupart des personas.
- Pistes à tester en vrai, une par une :
  1. Un achat **à vie d'entrée vers 9,99 à 14,99 €**, en plus ou à la place de 79,99 €. Le 79,99 € est jugé risqué face à l'objection « sera-t-elle encore là dans un an ».
  2. Un rapport pédiatre **gratuit 1 ou 2 fois**, puis payant. La valeur se découvre au premier examen (8e jour, 1 mois).
  3. Ce qui fera vraiment payer viendra probablement d'une fonction qui fait gagner du temps chaque jour (widget de saisie rapide, rappel de prochaine tétée, rythme des siestes), pas d'un quota.
- **Gagner la confiance coûte peu et peut se faire tout de suite.** L'export JSON existe déjà. Il faut le dire partout : *« Vos données vous appartiennent : export complet et suppression à tout moment, gratuitement. »* C'est la meilleure réponse à l'objection de pérennité.
- **À corriger dans `docs/STORE_SUBMISSION.md`** (par Yoss, je n'ai rien modifié) :
  - la section Premium promet « Historique illimité » et « Partage famille étendu », qui contredisent l'offre du 11/11 et la PR de conformité #70 ;
  - le sous-titre « Suivi bébé intelligent » est faible et risqué.

---

## Partie 2 : positionnement et marketing (founder-marketing)

### 2.1 Positionnement : trois versions

1. **Recommandée.** Pour les parents qui se relaient auprès d'un nouveau-né (co-parent, nounou, grands-parents) et qui se demandent sans cesse sur WhatsApp « il a bu quand ? », SuiviBaby est le carnet de bord partagé qui se remplit en deux secondes, d'une main ou à la voix, et met tout le monde à jour en temps réel. Contrairement à Huckleberry et aux apps anglo-saxonnes, il est en français, sans pub, et le partage est gratuit et illimité.
   - *Preuves du panel* : meilleure installation (7/8 en B), seule bascule (la nounou), et le partage est la raison d'installer la plus citée.
2. Pour les parents épuisés des premières semaines, SuiviBaby est l'app qu'on remplit à 3 h du matin sans allumer la lumière, en parlant.
   - *Preuves* : 6/8 en installation, la voix est citée par Ravi (P007) et Seth (P008). C'est un bon **second** message, pas l'entrée.
3. Pour les parents qui refusent que les données de leur enfant soient revendues, SuiviBaby est l'app française, hébergée en Europe, sans traceurs.
   - *Preuves* : 6/8, mais perçu comme un slogan par les méfiants. À utiliser comme **réassurance**, pas comme accroche.

### 2.2 Accroche gagnante et proposition de valeur

- **Fiche store, site et réseaux** : « **Les deux parents, la même page.** »
  - Sous-titre App Store proposé (30 caractères max) : « Repas, sommeil, couches à deux » (30 caractères).
  - Variante : « Suivi bébé partagé, à la voix » (29 caractères).
- **Paywall** (il s'adresse à des gens qui ont déjà installé, donc on vend ce que Premium débloque) : garder l'angle A, « **À 3 h du matin, dites-le. SuiviBaby note.** », avec en ligne 2 « Jusqu'à 50 saisies vocales par jour et le rapport pour vos rendez-vous pédiatriques ». Ajouter en pied de paywall la réassurance de C, sous forme de preuve : « Sans pub · Hébergé en Europe · Export et suppression de vos données à tout moment ».
- **Proposition de valeur (une phrase)** : *« Le carnet de bord partagé de votre bébé : notez en deux secondes, d'une main ou à la voix, et toute la famille est à jour, sans pub, avec des données hébergées en Europe. »*

### 2.3 Limites sur les allégations santé

SuiviBaby n'est pas un dispositif médical. Ce n'est pas un avis juridique ; en cas de doute, il faut faire relire.

- **Interdit** : « surveille la santé de bébé », « détecte », « prévient », « alerte en cas de fièvre », « recommandé par les pédiatres », « validé par des sages-femmes » (sauf partenariat réel, écrit et autorisé), « intelligent » au sens diagnostic.
- **Autorisé** : « noter », « garder une trace », « retrouver », « préparer le rendez-vous », « courbes de référence OMS », « à montrer à votre professionnel de santé ».
- Garder la mention « SuiviBaby ne remplace pas l'avis d'un professionnel de santé ; en cas de doute, appelez votre médecin ou le 15 » sur la fiche, le site et le rapport PDF.
- **Influence commerciale** (loi du 9 juin 2023) : toute contrepartie, y compris un code Premium à vie offert, impose la mention « Collaboration commerciale » ou « Publicité ».
- **Avis** : interdiction des faux avis et des avis achetés (pratique commerciale trompeuse). On peut demander un avis, jamais l'acheter ni le conditionner.

### 2.4 Canaux : les 5 à lancer, budget ≈ 0 €

**Plafond d'acquisition.** Un abonné annuel rapporte 21,24 € net. Avec une conversion payante réaliste de 2 à 4 % des installations, une installation vaut environ 0,40 à 0,85 €. **La pub payante n'est pas rentable aujourd'hui** (une installation d'app parentalité coûte couramment plus de 1,5 €). On ne fait donc que de l'organique tant que la conversion n'est pas mesurée.

| # | Canal | Pourquoi il colle au panel | Coût | Signal de réussite |
|---|---|---|---|---|
| 1 | **Parrainage par le partage** (co-parent, nounou, grands-parents) | Le partage est la raison n°1 d'installer, et la nounou ne bascule que si les parents l'invitent | 0 € (une demi-journée de dev sur le message d'invitation) | ≥ 40 % des comptes ont une invitation acceptée en 7 jours ; installations par invitation |
| 2 | **ASO** (App Store et Google Play) | C'est là que les personas qui lisent les avis décident ; les avis manquent aujourd'hui | 0 € | Taux de conversion fiche → installation ; note ≥ 4,6 avec ≥ 30 avis à J+30 |
| 3 | **Sages-femmes libérales, PMI, relais petite enfance (RPE)** | « J'installe ce que conseille la sage-femme ou la PMI » ; c'est aussi la seule bascule de la nounou | 0 € + impression (~20 € pour 200 flyers A6) | Installations avec le code source « sf », « pmi » ou « rpe » ; nombre de professionnelles qui le redistribuent |
| 4 | **Communautés de parents** (groupes Facebook locaux et garde alternée, forums Doctissimo et Magicmaman, WhatsApp de cours de préparation) | Les avis « dans les groupes de mamans » sont la 1re chose qui fait changer d'avis | 0 € (temps) | Clics sur le lien suivi ; débloque aussi les 6 testeurs Play manquants |
| 5 | **Instagram et TikTok organiques** (récit du fondateur, démo de nuit) | Cible qui scrolle pendant les tétées ; la démo vocale se montre mieux qu'elle ne se décrit | 0 € (téléphone) ; micro-créatrices payées en codes à vie, avec mention | Vues ≥ 3 s, profil → store ; installations par lien en bio |

**Ce qu'on ne fait pas, et pourquoi**
- Pas de pub payante (Meta, Apple Search Ads) avant d'avoir mesuré une conversion payante réelle.
- Pas de presse nationale avant d'avoir des avis et un vrai nombre d'utilisateurs.
- Pas de prospection des maternités par la direction : les circuits d'achat hospitaliers sont trop longs ; on passe par les sages-femmes libérales.

### 2.5 Premières actions concrètes, dans l'ordre

1. **Cette semaine, débloquer Google Play** : poster dans 3 groupes de parents (93 et Île-de-France, un groupe garde alternée) un appel honnête « Je suis papa et développeur, je cherche 10 parents pour tester gratuitement mon app de suivi bébé avant sa sortie ». Objectif : ≥ 12 testeurs inscrits depuis 14 jours.
2. **Avant la soumission, refaire la fiche App Store et Play.** Remplacer le sous-titre « Suivi bébé intelligent » par « Repas, sommeil, couches à deux ». Retirer « Historique illimité » et « Partage famille étendu ». Ordonner les captures ainsi :
   1. le partage (« Les deux parents, la même page ») ;
   2. la voix (« À 3 h du matin, dites-le ») ;
   3. la timeline ;
   4. les courbes OMS (« Courbes de référence OMS ») ;
   5. les données (« Export et suppression à tout moment »).

   Mots-clés iOS à tester (100 caractères, sans répéter le nom) : `allaitement,tétée,biberon,sommeil,couche,nounou,garde alternée,co-parent,courbe,croissance,journal`.
3. **Dans l'app**, demander un avis (StoreKit `requestReview` ou In-App Review de Google Play) après 7 jours d'usage et ≥ 20 événements, jamais pendant la nuit. À l'onboarding, mettre « Invitez l'autre parent ou la nounou » avec un message pré-rempli et un lien store suivi (`?ref=invite`).
4. **Professionnelles** : un flyer A6 recto-verso. Recto : « Les deux parents, la même page », avec un QR code. Verso : « Gratuit · sans pub · données en Europe · pas un dispositif médical ». Le déposer chez 20 sages-femmes libérales et dans 3 RPE de Saint-Ouen, Saint-Denis et Paris 17/18. Le formuler comme un outil offert, sans demander de « recommandation officielle ».
5. **Contenu** : trois vidéos courtes de démo, tournées de nuit, lumière tamisée, avec la voix réelle de Yoss :
   - « 3 h 12, biberon de 150 ml » ;
   - « Ma compagne a tout vu sans me réveiller » ;
   - « Le pédiatre m'a demandé combien il boit ».
   Puis contacter 5 micro-créatrices parentalité (2 000 à 20 000 abonnés), en offrant un code Premium à vie avec la mention « Collaboration commerciale ».

### 2.6 Dix accroches (chacune répond à une objection du panel)

| # | Format | Accroche | Objection traitée |
|---|---|---|---|
| 1 | Titre store | Les deux parents, la même page. | « l'autre parent ne va pas l'utiliser » / WhatsApp |
| 2 | Vidéo, 3 s | « Il a bu quand ? » Plus besoin de demander. | messages WhatsApp |
| 3 | Vidéo, 3 s | 3 h du matin. Une main. Une phrase. C'est noté. | « plus de deux gestes, j'abandonne » |
| 4 | Flyer pro | Ce que bébé a bu et dormi depuis le dernier rendez-vous, sur une page. | « le pédiatre demande et je ne sais jamais » |
| 5 | Capture 5 | Vos données vous appartiennent : export et suppression à tout moment. | « sera-t-elle encore là dans un an ? » |
| 6 | Post groupe | Faite à Saint-Ouen par un papa développeur. Pas de pub, pas de revente. | « petite app inconnue, qui est derrière ? » |
| 7 | Post nounou / RPE | Les parents voient le biberon de midi sans vous écrire. | nounou : « les parents doivent s'y mettre aussi » |
| 8 | Post garde alternée | Une semaine chez l'un, une semaine chez l'autre, un seul carnet. | garde alternée, historique éclaté |
| 9 | Paywall | Gratuit pour toujours. Premium si vous parlez plus de 3 fois par jour. | « encore un abonnement » (assumer la générosité) |
| 10 | Bio Instagram | Le carnet de bord partagé de bébé. En français. Sans pub. | « j'ai déjà Huckleberry » (la langue et le partage gratuit) |

### 2.7 Campagne de 30 jours (J = sortie publique sur les stores)

| Jour | Canal | Action et message |
|---|---|---|
| J-14 | Groupes FB, WhatsApp | Appel à testeurs (action 1). Ouvrir @suivibaby sur Instagram et TikTok. |
| J-13 | Instagram, TikTok | Post « pourquoi j'ai créé SuiviBaby » (récit du fondateur, sans allégation santé). |
| J-12 | Dev | Message d'invitation pré-rempli et lien `?ref=invite` ; demande d'avis à J+7 d'usage. |
| J-11 | Reels, TikTok | Vidéo 1 « 3 h 12, biberon de 150 ml » (accroche 3). |
| J-10 | Terrain | Impression des flyers ; liste de 20 sages-femmes et 3 RPE (Doctolib et annuaires publics). |
| J-9 | Store | Nouvelles captures et sous-titre ; correction de la section Premium. |
| J-8 | Reels | Vidéo 2 « Il a bu quand ? » (accroche 2). |
| J-7 | Terrain | Tournée de 10 cabinets de sages-femmes (dépôt de flyers, 2 minutes de présentation). |
| J-6 | Groupes garde alternée | Accroche 8, en demandant les retours des testeurs. |
| J-5 | Créatrices | 5 messages personnalisés, code à vie, mention obligatoire. |
| J-4 | Reels | Vidéo 3 « Le pédiatre m'a demandé… » (accroche 4, sans promesse médicale). |
| J-3 | Terrain | 3 RPE et 10 autres sages-femmes (accroche 7 pour les assistantes maternelles). |
| J-2 | E-mail testeurs | « On sort jeudi : votre avis sur le store aiderait d'autres parents » (demande d'avis libre, sans contrepartie). |
| J-1 | Toutes | Teaser « demain ». |
| **J** | Toutes | Annonce de sortie : lien App Store et Play, accroche 1 ; post dans 5 groupes (avec l'accord des admins). |
| J+1 | Instagram | Carrousel « 5 choses que SuiviBaby ne fait PAS : pas de pub, pas de revente, pas de diagnostic… » (accroche 5). |
| J+2 | TikTok | Démo du partage : deux téléphones côte à côte, mise à jour en temps réel. |
| J+3 | Groupes | Répondre à chaque commentaire, publier la FAQ. |
| J+4 | Instagram | Coulisses : le développement de nuit. |
| J+5 | Terrain | Relance des sages-femmes avec un QR code personnalisé `?ref=sf-<nom>`. |
| J+6 | TikTok | « Ce que la nounou voit de son côté » (accroche 7). |
| J+7 | Bilan | Revue des 3 chiffres (§ 2.9). |
| J+8 | Créatrices | Publication des collaborations (mention). |
| J+9 | Instagram | Question en story : « Qui note quoi chez vous la nuit ? » |
| J+10 | Groupes | Retour honnête sur la première semaine (chiffres réels, aucun faux témoignage). |
| J+11 | TikTok | Vidéo courbes OMS : « courbes de référence, à montrer à votre médecin ». |
| J+12 | Store | Réponse à tous les avis ; itération sur les captures si conversion < 25 %. |
| J+13 | Instagram | Coulisses : correction d'un bug signalé par une maman (avec son accord). |
| J+14 | Bilan | Revue des 3 chiffres ; décider de la suite (pricing et offre). |
| J+15 | Groupes garde alternée | Accroche 8, deuxième vague. |
| J+16 | Toutes | Récapitulatif des 30 jours ; préparer le mois 2. |

**Quand il n'y a rien de neuf** : coulisses, bug corrigé, question au public, « ce que l'app ne fait pas », réponse détaillée à une objection fréquente.

### 2.8 Répartition du budget

| Poste | Argent | Temps par semaine |
|---|---:|---:|
| ASO et avis | 0 € | 2 h |
| Parrainage (dev) | 0 € | 4 h la 1re semaine, puis 0 |
| Professionnelles (flyers) | ~20 € une fois | 3 h |
| Communautés | 0 € | 2 h |
| Réseaux sociaux et créatrices | 0 € (codes à vie offerts, ~10 codes) | 3 h |
| **Total** | **~20 €** | **~10 h par semaine** |

### 2.9 Trois chiffres à suivre chaque semaine

1. **Comptes avec ≥ 1 invitation acceptée dans les 7 jours.** S'il est sous 25 %, revoir le parcours d'invitation : c'est le moteur de la croissance.
2. **Rétention à 7 jours** (au moins une saisie le 7e jour). Sous 30 %, la priorité est le produit (vitesse de saisie, widget), pas le marketing.
3. **Installations → essai ou achat Premium.** Sous 2 % après 300 installations, il faut revoir l'offre (§ 1.3), pas le titre du paywall.

---

## Partie 3 : marque (founder-brand)

### 3.1 Vérification du nom « Suivi Baby »

**Constat**

- Le nom est **descriptif** : « suivi » + « baby », franglais.
- **Points forts** :
  - il est compris immédiatement ;
  - il porte deux mots-clés ASO (« suivi », et « baby » pour les recherches franglaises) ;
  - il tient sur une icône ;
  - le domaine suivibaby.com est déjà utilisé par TESFA.
- **Risques** :
  - **Protection faible.** Un nom purement descriptif est difficile à déposer et à défendre à l'INPI ou à l'EUIPO : refus possible pour défaut de distinctivité, ou protection limitée au logo (marque semi-figurative). N'importe quel concurrent peut aussi s'appeler « Suivi Bébé » ou « BabySuivi ».
  - **Incohérence d'écriture.** « Suivi Baby » sur l'App Store, « SuiviBaby » sur le site, la marque JSON-LD et l'app, « samaye » pour Firebase. Il faut en choisir une : je recommande **« SuiviBaby »** en un mot (plus distinctif, cohérent avec le domaine) et, sur l'App Store, « SuiviBaby : suivi bébé partagé » si la place le permet.
  - **Mélange franglais.** Il est neutre pour la cible française. Il n'est pas gênant.

**Recommandation** : **garder le nom.** Changer de nom avant la sortie coûterait plus cher que ça ne rapporterait, et le nom aide l'ASO. Pour compenser sa faiblesse juridique, il faut :
1. déposer une marque **semi-figurative** (logo + « SuiviBaby ») ;
2. viser à terme une signature distinctive (le slogan) ;
3. réserver les comptes.

**Ce que Yoss doit vérifier lui-même.** Je n'ai lancé aucune recherche : ce qui suit n'est ni vérifié ni un avis juridique. Seul un conseil en propriété industrielle confirme une marque, et rien n'est protégé tant que rien n'est déposé.
- **Marques** :
  - INPI : https://data.inpi.fr (recherche « suivi baby », « suivibaby », « suivi bébé ») ;
  - EUIPO eSearch : https://euipo.europa.eu/eSearch ;
  - TMview : https://www.tmdn.org/tmview.
  - **Classes à vérifier** : 9 (logiciels et applications), 42 (SaaS), 44 (services liés à la santé et au soin, par prudence), 35 (si services de mise en relation).
- **Domaines** : suivibaby.com est déjà détenu. Vérifier aussi suivibaby.fr et suivi-baby.fr pour éviter le squat.
- **Comptes** : @suivibaby sur Instagram, TikTok, X, YouTube et Facebook. Le réserver même sans publier.
- **Confusion avec la concurrence** : aucun concurrent de l'étude (Huckleberry, Baby Daybook, Nara, Glow, Sprout, BabyTime, May) n'a de nom proche. Vérifier tout de même sur les stores les apps « Suivi bébé » génériques.

**Noms alternatifs** (pour mémoire, seulement si le dépôt est refusé) :

| Nom | Style | Ce qu'il dit | Risque |
|---|---|---|---|
| Relais | évocateur | le passage de témoin entre parents | mot courant, difficile à déposer seul |
| Tandem | évocateur | les deux parents ensemble | déjà très utilisé |
| Nuitée | évocateur | les nuits | trop centré sur le sommeil |
| Bibelo | inventé | biberon + journal | sonne comme « bibelot » |
| Carnet Bébé | descriptif | le carnet de santé | même faiblesse que l'actuel |
| Samaye | inventé (nom de projet existant) | rien d'explicite | distinctif, donc protégeable, mais aucune valeur ASO |

### 3.2 Promesse, slogans et ton

- **Promesse en une ligne** : *« Où que vous soyez, vous savez ce que bébé a bu, dormi et fait, sans avoir à demander. »*
- **Slogan, trois options** :
  1. **Les deux parents, la même page.** (recommandé, appuyé par le panel)
  2. À 3 h du matin, dites-le. C'est noté.
  3. Le carnet de bord partagé de bébé.
- **Ton** :

| Adjectif | À faire | À éviter |
|---|---|---|
| **Complice** (parent à parent) | « On sait ce que c'est, 3 h du matin. » ; tutoyer sur les réseaux, vouvoyer dans l'app et sur le store | La condescendance, le ton « coach », la culpabilisation (« vous devriez noter chaque tétée ») |
| **Sobre et précis** | Des chiffres concrets (« 2 secondes », « 150 ml ») ; des verbes simples (noter, partager, retrouver) | « Intelligent », « révolutionnaire », « IA » ; tout vocabulaire médical de diagnostic |
| **Transparent** | Dire ce que l'app ne fait pas ; dire qui est derrière (un papa développeur, une société française) | Les promesses invérifiables (« 100 % sécurisé »), les faux chiffres d'utilisateurs, « recommandé par… » |

**Avant / après** (première ligne de la fiche store) :
- *Avant* : « Suivi Baby — L'app intelligente pour suivre l'alimentation, le sommeil et la croissance de votre bébé. »
- *Après* : « Les deux parents, la même page. Notez tétées, biberons, sommeil et couches en deux secondes, d'une main ou à la voix, et toute la famille est à jour. Sans pub, données hébergées en Europe. »

### 3.3 Charte visuelle (brief, à partir de l'existant `constants/theme.ts`)

| Rôle | Couleur | Usage | Contraste (WCAG) |
|---|---|---|---|
| Couleur principale | `#0A7EA4` (bleu canard actuel) | Boutons, liens, accent de marque | Blanc sur `#0A7EA4` : 4,63:1, conforme AA pour le texte normal |
| Nuit | `#111827` | Mode nuit, fonds des vidéos | Texte `#F9FAFB` dessus : 16,98:1 |
| Chaleur (corail) | `#E8785A` | Illustrations, pastilles, fond d'icône ; **jamais pour du texte sur blanc** (2,89:1, non conforme) | Texte `#1F2937` sur corail : 5,08:1 ; corail sur `#111827` : 6,14:1. Pour du texte corail sur blanc, utiliser `#B9532F` (4,84:1) |

- **Typographies** (gratuites, licence SIL OFL, Google Fonts) :
  - titres : **Nunito** (arrondie, chaleureuse, lisible sur une icône) ;
  - texte : **Inter**, ou la police système de l'app (SF Pro, Roboto) pour ne rien ajouter au poids de l'app.
  - Ne pas utiliser de police sans licence.
- **Brief du logo** :
  - il doit évoquer le **lien et le relais** (deux traits ou deux bulles qui se rejoignent, une lune discrète pour la nuit), pas un bébé ni un biberon (tout le monde le fait) ;
  - il doit rester lisible en **32 px** (icône), en monochrome (flyer N&B), sur fond nuit et fond clair ;
  - à éviter : la croix médicale, le stéthoscope, le cœur ECG (connotation de dispositif médical), le cercle bleu et le visage de bébé de Huckleberry, le dégradé rose de Glow.
  - Les concepts générés par un outil d'image seraient des **concepts**, pas un logo fini.
- **Les cinq premiers points de contact** :
  1. **Page store et site** : titre « Les deux parents, la même page », capture du partage en premier, bandeau « Sans pub · Europe · Export à tout moment ».
  2. **« Emballage »** = l'onboarding : 3 écrans maximum, le 2e propose d'inviter l'autre parent ou la nounou, et on autorise le micro seulement au premier usage de la voix (répond aux méfiants).
  3. **Confirmation** (après la première saisie ou l'achat) : « C'est noté. [Prénom] le voit aussi. », et pour Premium un reçu clair avec la date de renouvellement et la façon de résilier.
  4. **Premier post** : le récit du fondateur, pourquoi un papa développeur de Saint-Ouen a créé l'app, une photo sans visage de bébé, aucune allégation santé.
  5. **Réponse à la première plainte** (modèle) : *« Merci de l'avoir signalé, et désolé pour la nuit gâchée. Je suis Yoss, je développe SuiviBaby seul : je regarde ça aujourd'hui et je vous réponds ici dès que c'est corrigé. Vos données ne sont pas perdues : vous pouvez les exporter à tout moment depuis Réglages. »*

---

## Prochaines étapes suggérées

1. **founder-offer et founder-pricing** : repenser le contenu de Premium et tester un achat à vie bas (vers 9,99 à 14,99 €). C'est l'enseignement principal du panel, avant même le marketing.
2. **Valider avec de vrais parents** : une page avec prix (ou les 12 testeurs Play) à qui l'on pose « paieriez-vous ? », avec un vrai lien d'achat dès que RevenueCat est branché.
3. Corriger la fiche store (sous-titre, section Premium) avant la soumission Apple.
