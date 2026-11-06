/* eslint-disable import/first */
// Sprint 6 (6.1, 6.4, 6.5, 6.9) : écritures optimistes, clé d'idempotence,
// échecs visibles, suppression mise en file.

jest.mock("@/utils/errorReporting", () => ({
  addBreadcrumb: jest.fn(),
  captureServiceError: jest.fn(),
}));
jest.mock("@/services/offlineQueueService", () => ({
  enqueueEvent: jest.fn(() => Promise.resolve("offline_1")),
  isOnline: jest.fn(() => Promise.resolve(true)),
}));
jest.mock("@/config/firebase", () => ({
  auth: { currentUser: { uid: "user123" } },
  db: {},
  functions: {},
}));

import { httpsCallable } from "firebase/functions";
import { captureServiceError } from "@/utils/errorReporting";
import * as offlineQueue from "@/services/offlineQueueService";
import {
  getOptimisticEntries,
  resetOptimisticStoreForTests,
  setOnFailure,
} from "@/services/optimisticEventsStore";
import {
  ajouterEvenement,
  ajouterEvenementOptimistic,
  modifierEvenementOptimistic,
  retryFailedOptimistic,
  supprimerEvenement,
} from "@/services/eventsService";

const callable = jest.fn();
const enqueue = offlineQueue.enqueueEvent as jest.Mock;
const online = offlineQueue.isOnline as jest.Mock;
const captured = captureServiceError as jest.Mock;

const KEY_FORMAT = /^[A-Za-z0-9_-]{1,100}$/;
const netError = () => Object.assign(new Error("network request failed"), { code: "functions/unavailable" });
const permanentError = () => Object.assign(new Error("Quantité invalide"), { code: "functions/invalid-argument" });
const conflictError = () => Object.assign(new Error("Event modified"), { code: "functions/aborted" });

/** Lets the fire-and-forget IIFE and the retry delays (1 s, 3 s) finish. */
async function settle() {
  await jest.advanceTimersByTimeAsync(5000);
}

beforeEach(() => {
  jest.useFakeTimers();
  jest.clearAllMocks();
  resetOptimisticStoreForTests();
  setOnFailure(null);
  callable.mockReset();
  (httpsCallable as jest.Mock).mockReturnValue(callable);
  online.mockResolvedValue(true);
  enqueue.mockResolvedValue("offline_1");
});
afterEach(() => jest.useRealTimers());

describe("ajouterEvenement (6.1)", () => {
  it("generates an idempotency key for every create, online", async () => {
    callable.mockResolvedValue({ data: { id: "srv1" } });
    await ajouterEvenement("c1", { type: "biberon", quantite: 100, date: new Date() } as any);
    const payload = callable.mock.calls[0][0];
    expect(payload.idempotencyKey).toMatch(KEY_FORMAT);
    expect(payload.childId).toBe("c1");
  });

  it("puts the key in the queued payload, so the replay is deduplicated", async () => {
    online.mockResolvedValue(false);
    await ajouterEvenement("c1", { type: "biberon", quantite: 100, date: new Date() } as any);
    expect(enqueue).toHaveBeenCalledWith(
      "create",
      expect.objectContaining({ idempotencyKey: expect.stringMatching(KEY_FORMAT) }),
    );
    expect(callable).not.toHaveBeenCalled();
  });

  it("keeps a key supplied by the caller and gives distinct keys to distinct creates", async () => {
    callable.mockResolvedValue({ data: { id: "x" } });
    await ajouterEvenement("c1", { type: "biberon", idempotencyKey: "mine", date: new Date() } as any);
    expect(callable.mock.calls[0][0].idempotencyKey).toBe("mine");
    await ajouterEvenement("c1", { type: "biberon", date: new Date() } as any);
    await ajouterEvenement("c1", { type: "biberon", date: new Date() } as any);
    expect(callable.mock.calls[1][0].idempotencyKey).not.toBe(callable.mock.calls[2][0].idempotencyKey);
  });
});

