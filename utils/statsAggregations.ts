import { toDate } from "@/utils/date";

// Pure aggregations behind the statistics screen and its charts
// (docs/STATS_PERF_REFONTE.md, sprint 1).
//
// Every function takes plain arrays and millisecond bounds and does a single
// pass over its input, without Intl calls: the charts memoize the results on
// (data, week) so a render that changes neither costs nothing.
// `__tests__/statsAggregations.test.ts` checks them against the previous
// in-component implementations.

export const JOURS = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"] as const;
export type Jour = (typeof JOURS)[number];

export const SOLIDE_TYPES = [
  "puree",
  "compote",
  "cereales",
  "yaourt",
  "morceaux",
  "autre",
] as const;
export type SolideType = (typeof SOLIDE_TYPES)[number];

// ============================================
// DATES
// ============================================

/**
 * Milliseconds of a Firestore Timestamp, Date, `{ seconds }` object, number or
 * date string. NaN when the value cannot be read, so range checks reject it.
 */
export function toMillis(value: any): number {
  return toDate(value).getTime();
}

/** Monday 00:00 (local time) of the week containing `date`. */
export function getStartOfWeek(date: Date | number): Date {
  const d = new Date(date);
  const day = d.getDay();
  const dayOfWeek = day === 0 ? 7 : day;
  d.setDate(d.getDate() - (dayOfWeek - 1));
  d.setHours(0, 0, 0, 0);
  return d;
}

/** Calendar-safe week shift (keeps local midnight across DST changes). */
export function addWeeks(date: Date | number, weeks: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + weeks * 7);
  return d;
}

