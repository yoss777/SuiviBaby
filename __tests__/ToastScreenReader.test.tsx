/* eslint-disable import/first */
// Toasts avec un lecteur d'écran : durées allongées, annonce répétée une fois,
// région vive « polite ».
jest.mock("@gorhom/portal", () => ({
  Portal: ({ children }: { children: React.ReactNode }) => children,
}));
jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
let mockReader = false;
jest.mock("@/hooks/useScreenReaderEnabled", () => ({ useScreenReaderEnabled: () => mockReader }));

import React from "react";
import { AccessibilityInfo } from "react-native";
import { act, render, screen } from "@testing-library/react-native";
import { ToastProvider, useToast } from "@/contexts/ToastContext";

let api: ReturnType<typeof useToast>;
function Probe() {
  api = useToast();
  return null;
}

let announce: jest.SpyInstance;
beforeEach(() => {
  jest.useFakeTimers();
  mockReader = false;
  announce = jest.spyOn(AccessibilityInfo, "announceForAccessibility").mockImplementation(() => {});
  announce.mockClear();
});
afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});
const setup = () => render(<ToastProvider><Probe /></ToastProvider>);

describe("lecteur d'écran actif", () => {
  beforeEach(() => {
    mockReader = true;
  });

  it("toast avec « Annuler » : au moins 20 s (suppression avec annulation)", () => {
    setup();
    const onExpire = jest.fn();
    act(() => api.showUndoToast("Supprimé", jest.fn(), onExpire, 5000));
    act(() => { jest.advanceTimersByTime(19_999); });
    expect(onExpire).not.toHaveBeenCalled();
    expect(screen.queryByText("Supprimé")).not.toBeNull();
    act(() => { jest.advanceTimersByTime(1); });
    expect(onExpire).toHaveBeenCalledTimes(1);
  });

  it("toast d'action : au moins 20 s", () => {
    setup();
    act(() => api.showActionToast("Sieste démarrée", "Annuler", jest.fn(), 5000));
    act(() => { jest.advanceTimersByTime(19_999); });
    expect(screen.queryByText("Sieste démarrée")).not.toBeNull();
    act(() => { jest.advanceTimersByTime(1); });
    expect(screen.queryByText("Sieste démarrée")).toBeNull();
  });

  it("toast d'info ou d'erreur : au moins 5 s (au lieu de 2,6 s)", () => {
    setup();
    act(() => api.showToast("Enregistré"));
    act(() => { jest.advanceTimersByTime(4999); });
    expect(screen.queryByText("Enregistré")).not.toBeNull();
    act(() => { jest.advanceTimersByTime(1); });
    expect(screen.queryByText("Enregistré")).toBeNull();
  });

  it("une durée déjà plus longue est conservée", () => {
    setup();
    act(() => api.showToast("Long", 9000));
    act(() => { jest.advanceTimersByTime(8999); });
    expect(screen.queryByText("Long")).not.toBeNull();
  });

  it("annonce répétée une seule fois après ~0,5 s", () => {
    setup();
    act(() => api.showToast("Enregistré"));
    expect(announce).toHaveBeenCalledTimes(1);
    act(() => { jest.advanceTimersByTime(499); });
    expect(announce).toHaveBeenCalledTimes(1);
    act(() => { jest.advanceTimersByTime(1); });
    expect(announce).toHaveBeenCalledTimes(2);
    expect(announce).toHaveBeenLastCalledWith("Enregistré");
    act(() => { jest.advanceTimersByTime(10_000); });
    expect(announce).toHaveBeenCalledTimes(2);
  });

  it("toast d'action : la répétition mentionne l'action disponible", () => {
    setup();
    act(() => api.showActionToast("Balade démarrée", "Annuler", jest.fn()));
    act(() => { jest.advanceTimersByTime(500); });
    expect(announce).toHaveBeenCalledTimes(2);
    expect(announce).toHaveBeenLastCalledWith("Balade démarrée. Action disponible : Annuler.");
  });

  it("région vive polie sur le conteneur du toast", () => {
    setup();
    act(() => api.showToast("Enregistré"));
    expect(screen.getByTestId("toast-info").props.accessibilityLiveRegion).toBe("polite");
  });
});

describe("sans lecteur d'écran : comportement inchangé", () => {
  it("durées d'origine, une seule annonce", () => {
    setup();
    act(() => api.showToast("Enregistré"));
    act(() => { jest.advanceTimersByTime(2600); });
    expect(screen.queryByText("Enregistré")).toBeNull();
    expect(announce).toHaveBeenCalledTimes(1);

    const onExpire = jest.fn();
    act(() => api.showUndoToast("Supprimé", jest.fn(), onExpire, 5000));
    act(() => { jest.advanceTimersByTime(8000); });
    expect(onExpire).toHaveBeenCalledTimes(1);
    expect(announce).toHaveBeenCalledTimes(2);
  });
});
