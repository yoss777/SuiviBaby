// Collecte d'export : règle Parent / Proche relue au moment de l'export,
// serveur uniquement, avertissements avant export.
import {
  buildPreExportWarnings,
  collectChildExportData,
  EXPORT_OFFLINE_MESSAGE,
  ExportOfflineError,
  getExportAuthorUid,
  loadChildExportCounts,
} from "@/services/exportCollector";
import { getExportEventTypes } from "@/services/eventTypeSupport";

const mockAccess = jest.fn();
const mockChildDoc = jest.fn();
const mockEvents = jest.fn();
const mockLikes = jest.fn();
const mockComments = jest.fn();
const mockCountEvents = jest.fn();
const mockCountLikes = jest.fn();
const mockCountComments = jest.fn();
const mockIsOnline = jest.fn();

jest.mock("@/services/accessRepository", () => ({
  getAccessDocFromServer: (...a: unknown[]) => mockAccess(...a),
}));
jest.mock("@/services/childRepository", () => ({
  getChildDocFromServer: (...a: unknown[]) => mockChildDoc(...a),
}));
jest.mock("@/services/eventsRepository", () => ({
  EXPORT_MAX_DOCS: 100000,
  getEventsForExport: (...a: unknown[]) => mockEvents(...a),
  getLikesForExport: (...a: unknown[]) => mockLikes(...a),
  getCommentsForExport: (...a: unknown[]) => mockComments(...a),
  countEventsForExport: (...a: unknown[]) => mockCountEvents(...a),
  countLikesForExport: (...a: unknown[]) => mockCountLikes(...a),
  countCommentsForExport: (...a: unknown[]) => mockCountComments(...a),
}));
jest.mock("@/services/offlineQueueService", () => ({
  isOnline: () => mockIsOnline(),
}));

const ALL_TYPES = getExportEventTypes();
const accessOf = (role: string | null) => ({
  exists: () => role !== null,
  data: () => ({ role }),
});
const docs = (rows: Array<Record<string, unknown> & { id: string }>) => ({
  docs: rows.map((r) => ({ id: r.id, data: () => r })),
  truncated: false,
});
const SELECT_ALL = { eventTypes: ALL_TYPES as string[], includeLikes: true, includeComments: true };

beforeEach(() => {
  jest.clearAllMocks();
  mockIsOnline.mockResolvedValue(true);
  mockChildDoc.mockResolvedValue({ exists: () => true, data: () => ({ name: "Léo", deletedAt: "x" }) });
  mockEvents.mockResolvedValue(docs([]));
  mockLikes.mockResolvedValue(docs([]));
  mockComments.mockResolvedValue(docs([]));
  mockCountEvents.mockResolvedValue(0);
  mockCountLikes.mockResolvedValue(0);
  mockCountComments.mockResolvedValue(0);
});

describe("getExportAuthorUid", () => {
  it.each([
    ["owner", undefined],
    ["admin", undefined],
    ["contributor", "u1"],
    ["viewer", "u1"],
    [null, "u1"],
  ])("rôle %s", (role, expected) => {
    expect(getExportAuthorUid(role as never, "u1")).toBe(expected);
  });
});

