// services/sommeilService.ts
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
  where,
} from "firebase/firestore";
import { auth, db } from "../config/firebase";

const getUserId = () => {
  const user = auth.currentUser;
  if (!user) throw new Error("Utilisateur non connecté");
  return user.uid;
};

export async function ajouterSommeil(childId: string, data: any) {
  try {
    const userId = getUserId();
    const ref = await addDoc(collection(db, "sommeils"), {
      ...data,
      childId,
      userId,
      createdAt: new Date(),
    });
    console.log("Sommeil ajouté avec l'ID :", ref.id);
    return ref;
  } catch (e) {
    console.error("Erreur lors de l'ajout :", e);
    throw e;
  }
}

export async function obtenirSommeil(childId: string, id: string) {
  try {
    const docRef = doc(db, "sommeils", id);
    const docSnap = await getDoc(docRef);

    if (docSnap.exists() && docSnap.data().childId === childId) {
      return { id: docSnap.id, ...docSnap.data() };
    }
    console.log("Aucun sommeil trouvé avec cet ID ou accès refusé");
    return null;
  } catch (e) {
    console.error("Erreur lors de la récupération :", e);
    throw e;
  }
}

export async function obtenirTousLesSommeils(childId: string) {
  try {
    const q = query(
      collection(db, "sommeils"),
      where("childId", "==", childId),
      orderBy("createdAt", "desc"),
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

export async function obtenirSommeilsAvecLimite(
  childId: string,
  nombreLimit: number,
) {
  try {
    const q = query(
      collection(db, "sommeils"),
      where("childId", "==", childId),
      orderBy("createdAt", "desc"),
      limit(nombreLimit),
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

export function ecouterSommeils(
  childId: string,
  callback: (docs: any[]) => void,
) {
  const q = query(
    collection(db, "sommeils"),
    where("childId", "==", childId),
    orderBy("createdAt", "desc"),
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

export async function modifierSommeil(
  childId: string,
  id: string,
  nouvellesDonnees: any,
) {
  try {
    const docRef = doc(db, "sommeils", id);
    const docSnap = await getDoc(docRef);

    if (!docSnap.exists() || docSnap.data().childId !== childId) {
      throw new Error("Accès refusé");
    }

    await updateDoc(docRef, {
      ...nouvellesDonnees,
      updatedAt: new Date(),
    });
    console.log("Sommeil modifié avec succès");
    return true;
  } catch (e) {
    console.error("Erreur lors de la modification :", e);
    throw e;
  }
}

export async function supprimerSommeil(childId: string, id: string) {
  try {
    const docRef = doc(db, "sommeils", id);
    const docSnap = await getDoc(docRef);

    if (!docSnap.exists() || docSnap.data().childId !== childId) {
      throw new Error("Accès refusé");
    }

    await deleteDoc(docRef);
    console.log("Sommeil supprimé avec succès");
    return true;
  } catch (e) {
    console.error("Erreur lors de la suppression :", e);
    throw e;
  }
}
