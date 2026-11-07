/* eslint-disable import/first */
// Sprint 13.2 : fenêtre de dates des écrans de liste (machine à états du
// « Voir plus » reprise de l'écran Pompages).

const mockGetNext = jest.fn();
const mockHasMore = jest.fn();
jest.mock("@/services/eventsService", () => ({
  getNextEventDateBefore: (...args: unknown[]) => mockGetNext(...args),
  hasMoreEventsBefore: (...args: unknown[]) => mockHasMore(...args),
}));

import { act, renderHook } from "@testing-library/react-native";

import { MAX_AUTO_LOAD_ATTEMPTS } from "@/constants/pagination";
import {
  computeRange,
  typesArg,
  useAutoLoadMore,
  useEventWindow,
} from "@/hooks/eventList/useEventWindow";

const NOW = new Date(2026, 10, 7, 15, 0, 0);
const DAY = 24 * 60 * 60 * 1000;

type Props = {
  jumpOnManual: boolean;
  jumpWindow: "extend" | "reset";
  jumpToLatestOnMount?: boolean;
  types?: readonly any[];
  loaded?: boolean;
  groupsCount?: number;
  blocked?: boolean;
};

function useHarness(p: Props) {
  const window = useEventWindow({
    childId: "child-1",
    eventTypes: p.types ?? ["pompage"],
    jumpToLatestOnMount: p.jumpToLatestOnMount ?? false,
    loadMore: { jumpOnManual: p.jumpOnManual, jumpWindow: p.jumpWindow },
  });
  useAutoLoadMore(window, {
    loaded: p.loaded ?? false,
    groupsCount: p.groupsCount ?? 1,
    blocked: p.blocked ?? false,
  });
  return window;
}

async function flush() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

beforeEach(() => {
  jest.useFakeTimers();
  jest.setSystemTime(NOW);
  mockGetNext.mockReset();
  mockHasMore.mockReset();
  mockHasMore.mockResolvedValue(true);
  mockGetNext.mockResolvedValue(null);
});

afterEach(() => {
  jest.useRealTimers();
});

describe("computeRange / typesArg", () => {
  it("14 jours se terminant à 23:59:59.999", () => {
    const { startOfRange, endOfRange } = computeRange(null, 14);
    expect(endOfRange).toEqual(new Date(2026, 10, 7, 23, 59, 59, 999));
    expect(startOfRange).toEqual(new Date(2026, 9, 25, 0, 0, 0, 0));
  });

  it("garde la forme d'appel historique (chaîne pour un type)", () => {
    expect(typesArg(["pompage"])).toBe("pompage");
    expect(typesArg(["miction", "selle"])).toEqual(["miction", "selle"]);
  });
});

