/* global describe, it, expect, jest, beforeEach */
// Sprint 12.6: roles (Parent = admin, Proche = contributor) and share codes
// created server-side.
require("./setup");
const { memoryStore } = require("./memoryFirestore");
const fns = require("../index");

const call = (uid, data = {}, extra = {}) => ({
  auth: { uid, token: { email: `${uid}@t.com`, email_verified: true } },
  data,
  app: true,
  ...extra,
});
const ts = (ms) => ({ toMillis: () => ms, toDate: () => new Date(ms) });

function seed(extra = {}) {
  return memoryStore({
    "children/c1": { name: "Léo", ownerId: "own" },
    "children/c1/access/own": { role: "owner", userId: "own", canWriteEvents: true, grantedAt: ts(1) },
    "children/c1/access/co": { role: "owner", userId: "co", canWriteEvents: true, grantedAt: ts(2) },
    "children/c1/access/adm": { role: "admin", userId: "adm", canWriteEvents: true, canWriteLikes: true, canWriteComments: true, grantedAt: ts(3) },
    "children/c1/access/pro": { role: "contributor", userId: "pro", canWriteEvents: false, canWriteLikes: true, canWriteComments: true, grantedAt: ts(4) },
    "user_child_access/pro_c1": { userId: "pro", childId: "c1" },
    "user_child_access/adm_c1": { userId: "adm", childId: "c1", role: "admin" },
    ...extra,
  });
}

