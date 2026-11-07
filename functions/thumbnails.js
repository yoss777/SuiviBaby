// Miniatures des photos de jalons (S7.3).
//
// À chaque photo écrite dans `children/{childId}/jalons/{nom}` du bucket EU
// (envoi direct de l'app, ou copie depuis l'ancien bucket par
// mirrorLegacyPhotoUpload), on génère une miniature JPEG dont le plus petit
// côté fait 400 px dans `children/{childId}/thumbs/{nom}.jpg`. Les grilles de
// l'app (Souvenirs, Moments, Jalons) chargent cette miniature (~30 Ko) au lieu
// de la photo (~300 Ko). Quand la photo est supprimée, sa miniature part avec.
//
// Écritures serveur : elles ignorent les règles Storage. Côté client, la
// lecture de `thumbs/` suit les mêmes droits que `jalons/` (storage.rules).
// Les fonctions de chemin sont dupliquées dans utils/photoThumbnails.ts (app).
const admin = require("firebase-admin");
const { onObjectFinalized, onObjectDeleted } = require("firebase-functions/v2/storage");

const PHOTOS_BUCKET = "samaye-53723-photos-eu";
/** Plus petit côté de la miniature (grille 3 colonnes x 3 de densité). */
const THUMBNAIL_SIZE = 400;
const THUMBNAIL_QUALITY = 75;

const ORIGINAL_PATH = /^children\/([^/]+)\/jalons\/([^/]+)$/;

/** Chemin de la miniature d'une photo de jalon, ou null si ce n'en est pas une. */
function thumbnailPathFor(name) {
  if (typeof name !== "string") return null;
  const match = ORIGINAL_PATH.exec(name);
  if (!match) return null;
  return `children/${match[1]}/thumbs/${match[2].replace(/\.[^.]+$/, "")}.jpg`;
}

async function generateThumbnail(event) {
  const { name, bucket: bucketName, contentType } = event.data;
  const thumbPath = thumbnailPathFor(name);
  if (!thumbPath) return null;
  if (contentType && !contentType.startsWith("image/")) return null;

  // sharp (binaire natif) chargé à la demande.
  const sharp = require("sharp");
  const bucket = admin.storage().bucket(bucketName);
  const [original] = await bucket.file(name).download();
  const thumbnail = await sharp(original)
    .rotate() // applique l'orientation EXIF avant de la perdre
    .resize({
      width: THUMBNAIL_SIZE,
      height: THUMBNAIL_SIZE,
      fit: "outside",
      withoutEnlargement: true,
    })
    .jpeg({ quality: THUMBNAIL_QUALITY })
    .toBuffer();

  await bucket.file(thumbPath).save(thumbnail, {
    contentType: "image/jpeg",
    resumable: false,
    metadata: { cacheControl: "private, max-age=31536000" },
  });
  console.log(`generateThumbnail: ${name} -> ${thumbPath} (${thumbnail.length} bytes)`);
  return thumbPath;
}

async function deleteThumbnail(event) {
  const thumbPath = thumbnailPathFor(event.data.name);
  if (!thumbPath) return null;
  await admin
    .storage()
    .bucket(event.data.bucket)
    .file(thumbPath)
    .delete({ ignoreNotFound: true });
  return thumbPath;
}

exports.thumbnailPathFor = thumbnailPathFor;
exports.generateThumbnailHandler = generateThumbnail;
exports.deleteThumbnailHandler = deleteThumbnail;

exports.generatePhotoThumbnail = onObjectFinalized(
  { bucket: PHOTOS_BUCKET, region: "europe-west1", memory: "512MiB", timeoutSeconds: 120 },
  generateThumbnail,
);

exports.deletePhotoThumbnail = onObjectDeleted(
  { bucket: PHOTOS_BUCKET, region: "europe-west1" },
  deleteThumbnail,
);
