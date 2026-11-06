/* eslint-disable import/first */
// Sprint 6 (6.9) : arrêt d'un chrono avec annulation. Première partie : le
// hook seul (services simulés). Seconde : de bout en bout avec les vraies
// écritures optimistes, en attendant la fin de l'envoi serveur.

const mockShowUndoToast = jest.fn();
jest.mock("@/contexts/ToastContext", () => ({
  useToast: () => ({ showUndoToast: mockShowUndoToast }),
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

  it("never records a duration below one minute", () => {
    const modifier = jest.spyOn(eventsService, "modifierEvenementOptimistic").mockReturnValue("op1");
    const { result } = renderHook(() => useStopTimedEventWithUndo({ childId: "c1", getSuccessLabel }));
    result.current(sleep({ heureDebut: new Date(NOW.getTime() - 20_000) }));
    expect(modifier.mock.calls[0][2]).toMatchObject({ duree: 1 });
    expect(getSuccessLabel).toHaveBeenCalledWith(expect.anything(), { elapsedMinutes: 0, isUnderOneMinute: true });
  });

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
