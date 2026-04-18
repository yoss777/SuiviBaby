import {
  addOptimisticCreate,
  addOptimisticUpdate,
  buildEventFingerprint,
  confirmOptimistic,
  failOptimistic,
  markOptimisticQueued,
  mergeWithFirestoreEvents,
  resetOptimisticStoreForTests,
  setOnFailure,
} from "@/services/optimisticEventsStore";

describe("optimisticEventsStore", () => {
  beforeEach(() => {
    resetOptimisticStoreForTests();
  });

  it("keeps a queued offline create visible until Firestore confirms it", () => {
    const childId = "child-1";
    const tempId = "__optimistic_create";
    const optimisticEvent = {
      type: "biberon",
      childId,
      quantite: 120,
      date: new Date("2026-03-28T10:00:00.000Z"),
      idempotencyKey: "key-create-1",
    };

    addOptimisticCreate(childId, optimisticEvent, tempId);
    markOptimisticQueued(tempId);

    const beforeSync = mergeWithFirestoreEvents([], childId);
    expect(beforeSync).toHaveLength(1);
    expect(beforeSync[0].id).toBe(tempId);
    expect(beforeSync[0].quantite).toBe(120);

    const firestoreEvent = {
      id: "real-create-1",
      type: "biberon",
      childId,
      quantite: 120,
      date: { seconds: 1_743_156_000, nanoseconds: 0 },
      idempotencyKey: "key-create-1",
    };

    const afterSync = mergeWithFirestoreEvents([firestoreEvent], childId);
    expect(afterSync).toHaveLength(1);
    expect(afterSync[0].id).toBe("real-create-1");

    const nextMerge = mergeWithFirestoreEvents([firestoreEvent], childId);
    expect(nextMerge).toHaveLength(1);
    expect(nextMerge[0].id).toBe("real-create-1");
  });

  it("keeps a queued offline update visible until Firestore catches up", () => {
    const childId = "child-1";
    const eventId = "event-1";
    const previousEvent = {
      id: eventId,
      type: "sommeil",
      childId,
      date: new Date("2026-03-28T08:00:00.000Z"),
      heureDebut: new Date("2026-03-28T08:00:00.000Z"),
    };
    const updatedEvent = {
      ...previousEvent,
      heureFin: new Date("2026-03-28T09:00:00.000Z"),
      duree: 60,
    };

    addOptimisticUpdate(eventId, childId, updatedEvent, previousEvent);
    markOptimisticQueued(eventId);

    const staleFirestoreEvent = {
      id: eventId,
      type: "sommeil",
      childId,
      date: { seconds: 1_743_148_800, nanoseconds: 0 },
      heureDebut: { seconds: 1_743_148_800, nanoseconds: 0 },
    };

    const beforeSync = mergeWithFirestoreEvents([staleFirestoreEvent], childId);
    expect(beforeSync).toHaveLength(1);
    expect(beforeSync[0].heureFin).toEqual(updatedEvent.heureFin);
    expect(beforeSync[0].duree).toBe(60);

    const confirmedFirestoreEvent = {
      id: eventId,
      type: "sommeil",
      childId,
      date: { seconds: 1_743_148_800, nanoseconds: 0 },
      heureDebut: { seconds: 1_743_148_800, nanoseconds: 0 },
      heureFin: { seconds: 1_743_152_400, nanoseconds: 0 },
      duree: 60,
    };

    const afterSync = mergeWithFirestoreEvents(
      [confirmedFirestoreEvent],
      childId,
    );
    expect(afterSync).toHaveLength(1);
    expect(afterSync[0].duree).toBe(60);

    const nextMerge = mergeWithFirestoreEvents(
      [confirmedFirestoreEvent],
      childId,
    );
    expect(nextMerge).toHaveLength(1);
    expect(nextMerge[0].duree).toBe(60);
  });

  it("keeps a confirmed create visible with the real id until the Firestore snapshot arrives", () => {
    const childId = "child-1";
    const tempId = "__optimistic_create_confirmed";
    const optimisticEvent = {
      type: "biberon",
      childId,
      quantite: 90,
      date: new Date("2026-03-28T11:00:00.000Z"),
      idempotencyKey: "key-create-2",
    };

    addOptimisticCreate(childId, optimisticEvent, tempId);
    confirmOptimistic(tempId, "real-create-2");

    const beforeSnapshot = mergeWithFirestoreEvents([], childId);
    expect(beforeSnapshot).toHaveLength(1);
    expect(beforeSnapshot[0].id).toBe("real-create-2");
    expect(beforeSnapshot[0].quantite).toBe(90);

    const staleRefresh = mergeWithFirestoreEvents([], childId);
    expect(staleRefresh).toHaveLength(1);
    expect(staleRefresh[0].id).toBe("real-create-2");
    expect(staleRefresh[0].quantite).toBe(90);

    const firestoreEvent = {
      id: "real-create-2",
      type: "biberon",
      childId,
      quantite: 90,
      date: { seconds: 1_743_159_600, nanoseconds: 0 },
      idempotencyKey: "key-create-2",
    };

    const afterSnapshot = mergeWithFirestoreEvents([firestoreEvent], childId);
    expect(afterSnapshot).toHaveLength(1);
    expect(afterSnapshot[0].id).toBe("real-create-2");
  });

  it("keeps a confirmed update visible until Firestore returns the updated fields", () => {
    const childId = "child-1";
    const eventId = "event-confirmed-update";
    const previousEvent = {
      id: eventId,
      type: "activite",
      childId,
      typeActivite: "promenade",
      date: new Date("2026-03-28T12:00:00.000Z"),
      heureDebut: new Date("2026-03-28T12:00:00.000Z"),
    };
    const updatedEvent = {
      ...previousEvent,
      heureFin: new Date("2026-03-28T12:45:00.000Z"),
      duree: 45,
    };
    const staleFirestoreEvent = {
      id: eventId,
      type: "activite",
      childId,
      typeActivite: "promenade",
      date: { seconds: 1_774_699_200, nanoseconds: 0 },
      heureDebut: { seconds: 1_774_699_200, nanoseconds: 0 },
    };

    addOptimisticUpdate(eventId, childId, updatedEvent, previousEvent);
    confirmOptimistic(eventId);

    const beforeSnapshot = mergeWithFirestoreEvents(
      [staleFirestoreEvent],
      childId,
    );
    expect(beforeSnapshot).toHaveLength(1);
    expect(beforeSnapshot[0].heureFin).toEqual(updatedEvent.heureFin);
    expect(beforeSnapshot[0].duree).toBe(45);

    const staleRefresh = mergeWithFirestoreEvents(
      [staleFirestoreEvent],
      childId,
    );
    expect(staleRefresh).toHaveLength(1);
    expect(staleRefresh[0].heureFin).toEqual(updatedEvent.heureFin);
    expect(staleRefresh[0].duree).toBe(45);

    const confirmedFirestoreEvent = {
      ...staleFirestoreEvent,
      heureFin: { seconds: 1_774_701_900, nanoseconds: 0 },
      duree: 45,
    };

    const afterSnapshot = mergeWithFirestoreEvents(
      [confirmedFirestoreEvent],
      childId,
    );
    expect(afterSnapshot).toHaveLength(1);
    expect(afterSnapshot[0].duree).toBe(45);
  });

  it("does not keep stale untouched time fields from the optimistic previous event", () => {
    const childId = "child-1";
    const eventId = "event-stale-time";
    const start = new Date("2026-03-28T08:00:00.000Z");
    const end = new Date("2026-03-28T09:00:00.000Z");
    const previousEvent = {
      id: eventId,
      type: "sommeil",
      childId,
      date: new Date("2026-03-28T07:00:00.000Z"),
      heureDebut: new Date("2026-03-28T07:00:00.000Z"),
    };
    const optimisticPatch = {
      id: eventId,
      type: "sommeil",
      childId,
      heureFin: end,
      duree: 60,
    };
    const firestoreEvent = {
      id: eventId,
      type: "sommeil",
      childId,
      date: { seconds: Math.floor(start.getTime() / 1000), nanoseconds: 0 },
      heureDebut: { seconds: Math.floor(start.getTime() / 1000), nanoseconds: 0 },
      heureFin: { seconds: Math.floor(end.getTime() / 1000), nanoseconds: 0 },
      duree: 60,
    };

    addOptimisticUpdate(eventId, childId, optimisticPatch, previousEvent);
    confirmOptimistic(eventId);

    const merged = mergeWithFirestoreEvents([firestoreEvent], childId);
    expect(merged).toHaveLength(1);
    expect(merged[0].date).toEqual(firestoreEvent.date);
    expect(merged[0].heureDebut).toEqual(firestoreEvent.heureDebut);
    expect(merged[0].heureFin).toEqual(firestoreEvent.heureFin);

    const nextMerge = mergeWithFirestoreEvents([firestoreEvent], childId);
    expect(nextMerge).toHaveLength(1);
    expect(nextMerge[0].date).toEqual(firestoreEvent.date);
  });

  it("changes the fingerprint when an older item outside the old 30-item window is edited", () => {
    const baseEvents: any[] = Array.from({ length: 35 }, (_, index) => ({
      id: `event-${index}`,
      type: "biberon",
      quantite: index,
      date: new Date(`2026-03-${String(28 - Math.min(index, 27)).padStart(2, "0")}T10:00:00.000Z`),
    }));

    const before = buildEventFingerprint(baseEvents);
    const mutated = [...baseEvents];
    mutated[34] = {
      ...mutated[34],
      note: "late edit",
    };
    const after = buildEventFingerprint(mutated);

    expect(after).not.toBe(before);
  });

  it("calls the registered failure callback and rolls back update data on failure", () => {
    const childId = "child-1";
    const eventId = "event-rollback";
    const previousEvent = {
      id: eventId,
      type: "sommeil",
      childId,
      duree: 30,
      date: new Date("2026-03-28T07:00:00.000Z"),
    };
    const updatedEvent = {
      ...previousEvent,
      duree: 45,
    };
    const onFailure = jest.fn();

    setOnFailure(onFailure);
    addOptimisticUpdate(eventId, childId, updatedEvent, previousEvent);

    const result = failOptimistic(eventId);

    expect(result).toEqual({
      event: previousEvent,
      operation: "update",
    });
    expect(onFailure).toHaveBeenCalledWith(
      "Erreur lors de la modification. Veuillez réessayer.",
    );
  });
});
