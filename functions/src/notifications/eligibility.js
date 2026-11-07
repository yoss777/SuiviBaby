
/** Uids (among `uids`) whose users/{uid} carries a pendingDeletion; batched reads. */
async function usersWithPendingDeletion(db, uids) {
  const pending = new Set();
  const CHUNK = 200;
  for (let i = 0; i < uids.length; i += CHUNK) {
    const refs = uids.slice(i, i + CHUNK).map((uid) => db.doc(`users/${uid}`));
    const snaps = await db.getAll(...refs);
    snaps.forEach((snap, idx) => {
      if (snap.exists && snap.data()?.pendingDeletion) pending.add(uids[i + idx]);
    });
  }
  return pending;
}

/** Users (and children) handled at the same time by the scheduled jobs: bounded fan-out. */
const JOB_USER_CONCURRENCY = 10;

module.exports = {
  JOB_USER_CONCURRENCY,
  usersWithPendingDeletion,
};
