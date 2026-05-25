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
  // T2.2: updates now run inside a Firestore transaction. We capture the
  // tx.update(ref, payload) call via a custom mockRunTransaction.
  function captureTxUpdate(eventData) {
    const txUpdate = jest.fn();
    mockRunTransaction.mockImplementationOnce(async (fn) =>
      fn({
        get: jest.fn().mockResolvedValue(doc(eventData)),
        set: jest.fn(),
        update: txUpdate,
        delete: jest.fn(),
      })
    );
    return txUpdate;
  }

  it("converts heureFin on update", async () => {
    access();
    const txUpdate = captureTxUpdate({ childId: "c1", type: "sommeil" });

    await fns.validateAndUpdateEvent(auth("u1", {
      childId: "c1",
      eventId: "e1",
      heureFin: { seconds: 1710003600, nanoseconds: 0 },
    }));

    expect(txUpdate).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        heureFin: expect.objectContaining({ seconds: 1710003600 }),
      })
    );
  });

  it("converts null fields to Firestore deletes on update", async () => {
    access();
    const txUpdate = captureTxUpdate({ childId: "c1", type: "sommeil" });

    await fns.validateAndUpdateEvent(auth("u1", {
      childId: "c1",
      eventId: "e1",
      heureFin: null,
      duree: null,
    }));

    expect(txUpdate).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        heureFin: "DEL",
        duree: "DEL",
      })
    );
  });

  it("rejects update when expectedUpdatedAt doesn't match current (T2.2 optimistic lock)", async () => {
    access();
    const currentMillis = Date.now();
    const staleMillis = currentMillis - 60_000; // 1 minute behind
    mockRunTransaction.mockImplementationOnce(async (fn) =>
      fn({
        get: jest.fn().mockResolvedValue(doc({
          childId: "c1",
          type: "biberon",
          updatedAt: { toMillis: () => currentMillis },
        })),
        set: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      })
    );

    await expect(
      fns.validateAndUpdateEvent(auth("u1", {
        childId: "c1",
        eventId: "e1",
        quantite: 200,
        expectedUpdatedAt: staleMillis,
      }))
    ).rejects.toThrow("modifié entre-temps");
  });

  it("accepts update when expectedUpdatedAt matches (within 1s drift)", async () => {
    access();
    const currentMillis = Date.now();
    const txUpdate = jest.fn();
    mockRunTransaction.mockImplementationOnce(async (fn) =>
      fn({
        get: jest.fn().mockResolvedValue(doc({
          childId: "c1",
          type: "biberon",
          updatedAt: { toMillis: () => currentMillis },
        })),
        set: jest.fn(),
        update: txUpdate,
        delete: jest.fn(),
      })
    );

    await fns.validateAndUpdateEvent(auth("u1", {
      childId: "c1",
      eventId: "e1",
      quantite: 200,
      expectedUpdatedAt: currentMillis + 500, // within 1s tolerance
    }));

    expect(txUpdate).toHaveBeenCalled();
  });

  it("accepts update with no expectedUpdatedAt (backward compatible)", async () => {
    access();
    const txUpdate = captureTxUpdate({ childId: "c1", type: "biberon" });

    await fns.validateAndUpdateEvent(auth("u1", {
      childId: "c1",
      eventId: "e1",
      quantite: 200,
    }));

    expect(txUpdate).toHaveBeenCalled();
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
  it("rejects non-admin", async () => { await expect(fns.grandfatherExistingUsers(auth("u1", { cutoffDate: "2026-01-01", reason: "test test" }))).rejects.toThrow("administrateurs"); });
  it("accepts admin with reason", async () => {
    mockFirestore.collection.mockReturnValue({ where: jest.fn().mockReturnThis(), get: jest.fn().mockResolvedValue(snap()), add: jest.fn().mockResolvedValue({ id: "audit1" }) });
    mockFirestore.doc.mockImplementation((p) => {
      if (p?.includes("rate_limits")) return { get: jest.fn().mockResolvedValue(no()), set: jest.fn() };
      return { get: jest.fn().mockResolvedValue(no()), set: jest.fn() };
    });
    expect(await fns.grandfatherExistingUsers(adm("a1", { cutoffDate: "2026-01-01", reason: "migration legacy v2.3 users to free tier" }))).toEqual({ success: true, count: 0 });
  });
  it("rejects no cutoff", async () => { await expect(fns.grandfatherExistingUsers(adm("a1", { reason: "test" }))).rejects.toThrow("cutoffDate"); });
  it("B4.S6 — rejects missing or too short reason", async () => {
    mockFirestore.doc.mockImplementation((p) => p?.includes("rate_limits") ? { get: jest.fn().mockResolvedValue(no()), set: jest.fn() } : { get: jest.fn().mockResolvedValue(no()), set: jest.fn() });
    await expect(fns.grandfatherExistingUsers(adm("a1", { cutoffDate: "2026-01-01" }))).rejects.toThrow("reason");
    await expect(fns.grandfatherExistingUsers(adm("a1", { cutoffDate: "2026-01-01", reason: "x" }))).rejects.toThrow("reason");
  });
});

describe("validateReferralCode", () => {
  it("rejects unauthenticated", async () => { await expect(fns.validateReferralCode({ auth: null, data: {} })).rejects.toThrow("Authentification"); });
  it("rejects empty code", async () => { mockFirestore.doc.mockReturnValue({ get: jest.fn().mockResolvedValue(no()), set: jest.fn() }); await expect(fns.validateReferralCode(auth("u1", { referralCode: "" }))).rejects.toThrow("invalide"); });
  it("rejects not found", async () => { mockFirestore.doc.mockReturnValue({ get: jest.fn().mockResolvedValue(no()), set: jest.fn() }); mockFirestore.collection.mockReturnValue({ where: jest.fn().mockReturnThis(), limit: jest.fn().mockReturnThis(), get: jest.fn().mockResolvedValue(snap()) }); await expect(fns.validateReferralCode(auth("u1", { referralCode: "ABC" }))).rejects.toThrow("introuvable"); });
  it("rejects self-referral", async () => { mockFirestore.doc.mockReturnValue({ get: jest.fn().mockResolvedValue(no()), set: jest.fn() }); mockFirestore.collection.mockReturnValue({ where: jest.fn().mockReturnThis(), limit: jest.fn().mockReturnThis(), get: jest.fn().mockResolvedValue(snap([{ id: "u1" }])) }); await expect(fns.validateReferralCode(auth("u1", { referralCode: "ABC" }))).rejects.toThrow("propre code"); });
});

