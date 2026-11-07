// utils/photoThumbnails.ts
//
// S7.3 : chemin de la miniature (400 px) d'une photo de jalon. Les miniatures
// sont générées côté serveur (functions/thumbnails.js) dans
// `children/{childId}/thumbs/{nom}.jpg`, à partir de
// `children/{childId}/jalons/{nom}.jpg`. Les deux fonctions de chemin sont
// dupliquées côté serveur : garder les deux fichiers alignés.
import { normalizePhotoRef } from "@/utils/photoStorage";

const ORIGINAL_PATH = /^children\/([^/]+)\/jalons\/([^/]+)$/;

/** Chemin de la miniature d'une photo (chemin Storage ou ancienne URL), ou null. */
export function getThumbnailPath(photoRef: string | null | undefined): string | null {
  if (!photoRef) return null;
  const match = ORIGINAL_PATH.exec(normalizePhotoRef(photoRef));
  if (!match) return null;
  // La miniature est toujours un JPEG : on remplace l'extension.
  const base = match[2].replace(/\.[^.]+$/, "");
  return `children/${match[1]}/thumbs/${base}.jpg`;
}
