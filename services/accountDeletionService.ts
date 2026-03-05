import { auth, functions } from "@/config/firebase";
import {
  EmailAuthProvider,
  reauthenticateWithCredential,
} from "firebase/auth";
import { httpsCallable } from "firebase/functions";

/**
 * Supprime le compte utilisateur et toutes ses données via Cloud Function.
 * La ré-authentification est requise côté client avant l'appel serveur.
 */
export async function deleteAccountAndData(password: string) {
  const user = auth.currentUser;
  if (!user || !user.email) {
    throw new Error("Utilisateur non authentifié.");
  }

  // Ré-authentification client (requise par Firebase avant opérations sensibles)
  const credential = EmailAuthProvider.credential(user.email, password);
  await reauthenticateWithCredential(user, credential);

  // Appel Cloud Function — supprime toutes les données + Auth user côté serveur
  const deleteAccount = httpsCallable<void, { success: boolean }>(
    functions,
    "deleteUserAccount"
  );

  await deleteAccount();
}
