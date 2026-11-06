/* eslint-disable import/first */
// Revue « échecs silencieux » : entrée optimiste purgée trop tôt (M2),
// suppression idempotente (M1), purge à l'abandon de la file (M8).

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
import * as offlineQueue from "@/services/offlineQueueService";
import {
  addOptimisticCreate,
  addOptimisticUpdate,
  getOptimisticEntries,
  markOptimisticQueued,
  mergeWithFirestoreEvents,
  purgeQueuedOptimistic,
  removeOptimistic,
  resetOptimisticStoreForTests,
  setOnFailure,
  setOptimisticInFlight,
  subscribe,
} from "@/services/optimisticEventsStore";
import {
  ajouterEvenementOptimistic,
  modifierEvenementOptimistic,
  supprimerEvenement,
} from "@/services/eventsService";

const callable = jest.fn();
const enqueue = offlineQueue.enqueueEvent as jest.Mock;
const online = offlineQueue.isOnline as jest.Mock;
const err = (message: string, code: string) => Object.assign(new Error(message), { code });

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

describe("M2 : purge des entrées périmées", () => {
  it("garde une entrée dont l'appel est encore en vol, même au-delà de 60 s", () => {
    addOptimisticCreate("c1", { type: "biberon" }, "__optimistic_a");
    setOptimisticInFlight("__optimistic_a", true);
    jest.advanceTimersByTime(120_000);

    const merged = mergeWithFirestoreEvents([], "c1");

    expect(merged.map((e) => e.id)).toEqual(["__optimistic_a"]);
    expect(getOptimisticEntries("c1")).toHaveLength(1);
  });

  it("purge toujours une entrée périmée dont l'appel n'est plus en vol", () => {
    addOptimisticCreate("c1", { type: "biberon" }, "__optimistic_a");
    setOptimisticInFlight("__optimistic_a", true);
    setOptimisticInFlight("__optimistic_a", false);
    jest.advanceTimersByTime(120_000);

    mergeWithFirestoreEvents([], "c1"); // le ménage se fait à la fin de la fusion
    expect(mergeWithFirestoreEvents([], "c1")).toHaveLength(0);
  });

  it("une écriture lente (> 60 s) qui finit par échouer prévient quand même l'utilisateur", async () => {
    const onFailure = jest.fn();
    setOnFailure(onFailure);
    let reject: (e: unknown) => void = () => {};
    callable.mockImplementationOnce(() => new Promise((_, r) => { reject = r; }));
    callable.mockRejectedValue(err("Quantité invalide", "functions/invalid-argument"));

    const tempId = ajouterEvenementOptimistic("c1", { type: "biberon", quantite: 90, date: new Date() });
    await jest.advanceTimersByTimeAsync(90_000);
    mergeWithFirestoreEvents([], "c1"); // le rendu de l'écran passe par là
    expect(getOptimisticEntries("c1").map((e) => e.tempId)).toContain(tempId);

    reject(err("Quantité invalide", "functions/invalid-argument"));
    await jest.advanceTimersByTimeAsync(10_000);

    expect(onFailure).toHaveBeenCalledWith("Échec de l'ajout : biberon.", expect.objectContaining({ operation: "create", childId: "c1" }));
  });

  it("failWrite prévient même quand l'entrée a disparu (création) : type et données reconstruits", async () => {
    const onFailure = jest.fn();
    setOnFailure(onFailure);
    callable.mockRejectedValue(err("Quantité invalide", "functions/invalid-argument"));
    const data = { type: "biberon", quantite: 90, date: new Date("2026-04-01T10:00:00Z") };

    const tempId = ajouterEvenementOptimistic("c1", data);
    // Entrée retirée avant la réponse (purge, changement d'enfant…).
    removeOptimistic(tempId);
    await jest.advanceTimersByTimeAsync(10_000);

    expect(onFailure).toHaveBeenCalledTimes(1);
    const [message, failure] = onFailure.mock.calls[0];
    expect(message).toBe("Échec de l'ajout : biberon.");
    expect(failure).toMatchObject({
      operation: "create",
      childId: "c1",
      eventType: "biberon",
      retryable: true,
      retryData: expect.objectContaining({ type: "biberon", quantite: 90, idempotencyKey: expect.any(String) }),
    });
  });

  it("failWrite prévient même quand l'entrée a disparu (modification) : valeurs et état précédent conservés", async () => {
    const onFailure = jest.fn();
    setOnFailure(onFailure);
    callable.mockRejectedValue(err("Quantité invalide", "functions/invalid-argument"));

    const operationId = modifierEvenementOptimistic("c1", "e1", { quantite: 150 } as any, { id: "e1", type: "biberon", quantite: 100 });
    removeOptimistic(operationId);
    await jest.advanceTimersByTimeAsync(10_000);

    expect(onFailure).toHaveBeenCalledTimes(1);
    const [message, failure] = onFailure.mock.calls[0];
    expect(message).toBe("Échec de la modification : biberon.");
    expect(failure).toMatchObject({
      operation: "update",
      eventId: "e1",
      eventType: "biberon",
      previousEvent: { id: "e1", type: "biberon", quantite: 100 },
      retryData: expect.objectContaining({ quantite: 150 }),
    });
  });

  it("l'entrée n'est plus marquée en vol une fois l'appel terminé", async () => {
    callable.mockResolvedValue({ data: { id: "srv1" } });
    ajouterEvenementOptimistic("c1", { type: "biberon", quantite: 90, date: new Date() });
    await jest.advanceTimersByTimeAsync(5000);
    expect(getOptimisticEntries("c1")[0].status).toBe("confirmed");
    expect(getOptimisticEntries("c1")[0].inFlight).toBeFalsy();
  });
});

