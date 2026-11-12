/* eslint-disable import/first */
// Animations décoratives en boucle : coupées la nuit (22 h – 7 h) et avec
// « Réduire les animations » (audit UI/UX V2, R-P1-15).

const mockWithRepeat = jest.fn((value: unknown) => value);
const mockCancelAnimation = jest.fn();
jest.mock("react-native-reanimated", () => {
  const { View } = require("react-native");
  return {
    __esModule: true,
    default: { View },
    Easing: { inOut: () => 0, ease: 0 },
    cancelAnimation: (...args: unknown[]) => mockCancelAnimation(...args),
    useAnimatedStyle: () => ({}),
    useSharedValue: (value: unknown) => ({ value }),
    withRepeat: (value: unknown) => mockWithRepeat(value),
    withSequence: (...values: unknown[]) => values[0],
    withTiming: (value: unknown) => value,
    useReducedMotion: () => false,
  };
});
let mockReduceMotion = false;
jest.mock("@/hooks/useReduceMotion", () => ({
  useReduceMotion: () => mockReduceMotion,
}));

import { render } from "@testing-library/react-native";
import React from "react";

import { PulsingAura } from "@/components/moments/PulsingAura";
import { ThemeContext } from "@/contexts/ThemeContext";
import { isNightHour, shouldRunDecorativeLoop } from "@/utils/decorativeMotion";

function renderAura(isNightMode: boolean) {
  const value = {
    preference: "auto",
    resolvedColorScheme: "light",
    isNightMode,
    isLoading: false,
    setPreference: async () => {},
  } as unknown as React.ContextType<typeof ThemeContext>;
  return render(
    <ThemeContext.Provider value={value}>
      <PulsingAura color="#E8785A" />
    </ThemeContext.Provider>,
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  mockReduceMotion = false;
});

describe("shouldRunDecorativeLoop", () => {
  it("tourne seulement le jour, sans Réduire les animations", () => {
    expect(shouldRunDecorativeLoop({ isNightMode: false, reduceMotion: false })).toBe(true);
    expect(shouldRunDecorativeLoop({ isNightMode: true, reduceMotion: false })).toBe(false);
    expect(shouldRunDecorativeLoop({ isNightMode: false, reduceMotion: true })).toBe(false);
    expect(shouldRunDecorativeLoop({ isNightMode: true, reduceMotion: true })).toBe(false);
  });

  it("isNightHour : 22 h – 7 h", () => {
    const at = (h: number, m = 0) => new Date(2026, 10, 12, h, m);
    expect(isNightHour(at(21, 59))).toBe(false);
    expect(isNightHour(at(22))).toBe(true);
    expect(isNightHour(at(3))).toBe(true);
    expect(isNightHour(at(6, 59))).toBe(true);
    expect(isNightHour(at(7))).toBe(false);
  });
});

describe("PulsingAura", () => {
  it("pulse le jour", () => {
    renderAura(false);
    expect(mockWithRepeat).toHaveBeenCalledTimes(4);
  });

  it("reste statique la nuit (22 h – 7 h)", () => {
    renderAura(true);
    expect(mockWithRepeat).not.toHaveBeenCalled();
    expect(mockCancelAnimation).toHaveBeenCalled();
  });

  it("reste statique avec Réduire les animations", () => {
    mockReduceMotion = true;
    renderAura(false);
    expect(mockWithRepeat).not.toHaveBeenCalled();
  });

  it("s'arrête quand la nuit tombe", () => {
    const { rerender } = renderAura(false);
    expect(mockWithRepeat).toHaveBeenCalledTimes(4);
    mockWithRepeat.mockClear();
    const night = {
      preference: "auto",
      resolvedColorScheme: "dark",
      isNightMode: true,
      isLoading: false,
      setPreference: async () => {},
    } as unknown as React.ContextType<typeof ThemeContext>;
    rerender(
      <ThemeContext.Provider value={night}>
        <PulsingAura color="#E8785A" />
      </ThemeContext.Provider>,
    );
    expect(mockWithRepeat).not.toHaveBeenCalled();
    expect(mockCancelAnimation).toHaveBeenCalled();
  });
});
