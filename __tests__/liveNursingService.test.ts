// Tétée partagée entre aidants (children/{id}/live/nursing) : gardes d'erreur.
// Hors ligne : état connu gardé, rien de signalé. Accès retiré ou règle :
// plus de tétée affichée, erreur signalée.
const mockCapture = jest.fn();
jest.mock("@/utils/errorReporting", () => ({ captureServiceError: (...a: unknown[]) => mockCapture(...a) }));
let mockUid: string | null = "u1";
jest.mock("@/config/firebase", () => ({ db: {}, auth: { get currentUser() { return mockUid ? { uid: mockUid } : null; } } }));

import { onSnapshot, setDoc } from "firebase/firestore";

import { liveNursingRemote } from "@/services/liveNursingService";

const mocked = <T>(fn: T) => fn as unknown as jest.Mock;
const offline = Object.assign(new Error("offline"), { code: "unavailable" });
const denied = Object.assign(new Error("Missing or insufficient permissions."), { code: "permission-denied" });
const state = { leftSeconds: 30, rightSeconds: 0, runningSide: "left", runningSince: 1000, startedAt: 1000, updatedAt: 1000 };

beforeEach(() => {
  jest.clearAllMocks();
  mockUid = "u1";
});

function subscribeWithError(error: unknown) {
  let onError: (e: unknown) => void = () => {};
  mocked(onSnapshot).mockImplementation((_ref: unknown, _next: unknown, err: (e: unknown) => void) => {
    onError = err;
    return jest.fn();
  });
  const onChange = jest.fn();
  liveNursingRemote.subscribe("c1", onChange);
  onError(error);
  return onChange;
}

it("abonnement hors ligne : l'état connu reste, rien n'est signalé", () => {
  const onChange = subscribeWithError(offline);
  expect(onChange).not.toHaveBeenCalled();
  expect(mockCapture).not.toHaveBeenCalled();
});

it("abonnement refusé (accès retiré) : plus de tétée affichée, erreur signalée", () => {
  const onChange = subscribeWithError(denied);
  expect(onChange).toHaveBeenCalledWith(null);
  expect(mockCapture).toHaveBeenCalledWith(denied, expect.objectContaining({ service: "liveNursing", operation: "subscribe" }));
});

it("écriture hors ligne : l'erreur remonte à l'appelant, sans signalement", async () => {
  mocked(setDoc).mockRejectedValueOnce(offline);
  await expect(liveNursingRemote.write("c1", state as never)).rejects.toBe(offline);
  expect(mockCapture).not.toHaveBeenCalled();
});

it("écriture refusée : signalée ; sans utilisateur connecté : rien n'est écrit", async () => {
  mocked(setDoc).mockRejectedValueOnce(denied);
  await expect(liveNursingRemote.write("c1", state as never)).rejects.toBe(denied);
  expect(mockCapture).toHaveBeenCalledWith(denied, expect.objectContaining({ operation: "write" }));
  mockUid = null;
  mocked(setDoc).mockClear();
  await liveNursingRemote.write("c1", state as never);
  expect(setDoc).not.toHaveBeenCalled();
});
