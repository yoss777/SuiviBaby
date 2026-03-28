import * as SQLite from "expo-sqlite";
import NetInfo from "@react-native-community/netinfo";

// Must import after mocks are set up in setup.ts
import {
  enqueueEvent,
  getQueueSize,
  getPendingEvents,
  processQueue,
  isOnline,
  cleanupFailedEvents,
  onSignOut,
} from "@/services/offlineQueueService";

// Get mock db instance
const mockDb = {
  execAsync: jest.fn(),
  runAsync: jest.fn(() => Promise.resolve({ changes: 0 })),
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
    it("should cleanup orphaned events and failed events for the current user", async () => {
      mockDb.runAsync
        .mockResolvedValueOnce({ changes: 1 })
        .mockResolvedValueOnce({ changes: 2 });

      await onSignOut();

      expect(mockDb.runAsync).toHaveBeenNthCalledWith(
        1,
        expect.stringContaining("DELETE FROM pending_events WHERE uid = ''"),
      );
      expect(mockDb.runAsync).toHaveBeenNthCalledWith(
        2,
        expect.stringContaining("DELETE FROM pending_events WHERE retryCount >= 3 AND uid = ?"),
        "test-uid",
      );
    });
  });
});
