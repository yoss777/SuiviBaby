/* eslint-disable import/first */
// Sprint 13.2 : ouverture du formulaire depuis les écrans de liste.

const mockOpenSheet = jest.fn();
const mockCloseSheet = jest.fn();
jest.mock("@/contexts/SheetContext", () => ({
  useSheet: () => ({ openSheet: mockOpenSheet, closeSheet: mockCloseSheet, isOpen: false }),
}));
let mockParams: Record<string, string | undefined> = {};
const mockReplace = jest.fn();
jest.mock("expo-router", () => ({
  router: { replace: (...args: unknown[]) => mockReplace(...args) },
  useLocalSearchParams: () => mockParams,
}));
const mockSetParams = jest.fn();
jest.mock("@react-navigation/native", () => {
  const { useEffect } = jest.requireActual("react");
  return {
    useNavigation: () => ({ setParams: mockSetParams }),
    useFocusEffect: (effect: () => void) => useEffect(effect, [effect]),
  };
});

import { act, renderHook } from "@testing-library/react-native";
import { InteractionManager } from "react-native";

import { navigateToReturnTarget, useEventSheetFlow } from "@/hooks/eventList/useEventSheetFlow";

type Item = { id: string; type?: string };
const showToast = jest.fn();
const onSaved = jest.fn();
const sheet = {
  formType: "diapers",
  ownerId: "diapers",
  buildOpenProps: ({ editItem, addPreset }: { editItem?: Item; addPreset?: string }) => ({
    diapersType: editItem?.type ?? addPreset ?? "miction",
    editData: editItem ? { id: editItem.id } : undefined,
  }),
  savedToast: (isEdit: boolean) => (isEdit ? "Couche modifiée" : "Couche enregistrée"),
};
const parseTabParam = (tab?: string) => (tab === "selles" ? "selle" : "miction");

function setup(items: Item[] = []) {
  const hook = renderHook(() =>
    useEventSheetFlow<Item>({ sheet, parseTabParam, items, showToast, onSaved }),
  );
  act(() => hook.result.current.onLayout());
  return hook;
}

function runInteractions() {
  act(() => {
    jest.runAllTimers();
  });
}

beforeEach(() => {
  jest.useFakeTimers();
  jest.clearAllMocks();
  mockParams = {};
  jest
    .spyOn(InteractionManager, "runAfterInteractions")
    .mockImplementation((task: any) => {
      const id = setTimeout(() => task?.(), 0);
      return { cancel: () => clearTimeout(id) } as any;
    });
});
afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

describe("useEventSheetFlow", () => {
  it("openModal=true ouvre l'ajout avec le préréglage de l'onglet", () => {
    mockParams = { openModal: "true", tab: "selles" };
    setup();
    runInteractions();
    expect(mockOpenSheet).toHaveBeenCalledTimes(1);
    const props = mockOpenSheet.mock.calls[0][0];
    expect(props).toMatchObject({ ownerId: "diapers", formType: "diapers", diapersType: "selle" });
    expect(props.editData).toBeUndefined();
    expect(mockSetParams).toHaveBeenCalledWith({ openModal: undefined, editId: undefined });
  });

  it("onSuccess : callback + toast d'enregistrement", () => {
    const { result } = setup();
    act(() => result.current.openAdd());
    runInteractions();
    const props = mockOpenSheet.mock.calls[0][0];
    expect(props.diapersType).toBe("miction");
    act(() => props.onSuccess());
    expect(onSaved).toHaveBeenCalled();
    expect(showToast).toHaveBeenCalledWith("Couche enregistrée");
  });

  it("édition : bloque les saisies optimistes, sinon passe l'élément", () => {
    const { result } = setup();
    act(() => result.current.openEdit({ id: "__optimistic_1" }));
    expect(showToast).toHaveBeenCalledWith("Enregistrement en cours...");
    runInteractions();
    expect(mockOpenSheet).not.toHaveBeenCalled();

    act(() => result.current.openEdit({ id: "e1", type: "selle" }));
    runInteractions();
    const props = mockOpenSheet.mock.calls[0][0];
    expect(props).toMatchObject({ diapersType: "selle", editData: { id: "e1" } });
    act(() => props.onSuccess());
    expect(showToast).toHaveBeenCalledWith("Couche modifiée");
  });

  it("editId : ouvre l'édition une seule fois par id", () => {
    mockParams = { editId: "e1" };
    const { rerender } = setup([{ id: "e1", type: "miction" }]);
    runInteractions();
    expect(mockOpenSheet).toHaveBeenCalledTimes(1);
    rerender({});
    runInteractions();
    expect(mockOpenSheet).toHaveBeenCalledTimes(1);
  });

  it("fermeture : retour à l'écran d'origine (returnTo)", () => {
    mockParams = { returnTo: "journal", openModal: "true" };
    setup();
    runInteractions();
    act(() => mockOpenSheet.mock.calls[0][0].onDismiss());
    expect(mockReplace).toHaveBeenCalledWith("/baby/chrono");
  });

  it("navigateToReturnTarget : home, chrono/journal, sinon rien", () => {
    expect(navigateToReturnTarget("home")).toBe(true);
    expect(mockReplace).toHaveBeenLastCalledWith("/baby/home");
    expect(navigateToReturnTarget("chrono")).toBe(true);
    expect(mockReplace).toHaveBeenLastCalledWith("/baby/chrono");
    expect(navigateToReturnTarget("autre")).toBe(false);
    expect(navigateToReturnTarget(null)).toBe(false);
  });
});
