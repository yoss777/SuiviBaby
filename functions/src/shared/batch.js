
const BATCH_LIMIT = 450;

/**
 * Supprime des documents par champ en batches de BATCH_LIMIT.
 */
async function deleteDocsByFieldBatched(db, collectionName, field, value) {
  let totalDeleted = 0;
  while (true) {
    const snapshot = await db
      .collection(collectionName)
      .where(field, "==", value)
      .limit(BATCH_LIMIT)
      .get();

    if (snapshot.empty) return totalDeleted;

    const batch = db.batch();
    snapshot.docs.forEach((doc) => batch.delete(doc.ref));
    await batch.commit();

    totalDeleted += snapshot.size;
    if (snapshot.size < BATCH_LIMIT) return totalDeleted;
  }
}

/** Updates in batches every document of `collectionName` where field == value. */
async function updateDocsByFieldBatched(db, collectionName, field, value, patch) {
  let total = 0;
  while (true) {
    const snapshot = await db
      .collection(collectionName)
      .where(field, "==", value)
      .limit(BATCH_LIMIT)
      .get();
    if (snapshot.empty) return total;
    const batch = db.batch();
    snapshot.docs.forEach((doc) => batch.update(doc.ref, patch));
    await batch.commit();
    total += snapshot.size;
    if (snapshot.size < BATCH_LIMIT) return total;
  }
}

module.exports = {
  BATCH_LIMIT,
  deleteDocsByFieldBatched,
  updateDocsByFieldBatched,
};
