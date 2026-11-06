/* global describe, it, expect, jest, beforeEach, afterEach */
// GDPR sprint 3 (3.6): who inherits a child when its owner deletes the
// account, and the helper the app uses before scheduling a deletion.
const { mockBucket } = require("./setup");
const { memoryStore } = require("./memoryFirestore");
const fns = require("../index");

const adminMod = require("firebase-admin");
const call = (uid, data = {}) => ({ auth: { uid, token: { email: `${uid}@t.com` } }, data, app: true });
const ts = (ms) => ({ toMillis: () => ms, toDate: () => new Date(ms) });
const past = new Date(Date.now() - 86400000).toISOString();

/** Child c1 owned by "leaver", plus members: { uid: [role, grantedAtMs] }. */
function family(members) {
  const data = {
    "users/leaver": { email: "l@t.com", pendingDeletion: { deletionDate: past } },
    "children/c1": { name: "Léo", ownerId: "leaver" },
    "children/c1/access/leaver": { role: "owner", userId: "leaver", grantedAt: ts(1) },
    "user_child_access/leaver_c1": { userId: "leaver", childId: "c1", role: "owner" },
  };
  for (const [uid, [role, grantedAt]] of Object.entries(members)) {
    data[`children/c1/access/${uid}`] = { role, userId: uid, grantedAt: ts(grantedAt), canWriteEvents: role !== "viewer" };
    data[`user_child_access/${uid}_c1`] = { userId: uid, childId: "c1", role };
  }
  return data;
}

describe("ownership transfer when the owner's account is purged", () => {
  let authApi;
  let errorSpy;
  beforeEach(() => {
    jest.clearAllMocks();
    delete process.env.RESEND_API_KEY;
    authApi = {
      getUser: jest.fn().mockResolvedValue({ email: "l@t.com" }),
      deleteUser: jest.fn().mockResolvedValue(undefined),
      updateUser: jest.fn().mockResolvedValue(undefined),
      revokeRefreshTokens: jest.fn().mockResolvedValue(undefined),
    };
    adminMod.auth.mockReturnValue(authApi);
    mockBucket.getFiles.mockResolvedValue([[]]);
    errorSpy = jest.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => errorSpy.mockRestore());

  it("prefers a co-owner over an older admin", async () => {
    const docs = memoryStore(family({ adm: ["admin", 10], co: ["owner", 500] }));
    await fns.processScheduledDeletions();
    expect(docs.get("children/c1").ownerId).toBe("co");
    expect(docs.get("children/c1/access/co").role).toBe("owner");
    expect(docs.get("children/c1/access/adm").role).toBe("admin");
    expect(docs.has("children/c1/access/leaver")).toBe(false);
  });

  it("falls back to an admin, never to a contributor or viewer, even older ones", async () => {
    const docs = memoryStore(family({ viewer: ["viewer", 2], contrib: ["contributor", 3], adm: ["admin", 900] }));
    await fns.processScheduledDeletions();
    expect(docs.get("children/c1").ownerId).toBe("adm");
    expect(docs.get("children/c1/access/adm").role).toBe("owner");
    expect(docs.get("children/c1/access/viewer").role).toBe("viewer");
    expect(docs.get("children/c1/access/contrib").role).toBe("contributor");
  });

  it("breaks ties with the oldest grantedAt", async () => {
    const docs = memoryStore(family({ newer: ["admin", 800], older: ["admin", 100], newest: ["admin", 900] }));
    await fns.processScheduledDeletions();
    expect(docs.get("children/c1").ownerId).toBe("older");
  });

  it("breaks ties among co-owners with the oldest grantedAt", async () => {
    const docs = memoryStore(family({ b: ["owner", 800], a: ["owner", 100] }));
    await fns.processScheduledDeletions();
    expect(docs.get("children/c1").ownerId).toBe("a");
  });

  it("leaves the child ownerless, with an error log, when only contributors and viewers remain", async () => {
    const docs = memoryStore(family({ viewer: ["viewer", 2], contrib: ["contributor", 3] }));
    await fns.processScheduledDeletions();

    expect(docs.get("children/c1")).toMatchObject({ ownerId: null, ownerlessSince: "TS", name: "Léo" });
    expect(docs.get("children/c1/access/viewer").role).toBe("viewer");
    expect(docs.get("children/c1/access/contrib").role).toBe("contributor");
    expect([...docs.values()].some((d) => d.role === "owner")).toBe(false);
    expect(docs.has("children/c1/access/leaver")).toBe(false);
    expect(docs.has("user_child_access/leaver_c1")).toBe(false);
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining("c1"));
    expect(docs.has("users/leaver")).toBe(false);
  });

  it("does not promote anyone on a retry once the child is ownerless", async () => {
    const state = family({ viewer: ["viewer", 2] });
    state["children/c1"] = { name: "Léo", ownerId: null };
    const docs = memoryStore(state);
    await fns.processScheduledDeletions();
    expect(docs.get("children/c1/access/viewer").role).toBe("viewer");
    expect(docs.get("children/c1").ownerId).toBeNull();
  });
});

// ---------------------------------------------------------------------------
describe("getOwnershipBlockers", () => {
  beforeEach(() => jest.clearAllMocks());

  const seed = (extra = {}) => ({
    "users_public/viewer": { userName: "Mamie" },
    ...family({ viewer: ["viewer", 2], contrib: ["contributor", 3] }),
    ...extra,
  });

  it("rejects unauthenticated callers", async () => {
    memoryStore({});
    await expect(fns.getOwnershipBlockers({ auth: null, data: {} })).rejects.toThrow("Authentification");
  });

  it("lists the children the caller alone owns, with the other members", async () => {
    memoryStore(seed());
    const result = await fns.getOwnershipBlockers(call("leaver"));
    expect(result.children).toHaveLength(1);
    expect(result.children[0]).toMatchObject({ childId: "c1", childName: "Léo" });
    expect(result.children[0].members).toEqual(expect.arrayContaining([
      { uid: "viewer", role: "viewer", displayName: "Mamie" },
      { uid: "contrib", role: "contributor" },
    ]));
    expect(result.children[0].members).toHaveLength(2);
  });

  it("is empty when another owner or admin exists", async () => {
    memoryStore(family({ adm: ["admin", 5], viewer: ["viewer", 2] }));
    expect((await fns.getOwnershipBlockers(call("leaver"))).children).toEqual([]);
    memoryStore(family({ co: ["owner", 5] }));
    expect((await fns.getOwnershipBlockers(call("leaver"))).children).toEqual([]);
  });

  it("is empty when the caller is the only member (the child is deleted with the account)", async () => {
    memoryStore(family({}));
    expect((await fns.getOwnershipBlockers(call("leaver"))).children).toEqual([]);
  });

  it("is empty for a member who is not an owner", async () => {
    memoryStore(seed());
    expect((await fns.getOwnershipBlockers(call("contrib"))).children).toEqual([]);
  });

  it("ignores soft-deleted children and is read-only", async () => {
    const docs = memoryStore(seed({ "children/c1": { name: "Léo", ownerId: "leaver", deletedAt: ts(5) } }));
    const before = JSON.stringify([...docs.entries()].filter(([p]) => !p.startsWith("rate_limits/")));
    expect((await fns.getOwnershipBlockers(call("leaver"))).children).toEqual([]);
    expect(JSON.stringify([...docs.entries()].filter(([p]) => !p.startsWith("rate_limits/")))).toBe(before);
  });
});