describe("usage quota functions", () => {
  const originalAssemblyKey = process.env.ASSEMBLYAI_API_KEY;
  const originalFetch = global.fetch;

  afterEach(() => {
    if (originalAssemblyKey === undefined) {
      delete process.env.ASSEMBLYAI_API_KEY;
    } else {
      process.env.ASSEMBLYAI_API_KEY = originalAssemblyKey;
    }
    global.fetch = originalFetch;
  });

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

  it("rejects transcribeAudio before provider call when voice quota is exhausted", async () => {
    process.env.ASSEMBLYAI_API_KEY = "test-key";
    global.fetch = jest.fn();

    mockFirestore.doc.mockImplementation((p) => {
      if (p === "rate_limits/u1") return { get: jest.fn().mockResolvedValue(no()), set: jest.fn() };
      if (p === "subscriptions/u1") return { get: jest.fn().mockResolvedValue(no()) };
      if (p === "usage_limits/u1") {
        return {
          get: jest.fn().mockResolvedValue(doc({
            voiceCommandDate: new Date().toISOString().split("T")[0],
            voiceCommandCount: 3,
          })),
        };
      }
      return { get: jest.fn().mockResolvedValue(no()) };
    });

    await expect(
      fns.transcribeAudio(auth("u1", { audioBase64: Buffer.alloc(8000).toString("base64") }))
    ).rejects.toThrow("Limite quotidienne atteinte");
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("reserves voice quota inside transcribeAudio before returning transcript", async () => {
    process.env.ASSEMBLYAI_API_KEY = "test-key";
    const txSet = jest.fn();
    mockRunTransaction.mockImplementationOnce(async (fn) =>
      fn({
        get: jest.fn(async (ref) => ref.get()),
        set: txSet,
        update: jest.fn(),
        delete: jest.fn(),
      })
    );
    global.fetch = jest
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: jest.fn().mockResolvedValue({ upload_url: "https://upload.test/audio" }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: jest.fn().mockResolvedValue({ id: "tx1", status: "processing" }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: jest.fn().mockResolvedValue({ status: "completed", text: "ajoute une sieste" }),
      })
      // S4-T5: post-completion DELETE on AssemblyAI (best-effort cleanup)
      .mockResolvedValueOnce({ ok: true, json: jest.fn().mockResolvedValue({}) });

    mockFirestore.doc.mockImplementation((p) => {
      if (p === "rate_limits/u1") return { get: jest.fn().mockResolvedValue(no()), set: jest.fn() };
      if (p === "subscriptions/u1") return { get: jest.fn().mockResolvedValue(no()) };
      if (p === "usage_limits/u1") {
        return {
          get: jest.fn().mockResolvedValue(doc({
            voiceCommandDate: new Date().toISOString().split("T")[0],
            voiceCommandCount: 1,
          })),
        };
      }
      return { get: jest.fn().mockResolvedValue(no()) };
    });

    await expect(
      fns.transcribeAudio(auth("u1", { audioBase64: Buffer.alloc(8000).toString("base64") }))
    ).resolves.toEqual({ text: "ajoute une sieste" });
    expect(txSet).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ voiceCommandCount: 2, lastVoiceCommandAt: "TS" }),
      { merge: true }
    );
    // 3 functional calls (upload, create, poll) + 1 best-effort DELETE (S4-T5).
    expect(global.fetch).toHaveBeenCalledTimes(4);
  });

  it("consumes export quota for free users (with childIds, B5.S1)", async () => {
    mockFirestore.doc.mockImplementation((p) => {
      if (p === "subscriptions/u1") return { get: jest.fn().mockResolvedValue(no()) };
      if (p === "usage_limits/u1") return { get: jest.fn().mockResolvedValue(doc({ pdfExportCount: 0 })) };
      // B5.S1 — checkChildAccess query
      if (p === "children/c1/access/u1") return { get: jest.fn().mockResolvedValue(doc({ role: "owner" })) };
      return { get: jest.fn().mockResolvedValue(no()) };
    });

    await expect(
      fns.consumeUsageQuota(auth("u1", { feature: "export", childIds: ["c1"] }))
    ).resolves.toMatchObject({
      feature: "export",
      allowed: true,
      isUnlimited: false,
      used: 1,
      limit: 1,
      remaining: 0,
    });
  });

  it("B5.S1 — rejects export quota without childIds", async () => {
    await expect(
      fns.consumeUsageQuota(auth("u1", { feature: "export" }))
    ).rejects.toThrow("childIds");
  });

  it("B5.S1 — rejects export quota for child without access", async () => {
    mockFirestore.doc.mockImplementation((p) => {
      if (p === "children/c-other/access/u1") return { get: jest.fn().mockResolvedValue(no()) };
      return { get: jest.fn().mockResolvedValue(no()) };
    });
    await expect(
      fns.consumeUsageQuota(auth("u1", { feature: "export", childIds: ["c-other"] }))
    ).rejects.toThrow("accès");
  });

  it("B5.S1 — rejects export quota with too many childIds", async () => {
    const tooMany = Array.from({ length: 21 }, (_, i) => `c${i}`);
    await expect(
      fns.consumeUsageQuota(auth("u1", { feature: "export", childIds: tooMany }))
    ).rejects.toThrow("Trop d'enfants");
  });
});

describe("resolveReport (T2 — admin claim + audit log)", () => {
  const admin = require("firebase-admin");

  function setupAdminAuth({ callerHasAdminClaim }) {
    admin.auth.mockReturnValue({
      getUser: jest.fn(async (uid) => {
        if (uid === "admin1") {
          return { uid, customClaims: callerHasAdminClaim ? { admin: true } : {} };
        }
        return { uid, customClaims: {} };
      }),
      deleteUser: jest.fn(),
    });
  }

  // T0.4 — admin doit aussi avoir accès au child du report. Le helper accepte
  // un access role à mocker (par défaut "owner" pour simuler le cas standard).
  function setupFirestore({ childAccessRole = "owner" } = {}) {
    mockFirestore.doc.mockImplementation((p) => {
      if (p === "reports/r1") {
        return {
          get: jest.fn().mockResolvedValue(doc({
            childId: "c1",
            eventId: "e1",
            reporterUserId: "u_reporter",
            status: "open",
          })),
          update: jest.fn(),
        };
      }
      if (p === "events/e1") {
        return { get: jest.fn().mockResolvedValue(no()), update: jest.fn() };
      }
      if (p === "children/c1/access/admin1") {
        return childAccessRole
          ? { get: jest.fn().mockResolvedValue(doc({ role: childAccessRole })) }
          : { get: jest.fn().mockResolvedValue(no()) };
      }
      return { get: jest.fn().mockResolvedValue(no()), update: jest.fn() };
    });
  }

  it("rejects callers without the admin custom claim", async () => {
    setupAdminAuth({ callerHasAdminClaim: false });
    setupFirestore();
    await expect(
      fns.resolveReport(auth("admin1", { reportId: "r1", action: "dismiss" }))
    ).rejects.toThrow("administrateurs");
  });

  it("rejects admin who has no access to the child (T0.4)", async () => {
    setupAdminAuth({ callerHasAdminClaim: true });
    setupFirestore({ childAccessRole: null });
    delete process.env.RESEND_API_KEY;
    await expect(
      fns.resolveReport(auth("admin1", { reportId: "r1", action: "dismiss" }))
    ).rejects.toThrow("owner ou admin de cet enfant");
  });

  it("allows admin who is also owner of the child to resolve", async () => {
    setupAdminAuth({ callerHasAdminClaim: true });
    setupFirestore({ childAccessRole: "owner" });
    delete process.env.RESEND_API_KEY;
    await expect(
      fns.resolveReport(auth("admin1", { reportId: "r1", action: "dismiss" }))
    ).resolves.toMatchObject({ success: true, action: "dismiss" });
  });

  it("writes an entry to adminAuditLog for every resolved report", async () => {
    setupAdminAuth({ callerHasAdminClaim: true });
    setupFirestore({ childAccessRole: "owner" });
    const auditAdd = jest.fn().mockResolvedValue({ id: "audit1" });
    mockFirestore.collection.mockImplementation((name) => {
      if (name === "adminAuditLog") {
        return { add: auditAdd };
      }
      return { add: jest.fn(), where: jest.fn().mockReturnThis(), limit: jest.fn().mockReturnThis(), get: jest.fn().mockResolvedValue(snap()) };
    });
    delete process.env.RESEND_API_KEY;
    await fns.resolveReport(auth("admin1", { reportId: "r1", action: "remove_photo", adminNote: "test" }));
    expect(auditAdd).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "resolveReport",
        adminUid: "admin1",
        reportId: "r1",
        childId: "c1",
        eventId: "e1",
        action: "remove_photo",
        adminNote: "test",
      })
    );
  });
});

