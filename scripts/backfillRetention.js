/**
 * Backfill `expireAt` (90-day retention, HC6) on documents written before the
 * functions set it at write time: notification_history, recap_history,
 * webhook_logs, abandoned pending_assemblyai_deletes and deleted_idem
 * tombstones (30 days instead of 90, S12.5). The Firestore TTL
 * policies (firestore.indexes.json, fieldOverrides) then delete them.
 *
 * expireAt = reference date + 90 days, where the reference date is sentAt /
 * processedAt / abandonedAt of the document (now when it has none): an old
 * document is therefore deleted at once by the TTL, as intended.
 *
 * DRY RUN BY DEFAULT: nothing is written unless --apply is passed.
 *
 * Usage:
 *   export GOOGLE_APPLICATION_CREDENTIALS="/path/to/service-account.json"
 *   node scripts/backfillRetention.js            # dry run, counts only
 *   node scripts/backfillRetention.js --apply    # writes expireAt
 */

const admin = require("firebase-admin");

const APPLY = process.argv.includes("--apply");
const RETENTION_MS = 90 * 24 * 60 * 60 * 1000;
const IDEM_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;
const PAGE = 400;

const TARGETS = [
  { collection: "notification_history", dateFields: ["sentAt"] },
  { collection: "recap_history", dateFields: ["sentAt"] },
  { collection: "webhook_logs", dateFields: ["processedAt"] },
  // Only the abandoned ones: the others are still being retried.
  { collection: "pending_assemblyai_deletes", dateFields: ["abandonedAt"], requireField: "abandonedAt" },
  // Tombstones of deleted idempotent events: 30 days (IDEM_TOMBSTONE_RETENTION_MS in functions/index.js).
  { collection: "deleted_idem", dateFields: ["deletedAt"], retentionMs: IDEM_RETENTION_MS },
];

function toMillis(value) {
  if (value && typeof value.toMillis === "function") return value.toMillis();
  if (value instanceof Date) return value.getTime();
  return null;
}

async function backfill(db, { collection, dateFields, requireField, retentionMs = RETENTION_MS }) {
  let scanned = 0;
  let toUpdate = 0;
  let last = null;
  for (;;) {
    let q = db.collection(collection).orderBy(admin.firestore.FieldPath.documentId()).limit(PAGE);
    if (last) q = q.startAfter(last);
    const snap = await q.get();
    if (snap.empty) break;
    const batch = db.batch();
    let inBatch = 0;
    for (const doc of snap.docs) {
      scanned += 1;
      const data = doc.data();
      if (data.expireAt) continue;
      if (requireField && !data[requireField]) continue;
      const reference = dateFields.map((f) => toMillis(data[f])).find((ms) => ms !== null) ?? Date.now();
      toUpdate += 1;
      if (APPLY) {
        batch.update(doc.ref, { expireAt: admin.firestore.Timestamp.fromMillis(reference + retentionMs) });
        inBatch += 1;
      }
    }
    if (APPLY && inBatch > 0) await batch.commit();
    last = snap.docs[snap.docs.length - 1];
    if (snap.size < PAGE) break;
  }
  console.log(`${collection}: scanned=${scanned} ${APPLY ? "updated" : "would update"}=${toUpdate}`);
}

async function main() {
  admin.initializeApp({
    credential: admin.credential.applicationDefault(),
    projectId: "samaye-53723",
  });
  const db = admin.firestore();
  console.log(APPLY ? "APPLY mode: writing expireAt" : "DRY RUN (pass --apply to write)");
  for (const target of TARGETS) await backfill(db, target);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
