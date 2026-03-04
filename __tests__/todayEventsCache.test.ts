import {
  buildTodayEventsData,
  setTodayEventsCache,
  getTodayEventsCache,
  clearTodayEventsCache,
} from "@/services/todayEventsCache";

describe("todayEventsCache", () => {
  const childId = "child-123";

  beforeEach(() => {
    clearTodayEventsCache();
  });

  it("should return null when cache is empty", () => {
    expect(getTodayEventsCache(childId)).toBeNull();
  });

  it("should return cached data for the same child", () => {
    const data = buildTodayEventsData([]);
    setTodayEventsCache(childId, data);
    expect(getTodayEventsCache(childId)).toBe(data);
  });

  it("should return null for a different child", () => {
    const data = buildTodayEventsData([]);
    setTodayEventsCache(childId, data);
    expect(getTodayEventsCache("other-child")).toBeNull();
  });

  it("should clear cache on clearTodayEventsCache()", () => {
    const data = buildTodayEventsData([]);
    setTodayEventsCache(childId, data);
    clearTodayEventsCache();
    expect(getTodayEventsCache(childId)).toBeNull();
  });
});
