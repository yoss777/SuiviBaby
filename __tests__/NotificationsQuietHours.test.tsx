import { act, fireEvent, render, screen } from "@testing-library/react-native";
import React from "react";

import NotificationsScreen from "@/app/settings/notifications";

const mockShowToast = jest.fn();
const mockShowActionToast = jest.fn();
const mockObtenir = jest.fn();
const mockMettreAJour = jest.fn();

jest.mock("expo-router", () => ({ Stack: { Screen: () => null } }));
jest.mock("@/contexts/ToastContext", () => ({
  useToast: () => ({ showToast: mockShowToast, showActionToast: mockShowActionToast }),
}));
jest.mock("@/hooks/use-color-scheme", () => ({ useColorScheme: () => "light" }));
jest.mock("@/services/pushTokenService", () => ({
  isDevicePushEnabled: jest.fn(() => Promise.resolve(true)),
  setDevicePushEnabled: jest.fn(() => Promise.resolve()),
}));
jest.mock("@/services/userPreferencesService", () => ({
  obtenirPreferencesNotifications: (...a: unknown[]) => mockObtenir(...a),
  mettreAJourPreferencesNotifications: (...a: unknown[]) => mockMettreAJour(...a),
}));
jest.mock("expo-notifications", () => ({
  getPermissionsAsync: jest.fn(() => Promise.resolve({ status: "granted" })),
  requestPermissionsAsync: jest.fn(() => Promise.resolve({ status: "granted" })),
}));
jest.mock("expo-haptics", () => ({
  impactAsync: jest.fn(),
  ImpactFeedbackStyle: { Light: "light" },
}));
jest.mock("@react-native-picker/picker", () => {
  const Picker = Object.assign(function Picker() { return null; }, {
    Item: function PickerItem() { return null; },
  });
  return { Picker };
});
// Sélecteur d'heure réel remplacé : un bouton qui « choisit » l'heure demandée.
let mockPicked: Record<string, Date> = {};
jest.mock("@/components/ui/DateTimePickerRow", () => {
  const { Pressable, Text } = jest.requireActual("react-native");
  return {
    DateTimePickerRow: ({ label, value, onChange, accessibilityLabel }: any) => (
      <Pressable
        testID={`time-${label}`}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel ?? label}
        onPress={() => onChange(mockPicked[label] ?? value)}
      >
        <Text>{`${label} ${String(value.getHours()).padStart(2, "0")}:${String(value.getMinutes()).padStart(2, "0")}`}</Text>
      </Pressable>
    ),
  };
});

const stored = (quietHours?: object) => ({
  push: true, email: false, updates: true, tips: true, insights: true, correlations: true, marketing: false,
  reminders: {
    enabled: true,
    thresholds: { repas: 3, pompages: 0, changes: 0, vitamines: 0 },
    ...(quietHours ? { quietHours } : {}),
  },
});
const defaultQh = { enabled: true, start: "22:00", end: "07:00", timeZone: "Europe/Paris" };

async function renderScreen(prefs = stored(defaultQh)) {
  mockObtenir.mockResolvedValue(prefs);
  render(<NotificationsScreen />);
  await screen.findByText("Pas de rappels la nuit");
}
const savedQuietHours = () => mockMettreAJour.mock.calls.at(-1)?.[0].reminders.quietHours;
const at = (h: number, m: number) => new Date(2026, 5, 15, h, m);

