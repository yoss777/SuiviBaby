import { httpsCallable } from "firebase/functions";
import { onSnapshot } from "firebase/firestore";
import * as offlineQueue from "@/services/offlineQueueService";
import {
  ajouterEvenement,
  ecouterEvenements,
  modifierEvenement,
  supprimerEvenement,
} from "@/services/eventsService";

// Mock the offlineQueueService module
jest.mock("@/services/offlineQueueService", () => ({
  enqueueEvent: jest.fn(() => Promise.resolve("offline_123")),
  isOnline: jest.fn(() => Promise.resolve(true)),
  startAutoSync: jest.fn(),
  stopAutoSync: jest.fn(),
  onQueueChange: jest.fn(),
  getQueueSize: jest.fn(() => Promise.resolve(0)),
  processQueue: jest.fn(() => Promise.resolve(0)),
}));

// Mock config/firebase
jest.mock("@/config/firebase", () => ({
  auth: { currentUser: { uid: "user123" } },
  db: {},
  functions: {},
}));

// Make httpsCallable return a mock function that resolves
const mockCallable = jest.fn();
(httpsCallable as jest.Mock).mockReturnValue(mockCallable);

beforeEach(() => {
  jest.clearAllMocks();
  (httpsCallable as jest.Mock).mockReturnValue(mockCallable);
  (offlineQueue.isOnline as jest.Mock).mockResolvedValue(true);
  (onSnapshot as jest.Mock).mockReturnValue(jest.fn());
});

function snapshot(events: any[], fromCache: boolean) {
  return {
    metadata: { fromCache },
    empty: events.length === 0,
    size: events.length,
    docs: events.map((event) => ({
      id: event.id,
      data: () => {
        const { id, ...data } = event;
        return data;
      },
    })),
  };
}

describe("eventsService", () => {
  describe("ajouterEvenement", () => {
    it("should call validateAndCreateEvent CF when online", async () => {
      mockCallable.mockResolvedValueOnce({ data: { id: "event123" } });

      const id = await ajouterEvenement("child1", {
        type: "biberon",
        quantite: 150,
        date: new Date("2024-01-15"),
      } as any);

      expect(id).toBe("event123");
      expect(httpsCallable).toHaveBeenCalledWith(
        expect.anything(),
        "validateAndCreateEvent",
      );
      expect(mockCallable).toHaveBeenCalledWith(
        expect.objectContaining({
          childId: "child1",
          type: "biberon",
          quantite: 150,
        }),
      );
    });

    it("should enqueue event when offline", async () => {
      (offlineQueue.isOnline as jest.Mock).mockResolvedValueOnce(false);

      const id = await ajouterEvenement("child1", {
        type: "biberon",
        quantite: 100,
        date: new Date(),
      } as any);

      expect(id).toBe("offline_123");
      expect(offlineQueue.enqueueEvent).toHaveBeenCalledWith(
        "create",
        expect.objectContaining({
          childId: "child1",
          type: "biberon",
        }),
      );
      expect(mockCallable).not.toHaveBeenCalled();
    });
  });

  describe("modifierEvenement", () => {
    it("should call validateAndUpdateEvent CF", async () => {
      mockCallable.mockResolvedValueOnce({ data: { success: true } });

      await modifierEvenement("child1", "event123", {
        note: "Updated note",
      } as any);

      expect(httpsCallable).toHaveBeenCalledWith(
        expect.anything(),
        "validateAndUpdateEvent",
      );
      expect(mockCallable).toHaveBeenCalledWith(
        expect.objectContaining({
          childId: "child1",
          eventId: "event123",
          note: "Updated note",
        }),
      );
    });
  });

  describe("supprimerEvenement", () => {
    it("should call deleteEventCascade CF", async () => {
      mockCallable.mockResolvedValueOnce({
        data: {
          success: true,
          deleted: { event: 1, likes: 2, comments: 3 },
        },
      });

      await supprimerEvenement("child1", "event123");

      expect(httpsCallable).toHaveBeenCalledWith(
        expect.anything(),
        "deleteEventCascade",
      );
      expect(mockCallable).toHaveBeenCalledWith({
        childId: "child1",
        eventId: "event123",
      });
    });
  });

  describe("ecouterEvenements", () => {
    it("waits for the server snapshot before emitting cached data when waitForServer is enabled", () => {
      const callback = jest.fn();

      ecouterEvenements(
        "child1",
        callback,
        { type: "activite", waitForServer: true },
      );

      const snapshotCallback = (onSnapshot as jest.Mock).mock.calls[0][2];
      snapshotCallback(
        snapshot(
          [
            {
              id: "promenade1",
              childId: "child1",
              type: "activite",
              typeActivite: "promenade",
            },
          ],
          true,
        ),
      );

      expect(callback).not.toHaveBeenCalled();

      snapshotCallback(
        snapshot(
          [
            {
              id: "promenade1",
              childId: "child1",
              type: "activite",
              typeActivite: "promenade",
              heureFin: new Date("2026-03-28T12:45:00.000Z"),
            },
          ],
          false,
        ),
      );

      expect(callback).toHaveBeenCalledTimes(1);
      expect(callback).toHaveBeenCalledWith([
        expect.objectContaining({
          id: "promenade1",
          heureFin: new Date("2026-03-28T12:45:00.000Z"),
        }),
      ]);
    });

    it("falls back to cached data if the server snapshot does not arrive", () => {
      jest.useFakeTimers();
      const callback = jest.fn();

      ecouterEvenements(
        "child1",
        callback,
        { type: "activite", waitForServer: true },
      );

      const snapshotCallback = (onSnapshot as jest.Mock).mock.calls[0][2];
      snapshotCallback(
        snapshot(
          [
            {
              id: "cached1",
              childId: "child1",
              type: "activite",
            },
          ],
          true,
        ),
      );

      expect(callback).not.toHaveBeenCalled();

      jest.advanceTimersByTime(800);

      expect(callback).toHaveBeenCalledTimes(1);
      expect(callback).toHaveBeenCalledWith([
        expect.objectContaining({ id: "cached1" }),
      ]);

      jest.useRealTimers();
    });
  });
});
