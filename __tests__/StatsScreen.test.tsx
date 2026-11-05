import { act, render } from "@testing-library/react-native";
import React from "react";

import { getStatsPerfCounters, resetStatsPerfCounters } from "@/utils/statsPerf";

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { buildStatsEvents } = require("../scripts/statsPerfFixtures.js");

// ---------------------------------------------------------------------------
// Mocks: the screen is rendered for real; Firestore listeners, navigation and
// the three charts are replaced. Chart doubles count their renders and mirror
// what the real charts do with their props (week callback on mount).
// ---------------------------------------------------------------------------

type Listener = { type: string; callback: (events: any[]) => void; options: any };
const mockListeners: Listener[] = [];

jest.mock("@/services/eventsService", () => ({
  ecouterEvenements: jest.fn((_childId: string, callback: any, options: any) => {
    const types = Array.isArray(options?.type) ? options.type.join(",") : options?.type;
    mockListeners.push({ type: types, callback, options });
    return jest.fn();
  }),
  obtenirEvenements: jest.fn(() => Promise.resolve([])),
}));
// eslint-disable-next-line @typescript-eslint/no-require-imports
const eventsService = require("@/services/eventsService");

// The global setup mocks Timestamp as a plain object; the screen uses instanceof.
jest.mock("firebase/firestore", () => ({
  Timestamp: class Timestamp {
    static fromDate(d: Date) {
      return { toDate: () => d, toMillis: () => d.getTime() };
    }
  },
}));

jest.mock("@/contexts/BabyContext", () => ({
  useBaby: () => ({ activeChild: { id: "child-1", name: "Léo" } }),
}));
jest.mock("@/hooks/use-color-scheme", () => ({ useColorScheme: () => "light" }));
jest.mock("@/hooks/useForegroundServerRefresh", () => ({ useForegroundServerRefresh: jest.fn() }));
jest.mock("expo-router", () => ({
  router: { replace: jest.fn() },
  useLocalSearchParams: () => ({}),
}));
// Focus effects run on mount and again on each simulated refocus.
const mockFocusEffects = new Set<{ current: () => void }>();
jest.mock("@react-navigation/native", () => {
  const { useEffect, useRef } = jest.requireActual("react");
  return {
    useFocusEffect: (effect: () => void) => {
      const ref = useRef(effect);
      ref.current = effect;
      useEffect(() => {
        mockFocusEffects.add(ref);
        return () => {
          mockFocusEffects.delete(ref);
        };
      }, []);
      useEffect(effect, [effect]);
    },
  };
});
function refocus() {
  act(() => {
    mockFocusEffects.forEach((ref) => ref.current());
  });
  act(() => {
    jest.advanceTimersByTime(200);
  });
}
jest.mock("@react-navigation/elements", () => ({ HeaderBackButton: () => null }));
jest.mock("@/app/(drawer)/_layout", () => ({
  useHeaderLeft: () => ({ setHeaderLeft: jest.fn() }),
}));
jest.mock("expo-haptics", () => ({ impactAsync: jest.fn(), ImpactFeedbackStyle: {} }));
jest.mock("expo-print", () => ({ printToFileAsync: jest.fn() }));
jest.mock("expo-sharing", () => ({ shareAsync: jest.fn() }));
jest.mock("@expo/vector-icons/FontAwesome6", () => "FontAwesome6");
jest.mock("@/components/ui/IconPulseDtos", () => ({ IconPulseDots: () => null }));
jest.mock("@/components/ui/Skeleton", () => ({ SkeletonBlock: () => null }));
jest.mock("react-native-pager-view", () => {
  const { forwardRef, useImperativeHandle } = jest.requireActual("react");
  const { View } = jest.requireActual("react-native");
  return forwardRef(({ children }: any, ref: any) => {
    useImperativeHandle(ref, () => ({ setPage: jest.fn(), setPageWithoutAnimation: jest.fn() }));
    return <View testID="pager">{children}</View>;
  });
});

const mockChartProps: Record<string, any> = {};
const mockChart = (name: string) => {
  const { memo, useEffect } = jest.requireActual("react");
  const { countStatsRender } = jest.requireActual("@/utils/statsPerf");
  const Chart = (props: any) => {
    const { onWeekChange } = props;
    mockChartProps[name] = props;
    countStatsRender(name);
    useEffect(() => {
      const d = new Date();
      d.setHours(0, 0, 0, 0);
      d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
      onWeekChange?.(d);
    }, [onWeekChange]);
    return null;
  };
  // The real charts are exported through React.memo.
  return { __esModule: true, default: memo(Chart) };
};
jest.mock("@/components/suivibaby/RepasChart", () => mockChart("RepasChart"));
jest.mock("@/components/suivibaby/PompagesChart", () => mockChart("PompagesChart"));
jest.mock("@/components/suivibaby/SommeilChart", () => mockChart("SommeilChart"));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const StatsScreen = require("@/app/(drawer)/baby/(tabs)/stats").default;

