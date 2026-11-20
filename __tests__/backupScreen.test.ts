// Écran Sauvegarde : texte d'état honnête selon la file hors ligne.
jest.mock("@/services/offlineQueueService", () => ({ getWaitingCount: jest.fn() }));
jest.mock("expo-router", () => ({ Stack: { Screen: () => null }, useFocusEffect: jest.fn(), useRouter: jest.fn() }));
import { backupStatusText } from "@/app/settings/backup";

describe("backupStatusText", () => {
  it("dit l'état réel de la file", () => {
    expect(backupStatusText(null)).toBe("Vérification en cours…");
    expect(backupStatusText(0)).toBe("Tout est enregistré sur nos serveurs.");
    expect(backupStatusText(1)).toBe("1 saisie attend le réseau pour être envoyée.");
    expect(backupStatusText(3)).toBe("3 saisies attendent le réseau pour être envoyées.");
  });
});
