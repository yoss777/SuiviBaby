const admin = require("firebase-admin");
const { onSchedule } = require("firebase-functions/v2/scheduler");

admin.initializeApp();

const BATCH_LIMIT = 450;

exports.cleanupExpiredShareCodes = onSchedule("every 24 hours", async () => {
  const db = admin.firestore();
  const now = admin.firestore.Timestamp.now();
  let deleted = 0;
  let lastDoc = null;

  while (true) {
    let query = db
      .collection("shareCodes")
      .where("expiresAt", "<=", now)
      .orderBy("expiresAt")
      .limit(BATCH_LIMIT);

    if (lastDoc) {
      query = query.startAfter(lastDoc);
    }

    const snapshot = await query.get();
    if (snapshot.empty) break;

    const batch = db.batch();
    snapshot.docs.forEach((doc) => batch.delete(doc.ref));
    await batch.commit();

    deleted += snapshot.size;
    lastDoc = snapshot.docs[snapshot.docs.length - 1];

    if (snapshot.size < BATCH_LIMIT) break;
  }

  console.log(`cleanupExpiredShareCodes: deleted ${deleted} docs`);
});
