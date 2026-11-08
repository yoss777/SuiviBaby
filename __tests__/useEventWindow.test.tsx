/* eslint-disable import/first */
// Sprint 13.2 : fenêtre de dates des écrans de liste (machine à états du
// « Voir plus » reprise de l'écran Pompages).

const mockGetNext = jest.fn();
const mockHasMore = jest.fn();
jest.mock("expo-router/react-navigation", () => ({ useFocusEffect: jest.fn() }));
jest.mock("expo-haptics", () => ({ impactAsync: jest.fn(), ImpactFeedbackStyle: {} }));
jest.mock("@/services/eventsService", () => ({
  getNextEventDateBefore: (...args: unknown[]) => mockGetNext(...args),
  hasMoreEventsBefore: (...args: unknown[]) => mockHasMore(...args),
}));

import { act, renderHook } from "@testing-library/react-native";

import { MAX_AUTO_LOAD_ATTEMPTS } from "@/constants/pagination";
import { useDayFilters } from "@/hooks/eventList/useDayFilters";
import { dayKey } from "@/utils/eventListGrouping";
import {
  computeRange,
  daysWindowToCover,
  typesArg,
  useAutoLoadMore,
  useEventWindow,
} from "@/hooks/eventList/useEventWindow";

const NOW = new Date(2026, 10, 7, 15, 0, 0);
const DAY = 24 * 60 * 60 * 1000;