describe("réglage « Pas de rappels la nuit »", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    mockMettreAJour.mockResolvedValue(true);
    mockPicked = {};
  });
  afterEach(() => jest.useRealTimers());

  it("affiche par défaut l'option activée de 22:00 à 07:00", async () => {
    await renderScreen(stored(undefined) as never);
    // Valeur par défaut venant du service : champ absent, le composant utilise le défaut.
    expect(screen.getByRole("switch", { name: "Pas de rappels la nuit" }).props.value).toBe(true);
    expect(screen.getByText("Début 22:00")).toBeTruthy();
    expect(screen.getByText("Fin 07:00")).toBeTruthy();
    expect(screen.getByText(/entre 22:00 et 07:00/)).toBeTruthy();
  });

  it("affiche les heures enregistrées", async () => {
    await renderScreen(stored({ ...defaultQh, start: "21:30", end: "06:15" }));
    expect(screen.getByText("Début 21:30")).toBeTruthy();
    expect(screen.getByText("Fin 06:15")).toBeTruthy();
  });

  it("désactivé : les sélecteurs d'heure disparaissent, l'état est enregistré", async () => {
    await renderScreen();
    await act(async () => {
      fireEvent(screen.getByRole("switch", { name: "Pas de rappels la nuit" }), "valueChange", false);
    });
    expect(savedQuietHours()).toMatchObject({ enabled: false, start: "22:00", end: "07:00" });
    expect(screen.queryByTestId("time-Début")).toBeNull();
    expect(screen.queryByTestId("time-Fin")).toBeNull();
    expect(mockShowToast).toHaveBeenCalled();
  });

  it("modifier l'heure de début : enregistré après un court délai, avec le fuseau de l'appareil", async () => {
    await renderScreen();
    mockPicked["Début"] = at(23, 15);
    fireEvent.press(screen.getByTestId("time-Début"));
    expect(screen.getByText("Début 23:15")).toBeTruthy();
    expect(mockMettreAJour).not.toHaveBeenCalled(); // pas une écriture par cran du sélecteur
    await act(async () => { jest.advanceTimersByTime(1000); });
    expect(savedQuietHours()).toMatchObject({ enabled: true, start: "23:15", end: "07:00" });
    expect(typeof savedQuietHours().timeZone).toBe("string");
  });

  it("plusieurs changements rapprochés : une seule écriture, la dernière valeur", async () => {
    await renderScreen();
    mockPicked["Fin"] = at(6, 0);
    fireEvent.press(screen.getByTestId("time-Fin"));
    mockPicked["Fin"] = at(6, 30);
    fireEvent.press(screen.getByTestId("time-Fin"));
    await act(async () => { jest.advanceTimersByTime(1000); });
    expect(mockMettreAJour).toHaveBeenCalledTimes(1);
    expect(savedQuietHours()).toMatchObject({ end: "06:30" });
  });

  it("l'écriture conserve l'état des rappels et les seuils", async () => {
    await renderScreen();
    mockPicked["Fin"] = at(8, 0);
    fireEvent.press(screen.getByTestId("time-Fin"));
    await act(async () => { jest.advanceTimersByTime(1000); });
    const arg = mockMettreAJour.mock.calls[0][0];
    expect(arg.reminders.enabled).toBe(true);
    expect(arg.reminders.thresholds.repas).toBe(3);
  });

  it("début == fin : explique que les rappels restent actifs", async () => {
    await renderScreen();
    mockPicked["Fin"] = at(22, 0);
    fireEvent.press(screen.getByTestId("time-Fin"));
    expect(screen.getByText(/aucune pause/i)).toBeTruthy();
  });

  it("échec d'enregistrement : valeur précédente restaurée et toast avec relance", async () => {
    await renderScreen();
    mockMettreAJour.mockRejectedValueOnce(new Error("offline"));
    await act(async () => {
      fireEvent(screen.getByRole("switch", { name: "Pas de rappels la nuit" }), "valueChange", false);
    });
    expect(screen.getByRole("switch", { name: "Pas de rappels la nuit" }).props.value).toBe(true);
    expect(mockShowActionToast).toHaveBeenCalledWith(expect.any(String), "Réessayer", expect.any(Function));
  });

  it("quitter l'écran avec une heure en attente l'enregistre", async () => {
    await renderScreen();
    mockPicked["Début"] = at(21, 0);
    fireEvent.press(screen.getByTestId("time-Début"));
    expect(mockMettreAJour).not.toHaveBeenCalled();
    screen.unmount();
    expect(savedQuietHours()).toMatchObject({ start: "21:00" });
  });

  it("le libellé accessible des sélecteurs nomme le début et la fin", async () => {
    await renderScreen();
    expect(screen.getByLabelText("Début des heures calmes")).toBeTruthy();
    expect(screen.getByLabelText("Fin des heures calmes")).toBeTruthy();
  });
});
