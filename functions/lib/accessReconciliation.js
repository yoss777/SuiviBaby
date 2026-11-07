/**
 * Nightly reconciliation of children/{childId}/access/{uid} (source of truth)
 * with the user_child_access/{uid}_{childId} index (S12.5).
 *
 * - access without index entry: the entry is created.
 * - index entry without access: the entry is deleted (re-checked in a
 *   transaction, so an access created meanwhile keeps its entry).
 * Idempotent; pages of `pageSize` documents, at most `concurrency` writes at
 * once; a failure on one entry is counted and does not stop the run.
 */
const admin = require("firebase-admin");
const { mapInChunks } = require("./reminders");

const DEFAULT_PAGE_SIZE = 300;
const DEFAULT_CONCURRENCY = 10;

const indexId = (uid, childId) => `${uid}_${childId}`;

/** Read a query page by page ordered by document path; fn gets each page's docs. */
async function forEachPage(baseQuery, pageSize, fn) {
  let last = null;
  for (;;) {
    let q = baseQuery.orderBy(admin.firestore.FieldPath.documentId()).limit(pageSize);
    if (last) q = q.startAfter(last);
    const snap = await q.get();
    if (snap.empty) return;
    await fn(snap.docs);
    last = snap.docs[snap.docs.length - 1];
    if (snap.docs.length < pageSize) return;
  }
}

/** children/{childId}/access/{uid} -> { childId, userId }, null for any other path. */
function parseAccessPath(path) {
  const parts = String(path).split("/");
  if (parts.length !== 4 || parts[0] !== "children" || parts[2] !== "access") return null;
  return { childId: parts[1], userId: parts[3] };
}

async function reconcileAccessIndex(db, { pageSize = DEFAULT_PAGE_SIZE, concurrency = DEFAULT_CONCURRENCY } = {}) {
  const stats = { accessScanned: 0, indexScanned: 0, created: 0, deleted: 0, errors: 0 };

  // 1. access -> index: create the missing entries.
  await forEachPage(db.collectionGroup("access"), pageSize, async (docs) => {
    stats.accessScanned += docs.length;
    const entries = docs.map((d) => parseAccessPath(d.ref.path)).filter(Boolean);
    if (entries.length === 0) return;
    const indexRefs = entries.map((e) => db.doc(`user_child_access/${indexId(e.userId, e.childId)}`));
    const existing = await db.getAll(...indexRefs);
    const missing = entries.filter((_, i) => !existing[i].exists);
    await mapInChunks(missing, concurrency, async ({ childId, userId }) => {
      try {
        const accessRef = db.doc(`children/${childId}/access/${userId}`);
        const indexRef = db.doc(`user_child_access/${indexId(userId, childId)}`);
        const created = await db.runTransaction(async (tx) => {
          const [access, index] = await Promise.all([tx.get(accessRef), tx.get(indexRef)]);
          if (!access.exists || index.exists) return false;
          tx.set(indexRef, { userId, childId, reconciledAt: admin.firestore.FieldValue.serverTimestamp() });
          return true;
        });
        if (created) stats.created += 1;
      } catch (error) {
        stats.errors += 1;
        console.warn(`reconcileAccessIndex: create failed for ${userId}/${childId}:`, error?.message ?? error);
      }
    });
  });

  // 2. index -> access: delete the orphan entries.
  await forEachPage(db.collection("user_child_access"), pageSize, async (docs) => {
    stats.indexScanned += docs.length;
    const entries = docs.map((d) => {
      const data = d.data() || {};
      return { ref: d.ref, userId: data.userId, childId: data.childId };
    });
    const valid = entries.filter((e) => typeof e.userId === "string" && typeof e.childId === "string");
    const accessSnaps = await db.getAll(...valid.map((e) => db.doc(`children/${e.childId}/access/${e.userId}`)));
    const orphans = valid.filter((_, i) => !accessSnaps[i].exists);
    await mapInChunks(orphans, concurrency, async (entry) => {
      try {
        const accessRef = db.doc(`children/${entry.childId}/access/${entry.userId}`);
        const deleted = await db.runTransaction(async (tx) => {
          const access = await tx.get(accessRef);
          if (access.exists) return false;
          tx.delete(entry.ref);
          return true;
        });
        if (deleted) stats.deleted += 1;
      } catch (error) {
        stats.errors += 1;
        console.warn(`reconcileAccessIndex: delete failed for ${entry.userId}/${entry.childId}:`, error?.message ?? error);
      }
    });
  });

  return stats;
}

module.exports = { reconcileAccessIndex, parseAccessPath };
