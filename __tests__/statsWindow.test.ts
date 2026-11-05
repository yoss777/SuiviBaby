import {
  HISTORY_CHUNK_WEEKS,
  combineLiveAndHistory,
  getEarliestNeededMs,
  getHistoryRangeToLoad,
  getLiveSince,
  olderThan,
  splitStatsEventsByType,
} from "@/utils/statsWindow";

const NOW = new Date(2026, 10, 5, 12, 0); // Thursday 5 Nov 2026

describe("getLiveSince", () => {
  it("starts on the Monday two weeks before the current week, at midnight", () => {
    const since = getLiveSince(NOW);
    expect(since.getDay()).toBe(1);
    expect(since.getHours()).toBe(0);
    expect(since.getTime()).toBe(new Date(2026, 9, 19).getTime());
  });
});

describe("getEarliestNeededMs", () => {
  it("is the week before the oldest displayed week, or the displayed day if older", () => {
    const thisWeek = new Date(2026, 10, 2);
    const older = new Date(2026, 9, 12);
    expect(getEarliestNeededMs([thisWeek, older])).toBe(new Date(2026, 9, 5).getTime());
    const oldDay = new Date(2026, 8, 1);
    expect(getEarliestNeededMs([thisWeek], [oldDay])).toBe(oldDay.getTime());
  });

  it("stays inside the live window when every chart shows the current week", () => {
    const thisWeek = new Date(2026, 10, 2);
    expect(getEarliestNeededMs([thisWeek, thisWeek, thisWeek], [NOW])).toBeGreaterThanOrEqual(
      getLiveSince(NOW).getTime(),
    );
  });
});

describe("getHistoryRangeToLoad", () => {
  const loadedFrom = getLiveSince(NOW).getTime();

  it("returns null when the needed date is already loaded", () => {
    expect(getHistoryRangeToLoad(loadedFrom, loadedFrom)).toBeNull();
    expect(getHistoryRangeToLoad(loadedFrom + 1, loadedFrom)).toBeNull();
  });

  it("loads a chunk of weeks ending just before what is loaded", () => {
    const range = getHistoryRangeToLoad(loadedFrom - 1, loadedFrom)!;
    expect(range.to.getTime()).toBe(loadedFrom - 1);
    expect(range.from.getDay()).toBe(1);
    const weeks = Math.round((loadedFrom - range.from.getTime()) / (7 * 24 * 3600 * 1000));
    expect(weeks).toBe(HISTORY_CHUNK_WEEKS);
  });

  it("goes further back than the chunk when the needed date is older", () => {
    const farBack = new Date(2025, 0, 15).getTime();
    const range = getHistoryRangeToLoad(farBack, loadedFrom)!;
    expect(range.from.getTime()).toBeLessThanOrEqual(farBack);
    expect(range.from.getDay()).toBe(1);
  });
});

describe("combineLiveAndHistory", () => {
  it("keeps live events and drops history duplicates", () => {
    const live = [{ id: "a" }, { id: "b" }];
    const history = [{ id: "b" }, { id: "c" }];
    expect(combineLiveAndHistory(live, history)).toEqual([{ id: "a" }, { id: "b" }, { id: "c" }]);
    expect(combineLiveAndHistory(live, [])).toBe(live);
    expect(combineLiveAndHistory([], history)).toBe(history);
  });
});

describe("olderThan / splitStatsEventsByType", () => {
  it("filters by date and splits meals, pumping and sleep", () => {
    const events = [
      { id: "1", type: "tetee", date: new Date(2026, 9, 1) },
      { id: "2", type: "biberon", date: new Date(2026, 10, 1) },
      { id: "3", type: "pompage", date: new Date(2026, 9, 2) },
      { id: "4", type: "sommeil", date: new Date(2026, 9, 3) },
      { id: "5", type: "miction", date: new Date(2026, 9, 3) },
    ];
    expect(olderThan(events, new Date(2026, 9, 15).getTime()).map((e) => e.id)).toEqual(["1", "3", "4", "5"]);
    const split = splitStatsEventsByType(events);
    expect(split.repas.map((e) => e.id)).toEqual(["1", "2"]);
    expect(split.pompages.map((e) => e.id)).toEqual(["3"]);
    expect(split.sommeils.map((e) => e.id)).toEqual(["4"]);
  });
});
