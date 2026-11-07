/* global describe, it, expect, __dirname */
// S12.5: firestore.indexes.json declares every TTL used and has no composite
// index fully covered by another one.
const fs = require("fs");
const path = require("path");

const config = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "..", "firestore.indexes.json"), "utf8"));
const ttlCollections = config.fieldOverrides.filter((o) => o.ttl).map((o) => `${o.collectionGroup}.${o.fieldPath}`);

describe("firestore.indexes.json", () => {
  it.each([
    "consent_records", "notification_history", "recap_history", "webhook_logs",
    "pending_assemblyai_deletes", "deleted_idem", "revenuecat_webhook_events",
    "voice_transcribe_cache", "adminAuditLog",
  ])("declares a TTL on %s.expireAt", (collection) => {
    expect(ttlCollections).toContain(`${collection}.expireAt`);
  });

  it("every TTL override has no index (TTL fields are not queried)", () => {
    for (const o of config.fieldOverrides.filter((x) => x.ttl)) expect(o.indexes).toEqual([]);
  });

  it("eventLikes: the equality-only (eventId,userId) and (childId,userId) indexes are gone (served by single-field index merging, used by no query)", () => {
    const likes = config.indexes.filter((i) => i.collectionGroup === "eventLikes").map((i) => i.fields.map((f) => f.fieldPath).join(","));
    expect(likes).not.toContain("eventId,userId");
    expect(likes).not.toContain("childId,userId");
    // Still needed by services/socialService.ts queries.
    expect(likes).toEqual(expect.arrayContaining(["childId,createdAt", "childId,eventId,createdAt", "childId,eventId,userId"]));
  });

  it("eventLikes has no composite index that is a prefix of another one (redundant)", () => {
    const sig = (i) => i.fields.map((f) => `${f.fieldPath}:${f.order ?? f.arrayConfig}`);
    const redundant = [];
    const likes = config.indexes.filter((i) => i.collectionGroup === "eventLikes");
    for (const a of likes) {
      for (const b of likes) {
        if (a === b || a.collectionGroup !== b.collectionGroup || a.queryScope !== b.queryScope) continue;
        const sa = sig(a);
        const sb = sig(b);
        if (sa.length < sb.length && sa.every((v, i) => v === sb[i])) redundant.push(`${a.collectionGroup}: ${sa.join(",")}`);
      }
    }
    expect(redundant).toEqual([]);
  });

  it("has no duplicate composite index", () => {
    const sigs = config.indexes.map((i) => `${i.collectionGroup}|${i.queryScope}|${i.fields.map((f) => `${f.fieldPath}:${f.order ?? f.arrayConfig}`).join(",")}`);
    expect(new Set(sigs).size).toBe(sigs.length);
  });
});

describe("deleted_idem tombstones carry a TTL field", () => {
  it("deleteEventCascade writes expireAt about 30 days ahead", async () => {
    const { memoryStore } = require("./memoryFirestore");
    const fns = require("../index");
    const docs = memoryStore({
      "children/c/access/u": { role: "owner", userId: "u" },
      "events/idem_abc": { childId: "c", userId: "u", type: "biberon", date: { toMillis: () => 1 } },
      "children/c": { name: "x" },
    });
    await fns.deleteEventCascade({ auth: { uid: "u", token: {} }, data: { childId: "c", eventId: "idem_abc" }, app: true });
    const tomb = docs.get("deleted_idem/idem_abc");
    const days = (tomb.expireAt.toMillis() - Date.now()) / 86400000;
    expect(days).toBeGreaterThan(29.9);
    expect(days).toBeLessThan(30.1);
  });
});
