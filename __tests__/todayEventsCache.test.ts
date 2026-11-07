import {
  clearTodayEventsCache,
  getTodayEventsCache,
  loadTodayEventsOnce,
} from "@/services/todayEventsCache";

describe("loadTodayEventsOnce (S7.5)", () => {
  beforeEach(() => clearTodayEventsCache());

  it("partage une seule lecture entre le démarrage et BabyContext", async () => {
    const fetcher = jest
      .fn()
      .mockResolvedValue([{ id: "e1", type: "tetee", date: new Date() }]);

    const [fromBoot, fromContext] = await Promise.all([
      loadTodayEventsOnce("child-1", fetcher),
      loadTodayEventsOnce("child-1", fetcher),
    ]);

    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fromBoot).toBe(fromContext);
    expect(fromBoot.tetees).toHaveLength(1);
    expect(getTodayEventsCache("child-1")).toBe(fromBoot);
  });

  it("ne relit pas quand le cache du jour existe", async () => {
    const fetcher = jest.fn().mockResolvedValue([]);
    await loadTodayEventsOnce("child-1", fetcher);
    await loadTodayEventsOnce("child-1", fetcher);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("lit une fois par enfant", async () => {
    const fetcher = jest.fn().mockResolvedValue([]);
    await Promise.all([
      loadTodayEventsOnce("a", fetcher),
      loadTodayEventsOnce("b", fetcher),
    ]);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("libère la lecture en vol après un échec (nouvelle tentative possible)", async () => {
    const fetcher = jest
      .fn()
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce([]);
    await expect(loadTodayEventsOnce("a", fetcher)).rejects.toThrow("offline");
    await expect(loadTodayEventsOnce("a", fetcher)).resolves.toBeDefined();
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
});
