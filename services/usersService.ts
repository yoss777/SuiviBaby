// services/usersService.ts
import {
  doc,
  getDoc,
  onSnapshot,
  setDoc,
  updateDoc,
} from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { auth, db, functions } from "../config/firebase";
import { captureServiceError } from "@/utils/errorReporting";

// Interface pour le profil utilisateur
interface UserProfile {
  id: string;
  userName: string;
  email?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

const getUserId = () => {
  const user = auth.currentUser;
  if (!user) throw new Error("Utilisateur non connecté");
  return user.uid;
};

export async function getUserById(uid: string): Promise<UserProfile | null> {
  const userDoc = await getDoc(doc(db, "users", uid));
  if (!userDoc.exists()) {
    return null;
  }
  return userDoc.data() as UserProfile;
}

export async function getUserByEmail(
  email: string,
): Promise<UserProfile | null> {
  const findUser = httpsCallable<
    { email: string },
    { found: boolean; user: { id: string; userName: string } | null }
  >(functions, "findUserByEmail");

  const result = await findUser({ email: email.toLowerCase() });

  if (!result.data.found || !result.data.user) {
    return null;
  }

  return {
    id: result.data.user.id,
    userName: result.data.user.userName,
  } as UserProfile;
}

// Créer ou mettre à jour le profil utilisateur
export async function creerOuMettreAJourProfil(data: {
  userName: string;
  email?: string;
}) {
  try {
    const userId = getUserId();
    const userRef = doc(db, "users", userId);
    const publicRef = doc(db, "users_public", userId);

    await setDoc(
      userRef,
      {
        ...data,
        updatedAt: new Date(),
      },
      { merge: true },
    );
    await setDoc(
      publicRef,
      {
        userName: data.userName,
        updatedAt: new Date(),
      },
      { merge: true },
    );

    console.log("Profil utilisateur mis à jour");
    return true;
  } catch (e) {
    console.error("Erreur lors de la mise à jour du profil :", e);
    captureServiceError(e, { service: "users", operation: "creerOuMettreAJourProfil" });
    throw e;
  }
}

// Obtenir le profil utilisateur (une seule fois)
export async function obtenirProfil(): Promise<UserProfile | null> {
  try {
    const userId = getUserId();
    const docRef = doc(db, "users", userId);
    const docSnap = await getDoc(docRef);

    if (docSnap.exists()) {
      return { id: docSnap.id, ...docSnap.data() } as UserProfile;
    } else {
      console.log("Aucun profil trouvé pour cet utilisateur");
      return null;
    }
  } catch (e) {
    console.error("Erreur lors de la récupération du profil :", e);
    captureServiceError(e, { service: "users", operation: "obtenirProfil" });
    throw e;
  }
}

// Écouter en temps réel le profil utilisateur
export function ecouterProfil(callback: (data: UserProfile | null) => void) {
  const userId = getUserId();
  const userRef = doc(db, "users", userId);

  const unsubscribe = onSnapshot(userRef, (docSnapshot) => {
    if (docSnapshot.exists()) {
      callback({ id: docSnapshot.id, ...docSnapshot.data() } as UserProfile);
    } else {
      callback(null);
    }
  });

  return unsubscribe;
}

// Mettre à jour le nom d'utilisateur
export async function modifierNomUtilisateur(nouveauNom: string) {
  try {
    const userId = getUserId();
    const userRef = doc(db, "users", userId);
    const publicRef = doc(db, "users_public", userId);

    await updateDoc(userRef, {
      userName: nouveauNom.trim(),
      updatedAt: new Date(),
    });
    await updateDoc(publicRef, {
      userName: nouveauNom.trim(),
      updatedAt: new Date(),
    });

    console.log("Nom d'utilisateur modifié avec succès");
    return true;
  } catch (e) {
    console.error("Erreur lors de la modification du nom :", e);
    captureServiceError(e, { service: "users", operation: "modifierNomUtilisateur" });
    throw e;
  }
}

// Obtenir le nom d'utilisateur directement
export async function obtenirNomUtilisateur(): Promise<string | null> {
  try {
    const profil = await obtenirProfil();
    return profil?.userName || null;
  } catch (e) {
    console.error("Erreur lors de la récupération du nom d'utilisateur :", e);
    captureServiceError(e, { service: "users", operation: "obtenirNomUtilisateur" });
    return null;
  }
}