describe("handleReportCreated (T3 — graduated photo moderation)", () => {
  const admin = require("firebase-admin");

  function reportSnapshot(data) {
    return { data: () => data, id: "r1" };
  }
  function ctx(reportId = "r1") {
    return { params: { reportId } };
  }

  beforeEach(() => {
    // Without an API key the trigger returns early before reaching the
    // auto-hide logic — set a dummy key so we exercise the full flow.
    process.env.RESEND_API_KEY = "test-key";
    admin.auth.mockReturnValue({
      getUser: jest.fn(async (uid) => ({ uid, email: `${uid}@t.com` })),
      deleteUser: jest.fn(),
    });
  });

  afterAll(() => {
    delete process.env.RESEND_API_KEY;
  });

  function setupBaseFirestore({ reporterRole, peerReports = [] }) {
    const eventUpdate = jest.fn();
    const hideForReporter = jest.fn();
    mockFirestore.doc.mockImplementation((p) => {
      if (p === "user_hidden_photos/u_reporter") {
        return { set: hideForReporter };
      }
      if (p === "children/c1/access/u_reporter") {
        return {
          get: jest.fn().mockResolvedValue(
            reporterRole
              ? doc({ role: reporterRole })
              : no()
          ),
        };
      }
      if (p === "events/e1") {
        return {
          get: jest.fn().mockResolvedValue(no()),
          update: eventUpdate,
        };
      }
      return { get: jest.fn().mockResolvedValue(no()), update: jest.fn() };
    });

    mockFirestore.collection.mockImplementation((name) => {
      if (name === "reports") {
        return {
          where: jest.fn().mockReturnThis(),
          get: jest.fn().mockResolvedValue(snap(peerReports)),
        };
      }
      return {
        where: jest.fn().mockReturnThis(),
        get: jest.fn().mockResolvedValue(snap()),
      };
    });

    return { eventUpdate };
  }

  it("does not hide globally when a single non-owner reports", async () => {
    const { eventUpdate } = setupBaseFirestore({
      reporterRole: "viewer",
      peerReports: [
        { data: { reporterUserId: "u_reporter", reason: "intimate_child_nudity" } },
      ],
    });
    await fns.handleReportCreated(
      reportSnapshot({
        reason: "intimate_child_nudity",
        eventId: "e1",
        childId: "c1",
        reporterUserId: "u_reporter",
      }),
      ctx()
    );
    expect(eventUpdate).not.toHaveBeenCalledWith({ reported: true });
  });

  it("hides globally immediately when the reporter is an owner", async () => {
    const { eventUpdate } = setupBaseFirestore({
      reporterRole: "owner",
      peerReports: [],
    });
    await fns.handleReportCreated(
      reportSnapshot({
        reason: "intimate_child_nudity",
        eventId: "e1",
        childId: "c1",
        reporterUserId: "u_reporter",
      }),
      ctx()
    );
    expect(eventUpdate).toHaveBeenCalledWith({ reported: true });
  });

  it("hides globally once two distinct non-owner reporters flag the same event", async () => {
    const { eventUpdate } = setupBaseFirestore({
      reporterRole: "viewer",
      peerReports: [
        { data: { reporterUserId: "u_reporter", reason: "intimate_child_nudity" } },
        { data: { reporterUserId: "u_other", reason: "sensitive_child_photo" } },
      ],
    });
    await fns.handleReportCreated(
      reportSnapshot({
        reason: "intimate_child_nudity",
        eventId: "e1",
        childId: "c1",
        reporterUserId: "u_reporter",
      }),
      ctx()
    );
    expect(eventUpdate).toHaveBeenCalledWith({ reported: true });
  });

  it("counts only distinct reporters (same user reporting twice does not hide)", async () => {
    const { eventUpdate } = setupBaseFirestore({
      reporterRole: "contributor",
      peerReports: [
        { data: { reporterUserId: "u_reporter", reason: "intimate_child_nudity" } },
        { data: { reporterUserId: "u_reporter", reason: "sensitive_child_photo" } },
      ],
    });
    await fns.handleReportCreated(
      reportSnapshot({
        reason: "intimate_child_nudity",
        eventId: "e1",
        childId: "c1",
        reporterUserId: "u_reporter",
      }),
      ctx()
    );
    expect(eventUpdate).not.toHaveBeenCalledWith({ reported: true });
  });

  it("does not run the auto-hide path for non-photo reasons", async () => {
    const { eventUpdate } = setupBaseFirestore({ reporterRole: "owner" });
    await fns.handleReportCreated(
      reportSnapshot({
        reason: "privacy",
        eventId: "e1",
        childId: "c1",
        reporterUserId: "u_reporter",
      }),
      ctx()
    );
    expect(eventUpdate).not.toHaveBeenCalledWith({ reported: true });
  });

  it("still applies moderation effects when RESEND_API_KEY is missing", async () => {
    delete process.env.RESEND_API_KEY;
    const { eventUpdate } = setupBaseFirestore({ reporterRole: "owner" });
    await fns.handleReportCreated(
      reportSnapshot({
        reason: "intimate_child_nudity",
        eventId: "e1",
        childId: "c1",
        reporterUserId: "u_reporter",
      }),
      ctx()
    );
    expect(eventUpdate).toHaveBeenCalledWith({ reported: true });
  });
});

