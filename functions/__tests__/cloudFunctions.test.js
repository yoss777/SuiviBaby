/* global Buffer, describe, it, expect, jest, beforeEach, afterEach, afterAll */
const { mockFirestore, mockDocRef, mockGet, mockAdd, mockQueryChain, mockRunTransaction } = require("./setup");
const fns = require("../index");
const { handleReportCreated } = require("../src/moderation/reports");
const auth = (uid, data = {}) => ({ auth: { uid, token: { email: `${uid}@t.com`, email_verified: true, admin: false } }, data, app: true });
const adm = (uid, data = {}) => ({ auth: { uid, token: { email: `${uid}@t.com`, email_verified: true, admin: true } }, data, app: true });
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
  it("deduplicates idempotencyKey (document déterministe déjà créé)", async () => {
    const { memoryStore } = require("./memoryFirestore");
    const docs = memoryStore({ "children/c1/access/u1": { role: "owner" } });
    const data = { childId: "c1", type: "biberon", quantite: 100, idempotencyKey: "k" };
    const first = await fns.validateAndCreateEvent(auth("u1", data));
    expect(await fns.validateAndCreateEvent(auth("u1", data))).toEqual(first);
    expect([...docs.keys()].filter((p) => p.startsWith("events/"))).toHaveLength(1);
  });
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
      if (p === "usage_limits/u1") return { get: jest.fn().mockResolvedValue(doc({ voiceCommandDate: require("../src/billing/quotas").quotaDayKey(), voiceCommandCount: 1 })) };
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
            voiceCommandDate: require("../src/billing/quotas").quotaDayKey(),
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

  it("caps Premium at 50 voice commands a day with an honest message", async () => {
    process.env.ASSEMBLYAI_API_KEY = "test-key";
    global.fetch = jest.fn();
    const future = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
    mockFirestore.doc.mockImplementation((p) => {
      if (p === "rate_limits/u1") return { get: jest.fn().mockResolvedValue(no()), set: jest.fn() };
      if (p === "subscriptions/u1") return { get: jest.fn().mockResolvedValue(doc({ tier: "premium", status: "active", expiresAt: future })) };
      if (p === "usage_limits/u1") {
        return {
          get: jest.fn().mockResolvedValue(doc({
            voiceCommandDate: require("../src/billing/quotas").quotaDayKey(),
            voiceCommandCount: 50,
          })),
        };
      }
      return { get: jest.fn().mockResolvedValue(no()) };
    });

    await expect(
      fns.transcribeAudio(auth("u1", { audioBase64: Buffer.alloc(8000).toString("base64") }))
    ).rejects.toThrow("vos 50 commandes vocales du jour");
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
            voiceCommandDate: require("../src/billing/quotas").quotaDayKey(),
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
      deleteUser: jest.fn(), updateUser: jest.fn(), revokeRefreshTokens: jest.fn(),
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
      deleteUser: jest.fn(), updateUser: jest.fn(), revokeRefreshTokens: jest.fn(),
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
    await handleReportCreated(
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
    await handleReportCreated(
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
    await handleReportCreated(
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
    await handleReportCreated(
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
    await handleReportCreated(
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
    await handleReportCreated(
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
      deleteUser: jest.fn(), updateUser: jest.fn(), revokeRefreshTokens: jest.fn(),
    });
  }

  beforeEach(() => {
    mockFirestore.collection.mockImplementation(() => ({
      where: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      get: jest.fn().mockResolvedValue(snap()),
      add: jest.fn().mockResolvedValue({ id: "new" }),
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
  it("no longer limits sharing on the free plan", async () => {
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

    // Sharing is unlimited on every plan (2026-11-11): two caregivers already
    // linked no longer block a third invitation.
    await expect(fns.createShareInvitation(auth("u1", { childId: "c1", childName: "Bebe", invitedEmail: "target@example.com" }))).rejects.not.toThrow(/co-parents maximum/);
  });

  it("rejects a contributor even with canWriteEvents (owner/admin only)", async () => {
    mockFirestore.doc.mockImplementation((p) => {
      if (p === "children/c1/access/u1") return { get: jest.fn().mockResolvedValue(doc({ role: "contributor", canWriteEvents: true })) };
      if (p === "children/c1") return { get: jest.fn().mockResolvedValue(doc({ name: "Bebe" })) };
      return { get: jest.fn().mockResolvedValue(no()), set: jest.fn() };
    });
    await expect(fns.createShareInvitation(auth("u1", { childId: "c1", childName: "Bebe", invitedEmail: "target@example.com" }))).rejects.toThrow("Accès insuffisant");
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
          voiceCommandDate: require("../src/billing/quotas").quotaDayKey(),
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
    // The marker for this event id already exists (read inside the transaction).
    mockFirestore.doc.mockImplementation((p) => ({ path: p, get: jest.fn().mockResolvedValue(no()), set: jest.fn() }));
    const txSet = jest.fn();
    mockRunTransaction.mockReset();
    mockRunTransaction.mockImplementation(async (fn) =>
      fn({
        get: jest.fn(async (ref) => (ref.path === "revenuecat_webhook_events/dup-evt" ? doc({}) : no())),
        set: txSet,
        create: jest.fn(),
        update: jest.fn(),
      })
    );
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
    expect(txSet).not.toHaveBeenCalled();
  });

  it("skips when the Firebase Auth user no longer exists", async () => {
    process.env.REVENUECAT_WEBHOOK_SECRET = "topsecret";
    const adminMod = require("firebase-admin");
    adminMod.auth.mockReturnValueOnce({
      getUser: jest.fn().mockRejectedValue({ code: "auth/user-not-found" }),
      deleteUser: jest.fn(), updateUser: jest.fn(), revokeRefreshTokens: jest.fn(),
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
      listUsers: jest.fn().mockResolvedValue({ users: [], pageToken: undefined }),
      setCustomUserClaims: setClaimsMock,
      deleteUser: jest.fn(), updateUser: jest.fn(), revokeRefreshTokens: jest.fn(),
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
      deleteUser: jest.fn(), updateUser: jest.fn(), revokeRefreshTokens: jest.fn(),
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
      updateUser: jest.fn().mockResolvedValue(undefined),
      revokeRefreshTokens: jest.fn().mockResolvedValue(undefined),
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
          if (getCallCount === 3) return Promise.resolve(doc({ name: "Bebe" })); // enfant actif
          if (getCallCount === 4) return Promise.resolve(doc({ role: "owner" })); // émetteur toujours owner
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
    // D11 — a contributor joins with likes/comments only, no event writes
    expect(txSet).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ role: "contributor", canWriteEvents: false, canWriteLikes: true, canWriteComments: true }));
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
          if (getCallCount === 3) return Promise.resolve(doc({ name: "Bebe" })); // enfant actif
          if (getCallCount === 4) return Promise.resolve(doc({ role: "owner" })); // émetteur toujours owner
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
    // D11 — a contributor joins with likes/comments only, no event writes
    expect(txSet).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ role: "contributor", canWriteEvents: false, canWriteLikes: true, canWriteComments: true }));
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
      deleteUser: jest.fn(), updateUser: jest.fn(), revokeRefreshTokens: jest.fn(),
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
      deleteUser: jest.fn(), updateUser: jest.fn(), revokeRefreshTokens: jest.fn(),
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

describe("photo deletion when a child is purged", () => {
  const { mockStorage, mockBucket } = require("./setup");

  it("wipes children/{childId}/ in both the EU and the legacy US bucket", async () => {
    const requestRef = {
      id: "req1",
      get: jest.fn().mockResolvedValue(doc({ status: "approved", childId: "c1" })),
      delete: jest.fn(() => Promise.resolve()),
      update: jest.fn(),
    };
    mockFirestore.collection.mockReturnValue({
      where: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      get: jest.fn()
        // expired pending requests
        .mockResolvedValueOnce(snap())
        // approved requests whose soft-delete must be resumed
        .mockResolvedValueOnce(snap())
        // soft-deleted children past retention
        .mockResolvedValueOnce({ docs: [{ id: "req1", ref: requestRef, data: () => ({ childId: "c1" }) }], empty: false, size: 1 })
        .mockResolvedValue(snap()),
    });
    mockFirestore.doc.mockReturnValue({ get: jest.fn().mockResolvedValue(no()), delete: jest.fn(() => Promise.resolve()), set: jest.fn() });

    await fns.purgeDeletedChildren();

    const buckets = mockStorage.bucket.mock.calls.map((call) => call[0]);
    expect(buckets).toEqual(expect.arrayContaining(["samaye-53723-photos-eu", "samaye-53723.firebasestorage.app"]));
    expect(mockBucket.getFiles).toHaveBeenCalledWith({ prefix: "children/c1/" });
  });
});

describe("transferAndLeave (ownership transfer, server-only since rules S1)", () => {
  const setupDocs = (docs) => {
    mockFirestore.doc.mockImplementation((p) => ({
      path: p,
      get: jest.fn().mockResolvedValue(p in docs ? (docs[p] ? doc(docs[p]) : no()) : no()),
      set: jest.fn().mockResolvedValue(),
      delete: jest.fn().mockResolvedValue(),
    }));
  };
  const captureBatch = () => {
    const b = { set: jest.fn(), update: jest.fn(), delete: jest.fn(), commit: jest.fn(() => Promise.resolve()) };
    mockFirestore.batch.mockReturnValue(b);
    return b;
  };
  const defaultBatch = mockFirestore.batch.getMockImplementation();
  afterEach(() => { mockFirestore.batch.mockReset(); mockFirestore.batch.mockImplementation(defaultBatch); });

  it("requires authentication", async () => {
    await expect(
      fns.transferAndLeave({ auth: null, data: { childId: "c1", newOwnerId: "u2" } })
    ).rejects.toThrow("Authentification");
  });

  it("rejects transferring to oneself", async () => {
    await expect(
      fns.transferAndLeave(auth("u1", { childId: "c1", newOwnerId: "u1" }))
    ).rejects.toThrow("à vous-même");
  });

  it("rejects a caller who is only admin", async () => {
    setupDocs({ "children/c1/access/u1": { role: "admin" }, "children/c1/access/u2": { role: "viewer" } });
    const b = captureBatch();
    await expect(
      fns.transferAndLeave(auth("u1", { childId: "c1", newOwnerId: "u2" }))
    ).rejects.toThrow("Seul un propriétaire");
    expect(b.commit).not.toHaveBeenCalled();
  });

  it("rejects a new owner without access to the child", async () => {
    setupDocs({ "children/c1": { ownerId: "u1" }, "children/c1/access/u1": { role: "owner" } });
    const b = captureBatch();
    await expect(
      fns.transferAndLeave(auth("u1", { childId: "c1", newOwnerId: "u2" }))
    ).rejects.toThrow("n'a pas accès");
    expect(b.commit).not.toHaveBeenCalled();
  });

  it("refuses to transfer a child pending deletion", async () => {
    setupDocs({ "children/c1": { ownerId: "u1", deletedAt: "2026-11-01" }, "children/c1/access/u1": { role: "owner" }, "children/c1/access/u2": { role: "admin" } });
    const b = captureBatch();
    await expect(
      fns.transferAndLeave(auth("u1", { childId: "c1", newOwnerId: "u2" }))
    ).rejects.toThrow("en cours de suppression");
    expect(b.commit).not.toHaveBeenCalled();
  });

  // The success path (promotion, ownerId, access removal in one transaction) and
  // the co-owner hijack case run on the in-memory store in review.test.js.
});

describe("subscription kept until expiresAt after cancellation (S8)", () => {
  const voiceStatusWith = async (sub) => {
    mockFirestore.doc.mockImplementation((p) => {
      if (p === "subscriptions/u1") return { get: jest.fn().mockResolvedValue(doc(sub)) };
      return { get: jest.fn().mockResolvedValue(no()) };
    });
    return fns.getUsageQuotaStatus(auth("u1", { feature: "voice" }));
  };
  const inDays = (d) => new Date(Date.now() + d * 24 * 60 * 60 * 1000).toISOString();

  it("keeps the Premium voice allowance for a cancelled subscription not yet expired", async () => {
    await expect(voiceStatusWith({ tier: "premium", status: "cancelled", expiresAt: inDays(10) }))
      .resolves.toMatchObject({ isUnlimited: false, limit: 50 });
  });

  it("keeps the Premium voice allowance during a billing issue grace period", async () => {
    await expect(voiceStatusWith({ tier: "premium", status: "billing_issue", expiresAt: inDays(3) }))
      .resolves.toMatchObject({ isUnlimited: false, limit: 50 });
  });

  it("falls back to the free quota once a cancelled subscription has expired", async () => {
    await expect(voiceStatusWith({ tier: "premium", status: "cancelled", expiresAt: inDays(-1) }))
      .resolves.toMatchObject({ isUnlimited: false, limit: 3 });
  });

  it("does not grant unlimited to a cancelled subscription without expiresAt", async () => {
    await expect(voiceStatusWith({ tier: "premium", status: "cancelled" }))
      .resolves.toMatchObject({ isUnlimited: false });
  });
});

describe("revenueCatWebhook — out-of-order events (S8)", () => {
  const res = () => ({ status: jest.fn().mockReturnThis(), send: jest.fn() });
  const originalSecret = process.env.REVENUECAT_WEBHOOK_SECRET;
  afterEach(() => {
    if (originalSecret === undefined) delete process.env.REVENUECAT_WEBHOOK_SECRET;
    else process.env.REVENUECAT_WEBHOOK_SECRET = originalSecret;
  });
  const send = async (event, existing) => {
    process.env.REVENUECAT_WEBHOOK_SECRET = "topsecret";
    mockFirestore.doc.mockImplementation((p) => ({ path: p, get: jest.fn().mockResolvedValue(no()), set: jest.fn() }));
    mockFirestore.collection.mockImplementation(() => ({ add: jest.fn().mockResolvedValue({ id: "log" }) }));
    const txSet = jest.fn();
    // mockReset: drop "Once" implementations left unconsumed by earlier tests.
    mockRunTransaction.mockReset();
    mockRunTransaction.mockImplementation(async (fn) =>
      fn({
        get: jest.fn(async (ref) =>
          ref.path?.startsWith("revenuecat_webhook_events/") ? no() : existing ? doc(existing) : no()
        ),
        set: txSet,
        create: jest.fn(),
        update: jest.fn(),
      })
    );
    await fns.revenueCatWebhook(
      { method: "POST", headers: { authorization: "Bearer topsecret" }, body: { event } },
      res()
    );
    return txSet;
  };

  it("ignores an event older than the last processed one", async () => {
    const now = Date.now();
    const txSet = await send(
      { id: "late-cancel", type: "CANCELLATION", app_user_id: "u1", event_timestamp_ms: now - 60_000, entitlement_ids: ["premium"] },
      { tier: "premium", status: "active", lastEventTimestampMs: now - 1_000 }
    );
    expect(txSet).not.toHaveBeenCalled();
  });

  it("applies a newer event and records its timestamp", async () => {
    const now = Date.now();
    const txSet = await send(
      { id: "renewal", type: "RENEWAL", app_user_id: "u1", event_timestamp_ms: now, entitlement_ids: ["premium"] },
      { tier: "premium", status: "cancelled", lastEventTimestampMs: now - 60_000 }
    );
    expect(txSet).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ status: "active", lastEventTimestampMs: now }),
      { merge: true }
    );
  });
});

describe("revenueCatWebhook — event types (review follow-up)", () => {
  const originalSecret = process.env.REVENUECAT_WEBHOOK_SECRET;
  afterEach(() => {
    if (originalSecret === undefined) delete process.env.REVENUECAT_WEBHOOK_SECRET;
    else process.env.REVENUECAT_WEBHOOK_SECRET = originalSecret;
  });
  const run = async (event) => {
    process.env.REVENUECAT_WEBHOOK_SECRET = "topsecret";
    mockFirestore.doc.mockImplementation((p) => {
      if (p?.startsWith("revenuecat_webhook_events/")) return { create: jest.fn().mockResolvedValue(undefined) };
      return { path: p, get: jest.fn().mockResolvedValue(no()), set: jest.fn() };
    });
    mockFirestore.collection.mockImplementation(() => ({ add: jest.fn().mockResolvedValue({ id: "log" }) }));
    const txSet = jest.fn();
    mockRunTransaction.mockReset();
    mockRunTransaction.mockImplementation(async (fn) => fn({ get: jest.fn().mockResolvedValue(no()), set: txSet, create: jest.fn(), update: jest.fn() }));
    const r = { status: jest.fn().mockReturnThis(), send: jest.fn() };
    await fns.revenueCatWebhook({ method: "POST", headers: { authorization: "Bearer topsecret" }, body: { event: { app_user_id: "u1", event_timestamp_ms: Date.now(), ...event } } }, r);
    return { txSet, r };
  };

  it("ignores unknown event types instead of rewriting the subscription", async () => {
    const { txSet, r } = await run({ id: "t1", type: "SUBSCRIPTION_PAUSED", entitlement_ids: [] });
    expect(txSet).not.toHaveBeenCalled();
    expect(r.send).toHaveBeenCalledWith(expect.stringMatching(/ignored/));
  });

  it("revokes access immediately on a refund (CANCELLATION / CUSTOMER_SUPPORT)", async () => {
    const { txSet } = await run({ id: "t2", type: "CANCELLATION", cancel_reason: "CUSTOMER_SUPPORT", entitlement_ids: ["premium"], expiration_at_ms: Date.now() + 20 * 86400000 });
    expect(txSet).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ status: "expired", tier: "free" }), { merge: true });
  });

  it("keeps a plain unsubscribe as cancelled until expiry", async () => {
    const { txSet } = await run({ id: "t3", type: "CANCELLATION", cancel_reason: "UNSUBSCRIBE", entitlement_ids: ["premium"], expiration_at_ms: Date.now() + 20 * 86400000 });
    expect(txSet).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ status: "cancelled", tier: "premium" }), { merge: true });
  });

  it("uses the grace period end as expiresAt on BILLING_ISSUE", async () => {
    const grace = Date.now() + 16 * 86400000;
    const { txSet } = await run({ id: "t4", type: "BILLING_ISSUE", entitlement_ids: ["premium"], expiration_at_ms: Date.now() - 1000, grace_period_expiration_at_ms: grace });
    expect(txSet).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ status: "billing_issue", expiresAt: new Date(grace).toISOString() }), { merge: true });
  });

  it("treats UNCANCELLATION as active again", async () => {
    const { txSet } = await run({ id: "t5", type: "UNCANCELLATION", entitlement_ids: ["premium"] });
    expect(txSet).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ status: "active", tier: "premium" }), { merge: true });
  });
});

