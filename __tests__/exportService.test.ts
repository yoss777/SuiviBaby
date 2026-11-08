import { exportAllEventsCSV } from "@/services/exportService";
import { ExportOfflineError } from "@/services/exportCollector";
import * as FileSystem from "expo-file-system/legacy";

const mockCollect = jest.fn();
const mockIsOnline = jest.fn();
const mockPending = jest.fn();

jest.mock("expo-file-system/legacy", () => ({
  writeAsStringAsync: jest.fn(async () => undefined),
  EncodingType: { UTF8: "utf8" },
}));
jest.mock("@/services/tempShareService", () => ({
  prepareExportFile: jest.fn(async (n: string) => `/tmp/${n}`),
  shareTempFile: jest.fn(async () => true),
  deleteTempFile: jest.fn(async () => undefined),
}));
jest.mock("@/services/exportCollector", () => ({
  ...jest.requireActual("@/services/exportCollector"),
  collectChildExportData: (...a: unknown[]) => mockCollect(...a),
}));
jest.mock("@/services/offlineQueueService", () => ({
  isOnline: () => mockIsOnline(),
  getPendingChildIds: () => mockPending(),
}));
jest.mock("@/services/hiddenPhotosService", () => ({
  getHiddenEventIds: jest.fn(async () => []),
}));

const { prepareExportFile, shareTempFile } = jest.requireMock("@/services/tempShareService");
const MESSAGE = "Connexion requise pour exporter vos données";
const collected = (events: unknown[]) => ({
  role: "owner",
  profile: {},
  events,
  likes: [],
  comments: [],
  truncated: false,
});

