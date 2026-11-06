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
import { AppState } from "react-native";
import { act, fireEvent, render } from "@testing-library/react-native";
import { ToastProvider, useToast } from "@/contexts/ToastContext";

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
    act(() => api.showUndoToast("Supprimé", jest.fn(), onExpire, 4000));
    act(() => { jest.advanceTimersByTime(3999); });
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

  it("a second undo toast does not drop the first deletion", () => {
    setup();
    const first = jest.fn();
    const second = jest.fn();
    act(() => api.showUndoToast("Premier", jest.fn(), first, 4000));
    act(() => api.showUndoToast("Second", jest.fn(), second, 4000));
    expect(first).toHaveBeenCalledTimes(1);
    expect(second).not.toHaveBeenCalled();
    act(() => { jest.advanceTimersByTime(4000); });
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
