import React from "react";
import { act, render } from "@testing-library/react-native";

import { StatsGroup } from "@/components/suivibaby/dashboard/StatsGroup";
import { RecentEventsList } from "@/components/suivibaby/dashboard/RecentEventsList";
import { useCalendarDay } from "@/hooks/useMinuteTick";

// Reanimated 4 ne s'initialise pas sous Jest (jest-expo 58).
jest.mock("react-native-gesture-handler/ReanimatedSwipeable", () => ({
  __esModule: true,
  default: ({ children }: { children: unknown }) => children,
}));
jest.mock("expo-haptics", () => ({
  impactAsync: jest.fn(),
  ImpactFeedbackStyle: { Light: "light" },
}));

describe("S7.6 - tick à la minute isolé dans les widgets", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date("2026-11-07T10:00:30"));
  });
  afterEach(() => jest.useRealTimers());

  it("le parent qui porte StatsGroup ne se re-rend pas à chaque minute, le widget oui", () => {
    let parentRenders = 0;
    const lastTs = new Date("2026-11-07T09:55:00").getTime();
    const Parent = () => {
      parentRenders += 1;
      const day = useCalendarDay();
      return (
        <StatsGroup
          title="Alimentation"
          icon="utensils"
          color="#000"
          summary="1 repas"
          items={[]}
          timeSinceTimestamp={lastTs}
          warnings={[{ timestamp: lastTs, thresholdMs: 10 * 60 * 1000 }]}
        />
      );
    };
    const { getByText, queryByText } = render(<Parent />);
    const rendersAfterMount = parentRenders;
    expect(getByText("il y a 5\u00A0min")).toBeTruthy();

    act(() => {
      jest.advanceTimersByTime(3 * 60 * 1000);
    });

    // 3 minutes plus tard : l'affichage a avancé, pas le parent.
    expect(queryByText("il y a 5\u00A0min")).toBeNull();
    expect(getByText("il y a 8\u00A0min")).toBeTruthy();
    expect(parentRenders).toBe(rendersAfterMount);
  });

  it("RecentEventsList applique la fenêtre de 24 h avec son propre tick", () => {
    const base = { type: "tetee", id: "x" } as any;
    const events = [
      { ...base, id: "a", date: new Date("2026-11-07T09:00:00") },
      { ...base, id: "b", date: new Date("2026-11-06T10:30:00") },
    ];
    const buildDetails = jest.fn(() => undefined);
    render(
      <RecentEventsList
        events={events}
        loading={false}
        showHint={false}
        colorScheme="light"
        cutoffHours={24}
        maxEvents={7}
        onViewAllPress={() => {}}
        toDate={(v) => new Date(v)}
        formatTime={(d) => d.toISOString().slice(11, 16)}
        formatDuration={() => ""}
        buildDetails={buildDetails}
        getDayLabel={() => ""}
      />,
    );
    // 10:00:30 le 7 : l'événement du 6 à 10:30 est dans la fenêtre.
    const firstIds = buildDetails.mock.calls.map((c: any[]) => c[0].id);
    expect(firstIds).toEqual(expect.arrayContaining(["a", "b"]));

    buildDetails.mockClear();
    act(() => {
      jest.advanceTimersByTime(31 * 60 * 1000);
    });
    // 10:31 : l'événement du 6 à 10:30 est sorti de la fenêtre 24 h.
    const calledIds = buildDetails.mock.calls.map((c: any[]) => c[0].id);
    expect(calledIds).not.toContain("b");
    expect(calledIds).toContain("a");
  });
});
