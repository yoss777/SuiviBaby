// services/teteesService.ts
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
  if (!user) {
    throw new Error("Utilisateur non connecté");
  }
  return user.uid;
};

export async function ajouterTetee(childId: string, data: any) {
  try {
    const userId = getUserId();
    const ref = await addDoc(collection(db, "tetees"), {
      ...data,
      childId,
      userId,
      createdAt: new Date(),
    });
    console.log("Tétée ajoutée avec l'ID :", ref.id);
    return ref;
  } catch (e) {
    console.error("Erreur lors de l'ajout :", e);
    throw e;
  }
}

export async function obtenirTetee(childId: string, id: string) {
  try {
    const userId = getUserId();
    const docRef = doc(db, "tetees", id);
    const docSnap = await getDoc(docRef);

    if (docSnap.exists() && docSnap.data().userId === userId && docSnap.data().childId === childId) {
      return { id: docSnap.id, ...docSnap.data() };
    } else {
      console.log("Aucune tétée trouvée avec cet ID ou accès refusé");
      return null;
    }
  } catch (e) {
    console.error("Erreur lors de la récupération :", e);
    throw e;
  }
}

export async function obtenirToutesLesTetees(childId: string) {
  try {
    const userId = getUserId();
    const q = query(
      collection(db, "tetees"),
      where("userId", "==", userId),
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

export async function obtenirTeteesAvecLimite(childId: string, nombreLimit: number) {
  try {
    const userId = getUserId();
    const q = query(
      collection(db, "tetees"),
      where("userId", "==", userId),
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

export function ecouterTetees(childId: string, callback: (docs: any[]) => void) {
  const userId = getUserId();
  const q = query(
    collection(db, "tetees"),
    where("userId", "==", userId),
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

export async function modifierTetee(childId: string, id: string, nouveausDonnees: any) {
  try {
    const userId = getUserId();
    const docRef = doc(db, "tetees", id);
    const docSnap = await getDoc(docRef);

    if (!docSnap.exists() || docSnap.data().userId !== userId || docSnap.data().childId !== childId) {
      throw new Error("Accès refusé");
    }

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

export async function supprimerTetee(childId: string, id: string) {
  try {
    const userId = getUserId();
    const docRef = doc(db, "tetees", id);
    const docSnap = await getDoc(docRef);

    if (!docSnap.exists() || docSnap.data().userId !== userId || docSnap.data().childId !== childId) {
      throw new Error("Accès refusé");
    }

    await deleteDoc(docRef);
    console.log("Tétée supprimée avec succès");
    return true;
  } catch (e) {
    console.error("Erreur lors de la suppression :", e);
    throw e;
  }
}