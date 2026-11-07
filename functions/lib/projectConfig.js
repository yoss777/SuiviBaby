// Identifiants dérivés du projet Firebase déployé (revue ECC S11+S12).
//
// Rien n'est codé en dur : le même code part en production et en
// staging. Deux niveaux :
// - au déploiement, les déclencheurs Storage ont besoin du nom du bucket avant
//   que la fonction ne s'exécute : paramètres `defineString`, lus par la CLI
//   dans functions/.env.<projectId> (un fichier par projet) ;
// - à l'exécution, la CLI injecte ces paramètres dans process.env ; sans eux,
//   on dérive les noms de l'identifiant du projet (GCLOUD_PROJECT).
const { defineString } = require("firebase-functions/params");

/** Bucket EU des photos (déclencheurs `generatePhotoThumbnail`, `deletePhotoThumbnail`). */
const PHOTOS_BUCKET_PARAM = defineString("PHOTOS_BUCKET");
/** Ancien bucket par défaut (déclencheurs `mirrorLegacyPhoto*`). */
const LEGACY_PHOTOS_BUCKET_PARAM = defineString("LEGACY_PHOTOS_BUCKET");

/** Identifiant du projet déployé ; lève plutôt que de deviner un projet. */
function projectId() {
  const direct = process.env.GCLOUD_PROJECT || process.env.GCP_PROJECT;
  if (direct) return direct;
  try {
    const fromConfig = JSON.parse(process.env.FIREBASE_CONFIG || "{}").projectId;
    if (fromConfig) return fromConfig;
  } catch {
    // FIREBASE_CONFIG illisible : traité comme absent.
  }
  throw new Error("Identifiant de projet introuvable (GCLOUD_PROJECT, GCP_PROJECT ou FIREBASE_CONFIG).");
}

/** Bucket EU des photos du projet. */
function photosBucket() {
  return process.env.PHOTOS_BUCKET || `${projectId()}-photos-eu`;
}

/** Ancien bucket par défaut du projet. */
function legacyPhotosBucket() {
  return process.env.LEGACY_PHOTOS_BUCKET || `${projectId()}.firebasestorage.app`;
}

/** Tous les buckets de photos (une suppression doit les viser tous). */
function photoBuckets() {
  return [photosBucket(), legacyPhotosBucket()];
}

/** URL publique d'une fonction HTTPS europe-west1 du projet. */
function functionsBaseUrl() {
  return `https://europe-west1-${projectId()}.cloudfunctions.net`;
}

module.exports = {
  PHOTOS_BUCKET_PARAM,
  LEGACY_PHOTOS_BUCKET_PARAM,
  projectId,
  photosBucket,
  legacyPhotosBucket,
  photoBuckets,
  functionsBaseUrl,
};