describe("collectChildExportData : règle par enfant, rôle relu à l'export", () => {
  it("Parent de A : tous les événements ; Proche de B : seulement ses saisies", async () => {
    mockAccess.mockImplementation(async (childId: string) => accessOf(childId === "A" ? "owner" : "viewer"));
    mockEvents.mockImplementation(async (childId: string, opts: { authorUid?: string }) =>
      docs(
        [
          { id: "e1", childId, userId: "me", type: "biberon" },
          { id: "e2", childId, userId: "other", type: "biberon" },
        ].filter((e) => !opts.authorUid || e.userId === opts.authorUid),
      ),
    );

    const a = await collectChildExportData("A", "me", SELECT_ALL);
    const b = await collectChildExportData("B", "me", SELECT_ALL);

    expect(a.role).toBe("owner");
    expect(a.events.map((e) => e.id)).toEqual(["e1", "e2"]);
    expect(b.role).toBe("viewer");
    expect(b.events.map((e) => e.id)).toEqual(["e1"]);
    expect(mockEvents).toHaveBeenCalledWith("B", expect.objectContaining({ authorUid: "me" }));
    expect(mockLikes).toHaveBeenCalledWith("B", "me");
    expect(mockComments).toHaveBeenCalledWith("B", "me");
  });

  it("défense en profondeur : un Proche n'exporte jamais l'événement d'un autre, même renvoyé par erreur", async () => {
    mockAccess.mockResolvedValue(accessOf("contributor"));
    mockEvents.mockResolvedValue(
      docs([
        { id: "mine", userId: "me", type: "selle" },
        { id: "theirs", userId: "other", type: "selle" },
      ]),
    );
    const res = await collectChildExportData("B", "me", SELECT_ALL);
    expect(res.events.map((e) => e.id)).toEqual(["mine"]);
  });

  it("rôle rétrogradé entre l'ouverture et l'export : l'export suit le nouveau rôle", async () => {
    mockAccess.mockResolvedValueOnce(accessOf("owner"));
    await loadChildExportCounts("A", "me"); // ouverture de l'écran
    mockAccess.mockResolvedValueOnce(accessOf("viewer")); // rétrogradé ensuite
    await collectChildExportData("A", "me", SELECT_ALL);
    expect(mockEvents).toHaveBeenCalledWith("A", expect.objectContaining({ authorUid: "me" }));
    expect(mockAccess).toHaveBeenCalledTimes(2);
  });

  it("Parent devenu Proche : le rôle vient du serveur, pas d'un état d'écran", async () => {
    mockAccess.mockResolvedValue(accessOf("admin"));
    await collectChildExportData("A", "me", SELECT_ALL);
    expect(mockEvents).toHaveBeenLastCalledWith("A", expect.not.objectContaining({ authorUid: expect.anything() }));
  });

  it("types sélectionnés : lecture ciblée par type, et rien si aucun type", async () => {
    mockAccess.mockResolvedValue(accessOf("owner"));
    await collectChildExportData("A", "me", { eventTypes: ["biberon", "selle"], includeLikes: false, includeComments: false });
    expect(mockEvents).toHaveBeenCalledTimes(2);
    expect(mockEvents).toHaveBeenCalledWith("A", expect.objectContaining({ type: "biberon" }));
    expect(mockEvents).toHaveBeenCalledWith("A", expect.objectContaining({ type: "selle" }));
    expect(mockLikes).not.toHaveBeenCalled();
    expect(mockComments).not.toHaveBeenCalled();

    mockEvents.mockClear();
    await collectChildExportData("A", "me", { eventTypes: [], includeLikes: true, includeComments: false });
    expect(mockEvents).not.toHaveBeenCalled();
    expect(mockLikes).toHaveBeenCalled();
  });

  it("tous les types : une seule lecture (sans filtre de type)", async () => {
    mockAccess.mockResolvedValue(accessOf("owner"));
    await collectChildExportData("A", "me", SELECT_ALL);
    expect(mockEvents).toHaveBeenCalledTimes(1);
    expect(mockEvents.mock.calls[0][1]).not.toHaveProperty("type");
  });

  it("retire les champs techniques du profil et signale la troncature", async () => {
    mockAccess.mockResolvedValue(accessOf("owner"));
    mockEvents.mockResolvedValue({ ...docs([{ id: "e1", userId: "me", type: "biberon" }]), truncated: true });
    const res = await collectChildExportData("A", "me", SELECT_ALL);
    expect(res.profile).toEqual({ name: "Léo" });
    expect(res.truncated).toBe(true);
  });
});

