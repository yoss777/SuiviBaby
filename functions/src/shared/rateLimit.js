const { HttpsError } = require("firebase-functions/v2/https");

// ============================================
// SHARED HELPERS
// ============================================

/**
 * Rate limiting réutilisable — vérifie par bucket séparé.
 * @param {FirebaseFirestore.Firestore} db
 * @param {string} uid
 * @param {string} bucket - Nom du bucket (ex: "transcribe", "events", "delete")
 * @param {number} maxPerMinute
 */
async function checkRateLimit(db, uid, bucket, maxPerMinute) {
  const rateLimitRef = db.doc(`rate_limits/${uid}`);
  const now = Date.now();
  const oneMinuteAgo = now - 60 * 1000;
  const bucketKey = `${bucket}_timestamps`;

  // Lecture + écriture dans une transaction : sans elle, N appels parallèles
  // lisaient tous le même compteur et passaient tous sous la limite.
  await db.runTransaction(async function rateLimitTxn(tx) {
    const rateLimitDoc = await tx.get(rateLimitRef);
    const data = rateLimitDoc.exists ? rateLimitDoc.data() : {};
    const recentRequests = (data[bucketKey] || []).filter((t) => t > oneMinuteAgo);

    if (recentRequests.length >= maxPerMinute) {
      throw new HttpsError(
        "resource-exhausted",
        "Trop de requêtes. Réessayez dans une minute."
      );
    }

    tx.set(rateLimitRef, { [bucketKey]: [...recentRequests, now] }, { merge: true });
  });
}

module.exports = {
  checkRateLimit,
};
