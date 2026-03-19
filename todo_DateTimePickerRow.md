# Refactoring DateTimePickerRow — Composant réutilisable

> **Objectif** : Extraire le pattern date/heure répété dans 9 formulaires en un composant unique `DateTimePickerRow` pour la cohérence visuelle et la maintenabilité.

---

## Problème actuel

Le même pattern date/heure est dupliqué dans 9 fichiers avec 2 variantes :
- **Pattern "dateButton"** : 2 boutons côte à côte (Date + Heure) + affichage texte en dessous → **ancien style**
- **Pattern "chronoRow"** : rows avec label à gauche, valeur à droite → **nouveau style** (promenade/sommeil)

Les formulaires qui utilisent encore l'ancien style doivent être migrés vers le nouveau.

---

## Composant à créer

### `components/ui/DateTimePickerRow.tsx`

```typescript
interface DateTimePickerRowProps {
  label: string;                    // "Date", "Heure", "Date début", "Fin"
  value: Date;
  mode: "date" | "time";
  colorScheme: "light" | "dark";
  disabled?: boolean;
  onChange: (date: Date) => void;
  onPickerToggle?: (visible: boolean) => void; // Pour FormBottomSheet
  accessibilityLabel?: string;
  accessibilityHint?: string;
  // Date display options
  dateFormat?: Intl.DateTimeFormatOptions; // Default: weekday+day+month
}
```

### Fonctionnement
- Affiche une row avec `label` à gauche et `valeur formatée` à droite
- Tap → ouvre le DateTimePicker natif
- Gère le state `showPicker` en interne
- Notifie le parent via `onPickerToggle` (pour le FormBottomSheet `enablePanDownToClose`)
- Dark mode via `getNeutralColors(colorScheme)`
- Styles `chronoRow`, `chronoLabel`, `chronoValue` intégrés

### Composant bonus : `DateTimeSectionRow.tsx`

Composant complet qui gere tous les cas : date simple, date+heure, ou mode chrono (debut/fin/en cours).

```typescript
interface DateTimeSectionProps {
  label?: string;                   // "Date et heure" (default) ou "Horaires"
  colorScheme: "light" | "dark";
  disabled?: boolean;
  onPickerToggle?: (visible: boolean) => void;

  // Mode simple (1 date + 1 heure)
  value?: Date;
  onChange?: (date: Date) => void;

  // Mode chrono (debut/fin avec toggle "en cours")
  chrono?: boolean;                 // Active le mode debut/fin
  heureDebut?: Date;
  heureFin?: Date | null;
  onHeureDebutChange?: (date: Date) => void;
  onHeureFinChange?: (date: Date | null) => void;

  // Toggle "En cours" (optionnel, actif seulement si chrono=true)
  showOngoingToggle?: boolean;      // Affiche le toggle "En cours"
  isOngoing?: boolean;
  onOngoingChange?: (ongoing: boolean) => void;
  ongoingLabel?: string;            // "En cours" (default)
  ongoingActiveColors?: {           // Couleurs du toggle actif (chipActiveColors)
    bg: string;
    border: string;
    text: string;
  };

  // Date fin separee (optionnel, pour les nuits qui debordent)
  showEndDate?: boolean;            // Affiche un picker "Date fin" en plus de "Heure fin"

  // Duree calculee (optionnel)
  showDuration?: boolean;           // Affiche la duree calculee
}
```

Ce composant gere :
- **Mode simple** : Label + Row Date + Row Heure (pour bain, nez, couches, repas, etc.)
- **Mode chrono** : Label + Row Date debut + Row Heure debut + [Toggle En cours] + [Row Date fin] + [Row Heure fin] + [Duree calculee]
- Le toggle "En cours" est integre : quand actif, masque les rows fin + duree
- La duree est calculee automatiquement depuis heureDebut/heureFin
- Toutes les validations (heureFin > heureDebut, clamp, initialisation) sont gerees en interne
- Un seul composant pour tous les formulaires, avec des props optionnelles selon le besoin

---

## Plan de migration par formulaire

### Phase 1 — Créer le composant

- [ ] **Créer `components/ui/DateTimePickerRow.tsx`**
  - Row avec label + valeur
  - DateTimePicker intégré avec state interne
  - Props: label, value, mode, colorScheme, onChange, onPickerToggle
  - Styles chronoRow/chronoLabel/chronoValue intégrés
  - Dark mode, accessibility labels
  - P-items: nc.* tokens, haptic on tap, accessibilityRole/Label/Hint

- [ ] **Créer `components/ui/DateTimeSectionRow.tsx`** (optionnel)
  - Combine Date + Heure en une section avec label
  - Utilise DateTimePickerRow en interne

### Phase 2 — Migrer les formulaires simples (1 date + 1 heure)

