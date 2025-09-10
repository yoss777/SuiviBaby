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

// ➕ Ajouter une prise de Vitamine
export async function ajouterVitamine(data: any) {
  try {
    const ref = await addDoc(collection(db, "vitamines"), {
      ...data,
      createdAt: new Date(),
    });
    console.log("Prise de Vitamines ajoutée avec l'ID :", ref.id);
    return ref;
  } catch (e) {
    console.error("Erreur lors de l'ajout :", e);
    throw e;
  }
}

// 📖 Obtenir une prise de Vitamine par ID
export async function obtenirVitamine(id: string) {
  try {
    const docRef = doc(db, "vitamines", id);
    const docSnap = await getDoc(docRef);
    
    if (docSnap.exists()) {
      return { id: docSnap.id, ...docSnap.data() };
    } else {
      console.log("Aucune prise de vitamines trouvée avec cet ID");
      return null;
    }
  } catch (e) {
    console.error("Erreur lors de la récupération :", e);
    throw e;
  }
}

// 📖 Obtenir toutes les vitamines (une seule fois)
export async function obtenirToutesLesVitamines() {
  try {
    const q = query(collection(db, "vitamines"), orderBy("createdAt", "desc"));
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

// 📖 Obtenir les prises de vitamines avec limite
export async function obtenirVitaminesAvecLimite(nombreLimit: number) {
  try {
    const q = query(
      collection(db, "vitamines"), 
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

// 🔄 Écouter en temps réel toutes les prises de vitamines
export function ecouterVitamines(callback: (docs: any[]) => void) {
  const q = query(collection(db, "vitamines"), orderBy("createdAt", "desc"));

  const unsubscribe = onSnapshot(q, (snapshot) => {
    const liste = snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }));
    callback(liste);
  });

  return unsubscribe; // 🔥 permet d'arrêter l'écoute
}

// ✏️ Modifier une prise de vitamines
export async function modifierVitamine(id: string, nouveausDonnees: any) {
  try {
    const docRef = doc(db, "vitamines", id);
    await updateDoc(docRef, {
      ...nouveausDonnees,
      updatedAt: new Date(),
    });
    console.log("Prise de vitamines modifiée avec succès");
    return true;
  } catch (e) {
    console.error("Erreur lors de la modification :", e);
    throw e;
  }
}

// 🗑️ Supprimer une prise de vitamines
export async function supprimerVitamine(id: string) {
  try {
    await deleteDoc(doc(db, "vitamines", id));
    console.log("Prise de vitamines supprimée avec succès");
    return true;
  } catch (e) {
    console.error("Erreur lors de la suppression :", e);
    throw e;
  }
}