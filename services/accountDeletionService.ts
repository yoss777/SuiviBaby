import { auth, db, functions } from "@/config/firebase";
import type { User } from "@/types/user";
import {
  EmailAuthProvider,
  reauthenticateWithCredential,
} from "firebase/auth";
import { doc, getDoc, deleteField, updateDoc } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";

const GRACE_PERIOD_DAYS = 30;

export type PendingDeletionInfo = NonNullable<User["pendingDeletion"]>;

export function getPendingDeletionInfo(
  user: Pick<User, "pendingDeletion"> | null | undefined,
): PendingDeletionInfo | null {
  return user?.pendingDeletion ?? null;
}

export function hasPendingDeletion(
  user: Pick<User, "pendingDeletion"> | null | undefined,
): boolean {
  return !!getPendingDeletionInfo(user)?.deletionDate;
}

export function getPendingDeletionDateFromUser(
  user: Pick<User, "pendingDeletion"> | null | undefined,
): string | null {
  return getPendingDeletionInfo(user)?.deletionDate ?? null;
}

export function formatPendingDeletionDate(
  deletionDate: string | null | undefined,
  locale = "fr-FR",
): string {
  if (!deletionDate) return "";
  const parsedDate = new Date(deletionDate);
  if (Number.isNaN(parsedDate.getTime())) return deletionDate;

  return parsedDate.toLocaleDateString(locale, {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

/**
 * Demande la suppression du compte avec délai de grâce de 30 jours.
 * Le compte est marqué `pendingDeletion` — la suppression effective est déléguée
 * à une Cloud Function schedulée qui traite les comptes expirés.
 * L'utilisateur peut annuler pendant le délai via `cancelAccountDeletion()`.
 */
export async function requestAccountDeletion(
  password: string,
): Promise<PendingDeletionInfo> {
  const user = auth.currentUser;
  if (!user || !user.email) {
    throw new Error("Utilisateur non authentifié.");
  }

  // Ré-authentification client (requise par Firebase avant opérations sensibles)
  const credential = EmailAuthProvider.credential(user.email, password);
  await reauthenticateWithCredential(user, credential);

  // Marquer le compte pour suppression différée
  const scheduledAt = new Date();
  const deletionDate = new Date(scheduledAt);
  deletionDate.setDate(deletionDate.getDate() + GRACE_PERIOD_DAYS);
  const pendingDeletion: PendingDeletionInfo = {
    scheduledAt: scheduledAt.toISOString(),
    deletionDate: deletionDate.toISOString(),
  };

  await updateDoc(doc(db, "users", user.uid), {
    pendingDeletion,
  });

  return pendingDeletion;
}

/**
 * Annule une demande de suppression de compte en cours.
 */
export async function cancelAccountDeletion() {
  const user = auth.currentUser;
  if (!user) {
    throw new Error("Utilisateur non authentifié.");
  }

  await updateDoc(doc(db, "users", user.uid), {
    pendingDeletion: deleteField(),
  });
}

/**
 * Vérifie si le compte a une suppression programmée.
 * Retourne la date de suppression ou null.
 */
export async function getPendingDeletionDate(): Promise<string | null> {
  const user = auth.currentUser;
  if (!user) return null;

  const userDoc = await getDoc(doc(db, "users", user.uid));
  const data = userDoc.data();
  return data?.pendingDeletion?.deletionDate ?? null;
}

/**
 * Suppression immédiate (fallback legacy / admin).
 * Appelle directement la Cloud Function — supprime tout sans délai de grâce.
 */
export async function deleteAccountImmediately(password: string) {
  const user = auth.currentUser;
  if (!user || !user.email) {
    throw new Error("Utilisateur non authentifié.");
  }

  const credential = EmailAuthProvider.credential(user.email, password);
  await reauthenticateWithCredential(user, credential);

  const deleteAccount = httpsCallable<void, { success: boolean }>(
    functions,
    "deleteUserAccount"
  );

  await deleteAccount();
}
