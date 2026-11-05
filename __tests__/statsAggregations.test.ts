import {
  JOURS,
  aggregatePompagesWeek,
  aggregateRepasWeek,
  aggregateSommeilWeek,
  buildReportWeekRows,
  computeMealSleepCorrelation,
  countInRange,
  getDurationMinutes,
  getWeekBounds,
  matchesRepasFilter,
  selectDailyPompages,
  sortedMealTimes,
  toMillis,
  type RepasTypeFilter,
} from "@/utils/statsAggregations";

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { buildStatsEvents, splitStatsEvents } = require("../scripts/statsPerfFixtures.js");

// ---------------------------------------------------------------------------
// Reference: the computations as they were written inside the chart
// components before sprint 1 (Date objects, toLocaleDateString day keys).
// Node ships full ICU, so "fr-FR" weekday names resolve like on iOS.
// ---------------------------------------------------------------------------

const legacyDayKey = (d: Date) => {
  const jour = d.toLocaleDateString("fr-FR", { weekday: "short" });
  return jour.charAt(0).toUpperCase() + jour.slice(1, 3);
};
// Independent copy of the old getStartOfWeek (not the module under test).
const getStartOfWeek = (date: Date) => {
  const d = new Date(date);
  const day = d.getDay();
  const dayOfWeek = day === 0 ? 7 : day;
  d.setDate(d.getDate() - (dayOfWeek - 1));
  d.setHours(0, 0, 0, 0);
  return d;
};
const SOLIDE_TYPES_LEGACY = ["puree", "compote", "cereales", "yaourt", "morceaux", "autre"];
const legacyAddWeeks = (date: Date, weeks: number) => {
  const d = new Date(date);
  d.setDate(d.getDate() + weeks * 7);
  return d;
};
const legacyToDate = (d: any): Date => {
  if (d instanceof Date) return d;
  if (d && typeof d.toDate === "function") return d.toDate();
  if (d && d.seconds) return new Date(d.seconds * 1000);
  return new Date(d);
};
const legacyDuration = (s: any): number => {
  if (s.duree && typeof s.duree === "number") return s.duree;
  const start = s.heureDebut ? legacyToDate(s.heureDebut) : null;
  const end = s.heureFin ? legacyToDate(s.heureFin) : null;
  if (start && end) return Math.max(0, (end.getTime() - start.getTime()) / 60000);
  return 0;
};
const legacyQuality = (q: string | undefined) =>
  q === "paisible" ? 3 : q === "agité" ? 2 : q === "mauvais" ? 1 : 2;

function legacyRepas(tetees: any[], currentWeek: Date, typeFilter: RepasTypeFilter) {
  const start = getStartOfWeek(currentWeek);
  const end = legacyAddWeeks(start, 1);
  const filtered = tetees.filter((t) => {
    if (typeFilter === "tous") return true;
    const type = t.type || "seins";
    if (typeFilter === "seins") return type === "seins" || type === "tetee" || !t.type;
    if (typeFilter === "biberons") return type === "biberons" || type === "biberon";
    if (typeFilter === "solides") return type === "solide";
    return false;
  });
  const emptyDay = () => ({
    quantity: 0, count: 0, seinsCount: 0, biberonsCount: 0, biberonsQuantity: 0, solidesCount: 0,
    solidesByType: { puree: 0, compote: 0, cereales: 0, yaourt: 0, morceaux: 0, autre: 0 } as Record<string, number>,
  });
  const days: Record<string, ReturnType<typeof emptyDay>> = {};
  JOURS.forEach((j) => { days[j] = emptyDay(); });
  filtered.forEach((t) => {
    const d = new Date(t.date);
    if (d >= start && d < end) {
      const key = legacyDayKey(d);
      const type = t.type || "seins";
      const quantite = t.quantite || 0;
      days[key].count += 1;
      if (type === "seins" || type === "tetee" || !t.type) days[key].seinsCount += 1;
      else if (type === "biberons" || type === "biberon") {
        days[key].biberonsCount += 1;
        days[key].biberonsQuantity += quantite;
        days[key].quantity += quantite;
      } else if (type === "solide") {
        days[key].solidesCount += 1;
        const ts = t.typeSolide || "autre";
        days[key].solidesByType[SOLIDE_TYPES_LEGACY.includes(ts) ? ts : "autre"] += 1;
      }
    }
  });
  const prevStart = legacyAddWeeks(start, -1);
  const prev: Record<string, { count: number; quantity: number }> = {};
  JOURS.forEach((j) => { prev[j] = { count: 0, quantity: 0 }; });
  tetees.forEach((t) => {
    const d = new Date(t.date);
    if (d >= prevStart && d < start) {
      const type = t.type || "seins";
      if (typeFilter !== "tous") {
        if (typeFilter === "seins" && type !== "seins" && type !== "tetee" && t.type) return;
        if (typeFilter === "biberons" && type !== "biberons" && type !== "biberon") return;
        if (typeFilter === "solides" && type !== "solide") return;
      }
      const key = legacyDayKey(d);
      prev[key].count += 1;
      if (type === "biberons" || type === "biberon") prev[key].quantity += t.quantite || 0;
    }
  });
  const inWeek = (t: any) => { const d = new Date(t.date); return d >= start && d < end; };
  const newFoods = filtered.filter((t) => t.type === "solide" && inWeek(t) && t.nouveauAliment);
  const reactions = filtered.filter(
    (t) => t.type === "solide" && inWeek(t) && t.reaction && t.reaction !== "aucune",
  ).length;
  return { days, prev, newFoods, reactions };
}

