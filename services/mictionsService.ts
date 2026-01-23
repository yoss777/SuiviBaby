// services/mictionsService.ts
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

export async function ajouterMiction(childId: string, data: any) {
  try {
    const userId = getUserId();
    const ref = await addDoc(collection(db, "mictions"), {
      ...data,
      childId,
      userId,
      createdAt: new Date(),
    });
    console.log("Miction ajoutée avec l'ID :", ref.id);
    return ref;
  } catch (e) {
    console.error("Erreur lors de l'ajout :", e);
    throw e;
  }
}

export async function obtenirMiction(childId: string, id: string) {
  try {
    const docRef = doc(db, "mictions", id);
    const docSnap = await getDoc(docRef);

    if (docSnap.exists() && docSnap.data().childId === childId) {
      return { id: docSnap.id, ...docSnap.data() };
    } else {
      console.log("Aucune miction trouvée avec cet ID ou accès refusé");
      return null;
    }
  } catch (e) {
    console.error("Erreur lors de la récupération :", e);
    throw e;
  }
}

export async function obtenirToutesLesMictions(childId: string) {
  try {
    const q = query(
      collection(db, "mictions"),
      where("childId", "==", childId),
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

export async function obtenirMictionsAvecLimite(childId: string, nombreLimit: number) {
  try {
    const q = query(
      collection(db, "mictions"),
      where("childId", "==", childId),
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

export function ecouterMictions(childId: string, callback: (docs: any[]) => void) {
  const q = query(
    collection(db, "mictions"),
    where("childId", "==", childId),
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

export async function modifierMiction(childId: string, id: string, nouveausDonnees: any) {
  try {
    const docRef = doc(db, "mictions", id);
    const docSnap = await getDoc(docRef);

    if (!docSnap.exists() || docSnap.data().childId !== childId) {
      throw new Error("Accès refusé");
    }

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

export async function supprimerMiction(childId: string, id: string) {
  try {
    const docRef = doc(db, "mictions", id);
    const docSnap = await getDoc(docRef);

    if (!docSnap.exists() || docSnap.data().childId !== childId) {
      throw new Error("Accès refusé");
    }

    await deleteDoc(docRef);
    console.log("Miction supprimée avec succès");
    return true;
  } catch (e) {
    console.error("Erreur lors de la suppression :", e);
    throw e;
  }
}
