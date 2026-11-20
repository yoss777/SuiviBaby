// Écran Thème : interrupteur « Sombre la nuit », messages, échec d'écriture.
import { act, fireEvent, render } from "@testing-library/react-native";
import React from "react";

const mockShowToast = jest.fn();
jest.mock("@/contexts/ToastContext", () => ({ useToast: () => ({ showToast: mockShowToast }) }));
jest.mock("expo-haptics", () => ({ impactAsync: jest.fn(), ImpactFeedbackStyle: { Light: "light" } }));
jest.mock("expo-router", () => ({ Stack: { Screen: () => null } }));
jest.mock("react-native-safe-area-context", () => ({ SafeAreaView: ({ children }: any) => children }));
jest.mock("@/components/ui/Skeleton", () => ({ SkeletonList: () => null }));
jest.mock("@expo/vector-icons", () => ({ Ionicons: () => null }));
jest.mock("@/components/themed-text", () => {
  const { Text } = require("react-native");
  return { ThemedText: (p: any) => <Text {...p} /> };
});
jest.mock("@/components/ui/InfoModal", () => {
  const { Text } = require("react-native");
  return { InfoModal: ({ visible, message }: any) => (visible ? <Text>{message}</Text> : null) };
});

const mockTheme = {
  preference: "light" as "light" | "dark" | "auto",
  isLoading: false,
  darkAtNight: true,
  setPreference: jest.fn(() => Promise.resolve()),
  setDarkAtNight: jest.fn(() => Promise.resolve()),
};
jest.mock("@/contexts/ThemeContext", () => ({
  useThemePreference: () => mockTheme,
  ThemeContext: require("react").createContext(null),
}));

import ThemeScreen from "@/app/settings/theme";

beforeEach(() => {
  jest.clearAllMocks();
  mockTheme.preference = "light";
  mockTheme.darkAtNight = true;
  mockTheme.setDarkAtNight = jest.fn(() => Promise.resolve());
});

describe("écran Thème", () => {
  it("couper l'interrupteur : enregistre et confirme", async () => {
    const ui = render(<ThemeScreen />);
    const sw = ui.getByLabelText("Sombre la nuit, de 22 h à 7 h");
    await act(async () => {
      fireEvent(sw, "valueChange", false);
    });
    expect(mockTheme.setDarkAtNight).toHaveBeenCalledWith(false);
    expect(mockShowToast).toHaveBeenCalledWith("Sombre la nuit désactivé");
  });

  it("échec d'écriture : message d'erreur, pas de confirmation", async () => {
    mockTheme.setDarkAtNight = jest.fn(() => Promise.reject(new Error("offline")));
    const ui = render(<ThemeScreen />);
    await act(async () => {
      fireEvent(ui.getByLabelText("Sombre la nuit, de 22 h à 7 h"), "valueChange", false);
    });
    expect(ui.getByText("Impossible d'enregistrer. Votre choix précédent est rétabli.")).toBeTruthy();
    expect(mockShowToast).not.toHaveBeenCalled();
  });

  it("choisir Automatique : message qui dit que l'interrupteur est activé", async () => {
    const ui = render(<ThemeScreen />);
    await act(async () => {
      fireEvent.press(ui.getByLabelText(/^Automatique : /));
    });
    expect(mockTheme.setPreference).toHaveBeenCalledWith("auto");
    expect(mockShowToast).toHaveBeenCalledWith("Thème Automatique, sombre la nuit activé");
  });

  it("thème Sombre : pas d'interrupteur, une phrase à la place", () => {
    mockTheme.preference = "dark";
    const ui = render(<ThemeScreen />);
    expect(ui.queryByLabelText("Sombre la nuit, de 22 h à 7 h")).toBeNull();
    expect(ui.getByText("Le thème Sombre est déjà sombre à toute heure.")).toBeTruthy();
  });

  it("les descriptions suivent l'interrupteur", () => {
    mockTheme.darkAtNight = false;
    const ui = render(<ThemeScreen />);
    expect(ui.getByLabelText("Clair : Clair à toute heure")).toBeTruthy();
  });
});