export function addDays(date: Date | number, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

/** Index in JOURS (Monday = 0) of a timestamp, in local time. */
export function dayIndex(ms: number): number {
  return (new Date(ms).getDay() + 6) % 7;
}

export type WeekBounds = {
  startMs: number;
  endMs: number;
  prevStartMs: number;
};

/** Bounds of the week starting at `weekStart` and of the week before it. */
export function getWeekBounds(weekStart: Date | number): WeekBounds {
  const start = getStartOfWeek(weekStart);
  return {
    startMs: start.getTime(),
    endMs: addWeeks(start, 1).getTime(),
    prevStartMs: addWeeks(start, -1).getTime(),
  };
}

function perJour<T>(make: () => T): Record<Jour, T> {
  return {
    Lun: make(),
    Mar: make(),
    Mer: make(),
    Jeu: make(),
    Ven: make(),
    Sam: make(),
    Dim: make(),
  };
}

/** Number of events whose `date` falls in [startMs, endMs). */
export function countInRange(events: any[], startMs: number, endMs: number): number {
  let count = 0;
  for (const event of events) {
    const ms = toMillis(event?.date);
    if (ms >= startMs && ms < endMs) count += 1;
  }
  return count;
}

// ============================================
// REPAS
// ============================================

export type RepasTypeFilter = "tous" | "seins" | "biberons" | "solides";

export type RepasDayData = {
  quantity: number;
  count: number;
  seinsCount: number;
  biberonsCount: number;
  biberonsQuantity: number;
  solidesCount: number;
  solidesByType: Record<SolideType, number>;
};

export type RepasWeekAggregate = {
  days: Record<Jour, RepasDayData>;
  prev: Record<Jour, { count: number; quantity: number }>;
  newFoods: any[];
  reactions: number;
};

const isSeins = (t: any) => {
  const type = t.type || "seins";
  return type === "seins" || type === "tetee" || !t.type;
};
const isBiberon = (t: any) => t.type === "biberons" || t.type === "biberon";
const isSolide = (t: any) => t.type === "solide";

export function matchesRepasFilter(t: any, filter: RepasTypeFilter): boolean {
  if (filter === "tous") return true;
  if (filter === "seins") return isSeins(t);
  if (filter === "biberons") return isBiberon(t);
  if (filter === "solides") return isSolide(t);
  return false;
}

const emptyRepasDay = (): RepasDayData => ({
  quantity: 0,
  count: 0,
  seinsCount: 0,
  biberonsCount: 0,
  biberonsQuantity: 0,
  solidesCount: 0,
  solidesByType: { puree: 0, compote: 0, cereales: 0, yaourt: 0, morceaux: 0, autre: 0 },
});

/** Meals chart: displayed week per day, previous week (ghost bars), new foods, reactions. */
export function aggregateRepasWeek(
  tetees: any[],
  bounds: WeekBounds,
  filter: RepasTypeFilter,
): RepasWeekAggregate {
  const days = perJour(emptyRepasDay);
  const prev = perJour(() => ({ count: 0, quantity: 0 }));
  const newFoods: any[] = [];
  let reactions = 0;

  for (const t of tetees) {
    const ms = toMillis(t.date);
    if (!(ms >= bounds.prevStartMs && ms < bounds.endMs)) continue;
    if (!matchesRepasFilter(t, filter)) continue;
    const jour = JOURS[dayIndex(ms)];

    if (ms < bounds.startMs) {
      prev[jour].count += 1;
      if (isBiberon(t)) prev[jour].quantity += t.quantite || 0;
      continue;
    }

    const day = days[jour];
    day.count += 1;
    if (isSeins(t)) {
      day.seinsCount += 1;
    } else if (isBiberon(t)) {
      const quantite = t.quantite || 0;
      day.biberonsCount += 1;
      day.biberonsQuantity += quantite;
      day.quantity += quantite;
    } else if (isSolide(t)) {
      day.solidesCount += 1;
      const ts = (t.typeSolide || "autre") as SolideType;
      day.solidesByType[SOLIDE_TYPES.includes(ts) ? ts : "autre"] += 1;
      if (t.nouveauAliment) newFoods.push(t);
      if (t.reaction && t.reaction !== "aucune") reactions += 1;
    }
  }

  return { days, prev, newFoods, reactions };
}

// ============================================
// POMPAGES
// ============================================

const pompageTotal = (p: any) => (p.quantiteDroite || 0) + (p.quantiteGauche || 0);

/** Pumping weekly bars: millilitres per day for the displayed and previous week. */
export function aggregatePompagesWeek(
  pompages: any[],
  bounds: WeekBounds,
): { days: Record<Jour, number>; prev: Record<Jour, number> } {
  const days = perJour(() => 0);
  const prev = perJour(() => 0);
  for (const p of pompages) {
    const ms = toMillis(p.date);
    if (!(ms >= bounds.prevStartMs && ms < bounds.endMs)) continue;
    const jour = JOURS[dayIndex(ms)];
    if (ms < bounds.startMs) prev[jour] += pompageTotal(p);
    else days[jour] += pompageTotal(p);
  }
  return { days, prev };
}

export type DailyPompage = { dateObj: Date; totalQuantite: number; [key: string]: any };

/** Pumping sessions of one day, oldest first. */
export function selectDailyPompages(
  pompages: any[],
  dayStartMs: number,
  dayEndMs: number,
): DailyPompage[] {
  const result: DailyPompage[] = [];
  for (const p of pompages) {
    const ms = toMillis(p.date);
    if (!(ms >= dayStartMs && ms < dayEndMs)) continue;
    result.push({ ...p, dateObj: new Date(ms), totalQuantite: pompageTotal(p) });
  }
  return result.sort((a, b) => a.dateObj.getTime() - b.dateObj.getTime());
}

// ============================================
// SOMMEIL
// ============================================

export function getDurationMinutes(s: any): number {
  if (s.duree && typeof s.duree === "number") return s.duree;
  const start = s.heureDebut ? toMillis(s.heureDebut) : NaN;
  const end = s.heureFin ? toMillis(s.heureFin) : NaN;
  if (Number.isFinite(start) && Number.isFinite(end)) {
    return Math.max(0, (end - start) / 60000);
  }
  return 0;
}

export function qualityScore(q: string | undefined): number {
  if (q === "paisible") return 3;
  if (q === "agité") return 2;
  if (q === "mauvais") return 1;
  return 2; // default moderate
}

export type SommeilDayData = {
  nuitMinutes: number;
  siesteMinutes: number;
  count: number;
  nuitCount: number;
  siesteCount: number;
};

/** Sleep chart: minutes per day (night / nap) for the displayed week, totals for the previous one. */
export function aggregateSommeilWeek(
  sommeils: any[],
  bounds: WeekBounds,
): {
  days: Record<Jour, SommeilDayData>;
  prev: Record<Jour, { total: number }>;
  weekSommeils: any[];
} {
  const days = perJour<SommeilDayData>(() => ({
    nuitMinutes: 0,
    siesteMinutes: 0,
    count: 0,
    nuitCount: 0,
    siesteCount: 0,
  }));
  const prev = perJour(() => ({ total: 0 }));
  const weekSommeils: any[] = [];

  for (const s of sommeils) {
    const ms = toMillis(s.date);
    if (!(ms >= bounds.prevStartMs && ms < bounds.endMs)) continue;
    const jour = JOURS[dayIndex(ms)];
    const dur = getDurationMinutes(s);
    if (ms < bounds.startMs) {
      prev[jour].total += dur;
      continue;
    }
    weekSommeils.push(s);
    const day = days[jour];
    day.count += 1;
    if (s.isNap) {
      day.siesteMinutes += dur;
      day.siesteCount += 1;
    } else {
      day.nuitMinutes += dur;
      day.nuitCount += 1;
    }
  }

  return { days, prev, weekSommeils };
}

/** Meal times (ms), ascending, for the meal/sleep correlation lookups. */
export function sortedMealTimes(repas: any[]): number[] {
  const times: number[] = [];
  for (const r of repas) {
    const ms = toMillis(r.date);
    if (Number.isFinite(ms)) times.push(ms);
  }
  return times.sort((a, b) => a - b);
}

const SIX_HOURS_MS = 6 * 3600000;

/**
 * Average gap between the last meal (within 6 h) and each night sleep of the
 * week, with the average quality of those nights. Binary search per night on
 * the sorted meal times: O(n log m) instead of copying every meal per night.
 */
export function computeMealSleepCorrelation(
  weekSommeils: any[],
  mealTimes: number[],
): { avgGapMinutes: number; avgQuality: number; sampleSize: number } | null {
  if (mealTimes.length === 0) return null;
  const nights = weekSommeils.filter((s) => !s.isNap);
  if (nights.length === 0) return null;

  let gapSum = 0;
  let qualitySum = 0;
  let samples = 0;
  for (const sleep of nights) {
    const sleepStart = toMillis(sleep.heureDebut ? sleep.heureDebut : sleep.date);
    if (!Number.isFinite(sleepStart)) continue;
    // Last meal strictly before the start of the sleep.
    let lo = 0;
    let hi = mealTimes.length - 1;
    let found = -1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (mealTimes[mid] < sleepStart) {
        found = mid;
        lo = mid + 1;
      } else {
        hi = mid - 1;
      }
    }
    if (found === -1 || mealTimes[found] < sleepStart - SIX_HOURS_MS) continue;
    gapSum += (sleepStart - mealTimes[found]) / 60000;
    qualitySum += qualityScore(sleep.quality);
    samples += 1;
  }

  if (samples === 0) return null;
  return { avgGapMinutes: gapSum / samples, avgQuality: qualitySum / samples, sampleSize: samples };
}

