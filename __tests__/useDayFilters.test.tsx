/* eslint-disable import/first */
// Sprint 13.2 : filtres jour / calendrier des écrans de liste.

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
jest.mock("expo-haptics", () => ({ impactAsync: jest.fn(), ImpactFeedbackStyle: {} }));

import { act, renderHook } from "@testing-library/react-native";

import { useDayFilters } from "@/hooks/eventList/useDayFilters";

const NOW = new Date(2026, 10, 7, 15, 0, 0);
const items = [{ date: new Date(2026, 10, 7, 9) }, { date: { seconds: Math.floor(new Date(2026, 10, 2, 9).getTime() / 1000) } }];

function refocus() {
  act(() => {
    mockFocusEffects.forEach((ref) => ref.current());
  });
}

beforeEach(() => {
  jest.useFakeTimers();
  jest.setSystemTime(NOW);
  mockFocusEffects.clear();
});
afterEach(() => jest.useRealTimers());

const setup = (resetToTodayOnFocus = false) =>
  renderHook(() => useDayFilters({ items, tint: "#123", resetToTodayOnFocus }));

describe("useDayFilters", () => {
  it("applique « aujourd'hui » au focus et déplie le jour", () => {
    const { result } = setup();
    expect(result.current.selectedFilter).toBe("today");
    expect(result.current.selectedDate).toBeNull();
    expect([...result.current.expandedDays]).toEqual(["2026-11-07"]);
  });

  it("« passé » replie tout et est conservé au retour (pompages, repas)", () => {
    const { result } = setup(false);
    act(() => result.current.handleFilterPress("past"));
    expect(result.current.selectedFilter).toBe("past");
    expect(result.current.expandedDays.size).toBe(0);
    refocus();
    expect(result.current.selectedFilter).toBe("past");
  });

  it("couches : retour à « aujourd'hui » au focus même depuis « passé »", () => {
    const { result } = setup(true);
    act(() => result.current.handleFilterPress("past"));
    refocus();
    expect(result.current.selectedFilter).toBe("today");
  });

  it("choisir un jour dans le calendrier le sélectionne et le déplie", () => {
    const { result } = setup();
    act(() => result.current.handleCalendarPress());
    expect(result.current.showCalendar).toBe(true);
    expect(result.current.selectedDate).toBe("2026-11-07");
    expect(result.current.selectedFilter).toBeNull();

    act(() => result.current.handleDateSelect({ dateString: "2026-11-02" } as any));
    expect(result.current.showCalendar).toBe(false);
    expect(result.current.selectedDate).toBe("2026-11-02");
    expect([...result.current.expandedDays]).toEqual(["2026-11-02"]);

    act(() => result.current.clearSelectedDate());
    expect(result.current.selectedDate).toBeNull();
    expect(result.current.selectedFilter).toBe("today");
  });

  it("marque les jours ayant des événements et la date choisie", () => {
    const { result } = setup();
    expect(result.current.markedDates["2026-11-07"]).toEqual({ marked: true, dotColor: "#123" });
    expect(result.current.markedDates["2026-11-02"]).toEqual({ marked: true, dotColor: "#123" });
    act(() => result.current.handleDateSelect({ dateString: "2026-11-02" } as any));
    expect(result.current.markedDates["2026-11-02"]).toEqual({
      marked: true,
      dotColor: "#123",
      selected: true,
      selectedColor: "#123",
    });
  });

  it("toggleExpand ouvre puis ferme un jour", () => {
    const { result } = setup();
    act(() => result.current.toggleExpand("2026-11-02"));
    expect(result.current.expandedDays.has("2026-11-02")).toBe(true);
    act(() => result.current.toggleExpand("2026-11-02"));
    expect(result.current.expandedDays.has("2026-11-02")).toBe(false);
  });
});
