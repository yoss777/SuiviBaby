// services/vitaminesService.ts
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
  updateDoc,
  where
} from "firebase/firestore";
import { auth, db } from "../config/firebase";

const getUserId = () => {
  const user = auth.currentUser;
  if (!user) throw new Error("Utilisateur non connecté");
  return user.uid;
};

export async function ajouterVitamine(data: any) {
  try {
    const userId = getUserId();
    const ref = await addDoc(collection(db, "vitamines"), {
      ...data,
      userId,
      createdAt: new Date(),
    });
    console.log("Prise de Vitamines ajoutée avec l'ID :", ref.id);
    return ref;
  } catch (e) {
    console.error("Erreur lors de l'ajout :", e);
    throw e;
  }
}

export async function obtenirVitamine(id: string) {
  try {
    const userId = getUserId();
    const docRef = doc(db, "vitamines", id);
    const docSnap = await getDoc(docRef);
    
    if (docSnap.exists() && docSnap.data().userId === userId) {
      return { id: docSnap.id, ...docSnap.data() };
    } else {
      console.log("Aucune prise de vitamines trouvée avec cet ID ou accès refusé");
      return null;
    }
  } catch (e) {
    console.error("Erreur lors de la récupération :", e);
    throw e;
  }
}

export async function obtenirToutesLesVitamines() {
  try {
    const userId = getUserId();
    const q = query(
      collection(db, "vitamines"),
      where("userId", "==", userId),
      orderBy("createdAt", "desc")
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

export async function obtenirVitaminesAvecLimite(nombreLimit: number) {
  try {
    const userId = getUserId();
    const q = query(
      collection(db, "vitamines"),
      where("userId", "==", userId),
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

export function ecouterVitamines(callback: (docs: any[]) => void) {
  const userId = getUserId();
  const q = query(
    collection(db, "vitamines"),
    where("userId", "==", userId),
    orderBy("createdAt", "desc")
  );

  const unsubscribe = onSnapshot(q, (snapshot) => {
    const liste = snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }));
    callback(liste);
  });

  return unsubscribe;
}

export async function modifierVitamine(id: string, nouveausDonnees: any) {
  try {
    const userId = getUserId();
    const docRef = doc(db, "vitamines", id);
    const docSnap = await getDoc(docRef);
    
    if (!docSnap.exists() || docSnap.data().userId !== userId) {
      throw new Error("Accès refusé");
    }
    
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

export async function supprimerVitamine(id: string) {
  try {
    const userId = getUserId();
    const docRef = doc(db, "vitamines", id);
    const docSnap = await getDoc(docRef);
    
    if (!docSnap.exists() || docSnap.data().userId !== userId) {
      throw new Error("Accès refusé");
    }
    
    await deleteDoc(docRef);
    console.log("Prise de vitamines supprimée avec succès");
    return true;
  } catch (e) {
    console.error("Erreur lors de la suppression :", e);
    throw e;
  }
}