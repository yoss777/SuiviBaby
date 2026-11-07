/* global describe, it, expect, jest, beforeEach, afterEach, Buffer, __dirname */
// Review findings (server side): consent withdrawal, server-side account
// deletion request, transferAndLeave hijack, enumeration, purge details,
// consent gating of scheduled jobs, AssemblyAI cleanup, 90-day retention.
const fs = require("node:fs");
const path = require("node:path");
const { mockBucket } = require("./setup");
const { memoryStore } = require("./memoryFirestore");
const fns = require("../index");

const adminMod = require("firebase-admin");
const { Expo } = require("expo-server-sdk");
const { Resend } = require("resend");

// Le client Expo est créé à la demande (S7.9) : on lit l'instance au moment de
// l'usage ; tant qu'aucun envoi n'a eu lieu, un mock vide fait office de neuf.
const expoInstance = {
  get sendPushNotificationsAsync() {
    return Expo.mock.results[0]?.value.sendPushNotificationsAsync ?? jest.fn();
  },
};
Expo.isExpoPushToken = jest.fn(() => true);

const DAY = 24 * 3600 * 1000;
const nowSec = () => Math.floor(Date.now() / 1000);
const call = (uid, data = {}, token = {}) => ({
  auth: { uid, token: { email: `${uid}@t.com`, auth_time: nowSec(), ...token } },
  data,
  app: true,
});
const keys = (docs, prefix) => [...docs.keys()].filter((k) => k.startsWith(prefix));
const scheduled = new Date(Date.now() - 31 * DAY).toISOString();
const past = new Date(Date.now() - DAY).toISOString();

beforeEach(() => jest.clearAllMocks());

// ---------------------------------------------------------------------------
describe("health consent: replace and withdraw", () => {
  it("recordHealthConsent replaces the whole healthDataConsent map", async () => {
    const docs = memoryStore({
      "user_preferences/u1": { theme: "dark", healthDataConsent: { granted: false, withdrawnAt: "x", version: "2.1", stale: 1 } },
    });
    await fns.recordHealthConsent(call("u1", { version: "2.2" }));
    const c = docs.get("user_preferences/u1").healthDataConsent;
    expect(c).toEqual({ granted: true, grantedAt: expect.any(String), version: "2.2" });
    expect(docs.get("user_preferences/u1").theme).toBe("dark");
  });

  it("withdrawHealthConsent appends a record and replaces the map", async () => {
    const docs = memoryStore({
      "user_preferences/u1": { healthDataConsent: { granted: true, grantedAt: "x", version: "2.2" }, theme: "dark" },
    });
    await expect(fns.withdrawHealthConsent(call("u1"))).resolves.toEqual({ success: true });
    const [, rec] = keys(docs, "consent_records/").map((k) => [k, docs.get(k)])[0];
    expect(rec).toEqual({ uid: "u1", type: "health_data", granted: false, withdrawnAt: "TS", version: "2.2" });
    expect(docs.get("user_preferences/u1").healthDataConsent).toEqual({
      granted: false, withdrawnAt: expect.stringMatching(/^\d{4}-/), version: "2.2",
    });
    expect(docs.get("user_preferences/u1").theme).toBe("dark");
  });

  it("withdrawHealthConsent requires authentication", async () => {
    memoryStore({});
    await expect(fns.withdrawHealthConsent({ auth: null, data: {} })).rejects.toMatchObject({ code: "unauthenticated" });
  });
});

