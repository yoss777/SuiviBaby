// services/events/stats.ts
//
// 24-hour event aggregation. Reads via obtenirEvenements and folds into
// per-type counters + totals (millilitres, minutes). Pure read side: no
// writes, no listeners, no optimistic store coupling.
//
// Extracted from eventsService.ts (S3-T2b).
//
// NOTE: at the time of extraction, obtenirStats24h had zero call sites
// in the codebase. Kept and re-exported for backward compatibility in
// case external integrations rely on it; consider dropping in a future
// cleanup sprint if it stays unused.

import { obtenirEvenements } from "@/services/eventsService";
import type {
  BiberonEvent,
  SommeilEvent,
  TeteeEvent,
} from "./types";

export interface Stats24h {
  biberons: { count: number; totalMl: number };
  tetees: { count: number; totalMinutes: number };
  mictions: { count: number };
  selles: { count: number };
  couches: { count: number };
  sommeil: { count: number; totalMinutes: number };
  bains: { count: number };
}

export async function obtenirStats24h(childId: string): Promise<Stats24h> {
  const hier = new Date();
  hier.setHours(hier.getHours() - 24);

  const events = await obtenirEvenements(childId, { depuis: hier });

  const stats: Stats24h = {
    biberons: { count: 0, totalMl: 0 },
    tetees: { count: 0, totalMinutes: 0 },
    mictions: { count: 0 },
    selles: { count: 0 },
    couches: { count: 0 },
    sommeil: { count: 0, totalMinutes: 0 },
    bains: { count: 0 },
  };

  events.forEach((event) => {
    switch (event.type) {
      case "biberon":
        stats.biberons.count++;
        stats.biberons.totalMl += (event as BiberonEvent).quantite;
        break;
      case "tetee": {
        stats.tetees.count++;
        const tetee = event as TeteeEvent;
        stats.tetees.totalMinutes +=
          (tetee.dureeGauche || 0) + (tetee.dureeDroite || 0);
        break;
      }
      case "miction":
        stats.mictions.count++;
        break;
      case "selle":
        stats.selles.count++;
        break;
      case "couche":
        // Legacy raw diaper-change stats are still counted for historical data.
        stats.couches.count++;
        break;
      case "sommeil":
        stats.sommeil.count++;
        stats.sommeil.totalMinutes += (event as SommeilEvent).duree || 0;
        break;
      case "bain":
        stats.bains.count++;
        break;
    }
  });

  return stats;
}