function legacyPompages(pompages: any[], currentWeek: Date) {
  const weekStart = getStartOfWeek(currentWeek);
  const weekEnd = legacyAddWeeks(weekStart, 1);
  const prevStart = legacyAddWeeks(weekStart, -1);
  const days: Record<string, number> = {};
  const prev: Record<string, number> = {};
  JOURS.forEach((j) => { days[j] = 0; prev[j] = 0; });
  pompages.forEach((p) => {
    const d = new Date(p.date);
    const total = (p.quantiteDroite || 0) + (p.quantiteGauche || 0);
    if (d >= weekStart && d < weekEnd) days[legacyDayKey(d)] += total;
    if (d >= prevStart && d < weekStart) prev[legacyDayKey(d)] += total;
  });
  return { days, prev };
}

function legacyDaily(pompages: any[], day: Date) {
  const startOfDay = (date: Date) => { const d = new Date(date); d.setHours(0, 0, 0, 0); return d; };
  const currentDay = startOfDay(day);
  return pompages
    .map((p) => ({ ...p, dateObj: new Date(p.date), totalQuantite: (p.quantiteDroite || 0) + (p.quantiteGauche || 0) }))
    .filter((p) => startOfDay(p.dateObj).getTime() === currentDay.getTime())
    .sort((a, b) => a.dateObj.getTime() - b.dateObj.getTime());
}

function legacySommeil(sommeils: any[], repas: any[], currentWeek: Date) {
  const start = getStartOfWeek(currentWeek);
  const end = legacyAddWeeks(start, 1);
  const prevStart = legacyAddWeeks(start, -1);
  const days: Record<string, any> = {};
  const prev: Record<string, { total: number }> = {};
  JOURS.forEach((j) => {
    days[j] = { nuitMinutes: 0, siesteMinutes: 0, count: 0, nuitCount: 0, siesteCount: 0 };
    prev[j] = { total: 0 };
  });
  sommeils.forEach((s) => {
    const d = legacyToDate(s.date);
    if (d >= start && d < end) {
      const key = legacyDayKey(d);
      const dur = legacyDuration(s);
      days[key].count += 1;
      if (s.isNap) { days[key].siesteMinutes += dur; days[key].siesteCount += 1; }
      else { days[key].nuitMinutes += dur; days[key].nuitCount += 1; }
    }
    if (d >= prevStart && d < start) prev[legacyDayKey(d)].total += legacyDuration(s);
  });

  let correlation: any = null;
  if (repas.length > 0 && sommeils.length > 0) {
    const nightSleeps = sommeils.filter((s) => {
      const d = legacyToDate(s.date);
      return d >= start && d < end && !s.isNap;
    });
    const results: { gap: number; quality: number }[] = [];
    nightSleeps.forEach((sleep) => {
      const sleepStart = sleep.heureDebut ? legacyToDate(sleep.heureDebut) : legacyToDate(sleep.date);
      const sixHoursBefore = new Date(sleepStart.getTime() - 6 * 3600000);
      const mealsBefore = repas
        .map((r) => ({ ...r, d: legacyToDate(r.date) }))
        .filter((r) => r.d >= sixHoursBefore && r.d < sleepStart)
        .sort((a, b) => b.d.getTime() - a.d.getTime());
      if (mealsBefore.length > 0) {
        results.push({
          gap: (sleepStart.getTime() - mealsBefore[0].d.getTime()) / 60000,
          quality: legacyQuality(sleep.quality),
        });
      }
    });
    if (results.length > 0) {
      correlation = {
        avgGapMinutes: results.reduce((a, r) => a + r.gap, 0) / results.length,
        avgQuality: results.reduce((a, r) => a + r.quality, 0) / results.length,
        sampleSize: results.length,
      };
    }
  }
  return { days, prev, correlation };
}

