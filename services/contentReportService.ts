import { auth, db } from "@/config/firebase";
import { addDoc, collection, serverTimestamp } from "firebase/firestore";
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

  await addDoc(collection(db, "reports"), {
    reporterUserId: user.uid,
    childId,
    eventId: eventId ?? null,
    photoPath: photoRef ? extractStoragePath(photoRef) ?? photoRef : null,
    reason,
    message: message?.trim() ? message.trim() : null,
    status: "open",
    createdAt: serverTimestamp(),
  });
}
