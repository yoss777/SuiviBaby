/* eslint-disable import/first */
// Sprint 6 (6.9) : arrêt d'un chrono avec annulation. Première partie : le
// hook seul (services simulés). Seconde : de bout en bout avec les vraies
// écritures optimistes, en attendant la fin de l'envoi serveur.

const mockShowUndoToast = jest.fn();
const mockShowToast = jest.fn();
jest.mock("@/contexts/ToastContext", () => ({
  useToast: () => ({ showUndoToast: mockShowUndoToast, showToast: mockShowToast }),
}));
jest.mock("@/utils/errorReporting", () => ({
  addBreadcrumb: jest.fn(),
  captureServiceError: jest.fn(),
}));
jest.mock("@/services/offlineQueueService", () => ({
  enqueueEvent: jest.fn(() => Promise.resolve("offline_1")),
  isOnline: jest.fn(() => Promise.resolve(true)),
}));
jest.mock("@/config/firebase", () => ({
  auth: { currentUser: { uid: "user123" } },
  db: {},
  functions: {},
}));

import { renderHook } from "@testing-library/react-native";
import { httpsCallable } from "firebase/functions";
import * as eventsService from "@/services/eventsService";
import { useStopTimedEventWithUndo } from "@/hooks/useStopTimedEventWithUndo";
import {
  getOptimisticEntries,
  resetOptimisticStoreForTests,
} from "@/services/optimisticEventsStore";

// Fenêtres de l'app : relayées vers Alert.alert pour garder les assertions
// sur les boutons (le rendu réel est couvert par ModalContextChoice.test).
jest.mock("@/contexts/ModalContext", () => {
  const { Alert } = require("react-native");
  // Sans l'argument d'options (propre à la fenêtre de l'app).
  const showAlert = (...args: unknown[]) =>
    (Alert.alert as (...a: unknown[]) => void)(...args.slice(0, 3));
  const api = {
    showAlert,
    showConfirm: jest.fn(),
    hide: jest.fn(),
    hasOpenModal: () => false,
    subscribeProtectedModal: () => () => {},
  };
  return { useModal: () => api, useModalActions: () => api, showAppAlert: showAlert };
});


const NOW = new Date("2026-04-12T10:30:00.000Z");
const getSuccessLabel = jest.fn(() => "Sommeil terminé");

const sleep = (over: Record<string, unknown> = {}) => ({
  id: "ev1",
  type: "sommeil",
  heureDebut: new Date("2026-04-12T09:00:00.000Z"),
  ...over,
});

beforeEach(() => {
  jest.useFakeTimers();
  jest.setSystemTime(NOW);
  jest.clearAllMocks();
  resetOptimisticStoreForTests();
});
afterEach(() => {
  jest.restoreAllMocks();
  jest.useRealTimers();
});

