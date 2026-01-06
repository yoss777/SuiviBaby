// services/userPreferencesService.ts
import { arrayRemove, arrayUnion, doc, getDoc, setDoc, updateDoc } from "firebase/firestore";
import { auth, db } from "../config/firebase";

const getUserId = () => {
  const user = auth.currentUser;
  if (!user) throw new Error("Utilisateur non connecté");
  return user.uid;
};

interface UserPreferences {
  hiddenChildrenIds: string[];
}

/**
 * Récupère les préférences de l'utilisateur
 */
export async function obtenirPreferences(): Promise<UserPreferences> {
  try {
    const userId = getUserId();
    const docRef = doc(db, "user_preferences", userId);
    const docSnap = await getDoc(docRef);

    if (docSnap.exists()) {
      return docSnap.data() as UserPreferences;
    } else {
      // Si le document n'existe pas, le créer avec des valeurs par défaut
      const defaultPrefs: UserPreferences = {
        hiddenChildrenIds: [],
      };
      await setDoc(docRef, defaultPrefs);
      return defaultPrefs;
    }
  } catch (e) {
    console.error("Erreur lors de la récupération des préférences:", e);
    throw e;
  }
}

/**
 * Masque un enfant de la liste de suivi
 */
export async function masquerEnfant(childId: string) {
  try {
    const userId = getUserId();
    const docRef = doc(db, "user_preferences", userId);

    // Vérifier si le document existe
    const docSnap = await getDoc(docRef);

    if (docSnap.exists()) {
      // Ajouter l'enfant à la liste des masqués
      await updateDoc(docRef, {
        hiddenChildrenIds: arrayUnion(childId),
      });
    } else {
      // Créer le document avec l'enfant masqué
      await setDoc(docRef, {
        hiddenChildrenIds: [childId],
      });
    }

    console.log("Enfant masqué avec succès");
    return true;
  } catch (e) {
    console.error("Erreur lors du masquage de l'enfant:", e);
    throw e;
  }
}

/**
 * Affiche à nouveau un enfant dans la liste de suivi
 */
export async function afficherEnfant(childId: string) {
  try {
    const userId = getUserId();
    const docRef = doc(db, "user_preferences", userId);

    // Retirer l'enfant de la liste des masqués
    await updateDoc(docRef, {
      hiddenChildrenIds: arrayRemove(childId),
    });

    console.log("Enfant affiché avec succès");
    return true;
  } catch (e) {
    console.error("Erreur lors de l'affichage de l'enfant:", e);
    throw e;
  }
}
