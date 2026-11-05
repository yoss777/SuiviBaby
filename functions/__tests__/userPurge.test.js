/* global describe, it, expect, jest, beforeEach, afterEach */
// Account deletion (audit A3): purgeUserData through processScheduledDeletions
// on an in-memory Firestore, plus a guard that every collection is classified.
const fs = require("node:fs");
const path = require("node:path");
const { mockFirestore, mockBucket } = require("./setup");
const fns = require("../index");
const { DELETED_USER_ID, USER_DATA_BY_FIELD, USER_DOCS_BY_ID } = require("../lib/userPurge");

// ---------------------------------------------------------------------------
// In-memory Firestore: documents by full path, equality queries, batches,
// sub-collections, FieldValue.delete() ("DEL" in setup.js).
// ---------------------------------------------------------------------------
function memoryStore(initial) {
  const docs = new Map(Object.entries(initial));
  const field = (data, dotted) => dotted.split(".").reduce((o, k) => o?.[k], data);
  const matches = (actual, op, v) =>
    op === "==" ? actual === v
      : actual === undefined ? false
        : op === "<=" ? actual <= v
          : op === ">=" ? actual >= v
            : op === "<" ? actual < v
              : op === ">" ? actual > v
                : false;
  const applyPatch = (current, patch) => {
    const next = { ...(current || {}) };
    for (const [k, v] of Object.entries(patch)) {
      if (k.includes(".")) {
        // update({"a.b": v}) sets a nested field, like Firestore.
        const [head, ...rest] = k.split(".");
        next[head] = applyPatch(next[head], { [rest.join(".")]: v });
      } else if (v === "DEL") delete next[k];
      else next[k] = v;
    }
    return next;
  };
  const ref = (p) => ({
    path: p,
    id: p.split("/").pop(),
    get: async () => (docs.has(p) ? { exists: true, id: p.split("/").pop(), data: () => docs.get(p) } : { exists: false, data: () => undefined }),
    set: async (data, opts) => docs.set(p, opts?.merge ? applyPatch(docs.get(p), data) : data),
    update: async (data) => docs.set(p, applyPatch(docs.get(p), data)),
    delete: async () => docs.delete(p),
    collection: (sub) => query(`${p}/${sub}`),
  });
  const query = (collPath) => {
    const filters = [];
    let max = Infinity;
    const q = {
      where: (field, op, value) => { filters.push([field, op, value]); return q; },
      limit: (n) => { max = n; return q; },
      orderBy: () => q,
      doc: (id) => ref(`${collPath}/${id}`),
      get: async () => {
        const depth = collPath.split("/").length + 1;
        const hits = [...docs.entries()]
          .filter(([p]) => p.startsWith(`${collPath}/`) && p.split("/").length === depth)
          .filter(([, data]) => filters.every(([f, op, v]) => matches(field(data, f), op, v)))
          .slice(0, max)
          .map(([p, data]) => ({ id: p.split("/").pop(), ref: ref(p), data: () => data }));
        return { empty: hits.length === 0, size: hits.length, docs: hits };
      },
    };
    return q;
  };
  mockFirestore.doc.mockImplementation((p) => ref(p));
  mockFirestore.collection.mockImplementation((name) => query(name));
  mockFirestore.batch.mockImplementation(() => {
    const ops = [];
    return {
      set: (r, d, o) => ops.push(() => r.set(d, o)),
      update: (r, d) => ops.push(() => r.update(d)),
      delete: (r) => ops.push(() => r.delete()),
      commit: async () => { for (const op of ops) await op(); },
    };
  });
  return docs;
}

const UID = "parent1";
const OTHER = "parent2";
const past = new Date(Date.now() - 86400000).toISOString();

