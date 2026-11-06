/* eslint-disable import/first */
// Revue « échecs silencieux » (M4) : supprimerJalon supprime l'événement
// d'abord, ne nettoie les photos que si la suppression a abouti, et signale
// une lecture impossible au lieu de l'avaler.

jest.mock("@/utils/errorReporting", () => ({
  addBreadcrumb: jest.fn(),
  captureServiceError: jest.fn(),
}));
jest.mock("@/config/firebase", () => ({
  auth: { currentUser: { uid: "u1", getIdToken: jest.fn(() => Promise.resolve("tok")) } },
  db: {},
  functions: {},
}));
const mockObtenir = jest.fn();
const mockSupprimer = jest.fn();
jest.mock("@/services/eventsService", () => ({
  obtenirEvenement: (...a: unknown[]) => mockObtenir(...a),
  supprimerEvenement: (...a: unknown[]) => mockSupprimer(...a),
}));

import { captureServiceError } from "@/utils/errorReporting";
import { supprimerJalon } from "@/services/events/photoCleanup";

const fetchMock = jest.fn();
const calls: string[] = [];
const PHOTO = "children/c1/jalons/a.jpg";

beforeEach(() => {
  jest.clearAllMocks();
  calls.length = 0;
  jest.spyOn(console, "log").mockImplementation(() => {});
  jest.spyOn(console, "error").mockImplementation(() => {});
  jest.spyOn(console, "warn").mockImplementation(() => {});
  (global as any).fetch = fetchMock;
  fetchMock.mockImplementation(() => {
    calls.push("fetch");
    return Promise.resolve({ ok: true, status: 200, text: () => Promise.resolve("") });
  });
  mockObtenir.mockResolvedValue({ id: "j1", photos: [PHOTO] });
  mockSupprimer.mockImplementation(() => {
    calls.push("delete");
    return Promise.resolve("deleted");
  });
});
afterEach(() => jest.restoreAllMocks());

describe("supprimerJalon", () => {
  it("supprime l'événement AVANT les photos, puis nettoie le stockage", async () => {
    await expect(supprimerJalon("c1", "j1")).resolves.toBe("deleted");
    expect(calls[0]).toBe("delete");
    expect(calls.filter((c) => c === "fetch").length).toBeGreaterThan(0);
  });

  it("ne touche pas aux photos quand la suppression échoue : le jalon pointe toujours dessus", async () => {
    mockSupprimer.mockRejectedValue(new Error("permission-denied"));
    await expect(supprimerJalon("c1", "j1")).rejects.toThrow("permission-denied");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("ne touche pas aux photos quand la suppression est seulement mise en file (« queued »)", async () => {
    mockSupprimer.mockResolvedValue("queued");
    await expect(supprimerJalon("c1", "j1")).resolves.toBe("queued");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("signale à Sentry une lecture impossible, supprime quand même, sans toucher au stockage", async () => {
    const error = new Error("unavailable");
    mockObtenir.mockRejectedValue(error);
    await expect(supprimerJalon("c1", "j1")).resolves.toBe("deleted");
    expect(captureServiceError).toHaveBeenCalledWith(
      error,
      expect.objectContaining({ service: "events", operation: "supprimerJalonRead" }),
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("un jalon sans photo : rien à nettoyer", async () => {
    mockObtenir.mockResolvedValue({ id: "j1" });
    await expect(supprimerJalon("c1", "j1")).resolves.toBe("deleted");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("un nettoyage de photo qui échoue n'annule pas la suppression et est signalé", async () => {
    fetchMock.mockRejectedValue(new Error("storage down"));
    await expect(supprimerJalon("c1", "j1")).resolves.toBe("deleted");
    expect(captureServiceError).toHaveBeenCalled();
  });
});
