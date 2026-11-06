// utils/omsCurve.ts
//
// Sélection des percentiles OMS pour une série de mesures.
// Les tables embarquées (constants/omsPercentiles.ts) couvrent 0 à 731 jours
// (24 mois, standards de croissance OMS 0-2 ans). Avant : une seule mesure
// au-delà de 731 jours faisait disparaître TOUTE la courbe. Désormais seules
// les mesures hors plage sont ignorées par la courbe de référence (les
// mesures de l'enfant restent affichées).

import {
  OMS_MAX_DAY,
  OMS_PERCENTILES,
  type OMSMetric,
  type OMSPercentileKey,
  type OMSSex,
} from "@/constants/omsPercentiles";

const KEYS: OMSPercentileKey[] = ["p3", "p15", "p50", "p85", "p97"];

export interface OmsSeries {
  /** Indices (dans la liste de mesures d'entrée) couverts par la référence. */
  indices: number[];
  values: Record<OMSPercentileKey, number[]>;
}

export function getOmsSeries(
  sex: OMSSex | null | undefined,
  metric: OMSMetric,
  ageDays: number[],
): OmsSeries | null {
  if (!sex) return null;
  const source = OMS_PERCENTILES[sex]?.[metric];
  if (!source) return null;

  const indices: number[] = [];
  const days: number[] = [];
  ageDays.forEach((raw, index) => {
    if (!Number.isFinite(raw)) return;
    const day = Math.round(raw);
    if (day < 0 || day > OMS_MAX_DAY) return;
    indices.push(index);
    days.push(day);
  });
  if (indices.length === 0) return null;

  const values = {} as Record<OMSPercentileKey, number[]>;
  for (const key of KEYS) values[key] = days.map((d) => source[key][d]);
  return { indices, values };
}

export const OMS_RANGE_NOTE = "Courbes OMS disponibles jusqu'à 24 mois";

/** true si au moins une mesure dépasse la plage des tables OMS embarquées. */
export function hasMeasurementsBeyondOms(ageDays: number[]): boolean {
  return ageDays.some((d) => Number.isFinite(d) && Math.round(d) > OMS_MAX_DAY);
}

// Légende de la courbe : libellés NEUTRES des bandes de percentiles. Aucun
// « normal » / « extrême » : seul un professionnel de santé interprète la
// courbe (décision propriétaire Q4, orientation uniquement). Repères : courbes
// de croissance OMS ; choix OMS ou AFPA à valider par un pédiatre (Q3).
export const OMS_BAND_LABELS = ["P3–P15", "P15–P85", "P85–P97"] as const;
export const OMS_LEGEND_NOTE = "Repères OMS — seul un professionnel de santé interprète la courbe";
