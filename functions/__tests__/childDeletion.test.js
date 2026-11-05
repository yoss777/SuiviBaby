/* global describe, it, expect, jest, beforeEach */
// Child deletion lifecycle (audit, sprint 1 task 1.6): request, vote, cancel,
// scheduled purge — on the in-memory Firestore.
const { mockBucket } = require("./setup");
const { memoryStore } = require("./memoryFirestore");
const fns = require("../index");

const call = (uid, data) => ({ auth: { uid, token: { email: `${uid}@t.com` } }, data, app: true });
const DAY = 24 * 3600 * 1000;

function family({ owners = ["a"], others = {} } = {}) {
  const data = {
    "children/c1": { name: "Léo", ownerId: owners[0] },
    "events/e1": { childId: "c1", userId: owners[0], type: "biberon" },
    "recap_history/r1": { childId: "c1", userId: owners[0] },
  };
  for (const uid of owners) {
    data[`children/c1/access/${uid}`] = { role: "owner", userId: uid };
    data[`user_child_access/${uid}_c1`] = { userId: uid, childId: "c1" };
  }
  for (const [uid, role] of Object.entries(others)) {
    data[`children/c1/access/${uid}`] = { role, userId: uid };
    data[`user_child_access/${uid}_c1`] = { userId: uid, childId: "c1" };
  }
  return data;
}
const requestOf = (docs) => [...docs.entries()].find(([p]) => p.startsWith("childDeletionRequests/"));

beforeEach(() => {
  jest.clearAllMocks();
  mockBucket.getFiles.mockResolvedValue([[]]);
});

describe("createDeletionRequest / voteDeletionRequest", () => {
  it("a sole owner's request is approved at once and the child soft-deleted", async () => {
    const docs = memoryStore(family());
    await expect(fns.createDeletionRequest(call("a", { childId: "c1" }))).resolves.toMatchObject({ status: "approved" });
    const [, request] = requestOf(docs);
    expect(request).toMatchObject({ status: "approved", accessSnapshot: { a: { role: "owner" } } });
    expect(request.purgeAt).toBeDefined();
    expect(docs.get("children/c1").deletedAt).toBeDefined();
    expect(docs.has("children/c1/access/a")).toBe(false);
    expect(docs.has("user_child_access/a_c1")).toBe(false);
  });

  it("only an owner can ask", async () => {
    memoryStore(family({ others: { b: "admin" } }));
    await expect(fns.createDeletionRequest(call("b", { childId: "c1" }))).rejects.toThrow("propriétaire");
  });

  it("with two owners: pending, then approved by the second vote", async () => {
    const docs = memoryStore(family({ owners: ["a", "b"] }));
    const { requestId, status } = await fns.createDeletionRequest(call("a", { childId: "c1" }));
    expect(status).toBe("pending");
    expect(docs.get("children/c1").deletedAt).toBeUndefined();

    await expect(fns.voteDeletionRequest(call("b", { requestId, vote: "approved" }))).resolves.toEqual({ status: "approved" });
    expect(docs.get(`childDeletionRequests/${requestId}`).status).toBe("approved");
    expect(docs.get("children/c1").deletedAt).toBeDefined();
  });

  it("one refusal stops the deletion; nobody votes twice", async () => {
    const docs = memoryStore(family({ owners: ["a", "b"] }));
    const { requestId } = await fns.createDeletionRequest(call("a", { childId: "c1" }));
    await expect(fns.voteDeletionRequest(call("a", { requestId, vote: "approved" }))).rejects.toThrow("déjà voté");
    await expect(fns.voteDeletionRequest(call("b", { requestId, vote: "refused" }))).resolves.toEqual({ status: "refused" });
    expect(docs.get(`childDeletionRequests/${requestId}`).status).toBe("refused");
    expect(docs.get("children/c1").deletedAt).toBeUndefined();
    await expect(fns.voteDeletionRequest(call("b", { requestId, vote: "approved" }))).rejects.toThrow("plus en attente");
  });

  it("a non-owner cannot vote", async () => {
    memoryStore(family({ owners: ["a", "b"], others: { c: "viewer" } }));
    const { requestId } = await fns.createDeletionRequest(call("a", { childId: "c1" }));
    await expect(fns.voteDeletionRequest(call("c", { requestId, vote: "approved" }))).rejects.toThrow("propriétaire");
  });
});

describe("cancelChildDeletion", () => {
  it("restores every member's access during the grace period", async () => {
    const docs = memoryStore(family({ others: { b: "admin", c: "viewer" } }));
    const { requestId } = await fns.createDeletionRequest(call("a", { childId: "c1" }));
    await expect(fns.cancelChildDeletion(call("a", { requestId }))).resolves.toEqual({ success: true });
    expect(docs.get("children/c1").deletedAt).toBeUndefined();
    expect(docs.get("children/c1/access/b")).toMatchObject({ role: "admin" });
    expect(docs.get("children/c1/access/c")).toMatchObject({ role: "viewer" });
    expect(docs.has("user_child_access/c_c1")).toBe(true);
    expect(docs.get(`childDeletionRequests/${requestId}`).status).toBe("cancelled");
  });

  it("refuses once the grace period is over", async () => {
    const docs = memoryStore(family());
    const { requestId } = await fns.createDeletionRequest(call("a", { childId: "c1" }));
    docs.get(`childDeletionRequests/${requestId}`).purgeAt = { toMillis: () => Date.now() - DAY };
    await expect(fns.cancelChildDeletion(call("a", { requestId }))).rejects.toThrow("expire");
  });
});

const past = () => ({ toMillis: () => Date.now() - DAY, seconds: 0 });

describe("purgeDeletedChildren", () => {
  it("purges a child whose grace period is over, with its events and histories", async () => {
    const docs = memoryStore(family());
    const { requestId } = await fns.createDeletionRequest(call("a", { childId: "c1" }));
    docs.get(`childDeletionRequests/${requestId}`).purgeAt = past();

    await fns.purgeDeletedChildren();

    expect(docs.has("children/c1")).toBe(false);
    expect(docs.has("events/e1")).toBe(false);
    expect(docs.has("recap_history/r1")).toBe(false);
    expect(docs.has(`childDeletionRequests/${requestId}`)).toBe(false);
  });

  it("does not purge a child restored after the request was approved", async () => {
    const docs = memoryStore({
      ...family(),
      "childDeletionRequests/r9": {
        childId: "c1",
        status: "approved",
        purgeAt: past(),
      },
    });
    // The child has no deletedAt any more: it was restored.
    await fns.purgeDeletedChildren();
    expect(docs.has("children/c1")).toBe(true);
    expect(docs.has("events/e1")).toBe(true);
  });

  it("keeps the request for a retry when a photo cannot be deleted", async () => {
    mockBucket.getFiles.mockResolvedValue([[{ delete: jest.fn().mockRejectedValue(new Error("down")) }]]);
    const docs = memoryStore({
      ...family(),
      "children/c1": { name: "Léo", ownerId: "a", deletedAt: 1 },
      "childDeletionRequests/r9": { childId: "c1", status: "approved", purgeAt: past() },
    });
    await fns.purgeDeletedChildren();
    expect(docs.has("childDeletionRequests/r9")).toBe(true);
    expect(docs.has("events/e1")).toBe(true);
  });
});
