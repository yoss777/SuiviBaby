/* global describe, it, expect, jest, beforeEach, afterEach */
// S12.5: nightly reconciliation of children/{id}/access/{uid} with user_child_access.
require("./setup");
const { memoryStore } = require("./memoryFirestore");
const logger = require("firebase-functions/logger");
const adminMod = require("firebase-admin");
const fns = require("../index");
const { reconcileAccessIndex } = require("../lib/accessReconciliation");

describe("reconcileAccessIndex", () => {
  let infoSpy;
  beforeEach(() => {
    jest.clearAllMocks();
    infoSpy = jest.spyOn(logger, "info").mockImplementation(() => {});
    jest.spyOn(console, "warn").mockImplementation(() => {});
  });
  afterEach(() => jest.restoreAllMocks());
  const db = () => adminMod.firestore();

  it("creates the missing index entry for an access document", async () => {
    const docs = memoryStore({ "children/c1/access/u1": { role: "owner", userId: "u1" } });
    const stats = await reconcileAccessIndex(db());
    expect(docs.get("user_child_access/u1_c1")).toMatchObject({ userId: "u1", childId: "c1" });
    expect(stats).toMatchObject({ accessScanned: 1, created: 1, deleted: 0 });
  });

  it("deletes an orphan index entry with no matching access", async () => {
    const docs = memoryStore({
      "user_child_access/u1_c1": { userId: "u1", childId: "c1" },
      "children/c1/access/u2": { role: "owner", userId: "u2" },
      "user_child_access/u2_c1": { userId: "u2", childId: "c1" },
    });
    const stats = await reconcileAccessIndex(db());
    expect(docs.has("user_child_access/u1_c1")).toBe(false);
    expect(docs.has("user_child_access/u2_c1")).toBe(true);
    expect(stats).toMatchObject({ indexScanned: 2, deleted: 1, created: 0 });
  });

  it("leaves consistent data untouched and is idempotent", async () => {
    const docs = memoryStore({
      "children/c1/access/u1": { role: "owner", userId: "u1" },
      "user_child_access/u1_c1": { userId: "u1", childId: "c1", grantedBy: "x" },
      "children/c2/access/u1": { role: "admin", userId: "u1" },
    });
    await reconcileAccessIndex(db());
    const snapshot = JSON.stringify([...docs.entries()]);
    const stats = await reconcileAccessIndex(db());
    expect(JSON.stringify([...docs.entries()])).toBe(snapshot);
    expect(stats).toMatchObject({ created: 0, deleted: 0 });
    expect(docs.get("user_child_access/u1_c1").grantedBy).toBe("x");
  });

  it("does not create an index entry for sub-collections named access elsewhere", async () => {
    const docs = memoryStore({ "other/o1/access/u1": { role: "owner" } });
    await reconcileAccessIndex(db());
    expect([...docs.keys()].filter((k) => k.startsWith("user_child_access/"))).toEqual([]);
  });

  it("pages through more documents than one page and with bounded batches", async () => {
    const initial = {};
    for (let i = 0; i < 23; i += 1) initial[`children/c${i}/access/u`] = { role: "owner", userId: "u" };
    for (let i = 0; i < 17; i += 1) initial[`user_child_access/ghost${i}_cx`] = { userId: `ghost${i}`, childId: "cx" };
    const docs = memoryStore(initial);
    const stats = await reconcileAccessIndex(db(), { pageSize: 5, concurrency: 3 });
    expect(stats).toMatchObject({ accessScanned: 23, created: 23, deleted: 17 });
    expect([...docs.keys()].filter((k) => k.startsWith("user_child_access/"))).toHaveLength(23);
  });

  it("re-checks the access before deleting (an access created meanwhile keeps its index)", async () => {
    const docs = memoryStore({ "user_child_access/u1_c1": { userId: "u1", childId: "c1" } });
    const realGetAll = db().getAll;
    // Between the page read and the delete, the access appears.
    db().getAll = jest.fn(async (...refs) => {
      const out = await realGetAll(...refs);
      docs.set("children/c1/access/u1", { role: "owner", userId: "u1" });
      return out;
    });
    try {
      const stats = await reconcileAccessIndex(db());
      expect(docs.has("user_child_access/u1_c1")).toBe(true);
      expect(stats.deleted).toBe(0);
    } finally {
      db().getAll = realGetAll;
    }
  });

  it("an error on one entry is counted and does not stop the run", async () => {
    memoryStore({
      "children/c1/access/u1": { role: "owner", userId: "u1" },
      "children/c2/access/u1": { role: "owner", userId: "u1" },
    });
    let first = true;
    const realTx = db().runTransaction;
    db().runTransaction = jest.fn(async (fn) => {
      if (first) { first = false; throw new Error("aborted"); }
      return realTx(fn);
    });
    try {
      const stats = await reconcileAccessIndex(db());
      expect(stats).toMatchObject({ created: 1, errors: 1 });
    } finally {
      db().runTransaction = realTx;
    }
  });

  it("the scheduled job runs the reconciliation and logs a structured summary", async () => {
    memoryStore({ "children/c1/access/u1": { role: "owner", userId: "u1" } });
    await fns.reconcileAccessIndexNightly();
    expect(infoSpy).toHaveBeenCalledWith(
      "reconcileAccessIndex: done",
      expect.objectContaining({ job: "reconcileAccessIndex", created: 1, deleted: 0, errors: 0, durationMs: expect.any(Number) })
    );
  });
});