describe("createShareInvitation — invitee resolved via Firebase Auth", () => {
  it("does not trust users/{uid}.email: unknown Auth email is rejected", async () => {
    const adminMod = require("firebase-admin");
    adminMod.auth.mockReturnValueOnce({ getUserByEmail: jest.fn().mockRejectedValue({ code: "auth/user-not-found" }) });
    mockFirestore.doc.mockImplementation((p) => {
      if (p === "children/c1/access/u1") return { get: jest.fn().mockResolvedValue(doc({ role: "owner" })) };
      if (p === "children/c1") return { get: jest.fn().mockResolvedValue(doc({ name: "Bebe" })) };
      if (p === "subscriptions/u1") return { get: jest.fn().mockResolvedValue(doc({ tier: "family", status: "active" })) };
      return { get: jest.fn().mockResolvedValue(no()), set: jest.fn() };
    });
    // a spoofed users doc claiming the email must not be used
    const add = jest.fn();
    mockFirestore.collection.mockImplementation(() => ({ where: jest.fn().mockReturnThis(), limit: jest.fn().mockReturnThis(), get: jest.fn().mockResolvedValue(snap([{ id: "attacker" }])), add }));
    // Neutral answer (4.5): no error, no invitation toward the spoofed user.
    await expect(fns.createShareInvitation(auth("u1", { childId: "c1", invitedEmail: "victim@example.com" }))).resolves.toEqual({ id: expect.any(String) });
    expect(add).not.toHaveBeenCalled();
  });
});

