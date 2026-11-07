import { render, screen } from "@testing-library/react-native";

import { GlobalFAB } from "@/components/suivibaby/GlobalFAB";

jest.mock("react-native-reanimated", () => {
  const { View } = require("react-native");
  return {
    __esModule: true,
    default: { View },
    Easing: { inOut: () => 0, ease: 0 },
    useAnimatedStyle: () => ({}),
    useSharedValue: (value: unknown) => ({ value }),
    withDelay: (_delay: number, value: unknown) => value,
    withRepeat: (value: unknown) => value,
    withSequence: (...values: unknown[]) => values[0],
    withSpring: (value: unknown) => value,
    withTiming: (value: unknown) => value,
  };
});
jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock("@/contexts/SheetContext", () => ({
  useSheetActions: () => ({ openSheet: jest.fn() }),
}));
jest.mock("@/hooks/use-color-scheme", () => ({ useColorScheme: () => "light" }));
jest.mock("@/hooks/useNightMode", () => ({
  useNightMode: () => ({
    isNightMode: false,
    minButtonSize: 44,
    animations: { decorative: false },
  }),
}));
jest.mock("expo-haptics", () => ({
  impactAsync: jest.fn(),
  ImpactFeedbackStyle: { Light: "light", Medium: "medium", Heavy: "heavy" },
}));
jest.mock("@expo/vector-icons/FontAwesome6", () => "FontAwesome6");
jest.mock("@expo/vector-icons/MaterialCommunityIcons", () => "MaterialCommunityIcons");

describe("GlobalFAB - accessibilité", () => {
  it("retire les actions et le fond de l'arbre d'accessibilité quand le menu est fermé", () => {
    render(<GlobalFAB isOpen={false} />);

    expect(screen.queryByRole("button", { name: "Repas" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Change" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Fermer le menu" })).toBeNull();
    // Le bouton principal reste atteignable et annonce son état.
    expect(
      screen.getByRole("button", {
        name: "Ouvrir les actions rapides",
        expanded: false,
      }),
    ).toBeTruthy();
  });

  it("expose les actions et le fond « Fermer le menu » quand il est ouvert", () => {
    render(<GlobalFAB isOpen />);

    expect(screen.getByRole("button", { name: "Repas" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Change" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Fermer le menu" })).toBeTruthy();
    expect(
      screen.getByRole("button", {
        name: "Fermer les actions rapides",
        expanded: true,
      }),
    ).toBeTruthy();
  });
});