// ---------------------------------------------------------------------------

const NOW = new Date(2026, 10, 5, 12, 0, 0);
const events = buildStatsEvents({ total: 3000, days: 365, now: NOW.getTime(), seed: 7 });
const { repas, pompages, sommeils } = splitStatsEvents(events);

// Current week, a past week, and the week of the October DST change (Europe/Paris).
const WEEKS = [NOW, new Date(2026, 6, 15), new Date(2026, 9, 26)];
const FILTERS: RepasTypeFilter[] = ["tous", "seins", "biberons", "solides"];

describe("statsAggregations — same results as the previous chart code", () => {
  it.each(WEEKS.flatMap((w) => FILTERS.map((f) => [w, f] as const)))(
    "repas, week of %s, filter %s",
    (week, filter) => {
      const expected = legacyRepas(repas, week, filter);
      const actual = aggregateRepasWeek(repas, getWeekBounds(week), filter);
      expect(actual.days).toEqual(expected.days);
      expect(actual.prev).toEqual(expected.prev);
      expect(actual.newFoods.map((e) => e.id)).toEqual(expected.newFoods.map((e: any) => e.id));
      expect(actual.reactions).toBe(expected.reactions);
    },
  );

  it.each(WEEKS)("pompages, week of %s", (week) => {
    expect(aggregatePompagesWeek(pompages, getWeekBounds(week))).toEqual(legacyPompages(pompages, week));
  });

  it("pompages of one day", () => {
    for (const day of [NOW, new Date(2026, 9, 25), new Date(2026, 2, 29)]) {
      const start = new Date(day);
      start.setHours(0, 0, 0, 0);
      const end = new Date(start);
      end.setDate(end.getDate() + 1);
      const actual = selectDailyPompages(pompages, start.getTime(), end.getTime());
      const expected = legacyDaily(pompages, day);
      expect(actual.map((p) => [p.id, p.totalQuantite, p.dateObj.getTime()])).toEqual(
        expected.map((p) => [p.id, p.totalQuantite, p.dateObj.getTime()]),
      );
    }
  });

  it.each(WEEKS)("sommeil and meal/sleep correlation, week of %s", (week) => {
    const expected = legacySommeil(sommeils, repas, week);
    const actual = aggregateSommeilWeek(sommeils, getWeekBounds(week));
    expect(actual.days).toEqual(expected.days);
    expect(actual.prev).toEqual(expected.prev);
    const correlation = computeMealSleepCorrelation(actual.weekSommeils, sortedMealTimes(repas));
    if (expected.correlation === null) {
      expect(correlation).toBeNull();
    } else {
      expect(correlation!.sampleSize).toBe(expected.correlation.sampleSize);
      expect(correlation!.avgGapMinutes).toBeCloseTo(expected.correlation.avgGapMinutes, 9);
      expect(correlation!.avgQuality).toBeCloseTo(expected.correlation.avgQuality, 9);
    }
  });

  it("weekly counts of the resume cards", () => {
    const { startMs, endMs } = getWeekBounds(NOW);
    const inRange = (list: any[]) =>
      list.filter((e) => e.date.getTime() >= startMs && e.date.getTime() < endMs).length;
    expect(countInRange(repas, startMs, endMs)).toBe(inRange(repas));
    expect(countInRange(sommeils, startMs, endMs)).toBe(inRange(sommeils));
  });

  it("12-week PDF rows", () => {
    const rows = buildReportWeekRows(repas, pompages, sommeils, NOW);
    expect(rows).toHaveLength(12);
    const current = getWeekBounds(NOW);
    const firstStart = legacyAddWeeks(getStartOfWeek(NOW), -11).getTime();
    const inReport = (e: any) => e.date.getTime() >= firstStart && e.date.getTime() < current.endMs;
    const weekRepas = repas.filter(
      (e: any) => e.date.getTime() >= current.startMs && e.date.getTime() < current.endMs,
    );
    expect(rows[11].repasTotal).toBe(weekRepas.length);
    expect(rows[11].tetees).toBe(weekRepas.filter((e: any) => e.type === "tetee").length);
    expect(rows[11].label).toBe(
      `${new Date(current.startMs).getDate()}/${new Date(current.startMs).getMonth() + 1}`,
    );
    expect(rows.reduce((a, r) => a + r.sommeilTotal, 0)).toBe(sommeils.filter(inReport).length);
    expect(rows.reduce((a, r) => a + r.pompages, 0)).toBe(pompages.filter(inReport).length);
  });
});

