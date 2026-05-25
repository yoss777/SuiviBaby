# A — Bornes UI : closure report

**Statut :** 🟢 livré
**Période :** mai 2026
**Effort réel :** ~3 h (vs 1 jour estimé)
**Suite :** [README.md](README.md) — B1 → B2 → B3 → B4 → B5 → B6 → App Check.

## TL;DR

13 gaps documentés dans [A_BORNES_UI.md](A_BORNES_UI.md) fermés, plus 2 composants partagés créés pour ne pas reproduire le pattern dans les futurs forms.

| Gap | Form | Mesure |
|-----|------|--------|
| CRITIQUE 1 | CroissanceForm | Validation onSubmit + alert clair si valeur hors plage (poids 0.3-50 kg, taille 20-200 cm, tête 20-60 cm) + `maxLength=5` + placeholder min-max |
| CRITIQUE 2 | PumpingForm | `Math.min(500)` sur stepper gauche/droite (le décrément `Math.max(0)` existait déjà) |
| CRITIQUE 3 | SoinsForm | `maxLength=100` sur nomMedicament, dosage, vaccinCustomName, vaccinDosage, vitamineCustomName |
| CRITIQUE 4 | RoutinesForm + ActivitiesForm | `Math.min(1440)` activité, `Math.min(60)` bain |
| CRITIQUE 5 | TOUS les forms | `DateTimeSectionRow` applique now+5min / now-365j par défaut → propagation automatique sur les 8 forms |
| HAUTE 6 | RoutinesForm temp bain | 35-40°C → 32-42°C (CF accepte 20-45, range UI médicalement raisonnable) |
| HAUTE 7 | SoinsForm temp mesurée | 34-45 → 34-43°C (parité CF stricte) |
| HAUTE 8 | MealsForm biberon | Borne UI 300 ml maintenue (décision produit, CF accepte 500) — documenté dans `eventBounds.ts` |
| MOYEN 9 | TOUS les forms note | `maxLength=1000` + multiline |
| MOYEN 10-11 | ActivitiesForm, MilestonesForm | description `maxLength=500`, title `maxLength=200` |

## Factorisations créées

### `components/ui/BoundedNumberInput.tsx` (nouveau)
Stepper +/- borné, factorise le pattern dupliqué dans 5+ forms. Inclut :
- Long-press accélération (400 ms timeout puis 100 ms interval, parité avec l'existant).
- Haptics `ImpactFeedbackStyle.Light` à chaque cran.
- Boutons désactivés visuellement aux bornes atteintes (`atMin`/`atMax`).
- Accessibility labels (decrement/increment) + `accessibilityState.disabled`.

**Non utilisé encore dans les forms.** Les fixes A passent par `Math.min/max` ciblés pour ne pas re-câbler tout le form (changement minimal = risque minimal). Migration future quand on touchera les forms pour d'autres raisons.

### `utils/eventBounds.ts` (nouveau)
Source unique des bornes côté client. Trois exports principaux :
- `NUMERIC_BOUNDS` : mapping `event type → field → {min, max, unit, step}`.
- `STRING_LENGTH_LIMITS` : `note`, `nomMedicament`, `dosage`, etc.
- `DATE_BOUNDS` + `getEventDateBounds()` : bornes Date min/max glissantes.
- Helpers `clampNumber`, `clampString`.

Doit rester strictement aligné avec `functions/index.js validateEventData`. Une dérive est détectable via les tests `__tests__/eventBounds.test.ts`.

### `components/ui/DateTimeSectionRow.tsx` (modifié)
Nouveaux props optionnels `minimumDate` / `maximumDate`. Si non fournis, défaut = `getEventDateBounds()` (now + 5 min / now − 365 j). Tous les forms utilisant le composant bénéficient automatiquement de la protection date sur la date principale ET la date début chrono.

## Tests ajoutés

**`__tests__/eventBounds.test.ts` (16 tests, tous passent)** :
- Parité bornes critiques (biberon 0-300, sommeil 1-1440, temp 34-43, croissance bornes, humeur 1-5)
- String limits (note 1000, nom* 100 chars)
- Date bounds dynamiques (now+5min / now-365j, fenêtre glissante)
- `clampNumber` : NaN, Infinity, null, undefined → min ; bornes inclusives
- `clampString` : null/undefined → "", trim + slice maxLength

Les tests fonctionnent comme **drift detection** : si une borne CF est modifiée sans mirror côté client, un test casse.

## Résultats

- **Tests** : 16 nouveaux + 198 voice existants passent. **0 régression**.
- **TypeScript** : 44 erreurs = baseline (0 nouvelle).
- **Lint** : 0 warning sur les fichiers modifiés.
- **Pas de déploiement CF** (changements 100% client).
- **Pas d'EAS build dédié** : bénéfices visibles au prochain build EAS (qui contiendra aussi Lot 3 voice + Lot 0).

## Commits

- `ef96c28` — `fix(forms): align UI bounds with server validateEventData (audit A)`
- `e192cb6` — `test(forms): unit tests pour utils/eventBounds (audit A)`

## Risques résiduels

| # | Risque | Sévérité | Note |
|---|--------|----------|------|
| R1 | `BoundedNumberInput` créé mais non utilisé encore | FAIBLE | Migration progressive, pas un risque sécurité. Servira pour de nouveaux forms ou refactors futurs. |
| R2 | Drift CF ↔ UI si quelqu'un modifie `validateEventData` sans toucher `eventBounds.ts` | MOYEN | Drift detection via tests `eventBounds.test.ts` qui assertent les valeurs exactes. CI doit faire échouer la PR. |
| R3 | Décision produit "biberon UI=300, CF=500" : valeurs divergentes intentionnelles, à documenter | FAIBLE | Documenté dans `eventBounds.ts` ligne du commentaire. Si tu lèves 300, lève aussi le UI. |

## Prochaines actions

Conformément à la priorisation initiale (A → B1 → B3 → B2 → B4 → B5 → B6) :
- **B1 — Sharing** : race conditions redeem shareCode (CRITIQUE), brute-force shareCodes sans rate limit (ÉLEVÉ), email leak findUserByEmail (MOYEN). Plan détaillé : [B1_SHARING.md](B1_SHARING.md). Effort ~3-4 h.
- **App Check (0.1)** reste en TOUT DERNIER.
