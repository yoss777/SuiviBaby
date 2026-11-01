// services/events/photoCleanup.ts
//
// Two helpers used by the milestone (jalon) flow when an event with
// photos is deleted: drop the underlying Storage objects so we don't
// leave orphaned blobs, then delete the event itself.
//
// Extracted from eventsService.ts (S3-T2c). The Storage delete uses a
// raw fetch to the Firebase REST endpoint with a bearer ID token so it
// can run in offline-queue contexts where the JS SDK reference is
// unavailable. Best-effort: a 404 is treated as success.

import { auth } from "@/config/firebase";
import { PHOTO_STORAGE_BUCKETS, extractStoragePath } from "@/utils/photoStorage";
import {
  obtenirEvenement,
  supprimerEvenement,
} from "@/services/eventsService";

export async function deletePhotoFromStorage(photoRef: string): Promise<void> {
  try {
    const filePath = extractStoragePath(photoRef);
    if (!filePath) {
      console.warn("[DELETE_PHOTO] Référence photo non reconnue:", photoRef);
      return;
    }
    const encodedPath = encodeURIComponent(filePath);
    console.log("[DELETE_PHOTO] Suppression de:", filePath);

    const user = auth.currentUser;
    if (!user) {
      console.warn("[DELETE_PHOTO] Utilisateur non connecté");
      return;
    }
    const token = await user.getIdToken();

    // During the bucket migration a copy may exist in both buckets.
    for (const bucket of PHOTO_STORAGE_BUCKETS) {
      const deleteUrl = `https://firebasestorage.googleapis.com/v0/b/${bucket}/o/${encodedPath}`;
      const response = await fetch(deleteUrl, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });

      if (response.ok || response.status === 404) {
        console.log("[DELETE_PHOTO] Photo supprimée de", bucket);
      } else {
        console.error(
          "[DELETE_PHOTO] Erreur:",
          bucket,
          response.status,
          await response.text(),
        );
      }
    }
  } catch (error) {
    console.error("[DELETE_PHOTO] Erreur:", error);
  }
}

/** Supprime un jalon avec nettoyage des photos Firebase Storage. */
export async function supprimerJalon(childId: string, id: string) {
  try {
    const event = await obtenirEvenement(childId, id);
    if ((event as any)?.photos && Array.isArray((event as any).photos)) {
      for (const photoRef of (event as any).photos) {
        if (photoRef) {
          await deletePhotoFromStorage(photoRef);
        }
      }
    }
  } catch (error) {
    console.error("[SUPPRIMER_JALON] Erreur récupération événement:", error);
  }
  return supprimerEvenement(childId, id);
}