Ces formulaires utilisent le pattern `dateHeure` / `showDate` / `showTime` — migration directe.

| # | Formulaire | Event types | Pattern actuel | Statut |
|---|-----------|-------------|---------------|--------|
| 1 | DiapersForm.tsx | miction, selle | dateButton (ancien) | ⏳ À migrer |
| 2 | CroissanceForm.tsx | croissance | dateButton (ancien) | ⏳ À migrer |
| 3 | MealsForm.tsx | biberon, tetee, solide | dateButton (ancien) | ⏳ À migrer |
| 4 | PumpingForm.tsx | pompage | dateButton (ancien) | ⏳ À migrer |
| 5 | MilestonesForm.tsx | jalon | dateButton (ancien) | ⏳ À migrer |
| 6 | ImmunizationForm.tsx | vaccin, vitamine | dateButton (ancien) | ⏳ À migrer |
| 7 | SoinsForm.tsx | temperature, medicament, symptome, vaccin, vitamine | dateButton (ancien) | ⏳ À migrer |

**Pour chaque formulaire** :
- Remplacer le bloc `dateTimeContainerWithPadding` + `selectedDateTime` + 2 `DateTimePicker` par `DateTimeSectionRow`
- Supprimer les states `showDate` / `showTime` (gérés en interne par le composant)
- Supprimer les callbacks `handleShowDate` / `handleShowTime` si plus utilisés
- Garder le state `dateHeure` + `setDateHeure`
- Tester le formulaire après migration

### Phase 3 — Migrer les formulaires chrono (début/fin)

Ces formulaires utilisent déjà le style chronoRow mais avec du code inline.

| # | Formulaire | Event types | Pattern actuel | Statut |
|---|-----------|-------------|---------------|--------|
| 8 | RoutinesForm.tsx — Bain | bain | chronoRow (nouveau, inline) | ⏳ À migrer |
| 9 | RoutinesForm.tsx — Nez | nettoyage_nez | chronoRow (nouveau, inline) | ⏳ À migrer |
| 10 | ActivitiesForm.tsx — Autres activités | activite (non-promenade) | dateButton (ancien) | ⏳ À migrer |

**Pour Bain et Nez** :
- Remplacer par `DateTimeSectionRow` (1 date + 1 heure, pas de début/fin)

**Pour Autres activités (non-promenade)** :
- Remplacer le bloc dateButton + selectedDateTime par `DateTimeSectionRow`
- Le bloc est conditionnel : affiché seulement quand `!isChronoMode`

### Phase 4 — Migrer RoutinesForm Sommeil (le plus complexe)

| # | Formulaire | Event types | Pattern actuel | Statut |
|---|-----------|-------------|---------------|--------|
| 11 | RoutinesForm.tsx — Sommeil | sommeil | chronoRow (nouveau, inline) | ⏳ À migrer |

**Spécificités sommeil** :
- **Date début** : `DateTimePickerRow` mode="date" → modifie `heureDebut`
- **Heure début** : `DateTimePickerRow` mode="time" → modifie `heureDebut`
- **Toggle "En cours"** : intégré via `showOngoingToggle=true` + `ongoingActiveColors={chipActiveColors}`
- **Date fin** : `DateTimePickerRow` mode="date" → modifie `heureFin`
  - Visible uniquement quand `!isOngoing`
  - Nécessaire pour les nuits qui débordent sur le lendemain (22h → 7h)
  - Affiche la date de `heureFin`, pas de `heureDebut`
- **Heure fin** : `DateTimePickerRow` mode="time" → modifie `heureFin`
  - Visible uniquement quand `!isOngoing`
  - Quand `heureFin` est null, initialise à `new Date()` avant d'ouvrir le picker
- **Durée calculée** : intégrée via `showDuration=true` (calculée automatiquement depuis heureDebut/heureFin)
- **Validation** : heureFin doit être après heureDebut (gérée dans handleSubmit)
- **States** : `heureDebut`, `heureFin` (Date|null), `showDateStart`, `showTimeStart`, `showDateEnd`, `showTimeEnd`, `isOngoing`

### Phase 5 — Migrer ActivitiesForm Promenade (similaire sommeil)

| # | Formulaire | Event types | Pattern actuel | Statut |
|---|-----------|-------------|---------------|--------|
| 12 | ActivitiesForm.tsx — Promenade | promenade | chronoRow (nouveau, inline) | ⏳ À migrer |

**Spécificités promenade** :
- **Date** : `DateTimePickerRow` mode="date" → modifie `heureDebut` (et `heureFin` si non null, même jour)
- **Heure début** : `DateTimePickerRow` mode="time" → modifie `heureDebut`
  - Si nouvelle heureDebut >= heureFin → heureFin décalée à heureDebut + 1min