// Old PDF computation (stats.tsx before sprint 1), week by week.
function legacyReportRows(tetees: any[], pompages: any[], sommeils: any[], now: Date) {
  const currentWeekStart = getStartOfWeek(now);
  const weeks: { start: Date; end: Date; label: string }[] = [];
  for (let i = 11; i >= 0; i--) {
    const ws = new Date(currentWeekStart);
    ws.setDate(ws.getDate() - i * 7);
    const we = new Date(ws);
    we.setDate(we.getDate() + 7);
    weeks.push({ start: ws, end: we, label: `${ws.getDate()}/${ws.getMonth() + 1}` });
  }
  const emptyLieux = () => ({ lit: 0, cododo: 0, poussette: 0, voiture: 0, autre: 0 }) as Record<string, number>;
  return weeks.map((w) => {
    const row = {
      label: w.label, tetees: 0, biberons: 0, solides: 0, repasTotal: 0, pompages: 0, pompagesMl: 0,
      nuits: 0, siestes: 0, sommeilTotal: 0, sommeilMinutes: 0, nuitLieux: emptyLieux(), siesteLieux: emptyLieux(),
    };
    tetees.forEach((t) => {
      const d = legacyToDate(t.date);
      if (d >= w.start && d < w.end) {
        const type = t.type || "tetee";
        if (type === "tetee" || type === "seins") row.tetees++;
        else if (type === "biberon") row.biberons++;
        else if (type === "solide") row.solides++;
        row.repasTotal++;
      }
    });
    pompages.forEach((p) => {
      const d = legacyToDate(p.date);
      if (d >= w.start && d < w.end) {
        row.pompages++;
        row.pompagesMl += (p.quantiteGauche || 0) + (p.quantiteDroite || 0) + (p.totalQuantite || 0);
      }
    });
    sommeils.forEach((s) => {
      const d = legacyToDate(s.date);
      if (d >= w.start && d < w.end) {
        const loc = s.location || "autre";
        row.sommeilTotal++;
        row.sommeilMinutes += legacyDuration(s);
        if (s.isNap) { row.siestes++; row.siesteLieux[loc] = (row.siesteLieux[loc] || 0) + 1; }
        else { row.nuits++; row.nuitLieux[loc] = (row.nuitLieux[loc] || 0) + 1; }
      }
    });
    return row;
  });
}

