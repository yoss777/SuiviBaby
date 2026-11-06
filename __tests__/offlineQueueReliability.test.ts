/* eslint-disable import/first */
// Revue « échecs silencieux » : relance de la file (H1), suppression
// idempotente (M1), initialisation SQLite (M7), entrée optimiste retirée
// quand la file abandonne une écriture (M8), suppression par identifiants (M9).

jest.mock("@/utils/errorReporting", () => ({
  addBreadcrumb: jest.fn(),
  captureServiceError: jest.fn(),
}));
jest.mock("@/config/firebase", () => ({
  auth: { currentUser: { uid: "test-uid" } },
  db: {},
  functions: {},
}));

import { AppState } from "react-native";
import NetInfo from "@react-native-community/netinfo";
import * as SQLite from "expo-sqlite";
import { onAuthStateChanged } from "firebase/auth";
import { httpsCallable } from "firebase/functions";
import { captureServiceError } from "@/utils/errorReporting";
import {
  addOptimisticCreate,
  addOptimisticUpdate,
  getOptimisticEntries,
  markOptimisticQueued,
  resetOptimisticStoreForTests,
} from "@/services/optimisticEventsStore";
import {
  deleteExhaustedEventsByIds,
  enqueueEvent,
  getExhaustedEvents,
  onExhaustedChange,
  onQueueChange,
  processQueue,
  startAutoSync,
  stopAutoSync,
} from "@/services/offlineQueueService";

const captured = captureServiceError as jest.Mock;

function makeDb(overrides: Partial<Record<string, jest.Mock>> = {}) {
  return {
    execAsync: jest.fn(() => Promise.resolve()),
    runAsync: jest.fn((..._a: unknown[]): Promise<{ changes: number }> => Promise.resolve({ changes: 0 })),
    getFirstAsync: jest.fn((..._a: unknown[]): Promise<any> => Promise.resolve({ count: 0 })),
    getAllAsync: jest.fn((..._a: unknown[]): Promise<any[]> => Promise.resolve([])),
    ...overrides,
  } as any;
}

const mockDb = makeDb();
const row = (over: Record<string, unknown> = {}) => ({
  id: "offline_1",
  uid: "test-uid",
  action: "create",
  payload: JSON.stringify({ childId: "c1", type: "biberon", idempotencyKey: "key-1" }),
  status: "pending",
  retryCount: 0,
  lastError: null,
  createdAt: Date.now(),
  transientFailures: 0,
  ...over,
});
const fail = (code: string, message = code) => Object.assign(new Error(message), { code });
const pendingSelects = () =>
  mockDb.getAllAsync.mock.calls.filter(([sql]: [string]) => /status IN \('pending', 'failed'\)/.test(sql));

beforeEach(() => {
  jest.useFakeTimers();
  jest.clearAllMocks();
  mockDb.getAllAsync.mockReset().mockResolvedValue([]);
  mockDb.runAsync.mockReset().mockResolvedValue({ changes: 0 });
  mockDb.getFirstAsync.mockReset().mockResolvedValue({ count: 0 });
  (SQLite.openDatabaseAsync as jest.Mock).mockResolvedValue(mockDb);
  (NetInfo.fetch as jest.Mock).mockResolvedValue({ isConnected: true });
  resetOptimisticStoreForTests();
});
afterEach(() => {
  stopAutoSync();
  jest.useRealTimers();
});

