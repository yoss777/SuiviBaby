/**
 * Audit (and optionally fix) the write flags of child access documents.
 *
 * Since sprint 4.8 the role alone decides who writes events (firestore.rules
 * and the Cloud Functions ignore canWriteEvents), so this migration is NOT
 * required for security: it only keeps the stored flags consistent with the
 * role (contributor: likes + comments; viewer: nothing; owner/admin: all).
 *
 * Dry run by default; nothing is written without --apply.
 *
 * Usage:
 *   export GOOGLE_APPLICATION_CREDENTIALS="/path/to/service-account.json"
 *   node scripts/normalizeAccessFlags.js           # report only
 *   node scripts/normalizeAccessFlags.js --apply   # rewrite the flags
 */

const admin = require("firebase-admin");

admin.initializeApp({
  credential: admin.credential.applicationDefault(),
  projectId: "samaye-53723",
});

const db = admin.firestore();
const APPLY = process.argv.includes("--apply");

const EXPECTED = {
  owner: { canWriteEvents: true, canWriteLikes: true, canWriteComments: true },
  admin: { canWriteEvents: true, canWriteLikes: true, canWriteComments: true },
  contributor: { canWriteEvents: false, canWriteLikes: true, canWriteComments: true },
  viewer: { canWriteEvents: false, canWriteLikes: false, canWriteComments: false },
};

async function run() {
  const snap = await db.collectionGroup("access").get();
  console.log(`${snap.size} access documents (${APPLY ? "APPLY" : "dry run"})`);

  let drift = 0;
  let unknownRole = 0;
  let batch = db.batch();
  let pending = 0;

  for (const docSnap of snap.docs) {
    const data = docSnap.data();
    const expected = EXPECTED[data.role];
    if (!expected) {
      unknownRole += 1;
      console.warn(`unknown role "${data.role}": ${docSnap.ref.path}`);
      continue;
    }
    const patch = {};
    for (const [flag, value] of Object.entries(expected)) {
      if (data[flag] !== value) patch[flag] = value;
    }
    if (Object.keys(patch).length === 0) continue;

    drift += 1;
    console.log(`${docSnap.ref.path} (${data.role}): ${JSON.stringify(patch)}`);
    if (APPLY) {
      batch.update(docSnap.ref, patch);
      pending += 1;
      if (pending === 400) {
        await batch.commit();
        batch = db.batch();
        pending = 0;
      }
    }
  }
  if (APPLY && pending > 0) await batch.commit();

  console.log(`Done: ${drift} document(s) ${APPLY ? "fixed" : "would change"}, ${unknownRole} with an unknown role.`);
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