// ============================================
// PDF REPORT (12 weeks)
// ============================================

export type ReportLieux = Record<string, number>;

export type ReportWeekRow = {
  label: string;
  tetees: number;
  biberons: number;
  solides: number;
  repasTotal: number;
  pompages: number;
  pompagesMl: number;
  nuits: number;
  siestes: number;
  sommeilTotal: number;
  sommeilMinutes: number;
  nuitLieux: ReportLieux;
  siesteLieux: ReportLieux;
};

const emptyLieux = (): ReportLieux => ({ lit: 0, cododo: 0, poussette: 0, voiture: 0, autre: 0 });

/** First ms of each of the `weeks` weeks ending with the current one, plus the end bound. */
export function getReportWeekBoundaries(now: Date, weeks = 12): number[] {
  const current = getStartOfWeek(now);
  const bounds: number[] = [];
  for (let i = weeks - 1; i >= 0; i -= 1) bounds.push(addWeeks(current, -i).getTime());
  bounds.push(addWeeks(current, 1).getTime());
  return bounds;
}

function bucketOf(bounds: number[], ms: number): number {
  if (!(ms >= bounds[0] && ms < bounds[bounds.length - 1])) return -1;
  let lo = 0;
  let hi = bounds.length - 2;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (bounds[mid] <= ms) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

/** Weekly rows of the 12-week PDF report, one pass per event list. */
export function buildReportWeekRows(
  repas: any[],
  pompages: any[],
  sommeils: any[],
  now: Date,
  weeks = 12,
): ReportWeekRow[] {
  const bounds = getReportWeekBoundaries(now, weeks);
  const rows: ReportWeekRow[] = bounds.slice(0, -1).map((startMs) => {
    const ws = new Date(startMs);
    return {
      label: `${ws.getDate()}/${ws.getMonth() + 1}`,
      tetees: 0,
      biberons: 0,
      solides: 0,
      repasTotal: 0,
      pompages: 0,
      pompagesMl: 0,
      nuits: 0,
      siestes: 0,
      sommeilTotal: 0,
      sommeilMinutes: 0,
      nuitLieux: emptyLieux(),
      siesteLieux: emptyLieux(),
    };
  });

  for (const t of repas) {
    const i = bucketOf(bounds, toMillis(t.date));
    if (i === -1) continue;
    const type = t.type || "tetee";
    if (type === "tetee" || type === "seins") rows[i].tetees++;
    else if (type === "biberon") rows[i].biberons++;
    else if (type === "solide") rows[i].solides++;
    rows[i].repasTotal++;
  }

  for (const p of pompages) {
    const i = bucketOf(bounds, toMillis(p.date));
    if (i === -1) continue;
    rows[i].pompages++;
    rows[i].pompagesMl += (p.quantiteGauche || 0) + (p.quantiteDroite || 0) + (p.totalQuantite || 0);
  }

  for (const s of sommeils) {
    const i = bucketOf(bounds, toMillis(s.date));
    if (i === -1) continue;
    const loc = s.location || "autre";
    const row = rows[i];
    row.sommeilTotal++;
    row.sommeilMinutes += getDurationMinutes(s);
    if (s.isNap) {
      row.siestes++;
      row.siesteLieux[loc] = (row.siesteLieux[loc] || 0) + 1;
    } else {
      row.nuits++;
      row.nuitLieux[loc] = (row.nuitLieux[loc] || 0) + 1;
    }
  }

  return rows;
}