describe("join flows re-check the child and the issuer (S13)", () => {
  const rateLimitOnly = () => mockFirestore.doc.mockImplementation((p) => ({ path: p, get: jest.fn().mockResolvedValue(no()), set: jest.fn() }));
  const txWith = (byPath) => {
    const txSet = jest.fn();
    mockRunTransaction.mockImplementationOnce(async (fn) => fn({
      get: jest.fn(async (ref) => (ref.path in byPath ? (byPath[ref.path] ? doc(byPath[ref.path]) : no()) : no())),
      set: txSet,
      update: jest.fn(),
    }));
    return txSet;
  };
  const invite = { status: "pending", invitedUserId: "u1", inviterId: "inv", childId: "c1" };

  it("refuses an invitation for a child pending deletion", async () => {
    rateLimitOnly();
    const txSet = txWith({ "shareInvitations/i1": invite, "children/c1": { deletedAt: "2026-11-01" }, "children/c1/access/inv": { role: "owner" } });
    await expect(fns.acceptInvitationCF(auth("u1", { invitationId: "i1" }))).rejects.toThrow("Invitation introuvable");
    expect(txSet).not.toHaveBeenCalled();
  });

  it("refuses an invitation whose inviter is no longer owner/admin", async () => {
    rateLimitOnly();
    const txSet = txWith({ "shareInvitations/i1": invite, "children/c1": { name: "B" }, "children/c1/access/inv": { role: "viewer" } });
    await expect(fns.acceptInvitationCF(auth("u1", { invitationId: "i1" }))).rejects.toThrow("plus valide");
    expect(txSet).not.toHaveBeenCalled();
  });

  it("refuses a share code whose creator lost access", async () => {
    rateLimitOnly();
    const code = { childId: "c1", createdBy: "inv", used: false, expiresAt: { toMillis: () => Date.now() + 86400000 } };
    const txSet = txWith({ "shareCodes/ABCDEF": code, "children/c1": { name: "B" } });
    await expect(fns.redeemShareCodeCF(auth("u1", { code: "ABCDEF" }))).rejects.toThrow("plus valide");
    expect(txSet).not.toHaveBeenCalled();
  });
});

