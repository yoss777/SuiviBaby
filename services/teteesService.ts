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

// ➕ Ajouter une tétée
export async function ajouterTetee(data: any) {
  try {
    const ref = await addDoc(collection(db, "tetees"), {
      ...data,
      createdAt: new Date(),
    });
    console.log("Tétée ajoutée avec l'ID :", ref.id);
    return ref;
  } catch (e) {
    console.error("Erreur lors de l'ajout :", e);
    throw e;
  }
}

// 📖 Obtenir une tétée par ID
export async function obtenirTetee(id: string) {
  try {
    const docRef = doc(db, "tetees", id);
    const docSnap = await getDoc(docRef);
    
    if (docSnap.exists()) {
      return { id: docSnap.id, ...docSnap.data() };
    } else {
      console.log("Aucune tétée trouvée avec cet ID");
      return null;
    }
  } catch (e) {
    console.error("Erreur lors de la récupération :", e);
    throw e;
  }
}

// 📖 Obtenir toutes les tétées (une seule fois)
export async function obtenirToutesLesTetees() {
  try {
    const q = query(collection(db, "tetees"), orderBy("createdAt", "desc"));
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

// 📖 Obtenir les tétées avec limite
export async function obtenirTeteesAvecLimite(nombreLimit: number) {
  try {
    const q = query(
      collection(db, "tetees"), 
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

// 🔄 Écouter en temps réel toutes les tétées
export function ecouterTetees(callback: (docs: any[]) => void) {
  const q = query(collection(db, "tetees"), orderBy("createdAt", "desc"));

  const unsubscribe = onSnapshot(q, (snapshot) => {
    const liste = snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }));
    callback(liste);
  });

  return unsubscribe; // 🔥 permet d'arrêter l'écoute
}

// ✏️ Modifier une tétée
export async function modifierTetee(id: string, nouveausDonnees: any) {
  try {
    const docRef = doc(db, "tetees", id);
    await updateDoc(docRef, {
      ...nouveausDonnees,
      updatedAt: new Date(),
    });
    console.log("Tétée modifiée avec succès");
    return true;
  } catch (e) {
    console.error("Erreur lors de la modification :", e);
    throw e;
  }
}

// 🗑️ Supprimer une tétée
export async function supprimerTetee(id: string) {
  try {
    await deleteDoc(doc(db, "tetees", id));
    console.log("Tétée supprimée avec succès");
    return true;
  } catch (e) {
    console.error("Erreur lors de la suppression :", e);
    throw e;
  }
}