describe("setMemberRole", () => {
  beforeEach(() => jest.clearAllMocks());

  it("lets the owner promote a Proche to Parent with admin flags", async () => {
    const docs = seed();
    const res = await fns.setMemberRole(call("own", { childId: "c1", memberId: "pro", role: "admin" }));
    expect(res).toEqual({ success: true, role: "admin" });
    expect(docs.get("children/c1/access/pro")).toMatchObject({
      role: "admin", canWriteEvents: true, canWriteLikes: true, canWriteComments: true, roleChangedBy: "own",
    });
    expect(docs.get("children/c1/access/pro").userId).toBe("pro");
  });

  it("lets the owner demote a Parent to Proche and mirrors the index role when present", async () => {
    const docs = seed();
    await fns.setMemberRole(call("own", { childId: "c1", memberId: "adm", role: "contributor" }));
    expect(docs.get("children/c1/access/adm")).toMatchObject({
      role: "contributor", canWriteEvents: false, canWriteLikes: true, canWriteComments: true,
    });
    expect(docs.get("user_child_access/adm_c1").role).toBe("contributor");
    // index without a role field stays without one
    await fns.setMemberRole(call("own", { childId: "c1", memberId: "pro", role: "admin" }));
    expect(docs.get("user_child_access/pro_c1")).not.toHaveProperty("role");
  });

  it("refuses non-owners, including admins and the member themself", async () => {
    const docs = seed();
    for (const uid of ["adm", "pro", "stranger"]) {
      await expect(
        fns.setMemberRole(call(uid, { childId: "c1", memberId: "pro", role: "admin" })),
      ).rejects.toMatchObject({ code: "permission-denied" });
    }
    expect(docs.get("children/c1/access/pro").role).toBe("contributor");
  });

  it("does not trust client claims for the owner check", async () => {
    seed();
    await expect(
      fns.setMemberRole(call("adm", { childId: "c1", memberId: "pro", role: "admin" }, {})),
    ).rejects.toMatchObject({ code: "permission-denied" });
  });

  it("cannot change the owner's role nor another owner's", async () => {
    const docs = seed();
    await expect(fns.setMemberRole(call("own", { childId: "c1", memberId: "own", role: "contributor" })))
      .rejects.toMatchObject({ code: "failed-precondition" });
    await expect(fns.setMemberRole(call("own", { childId: "c1", memberId: "co", role: "admin" })))
      .rejects.toMatchObject({ code: "failed-precondition" });
    expect(docs.get("children/c1/access/co").role).toBe("owner");
  });

  it("only accepts admin or contributor", async () => {
    seed();
    for (const role of ["owner", "viewer", "", undefined, 3]) {
      await expect(fns.setMemberRole(call("own", { childId: "c1", memberId: "pro", role })))
        .rejects.toMatchObject({ code: "invalid-argument" });
    }
  });

  it("validates arguments and authentication", async () => {
    seed();
    await expect(fns.setMemberRole({ data: {}, app: true })).rejects.toMatchObject({ code: "unauthenticated" });
    await expect(fns.setMemberRole(call("own", { childId: "", memberId: "pro", role: "admin" })))
      .rejects.toMatchObject({ code: "invalid-argument" });
    await expect(fns.setMemberRole(call("own", { childId: "c1", memberId: "a/b", role: "admin" })))
      .rejects.toMatchObject({ code: "invalid-argument" });
    await expect(fns.setMemberRole(call("own", { childId: "c1", memberId: "ghost", role: "admin" })))
      .rejects.toMatchObject({ code: "not-found" });
  });

  it("is rate limited", async () => {
    seed({ "rate_limits/own": { set_member_role_timestamps: Array(20).fill(Date.now()) } });
    await expect(fns.setMemberRole(call("own", { childId: "c1", memberId: "pro", role: "admin" })))
      .rejects.toMatchObject({ code: "resource-exhausted" });
  });

  it("overwrites the flags of a viewer promoted to Parent", async () => {
    const docs = seed({
      "children/c1/access/vw": { role: "viewer", userId: "vw", canWriteEvents: false, canWriteLikes: false, canWriteComments: false },
    });
    await fns.setMemberRole(call("own", { childId: "c1", memberId: "vw", role: "admin" }));
    expect(docs.get("children/c1/access/vw")).toMatchObject({
      role: "admin", canWriteEvents: true, canWriteLikes: true, canWriteComments: true,
    });
  });

  it("works when the member has no user_child_access entry (nothing is created)", async () => {
    const docs = seed({ "children/c1/access/solo": { role: "contributor", userId: "solo" } });
    await fns.setMemberRole(call("own", { childId: "c1", memberId: "solo", role: "admin" }));
    expect(docs.get("children/c1/access/solo").role).toBe("admin");
    expect(docs.has("user_child_access/solo_c1")).toBe(false);
  });

  it("refuses a soft-deleted child", async () => {
    const docs = seed({ "children/c1": { name: "Léo", ownerId: "own", deletedAt: "2026-01-01" } });
    await expect(fns.setMemberRole(call("own", { childId: "c1", memberId: "pro", role: "admin" })))
      .rejects.toMatchObject({ code: "not-found" });
    expect(docs.get("children/c1/access/pro").role).toBe("contributor");
  });

  it("falls back to children.ownerId when the owner's access doc is missing", async () => {
    const docs = seed();
    docs.delete("children/c1/access/own");
    await expect(fns.setMemberRole(call("own", { childId: "c1", memberId: "pro", role: "admin" })))
      .resolves.toEqual({ success: true, role: "admin" });
  });

  it("never demotes the primary owner, even when their access doc says admin", async () => {
    const docs = seed();
    docs.set("children/c1/access/own", { role: "admin", userId: "own" });
    // the primary owner (ownerId) is the caller here; a co-owner tries on them
    await expect(fns.setMemberRole(call("co", { childId: "c1", memberId: "own", role: "contributor" })))
      .rejects.toMatchObject({ code: "failed-precondition" });
    expect(docs.get("children/c1/access/own").role).toBe("admin");
  });

  it("checks the owner inside the transaction (a demotion between the reads loses)", async () => {
    const docs = seed();
    const { mockRunTransaction } = require("./setup");
    const inner = mockRunTransaction.getMockImplementation();
    mockRunTransaction.mockImplementationOnce(async (fn) => {
      // the caller loses ownership right before the transaction body runs
      docs.set("children/c1/access/co", { role: "contributor", userId: "co" });
      return inner(fn);
    });
    await expect(fns.setMemberRole(call("co", { childId: "c1", memberId: "pro", role: "admin" })))
      .rejects.toMatchObject({ code: "permission-denied" });
    expect(docs.get("children/c1/access/pro").role).toBe("contributor");
  });

  it("writes an audit entry", async () => {
    const docs = seed();
    await fns.setMemberRole(call("own", { childId: "c1", memberId: "pro", role: "admin" }));
    const logs = [...docs.entries()].filter(([p]) => p.startsWith("access_audit/"));
    expect(logs).toHaveLength(1);
    expect(logs[0][1]).toMatchObject({ childId: "c1", actorId: "own", memberId: "pro", fromRole: "contributor", toRole: "admin" });
  });
});

