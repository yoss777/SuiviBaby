import { httpsCallable } from "firebase/functions";
import { onSnapshot } from "firebase/firestore";
import { AppState } from "react-native";
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

const setAppState = (state: string) =>
  Object.defineProperty(AppState, "currentState", { value: state, configurable: true, writable: true });

beforeEach(() => {
  setAppState("active");
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

    it("preserves null fields and strips undefined fields in update payloads", async () => {
      mockCallable.mockResolvedValueOnce({ data: { success: true } });

      await modifierEvenement("child1", "event123", {
        type: "solide",
        ingredients: null,
        nomNouvelAliment: null,
        allergenes: undefined,
        aime: null,
      } as any);

      const payload = mockCallable.mock.calls[0][0];
      expect(payload).toEqual(
        expect.objectContaining({
          childId: "child1",
          eventId: "event123",
          type: "solide",
          ingredients: null,
          nomNouvelAliment: null,
          aime: null,
        }),
      );
      expect(payload).not.toHaveProperty("allergenes");
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

    it("app hors premier plan : le cache est livré tout de suite (minuteries suspendues)", () => {
      setAppState("background");
      const callback = jest.fn();
      ecouterEvenements("child1", callback, { type: "activite", waitForServer: true });
      const snapshotCallback = (onSnapshot as jest.Mock).mock.calls[0][2];
      snapshotCallback(snapshot([{ id: "cached1", childId: "child1", type: "activite" }], true));
      expect(callback).toHaveBeenCalledWith([expect.objectContaining({ id: "cached1" })]);
    });

    it("app mise en arrière-plan pendant l'attente : le cache part aussitôt", () => {
      jest.useFakeTimers();
      const listeners: ((s: string) => void)[] = [];
      const spy = jest.spyOn(AppState, "addEventListener").mockImplementation(((_: string, fn: (s: string) => void) => {
        listeners.push(fn);
        return { remove: jest.fn() };
      }) as never);
      const callback = jest.fn();
      ecouterEvenements("child1", callback, { type: "activite", waitForServer: true });
      const snapshotCallback = (onSnapshot as jest.Mock).mock.calls[0][2];
      snapshotCallback(snapshot([{ id: "cached1", childId: "child1", type: "activite" }], true));
      expect(callback).not.toHaveBeenCalled();
      listeners.forEach((fn) => fn("background"));
      expect(callback).toHaveBeenCalledTimes(1);
      jest.advanceTimersByTime(800);
      expect(callback).toHaveBeenCalledTimes(1);
      spy.mockRestore();
      jest.useRealTimers();
    });

    it("cacheFirst delivers a non-empty cache at once, then the server snapshot", () => {
      const callback = jest.fn();
      ecouterEvenements("child1", callback, {
        type: "sommeil",
        waitForServer: true,
        cacheFirst: true,
      });
      const snapshotCallback = (onSnapshot as jest.Mock).mock.calls[0][2];

      snapshotCallback(snapshot([{ id: "s1", childId: "child1", type: "sommeil" }], true));
      expect(callback).toHaveBeenCalledTimes(1);

      snapshotCallback(
        snapshot(
          [
            { id: "s1", childId: "child1", type: "sommeil" },
            { id: "s2", childId: "child1", type: "sommeil" },
          ],
          false,
        ),
      );
      expect(callback).toHaveBeenCalledTimes(2);
      expect(callback.mock.calls[1][0]).toHaveLength(2);
    });

    it("cacheFirst still waits for the server when the cache is empty", () => {
      const callback = jest.fn();
      ecouterEvenements("child1", callback, {
        type: "sommeil",
        waitForServer: true,
        cacheFirst: true,
      });
      const snapshotCallback = (onSnapshot as jest.Mock).mock.calls[0][2];

      snapshotCallback(snapshot([], true));
      expect(callback).not.toHaveBeenCalled();

      snapshotCallback(snapshot([], false));
      expect(callback).toHaveBeenCalledWith([]);
    });
  });
});