describe("H1 : la file est relancée", () => {
  it("enqueueEvent programme un rejeu, même sans changement réseau", async () => {
    await enqueueEvent("create", { childId: "c1", type: "biberon" });
    expect(pendingSelects()).toHaveLength(0);

    await jest.advanceTimersByTimeAsync(10_000);

    expect(pendingSelects().length).toBeGreaterThan(0);
  });

  it("n'empile pas plusieurs rejeux pour plusieurs enfilements", async () => {
    await enqueueEvent("create", { childId: "c1", type: "biberon" });
    await enqueueEvent("create", { childId: "c1", type: "biberon" });
    await jest.advanceTimersByTimeAsync(10_000);
    expect(pendingSelects()).toHaveLength(1);
  });

  it("rejoue une écriture enfilée pendant un cycle en cours", async () => {
    let release: () => void = () => {};
    mockDb.getAllAsync.mockImplementationOnce(
      () => new Promise((resolve) => { release = () => resolve([row()]); }),
    );
    (httpsCallable as jest.Mock).mockReturnValue(jest.fn().mockResolvedValue({ data: { id: "x" } }));
    const running = processQueue();
    await jest.advanceTimersByTimeAsync(10);
    // Un second déclenchement arrive pendant le cycle : il ne doit pas être perdu.
    void processQueue();
    release();
    await jest.advanceTimersByTimeAsync(1000);
    await running;
    await jest.advanceTimersByTimeAsync(10_000);
    expect(pendingSelects().length).toBeGreaterThanOrEqual(2);
  });

  it("startAutoSync rejoue la file quand l'authentification est restaurée", async () => {
    let authCb: (user: unknown) => void = () => {};
    (onAuthStateChanged as jest.Mock).mockImplementation((_auth: unknown, cb: (u: unknown) => void) => {
      authCb = cb;
      return jest.fn();
    });
    startAutoSync();
    authCb(null);
    await jest.advanceTimersByTimeAsync(5000);
    expect(pendingSelects()).toHaveLength(0);

    authCb({ uid: "test-uid" });
    await jest.advanceTimersByTimeAsync(5000);
    expect(pendingSelects().length).toBeGreaterThan(0);
  });

  it("startAutoSync rejoue la file quand l'app redevient active, pas en arrière-plan", async () => {
    let appCb: (state: string) => void = () => {};
    const remove = jest.fn();
    jest.spyOn(AppState, "addEventListener").mockImplementation(((_e: string, cb: (s: string) => void) => {
      appCb = cb;
      return { remove };
    }) as any);
    (onAuthStateChanged as jest.Mock).mockImplementation(() => jest.fn());

    startAutoSync();
    appCb("background");
    await jest.advanceTimersByTimeAsync(5000);
    expect(pendingSelects()).toHaveLength(0);

    appCb("active");
    await jest.advanceTimersByTimeAsync(5000);
    expect(pendingSelects().length).toBeGreaterThan(0);

    stopAutoSync();
    expect(remove).toHaveBeenCalled();
  });

  it("stopAutoSync désabonne l'écoute d'authentification", () => {
    const unsubscribe = jest.fn();
    (onAuthStateChanged as jest.Mock).mockImplementation(() => unsubscribe);
    startAutoSync();
    stopAutoSync();
    expect(unsubscribe).toHaveBeenCalled();
  });
});

describe("M1 : suppression idempotente dans la file", () => {
  it("une suppression « not-found » est un succès : la ligne est retirée sans échec", async () => {
    mockDb.getAllAsync.mockResolvedValueOnce([row({ action: "delete", payload: JSON.stringify({ childId: "c1", eventId: "e1" }) })]);
    (httpsCallable as jest.Mock).mockReturnValue(jest.fn().mockRejectedValue(fail("functions/not-found", "Événement introuvable.")));

    const synced = await processQueue();

    expect(synced).toBe(1);
    expect(mockDb.runAsync).toHaveBeenCalledWith(expect.stringContaining("DELETE FROM pending_events WHERE id = ?"), "offline_1");
    expect(captured).not.toHaveBeenCalled();
  });

  it("« not-found » sur une création reste une erreur permanente", async () => {
    mockDb.getAllAsync.mockResolvedValueOnce([row()]);
    (httpsCallable as jest.Mock).mockReturnValue(jest.fn().mockRejectedValue(fail("functions/not-found", "Enfant introuvable.")));

    const synced = await processQueue();

    expect(synced).toBe(0);
    expect(mockDb.runAsync).toHaveBeenCalledWith(
      expect.stringContaining("retryCount = retryCount + 1"),
      expect.any(String),
      "offline_1",
    );
  });
});