describe("useStopTimedEventWithUndo (hook seul)", () => {
  it("stops the event with the elapsed minutes and offers an undo toast of 5 s", () => {
    const modifier = jest.spyOn(eventsService, "modifierEvenementOptimistic").mockReturnValue("op1");
    const { result } = renderHook(() => useStopTimedEventWithUndo({ childId: "c1", getSuccessLabel }));
    const event = sleep();

    result.current(event);

    expect(modifier).toHaveBeenCalledWith("c1", "ev1", { heureFin: NOW, duree: 90 }, event);
    expect(getSuccessLabel).toHaveBeenCalledWith(event, { elapsedMinutes: 90, isUnderOneMinute: false });
    expect(mockShowUndoToast).toHaveBeenCalledWith("Sommeil terminé", expect.any(Function), undefined, 5000);
  });

  it("arrêt depuis le widget : champ de mesure ajouté à l'écriture (endSource)", () => {
    const modifier = jest.spyOn(eventsService, "modifierEvenementOptimistic").mockReturnValue("op1");
    const { result } = renderHook(() => useStopTimedEventWithUndo({ childId: "c1", getSuccessLabel }));
    const event = sleep();

    result.current(event, { endSource: "widget" });

    expect(modifier).toHaveBeenCalledWith("c1", "ev1", { heureFin: NOW, duree: 90, endSource: "widget" }, event);
    // Annuler : l'arrêt et sa marque disparaissent.
    const undo = mockShowUndoToast.mock.calls.at(-1)[1];
    undo();
    expect(modifier).toHaveBeenLastCalledWith("c1", "ev1", { heureFin: null, duree: null, endSource: null }, expect.anything());
  });

  it("session de plus de 24 h : pas d'écriture (refusée par le serveur), formulaire pour l'heure de fin réelle", () => {
    const spy = jest.spyOn(eventsService, "modifierEvenementOptimistic").mockImplementation(() => undefined as any);
    const onTooLong = jest.fn();
    const { result } = renderHook(() => useStopTimedEventWithUndo({ childId: "c1", getSuccessLabel, onTooLong }));
    const old = sleep({ heureDebut: new Date(NOW.getTime() - 27 * 3600_000) });
    result.current(old);
    expect(spy).not.toHaveBeenCalled();
    expect(onTooLong).toHaveBeenCalledWith(old);
    expect(mockShowToast).toHaveBeenCalledWith("Plus de 24 h : indiquez l'heure de fin réelle");
    spy.mockRestore();
  });

  it("sieste arrêtée après minuit : question ; « Enregistrer comme nuit » écrit isNap false, « Annuler » remet la sieste", () => {
    const { Alert } = require("react-native");
    const alertSpy = jest.spyOn(Alert, "alert").mockImplementation(() => undefined);
    const spy = jest.spyOn(eventsService, "modifierEvenementOptimistic").mockImplementation(() => undefined as any);
    const { result } = renderHook(() => useStopTimedEventWithUndo({ childId: "c1", getSuccessLabel }));
    const nap = sleep({ isNap: true, heureDebut: new Date(NOW.getTime() - 12 * 3600_000 + 0) });
    // Début la veille (NOW à 10:30 UTC, début 12 h avant, autre jour local).
    nap.heureDebut = new Date(new Date(NOW).setDate(NOW.getDate() - 1));
    result.current(nap as any);
    expect(spy).not.toHaveBeenCalled();
    expect(alertSpy).toHaveBeenCalledWith("Cette sieste passe minuit", "On l'enregistre comme une nuit, avec les mêmes heures ?", expect.any(Array));
    const buttons = alertSpy.mock.calls[0][2] as { text: string; onPress?: () => void }[];
    buttons.find((b) => b.text === "Enregistrer comme nuit")!.onPress!();
    expect(spy).toHaveBeenCalledWith("c1", "ev1", expect.objectContaining({ isNap: false, heureFin: NOW }), nap);
    const undo = mockShowUndoToast.mock.calls.at(-1)![1] as () => void;
    undo();
    expect(spy.mock.calls.at(-1)![2]).toMatchObject({ heureFin: null, duree: null, isNap: true });
    alertSpy.mockRestore();
    spy.mockRestore();
  });

  it("sieste passée minuit, « Corriger l'heure de fin » : formulaire avec 23:59 du jour du début proposé", () => {
    const { Alert } = require("react-native");
    const alertSpy = jest.spyOn(Alert, "alert").mockImplementation(() => undefined);
    const spy = jest.spyOn(eventsService, "modifierEvenementOptimistic").mockImplementation(() => undefined as any);
    const onTooLong = jest.fn();
    const { result } = renderHook(() => useStopTimedEventWithUndo({ childId: "c1", getSuccessLabel, onTooLong }));
    const nap = sleep({ isNap: true });
    nap.heureDebut = new Date(new Date(NOW).setDate(NOW.getDate() - 1));
    result.current(nap as any);
    const buttons = alertSpy.mock.calls[0][2] as { text: string; onPress?: () => void }[];
    buttons.find((b) => b.text === "Corriger l'heure de fin")!.onPress!();
    const expected = new Date(nap.heureDebut);
    expected.setHours(23, 59, 0, 0);
    expect(onTooLong).toHaveBeenCalledWith(nap, expected);
    expect(spy).not.toHaveBeenCalled();
    alertSpy.mockRestore();
    spy.mockRestore();
  });

  it("sieste passée minuit, bébé changé pendant la question : la nuit est écrite sur le bébé de la session ; « Corriger » ne fait rien", () => {
    const { Alert } = require("react-native");
    const alertSpy = jest.spyOn(Alert, "alert").mockImplementation(() => undefined);
    const spy = jest.spyOn(eventsService, "modifierEvenementOptimistic").mockImplementation(() => undefined as any);
    const onTooLong = jest.fn();
    const { result, rerender } = renderHook(
      ({ childId }: { childId: string }) => useStopTimedEventWithUndo({ childId, getSuccessLabel, onTooLong }),
      { initialProps: { childId: "c1" } },
    );
    const nap = sleep({ isNap: true });
    nap.heureDebut = new Date(new Date(NOW).setDate(NOW.getDate() - 1));
    expect(result.current(nap as any)).toBe(false);
    // Lien du widget : l'Accueil passe sur c2, la question reste ouverte.
    rerender({ childId: "c2" });
    const buttons = alertSpy.mock.calls[0][2] as { text: string; onPress?: () => void }[];
    buttons.find((b) => b.text === "Corriger l'heure de fin")!.onPress!();
    expect(onTooLong).not.toHaveBeenCalled();
    buttons.find((b) => b.text === "Enregistrer comme nuit")!.onPress!();
    expect(spy).toHaveBeenCalledWith("c1", "ev1", expect.objectContaining({ isNap: false }), nap);
    const undo = mockShowUndoToast.mock.calls.at(-1)![1] as () => void;
    undo();
    expect(spy.mock.calls.at(-1)![0]).toBe("c1");
    alertSpy.mockRestore();
    spy.mockRestore();
  });

  it("valeur rendue : vrai seulement si l'arrêt est écrit (retour auto du widget)", () => {
    jest.spyOn(eventsService, "modifierEvenementOptimistic").mockReturnValue("op1");
    const { result } = renderHook(() => useStopTimedEventWithUndo({ childId: "c1", getSuccessLabel, onTooLong: jest.fn() }));
    expect(result.current(sleep())).toBe(true);
    expect(result.current(sleep({ heureDebut: new Date(NOW.getTime() - 27 * 3600_000) }))).toBe(false);
    expect(result.current(null)).toBe(false);
  });

  it("nuit arrêtée après minuit : arrêt direct (pas de question)", () => {
    const { Alert } = require("react-native");
    const alertSpy = jest.spyOn(Alert, "alert").mockImplementation(() => undefined);
    const spy = jest.spyOn(eventsService, "modifierEvenementOptimistic").mockImplementation(() => undefined as any);
    const { result } = renderHook(() => useStopTimedEventWithUndo({ childId: "c1", getSuccessLabel }));
    const night = sleep({ isNap: false, heureDebut: new Date(new Date(NOW).setDate(NOW.getDate() - 1)) });
    // Nuit de plus de 24 h refusée ailleurs : début la veille, mais moins de 24 h.
    night.heureDebut = new Date(NOW.getTime() - 10 * 3600_000);
    result.current(night as any);
    expect(alertSpy).not.toHaveBeenCalled();
    alertSpy.mockRestore();
    spy.mockRestore();
  });

  it("never records a duration below one minute", () => {
    const modifier = jest.spyOn(eventsService, "modifierEvenementOptimistic").mockReturnValue("op1");
    const { result } = renderHook(() => useStopTimedEventWithUndo({ childId: "c1", getSuccessLabel }));
    result.current(sleep({ heureDebut: new Date(NOW.getTime() - 20_000) }));
    expect(modifier.mock.calls[0][2]).toMatchObject({ duree: 1 });
    expect(getSuccessLabel).toHaveBeenCalledWith(expect.anything(), { elapsedMinutes: 0, isUnderOneMinute: true });
  });

  it.each([[undefined], [null], ["not a date"]])(
    "a missing or invalid heureDebut (%p) never writes a NaN duration",
    (heureDebut) => {
      const modifier = jest.spyOn(eventsService, "modifierEvenementOptimistic").mockReturnValue("op1");
      const { result } = renderHook(() => useStopTimedEventWithUndo({ childId: "c1", getSuccessLabel }));
      result.current(sleep({ heureDebut }));
      const changes = modifier.mock.calls[0][2] as Record<string, unknown>;
      expect(changes.heureFin).toEqual(NOW);
      expect(changes).not.toHaveProperty("duree");
      expect(JSON.stringify(changes)).not.toContain("null");
      expect(getSuccessLabel).toHaveBeenCalledWith(expect.anything(), { elapsedMinutes: 0, isUnderOneMinute: true });
    },
  );

  it("the undo puts heureFin and duree back to null, with the stopped event as the rollback", () => {
    const modifier = jest.spyOn(eventsService, "modifierEvenementOptimistic").mockReturnValue("op1");
    const { result } = renderHook(() => useStopTimedEventWithUndo({ childId: "c1", getSuccessLabel }));
    const event = sleep();
    result.current(event);

    (mockShowUndoToast.mock.calls[0][1] as () => void)();

    expect(modifier).toHaveBeenLastCalledWith(
      "c1",
      "ev1",
      { heureFin: null, duree: null },
      { ...event, heureFin: NOW, duree: 90 },
    );
  });

  it("opts.onUndo est appelé quand l'utilisateur annule (et pas avant)", () => {
    jest.spyOn(eventsService, "modifierEvenementOptimistic").mockReturnValue("op1");
    const onUndo = jest.fn();
    const { result } = renderHook(() => useStopTimedEventWithUndo({ childId: "c1", getSuccessLabel }));
    result.current(sleep(), undefined, { onUndo });
    expect(onUndo).not.toHaveBeenCalled();

    (mockShowUndoToast.mock.calls[0][1] as () => void)();

    expect(onUndo).toHaveBeenCalledTimes(1);
  });

  it("does nothing without a child or an event id", () => {
    const modifier = jest.spyOn(eventsService, "modifierEvenementOptimistic").mockReturnValue("op1");
    renderHook(() => useStopTimedEventWithUndo({ childId: null, getSuccessLabel })).result.current(sleep());
    const { result } = renderHook(() => useStopTimedEventWithUndo({ childId: "c1", getSuccessLabel }));
    result.current(null);
    result.current(undefined);
    result.current(sleep({ id: undefined }));
    expect(modifier).not.toHaveBeenCalled();
    expect(mockShowUndoToast).not.toHaveBeenCalled();
  });
});

