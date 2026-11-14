// Hook du widget : au changement de bébé, la tétée de l'ancien n'est jamais
// envoyée ; données d'un autre enfant bloquées ; envoi après lecture de la tétée.
import { act, renderHook } from "@testing-library/react-native";
import { AppState } from "react-native";

const setAppState = (state: string) =>
  Object.defineProperty(AppState, "currentState", { value: state, configurable: true, writable: true });

const mockPush = jest.fn();
const mockCancel = jest.fn();
const mockLoading = jest.fn();
const mockFlush = jest.fn();
jest.mock("@/services/widgetSync", () => ({
  pushNowWidget: (p: unknown) => mockPush(p),
  pushNowWidgetLoading: (c: string, n: string) => mockLoading(c, n),
  flushPendingWidgetPush: () => mockFlush(),
  cancelPendingWidgetPush: () => mockCancel(),
  invalidateWidgetKey: jest.fn(),
}));
jest.mock("@/services/pushTokenService", () => ({ setWidgetChild: jest.fn() }));

const mockLoads: Record<string, (s: unknown) => void> = {};
jest.mock("@/components/forms/nursingTimer", () => ({
  loadNursingTimer: (childId: string) => new Promise((resolve) => (mockLoads[childId] = resolve)),
  subscribeNursingTimer: () => () => {},
}));

import { useNowWidgetSync } from "@/hooks/useNowWidgetSync";

const NOW = Date.now();
const nursingA = { leftSeconds: 60, rightSeconds: 0, runningSide: "left", runningSince: NOW - 60000, startedAt: NOW - 120000, updatedAt: NOW - 60000 };

const params = (childId: string, over: Record<string, unknown> = {}) => ({
  childId,
  childName: childId === "a" ? "Alma" : "Basile",
  ready: true,
  toMs: (v: unknown) => v as number,
  tetees: [],
  biberons: [],
  solides: [],
  mictions: [],
  selles: [],
  others: [],
  sleepStartMs: undefined,
  sleepIsNap: undefined,
  walkStartMs: undefined,
  sleepTotalMinutes: 0,
  lastAbsoluteMealMs: undefined,
  isPremium: false,
  reminders: { enabled: false, thresholds: { repas: 0, changes: 0 } },
  ...over,
});

beforeEach(() => {
  setAppState("active");
  jest.clearAllMocks();
  for (const k of Object.keys(mockLoads)) delete mockLoads[k];
});

it("attend la lecture de la tétée, puis envoie", async () => {
  renderHook(() => useNowWidgetSync(params("a")));
  expect(mockPush).not.toHaveBeenCalled();
  await act(async () => mockLoads.a(nursingA));
  expect(mockPush).toHaveBeenLastCalledWith(expect.objectContaining({ childId: "a", live: expect.objectContaining({ kind: "nursing" }) }));
});

it("changement de bébé : jamais la tétée de l'ancien dans le widget du nouveau", async () => {
  const { rerender } = renderHook((p: ReturnType<typeof params>) => useNowWidgetSync(p), { initialProps: params("a") });
  await act(async () => mockLoads.a(nursingA));
  mockPush.mockClear();
  rerender(params("b"));
  // Tétée de B pas encore lue : pas de données pour B, mais le widget passe
  // tout de suite sur B (« Mise à jour… »), jamais l'ancien enfant.
  expect(mockPush).not.toHaveBeenCalled();
  expect(mockLoading).toHaveBeenLastCalledWith("b", "Basile");
  await act(async () => mockLoads.b(null));
  expect(mockPush).toHaveBeenLastCalledWith(expect.objectContaining({ childId: "b", live: null }));
});

it("données d'un autre enfant encore affichées : bloqué ; au démarrage, pas de « Mise à jour… »", async () => {
  renderHook(() => useNowWidgetSync(params("b", { biberons: [{ date: NOW, childId: "a" }] })));
  await act(async () => mockLoads.b(null));
  expect(mockPush).not.toHaveBeenCalled();
  expect(mockCancel).toHaveBeenCalled();
  expect(mockLoading).not.toHaveBeenCalled();
});

it("hors premier plan : n'attend pas la lecture de la tétée (réseau suspendu)", async () => {
  setAppState("background");
  renderHook(() => useNowWidgetSync(params("a")));
  expect(mockPush).toHaveBeenLastCalledWith(expect.objectContaining({ childId: "a", live: null }));
  await act(async () => mockLoads.a(nursingA));
  expect(mockPush).toHaveBeenLastCalledWith(expect.objectContaining({ live: expect.objectContaining({ kind: "nursing" }) }));
});
