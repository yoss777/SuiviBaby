# Offre Premium — cible et écarts d'implémentation

> Créé le 30 octobre 2026. Complète [todo_monetisation.md](../todo_monetisation.md), qui reste la référence stratégique.

## Contexte

Le 30 octobre 2026, l'écran Premium ([app/settings/premium.tsx](../app/settings/premium.tsx)) a été aligné sur ce que l'app fait réellement. Plusieurs promesses ont été retirées parce qu'elles n'étaient pas implémentées. Vendre un abonnement sur une fonctionnalité absente est une pratique commerciale trompeuse, et c'est un motif de rejet App Store (guideline 3.1.2).

**Ces promesses restent la cible produit.** Ce document liste ce qu'il faut implémenter. Il donne aussi le texte exact à remettre dans le paywall une fois chaque fonctionnalité livrée.

Règle : une ligne ne revient dans le paywall, sur le site (`public/index.html#tarifs`) ou dans les fiches des stores qu'une fois la fonctionnalité livrée en production et effectivement réservée à l'offre annoncée.

## Fonctionnalités retirées du paywall, à implémenter

| # | Offre | Libellé retiré (à remettre tel quel) | État au 30/10/2026 |
|---|---|---|---|
| 1 | Gratuit / Premium | `"Historique 90 jours"` / `"Historique illimité"` | `getHistoryCutoffDate()` existe dans `services/premiumGatingService.ts` mais n'est appelée nulle part : aucune limite n'est appliquée. Le prompt `history_limit` existe mais n'est jamais affiché. |
| 2 | Premium | `"Widgets iOS/Android"` | Aucun widget dans le projet. |
| 3 | Premium | `"Rapport pédiatre PDF"` | Seul l'export PDF générique existe. Il n'y a pas de rapport formaté pour le pédiatre. |
| 4 | Famille | `"Dashboard partagé temps réel"` | Tout le monde a déjà la synchronisation temps réel, quelle que soit l'offre. Pour que la ligne ait un sens, il faut une vue réservée à Famille. |
| 5 | Famille | `"Notifications croisées"` | Introuvable dans le code. Cible : « Papa a donné le biberon à 14h ». |
| 6 | Toutes | Sous-titre `"14 jours d'essai gratuit, sans engagement."` et FAQ « les 14 premiers jours sont gratuits » | Le code reconnaît `periodType === "TRIAL"`, mais la durée dépend des offres d'introduction configurées dans App Store Connect et Google Play Console, ce qui n'est pas vérifié. |
| 7 | — | Message `export_limit` : « …et des rapports pédiatre » | Retiré, et lié au point 3. |

### 1. Historique limité (Gratuit 90 jours / Premium illimité)

- Appliquer `getHistoryCutoffDate()` dans les requêtes des écrans d'historique : journal / chrono, stats, export, croissance.
- Ne jamais supprimer de données. Il s'agit seulement de masquer l'affichage, pour respecter la promesse « vos données sont conservées » (CGU §9).
- Afficher le prompt `history_limit` quand l'utilisateur atteint la limite.
- À trancher : les courbes de croissance doivent-elles rester complètes en gratuit ? Elles ont un intérêt médical.
- **Remettre dans le paywall :** `"Historique 90 jours"` (Gratuit) et `"Historique illimité"` (Premium). Remettre aussi dans la FAQ : « Seul l'accès à l'historique au-delà de 90 jours et les fonctionnalités Premium sont désactivés. »

### 2. Widgets iOS / Android

- iOS : WidgetKit, via un module Expo config plugin et un App Group pour partager les données. Android : Glance ou AppWidget.
- Contenu minimal : dernier repas, dernier sommeil, dernière couche, et un bouton d'ajout rapide.
- Gating Premium : il faut décider ce que voit un utilisateur gratuit, soit un widget verrouillé, soit aucun widget.
- **Remettre :** `"Widgets iOS/Android"` (Premium).

