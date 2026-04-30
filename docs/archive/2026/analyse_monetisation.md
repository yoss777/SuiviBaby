# Audit UX & Stratégie — Samaye / SuiviBaby
> Analyse réalisée par un profil Senior UX (15 ans — agences de comm, digital, L'Oréal)
> Document source : `todo_monetisation.md` — Version 2026-03-29

---

## Score global : 74 / 100

| Dimension | Score |
|---|---|
| Stratégie de monétisation | 82% |
| Architecture de tiers | 78% |
| Réalisme financier | 80% |
| Différenciation concurrentielle | 68% |
| Plan d'acquisition | 62% |
| Expérience utilisateur (UX flow) | 55% |
| Conformité RGPD / légal | 35% |
| Onboarding & activation | 30% |
| Stratégie B2B / Pro | 25% |
| Accessibilité | 10% |

**Verdict senior** : C'est un document de stratège, pas de développeur qui "fait au feeling". La posture éthique est une vraie arme. Les 3 trous béants (onboarding, RGPD, B2B Pro) sont tous adressables avant le lancement store — aucun ne nécessite de repenser l'architecture.

> **Risque #1** : Le risque n'est pas technique. C'est de lancer un paywall sans onboarding structuré. Sans valeur ressentie à J7, même le meilleur paywall contextuel ne convertira pas. C'est le chantier prioritaire absolu.

---

## Partie 1 — Forces

### Forces stratégiques

#### Différenciateur #1 — Charte éthique gravée dans le marbre
Zéro pub, opt-in strict, respect nocturne (22h–7h), jamais pendant un épisode de santé. C'est du L'Oréal level : un *brand promise* tangible et vérifiable. Dans un marché où Baby Tracker et Huckleberry monétisent via la data ou la pub, c'est un positionnement premium difficile à copier car il implique de renoncer à des revenus.

#### Différenciateur #2 — Free tier généreux sur l'essentiel
Ne pas brider le suivi bébé lui-même est une décision courageuse et stratégiquement juste. Cela maximise l'engagement quotidien, crée l'habitude, et construit la dépendance émotionnelle avant le paywall. Les 90 jours d'historique sont le bon curseur : suffisants pour la routine, insuffisants pour la valeur pédiatre.

#### Force — IA comme game changer documenté
La feature map IA (7 items) est cohérente et bien priorisée. Le calcul de rentabilité (0,10€/user/mois vs 3,99€) est convaincant. Le gating basiques/gratuit vs avancés/premium est la bonne mécanique. Peu de concurrents FR ont cette couche intelligente.

#### Force — Grandfather Plan — maturité produit rare
Anticiper la migration des early adopters est un signal de maturité business inhabituel à ce stade. Chez L'Oréal, on appelle ça "récompenser la fidélité" — c'est un levier de recommandation organique puissant et ça évite le bad buzz au lancement du paywall.

### Forces opérationnelles

#### Force — Parrainage gamifié + canal maternités
Infrastructure déjà codée (ReferralCard, tiers Parrain/Ambassadeur/Super Parent). Le canal maternités est le seul canal avec un ROI supérieur à 100× — coût impression ~0,05€/lead vs CPI pub de 1–3€. C'est le canal à activer en priorité absolue.

#### Force — KPIs et scénarios financiers réalistes
Les 3 scénarios (organique / modéré / accéléré) sont honnêtes et documentés. Les métriques RevenueCat (trial activation, trial-to-paid, LTV par canal) sont exactement celles qu'un investisseur ou un board attend. Scénario B net ~10K€ an 1 est conservateur mais défendable.

#### Force — Grace period & billing retry pensés en amont
La majorité des apps indie ratent ce point. Gérer le `billing_issue` dans PremiumContext au lieu de couper brutalement l'accès réduit significativement le churn involontaire — estimé à 20–40% du churn total dans les apps d'abonnement.

#### Force — Courbes OMS superposées aux données bébé
Feature Premium à très forte valeur perçue médicale. Un parent qui peut montrer à son pédiatre "voilà la courbe de poids avec la norme OMS" passe de user à ambassadeur. C'est le type de feature qui se raconte — donc virale par nature.

---

## Partie 2 — Faiblesses

### Faiblesses critiques

#### CRITIQUE — Confusion de marque : Samaye vs SuiviBaby
Le document mélange les deux noms. "Samaye" est beau, différent, mémorable. "SuiviBaby" est descriptif mais générique et difficile à défendre en ASO face à "Baby Tracker". Il faut trancher maintenant : **un nom = une marque**. Si c'est Samaye, l'ASO doit compenser avec des mots-clés dans le sous-titre store. Si c'est SuiviBaby, retravailler l'identité visuelle pour la distinguer des clones.

#### CRITIQUE — Onboarding absent du plan — pourtant J7 est cité
Le document mentionne "le pic de churn est à J7" comme un fait établi, mais ne propose aucune séquence d'activation J0–J7. C'est la lacune la plus dangereuse. Sans onboarding structuré (premier ajout de bébé → premier tracking → première valeur ressentie < 3 min), le paywall ne convertira pas. Il faut un flow de 3–5 étapes maximum avec valeur immédiate avant la première proposition Premium.

#### CRITIQUE — RGPD et données enfants quasi absent
Données de santé d'un mineur = catégorie ultra-sensible en droit européen. Le document l'effleure (mention politique de confidentialité). Il manque :
- minimisation des données IA
- durée de rétention des données bébé post-désabonnement
- droit à l'oubli pour les données d'un enfant
- consentement parental explicite

Sans ce volet, un article négatif peut tuer le produit du jour au lendemain.

### Faiblesses structurelles

#### Modéré — Badge Premium sur profil — valeur nulle
Samaye n'est pas une app sociale. Les parents ne se "montrent" pas leur statut Premium entre eux. Ce badge consomme de l'espace UI pour zéro valeur perçue. À remplacer par quelque chose d'utile : "Membre Samaye+ depuis 8 mois" dans les settings, ou une animation subtile sur le header.

#### Modéré — Lifetime deal à 79,99€ — timing risqué
Proposer un lifetime dès le lancement signale implicitement "on n'est pas sûr d'être là dans 2 ans". Chez L'Oréal, on appelait ça un signal prix négatif. À réserver aux campagnes de boost cash flow ponctuelles (Product Hunt, lancement store), pas en permanence dans le paywall.

#### Modéré — Canal social media sous-dimensionné en ressources
"3 posts/semaine + 2 stories/jour + TikTok + groupes Facebook" pour une équipe probablement solo. C'est un plan d'agence de communication, pas de startup. Sans community manager dédié, cette cadence est insoutenable. Mieux vaut 1 canal excellence (Instagram Reels, format viral) que 4 canaux médiocres.

#### Modéré — Écart Premium / Famille trop faible
3,99€ → 6,99€ = +75% pour "5 comptes liés". Pour une famille de 2 parents + 1 grand-parent + 1 nounou, le calcul est favorable au tier Famille. Mais la valeur perçue du dashboard partagé temps réel n'est pas assez mise en avant pour justifier un tier séparé. Risque de cannibalisation du tier Premium.

### Risques à surveiller

#### Risque — Accessibilité non mentionnée
App de santé + données enfant = obligation légale d'accessibilité en France (RGAA). Un parent malvoyant qui allaite la nuit est un cas d'usage réel. VoiceOver/TalkBack, contraste WCAG AA, tailles de police adaptatives — aucune mention dans le plan. C'est aussi un vecteur de PR positif ("l'app pensée pour tous les parents").

#### Risque — Localisation : marché FR uniquement
Aucune stratégie internationale mentionnée. Le marché belge, suisse et québécois sont des extensions naturelles à coût quasi nul (même langue). Le marché espagnol/latin (18M naissances/an) est accessible avec une traduction. C'est le levier de 10× le plus évident pour l'an 2.

#### Risque — Winback J+3 trop agressif
Contacter un churner 3 jours après son annulation peut renforcer la décision. Les benchmarks SaaS conseillent J+14 à J+30 avec une offre différente (ex : downgrade vers un tier intermédiaire plutôt qu'une réduction). J+3 = risque de bad review App Store.

---

## Partie 3 — Plan de différenciation

### Initiative 1 — Onboarding "Moment Magie" J0–J7 `PRIORITÉ 1`

Flow en 4 étapes : ajout bébé → 1er tracking en 30s → première insight IA → invitation co-parent. Chaque étape = victoire émotionnelle.

**Objectifs :**
- 80% de complétion avant J3
- Proposer Premium seulement après la 1ère semaine de données, pas à l'install
- Inclure une célébration visuelle au 1er tracking ("Bravo, Léa est bien suivie !")

**Pourquoi c'est différenciant :** Aucun concurrent FR ne propose un onboarding émotionnel. Ils déversent tous les features d'un coup. Un parcours narratif "votre premier jour avec Samaye" crée une connexion affective immédiate avec le produit.

---

### Initiative 2 — Mode Nuit — interface pensée pour 3h du matin `PRIORITÉ 1`

Dark mode adaptatif (automatique entre 22h et 7h), grands boutons tactiles, actions en 1 tap sans déverrouillage, retour haptique silencieux.

**Pourquoi c'est différenciant :** C'est le moment le plus fréquent d'utilisation — et celui où 0 concurrent n'optimise l'UX. Coût dev faible, valeur perçue extrêmement forte. Peut devenir le hook marketing principal : *"La seule app pensée pour le parent à 3h du matin."*

**Axes d'implémentation :**
- Détection automatique via l'heure système (pas besoin d'un toggle manuel)
- Réduction des étapes de saisie la nuit (mode "rapide" avec valeurs par défaut)
- Suppression des animations lourdes en mode nuit (économie batterie + discrétion)

---

### Initiative 3 — Rapport Pédiatre PDF Premium `PRIORITÉ 1`

Pas juste un export brut : un document A4 structuré, branded Samaye, avec courbes OMS intégrées, résumé des 3 derniers mois par catégorie, section "points d'attention" générée par l'IA.

**Pourquoi c'est différenciant :** Un outil que le pédiatre gardera. C'est l'argument de vente le plus fort pour les abonnements annuels — les parents renouvellent pour leur prochain rendez-vous (tous les 2–3 mois). Ce PDF crée aussi un moment de partage naturel : le parent montre l'app à son médecin, qui la recommande à ses autres patients.

**Structure suggérée du rapport :**
1. Couverture : nom du bébé, période, photo optionnelle
2. Synthèse 1 page : poids, taille, périmètre crânien avec courbes OMS
3. Alimentation : fréquences, quantités, tendances
4. Sommeil : durées, nuits complètes, évolution
5. Santé : vaccins administrés, rappels à venir
6. Points d'attention IA : 3 observations contextualisées

---

### Initiative 4 — Milestones & Capsule Souvenir `PRIORITÉ 2`

Célébrer automatiquement les jalons (1 mois de suivi, 100e tétée, premier sommeil de 6h, prise de poids OMS atteinte). Notification push avec animation + option "partager ce moment".

**Pourquoi c'est différenciant :** Pas juste de la gamification : de la mémoire parentale. Les parents Premium reçoivent une "capsule mensuelle" PDF/image shareable. Coût marginal nul, impact sur le churn M3–M6 estimé à -15%. C'est aussi un vecteur d'acquisition organique : les parents partagent les milestones sur Instagram/WhatsApp avec le logo Samaye.

---

### Initiative 5 — Intégration Apple Health / Google Health Connect `PRIORITÉ 2`

Synchronisation bidirectionnelle du poids, de la taille, des mesures de sommeil.

**Pourquoi c'est différenciant :** Positionne Samaye comme hub de santé bébé dans l'écosystème santé du parent. Feature très visible dans la fiche App Store ("Compatible Apple Health") — différenciateur ASO fort. Aucun concurrent FR ne l'a implémenté correctement.

---

### Initiative 6 — Tier "Samaye Pro" pour professionnels de santé `PRIORITÉ 3`

Dashboard multi-patients pour pédiatres et sages-femmes libérales (suivi de 10–50 bébés, alertes automatiques, export dossier patient).

**Modèle économique :** 29€/mois ou 199€/an par professionnel.

**Pourquoi c'est différenciant :** Canal d'acquisition exceptionnel — 1 pédiatre convaincu = 500 familles converties sur 3 ans. Effet réseau puissant. Les données anonymisées (avec accord IRB) permettent des partenariats de recherche qui renforcent la crédibilité scientifique de l'app.

---

## Synthèse exécutive

**Ce qui est excellent.** La charte éthique (zéro pub, respect nocturne, jamais pendant un épisode de santé) est le vrai avantage concurrentiel — pas une feature, une promesse de marque. C'est ce que L'Oréal appelle un *brand truth* : vérifiable, différenciant, difficile à copier car il implique de renoncer à des revenus. Le modèle RevenueCat + partenariats maternités + IA est structurellement solide.

**Ce qui est dangereux.** L'onboarding est le grand absent. J7 est cité comme pic de churn, mais aucun flow J0–J7 n'existe dans le plan. Sans parcours d'activation structuré, le paywall le plus intelligent du monde ne convertira pas. C'est le chantier n°1 avant toute soumission store.

**Ce qui différencierait vraiment Samaye.** Le "Mode Nuit" (interface optimisée pour 3h du matin) est l'angle mort que 0 concurrent n'adresse — et c'est précisément le moment d'usage le plus fréquent. Combiné au rapport PDF pédiatre intelligent (avec courbes OMS intégrées), Samaye passe d'une app utilitaire à un compagnon de parentalité irremplaçable.

---

*Audit rédigé le 31 mars 2026*
