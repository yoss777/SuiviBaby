import { auth, functions } from "@/config/firebase";
import { httpsCallable } from "firebase/functions";
import { extractStoragePath } from "@/utils/photoStorage";

export type ContentReportReason =
  | "intimate_child_nudity"
  | "sensitive_child_photo"
  | "privacy"
  | "other";

type SubmitContentReportParams = {
  childId: string;
  eventId?: string;
  photoRef?: string;
  reason: ContentReportReason;
  message?: string;
};

/**
 * Soumet un signalement de contenu via la CF submitContentReportCF.
 *
 * B6 — l'ancienne version faisait un addDoc client direct. Maintenant
 * tout passe par la CF qui valide :
 *  - rate limit 5/min/uid (anti report flooding)
 *  - childId/eventId existent vraiment
 *  - pas d'auto-report (event.userId !== reporter)
 */
export async function submitContentReport({
  childId,
  eventId,
  photoRef,
  reason,
  message,
}: SubmitContentReportParams) {
  const user = auth.currentUser;
  if (!user) {
    throw new Error("Utilisateur non connecté");
  }

  const submit = httpsCallable<
    {
      childId: string;
      eventId?: string;
      photoPath?: string | null;
      reason: ContentReportReason;
      message?: string;
    },
    { reportId: string }
  >(functions, "submitContentReportCF");

  try {
    await submit({
      childId,
      eventId,
      photoPath: photoRef ? extractStoragePath(photoRef) ?? photoRef : null,
      reason,
      message: message?.trim() || undefined,
    });
  } catch (error: any) {
    // Mapper les codes Firebase Functions en messages utilisateur clairs.
    if (error?.code === "functions/resource-exhausted") {
      throw new Error("Trop de signalements envoyés. Réessayez dans une minute.");
    }
    if (error?.code === "functions/not-found") {
      throw new Error("Le contenu signalé n'existe plus.");
    }
    if (error?.code === "functions/failed-precondition") {
      throw new Error(error.message || "Action impossible.");
    }
    if (error?.code === "functions/permission-denied") {
      throw new Error("Vous n'avez pas accès à cet enfant.");
    }
    throw error;
  }
}
