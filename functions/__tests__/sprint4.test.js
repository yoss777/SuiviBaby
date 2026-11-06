/* global describe, it, expect, jest, beforeEach, afterEach */
// Sprint 4 (server half): reports hardening (4.4), createShareInvitation
// (4.5), setAdminClaim (4.6), event update/role checks (4.8), removed
// functions (4.9), e-mail verification and RevenueCat TRANSFER (4.10).
const { mockBucket } = require("./setup");
const { memoryStore } = require("./memoryFirestore");
const fns = require("../index");

const adminMod = require("firebase-admin");
const { Resend } = require("resend");

const call = (uid, data = {}, token = {}) => ({
  auth: { uid, token: { email: `${uid}@t.com`, email_verified: true, ...token } },
  data,
  app: true,
});
const codeOf = async (promise) => {
  try {
    await promise;
  } catch (e) {
    return e.code;
  }
  return null;
};
const sentEmails = () => Resend.mock.results.flatMap((r) => r.value.emails.send.mock.calls.map(([p]) => p));

let errorSpy;
let logSpy;
let warnSpy;
beforeEach(() => {
  jest.clearAllMocks();
  errorSpy = jest.spyOn(console, "error").mockImplementation(() => {});
  logSpy = jest.spyOn(console, "log").mockImplementation(() => {});
  warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});
  mockBucket.file.mockClear();
  adminMod.auth.mockReturnValue({
    getUser: jest.fn(async (uid) => ({ uid, email: `${uid}@t.com`, customClaims: {} })),
    getUserByEmail: jest.fn(async (email) => {
      if (email.startsWith("nobody")) throw Object.assign(new Error("none"), { code: "auth/user-not-found" });
      return { uid: email.split("@")[0] };
    }),
    listUsers: jest.fn(async () => ({ users: [], pageToken: undefined })),
    setCustomUserClaims: jest.fn().mockResolvedValue(undefined),
    deleteUser: jest.fn(), updateUser: jest.fn(), revokeRefreshTokens: jest.fn(),
  });
});
afterEach(() => {
  errorSpy.mockRestore();
  logSpy.mockRestore();
  warnSpy.mockRestore();
});

