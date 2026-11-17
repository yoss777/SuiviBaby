import { STALE_NAP_MS, STALE_NIGHT_MS, STALE_WALK_MS } from "@/utils/widgetSnapshot";

/** Durée « typique » proposée comme fin d'une session oubliée (à ajuster). */
const TYPICAL_MS = { nap: 90 * 60_000, night: 10 * 3600_000, walk: 60 * 60_000 } as const;
const STALE_MS = { nap: STALE_NAP_MS, night: STALE_NIGHT_MS, walk: STALE_WALK_MS } as const;

/**
 * Session oubliée (sieste > 6 h, nuit > 15 h, balade > 9 h) : heure de fin
 * plausible à pré-remplir (début + durée typique, jamais dans le futur) ;
 * null si la session n'est pas oubliée (le formulaire reste « en cours »).
 */
export function suggestForgottenEnd(start: Date, kind: "nap" | "night" | "walk", nowMs = Date.now()): Date | null {
  const startMs = start.getTime();
  if (!Number.isFinite(startMs) || nowMs - startMs < STALE_MS[kind]) return null;
  return new Date(Math.min(startMs + TYPICAL_MS[kind], nowMs));
}