function seed() {
  const data = {
    // The account to delete, due for deletion.
    [`users/${UID}`]: { email: "p1@t.com", pendingDeletion: { deletionDate: past } },
    // c1: only this parent → deleted with everything.
    "children/c1": { name: "Léo", ownerId: UID },
    [`children/c1/access/${UID}`]: { role: "owner", userId: UID },
    [`user_child_access/${UID}_c1`]: { userId: UID, childId: "c1", role: "owner" },
    "events/e1": { childId: "c1", userId: UID, type: "biberon", photos: ["children/c1/jalons/a.jpg"] },
    "recap_history/r1": { childId: "c1", userId: OTHER },
    // c2: shared with another parent → kept, ownership transferred.
    "children/c2": { name: "Mia", ownerId: UID },
    [`children/c2/access/${UID}`]: { role: "owner", userId: UID },
    [`children/c2/access/${OTHER}`]: { role: "admin", userId: OTHER },
    [`user_child_access/${UID}_c2`]: { userId: UID, childId: "c2", role: "owner" },
    [`user_child_access/${OTHER}_c2`]: { userId: OTHER, childId: "c2", role: "admin" },
    "events/e2": { childId: "c2", userId: UID, type: "temperature", valeur: 38.4, photos: ["children/c2/jalons/b.jpg"] },
    "events/e3": { childId: "c2", userId: OTHER, type: "biberon" },
    "shareInvitations/i1": { inviterEmail: "p1@t.com", childId: "c2" },
  };
  // One document per collection that stores data by uid.
  USER_DATA_BY_FIELD.forEach(([collection, field], i) => {
    data[`${collection}/u${i}`] = { [field]: UID };
  });
  USER_DOCS_BY_ID.forEach((collection) => {
    data[`${collection}/${UID}`] = { any: true };
  });
  return data;
}

