# SuiviBaby — plan de lancement et système d'exploitation (TESFA SASU)

> Rédigé le mercredi 11 novembre 2026, méthode `founder-launch` + `founder-ops`, adaptée à une app mobile vendue par une SASU d'une personne.
> Source : `CONTEXT.md` (offre, chiffres, concurrence) + docs du dépôt (`STORE_SUBMISSION.md`, `FIREBASE_MONITORING.md`, `PREMIUM_OFFRE_CIBLE.md`) + notes de mémoire (abonnements, médiateur, builds).
> Ce n'est pas un avis juridique ou comptable. Les délais des stores et les règles fiscales changent : chaque point marqué **[à confirmer]** doit être vérifié auprès de la source officielle ou de l'expert-comptable.

---

## 0. En une page

| Jalon | Date cible | Conditionné par |
|---|---|---|
| 12 testeurs Android inscrits (début du compteur de 14 jours) | **dim. 15/11** au plus tard | Yoss recrute ≥ 6 testeurs de plus (viser 10 pour la marge) |
| Rapport pédiatre + PR conformité #70 fusionnés, build 1.0.15 aux testeurs | **mer. 18/11** | Claude (code) + « go » de Yoss par PR |
| Médiateur signé, pages légales complètes et déployées | **ven. 20/11** | Yoss signe CM2C, Claude remplit `terms.html` / `mentions-legales.html` |
| Compte marchand Google vérifié + produits Play créés | **ven. 20/11** | Yoss (profil de paiement, IBAN, Kbis) |
| Accord Apple « Paid Apps » actif (entité TESFA + statut DSA + banque + W-8BEN-E) | **mer. 25/11** (cible) — **jusqu'à mi-décembre** si conversion d'entité / D-U-N-S lente | Yoss uniquement |
| RevenueCat branché en production (vraies clés, offerings, achat sandbox OK) | **ven. 27/11** | Accords Apple + Google actifs |
| Fin des 14 jours Android → demande d'accès production | **lun. 30/11** | Compteur démarré le 15/11 sans interruption |
| **Soft launch iOS** (France, sans annonce) | **mar. 1/12** | Accord Apple + revue App Store de la version avec achats |
| Accès production Google accordé (revue ≤ 7 j) | **lun. 7/12** (au plus tard ~mar. 8/12) | Google |
| **Soft launch Android** | **jeu. 10/12** | Revue de la release production |
| Gel du code (période des fêtes, revues ralenties) | **ven. 18/12 → dim. 3/1** | — |
| **Lancement public** (annonce, communautés, presse locale) | **mar. 5/1/2027** (repli : mar. 12/1) | Critères de passage §2.3 atteints |
| Revues J+7 / J+14 / J+30 | 12/1, 19/1, 4/2/2027 | — |