type Props = {
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
    const { result } = renderHook(() => useHarness({}));
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
      useHarness({ jumpToLatestOnMount: true }),
    );
    await flush();
    expect(mockGetNext).toHaveBeenCalledWith("child-1", "pompage", new Date(2026, 10, 7, 23, 59, 59, 999));
    expect(result.current.rangeEndDate).toEqual(last);
    expect(result.current.daysWindow).toBe(14);
  });

  it("« Voir plus » : fenêtre [J-13, J], prochain événement à J-30 → plage [J-44, J]", async () => {
    const J = new Date(2026, 10, 7, 23, 59, 59, 999);
    const next = new Date(2026, 9, 8, 10, 0); // J-30
    mockGetNext.mockResolvedValue(next);
    const { result } = renderHook(() => useHarness({}));
    await flush();

    await act(async () => {
      await result.current.loadMoreStep(false);
    });

    expect(mockGetNext).toHaveBeenCalledWith(
      "child-1",
      "pompage",
      new Date(new Date(2026, 9, 25).getTime() - 1),
    );
    const { startOfRange, endOfRange } = computeRange(
      result.current.rangeEndDate,
      result.current.daysWindow,
    );
    // Fin inchangée (aujourd'hui), début = J-44 : l'événement (J-30) + 14 jours avant.
    expect(endOfRange).toEqual(J);
    expect(startOfRange).toEqual(new Date(2026, 8, 24, 0, 0, 0, 0));
    expect(result.current.daysWindow).toBe(45);
    expect(result.current.rangeEndDate).toBeNull();
    expect(result.current.isLoadingMore).toBe(true);
    expect(result.current.autoLoadMore).toBe(true);
  });

  it("« Voir plus » avec une fin de fenêtre déjà décalée : la fin reste, début = E - 14 j", async () => {
    const last = new Date(2026, 9, 20, 10, 0);
    mockGetNext.mockResolvedValueOnce(last);
    const { result } = renderHook(() =>
      useHarness({ jumpToLatestOnMount: true }),
    );
    await flush();
    expect(result.current.rangeEndDate).toEqual(last);

    const older = new Date(2026, 8, 1, 10, 0);
    mockGetNext.mockResolvedValueOnce(older);
    await act(async () => {
      await result.current.loadMoreStep(false);
    });
    expect(result.current.rangeEndDate).toEqual(last);
    const { startOfRange } = computeRange(result.current.rangeEndDate, result.current.daysWindow);
    expect(startOfRange).toEqual(new Date(2026, 7, 18, 0, 0, 0, 0)); // 1er sept. - 14 j
  });

  it("le calendrier marque l'événement trouvé à J-30 et les jours récents", async () => {
    const next = new Date(2026, 9, 8, 10, 0); // J-30
    const recent = new Date(2026, 10, 7, 8, 0);
    const old = new Date(2026, 9, 1, 8, 0); // J-37, dans E-14..E
    const tooOld = new Date(2026, 8, 1, 8, 0); // hors plage
    const all = [recent, next, old, tooOld];
    mockGetNext.mockResolvedValue(next);
    const { result } = renderHook(() => {
      const window = useEventWindow({
        childId: "child-1",
        eventTypes: ["pompage"],
        jumpToLatestOnMount: false,
      });
      // Simule l'écouteur Firestore : événements de la plage affichée.
      const { startOfRange, endOfRange } = computeRange(window.rangeEndDate, window.daysWindow);
      const items = all
        .filter((d) => d >= startOfRange && d <= endOfRange)
        .map((date) => ({ date }));
      const filters = useDayFilters({ items, tint: "#123", resetToTodayOnFocus: false });
      return { window, filters };
    });
    await flush();
    expect(result.current.filters.markedDates[dayKey(next)]).toBeUndefined();

    await act(async () => {
      await result.current.window.loadMoreStep(false);
    });
    const marked = result.current.filters.markedDates;
    expect(marked[dayKey(next)]).toMatchObject({ marked: true });
    expect(marked[dayKey(old)]).toMatchObject({ marked: true });
    expect(marked[dayKey(recent)]).toMatchObject({ marked: true });
    expect(marked[dayKey(tooOld)]).toBeUndefined();
  });

  it("daysWindowToCover : bornes inclusives, E à J-30 depuis J → 45 jours", () => {
    const J = new Date(2026, 10, 7, 23, 59, 59, 999);
    expect(daysWindowToCover(new Date(2026, 9, 8, 10), J)).toBe(45);
    // Événement le jour même du début de fenêtre précédente + 14.
    expect(daysWindowToCover(new Date(2026, 10, 7, 1), J)).toBe(15);
  });

  it("« Voir plus » : si la recherche du prochain événement échoue, le chargement est libéré", async () => {
    mockGetNext.mockRejectedValue(new Error("offline"));
    const { result } = renderHook(() => useHarness({}));
    await flush();
    await act(async () => {
      await result.current.loadMoreStep(false);
    });
    expect(result.current.isLoadingMore).toBe(false);
    expect(result.current.pendingLoadMoreRef.current).toBe(0);
    expect(result.current.autoLoadMore).toBe(false);
    expect(result.current.daysWindow).toBe(14);
    // L'utilisateur peut réessayer.
    mockGetNext.mockResolvedValue(new Date(2026, 9, 1));
    await act(async () => {
      await result.current.loadMoreStep(false);
    });
    expect(result.current.daysWindow).toBeGreaterThan(14);
  });

  it("« Voir plus » manuel (repas compris) : saute dès le premier appui à [E-14 j, fin]", async () => {
    const next = new Date(2026, 6, 1, 10, 0);
    mockGetNext.mockResolvedValue(next);
    const { result } = renderHook(() =>
      useHarness({ types: ["tetee", "biberon", "solide"] }),
    );
    await flush();
    await act(async () => {
      await result.current.loadMoreStep(false);
    });
    expect(mockGetNext).toHaveBeenCalledTimes(1);
    const { startOfRange, endOfRange } = computeRange(null, result.current.daysWindow);
    expect(endOfRange).toEqual(new Date(2026, 10, 7, 23, 59, 59, 999));
    expect(startOfRange).toEqual(new Date(2026, 5, 17, 0, 0, 0, 0));
  });

  it("auto épuisé (repas) : même saut [E-14 j, fin], les jours récents restent chargés", async () => {
    const next = new Date(2026, 6, 1, 10, 0);
    mockGetNext.mockResolvedValue(next);
    const { result } = renderHook(() => useHarness({}));
    await flush();

    await act(async () => {
      result.current.setAutoLoadMoreAttempts(MAX_AUTO_LOAD_ATTEMPTS - 1);
    });
    await act(async () => {
      await result.current.loadMoreStep(true);
    });
    expect(mockGetNext).toHaveBeenCalledTimes(1);
    expect(result.current.rangeEndDate).toBeNull();
    const { startOfRange, endOfRange } = computeRange(null, result.current.daysWindow);
    expect(endOfRange).toEqual(new Date(2026, 10, 7, 23, 59, 59, 999));
    expect(startOfRange).toEqual(new Date(2026, 5, 17, 0, 0, 0, 0)); // 1er juil. - 14 j
  });

  it("plus rien avant : hasMore false et fin du chargement", async () => {
    mockGetNext.mockResolvedValue(null);
    const { result } = renderHook(() => useHarness({}));
    await flush();
    await act(async () => {
      await result.current.loadMoreStep(false);
    });
    expect(result.current.hasMore).toBe(false);
    expect(result.current.isLoadingMore).toBe(false);
  });

  it("attend une réponse par écouteur (garde de version)", async () => {
    mockGetNext.mockResolvedValue(new Date(2026, 6, 1, 10, 0));
    const { result } = renderHook(() =>
      useHarness({ types: ["tetee", "biberon", "solide"] }),
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
      useHarness({ jumpToLatestOnMount: true }),
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
      initialProps: { loaded: false, groupsCount: 0 },
    });
    await flush();

    rerender({ loaded: true, groupsCount: 0 });
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
      useHarness({ loaded: true, groupsCount: 0, blocked: true }),
    );
    await flush();
    expect(result.current.autoLoadMore).toBe(false);
    expect(result.current.daysWindow).toBe(14);
  });

  it("s'arrête dès qu'un groupe apparaît", async () => {
    const { result, rerender } = renderHook((p: Props) => useHarness(p), {
      initialProps: { loaded: true, groupsCount: 0 },
    });
    await flush();
    expect(result.current.autoLoadMore).toBe(true);
    // Les données de la fenêtre élargie arrivent : un groupe, puis fin du chargement.
    rerender({ loaded: true, groupsCount: 2 });
    act(() => result.current.notifySnapshot(result.current.loadMoreVersionRef.current));
    await flush();
    expect(result.current.autoLoadMore).toBe(false);
    expect(result.current.autoLoadMoreAttempts).toBe(0);
  });
});
