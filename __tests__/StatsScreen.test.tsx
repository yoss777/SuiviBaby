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
jest.mock("@react-navigation/native", () => {
  const { useEffect } = jest.requireActual("react");
  return { useFocusEffect: (effect: () => void) => useEffect(effect, [effect]) };
});
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

const mockChart = (name: string) => {
  const { memo, useEffect } = jest.requireActual("react");
  const { countStatsRender } = jest.requireActual("@/utils/statsPerf");
  const Chart = ({ onWeekChange }: any) => {
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
    act(() => {
      listener.callback(history.filter((e: any) => types.includes(e.type)));
    });
    act(() => {
      jest.advanceTimersByTime(100);
    });
  }
}

beforeEach(() => {
  jest.useFakeTimers();
  mockListeners.length = 0;
  resetStatsPerfCounters();
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
  it("renders only the active tab's chart, a bounded number of times", () => {
    openAndLoad();

    const counters = getStatsPerfCounters();
    // Figures for docs/STATS_PERF_REFONTE.md ("Mesures").
    console.log(
      `[stats-renders] listeners=${mockListeners.length} screen=${counters.StatsScreen} ` +
        `repas=${counters.RepasChart ?? 0} pompages=${counters.PompagesChart ?? 0} sommeil=${counters.SommeilChart ?? 0}`,
    );
    expect(counters.RepasChart).toBeGreaterThan(0);
    expect(counters.RepasChart).toBeLessThanOrEqual(2);
    expect(counters.PompagesChart ?? 0).toBe(0);
    expect(counters.SommeilChart ?? 0).toBe(0);
    // 21 before sprint 2; each snapshot still costs two renders (count, then merge).
    expect(counters.StatsScreen).toBeLessThanOrEqual(14);
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
    act(() => {
      jest.advanceTimersByTime(1000);
    });
    expect(getStatsPerfCounters().StatsScreen).toBe(before);
  });
});