describe("processScheduledDeletions → purgeUserData (audit A3)", () => {
  const adminMod = require("firebase-admin");
  const { Resend } = require("resend");
  let authApi;
  const sentEmails = () => Resend.mock.results.flatMap((r) => r.value.emails.send.mock.calls);

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.RESEND_API_KEY = "re_test";
    authApi = {
      getUser: jest.fn().mockResolvedValue({ email: "p1@t.com" }),
      deleteUser: jest.fn().mockResolvedValue(undefined),
    };
    adminMod.auth.mockReturnValue(authApi);
    mockBucket.getFiles.mockResolvedValue([[]]);
    mockBucket.file.mockImplementation(() => ({ delete: jest.fn().mockResolvedValue(undefined) }));
  });
  afterEach(() => {
    delete process.env.RESEND_API_KEY;
  });

  it("deletes every document about the user, then Auth, then sends the e-mail", async () => {
    const docs = memoryStore(seed());
    await fns.processScheduledDeletions();

    const leftovers = [...docs.entries()].filter(([, d]) => Object.values(d).includes(UID));
    expect(leftovers.map(([p]) => p)).toEqual([]);
    for (const collection of USER_DOCS_BY_ID) expect(docs.has(`${collection}/${UID}`)).toBe(false);
    expect(docs.has(`users/${UID}`)).toBe(false);
    expect(docs.has("shareInvitations/i1")).toBe(false);
    expect(authApi.deleteUser).toHaveBeenCalledWith(UID);
    expect(sentEmails()).toHaveLength(1);
  });

  it("deletes a child the user was alone on, with its histories", async () => {
    const docs = memoryStore(seed());
    await fns.processScheduledDeletions();
    expect(docs.has("children/c1")).toBe(false);
    expect(docs.has("events/e1")).toBe(false);
    expect(docs.has("recap_history/r1")).toBe(false);
  });

  it("keeps a shared child for the other parent, with the user's entries anonymised", async () => {
    const docs = memoryStore(seed());
    await fns.processScheduledDeletions();
    expect(docs.get("children/c2")).toMatchObject({ ownerId: OTHER });
    expect(docs.get(`children/c2/access/${OTHER}`)).toMatchObject({ role: "owner" });
    expect(docs.has(`children/c2/access/${UID}`)).toBe(false);
    expect(docs.get("events/e2")).toEqual({ childId: "c2", userId: DELETED_USER_ID, type: "temperature", valeur: 38.4 });
    expect(docs.get("events/e3")).toMatchObject({ userId: OTHER });
  });

  it("keeps the account for a retry, without e-mail, when Auth deletion fails", async () => {
    authApi.deleteUser.mockRejectedValue({ code: "auth/internal-error", message: "boom" });
    const docs = memoryStore(seed());
    await fns.processScheduledDeletions();
    expect(docs.get(`users/${UID}`).pendingDeletion).toMatchObject({ deletionDate: past, lastFailure: "boom" });
    expect(sentEmails()).toHaveLength(0);
  });

  it("stops before deleting anything when a photo cannot be deleted", async () => {
    mockBucket.file.mockImplementation(() => ({ delete: jest.fn().mockRejectedValue(new Error("storage down")) }));
    const docs = memoryStore(seed());
    await fns.processScheduledDeletions();
    expect(docs.has("events/e1")).toBe(true);
    expect(docs.has("events/e2")).toBe(true);
    expect(docs.has("children/c1")).toBe(true);
    expect(docs.get(`users/${UID}`).pendingDeletion.lastFailure).toMatch(/photos could not be deleted/);
    expect(authApi.deleteUser).not.toHaveBeenCalled();
    expect(sentEmails()).toHaveLength(0);
  });

  it("finishes an account whose Auth user was already deleted", async () => {
    authApi.getUser.mockRejectedValue({ code: "auth/user-not-found" });
    authApi.deleteUser.mockRejectedValue({ code: "auth/user-not-found" });
    const docs = memoryStore(seed());
    await fns.processScheduledDeletions();
    expect(docs.has(`users/${UID}`)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Every collection the code or the rules use must be purged or justified.
// ---------------------------------------------------------------------------
const NOT_PURGED_BY_UID = {
  users: "deleted last by purgeUserData (carries pendingDeletion)",
  children: "deleted with the child when the user was its only member",
  access: "children/{id}/access: removed per member in purgeUserData",
  user_child_access: "index entries removed per child in purgeUserData",
  events: "deleted with the child, or anonymised (DELETED_USER_ID) in shared children",
  shareInvitations: "removed by inviter / invited e-mail in purgeUserData",
  adminAuditLog: "kept on purpose: investigation trail of admin actions",
  revenuecat_webhook_events: "event ids only, no personal data; TTL 30 days",
  app_config: "shared configuration",
  tips: "shared reference content",
  milestones_ref: "shared reference content",
  promotions: "shared reference content",
  databases: "firestore.rules root wrapper, not a collection",
  babies: "legacy client path (babyAttachmentService), denied by firestore.rules: holds no data",
  tetees: "legacy per-child data, purged with the child",
  pompages: "legacy per-child data, purged with the child",
  mictions: "legacy per-child data, purged with the child",
  selles: "legacy per-child data, purged with the child",
  vitamines: "legacy per-child data, purged with the child",
  vaccins: "legacy per-child data, purged with the child",
  croissances: "legacy per-child data, purged with the child",
  sommeils: "legacy per-child data, purged with the child",
};

function collectionsInUse() {
  const root = path.join(__dirname, "..", "..");
  const names = new Set();
  const add = (text, regex) => { for (const m of text.matchAll(regex)) names.add(m[1]); };
  const server = fs.readFileSync(path.join(root, "functions", "index.js"), "utf8");
  add(server, /collection\("([A-Za-z_]+)"\)/g);
  add(server, /doc\(`([A-Za-z_]+)\//g);
  add(fs.readFileSync(path.join(root, "firestore.rules"), "utf8"), /match \/([A-Za-z_]+)\/\{/g);
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (/\.(ts|tsx)$/.test(entry.name)) {
        const text = fs.readFileSync(full, "utf8");
        add(text, /collection\(\s*db\s*,\s*["']([A-Za-z_]+)["']/g);
        add(text, /doc\(\s*db\s*,\s*["']([A-Za-z_]+)["']/g);
      }
    }
  };
  ["app", "services", "hooks", "contexts", "components"].forEach((d) => walk(path.join(root, d)));
  return [...names].sort();
}

describe("purge coverage", () => {
  it("classifies every collection used by the app, the functions and the rules", () => {
    const purged = new Set([...USER_DATA_BY_FIELD.map(([c]) => c), ...USER_DOCS_BY_ID]);
    const unclassified = collectionsInUse().filter((name) => !purged.has(name) && !(name in NOT_PURGED_BY_UID));
    // A new collection must be added to lib/userPurge.js or justified above.
    expect(unclassified).toEqual([]);
  });
});
