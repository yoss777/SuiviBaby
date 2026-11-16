// Appui sur une zone du widget : ouvre le bon formulaire, pour le bon bébé.
import { renderHook } from "@testing-library/react-native";

const mockSetParams = jest.fn();
let mockParams: { widget?: string; child?: string; nap?: string; k?: string } = {};
jest.mock("expo-router", () => ({
  router: { setParams: (p: unknown) => mockSetParams(p) },
  useLocalSearchParams: () => mockParams,
}));

const mockSetActiveChild = jest.fn();
let mockActive: { id: string } | null = { id: "c1" };
let mockLoaded = true;
jest.mock("@/contexts/BabyContext", () => ({
  useBaby: () => ({
    activeChild: mockActive,
    children: [{ id: "c1" }, { id: "c2" }],
    childrenLoaded: mockLoaded,
    setActiveChild: mockSetActiveChild,
  }),
}));

import { useWidgetDeepLink, widgetDeepLink } from "@/hooks/useWidgetDeepLink";

beforeEach(() => {
  jest.clearAllMocks();
  mockParams = {};
  mockActive = { id: "c1" };
  mockLoaded = true;
});

it("démarrage à froid : garde le lien tant que les bébés ne sont pas chargés", () => {
  mockLoaded = false;
  mockParams = { widget: "meal", child: "zz" };
  renderHook(() => useWidgetDeepLink({ ready: true, open: jest.fn() }));
  expect(mockSetParams).not.toHaveBeenCalled();
});

it("construit le lien attendu par le widget", () => {
  expect(widgetDeepLink("meal", "c 1")).toBe("suivibaby:///baby/home?widget=meal&child=c%201");
  expect(widgetDeepLink("diaper")).toBe("suivibaby:///baby/home?widget=diaper");
});

it("ouvre le formulaire une fois les données prêtes, puis efface le lien", () => {
  mockParams = { widget: "diaper", child: "c1" };
  const open = jest.fn();
  const { rerender } = renderHook(({ ready }: { ready: boolean }) => useWidgetDeepLink({ ready, open }), { initialProps: { ready: false } });
  expect(open).not.toHaveBeenCalled();
  rerender({ ready: true });
  expect(open).toHaveBeenCalledWith("diaper", undefined);
  expect(mockSetParams).toHaveBeenCalledWith({ widget: undefined, child: undefined, nap: undefined });
});

it("bascule d'abord sur le bébé du widget", () => {
  mockParams = { widget: "meal", child: "c2" };
  const open = jest.fn();
  renderHook(() => useWidgetDeepLink({ ready: true, open }));
  expect(mockSetActiveChild).toHaveBeenCalledWith({ id: "c2" });
  expect(open).not.toHaveBeenCalled();
});

it("ignore une action inconnue ou un bébé introuvable", () => {
  const open = jest.fn();
  mockParams = { widget: "delete" };
  renderHook(() => useWidgetDeepLink({ ready: true, open }));
  mockParams = { widget: "meal", child: "zz" };
  renderHook(() => useWidgetDeepLink({ ready: true, open }));
  expect(open).not.toHaveBeenCalled();
  expect(mockSetParams).toHaveBeenCalledTimes(2);
});

it("démarrer une sieste ou une nuit : transmet le choix affiché par le widget", () => {
  expect(widgetDeepLink("sleep-start", "c1", true)).toBe("suivibaby:///baby/home?widget=sleep-start&child=c1&nap=1");
  mockParams = { widget: "sleep-start", child: "c1", nap: "0" };
  const open = jest.fn();
  renderHook(() => useWidgetDeepLink({ ready: true, open }));
  expect(open).toHaveBeenCalledWith("sleep-start", { nap: false });
});

it("arrêter une promenade : action reconnue", () => {
  mockParams = { widget: "walk-stop", child: "c1" };
  const open = jest.fn();
  renderHook(() => useWidgetDeepLink({ ready: true, open }));
  expect(open).toHaveBeenCalledWith("walk-stop", undefined);
});

it("un lien n'est traité qu'une fois, même si l'effet se relance avant l'effacement", () => {
  mockParams = { widget: "sleep-start", child: "c1", nap: "1" };
  const open = jest.fn();
  const { rerender } = renderHook(({ fn }: { fn: () => void }) => useWidgetDeepLink({ ready: true, open: fn as any }), {
    initialProps: { fn: open },
  });
  // open change (données qui bougent) alors que setParams n'a pas encore effacé le lien.
  rerender({ fn: (...a: unknown[]) => open(...a) });
  rerender({ fn: (...a: unknown[]) => open(...a) });
  expect(open).toHaveBeenCalledTimes(1);
  // Lien effacé puis nouvel appui : traité à nouveau.
  mockParams = {};
  rerender({ fn: open });
  mockParams = { widget: "sleep-start", child: "c1", nap: "1" };
  rerender({ fn: open });
  expect(open).toHaveBeenCalledTimes(2);
});

it("arrêter la tétée : action reconnue", () => {
  mockParams = { widget: "nursing-stop", child: "c1" };
  const open = jest.fn();
  renderHook(() => useWidgetDeepLink({ ready: true, open }));
  expect(open).toHaveBeenCalledWith("nursing-stop", undefined);
});

it("ligne sommeil du widget : action reconnue", () => {
  mockParams = { widget: "sleep", child: "c1" };
  const open = jest.fn();
  renderHook(() => useWidgetDeepLink({ ready: true, open }));
  expect(open).toHaveBeenCalledWith("sleep", undefined);
});

it("clé des liens (&k=) transmise avec l'action, puis effacée de l'adresse", () => {
  mockParams = { widget: "sleep-start", child: "c1", nap: "1", k: "0123456789abcdef0123456789abcdef" };
  const open = jest.fn();
  renderHook(() => useWidgetDeepLink({ ready: true, open }));
  expect(open).toHaveBeenCalledWith("sleep-start", { nap: true, linkKey: "0123456789abcdef0123456789abcdef" });
});
