/* eslint-disable import/first */
// Écran d'export : le chargement lourd attend la fin de la transition et
// ignore les résultats si l'écran est démonté entre-temps.
const mockRunAfter = jest.fn();
const mockGetAccessDoc = jest.fn();
const mockGetEvents = jest.fn();
const mockPrefs = jest.fn();

jest.mock("@expo/vector-icons", () => ({ Ionicons: () => null, MaterialCommunityIcons: () => null, FontAwesome6: () => null }));
jest.mock("@expo/vector-icons/FontAwesome6", () => ({ __esModule: true, default: () => null }));
jest.mock("@/hooks/use-color-scheme", () => ({ useColorScheme: () => "light" }));
jest.mock("expo-router", () => ({
  Stack: { Screen: () => null },
  useFocusEffect: jest.fn(),
  useLocalSearchParams: () => ({}),
  useRouter: () => ({ back: jest.fn(), replace: jest.fn(), push: jest.fn() }),
}));
jest.mock("@/contexts/ToastContext", () => ({
  useToast: () => ({ showToast: jest.fn(), showActionToast: jest.fn() }),
}));
jest.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ userName: "Test", email: "t@t.fr", user: { uid: "u1" } }),
}));
const mockChildren = [{ id: "c1", name: "Léo" }];
jest.mock("@/contexts/BabyContext", () => ({
  useBaby: () => ({ children: mockChildren, loading: false }),
}));
jest.mock("@/services/accessRepository", () => ({
  getAccessDoc: (...a: unknown[]) => mockGetAccessDoc(...a),
}));
jest.mock("@/services/childRepository", () => ({
  getChildDoc: jest.fn(() => Promise.resolve(null)),
}));
jest.mock("@/services/eventsRepository", () => ({
  getEventsForExport: (...a: unknown[]) => mockGetEvents(...a),
  getLikesForExport: jest.fn(() => Promise.resolve({ docs: [] })),
  getCommentsForExport: jest.fn(() => Promise.resolve({ docs: [] })),
}));
jest.mock("@/services/userPreferencesService", () => ({
  obtenirPreferences: (...a: unknown[]) => mockPrefs(...a),
}));
jest.mock("@/services/tempShareService", () => ({
  deleteTempFile: jest.fn(),
  prepareExportFile: jest.fn(),
  shareTempFile: jest.fn(),
}));

import { act, render } from "@testing-library/react-native";
import React from "react";
import { InteractionManager } from "react-native";

import ExportScreen from "@/app/settings/export";

describe("ExportScreen : chargement différé", () => {
  let cancel: jest.Mock;
  beforeEach(() => {
    jest.clearAllMocks();
    cancel = jest.fn();
    mockRunAfter.mockImplementation(() => ({ cancel }));
    jest.spyOn(InteractionManager, "runAfterInteractions").mockImplementation(((cb: () => void) =>
      mockRunAfter(cb)) as never);
    mockGetAccessDoc.mockResolvedValue(null);
    mockGetEvents.mockResolvedValue({ docs: [] });
    mockPrefs.mockResolvedValue(null);
  });
  afterEach(() => jest.restoreAllMocks());

  it("ne lit rien avant la fin de la transition", () => {
    render(<ExportScreen />);
    expect(mockRunAfter).toHaveBeenCalledTimes(1);
    expect(mockGetAccessDoc).not.toHaveBeenCalled();
    expect(mockGetEvents).not.toHaveBeenCalled();
    expect(mockPrefs).not.toHaveBeenCalled();
  });

  it("lance les lectures une fois la transition terminée", async () => {
    render(<ExportScreen />);
    await act(async () => {
      mockRunAfter.mock.calls[0][0]();
    });
    expect(mockGetAccessDoc).toHaveBeenCalledWith("c1", "u1");
    expect(mockGetEvents).toHaveBeenCalled();
  });

  it("annule la tâche différée au démontage", () => {
    const { unmount } = render(<ExportScreen />);
    unmount();
    expect(cancel).toHaveBeenCalledTimes(1);
  });

  it("n'applique aucun résultat et n'enchaîne pas les lectures après démontage", async () => {
    let resolveAccess: (v: unknown) => void = () => {};
    mockGetAccessDoc.mockReturnValue(new Promise((r) => (resolveAccess = r)));
    const errorSpy = jest.spyOn(console, "error").mockImplementation(() => {});
    const { unmount } = render(<ExportScreen />);
    await act(async () => {
      mockRunAfter.mock.calls[0][0]();
    });
    unmount();
    await act(async () => {
      resolveAccess(null);
    });
    expect(mockGetEvents).not.toHaveBeenCalled();
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it("ne démarre pas la lecture si démonté avant la fin de la transition", async () => {
    const { unmount } = render(<ExportScreen />);
    unmount();
    await act(async () => {
      mockRunAfter.mock.calls[0][0]();
    });
    expect(mockGetAccessDoc).not.toHaveBeenCalled();
  });
});
