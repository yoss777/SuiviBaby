/* eslint-disable import/first */
// Sprint 13.2 : suppression avec annulation des écrans de liste.

const mockScheduleDelete = jest.fn();
jest.mock("@/hooks/useDeleteWithUndo", () => ({
  useDeleteWithUndo: () => mockScheduleDelete,
}));
const mockSupprimer = jest.fn(() => Promise.resolve({ status: "deleted" }));
jest.mock("@/services/eventsService", () => ({
  supprimerEvenement: (...args: unknown[]) => (mockSupprimer as any)(...args),
}));
jest.mock("expo-haptics", () => ({ impactAsync: jest.fn(), ImpactFeedbackStyle: { Medium: "medium" } }));

import { act, renderHook } from "@testing-library/react-native";
import * as Haptics from "expo-haptics";

import { isOptimisticId, useSoftDelete } from "@/hooks/eventList/useSoftDelete";

const showToast = jest.fn();
const onBatchStart = jest.fn();
const texts = {
  deleted: "Repas supprimé",
  batchDeleted: (n: number) => `${n} repas supprimé${n > 1 ? "s" : ""}`,
  batchDeleteHaptic: false,
};

type Item = { id: string };

function setup(items: Item[], extra: Partial<typeof texts> = {}, childId: string | undefined = "c1") {
  return renderHook(
    (p: { items: Item[] }) =>
      useSoftDelete<Item>({ childId, items: p.items, texts: { ...texts, ...extra }, showToast, onBatchStart }),
    { initialProps: { items } },
  );
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe("useSoftDelete", () => {
  it("bloque les saisies optimistes avec un toast", () => {
    const { result } = setup([{ id: "__optimistic_1" }]);
    act(() => result.current.requestDelete({ id: "__optimistic_1" }));
    expect(showToast).toHaveBeenCalledWith("Enregistrement en cours...");
    expect(result.current.deleteConfirm.visible).toBe(false);
    expect(isOptimisticId("__optimistic_x")).toBe(true);
    expect(isOptimisticId("abc")).toBe(false);
  });

  it("confirmation simple : masque, planifie, annuler ré-affiche", async () => {
    const { result } = setup([{ id: "a" }, { id: "b" }]);
    act(() => result.current.requestDelete({ id: "a" }));
    expect(Haptics.impactAsync).toHaveBeenCalled();
    expect(result.current.deleteConfirm).toEqual({ visible: true, item: { id: "a" } });

    await act(async () => {
      await result.current.confirmDelete();
    });
    expect(result.current.deleteConfirm.visible).toBe(false);
    expect(result.current.softDeletedIds.has("a")).toBe(true);
    const params = mockScheduleDelete.mock.calls[0][0];
    expect(params.message).toBe("Repas supprimé");

    await params.run();
    expect(mockSupprimer).toHaveBeenCalledWith("c1", "a");

    act(() => params.onUndo());
    expect(result.current.softDeletedIds.has("a")).toBe(false);
    act(() => params.onHide());
    expect(result.current.softDeletedIds.has("a")).toBe(true);
    act(() => params.onRestore());
    expect(result.current.softDeletedIds.has("a")).toBe(false);
  });

  it("suppression groupée : sort du mode sélection et pluralise", () => {
    const { result } = setup([{ id: "a" }, { id: "b" }]);
    act(() => result.current.requestBatchDelete(["a", "b"]));
    expect(result.current.batchDeleteConfirm).toEqual({ visible: true, ids: ["a", "b"] });
    expect(Haptics.impactAsync).not.toHaveBeenCalled();

    act(() => result.current.confirmBatchDelete());
    expect(onBatchStart).toHaveBeenCalled();
    expect(result.current.softDeletedIds).toEqual(new Set(["a", "b"]));
    expect(mockScheduleDelete.mock.calls[0][0].message).toBe("2 repas supprimés");
  });

  it("repas : retour haptique en ouvrant la confirmation groupée", () => {
    const { result } = setup([{ id: "a" }], { batchDeleteHaptic: true });
    act(() => result.current.requestBatchDelete(["a"]));
    expect(Haptics.impactAsync).toHaveBeenCalled();
  });

  it("oublie les ids qui ne sont plus dans les données", () => {
    const { result, rerender } = setup([{ id: "a" }, { id: "b" }]);
    act(() => result.current.requestBatchDelete(["a", "b"]));
    act(() => result.current.confirmBatchDelete());
    rerender({ items: [{ id: "b" }] });
    expect(result.current.softDeletedIds).toEqual(new Set(["b"]));
  });
});
