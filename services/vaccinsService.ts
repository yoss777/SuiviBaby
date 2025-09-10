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

// ➕ Ajouter une prise de vaccin
export async function ajouterVaccin(data: any) {
  try {
    const ref = await addDoc(collection(db, "vaccins"), {
      ...data,
      createdAt: new Date(),
    });
    console.log("Prise de Vaccins ajoutée avec l'ID :", ref.id);
    return ref;
  } catch (e) {
    console.error("Erreur lors de l'ajout :", e);
    throw e;
  }
}

// 📖 Obtenir une prise de Vaccin par ID
export async function obtenirVaccin(id: string) {
  try {
    const docRef = doc(db, "vaccins", id);
    const docSnap = await getDoc(docRef);
    
    if (docSnap.exists()) {
      return { id: docSnap.id, ...docSnap.data() };
    } else {
      console.log("Aucune prise de vaccins trouvée avec cet ID");
      return null;
    }
  } catch (e) {
    console.error("Erreur lors de la récupération :", e);
    throw e;
  }
}

// 📖 Obtenir toutes les vaccins (une seule fois)
export async function obtenirToutesLesVaccins() {
  try {
    const q = query(collection(db, "vaccins"), orderBy("createdAt", "desc"));
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

// 📖 Obtenir les prises de vaccins avec limite
export async function obtenirVaccinsAvecLimite(nombreLimit: number) {
  try {
    const q = query(
      collection(db, "vaccins"), 
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

// 🔄 Écouter en temps réel toutes les prises de vaccins
export function ecouterVaccins(callback: (docs: any[]) => void) {
  const q = query(collection(db, "vaccins"), orderBy("createdAt", "desc"));

  const unsubscribe = onSnapshot(q, (snapshot) => {
    const liste = snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }));
    callback(liste);
  });

  return unsubscribe; // 🔥 permet d'arrêter l'écoute
}

// ✏️ Modifier une prise de vaccins
export async function modifierVaccin(id: string, nouveausDonnees: any) {
  try {
    const docRef = doc(db, "vaccins", id);
    await updateDoc(docRef, {
      ...nouveausDonnees,
      updatedAt: new Date(),
    });
    console.log("Prise de vaccins modifiée avec succès");
    return true;
  } catch (e) {
    console.error("Erreur lors de la modification :", e);
    throw e;
  }
}

// 🗑️ Supprimer une prise de vaccins
export async function supprimerVaccin(id: string) {
  try {
    await deleteDoc(doc(db, "vaccins", id));
    console.log("Prise de vaccins supprimée avec succès");
    return true;
  } catch (e) {
    console.error("Erreur lors de la suppression :", e);
    throw e;
  }
}