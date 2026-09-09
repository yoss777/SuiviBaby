import * as SQLite from "expo-sqlite";
import NetInfo from "@react-native-community/netinfo";
import { httpsCallable } from "firebase/functions";

// Must import after mocks are set up in setup.ts
import {
  enqueueEvent,
  getQueueSize,
  getPendingEvents,
  processQueue,
  isOnline,
  cleanupFailedEvents,
  onSignOut,
  retryExhaustedEvents,
} from "@/services/offlineQueueService";

// Get mock db instance
const mockDb = {
  execAsync: jest.fn(),
  runAsync: jest.fn(
    (..._args: unknown[]): Promise<{ changes: number }> =>
      Promise.resolve({ changes: 0 }),
  ),
  getFirstAsync: jest.fn((): Promise<any> => Promise.resolve(null)),
  getAllAsync: jest.fn((): Promise<any[]> => Promise.resolve([])),
};

(SQLite.openDatabaseAsync as jest.Mock).mockResolvedValue(mockDb);

beforeEach(() => {
  jest.clearAllMocks();
  (SQLite.openDatabaseAsync as jest.Mock).mockResolvedValue(mockDb);
});

describe("offlineQueueService", () => {
  describe("enqueueEvent", () => {
    it("should insert an event into SQLite and return an ID", async () => {
      mockDb.getFirstAsync.mockResolvedValueOnce({ count: 1 });

      const id = await enqueueEvent("create", {
        childId: "child1",
        type: "biberon",
        quantite: 120,
      });

      expect(id).toMatch(/^offline_/);
      expect(mockDb.runAsync).toHaveBeenCalledWith(
        expect.stringContaining("INSERT INTO pending_events"),
        expect.stringMatching(/^offline_/),
        "test-uid",
        "create",
        expect.any(String),
        expect.any(Number),
      );
    });
  });

  describe("getQueueSize", () => {
    it("should return the count of pending/failed events", async () => {
      mockDb.getFirstAsync.mockResolvedValueOnce({ count: 5 });

      const size = await getQueueSize();

      expect(size).toBe(5);
      expect(mockDb.getFirstAsync).toHaveBeenCalledWith(
        expect.stringContaining("COUNT(*)"),
        "test-uid",
      );
    });

    it("should return 0 when no events in queue", async () => {
      mockDb.getFirstAsync.mockResolvedValueOnce(null);

      const size = await getQueueSize();

      expect(size).toBe(0);
    });
  });

  describe("isOnline", () => {
    it("should return true when network is connected", async () => {
      (NetInfo.fetch as jest.Mock).mockResolvedValueOnce({
        isConnected: true,
      });

      const result = await isOnline();

      expect(result).toBe(true);
    });

    it("should return false when network is disconnected", async () => {
      (NetInfo.fetch as jest.Mock).mockResolvedValueOnce({
        isConnected: false,
      });

      const result = await isOnline();

      expect(result).toBe(false);
    });
  });

  describe("processQueue", () => {
    it("should skip processing when offline", async () => {
      (NetInfo.fetch as jest.Mock).mockResolvedValueOnce({
        isConnected: false,
      });

      const synced = await processQueue();

      expect(synced).toBe(0);
      expect(mockDb.getAllAsync).not.toHaveBeenCalled();
    });

    it("should return 0 when queue is empty", async () => {
      (NetInfo.fetch as jest.Mock).mockResolvedValueOnce({
        isConnected: true,
      });
      mockDb.getAllAsync.mockResolvedValueOnce([]);

      const synced = await processQueue();

      expect(synced).toBe(0);
    });

    // Régression : une panne d'infrastructure (facturation coupée, cold start
    // Cloud Run) consommait une tentative par échec. Après 3 pannes, une
    // écriture parfaitement valide sortait définitivement de la sync.
    it("does not consume a retry when the failure is infrastructural", async () => {
      (NetInfo.fetch as jest.Mock).mockResolvedValueOnce({ isConnected: true });
      mockDb.getAllAsync.mockResolvedValueOnce([
        {
          id: "offline_1",
          uid: "test-uid",
          action: "create",
          payload: JSON.stringify({ childId: "c1", type: "biberon" }),
          status: "pending",
          retryCount: 0,
          lastError: null,
          createdAt: Date.now(),
        },
      ]);
      (httpsCallable as jest.Mock).mockReturnValueOnce(
        jest.fn().mockRejectedValue(
          Object.assign(new Error("The request was aborted because there was no available instance"), {
            code: "functions/unavailable",
          }),
        ),
      );

      const synced = await processQueue();

      expect(synced).toBe(0);
      const statusWrite = mockDb.runAsync.mock.calls.find(
        ([sql]) => typeof sql === "string" && sql.includes("lastError"),
      );
      expect(statusWrite?.[0]).toContain("status = 'pending'");
      expect(statusWrite?.[0]).not.toContain("retryCount = retryCount + 1");
    });

    it("consumes a retry when the failure is permanent", async () => {
      (NetInfo.fetch as jest.Mock).mockResolvedValueOnce({ isConnected: true });
      mockDb.getAllAsync.mockResolvedValueOnce([
        {
          id: "offline_2",
          uid: "test-uid",
          action: "create",
          payload: JSON.stringify({ childId: "c1", type: "biberon" }),
          status: "pending",
          retryCount: 0,
          lastError: null,
          createdAt: Date.now(),
        },
      ]);
      (httpsCallable as jest.Mock).mockReturnValueOnce(
        jest.fn().mockRejectedValue(
          Object.assign(new Error("Quantité biberon doit être entre 0 et 500 ml."), {
            code: "functions/invalid-argument",
          }),
        ),
      );

      const synced = await processQueue();

      expect(synced).toBe(0);
      const statusWrite = mockDb.runAsync.mock.calls.find(
        ([sql]) => typeof sql === "string" && sql.includes("lastError"),
      );
      expect(statusWrite?.[0]).toContain("retryCount = retryCount + 1");
    });
  });

  describe("getDb recovery", () => {
    // Régression : une écriture marquée 'syncing' au moment où l'app est tuée
    // n'était plus jamais lue (getPendingEvents/getQueueSize ne regardent que
    // 'pending'/'failed'), donc perdue en silence.
    //
    // getDb met la connexion en cache au niveau du module : la récupération ne
    // tourne qu'à la toute première ouverture. On isole donc le module pour
    // observer cette ouverture, sinon le test ne passerait qu'exécuté seul.
    it("rearms rows stuck in 'syncing' after a hard app kill", async () => {
      await jest.isolateModulesAsync(async () => {
        const freshDb = {
          execAsync: jest.fn(),
          runAsync: jest.fn(
            (..._args: unknown[]): Promise<{ changes: number }> =>
              Promise.resolve({ changes: 0 }),
          ),
          getFirstAsync: jest.fn((): Promise<any> => Promise.resolve({ count: 0 })),
          getAllAsync: jest.fn((): Promise<any[]> => Promise.resolve([])),
        };
        (SQLite.openDatabaseAsync as jest.Mock).mockResolvedValue(freshDb);

        const queue = require("@/services/offlineQueueService");
        await queue.getQueueSize();

        expect(freshDb.runAsync).toHaveBeenCalledWith(
          expect.stringContaining("SET status = 'pending' WHERE status = 'syncing'"),
        );
      });
    });
  });

  describe("retryExhaustedEvents", () => {
    it("rearms writes stranded by an outage so they sync again", async () => {
      mockDb.runAsync.mockResolvedValueOnce({ changes: 4 });
      mockDb.getFirstAsync.mockResolvedValueOnce({ count: 4 });
      (NetInfo.fetch as jest.Mock).mockResolvedValue({ isConnected: false });

      const rearmed = await retryExhaustedEvents();

      expect(rearmed).toBe(4);
      expect(mockDb.runAsync).toHaveBeenCalledWith(
        expect.stringContaining("SET status = 'pending', retryCount = 0"),
        3,
        "test-uid",
      );
    });
  });

  describe("cleanupFailedEvents", () => {
    it("should delete failed events only for the current user", async () => {
      mockDb.runAsync.mockResolvedValueOnce({ changes: 2 });

      const deleted = await cleanupFailedEvents();

      expect(deleted).toBe(2);
      expect(mockDb.runAsync).toHaveBeenCalledWith(
        expect.stringContaining("DELETE FROM pending_events WHERE retryCount >= 3 AND uid = ?"),
        "test-uid",
      );
    });
  });

  describe("onSignOut", () => {
    it("should cleanup orphaned events but preserve retry-exhausted writes", async () => {
      mockDb.runAsync.mockResolvedValueOnce({ changes: 1 });

      await onSignOut();

      // B2.4 — cleanupOrphanedEvents purge maintenant aussi les events
      // > 60j (cas "compte supprimé côté serveur après grace period").
      // Signature : (sql, sixtyDaysAgoMs).
      expect(mockDb.runAsync).toHaveBeenNthCalledWith(
        1,
        expect.stringContaining("DELETE FROM pending_events WHERE uid = '' OR createdAt < ?"),
        expect.any(Number),
      );

      // Régression : le signOut supprimait aussi les retryCount >= 3. Une
      // panne serveur prolongée épuisait le compteur sur des écritures
      // valides, que la déconnexion perdait alors définitivement. Elles
      // doivent survivre pour être rejouées au re-login.
      expect(mockDb.runAsync).toHaveBeenCalledTimes(1);
      expect(mockDb.runAsync).not.toHaveBeenCalledWith(
        expect.stringContaining("retryCount >= 3"),
        expect.anything(),
      );
    });
  });
});