describe("ajouterEvenementOptimistic (6.9)", () => {
  const data = () => ({ type: "biberon", quantite: 120, date: new Date("2026-04-01T10:00:00Z") });

  it("shows the event at once and confirms it with the real id", async () => {
    callable.mockResolvedValue({ data: { id: "srv1" } });
    const tempId = ajouterEvenementOptimistic("c1", data());
    expect(tempId).toMatch(/^__optimistic_/);
    expect(getOptimisticEntries("c1")[0]).toMatchObject({ tempId, status: "pending" });

    await settle();

    expect(getOptimisticEntries("c1")[0]).toMatchObject({ status: "confirmed", realId: "srv1" });
    expect(callable).toHaveBeenCalledTimes(1);
  });

  it("sends the same key on every retry and in the queued copy", async () => {
    callable.mockRejectedValue(netError());
    ajouterEvenementOptimistic("c1", data());
    await settle();

    expect(callable).toHaveBeenCalledTimes(3); // 1 try + 2 retries
    const keys = callable.mock.calls.map(([p]) => p.idempotencyKey);
    expect(new Set(keys).size).toBe(1);
    expect(keys[0]).toMatch(KEY_FORMAT);
    expect(enqueue).toHaveBeenCalledWith("create", expect.objectContaining({ idempotencyKey: keys[0] }));
    expect(getOptimisticEntries("c1")[0].status).toBe("queued_offline");
  });

  it("queues straight away when offline, without calling the server", async () => {
    online.mockResolvedValue(false);
    ajouterEvenementOptimistic("c1", data());
    await settle();
    expect(callable).not.toHaveBeenCalled();
    expect(enqueue).toHaveBeenCalledWith("create", expect.objectContaining({ type: "biberon", childId: "c1" }));
    expect(getOptimisticEntries("c1")[0].status).toBe("queued_offline");
  });

  it("a permanent refusal is reported with the event type, to Sentry, and rolled back", async () => {
    const onFailure = jest.fn();
    setOnFailure(onFailure);
    callable.mockRejectedValue(permanentError());

    ajouterEvenementOptimistic("c1", data());
    await settle();

    expect(callable).toHaveBeenCalledTimes(3);
    expect(enqueue).not.toHaveBeenCalled();
    expect(getOptimisticEntries("c1")).toHaveLength(0);
    expect(onFailure).toHaveBeenCalledWith(
      "Échec de l'ajout : biberon.",
      expect.objectContaining({ operation: "create", eventType: "biberon", retryable: true }),
    );
    expect(captured).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ service: "events", operation: "ajouterEvenementOptimistic" }),
    );
  });

  it("a failed enqueue is no longer swallowed: the user is told and Sentry gets it", async () => {
    const onFailure = jest.fn();
    setOnFailure(onFailure);
    online.mockResolvedValue(false);
    enqueue.mockRejectedValue(new Error("disk full"));

    ajouterEvenementOptimistic("c1", data());
    await settle();

    expect(getOptimisticEntries("c1")).toHaveLength(0);
    expect(onFailure).toHaveBeenCalledWith("Échec de l'ajout : biberon.", expect.objectContaining({ retryable: true }));
    expect(captured).toHaveBeenCalledWith(
      expect.objectContaining({ message: "disk full" }),
      expect.objectContaining({ operation: "ajouterEvenementOptimistic" }),
    );
  });

  it("failure after a network error whose enqueue also fails", async () => {
    const onFailure = jest.fn();
    setOnFailure(onFailure);
    callable.mockRejectedValue(netError());
    enqueue.mockRejectedValue(new Error("sqlite locked"));
    ajouterEvenementOptimistic("c1", data());
    await settle();
    expect(onFailure).toHaveBeenCalledTimes(1);
    expect(getOptimisticEntries("c1")).toHaveLength(0);
  });

  it("calls onConfirmed on success and onFailed on failure; not retryable when asked", async () => {
    const onFailure = jest.fn();
    setOnFailure(onFailure);
    const onConfirmed = jest.fn();
    const onFailed = jest.fn();
    callable.mockResolvedValueOnce({ data: { id: "srv1" } });
    ajouterEvenementOptimistic("c1", data(), { onConfirmed, onFailed });
    await settle();
    expect(onConfirmed).toHaveBeenCalledTimes(1);
    expect(onFailed).not.toHaveBeenCalled();

    callable.mockRejectedValue(permanentError());
    ajouterEvenementOptimistic("c1", data(), { onConfirmed, onFailed, retryable: false });
    await settle();
    expect(onFailed).toHaveBeenCalledTimes(1);
    expect(onConfirmed).toHaveBeenCalledTimes(1);
    expect(onFailure).toHaveBeenLastCalledWith(
      "Échec de l'ajout : biberon. Veuillez recommencer.",
      expect.objectContaining({ retryable: false }),
    );
  });

  it("an edit made before the create answers is replayed on the real id", async () => {
    let resolveCreate: (v: unknown) => void = () => {};
    callable.mockImplementationOnce(() => new Promise((r) => { resolveCreate = r; }));
    const tempId = ajouterEvenementOptimistic("c1", data());
    await jest.advanceTimersByTimeAsync(0);

    modifierEvenementOptimistic("c1", tempId, { quantite: 90 } as any, { type: "biberon" });
    expect(getOptimisticEntries("c1").find((e) => e.tempId === tempId)?.event.quantite).toBe(90);

    callable.mockResolvedValue({ data: { success: true } });
    resolveCreate({ data: { id: "srv9" } });
    await settle();

    expect(callable).toHaveBeenCalledTimes(2);
    expect(callable.mock.calls[1][0]).toMatchObject({ eventId: "srv9", quantite: 90 });
  });
});