// Small in-memory Firestore for the referral flow (audit A2): documents by
// path, equality queries, and transactions whose create() fails on an
// existing document — what the abuse cases depend on.
const referralStore = (initial = {}) => {
  const docs = new Map(Object.entries(initial));
  const snapOf = (path) => (docs.has(path) ? { ...doc(docs.get(path)), id: path.split("/").pop() } : { ...no(), id: path.split("/").pop() });
  const ref = (path) => ({
    path,
    id: path.split("/").pop(),
    get: async () => snapOf(path),
    set: async (data, opts) => docs.set(path, opts?.merge ? { ...(docs.get(path) || {}), ...data } : data),
  });
  mockFirestore.doc.mockImplementation((path) => ref(path));
  mockFirestore.collection.mockImplementation((name) => {
    const filters = [];
    const q = {
      where: (field, _op, value) => { filters.push([field, value]); return q; },
      limit: () => q,
      get: async () => {
        const hits = [...docs.entries()]
          .filter(([path, data]) => path.startsWith(`${name}/`) && path.split("/").length === 2 && filters.every(([f, v]) => data?.[f] === v))
          .map(([path, data]) => ({ id: path.split("/")[1], ref: ref(path), data: () => data }));
        return { empty: hits.length === 0, size: hits.length, docs: hits };
      },
    };
    return q;
  });
  mockRunTransaction.mockReset();
  mockRunTransaction.mockImplementation(async (fn) => {
    const writes = [];
    const result = await fn({
      get: async (r) => snapOf(r.path),
      create: (r, data) => {
        if (docs.has(r.path)) throw Object.assign(new Error("already exists"), { code: 6 });
        writes.push([r.path, data, false]);
      },
      set: (r, data, opts) => writes.push([r.path, data, !!opts?.merge]),
      update: (r, data) => writes.push([r.path, data, true]),
    });
    for (const [path, data, merge] of writes) docs.set(path, merge ? { ...(docs.get(path) || {}), ...data } : data);
    return result;
  });
  return docs;
};
const verified = (uid, data = {}) => ({ auth: { uid, token: { email: `${uid}@t.com`, email_verified: true } }, data, app: true });
const redeem = (uid, code) => fns.validateReferralCode(verified(uid, { referralCode: code }));

