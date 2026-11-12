# SuiviBaby — Plan de mise sur le marché v2 (12/11/2026)

> Méthodes suivies : founder-brand, founder-marketing, founder-launch, founder-ops (SKILL.md lus et appliqués).
> Base : `v2-offers.md` (architecture A retenue comme favorite), `CONTEXT.md`, `FEATURE_MAP.md`, `consumer-brand-marketing.md`, `launch-ops.md`, `RECRUTEMENT_ET_SONDAGE.md`, `../UI_UX_AUDIT.md`. Lecture seule de `app.json`, `docs/STORE_SUBMISSION.md` et `public/index.html` pour vérifier l'orthographe du nom.
> **Le dépôt n'a pas été modifié.** Ce plan remplace le calendrier de `launch-ops.md` §0 et §2. Les routines de `launch-ops.md` §4 (support, avis, monitoring, fiscalité) restent valables, sauf mention contraire.
> Ce n'est ni un avis juridique, ni un avis comptable. Les points marqués **[à confirmer]** doivent être vérifiés à la source officielle ou auprès d'un professionnel. Le panel cité est **simulé** : il ne sert jamais de témoignage.

---

## 0. En bref

| Sujet | Décision proposée |
|---|---|
| Orthographe | **« SuiviBaby »** en un mot partout (icône, stores, site, CGU, e-mails). « Suivi Baby » disparaît, « SuiviBaby+ » et « Suivi Enfant » aussi |
| Signature de marque | **« Notez à deux, arrivez prêts. »** Le gratuit fait installer (le partage), le payant fait payer (l'examen préparé) |
| Accroche store | « Les deux parents, la même page. » (validée par le panel : 7 sur 8 installent) |
| Nom du payant | **Premium**, présenté comme « SuiviBaby Premium — prêt pour chaque examen ». Offre de lancement : « Offre Fondateurs » |
| Canaux (0 €) | 1. Boucle de partage gratuite · 2. ASO et avis · 3. Sages-femmes libérales, PMI, RPE · 4. Groupes de parents · 5. Vidéos courtes |
| **Lancement public** | **Le 5/1/2027 ne tient plus.** Nouvelle date : **mardi 2/2/2027** (repli : mardi 16/2). Soft launch payant : **jeudi 7/1/2027** |
| Pourquoi | On ajoute ≈ 41 à 44 jours de développement au total (socle commun 15-20 j + A 16 j + UI/UX ≈ 5 j + invitation et avis 1,5 j), dont ≈ 30,5 j avant le soft launch, alors que l'ancien plan n'en comptait que 5. L'essai de 14 jours impose ensuite au moins 3 semaines de soft launch pour lire une conversion, et la période des fêtes bloque les soumissions |
| Chemin critique | Le **développement** (≈ 30,5 j avant le soft launch), et non plus l'administratif. Apple, Google et le médiateur ont maintenant 3 à 5 semaines de marge, à condition d'être lancés cette semaine |
| Promesse testeurs | « Premium offert à vie » = le niveau Premium individuel, avec ce qui y sera ajouté, voix au plafond des abonnés (30/jour), sur un compte, tant que le service existe (§3) |
| 100 premiers utilisateurs | Fin janvier 2027, à la fin du soft launch |
| 100 premiers payants | Vers **fin septembre 2027** si 4 à 5 % des inscrits paient. À 2 %, pas avant 2028. Dit honnêtement : ≈ 85 payants, c'est le seuil où la SASU est couverte |

---

## 1. Marque (founder-brand)

### 1.1 Orthographe : « SuiviBaby » ou « Suivi Baby » ?

**Constat (vérifié dans le dépôt) :**
- `app.json` : `"name": "Suivi Baby"`, c'est le nom affiché sous l'icône.
- `docs/STORE_SUBMISSION.md` : « Suivi Baby » (App Store), « Suivi Baby - Suivi bébé » (Play).
- `public/index.html` : « SuiviBaby » (18 fois), domaine et identifiants `suivibaby`.
- Dans l'app, l'audit UI relève aussi « SuiviBaby+ », « Suivi Enfant » et « Samaye » (`UI_UX_AUDIT.md` P2-7).

**Décision recommandée : « SuiviBaby » en un mot.**
- C'est plus distinctif, donc plus défendable dans un dépôt semi-figuratif. Un nom en deux mots descriptifs (« suivi » + « baby ») a peu de chances d'être protégé seul.
- C'est cohérent avec le domaine, les identifiants (`com.tesfa.suivibaby`) et le site.
- Sous l'icône, 9 caractères tiennent sans troncature.

**Coût ASO et parade.** Apple découpe mal un mot collé : « SuiviBaby » ne remonte pas forcément sur la recherche « suivi baby ». On compense dans le champ Nom, qui est le plus indexé : **« SuiviBaby : suivi bébé partagé »** (30 caractères, la limite). On ajoute aussi « baby » dans les mots-clés.

**Mise en œuvre (Claude, dans le socle de nettoyage, ≈ 0,3 j) :**
- constante `APP_NAME` ;
- `app.json` `name` → « SuiviBaby » ;
- remplacer les variantes dans l'app (onboarding, réglages, titre de secours) ;
- fiches stores.

Le nom App Store ne change qu'avec une nouvelle version soumise : on le fait avec la version du soft launch.

**Ce que Yoss doit vérifier (je n'ai lancé aucune recherche, et ceci n'est pas un avis juridique) :**
- INPI ([data.inpi.fr](https://data.inpi.fr)), EUIPO ([eSearch](https://euipo.europa.eu/eSearch)), [TMview](https://www.tmdn.org/tmview) : « suivibaby », « suivi baby », « suivi bébé », ainsi que la signature « Notez à deux, arrivez prêts ».
- Classes à vérifier : 9 (application), 42 (SaaS), 44 (par prudence, services liés à la santé et au soin).
- Dépôt : marque semi-figurative (logo + « SuiviBaby ») à l'INPI. Tarif en ligne annoncé : environ 190 € pour une classe, puis environ 40 € par classe supplémentaire **[à confirmer sur inpi.fr]**. Un conseil en propriété industrielle confirme la disponibilité. Rien n'est protégé avant le dépôt.
- Domaines suivibaby.fr et suivi-baby.fr ; comptes @suivibaby sur Instagram, TikTok, YouTube, Facebook et X, à réserver cette semaine même sans publier.

### 1.2 Promesse, signature, slogans

La nouvelle offre a deux moteurs, et la marque doit porter les deux sans les mélanger :
- **le gratuit fait venir** : tout le monde note au même endroit (partage illimité) ;
- **Premium fait payer** : on arrive prêt à chaque examen, et on sait quand viendra la prochaine tétée.

**Promesse en une ligne** (ce que le parent peut attendre à chaque fois) :
> « Toute la famille note au même endroit, et vous arrivez à chaque examen avec tout ce que le pédiatre va demander. »

**Signature, trois options :**
1. **« Notez à deux, arrivez prêts. »** (recommandée) : 28 caractères, elle couvre le gratuit et le payant, et elle est assez construite pour être déposable, contrairement à un descriptif.
2. « Les deux parents, la même page. » : reste l'**accroche d'installation** (titre de fiche, flyer, première capture). C'est la mieux validée par le panel, mais elle ne dit rien du payant.
3. « Prêts pour chaque examen. » : réservée au **paywall** et à la page Premium.

Règle d'usage : la fiche store et les réseaux ouvrent sur 2. Le paywall ouvre sur 3. Le logo, le site et le flyer signent avec 1.

### 1.3 Nom du niveau payant

| Option | Pour | Contre | Verdict |
|---|---|---|---|
| **Premium** | Déjà dans le code (entitlement RevenueCat `premium`, groupe d'abonnements, paywall de la PR #70). Compris de tous. Aucun coût de changement | Banal : le panel disait « Premium ne m'apporte rien » | **Retenu**, mais toujours accompagné du résultat : « Premium — prêt pour chaque examen » |
| Plus | Court | C'est le nom du niveau de Huckleberry : à éviter (règle : ne pas copier un concurrent) | Écarté |
| Pro | Court | Laisse croire que c'est pour les professionnels (nounous, crèches) | Écarté |
| Famille | Parlant | Réservé à l'évolution C (Premium partagé par tous les aidants), à garder pour plus tard | Gardé pour un niveau supérieur éventuel |
| Sérénité, Zen… | Émotionnel | Allégation implicite de santé ou de bien-être, difficile à tenir | Écarté |

À retirer : « SuiviBaby+ » dans l'app. L'offre de lancement s'appelle **« Offre Fondateurs »** : prix bloqué tant que l'abonnement reste actif, achat à vie à 49,99 € **uniquement** jusqu'au dimanche 4/4/2027 à 23 h 59, sans prix barré.

### 1.4 Ton

On garde les trois adjectifs de `consumer-brand-marketing.md` §3.2 (**complice, sobre et précis, transparent**). Un ajout pour Premium :

| Adjectif | À faire | À éviter |
|---|---|---|
| **Utile, pas inquiétant** (nouveau, pour l'examen et les prédictions) | « Ce que le pédiatre va vous demander, sur une page. » ; « Estimation à partir de vos saisies. » | « Ne ratez plus rien de la santé de bébé », « soyez rassurés », « détecte », tout ce qui joue sur la peur |

**Avant / après (paywall) :**
- *Avant* (offre du 11/11) : « À 3 h du matin, dites-le. SuiviBaby note. Jusqu'à 50 saisies vocales par jour et le rapport pour vos rendez-vous pédiatriques. »
- *Après* : « **Prêts pour chaque examen.** Le rapport pour le pédiatre à chaque rendez-vous, la préparation de la visite, l'estimation de la prochaine tétée et de la prochaine sieste, et la voix jusqu'à 30 fois par jour. 14 jours d'essai, résiliable en deux touches. »
- Pied de paywall (preuves, pas slogan) : « Sans pub · Hébergé en Europe · Export et suppression de vos données à tout moment · Pas un avis médical ».

### 1.5 Angle de la fiche store

**App Store**

| Champ | Contenu proposé | Taille |
|---|---|---|
| Nom | SuiviBaby : suivi bébé partagé | 30/30 |
| Sous-titre | Repas, sommeil, couches à deux | 30/30 |
| Mots-clés | `baby,allaitement,tétée,biberon,sommeil,couche,nounou,pédiatre,examen,croissance,co-parent,sieste` | 96/100 |
| Texte promotionnel (modifiable sans revue) | « Nouveau : le calendrier des examens obligatoires, et un rapport clair à montrer au pédiatre. » | — |
| 1ʳᵉ ligne de description | « Les deux parents, la même page. Notez tétées, biberons, sommeil et couches en deux secondes, d'une main ou à la voix, et toute la famille est à jour. Le prochain examen arrive ? SuiviBaby vous prévient et prépare la page à montrer au pédiatre. Sans pub, données hébergées en Europe. » | — |

**Google Play**
- Titre : identique au nom App Store (30 caractères).
- Description courte (80 caractères max) : « Notez repas, sommeil et couches à deux, à la voix. Prêts pour chaque examen. » (76).

**Ordre des captures (iPhone 6,9", Android téléphone) :**
1. Partage : « Les deux parents, la même page » (deux téléphones, même journée).
2. Voix : « 3 h du matin. Une phrase. C'est noté. »
3. Calendrier des examens (gratuit) : « L'examen du 2ᵉ mois, dans 5 jours. »
4. Rapport (1 gratuit, puis Premium) : « Ce que le pédiatre va demander, sur une page. »
5. Prédictions (étiquette Premium visible) : « Prochaine tétée : vers 14 h 30 (estimation). »
6. Données : « Export et suppression à tout moment. Hébergé en Europe. »

À retirer de `docs/STORE_SUBMISSION.md` : « Historique illimité », « Partage famille étendu », « intelligent » (P0 de `v2-offers.md` §4.4). Toute capture doit montrer l'interface **après** les correctifs P0 de l'audit UI (contraste en sombre), donc pas avant mi-décembre.

### 1.6 Identité visuelle : ce qui change

La charte de `consumer-brand-marketing.md` §3.3 reste valable (bleu `#0A7EA4`, nuit `#111827`, corail `#E8785A` jamais en texte sur blanc ; Nunito et Inter, licence OFL ; logo « lien et relais », sans croix médicale ni stéthoscope).

Deux ajouts :
- **La marque, c'est aussi le mode nuit.** On vend « 3 h du matin » : un bouton « Ajouter » à 2,5:1 de contraste en sombre ou un flash gris clair dans une modale contredisent la marque. Les 5 P0 de l'audit UI sont donc des corrections **de marque**, pas de la finition.
- **Les cinq premiers points de contact, mis à jour pour A :**
  1. Fiche store et site : « Les deux parents, la même page », capture du partage, bandeau de preuves.
  2. Onboarding : 3 écrans au plus ; le 2ᵉ invite l'autre parent ; le micro n'est demandé qu'au premier usage de la voix ; la date de naissance déclenche le **calendrier des examens**.
  3. Confirmation : « C'est noté. Léa le voit aussi. » Après achat, un reçu clair avec la date de renouvellement et la façon de résilier.
  4. Premier rappel d'examen (J-3) : « L'examen du 2ᵉ mois approche. Votre rapport est prêt à préparer (1 offert). » C'est le moment de vérité de Premium.
  5. Réponse à la première plainte : modèle de `consumer-brand-marketing.md` §3.2, inchangé.

---

## 2. Marketing (founder-marketing)

### 2.1 Positionnement

1. **Recommandée.** Pour les parents qui se relaient auprès d'un bébé de 0 à 2 ans (co-parent, nounou, grands-parents), qui se demandent sans cesse « il a bu quand ? » et ne savent jamais quoi répondre au pédiatre, SuiviBaby est le carnet de bord partagé qui se remplit en deux secondes, à la voix si besoin, et qui prépare chaque examen obligatoire. Contrairement à Huckleberry et aux apps anglo-saxonnes, il est en français, sans pub, le partage est gratuit et illimité, et il suit le calendrier des examens du carnet de santé français.
   - *Preuves* : le partage est la raison d'installer la plus citée par le panel (7/8 en B). Personne ne vend la préparation aux examens français (`v2-offers.md` §2, point 6). Prédictions et rapport demandés par le panel.
2. Pour les parents épuisés des premières semaines, l'app qu'on remplit à 3 h du matin sans allumer la lumière. *Second message, celui des vidéos.*
3. Pour les parents attentifs à leurs données, l'app française hébergée en Europe, sans traceurs. *Message de réassurance, jamais en accroche* (le panel le lit comme un slogan).

### 2.2 Les 5 canaux, avec premières actions et cibles hebdomadaires

**Plafond d'acquisition.** Un payant rapporte environ 23,8 € nets sur sa durée de vie (`v2-offers.md` §8). À 4,8 % de conversion, un inscrit vaut environ 1,1 €. Il coûte environ 0,5 € de service gratuit (0,04 € × 12,5 mois). Il reste donc **environ 0,6 € par inscrit**, alors qu'une installation payante dans la parentalité coûte couramment plus de 1,5 €. **Aucune publicité payante** tant qu'une conversion réelle n'est pas mesurée.

**Suivi des sources** (préalable, Claude, 0,5 j) :
- liens de campagne App Store Connect (`?pt=<id fournisseur>&ct=sf-dupont`) ;
- `referrer=utm_source%3D…` sur Google Play ;
- un événement d'analytics interne « source » à l'inscription (déjà prévu dans le socle analytics).

| # | Canal | Première action (qui, quand) | Cible hebdomadaire | Signal « changer quelque chose » |
|---|---|---|---|---|
| 1 | **Boucle de partage gratuite** | **C, avant le soft launch (1 j)** : à l'onboarding, écran « Invitez l'autre parent ou la nounou » avec un message prérempli (WhatsApp, SMS) contenant le lien `suivibaby.com/invite` (page existante) → store + code de partage ; `ref=invite`. *Limite actuelle : l'invitation par e-mail suppose que l'invité ait déjà l'app (`FEATURE_MAP.md` §1.6). Le lien doit donc passer par le store.* | ≥ 40 % des nouvelles familles avec au moins une invitation acceptée sous 7 jours ; ≥ 0,6 compte invité par famille | < 25 % → revoir le parcours d'invitation avant tout autre canal |
| 2 | **ASO et avis** | C, semaine du 14/12 : nom, sous-titre, mots-clés, 6 captures (§1.5). C, avant le soft launch (0,5 j) : demande d'avis native après 7 jours d'usage et ≥ 20 saisies, jamais la nuit. J-2 : e-mail aux testeurs pour demander un avis libre, sans contrepartie | Après le lancement : +5 avis par semaine ; note ≥ 4,6 ; conversion fiche → installation ≥ 25 % | Conversion < 20 % → refaire la capture 1 ; note < 4,3 → lire chaque avis négatif |
| 3 | **Sages-femmes libérales, PMI, relais petite enfance (RPE, ex-RAM)** | Y, à partir du 25/1, une fois le soft launch stable **et** le contenu santé relu (§2.9) : flyer A6 v2 « Le prochain examen, sans rien oublier » + QR personnalisé `ref=sf-<nom>`. Liste de 30 sages-femmes libérales (annuaire Ameli, Doctolib) et de 3 RPE (Saint-Ouen, Saint-Denis, Paris 17ᵉ et 18ᵉ). C : liste, flyer, e-mail type. **PMI** : service du Département, pas de démarche commerciale ; demander l'autorisation de déposer une information, sans jamais suggérer une recommandation | 5 contacts par semaine, dont 2 qui acceptent de déposer des flyers ; dès mars, 10 installations par semaine depuis `sf-*` | 0 installation `sf-*` après 20 dépôts → changer le message (calendrier gratuit plutôt que rapport) |
| 4 | **Groupes de parents** (Facebook locaux, garde alternée, « bébés de [mois] 2026 », WhatsApp des cours de préparation, Doctissimo, Magicmaman) | **Y, dès cette semaine**, pour les testeurs (§4.6), avec l'accord des admins. Soft launch : 2 ou 3 groupes choisis. Lancement : 5 groupes le jour J | 2 posts par semaine (1 au lancement, puis une réponse aux questions) ; 15 installations par semaine | Si un post rapporte < 3 installations, changer de groupe, pas de message |
| 5 | **Vidéos courtes** (Reels, TikTok, Shorts), puis micro-créatrices | Y réserve les comptes cette semaine. C écrit 6 scripts d'ici le 18/12. Y tourne de nuit, en lumière tamisée, voix réelle, sans visage de bébé. Publication dès le 4/1, 2 par semaine. Micro-créatrices (2 000 à 20 000 abonnés) seulement après le lancement, avec un code Premium à vie et la mention « Collaboration commerciale » | 2 vidéos par semaine ; 1 000 vues par semaine au 1ᵉʳ mois ; ≥ 1 % de visites du profil vers le store | < 300 vues par vidéo sur 4 vidéos → changer les 3 premières secondes, pas le sujet |

**Ce qu'on ne fait pas, et pourquoi :**
- pas de pub Meta ni Apple Search Ads avant une conversion mesurée ;
- pas de presse nationale avant d'avoir des avis ;
- pas de démarche auprès des directions de maternité (cycles d'achat trop longs) ;
- pas de services payants de testeurs (risque de refus Google) ;
- pas de message privé à des inconnus (démarchage).

### 2.3 Les 100 premiers utilisateurs (d'ici fin janvier 2027)

Un « utilisateur » = un compte qui a créé un enfant et fait au moins une saisie. On compte les testeurs et les comptes invités (co-parents, nounous).

| Semaine (fin) | Cumul visé | D'où ils viennent |
|---|---:|---|
| dim. 22/11 | 15 | ≥ 12 testeurs Android inscrits (6 aujourd'hui) + testeurs TestFlight |
| dim. 6/12 | 22 | 20 testeurs Android (marge), dont ≥ 8 vrais parents |
| dim. 20/12 | 28 | Co-parents des testeurs invités via le nouveau parcours d'invitation |
| dim. 10/1 | 40 | Soft launch (7/1) : premier cercle iOS et Android, 2 groupes choisis |
| dim. 17/1 | 55 | 3ᵉ groupe ; les invitations font ≈ 1/3 des nouveaux comptes |
| dim. 24/1 | 75 | Groupes garde alternée ; 2 premières vidéos |
| dim. 31/1 | **100** | Entourage, vidéos, invitations |

Si l'on est sous 60 le 24/1, ce n'est pas grave pour la décision (le soft launch mesure des **taux**), mais il faut alors repousser la lecture de conversion d'une semaine (repli au 16/2).

### 2.4 Les 100 premiers payants (honnêtement : vers fin septembre 2027)

**Hypothèses** : 4 à 5 % des inscrits finissent payants (cohérent avec `v2-offers.md`, **non mesuré**). Le paiement arrive environ 14 jours après l'inscription (durée de l'essai). On compte les payants actifs, achat à vie compris, testeurs exclus.

| Période | Inscrits par semaine | Nouveaux payants par semaine | Cumul de payants (fin de période) |
|---|---:|---:|---:|
| Soft launch (7/1 → 31/1) | 15 à 25 | 0 à 1 | **≥ 3** (ligne de succès §4.3) |
| Semaine du lancement (2/2) | 150 | 1 | 4 |
| Février (3 semaines suivantes) | 70 à 80 | 2 à 3 | 12 |
| Mars, avec la fin de l'Offre Fondateurs le 4/4 qui crée une vraie échéance | 60 | 3 à 4 | 28 |
| Avril → juin | 55 à 60 | 2 à 3 | 60 |
| Juillet → septembre | 55 à 65 | 3 | **≈ 100** |

**Repères de rentabilité** (net par payant ≈ 1,6 €/mois après coût de service, mix 40 % mensuel, 50 % annuel, 10 % à vie) :
- ≈ 15 payants couvrent l'infra et la voix ;
- ≈ 85 couvrent les 129 € de frais fixes, SASU comprise.

**Si la conversion réelle est de 2 %**, il faut deux fois plus d'inscrits : 100 payants arriveraient en 2028. La revue J+30 (4/3) doit alors trancher entre l'offre (passer à C, revoir le contenu) et le volume (canal 3 en grand).

### 2.5 Dix accroches (chacune répond à une objection)

| # | Format | Accroche | Objection traitée |
|---|---|---|---|
| 1 | Titre store | Les deux parents, la même page. | « L'autre parent n'utilisera pas l'app » |
| 2 | Vidéo, 3 s | « Il a bu quand ? » Plus besoin de demander. | Les messages WhatsApp |
| 3 | Vidéo, 3 s | 3 h du matin. Une main. Une phrase. C'est noté. | « Plus de deux gestes, j'abandonne » |
| 4 | Vidéo, 3 s | « Combien il boit par jour ? » Le pédiatre demande, vous avez la page. | « Je ne sais jamais quoi répondre au rendez-vous » |
| 5 | Flyer pro | Le prochain examen, sans rien oublier. Calendrier gratuit, rapport à montrer. | « Pourquoi une sage-femme en parlerait ? » |
| 6 | Paywall | Le premier rapport est offert. Les suivants, avec Premium. | « Je ne vais pas payer pour un PDF » |
| 7 | Capture 6 | Vos données vous appartiennent : export et suppression à tout moment. | « Sera-t-elle encore là dans un an ? » |
| 8 | Post groupe | Faite à Saint-Ouen par un papa développeur. Pas de pub, pas de revente. | « Petite app inconnue, qui est derrière ? » |
| 9 | Post garde alternée | Une semaine chez l'un, une semaine chez l'autre, un seul carnet. | L'historique éclaté |
| 10 | Paywall, ligne 3 | Prochaine tétée vers 14 h 30 : une estimation tirée de vos saisies. | « Je veux des prédictions comme Huckleberry » |

Le partage reste gratuit et le paywall le dit : « Le partage restera toujours gratuit. »

### 2.6 Campagne de 30 jours autour du lancement (J = mardi 2/2/2027)

| Date | Canal | Action et message |
|---|---|---|
| mar. 19/1 (J-14) | Instagram, TikTok | Récit du fondateur : « Pourquoi j'ai fait SuiviBaby » (aucune allégation santé) |
| jeu. 21/1 | Vidéo | Accroche 3 « 3 h du matin » |
| lun. 25/1 | Terrain | Premiers dépôts de flyers v2 chez 5 sages-femmes, liste des RPE |
| mar. 26/1 | Vidéo | Accroche 4 « Combien il boit par jour ? » |
| jeu. 28/1 | Groupes garde alternée | Accroche 9, avec appel aux retours du soft launch |
| ven. 29/1 | Créatrices | 5 messages personnalisés, code Premium à vie, mention obligatoire expliquée |
| dim. 31/1 (J-2) | E-mail testeurs | « On sort mardi : un avis sur le store aiderait d'autres parents » (libre, sans contrepartie) |
| lun. 1/2 (J-1) | Tous | Revue go / no-go (§4.3), teaser « demain » |
| **mar. 2/2 (J)** | Tous | Annonce : liens stores, accroche 1, Offre Fondateurs datée (fin le 4/4) ; 5 groupes avec l'accord des admins ; LinkedIn |
| mer. 3/2 | Instagram | Carrousel « Ce que SuiviBaby ne fait pas : pas de pub, pas de revente, pas de diagnostic » |
| jeu. 4/2 | TikTok | Deux téléphones côte à côte : le partage en temps réel |
| ven. 5/2 | Groupes | Réponses à chaque commentaire, FAQ publiée |
| lun. 8/2 | Terrain | 5 nouvelles sages-femmes, relance des premières avec leur QR |
| mar. 9/2 (J+7) | Bilan | Revue des 3 chiffres (§2.8) |
| jeu. 11/2 | Vidéo | « Ce que la nounou voit de son côté » (accroche 1, version nounou) |
| lun. 15/2 | Créatrices | Publications des collaborations (mention « Collaboration commerciale ») |
| mar. 16/2 (J+14) | Bilan | Premiers essais arrivés à terme : conversion réelle |
| jeu. 18/2 (J+16) | Tous | Retour honnête sur 2 semaines (vrais chiffres) ; plan de mars : relance Offre Fondateurs à J-30, J-7 et J-1 avant le 4/4 |

**Quand il n'y a rien de neuf** : coulisses, bug corrigé (avec accord de la personne), question en story, « ce que l'app ne fait pas », réponse détaillée à une objection.

### 2.7 Budget

| Poste | Argent | Temps Yoss par semaine |
|---|---:|---:|
| Boucle de partage, ASO | 0 € (développement Claude) | 1 h (relecture) |
| Flyers A6 (200 exemplaires) | ≈ 20 € | 2 h (terrain, à partir de fin janvier) |
| Groupes de parents | 0 € | 1 h 30 |
| Vidéos | 0 € (téléphone) | 1 h 30 (tournage) |
| Créatrices | 0 € (≈ 10 codes à vie, coût de service ≈ 3 €/mois) | 30 min |
| **Total** | **≈ 20 €** | **≈ 6 à 7 h** (au lieu des 10 h de la v1 : le temps de développement est plus élevé) |

Hors marketing, mais à prévoir : dépôt INPI ≈ 190 à 270 € **[à confirmer]**, relecture santé (§2.9) 0 à 300 €.

### 2.8 Trois chiffres à suivre chaque lundi

1. **Familles avec au moins une invitation acceptée sous 7 jours** : cible ≥ 40 %, alerte < 25 %.
2. **Rétention J7** (au moins une saisie au 7ᵉ jour) : cible ≥ 35 %, alerte < 20 % → priorité au produit (saisie, onboarding), pas au marketing.
3. **Inscrits → essai ou payant à J30** : cible ≥ 4 %, alerte < 2 % après 300 inscrits → revoir l'offre. Indicateur avancé : nombre de « préparer la visite » par utilisateur actif.

### 2.9 Limites des allégations santé (A les rend plus sensibles)

Ce n'est pas un avis juridique. En cas de doute, faire relire.

- **Interdit** : « surveille », « détecte », « prévient », « alerte en cas de fièvre », « améliore le sommeil », « recommandé ou validé par des pédiatres ou des sages-femmes » (sauf partenariat réel, écrit et autorisé), « conforme au carnet de santé » sans source, « intelligent » au sens diagnostic.
- **Autorisé** : « noter », « garder une trace », « préparer le rendez-vous », « à montrer à votre professionnel de santé », « examens obligatoires du carnet de santé (source : ministère de la Santé) », « courbes de référence OMS », « estimation à partir de vos saisies ».
- **Prédictions** : toujours une **fourchette**, le volume de données utilisé, et « estimation, pas un avis médical ». Jamais de chiffre présenté comme une norme.
- **Kit examen** : calendrier et check-list repris du carnet de santé officiel, **sourcés et datés**, sans interprétation. Une relecture par un professionnel (sage-femme ou pédiatre) est requise **avant** toute démarche auprès des sages-femmes. Elle couvre aussi les seuils d'alerte de température (`v2-offers.md` §4.4 P1) et les écarts de poids affichés en rouge (`UI_UX_AUDIT.md` P1-20, à corriger).
- **Mention permanente** (fiche, site, rapport PDF) : « SuiviBaby ne remplace pas l'avis d'un professionnel de santé. En cas de doute, appelez votre médecin ou le 15. »
- **Influence commerciale** (loi du 9 juin 2023) : un code Premium à vie offert à une créatrice est une contrepartie, d'où la mention « Collaboration commerciale » obligatoire.
- **Avis** : on peut en demander, jamais les acheter ni les conditionner. La promesse testeurs (§3) n'est **jamais** liée à un avis.
- **Offre Fondateurs** : date de fin affichée et réellement tenue (pas de fausse urgence) ; pas de prix de référence fictif.

---

## 3. Promesse « Premium offert à vie aux testeurs » : définition

### 3.1 Pourquoi la préciser

Le message actuel (« les testeurs auront Premium offert à vie au lancement ») est ambigu. Quel Premium ? Pour combien de comptes ? La voix est-elle illimitée ? Que veut dire « à vie » si l'app ferme ? Une promesse floue faite à des parents qui nous rendent service est le pire départ possible pour une marque « transparente ». Elle doit tenir en 6 lignes et coûter un montant borné.

### 3.2 Définition (à publier telle quelle sur `suivibaby.com/testeurs` et dans les CGU)

**« Premium testeur, offert à vie » : ce que c'est, en 6 points**

1. **Qui** : toute personne inscrite au test SuiviBaby (test fermé Android via le groupe ou la liste, ou TestFlight sur iPhone) **avant le mercredi 6 janvier 2027**, qui reste inscrite au moins **14 jours** et utilise l'app au moins **3 jours différents**. Aucun avis, note ou publication n'est demandé, ni pris en compte.
2. **Quoi** : le niveau **Premium individuel**, tel qu'il est vendu au lancement (3,49 €/mois) : rapport pédiatre illimité, kit examen, estimations de tétée et de sieste, exports PDF illimités, saisie vocale. **Les fonctions ajoutées plus tard à ce même niveau Premium sont incluses** (par exemple le widget prévu).
3. **La voix** : même plafond que les abonnés Premium payants, soit **30 saisies vocales par jour** au lancement. La saisie manuelle n'est jamais limitée.
4. **Ce qui n'est pas inclus** : un éventuel niveau supérieur distinct (par exemple une formule « Famille » qui partagerait Premium avec d'autres comptes), et tout achat séparé. Les proches invités gardent l'app gratuite, partage compris.
5. **Pour quel compte** : un seul compte SuiviBaby (l'adresse e-mail utilisée dans l'app), personnel et non cessible. Activé par nous, sans code à saisir, au plus tard le jour du lancement public, et visible dans Réglages > Abonnement.
6. **« À vie »** : aussi longtemps que SuiviBaby est exploité. En cas d'arrêt du service, nous prévenons **6 mois à l'avance** et l'export complet de vos données reste gratuit. Le droit ne se perd qu'en cas d'abus (comptes multiples, revente) ou si vous supprimez votre compte.

*Si vous parlez de SuiviBaby en public, merci de préciser que vous avez reçu Premium en tant que testeur.*

### 3.3 Pourquoi c'est tenable

- **Coût borné** : environ 20 à 40 testeurs × 0,33 €/mois ≈ 7 à 13 €/mois. Pire cas (40 testeurs au plafond vocal tous les jours) : environ 40 €/mois. La voix plafonnée est ce qui rend la promesse « à vie » soutenable.
- **Cohérent avec l'offre** : le widget est déjà prévu dans Premium sans hausse de prix pour les abonnés (`v2-offers.md` §5.1). Il est donc naturel de l'inclure. « Famille », s'il existe un jour, coûte plus cher à servir (voix de plusieurs adultes) : on l'exclut dès maintenant, par écrit.
- **Technique** : droit promotionnel RevenueCat **sans date de fin**, attribué à l'identifiant Firebase du compte, et tier serveur « premium » avec un motif `tester`. **Prérequis** : la correction de `PremiumContext` (P0 du socle), sans laquelle un droit accordé côté serveur est invisible dans l'app. Aucune saisie de code dans l'app : on évite ainsi le sujet Apple 3.1.1. L'octroi manuel de droits par le serveur est une pratique courante, mais elle reste à garder discrète et sans contrepartie d'achat **[risque faible, à surveiller]**.
- **Vérifiable** : la liste Play Console et la date d'inscription TestFlight, plus 3 jours d'activité, visibles dans les événements d'analytics internes.

### 3.4 La ligne réécrite du message de recrutement (§1 de `RECRUTEMENT_ET_SONDAGE.md`)

Remplacer :
> **En échange :** l'appli est gratuite, et les testeurs auront Premium offert à vie au lancement.

par :
> **En échange :** l'appli est gratuite, et si vous restez dans le test 14 jours en l'utilisant un peu, votre compte reçoit **Premium offert à vie** : tout ce que contient l'abonnement Premium (3,49 €/mois au lancement), y compris ce qui y sera ajouté, tant que l'appli existe. Saisie vocale comprise, avec le même plafond que les abonnés (30 par jour). Les conditions tiennent en 6 lignes : suivibaby.com/testeurs

Dans le message personnel (§2), ajouter : « En remerciement, Premium t'est offert à vie (conditions : suivibaby.com/testeurs). »
Dans le message d'échange de tests en anglais (§3), ne rien promettre de plus. Ces testeurs sont couverts par la même règle s'ils la remplissent, mais ce n'est pas un argument pour eux.

**Préalable** : le prix de 3,49 € dépend du sondage (décision le 14/12). Jusque-là, écrire « (prix de lancement : environ 3,50 €/mois) », ou retirer le prix de la phrase. La page `suivibaby.com/testeurs` est rédigée par Claude et publiée sur le site (hébergement autorisé) **après validation de Yoss**.

---

## 4. Lancement (founder-launch)

### 4.1 Verdict sur le 5/1/2027 : il ne tient plus

L'ancien plan supposait environ 5 jours de développement (rapport pédiatre) logés dans l'attente des 14 jours Android. Le nouveau plan en compte environ 41 à 44, dont environ 30,5 avant le soft launch :

| Bloc | Effort | Avant le soft launch | Après le soft launch, avant le public |
|---|---:|---:|---:|
| **UI/UX** : 5 P0 + 11 gains rapides de l'audit | ≈ 2 j | 2 j | — |
| UI/UX : onboarding allégé (3 écrans, connexion Apple/Google en premier, biométrie après la 1ʳᵉ saisie, « Trois touches, ou votre voix ») | ≈ 1 j | 1 j | — |
| UI/UX : footer collant + garde-fou de perte de saisie (P1-7, P1-8) | ≈ 2 j | — | 2 j |
| **Socle, nettoyage P0** (sauvegarde factice, parrainage, `PremiumContext`, fuite `parseVoiceCommand`, textes stores, types morts, séries gratuites, quota PDF serveur, droit testeurs, nom unique) | ≈ 4,5 j | 4,5 j | — |
| Socle, P1 utiles à la mesure : analytics internes, opt-in du récap, retrait des « insights IA », rappel J-2 de fin d'essai, vérification de l'export des photos | ≈ 3,5 j | 3,5 j | — |
| Socle, leviers de coût 0 (mesurer), 1 (push serveur des rappels), 5 (`minInstances`) | ≈ 2 j | 2 j | — |
| Socle, leviers de coût 2 (listeners Moments), 3 (relectures), 4b/4c (voix gratuite moins chère), 6 (photos), plus le code orphelin | ≈ 8 à 10 j | — | 8 à 10 j |
| **Architecture A** : calendrier des examens (1), rapport (5), kit (2,5), prédictions (6), divers (2) | ≈ 16 j | 16 j | — |
| Marketing produit : parcours d'invitation et `ref` (1), demande d'avis (0,5) | ≈ 1,5 j | 1,5 j | — |
| **Total** | **≈ 41 à 44 j** | **≈ 30,5 j** | **≈ 10 à 12 j** |

**Pourquoi on peut décaler une partie du socle :** à moins de 150 utilisateurs, le coût du gratuit est négligeable (150 × 0,12 € ≈ 18 €/mois). Les leviers 2, 3, 4b/4c et 6 comptent pour l'échelle du lancement public, pas pour le soft launch. Les leviers 0, 1 et 5 sont gardés avant, parce qu'ils sont courts et qu'ils corrigent un bug (double notification).

**Calcul.** Du jeudi 12/11 au vendredi 18/12, il y a environ 26 jours ouvrés, pour 30,5 jours de travail. Sans travailler pendant les fêtes, le code « prêt à vendre » arrive vers le 8/1. En travaillant 4 à 5 jours pendant les fêtes (développement seulement, sans soumission), il arrive le 31/12. La soumission iOS a lieu le lundi 4/1 et le soft launch le jeudi 7/1.

Ensuite, avec un essai de 14 jours, les premiers essais ne se terminent qu'à partir du 21/1. Il faut donc au moins jusqu'au 29/1 pour une première lecture de conversion.

**Nouvelle date de lancement public : mardi 2/2/2027.** Repli au mardi 16/2 si un critère de passage manque.

**Les options pour garder le 5/1, et pourquoi je ne les recommande pas :**
- *Lancement public gratuit le 5/1, Premium en février* : on gagne un mois d'avis et d'installations, mais on dépense l'unique « moment de lancement » sur une version sans revenu et sans mesure de conversion. C'est défendable si Yoss privilégie les avis, mais je ne le recommande pas.
- *Retirer les prédictions de la première version payante* : on gagne environ 6 jours, mais on vend un Premium que le panel juge « sympa » sans plus. Et ajouter les prédictions en plein test change l'offre pendant qu'on la mesure.
- *Tout finir avant le 11/12 pour un soft launch le 15/12* : il faudrait environ 30 jours de travail en 4 semaines, avec la relecture de toutes les PR par une seule personne. Ce n'est pas réaliste.

### 4.2 Le test avant de dépenser

**a) Sondage de prix (réel)** : on reprend `RECRUTEMENT_ET_SONDAGE.md` §5, avec 4 changements tirés de `v2-offers.md` §10.

1. **Monadique** : chaque répondant ne voit qu'une architecture (A, B ou C, en 5 lignes avec le prix). Tally ne tire pas au hasard. Astuce : la question « Dernier chiffre de votre jour de naissance ? » envoie 0-3 vers A, 4-6 vers B et 7-9 vers C.
2. Van Westendorp **à unité imposée** (« par mois » pour A et C, « une fois » pour le Pack B).
3. Gabor-Granger sur A : annuel à 24,99 € et à 29,99 € ; mensuel à 2,99 €, 3,49 € et 3,99 €.
4. Nouvelles questions : « Qui paierait chez vous ? » et « Quelle fonction compte le plus ? ».

Les règles de décision de `v2-offers.md` §10 sont écrites **avant** les réponses.

| Jalon | Date | Cible |
|---|---|---|
| Sondage en ligne (C prépare dans Tally, Y publie) | lun. 16/11 | — |
| Premier point | dim. 29/11 | ≥ 30 réponses complètes |
| Clôture | dim. 13/12 | ≥ 75 (25 par variante), 100 idéalement |
| Décision prix et architecture | **lun. 14/12** | Produits créés dans les stores du 15 au 18/12 |

Si l'on a moins de 45 réponses le 13/12 : on garde A à 3,49 € / 24,99 €, et le soft launch tranche.

**b) Soft launch au vrai prix** (jeudi 7/1 → vendredi 29/1), sans annonce publique, pour 50 à 100 comptes.

| Indicateur | Ligne de succès (écrite le 12/11) | Seuil « revoir l'offre » |
|---|---|---|
| Activation (enfant + ≥ 3 saisies le 1ᵉʳ jour) | ≥ 60 % | < 40 % |
| Rétention J7 | ≥ 35 % | < 20 % |
| Familles avec une invitation acceptée sous 7 jours | ≥ 40 % | < 25 % |
| « Préparer la visite » ou rapport ouvert | ≥ 1 par utilisateur actif ayant eu un examen | quasi nul |
| Actifs en essai ou payants à J30 (`v2-offers.md` §10) | ≥ 3 % | < 1 % |
| Achats réels hors Yoss | ≥ 1 payant converti après essai, ≥ 3 essais en cours | 0 essai |
| Taux sans crash sur 14 jours | ≥ 99,5 % | < 99 % |

Si les vrais acheteurs restent loin du seuil, **on fait confiance aux vrais acheteurs, pas au panel** : on regarde quel levier est utilisé (rapport, prédictions, voix au plafond), puis on revient à l'offre (C si les familles partagées convertissent), avant de toucher au prix.

### 4.3 Critères de passage au lancement public (revue du lundi 1/2, 18 h)

- Taux sans crash ≥ 99,5 % sur 14 jours, aucun bug de perte ou de mélange de données ouvert.
- Un achat réel et un remboursement traités **sur chaque plateforme**, webhook RevenueCat cohérent.
- Ligne de succès du soft launch atteinte, ou décision écrite de lancer quand même avec l'offre ajustée.
- Leviers de coût 2 et 4 livrés (le gratuit doit coûter environ 0,04 € avant d'en accueillir des centaines).
- Contenu santé relu (§2.9), page testeurs en ligne, droits testeurs activés.
- Note moyenne ≥ 4,3 s'il y a au moins 5 avis ; première réponse au support en moins de 24 h.
- Si un critère manque : **repli au mardi 16/2**, pas au-delà sans nouvelle décision.

### 4.4 Compte à rebours, semaine par semaine

Légende : **Y** = Yoss seul · **C** = Claude · **Y+C** = Claude prépare, Yoss valide ou signe · ⚑ = chemin critique · ◇ = presque critique (moins de 2 semaines de marge).

#### S1 — jeu. 12/11 → dim. 15/11 : lancer tout ce qui a un délai

| # | Tâche | Qui | Échéance |
|---|---|---|---|
| ◇1 | Créer le Google Group `suivibaby-testeurs@googlegroups.com` (tout le monde peut rejoindre, messages réservés aux propriétaires, membres masqués), puis l'ajouter dans Play Console > Tests fermés > Alpha > Testeurs | C via ego-browser **sur accord de Y** | ven. 13/11 |
| ◇2 | Publier l'appel aux testeurs (version §3.4) dans 3 groupes de parents, plus le message personnel à l'entourage ; demander aux 6 testeurs actuels d'en amener 2 chacun | Y | dim. 15/11 |
| ◇3 | Échanges de tests (r/AndroidClosedTesting, groupe « Testers Community ») : message §3 ; Claude tient la liste des applis à tester en retour pendant 14 jours | C (publie si les comptes de Y sont connectés et sur accord) / Y (teste en retour sur son Android) | ven. 13/11 |
| 4 | Apple : vérifier le type de compte ; si individuel, D-U-N-S de TESFA puis migration vers un compte organisation ; statut de commerçant DSA (adresse publique : siège ou domiciliation) | Y | lancé ven. 13/11 |
| 5 | Google : profil de paiement marchand TESFA (SIREN, IBAN pro, Kbis), statut DSA | Y | ven. 13/11 |
| 6 | Médiateur : souscrire CM2C (le rappel du 9/11 est passé) | Y | **dim. 15/11** |
| 7 | Réserver @suivibaby sur Instagram, TikTok, YouTube et Facebook ; vérifier suivibaby.fr | Y | dim. 15/11 |
| ⚑8 | Code : 5 P0 et gains rapides de l'audit UI (`onTint`, modales liées au thème, FAB, chrono, StatsGroup), puis nettoyage trivial (sauvegarde factice, carte de parrainage, séries gratuites, types morts, `APP_NAME`) | C → « go » Y par PR | ven. 13/11 → mar. 17/11 |
| 9 | Préparer le sondage v2 dans Tally (§4.2) | C | dim. 15/11 |

#### S2 — lun. 16/11 → dim. 22/11 : socle, build visible pour les testeurs

| # | Tâche | Qui | Échéance |
|---|---|---|---|
| ⚑10 | `PremiumContext` (fusion RevenueCat et serveur, `status`), fuite `parseVoiceCommand`, quota PDF côté serveur | C → Y | jeu. 19/11 |
| ⚑11 | Leviers 0 (export de facturation vers BigQuery, alertes budget), 1 (suppression du push serveur des rappels), 5 (`minInstances`) | C (gcloud autorisé) | ven. 20/11 |
| 12 | **Build 1.0.15** aux testeurs (TestFlight et Alpha) : interface corrigée, visible et utile pour le questionnaire Google | C (autorisé) | mer. 18/11 |
| 13 | Sondage publié : groupes, testeurs, entourage | Y | lun. 16/11 |
| ◇14 | **≥ 12 testeurs Android inscrits** : le compteur de 14 jours démarre au plus tard ce jour | Y (C vérifie chaque jour) | **dim. 22/11** |
| 15 | AssemblyAI en paiement à l'usage, limite de dépense Anthropic | Y | dim. 22/11 |

#### S3 — lun. 23/11 → dim. 29/11 : mesure et argent

| # | Tâche | Qui | Échéance |
|---|---|---|---|
| ⚑16 | Analytics internes (activation, J7, paywall vu, essai, achat, source, « préparer la visite »), opt-in du récap, retrait des « insights IA », rappel J-2 de fin d'essai, export des photos vérifié | C → Y | ven. 27/11 |
| ⚑17 | Calendrier des examens obligatoires + rappel J-3 (dates sourcées) | C → Y | dim. 29/11 |
| 18 | Accord Apple « Paid Apps » (banque, W-8BEN-E), statut « Actif » | Y | mer. 25/11 (marge jusqu'au 18/12) |
| 19 | Pages légales : médiateur, CGU (définition de « à vie », préavis de 6 mois, conditions testeurs, remboursement Android / Apple), mentions ; déploiement | C (rédige, déploie) / Y (valide) | 48 h après la convention CM2C |
| 20 | Point sondage : ≥ 30 réponses | Y (diffuse) / C (analyse) | dim. 29/11 |

#### S4 — lun. 30/11 → dim. 6/12 : le rapport

| # | Tâche | Qui | Échéance |
|---|---|---|---|
| ⚑21 | Rapport pédiatre complet (période depuis le dernier examen, OMS, repas, sommeil, couches, santé, vaccins récupérés de `immunizations.tsx`), 1 gratuit puis Premium | C → Y | ven. 4/12 |
| 22 | Parcours d'invitation à l'onboarding + `ref` ; demande d'avis native | C → Y | mer. 2/12 |
| 23 | **Build 1.0.16** aux testeurs (calendrier, rapport, invitation) | C | mer. 2/12 |
| 24 | Trouver une sage-femme ou un pédiatre relecteur (kit, seuils de température, wording) | Y | dim. 6/12 |
| ◇25 | Fin des 14 jours (si le compteur est parti le 22/11) | — | dim. 6/12 |

#### S5 — lun. 7/12 → dim. 13/12 : kit, accès production Android

| # | Tâche | Qui | Échéance |
|---|---|---|---|
| ◇26 | Demander l'accès à la production Google (C rédige les réponses à partir des retours réels des testeurs) | Y (envoie) / C | lun. 7/12 |
| ⚑27 | Kit examen (« préparer la visite », questions notées, check-list sourcée) | C → Y | jeu. 10/12 |
| ⚑28 | Prédictions tétée et sieste : début | C | — |
| 29 | Clôture du sondage (≥ 75 réponses) | Y + C | dim. 13/12 |
| 30 | Compte marchand Google actif (sinon, relance) | Y | dim. 13/12 |

#### S6 — lun. 14/12 → dim. 20/12 : prix, produits, prédictions

| # | Tâche | Qui | Échéance |
|---|---|---|---|
| 31 | **Décision prix et architecture** (règles écrites) | Y (C présente l'analyse Van Westendorp et Gabor-Granger) | **lun. 14/12** |
| ⚑32 | Prédictions terminées (fourchette, données utilisées, désactivables) | C → Y | ven. 18/12 |
| 33 | Produits App Store Connect et Play (mensuel, annuel avec essai 14 jours, à vie Fondateurs), offerings RevenueCat, clés SDK publiques ; Y dépose la clé .p8 et le JSON du compte de service | C (saisie) / Y (secrets, prix) | ven. 18/12 |
| 34 | Accès production Google accordé (revue jusqu'à 7 jours) | Google | ≈ lun. 14/12 |
| 35 | Fiches stores réécrites (§1.5), 6 scripts vidéo | C | dim. 20/12 |
| 36 | **Build 1.0.17** interne avec achats sandbox | C | ven. 18/12 |

#### S7-S8 — lun. 21/12 → dim. 3/1 : fêtes (aucune soumission publique)

- Y : achats sandbox iOS et achats test Android sur appareil (achat, essai, restauration, annulation, webhook). Repos.
- C : « divers » de A (2 j), captures d'écran sur l'interface finale, compte de démonstration avec données, notes de revue, levier 2 (listeners Moments) sur une branche. Pas de mise en production.
- Les revues Apple ralentissent souvent autour de Noël **[à confirmer : calendrier 2026]**.

#### S9 — lun. 4/1 → dim. 10/1 : soft launch

| # | Tâche | Qui | Échéance |
|---|---|---|---|
| ⚑37 | Soumettre **1.1.0** à la revue App Store avec les achats intégrés (publication manuelle) ; release production Android en déploiement progressif à 20 % | C (build, soumission App Store Connect) / **Y (accord pour la production Android)** | lun. 4/1 |
| 38 | Clôture des inscriptions testeurs éligibles à Premium à vie | — | mer. 6/1 |
| ⚑39 | **Soft launch** France : publication iOS, Android à 100 % ; achat réel par Y puis remboursement, sur chaque plateforme | Y (go) / C | **jeu. 7/1** |
| 40 | Premier cercle invité, 2 groupes choisis ; vidéos 1 et 2 | Y | dim. 10/1 |

#### S10-S12 — lun. 11/1 → dim. 31/1 : écouter, finir le socle, préparer

- C : leviers 3, 4b/4c et 6 ; footer collant et garde-fou de saisie ; correctifs du soft launch ; un train de release par semaine, le mercredi.
- C : droits Premium testeurs activés (RevenueCat promotionnel) d'ici le 29/1 ; textes de lancement, fiche presse, réponses types, site (prix, badges stores, page Premium).
- Y : relecture santé reçue (au plus tard le 22/1) ; terrain sages-femmes à partir du 25/1 ; vidéos 2 par semaine.
- Lundi 25/1 : revue intermédiaire. Lundi 1/2, 18 h : **go / no-go**.

#### Lancement public — mardi 2/2/2027

Revues J+7 (mar. 9/2), J+14 (mar. 16/2), J+30 (jeu. 4/3). Fin de l'Offre Fondateurs le dimanche 4/4 à 23 h 59.

### 4.5 Chemin critique (ce qui décale tout s'il glisse)

1. ⚑ **Développement avant soft launch (≈ 30,5 j)** : P0 UI → socle (`PremiumContext`, analytics) → calendrier → rapport → kit → prédictions → produits et sandbox (18/12). Chaque jour de retard ici décale le soft launch, donc le lancement. Le goulot, c'est **la relecture par Yoss** (une PR par jour en moyenne), pas l'écriture du code.
2. ⚑ **Revue App Store de la 1.1.0** (4/1 → 7/1) : un rejet (3.1.2, compte démo, mention santé) coûte 2 à 5 jours.
3. ⚑ **Fenêtre de mesure** : au moins 3 semaines après le soft launch, à cause de l'essai de 14 jours.

Presque critiques (marge de 2 à 5 semaines, à lancer quand même cette semaine) : 12 testeurs Android d'ici le 22/11 → accès production autour du 14/12 (marge ≈ 3 semaines) ; accord Apple payant (marge jusqu'au 18/12) ; compte marchand Google ; médiateur avant la **première vente** (7/1) ; décision de prix le 14/12 ; relecture santé avant le 22/1.

Ne sont plus critiques : captures, fiches, compte de démonstration (logés pendant les fêtes).

### 4.6 Recrutement des testeurs : mode opératoire

- **Objectif** : 12 inscrits le 22/11 au plus tard, 18 à 20 pour la marge, dont au moins 8 vrais parents. Google pose des questions sur l'engagement et les retours.
- **Google Group** (tâche 1) : un nouvel arrivant rejoint le groupe, puis ouvre `https://play.google.com/apps/testing/com.tesfa.suivibaby` avec le même compte Google. Plus besoin d'ajouter les adresses à la main. Garder les deux listes d'e-mails existantes : on n'en retire personne pendant les 14 jours.
- **Échanges de tests** (complément, pas remplacement) : r/AndroidClosedTesting et le groupe « Testers Community ». Pour chaque appli testée en retour, l'ouvrir tous les 2 ou 3 jours pendant 14 jours. Claude tient le tableau, Yoss le fait sur son téléphone.
- **Suivi quotidien** (C, 2 minutes) : nombre d'inscrits dans Play Console. Rappel aux testeurs à J7 (« pensez à ouvrir l'app »). Si l'on passe sous 12, on le dit à Yoss le jour même.
- **Faire vivre le test** : deux builds pendant la période (1.0.15 le 18/11, 1.0.16 le 2/12), un formulaire de retour en 3 questions, et un journal des changements faits suite aux retours (il sert aux réponses du questionnaire Google).
- À ne pas faire : services payants de testeurs, comptes fictifs.

### 4.7 Jour J — mardi 2/2/2027

| Heure | Action | Qui |
|---|---|---|
| Lun. 1/2, 18 h | Go / no-go (§4.3) ; mêmes versions iOS et Android en ligne ; site, paywall, CGU et médiateur vérifiés | Y + C |
| 7 h 30 | Contrôle : Sentry, fonctions, webhook RevenueCat, budget GCP | C (rapport) / Y (lit) |
| 8 h 30 | Site mis à jour (prix, badges, Offre Fondateurs avec sa date de fin) | C (hébergement autorisé) |
| 9 h | E-mail aux testeurs et à l'entourage : merci, lien, partage, avis libre | Y (envoie) / C (rédige) |
| 9 h 30 | LinkedIn, Instagram, TikTok | Y |
| 10 h – 12 h | 5 groupes de parents, un message adapté à chacun, règles respectées | Y |
| 12 h | Point 1 : installations, erreurs, réponses à tout | Y + C |
| 14 h | E-mail aux sages-femmes déjà rencontrées, presse locale (Le Parisien 93) | Y |
| 16 h | Point 2 : avis (réponse sous 24 h), support | Y (C rédige) |
| 21 h | Point 3 : coûts du jour, erreurs, correctif ou non demain | Y + C |

**Si quelque chose casse** : registre de `launch-ops.md` §3 (arrêt du déploiement progressif Android, revue accélérée Apple, paiements en panne sans perte d'accès gratuit, coupure de la voix si le coût explose).

### 4.8 Les 30 premiers jours

Tableau hebdomadaire de `launch-ops.md` §5.1, avec trois changements :
- l'objectif d'abonnés devient **≈ 15** (infra couverte), puis **≈ 85** (SASU couverte) ;
- on ajoute « invitation acceptée sous 7 jours » et « préparer la visite » ;
- l'essai devient de 14 jours (lecture essai → payant à J+15).

Les revues :
- **J+7 (9/2)** : qu'est-ce qui casse ? Où les gens abandonnent-ils ? Quel canal amène vraiment des inscrits ?
- **J+14 (16/2)** : premiers essais arrivés à terme, part d'annuels, usage du rapport gratuit.
- **J+30 (4/3)** : payants contre la trajectoire du §2.4. Faut-il ajuster l'offre (passer à C, revoir le quota vocal gratuit), ou seulement la distribution ? Faut-il développer le widget ? Relance de l'Offre Fondateurs.

---

## 5. Opérations (founder-ops)

### 5.1 Rythme hebdomadaire, phase de construction (maintenant → 7/1)

Hypothèse : Yoss consacre environ 25 à 30 h par semaine à SuiviBaby **[à confirmer par Yoss : temps réellement disponible]**.

| Jour | Bloc | Contenu | Durée Yoss |
|---|---|---|---:|
| **Lundi** matin | Plan | Claude envoie l'état : PR ouvertes, testeurs inscrits, réponses au sondage, coûts GCP, blocages admin. Yoss choisit les 3 priorités de la semaine | 45 min |
| Lundi → jeudi | Construire | Claude code une PR par jour (petites, testées). **Yoss relit et teste sur appareil chaque jour**, puis donne son « go » | 1 h 30 par jour |
| **Mercredi** soir | Train de release | Build iOS (EAS, envoi automatique vers App Store Connect et TestFlight) et .aab Android local vers Alpha. Jamais le vendredi | C ; 15 min Y |
| **Jeudi** | Distribution | Recrutement des testeurs, groupes, sondage ; à partir de janvier, vidéos et terrain | 2 h |
| **Vendredi** matin | Admin | Apple, Google, médiateur, banque, comptable, justificatifs (§5.3) | 1 h 30 |
| Chaque jour | Contrôle | Nombre de testeurs inscrits (alerte de Claude si < 12), retours des testeurs | 10 min |
| Week-end | Rien | Sauf alerte critique | — |

**Après le soft launch** : le rythme de `launch-ops.md` §4.2 s'applique (revue des chiffres le lundi, construction le mardi et le mercredi, release le mercredi, distribution le jeudi, admin le vendredi, astreinte légère le week-end), avec le cycle quotidien de 30 à 45 minutes (support, avis, RevenueCat, Sentry).

### 5.2 Qui fait quoi

**Yoss seul** (identité, signature, argent, responsabilité, voix publique) :
- Comptes et accords : Apple (entité, D-U-N-S, Paid Apps, DSA, W-8BEN-E, banque), Google (profil marchand, DSA, demande d'accès production), RevenueCat (dépôt de la clé .p8 et du compte de service).
- Contrats : CM2C, assurance RC pro, comptable, INPI, domiciliation éventuelle, relecteur santé, avocat.
- Décisions : prix (14/12), architecture, « go » de chaque PR, mise en production Android, publication iOS, go / no-go du 1/2.
- Publications sous son nom : posts dans les groupes, vidéos, e-mails de support, réponses aux avis, terrain auprès des sages-femmes.
- Achats réels de test, tests en retour pour les échanges de tests, tests sur appareil.

**Claude** :
- Tout le code du plan (UI, socle, A, analytics, invitation), avec tests, PR et revue.
- Builds et envois en test (autorisés), soumission App Store Connect ; production Android **sur accord**.
- Saisie dans les consoles avec la session de Yoss (ego-browser) : Google Group (**sur accord**), fiches stores, produits et prix validés, IARC, étiquettes de confidentialité, offerings RevenueCat, droits promotionnels des testeurs.
- gcloud : alertes budget, export de facturation (autorisé).
- Rédaction : sondage, analyse des prix, posts, scripts vidéo, flyer, CGU et page testeurs (à valider), réponses au questionnaire Google, réponses types, rapport du lundi.
- Site : pages légales, page testeurs, mises à jour (hébergement autorisé).
- Jamais : manipuler les secrets (.p8, JSON de compte de service), signer, saisir des données bancaires ou fiscales, publier sous l'identité de Yoss sans son accord, envoyer des messages privés à des inconnus.

### 5.3 Administratif et juridique de la SASU (avant la première vente, le 7/1)

| Tâche | Qui | Échéance | Source |
|---|---|---|---|
| Médiateur CM2C signé, affiché dans les CGU et les mentions | Y (signe) / C (pages) | 15/11 → pages le 20/11 | [economie.gouv.fr/mediation-conso](https://www.economie.gouv.fr/mediation-conso) |
| CGU et CGV : prix TTC, renouvellement, essai de 14 jours, résiliation via le store, rétractation, définition de « à vie », préavis de 6 mois, conditions testeurs, Offre Fondateurs datée | C rédige / Y valide (relecture par un avocat recommandée) | 27/11 | — |
| Numéro de TVA intracommunautaire actif ; régime de TVA et éventuelle DES à confirmer avec le comptable | Y | 27/11 | Comptable |
| W-8BEN-E (Apple, Google) | Y | 25/11 | — |
| Statut de commerçant DSA (Apple, Google) ; adresse publique | Y | 13/11 | — |
| RC professionnelle (éditeur de logiciel, données d'enfants) : 2 ou 3 devis | Y | 18/12 | **[à confirmer]** |
| RGPD : registre à jour (retrait des « insights IA », analytics internes), AIPD pour les données de santé d'enfants, décision écrite sur le DPO | C rédige / Y signe | 18/12 | [cnil.fr](https://www.cnil.fr) |
| Question HDS et dispositif médical (rapport destiné au pédiatre, prédictions) | Y (avocat ou CNIL) | 22/1 | **[à confirmer]** |
| Dépôt INPI semi-figuratif « SuiviBaby » | Y | après la recherche d'antériorité, avant le 2/2 | [inpi.fr](https://www.inpi.fr) |
| Facture électronique : capacité de **réception** via une plateforme agréée (depuis le 1/9/2026) | Y + comptable | 18/12 | **[à confirmer]** |
| Rémunération du président en 2027 (impact URSSAF) | Y + comptable | 31/12 | — |

Le récurrent (justificatifs chaque semaine, TVA, rapprochement Apple et Google, comptes annuels, CFE, renouvellements) est décrit dans `launch-ops.md` §4.6, sans changement.

### 5.4 Outils : ce qui change

- **Tally** (gratuit) pour le sondage. **Google Groups** (gratuit) pour les testeurs.
- **Analytics internes** : événements agrégés écrits par l'app, sans tiers, cohérents avec la promesse « sans traqueur ». Pas de SDK d'analytics externe.
- **Export de facturation GCP vers BigQuery** (levier 0) : coût quasi nul à ce volume **[à confirmer]**.
- Le reste ne change pas : Firebase UE, RevenueCat (gratuit sous 2 500 $ de revenu mensuel), Sentry, AssemblyAI et Haiku, CM2C.

### 5.5 Registre des risques (les 10 premiers)

| # | Risque | Probabilité | Gravité | Plan |
|---|---|---|---|---|
| 1 | **Le développement déborde** (30,5 j estimés, relecture par une seule personne, estimations tirées du code) | Élevée | Élevée (décale le 2/2) | Petites PR quotidiennes ; si le 18/12 n'est pas tenu pour les prédictions, utiliser les fêtes ; au-delà du 8/1, décaler le public au 16/2 plutôt que de livrer des prédictions bâclées |
| 2 | **Conversion faible** (gratuit généreux, rapport jugé « sympa ») | Élevée | Élevée | Ligne de succès écrite ; mesurer « préparer la visite » ; plan B = C (Famille) ou contenu revu, pas une baisse de prix réflexe |
| 3 | **Testeurs Android insuffisants** ou désinscrits | Moyenne | Moyenne (marge d'environ 3 semaines) | Google Group, 18-20 visés, contrôle quotidien, rappel à J7, deux builds |
| 4 | **Prédictions perçues comme fausses**, d'où de mauvais avis | Moyenne | Moyenne | Fourchette, données utilisées affichées, désactivables, wording « estimation » |
| 5 | **Rejet App Store** de la 1.1.0 (3.1.2, démo, santé) | Moyenne | Moyenne (2-5 j sur le chemin critique) | Paywall de la PR #70, compte démo complet, notes de revue, aucune promesse non livrée ; soumission le lundi 4/1, pas plus tard |
| 6 | **Allégation santé** ou contenu d'examen inexact | Faible à moyenne | Élevée (image, retrait) | Kit sourcé, relecture professionnelle avant le 22/1, liste §2.9, mention permanente |
| 7 | **Fondateur saturé** (relecture + admin + terrain + vidéos) | Élevée | Moyenne | Terrain et vidéos seulement à partir de janvier ; Claude prépare tout ; 3 priorités par semaine, pas plus |
| 8 | **Accord Apple ou compte marchand lent** | Moyenne | Faible maintenant (marge jusqu'au 18/12), élevée au-delà | Lancer cette semaine, relancer à J+5 ; si bloqué le 18/12, soft launch Android d'abord |
| 9 | **Sondage trop maigre** (< 45 réponses) | Moyenne | Faible | Règle de repli écrite (A à 3,49 € / 24,99 €), le soft launch tranche |
| 10 | **Concurrence sur la voix** (« saisie IA » de Huckleberry, si elle marche en français) | Moyenne | Moyenne | Ne pas faire de la voix l'argument principal de Premium ; l'examen français reste le créneau |

Risques secondaires : promesse testeurs mal comprise (d'où la page en 6 points), période des fêtes (attention des parents dispersée), vacances d'hiver de février (zone C) qui pourraient affaiblir un repli au 16/2 **[à vérifier]**, coût du gratuit sous-estimé faute de facture détaillée (levier 0 en premier).

---

## 6. Questions ouvertes pour Yoss

1. **Date** : valides-tu le 2/2/2027 (soft launch le 7/1), ou préfères-tu un lancement public gratuit le 5/1 avec Premium en février (§4.1) ?
2. **Temps disponible** par semaine (relecture, terrain, vidéos) : le plan suppose 25 à 30 h.
3. **Google Group** : j'ai ton accord pour le créer avec ton compte via ego-browser et l'ajouter dans Play Console ?
4. **Nom** : « SuiviBaby » en un mot partout, et « SuiviBaby : suivi bébé partagé » sur les stores ?
5. **Promesse testeurs** : valides-tu les 6 points du §3.2, notamment l'exclusion d'un futur niveau « Famille » et la date limite du 6/1 ?
6. **Médiateur** : CM2C signé d'ici dimanche 15/11 ?
7. **Relecteur santé** : une sage-femme ou un pédiatre dans ton entourage pour le kit et les seuils ?
8. Compte Apple Developer individuel ou TESFA ? Adresse publique pour le DSA ?

---

## 7. Limites

- Les efforts de développement viennent de `v2-offers.md` et de l'audit UI. Ce sont des **estimations tirées du code**, sans historique de vélocité.
- Les conversions (4-5 %) et les volumes d'inscrits sont des **hypothèses**. Les trajectoires de payants du §2.4 servent à fixer des cibles, pas à prévoir.
- Le panel est simulé. Le vrai test, ce sont le sondage (§4.2 a) et le soft launch (§4.2 b).
- Délais des stores, tarifs INPI, obligations fiscales et calendrier des fêtes Apple : à vérifier à la source.
- Aucune recherche de marque, de domaine ou de compte n'a été faite : ce sont des vérifications à faire par Yoss.
