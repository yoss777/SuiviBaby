const { mockFirestore, mockDocRef, mockGet, mockAdd, mockQueryChain, mockRunTransaction } = require("./setup");
const fns = require("../index");
const auth = (uid, data = {}) => ({ auth: { uid, token: { email: `${uid}@t.com`, admin: false } }, data, app: true });
const adm = (uid, data = {}) => ({ auth: { uid, token: { email: `${uid}@t.com`, admin: true } }, data, app: true });
const doc = (data) => ({ exists: true, data: () => data, id: "id", ref: { id: "id" } });
const no = () => ({ exists: false, data: () => null, id: "id" });
const snap = (ds = []) => ({ docs: ds.map((d, i) => ({ id: d.id || `d${i}`, data: () => d.data || d, ref: { id: d.id || `d${i}` } })), empty: !ds.length, size: ds.length });
const access = () => { mockFirestore.doc.mockImplementation((p) => { if (p?.includes("rate_limits")) return { get: jest.fn().mockResolvedValue(no()), set: jest.fn() }; if (p?.includes("access")) return { get: jest.fn().mockResolvedValue(doc({ role: "owner" })) }; return { get: jest.fn().mockResolvedValue(no()), delete: jest.fn() }; }); };
beforeEach(() => { jest.clearAllMocks(); mockGet.mockResolvedValue(no()); mockAdd.mockResolvedValue({ id: "new" }); mockQueryChain.get.mockResolvedValue(snap()); mockQueryChain.where.mockReturnThis(); mockQueryChain.limit.mockReturnThis(); mockRunTransaction.mockImplementation(async (fn) => fn({ get: jest.fn(async (ref) => ref.get()), set: jest.fn(), update: jest.fn(), delete: jest.fn() })); });

describe("validateAndCreateEvent", () => {
  it("rejects unauthenticated", async () => { await expect(fns.validateAndCreateEvent({ auth: null, data: {} })).rejects.toThrow("Authentification"); });
  it("rejects no childId", async () => { mockFirestore.doc.mockReturnValue({ get: jest.fn().mockResolvedValue(no()), set: jest.fn() }); await expect(fns.validateAndCreateEvent(auth("u1", { type: "biberon" }))).rejects.toThrow("childId"); });
  it("rejects bad type", async () => { mockFirestore.doc.mockReturnValue({ get: jest.fn().mockResolvedValue(no()), set: jest.fn() }); await expect(fns.validateAndCreateEvent(auth("u1", { childId: "c1", type: "bad" }))).rejects.toThrow("invalide"); });
  it("rejects biberon qty>500", async () => { access(); await expect(fns.validateAndCreateEvent(auth("u1", { childId: "c1", type: "biberon", quantite: 999 }))).rejects.toThrow("500"); });
  it("rejects temp out of range", async () => { access(); await expect(fns.validateAndCreateEvent(auth("u1", { childId: "c1", type: "temperature", valeur: 50 }))).rejects.toThrow("34°C"); });
  it("rejects sommeil>1440", async () => { access(); await expect(fns.validateAndCreateEvent(auth("u1", { childId: "c1", type: "sommeil", duree: 2000 }))).rejects.toThrow("1440"); });
  it("rejects medicament no name", async () => { access(); await expect(fns.validateAndCreateEvent(auth("u1", { childId: "c1", type: "medicament", nomMedicament: "" }))).rejects.toThrow("médicament"); });
  it("rejects croissance bad weight", async () => { access(); await expect(fns.validateAndCreateEvent(auth("u1", { childId: "c1", type: "croissance", poidsKg: 100 }))).rejects.toThrow("50 kg"); });
  it("rejects bain temp>45", async () => { access(); await expect(fns.validateAndCreateEvent(auth("u1", { childId: "c1", type: "bain", temperatureEau: 50 }))).rejects.toThrow("45°C"); });
  it("creates valid event", async () => { access(); mockFirestore.collection.mockReturnValue({ add: jest.fn().mockResolvedValue({ id: "e1" }), where: jest.fn().mockReturnThis(), limit: jest.fn().mockReturnThis(), get: jest.fn().mockResolvedValue(snap()) }); expect(await fns.validateAndCreateEvent(auth("u1", { childId: "c1", type: "biberon", quantite: 150 }))).toEqual({ id: "e1" }); });
  it("deduplicates idempotencyKey", async () => { access(); mockFirestore.collection.mockReturnValue({ where: jest.fn().mockReturnThis(), limit: jest.fn().mockReturnThis(), get: jest.fn().mockResolvedValue(snap([{ id: "dup" }])) }); expect(await fns.validateAndCreateEvent(auth("u1", { childId: "c1", type: "biberon", quantite: 100, idempotencyKey: "k" }))).toEqual({ id: "dup" }); });
  it("converts heureDebut and heureFin on create", async () => {
    access();
    const add = jest.fn().mockResolvedValue({ id: "e1" });
    mockFirestore.collection.mockReturnValue({
      add,
      where: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      get: jest.fn().mockResolvedValue(snap()),
    });

    await fns.validateAndCreateEvent(auth("u1", {
      childId: "c1",
      type: "sommeil",
      isNap: true,
      date: { seconds: 1710000000, nanoseconds: 0 },
      heureDebut: { seconds: 1710000000, nanoseconds: 0 },
      heureFin: { seconds: 1710003600, nanoseconds: 0 },
    }));

    expect(add).toHaveBeenCalledWith(expect.objectContaining({
      date: expect.objectContaining({ seconds: 1710000000 }),
      heureDebut: expect.objectContaining({ seconds: 1710000000 }),
      heureFin: expect.objectContaining({ seconds: 1710003600 }),
    }));
  });
});

