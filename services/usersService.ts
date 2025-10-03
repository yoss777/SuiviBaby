// services/usersService.ts
import {
    doc,
    getDoc,
    onSnapshot,
    setDoc,
    updateDoc,
} from "firebase/firestore";
import { auth, db } from "../config/firebase";

// Interface pour le profil utilisateur
interface UserProfile {
  id: string;
  babyName: string;
  email?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

const getUserId = () => {
  const user = auth.currentUser;
  if (!user) throw new Error("Utilisateur non connecté");
  return user.uid;
};

// Créer ou mettre à jour le profil utilisateur
export async function creerOuMettreAJourProfil(data: {
  babyName: string;
  email?: string;
}) {
  try {
    const userId = getUserId();
    const userRef = doc(db, "users", userId);
    
    await setDoc(userRef, {
      ...data,
      updatedAt: new Date(),
    }, { merge: true });
    
    console.log("Profil utilisateur mis à jour");
    return true;
  } catch (e) {
    console.error("Erreur lors de la mise à jour du profil :", e);
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

// Mettre à jour uniquement le nom du bébé
export async function modifierNomBebe(nouveauNom: string) {
  try {
    const userId = getUserId();
    const userRef = doc(db, "users", userId);
    
    await updateDoc(userRef, {
      babyName: nouveauNom.trim(),
      updatedAt: new Date(),
    });
    
    console.log("Nom du bébé modifié avec succès");
    return true;
  } catch (e) {
    console.error("Erreur lors de la modification du nom :", e);
    throw e;
  }
}

// Obtenir le nom du bébé directement
export async function obtenirNomBebe(): Promise<string | null> {
  try {
    const profil = await obtenirProfil();
    return profil?.babyName || null;
  } catch (e) {
    console.error("Erreur lors de la récupération du nom du bébé :", e);
    return null;
  }
}