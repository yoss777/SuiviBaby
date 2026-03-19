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

Pour les formulaires qui ont juste Date + Heure (pas de début/fin), un wrapper qui combine les deux :

```typescript
interface DateTimeSectionProps {
  label?: string;                   // "Date et heure" (default)
  value: Date;
  colorScheme: "light" | "dark";
  disabled?: boolean;
  onChange: (date: Date) => void;
  onPickerToggle?: (visible: boolean) => void;
}
```

Ce composant affiche :
- Label "Date et heure"
- Row Date (avec DateTimePickerRow mode="date")
- Row Heure (avec DateTimePickerRow mode="time")

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
| 8 | RoutinesForm.tsx — Sommeil | sommeil | chronoRow (nouveau, inline) | ⏳ À migrer |
| 9 | RoutinesForm.tsx — Bain | bain | chronoRow (nouveau, inline) | ⏳ À migrer |
| 10 | RoutinesForm.tsx — Nez | nettoyage_nez | chronoRow (nouveau, inline) | ⏳ À migrer |
| 11 | ActivitiesForm.tsx — Promenade | promenade | chronoRow (nouveau, inline) | ⏳ À migrer |
| 12 | ActivitiesForm.tsx — Autres activités | activite (non-promenade) | dateButton (ancien) | ⏳ À migrer |

**Pour Sommeil et Promenade** :
- Remplacer les TouchableOpacity chronoRow inline par `DateTimePickerRow`
- Le toggle "En cours" reste un composant séparé (pas dans DateTimePickerRow)
- La durée calculée reste un composant séparé

**Pour Bain et Nez** :
- Remplacer par `DateTimeSectionRow` (comme les formulaires simples)

### Phase 4 — Nettoyage

- [ ] Supprimer les styles orphelins dans chaque formulaire :
  - `dateTimeContainerWithPadding`
  - `dateButton` / `dateButtonText`
  - `selectedDateTime` / `selectedDate` / `selectedTime`
  - `sleepSelectedDateTime` / `sleepSelectedDate` / `sleepSelectedTime`
- [ ] Supprimer les styles `chronoRow` / `chronoLabel` / `chronoValue` des formulaires (déplacés dans le composant)
- [ ] Vérifier que les styles restants sont utilisés

---

## Estimation

| Phase | Effort | Impact |
|-------|--------|--------|
| Phase 1 (composant) | ~1h | Fondation |
| Phase 2 (7 formulaires simples) | ~2h | Gros gain — 7 fichiers simplifiés |
| Phase 3 (5 formulaires chrono) | ~1.5h | Alignement final |
| Phase 4 (nettoyage) | ~30min | Code mort retiré |

**Total** : ~5h, retire ~500+ lignes de code dupliqué.

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
Phase 1 (composant)              — créer DateTimePickerRow + DateTimeSectionRow
Phase 2.1 (DiapersForm)          — le plus simple, sert de validation
Phase 2.2 (CroissanceForm)       — simple
Phase 2.3 (MealsForm)            — simple
Phase 2.4 (PumpingForm)          — simple
Phase 2.5 (MilestonesForm)       — simple
Phase 2.6 (ImmunizationForm)     — simple
Phase 2.7 (SoinsForm)            — le plus gros (5 event types)
Phase 3.1 (RoutinesForm Bain)    — chronoRow → DateTimeSectionRow
Phase 3.2 (RoutinesForm Nez)     — chronoRow → DateTimeSectionRow
Phase 3.3 (RoutinesForm Sommeil) — chronoRow → DateTimePickerRow (avec toggle)
Phase 3.4 (ActivitiesForm std)   — dateButton → DateTimeSectionRow
Phase 3.5 (ActivitiesForm prom.) — chronoRow → DateTimePickerRow (avec toggle)
Phase 4 (nettoyage styles)       — supprimer le code mort
```

---

*Dernière mise à jour : 2026-03-19*