describe("M8 : écriture abandonnée par la file", () => {
  it("retire l'entrée optimiste d'une création (par clé d'idempotence)", async () => {
    addOptimisticCreate("c1", { type: "biberon", idempotencyKey: "key-1" }, "__optimistic_a");
    addOptimisticCreate("c1", { type: "biberon", idempotencyKey: "key-autre" }, "__optimistic_b");
    markOptimisticQueued("__optimistic_a");
    mockDb.getAllAsync.mockResolvedValueOnce([row({ retryCount: 2 })]);
    (httpsCallable as jest.Mock).mockReturnValue(jest.fn().mockRejectedValue(fail("functions/invalid-argument")));

    await processQueue();

    const left = getOptimisticEntries("c1").map((e) => e.tempId);
    expect(left).toEqual(["__optimistic_b"]);
  });

  it("retire l'entrée optimiste d'une modification (par eventId) en cas de conflit", async () => {
    addOptimisticUpdate("evt-9", "c1", { note: "x" }, { note: "avant" });
    mockDb.getAllAsync.mockResolvedValueOnce([
      row({ action: "update", payload: JSON.stringify({ childId: "c1", eventId: "evt-9" }) }),
    ]);
    (httpsCallable as jest.Mock).mockReturnValue(jest.fn().mockRejectedValue(fail("functions/aborted")));

    await processQueue();

    expect(getOptimisticEntries("c1")).toHaveLength(0);
  });

  it("garde l'entrée tant que l'écriture n'est pas épuisée", async () => {
    addOptimisticCreate("c1", { type: "biberon", idempotencyKey: "key-1" }, "__optimistic_a");
    markOptimisticQueued("__optimistic_a");
    mockDb.getAllAsync.mockResolvedValueOnce([row({ retryCount: 0 })]);
    (httpsCallable as jest.Mock).mockReturnValue(jest.fn().mockRejectedValue(fail("functions/invalid-argument")));

    await processQueue();

    expect(getOptimisticEntries("c1")).toHaveLength(1);
  });

  it("signale l'abandon à Sentry avec le nombre de photos concernées, sans la charge utile", async () => {
    mockDb.getAllAsync.mockResolvedValueOnce([
      row({ retryCount: 2, payload: JSON.stringify({ childId: "c1", type: "jalon", idempotencyKey: "k", photos: ["children/c1/jalons/a.jpg"] }) }),
    ]);
    (httpsCallable as jest.Mock).mockReturnValue(jest.fn().mockRejectedValue(fail("functions/invalid-argument")));

    await processQueue();

    const extra = captured.mock.calls[0][1].extra;
    expect(extra).toMatchObject({ action: "create", reason: "permanent", orphanPhotos: 1 });
    expect(JSON.stringify(extra)).not.toContain("jalons/a.jpg");
  });
});

describe("M7 : initialisation SQLite", () => {
  async function withFreshQueue<T>(db: any, fn: (q: typeof import("@/services/offlineQueueService"), report: jest.Mock) => Promise<T>): Promise<T> {
    let out!: T;
    await jest.isolateModulesAsync(async () => {
      (SQLite.openDatabaseAsync as jest.Mock).mockResolvedValue(db);
      out = await fn(
        require("@/services/offlineQueueService"),
        require("@/utils/errorReporting").captureServiceError,
      );
    });
    return out;
  }
  const alters = (db: any) => db.execAsync.mock.calls.filter(([sql]: [string]) => /ALTER TABLE/.test(sql));

  it("partage une seule initialisation entre appels simultanés", async () => {
    const db = makeDb();
    await withFreshQueue(db, async (q) => {
      await Promise.all([q.getQueueSize(), q.getQueueSize(), q.getWaitingCount()]);
    });
    expect(SQLite.openDatabaseAsync).toHaveBeenCalledTimes(1);
    expect(db.execAsync.mock.calls.filter(([s]: [string]) => /CREATE TABLE/.test(s))).toHaveLength(1);
  });

  it("n'ajoute que les colonnes absentes (PRAGMA table_info)", async () => {
    const db = makeDb({
      getAllAsync: jest.fn((sql: string) =>
        Promise.resolve(/PRAGMA table_info/.test(sql) ? [{ name: "id" }, { name: "uid" }] : []),
      ),
    });
    await withFreshQueue(db, (q) => q.getQueueSize());
    expect(alters(db)).toHaveLength(1);
    expect(alters(db)[0][0]).toContain("transientFailures");
  });

  it("ne fait aucun ALTER quand toutes les colonnes existent", async () => {
    const db = makeDb({
      getAllAsync: jest.fn((sql: string) =>
        Promise.resolve(/PRAGMA table_info/.test(sql) ? [{ name: "uid" }, { name: "transientFailures" }] : []),
      ),
    });
    await withFreshQueue(db, (q) => q.getQueueSize());
    expect(alters(db)).toHaveLength(0);
  });

  it("ignore l'erreur « duplicate column »", async () => {
    const db = makeDb({
      execAsync: jest.fn((sql: string) =>
        /ALTER TABLE/.test(sql) ? Promise.reject(new Error("duplicate column name: uid")) : Promise.resolve(),
      ),
    });
    await withFreshQueue(db, async (q, report) => {
      await expect(q.getQueueSize()).resolves.toBe(0);
      expect(report).not.toHaveBeenCalled();
    });
  });

  it("propage toute autre erreur de migration, la signale, et n'expose pas une base à moitié prête", async () => {
    const db = makeDb({
      execAsync: jest.fn((sql: string) =>
        /ALTER TABLE/.test(sql) ? Promise.reject(new Error("disk I/O error")) : Promise.resolve(),
      ),
    });
    await withFreshQueue(db, async (q, report) => {
      await expect(q.getQueueSize()).rejects.toThrow("disk I/O error");
      expect(report).toHaveBeenCalledWith(expect.any(Error), expect.objectContaining({ service: "offlineQueue" }));
      // Un second appel retente l'initialisation au lieu de réutiliser une base à moitié migrée.
      await expect(q.getQueueSize()).rejects.toThrow("disk I/O error");
      expect(SQLite.openDatabaseAsync).toHaveBeenCalledTimes(2);
    });
  });

  it("remet la ligne en 'pending' si la mise à jour du statut échoue", async () => {
    mockDb.getAllAsync.mockResolvedValueOnce([row()]);
    (httpsCallable as jest.Mock).mockReturnValue(jest.fn().mockRejectedValue(fail("functions/invalid-argument")));
    mockDb.runAsync.mockImplementation((sql: unknown) =>
      /status = 'failed'/.test(String(sql)) ? Promise.reject(new Error("database is locked")) : Promise.resolve({ changes: 1 }),
    );

    await processQueue();

    expect(mockDb.runAsync).toHaveBeenCalledWith(
      expect.stringMatching(/SET status = 'pending' WHERE id = \? AND status = 'syncing'/),
      "offline_1",
    );
    expect(captured).toHaveBeenCalledWith(expect.any(Error), expect.objectContaining({ operation: "processQueue" }));
  });

  it("remet la ligne en 'pending' si le retrait après succès échoue", async () => {
    mockDb.getAllAsync.mockResolvedValueOnce([row()]);
    (httpsCallable as jest.Mock).mockReturnValue(jest.fn().mockResolvedValue({ data: { id: "x" } }));
    mockDb.runAsync.mockImplementation((sql: unknown) =>
      /^\s*DELETE FROM pending_events WHERE id/.test(String(sql)) ? Promise.reject(new Error("database is locked")) : Promise.resolve({ changes: 1 }),
    );

    await processQueue();

    expect(mockDb.runAsync).toHaveBeenCalledWith(
      expect.stringMatching(/SET status = 'pending' WHERE id = \? AND status = 'syncing'/),
      "offline_1",
    );
  });

  it("enqueueEvent n'échoue pas si seule la notification des compteurs échoue (la ligne est enregistrée)", async () => {
    mockDb.getFirstAsync.mockRejectedValue(new Error("boom"));
    await expect(enqueueEvent("create", { childId: "c1", type: "biberon" })).resolves.toMatch(/^offline_/);
  });

  it("onQueueChange et onExhaustedChange n'ont pas de rejet non géré", async () => {
    mockDb.getFirstAsync.mockRejectedValue(new Error("boom"));
    const unhandled = jest.fn();
    process.on("unhandledRejection", unhandled);
    const a = onQueueChange(jest.fn());
    const b = onExhaustedChange(jest.fn());
    await jest.advanceTimersByTimeAsync(10);
    await new Promise<void>((r) => jest.requireActual("timers").setImmediate(r));
    process.off("unhandledRejection", unhandled);
    a();
    b();
    expect(unhandled).not.toHaveBeenCalled();
    expect(captured).toHaveBeenCalled();
  });
});

