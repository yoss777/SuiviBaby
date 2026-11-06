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
  supprimerEvenement,
  supprimerJalon,
} from "@/services/eventsService";
import type { ParsedCommandResult } from "@/services/voiceCommandService";
import {
  EventLookupError,
  executeCommand,
  executeDelete,
  findEventByIdentifier,
  lookupFailureMessage,
} from "@/hooks/useVoiceEventCreator";

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

describe("executeDelete : message honnête (6.5)", () => {
  beforeEach(() => jest.clearAllMocks());

  it("says the deletion is done when the server did it", async () => {
    (supprimerEvenement as jest.Mock).mockResolvedValueOnce("deleted");
    await expect(executeDelete("biberon", "c1", "e1", feedback)).resolves.toBe(true);
    expect(feedback.showInfo).toHaveBeenCalledWith("Succès", "Biberon supprimé avec succès");
  });

  it("says 'synchronisation en attente' when the deletion was only queued offline", async () => {
    (supprimerEvenement as jest.Mock).mockResolvedValueOnce("queued");
    await expect(executeDelete("biberon", "c1", "e1", feedback)).resolves.toBe(true);
    expect(feedback.showInfo).toHaveBeenCalledWith(
      "Suppression en attente",
      "Biberon : suppression enregistrée, synchronisation en attente. Elle sera effectuée au retour du réseau.",
    );
    expect(feedback.showInfo).not.toHaveBeenCalledWith("Succès", expect.anything());
  });

  it("also covers milestones (jalon)", async () => {
    (supprimerJalon as jest.Mock).mockResolvedValueOnce("queued");
    await executeDelete("jalon", "c1", "e1", feedback);
    expect(feedback.showInfo).toHaveBeenCalledWith("Suppression en attente", expect.stringContaining("synchronisation en attente"));
  });

  it("keeps treating a legacy void result as done", async () => {
    (supprimerEvenement as jest.Mock).mockResolvedValueOnce(undefined);
    await executeDelete("biberon", "c1", "e1", feedback);
    expect(feedback.showInfo).toHaveBeenCalledWith("Succès", "Biberon supprimé avec succès");
  });
});

describe("findEventByIdentifier : introuvable ou erreur réseau (6.5)", () => {
  beforeEach(() => jest.clearAllMocks());
  const identifier = { type: "biberon", isLast: true } as any;

  it("returns null only when nothing matches", async () => {
    (obtenirEvenements as jest.Mock).mockResolvedValueOnce([]);
    await expect(findEventByIdentifier(identifier, "c1")).resolves.toBeNull();
  });

  it("throws a network lookup error instead of pretending the event does not exist", async () => {
    (obtenirEvenements as jest.Mock).mockRejectedValueOnce(
      Object.assign(new Error("network request failed"), { code: "unavailable" }),
    );
    await expect(findEventByIdentifier(identifier, "c1")).rejects.toMatchObject({
      name: "EventLookupError",
      kind: "network",
    });
  });

  it("throws an 'other' lookup error for any other failure", async () => {
    (obtenirEvenements as jest.Mock).mockRejectedValueOnce(new Error("permission-denied"));
    const error = await findEventByIdentifier(identifier, "c1").catch((e) => e);
    expect(error).toBeInstanceOf(EventLookupError);
    expect(error.kind).toBe("other");
  });
});

describe("lookupFailureMessage", () => {
  it("gives a connection message for a network failure", () => {
    expect(lookupFailureMessage(new EventLookupError("network"))).toEqual({
      title: "Connexion indisponible",
      message: "Impossible de rechercher l'événement : vérifiez votre connexion puis réessayez.",
    });
  });

  it("gives a generic message otherwise, and for non-lookup errors", () => {
    const generic = {
      title: "Erreur",
      message: "La recherche de l'événement a échoué. Réessayez dans un instant.",
    };
    expect(lookupFailureMessage(new EventLookupError("other"))).toEqual(generic);
    expect(lookupFailureMessage(new Error("x"))).toEqual(generic);
    expect(lookupFailureMessage(null)).toEqual(generic);
  });
});
