/* eslint-disable import/first */

jest.mock("@/services/eventsService", () => ({
  ajouterEvenementOptimistic: jest.fn(),
  modifierEvenementOptimistic: jest.fn(),
  obtenirEvenements: jest.fn(),
  supprimerEvenement: jest.fn(),
  supprimerJalon: jest.fn(),
}));

jest.mock("@/services/voiceCommandService", () => ({
  __esModule: true,
  default: {
    formatDataForFirebase: jest.fn(() => ({
      date: new Date("2026-04-12T10:00:00.000Z"),
      note: "voice",
    })),
  },
  commandTypeToEventType: jest.fn((type: string) => type),
}));

import {
  ajouterEvenementOptimistic,
  obtenirEvenements,
} from "@/services/eventsService";
import type { ParsedCommandResult } from "@/services/voiceCommandService";
import { executeCommand } from "@/hooks/useVoiceEventCreator";

const feedback = {
  showInfo: jest.fn(),
};

describe("useVoiceEventCreator", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("returns true when an add command succeeds", async () => {
    const command: ParsedCommandResult = {
      type: "biberon",
      rawText: "biberon de 150ml",
      childId: "child-1",
      timestamp: new Date("2026-04-12T10:00:00.000Z"),
      quantite: 150,
    };

    const result = await executeCommand(command, "child-1", feedback);

    expect(result).toBe(true);
    expect(ajouterEvenementOptimistic).toHaveBeenCalled();
    expect(feedback.showInfo).toHaveBeenCalledWith("Succès", "Biberon ajouté avec succès");
  });

  it("returns false when legacy couche command has no selected excretion", async () => {
    const command: ParsedCommandResult = {
      type: "couche",
      rawText: "couche",
      childId: "child-1",
      timestamp: new Date("2026-04-12T10:00:00.000Z"),
      pipi: false,
      popo: false,
    };

    const result = await executeCommand(command, "child-1", feedback, true, {
      pipi: false,
      popo: false,
    });

    expect(result).toBe(false);
    expect(ajouterEvenementOptimistic).not.toHaveBeenCalled();
    expect(feedback.showInfo).toHaveBeenCalledWith("Info", "Aucune excrétion à ajouter.");
  });

  it("returns false when a sleep is already ongoing", async () => {
    (obtenirEvenements as jest.Mock).mockResolvedValueOnce([
      { id: "sleep-1", heureDebut: new Date("2026-04-12T08:00:00.000Z"), heureFin: null },
    ]);

    const command: ParsedCommandResult = {
      type: "sommeil",
      rawText: "dodo",
      childId: "child-1",
      timestamp: new Date("2026-04-12T10:00:00.000Z"),
    };

    const result = await executeCommand(command, "child-1", feedback);

    expect(result).toBe(false);
    expect(feedback.showInfo).toHaveBeenCalledWith(
      "Sommeil déjà en cours",
      "Un sommeil est déjà en cours. Terminez-le avant d'en commencer un nouveau.",
    );
  });
});