describe("M8 : purgeQueuedOptimistic", () => {
  it("retire la création portant cette clé d'idempotence, et notifie les abonnés", () => {
    addOptimisticCreate("c1", { type: "biberon", idempotencyKey: "k1" }, "__optimistic_a");
    addOptimisticCreate("c1", { type: "biberon", idempotencyKey: "k2" }, "__optimistic_b");
    markOptimisticQueued("__optimistic_a");
    const listener = jest.fn();
    subscribe(listener);

    expect(purgeQueuedOptimistic({ action: "create", idempotencyKey: "k1" })).toBe(1);

    expect(getOptimisticEntries("c1").map((e) => e.tempId)).toEqual(["__optimistic_b"]);
    expect(listener).toHaveBeenCalled();
  });

  it("retire la modification de cet événement, sans toucher aux créations ni aux autres événements", () => {
    addOptimisticUpdate("e1", "c1", { note: "x" }, { note: "avant" });
    addOptimisticUpdate("e2", "c1", { note: "y" }, { note: "avant" });
    addOptimisticCreate("c1", { type: "biberon", idempotencyKey: "e1" }, "__optimistic_a");

    expect(purgeQueuedOptimistic({ action: "update", eventId: "e1" })).toBe(1);

    const left = getOptimisticEntries("c1");
    expect(left).toHaveLength(2);
    expect(left.some((e) => e.realId === "e1")).toBe(false);
  });

  it("ne fait rien (ni notification) quand rien ne correspond, ou pour une suppression", () => {
    addOptimisticCreate("c1", { type: "biberon", idempotencyKey: "k1" }, "__optimistic_a");
    const listener = jest.fn();
    subscribe(listener);
    expect(purgeQueuedOptimistic({ action: "create", idempotencyKey: "zzz" })).toBe(0);
    expect(purgeQueuedOptimistic({ action: "delete", eventId: "e1" })).toBe(0);
    expect(purgeQueuedOptimistic({ action: "create" })).toBe(0);
    expect(listener).not.toHaveBeenCalled();
    expect(getOptimisticEntries("c1")).toHaveLength(1);
  });
});

describe("M1 : supprimerEvenement idempotent", () => {
  it("« not-found » du serveur = déjà supprimé : résultat « deleted »", async () => {
    callable.mockRejectedValue(err("Événement introuvable.", "functions/not-found"));
    await expect(supprimerEvenement("c1", "e1")).resolves.toBe("deleted");
  });

  it("les autres erreurs restent propagées", async () => {
    callable.mockRejectedValue(err("Refusé", "functions/permission-denied"));
    await expect(supprimerEvenement("c1", "e1")).rejects.toThrow("Refusé");
    callable.mockRejectedValue(err("network request failed", "functions/unavailable"));
    await expect(supprimerEvenement("c1", "e1")).rejects.toThrow("network");
  });
});
