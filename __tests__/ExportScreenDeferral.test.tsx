/* eslint-disable import/first */
// Écran d'export : le chargement lourd attend la fin de la transition et
// ignore les résultats si l'écran est démonté entre-temps.
const mockRunAfter = jest.fn();
const mockLoadCounts = jest.fn();
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
jest.mock("@/services/exportCollector", () => ({
  ...jest.requireActual("@/services/exportCollector"),
  loadChildExportCounts: (...a: unknown[]) => mockLoadCounts(...a),
  collectChildExportData: jest.fn(),
}));
jest.mock("@/services/offlineQueueService", () => ({
  getPendingChildIds: jest.fn(() => Promise.resolve(new Set())),
  isOnline: jest.fn(() => Promise.resolve(true)),
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


import ExportScreen from "@/app/settings/export";
import * as afterInteractions from "@/utils/afterInteractions";

describe("ExportScreen : chargement différé", () => {
  let cancel: jest.Mock;
  beforeEach(() => {
    jest.clearAllMocks();
    cancel = jest.fn();
    mockRunAfter.mockImplementation(() => ({ cancel }));
    jest.spyOn(afterInteractions, "runAfterInteractions").mockImplementation(((cb: () => void) =>
      mockRunAfter(cb)) as never);
    mockLoadCounts.mockResolvedValue({ role: "owner", events: {}, likes: 0, comments: 0 });
    mockPrefs.mockResolvedValue(null);
  });
  afterEach(() => jest.restoreAllMocks());

  it("ne lit rien avant la fin de la transition", () => {
    render(<ExportScreen />);
    expect(mockRunAfter).toHaveBeenCalledTimes(1);
    expect(mockLoadCounts).not.toHaveBeenCalled();
    expect(mockPrefs).not.toHaveBeenCalled();
  });

  it("lance les lectures une fois la transition terminée", async () => {
    render(<ExportScreen />);
    await act(async () => {
      mockRunAfter.mock.calls[0][0]();
    });
    expect(mockLoadCounts).toHaveBeenCalledWith("c1", "u1");
  });

  it("annule la tâche différée au démontage", () => {
    const { unmount } = render(<ExportScreen />);
    unmount();
    expect(cancel).toHaveBeenCalledTimes(1);
  });

  it("n'applique aucun résultat après démontage", async () => {
    let resolveCounts: (v: unknown) => void = () => {};
    mockLoadCounts.mockReturnValue(new Promise((r) => (resolveCounts = r)));
    const errorSpy = jest.spyOn(console, "error").mockImplementation(() => {});
    const { unmount } = render(<ExportScreen />);
    await act(async () => {
      mockRunAfter.mock.calls[0][0]();
    });
    unmount();
    await act(async () => {
      resolveCounts({ role: "owner", events: {}, likes: 0, comments: 0 });
    });
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it("ne démarre pas la lecture si démonté avant la fin de la transition", async () => {
    const { unmount } = render(<ExportScreen />);
    unmount();
    await act(async () => {
      mockRunAfter.mock.calls[0][0]();
    });
    expect(mockLoadCounts).not.toHaveBeenCalled();
  });
});
