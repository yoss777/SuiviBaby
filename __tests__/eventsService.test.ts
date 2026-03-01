import { httpsCallable } from "firebase/functions";
import NetInfo from "@react-native-community/netinfo";
import * as offlineQueue from "@/services/offlineQueueService";

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

import {
  ajouterEvenement,
  modifierEvenement,
  supprimerEvenement,
} from "@/services/eventsService";

beforeEach(() => {
  jest.clearAllMocks();
  (httpsCallable as jest.Mock).mockReturnValue(mockCallable);
  (offlineQueue.isOnline as jest.Mock).mockResolvedValue(true);
});

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
});
