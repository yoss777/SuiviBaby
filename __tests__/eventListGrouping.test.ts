import { formatDayLabel, formatSelectedDateLabel } from "@/utils/dayLabel";
import { dayKey, filterByDay, getDateTime, groupByDay } from "@/utils/eventListGrouping";

const NOW = new Date(2026, 10, 7, 15, 0, 0); // samedi 7 novembre 2026, 15h

beforeEach(() => {
  jest.useFakeTimers();
  jest.setSystemTime(NOW);
});

afterEach(() => {
  jest.useRealTimers();
});

const at = (day: number, hour: number, minute = 0) => new Date(2026, 10, day, hour, minute);

describe("dayKey", () => {
  it("utilise l'heure locale", () => {
    expect(dayKey(at(7, 0, 5))).toBe("2026-11-07");
    expect(dayKey(at(6, 23, 59))).toBe("2026-11-06");
    expect(dayKey(new Date(2026, 0, 3))).toBe("2026-01-03");
  });
});

describe("filterByDay", () => {
  const items = [
    { id: "a", date: at(7, 9) },
    { id: "b", date: { seconds: Math.floor(at(6, 22).getTime() / 1000) } },
    { id: "c", date: at(1, 8) },
  ];

  it("masque d'abord les éléments supprimés", () => {
    const result = filterByDay(items, {
      selectedDate: "2026-11-07",
      filter: null,
      softDeletedIds: new Set(["a"]),
    });
    expect(result).toEqual([]);
  });

  it("la date choisie prime sur le filtre", () => {
    const result = filterByDay(items, {
      selectedDate: "2026-11-06",
      filter: "today",
      softDeletedIds: new Set(),
    });
    expect(result.map((i) => i.id)).toEqual(["b"]);
  });

  it("filtre aujourd'hui / passé / tout", () => {
    const base = { selectedDate: null, softDeletedIds: new Set<string>() };
    expect(filterByDay(items, { ...base, filter: "today" }).map((i) => i.id)).toEqual(["a"]);
    expect(filterByDay(items, { ...base, filter: "past" }).map((i) => i.id)).toEqual(["b", "c"]);
    expect(filterByDay(items, { ...base, filter: null }).map((i) => i.id)).toEqual(["a", "b", "c"]);
  });

  it("suit le jour de `now` (passage de minuit)", () => {
    const result = filterByDay(items, {
      selectedDate: null,
      filter: "today",
      softDeletedIds: new Set(),
      now: at(8, 0, 1),
    });
    expect(result).toEqual([]);
  });

  it("ne modifie pas les dates des éléments", () => {
    const date = at(7, 9, 30);
    filterByDay([{ id: "x", date }], { selectedDate: null, filter: "today", softDeletedIds: new Set() });
    expect(date.getHours()).toBe(9);
    expect(date.getMinutes()).toBe(30);
  });
});

describe("dates invalides ou absentes", () => {
  const bad = [
    { id: "n", date: null },
    { id: "u", date: undefined },
    { id: "x", date: "pas une date" },
    { id: "o", date: {} },
  ];
  const good = { id: "g", date: at(7, 9) };

  it("filterByDay ignore les éléments sans date valide, quel que soit le filtre", () => {
    const all = [...bad, good];
    const opts = { selectedDate: null, softDeletedIds: new Set<string>() };
    expect(filterByDay(all, { ...opts, filter: null }).map((i) => i.id)).toEqual(["g"]);
    expect(filterByDay(all, { ...opts, filter: "today" }).map((i) => i.id)).toEqual(["g"]);
    expect(filterByDay(all, { ...opts, filter: "past" })).toEqual([]);
    expect(filterByDay(all, { ...opts, selectedDate: "2026-11-07", filter: null }).map((i) => i.id)).toEqual(["g"]);
  });

  it("groupByDay n'invente pas de groupe NaN-NaN-NaN / Invalid Date", () => {
    const groups = groupByDay([...bad, good, { id: "h", date: at(6, 8) }]);
    expect(groups.map((g) => g.date)).toEqual(["2026-11-07", "2026-11-06"]);
    expect(groups.flatMap((g) => g.items.map((i) => i.id))).toEqual(["g", "h"]);
    expect(JSON.stringify(groups)).not.toMatch(/NaN|Invalid/);
  });

  it("groupByDay : liste d'éléments tous invalides = aucun groupe", () => {
    expect(groupByDay(bad)).toEqual([]);
  });

  it("le tri par getDateTime reste total (null = 0, jamais NaN)", () => {
    const sorted = [{ date: null }, { date: at(7, 9) }, { date: at(6, 9) }, { date: undefined }].sort(
      (a, b) => getDateTime(b.date) - getDateTime(a.date),
    );
    expect(sorted.map((i) => getDateTime(i.date))).toEqual([
      at(7, 9).getTime(),
      at(6, 9).getTime(),
      0,
      0,
    ]);
    expect(getDateTime(null)).toBe(0);
  });
});

describe("groupByDay", () => {
  it("groupes et éléments du plus récent au plus ancien, tête = plus récent", () => {
    const items = [
      { id: "old", date: at(5, 8) },
      { id: "t1", date: at(7, 8) },
      { id: "t2", date: at(7, 12) },
      { id: "y1", date: at(6, 20) },
    ];
    const groups = groupByDay(items, (dayItems) => ({ count: dayItems.length }));

    expect(groups.map((g) => g.date)).toEqual(["2026-11-07", "2026-11-06", "2026-11-05"]);
    expect(groups[0].items.map((i) => i.id)).toEqual(["t2", "t1"]);
    expect(groups[0].lead.id).toBe("t2");
    expect(groups[0].count).toBe(2);
    expect(groups[1].lead.id).toBe("y1");
  });

  it("à égalité, garde le premier élément rencontré en tête", () => {
    const groups = groupByDay([
      { id: "first", date: at(7, 8) },
      { id: "second", date: at(7, 8) },
    ]);
    expect(groups[0].lead.id).toBe("first");
  });

  it("trie aussi des dates Timestamp-like", () => {
    const s = (d: Date) => ({ seconds: Math.floor(d.getTime() / 1000) });
    const groups = groupByDay([
      { id: "a", date: s(at(7, 8)) },
      { id: "b", date: s(at(7, 10)) },
    ]);
    expect(groups[0].items.map((i) => i.id)).toEqual(["b", "a"]);
    expect(getDateTime(groups[0].lead.date)).toBe(at(7, 10).getTime());
  });
});

describe("formatDayLabel", () => {
  it("affiche Aujourd'hui sauf sous le filtre aujourd'hui", () => {
    expect(formatDayLabel("2026-11-07", { selectedFilter: null })).toBe("Aujourd'hui");
    expect(formatDayLabel("2026-11-07", { selectedFilter: "past" })).toBe("Aujourd'hui");
    expect(formatDayLabel("2026-11-07", { selectedFilter: "today" })).not.toBe("Aujourd'hui");
  });

  it("affiche Hier puis la date courte", () => {
    expect(formatDayLabel("2026-11-06", { selectedFilter: null })).toBe("Hier");
    expect(formatDayLabel("2026-11-02", { selectedFilter: null })).toBe(
      new Date(2026, 10, 2).toLocaleDateString("fr-FR", {
        weekday: "short",
        day: "numeric",
        month: "short",
      }),
    );
  });
});

describe("formatSelectedDateLabel", () => {
  it("formate jour + mois court", () => {
    expect(formatSelectedDateLabel("2026-11-07")).toBe(
      new Date(2026, 10, 7).toLocaleDateString("fr-FR", { day: "numeric", month: "short" }),
    );
  });
});