describe("validateAndUpdateEvent", () => {
  it("converts heureFin on update", async () => {
    access();
    mockDocRef.update.mockResolvedValue(undefined);
    mockFirestore.doc.mockImplementation((p) => {
      if (p?.includes("rate_limits")) return { get: jest.fn().mockResolvedValue(no()), set: jest.fn() };
      if (p?.includes("access")) return { get: jest.fn().mockResolvedValue(doc({ role: "owner" })) };
      return {
        get: jest.fn().mockResolvedValue(doc({ childId: "c1", type: "sommeil" })),
        update: mockDocRef.update,
        delete: jest.fn(),
      };
    });

    await fns.validateAndUpdateEvent(auth("u1", {
      childId: "c1",
      eventId: "e1",
      heureFin: { seconds: 1710003600, nanoseconds: 0 },
    }));

    expect(mockDocRef.update).toHaveBeenCalledWith(expect.objectContaining({
      heureFin: expect.objectContaining({ seconds: 1710003600 }),
    }));
  });

  it("converts null fields to Firestore deletes on update", async () => {
    access();
    mockDocRef.update.mockResolvedValue(undefined);
    mockFirestore.doc.mockImplementation((p) => {
      if (p?.includes("rate_limits")) return { get: jest.fn().mockResolvedValue(no()), set: jest.fn() };
      if (p?.includes("access")) return { get: jest.fn().mockResolvedValue(doc({ role: "owner" })) };
      return {
        get: jest.fn().mockResolvedValue(doc({ childId: "c1", type: "sommeil" })),
        update: mockDocRef.update,
        delete: jest.fn(),
      };
    });

    await fns.validateAndUpdateEvent(auth("u1", {
      childId: "c1",
      eventId: "e1",
      heureFin: null,
      duree: null,
    }));

    expect(mockDocRef.update).toHaveBeenCalledWith(expect.objectContaining({
      heureFin: "DEL",
      duree: "DEL",
    }));
  });
});

