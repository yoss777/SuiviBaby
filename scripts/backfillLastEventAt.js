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
 *   node scripts/backfillLastEventAt.js                                        # dry run (production), counts only
 *   node scripts/backfillLastEventAt.js --apply --project=<projectId>          # writes missing keys
 *   node scripts/backfillLastEventAt.js --apply --recompute --project=<projectId>  # also fixes stale values
 *
 * --apply REQUIRES an explicit --project: no default project is ever written to
 * (a script run by habit against the wrong project would rewrite its children).
 *
 * Re-running is safe (idempotent). Safe while the app is in use: a concurrent
 * event write recomputes the same fields from the events themselves.
 */

const { LAST_EVENT_KEYS, lastEventQuery } = require("../functions/lib/reminders");

/** Project read by a dry run when none is named (read-only). */
const DRY_RUN_DEFAULT_PROJECT = "samaye-53723";

/** Reads the command line; --apply without --project throws. */
function parseArgs(argv) {
  const apply = argv.includes("--apply");
  const recompute = argv.includes("--recompute");
  const project = (argv.find((a) => a.startsWith("--project=")) || "").split("=")[1] || null;
  if (apply && !project) {
    throw new Error("--apply requires an explicit --project=<projectId> (no default project is written to).");
  }
  return { apply, recompute, project };
}

let APPLY = false;
let RECOMPUTE = false;
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
  const raw = doc.data().lastEventAt;
  // Valeur héritée null ou scalaire : on réécrit la map entière (un chemin
  // pointé ne peut pas la convertir de façon sûre).
  const isMap = raw !== null && typeof raw === "object" && !Array.isArray(raw);
  const known = isMap ? raw : {};
  const missing = LAST_EVENT_KEYS.filter((k) => known[k] === undefined);
  if (missing.length === 0 && !RECOMPUTE) return;
  const keys = isMap && !RECOMPUTE ? missing : LAST_EVENT_KEYS;
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
  if (APPLY) {
    await doc.ref.update(
      isMap
        ? update
        : { lastEventAt: Object.fromEntries(Object.entries(update).map(([k, v]) => [k.replace("lastEventAt.", ""), v])) },
    );
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  APPLY = args.apply;
  RECOMPUTE = args.recompute;
  const PROJECT = args.project || DRY_RUN_DEFAULT_PROJECT;
  const admin = require("firebase-admin");
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

module.exports = { parseArgs };

if (require.main === module) {
  main().catch((err) => {
    console.error(err.message || err);
    process.exit(1);
  });
}