describe("hors ligne : jamais d'export partiel", () => {
  it("réseau coupé détecté avant toute lecture", async () => {
    mockIsOnline.mockResolvedValue(false);
    await expect(collectChildExportData("A", "me", SELECT_ALL)).rejects.toBeInstanceOf(ExportOfflineError);
    expect(mockAccess).not.toHaveBeenCalled();
    expect(mockEvents).not.toHaveBeenCalled();
  });

  it("erreur serveur « unavailable » pendant la lecture : message de connexion requise", async () => {
    mockAccess.mockResolvedValue(accessOf("owner"));
    mockEvents.mockRejectedValue(Object.assign(new Error("client is offline"), { code: "unavailable" }));
    await expect(collectChildExportData("A", "me", SELECT_ALL)).rejects.toThrow(EXPORT_OFFLINE_MESSAGE);
  });

  it("lecture du rôle impossible (hors ligne) : l'export échoue, pas de repli sur un rôle en cache", async () => {
    mockAccess.mockRejectedValue(Object.assign(new Error("offline"), { code: "unavailable" }));
    await expect(collectChildExportData("A", "me", SELECT_ALL)).rejects.toBeInstanceOf(ExportOfflineError);
    expect(mockEvents).not.toHaveBeenCalled();
  });

  it("une erreur non réseau (droits) reste une erreur ordinaire", async () => {
    mockAccess.mockResolvedValue(accessOf("owner"));
    mockEvents.mockRejectedValue(Object.assign(new Error("denied"), { code: "permission-denied" }));
    const err = await collectChildExportData("A", "me", SELECT_ALL).catch((e) => e);
    expect(err).not.toBeInstanceOf(ExportOfflineError);
    expect(err.message).toBe("denied");
  });
});

describe("loadChildExportCounts", () => {
  it("Parent : décomptes de tout le suivi + ses likes/commentaires, un décompte par type", async () => {
    mockAccess.mockResolvedValue(accessOf("owner"));
    mockCountEvents.mockImplementation(async (_c: string, o: { type: string }) => (o.type === "biberon" ? 4 : 0));
    mockCountLikes.mockResolvedValue(2);
    mockCountComments.mockResolvedValue(1);
    const res = await loadChildExportCounts("A", "me");
    expect(res.role).toBe("owner");
    expect(res.events.biberon).toBe(4);
    expect(res.likes).toBe(2);
    expect(res.comments).toBe(1);
    expect(mockCountEvents).toHaveBeenCalledTimes(ALL_TYPES.length);
    expect(mockCountEvents).toHaveBeenCalledWith("A", { type: "biberon", authorUid: undefined });
  });

  it("Proche : décomptes limités à ses saisies", async () => {
    mockAccess.mockResolvedValue(accessOf("viewer"));
    await loadChildExportCounts("B", "me");
    expect(mockCountEvents).toHaveBeenCalledWith("B", { type: "biberon", authorUid: "me" });
  });

  it("hors ligne : échec explicite (l'écran affiche « — »)", async () => {
    mockAccess.mockResolvedValue(accessOf("owner"));
    mockCountEvents.mockRejectedValue(Object.assign(new Error("offline"), { code: "unavailable" }));
    await expect(loadChildExportCounts("A", "me")).rejects.toBeInstanceOf(ExportOfflineError);
  });
});

describe("buildPreExportWarnings", () => {
  const counts = (events: number, likes = 0, comments = 0) => ({
    role: "owner" as const,
    events: { biberon: events },
    likes,
    comments,
  });

  it("aucun avertissement sans saisie en attente ni volume excessif", () => {
    expect(
      buildPreExportWarnings({
        selectedChildIds: ["A"],
        pendingChildIds: new Set(["Z"]),
        countsByChild: { A: counts(10) },
      }),
    ).toEqual([]);
  });

  it("saisies en attente pour un enfant sélectionné : avertissement exact", () => {
    const warnings = buildPreExportWarnings({
      selectedChildIds: ["A", "B"],
      pendingChildIds: new Set(["B"]),
      countsByChild: {},
    });
    expect(warnings).toEqual([
      "Des saisies sont en attente d'envoi : elles ne figureront pas dans l'export. Reconnectez-vous et réessayez.",
    ]);
  });

  it("volume au-delà du plafond : avertissement explicite", () => {
    const warnings = buildPreExportWarnings({
      selectedChildIds: ["A"],
      pendingChildIds: new Set(),
      countsByChild: { A: counts(100001) },
    });
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain("100 000");
  });
});
