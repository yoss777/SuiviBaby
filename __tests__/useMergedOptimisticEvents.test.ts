import { act, renderHook } from "@testing-library/react-native";
import {
  filterTypes,
  mergeFirestoreSnapshots,
  useMergedOptimisticEvents,
} from "@/hooks/useMergedOptimisticEvents";
import {
  addOptimisticCreate,
  resetOptimisticStoreForTests,
} from "@/services/optimisticEventsStore";

describe("useMergedOptimisticEvents", () => {
  it("filterTypes keeps only the given types, and everything without a list", () => {
    const events = [{ id: "1", type: "sommeil" }, { id: "2", type: "biberon" }];
    expect(filterTypes(events, ["sommeil"])).toEqual([events[0]]);
    expect(filterTypes(events, undefined)).toBe(events);
  });

  it("does not show another screen's pending entries (Routines crash, Sentry 1.0.9+13)", () => {
    jest.useFakeTimers();
    resetOptimisticStoreForTests();
    addOptimisticCreate(
      "child-a",
      { type: "biberon", childId: "child-a", date: new Date("2026-11-07T08:00:00Z") },
      "__optimistic_biberon",
    );
    addOptimisticCreate(
      "child-a",
      { type: "sommeil", childId: "child-a", date: new Date("2026-11-07T07:00:00Z") },
      "__optimistic_sommeil",
    );

    const { result, unmount } = renderHook(() =>
      useMergedOptimisticEvents({
        childId: "child-a",
        debounceMs: 0,
        eventTypes: ["sommeil", "bain", "nettoyage_nez"],
      }),
    );
    act(() => {
      result.current.setFirestoreEvents([]);
      jest.runOnlyPendingTimers();
    });

    expect(result.current.mergedEvents.map((e: any) => e.type)).toEqual(["sommeil"]);

    unmount();
    resetOptimisticStoreForTests();
    jest.useRealTimers();
  });

  it("keeps the current event version when a non-destructive refresh returns stale data for the same id", () => {
    const current = [
      {
        id: "promenade-1",
        type: "activite",
        typeActivite: "promenade",
        heureDebut: new Date("2026-03-28T12:00:00.000Z"),
        heureFin: new Date("2026-03-28T12:45:00.000Z"),
        duree: 45,
      },
    ];
    const incoming = [
      {
        id: "promenade-1",
        type: "activite",
        typeActivite: "promenade",
        heureDebut: new Date("2026-03-28T12:00:00.000Z"),
      },
      {
        id: "biberon-1",
        type: "biberon",
        quantite: 120,
      },
    ];

    const merged = mergeFirestoreSnapshots(current, incoming);

    expect(merged).toHaveLength(2);
    expect(merged[0].id).toBe("promenade-1");
    expect(merged[0].heureFin).toEqual(current[0].heureFin);
    expect(merged[0].duree).toBe(45);
    expect(merged[1].id).toBe("biberon-1");
  });

  it("resets merged events when switching between valid child ids", () => {
    jest.useFakeTimers();
    type HookProps = { childId: string };
    type HookResult = ReturnType<typeof useMergedOptimisticEvents>;
    const eventForChildA = {
      id: "event-child-a",
      type: "biberon",
      childId: "child-a",
    };

    const { result, rerender, unmount } = renderHook<HookResult, HookProps>(
      ({ childId }: HookProps) =>
        useMergedOptimisticEvents({
          childId,
          debounceMs: 0,
        }),
      { initialProps: { childId: "child-a" } },
    );

    act(() => {
      result.current.setFirestoreEvents([eventForChildA]);
      jest.runOnlyPendingTimers();
    });

    expect(result.current.mergedEvents).toEqual([eventForChildA]);

    act(() => {
      rerender({ childId: "child-b" });
    });

    expect(result.current.mergedEvents).toEqual([]);

    unmount();
    jest.useRealTimers();
  });

  it("remergeIfChanged keeps the same array when nothing changed, refreshMerged re-emits", () => {
    jest.useFakeTimers();
    const event = { id: "biberon-1", type: "biberon", childId: "child-a", quantite: 120 };
    const { result, unmount } = renderHook(() =>
      useMergedOptimisticEvents({ childId: "child-a", debounceMs: 0 }),
    );

    act(() => {
      result.current.setFirestoreEvents([event]);
      jest.runOnlyPendingTimers();
    });
    const first = result.current.mergedEvents;

    act(() => {
      result.current.remergeIfChanged();
      jest.runOnlyPendingTimers();
    });
    expect(result.current.mergedEvents).toBe(first);

    act(() => {
      result.current.refreshMerged();
      jest.runOnlyPendingTimers();
    });
    expect(result.current.mergedEvents).not.toBe(first);
    expect(result.current.mergedEvents).toEqual(first);

    unmount();
    jest.useRealTimers();
  });
});