// Hand-made events on every edge the random history does not reach.
const WEEK = getWeekBounds(NOW);
const monday = new Date(WEEK.startMs);
const at = (base: number, deltaMs: number) => new Date(base + deltaMs);
const edgeRepas = [
  { id: "untyped", date: at(WEEK.startMs, 0) }, // Monday 00:00:00.000, no type → seins
  { id: "seins", type: "seins", date: at(WEEK.startMs, 3600000) },
  { id: "biberons", type: "biberons", date: at(WEEK.startMs, 7200000), quantite: 90 },
  { id: "no-qty", type: "biberon", date: at(WEEK.endMs, -1) }, // Sunday 23:59:59.999
  { id: "unknown", type: "autre-repas", date: at(WEEK.startMs, 3 * 3600000) },
  { id: "solide-x", type: "solide", typeSolide: "toString", nouveauAliment: true, date: at(WEEK.startMs, 4 * 3600000) },
  { id: "solide-none", type: "solide", reaction: "aucune", date: at(WEEK.startMs, 5 * 3600000) },
  { id: "prev-start", type: "biberon", quantite: 50, date: at(WEEK.prevStartMs, 0) },
  { id: "before-prev", type: "biberon", quantite: 70, date: at(WEEK.prevStartMs, -1) },
  { id: "end-excluded", type: "tetee", date: at(WEEK.endMs, 0) },
];
const night = at(WEEK.startMs, 2 * 86400000 + 21 * 3600000); // Wednesday 21:00
const edgeSommeils = [
  { id: "night", isNap: false, date: night, heureDebut: night, heureFin: at(night.getTime(), 8 * 3600000), quality: "agité", location: "lit" },
  { id: "night-no-start", isNap: false, date: at(night.getTime(), 86400000), heureFin: at(night.getTime(), 86400000 + 3600000) },
  { id: "nap-duree", isNap: true, duree: 45, date: at(WEEK.startMs, 10 * 3600000), location: "poussette" },
  { id: "nap-zero", isNap: true, duree: 0, date: at(WEEK.startMs, 12 * 3600000) },
];
const edgeMeals = [
  { id: "exactly-6h", type: "biberon", date: at(night.getTime(), -6 * 3600000) },
  { id: "at-sleep-start", type: "biberon", date: night },
  { id: "next-night-meal", type: "tetee", date: at(night.getTime(), 86400000 - 30 * 60000) },
];

describe("statsAggregations — edge cases against the previous code", () => {
  it.each(FILTERS)("repas edge events, filter %s", (filter) => {
    const expected = legacyRepas(edgeRepas, monday, filter);
    const actual = aggregateRepasWeek(edgeRepas, WEEK, filter);
    expect(actual.days).toEqual(expected.days);
    expect(actual.prev).toEqual(expected.prev);
    expect(actual.newFoods.map((e) => e.id)).toEqual(expected.newFoods.map((e: any) => e.id));
    expect(actual.reactions).toBe(expected.reactions);
  });

  it("sleep edge events, 6 h meal bound inclusive and sleep start exclusive", () => {
    const expected = legacySommeil(edgeSommeils, edgeMeals, monday);
    const actual = aggregateSommeilWeek(edgeSommeils, WEEK);
    expect(actual.days).toEqual(expected.days);
    expect(actual.prev).toEqual(expected.prev);
    expect(computeMealSleepCorrelation(actual.weekSommeils, sortedMealTimes(edgeMeals))).toEqual(
      expected.correlation,
    );
  });

  it("12-week PDF rows equal the old computation row by row", () => {
    const allRepas = [...repas, ...edgeRepas];
    const allSommeils = [...sommeils, ...edgeSommeils];
    expect(buildReportWeekRows(allRepas, pompages, allSommeils, NOW)).toEqual(
      legacyReportRows(allRepas, pompages, allSommeils, NOW),
    );
  });

  it("meal filters: truth table of the stored types", () => {
    const table: [any, Record<RepasTypeFilter, boolean>][] = [
      [{}, { tous: true, seins: true, biberons: false, solides: false }],
      [{ type: "tetee" }, { tous: true, seins: true, biberons: false, solides: false }],
      [{ type: "seins" }, { tous: true, seins: true, biberons: false, solides: false }],
      [{ type: "biberon" }, { tous: true, seins: false, biberons: true, solides: false }],
      [{ type: "biberons" }, { tous: true, seins: false, biberons: true, solides: false }],
      [{ type: "solide" }, { tous: true, seins: false, biberons: false, solides: true }],
      [{ type: "autre" }, { tous: true, seins: false, biberons: false, solides: false }],
    ];
    for (const [event, expected] of table) {
      for (const filter of FILTERS) expect(matchesRepasFilter(event, filter)).toBe(expected[filter]);
    }
  });
});

