// utils/soinsSubmit.ts
//
// Validation du formulaire Soins AVANT toute écriture. Pour la saisie combinée
// température + symptôme, les deux parties sont validées ensemble : si l'une est
// invalide, rien n'est écrit (pas de température enregistrée sans le symptôme
// attendu, ni d'alerte affichée pour une saisie à moitié enregistrée).

import { NUMERIC_BOUNDS } from "@/utils/eventBounds";

const TEMP_BOUNDS = NUMERIC_BOUNDS.temperature.valeur;

export interface SoinsSubmissionInput<Mode extends string = string> {
  includeTemperature: boolean;
  includeSymptome: boolean;
  temperatureValue: number;
  temperatureMode: Mode;
  symptomes: readonly string[];
  symptomeAutre: string;
}

export type SoinsSubmissionResult<Mode extends string = string> =
  | { ok: false; message: string }
  | {
      ok: true;
      temperature?: { valeur: number; modePrise: Mode };
      symptomes?: string[];
    };

export function validateSoinsSubmission<Mode extends string>(
  input: SoinsSubmissionInput<Mode>,
): SoinsSubmissionResult<Mode> {
  if (!input.includeTemperature && !input.includeSymptome) {
    return { ok: false, message: "Sélectionnez au moins Température ou Symptôme." };
  }

  let temperature: { valeur: number; modePrise: Mode } | undefined;
  if (input.includeTemperature) {
    const valeur = Number(input.temperatureValue);
    if (Number.isNaN(valeur) || valeur < TEMP_BOUNDS.min || valeur > TEMP_BOUNDS.max) {
      return { ok: false, message: "Indiquez une température valide." };
    }
    if (!input.temperatureMode) {
      return { ok: false, message: "Sélectionnez un mode de prise." };
    }
    temperature = { valeur, modePrise: input.temperatureMode };
  }

  let symptomes: string[] | undefined;
  if (input.includeSymptome) {
    const list = [...input.symptomes];
    if (input.symptomeAutre.trim()) list.push(input.symptomeAutre.trim());
    if (list.length === 0) {
      return { ok: false, message: "Sélectionnez au moins un symptôme." };
    }
    symptomes = list;
  }

  return { ok: true, temperature, symptomes };
}