**Chemin critique** (ce qui décale tout s'il glisse) :
1. **Recrutement des testeurs Android** → chaque jour de retard sur les 12 inscrits = un jour de retard sur Android.
2. **Accord Apple payant** (entité légale + DSA) → sans lui, ni test d'achat sandbox ni vente sur iOS.
3. **Compte marchand Google** → sans lui, pas de produits Play donc pas de RevenueCat Android.
4. **Médiateur** → obligatoire avant toute vente (Code de la consommation, L612-1).

Le rapport pédiatre (3-5 jours de code) et les captures d'écran ne sont **pas** sur le chemin critique : ils tiennent dans l'attente des 14 jours, à condition de démarrer cette semaine.

---

## 1. Étape 1 de la méthode : tester avant de dépenser

L'app existe déjà et les coûts fixes sont faibles (~16 €/mois à 0 utilisateur, ~110 €/mois de frais SASU). Le vrai pari n'est pas l'acquisition mais la **conversion** : l'offre gratuite est plus généreuse que celle des concurrents (partage, stats, courbes OMS gratuits). Le test le moins cher et le plus honnête est donc **le soft launch lui-même, au vrai prix**, sans remise.

### 1.1 Le test

- **Quoi** : l'app en production en France, prix réels (3,99 €/mois, 29,99 €/an avec essai 7 jours, 79,99 € à vie), sans annonce publique.
- **Qui** : les ~12-20 testeurs actuels, leur entourage, 2-3 groupes de parents choisis (voir §2.2), soit **50 à 150 installations** visées entre le 1/12 et le 3/1.
- **Durée** : 4 à 5 semaines (iOS 1/12, Android 10/12 → 3/1).
- **Pas de « membre fondateur » à prix cassé** : un prix réduit fausse la mesure et les stores imposent de toute façon le tarif affiché. Si une incitation est nécessaire, utiliser l'essai 7 jours déjà décidé.

### 1.2 La ligne de succès (écrite avant de lancer)

| Indicateur | Seuil « on continue tel quel » | Seuil « on revoit l'offre » |
|---|---|---|
| Activation (enfant créé + ≥ 3 événements le 1er jour) | ≥ 60 % des installs | < 40 % |
| Rétention J7 (≥ 1 événement au jour 7) | ≥ 35 % | < 20 % |
| Vue du paywall → début d'essai annuel ou achat | ≥ 5 % | < 2 % |
| Essai → payant (à J+8) | ≥ 40 % | < 25 % |
| Abonnés payants à la fin du soft launch | ≥ 5 | 0-1 |

Repères : les seuils sont des ordres de grandeur prudents pour une app santé/famille, pas des références vérifiées pour ce marché. À 100 installs, la statistique est faible : la lecture compte autant que les chiffres (entretiens, avis, verbatims support).

**Si les vrais acheteurs restent loin du seuil**, ne pas baisser le prix en réflexe : d'abord regarder quel levier Premium est utilisé (voix > 3/jour ? export PDF ? rapport pédiatre ?), puis revenir à l'offre (`/founder-offer`, `/founder-pricing`). Le levier le plus probable est le rapport pédiatre lié aux 20 examens obligatoires (8e jour, 1 mois, 2 mois, 4 mois…) : chaque rendez-vous est un moment de conversion naturel.

### 1.3 Ce qui est mesuré et où

- **RevenueCat** : vues paywall (si événements envoyés), essais, conversions, MRR.
- **Firebase Analytics / Firestore** : activation, rétention, usage voix (quota 3/jour atteint = signal Premium).
- **Support + avis** : verbatims classés (bug / demande / prix / confusion).
- Claude peut produire chaque lundi un rapport chiffré à partir de ces sources (voir §5).

---

## 2. Étape 2 : le compte à rebours

Légende : **Y** = Yoss seul (comptes, contrats, banque, juridique, identité) · **C** = Claude (code, saisie dans les consoles avec la session de Yoss via ego-browser, docs) · **Y+C** = Claude prépare, Yoss valide ou signe. ⚑ = chemin critique.

### 2.1 Semaine par semaine

#### Semaine 1 — mer. 11/11 → dim. 15/11 : lancer tout ce qui a des délais

| # | Tâche | Qui | Échéance |
|---|---|---|---|
| ⚑1 | Recruter **≥ 6 testeurs Android** (viser 10) : famille, amis parents, collègues ; leur faire **accepter l'invitation** (opt-in) depuis le lien Play, pas seulement installer | Y | dim. 15/11 |
| 2 | Préparer le message de recrutement (texte WhatsApp/e-mail + lien opt-in + mode d'emploi en 3 étapes) | C | jeu. 12/11 |
| ⚑3 | Apple : vérifier dans App Store Connect → *Accords, taxes et banque* ce qui bloque. Si le compte est individuel : demander le **numéro D-U-N-S** de TESFA (outil de recherche Apple, gratuit, ~5 jours ouvrés, parfois 2 semaines) puis la **migration vers un compte organisation** auprès du support Apple | Y | lancé jeu. 12/11 |
| ⚑4 | Apple : déclarer le **statut de commerçant (DSA)** avec adresse, téléphone et e-mail vérifiés. Ces données sont **publiques sur la fiche** : utiliser l'adresse du siège ; si c'est le domicile, envisager une domiciliation **[à confirmer : coût]** | Y | ven. 13/11 |
| ⚑5 | Google : créer le **profil de paiement marchand** (type « entreprise », TESFA, SIREN, IBAN pro), répondre aux demandes de vérification (Kbis, pièce d'identité) | Y | ven. 13/11 |
| ⚑6 | Médiateur : souscrire **CM2C** en ligne (48 € TTC / 3 ans annoncés pour 0-10 salariés, tarif hors partenariat à confirmer sur cm2c.net) ; transmettre à Claude nom, adresse, site exacts de la convention | Y | ven. 13/11 |
| 7 | Fusionner la **PR #70** (paywall conforme) après revue | C → « go » Y | ven. 13/11 |
| 8 | Démarrer le **rapport pédiatre PDF** (période choisie, synthèse alimentation/sommeil/couches/croissance OMS/santé/vaccins, mention « notes des parents, pas un avis médical ») | C | — |
| 9 | Retirer `FREE_MAX_SHARED_USERS = 2` dans `functions/src/billing/quotas.js` (partage illimité décidé le 11/11) + plafond voix Premium 50/jour | C | dim. 15/11 |
| 10 | Passer AssemblyAI en **pay-as-you-go** (carte bancaire de la société) | Y | dim. 15/11 |

#### Semaine 2 — lun. 16/11 → dim. 22/11 : finir le produit et les fiches

| # | Tâche | Qui | Échéance |
|---|---|---|---|
| 11 | Rapport pédiatre terminé, revue de code, tests, PR | C → « go » Y | mer. 18/11 |
| 12 | Build **1.0.15** (iOS EAS + TestFlight, Android .aab local + Alpha) | C (autorisé) | mer. 18/11 |
| 13 | Pages légales : remplir le médiateur dans `public/terms.html` et `public/mentions-legales.html`, `scripts/checkSiteTodos.sh` au vert, déploiement hosting | C | 48 h après la convention |
| 14 | Remettre dans le paywall / le site la ligne « Rapport pédiatre PDF » une fois livrée en production (règle de `PREMIUM_OFFRE_CIBLE.md`) | C | avec la 1.0.15 |
| ⚑15 | Une fois le compte marchand actif : créer dans Play Console l'abonnement (base mensuelle + base annuelle avec offre d'essai 7 jours) et le produit « à vie » | C (saisie) / Y (valide les prix) | ven. 20/11 |
| 16 | Créer les mêmes produits dans App Store Connect (groupe d'abonnements « Premium », mensuel, annuel + offre d'introduction 7 jours gratuits, achat non consommable 79,99 €) — la saisie est possible avant l'accord, le test non | C (saisie) / Y (valide) | ven. 20/11 |
| 17 | **Compte de démonstration** pour les revues Apple et Google : compte e-mail dédié, un bébé fictif avec 2 semaines de données, partage, Premium accordé côté serveur ; identifiants dans les notes de revue (mot de passe saisi par Yoss ou généré et stocké dans son gestionnaire) | C (script de données) / Y (identifiants) | ven. 20/11 |
| 18 | **Captures d'écran** : iPhone 6,9"/6,7" (et 6,5" si demandé), Android téléphone ; 6 écrans (accueil du jour, saisie vocale, journal, stats + courbes OMS, partage famille, rapport pédiatre) avec les accroches du paywall en légende | C | dim. 22/11 |
| 19 | Classification d'âge Apple + questionnaire IARC Google, publication des étiquettes de confidentialité Apple et du formulaire « Sécurité des données » Google (à partir de `STORE_PRIVACY.md`) | C (saisie) / Y (valide) | dim. 22/11 |
| 20 | Vérifier que 12 testeurs sont **toujours** inscrits (Play Console → Tests fermés → testeurs) ; relancer ceux qui se désinscrivent | Y (C vérifie) | chaque jour |

#### Semaine 3 — lun. 23/11 → dim. 29/11 : brancher l'argent

| # | Tâche | Qui | Échéance |
|---|---|---|---|
| ⚑21 | Accord Apple « Paid Apps » : coordonnées bancaires TESFA, **formulaire fiscal W-8BEN-E** (société française, convention fiscale France-USA), contacts ; attendre le statut « Actif » | Y | mer. 25/11 |
| ⚑22 | RevenueCat : créer le projet/les apps, **déposer la clé .p8 (App Store Connect API / In-App Purchase key) et le JSON du compte de service Play** — Claude ne manipule jamais ces secrets | Y | jeu. 26/11 |
| 23 | RevenueCat : entitlement « premium », offering par défaut (mensuel/annuel/à vie), webhook vers `revenueCatWebhook` vérifié | C (saisie) | jeu. 26/11 |
| 24 | Remplacer `appl_PLACEHOLDER` / `goog_PLACEHOLDER` par les **clés SDK publiques** (pas secrètes) dans `services/revenueCatService.ts`, PR | C → « go » Y | jeu. 26/11 |
| 25 | Achat sandbox iOS (compte testeur sandbox) + achat test Android (testeur de licence) : achat, essai, restauration, annulation, webhook → `subscriptions/` correct | C (scénario) + Y (appareil) | ven. 27/11 |
| 26 | Build **1.0.16** avec vrais paiements ; iOS soumis **à la revue App Store** avec les achats intégrés attachés, publication **manuelle** ; Android en Alpha | C (autorisé pour builds ; soumission App Store sur accord Y) | ven. 27/11 |
| 27 | Notes de revue Apple : compte démo, où trouver le paywall, explication de la voix (micro), lien CGU + confidentialité dans le paywall (guideline 3.1.2) | C | ven. 27/11 |
| 28 | Fiche Play production : description FR, captures, catégorie, coordonnées, politique de confidentialité, statut commerçant DSA côté Google | C (saisie) / Y (valide) | dim. 29/11 |

#### Semaine 4 — lun. 30/11 → dim. 6/12 : soft launch iOS, accès production Android

| # | Tâche | Qui | Échéance |
|---|---|---|---|
| ⚑29 | **Demander l'accès production** dans Play Console (questionnaire sur le test fermé : nombre de testeurs, retours reçus, changements faits — Claude prépare les réponses à partir des retours réels) | Y (envoie) / C (rédige) | lun. 30/11 |
| 30 | Version iOS approuvée → **publier manuellement** en France uniquement (disponibilité : France ; élargir plus tard à BE/CH/LU/Canada francophone) | Y (go) / C (clic) | mar. 1/12 |
| 31 | **Achat réel** par Yoss (mensuel), vérifier le webhook, puis demander le remboursement — preuve de bout en bout | Y | mar. 1/12 |
| 32 | Inviter le premier cercle iOS (voir §2.2) | Y | mer. 2/12 |
| 33 | Monitoring prêt (§5.4) : alertes budget GCP, alertes Sentry, limite de dépense Anthropic, alerte AssemblyAI | C (gcloud autorisé) / Y (cartes, limites) | jeu. 3/12 |

#### Semaine 5 — lun. 7/12 → dim. 13/12 : soft launch Android

| # | Tâche | Qui | Échéance |
|---|---|---|---|
| ⚑34 | Accès production accordé → **promouvoir la release vers Production** (France), déploiement progressif 20 % → 100 % | C, **sur accord explicite de Yoss** | mar. 8/12 |
| 35 | Achat réel Android + remboursement depuis Play Console | Y | jeu. 10/12 |
| 36 | Inviter le premier cercle Android | Y | jeu. 10/12 |

#### Semaines 6-8 — 14/12 → 3/1/2027 : écouter, corriger, geler

- Corrections issues du soft launch jusqu'au **ven. 18/12** (dernière soumission avant les fêtes ; Apple ralentit traditionnellement les revues autour de Noël **[à confirmer : dates exactes de la fermeture 2026]**).
- 18/12 → 3/1 : gel du code, seulement les correctifs critiques (crash, perte de données, paiement).
- Préparer le lancement public (C) : textes des posts, e-mail aux testeurs, fiche presse d'une page, réponses types support, mise à jour de `public/index.html` (prix, liens stores).
- **lun. 4/1** : revue « go / no-go » (critères §2.3).

### 2.2 Soft launch vs lancement public

| | Soft launch (1/12 iOS, 10/12 Android → 3/1) | Lancement public (mar. 5/1/2027) |
|---|---|---|
| Objectif | Vérifier paiement, stabilité, conversion au vrai prix | Atteindre ~500 utilisateurs |
| Public | Testeurs, entourage, 2-3 groupes de parents choisis | Tous les canaux gratuits listés ci-dessous |
| Annonce | Aucune annonce publique, messages directs | Posts, e-mails, communautés, presse locale |
| Volume visé | 50-150 installs | 300-500 installs sur 30 jours |
| Ce qu'on change | Tout ce qui casse ou embrouille | Seulement les correctifs ; pas de nouvelle fonctionnalité pendant 2 semaines |

Canaux gratuits (pas de budget marketing) : groupes Facebook de parents (Saint-Ouen, Seine-Saint-Denis, Paris, « bébés nés en … 2026 »), forums parents, Instagram/TikTok personnel de Yoss (vidéo « à 3 h du matin, je dis : biberon 150 ml »), sages-femmes libérales et PMI de proximité (flyer A5 avec QR code), maternité locale, réseau personnel LinkedIn (angle « fondateur solo, hébergé en Europe »), presse locale (Le Parisien 93), sites de lancement francophones. Chaque testeur reçoit un lien de partage et une demande d'avis sur le store.

### 2.3 Critères de passage au lancement public (revue du lun. 4/1)

- Taux sans crash ≥ 99,5 % sur 14 jours (Sentry), aucun bug de perte ou de mélange de données ouvert.
- Au moins un achat réel réussi et un remboursement traité **sur chaque plateforme**, webhook cohérent.
- Note moyenne ≥ 4,3 sur les premiers avis (s'il y en a ≥ 5).
- Support : délai de première réponse < 24 h tenu pendant le soft launch.
- Coût infra du mois ≤ 1,5× la prévision (~25 € à 100 utilisateurs).
- Si un critère manque : repli au **mar. 12/1**, pas plus tard sans nouvelle décision.

---

## 3. Étape 3 : jour J — mardi 5 janvier 2027 (feuille de route horaire)

Seul à bord : tout ce qui peut être préparé l'est la veille par Claude (textes, liens, réponses types).

| Heure | Action | Qui |
|---|---|---|
| Lun. 4/1, 18 h | Revue go/no-go ; vérifier versions en ligne (iOS + Android identiques), liens stores sur le site, paywall, CGU/médiateur en ligne | Y + C |
| 7 h 30 | Contrôle santé : Sentry (0 nouvelle erreur critique), Firebase (fonctions sans erreur), RevenueCat (webhook vert), budget GCP | C (rapport) / Y (lit) |
| 8 h 30 | Mise en ligne du site mis à jour (prix, badges stores) | C (déploiement hosting autorisé) |
| 9 h | E-mail aux testeurs et à l'entourage : merci + lien + demande d'avis + demande de partage | Y (envoie) / C (rédige) |
| 9 h 30 | Posts LinkedIn + Instagram/TikTok de Yoss | Y |
| 10 h – 12 h | Publication dans les groupes de parents (un message adapté par groupe, règles de chaque groupe respectées) | Y |
| 12 h | Point 1 : installs, erreurs, premiers retours ; répondre à tout | Y + C |
| 14 h | Envoi presse locale + sages-femmes/PMI (e-mail avec fiche presse) | Y |
| 16 h | Point 2 : avis stores (réponse sous 24 h), support | Y (C rédige) |
| 21 h | Point 3 : coûts du jour, erreurs, décision correctif ou non pour le lendemain | Y + C |

**Si quelque chose casse** (renvoi au registre §6.7) :
- Crash massif sur une version → arrêter le déploiement progressif Android (Play Console) ; iOS : correctif + demande de **revue accélérée** Apple ; message honnête dans les groupes.
- Paiement en panne (RevenueCat/store) → ne pas toucher au code d'abord : vérifier le statut des services (status.revenuecat.com, statut Apple Developer, Play Console) ; les utilisateurs gardent l'accès gratuit, rien n'est perdu.
- Coût qui explose (boucle de lecture Firestore, abus de la voix) → couper la fonctionnalité concernée par configuration distante si disponible **[à confirmer : existence d'un interrupteur Remote Config pour la voix]**, sinon correctif.
- Avis négatif public → réponse sous 24 h, factuelle, sans débat (§4.4).

---

## 4. Système d'exploitation après le lancement (méthode `founder-ops`)

### 4.1 Le cycle quotidien (≈ 30-45 min par jour)

| # | Étape | Visible par le client ? |
|---|---|---|
| 1 | Lire le rapport du matin : Sentry (nouvelles erreurs, régressions), erreurs Cloud Functions, coûts de la veille | Non |
| 2 | Boîte `support@suivibaby.com` (et `privacy@`, `contact@`) : trier, répondre | **Oui** |
| 3 | Avis App Store / Play : répondre aux nouveaux | **Oui** (public) |
| 4 | RevenueCat : nouveaux essais, achats, `BILLING_ISSUE`, remboursements | Non |
| 5 | Décider : correctif aujourd'hui, ticket pour la semaine, ou rien | Non |

### 4.2 Le rythme hebdomadaire (solo, ~30-35 h/semaine sur le produit le premier mois)

| Jour | Bloc | Contenu |
|---|---|---|
| **Lundi** matin (1 h) | Revue des chiffres | Rapport hebdo préparé par Claude : installs, activation, rétention J7, usage voix, vues paywall → essais → payants, abonnés vs seuils (22 = infra couverte, 75 = SASU couverte), note moyenne, coûts. Choisir **3 priorités** de la semaine. |
| Lundi après-midi | Support et avis | Rattraper le week-end, mettre à jour la FAQ si une question revient ≥ 3 fois |
| **Mardi – mercredi** | Construire | Correctifs et améliorations (Claude code, Yoss relit et valide les PR) |
| **Mercredi** soir | Release (si nécessaire) | Un seul train par semaine, jamais le vendredi : build iOS EAS + .aab Android local, Alpha/TestFlight d'abord, puis production avec déploiement progressif |
| **Jeudi** | Distribution | 1 contenu (post, vidéo courte, message dans un groupe, contact sage-femme/PMI), 2-3 entretiens utilisateurs par mois |
| **Vendredi** matin (1 h 30) | Admin | Factures et justificatifs dans l'outil comptable, rapprochement bancaire, boîte `privacy@` (droits RGPD), vérifier les virements Apple/Google |
| Vendredi après-midi | Zéro support | Boîte vide avant le week-end, message d'absence si nécessaire |
| Week-end | Astreinte légère | 10 min matin et soir : Sentry critique + paiements. Rien d'autre. |

**Mensuel** (1er lundi du mois, 2 h) : coûts réels vs prévision (§4.5), déclarations fiscales (§4.6), revue des quotas voix (AssemblyAI + Anthropic), décision prix/offre si les données le justifient (pas avant 60 jours de recul).
**Trimestriel** : revue de la feuille de route (widget d'ajout rapide, etc.), mise à jour des pages légales et des étiquettes de confidentialité si un traitement a changé, test de restauration de sauvegarde Firestore.

### 4.3 Routine support e-mail (SOP)

1. **Accuser réception sous 24 h** (jours ouvrés), même si la solution prend plus de temps. Signature : « Yoss, fondateur de SuiviBaby ».
2. **Classer** : bug · question d'usage · facturation · RGPD · suggestion · signalement (contenu, sécurité).
3. **Bug** : demander modèle d'appareil, version de l'app, heure approximative ; chercher dans Sentry ; si reproductible → ticket + date honnête.
4. **Facturation** : SuiviBaby **ne peut pas rembourser directement sur iOS** — orienter vers reportaproblem.apple.com ; sur Android, un remboursement est possible depuis Play Console (commandes) **[à confirmer : délais et conditions actuels]**. Ne jamais promettre un remboursement qu'on ne peut pas exécuter. Problème d'accès Premium après achat → « Restaurer les achats », puis vérifier RevenueCat et `subscriptions/` (cas de compte différent : règle « garder l'App User ID d'origine »).
5. **RGPD** (accès, rectification, suppression, portabilité) : réponse sous **1 mois** maximum ; la suppression de compte existe dans l'app et sur `/delete-account` ; journaliser la demande et la date de traitement (registre simple).
6. **Médiation** : si un client reste insatisfait après réclamation écrite, lui indiquer les coordonnées du médiateur (CM2C) — c'est une obligation d'information.
7. **Urgence santé** (« mon bébé a de la fièvre, que faire ? ») : l'app n'est pas un dispositif médical ; réponse type orientant vers le médecin, le 15 ou le 112. Ne jamais donner d'avis médical.
8. Tout ce qui revient ≥ 3 fois → FAQ du site + éventuel correctif produit.

Claude peut : rédiger les réponses types (FR), préparer des brouillons à partir des e-mails transmis, tenir la FAQ. Yoss envoie (la boîte et l'identité sont les siennes).

### 4.4 Routine réponse aux avis (SOP)

- Répondre à **tous** les avis ≤ 3★ et à un maximum d'avis 4-5★, sous 24-48 h, dans App Store Connect et Play Console.
- Structure : merci → reconnaître le point précis → ce qui est fait / prévu (date seulement si sûre) → inviter à écrire à `support@` pour le détail.
- Jamais de données personnelles ni de détail de compte dans une réponse publique ; jamais d'argument sur le prix.
- Après correction d'un bug cité, répondre de nouveau : beaucoup d'utilisateurs remontent leur note.
- Demande d'avis dans l'app : API native (`StoreReview`) après un moment positif (ex. 7e jour d'utilisation, après un export réussi), jamais après une erreur, au plus quelques fois par an (règle Apple).
- Claude rédige ; Yoss publie, ou Claude saisit via ego-browser sur demande.

### 4.5 Surveillance technique et coûts

| Outil | Ce qu'on surveille | Seuil d'alerte | Qui configure |
|---|---|---|---|
| **Sentry** (`tesfa-f9.sentry.io`) | Taux sans crash, nouvelles erreurs, régressions | Nouvelle erreur → e-mail ; crash-free < 99,5 % → critique | C |
| **Google Cloud Billing** (projet `samaye-53723`) | Coût mensuel Firebase | Budget 25 € au lancement, alertes 50/90/100/150 % ; relever à 60 € vers 500 utilisateurs | C (gcloud autorisé) |
| **Firestore** | Lectures/jour (< 50 k au lancement), écritures (< 10 k) | Pic × 3 d'un jour à l'autre = enquête | C (rapport) |
| **Cloud Functions** | Erreurs/jour (objectif 0), p99 < 5 s | Toute erreur sur `revenueCatWebhook` = priorité | C |
| **AssemblyAI** | Heures transcrites, solde pay-as-you-go | Alerte de solde / montant mensuel **[à confirmer : options d'alerte du compte]** | Y (carte) |
| **Anthropic (Claude Haiku)** | Dépense mensuelle du parsing vocal | Limite de dépense mensuelle dans la console (ex. 20 €) | Y |
| **RevenueCat** | MRR, essais, conversion, churn, `BILLING_ISSUE` | Webhook en échec = critique | C |
| **Stores** | Rapports de plantage Play (ANR), avis, état des revues | — | C (lecture) |

Coût voix attendu : ~0,1 centime par commande ; 500 utilisateurs × ~15/jour (si tous Premium, cas extrême) ≈ 0,50 €/utilisateur/mois. Le plafond gratuit de 3/jour limite fortement l'exposition.

### 4.6 Juridique, fiscal et administratif (SASU française)

**Rappel** : à valider avec l'expert-comptable ; les liens officiels sont donnés pour vérification.

**Une fois, avant de vendre :**
- [ ] Médiateur de la consommation signé et affiché (CGU, mentions légales) — [economie.gouv.fr/mediation-conso](https://www.economie.gouv.fr/mediation-conso). **Y**
- [ ] CGU/CGV avec prix TTC, durée, renouvellement automatique, essai, résiliation via le store, droit de rétractation (renonciation au démarrage du contenu numérique), médiateur. **C rédige / Y valide (idéalement relu par un avocat)**
- [ ] **Numéro de TVA intracommunautaire** de TESFA actif (nécessaire pour facturer Apple/Google Irlande et pour les achats de services UE/hors UE). **Y**
- [ ] Formulaires fiscaux US : **W-8BEN-E** dans App Store Connect et dans le profil de paiement Google (convention France-USA pour éviter la retenue de 30 % sur les ventes aux États-Unis, même marginales). **Y**
- [ ] Statut de commerçant **DSA** sur les deux stores. **Y**
- [ ] Assurance **RC professionnelle** (édition de logiciel, données de santé d'enfants) — devis à demander **[à confirmer : 2-3 assureurs]**. **Y**
- [ ] RGPD : registre des traitements à jour, **analyse d'impact (AIPD)** recommandée pour des données de santé d'enfants, décision écrite sur la désignation d'un DPO (pas forcément obligatoire à cette échelle) — [cnil.fr](https://www.cnil.fr). **C rédige le brouillon / Y signe**
- [ ] **Point de vigilance HDS** : vérifier si l'hébergement relève de la certification Hébergeur de Données de Santé (en principe non pour du suivi par les parents eux-mêmes, mais le rapport destiné au pédiatre rapproche du « suivi » de soins) — question à poser à un avocat santé/numérique ou à la CNIL. Idem : aucune promesse médicale dans les fiches (éviter la qualification de dispositif médical). **Y**

**Comment l'argent circule (à valider) :** Apple et Google vendent à l'utilisateur, encaissent et reversent la TVA française de 20 % sur le prix TTC. TESFA facture en réalité une prestation à Apple Distribution International et à Google Commerce Ltd (Irlande) : opération entre entreprises UE, en principe **hors TVA française avec autoliquidation**, qui peut imposer une **Déclaration Européenne de Services (DES)** mensuelle — à confirmer avec l'expert-comptable, y compris si TESFA relève de la franchise en base de TVA. Les achats de services étrangers (Google Cloud, Anthropic, AssemblyAI, RevenueCat, Sentry, Apple Developer) relèvent aussi en principe de l'autoliquidation.

**Récurrent :**

| Fréquence | Tâche | Qui |
|---|---|---|
| Chaque semaine | Justificatifs (factures SaaS, relevés de paiement Apple/Google) dans l'outil comptable | Y (C peut lister les factures attendues) |
| Mensuel / trimestriel | Déclaration de TVA (CA3) selon le régime ; DES si applicable | Expert-comptable / Y |
| Mensuel | Rapprocher les virements Apple (paiement ~45 jours après la fin du mois fiscal Apple) et Google (mensuel, au-delà d'un seuil minimal) avec RevenueCat | Y |
| Selon le choix de rémunération | **URSSAF** : président de SASU assimilé salarié ; **sans rémunération, pas de cotisations** ; si salaire, bulletins + DSN mensuelle (via le comptable). Dividendes : prélèvements sociaux + flat tax | Y + comptable |
| Annuel | Comptes annuels, liasse fiscale, **impôt sur les sociétés** (acomptes si dû), approbation des comptes dans les 6 mois, dépôt au greffe | Comptable / Y |
| Annuel | **CFE** (exonérée l'année de création ; déclaration initiale l'année de création **[à confirmer]**) | Y |
| Annuel | Renouvellement Apple Developer (99 $/an), vérifier les accords Apple/Google (nouvelles versions à accepter, sinon ventes suspendues) | Y |
| Depuis le 1/9/2026 | **Facturation électronique** : obligation de pouvoir *recevoir* des factures électroniques via une plateforme agréée (émission obligatoire pour les TPE au 1/9/2027) **[à confirmer]** | Y + comptable |
| Tous les 3 ans | Renouvellement de l'adhésion au médiateur | Y |

### 4.7 Outils (la pile la plus petite qui suffit)

| Besoin | Outil | Coût | Note |
|---|---|---|---|
| Hébergement, auth, base, fonctions | Firebase (UE) | ~16 € → ~60 €/mois à 500 utilisateurs | Déjà en place |
| Abonnements | RevenueCat | Gratuit sous 2 500 $ de revenu mensuel suivi | Déjà intégré |
| Voix | AssemblyAI + Claude Haiku | ~0,1 c/commande | Pay-as-you-go |
| Erreurs | Sentry | Offre gratuite **[à confirmer : quota du plan actuel]** | Déjà en place |
| Stores | Apple Developer 99 $/an, Google Play 25 $ (payé) | — | — |
| Support | Boîte `support@suivibaby.com` + réponses types | Selon l'hébergeur e-mail actuel | Pas de helpdesk payant avant ~50 e-mails/semaine |
| Banque + comptabilité | Banque pro + expert-comptable en ligne | ~110 €/mois (chiffre CONTEXT) | Choisir un cabinet qui connaît les revenus des stores |
| Médiateur | CM2C | ~48 € TTC / 3 ans + 36 € par médiation | — |

### 4.8 Répartition des rôles

**Ce que seul Yoss peut faire** (identité, signature, argent, responsabilité légale) :
- Comptes et accords : Apple (entité TESFA, D-U-N-S, Paid Apps, DSA, W-8BEN-E, banque), Google (profil marchand, DSA, fiscalité, demande d'accès production), RevenueCat (création du projet, dépôt de la clé .p8 et du compte de service Play).
- Contrats : médiateur, assurance, expert-comptable, domiciliation éventuelle, avocat.
- Banque, cartes (AssemblyAI, Anthropic, Apple), virements, déclarations fiscales et sociales, signature des comptes.
- Recrutement des testeurs, achats réels de test, envoi des e-mails support et des posts sous son nom.
- Décisions : prix, offre, « go » de chaque PR, passage en Production (Android) et publication iOS.

**Ce que Claude peut faire** :
- Code : rapport pédiatre, suppression de la limite de partage, plafond voix, clés SDK publiques RevenueCat, correctifs, tests, PR, revues.
- Builds et envoi en test (autorisés) : iOS EAS + soumission App Store Connect/TestFlight, Android .aab local + Alpha. Production : sur accord.
- Saisie dans les consoles avec la session de Yoss (ego-browser) : fiches stores, produits et prix validés, étiquettes de confidentialité, IARC, notes de revue, offerings RevenueCat.
- Captures d'écran, données du compte démo, pages légales (médiateur), site, FAQ.
- Configuration du monitoring (alertes budget GCP, Sentry), rapport hebdomadaire chiffré.
- Rédaction : messages de recrutement, réponses types support et avis, réponses au questionnaire d'accès production Google, posts de lancement, fiche presse, brouillons RGPD (registre, AIPD).
- Ce que Claude ne fait jamais : manipuler les secrets (.p8, JSON de compte de service), signer ou accepter un accord au nom de TESFA, saisir des données bancaires ou fiscales.

---

## 5. Étape 4 : les 30 premiers jours après le lancement public

### 5.1 Tableau hebdomadaire (préparé par Claude chaque lundi)

| Indicateur | Cible | Déclencheur d'action |
|---|---|---|
| Installs / jour | 10-20 en moyenne | < 5/jour pendant 7 jours → changer de canal, pas de produit |
| Activation (enfant + ≥ 3 événements J1) | ≥ 60 % | < 40 % → revoir l'accueil (onboarding), la saisie vocale au premier lancement |
| Rétention J7 | ≥ 35 % | < 20 % → entretiens avec 5 utilisateurs partis |
| Commandes vocales / utilisateur actif / jour | suivre | Beaucoup d'utilisateurs bloqués à 3/jour → le paywall voix doit être visible à ce moment |
| Vues paywall → essai/achat | ≥ 5 % | < 2 % → retravailler le paywall (accroches, ordre des offres, rapport pédiatre en tête) |
| Essai annuel → payant | ≥ 40 % | < 25 % → rappel avant fin d'essai, valeur montrée pendant l'essai |
| Abonnés payants cumulés | 22 (infra couverte) puis 75 (SASU couverte) | Pas de progression sur 3 semaines → revue d'offre |
| Taux sans crash | ≥ 99,5 % | < 99 % → gel des fonctionnalités, correctifs seulement |
| Note moyenne | ≥ 4,5 | < 4,2 → analyse des avis négatifs |
| Délai de 1re réponse support | < 24 h | > 48 h → réponses types / FAQ |
| Coût infra du mois | ≤ prévision × 1,5 | Au-delà → enquête Firestore/voix |

### 5.2 Revues

- **J+7 (mar. 12/1)** : quelque chose casse-t-il ? Où les gens abandonnent-ils (onboarding, première saisie, partage) ? Quel canal a vraiment amené des utilisateurs ?
- **J+14 (mar. 19/1)** : la rétention J7 tient-elle ? Combien d'utilisateurs voient le paywall, et à quel moment ? Les premiers essais annuels convertissent-ils ?
- **J+30 (jeu. 4/2)** : combien d'abonnés vs 22 et 75 ? Coût par utilisateur actif ? Faut-il ajuster l'offre (ex. quota voix gratuit, place du rapport pédiatre) ou seulement la distribution ? Décider la suite : widget d'ajout rapide, élargissement aux pays francophones, ou acquisition (sages-femmes/PMI).

---

## 6. Registre des risques (les 10 plus probables)

| # | Risque | Probabilité | Gravité | Plan |
|---|---|---|---|---|
| 1 | **Testeurs Android insuffisants ou qui se désinscrivent** → le compteur de 14 jours repart | Élevée | Élevée (bloque Android) | Recruter 10 au lieu de 6, contrôle quotidien de la liste, message de rappel J7 ; ne pas retirer de testeurs pendant les 14 jours |
| 2 | **Conversion d'entité Apple / D-U-N-S lente** (1-3 semaines) | Moyenne | Élevée (bloque iOS et les tests sandbox) | Lancer jeudi 12/11 ; relancer le support Apple à J+5 ; si bloqué mi-décembre, inverser l'ordre : soft launch Android d'abord |
| 3 | **Refus de l'accès production Google** (test jugé insuffisant) | Moyenne | Élevée (+14 jours) | Faire vivre le test : 2 builds pendant la période, retours écrits des testeurs, réponses précises au questionnaire (Claude les rédige à partir de faits) |
| 4 | **Rejet App Store** (3.1.2 abonnements, compte démo, mentions santé, 5.1.1 données) | Moyenne | Moyenne (2-5 jours) | PR #70, CGU/confidentialité dans le paywall, compte démo complet, aucune promesse non livrée, notes de revue claires |
| 5 | **Conversion faible** (offre gratuite trop généreuse) | Élevée | Élevée (rentabilité) | Mesurer dès le soft launch ; leviers dans l'ordre : moment du paywall (quota voix, rendez-vous pédiatre), rapport pédiatre mis en avant, puis seulement l'offre |
| 6 | **Bug de paiement ou de droits Premium** (webhook, restauration, transfert) | Moyenne | Élevée (remboursements, avis) | Tests de bout en bout avant soft launch, alerte sur les erreurs du webhook, correction manuelle de `subscriptions/` documentée, point TRANSFER (S14) à traiter si un cas apparaît |
| 7 | **Fondateur seul indisponible** (maladie, fatigue, autre travail) | Moyenne | Moyenne | Réponses types + message d'absence, astreinte légère le week-end, pas de release le vendredi, Claude prépare le rapport quotidien |
| 8 | **Dérive des coûts** (boucle Firestore, abus voix, AssemblyAI) | Faible-moyenne | Moyenne | Alertes budget GCP 50/90/100/150 %, limites de dépense Anthropic/AssemblyAI, plafonds voix côté serveur |
| 9 | **Question juridique santé** (HDS, dispositif médical, RGPD sur données d'enfants) ou plainte | Faible | Élevée | Avis d'un avocat avant le lancement public, AIPD, wording « notes des parents, pas un avis médical », réponse RGPD sous 1 mois |
| 10 | **Mauvais avis publics ou panne visible le jour J** | Moyenne | Moyenne | Réponse sous 24 h, correctif rapide, déploiement progressif Android, revue accélérée Apple si nécessaire |

Risques secondaires à garder en tête : accords stores non renouvelés (ventes suspendues), adresse personnelle exposée par le DSA, période des fêtes (revues lentes, attention des parents dispersée), oubli d'une obligation fiscale (DES, CFE, facturation électronique).

---

## 7. Questions ouvertes (à trancher par Yoss)

1. Le compte Apple Developer est-il individuel ou déjà au nom de TESFA ? (détermine le délai iOS : quelques jours ou 2-3 semaines)
2. Le compte Google Play « dev.lel » est-il personnel ? (la règle des 12 testeurs × 14 jours s'applique aux comptes personnels récents ; créer un compte organisation obligerait à republier l'app sous un nouvel identifiant — non recommandé)
3. Adresse publique pour le DSA : siège actuel ou domiciliation ?
4. Rémunération du président en 2027 (aucune, salaire, dividendes) → impact URSSAF.
5. Régime de TVA de TESFA (franchise ou réel) et besoin de DES → question au comptable cette semaine.
6. Avocat pour relire CGU/CGV, question HDS et wording santé : qui et quel budget ?
7. Date de lancement public : 5/1/2027 (recommandé) ou plus tôt (15/12) si tout est vert dès fin novembre — au risque de lancer pendant les fêtes.
