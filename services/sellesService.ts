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

// ➕ Ajouter une selle
export async function ajouterSelle(data: any) {
  try {
    const ref = await addDoc(collection(db, "selles"), {
      ...data,
      createdAt: new Date(),
    });
    console.log("Selle ajoutée avec l'ID :", ref.id);
    return ref;
  } catch (e) {
    console.error("Erreur lors de l'ajout :", e);
    throw e;
  }
}

// 📖 Obtenir une selle par ID
export async function obtenirSelle(id: string) {
  try {
    const docRef = doc(db, "selles", id);
    const docSnap = await getDoc(docRef);
    
    if (docSnap.exists()) {
      return { id: docSnap.id, ...docSnap.data() };
    } else {
      console.log("Aucune selle trouvée avec cet ID");
      return null;
    }
  } catch (e) {
    console.error("Erreur lors de la récupération :", e);
    throw e;
  }
}

// 📖 Obtenir toutes les selles (une seule fois)
export async function obtenirToutesLesSelles() {
  try {
    const q = query(collection(db, "selles"), orderBy("createdAt", "desc"));
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

// 📖 Obtenir les selles avec limite
export async function obtenirSellesAvecLimite(nombreLimit: number) {
  try {
    const q = query(
      collection(db, "selles"), 
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

// 🔄 Écouter en temps réel toutes les selles
export function ecouterSelles(callback: (docs: any[]) => void) {
  const q = query(collection(db, "selles"), orderBy("createdAt", "desc"));

  const unsubscribe = onSnapshot(q, (snapshot) => {
    const liste = snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }));
    callback(liste);
  });

  return unsubscribe; // 🔥 permet d'arrêter l'écoute
}

// ✏️ Modifier une selle
export async function modifierSelle(id: string, nouveausDonnees: any) {
  try {
    const docRef = doc(db, "selles", id);
    await updateDoc(docRef, {
      ...nouveausDonnees,
      updatedAt: new Date(),
    });
    console.log("Selle modifiée avec succès");
    return true;
  } catch (e) {
    console.error("Erreur lors de la modification :", e);
    throw e;
  }
}

// 🗑️ Supprimer une selle
export async function supprimerSelle(id: string) {
  try {
    await deleteDoc(doc(db, "selles", id));
    console.log("Selle supprimée avec succès");
    return true;
  } catch (e) {
    console.error("Erreur lors de la suppression :", e);
    throw e;
  }
}