describe("deleteUserAccount (T4 — admin-only direct path)", () => {
  const admin = require("firebase-admin");

  function setAdminClaim(callerHasAdminClaim) {
    admin.auth.mockReturnValue({
      getUser: jest.fn(async (uid) => ({
        uid,
        email: `${uid}@t.com`,
        customClaims: callerHasAdminClaim ? { admin: true } : {},
      })),
      deleteUser: jest.fn(),
    });
  }

  beforeEach(() => {
    mockFirestore.collection.mockImplementation(() => ({
      where: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      get: jest.fn().mockResolvedValue(snap()),
    }));
  });

  it("rejects callers without the admin custom claim", async () => {
    setAdminClaim(false);
    await expect(
      fns.deleteUserAccount(auth("u1", {}))
    ).rejects.toThrow("administrateurs");
  });

  it("allows platform admin to proceed (caller's own account)", async () => {
    setAdminClaim(true);
    // Provide a minimally-mocked firestore so the deletion path completes.
    mockFirestore.doc.mockImplementation(() => ({
      get: jest.fn().mockResolvedValue(no()),
      delete: jest.fn(),
      set: jest.fn(),
    }));
    await expect(
      fns.deleteUserAccount(auth("admin1", {}))
    ).resolves.toEqual({ success: true });
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

// =========================================================================
// Voice pipeline hardening — Lot 1
// =========================================================================

describe("validateEventData — note cap (T1.1)", () => {
  it("rejects a note longer than 1000 chars", async () => {
    access();
    mockFirestore.collection.mockReturnValue({
      add: jest.fn().mockResolvedValue({ id: "e1" }),
      where: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      get: jest.fn().mockResolvedValue(snap()),
    });
    await expect(
      fns.validateAndCreateEvent(auth("u1", {
        childId: "c1",
        type: "biberon",
        quantite: 150,
        note: "x".repeat(1001),
      }))
    ).rejects.toThrow("Note trop longue");
  });

  it("rejects a non-string note", async () => {
    access();
    await expect(
      fns.validateAndCreateEvent(auth("u1", {
        childId: "c1",
        type: "biberon",
        quantite: 150,
        note: { evil: true },
      }))
    ).rejects.toThrow("chaîne");
  });

  it("accepts a normal note", async () => {
    access();
    mockFirestore.collection.mockReturnValue({
      add: jest.fn().mockResolvedValue({ id: "e1" }),
      where: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      get: jest.fn().mockResolvedValue(snap()),
    });
    await expect(
      fns.validateAndCreateEvent(auth("u1", {
        childId: "c1",
        type: "biberon",
        quantite: 150,
        note: "Note normale ajoutée par commande vocale",
      }))
    ).resolves.toEqual({ id: "e1" });
  });
});

describe("transcribeAudio — idempotency key validation (T1.2)", () => {
  const originalAssemblyKey = process.env.ASSEMBLYAI_API_KEY;
  afterEach(() => {
    if (originalAssemblyKey === undefined) delete process.env.ASSEMBLYAI_API_KEY;
    else process.env.ASSEMBLYAI_API_KEY = originalAssemblyKey;
  });

  it("rejects idempotencyKey with invalid characters", async () => {
    process.env.ASSEMBLYAI_API_KEY = "test-key";
    await expect(
      fns.transcribeAudio(auth("u1", {
        audioBase64: Buffer.alloc(8000).toString("base64"),
        idempotencyKey: "abc def!",
      }))
    ).rejects.toThrow("idempotencyKey");
  });

  it("rejects idempotencyKey longer than 100 chars", async () => {
    process.env.ASSEMBLYAI_API_KEY = "test-key";
    await expect(
      fns.transcribeAudio(auth("u1", {
        audioBase64: Buffer.alloc(8000).toString("base64"),
        idempotencyKey: "a".repeat(101),
      }))
    ).rejects.toThrow("idempotencyKey");
  });

  it("returns cached transcript without calling AssemblyAI", async () => {
    process.env.ASSEMBLYAI_API_KEY = "test-key";
    global.fetch = jest.fn();

    mockFirestore.doc.mockImplementation((p) => {
      if (p === "rate_limits/u1") return { get: jest.fn().mockResolvedValue(no()), set: jest.fn() };
      if (p === "voice_transcribe_cache/u1_key123") {
        // Fresh cache hit (now - 60s ago)
        return {
          get: jest.fn().mockResolvedValue(doc({
            text: "cached transcript",
            createdAt: { toMillis: () => Date.now() - 60_000 },
          })),
          set: jest.fn(),
        };
      }
      return { get: jest.fn().mockResolvedValue(no()), set: jest.fn() };
    });

    const result = await fns.transcribeAudio(auth("u1", {
      audioBase64: Buffer.alloc(8000).toString("base64"),
      idempotencyKey: "key123",
    }));
    expect(result).toEqual({ text: "cached transcript", cached: true });
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("ignores expired cache and falls through to AssemblyAI", async () => {
    process.env.ASSEMBLYAI_API_KEY = "test-key";
    global.fetch = jest
      .fn()
      .mockResolvedValueOnce({ ok: true, json: jest.fn().mockResolvedValue({ upload_url: "u" }) })
      .mockResolvedValueOnce({ ok: true, json: jest.fn().mockResolvedValue({ id: "t1", status: "processing" }) })
      .mockResolvedValueOnce({ ok: true, json: jest.fn().mockResolvedValue({ status: "completed", text: "fresh" }) })
      .mockResolvedValueOnce({ ok: true, json: jest.fn().mockResolvedValue({}) });

    mockFirestore.doc.mockImplementation((p) => {
      if (p === "rate_limits/u1") return { get: jest.fn().mockResolvedValue(no()), set: jest.fn() };
      if (p === "voice_transcribe_cache/u1_keyold") {
        // Expired (10 min ago > 5 min TTL)
        return {
          get: jest.fn().mockResolvedValue(doc({
            text: "stale",
            createdAt: { toMillis: () => Date.now() - 10 * 60_000 },
          })),
          set: jest.fn(),
        };
      }
      if (p === "subscriptions/u1") return { get: jest.fn().mockResolvedValue(no()) };
      if (p === "usage_limits/u1") {
        return { get: jest.fn().mockResolvedValue(doc({ voiceCommandCount: 0 })) };
      }
      return { get: jest.fn().mockResolvedValue(no()), set: jest.fn() };
    });

    const result = await fns.transcribeAudio(auth("u1", {
      audioBase64: Buffer.alloc(8000).toString("base64"),
      idempotencyKey: "keyold",
    }));
    expect(result).toEqual({ text: "fresh" });
    expect(global.fetch).toHaveBeenCalled();
  });
});

describe("validateEventData — date bounds (T3.5)", () => {
  it("rejects a date more than 1 year in the past", async () => {
    access();
    const oneYearAndOneDay = Math.floor((Date.now() - (366 * 24 * 60 * 60 * 1000)) / 1000);
    await expect(
      fns.validateAndCreateEvent(auth("u1", {
        childId: "c1",
        type: "biberon",
        quantite: 150,
        date: { _seconds: oneYearAndOneDay, _nanoseconds: 0 },
      }))
    ).rejects.toThrow("trop ancienne");
  });

  it("accepts a date 6 months in the past (within bound)", async () => {
    access();
    mockFirestore.collection.mockReturnValue({
      add: jest.fn().mockResolvedValue({ id: "e1" }),
      where: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      get: jest.fn().mockResolvedValue(snap()),
    });
    const sixMonthsAgo = Math.floor((Date.now() - (180 * 24 * 60 * 60 * 1000)) / 1000);
    await expect(
      fns.validateAndCreateEvent(auth("u1", {
        childId: "c1",
        type: "biberon",
        quantite: 150,
        date: { _seconds: sixMonthsAgo, _nanoseconds: 0 },
      }))
    ).resolves.toEqual({ id: "e1" });
  });
});

describe("transcribeAudio — minimum audio size (T3.3)", () => {
  const originalAssemblyKey = process.env.ASSEMBLYAI_API_KEY;
  afterEach(() => {
    if (originalAssemblyKey === undefined) delete process.env.ASSEMBLYAI_API_KEY;
    else process.env.ASSEMBLYAI_API_KEY = originalAssemblyKey;
  });

  it("rejects an audio under the minimum size threshold", async () => {
    process.env.ASSEMBLYAI_API_KEY = "test-key";
    global.fetch = jest.fn();
    // 4000 bytes raw → ~5333 base64. Under our 6667 server cap.
    await expect(
      fns.transcribeAudio(auth("u1", {
        audioBase64: Buffer.alloc(4000).toString("base64"),
      }))
    ).rejects.toThrow("trop court");
    expect(global.fetch).not.toHaveBeenCalled();
  });
});

describe("validateEventData — enum whitelists (T2.3)", () => {
  it("rejects an invented typeBiberon", async () => {
    access();
    await expect(
      fns.validateAndCreateEvent(auth("u1", {
        childId: "c1",
        type: "biberon",
        quantite: 150,
        typeBiberon: "lait_de_chevre",
      }))
    ).rejects.toThrow("typeBiberon invalide");
  });

  it("rejects an invented typeActivite", async () => {
    access();
    await expect(
      fns.validateAndCreateEvent(auth("u1", {
        childId: "c1",
        type: "activite",
        typeActivite: "javascript:alert(1)",
      }))
    ).rejects.toThrow("typeActivite invalide");
  });

  it("rejects an out-of-range humeur on jalon", async () => {
    access();
    await expect(
      fns.validateAndCreateEvent(auth("u1", {
        childId: "c1",
        type: "jalon",
        typeJalon: "humeur",
        humeur: 99,
      }))
    ).rejects.toThrow("humeur doit être un entier entre 1 et 5");
  });

  it("rejects a crafted consistance on selle", async () => {
    access();
    await expect(
      fns.validateAndCreateEvent(auth("u1", {
        childId: "c1",
        type: "selle",
        consistance: "<script>",
      }))
    ).rejects.toThrow("consistance invalide");
  });

  it("accepts a valid enum value", async () => {
    access();
    mockFirestore.collection.mockReturnValue({
      add: jest.fn().mockResolvedValue({ id: "e1" }),
      where: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      get: jest.fn().mockResolvedValue(snap()),
    });
    await expect(
      fns.validateAndCreateEvent(auth("u1", {
        childId: "c1",
        type: "biberon",
        quantite: 150,
        typeBiberon: "lait_maternel",
      }))
    ).resolves.toEqual({ id: "e1" });
  });
});

describe("validateEventData — extra bornes (T2.4)", () => {
  it("rejects tetee duration > 180min", async () => {
    access();
    await expect(
      fns.validateAndCreateEvent(auth("u1", {
        childId: "c1",
        type: "tetee",
        duree: 500,
      }))
    ).rejects.toThrow("180 minutes");
  });

  it("rejects activite duration > 1440min", async () => {
    access();
    await expect(
      fns.validateAndCreateEvent(auth("u1", {
        childId: "c1",
        type: "activite",
        typeActivite: "promenade",
        duree: 5000,
      }))
    ).rejects.toThrow("1440 minutes");
  });

  it("rejects nomMedicament > 100 chars", async () => {
    access();
    await expect(
      fns.validateAndCreateEvent(auth("u1", {
        childId: "c1",
        type: "medicament",
        nomMedicament: "x".repeat(101),
      }))
    ).rejects.toThrow("Nom du médicament trop long");
  });

  it("rejects dosage > 100 chars", async () => {
    access();
    await expect(
      fns.validateAndCreateEvent(auth("u1", {
        childId: "c1",
        type: "medicament",
        nomMedicament: "Doliprane",
        dosage: "x".repeat(101),
      }))
    ).rejects.toThrow("Dosage");
  });
});

describe("retryAssemblyAIDeletes (T2.1)", () => {
  const originalAssemblyKey = process.env.ASSEMBLYAI_API_KEY;
  afterEach(() => {
    if (originalAssemblyKey === undefined) delete process.env.ASSEMBLYAI_API_KEY;
    else process.env.ASSEMBLYAI_API_KEY = originalAssemblyKey;
  });

  it("removes the doc when DELETE succeeds", async () => {
    process.env.ASSEMBLYAI_API_KEY = "test-key";
    global.fetch = jest.fn().mockResolvedValue({ ok: true });

    const deleteDoc = jest.fn();
    const updateDoc = jest.fn();
    mockFirestore.collection.mockImplementation((name) => {
      if (name !== "pending_assemblyai_deletes") {
        return { where: jest.fn().mockReturnThis(), orderBy: jest.fn().mockReturnThis(), limit: jest.fn().mockReturnThis(), get: jest.fn().mockResolvedValue(snap()) };
      }
      return {
        orderBy: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        get: jest.fn().mockResolvedValue({
          empty: false,
          docs: [{
            id: "tx_abc",
            data: () => ({ transcriptId: "tx_abc", attempts: 0 }),
            ref: { delete: deleteDoc, update: updateDoc },
          }],
        }),
      };
    });

    await fns.retryAssemblyAIDeletes();

    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(deleteDoc).toHaveBeenCalled();
    expect(updateDoc).not.toHaveBeenCalled();
  });

  it("abandons after MAX_DELETE_ATTEMPTS", async () => {
    process.env.ASSEMBLYAI_API_KEY = "test-key";
    global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 500 });

    const deleteDoc = jest.fn();
    const updateDoc = jest.fn();
    mockFirestore.collection.mockImplementation((name) => {
      if (name !== "pending_assemblyai_deletes") {
        return { where: jest.fn().mockReturnThis(), orderBy: jest.fn().mockReturnThis(), limit: jest.fn().mockReturnThis(), get: jest.fn().mockResolvedValue(snap()) };
      }
      return {
        orderBy: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        get: jest.fn().mockResolvedValue({
          empty: false,
          docs: [{
            id: "tx_old",
            data: () => ({ transcriptId: "tx_old", attempts: 4 }), // 4 + 1 = 5 = MAX
            ref: { delete: deleteDoc, update: updateDoc },
          }],
        }),
      };
    });

    await fns.retryAssemblyAIDeletes();

    expect(deleteDoc).not.toHaveBeenCalled();
    expect(updateDoc).toHaveBeenCalledWith(
      expect.objectContaining({
        attempts: 5,
        abandonedAt: "TS",
      })
    );
  });

  it("bumps attempts when delete still failing but under threshold", async () => {
    process.env.ASSEMBLYAI_API_KEY = "test-key";
    global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 500 });

    const updateDoc = jest.fn();
    mockFirestore.collection.mockImplementation((name) => {
      if (name !== "pending_assemblyai_deletes") {
        return { where: jest.fn().mockReturnThis(), orderBy: jest.fn().mockReturnThis(), limit: jest.fn().mockReturnThis(), get: jest.fn().mockResolvedValue(snap()) };
      }
      return {
        orderBy: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        get: jest.fn().mockResolvedValue({
          empty: false,
          docs: [{
            id: "tx_new",
            data: () => ({ transcriptId: "tx_new", attempts: 1 }),
            ref: { delete: jest.fn(), update: updateDoc },
          }],
        }),
      };
    });

    await fns.retryAssemblyAIDeletes();

    expect(updateDoc).toHaveBeenCalledWith(
      expect.objectContaining({ attempts: 2 })
    );
    expect(updateDoc).not.toHaveBeenCalledWith(
      expect.objectContaining({ abandonedAt: expect.anything() })
    );
  });
});

describe("transcribeAudio — quota refund on failure (T1.3)", () => {
  const originalAssemblyKey = process.env.ASSEMBLYAI_API_KEY;
  afterEach(() => {
    if (originalAssemblyKey === undefined) delete process.env.ASSEMBLYAI_API_KEY;
    else process.env.ASSEMBLYAI_API_KEY = originalAssemblyKey;
  });

  it("refunds the quota slot when AssemblyAI upload fails", async () => {
    process.env.ASSEMBLYAI_API_KEY = "test-key";
    const reserveSet = jest.fn();
    const refundUpdate = jest.fn();
    let transactionCallCount = 0;
    mockRunTransaction.mockImplementation(async (fn) => {
      transactionCallCount++;
      if (transactionCallCount === 1) {
        // reserveVoiceQuota: increments to 1
        return fn({
          get: jest.fn().mockResolvedValue(no()),
          set: reserveSet,
          update: jest.fn(),
          delete: jest.fn(),
        });
      }
      // refundVoiceQuota: decrements
      return fn({
        get: jest.fn().mockResolvedValue(doc({
          voiceCommandDate: new Date().toISOString().split("T")[0],
          voiceCommandCount: 1,
        })),
        set: jest.fn(),
        update: refundUpdate,
        delete: jest.fn(),
      });
    });

    global.fetch = jest.fn().mockResolvedValueOnce({
      ok: false,
      text: jest.fn().mockResolvedValue("AssemblyAI down"),
    });

    mockFirestore.doc.mockImplementation((p) => {
      if (p === "rate_limits/u1") return { get: jest.fn().mockResolvedValue(no()), set: jest.fn() };
      if (p === "subscriptions/u1") return { get: jest.fn().mockResolvedValue(no()) };
      if (p === "usage_limits/u1") return { get: jest.fn().mockResolvedValue(no()) };
      return { get: jest.fn().mockResolvedValue(no()), set: jest.fn() };
    });

    await expect(
      fns.transcribeAudio(auth("u1", {
        audioBase64: Buffer.alloc(8000).toString("base64"),
      }))
    ).rejects.toThrow("Upload AssemblyAI");

    expect(reserveSet).toHaveBeenCalled();
    // tx.update is called as tx.update(ref, payload) — we only care about the
    // payload, which is the second argument.
    expect(refundUpdate).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ voiceCommandCount: 0, lastVoiceQuotaRefundAt: "TS" })
    );
  });
});


