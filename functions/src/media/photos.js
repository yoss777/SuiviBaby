const admin = require("firebase-admin");
const { onObjectFinalized, onObjectDeleted } = require("firebase-functions/v2/storage");
const { LEGACY_PHOTOS_BUCKET_PARAM, photosBucket, legacyPhotosBucket } = require("../../lib/projectConfig");

// ============================================================================
// PHOTO BUCKET MIGRATION — mirror the legacy US bucket into the EU bucket
// ============================================================================
// Older app versions still read/write the legacy bucket. Until they are gone
// (docs/MIGRATION_PHOTOS_EU.md), every upload there is copied to the EU bucket
// and every deletion there is applied to the EU copy. Storage triggers must run
// in the bucket's region (us-central1); they only move bytes into the EU.

function isChildPhotoObject(name) {
  return typeof name === "string" && name.startsWith("children/");
}

const mirrorLegacyPhotoUpload = onObjectFinalized(
  { bucket: LEGACY_PHOTOS_BUCKET_PARAM, region: "us-central1" },
  async (event) => {
    const name = event.data.name;
    if (!isChildPhotoObject(name)) return;
    await admin
      .storage()
      .bucket(legacyPhotosBucket())
      .file(name)
      .copy(admin.storage().bucket(photosBucket()).file(name));
    console.log(`mirrorLegacyPhotoUpload: copied ${name} to ${photosBucket()}`);
  },
);

const mirrorLegacyPhotoDelete = onObjectDeleted(
  { bucket: LEGACY_PHOTOS_BUCKET_PARAM, region: "us-central1" },
  async (event) => {
    const name = event.data.name;
    if (!isChildPhotoObject(name)) return;
    await admin.storage().bucket(photosBucket()).file(name).delete({ ignoreNotFound: true });
    console.log(`mirrorLegacyPhotoDelete: removed ${name} from ${photosBucket()}`);
  },
);

// Miniatures 400 px des photos de jalons (S7.3) : voir functions/thumbnails.js
const generatePhotoThumbnail = require("../../thumbnails").generatePhotoThumbnail;
const deletePhotoThumbnail = require("../../thumbnails").deletePhotoThumbnail;

module.exports = {
  deletePhotoThumbnail,
  generatePhotoThumbnail,
  mirrorLegacyPhotoDelete,
  mirrorLegacyPhotoUpload,
};