describe("validateReferralCode — one referral per account (audit A2)", () => {
  it("rejects unauthenticated calls and unverified e-mails", async () => {
    await expect(fns.validateReferralCode({ auth: null, data: {} })).rejects.toThrow("Authentification");
    referralStore();
    await expect(fns.validateReferralCode({ auth: { uid: "u1", token: { email: "u1@t.com" } }, data: { referralCode: "SAM-AAAA-BBBB" }, app: true })).rejects.toThrow("Vérifiez");
  });

  it("rejects malformed, unknown and own codes", async () => {
    referralStore({ "referral_codes/SAM-AAAA-BBBB": { uid: "parrain" } });
    await expect(redeem("filleul", "")).rejects.toThrow("invalide");
    await expect(redeem("filleul", "SAM-ZZZZ-ZZZZ")).rejects.toThrow("introuvable");
    await expect(redeem("parrain", "sam-aaaa-bbbb")).rejects.toThrow("propre code");
  });

  it("rewards both users, records the use and counts it for the referrer", async () => {
    const docs = referralStore({ "referral_codes/SAM-AAAA-BBBB": { uid: "parrain" } });
    await expect(redeem("filleul", "sam-aaaa-bbbb")).resolves.toMatchObject({ success: true });
    expect(docs.get("referrals/filleul")).toMatchObject({ parrainUid: "parrain", filleulUid: "filleul" });
    expect(docs.get("user_promos/parrain").referralCount).toBe(1);
    expect(docs.get("subscriptions/filleul")).toMatchObject({ tier: "premium", source: "referral_reward" });
    expect(docs.get("subscriptions/parrain")).toMatchObject({ tier: "premium", source: "referral_reward" });
  });

  it("refuses a second use, even after referredBy was removed from user_promos", async () => {
    const docs = referralStore({
      "referral_codes/SAM-AAAA-BBBB": { uid: "parrain" },
      "referral_codes/SAM-CCCC-DDDD": { uid: "other" },
    });
    await redeem("filleul", "SAM-AAAA-BBBB");
    docs.set("user_promos/filleul", {}); // the old exploit: wipe referredBy
    await expect(redeem("filleul", "SAM-CCCC-DDDD")).rejects.toThrow("deja utilise");
  });

  it("refuses an account referred before the fix (random-id referral)", async () => {
    referralStore({
      "referral_codes/SAM-AAAA-BBBB": { uid: "parrain" },
      "referrals/old-random-id": { parrainUid: "x", filleulUid: "filleul" },
    });
    await expect(redeem("filleul", "SAM-AAAA-BBBB")).rejects.toThrow("deja utilise");
  });

  it("stops rewarding a referrer past the cap, still rewards the new user", async () => {
    const docs = referralStore({
      "referral_codes/SAM-AAAA-BBBB": { uid: "parrain" },
      "user_promos/parrain": { referralCount: 10 },
    });
    await redeem("filleul", "SAM-AAAA-BBBB");
    expect(docs.get("subscriptions/filleul")).toMatchObject({ source: "referral_reward" });
    expect(docs.has("subscriptions/parrain")).toBe(false);
    expect(docs.get("user_promos/parrain").referralCount).toBe(11);
  });

  it("does not overwrite an active Family subscription", async () => {
    const docs = referralStore({
      "referral_codes/SAM-AAAA-BBBB": { uid: "parrain" },
      "subscriptions/parrain": { tier: "family", status: "active" },
    });
    await redeem("filleul", "SAM-AAAA-BBBB");
    expect(docs.get("subscriptions/parrain")).toEqual({ tier: "family", status: "active" });
  });

  it("refuses an old code shared by two accounts (one copied it)", async () => {
    referralStore({
      "user_promos/parrain": { referralCode: "SAM-PARR-X1Y2" },
      "user_promos/copycat": { referralCode: "SAM-PARR-X1Y2" },
    });
    await expect(redeem("filleul", "SAM-PARR-X1Y2")).rejects.toThrow("introuvable");
  });

  it("still accepts a code created by the app before the fix", async () => {
    const docs = referralStore({ "user_promos/parrain": { referralCode: "SAM-PARR-X1Y2" } });
    await expect(redeem("filleul", "SAM-PARR-X1Y2")).resolves.toMatchObject({ parrainUid: "parrain" });
    expect(docs.has("referrals/filleul")).toBe(true);
  });
});

