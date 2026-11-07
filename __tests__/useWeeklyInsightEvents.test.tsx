import { act, renderHook, waitFor } from "@testing-library/react-native";
import { InteractionManager } from "react-native";

import { useWeeklyInsightEvents } from "@/hooks/useWeeklyInsightEvents";
import { obtenirEvenements } from "@/services/eventsService";
import {
  WEEKLY_INSIGHT_TYPES,
  clearWeeklyEventsCache,
} from "@/services/weeklyEventsCache";

jest.mock("@/services/eventsService", () => ({
  obtenirEvenements: jest.fn(),
}));

const mockObtenir = obtenirEvenements as jest.Mock;

describe("useWeeklyInsightEvents (S7.6)", () => {
  let runInteractions: (() => void) | null;

  beforeEach(() => {
    clearWeeklyEventsCache();
    mockObtenir.mockReset();
    mockObtenir.mockResolvedValue([
      { id: "s1", type: "sommeil", date: new Date(), isNap: true },
    ]);
    runInteractions = null;
    jest
      .spyOn(InteractionManager, "runAfterInteractions")
      .mockImplementation(((task: () => void) => {
        runInteractions = task;
        return { then: jest.fn(), done: jest.fn(), cancel: jest.fn() } as any;
      }) as any);
  });

  afterEach(() => jest.restoreAllMocks());

  it("ne lit rien avant la fin des interactions, puis lit filtré par type", async () => {
    const { result } = renderHook(() => useWeeklyInsightEvents("child-1"));

    expect(mockObtenir).not.toHaveBeenCalled();
    expect(result.current).toEqual([]);

    act(() => runInteractions?.());

    expect(mockObtenir).toHaveBeenCalledTimes(1);
    const [childId, options] = mockObtenir.mock.calls[0];
    expect(childId).toBe("child-1");
    expect(options.type).toEqual(WEEKLY_INSIGHT_TYPES);
    expect(options.depuis).toBeInstanceOf(Date);

    await waitFor(() => expect(result.current).toHaveLength(1));
    expect(result.current[0].type).toBe("sommeil");
  });

  it("sert le cache du jour sans relire au remontage", async () => {
    const first = renderHook(() => useWeeklyInsightEvents("child-1"));
    act(() => runInteractions?.());
    await waitFor(() => expect(first.result.current).toHaveLength(1));
    first.unmount();

    runInteractions = null;
    const second = renderHook(() => useWeeklyInsightEvents("child-1"));
    expect(second.result.current).toHaveLength(1);
    expect(runInteractions).toBeNull();
    expect(mockObtenir).toHaveBeenCalledTimes(1);
  });

  it("n'écrit pas dans l'état après démontage", async () => {
    const { unmount } = renderHook(() => useWeeklyInsightEvents("child-1"));
    unmount();
    act(() => runInteractions?.());
    expect(mockObtenir).not.toHaveBeenCalled();
  });
});

describe("withLiveToday", () => {
  const { withLiveToday } = jest.requireActual("@/hooks/useWeeklyInsightEvents");
  const now = new Date("2026-11-07T15:00:00");

  it("uses the live events for today: a confirmed fever counts before the cache refreshes", () => {
    const weekly = [
      { id: "old", type: "temperature", valeur: 37.2, date: new Date("2026-11-05T10:00:00") },
      { id: "deleted-today", type: "biberon", date: new Date("2026-11-07T08:00:00") },
    ];
    const live = [
      { id: "t1", type: "temperature", valeur: 38.6, date: new Date("2026-11-07T14:50:00") },
      { id: "ignored", type: "photo", date: new Date("2026-11-07T14:00:00") },
    ];
    const ids = withLiveToday(weekly, live, now).map((e: any) => e.id);
    expect(ids).toEqual(["old", "t1"]);
  });
});