// ============================================
// Lot 0 — red team app : tests dédiés
// ============================================

describe("revenueCatWebhook — anti-replay & dedup (T0.2)", () => {
  const res = () => ({ status: jest.fn().mockReturnThis(), send: jest.fn() });
  const originalSecret = process.env.REVENUECAT_WEBHOOK_SECRET;
  afterEach(() => {
    if (originalSecret === undefined) delete process.env.REVENUECAT_WEBHOOK_SECRET;
    else process.env.REVENUECAT_WEBHOOK_SECRET = originalSecret;
  });

  it("rejects an event timestamp > 7 days in the past", async () => {
    process.env.REVENUECAT_WEBHOOK_SECRET = "topsecret";
    const r = res();
    const oldTs = Date.now() - 8 * 24 * 60 * 60 * 1000;
    await fns.revenueCatWebhook(
      {
        method: "POST",
        headers: { authorization: "Bearer topsecret" },
        body: {
          event: {
            id: "old-evt",
            event_timestamp_ms: oldTs,
            app_user_id: "u1",
            type: "INITIAL_PURCHASE",
          },
        },
      },
      r
    );
    expect(r.status).toHaveBeenCalledWith(200);
    expect(r.send).toHaveBeenCalledWith(expect.stringMatching(/timestamp rejected/));
  });

  it("dedupes a duplicate event by event.id", async () => {
    process.env.REVENUECAT_WEBHOOK_SECRET = "topsecret";
    const r = res();
    // First call: doc.create succeeds. Second call: throws ALREADY_EXISTS.
    const createMock = jest.fn()
      .mockRejectedValueOnce({ code: 6, message: "Document already exists" });
    mockFirestore.doc.mockImplementation((p) => {
      if (p === "revenuecat_webhook_events/dup-evt") {
        return { create: createMock };
      }
      return { get: jest.fn().mockResolvedValue(no()), set: jest.fn(), create: jest.fn() };
    });
    await fns.revenueCatWebhook(
      {
        method: "POST",
        headers: { authorization: "Bearer topsecret" },
        body: {
          event: {
            id: "dup-evt",
            event_timestamp_ms: Date.now(),
            app_user_id: "u1",
            type: "INITIAL_PURCHASE",
          },
        },
      },
      r
    );
    expect(r.send).toHaveBeenCalledWith(expect.stringMatching(/duplicate/));
  });

  it("skips when the Firebase Auth user no longer exists", async () => {
    process.env.REVENUECAT_WEBHOOK_SECRET = "topsecret";
    const adminMod = require("firebase-admin");
    adminMod.auth.mockReturnValueOnce({
      getUser: jest.fn().mockRejectedValue({ code: "auth/user-not-found" }),
      deleteUser: jest.fn(),
    });
    mockFirestore.doc.mockImplementation((p) => {
      if (p?.startsWith("revenuecat_webhook_events/")) {
        return { create: jest.fn().mockResolvedValue(undefined) };
      }
      return { get: jest.fn().mockResolvedValue(no()), set: jest.fn() };
    });
    const r = res();
    await fns.revenueCatWebhook(
      {
        method: "POST",
        headers: { authorization: "Bearer topsecret" },
        body: {
          event: {
            id: "ghost-evt",
            event_timestamp_ms: Date.now(),
            app_user_id: "deleted-user",
            type: "RENEWAL",
          },
        },
      },
      r
    );
    expect(r.send).toHaveBeenCalledWith(expect.stringMatching(/user deleted/));
  });
});