describe("deleteEventCascade", () => {
  it("rejects unauthenticated", async () => { await expect(fns.deleteEventCascade({ auth: null, data: {} })).rejects.toThrow("Authentification"); });
  it("rejects missing ids", async () => { mockFirestore.doc.mockReturnValue({ get: jest.fn().mockResolvedValue(no()), set: jest.fn() }); await expect(fns.deleteEventCascade(auth("u1", { childId: "c1" }))).rejects.toThrow("requis"); });
  it("rejects not found", async () => { access(); await expect(fns.deleteEventCascade(auth("u1", { childId: "c1", eventId: "e1" }))).rejects.toThrow("introuvable"); });
  it("rejects wrong child", async () => { mockFirestore.doc.mockImplementation((p) => { if (p?.includes("rate_limits")) return { get: jest.fn().mockResolvedValue(no()), set: jest.fn() }; if (p?.includes("access")) return { get: jest.fn().mockResolvedValue(doc({ role: "owner" })) }; return { get: jest.fn().mockResolvedValue(doc({ childId: "other" })), delete: jest.fn() }; }); await expect(fns.deleteEventCascade(auth("u1", { childId: "c1", eventId: "e1" }))).rejects.toThrow("n'appartient pas"); });
});

describe("revenueCatWebhook", () => {
  const res = () => ({ status: jest.fn().mockReturnThis(), send: jest.fn() });
  it("rejects non-POST", async () => { const r = res(); await fns.revenueCatWebhook({ method: "GET" }, r); expect(r.status).toHaveBeenCalledWith(405); });
  it("rejects no secret", async () => { delete process.env.REVENUECAT_WEBHOOK_SECRET; const r = res(); await fns.revenueCatWebhook({ method: "POST", headers: {}, body: {} }, r); expect(r.status).toHaveBeenCalledWith(500); });
  it("rejects bad auth", async () => { process.env.REVENUECAT_WEBHOOK_SECRET = "s"; const r = res(); await fns.revenueCatWebhook({ method: "POST", headers: { authorization: "Bearer x" }, body: { event: {} } }, r); expect(r.status).toHaveBeenCalledWith(401); delete process.env.REVENUECAT_WEBHOOK_SECRET; });
  it("rejects no event", async () => { process.env.REVENUECAT_WEBHOOK_SECRET = "s"; const r = res(); await fns.revenueCatWebhook({ method: "POST", headers: { authorization: "Bearer s" }, body: {} }, r); expect(r.status).toHaveBeenCalledWith(400); delete process.env.REVENUECAT_WEBHOOK_SECRET; });
});

describe("grandfatherExistingUsers", () => {
  it("rejects unauthenticated", async () => { await expect(fns.grandfatherExistingUsers({ auth: null, data: {} })).rejects.toThrow("Authentification"); });
  it("rejects non-admin", async () => { await expect(fns.grandfatherExistingUsers(auth("u1", { cutoffDate: "2026-01-01" }))).rejects.toThrow("administrateurs"); });
  it("accepts admin", async () => { mockFirestore.collection.mockReturnValue({ where: jest.fn().mockReturnThis(), get: jest.fn().mockResolvedValue(snap()) }); expect(await fns.grandfatherExistingUsers(adm("a1", { cutoffDate: "2026-01-01" }))).toEqual({ success: true, count: 0 }); });
  it("rejects no cutoff", async () => { await expect(fns.grandfatherExistingUsers(adm("a1", {}))).rejects.toThrow("cutoffDate"); });
});

