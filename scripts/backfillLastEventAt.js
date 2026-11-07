/**
 * Backfill `children/{id}.lastEventAt` (S12.4): date of the latest event per
 * reminder category (repas, pompages, changes, vitamines) and of any event
 * ("any"). The event callables maintain it from now on; this script fills the
 * children that existed before (until then the reminder and recap jobs fall
 * back to querying events, which is correct but slower).
 *
 * A key holds a Timestamp, or null when the child has no such event.
 *
 * DRY RUN BY DEFAULT: nothing is written unless --apply is passed.
 * By default only children missing at least one key are processed; with
 * --recompute every child is checked and a stale value is corrected.
 *
 * Usage:
 *   export GOOGLE_APPLICATION_CREDENTIALS="/path/to/service-account.json"
 *   node scripts/backfillLastEventAt.js                        # dry run, counts only
 *   node scripts/backfillLastEventAt.js --apply                # writes missing keys
 *   node scripts/backfillLastEventAt.js --apply --recompute    # also fixes stale values
 *   node scripts/backfillLastEventAt.js --project=samaye-staging
 *
 * Re-running is safe (idempotent). Safe while the app is in use: a concurrent
 * event write recomputes the same fields from the events themselves.
 */

const admin = require("firebase-admin");
const { LAST_EVENT_KEYS, lastEventQuery } = require("../functions/lib/reminders");

const APPLY = process.argv.includes("--apply");
const RECOMPUTE = process.argv.includes("--recompute");
const PROJECT = (process.argv.find((a) => a.startsWith("--project=")) || "").split("=")[1] || "samaye-53723";
const PAGE = 200;
const CONCURRENCY = 10;

const millis = (v) => (v && typeof v.toMillis === "function" ? v.toMillis() : null);

async function computeKeys(db, childId, keys) {
  const patch = {};
  for (const key of keys) {
    const snap = await lastEventQuery(db, childId, key).get();
    patch[key] = snap.empty ? null : (snap.docs[0].data().date ?? null);
  }
  return patch;
}

async function processChild(db, doc, stats) {
  const known = doc.data().lastEventAt || {};
  const missing = LAST_EVENT_KEYS.filter((k) => known[k] === undefined);
  if (missing.length === 0 && !RECOMPUTE) return;
  const keys = RECOMPUTE ? LAST_EVENT_KEYS : missing;
  const computed = await computeKeys(db, doc.id, keys);
  const update = {};
  for (const key of keys) {
    const previous = known[key];
    if (previous !== undefined && millis(previous) === millis(computed[key]) && (previous === null) === (computed[key] === null)) continue;
    update[`lastEventAt.${key}`] = computed[key];
    if (previous === undefined) stats.filled += 1;
    else stats.corrected += 1;
  }
  if (Object.keys(update).length === 0) return;
  stats.childrenToUpdate += 1;
  if (APPLY) await doc.ref.update(update);
}

async function main() {
  admin.initializeApp({
    credential: admin.credential.applicationDefault(),
    projectId: PROJECT,
  });
  const db = admin.firestore();
  console.log(`${APPLY ? "APPLY mode: writing lastEventAt" : "DRY RUN (pass --apply to write)"} on ${PROJECT}${RECOMPUTE ? " (recompute)" : ""}`);
  const stats = { scanned: 0, childrenToUpdate: 0, filled: 0, corrected: 0 };
  let last = null;
  for (;;) {
    let q = db.collection("children").orderBy(admin.firestore.FieldPath.documentId()).limit(PAGE);
    if (last) q = q.startAfter(last);
    const snap = await q.get();
    if (snap.empty) break;
    for (let i = 0; i < snap.docs.length; i += CONCURRENCY) {
      await Promise.all(snap.docs.slice(i, i + CONCURRENCY).map((d) => processChild(db, d, stats)));
    }
    stats.scanned += snap.size;
    last = snap.docs[snap.docs.length - 1];
    if (snap.size < PAGE) break;
  }
  console.log(
    `children: scanned=${stats.scanned} ${APPLY ? "updated" : "would update"}=${stats.childrenToUpdate} ` +
    `keys filled=${stats.filled} corrected=${stats.corrected}`
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