// ---------------------------------------------------------------------------
describe("4.4 photoRefToPath", () => {
  it("accepts a plain child path and a legacy download URL", () => {
    expect(fns.photoRefToPath("children/c1/jalons/a.jpg")).toBe("children/c1/jalons/a.jpg");
    const url = "https://firebasestorage.googleapis.com/v0/b/x/o/children%2Fc1%2Fjalons%2Fa.jpg?alt=media&token=t";
    expect(fns.photoRefToPath(url)).toBe("children/c1/jalons/a.jpg");
  });

  it("rejects traversal, foreign prefixes, malformed encoding and non-strings", () => {
    expect(fns.photoRefToPath("children/c1/../c2/a.jpg")).toBeNull();
    expect(fns.photoRefToPath("users/u1/avatar.jpg")).toBeNull();
    expect(fns.photoRefToPath("https://firebasestorage.googleapis.com/v0/b/x/o/users%2Fu1%2Fa.jpg?alt=media")).toBeNull();
    expect(fns.photoRefToPath("https://firebasestorage.googleapis.com/v0/b/x/o/children%2Fc1%2F..%2Fc2%2Fa.jpg")).toBeNull();
    expect(fns.photoRefToPath("https://firebasestorage.googleapis.com/v0/b/x/o/%E0%A4%A")).toBeNull();
    expect(fns.photoRefToPath(null)).toBeNull();
    expect(fns.photoRefToPath(42)).toBeNull();
    expect(fns.photoRefToPath("")).toBeNull();
  });

  it("restricts to one child folder when a childId is given", () => {
    expect(fns.photoRefToPath("children/c1/a.jpg", "c1")).toBe("children/c1/a.jpg");
    expect(fns.photoRefToPath("children/c2/a.jpg", "c1")).toBeNull();
    expect(fns.photoRefToPath("children/c10/a.jpg", "c1")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
describe("4.4 submitContentReportCF validation", () => {
  const PHOTO = "children/c1/jalons/a.jpg";
  let docs;
  beforeEach(() => {
    docs = memoryStore({
      "children/c1/access/u1": { role: "contributor", userId: "u1" },
      "children/c2/access/u1": { role: "owner", userId: "u1" },
      "events/e1": { childId: "c1", userId: "author", photos: [PHOTO, "https://firebasestorage.googleapis.com/v0/b/x/o/children%2Fc1%2Fjalons%2Fb.jpg?alt=media"] },
      "events/e2": { childId: "c2", userId: "author", photos: ["children/c2/x.jpg"] },
    });
  });
  const report = (data) => fns.submitContentReportCF(call("u1", { reason: "privacy", childId: "c1", ...data }));

  it.each(["a/b", "../c2", "c1 ", "x".repeat(129), "a.b", "c1\n"])("rejects childId %j", async (childId) => {
    expect(await codeOf(report({ childId }))).toBe("invalid-argument");
  });

  it.each(["e1/../e2", "a/b", "e 1", "x".repeat(129), 12])("rejects eventId %j", async (eventId) => {
    expect(await codeOf(report({ eventId }))).toBe("invalid-argument");
  });

  it("rejects an event of another child", async () => {
    expect(await codeOf(report({ eventId: "e2" }))).toBe("invalid-argument");
  });

  it("refuses a photoPath without an event to check it against", async () => {
    expect(await codeOf(report({ photoPath: PHOTO }))).toBe("invalid-argument");
  });

  it.each([
    "children/c2/x.jpg",
    "children/c1/../c2/x.jpg",
    "children/c1/jalons/unknown.jpg",
    "users/u1/a.jpg",
  ])("rejects photoPath %s", async (photoPath) => {
    expect(await codeOf(report({ eventId: "e1", photoPath }))).toBe("invalid-argument");
    expect([...docs.keys()].some((k) => k.startsWith("reports/"))).toBe(false);
  });

  it("stores a photoPath that is in the event photos (plain and legacy URL forms)", async () => {
    const { reportId } = await report({ eventId: "e1", photoPath: PHOTO });
    expect(docs.get(`reports/${reportId}`)).toMatchObject({ childId: "c1", eventId: "e1", photoPath: PHOTO });
    const second = await report({ eventId: "e1", photoPath: "children/c1/jalons/b.jpg" });
    expect(docs.get(`reports/${second.reportId}`).photoPath).toBe("children/c1/jalons/b.jpg");
  });

  it("still refuses a viewer", async () => {
    docs.set("children/c1/access/u1", { role: "viewer", userId: "u1" });
    expect(await codeOf(report({ eventId: "e1" }))).toBe("permission-denied");
  });
});

// ---------------------------------------------------------------------------
describe("4.4 e-mails escape user content", () => {
  const evil = '<img src=x onerror="alert(1)">&"\'';
  beforeEach(() => {
    process.env.RESEND_API_KEY = "k";
    memoryStore({});
    adminMod.auth.mockReturnValue({
      getUser: jest.fn(async () => ({ email: 'a"<b>@t.com' })),
    });
  });
  afterEach(() => delete process.env.RESEND_API_KEY);

  it("escapes every interpolated field of the operator e-mail", async () => {
    await fns.handleReportCreated(
      { data: () => ({
        reporterUserId: "u1", childId: "c<1>", eventId: "e<1>", photoPath: `children/${evil}`,
        message: evil, reason: "other<script>",
      }) },
      { params: { reportId: "r<1>" } },
    );
    const [mail] = sentEmails();
    expect(mail.html).not.toContain("<img");
    expect(mail.html).not.toContain("<script>");
    expect(mail.html).not.toContain("<1>");
    expect(mail.html).not.toContain("<b>");
    expect(mail.html).toContain("&lt;img src=x onerror=&quot;alert(1)&quot;&gt;&amp;&quot;&#39;");
    expect(mail.subject).not.toContain("<script>");
    expect(mail.html).toContain("a&quot;&lt;b&gt;@t.com");
  });
});

describe("4.4 resolveReport", () => {
  const adminCall = (data) => call("adm", data, { admin: true });
  beforeEach(() => {
    adminMod.auth.mockReturnValue({
      getUser: jest.fn(async (uid) => ({ uid, email: `${uid}@t.com`, customClaims: { admin: true } })),
    });
  });

  it("does not delete a photo outside the reported child's folder", async () => {
    const docs = memoryStore({
      "children/c1/access/adm": { role: "owner", userId: "adm" },
      "events/e1": { childId: "c1", userId: "x", photos: ["children/c2/secret.jpg", "children/c1/ok.jpg"] },
      "reports/r1": { status: "open", reporterUserId: "rep", childId: "c1", eventId: "e1", photoPath: "children/c2/secret.jpg" },
      "reports/r2": { status: "open", reporterUserId: "rep", childId: "c1", eventId: "e1", photoPath: "children/c1/../c2/secret.jpg" },
    });
    await fns.resolveReport(adminCall({ reportId: "r1", action: "remove_photo" }));
    await fns.resolveReport(adminCall({ reportId: "r2", action: "remove_photo" }));
    expect(mockBucket.file).not.toHaveBeenCalled();
    expect(docs.get("reports/r1").status).toBe("resolved");
  });

  it("deletes a legitimate photo of the child", async () => {
    memoryStore({
      "children/c1/access/adm": { role: "owner", userId: "adm" },
      "events/e1": { childId: "c1", userId: "x", photos: ["children/c1/ok.jpg"] },
      "reports/r1": { status: "open", reporterUserId: "rep", childId: "c1", eventId: "e1", photoPath: "children/c1/ok.jpg" },
    });
    await fns.resolveReport(adminCall({ reportId: "r1", action: "remove_photo" }));
    expect(mockBucket.file).toHaveBeenCalledWith("children/c1/ok.jpg");
  });
});

// ---------------------------------------------------------------------------
describe("4.5 / 4.10 createShareInvitation", () => {
  let docs;
  beforeEach(() => {
    docs = memoryStore({
      "children/c1": { name: "Léo", ownerId: "u1" },
      "children/c1/access/u1": { role: "owner", userId: "u1" },
    });
  });
  const invite = (data = {}, token) =>
    fns.createShareInvitation(call("u1", { childId: "c1", invitedEmail: "bob@t.com", ...data }, token));
  const invitations = () => [...docs.entries()].filter(([k]) => k.startsWith("shareInvitations/"));

  it("requires a verified e-mail", async () => {
    expect(await codeOf(invite({}, { email_verified: false }))).toBe("failed-precondition");
    expect(await codeOf(invite({}, { email_verified: undefined }))).toBe("failed-precondition");
    expect(invitations()).toHaveLength(0);
  });

  it("reads the child name from the child document, not from the client", async () => {
    await invite({ childName: "<b>Fake</b>" });
    expect(invitations()[0][1].childName).toBe("Léo");
  });

  it("is rate limited", async () => {
    docs.set("children/c1/access/u1", { role: "owner", userId: "u1" });
    // A paid plan avoids the free co-parent cap interfering with the loop.
    docs.set("subscriptions/u1", { tier: "family", status: "active" });
    const results = [];
    for (let i = 0; i < 7; i += 1) results.push(await codeOf(invite({ invitedEmail: `p${i}@t.com` })));
    expect(results.slice(0, 5)).toEqual([null, null, null, null, null]);
    expect(results[5]).toBe("resource-exhausted");
  });

  it("answers an unknown e-mail like a known one, without creating anything", async () => {
    const known = await invite({ invitedEmail: "bob@t.com" });
    const unknown = await invite({ invitedEmail: "nobody@t.com" });
    expect(Object.keys(unknown)).toEqual(Object.keys(known));
    expect(typeof unknown.id).toBe("string");
    expect(unknown.id.length).toBeGreaterThan(0);
    expect(invitations()).toHaveLength(1);
    expect(invitations()[0][1].invitedEmail).toBe("bob@t.com");
  });

  it("does not leak the missing account through an error code or message", async () => {
    await expect(invite({ invitedEmail: "nobody@t.com" })).resolves.toBeDefined();
  });

  it("still refuses an invitation to yourself and from a non owner/admin", async () => {
    expect(await codeOf(invite({ invitedEmail: "u1@t.com" }))).toBe("invalid-argument");
    docs.set("children/c1/access/u1", { role: "contributor", userId: "u1", canWriteEvents: true });
    expect(await codeOf(invite())).toBe("permission-denied");
  });
});

describe("4.10 redeemShareCodeCF / acceptInvitationCF need a verified e-mail", () => {
  beforeEach(() => {
    memoryStore({
      "children/c1": { name: "Léo", ownerId: "own" },
      "children/c1/access/own": { role: "owner", userId: "own" },
      "shareCodes/ABCD1234": { childId: "c1", createdBy: "own", used: false, code: "ABCD1234" },
      "shareInvitations/i1": { childId: "c1", inviterId: "own", invitedEmail: "u1@t.com", invitedUserId: "u1", status: "pending" },
    });
  });

  it("refuses an unverified account for a share code", async () => {
    expect(await codeOf(fns.redeemShareCodeCF(call("u1", { code: "ABCD1234" }, { email_verified: false })))).toBe("failed-precondition");
    await expect(fns.redeemShareCodeCF(call("u1", { code: "ABCD1234" }))).resolves.toMatchObject({ childId: "c1" });
  });

  it("refuses an unverified account for an invitation", async () => {
    expect(await codeOf(fns.acceptInvitationCF(call("u1", { invitationId: "i1" }, { email_verified: false })))).toBe("failed-precondition");
    await expect(fns.acceptInvitationCF(call("u1", { invitationId: "i1" }))).resolves.toEqual({ success: true });
  });
});

// ---------------------------------------------------------------------------
describe("4.6 setAdminClaim", () => {
  const seedCall = (token) => call("u1", { targetUid: "t1", value: true, reason: "first admin bootstrap" }, token);
  let originalSeed;
  beforeEach(() => {
    originalSeed = process.env.INITIAL_ADMIN_EMAIL;
    process.env.INITIAL_ADMIN_EMAIL = "u1@t.com";
    memoryStore({});
  });
  afterEach(() => {
    if (originalSeed === undefined) delete process.env.INITIAL_ADMIN_EMAIL;
    else process.env.INITIAL_ADMIN_EMAIL = originalSeed;
  });

  it("requires a verified e-mail even for the seed address", async () => {
    expect(await codeOf(fns.setAdminClaim(seedCall({ email_verified: false })))).toBe("permission-denied");
    expect(await codeOf(fns.setAdminClaim(seedCall({ email_verified: undefined })))).toBe("permission-denied");
    expect(adminMod.auth().setCustomUserClaims).not.toHaveBeenCalled();
  });

  it("requires a verified e-mail for an existing admin too", async () => {
    const adminCall = call("a1", { targetUid: "t1", value: true, reason: "promote colleague" }, { admin: true, email_verified: false });
    expect(await codeOf(fns.setAdminClaim(adminCall))).toBe("permission-denied");
  });

  it("bootstraps the first admin with the verified seed e-mail", async () => {
    await expect(fns.setAdminClaim(seedCall())).resolves.toMatchObject({ success: true });
  });

  it("closes the bootstrap once an admin exists in Firebase Auth, even without an audit trail", async () => {
    adminMod.auth.mockReturnValue({
      getUser: jest.fn(async (uid) => ({ uid, customClaims: {} })),
      listUsers: jest.fn(async () => ({ users: [{ uid: "old", customClaims: { admin: true } }], pageToken: undefined })),
      setCustomUserClaims: jest.fn(),
    });
    expect(await codeOf(fns.setAdminClaim(seedCall()))).toBe("permission-denied");
  });

  it("finds an admin on a later page of users", async () => {
    const listUsers = jest.fn()
      .mockResolvedValueOnce({ users: [{ uid: "a", customClaims: {} }], pageToken: "p2" })
      .mockResolvedValueOnce({ users: [{ uid: "b", customClaims: { admin: true } }], pageToken: undefined });
    adminMod.auth.mockReturnValue({ getUser: jest.fn(), listUsers, setCustomUserClaims: jest.fn() });
    expect(await codeOf(fns.setAdminClaim(seedCall()))).toBe("permission-denied");
    expect(listUsers).toHaveBeenCalledTimes(2);
  });

  it("closes the bootstrap once the audit log shows a promotion", async () => {
    memoryStore({ "adminAuditLog/x": { type: "setAdminClaim", value: true } });
    expect(await codeOf(fns.setAdminClaim(seedCall()))).toBe("permission-denied");
  });

  it("fails closed when Auth cannot be listed", async () => {
    adminMod.auth.mockReturnValue({ getUser: jest.fn(), listUsers: jest.fn().mockRejectedValue(new Error("down")), setCustomUserClaims: jest.fn() });
    await expect(fns.setAdminClaim(seedCall())).rejects.toThrow();
    expect(adminMod.auth().setCustomUserClaims).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
describe("4.8 events: roles and update sanitising", () => {
  let docs;
  beforeEach(() => {
    docs = memoryStore({
      "children/c1/access/own": { role: "owner", userId: "own" },
      "children/c1/access/adm": { role: "admin", userId: "adm" },
      "children/c1/access/con": { role: "contributor", userId: "con", canWriteEvents: false },
      // Legacy contributor carrying a write flag must not write events.
      "children/c1/access/flag": { role: "contributor", userId: "flag", canWriteEvents: true },
      "children/c1/access/vie": { role: "viewer", userId: "vie", canWriteEvents: true },
      "events/e1": { childId: "c1", userId: "own", type: "biberon", quantite: 100, createdAt: "T0", photos: ["children/c1/a.jpg"] },
    });
  });

  it.each(["con", "flag", "vie"])("%s cannot create, update or delete an event", async (uid) => {
    expect(await codeOf(fns.validateAndCreateEvent(call(uid, { childId: "c1", type: "couche" })))).toBe("permission-denied");
    expect(await codeOf(fns.validateAndUpdateEvent(call(uid, { childId: "c1", eventId: "e1", note: "x" })))).toBe("permission-denied");
    expect(await codeOf(fns.deleteEventCascade(call(uid, { childId: "c1", eventId: "e1" })))).toBe("permission-denied");
    expect(docs.get("events/e1").note).toBeUndefined();
    expect(docs.has("events/e1")).toBe(true);
  });

  it.each(["own", "adm"])("%s can update an event", async (uid) => {
    await fns.validateAndUpdateEvent(call(uid, { childId: "c1", eventId: "e1", note: "ok" }));
    expect(docs.get("events/e1").note).toBe("ok");
  });

  it("ignores attempts to change createdAt, reported, userId, childId, idempotencyKey", async () => {
    docs.set("events/e1", { ...docs.get("events/e1"), reported: true, idempotencyKey: "k1" });
    await fns.validateAndUpdateEvent(call("own", {
      childId: "c1", eventId: "e1", note: "ok",
      createdAt: { seconds: 1, nanoseconds: 0 }, reported: false, userId: "evil", idempotencyKey: "k2", id: "zzz",
    }));
    const after = docs.get("events/e1");
    expect(after).toMatchObject({ note: "ok", createdAt: "T0", reported: true, userId: "own", childId: "c1", idempotencyKey: "k1" });
    expect(after.id).toBeUndefined();
  });

  it("does not let null delete the protected fields", async () => {
    docs.set("events/e1", { ...docs.get("events/e1"), reported: true });
    await fns.validateAndUpdateEvent(call("own", { childId: "c1", eventId: "e1", reported: null, createdAt: null }));
    expect(docs.get("events/e1")).toMatchObject({ reported: true, createdAt: "T0" });
  });

  it.each([
    [{ childId: "c1", eventId: "e1/../x" }],
    [{ childId: "c1", eventId: "a/b" }],
    [{ childId: "c/1", eventId: "e1" }],
    [{ childId: "c1", eventId: 5 }],
  ])("rejects malformed ids %j", async (data) => {
    expect(await codeOf(fns.validateAndUpdateEvent(call("own", data)))).toBe("invalid-argument");
    expect(await codeOf(fns.deleteEventCascade(call("own", data)))).toBe("invalid-argument");
  });
});

// ---------------------------------------------------------------------------
describe("5.6 temperature bounds 34-43 (same as the form, utils/eventBounds.ts)", () => {
  let docs;
  beforeEach(() => {
    docs = memoryStore({
      "children/c1/access/own": { role: "owner", userId: "own" },
      "events/t1": { childId: "c1", userId: "own", type: "temperature", valeur: 37, createdAt: "T0" },
    });
  });

  it.each([33.9, 43.1, 45, 0, -1, "38", NaN])("create rejects %p", async (valeur) => {
    expect(await codeOf(fns.validateAndCreateEvent(call("own", { childId: "c1", type: "temperature", valeur })))).toBe("invalid-argument");
  });

  it.each([33.9, 43.1, 45])("update rejects %p", async (valeur) => {
    expect(await codeOf(fns.validateAndUpdateEvent(call("own", { childId: "c1", eventId: "t1", valeur })))).toBe("invalid-argument");
    expect(docs.get("events/t1").valeur).toBe(37);
  });

  it.each([34, 38, 43])("create and update accept %p", async (valeur) => {
    expect(await codeOf(fns.validateAndCreateEvent(call("own", { childId: "c1", type: "temperature", valeur })))).toBeNull();
    await fns.validateAndUpdateEvent(call("own", { childId: "c1", eventId: "t1", valeur }));
    expect(docs.get("events/t1").valeur).toBe(valeur);
  });
});

// ---------------------------------------------------------------------------
describe("4.9 removed functions", () => {
  it.each(["generateAiInsight", "migrateUsersPublicRemoveEmail", "grandfatherExistingUsers"])("%s is no longer exported", (name) => {
    expect(fns[name]).toBeUndefined();
  });
  it("keeps the functions the app still calls", () => {
    for (const name of ["createShareInvitation", "setAdminClaim", "revenueCatWebhook"]) {
      expect(typeof fns[name]).toBe("function");
    }
  });
});

// ---------------------------------------------------------------------------
describe("4.10 revenueCatWebhook TRANSFER", () => {
  const SECRET = "whsec";
  let originalSecret;
  beforeEach(() => {
    originalSecret = process.env.REVENUECAT_WEBHOOK_SECRET;
    process.env.REVENUECAT_WEBHOOK_SECRET = SECRET;
  });
  afterEach(() => {
    if (originalSecret === undefined) delete process.env.REVENUECAT_WEBHOOK_SECRET;
    else process.env.REVENUECAT_WEBHOOK_SECRET = originalSecret;
  });

  const run = async (event) => {
    const res = { status: jest.fn().mockReturnThis(), send: jest.fn() };
    await fns.revenueCatWebhook({ method: "POST", headers: { authorization: `Bearer ${SECRET}` }, body: { event } }, res);
    return { status: res.status.mock.calls[0]?.[0], body: res.send.mock.calls[0]?.[0] };
  };
  const future = new Date(Date.now() + 20 * 86400000).toISOString();
  const premiumSub = { tier: "premium", status: "active", billingPeriod: "annual", expiresAt: future, productId: "premium_annual", lastEventTimestampMs: 1000 };
  const transfer = (extra = {}) => ({
    id: "t-1", type: "TRANSFER", event_timestamp_ms: Date.now(),
    transferred_from: ["old"], transferred_to: ["new"], ...extra,
  });

  it("moves the entitlement from the old account to the new one", async () => {
    const docs = memoryStore({ "subscriptions/old": premiumSub });
    const out = await run(transfer());
    expect(out.status).toBe(200);
    expect(docs.get("subscriptions/new")).toMatchObject({
      tier: "premium", status: "active", billingPeriod: "annual", expiresAt: future, productId: "premium_annual", lastEvent: "TRANSFER",
    });
    expect(docs.get("subscriptions/old")).toMatchObject({ tier: "free", status: "expired", lastEvent: "TRANSFER" });
    expect(docs.has("revenuecat_webhook_events/t-1")).toBe(true);
  });

  it("is idempotent: a replay changes nothing", async () => {
    const docs = memoryStore({ "subscriptions/old": premiumSub });
    await run(transfer());
    docs.set("subscriptions/new", { ...docs.get("subscriptions/new"), tier: "family", marker: 1 });
    const out = await run(transfer());
    expect(out.body).toMatch(/duplicate/);
    expect(docs.get("subscriptions/new")).toMatchObject({ tier: "family", marker: 1 });
  });

  it("does nothing when no source holds an entitlement", async () => {
    const docs = memoryStore({ "subscriptions/old": { tier: "free", status: "expired" } });
    const out = await run(transfer());
    expect(out.status).toBe(200);
    expect(docs.has("subscriptions/new")).toBe(false);
  });

  it("ignores anonymous and malformed ids", async () => {
    const docs = memoryStore({ "subscriptions/old": premiumSub });
    await run(transfer({ transferred_from: ["old", "$RCAnonymousID:abc", "a/b"], transferred_to: ["$RCAnonymousID:def", "x/y", "new"] }));
    expect([...docs.keys()].filter((k) => k.startsWith("subscriptions/")).sort()).toEqual(["subscriptions/new", "subscriptions/old"]);
  });

  it("skips a destination whose Firebase account no longer exists", async () => {
    adminMod.auth.mockReturnValue({
      getUser: jest.fn(async (uid) => {
        if (uid === "gone") throw Object.assign(new Error("x"), { code: "auth/user-not-found" });
        return { uid };
      }),
    });
    const docs = memoryStore({ "subscriptions/old": premiumSub });
    await run(transfer({ transferred_to: ["gone", "new"] }));
    expect(docs.has("subscriptions/gone")).toBe(false);
    expect(docs.get("subscriptions/new").tier).toBe("premium");
  });

  it("uses the entitlements of the event when the source is an anonymous id with no stored state", async () => {
    const docs = memoryStore({});
    await run(transfer({
      transferred_from: ["$RCAnonymousID:abc"], entitlement_ids: ["family"], product_id: "family_monthly",
      expiration_at_ms: Date.parse(future),
    }));
    expect(docs.get("subscriptions/new")).toMatchObject({ tier: "family", status: "active", billingPeriod: "monthly" });
  });

  it("does not overwrite a destination that already has a longer entitlement", async () => {
    const later = new Date(Date.now() + 400 * 86400000).toISOString();
    const docs = memoryStore({
      "subscriptions/old": premiumSub,
      "subscriptions/new": { tier: "family", status: "active", expiresAt: later },
    });
    await run(transfer());
    expect(docs.get("subscriptions/new")).toMatchObject({ tier: "family", expiresAt: later });
    expect(docs.get("subscriptions/old").tier).toBe("free");
  });

  it("keeps an older TRANSFER from overwriting a newer state", async () => {
    const docs = memoryStore({ "subscriptions/old": { ...premiumSub, lastEventTimestampMs: Date.now() + 1000 } });
    await run(transfer({ event_timestamp_ms: Date.now() }));
    expect(docs.get("subscriptions/old").tier).toBe("premium");
    expect(docs.has("subscriptions/new")).toBe(false);
  });

  it("returns 500 when Auth cannot be reached so RevenueCat retries", async () => {
    adminMod.auth.mockReturnValue({ getUser: jest.fn().mockRejectedValue(new Error("net")) });
    memoryStore({ "subscriptions/old": premiumSub });
    expect((await run(transfer())).status).toBe(500);
  });
});