### 3. Rapport pédiatre PDF

- PDF dédié avec :
  - une période choisie ;
  - les courbes OMS (poids, taille, périmètre crânien) ;
  - des synthèses repas / sommeil / couches ;
  - les épisodes de santé (température, symptômes, médicaments) ;
  - les vaccins ;
  - une zone de notes.
- Rester factuel : aucune interprétation médicale (avertissement médical, CGU §3).
- **Remettre :** `"Rapport pédiatre PDF"` (Premium), et dans `export_limit` : « Passez à Premium pour des exports illimités et des rapports pédiatre. »

### 4. Dashboard partagé (Famille)

- Définir ce qui distingue Famille. Par exemple : vue « qui a fait quoi aujourd'hui » par membre, activité de chaque aidant, passation de garde (« Nounou → Maman, 18h »).
- Ajouter la fonctionnalité dans `FAMILY_ONLY_FEATURES` (`contexts/PremiumContext.tsx`), qui est vide aujourd'hui.
- **Remettre :** `"Dashboard partagé temps réel"` (Famille), avec éventuellement un libellé plus précis.

### 5. Notifications croisées (Famille)

- Cloud Function déclenchée à la création d'un événement. Elle envoie un push Expo aux autres membres ayant accès à l'enfant, sauf à l'auteur.
- Réglages par utilisateur : quels types d'événements, plages horaires (respect de la nuit 22h-7h), activation par enfant.
- Base légale : consentement. C'est une notification opt-in, à documenter dans la politique de confidentialité (finalité « Rappels et notifications »).
- Ajouter la fonctionnalité dans `FAMILY_ONLY_FEATURES`.
- **Remettre :** `"Notifications croisées"` (Famille).

### 6. Essai gratuit de 14 jours

- Configurer une offre d'introduction « essai gratuit 14 jours » sur les produits annuels et mensuels, dans App Store Connect et Google Play Console.
- Afficher la durée réelle lue depuis RevenueCat (`package.product.introPrice`, ou `subscriptionOptions` sur Android) plutôt qu'un texte en dur. Si aucun essai n'est configuré, ne rien afficher.
- **Remettre :** le sous-titre et la FAQ, avec la durée dynamique.

## Incohérences de l'offre à trancher

1. **Famille vs Premium.** Premium affiche « Partage illimité » et Famille « 5 comptes liés ». Dans le code, Famille donne exactement les mêmes droits que Premium : seule la limite gratuite de 2 co-parents est appliquée (`FREE_MAX_SHARED_USERS` dans `functions/index.js`), et rien n'impose 5. Deux options :
   - limiter le partage Premium (par exemple 3 personnes) et réserver 5 comptes à Famille, avec application côté serveur ;
   - ou fusionner Famille dans Premium (option prévue dans `todo_monetisation.md` si la conversion Famille reste < 1 %).
2. **Statistiques avancées et courbes OMS.** Le paywall et le site les présentent comme Premium, mais elles ne sont pas réservées dans le code : un utilisateur gratuit y a accès. Il faut soit appliquer la restriction, soit les sortir des avantages Premium.
3. **Achat « à vie ».** Il est présent dans l'app et dans les CGU (§9). Il faut vérifier qu'il est bien configuré dans RevenueCat et dans les deux stores.

## Où mettre à jour quand une fonctionnalité est livrée

- `app/settings/premium.tsx` : `PLANS[].features` et `FAQ_ITEMS`
- `services/premiumGatingService.ts` : messages d'upgrade
- `contexts/PremiumContext.tsx` : `FAMILY_ONLY_FEATURES` et le gating
- `public/index.html` : section `#tarifs`, et section « bento » si la fonctionnalité y est mise en avant
- Fiches App Store et Google Play : description et captures
- `public/terms.html` et `app/settings/terms.tsx` §9, si les conditions de l'offre changent
