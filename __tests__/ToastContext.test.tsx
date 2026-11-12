/* eslint-disable import/first */
// Sprint 6 (6.7) : la suppression avec annulation est exécutée tout de suite
// si l'app passe en arrière-plan, et jamais perdue quand un autre toast
// remplace celui de l'annulation.

jest.mock("@gorhom/portal", () => ({
  Portal: ({ children }: { children: React.ReactNode }) => children,
}));
jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

import React from "react";
import { AccessibilityInfo, AppState, Text } from "react-native";
import { act, fireEvent, render, screen } from "@testing-library/react-native";
import {
  ACTION_TOAST_MIN_MS,
  ToastProvider,
  useToast,
  useToastBottomInset,
} from "@/contexts/ToastContext";

type Api = ReturnType<typeof useToast>;
let api: Api;
function Probe() {
  api = useToast();
  return null;
}

let appStateHandler: ((state: string) => void) | null = null;
let removeSpy: jest.Mock;

beforeEach(() => {
  jest.useFakeTimers();
  appStateHandler = null;
  removeSpy = jest.fn();
  jest.spyOn(AppState, "addEventListener").mockImplementation((_e, cb) => {
    appStateHandler = cb as (s: string) => void;
    return { remove: removeSpy } as any;
  });
});
afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

const setup = () =>
  render(
    <ToastProvider>
      <Probe />
    </ToastProvider>,
  );

describe("showUndoToast", () => {
  it("runs onExpire once after the delay", () => {
    setup();
    const onExpire = jest.fn();
    act(() => api.showUndoToast("Supprimé", jest.fn(), onExpire, 8000));
    act(() => { jest.advanceTimersByTime(7999); });
    expect(onExpire).not.toHaveBeenCalled();
    act(() => { jest.advanceTimersByTime(1); });
    expect(onExpire).toHaveBeenCalledTimes(1);
  });

  it("Annuler runs onUndo and never onExpire", () => {
    const { getByText } = setup();
    const onUndo = jest.fn();
    const onExpire = jest.fn();
    act(() => api.showUndoToast("Supprimé", onUndo, onExpire, 4000));
    fireEvent.press(getByText("Annuler"));
    act(() => { jest.advanceTimersByTime(10_000); });
    expect(onUndo).toHaveBeenCalledTimes(1);
    expect(onExpire).not.toHaveBeenCalled();
  });

  it("executes the deletion immediately when the app goes to the background, only once", () => {
    const { queryByText } = setup();
    const onExpire = jest.fn();
    act(() => api.showUndoToast("Supprimé", jest.fn(), onExpire, 4000));
    expect(queryByText("Supprimé")).not.toBeNull();

    act(() => appStateHandler?.("background"));

    expect(onExpire).toHaveBeenCalledTimes(1);
    expect(queryByText("Supprimé")).toBeNull();
    act(() => { jest.advanceTimersByTime(10_000); });
    expect(onExpire).toHaveBeenCalledTimes(1);
  });

  it("does nothing when the app goes to the background with no pending undo, or just becomes active/inactive", () => {
    setup();
    const onExpire = jest.fn();
    act(() => appStateHandler?.("background"));
    act(() => api.showUndoToast("Supprimé", jest.fn(), onExpire, 4000));
    act(() => appStateHandler?.("active"));
    act(() => appStateHandler?.("inactive"));
    expect(onExpire).not.toHaveBeenCalled();
  });

  it("dismissToast runs the pending deletion once instead of leaving a stale callback behind", () => {
    const { queryByText } = setup();
    const onExpire = jest.fn();
    act(() => api.showUndoToast("Supprimé", jest.fn(), onExpire, 4000));

    act(() => api.dismissToast());

    expect(onExpire).toHaveBeenCalledTimes(1);
    expect(queryByText("Supprimé")).toBeNull();
    // Un toast suivant ne rejoue pas, et le minuteur non plus.
    act(() => api.showToast("Autre message"));
    act(() => { jest.advanceTimersByTime(10_000); });
    expect(onExpire).toHaveBeenCalledTimes(1);
  });

  it("dismissToast with no undo pending only closes the toast", () => {
    const { queryByText } = setup();
    act(() => api.showToast("Info"));
    act(() => api.dismissToast());
    expect(queryByText("Info")).toBeNull();
  });

  it("a second undo toast does not drop the first deletion", () => {
    setup();
    const first = jest.fn();
    const second = jest.fn();
    act(() => api.showUndoToast("Premier", jest.fn(), first, 4000));
    act(() => api.showUndoToast("Second", jest.fn(), second, 4000));
    expect(first).toHaveBeenCalledTimes(1);
    expect(second).not.toHaveBeenCalled();
    act(() => { jest.advanceTimersByTime(8000); });
    expect(second).toHaveBeenCalledTimes(1);
    expect(first).toHaveBeenCalledTimes(1);
  });

  it("a plain toast shown during the undo window does not drop the deletion", () => {
    setup();
    const onExpire = jest.fn();
    act(() => api.showUndoToast("Supprimé", jest.fn(), onExpire, 4000));
    act(() => api.showToast("Autre message"));
    expect(onExpire).toHaveBeenCalledTimes(1);
    act(() => { jest.advanceTimersByTime(10_000); });
    expect(onExpire).toHaveBeenCalledTimes(1);
  });

  it("an action toast shown during the undo window does not drop the deletion", () => {
    setup();
    const onExpire = jest.fn();
    act(() => api.showUndoToast("Supprimé", jest.fn(), onExpire, 4000));
    act(() => api.showActionToast("Erreur", "Réessayer", jest.fn()));
    expect(onExpire).toHaveBeenCalledTimes(1);
  });

  it("a toast without onExpire is harmless in the background", () => {
    setup();
    act(() => api.showUndoToast("Supprimé", jest.fn(), undefined, 4000));
    expect(() => act(() => appStateHandler?.("background"))).not.toThrow();
  });
});