describe("modifierEvenementOptimistic (6.9)", () => {
  const previous = { id: "e1", type: "biberon", childId: "c1", quantite: 100 };

  it("confirms an accepted update and sends the optimistic-lock token", async () => {
    callable.mockResolvedValue({ data: { success: true } });
    const opId = modifierEvenementOptimistic("c1", "e1", { quantite: 150 } as any, previous, 1700000000000);
    expect(getOptimisticEntries("c1")[0]).toMatchObject({ tempId: opId, status: "pending", operation: "update" });
    await settle();
    expect(callable.mock.calls[0][0]).toMatchObject({
      childId: "c1", eventId: "e1", quantite: 150, expectedUpdatedAt: 1700000000000,
    });
    expect(getOptimisticEntries("c1")[0].status).toBe("confirmed");
  });

  it("queues the update when offline", async () => {
    online.mockResolvedValue(false);
    modifierEvenementOptimistic("c1", "e1", { quantite: 150 } as any, previous);
    await settle();
    expect(enqueue).toHaveBeenCalledWith("update", expect.objectContaining({ eventId: "e1", quantite: 150 }));
    expect(callable).not.toHaveBeenCalled();
    expect(getOptimisticEntries("c1")[0].status).toBe("queued_offline");
  });

  it("queues the update after a network error", async () => {
    callable.mockRejectedValue(netError());
    modifierEvenementOptimistic("c1", "e1", { quantite: 150 } as any, previous);
    await settle();
    expect(callable).toHaveBeenCalledTimes(3);
    expect(enqueue).toHaveBeenCalledTimes(1);
  });

  it("a version conflict (aborted) is not queued and not retryable", async () => {
    const onFailure = jest.fn();
    setOnFailure(onFailure);
    callable.mockRejectedValue(conflictError());
    modifierEvenementOptimistic("c1", "e1", { quantite: 150 } as any, previous, 1);
    await settle();
    expect(enqueue).not.toHaveBeenCalled();
    expect(getOptimisticEntries("c1")).toHaveLength(0);
    expect(onFailure).toHaveBeenCalledWith(
      "Échec de la modification : biberon. Veuillez recommencer.",
      expect.objectContaining({ operation: "update", retryable: false, eventType: "biberon" }),
    );
  });

  it("a failed enqueue is reported, not swallowed", async () => {
    const onFailure = jest.fn();
    setOnFailure(onFailure);
    online.mockResolvedValue(false);
    enqueue.mockRejectedValue(new Error("disk full"));
    modifierEvenementOptimistic("c1", "e1", { quantite: 150 } as any, previous);
    await settle();
    expect(getOptimisticEntries("c1")).toHaveLength(0);
    expect(onFailure).toHaveBeenCalledWith("Échec de la modification : biberon.", expect.anything());
    expect(captured).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ operation: "modifierEvenementOptimistic" }),
    );
  });

  it("onConfirmed fires after the server accepted (old photo cleanup), onFailed on refusal", async () => {
    const onConfirmed = jest.fn();
    const onFailed = jest.fn();
    callable.mockResolvedValueOnce({ data: { success: true } });
    modifierEvenementOptimistic("c1", "e1", { quantite: 1 } as any, previous, undefined, { onConfirmed, onFailed });
    await settle();
    expect(onConfirmed).toHaveBeenCalledTimes(1);

    callable.mockRejectedValue(permanentError());
    modifierEvenementOptimistic("c1", "e1", { quantite: 2 } as any, previous, undefined, { onConfirmed, onFailed });
    await settle();
    expect(onFailed).toHaveBeenCalledTimes(1);
    expect(onConfirmed).toHaveBeenCalledTimes(1);
  });

  it("does not call onConfirmed when the update was only queued offline", async () => {
    online.mockResolvedValue(false);
    const onConfirmed = jest.fn();
    modifierEvenementOptimistic("c1", "e1", { quantite: 1 } as any, previous, undefined, { onConfirmed });
    await settle();
    expect(onConfirmed).not.toHaveBeenCalled();
  });
});