describe("createShareCode", () => {
  beforeEach(() => jest.clearAllMocks());

  it("creates a single-use, 7-day code for the owner with a random 6 char code", async () => {
    const docs = seed();
    const res = await fns.createShareCode(call("own", { childId: "c1" }));
    expect(res.code).toMatch(/^[A-HJ-NP-Z2-9]{6}$/);
    const stored = docs.get(`shareCodes/${res.code}`);
    expect(stored).toMatchObject({
      code: res.code, childId: "c1", childName: "Léo", createdBy: "own", used: false,
    });
    const days = (stored.expiresAt.toMillis() - Date.now()) / 86400000;
    expect(days).toBeGreaterThan(6.9);
    expect(days).toBeLessThan(7.1);
    expect(res.expiresAt).toBe(stored.expiresAt.toMillis());
  });

  it("allows owners and admins, refuses Proches and strangers", async () => {
    seed();
    await expect(fns.createShareCode(call("adm", { childId: "c1" }))).resolves.toHaveProperty("code");
    await expect(fns.createShareCode(call("co", { childId: "c1" }))).resolves.toHaveProperty("code");
    for (const uid of ["pro", "stranger"]) {
      await expect(fns.createShareCode(call(uid, { childId: "c1" }))).rejects.toMatchObject({ code: "permission-denied" });
    }
  });

  it("falls back to children.ownerId when the access doc is missing", async () => {
    const docs = memoryStore({ "children/c2": { name: "Zoé", ownerId: "own" } });
    const res = await fns.createShareCode(call("own", { childId: "c2" }));
    expect(docs.get(`shareCodes/${res.code}`).childName).toBe("Zoé");
  });

  it("refuses a missing, deleted or invalid child and unauthenticated calls", async () => {
    seed({ "children/gone": { name: "x", ownerId: "own", deletedAt: "2026-01-01" } });
    await expect(fns.createShareCode(call("own", { childId: "nope" }))).rejects.toMatchObject({ code: "not-found" });
    await expect(fns.createShareCode(call("own", { childId: "gone" }))).rejects.toMatchObject({ code: "not-found" });
    await expect(fns.createShareCode(call("own", { childId: 5 }))).rejects.toMatchObject({ code: "invalid-argument" });
    await expect(fns.createShareCode({ data: { childId: "c1" }, app: true })).rejects.toMatchObject({ code: "unauthenticated" });
  });

  it("requires a verified email, like sharing by invitation", async () => {
    seed();
    await expect(
      fns.createShareCode({ auth: { uid: "own", token: { email: "o@t.com", email_verified: false } }, data: { childId: "c1" }, app: true }),
    ).rejects.toBeDefined();
  });

  it("does not overwrite an existing code on collision", async () => {
    const docs = seed();
    const spy = jest.spyOn(require("crypto"), "randomInt");
    spy.mockReturnValue(0); // always "AAAAAA"
    docs.set("shareCodes/AAAAAA", { code: "AAAAAA", childId: "other" });
    // memoryStore.create exists only inside transactions: the handler must use one.
    await expect(fns.createShareCode(call("own", { childId: "c1" }))).rejects.toMatchObject({ code: "internal" });
    expect(docs.get("shareCodes/AAAAAA").childId).toBe("other");
    spy.mockRestore();
  });

  it("tries 5 codes then fails, overwriting nothing", async () => {
    const docs = seed();
    const spy = jest.spyOn(require("crypto"), "randomInt").mockReturnValue(0);
    docs.set("shareCodes/AAAAAA", { code: "AAAAAA", childId: "other" });
    const before = JSON.stringify([...docs.entries()]);
    await expect(fns.createShareCode(call("own", { childId: "c1" }))).rejects.toMatchObject({
      code: "internal", message: expect.stringContaining("unique"),
    });
    // 5 draws of 6 characters each
    expect(spy).toHaveBeenCalledTimes(30);
    expect(JSON.stringify([...docs.entries()].filter(([p]) => p.startsWith("shareCodes/")))).toBe(
      JSON.stringify(JSON.parse(before).filter(([p]) => p.startsWith("shareCodes/"))),
    );
    spy.mockRestore();
  });

  it("does not retry an error other than already-exists", async () => {
    seed();
    const { mockRunTransaction } = require("./setup");
    const inner = mockRunTransaction.getMockImplementation();
    const errSpy = jest.spyOn(console, "error").mockImplementation(() => {});
    let calls = 0;
    mockRunTransaction.mockImplementation(async (fn) => {
      calls += 1;
      throw Object.assign(new Error("boom"), { code: 14 });
    });
    await expect(fns.createShareCode(call("own", { childId: "c1" }))).rejects.toMatchObject({
      code: "internal", message: expect.stringContaining("créer"),
    });
    expect(calls).toBe(1);
    mockRunTransaction.mockImplementation(inner);
    errSpy.mockRestore();
  });

  it("retries after an already-exists collision and then succeeds", async () => {
    const docs = seed();
    const spy = jest.spyOn(require("crypto"), "randomInt");
    spy.mockReturnValueOnce(0).mockReturnValueOnce(0).mockReturnValueOnce(0)
      .mockReturnValueOnce(0).mockReturnValueOnce(0).mockReturnValueOnce(0); // AAAAAA once
    docs.set("shareCodes/AAAAAA", { code: "AAAAAA", childId: "other" });
    spy.mockRestore();
    const spy2 = jest.spyOn(require("crypto"), "randomInt");
    let n = 0;
    spy2.mockImplementation(() => (n++ < 6 ? 0 : 1));
    const res = await fns.createShareCode(call("own", { childId: "c1" }));
    expect(res.code).toBe("BBBBBB");
    expect(docs.get("shareCodes/AAAAAA").childId).toBe("other");
    spy2.mockRestore();
  });

  it("is rate limited", async () => {
    seed({ "rate_limits/own": { create_share_code_timestamps: Array(10).fill(Date.now()) } });
    await expect(fns.createShareCode(call("own", { childId: "c1" }))).rejects.toMatchObject({ code: "resource-exhausted" });
  });
});
