/* eslint-disable import/first */
// 1.0.28 : refus App Check pendant le rejeu de la file hors ligne.
// Tant qu'App Check n'a pas de jeton, un refus `unauthenticated` (même compte,
// session vivante) ne consomme aucun des 8 essais : l'écriture attend le cycle
// suivant. Une fois App Check prêt, le refus compte comme une panne passagère.

const mockWaitForAppCheckReady = jest.fn();

jest.mock("@/utils/errorReporting", () => ({
  addBreadcrumb: jest.fn(),
  captureServiceError: jest.fn(),
}));
jest.mock("@/config/firebase", () => ({
  // Session vivante : getIdToken répond.
  auth: { currentUser: { uid: "test-uid", getIdToken: () => Promise.resolve("id-token") } },
  db: {},
  functions: {},
  waitForFirebaseAppCheckReady: (...args: unknown[]) => mockWaitForAppCheckReady(...args),
}));
jest.mock("@/config/callable", () => ({
  httpsCallable: (...args: unknown[]) => jest.requireMock("firebase/functions").httpsCallable(...args),
}));

import NetInfo from "@react-native-community/netinfo";
import * as SQLite from "expo-sqlite";
import { httpsCallable } from "firebase/functions";

const mockDb = {
  execAsync: jest.fn(() => Promise.resolve()),
  runAsync: jest.fn((..._a: unknown[]): Promise<{ changes: number }> => Promise.resolve({ changes: 0 })),
  getFirstAsync: jest.fn((..._a: unknown[]): Promise<any> => Promise.resolve({ count: 0 })),
  getAllAsync: jest.fn((..._a: unknown[]): Promise<any[]> => Promise.resolve([])),
} as any;

const row = () => ({
  id: "offline_1",
  uid: "test-uid",
  action: "create",
  payload: JSON.stringify({ childId: "c1", type: "biberon", idempotencyKey: "key-1" }),
  status: "pending",
  retryCount: 0,
  lastError: null,
  createdAt: Date.now(),
  transientFailures: 0,
});
const unauthenticated = () => Object.assign(new Error("Unauthenticated"), { code: "functions/unauthenticated" });

function loadQueue() {
  let mod!: typeof import("@/services/offlineQueueService");
  jest.isolateModules(() => {
    mod = jest.requireActual("@/services/offlineQueueService");
  });
  return mod;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockDb.getAllAsync.mockReset().mockResolvedValue([]);
  mockDb.runAsync.mockReset().mockResolvedValue({ changes: 0 });
  mockDb.getFirstAsync.mockReset().mockResolvedValue({ count: 0 });
  (SQLite.openDatabaseAsync as jest.Mock).mockResolvedValue(mockDb);
  (NetInfo.fetch as jest.Mock).mockResolvedValue({ isConnected: true });
  (httpsCallable as jest.Mock).mockReturnValue(jest.fn().mockRejectedValue(unauthenticated()));
});

// Ne sert la ligne qu'à la lecture des écritures en attente (pas au PRAGMA d'initialisation).
function servePendingRowOnce() {
  let served = false;
  mockDb.getAllAsync.mockImplementation((sql: string) => {
    if (!served && /status IN \('pending', 'failed'\)/.test(sql)) {
      served = true;
      return Promise.resolve([row()]);
    }
    return Promise.resolve([]);
  });
}

const sqlCalls = () => mockDb.runAsync.mock.calls.map(([sql]: [string]) => sql);

describe("file hors ligne et App Check (1.0.28)", () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  it("App Check sans jeton : un nouveau cycle est reprogrammé (backoff)", async () => {
    jest.useFakeTimers();
    mockWaitForAppCheckReady.mockResolvedValue(false);
    const queue = loadQueue();
    servePendingRowOnce();
    const timeoutSpy = jest.spyOn(global, "setTimeout");

    await queue.processQueue();

    expect(timeoutSpy.mock.calls.some(([, delay]) => typeof delay === "number" && delay >= 2500)).toBe(true);
    timeoutSpy.mockRestore();
    queue.stopAutoSync();
  });

  it("au-delà de MAX_APP_CHECK_DEFERRALS reports, le refus reprend le chemin plafonné", async () => {
    mockWaitForAppCheckReady.mockResolvedValue(false);
    const queue = loadQueue();
    for (let i = 0; i < queue.MAX_APP_CHECK_DEFERRALS; i += 1) {
      servePendingRowOnce();
      await queue.processQueue();
    }
    expect(sqlCalls().some((sql: string) => /transientFailures/.test(sql))).toBe(false);
    servePendingRowOnce();
    await queue.processQueue();
    queue.stopAutoSync();
    expect(sqlCalls().some((sql: string) => /transientFailures = transientFailures \+ 1/.test(sql))).toBe(true);
  });

  it("App Check sans jeton : l'écriture repasse en attente sans consommer d'essai", async () => {
    mockWaitForAppCheckReady.mockResolvedValue(false);
    const queue = loadQueue();
    servePendingRowOnce();

    const synced = await queue.processQueue();
    queue.stopAutoSync();

    expect(synced).toBe(0);
    expect(sqlCalls().some((sql: string) => /SET status = 'pending' WHERE id = \? AND status = 'syncing'/.test(sql))).toBe(true);
    expect(sqlCalls().some((sql: string) => /transientFailures/.test(sql))).toBe(false);
    expect(sqlCalls().some((sql: string) => /status = 'failed'/.test(sql))).toBe(false);
  });

  it("App Check prêt : le refus compte comme une panne passagère (essai consommé)", async () => {
    mockWaitForAppCheckReady.mockResolvedValue(true);
    const queue = loadQueue();
    servePendingRowOnce();

    await queue.processQueue();
    queue.stopAutoSync();

    expect(sqlCalls().some((sql: string) => /transientFailures = transientFailures \+ 1/.test(sql))).toBe(true);
  });
});
