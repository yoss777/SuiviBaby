// Appui sur une zone du widget : ouvre le bon formulaire, pour le bon bébé.
import { renderHook } from "@testing-library/react-native";

const mockSetParams = jest.fn();
let mockParams: { widget?: string; child?: string } = {};
jest.mock("expo-router", () => ({
  router: { setParams: (p: unknown) => mockSetParams(p) },
  useLocalSearchParams: () => mockParams,
}));

const mockSetActiveChild = jest.fn();
let mockActive: { id: string } | null = { id: "c1" };
jest.mock("@/contexts/BabyContext", () => ({
  useBaby: () => ({
    activeChild: mockActive,
    children: [{ id: "c1" }, { id: "c2" }],
    setActiveChild: mockSetActiveChild,
  }),
}));

import { useWidgetDeepLink, widgetDeepLink } from "@/hooks/useWidgetDeepLink";

beforeEach(() => {
  jest.clearAllMocks();
  mockParams = {};
  mockActive = { id: "c1" };
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
  expect(open).toHaveBeenCalledWith("diaper");
  expect(mockSetParams).toHaveBeenCalledWith({ widget: undefined, child: undefined });
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