describe("retryFailedOptimistic (6.4)", () => {
  it("re-sends a failed create with the data kept and the same key", async () => {
    let failure: any;
    setOnFailure((_m, f) => { failure = f; });
    callable.mockRejectedValue(permanentError());
    ajouterEvenementOptimistic("c1", { type: "biberon", quantite: 120, date: new Date() });
    await settle();
    const firstKey = callable.mock.calls[0][0].idempotencyKey;

    callable.mockReset();
    callable.mockResolvedValue({ data: { id: "srv2" } });
    retryFailedOptimistic(failure);
    await settle();

    expect(callable).toHaveBeenCalledTimes(1);
    expect(callable.mock.calls[0][0]).toMatchObject({ type: "biberon", quantite: 120, childId: "c1", idempotencyKey: firstKey });
    expect(callable.mock.calls[0][0]).not.toHaveProperty("userId");
  });

  it("re-sends a failed update with the new values", async () => {
    let failure: any;
    setOnFailure((_m, f) => { failure = f; });
    callable.mockRejectedValue(permanentError());
    modifierEvenementOptimistic("c1", "e1", { quantite: 150 } as any, { id: "e1", type: "biberon", quantite: 100 });
    await settle();

    callable.mockReset();
    callable.mockResolvedValue({ data: { success: true } });
    retryFailedOptimistic(failure);
    await settle();

    expect(callable.mock.calls[0][0]).toMatchObject({ eventId: "e1", childId: "c1", quantite: 150 });
  });

  it("does nothing for a non-retryable failure", () => {
    retryFailedOptimistic({ retryable: false, operation: "create", childId: "c1", eventType: "jalon", event: {}, retryData: {} });
    expect(callable).not.toHaveBeenCalled();
  });
});

describe("supprimerEvenement (6.5)", () => {
  it("reports 'deleted' when the server did it", async () => {
    callable.mockResolvedValue({ data: { success: true } });
    await expect(supprimerEvenement("c1", "e1")).resolves.toBe("deleted");
  });

  it("reports 'queued' when offline: the deletion is not done yet", async () => {
    online.mockResolvedValue(false);
    await expect(supprimerEvenement("c1", "e1")).resolves.toBe("queued");
    expect(enqueue).toHaveBeenCalledWith("delete", { childId: "c1", eventId: "e1" });
    expect(callable).not.toHaveBeenCalled();
  });

  it("propagates a server error", async () => {
    callable.mockRejectedValue(permanentError());
    await expect(supprimerEvenement("c1", "e1")).rejects.toThrow("Quantité invalide");
  });
});