describe("validateReferralCode", () => {
  it("rejects unauthenticated", async () => { await expect(fns.validateReferralCode({ auth: null, data: {} })).rejects.toThrow("Authentification"); });
  it("rejects empty code", async () => { mockFirestore.doc.mockReturnValue({ get: jest.fn().mockResolvedValue(no()), set: jest.fn() }); await expect(fns.validateReferralCode(auth("u1", { referralCode: "" }))).rejects.toThrow("invalide"); });
  it("rejects not found", async () => { mockFirestore.doc.mockReturnValue({ get: jest.fn().mockResolvedValue(no()), set: jest.fn() }); mockFirestore.collection.mockReturnValue({ where: jest.fn().mockReturnThis(), limit: jest.fn().mockReturnThis(), get: jest.fn().mockResolvedValue(snap()) }); await expect(fns.validateReferralCode(auth("u1", { referralCode: "ABC" }))).rejects.toThrow("introuvable"); });
  it("rejects self-referral", async () => { mockFirestore.doc.mockReturnValue({ get: jest.fn().mockResolvedValue(no()), set: jest.fn() }); mockFirestore.collection.mockReturnValue({ where: jest.fn().mockReturnThis(), limit: jest.fn().mockReturnThis(), get: jest.fn().mockResolvedValue(snap([{ id: "u1" }])) }); await expect(fns.validateReferralCode(auth("u1", { referralCode: "ABC" }))).rejects.toThrow("propre code"); });
});

describe("usage quota functions", () => {
  it("returns free voice quota status", async () => {
    mockFirestore.doc.mockImplementation((p) => {
      if (p === "subscriptions/u1") return { get: jest.fn().mockResolvedValue(no()) };
      if (p === "usage_limits/u1") return { get: jest.fn().mockResolvedValue(doc({ voiceCommandDate: new Date().toISOString().split("T")[0], voiceCommandCount: 1 })) };
      return { get: jest.fn().mockResolvedValue(no()) };
    });

    await expect(fns.getUsageQuotaStatus(auth("u1", { feature: "voice" }))).resolves.toMatchObject({
      feature: "voice",
      allowed: true,
      isUnlimited: false,
      used: 1,
      limit: 3,
      remaining: 2,
    });
  });

  it("consumes export quota for free users", async () => {
    mockFirestore.doc.mockImplementation((p) => {
      if (p === "subscriptions/u1") return { get: jest.fn().mockResolvedValue(no()) };
      if (p === "usage_limits/u1") return { get: jest.fn().mockResolvedValue(doc({ pdfExportCount: 0 })) };
      return { get: jest.fn().mockResolvedValue(no()) };
    });

    await expect(fns.consumeUsageQuota(auth("u1", { feature: "export" }))).resolves.toMatchObject({
      feature: "export",
      allowed: true,
      isUnlimited: false,
      used: 1,
      limit: 1,
      remaining: 0,
    });
  });
});

describe("createShareInvitation", () => {
  it("rejects when free sharing limit is reached", async () => {
    mockFirestore.doc.mockImplementation((p) => {
      if (p === "subscriptions/u1") return { get: jest.fn().mockResolvedValue(no()) };
      if (p === "children/c1/access/u1") return { get: jest.fn().mockResolvedValue(doc({ role: "owner" })) };
      if (p === "children/c1") return { get: jest.fn().mockResolvedValue(doc({ name: "Bebe" })) };
      return { get: jest.fn().mockResolvedValue(no()) };
    });

    mockFirestore.collection.mockImplementation((name) => {
      if (name === "children/c1/access") {
        return { get: jest.fn().mockResolvedValue(snap([{ id: "owner", data: { role: "owner" } }, { id: "p1", data: { role: "admin" } }, { id: "p2", data: { role: "viewer" } }])) };
      }
      if (name === "shareInvitations") {
        return { where: jest.fn().mockReturnThis(), limit: jest.fn().mockReturnThis(), get: jest.fn().mockResolvedValue(snap()) };
      }
      if (name === "users") {
        return { where: jest.fn().mockReturnThis(), limit: jest.fn().mockReturnThis(), get: jest.fn().mockResolvedValue(snap([{ id: "invited" }])) };
      }
      return { add: jest.fn().mockResolvedValue({ id: "new" }), where: jest.fn().mockReturnThis(), limit: jest.fn().mockReturnThis(), get: jest.fn().mockResolvedValue(snap()) };
    });

    await expect(fns.createShareInvitation(auth("u1", { childId: "c1", childName: "Bebe", invitedEmail: "target@example.com" }))).rejects.toThrow("2 co-parents maximum");
  });
});