describe("useStopTimedEventWithUndo (de bout en bout, envoi attendu)", () => {
  const callable = jest.fn();
  beforeEach(() => {
    callable.mockReset();
    (httpsCallable as jest.Mock).mockReturnValue(callable);
  });

  it("awaits the server: the stop is confirmed, then the undo is sent as a second update", async () => {
    callable.mockResolvedValue({ data: { success: true } });
    const { result } = renderHook(() => useStopTimedEventWithUndo({ childId: "c1", getSuccessLabel }));

    result.current(sleep());
    await jest.advanceTimersByTimeAsync(0);

    expect(callable).toHaveBeenCalledTimes(1);
    expect(callable.mock.calls[0][0]).toMatchObject({ childId: "c1", eventId: "ev1", duree: 90 });
    expect(getOptimisticEntries("c1")[0].status).toBe("confirmed");

    (mockShowUndoToast.mock.calls[0][1] as () => void)();
    await jest.advanceTimersByTimeAsync(0);

    expect(callable).toHaveBeenCalledTimes(2);
    expect(callable.mock.calls[1][0]).toMatchObject({ eventId: "ev1", heureFin: null, duree: null });
  });

  it("a stop refused by the server is rolled back and reported, not left looking finished", async () => {
    callable.mockRejectedValue(Object.assign(new Error("refused"), { code: "functions/permission-denied" }));
    const failures: string[] = [];
    const { setOnFailure } = require("@/services/optimisticEventsStore");
    setOnFailure((message: string) => failures.push(message));
    const { result } = renderHook(() => useStopTimedEventWithUndo({ childId: "c1", getSuccessLabel }));

    result.current(sleep());
    await jest.advanceTimersByTimeAsync(5000);

    expect(getOptimisticEntries("c1")).toHaveLength(0);
    expect(failures).toHaveLength(1);
    expect(failures[0]).toContain("Échec de la modification : sommeil");
    setOnFailure(null);
  });
});