const history = buildStatsEvents({ total: 3000, days: 365, now: Date.now() });

/** Deliver each listener's snapshot separately, 100 ms apart, as on a device. */
function deliverSnapshotsOneByOne() {
  for (const listener of [...mockListeners]) {
    const types = listener.type.split(",");
    const since = listener.options?.depuis?.getTime() ?? -Infinity;
    act(() => {
      listener.callback(
        history.filter((e: any) => types.includes(e.type) && e.date.getTime() >= since),
      );
    });
    act(() => {
      jest.advanceTimersByTime(100);
    });
  }
}

beforeEach(() => {
  jest.useFakeTimers();
  mockListeners.length = 0;
  for (const key of Object.keys(mockChartProps)) delete mockChartProps[key];
  resetStatsPerfCounters();
  eventsService.ecouterEvenements.mockClear();
  eventsService.obtenirEvenements.mockClear();
  eventsService.obtenirEvenements.mockImplementation(() => Promise.resolve([]));
});

afterEach(() => {
  jest.useRealTimers();
});

function openAndLoad(ui = <StatsScreen />) {
  const utils = render(ui);
  act(() => {
    jest.advanceTimersByTime(10); // InteractionManager: charts allowed to mount
  });
  deliverSnapshotsOneByOne();
  act(() => {
    jest.advanceTimersByTime(1000);
  });
  return utils;
}

describe("StatsScreen loading", () => {
  it("renders each chart once or twice while loading", () => {
    openAndLoad();

    const counters = getStatsPerfCounters();
    // Figures for docs/STATS_PERF_REFONTE.md ("Mesures").
    console.log(
      `[stats-renders] listeners=${mockListeners.length} screen=${counters.StatsScreen} ` +
        `repas=${counters.RepasChart ?? 0} pompages=${counters.PompagesChart ?? 0} sommeil=${counters.SommeilChart ?? 0}`,
    );
    // Active chart first; the two other tabs are pre-mounted once, after it.
    expect(counters.RepasChart).toBeGreaterThan(0);
    expect(counters.RepasChart).toBeLessThanOrEqual(2);
    expect(counters.PompagesChart ?? 0).toBeLessThanOrEqual(1);
    expect(counters.SommeilChart ?? 0).toBeLessThanOrEqual(1);
    // 21 before sprint 2, 16 with 5 listeners; each snapshot costs two renders (count, then merge).
    expect(counters.StatsScreen).toBeLessThanOrEqual(12);
  });

  it("shows each resume card as soon as its own data is there", () => {
    const { getByText, queryByText } = render(<StatsScreen />);
    act(() => {
      jest.advanceTimersByTime(10);
    });
    const sommeil = mockListeners.find((l) => l.type === "sommeil")!;
    act(() => {
      sommeil.callback([{ id: "s1", type: "sommeil", date: new Date(), isNap: true }]);
    });
    act(() => {
      jest.advanceTimersByTime(100);
    });
    // Sleep is ready (1 this week) while meals and pumping are still loading.
    expect(getByText("1")).toBeTruthy();
    expect(queryByText("0")).toBeNull();
  });

  it("does not re-render when the screen regains focus without new data", () => {
    openAndLoad();
    const before = getStatsPerfCounters().StatsScreen;
    refocus();
    refocus();
    expect(getStatsPerfCounters().StatsScreen).toBe(before);
  });
});

