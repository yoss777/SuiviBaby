// services/events/milestonePhoto.ts
//
// Photo d'un jalon : téléversement avec délai maximal, message réseau distinct,
// et nettoyage de Storage pour ne laisser aucune photo orpheline :
//  - création refusée après le téléversement -> la nouvelle photo est supprimée ;
//  - modification acceptée par le serveur -> l'ancienne photo est supprimée ;
//  - modification refusée -> l'ancienne reste, la nouvelle est supprimée.

import * as FileSystem from "expo-file-system";
import { auth } from "@/config/firebase";
import { captureServiceError } from "@/utils/errorReporting";
import { FIREBASE_STORAGE_BUCKET, isLocalPhotoUri } from "@/utils/photoStorage";
import { deletePhotoFromStorage } from "@/services/events/photoCleanup";
import {
  ajouterEvenementOptimistic,
  modifierEvenementOptimistic,
} from "@/services/eventsService";

/** Délai maximal d'un téléversement (réseau très lent ou coupé en route). */
export const PHOTO_UPLOAD_TIMEOUT_MS = 60_000;

export const PHOTO_NETWORK_MESSAGE =
  "La photo n'a pas pu être envoyée : connexion trop lente ou absente. Vérifiez votre connexion puis réessayez.";

export type PhotoUploadErrorKind = "network" | "timeout" | "other";

export class PhotoUploadError extends Error {
  readonly kind: PhotoUploadErrorKind;
  constructor(kind: PhotoUploadErrorKind, message?: string) {
    super(message ?? `Photo upload failed (${kind})`);
    this.name = "PhotoUploadError";
    this.kind = kind;
  }
}

export function photoUploadErrorMessage(error: unknown): { title: string; message: string } {
  if (error instanceof PhotoUploadError && (error.kind === "network" || error.kind === "timeout")) {
    return { title: "Photo non envoyée", message: PHOTO_NETWORK_MESSAGE };
  }
  return { title: "Erreur", message: "Impossible de sauvegarder." };
}

function looksLikeNetworkError(error: unknown): boolean {
  const msg = (error instanceof Error ? error.message : String(error)).toLowerCase();
  return (
    msg.includes("network") ||
    msg.includes("internet") ||
    msg.includes("offline") ||
    msg.includes("timed out") ||
    msg.includes("timeout") ||
    msg.includes("connection") ||
    msg.includes("failed to connect")
  );
}

/** Suppression de Storage au mieux : une erreur est signalée, jamais propagée. */
function cleanupPhoto(path: string | undefined): void {
  if (!path) return;
  const report = (error: unknown) =>
    captureServiceError(error, { service: "events", operation: "milestonePhotoCleanup" });
  try {
    void Promise.resolve(deletePhotoFromStorage(path)).catch(report);
  } catch (error) {
    report(error);
  }
}

export async function uploadMilestonePhoto(
  childId: string,
  uri: string,
  onProgress?: (progress: number) => void,
  options: { timeoutMs?: number } = {},
): Promise<string> {
  const timeoutMs = options.timeoutMs ?? PHOTO_UPLOAD_TIMEOUT_MS;
  const fileName = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const filePath = `children/${childId}/jalons/${fileName}.jpg`;

  onProgress?.(10);
  const user = auth.currentUser;
  if (!user) throw new PhotoUploadError("other", "Utilisateur non connecté");

  let token: string;
  try {
    token = await user.getIdToken();
  } catch (error) {
    throw new PhotoUploadError(looksLikeNetworkError(error) ? "network" : "other");
  }
  onProgress?.(20);

  const uploadUrl = `https://firebasestorage.googleapis.com/v0/b/${FIREBASE_STORAGE_BUCKET}/o?uploadType=media&name=${encodeURIComponent(filePath)}`;
  let timedOut = false;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const upload = FileSystem.uploadAsync(uploadUrl, uri, {
    httpMethod: "POST",
    uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "image/jpeg" },
  });
  // Si le délai est dépassé mais que le fichier arrive quand même, on le
  // supprime : personne ne l'attend plus.
  void upload.then(
    () => { if (timedOut) cleanupPhoto(filePath); },
    () => {},
  );

  let response: { status: number; body: string };
  try {
    response = await Promise.race([
      upload,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          timedOut = true;
          reject(new PhotoUploadError("timeout"));
        }, timeoutMs);
      }),
    ]);
  } catch (error) {
    if (error instanceof PhotoUploadError) throw error;
    console.error("[UPLOAD] Erreur:", error);
    throw new PhotoUploadError(looksLikeNetworkError(error) ? "network" : "other");
  } finally {
    if (timer) clearTimeout(timer);
  }

  if (response.status !== 200) {
    // 5xx / 408 / 429 : le service ou le réseau, pas la photo.
    const transient = response.status >= 500 || response.status === 408 || response.status === 429;
    throw new PhotoUploadError(transient ? "network" : "other", `Upload failed with status ${response.status}`);
  }

  onProgress?.(80);
  try {
    const responseData = JSON.parse(response.body) as { name?: string };
    if (responseData.name && responseData.name !== filePath) {
      console.warn("[UPLOAD] Chemin Storage inattendu:", responseData.name);
    }
  } catch {
    // corps illisible : le statut 200 fait foi
  }
  onProgress?.(100);
  return filePath;
}

/**
 * Enregistre un jalon (création ou modification), photo comprise.
 * Lève PhotoUploadError si le téléversement échoue (rien n'est créé).
 */
export async function submitMilestone(params: {
  childId: string;
  editData?: { id: string; photos?: string[] } | null;
  /** Photo choisie : URI locale (à téléverser) ou référence déjà en ligne. */
  photoUri: string | null;
  data: Record<string, unknown>;
  onProgress?: (progress: number) => void;
}): Promise<void> {
  const { childId, editData, photoUri, data, onProgress } = params;

  let photoRefs: string[] | undefined = photoUri ? [photoUri] : undefined;
  let uploadedPath: string | undefined;
  if (photoUri && isLocalPhotoUri(photoUri)) {
    uploadedPath = await uploadMilestonePhoto(childId, photoUri, onProgress);
    photoRefs = [uploadedPath];
  }
  const payload = photoRefs ? { ...data, photos: photoRefs } : data;
  const cleanupNew = uploadedPath ? () => cleanupPhoto(uploadedPath) : undefined;

  try {
    if (editData) {
      const oldPhoto = editData.photos?.[0];
      const replaced = uploadedPath && oldPhoto && oldPhoto !== uploadedPath;
      modifierEvenementOptimistic(childId, editData.id, payload as any, editData, undefined, {
        // L'ancienne photo ne part qu'une fois la modification acceptée : si
        // elle est refusée, le jalon pointe toujours dessus.
        onConfirmed: replaced ? () => cleanupPhoto(oldPhoto) : undefined,
        onFailed: cleanupNew,
        // Même raison qu'à la création : la photo téléversée est supprimée
        // après l'échec, « Réessayer » renverrait un chemin disparu.
        retryable: uploadedPath ? false : undefined,
      });
    } else {
      ajouterEvenementOptimistic(childId, payload, {
        onFailed: cleanupNew,
        // La photo téléversée est supprimée en cas d'échec : un nouvel envoi
        // des mêmes données pointerait vers un fichier disparu.
        retryable: uploadedPath ? false : undefined,
      });
    }
  } catch (error) {
    cleanupNew?.();
    throw error;
  }
}