describe("exportAllEventsCSV", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockIsOnline.mockResolvedValue(true);
    mockPending.mockResolvedValue(new Set());
    mockCollect.mockResolvedValue(collected([]));
  });

  it("lit chaque type exporté (nettoyage_nez et couche inclus), sans likes ni commentaires", async () => {
    const res = await exportAllEventsCSV("c1", "Léa", "u1");
    const [childId, uid, selection] = mockCollect.mock.calls[0];
    expect([childId, uid]).toEqual(["c1", "u1"]);
    expect(selection.eventTypes).toContain("nettoyage_nez");
    expect(selection.eventTypes).toContain("couche");
    expect(selection.includeLikes).toBe(false);
    expect(selection.includeComments).toBe(false);
    expect(res.cancelled).toBe(false);
  });

  it("hors ligne : aucune lecture, aucun fichier, message de connexion", async () => {
    mockIsOnline.mockResolvedValue(false);
    await expect(exportAllEventsCSV("c1", "Léa", "u1")).rejects.toThrow(MESSAGE);
    expect(mockCollect).not.toHaveBeenCalled();
    expect(prepareExportFile).not.toHaveBeenCalled();
    expect(FileSystem.writeAsStringAsync).not.toHaveBeenCalled();
    expect(shareTempFile).not.toHaveBeenCalled();
  });

  it("une lecture en échec fait échouer tout l'export, sans fichier", async () => {
    mockCollect.mockRejectedValue(new Error("boom"));
    await expect(exportAllEventsCSV("c1", "Léa", "u1")).rejects.toThrow(MESSAGE);
    expect(prepareExportFile).not.toHaveBeenCalled();
    expect(FileSystem.writeAsStringAsync).not.toHaveBeenCalled();
  });

  it("propage ExportOfflineError du collecteur", async () => {
    mockCollect.mockRejectedValue(new ExportOfflineError());
    await expect(exportAllEventsCSV("c1", "Léa", "u1")).rejects.toBeInstanceOf(ExportOfflineError);
    expect(prepareExportFile).not.toHaveBeenCalled();
  });

  it("Proche : le rôle est relu par le collecteur (uid transmis) et seules ses saisies sortent", async () => {
    mockCollect.mockResolvedValue(
      collected([
        { id: "e1", type: "biberon", userId: "u1", quantite: 90, date: { seconds: 1700000000 } },
      ]),
    );
    await exportAllEventsCSV("c1", "Léa", "u-proche");
    expect(mockCollect.mock.calls[0][1]).toBe("u-proche");
    const csv = (FileSystem.writeAsStringAsync as jest.Mock).mock.calls[0][1] as string;
    expect(csv.split("\n")).toHaveLength(2);
    expect(csv).toContain("90ml");
  });

  it("ignore les types hors export et reste au même format", async () => {
    mockCollect.mockResolvedValue(
      collected([
        { id: "e1", type: "biberon", quantite: 90, note: "a,b", date: { seconds: 1700000000 } },
        { id: "e2", type: "inconnu", date: { seconds: 1700000000 } },
      ]),
    );
    await exportAllEventsCSV("c1", "Léa", "u1");
    const csv = (FileSystem.writeAsStringAsync as jest.Mock).mock.calls[0][1] as string;
    const lines = csv.replace("﻿", "").split("\n");
    expect(lines[0]).toBe("Date,Heure,Type,Details,Note");
    expect(lines).toHaveLength(2);
    expect(lines[1]).toMatch(/,biberon,90ml,"a,b"$/);
  });

  it("exports a {seconds: 0} date (epoch) instead of \"Invalid Date\"", async () => {
    mockCollect.mockResolvedValue(collected([{ id: "e0", type: "couche", date: { seconds: 0 } }]));
    await exportAllEventsCSV("c1", "Léa", "u1");
    const csv = (FileSystem.writeAsStringAsync as jest.Mock).mock.calls[0][1] as string;
    expect(csv).not.toContain("Invalid Date");
    expect(csv).toMatch(/\b(31\/12\/1969|01\/01\/1970)\b/);
  });

  describe("saisies en attente", () => {
    it("demande confirmation ; annuler = aucun fichier, aucune lecture", async () => {
      mockPending.mockResolvedValue(new Set(["c1"]));
      const confirmPending = jest.fn(async () => false);
      const res = await exportAllEventsCSV("c1", "Léa", "u1", { confirmPending });
      expect(confirmPending).toHaveBeenCalledTimes(1);
      expect(res.cancelled).toBe(true);
      expect(mockCollect).not.toHaveBeenCalled();
      expect(prepareExportFile).not.toHaveBeenCalled();
    });

    it("« Exporter quand même » produit le fichier", async () => {
      mockPending.mockResolvedValue(new Set(["c1"]));
      const res = await exportAllEventsCSV("c1", "Léa", "u1", { confirmPending: async () => true });
      expect(res.cancelled).toBe(false);
      expect(shareTempFile).toHaveBeenCalledTimes(1);
    });

    it("pas d'avertissement si rien n'attend pour cet enfant", async () => {
      mockPending.mockResolvedValue(new Set(["autre"]));
      const confirmPending = jest.fn(async () => false);
      await exportAllEventsCSV("c1", "Léa", "u1", { confirmPending });
      expect(confirmPending).not.toHaveBeenCalled();
      expect(shareTempFile).toHaveBeenCalledTimes(1);
    });

    it("hors ligne avec saisies en attente : échec de connexion avant l'avertissement", async () => {
      mockIsOnline.mockResolvedValue(false);
      mockPending.mockResolvedValue(new Set(["c1"]));
      const confirmPending = jest.fn(async () => true);
      await expect(exportAllEventsCSV("c1", "Léa", "u1", { confirmPending })).rejects.toThrow(MESSAGE);
      expect(confirmPending).not.toHaveBeenCalled();
    });
  });

  it("nettoie le fichier temporaire si l'écriture échoue", async () => {
    const { deleteTempFile } = jest.requireMock("@/services/tempShareService");
    (FileSystem.writeAsStringAsync as jest.Mock).mockRejectedValueOnce(new Error("disk"));
    await expect(exportAllEventsCSV("c1", "Léa", "u1")).rejects.toThrow("disk");
    expect(deleteTempFile).toHaveBeenCalledTimes(1);
  });
});