- **Toggle "En cours"** : intégré via `showOngoingToggle=true` + `ongoingActiveColors={chipActiveColors}`
- **Heure fin** : `DateTimePickerRow` mode="time" → modifie `heureFin`
  - Visible uniquement quand `!isOngoing`
  - `minimumDate={heureDebut}` sur le picker
  - Clamp si valeur sélectionnée < heureDebut
- **Durée calculée** : intégrée via `showDuration=true`
- **Pas de date fin séparée** (pas de promenade de nuit)
- **States** : `heureDebut`, `heureFin` (Date|null), `showChronoDate`, `showStartPicker`, `showEndPicker`, `isOngoing`
- **Différence avec sommeil** : un seul picker date (pas de date fin), le changement de date modifie les deux heures

### Phase 6 — Nettoyage

- [ ] Supprimer les styles orphelins dans chaque formulaire :
  - `dateTimeContainerWithPadding`
  - `dateButton` / `dateButtonText`
  - `selectedDateTime` / `selectedDate` / `selectedTime`
  - `sleepSelectedDateTime` / `sleepSelectedDate` / `sleepSelectedTime`
  - `chronoRow` / `chronoLabel` / `chronoValue` / `chronoDureeRow` / `chronoDureeText` (déplacés dans le composant)
- [ ] Supprimer les states/callbacks orphelins dans chaque formulaire :
  - `showDate` / `showTime` / `handleShowDate` / `handleShowTime` (gérés dans le composant)
  - `showDateStart` / `showTimeStart` / `showDateEnd` / `showTimeEnd` + handlers (pour sommeil)
  - `showDateNez` / `showTimeNez` + handlers (pour nez)
  - `showChronoDate` / `showStartPicker` / `showEndPicker` (pour promenade)
- [ ] Vérifier que les styles restants sont utilisés
- [ ] TypeScript 0 erreurs
- [ ] Audit P-items sur DateTimePickerRow (nc.*, accessibility, haptic, dark mode)

---

## Estimation

| Phase | Cible | Effort | Impact |
|-------|-------|--------|--------|
| Phase 1 | Créer DateTimePickerRow + DateTimeSectionRow | ~1.5h | Fondation |
| Phase 2 | 7 formulaires simples (Diapers, Croissance, Meals, Pumping, Milestones, Immunization, Soins) | ~2h | Gros gain — 7 fichiers simplifiés |
| Phase 3 | 3 formulaires date+heure dans fichiers multi-mode (RoutinesForm Bain, RoutinesForm Nez, ActivitiesForm non-promenade) | ~1h | Alignement |
| Phase 4 | RoutinesForm Sommeil (date début/fin, heure début/fin, toggle, durée) | ~1h | Le plus complexe |
| Phase 5 | ActivitiesForm Promenade (date, heure début/fin, toggle, clamp) | ~45min | Similaire sommeil |
| Phase 6 | Nettoyage styles/states orphelins dans les 9 fichiers | ~30min | Code mort retiré |

**Total** : ~6.5h, retire ~500+ lignes de code dupliqué.

---

## Bénéfices

- **1 source de vérité** pour le style date/heure → changement de design en 1 endroit
- **~500 lignes retirées** de code dupliqué
- **Cohérence** : tous les formulaires ont le même rendu
- **Maintenance** : corriger un bug date/heure = 1 fichier au lieu de 9
- **P-items** : accessibility, haptic, dark mode gérés en 1 endroit

---

## Ordre d'exécution recommandé

```
Phase 1 (composant)                — créer DateTimePickerRow + DateTimeSectionRow
Phase 2.1 (DiapersForm)            — le plus simple, sert de validation
Phase 2.2 (CroissanceForm)         — simple
Phase 2.3 (MealsForm)              — simple
Phase 2.4 (PumpingForm)            — simple
Phase 2.5 (MilestonesForm)         — simple
Phase 2.6 (ImmunizationForm)       — simple
Phase 2.7 (SoinsForm)              — le plus gros (5 event types)
Phase 3.1 (RoutinesForm Bain)      — chronoRow inline → DateTimeSectionRow
Phase 3.2 (RoutinesForm Nez)       — chronoRow inline → DateTimeSectionRow
Phase 3.3 (ActivitiesForm std)     — dateButton → DateTimeSectionRow
Phase 4   (RoutinesForm Sommeil)   — le plus complexe (date début/fin, heure début/fin, toggle en cours)
Phase 5   (ActivitiesForm Prom.)   — similaire sommeil (date, heure début/fin, toggle, pas de date fin)
Phase 6   (nettoyage styles)       — supprimer le code mort dans les 9 fichiers
```

---

*Dernière mise à jour : 2026-03-19*