// Two deliberate differences with the old chart code (docs/STATS_PERF_REFONTE.md).
describe("statsAggregations — deliberate fixes", () => {
  it("reads { seconds } dates in the meals and pumping charts (they were dropped before)", () => {
    const ms = WEEK.startMs + 3600000;
    const result = aggregateRepasWeek([{ id: "o", type: "biberon", quantite: 80, date: { seconds: ms / 1000 } }], WEEK, "tous");
    expect(result.days.Lun.biberonsQuantity).toBe(80);
  });

  it("counts an unreadable sleep time as 0 minutes instead of turning totals into NaN", () => {
    expect(getDurationMinutes({ heureDebut: "not a date", heureFin: new Date() })).toBe(0);
    expect(getDurationMinutes({ heureDebut: new Date() })).toBe(0);
    expect(getDurationMinutes({ duree: 0, heureDebut: new Date(0), heureFin: new Date(60000) })).toBe(1);
    expect(getDurationMinutes({ duree: 30 })).toBe(30);
  });
});

// Sprint 0 reference measure (docs/STATS_PERF_REFONTE.md, "Mesures"):
//   STATS_BENCH=1 npx jest __tests__/statsAggregations.test.ts -t bench
// One "render" = the data work all three charts did on every render before
// sprint 1 (their useMemo never hit), versus the memoized single passes now.
const benchIt = process.env.STATS_BENCH === "1" ? it : it.skip;
describe("bench", () => {
  benchIt("per-render data cost, 3 000 events", () => {
    const time = (fn: () => void, runs = 20) => {
      fn();
      const t0 = performance.now();
      for (let i = 0; i < runs; i += 1) fn();
      return (performance.now() - t0) / runs;
    };
    const legacy = time(() => {
      legacyRepas(repas, NOW, "tous");
      legacySommeil(sommeils, repas, NOW);
      legacyPompages(pompages, NOW);
      legacyDaily(pompages, NOW);
    });
    const bounds = getWeekBounds(NOW);
    const dayStart = new Date(NOW);
    dayStart.setHours(0, 0, 0, 0);
    const current = time(() => {
      aggregateRepasWeek(repas, bounds, "tous");
      const s = aggregateSommeilWeek(sommeils, bounds);
      computeMealSleepCorrelation(s.weekSommeils, sortedMealTimes(repas));
      aggregatePompagesWeek(pompages, bounds);
      selectDailyPompages(pompages, dayStart.getTime(), dayStart.getTime() + 86400000);
    });
    const perChart = {
      repas: time(() => legacyRepas(repas, NOW, "tous")),
      pompages: time(() => {
        legacyPompages(pompages, NOW);
        legacyDaily(pompages, NOW);
      }),
      sommeil: time(() => legacySommeil(sommeils, repas, NOW)),
    };
    console.log(
      `[stats-bench] legacy ${legacy.toFixed(2)} ms/render · new ${current.toFixed(2)} ms/pass · ` +
        `legacy per chart repas ${perChart.repas.toFixed(2)} pompages ${perChart.pompages.toFixed(2)} sommeil ${perChart.sommeil.toFixed(2)}`,
    );
    expect(current).toBeLessThan(legacy);
  });
});

describe("toMillis", () => {
  it("reads every date shape stored in events", () => {
    const ms = Date.UTC(2026, 0, 2, 3, 4, 5);
    expect(toMillis(new Date(ms))).toBe(ms);
    expect(toMillis({ toMillis: () => ms })).toBe(ms);
    expect(toMillis({ toDate: () => new Date(ms) })).toBe(ms);
    expect(toMillis({ seconds: ms / 1000 })).toBe(ms);
    expect(toMillis(ms)).toBe(ms);
    expect(toMillis(new Date(ms).toISOString())).toBe(ms);
    expect(Number.isNaN(toMillis(null))).toBe(true);
    expect(Number.isNaN(toMillis("not a date"))).toBe(true);
  });
});

describe("computeMealSleepCorrelation", () => {
  it("only counts a meal taken within 6 h before the night", () => {
    const night = new Date(2026, 10, 3, 21, 0);
    const sleep = { isNap: false, heureDebut: night, date: night, quality: "paisible" };
    const at = (h: number) => new Date(night.getTime() - h * 3600000).getTime();
    expect(computeMealSleepCorrelation([sleep], [at(7)])).toBeNull();
    expect(computeMealSleepCorrelation([sleep], [at(7), at(2), at(0.5)])).toEqual({
      avgGapMinutes: 30,
      avgQuality: 3,
      sampleSize: 1,
    });
    expect(computeMealSleepCorrelation([{ ...sleep, isNap: true }], [at(1)])).toBeNull();
  });
});