describe("setAdminClaim (T0.3)", () => {
  const originalSeed = process.env.INITIAL_ADMIN_EMAIL;
  afterEach(() => {
    if (originalSeed === undefined) delete process.env.INITIAL_ADMIN_EMAIL;
    else process.env.INITIAL_ADMIN_EMAIL = originalSeed;
  });

  it("requires authentication", async () => {
    await expect(
      fns.setAdminClaim({ auth: null, data: { targetUid: "t1", value: true, reason: "test reason" } })
    ).rejects.toThrow("Authentification");
  });

  it("rejects missing targetUid", async () => {
    await expect(
      fns.setAdminClaim(auth("a1", { value: true, reason: "x" }))
    ).rejects.toThrow("targetUid");
  });

  it("rejects reason too short", async () => {
    await expect(
      fns.setAdminClaim(auth("a1", { targetUid: "t1", value: true, reason: "hi" }))
    ).rejects.toThrow("reason");
  });

  it("rejects self-demotion", async () => {
    await expect(
      fns.setAdminClaim(adm("a1", { targetUid: "a1", value: false, reason: "trying to demote self" }))
    ).rejects.toThrow("dépromouvoir vous-même");
  });

  it("rejects non-admin caller without seed email", async () => {
    await expect(
      fns.setAdminClaim(auth("u1", { targetUid: "t1", value: true, reason: "i want admin" }))
    ).rejects.toThrow("admins existants");
  });

  it("accepts seed email when no admin exists yet (bootstrap)", async () => {
    process.env.INITIAL_ADMIN_EMAIL = "u1@t.com"; // matches auth() helper
    const adminMod = require("firebase-admin");
    const setClaimsMock = jest.fn().mockResolvedValue(undefined);
    // mockReturnValue (not Once) — code calls admin.auth() multiple times.
    adminMod.auth.mockReturnValue({
      getUser: jest.fn().mockResolvedValue({ uid: "t1", email: "t1@t.com", customClaims: {} }),
      setCustomUserClaims: setClaimsMock,
      deleteUser: jest.fn(),
    });
    const auditAdd = jest.fn().mockResolvedValue({ id: "audit1" });
    mockFirestore.collection.mockImplementation((name) => {
      if (name === "adminAuditLog") {
        return {
          add: auditAdd,
          where: jest.fn().mockReturnThis(),
          limit: jest.fn().mockReturnThis(),
          get: jest.fn().mockResolvedValue(snap()), // no existing admin
        };
      }
      return { add: jest.fn(), where: jest.fn().mockReturnThis(), limit: jest.fn().mockReturnThis(), get: jest.fn().mockResolvedValue(snap()) };
    });
    const result = await fns.setAdminClaim(auth("u1", { targetUid: "t1", value: true, reason: "first admin bootstrap" }));
    expect(result).toMatchObject({ success: true, requiresTokenRefresh: true });
    expect(setClaimsMock).toHaveBeenCalledWith("t1", { admin: true });
    expect(auditAdd).toHaveBeenCalledWith(expect.objectContaining({
      type: "setAdminClaim",
      adminUid: "u1",
      targetUid: "t1",
      value: true,
      bootstrapMode: true,
    }));
  });
});

describe("deleteUserAccount — admin audit on cross-user delete (T0.6)", () => {
  it("rejects admin deleting another account without reason", async () => {
    const adminMod = require("firebase-admin");
    adminMod.auth.mockReturnValueOnce({
      getUser: jest.fn().mockResolvedValue({ uid: "a1", email: "a1@t.com", customClaims: { admin: true } }),
      deleteUser: jest.fn(),
    });
    await expect(
      fns.deleteUserAccount(adm("a1", { uid: "victim1" }))
    ).rejects.toThrow("reason requis");
  });

  it("writes audit log when admin deletes another account with reason", async () => {
    const adminMod = require("firebase-admin");
    // First getUser for caller (admin check), second for target email lookup.
    let callCount = 0;
    adminMod.auth.mockReturnValue({
      getUser: jest.fn().mockImplementation((u) => {
        callCount++;
        if (u === "a1") return Promise.resolve({ uid: "a1", email: "a1@t.com", customClaims: { admin: true } });
        return Promise.resolve({ uid: u, email: `${u}@t.com`, customClaims: {} });
      }),
      deleteUser: jest.fn().mockResolvedValue(undefined),
    });
    const auditAdd = jest.fn().mockResolvedValue({ id: "audit1" });
    mockFirestore.collection.mockImplementation((name) => {
      if (name === "adminAuditLog") return { add: auditAdd, where: jest.fn().mockReturnThis(), get: jest.fn().mockResolvedValue(snap()) };
      if (name === "user_child_access") return { where: jest.fn().mockReturnThis(), get: jest.fn().mockResolvedValue(snap()) };
      return { where: jest.fn().mockReturnThis(), limit: jest.fn().mockReturnThis(), get: jest.fn().mockResolvedValue(snap()), add: jest.fn() };
    });
    mockFirestore.doc.mockImplementation((p) => {
      if (p?.includes("rate_limits")) return { get: jest.fn().mockResolvedValue(no()), set: jest.fn() };
      return { get: jest.fn().mockResolvedValue(no()), set: jest.fn(), delete: jest.fn() };
    });
    mockFirestore.batch.mockReturnValue({
      set: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      commit: jest.fn().mockResolvedValue(undefined),
    });

    await fns.deleteUserAccount(adm("a1", { uid: "victim1", reason: "user requested via support ticket #1234" }));

    expect(auditAdd).toHaveBeenCalledWith(expect.objectContaining({
      type: "deleteUserAccount",
      adminUid: "a1",
      targetUid: "victim1",
      reason: "user requested via support ticket #1234",
    }));
  });
});

// ============================================
// B1 — sharing redeem & accept
// ============================================