describe("useEventWindow", () => {
  it("démarre sur 14 jours et calcule hasMore avant la fenêtre", async () => {
    mockHasMore.mockResolvedValue(false);
    const { result } = renderHook(() => useHarness({ jumpOnManual: true, jumpWindow: "extend" }));
    expect(result.current.daysWindow).toBe(14);
    expect(result.current.rangeEndDate).toBeNull();
    await flush();
    expect(mockHasMore).toHaveBeenCalledWith(
      "child-1",
      "pompage",
      new Date(new Date(2026, 9, 25).getTime() - 1),
    );
    expect(result.current.hasMore).toBe(false);
  });

  it("saute au dernier événement au montage (pompages)", async () => {
    const last = new Date(2026, 9, 1, 10, 0);
    mockGetNext.mockResolvedValue(last);
    const { result } = renderHook(() =>
      useHarness({ jumpOnManual: true, jumpWindow: "extend", jumpToLatestOnMount: true }),
    );
    await flush();
    expect(mockGetNext).toHaveBeenCalledWith("child-1", "pompage", new Date(2026, 10, 7, 23, 59, 59, 999));
    expect(result.current.rangeEndDate).toEqual(last);
    expect(result.current.daysWindow).toBe(14);
  });

  it("« Voir plus » manuel avec jumpOnManual : élargit jusqu'au prochain événement", async () => {
    const next = new Date(2026, 9, 1, 10, 0); // 37 jours avant le 7 nov.
    mockGetNext.mockResolvedValue(next);
    const { result } = renderHook(() => useHarness({ jumpOnManual: true, jumpWindow: "extend" }));
    await flush();

    await act(async () => {
      await result.current.loadMoreStep(false);
    });

    expect(mockGetNext).toHaveBeenCalledWith(
      "child-1",
      "pompage",
      new Date(new Date(2026, 9, 25).getTime() - 1),
    );
    const endOfRange = new Date(2026, 10, 7, 23, 59, 59, 999);
    const expected = Math.floor((endOfRange.getTime() - new Date(2026, 9, 1).getTime()) / DAY) + 1;
    expect(result.current.daysWindow).toBe(expected);
    expect(result.current.rangeEndDate).toEqual(next);
    expect(result.current.isLoadingMore).toBe(true);
    expect(result.current.autoLoadMore).toBe(true);
  });

  it("« Voir plus » manuel sans jumpOnManual (repas) : +14 jours, pas de requête", async () => {
    const { result } = renderHook(() => useHarness({ jumpOnManual: false, jumpWindow: "reset" }));
    await flush();
    await act(async () => {
      await result.current.loadMoreStep(false);
    });
    expect(mockGetNext).not.toHaveBeenCalled();
    expect(result.current.daysWindow).toBe(28);
  });

  it("auto épuisé avec jumpWindow reset (repas) : fenêtre ramenée à 14 jours", async () => {
    const next = new Date(2026, 6, 1, 10, 0);
    mockGetNext.mockResolvedValue(next);
    const { result } = renderHook(() => useHarness({ jumpOnManual: false, jumpWindow: "reset" }));
    await flush();

    // Deux élargissements (+14) puis le saut.
    await act(async () => {
      result.current.setAutoLoadMoreAttempts(MAX_AUTO_LOAD_ATTEMPTS - 1);
    });
    await act(async () => {
      await result.current.loadMoreStep(true);
    });
    expect(mockGetNext).toHaveBeenCalledTimes(1);
    expect(result.current.daysWindow).toBe(14);
    expect(result.current.rangeEndDate).toEqual(next);
  });

  it("plus rien avant : hasMore false et fin du chargement", async () => {
    mockGetNext.mockResolvedValue(null);
    const { result } = renderHook(() => useHarness({ jumpOnManual: true, jumpWindow: "extend" }));
    await flush();
    await act(async () => {
      await result.current.loadMoreStep(false);
    });
    expect(result.current.hasMore).toBe(false);
    expect(result.current.isLoadingMore).toBe(false);
  });

  it("attend une réponse par écouteur (garde de version)", async () => {
    const { result } = renderHook(() =>
      useHarness({ jumpOnManual: false, jumpWindow: "reset", types: ["tetee", "biberon", "solide"] }),
    );
    await flush();
    await act(async () => {
      await result.current.loadMoreStep(false);
    });
    const version = result.current.loadMoreVersionRef.current;
    expect(result.current.pendingLoadMoreRef.current).toBe(3);

    // Snapshot d'un écouteur abonné avant le clic : ignoré.
    act(() => result.current.notifySnapshot(version - 1));
    expect(result.current.pendingLoadMoreRef.current).toBe(3);

    act(() => result.current.notifySnapshot(version));
    act(() => result.current.notifySnapshot(version));
    expect(result.current.isLoadingMore).toBe(true);
    act(() => result.current.notifySnapshot(version));
    expect(result.current.isLoadingMore).toBe(false);
  });

  it("ensureTodayInRange : fenêtre étendue jusqu'à aujourd'hui", async () => {
    const last = new Date(2026, 10, 1, 23, 59, 59, 999);
    mockGetNext.mockResolvedValue(last);
    const { result } = renderHook(() =>
      useHarness({ jumpOnManual: true, jumpWindow: "extend", jumpToLatestOnMount: true }),
    );
    await flush();
    act(() => result.current.ensureTodayInRange());
    expect(result.current.rangeEndDate).toEqual(new Date(2026, 10, 7, 23, 59, 59, 999));
    expect(result.current.daysWindow).toBe(14 + 6);

    // Déjà à jour : rien ne change.
    act(() => result.current.ensureTodayInRange());
    expect(result.current.daysWindow).toBe(20);
  });
});

describe("useAutoLoadMore", () => {
  it("élargit tant que la liste est vide, au plus MAX tentatives", async () => {
    mockHasMore.mockResolvedValue(true);
    mockGetNext.mockResolvedValue(null);
    const { result, rerender } = renderHook((p: Props) => useHarness(p), {
      initialProps: { jumpOnManual: true, jumpWindow: "extend", loaded: false, groupsCount: 0 },
    });
    await flush();

    rerender({ jumpOnManual: true, jumpWindow: "extend", loaded: true, groupsCount: 0 });
    await flush();
    // 1re tentative : +14 jours, isLoadingMore jusqu'à la réponse de l'écouteur.
    expect(result.current.daysWindow).toBe(28);
    expect(result.current.autoLoadMoreAttempts).toBe(1);

    for (let i = 0; i < MAX_AUTO_LOAD_ATTEMPTS; i++) {
      act(() => result.current.notifySnapshot(result.current.loadMoreVersionRef.current));
      await flush();
    }
    // 2e tentative +14, 3e (épuisée) : saut → aucun événement → hasMore false.
    expect(result.current.daysWindow).toBe(42);
    expect(mockGetNext).toHaveBeenCalledTimes(1);
    expect(result.current.hasMore).toBe(false);
    expect(result.current.autoLoadMore).toBe(false);
  });

  it("ne charge rien sous « aujourd'hui » ou une date choisie", async () => {
    const { result } = renderHook(() =>
      useHarness({ jumpOnManual: true, jumpWindow: "extend", loaded: true, groupsCount: 0, blocked: true }),
    );
    await flush();
    expect(result.current.autoLoadMore).toBe(false);
    expect(result.current.daysWindow).toBe(14);
  });

  it("s'arrête dès qu'un groupe apparaît", async () => {
    const { result, rerender } = renderHook((p: Props) => useHarness(p), {
      initialProps: { jumpOnManual: true, jumpWindow: "extend", loaded: true, groupsCount: 0 },
    });
    await flush();
    expect(result.current.autoLoadMore).toBe(true);
    // Les données de la fenêtre élargie arrivent : un groupe, puis fin du chargement.
    rerender({ jumpOnManual: true, jumpWindow: "extend", loaded: true, groupsCount: 2 });
    act(() => result.current.notifySnapshot(result.current.loadMoreVersionRef.current));
    await flush();
    expect(result.current.autoLoadMore).toBe(false);
    expect(result.current.autoLoadMoreAttempts).toBe(0);
  });
});
