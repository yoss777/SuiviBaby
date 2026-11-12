// utils/growthDeltas.ts
// Progression d'une mesure de croissance par rapport à la mesure précédente
// (même indicateur : le poids est comparé au dernier poids connu, même si la
// mesure d'avant ne contenait qu'une taille). Affichage neutre : une baisse de
// poids des premiers jours est physiologique, pas une erreur.
import { formatDecimalFr } from "@/utils/frenchNumber";

export interface GrowthMeasure {
  id: string;
  date: unknown;
  poidsKg?: number | null;
  tailleCm?: number | null;
  teteCm?: number | null;
}

export interface GrowthDeltas {
  poidsKg?: number;
  tailleCm?: number;
  teteCm?: number;
}

const METRICS = ["poidsKg", "tailleCm", "teteCm"] as const;

export function computeGrowthDeltas(
  entries: readonly GrowthMeasure[],
  toDate: (value: any) => Date,
): Map<string, GrowthDeltas> {
  const sorted = [...entries].sort((a, b) => toDate(a.date).getTime() - toDate(b.date).getTime());
  const last: Partial<Record<(typeof METRICS)[number], number>> = {};
  const map = new Map<string, GrowthDeltas>();
  for (const entry of sorted) {
    const deltas: GrowthDeltas = {};
    for (const key of METRICS) {
      const value = entry[key];
      if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) continue;
      const prev = last[key];
      if (prev !== undefined) deltas[key] = value - prev;
      last[key] = value;
    }
    if (Object.keys(deltas).length > 0) map.set(entry.id, deltas);
  }
  return map;
}

/** « +0,2 », « −0,1 », « = » (pas de changement), une décimale, format français. */
export function formatGrowthDelta(diff: number): string {
  const rounded = Math.round(diff * 10) / 10;
  if (rounded === 0) return "=";
  const sign = rounded > 0 ? "+" : "−";
  return `${sign}${formatDecimalFr(Math.abs(rounded), 1)}`;
}
