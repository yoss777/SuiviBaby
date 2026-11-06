/* eslint-disable import/first */
// M9 : liste des enregistrements non envoyés. Une lecture impossible n'est pas
// présentée comme une liste vide ; la suppression demande confirmation et ne
// supprime que ce qui est affiché.

jest.mock("@/utils/errorReporting", () => ({
  addBreadcrumb: jest.fn(),
  captureServiceError: jest.fn(),
}));
const mockGetExhausted = jest.fn();
const mockDeleteByIds = jest.fn();
const mockRetry = jest.fn();
jest.mock("@/services/offlineQueueService", () => ({
  getExhaustedEvents: (...a: unknown[]) => mockGetExhausted(...a),
  deleteExhaustedEventsByIds: (...a: unknown[]) => mockDeleteByIds(...a),
  retryExhaustedEvents: (...a: unknown[]) => mockRetry(...a),
}));

import { Alert } from "react-native";
import { act, renderHook } from "@testing-library/react-native";
import { captureServiceError } from "@/utils/errorReporting";
import {
  FAILED_WRITES_READ_ERROR,
  useFailedWrites,
} from "@/hooks/useFailedWrites";

const rows = [
  { id: "r1", action: "create", payload: JSON.stringify({ type: "biberon" }), createdAt: new Date(2026, 3, 1, 10, 5).getTime() },
  { id: "r2", action: "delete", payload: JSON.stringify({}), createdAt: new Date(2026, 3, 1, 11, 0).getTime() },
];

let alertSpy: jest.SpyInstance;
beforeEach(() => {
  jest.clearAllMocks();
  mockGetExhausted.mockResolvedValue(rows);
  mockDeleteByIds.mockResolvedValue(2);
  mockRetry.mockResolvedValue(2);
  alertSpy = jest.spyOn(Alert, "alert").mockImplementation(() => {});
});
afterEach(() => alertSpy.mockRestore());

/** Appuie sur le bouton de l'alerte natif portant ce libellé. */
async function pressAlertButton(label: string) {
  const buttons = alertSpy.mock.calls[alertSpy.mock.calls.length - 1][2] as { text: string; onPress?: () => unknown }[];
  await act(async () => {
    await buttons.find((b) => b.text === label)!.onPress?.();
  });
}

it("le message d'erreur de lecture est celui attendu", () => {
  expect(FAILED_WRITES_READ_ERROR).toBe("Impossible de lire la liste, réessayez");
});

describe("open", () => {
  it("affiche les lignes avec leur identifiant et un libellé sans donnée saisie", async () => {
    const { result } = renderHook(() => useFailedWrites());
    expect(result.current.state).toEqual({ status: "closed" });
    await act(async () => { await result.current.open(); });
    expect(result.current.state).toEqual({
      status: "ready",
      rows: [
        { id: "r1", label: "Ajout : biberon (10h05)" },
        { id: "r2", label: "Suppression (11h00)" },
      ],
    });
  });

  it("une lecture impossible donne un état d'erreur (pas une liste vide) et est signalée", async () => {
    const error = new Error("sqlite");
    mockGetExhausted.mockRejectedValue(error);
    const { result } = renderHook(() => useFailedWrites());
    await act(async () => { await result.current.open(); });
    expect(result.current.state).toEqual({ status: "error" });
    expect(captureServiceError).toHaveBeenCalledWith(error, expect.objectContaining({ service: "offlineQueue" }));
  });

  it("close ferme la fenêtre", async () => {
    const { result } = renderHook(() => useFailedWrites());
    await act(async () => { await result.current.open(); });
    act(() => result.current.close());
    expect(result.current.state).toEqual({ status: "closed" });
  });
});

describe("deleteShown", () => {
  it("demande confirmation, et ne supprime rien tant que l'utilisateur n'a pas confirmé", async () => {
    const { result } = renderHook(() => useFailedWrites());
    await act(async () => { await result.current.open(); });
    act(() => result.current.deleteShown());

    expect(alertSpy).toHaveBeenCalledWith(
      "Supprimer ces saisies ?",
      expect.stringContaining("ne seront jamais envoyées"),
      expect.arrayContaining([
        expect.objectContaining({ text: "Annuler" }),
        expect.objectContaining({ text: "Supprimer", style: "destructive" }),
      ]),
    );
    expect(mockDeleteByIds).not.toHaveBeenCalled();

    await pressAlertButton("Annuler");
    expect(mockDeleteByIds).not.toHaveBeenCalled();
    expect(result.current.state.status).toBe("ready");
  });

  it("après confirmation, supprime uniquement les identifiants affichés puis ferme", async () => {
    const { result } = renderHook(() => useFailedWrites());
    await act(async () => { await result.current.open(); });
    act(() => result.current.deleteShown());
    await pressAlertButton("Supprimer");

    expect(mockDeleteByIds).toHaveBeenCalledWith(["r1", "r2"]);
    expect(result.current.state).toEqual({ status: "closed" });
  });

  it("un échec de suppression est signalé, affiché, et laisse la liste ouverte", async () => {
    const error = new Error("locked");
    mockDeleteByIds.mockRejectedValue(error);
    const { result } = renderHook(() => useFailedWrites());
    await act(async () => { await result.current.open(); });
    act(() => result.current.deleteShown());
    await pressAlertButton("Supprimer");

    expect(captureServiceError).toHaveBeenCalledWith(error, expect.objectContaining({ service: "offlineQueue" }));
    expect(alertSpy).toHaveBeenLastCalledWith("Erreur", "Impossible de supprimer ces saisies. Réessayez.");
    expect(result.current.state.status).toBe("ready");
  });

  it("ne fait rien sans ligne affichée (état d'erreur)", async () => {
    mockGetExhausted.mockRejectedValue(new Error("x"));
    const { result } = renderHook(() => useFailedWrites());
    await act(async () => { await result.current.open(); });
    alertSpy.mockClear();
    act(() => result.current.deleteShown());
    expect(alertSpy).not.toHaveBeenCalled();
  });
});

describe("confirm (bouton « Réessayer »)", () => {
  it("avec une liste : réarme les écritures et ferme", async () => {
    const { result } = renderHook(() => useFailedWrites());
    await act(async () => { await result.current.open(); });
    await act(async () => { await result.current.retry(); });
    expect(mockRetry).toHaveBeenCalledTimes(1);
    expect(result.current.state).toEqual({ status: "closed" });
  });

  it("en état d'erreur : relit la liste au lieu de réarmer à l'aveugle", async () => {
    mockGetExhausted.mockRejectedValueOnce(new Error("x"));
    const { result } = renderHook(() => useFailedWrites());
    await act(async () => { await result.current.open(); });
    await act(async () => { await result.current.retry(); });
    expect(mockRetry).not.toHaveBeenCalled();
    expect(result.current.state.status).toBe("ready");
  });

  it("un échec du réarmement est signalé, jamais un rejet non géré", async () => {
    const error = new Error("db");
    mockRetry.mockRejectedValue(error);
    const { result } = renderHook(() => useFailedWrites());
    await act(async () => { await result.current.open(); });
    await act(async () => { await result.current.retry(); });
    expect(captureServiceError).toHaveBeenCalledWith(error, expect.objectContaining({ service: "offlineQueue" }));
  });
});
