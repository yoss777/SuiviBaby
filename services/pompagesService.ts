import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  updateDoc
} from "firebase/firestore";
import { db } from "../firebase";

// ➕ Ajouter une session de pompage
export async function ajouterPompage(data: any) {
  try {
    const ref = await addDoc(collection(db, "pompages"), {
      ...data,
      createdAt: new Date(),
    });
    console.log("Session pompage tire-lait ajoutée avec l'ID :", ref.id);
    return ref;
  } catch (e) {
    console.error("Erreur lors de l'ajout :", e);
    throw e;
  }
}

// 📖 Obtenir une session de pompage par ID
export async function obtenirPompage(id: string) {
  try {
    const docRef = doc(db, "pompages", id);
    const docSnap = await getDoc(docRef);
    
    if (docSnap.exists()) {
      return { id: docSnap.id, ...docSnap.data() };
    } else {
      console.log("Aucune session de pompage trouvée avec cet ID");
      return null;
    }
  } catch (e) {
    console.error("Erreur lors de la récupération :", e);
    throw e;
  }
}

// 📖 Obtenir toutes les sessions de pompage (une seule fois)
export async function obtenirTousLesPompages() {
  try {
    const q = query(collection(db, "pompages"), orderBy("createdAt", "desc"));
    const querySnapshot = await getDocs(q);
    
    return querySnapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }));
  } catch (e) {
    console.error("Erreur lors de la récupération :", e);
    throw e;
  }
}

// 📖 Obtenir les sessions de pompage avec limite
export async function obtenirPompagesAvecLimite(nombreLimit: number) {
  try {
    const q = query(
      collection(db, "pompages"), 
      orderBy("createdAt", "desc"), 
      limit(nombreLimit)
    );
    const querySnapshot = await getDocs(q);
    
    return querySnapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }));
  } catch (e) {
    console.error("Erreur lors de la récupération :", e);
    throw e;
  }
}

// 🔄 Écouter en temps réel toutes les sessions tire-lait
export function ecouterPompages(callback: (docs: any[]) => void) {
  const q = query(collection(db, "pompages"), orderBy("createdAt", "desc"));

  const unsubscribe = onSnapshot(q, (snapshot) => {
    const liste = snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }));
    callback(liste);
  });

  return unsubscribe; // 🔥 permet d'arrêter l'écoute
}

// ✏️ Modifier une session de pompage
export async function modifierPompage(id: string, nouveausDonnees: any) {
  try {
    const docRef = doc(db, "pompages", id);
    await updateDoc(docRef, {
      ...nouveausDonnees,
      updatedAt: new Date(),
    });
    console.log("Session de pompage modifiée avec succès");
    return true;
  } catch (e) {
    console.error("Erreur lors de la modification :", e);
    throw e;
  }
}

// 🗑️ Supprimer une session de pompage
export async function supprimerPompage(id: string) {
  try {
    await deleteDoc(doc(db, "pompages", id));
    console.log("Session de pompage supprimée avec succès");
    return true;
  } catch (e) {
    console.error("Erreur lors de la suppression :", e);
    throw e;
  }
}