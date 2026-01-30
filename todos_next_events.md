# TODO - Next Events (MVP+)

## Prioritaire: Sommeil

- Chronomètre de sommeil: gros bouton "Dodo" pour démarrer/arrêter un timer.
- Visualisations et statistiques:
  - Frise 24h avec barres de sommeil.
  - Totaux par jour/semaine + comparaison aux moyennes recommandées.
  - Corrélation simple avec d'autres événements (ex: sommeil après biberon X ml).
- Saisie simplifiée: sélecteur visuel des heures début/fin (plutôt que champs texte).
- Vue "Nuit": thème sombre automatique la nuit.
- Widget accueil: démarrer/arrêter le chrono sans ouvrir l'app (à étudier).

## ✅ Fait: Soins / Santé (MVP)

- ✅ Service + types: Température, Médicament, Symptôme, Vaccin, Vitamine.
- ✅ Screen Soins complet (Plus) avec logique alignée aux autres écrans (headers, filtres, load more).
- ✅ Bottom sheet Soins: breadcrumbs vaccin/vitamine, listes + recherche, “Autre” avec champ libre.
- ✅ Vitamines D/K: quantité en gouttes (picker +/− auto).
- ✅ Température: picker +/− borné 34–45°C.
- ✅ Vaccins: dose affichée (readonly sauf “Autre”), liste affiche dose.
- ✅ Home: quick add Soins + redirections edit vers Soins.
- ✅ Chrono: redirections edit Soins.

## ✅ Fait: Routines (MVP)

- ✅ Service + type: Bain.
- ✅ Screen Routines (Plus) avec Sommeil + Bain + Templates rapides.
- ✅ Bottom sheet Bain aligné aux autres écrans (date/heure, notes, actions).
- ✅ Home: quick add Routines + redirections edit vers Routines.
- ✅ Chrono: redirections edit Routines.

## Propositions pour enrichir l'UX (après Sommeil)

- Symptômes / Santé rapide (fièvre, toux, nez bouché, vomi, diarrhée, dents).
- Médicaments / Traitements (nom + dose + heure).
- Humeur / Bien‑être (tags rapides ou slider simple).
- Note rapide (événement libre avec texte). (à étudier)

## Types d'événements supplémentaires pertinents

- Température: suivi fièvre/état (important pour nourrissons).
- Médicaments: traitements courants (antibiotiques, paracétamol) avec dosage/fréquence.
- Bain: routine d'hygiène, utile pour patterns sommeil.
- Activités/Éveil: jalons (premier sourire, tummy time, etc.).
- Sorties: contexte global, impact sur routines.

## Améliorations UX pour les événements existants

- Photos attachées: utile pour selles, éruptions, croissance.
- Rappels/Alertes basés sur les patterns (ex: "Dernière tétée il y a 3h").
- Relations entre événements: lier les événements proches et corrélations simples.
- Templates rapides: routines courantes (coucher, check-up complet).
- Mode hors-ligne robuste: indicateur sync clair + queue visible.

## Structure écrans suggérée

- **Soins / Santé**: Température, Symptômes, Médicaments, Vaccins, Vitamines.
- **Routines**: Sommeil, Bain, Templates rapides.
- **Éveil / Activités**: Activités (tummy time, jeux, lecture, etc.) + Jalons.
- **Sorties / Contexte**: Sorties, Notes rapides.

Option retenue (4 écrans):

- **Soins / Santé**
- **Routines**
- **Éveil / Activités**
- **Sorties / Contexte**

## Home – arbitrage affichage

- Définir les tuiles prioritaires (ex: Repas, Sommeil, Couches, Santé).
- Choisir le résumé secondaire (ex: Température, Médicaments, Sorties).
- ✅ Tous les événements apparaissent dans la chronologie récente.
