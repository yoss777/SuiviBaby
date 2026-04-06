import { act, renderHook } from "@testing-library/react-native";
import {
  mergeFirestoreSnapshots,
  useMergedOptimisticEvents,
} from "@/hooks/useMergedOptimisticEvents";

describe("useMergedOptimisticEvents", () => {
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
});