describe("redeemShareCodeCF (B1.1)", () => {
  it("requires authentication", async () => {
    await expect(
      fns.redeemShareCodeCF({ auth: null, data: { code: "ABC123" } })
    ).rejects.toThrow("Authentification");
  });

  it("rejects user without email", async () => {
    await expect(
      fns.redeemShareCodeCF({
        auth: { uid: "u1", token: {} },
        app: true,
        data: { code: "ABC123" },
      })
    ).rejects.toThrow("email");
  });

  it("rejects invalid code format", async () => {
    await expect(
      fns.redeemShareCodeCF(auth("u1", { code: "" }))
    ).rejects.toThrow("code requis");
    await expect(
      fns.redeemShareCodeCF(auth("u1", { code: "ab" })) // too short
    ).rejects.toThrow("Code invalide");
    await expect(
      fns.redeemShareCodeCF(auth("u1", { code: "abc def!" })) // invalid chars
    ).rejects.toThrow("Code invalide");
  });

  it("rejects code not found (transaction returns)", async () => {
    mockFirestore.doc.mockImplementation((p) => {
      if (p === "rate_limits/u1") return { get: jest.fn().mockResolvedValue(no()), set: jest.fn() };
      return { get: jest.fn().mockResolvedValue(no()), set: jest.fn(), update: jest.fn() };
    });
    mockRunTransaction.mockImplementationOnce(async (fn) =>
      fn({
        get: jest.fn().mockResolvedValue(no()), // shareCode doesn't exist
        set: jest.fn(),
        update: jest.fn(),
      })
    );
    await expect(
      fns.redeemShareCodeCF(auth("u1", { code: "ABC123" }))
    ).rejects.toThrow("Code invalide ou expiré");
  });

  it("rejects already-used code (anti-info-leak: same message as not-found)", async () => {
    mockFirestore.doc.mockImplementation((p) => {
      if (p === "rate_limits/u1") return { get: jest.fn().mockResolvedValue(no()), set: jest.fn() };
      return { get: jest.fn().mockResolvedValue(no()), set: jest.fn(), update: jest.fn() };
    });
    mockRunTransaction.mockImplementationOnce(async (fn) =>
      fn({
        get: jest.fn().mockResolvedValue(doc({ used: true, childId: "c1" })),
        set: jest.fn(),
        update: jest.fn(),
      })
    );
    await expect(
      fns.redeemShareCodeCF(auth("u1", { code: "ABC123" }))
    ).rejects.toThrow("Code invalide ou expiré");
  });

  it("rejects expired code", async () => {
    mockFirestore.doc.mockImplementation((p) => {
      if (p === "rate_limits/u1") return { get: jest.fn().mockResolvedValue(no()), set: jest.fn() };
      return { get: jest.fn().mockResolvedValue(no()), set: jest.fn() };
    });
    const expiredMs = Date.now() - 1000;
    mockRunTransaction.mockImplementationOnce(async (fn) =>
      fn({
        get: jest.fn().mockResolvedValue(doc({
          used: false,
          childId: "c1",
          expiresAt: { toMillis: () => expiredMs },
        })),
        set: jest.fn(),
        update: jest.fn(),
      })
    );
    await expect(
      fns.redeemShareCodeCF(auth("u1", { code: "ABC123" }))
    ).rejects.toThrow("Code invalide ou expiré");
  });

  it("rejects when user already has access (already-exists)", async () => {
    mockFirestore.doc.mockImplementation((p) => {
      if (p === "rate_limits/u1") return { get: jest.fn().mockResolvedValue(no()), set: jest.fn() };
      return { get: jest.fn().mockResolvedValue(no()), set: jest.fn() };
    });
    const futureMs = Date.now() + 24 * 60 * 60 * 1000;
    let getCallCount = 0;
    mockRunTransaction.mockImplementationOnce(async (fn) =>
      fn({
        get: jest.fn().mockImplementation(() => {
          getCallCount++;
          if (getCallCount === 1) {
            return Promise.resolve(doc({
              used: false,
              childId: "c1",
              expiresAt: { toMillis: () => futureMs },
            }));
          }
          // 2e get = existingAccess
          return Promise.resolve(doc({ role: "owner" }));
        }),
        set: jest.fn(),
        update: jest.fn(),
      })
    );
    await expect(
      fns.redeemShareCodeCF(auth("u1", { code: "ABC123" }))
    ).rejects.toThrow("déjà accès");
  });

  it("succeeds: marks code used and creates access in one transaction", async () => {
    mockFirestore.doc.mockImplementation((p) => {
      if (p === "rate_limits/u1") return { get: jest.fn().mockResolvedValue(no()), set: jest.fn() };
      return { get: jest.fn().mockResolvedValue(no()), set: jest.fn() };
    });
    const futureMs = Date.now() + 24 * 60 * 60 * 1000;
    const txUpdate = jest.fn();
    const txSet = jest.fn();
    let getCallCount = 0;
    mockRunTransaction.mockImplementationOnce(async (fn) =>
      fn({
        get: jest.fn().mockImplementation(() => {
          getCallCount++;
          if (getCallCount === 1) {
            return Promise.resolve(doc({
              used: false,
              childId: "c1",
              childName: "Baby",
              createdBy: "creator-uid",
              expiresAt: { toMillis: () => futureMs },
            }));
          }
          return Promise.resolve(no()); // pas d'accès existant
        }),
        set: txSet,
        update: txUpdate,
      })
    );
    const result = await fns.redeemShareCodeCF(auth("u1", { code: "ABC123" }));
    expect(result).toEqual({ childId: "c1", childName: "Baby" });
    expect(txUpdate).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ used: true, usedBy: "u1", usedByEmail: "u1@t.com" }),
    );
    // 2 set : access doc + user_child_access index
    expect(txSet).toHaveBeenCalledTimes(2);
  });
});

describe("acceptInvitationCF (B1.4)", () => {
  it("requires authentication", async () => {
    await expect(
      fns.acceptInvitationCF({ auth: null, data: { invitationId: "i1" } })
    ).rejects.toThrow("Authentification");
  });

  it("rejects missing invitationId", async () => {
    await expect(
      fns.acceptInvitationCF(auth("u1", {}))
    ).rejects.toThrow("invitationId requis");
  });

  it("rejects when not the intended recipient", async () => {
    mockFirestore.doc.mockImplementation((p) => {
      if (p === "rate_limits/u1") return { get: jest.fn().mockResolvedValue(no()), set: jest.fn() };
      return { get: jest.fn().mockResolvedValue(no()), set: jest.fn() };
    });
    mockRunTransaction.mockImplementationOnce(async (fn) =>
      fn({
        get: jest.fn().mockResolvedValue(doc({
          status: "pending",
          invitedUserId: "someone-else",
          invitedEmail: "other@t.com",
          childId: "c1",
        })),
        set: jest.fn(),
        update: jest.fn(),
      })
    );
    await expect(
      fns.acceptInvitationCF(auth("u1", { invitationId: "i1" }))
    ).rejects.toThrow("ne vous est pas destinée");
  });

  it("rejects already-accepted invitation", async () => {
    mockFirestore.doc.mockImplementation((p) => {
      if (p === "rate_limits/u1") return { get: jest.fn().mockResolvedValue(no()), set: jest.fn() };
      return { get: jest.fn().mockResolvedValue(no()), set: jest.fn() };
    });
    mockRunTransaction.mockImplementationOnce(async (fn) =>
      fn({
        get: jest.fn().mockResolvedValue(doc({
          status: "accepted",
          invitedUserId: "u1",
          childId: "c1",
        })),
        set: jest.fn(),
        update: jest.fn(),
      })
    );
    await expect(
      fns.acceptInvitationCF(auth("u1", { invitationId: "i1" }))
    ).rejects.toThrow("déjà été traitée");
  });

  it("creates access and marks accepted when valid", async () => {
    mockFirestore.doc.mockImplementation((p) => {
      if (p === "rate_limits/u1") return { get: jest.fn().mockResolvedValue(no()), set: jest.fn() };
      return { get: jest.fn().mockResolvedValue(no()), set: jest.fn() };
    });
    const txUpdate = jest.fn();
    const txSet = jest.fn();
    let getCallCount = 0;
    mockRunTransaction.mockImplementationOnce(async (fn) =>
      fn({
        get: jest.fn().mockImplementation(() => {
          getCallCount++;
          if (getCallCount === 1) {
            return Promise.resolve(doc({
              status: "pending",
              invitedUserId: "u1",
              inviterId: "inviter-uid",
              childId: "c1",
            }));
          }
          return Promise.resolve(no()); // pas d'accès existant
        }),
        set: txSet,
        update: txUpdate,
      })
    );
    const result = await fns.acceptInvitationCF(auth("u1", { invitationId: "i1" }));
    expect(result).toEqual({ success: true });
    expect(txUpdate).toHaveBeenCalledWith(expect.anything(), { status: "accepted" });
    // 2 set : access + index
    expect(txSet).toHaveBeenCalledTimes(2);
  });

  it("is idempotent when access already exists (just marks accepted)", async () => {
    mockFirestore.doc.mockImplementation((p) => {
      if (p === "rate_limits/u1") return { get: jest.fn().mockResolvedValue(no()), set: jest.fn() };
      return { get: jest.fn().mockResolvedValue(no()), set: jest.fn() };
    });
    const txUpdate = jest.fn();
    const txSet = jest.fn();
    let getCallCount = 0;
    mockRunTransaction.mockImplementationOnce(async (fn) =>
      fn({
        get: jest.fn().mockImplementation(() => {
          getCallCount++;
          if (getCallCount === 1) {
            return Promise.resolve(doc({
              status: "pending",
              invitedUserId: "u1",
              inviterId: "inviter-uid",
              childId: "c1",
            }));
          }
          return Promise.resolve(doc({ role: "contributor" })); // accès déjà là
        }),
        set: txSet,
        update: txUpdate,
      })
    );
    const result = await fns.acceptInvitationCF(auth("u1", { invitationId: "i1" }));
    expect(result).toEqual({ success: true });
    expect(txSet).not.toHaveBeenCalled(); // pas de re-création
    expect(txUpdate).toHaveBeenCalledWith(expect.anything(), { status: "accepted" });
  });
});

