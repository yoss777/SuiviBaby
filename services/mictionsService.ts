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

// ➕ Ajouter une miction
export async function ajouterMiction(data: any) {
  try {
    const ref = await addDoc(collection(db, "mictions"), {
      ...data,
      createdAt: new Date(),
    });
    console.log("Miction ajoutée avec l'ID :", ref.id);
    return ref;
  } catch (e) {
    console.error("Erreur lors de l'ajout :", e);
    throw e;
  }
}

// 📖 Obtenir une miction par ID
export async function obtenirMiction(id: string) {
  try {
    const docRef = doc(db, "mictions", id);
    const docSnap = await getDoc(docRef);
    
    if (docSnap.exists()) {
      return { id: docSnap.id, ...docSnap.data() };
    } else {
      console.log("Aucune miction trouvée avec cet ID");
      return null;
    }
  } catch (e) {
    console.error("Erreur lors de la récupération :", e);
    throw e;
  }
}

// 📖 Obtenir toutes les mictions (une seule fois)
export async function obtenirToutesLesMictions() {
  try {
    const q = query(collection(db, "mictions"), orderBy("createdAt", "desc"));
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

// 📖 Obtenir les mictions avec limite
export async function obtenirMictionsAvecLimite(nombreLimit: number) {
  try {
    const q = query(
      collection(db, "mictions"), 
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

// 🔄 Écouter en temps réel toutes les mictions
export function ecouterMictions(callback: (docs: any[]) => void) {
  const q = query(collection(db, "mictions"), orderBy("createdAt", "desc"));

  const unsubscribe = onSnapshot(q, (snapshot) => {
    const liste = snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }));
    callback(liste);
  });

  return unsubscribe; // 🔥 permet d'arrêter l'écoute
}

// ✏️ Modifier une miction
export async function modifierMiction(id: string, nouveausDonnees: any) {
  try {
    const docRef = doc(db, "mictions", id);
    await updateDoc(docRef, {
      ...nouveausDonnees,
      updatedAt: new Date(),
    });
    console.log("Miction modifiée avec succès");
    return true;
  } catch (e) {
    console.error("Erreur lors de la modification :", e);
    throw e;
  }
}

// 🗑️ Supprimer une miction
export async function supprimerMiction(id: string) {
  try {
    await deleteDoc(doc(db, "mictions", id));
    console.log("Miction supprimée avec succès");
    return true;
  } catch (e) {
    console.error("Erreur lors de la suppression :", e);
    throw e;
  }
}