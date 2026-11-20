// Écran Sauvegarde : texte d'état honnête selon la file hors ligne.
jest.mock("@/services/offlineQueueService", () => ({ getWaitingCount: jest.fn() }));
jest.mock("@/utils/errorReporting", () => ({ captureServiceError: jest.fn() }));
jest.mock("expo-router", () => ({ Stack: { Screen: () => null }, useFocusEffect: jest.fn(), useRouter: jest.fn() }));
import { backupStatusText, WAITING_UNKNOWN } from "@/app/settings/backup";

describe("backupStatusText", () => {
  it("dit l'état réel de la file", () => {
    expect(backupStatusText(null)).toBe("Vérification en cours…");
    expect(backupStatusText(0)).toBe("Aucune saisie en attente d'envoi.");
    // Lecture impossible : jamais « rien en attente » (revue ECC 1.0.24).
    expect(backupStatusText(WAITING_UNKNOWN)).toBe("Impossible de vérifier l'envoi pour le moment. Réessayez plus tard.");
    expect(backupStatusText(1)).toBe("1 saisie attend le réseau pour être envoyée.");
    expect(backupStatusText(3)).toBe("3 saisies attendent le réseau pour être envoyées.");
  });
});
