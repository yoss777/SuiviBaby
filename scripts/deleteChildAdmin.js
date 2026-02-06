/**
 * Hard delete a child and all related data (Admin SDK).
 *
 * Usage:
 *   export GOOGLE_APPLICATION_CREDENTIALS="/path/to/service-account.json"
 *   node scripts/deleteChildAdmin.js v5RV8bgbD48Rp1ajivs5
 *
 * Optional dry-run:
 *   node scripts/deleteChildAdmin.js v5RV8bgbD48Rp1ajivs5 --dry-run
 */

const admin = require("firebase-admin");

const childId = process.argv[2];
const isDryRun = process.argv.includes("--dry-run");

if (!childId) {
  console.error("❌ Missing childId. Usage: node scripts/deleteChildAdmin.js <childId> [--dry-run]");
  process.exit(1);
}

admin.initializeApp({
  credential: admin.credential.applicationDefault(),
  projectId: "samaye-53723",
  storageBucket: "samaye-53723.firebasestorage.app",
});

const db = admin.firestore();
const bucket = admin.storage().bucket();

const CHILD_COLLECTIONS = [
  "events",
  "eventLikes",
  "eventComments",
  "tetees",
  "pompages",
  "mictions",
  "selles",
  "vitamines",
  "vaccins",
  "croissances",
  "sommeils",
  "babyAttachmentRequests",
];

const CHILD_AUX_COLLECTIONS = ["shareCodes", "shareInvitations"];

async function deleteDocsByField(collectionName, field, value) {
  let total = 0;
  while (true) {
    const snap = await db
      .collection(collectionName)
      .where(field, "==", value)
      .limit(450)
      .get();
    if (snap.empty) return total;

    const batch = db.batch();
    snap.docs.forEach((doc) => batch.delete(doc.ref));
    if (!isDryRun) {
      await batch.commit();
    }
    total += snap.size;
    if (snap.size < 450) return total;
  }
}

async function deleteSubcollection(parentRef, subcollectionName) {
  let total = 0;
  while (true) {
    const snap = await parentRef.collection(subcollectionName).limit(450).get();
    if (snap.empty) return total;
    const batch = db.batch();
    snap.docs.forEach((doc) => batch.delete(doc.ref));
    if (!isDryRun) {
      await batch.commit();
    }
    total += snap.size;
    if (snap.size < 450) return total;
  }
}

async function removeChildFromUsers(userIds) {
  const updates = [];
  for (const userId of userIds) {
    const userRef = db.collection("users").doc(userId);
    const prefsRef = db.collection("user_preferences").doc(userId);
    updates.push(
      userRef.set(
        { children: admin.firestore.FieldValue.arrayRemove(childId) },
        { merge: true }
      )
    );
    updates.push(
      prefsRef.set(
        { hiddenChildrenIds: admin.firestore.FieldValue.arrayRemove(childId) },
        { merge: true }
      )
    );
  }
  if (!isDryRun) {
    await Promise.all(updates);
  }
}

async function deleteStoragePrefix(prefix) {
  if (isDryRun) return 0;
  const [files] = await bucket.getFiles({ prefix });
  if (!files.length) return 0;
  await Promise.all(files.map((file) => file.delete().catch(() => null)));
  return files.length;
}

async function run() {
  console.log(`🧨 Hard delete child: ${childId}`);
  console.log(isDryRun ? "🧪 Dry-run mode (no writes)" : "🔥 Live mode");

  const childRef = db.collection("children").doc(childId);
  const childSnap = await childRef.get();
  if (!childSnap.exists) {
    console.error("❌ Child not found.");
    process.exit(1);
  }

  // Collect userIds from user_child_access
  const accessSnap = await db
    .collection("user_child_access")
    .where("childId", "==", childId)
    .limit(500)
    .get();
  const userIds = new Set();
  accessSnap.docs.forEach((doc) => {
    const data = doc.data() || {};
    if (data.userId) userIds.add(data.userId);
  });

  console.log(`👥 Users linked: ${userIds.size}`);

  // Delete child-related top-level collections
  for (const col of CHILD_COLLECTIONS) {
    const count = await deleteDocsByField(col, "childId", childId);
    console.log(`🗑️  ${col}: ${count}`);
  }

  // Auxiliary collections (share codes / invitations)
  for (const col of CHILD_AUX_COLLECTIONS) {
    const count = await deleteDocsByField(col, "childId", childId);
    console.log(`🗑️  ${col}: ${count}`);
  }

  // Delete access subcollection
  const accessCount = await deleteSubcollection(childRef, "access");
  console.log(`🗑️  children/${childId}/access: ${accessCount}`);

  // Delete user_child_access entries
  const userAccessCount = await deleteDocsByField(
    "user_child_access",
    "childId",
    childId
  );
  console.log(`🗑️  user_child_access: ${userAccessCount}`);

  // Remove references from user docs + prefs
  await removeChildFromUsers(Array.from(userIds));
  console.log(`🧹 User refs cleaned: ${userIds.size}`);

  // Delete storage files
  const storageCount = await deleteStoragePrefix(`children/${childId}/`);
  console.log(`🗑️  storage files deleted: ${storageCount}`);

  // Finally delete the child doc
  if (!isDryRun) {
    await childRef.delete();
  }
  console.log("✅ Done.");
}

run().catch((err) => {
  console.error("❌ Fatal:", err);
  process.exit(1);
});