// ---------------------------------------------------------------------------
describe("requestAccountDeletion / cancelAccountDeletion", () => {
  let authApi;
  let errorSpy;
  const sentEmails = () => Resend.mock.results.flatMap((r) => r.value.emails.send.mock.calls);
  beforeEach(() => {
    process.env.RESEND_API_KEY = "re_test";
    authApi = { getUser: jest.fn().mockResolvedValue({ email: "u1@t.com" }) };
    adminMod.auth.mockReturnValue(authApi);
    errorSpy = jest.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => {
    delete process.env.RESEND_API_KEY;
    errorSpy.mockRestore();
  });

  it("requires authentication", async () => {
    memoryStore({});
    await expect(fns.requestAccountDeletion({ auth: null, data: {} })).rejects.toMatchObject({ code: "unauthenticated" });
  });

  it.each([[600], [301], [86400 * 30]])("refuses a login older than 5 minutes (%p s)", async (age) => {
    const docs = memoryStore({ "users/u1": { email: "u1@t.com" } });
    await expect(fns.requestAccountDeletion(call("u1", {}, { auth_time: nowSec() - age })))
      .rejects.toMatchObject({ code: "failed-precondition", details: { reason: "recent-login-required" } });
    expect(docs.get("users/u1")).not.toHaveProperty("pendingDeletion");
  });

  it("refuses a token without auth_time", async () => {
    memoryStore({ "users/u1": {} });
    await expect(fns.requestAccountDeletion(call("u1", {}, { auth_time: undefined })))
      .rejects.toMatchObject({ details: { reason: "recent-login-required" } });
  });

  it("schedules deletion 30 days ahead, drops device tokens and e-mails", async () => {
    const docs = memoryStore({
      "users/u1": { email: "u1@t.com", name: "x" },
      "device_tokens/t1": { userId: "u1", token: "a" },
      "device_tokens/t2": { userId: "u2", token: "b" },
    });
    const before = Date.now();
    const res = await fns.requestAccountDeletion(call("u1"));
    const at = new Date(res.deletionDate).getTime();
    expect(at).toBeGreaterThanOrEqual(before + 30 * DAY - 1000);
    expect(at).toBeLessThanOrEqual(Date.now() + 30 * DAY + 1000);
    const pd = docs.get("users/u1").pendingDeletion;
    expect(pd).toEqual({ scheduledAt: expect.any(String), deletionDate: res.deletionDate, email: "u1@t.com" });
    expect(docs.get("users/u1").name).toBe("x");
    expect(docs.has("device_tokens/t1")).toBe(false);
    expect(docs.has("device_tokens/t2")).toBe(true);
    expect(sentEmails()).toHaveLength(1);
    expect(sentEmails()[0][0].to).toBe("u1@t.com");
  });

  it("keeps the schedule when the e-mail cannot be sent", async () => {
    delete process.env.RESEND_API_KEY;
    const docs = memoryStore({ "users/u1": {} });
    const res = await fns.requestAccountDeletion(call("u1"));
    expect(docs.get("users/u1").pendingDeletion.deletionDate).toBe(res.deletionDate);
  });

  it("is idempotent: an existing request keeps its date", async () => {
    const existing = { scheduledAt: scheduled, deletionDate: new Date(Date.now() + 5 * DAY).toISOString() };
    const docs = memoryStore({ "users/u1": { pendingDeletion: existing } });
    const res = await fns.requestAccountDeletion(call("u1"));
    expect(res.deletionDate).toBe(existing.deletionDate);
    expect(docs.get("users/u1").pendingDeletion).toEqual(existing);
  });

  it("cancelAccountDeletion removes pendingDeletion only", async () => {
    const docs = memoryStore({ "users/u1": { name: "x", pendingDeletion: { deletionDate: past } } });
    await expect(fns.cancelAccountDeletion(call("u1"))).resolves.toEqual({ success: true });
    expect(docs.get("users/u1")).toEqual({ name: "x" });
    await expect(fns.cancelAccountDeletion({ auth: null, data: {} })).rejects.toMatchObject({ code: "unauthenticated" });
  });

  it("the legacy sendDeletionRequestEmail callable still works", async () => {
    memoryStore({ "users/u1": { pendingDeletion: { scheduledAt: scheduled, deletionDate: past } } });
    await expect(fns.sendDeletionRequestEmail(call("u1"))).resolves.toEqual({ success: true });
    expect(sentEmails()).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
describe("H1 transferAndLeave", () => {
  const seed = () => ({
    "children/c1": { name: "L", ownerId: "A" },
    "children/c1/access/A": { role: "owner", userId: "A" },
    "children/c1/access/B": { role: "owner", userId: "B" },
    "children/c1/access/C": { role: "viewer", userId: "C" },
    "user_child_access/A_c1": { userId: "A", childId: "c1" },
    "user_child_access/B_c1": { userId: "B", childId: "c1" },
    "user_child_access/C_c1": { userId: "C", childId: "c1" },
  });

  it("a co-owner cannot hijack ownerId: only their own access is removed", async () => {
    const docs = memoryStore(seed());
    const res = await fns.transferAndLeave(call("B", { childId: "c1", newOwnerId: "C" }));
    expect(res).toEqual({ success: true, transferred: false });
    expect(docs.get("children/c1").ownerId).toBe("A");
    expect(docs.get("children/c1/access/C").role).toBe("viewer");
    expect(docs.get("children/c1/access/A").role).toBe("owner");
    expect(docs.has("children/c1/access/B")).toBe(false);
    expect(docs.has("user_child_access/B_c1")).toBe(false);
    expect(docs.has("user_child_access/A_c1")).toBe(true);
    expect(adminMod.firestore.FieldValue.arrayRemove).toHaveBeenCalledWith("c1");
  });

  it("the primary owner transfers and leaves", async () => {
    const docs = memoryStore(seed());
    const res = await fns.transferAndLeave(call("A", { childId: "c1", newOwnerId: "C" }));
    expect(res).toEqual({ success: true, transferred: true });
    expect(docs.get("children/c1").ownerId).toBe("C");
    expect(docs.get("children/c1/access/C")).toMatchObject({ role: "owner", grantedBy: "A" });
    expect(docs.has("children/c1/access/A")).toBe(false);
    expect(docs.has("user_child_access/A_c1")).toBe(false);
  });

  it("re-reads the new owner's access inside the transaction", async () => {
    const state = seed();
    delete state["children/c1/access/C"];
    const docs = memoryStore(state);
    await expect(fns.transferAndLeave(call("A", { childId: "c1", newOwnerId: "C" }))).rejects.toMatchObject({ code: "not-found" });
    expect(docs.get("children/c1").ownerId).toBe("A");
    expect(docs.has("children/c1/access/A")).toBe(true);
  });

  it("refuses an admin caller and a child pending deletion", async () => {
    const s = seed();
    s["children/c1/access/B"].role = "admin";
    memoryStore(s);
    await expect(fns.transferAndLeave(call("B", { childId: "c1", newOwnerId: "C" }))).rejects.toMatchObject({ code: "permission-denied" });
    const s2 = seed();
    s2["children/c1"].deletedAt = "x";
    memoryStore(s2);
    await expect(fns.transferAndLeave(call("A", { childId: "c1", newOwnerId: "C" }))).rejects.toMatchObject({ code: "failed-precondition" });
  });
});

// ---------------------------------------------------------------------------
describe("M3 enumeration", () => {
  const verified = (uid) => call(uid, { childId: "c1", invitedEmail: "x@t.com" }, { email_verified: true });
  beforeEach(() => {
    adminMod.auth.mockReturnValue({ getUserByEmail: jest.fn().mockResolvedValue({ uid: "target" }) });
  });
  const base = () => ({
    "children/c1": { name: "L", ownerId: "me" },
    "children/c1/access/me": { role: "owner", userId: "me" },
  });

  it("already-linked and already-pending answer like a success, creating nothing", async () => {
    const linked = memoryStore({ ...base(), "children/c1/access/target": { role: "viewer" } });
    const r1 = await fns.createShareInvitation(verified("me"));
    expect(r1).toEqual({ id: expect.stringMatching(/^[A-Za-z0-9]{20}$/) });
    expect(keys(linked, "shareInvitations/")).toEqual([]);

    const pending = memoryStore({
      ...base(),
      "shareInvitations/i1": { childId: "c1", invitedEmail: "x@t.com", inviterId: "me", status: "pending" },
    });
    const r2 = await fns.createShareInvitation(verified("me"));
    expect(r2).toEqual({ id: expect.stringMatching(/^[A-Za-z0-9]{20}$/) });
    expect(keys(pending, "shareInvitations/")).toEqual(["shareInvitations/i1"]);
  });

  it("findUserByEmail is removed (no caller in the app)", () => {
    expect(fns.findUserByEmail).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
describe("M1 processScheduledDeletions ignores a too-short window", () => {
  let authApi;
  let errorSpy;
  beforeEach(() => {
    delete process.env.RESEND_API_KEY;
    authApi = {
      getUser: jest.fn().mockResolvedValue({ email: "p@t.com" }),
      deleteUser: jest.fn().mockResolvedValue(undefined),
      updateUser: jest.fn().mockResolvedValue(undefined),
      revokeRefreshTokens: jest.fn().mockResolvedValue(undefined),
    };
    adminMod.auth.mockReturnValue(authApi);
    mockBucket.getFiles.mockResolvedValue([[]]);
    errorSpy = jest.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => errorSpy.mockRestore());

  it("purges a 30-day window, ignores a 1-day one and a missing scheduledAt, with an error log", async () => {
    const docs = memoryStore({
      "users/ok": { pendingDeletion: { scheduledAt: scheduled, deletionDate: past } },
      "users/short": { pendingDeletion: { scheduledAt: new Date(Date.now() - 2 * DAY).toISOString(), deletionDate: past } },
      "users/nosched": { pendingDeletion: { deletionDate: past } },
    });
    await fns.processScheduledDeletions();
    expect(docs.has("users/ok")).toBe(false);
    expect(docs.has("users/short")).toBe(true);
    expect(docs.has("users/nosched")).toBe(true);
    expect(authApi.deleteUser).toHaveBeenCalledTimes(1);
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining("INVALID_PENDING_DELETION"));
  });
});

// ---------------------------------------------------------------------------
describe("purgeUserData details (M6, L1, HC3)", () => {
  const UID = "p1";
  let authApi;
  let errorSpy;
  beforeEach(() => {
    delete process.env.RESEND_API_KEY;
    process.env.APPLE_TEAM_ID = "T";
    authApi = {
      getUser: jest.fn().mockResolvedValue({ email: "p1@t.com" }),
      deleteUser: jest.fn().mockResolvedValue(undefined),
      updateUser: jest.fn().mockResolvedValue(undefined),
      revokeRefreshTokens: jest.fn().mockResolvedValue(undefined),
    };
    adminMod.auth.mockReturnValue(authApi);
    mockBucket.getFiles.mockResolvedValue([[]]);
    errorSpy = jest.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => {
    delete process.env.APPLE_TEAM_ID;
    errorSpy.mockRestore();
  });
  const base = (extra = {}) => ({
    [`users/${UID}`]: { pendingDeletion: { scheduledAt: scheduled, deletionDate: past } },
    [`apple_tokens/${UID}`]: { refreshToken: "rt" },
    ...extra,
  });

  it("M6: a failed Apple revoke keeps the token doc, counts the failure and retries the purge", async () => {
    // Apple secrets missing: revoke cannot succeed.
    const docs = memoryStore(base());
    await fns.processScheduledDeletions();
    expect(docs.get(`apple_tokens/${UID}`)).toMatchObject({ refreshToken: "rt", revokeFailures: 1 });
    expect(docs.has(`users/${UID}`)).toBe(true);
    expect(authApi.deleteUser).not.toHaveBeenCalled();
    expect(docs.get(`users/${UID}`).pendingDeletion.failureCount).toBe(1);
  });

  it("M6: after 5 failures it logs STUCK_APPLE_REVOKE and finishes the purge", async () => {
    const docs = memoryStore(base());
    docs.set(`apple_tokens/${UID}`, { refreshToken: "rt", revokeFailures: 4 });
    await fns.processScheduledDeletions();
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining("STUCK_APPLE_REVOKE"), expect.anything());
    expect(docs.has(`apple_tokens/${UID}`)).toBe(false);
    expect(docs.has(`users/${UID}`)).toBe(false);
  });

  it("L1: purges user_hidden_photos by id and invitations by inviterId / invitedUserId", async () => {
    const docs = memoryStore({
      ...base(),
      [`user_hidden_photos/${UID}`]: { photos: ["x"] },
      "shareInvitations/a": { inviterId: UID, childId: "z" },
      "shareInvitations/b": { invitedUserId: UID, childId: "z" },
      "shareInvitations/keep": { inviterId: "other", invitedUserId: "other2" },
    });
    docs.delete(`apple_tokens/${UID}`);
    await fns.processScheduledDeletions();
    expect(docs.has(`user_hidden_photos/${UID}`)).toBe(false);
    expect(docs.has("shareInvitations/a")).toBe(false);
    expect(docs.has("shareInvitations/b")).toBe(false);
    expect(docs.has("shareInvitations/keep")).toBe(true);
  });

  it("HC3: appends an account_deleted withdrawal record kept 5 years", async () => {
    const docs = memoryStore(base({ "consent_records/c1": { uid: UID, granted: true } }));
    docs.delete(`apple_tokens/${UID}`);
    await fns.processScheduledDeletions();
    const recs = keys(docs, "consent_records/").map((k) => docs.get(k));
    expect(recs).toHaveLength(2);
    const w = recs.find((r) => r.reason === "account_deleted");
    expect(w).toMatchObject({ uid: UID, granted: false, type: "health_data" });
    expect(w.withdrawnAt).toBeDefined();
    expect(w.expireAt.toMillis()).toBeGreaterThan(Date.now() + 5 * 365 * DAY - 2 * DAY);
    expect(recs.find((r) => r.granted === true).expireAt.toMillis()).toBe(w.expireAt.toMillis());
  });
});

// ---------------------------------------------------------------------------
describe("HC1 transferOwnership fallback soft-deletes the child", () => {
  beforeEach(() => {
    delete process.env.RESEND_API_KEY;
    adminMod.auth.mockReturnValue({
      getUser: jest.fn().mockResolvedValue({ email: "l@t.com" }),
      deleteUser: jest.fn().mockResolvedValue(undefined),
      updateUser: jest.fn().mockResolvedValue(undefined),
      revokeRefreshTokens: jest.fn().mockResolvedValue(undefined),
    });
    mockBucket.getFiles.mockResolvedValue([[]]);
    jest.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => console.error.mockRestore());

  it("soft-deletes with the standard grace period; members lose access; purgeDeletedChildren purges later", async () => {
    const docs = memoryStore({
      "users/leaver": { pendingDeletion: { scheduledAt: scheduled, deletionDate: past } },
      "children/c1": { name: "L", ownerId: "leaver" },
      "children/c1/access/leaver": { role: "owner", userId: "leaver" },
      "children/c1/access/v": { role: "viewer", userId: "v" },
      "user_child_access/leaver_c1": { userId: "leaver", childId: "c1" },
      "user_child_access/v_c1": { userId: "v", childId: "c1" },
      "events/e1": { childId: "c1", userId: "v", type: "biberon" },
    });
    await fns.processScheduledDeletions();
    const child = docs.get("children/c1");
    expect(child.ownerId).toBe("leaver");
    expect(child).not.toHaveProperty("ownerlessSince");
    expect(child.deletedAt).toBeDefined();
    expect(keys(docs, "children/c1/access/")).toEqual([]);
    expect(keys(docs, "user_child_access/")).toEqual([]);
    const [, req] = [...docs.entries()].find(([p]) => p.startsWith("childDeletionRequests/"));
    expect(req).toMatchObject({ childId: "c1", status: "approved" });
    expect(req.purgeAt.toMillis()).toBeGreaterThan(Date.now() + 29 * DAY);
    expect(docs.has("users/leaver")).toBe(false);
    // Not purged before the grace period is over.
    await fns.purgeDeletedChildren();
    expect(docs.has("children/c1")).toBe(true);
  });

  it("keeps a child deletion request the leaving user made, anonymised", async () => {
    const docs = memoryStore({
      "users/leaver": { pendingDeletion: { scheduledAt: scheduled, deletionDate: past } },
      "children/c9": { name: "Z", ownerId: "other", deletedAt: { toMillis: () => 1 } },
      "childDeletionRequests/r9": { childId: "c9", requestedBy: "leaver", requestedByEmail: "l@t.com", status: "approved", purgeAt: { toMillis: () => 5 } },
    });
    await fns.processScheduledDeletions();
    expect(docs.get("childDeletionRequests/r9")).toMatchObject({ childId: "c9", requestedBy: "deleted-user", requestedByEmail: "" });
  });

  it("a retry does not soft-delete twice", async () => {
    const docs = memoryStore({
      "users/leaver": { pendingDeletion: { scheduledAt: scheduled, deletionDate: past } },
      "children/c1": { name: "L", ownerId: "leaver", deletedAt: { toMillis: () => 1 } },
      "children/c1/access/leaver": { role: "owner", userId: "leaver" },
      "children/c1/access/v": { role: "viewer", userId: "v" },
      "user_child_access/leaver_c1": { userId: "leaver", childId: "c1" },
    });
    await fns.processScheduledDeletions();
    expect(keys(docs, "childDeletionRequests/")).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
describe("HC2 consent and pendingDeletion gate reminders and recaps", () => {
  const ts = (ms) => ({ toMillis: () => ms, toDate: () => new Date(ms) });
  beforeEach(() => {
    expoInstance.sendPushNotificationsAsync.mockClear();
    jest.spyOn(console, "log").mockImplementation(() => {});
  });
  afterEach(() => console.log.mockRestore());

  const user = (uid, { consent, pending = false } = {}) => {
    const d = {
      [`user_preferences/${uid}`]: {
        notifications: { push: true, email: true, reminders: { enabled: true, thresholds: { repas: 1 } } },
        ...(consent !== undefined ? { healthDataConsent: consent } : {}),
      },
      [`device_tokens/t-${uid}`]: { userId: uid, enabled: true, token: `ExponentPushToken[${uid}]` },
      [`children/c-${uid}`]: { name: "L" },
      [`user_child_access/${uid}_c-${uid}`]: { userId: uid, childId: `c-${uid}` },
      [`children/c-${uid}/access/${uid}`]: { role: "owner", userId: uid },
      [`events/e-${uid}`]: { childId: `c-${uid}`, type: "biberon", date: ts(Date.now() - 5 * 3600 * 1000) },
    };
    if (pending) d[`users/${uid}`] = { pendingDeletion: { deletionDate: past } };
    return d;
  };

  it("checkAndSendReminders: only users with granted consent (any version) and no pending deletion", async () => {
    const docs = memoryStore({
      ...user("ok22", { consent: { granted: true, version: "2.2" } }),
      ...user("ok10", { consent: { granted: true, version: "1.0" } }),
      ...user("none", {}),
      ...user("withdrawn", { consent: { granted: false, version: "2.2" } }),
      ...user("pend", { consent: { granted: true, version: "2.2" }, pending: true }),
    });
    await fns.checkAndSendReminders();
    const recipients = expoInstance.sendPushNotificationsAsync.mock.calls.flatMap(([chunk]) => chunk.map((m) => m.to)).sort();
    expect(recipients).toEqual(["ExponentPushToken[ok10]", "ExponentPushToken[ok22]"]);
    expect(keys(docs, "notification_history/")).toHaveLength(2);
  });

  it("checkAndSendReminders reads the users documents in one batch, not one by one", async () => {
    memoryStore({
      ...user("a", { consent: { granted: true } }),
      ...user("b", { consent: { granted: true } }),
      ...user("c", { consent: { granted: true } }),
    });
    const adminDb = adminMod.firestore();
    await fns.checkAndSendReminders();
    expect(adminDb.getAll).toHaveBeenCalledTimes(1);
  });

  describe("sendWeeklyRecap", () => {
    beforeEach(() => {
      process.env.RESEND_API_KEY = "re_test";
      process.env.RECAP_UNSUBSCRIBE_SECRET = "s".repeat(32);
      adminMod.auth.mockReturnValue({
        getUser: jest.fn(async (uid) => ({ email: `${uid}@t.com`, emailVerified: true, disabled: false })),
      });
    });
    afterEach(() => {
      delete process.env.RESEND_API_KEY;
      delete process.env.RECAP_UNSUBSCRIBE_SECRET;
    });

    it("skips users without a valid consent or with a pending deletion", async () => {
      const lastWeek = ts(Date.now() - 3 * DAY);
      const seed = {
        ...user("ok", { consent: { granted: true, version: "1.0" } }),
        ...user("none", {}),
        ...user("pend", { consent: { granted: true }, pending: true }),
      };
      for (const u of ["ok", "none", "pend"]) seed[`events/e-${u}`].date = lastWeek;
      memoryStore(seed);
      jest.useFakeTimers({ now: Date.now(), doNotFake: ["nextTick", "setImmediate", "setTimeout", "clearTimeout", "setInterval", "clearInterval", "queueMicrotask"] });
      await fns.sendWeeklyRecap();
      jest.useRealTimers();
      const to = Resend.mock.results.flatMap((r) => r.value.emails.send.mock.calls.map(([p]) => p.to));
      expect(to.every((t) => t === "ok@t.com")).toBe(true);
    });
  });
});

// ---------------------------------------------------------------------------
describe("L2 unsubscribeRecap", () => {
  const crypto = require("node:crypto");
  const SECRET = "x".repeat(32);
  beforeEach(() => {
    process.env.RECAP_UNSUBSCRIBE_SECRET = SECRET;
  });
  afterEach(() => delete process.env.RECAP_UNSUBSCRIBE_SECRET);
  const req = (method) => ({
    method,
    query: { uid: "u1", token: crypto.createHmac("sha256", SECRET).update("u1").digest("hex") },
  });
  const res = () => {
    const r = { headers: {}, set: jest.fn((k, v) => { if (typeof k === "string") r.headers[k] = v; }), status: jest.fn(() => r), send: jest.fn(() => r) };
    return r;
  };

  it("sends anti-framing headers, uses update() and treats a missing doc as success", async () => {
    memoryStore({});
    const r = res();
    await fns.unsubscribeRecap(req("POST"), r);
    expect(r.headers["X-Frame-Options"]).toBe("DENY");
    expect(r.headers["Content-Security-Policy"]).toBe("default-src 'none'; style-src 'unsafe-inline'; form-action 'self'");
    expect(r.status).toHaveBeenCalledWith(200);
  });

  it("does not create the preferences doc", async () => {
    const docs = memoryStore({});
    const spy = jest.spyOn(console, "error").mockImplementation(() => {});
    await fns.unsubscribeRecap(req("POST"), res());
    spy.mockRestore();
    expect(docs.has("user_preferences/u1")).toBe(false);
  });

  it("turns the e-mail recap off on an existing doc, keeping other fields", async () => {
    const docs = memoryStore({ "user_preferences/u1": { notifications: { email: true, push: true } } });
    await fns.unsubscribeRecap(req("POST"), res());
    expect(docs.get("user_preferences/u1").notifications).toEqual({ email: false, push: true });
  });

  it("answers 200 when update() reports not-found", async () => {
    const store = memoryStore({});
    const orig = adminMod.firestore().doc.getMockImplementation();
    adminMod.firestore().doc.mockImplementation((p) => ({
      ...orig(p),
      update: async () => { throw Object.assign(new Error("NOT_FOUND"), { code: 5 }); },
    }));
    const r = res();
    await fns.unsubscribeRecap(req("POST"), r);
    expect(r.status).toHaveBeenCalledWith(200);
    expect(store).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
describe("HC4 AssemblyAI cleanup always runs", () => {
  const audio = Buffer.alloc(8000).toString("base64");
  let fetchMock;
  let errSpy;
  beforeEach(() => {
    process.env.ASSEMBLYAI_API_KEY = "k";
    errSpy = jest.spyOn(console, "error").mockImplementation(() => {});
    jest.spyOn(console, "warn").mockImplementation(() => {});
  });
  afterEach(() => {
    delete process.env.ASSEMBLYAI_API_KEY;
    errSpy.mockRestore();
    console.warn.mockRestore();
    delete global.fetch;
  });
  const json = (body, ok = true) => ({ ok, status: ok ? 200 : 500, json: async () => body, text: async () => "boom" });
  const route = ({ transcript, poll = [], del = { ok: true } }) => {
    let polls = 0;
    fetchMock = jest.fn(async (url, init) => {
      if (url.endsWith("/upload")) return json({ upload_url: "u://x" });
      if (init?.method === "DELETE") return del.reject ? Promise.reject(new Error("net")) : { ok: del.ok, status: del.ok ? 200 : 500 };
      if (url.endsWith("/transcript")) return transcript;
      const r = poll[Math.min(polls, poll.length - 1)];
      polls += 1;
      return json(r);
    });
    global.fetch = fetchMock;
  };
  const deletes = () => fetchMock.mock.calls.filter(([, i]) => i?.method === "DELETE");

  it("deletes the transcript after success", async () => {
    memoryStore({});
    route({ transcript: json({ id: "tr1", status: "queued" }), poll: [{ status: "completed", text: "hi" }] });
    await expect(fns.transcribeAudio(call("u1", { audioBase64: audio }))).resolves.toEqual({ text: "hi" });
    expect(deletes()).toHaveLength(1);
    expect(deletes()[0][0]).toContain("tr1");
  });

  it("deletes the transcript when AssemblyAI reports an error", async () => {
    memoryStore({});
    route({ transcript: json({ id: "tr2", status: "queued" }), poll: [{ status: "error", error: "bad" }] });
    await expect(fns.transcribeAudio(call("u1", { audioBase64: audio }))).rejects.toThrow();
    expect(deletes().map(([u]) => u)).toEqual([expect.stringContaining("tr2")]);
  });

  it("deletes the transcript on timeout, and queues it when the DELETE fails (with a 90-day expireAt only once abandoned)", async () => {
    const docs = memoryStore({});
    jest.useFakeTimers({ doNotFake: ["nextTick", "setImmediate", "queueMicrotask"] });
    route({ transcript: json({ id: "tr3", status: "queued" }), poll: [{ status: "processing" }], del: { ok: false } });
    const p = fns.transcribeAudio(call("u1", { audioBase64: audio }));
    const assertion = expect(p).rejects.toMatchObject({ code: "deadline-exceeded" });
    await jest.advanceTimersByTimeAsync(70000);
    await assertion;
    jest.useRealTimers();
    expect(deletes().length).toBeGreaterThanOrEqual(1);
    expect(docs.get("pending_assemblyai_deletes/tr3")).toMatchObject({ transcriptId: "tr3", userId: "u1" });
  });

  it("queues the delete when the DELETE throws on the success path", async () => {
    const docs = memoryStore({});
    route({ transcript: json({ id: "tr4", status: "queued" }), poll: [{ status: "completed", text: "x" }], del: { reject: true } });
    await fns.transcribeAudio(call("u1", { audioBase64: audio }));
    expect(docs.has("pending_assemblyai_deletes/tr4")).toBe(true);
  });

  it("with a failed transcript creation there is no id to delete: no DELETE call, error surfaced", async () => {
    memoryStore({});
    route({ transcript: json({}, false) });
    await expect(fns.transcribeAudio(call("u1", { audioBase64: audio }))).rejects.toThrow("Transcription AssemblyAI");
    expect(deletes()).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
describe("HC6 90-day retention", () => {
  const near = (t, days) => Math.abs(t.toMillis() - (Date.now() + days * DAY)) < 60000;

  it("retryAssemblyAIDeletes sets expireAt when abandoning", async () => {
    process.env.ASSEMBLYAI_API_KEY = "k";
    global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 500 });
    jest.spyOn(console, "warn").mockImplementation(() => {});
    jest.spyOn(console, "error").mockImplementation(() => {});
    const docs = memoryStore({ "pending_assemblyai_deletes/t": { transcriptId: "t", attempts: 4, lastAttemptAt: 1 } });
    await fns.retryAssemblyAIDeletes();
    expect(near(docs.get("pending_assemblyai_deletes/t").expireAt, 90)).toBe(true);
    delete process.env.ASSEMBLYAI_API_KEY;
    delete global.fetch;
    console.warn.mockRestore();
    console.error.mockRestore();
  });

  it("notification_history carries expireAt", async () => {
    Expo.isExpoPushToken = jest.fn(() => true);
    const docs = memoryStore({
      "user_preferences/u": { healthDataConsent: { granted: true }, notifications: { push: true, reminders: { enabled: true, thresholds: { repas: 1 } } } },
      "device_tokens/t": { userId: "u", enabled: true, token: "ExponentPushToken[u]" },
      "children/c": { name: "L" },
      "user_child_access/u_c": { userId: "u", childId: "c" },
      "events/e": { childId: "c", type: "biberon", date: { toMillis: () => Date.now() - 5 * 3600 * 1000 } },
    });
    jest.spyOn(console, "log").mockImplementation(() => {});
    await fns.checkAndSendReminders();
    console.log.mockRestore();
    const [k] = keys(docs, "notification_history/");
    expect(near(docs.get(k).expireAt, 90)).toBe(true);
  });

  it("declares a TTL on every 90-day collection", () => {
    const { fieldOverrides } = require("../../firestore.indexes.json");
    for (const c of ["notification_history", "recap_history", "webhook_logs", "pending_assemblyai_deletes"]) {
      expect(fieldOverrides).toContainEqual({ collectionGroup: c, fieldPath: "expireAt", ttl: true, indexes: [] });
    }
  });

  it("has a dry-run-by-default backfill script", () => {
    const src = fs.readFileSync(path.join(__dirname, "../../scripts/backfillRetention.js"), "utf8");
    expect(src).toContain("--apply");
    expect(src).toMatch(/dry/i);
  });
});
