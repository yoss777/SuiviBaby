// Retour auto à l'Accueil (Android) après une action du widget : 8,5 s,
// annulable, jamais avec un lecteur d'écran.
import { act, renderHook } from "@testing-library/react-native";
import { Platform } from "react-native";

import { ACTION_TOAST_MIN_MS } from "@/contexts/ToastContext";
import { WIDGET_BACK_DELAY_MS, useWidgetBackTimer } from "@/hooks/useWidgetBackTimer";

const mockBack = jest.fn();
jest.mock("@/modules/widget-push", () => ({ moveAppToBack: () => mockBack() }));
// Faux service lecteur d'écran : cache synchrone + lecture fraîche pilotables.
let mockReader = false; // état « cache »
let mockFresh = false; // réponse de la lecture fraîche
const mockListeners = new Set<(on: boolean) => void>();
const mockSetReader = (on: boolean) => {
  mockReader = on;
  mockListeners.forEach((fn) => fn(on));
};
jest.mock("@/services/screenReader", () => ({
  isScreenReaderOnNow: () => mockReader,
  refreshScreenReader: async () => {
    if (mockFresh !== mockReader) mockSetReader(mockFresh);
    return mockReader;
  },
  subscribeScreenReader: (fn: (on: boolean) => void) => {
    mockListeners.add(fn);
    return () => mockListeners.delete(fn);
  },
}));
jest.mock("@gorhom/portal", () => ({ Portal: ({ children }: { children: unknown }) => children }));
jest.mock("react-native-safe-area-context", () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));

const realOS = Platform.OS;
beforeEach(() => {
  jest.useFakeTimers();
  mockBack.mockClear();
  mockReader = false;
  mockFresh = false;
  mockListeners.clear();
  Platform.OS = "android";
});
afterEach(() => {
  jest.useRealTimers();
  Platform.OS = realOS;
});

it("retour après 8,5 s (durée du toast + 0,5 s), pas avant", () => {
  expect(WIDGET_BACK_DELAY_MS).toBe(ACTION_TOAST_MIN_MS + 500);
  expect(WIDGET_BACK_DELAY_MS).toBe(8500);
  const { result } = renderHook(() => useWidgetBackTimer());
  act(() => result.current.schedule());
  act(() => { jest.advanceTimersByTime(8499); });
  expect(mockBack).not.toHaveBeenCalled();
  act(() => { jest.advanceTimersByTime(1); });
  expect(mockBack).toHaveBeenCalledTimes(1);
});

it("lecteur d'écran actif : aucun retour automatique", () => {
  mockReader = true;
  mockFresh = true;
  const { result } = renderHook(() => useWidgetBackTimer());
  act(() => result.current.schedule());
  act(() => { jest.advanceTimersByTime(60_000); });
  expect(mockBack).not.toHaveBeenCalled();
});

it("lecteur d'écran activé après le montage : callbacks stables, pris en compte", () => {
  const { result, rerender } = renderHook(() => useWidgetBackTimer());
  const first = result.current.schedule;
  mockReader = true;
  mockFresh = true;
  rerender({});
  expect(result.current.schedule).toBe(first);
  act(() => result.current.schedule());
  act(() => { jest.advanceTimersByTime(60_000); });
  expect(mockBack).not.toHaveBeenCalled();
});

it("« Annuler » (cancel) : le retour est annulé", () => {
  const { result } = renderHook(() => useWidgetBackTimer());
  act(() => result.current.schedule());
  act(() => { jest.advanceTimersByTime(3000); });
  act(() => result.current.cancel());
  act(() => { jest.advanceTimersByTime(60_000); });
  expect(mockBack).not.toHaveBeenCalled();
});

it("iOS : jamais de retour automatique ; démontage : minuteur arrêté", () => {
  Platform.OS = "ios";
  const ios = renderHook(() => useWidgetBackTimer());
  act(() => ios.result.current.schedule());
  act(() => { jest.advanceTimersByTime(60_000); });
  expect(mockBack).not.toHaveBeenCalled();
  Platform.OS = "android";
  const a = renderHook(() => useWidgetBackTimer());
  act(() => a.result.current.schedule());
  a.unmount();
  act(() => { jest.advanceTimersByTime(60_000); });
  expect(mockBack).not.toHaveBeenCalled();
});

it("cache à false au schedule puis lecture fraîche à true : minuteur annulé", async () => {
  mockFresh = true;
  const { result } = renderHook(() => useWidgetBackTimer());
  await act(async () => {
    result.current.schedule();
  });
  act(() => { jest.advanceTimersByTime(60_000); });
  expect(mockBack).not.toHaveBeenCalled();
});

it("lecteur d'écran activé pendant que le minuteur est armé : annulé", () => {
  const { result } = renderHook(() => useWidgetBackTimer());
  act(() => result.current.schedule());
  act(() => { jest.advanceTimersByTime(3000); });
  act(() => mockSetReader(true));
  act(() => { jest.advanceTimersByTime(60_000); });
  expect(mockBack).not.toHaveBeenCalled();
});

it("plusieurs schedule de suite : un seul minuteur, un seul retour", () => {
  const { result } = renderHook(() => useWidgetBackTimer());
  act(() => result.current.schedule());
  act(() => { jest.advanceTimersByTime(4000); });
  act(() => result.current.schedule());
  act(() => result.current.schedule());
  expect(jest.getTimerCount()).toBe(1);
  act(() => { jest.advanceTimersByTime(8499); });
  expect(mockBack).not.toHaveBeenCalled();
  act(() => { jest.advanceTimersByTime(1); });
  expect(mockBack).toHaveBeenCalledTimes(1);
});
