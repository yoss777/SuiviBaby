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
import { executeCommand, executeMultipleCommands } from "@/services/voiceEventCreator";

const birth = new Date(2026, 0, 15);
const feedback = { showInfo: jest.fn() };
const cmd = (over: Partial<ParsedCommandResult> = {}) =>
  ({ type: "temperature", rawText: "température", childId: "c1", timestamp: new Date(), ...over }) as ParsedCommandResult;

beforeEach(() => jest.clearAllMocks());

describe("M4 température vocale sans valeur", () => {
  it("n'enregistre rien, renvoie false et affiche l'orientation selon l'âge", async () => {
    mockFormatted = { date: new Date(2026, 2, 1, 10) };
    const showTemperatureAlert = jest.fn();
    const ok = await executeCommand(cmd(), "c1", feedback, undefined, undefined, undefined, { birthDate: birth, showTemperatureAlert });
    expect(ok).toBe(false);
    expect(ajouterEvenementOptimistic).not.toHaveBeenCalled();
    expect(showTemperatureAlert).not.toHaveBeenCalled();
    const [title, message] = feedback.showInfo.mock.calls[0];
    expect(title).toBe("Température non enregistrée");
    expect(message).toContain("moins de 3 mois");
    expect(message).toContain("appelez le 15");
    expect(feedback.showInfo).not.toHaveBeenCalledWith("Succès", expect.anything());
  });

  it("valeur non numérique (NaN, chaîne) : même comportement", async () => {
    for (const valeur of [NaN, "38", null]) {
      mockFormatted = { date: new Date(2026, 5, 1), valeur };
      const ok = await executeCommand(cmd(), "c1", feedback, undefined, undefined, undefined, { birthDate: birth });
      expect(ok).toBe(false);
    }
    expect(ajouterEvenementOptimistic).not.toHaveBeenCalled();
  });

  it("sans options de santé : n'enregistre pas non plus, message d'âge inconnu", async () => {
    mockFormatted = { date: new Date(2026, 2, 1, 10) };
    expect(await executeCommand(cmd(), "c1", feedback)).toBe(false);
    expect(feedback.showInfo.mock.calls[0][1]).toContain("L'âge de l'enfant n'est pas renseigné");
  });

  it("une valeur valide continue d'être enregistrée", async () => {
    mockFormatted = { date: new Date(2026, 5, 1), valeur: 37.2 };
    expect(await executeCommand(cmd(), "c1", feedback, undefined, undefined, undefined, { birthDate: birth })).toBe(true);
    expect(ajouterEvenementOptimistic).toHaveBeenCalledTimes(1);
  });
});

describe("L5 modification vocale : la note de l'utilisateur est conservée", () => {
  it("n'écrase pas la note avec « Modifié par commande vocale »", async () => {
    const target = { id: "e1", type: "biberon", date: new Date(2026, 2, 1, 10), quantite: 100, note: "Après le bain" } as never;
    await executeCommand(
      cmd({ type: "biberon", action: "modify", modifications: { quantite: 150 } }),
      "c1", feedback, undefined, undefined, target,
    );
    const data = (modifierEvenementOptimistic as jest.Mock).mock.calls[0][2];
    expect(data.quantite).toBe(150);
    expect("note" in data).toBe(false);
    expect(JSON.stringify(data)).not.toContain("Modifié par commande vocale");
  });
});

describe("M5 plusieurs événements vocaux", () => {
  it("n'affiche aucune alerte pendant l'exécution : elle est renvoyée pour s'afficher après", async () => {
    const showTemperatureAlert = jest.fn();
    mockFormatted = { date: new Date(2026, 2, 1, 10), valeur: 38.6 };
    const res = await executeMultipleCommands(
      [cmd(), cmd({ type: "bain" })],
      "c1",
      { birthDate: birth, showTemperatureAlert },
    );
    expect(showTemperatureAlert).not.toHaveBeenCalled();
    expect(res.successCount).toBe(2);
    expect(res.errors).toEqual([]);
    expect(res.alert!.level).toBe("urgent");
  });

  it("retient l'alerte la plus grave", async () => {
    const values = [38.6, 38.6];
    mockFormatted = { date: new Date(2026, 5, 1, 10), valeur: values[0] };
    const res = await executeMultipleCommands([cmd(), cmd()], "c1", { birthDate: birth });
    expect(res.alert!.level).toBe("rapide");
  });

  it("une température sans valeur est comptée en erreur et son orientation est conservée", async () => {
    mockFormatted = { date: new Date(2026, 2, 1, 10) };
    const res = await executeMultipleCommands([cmd(), cmd({ type: "bain" })], "c1", { birthDate: birth });
    expect(res.successCount).toBe(1);
    expect(res.errors).toEqual(["temperature"]);
    expect(res.notices.join(" ")).toContain("appelez le 15");
    expect(res.alert).toBeNull();
  });

  it("sans alerte : pas d'alerte renvoyée", async () => {
    mockFormatted = { date: new Date(2026, 2, 1, 10), valeur: 37 };
    const res = await executeMultipleCommands([cmd(), cmd({ type: "bain" })], "c1", { birthDate: birth });
    expect(res.alert).toBeNull();
    expect(res.successCount).toBe(2);
  });
});
