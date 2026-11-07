import type { EventType } from "@/services/eventsService";

// S7.6 : cache par enfant et par jour des 7 derniers jours d'événements lus
// pour le moteur d'insights de l'accueil. Évite de relire la semaine à chaque
// remontage de l'écran ; l'entrée expire au changement de jour ou après
// `WEEKLY_CACHE_TTL_MS` (les écritures de la journée alimentent surtout
// `todayEventsCache`, la semaine n'a pas besoin d'être à la seconde).

/**
 * Types réellement lus par `insightEngine` et `correlationService` : repas,
 * sommeil, bain, activité, santé (température, vaccin, vitamine, symptôme),
 * jalons. Les autres types (couches, pompages, croissance, médicaments...)
 * n'influencent aucun insight : inutile de les lire.
 */
export const WEEKLY_INSIGHT_TYPES: EventType[] = [
  "tetee",
  "biberon",
  "solide",
  "sommeil",
  "bain",
  "activite",
  "temperature",
  "vaccin",
  "vitamine",
  "symptome",
  "jalon",
];

export const WEEKLY_CACHE_TTL_MS = 15 * 60 * 1000;

type Entry<T> = { dateKey: string; fetchedAt: number; events: T[] };

const cacheMap = new Map<string, Entry<any>>();

const getDayKey = () => {
  const now = new Date();
  return `${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()}`;
};

export function getWeeklyEventsCache<T>(childId: string): T[] | null {
  const entry = cacheMap.get(childId);
  if (!entry) return null;
  if (entry.dateKey !== getDayKey()) {
    cacheMap.delete(childId);
    return null;
  }
  return entry.events as T[];
}

/** Vrai si une entrée du jour existe et a moins de `WEEKLY_CACHE_TTL_MS`. */
export function isWeeklyEventsCacheFresh(childId: string): boolean {
  const entry = cacheMap.get(childId);
  if (!entry || entry.dateKey !== getDayKey()) return false;
  return Date.now() - entry.fetchedAt < WEEKLY_CACHE_TTL_MS;
}

export function setWeeklyEventsCache<T>(childId: string, events: T[]) {
  cacheMap.set(childId, { dateKey: getDayKey(), fetchedAt: Date.now(), events });
}

export function clearWeeklyEventsCache() {
  cacheMap.clear();
}