describe("ensureReferralCode (audit A2)", () => {
  it("creates a server code and its mapping when the user has none", async () => {
    const docs = referralStore();
    const { referralCode } = await fns.ensureReferralCode(verified("u1"));
    expect(referralCode).toMatch(/^SAM-[A-Z2-9]{4}-[A-Z2-9]{4}$/);
    expect(docs.get(`referral_codes/${referralCode}`)).toMatchObject({ uid: "u1" });
    expect(docs.get("user_promos/u1").referralCode).toBe(referralCode);
  });

  it("keeps an old app-generated code when nobody else owns it", async () => {
    const docs = referralStore({ "user_promos/u1": { referralCode: "SAM-U1AB-CD34" } });
    await expect(fns.ensureReferralCode(verified("u1"))).resolves.toEqual({ referralCode: "SAM-U1AB-CD34" });
    expect(docs.get("referral_codes/SAM-U1AB-CD34")).toMatchObject({ uid: "u1", legacy: true });
  });

  it("replaces a copied code that belongs to someone else", async () => {
    const docs = referralStore({
      "user_promos/thief": { referralCode: "SAM-U1AB-CD34" },
      "referral_codes/SAM-U1AB-CD34": { uid: "u1" },
    });
    const { referralCode } = await fns.ensureReferralCode(verified("thief"));
    expect(referralCode).not.toBe("SAM-U1AB-CD34");
    expect(docs.get(`referral_codes/${referralCode}`)).toMatchObject({ uid: "thief" });
  });
});

