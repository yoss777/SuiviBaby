# Promenade — Mode chrono start/stop

> **Contexte** : La promenade est actuellement un sous-type d'activité avec saisie manuelle de la durée. L'expérience serait meilleure avec un chrono start/stop comme le widget sommeil.

---

## Problème actuel

- La promenade est dans `ActivitiesForm` avec `activiteType: "promenade"`
- L'utilisateur doit estimer la durée manuellement après coup
- Pas de chrono en temps réel → perte de données (oubli, estimation approximative)
- Pas de widget dashboard pour démarrer/arrêter rapidement

## Vision cible

Fonctionner exactement comme le widget sommeil :
1. Widget "Promenade" sur le dashboard → tap pour démarrer
2. Chrono en temps réel visible (durée écoulée)
3. Tap pour arrêter → saisie automatique de heureDebut/heureFin/duree
4. Option de saisir manuellement (pour les oublis)

---

## Plan d'implémentation

### Phase 1 — Modèle de données

- [ ] Ajouter les champs à l'interface `ActiviteEvent` :
  - `heureDebut?: Timestamp` — heure de départ
  - `heureFin?: Timestamp` — heure de retour
  - `duree?: number` — calculée automatiquement (minutes)
  - `enCours?: boolean` — promenade en cours (comme sommeil)
  - Conserver la compatibilité avec les anciennes activités promenade (duree manuelle)

### Phase 2 — Widget dashboard

- [ ] Créer `PromenadeWidget` inspiré de `SleepWidget`
  - Bouton "Démarrer la promenade" (icône baby-carriage)
  - Chrono en temps réel quand actif (durée écoulée, animation pulse)
  - Bouton "Arrêter" pour terminer
  - Couleur : utiliser la couleur activité existante
  - Position dans home.tsx : après le SleepWidget

- [ ] Gérer l'état "promenade en cours" dans home.tsx
  - Détecter une promenade `enCours === true` au mount (comme `sommeilEnCours`)
  - Calculer `elapsedMinutes` en temps réel
  - Persister dans Firestore (survive au kill app)

### Phase 3 — Formulaire

- [ ] Adapter `ActivitiesForm` pour le type "promenade"
  - Si démarré via widget : afficher heureDebut (readonly) + heureFin (editable)
  - Si saisie manuelle : garder le comportement actuel (heureDebut + heureFin ou durée)
  - Ajouter un champ optionnel "lieu" (texte libre ou GPS)
  - Ajouter un champ optionnel "météo" (icônes : soleil, nuage, pluie)

### Phase 4 — Statistiques

- [ ] Ajouter la promenade dans le SommeilChart ou créer un ActiviteChart
  - Durée totale de promenade par semaine
  - Nombre de promenades par semaine
  - Durée moyenne
  - Meilleur moment (matin, après-midi, soir)
  - Corrélation promenade → qualité sommeil (déjà dans correlationService)

### Phase 5 — Notifications

- [ ] Rappel "Temps de sortir ?" si pas de promenade depuis X jours
- [ ] Alerte météo favorable → "Beau temps aujourd'hui, bonne journée pour une promenade !"

---

## Considérations techniques

- Le pattern start/stop est déjà implémenté pour le sommeil → réutiliser la même architecture
- `sommeilEnCours` dans home.tsx utilise un listener Firestore `where("enCours", "==", true)` → faire pareil pour promenade
- Le widget promenade et le widget sommeil ne devraient pas pouvoir être actifs en même temps (UX confuse)
- Cloud Function `validateAndCreateEvent` doit gérer le calcul heureDebut → heureFin → durée

---

## Fichiers à modifier

| Fichier | Modification |
|---------|-------------|
| `services/eventsService.ts` | Ajouter champs heureDebut/heureFin/enCours sur ActiviteEvent |
| `components/forms/ActivitiesForm.tsx` | Mode chrono pour promenade |
| `app/(drawer)/baby/(tabs)/home.tsx` | PromenadeWidget + état enCours |
| `components/suivibaby/dashboard/PromenadeWidget.tsx` | **CRÉER** — widget start/stop |
| `app/(drawer)/baby/(tabs)/stats.tsx` | Ajouter stats promenade (optionnel) |

---

*Dernière mise à jour : 2026-03-19*