describe("StatsScreen data window (sprint 3)", () => {
  it("listens to 3 sources, from the Monday two weeks before the current week", () => {
    render(<StatsScreen />);
    expect(mockListeners.map((l) => l.type)).toEqual(["tetee,biberon,solide", "pompage", "sommeil"]);
    const since: Date = mockListeners[0].options.depuis;
    expect(since.getDay()).toBe(1);
    const expected = new Date();
    expected.setHours(0, 0, 0, 0);
    expected.setDate(expected.getDate() - ((expected.getDay() + 6) % 7) - 14);
    expect(since.getTime()).toBe(expected.getTime());
  });

  it("fetches older weeks once when a chart navigates back", async () => {
    openAndLoad();
    const older = new Date();
    older.setDate(older.getDate() - 70);
    await act(async () => {
      mockChartProps.RepasChart.onWeekChange(older);
    });
    const calls = eventsService.obtenirEvenements.mock.calls.filter((c: any[]) => c[1]?.jusqu && !c[1]?.limite);
    expect(calls).toHaveLength(1);
    expect(calls[0][1].depuis.getTime()).toBeLessThanOrEqual(older.getTime());
    expect(calls[0][1].jusqu.getTime()).toBe(mockListeners[0].options.depuis.getTime() - 1);
  });

  it("probes for one older event when the window is empty", async () => {
    render(<StatsScreen />);
    const pompage = mockListeners.find((l) => l.type === "pompage")!;
    await act(async () => {
      pompage.callback([]);
    });
    const probe = eventsService.obtenirEvenements.mock.calls.find((c: any[]) => c[1]?.limite === 1);
    expect(probe[1].type).toEqual(["pompage"]);
    expect(probe[1].jusqu.getTime()).toBe(pompage.options.depuis.getTime() - 1);
  });

  it("pull-to-refresh reads the server once and keeps the listeners", async () => {
    const { UNSAFE_getAllByType } = openAndLoad();
    const { RefreshControl } = jest.requireActual("react-native");
    const listenersBefore = eventsService.ecouterEvenements.mock.calls.length;
    await act(async () => {
      await UNSAFE_getAllByType(RefreshControl)[0].props.onRefresh();
    });
    expect(eventsService.ecouterEvenements.mock.calls.length).toBe(listenersBefore);
    const serverCalls = eventsService.obtenirEvenements.mock.calls.filter((c: any[]) => c[1]?.source === "server");
    expect(serverCalls).toHaveLength(1);
  });

  it("says when older weeks could not be loaded, and retries on demand", async () => {
    const { findByText } = openAndLoad();
    eventsService.obtenirEvenements.mockImplementation(() => Promise.reject(new Error("offline")));
    const older = new Date();
    older.setDate(older.getDate() - 70);
    await act(async () => {
      mockChartProps.RepasChart.onWeekChange(older);
    });
    const note = await findByText("Semaines précédentes indisponibles · Réessayer");
    const before = eventsService.obtenirEvenements.mock.calls.length;
    eventsService.obtenirEvenements.mockImplementation(() => Promise.resolve([]));
    const { fireEvent } = jest.requireActual("@testing-library/react-native");
    await act(async () => {
      fireEvent.press(note);
    });
    expect(eventsService.obtenirEvenements.mock.calls.length).toBe(before + 1);
  });

  it("says when pull-to-refresh failed and keeps the data", async () => {
    const { UNSAFE_getAllByType, findByText } = openAndLoad();
    const { RefreshControl } = jest.requireActual("react-native");
    eventsService.obtenirEvenements.mockImplementation(() => Promise.reject(new Error("offline")));
    await act(async () => {
      await UNSAFE_getAllByType(RefreshControl)[0].props.onRefresh();
    });
    expect(await findByText("Actualisation impossible, données non mises à jour")).toBeTruthy();
  });

  it("a late server read does not overwrite a newer listener snapshot", async () => {
    const { UNSAFE_getAllByType } = openAndLoad();
    const { RefreshControl } = jest.requireActual("react-native");
    let resolveRead: (events: any[]) => void = () => {};
    eventsService.obtenirEvenements.mockImplementation(
      () => new Promise((resolve) => (resolveRead = resolve)),
    );
    let refreshDone: Promise<void> = Promise.resolve();
    act(() => {
      refreshDone = UNSAFE_getAllByType(RefreshControl)[0].props.onRefresh();
    });
    act(() => {
      jest.advanceTimersByTime(3000); // let the sleep tab pre-mount in the background
    });
    // A new sleep arrives through the listener while the read is pending.
    const sommeil = mockListeners.find((l) => l.type === "sommeil")!;
    const fresh = { id: "new-sleep", type: "sommeil", date: new Date(), isNap: true };
    act(() => {
      sommeil.callback([fresh]);
    });
    act(() => {
      jest.advanceTimersByTime(200);
    });
    await act(async () => {
      resolveRead([]); // stale: does not contain the new sleep
      await refreshDone;
    });
    act(() => {
      jest.advanceTimersByTime(200);
    });
    expect(mockChartProps.SommeilChart.sommeils.map((e: any) => e.id)).toContain("new-sleep");
  });
});
