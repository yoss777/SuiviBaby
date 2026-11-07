const admin = require("firebase-admin");
const { photoBuckets } = require("../../lib/projectConfig");

/** Deletes one photo path from every photo bucket. Missing objects are ignored. */
async function deletePhotoEverywhere(path) {
  await Promise.all(
    photoBuckets().map((name) =>
      admin.storage().bucket(name).file(path).delete({ ignoreNotFound: true }),
    ),
  );
}

/**
 * Storage path of a photo ref: legacy full download URL or plain `children/...`
 * path. Returns null for anything that is not strictly inside `children/`
 * (traversal, other folders, malformed encoding). With `childId`, the path
 * must also sit inside `children/{childId}/`.
 */
function photoRefToPath(ref, childId) {
  if (typeof ref !== "string" || !ref) return null;
  let path = ref;
  if (ref.startsWith("https://firebasestorage.googleapis.com/")) {
    const match = ref.match(/\/o\/([^?]+)/);
    if (!match) return null;
    try {
      path = decodeURIComponent(match[1]);
    } catch {
      return null;
    }
  }
  if (!path.startsWith("children/") || path.includes("..")) return null;
  if (childId !== undefined && !path.startsWith(`children/${childId}/`)) return null;
  return path;
}

/**
 * Deletes the photos a user attached to events (including events of children
 * shared with other parents, which survive the account deletion).
 */
async function deleteUserEventPhotos(db, uid) {
  const snap = await db.collection("events").where("userId", "==", uid).get();
  const paths = new Set();
  snap.docs.forEach((doc) => {
    const { childId, photos } = doc.data();
    if (!childId) return;
    // events.photos is written by clients: only delete files of the event's
    // own child folder, never a path pointing at another child's photos.
    (Array.isArray(photos) ? photos : []).forEach((ref) => {
      const path = photoRefToPath(ref, childId);
      if (path) paths.add(path);
    });
  });
  const results = await Promise.allSettled([...paths].map((path) => deletePhotoEverywhere(path)));
  const failed = results.filter((r) => r.status === "rejected").length;
  // Throw rather than continue: the events are the only pointers to these
  // files, deleting them now would leave unreachable photos (audit A3).
  if (failed > 0) throw new Error(`${failed}/${paths.size} user photos could not be deleted`);
  return paths.size;
}

/** Deletes every file under children/{childId}/ in every photo bucket; returns the count. */
async function deleteChildPhotosEverywhere(childId) {
  let deleted = 0;
  let failed = 0;
  for (const name of photoBuckets()) {
    // One bucket failing must not leave the other untouched.
    try {
      const [files] = await admin.storage().bucket(name).getFiles({ prefix: `children/${childId}/` });
      const results = await Promise.allSettled(files.map((file) => file.delete()));
      failed += results.filter((r) => r.status === "rejected").length;
      deleted += files.length;
    } catch (error) {
      failed += 1;
      console.error(`deleteChildPhotosEverywhere: listing ${name} failed for ${childId}`, error?.message ?? error);
    }
  }
  if (failed > 0) throw new Error(`${failed} photos of child ${childId} could not be deleted`);
  return deleted;
}

module.exports = {
  deleteChildPhotosEverywhere,
  deletePhotoEverywhere,
  deleteUserEventPhotos,
  photoRefToPath,
};