// ============================================
// B6 — submitContentReportCF
// ============================================

describe("submitContentReportCF (B6.S1/S2/S3)", () => {
  it("requires authentication", async () => {
    await expect(
      fns.submitContentReportCF({ auth: null, data: { childId: "c1", reason: "privacy" } })
    ).rejects.toThrow("Authentification");
  });

  it("rejects missing childId", async () => {
    await expect(
      fns.submitContentReportCF(auth("u1", { reason: "privacy" }))
    ).rejects.toThrow("childId requis");
  });

  it("rejects invalid reason", async () => {
    await expect(
      fns.submitContentReportCF(auth("u1", { childId: "c1", reason: "not_a_reason" }))
    ).rejects.toThrow("reason invalide");
  });

  it("rejects message > 1000 chars", async () => {
    mockFirestore.doc.mockImplementation((p) => {
      if (p === "rate_limits/u1") return { get: jest.fn().mockResolvedValue(no()), set: jest.fn() };
      if (p === "children/c1/access/u1") return { get: jest.fn().mockResolvedValue(doc({ role: "owner" })) };
      return { get: jest.fn().mockResolvedValue(no()) };
    });
    await expect(
      fns.submitContentReportCF(auth("u1", { childId: "c1", reason: "privacy", message: "x".repeat(1001) }))
    ).rejects.toThrow("trop long");
  });

  it("B6.S2 — rejects when reported event does not exist", async () => {
    mockFirestore.doc.mockImplementation((p) => {
      if (p === "rate_limits/u1") return { get: jest.fn().mockResolvedValue(no()), set: jest.fn() };
      if (p === "children/c1/access/u1") return { get: jest.fn().mockResolvedValue(doc({ role: "owner" })) };
      if (p === "events/e-ghost") return { get: jest.fn().mockResolvedValue(no()) };
      return { get: jest.fn().mockResolvedValue(no()) };
    });
    await expect(
      fns.submitContentReportCF(auth("u1", { childId: "c1", eventId: "e-ghost", reason: "privacy" }))
    ).rejects.toThrow("n'existe pas");
  });

  it("B6.S3 — rejects auto-report (reporter is event author)", async () => {
    mockFirestore.doc.mockImplementation((p) => {
      if (p === "rate_limits/u1") return { get: jest.fn().mockResolvedValue(no()), set: jest.fn() };
      if (p === "children/c1/access/u1") return { get: jest.fn().mockResolvedValue(doc({ role: "owner" })) };
      if (p === "events/e1") return { get: jest.fn().mockResolvedValue(doc({ childId: "c1", userId: "u1" })) };
      return { get: jest.fn().mockResolvedValue(no()) };
    });
    await expect(
      fns.submitContentReportCF(auth("u1", { childId: "c1", eventId: "e1", reason: "privacy" }))
    ).rejects.toThrow("propre contenu");
  });

  it("creates report when valid (other user's content)", async () => {
    const addReport = jest.fn().mockResolvedValue({ id: "r-new" });
    mockFirestore.doc.mockImplementation((p) => {
      if (p === "rate_limits/u1") return { get: jest.fn().mockResolvedValue(no()), set: jest.fn() };
      if (p === "children/c1/access/u1") return { get: jest.fn().mockResolvedValue(doc({ role: "contributor" })) };
      if (p === "events/e1") return { get: jest.fn().mockResolvedValue(doc({ childId: "c1", userId: "other-user" })) };
      return { get: jest.fn().mockResolvedValue(no()) };
    });
    mockFirestore.collection.mockImplementation((name) => {
      if (name === "reports") return { add: addReport };
      return { add: jest.fn(), where: jest.fn().mockReturnThis(), limit: jest.fn().mockReturnThis(), get: jest.fn().mockResolvedValue(snap()) };
    });
    const result = await fns.submitContentReportCF(auth("u1", { childId: "c1", eventId: "e1", reason: "privacy", message: "test" }));
    expect(result).toEqual({ reportId: "r-new" });
    expect(addReport).toHaveBeenCalledWith(expect.objectContaining({
      reporterUserId: "u1",
      childId: "c1",
      eventId: "e1",
      reason: "privacy",
      message: "test",
      status: "open",
    }));
  });
});

describe("resolveReport (B6.S7 atomic claim)", () => {
  it("rejects if status is already resolving (another admin in progress)", async () => {
    const adminMod = require("firebase-admin");
    adminMod.auth.mockReturnValue({
      getUser: jest.fn().mockResolvedValue({ uid: "admin1", customClaims: { admin: true } }),
      deleteUser: jest.fn(),
    });
    mockFirestore.doc.mockImplementation((p) => {
      if (p?.includes("rate_limits")) return { get: jest.fn().mockResolvedValue(no()), set: jest.fn() };
      if (p === "reports/r1") {
        return {
          get: jest.fn().mockResolvedValue(doc({
            childId: "c1",
            status: "resolving",
            reporterUserId: "u_reporter",
          })),
        };
      }
      return { get: jest.fn().mockResolvedValue(no()) };
    });
    await expect(
      fns.resolveReport(auth("admin1", { reportId: "r1", action: "dismiss" }))
    ).rejects.toThrow("en cours de traitement");
  });

  it("rejects if status is already resolved", async () => {
    const adminMod = require("firebase-admin");
    adminMod.auth.mockReturnValue({
      getUser: jest.fn().mockResolvedValue({ uid: "admin1", customClaims: { admin: true } }),
      deleteUser: jest.fn(),
    });
    mockFirestore.doc.mockImplementation((p) => {
      if (p?.includes("rate_limits")) return { get: jest.fn().mockResolvedValue(no()), set: jest.fn() };
      if (p === "reports/r1") {
        return {
          get: jest.fn().mockResolvedValue(doc({
            childId: "c1",
            status: "resolved",
            reporterUserId: "u_reporter",
          })),
        };
      }
      return { get: jest.fn().mockResolvedValue(no()) };
    });
    await expect(
      fns.resolveReport(auth("admin1", { reportId: "r1", action: "dismiss" }))
    ).rejects.toThrow("déjà été traité");
  });
});