describe("checkRateLimit is transactional (S6)", () => {
  it("reads and writes the counter inside a transaction and rejects at the limit", async () => {
    const full = Array.from({ length: 10 }, () => Date.now());
    mockFirestore.doc.mockImplementation((p) => {
      if (p === "rate_limits/u1") return { get: jest.fn().mockResolvedValue(doc({ consent_timestamps: full })), set: jest.fn() };
      return { get: jest.fn().mockResolvedValue(no()), set: jest.fn() };
    });
    await expect(fns.recordHealthConsent(auth("u1", { version: "2.2" }))).rejects.toThrow("Trop de requêtes");
    const txFns = mockFirestore.runTransaction.mock.calls.map(([fn]) => fn.name);
    expect(txFns).toContain("rateLimitTxn");
  });
});

describe("revenueCatWebhook — no event lost on failure (audit A1)", () => {
  const originalSecret = process.env.REVENUECAT_WEBHOOK_SECRET;
  afterEach(() => {
    if (originalSecret === undefined) delete process.env.REVENUECAT_WEBHOOK_SECRET;
    else process.env.REVENUECAT_WEBHOOK_SECRET = originalSecret;
  });
  const event = { id: "evt-a1", type: "RENEWAL", app_user_id: "u1", entitlement_ids: ["premium"] };
  const call = async (ev = event) => {
    process.env.REVENUECAT_WEBHOOK_SECRET = "topsecret";
    const r = { status: jest.fn().mockReturnThis(), send: jest.fn() };
    await fns.revenueCatWebhook(
      { method: "POST", headers: { authorization: "Bearer topsecret" }, body: { event: { event_timestamp_ms: Date.now(), ...ev } } },
      r
    );
    return r;
  };
  beforeEach(() => {
    mockFirestore.doc.mockImplementation((p) => ({ path: p, get: jest.fn().mockResolvedValue(no()), set: jest.fn() }));
    mockFirestore.collection.mockImplementation(() => ({ add: jest.fn().mockResolvedValue({ id: "log" }) }));
    mockRunTransaction.mockReset();
  });

  it("writes the dedup marker and the subscription in the same transaction", async () => {
    const tx = { get: jest.fn().mockResolvedValue(no()), set: jest.fn(), create: jest.fn(), update: jest.fn() };
    mockRunTransaction.mockImplementation(async (fn) => fn(tx));
    const r = await call();
    expect(r.status).toHaveBeenCalledWith(200);
    expect(tx.create).toHaveBeenCalledWith(
      expect.objectContaining({ path: "revenuecat_webhook_events/evt-a1" }),
      expect.objectContaining({ eventId: "evt-a1" })
    );
    expect(tx.set).toHaveBeenCalledWith(
      expect.objectContaining({ path: "subscriptions/u1" }),
      expect.objectContaining({ tier: "premium", status: "active" }),
      { merge: true }
    );
  });

  it("answers 500 when the transaction fails, so the retry processes the event", async () => {
    // First delivery: the transaction aborts (nothing committed, marker included).
    mockRunTransaction.mockRejectedValueOnce(new Error("firestore unavailable"));
    const first = await call();
    expect(first.status).toHaveBeenCalledWith(500);

    // Retry: the marker does not exist, the subscription is written.
    const tx = { get: jest.fn().mockResolvedValue(no()), set: jest.fn(), create: jest.fn(), update: jest.fn() };
    mockRunTransaction.mockImplementation(async (fn) => fn(tx));
    const retry = await call();
    expect(retry.status).toHaveBeenCalledWith(200);
    expect(retry.send).toHaveBeenCalledWith("OK");
    expect(tx.set).toHaveBeenCalled();
  });

  it("answers 500 (retry) when the Auth lookup fails for another reason than a deleted user", async () => {
    const adminMod = require("firebase-admin");
    adminMod.auth.mockReturnValueOnce({ getUser: jest.fn().mockRejectedValue({ code: "auth/internal-error" }) });
    const r = await call();
    expect(r.status).toHaveBeenCalledWith(500);
    expect(mockRunTransaction).not.toHaveBeenCalled();
  });

  it("ignores an app_user_id that is not a plain uid", async () => {
    const r = await call({ ...event, id: "evt-path", app_user_id: "u1/../other" });
    expect(r.send).toHaveBeenCalledWith("OK - invalid user id");
    expect(mockRunTransaction).not.toHaveBeenCalled();
  });

  it("still answers 200 when only the audit log write fails", async () => {
    mockFirestore.collection.mockImplementation(() => ({ add: jest.fn().mockRejectedValue(new Error("log down")) }));
    const tx = { get: jest.fn().mockResolvedValue(no()), set: jest.fn(), create: jest.fn(), update: jest.fn() };
    mockRunTransaction.mockImplementation(async (fn) => fn(tx));
    const r = await call();
    expect(r.status).toHaveBeenCalledWith(200);
    expect(tx.set).toHaveBeenCalled();
  });
});
