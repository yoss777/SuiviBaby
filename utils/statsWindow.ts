// Loading window of the statistics screen (docs/STATS_PERF_REFONTE.md, sprint 3).
//
// Real-time listeners only cover the last few weeks; older weeks are fetched
// on demand, in chunks, when a chart navigates back. These helpers hold the
// date rules so they can be tested without Firestore.

import { addWeeks, getStartOfWeek, toMillis } from "@/utils/statsAggregations";

/** Weeks before the current one covered by the live listeners. */
export const LIVE_WEEKS_BEFORE = 2;
/** Weeks fetched at once when a chart needs older data. */
export const HISTORY_CHUNK_WEEKS = 8;

/**
 * Start of the live window: Monday of the current week minus LIVE_WEEKS_BEFORE
 * weeks. Covers the current week, its previous-week comparison, the 3-day
 * sleep tip and the 6 h meal window before the week's nights.
 */
export function getLiveSince(now: Date | number = Date.now()): Date {
  return addWeeks(getStartOfWeek(now), -LIVE_WEEKS_BEFORE);
}

/**
 * Earliest date any visible chart needs: the week before each displayed week
 * (ghost bars, trends, meal/sleep correlation) and the displayed pumping day.
 */
export function getEarliestNeededMs(
  weekStarts: (Date | number)[],
  extraDays: (Date | number)[] = [],
): number {
  let earliest = Infinity;
  for (const week of weekStarts) {
    earliest = Math.min(earliest, addWeeks(getStartOfWeek(week), -1).getTime());
  }
  for (const day of extraDays) {
    earliest = Math.min(earliest, new Date(day).getTime());
  }
  return earliest;
}

/**
 * Range to fetch so that data is available from `earliestNeededMs`, given that
 * everything from `loadedFromMs` on is already loaded. Null when nothing is
 * missing. The range starts on a Monday, at least HISTORY_CHUNK_WEEKS weeks
 * before what is loaded, so navigating back week by week rarely waits.
 */
export function getHistoryRangeToLoad(
  earliestNeededMs: number,
  loadedFromMs: number,
): { from: Date; to: Date } | null {
  if (!(earliestNeededMs < loadedFromMs)) return null;
  const chunkStart = addWeeks(getStartOfWeek(loadedFromMs), -HISTORY_CHUNK_WEEKS);
  const neededStart = getStartOfWeek(earliestNeededMs);
  const from = chunkStart.getTime() < neededStart.getTime() ? chunkStart : neededStart;
  // `jusqu` is inclusive in eventsService: stop 1 ms before what is loaded.
  return { from, to: new Date(loadedFromMs - 1) };
}

/**
 * Live events first, then older history events whose id is not already live.
 * Keeps the descending date order of the inputs (live events are all more
 * recent than history events, except at the boundary millisecond).
 */
export function combineLiveAndHistory<T extends { id?: string }>(live: T[], history: T[]): T[] {
  if (history.length === 0) return live;
  if (live.length === 0) return history;
  const liveIds = new Set<string>();
  for (const event of live) if (event.id) liveIds.add(event.id);
  const result = live.slice();
  for (const event of history) {
    if (!event.id || !liveIds.has(event.id)) result.push(event);
  }
  return result;
}

/** Events strictly older than `beforeMs`. */
export function olderThan<T extends { date?: unknown }>(events: T[], beforeMs: number): T[] {
  return events.filter((e) => toMillis(e.date) < beforeMs);
}

export type StatsSplit<T> = { repas: T[]; pompages: T[]; sommeils: T[] };

/** Split a multi-type result the way the screen feeds its three charts. */
export function splitStatsEventsByType<T extends { type?: string }>(events: T[]): StatsSplit<T> {
  const split: StatsSplit<T> = { repas: [], pompages: [], sommeils: [] };
  for (const event of events) {
    if (event.type === "tetee" || event.type === "biberon" || event.type === "solide") {
      split.repas.push(event);
    } else if (event.type === "pompage") {
      split.pompages.push(event);
    } else if (event.type === "sommeil") {
      split.sommeils.push(event);
    }
  }
  return split;
}

/** Rejects with a "timeout" error if `promise` has not settled after `ms`. */
export function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error("timeout")), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}
