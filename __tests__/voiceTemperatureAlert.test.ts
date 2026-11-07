/* eslint-disable import/first */
jest.mock("@/services/eventsService", () => ({
  ajouterEvenementOptimistic: jest.fn(),
  modifierEvenementOptimistic: jest.fn(),
  obtenirEvenements: jest.fn(),
  supprimerEvenement: jest.fn(),
  supprimerJalon: jest.fn(),
}));

let mockFormatted: Record<string, unknown> = {};
jest.mock("@/services/voiceCommandService", () => ({
  __esModule: true,
  default: { formatDataForFirebase: jest.fn(() => mockFormatted) },
  commandTypeToEventType: jest.fn((type: string) => type),
}));

import { ajouterEvenementOptimistic, modifierEvenementOptimistic } from "@/services/eventsService";
import type { ParsedCommandResult } from "@/services/voiceCommandService";
import { executeCommand } from "@/services/voiceEventCreator";

const birth = new Date(2026, 0, 15);
const feedback = { showInfo: jest.fn() };
const cmd = (over: Partial<ParsedCommandResult> = {}) =>
  ({ type: "temperature", rawText: "température", childId: "c1", timestamp: new Date(), ...over }) as ParsedCommandResult;

describe("saisie vocale d'une température : même alerte que le formulaire", () => {
  beforeEach(() => jest.clearAllMocks());

  it("moins de 3 mois, 38,5 : alerte urgente non masquable, au lieu du message de succès", async () => {
    mockFormatted = { date: new Date(2026, 2, 1, 10), valeur: 38.5 };
    const showTemperatureAlert = jest.fn();
    const ok = await executeCommand(cmd(), "c1", feedback, undefined, undefined, undefined, {
      birthDate: birth,
      showTemperatureAlert,
    });
    expect(ok).toBe(true);
    expect(ajouterEvenementOptimistic).toHaveBeenCalled();
    expect(showTemperatureAlert).toHaveBeenCalledTimes(1);
    const alert = showTemperatureAlert.mock.calls[0][0];
    expect(alert.level).toBe("urgent");
    expect(alert.dismissible).toBe(false);
    expect(feedback.showInfo).not.toHaveBeenCalled();
  });

  it("utilise l'âge à la date de la mesure (veille du 3e mois / jour du 3e mois)", async () => {
    const showTemperatureAlert = jest.fn();
    mockFormatted = { date: new Date(2026, 3, 14, 10), valeur: 38 };
    await executeCommand(cmd(), "c1", feedback, undefined, undefined, undefined, { birthDate: birth, showTemperatureAlert });
    mockFormatted = { date: new Date(2026, 3, 15, 10), valeur: 38 };
    await executeCommand(cmd(), "c1", feedback, undefined, undefined, undefined, { birthDate: birth, showTemperatureAlert });
    expect(showTemperatureAlert.mock.calls.map(([a]) => a.level)).toEqual(["urgent", "rapide"]);
  });

  it("température sans alerte (37,2) : message de succès habituel", async () => {
    mockFormatted = { date: new Date(2026, 2, 1, 10), valeur: 37.2 };
    const showTemperatureAlert = jest.fn();
    await executeCommand(cmd(), "c1", feedback, undefined, undefined, undefined, { birthDate: birth, showTemperatureAlert });
    expect(showTemperatureAlert).not.toHaveBeenCalled();
    expect(feedback.showInfo).toHaveBeenCalledWith("Succès", "Température ajoutée avec succès");
  });

  it("date de naissance inconnue : alerte générique", async () => {
    mockFormatted = { date: new Date(2026, 2, 1, 10), valeur: 39 };
    const showTemperatureAlert = jest.fn();
    await executeCommand(cmd(), "c1", feedback, undefined, undefined, undefined, { birthDate: null, showTemperatureAlert });
    expect(showTemperatureAlert.mock.calls[0][0].level).toBe("fievre");
  });

  it("hypothermie à la voix : alerte", async () => {
    mockFormatted = { date: new Date(2026, 2, 1, 10), valeur: 35.5 };
    const showTemperatureAlert = jest.fn();
    await executeCommand(cmd(), "c1", feedback, undefined, undefined, undefined, { birthDate: birth, showTemperatureAlert });
    expect(showTemperatureAlert.mock.calls[0][0].level).toBe("hypothermie");
  });

  it("sans gestionnaire d'alerte : comportement inchangé", async () => {
    mockFormatted = { date: new Date(2026, 2, 1, 10), valeur: 39 };
    const ok = await executeCommand(cmd(), "c1", feedback);
    expect(ok).toBe(true);
    expect(feedback.showInfo).toHaveBeenCalledWith("Succès", "Température ajoutée avec succès");
  });

  it("modification vocale de la valeur : alerte à l'âge de la mesure d'origine", async () => {
    const showTemperatureAlert = jest.fn();
    const target = { id: "e1", type: "temperature", date: new Date(2026, 2, 1, 10), valeur: 37 } as never;
    const ok = await executeCommand(
      cmd({ action: "modify", modifications: { valeurTemperature: 38.6 } }),
      "c1", feedback, undefined, undefined, target,
      { birthDate: birth, showTemperatureAlert },
    );
    expect(ok).toBe(true);
    expect(modifierEvenementOptimistic).toHaveBeenCalled();
    expect(showTemperatureAlert.mock.calls[0][0].level).toBe("urgent");
  });
});