describe("lifecycle", () => {
  it("removes the AppState listener on unmount", () => {
    const { unmount } = setup();
    unmount();
    expect(removeSpy).toHaveBeenCalled();
  });
});

describe("accessibilité et confort (P1-11)", () => {
  it("un toast avec action reste au moins 8 s, même si l'appelant demande moins", () => {
    setup();
    const onExpire = jest.fn();
    act(() => api.showUndoToast("Supprimé", jest.fn(), onExpire, 4000));
    act(() => { jest.advanceTimersByTime(ACTION_TOAST_MIN_MS - 1); });
    expect(onExpire).not.toHaveBeenCalled();
    act(() => { jest.advanceTimersByTime(1); });
    expect(onExpire).toHaveBeenCalledTimes(1);
  });

  it("annonce le message et l'action au lecteur d'écran", () => {
    const spy = jest.spyOn(AccessibilityInfo, "announceForAccessibility").mockImplementation(() => {});
    setup();
    act(() => api.showActionToast("Échec de l'envoi", "Réessayer", jest.fn()));
    expect(spy).toHaveBeenCalledWith("Échec de l'envoi. Action disponible : Réessayer.");
    act(() => api.showToast("Enregistré"));
    expect(spy).toHaveBeenLastCalledWith("Enregistré");
  });

  it("le bouton d'action est un bouton d'au moins 44 pt", () => {
    setup();
    act(() => api.showUndoToast("Supprimé", jest.fn(), jest.fn()));
    const button = screen.getByRole("button", { name: "Annuler" });
    const style = Object.assign({}, ...[button.props.style].flat(Infinity).filter(Boolean));
    expect(style.minHeight).toBeGreaterThanOrEqual(44);
    expect(style.minWidth).toBeGreaterThanOrEqual(44);
  });

  it("se pose au-dessus de la barre d'onglets déclarée", () => {
    function TabBar() {
      useToastBottomInset(120);
      return <Text>tabs</Text>;
    }
    render(
      <ToastProvider>
        <Probe />
        <TabBar />
      </ToastProvider>,
    );
    act(() => api.showToast("Enregistré"));
    const toast = screen.getByText("Enregistré").parent?.parent;
    const style = Object.assign({}, ...[toast?.props.style].flat(Infinity).filter(Boolean));
    expect(style.bottom).toBeGreaterThan(120);
  });
});
