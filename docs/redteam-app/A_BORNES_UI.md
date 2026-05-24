# A — Bornes quantitatives UI : plan d'action

**Statut :** 🟡 plan rédigé, exécution à venir
**Effort estimé :** 1 jour
**Référence bornes :** [memory/project_event_quantity_bounds.md](../../../.claude/projects/-Users-yoss-Projets-SuiviBaby/memory/project_event_quantity_bounds.md) + `validateEventData` dans [functions/index.js:1576](../../functions/index.js#L1576)

## Contexte

Le red team voice a posé des bornes serveur sur tous les champs d'event. Les formulaires UI manuels n'ont **pas** été audités à l'époque — résultat : un utilisateur peut saisir une valeur que la CF rejette, ce qui produit une erreur tardive non gérée gracieusement.

L'audit (mai 2026) a relevé **13 gaps** sur 8 formulaires.

## Gaps identifiés

### Priorité CRITIQUE — rejets serveur courants

| # | Form | Fichier:ligne | Champ | Borne CF | Problème UI |
|---|------|---------------|-------|----------|-------------|
| 1 | CroissanceForm | `components/.../CroissanceForm.tsx:197-246` | poidsKg, tailleCm, teteCm | 0.3-50 kg, 20-200 cm, 20-60 cm | TextInput `decimal-pad` **aucun cap, aucune validation locale** |
| 2 | PumpingForm | `components/.../PumpingForm.tsx:300-345` | quantiteGauche, quantiteDroite | 0-500 ml | Stepper +/- 5ml **sans plafond** |
| 3 | SoinsForm | `components/.../SoinsForm.tsx:1372-1397,1605,1700` | nomMedicament, dosage, nomVaccin custom, nomVitamine custom | length ≤ 100 | TextInput **sans `maxLength`** (4 champs) |
| 4 | RoutinesForm + ActivitiesForm + MealsForm | `:498,536,309` | duree (sommeil), duree (activite), dureeGauche/Droite (tetee) | sommeil 1-1440, activite 0-1440, tetee 0-180 | Stepper sans plafond ; calcul auto sans clamp |
| 5 | **TOUS les forms** | `DateTimeSectionRow` (composant partagé) | `date` | futur ≤ +5min, passé ≥ −365j | Pas de `minDate`/`maxDate` passés |

### Priorité HAUTE — UX dégradée (refus serveur silencieux ou borne UI plus restrictive que CF)

| # | Form | Fichier:ligne | Champ | Borne CF | Borne UI | Action |
|---|------|---------------|-------|----------|----------|--------|
| 6 | RoutinesForm | `:972, 1000` | temperatureEau (bain) | 20-45 °C | 35-40 °C (trop étroit) | Élargir au range CF |
| 7 | SoinsForm | `:1305-1322` | temperatureValue | 34-43 °C | 34-45 °C (trop large) | Plafonner à 43 |
| 8 | MealsForm | `:641-658` | quantite (biberon) | 0-500 ml | `MAX_BIBERON_ML = 300` | Décision produit : garder 300 ou aligner 500 |

### Priorité MOYEN — défense en profondeur

| # | Form | Champ | Borne CF | Problème |
|---|------|-------|----------|----------|
| 9 | Tous les forms | `note` | length ≤ 1000 | TextInput sans `maxLength`, troncature silencieuse possible |
| 10 | ActivitiesForm `:590-601` | description | (pas borné CF actuellement) | Sans `maxLength` → si CF ajoute un cap, breakage soudain |
| 11 | MilestonesForm `:478-496` | title, description | idem | idem |

## Patterns à factoriser

L'audit révèle que **chaque form réimplémente ses steppers / Math.min/max manuellement** — 4 endroits distincts pour le même pattern. Avant de patcher les 13 gaps un par un, factoriser :

### Action F1 : `<BoundedNumberInput>` partagé
Composant `components/ui/BoundedNumberInput.tsx` avec props `{min, max, step, value, onChange, decimal?: boolean, suffix?: string}`. Remplace les steppers custom dans PumpingForm, MealsForm (biberon), SoinsForm (température), ActivitiesForm (durée), RoutinesForm (durée bain).

### Action F2 : `<BoundedDateTimeRow>` ou enrichir `DateTimeSectionRow`
Ajouter `minDate` / `maxDate` props acceptant des `Date` ; le picker iOS/Android natif respecte déjà ces bornes.

### Action F3 : helper `clampToCFBounds(type, field, value)` partagé
Centraliser le mapping `event type → field → {min, max}` côté client. Source unique pour les forms ET pour les détecteurs vocaux (qui ont déjà leurs propres bornes hardcodées).

## Ordre d'exécution

1. **F1 + F2 + F3** (~3 h) — factoriser d'abord, sinon on duplique les fixes.
2. **Gaps CRITIQUE 1→5** (~2 h) — applique les factorisations + ajoute validation locale (toast ou bouton désactivé) avant submit.
3. **Gaps HAUTE 6→8** (~1 h) — ajustements de bornes + décision produit sur biberon.
4. **Gaps MOYEN 9→11** (~1 h) — `maxLength` partout.
5. **Tests** (~1 h) — `__tests__/forms.bounds.test.tsx` qui mock les forms et vérifie que :
   - Submit bloqué si valeur hors bornes
   - Date picker n'accepte pas date > 1 an passé
   - `maxLength` est respecté (input rejette les caractères supplémentaires)

## Décisions à prendre avant exécution

- **Gap 8 (biberon UI 300 vs CF 500) :** garder 300 (raisonnable médicalement) ou aligner 500 ? **Reco :** garder 300, c'est un choix produit cohérent.
- **Gap 9-11 (note/description) :** quel comportement quand l'utilisateur dépasse `maxLength` ? Couper silencieusement (comportement actuel TextInput) ou afficher un compteur "990/1000" ? **Reco :** compteur visible à partir de 800 chars.

## Tests de non-régression

Suite à créer : `__tests__/forms.bounds.test.tsx`.
Cases minimums :
- BoundedNumberInput rejette `< min`, `> max`, NaN, valeurs vides
- DateTimeSectionRow refuse dates > now+5min et < now-365j
- maxLength respecté sur tous les champs string CF-bornés
- Soumission bloquée si au moins un champ hors-borne (snapshot UI)

## Métriques à surveiller post-fix

- Diminution du taux d'erreur `functions/invalid-argument` sur `validateAndCreateEvent` (Cloud Logs).
- Diminution des sessions où l'utilisateur tape "submit" plus de 2 fois (signal de friction sur validation tardive).

## Livraison

- **2 commits prévus :**
  - `refactor(ui): BoundedNumberInput + BoundedDateTime + clampToCFBounds helpers`
  - `fix(forms): align UI bounds with server validateEventData (13 gaps)`
- **Pas de déploiement CF** (changements 100% client).
- **Build EAS preview** ensuite pour ramener Lot 3 voice + bornes UI dans le même bundle.
