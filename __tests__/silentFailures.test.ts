import {
  alreadyRunningNotice,
  notifyOptimisticFailure,
  notifyOptimisticNotice,
  resetOptimisticStoreForTests,
  setOnFailure,
} from "@/services/optimisticEventsStore";
import { failureReason, isNetworkError, isPermanentError } from "@/utils/networkError";

const err = (code: string, message = "") => Object.assign(new Error(message), { code });

describe("refus définitifs du serveur", () => {
  it("invalid-argument, permission-denied, not-found, aborted : définitifs", () => {
    for (const code of ["functions/invalid-argument", "permission-denied", "not-found", "functions/aborted"]) {
      expect(isPermanentError(err(code))).toBe(true);
    }
    expect(isPermanentError(err("functions/unavailable"))).toBe(false);
  });

  it("un refus dont le texte contient « internal » n'est pas pris pour une panne réseau", () => {
    expect(isNetworkError(err("functions/invalid-argument", "internal value too long"))).toBe(false);
    expect(isNetworkError(err("functions/unavailable"))).toBe(true);
  });

  it("raison lisible : message français du serveur, ou texte selon le code", () => {
    expect(failureReason(err("functions/invalid-argument", "Durée sommeil doit être entre 1 et 1440 minutes."))).toBe(
      "Durée sommeil doit être entre 1 et 1440 minutes.",
    );
    expect(failureReason(err("functions/permission-denied", "PERMISSION_DENIED"))).toMatch(/droit/);
    expect(failureReason(err("functions/unavailable"))).toBeUndefined();
  });
});

describe("messages d'échec jamais perdus", () => {
  beforeEach(() => resetOptimisticStoreForTests());

  it("la raison suit le message d'échec", () => {
    const cb = jest.fn();
    setOnFailure(cb);
    notifyOptimisticFailure({
      event: {},
      operation: "update",
      eventType: "sommeil",
      childId: "c",
      retryData: {},
      retryable: false,
      reason: "Durée sommeil doit être entre 1 et 1440 minutes.",
    });
    expect(cb.mock.calls[0][0]).toMatch(/Échec de la modification.*1440 minutes/);
  });

  it("échec sans écouteur : gardé puis montré à l'enregistrement de l'écouteur", () => {
    notifyOptimisticNotice(alreadyRunningNotice("sommeil"));
    const cb = jest.fn();
    setOnFailure(cb);
    expect(cb).toHaveBeenCalledTimes(1);
    expect(cb.mock.calls[0][0]).toMatch(/déjà en cours : la nouvelle saisie n'a pas été ajoutée/);
  });
});
