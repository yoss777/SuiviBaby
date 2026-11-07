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

describe("loadTodayEventsOnce après déconnexion", () => {
  beforeEach(() => clearTodayEventsCache());

  it("une lecture en vol ne réécrit pas le cache après un clear (déconnexion)", async () => {
    let resolveFetch: (v: any[]) => void = () => {};
    const fetcher = jest.fn(() => new Promise<any[]>((r) => { resolveFetch = r; }));
    const pending = loadTodayEventsOnce("child-1", fetcher as any);
    clearTodayEventsCache();
    resolveFetch([{ id: "e1", type: "tetee", date: new Date() }]);
    await pending;
    expect(getTodayEventsCache("child-1")).toBeNull();
  });

  it("le .finally ne supprime pas la lecture d'un appel plus récent", async () => {
    let resolveFirst: (v: any[]) => void = () => {};
    const first = jest.fn(() => new Promise<any[]>((r) => { resolveFirst = r; }));
    const second = jest.fn(() => new Promise<any[]>(() => {}));
    const p1 = loadTodayEventsOnce("child-1", first as any);
    clearTodayEventsCache();
    void loadTodayEventsOnce("child-1", second as any);
    resolveFirst([]);
    await p1;
    // La lecture 2 est toujours en vol : un 3e appel la partage, pas de nouvelle lecture.
    const third = jest.fn().mockResolvedValue([]);
    void loadTodayEventsOnce("child-1", third as any);
    expect(third).not.toHaveBeenCalled();
  });
});
