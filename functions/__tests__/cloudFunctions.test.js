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
      fns.transcribeAudio(auth("u1", { audioBase64: Buffer.from("audio").toString("base64") }))
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
      });

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
      fns.transcribeAudio(auth("u1", { audioBase64: Buffer.from("audio").toString("base64") }))
    ).resolves.toEqual({ text: "ajoute une sieste" });
    expect(txSet).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ voiceCommandCount: 2, lastVoiceCommandAt: "TS" }),
      { merge: true }
    );
    expect(global.fetch).toHaveBeenCalledTimes(3);
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

describe("resolveReport (T2 — child ownership check)", () => {
  const admin = require("firebase-admin");

  function setupAdminAuth({ callerHasAdminClaim }) {
    admin.auth.mockReturnValue({
      getUser: jest.fn(async (uid) => {
        if (uid === "admin1") {
          return { uid, customClaims: callerHasAdminClaim ? { admin: true } : {} };
        }
        // reporter lookup — return a benign record without email
        return { uid, customClaims: {} };
      }),
      deleteUser: jest.fn(),
    });
  }

  function setupFirestore({ accessRoleForCaller }) {
    mockFirestore.doc.mockImplementation((p) => {
      if (p === "reports/r1") {
        return {
          get: jest.fn().mockResolvedValue(doc({
            childId: "c1",
            eventId: "e1",
            reporterUserId: "u_reporter",
            status: "pending",
          })),
          update: jest.fn(),
        };
      }
      if (p === "children/c1/access/admin1") {
        return {
          get: jest.fn().mockResolvedValue(
            accessRoleForCaller
              ? doc({ role: accessRoleForCaller })
              : no()
          ),
        };
      }
      if (p === "events/e1") {
        return { get: jest.fn().mockResolvedValue(no()), update: jest.fn() };
      }
      return { get: jest.fn().mockResolvedValue(no()), update: jest.fn() };
    });
  }

  it("rejects callers without the admin custom claim", async () => {
    setupAdminAuth({ callerHasAdminClaim: false });
    setupFirestore({ accessRoleForCaller: "owner" });
    await expect(
      fns.resolveReport(auth("admin1", { reportId: "r1", action: "dismiss" }))
    ).rejects.toThrow("administrateurs");
  });

  it("rejects platform admin without owner/admin role on the targeted child", async () => {
    setupAdminAuth({ callerHasAdminClaim: true });
    setupFirestore({ accessRoleForCaller: null });
    await expect(
      fns.resolveReport(auth("admin1", { reportId: "r1", action: "dismiss" }))
    ).rejects.toThrow("accès à cet enfant");
  });

  it("rejects platform admin who is only a viewer on the child", async () => {
    setupAdminAuth({ callerHasAdminClaim: true });
    setupFirestore({ accessRoleForCaller: "viewer" });
    await expect(
      fns.resolveReport(auth("admin1", { reportId: "r1", action: "dismiss" }))
    ).rejects.toThrow("accès à cet enfant");
  });

  it("allows platform admin who is also an owner on the child", async () => {
    setupAdminAuth({ callerHasAdminClaim: true });
    setupFirestore({ accessRoleForCaller: "owner" });
    // RESEND key absent → notification path skipped, action still resolves
    delete process.env.RESEND_API_KEY;
    await expect(
      fns.resolveReport(auth("admin1", { reportId: "r1", action: "dismiss" }))
    ).resolves.toMatchObject({ success: true, action: "dismiss" });
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