describe("M9 : suppression par identifiants", () => {
  it("ne supprime que les identifiants donnés, épuisés, de l'utilisateur courant", async () => {
    mockDb.runAsync.mockResolvedValueOnce({ changes: 2 });
    const n = await deleteExhaustedEventsByIds(["a", "b"]);
    expect(n).toBe(2);
    const [sql, ...args] = mockDb.runAsync.mock.calls.find(([s]: [string]) => /DELETE FROM pending_events WHERE/.test(s))!;
    expect(sql).toMatch(/uid = \?/);
    expect(sql).toMatch(/retryCount >= \?/);
    expect(sql).toMatch(/id IN \(\?,\?\)/);
    expect(args).toEqual(expect.arrayContaining(["test-uid", 3, "a", "b"]));
  });

  it("ne fait rien avec une liste vide", async () => {
    expect(await deleteExhaustedEventsByIds([])).toBe(0);
    expect(mockDb.runAsync).not.toHaveBeenCalled();
  });

  it("découpe les très longues listes", async () => {
    mockDb.runAsync.mockResolvedValue({ changes: 1 });
    const ids = Array.from({ length: 1200 }, (_, i) => `id${i}`);
    const n = await deleteExhaustedEventsByIds(ids);
    const deletes = mockDb.runAsync.mock.calls.filter(([s]: [string]) => /DELETE FROM pending_events WHERE/.test(s));
    expect(deletes.length).toBe(3);
    expect(n).toBe(3);
  });

  it("getExhaustedEvents expose les identifiants", async () => {
    mockDb.getAllAsync.mockResolvedValueOnce([row({ id: "zz", retryCount: 3 })]);
    const rows = await getExhaustedEvents();
    expect(rows[0].id).toBe("zz");
  });
});
