// services/croissanceService.ts
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
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

export async function ajouterCroissance(childId: string, data: any) {
  try {
    const userId = getUserId();
    const ref = await addDoc(collection(db, "croissances"), {
      ...data,
      childId,
      userId,
      createdAt: new Date(),
    });
    console.log("Croissance ajoutée avec l'ID :", ref.id);
    return ref;
  } catch (e) {
    console.error("Erreur lors de l'ajout :", e);
    throw e;
  }
}

export async function obtenirCroissance(childId: string, id: string) {
  try {
    const docRef = doc(db, "croissances", id);
    const docSnap = await getDoc(docRef);

    if (docSnap.exists() && docSnap.data().childId === childId) {
      return { id: docSnap.id, ...docSnap.data() };
    }
    console.log("Aucune croissance trouvée avec cet ID ou accès refusé");
    return null;
  } catch (e) {
    console.error("Erreur lors de la récupération :", e);
    throw e;
  }
}

export async function obtenirToutesLesCroissances(childId: string) {
  try {
    const q = query(
      collection(db, "croissances"),
      where("childId", "==", childId),
      orderBy("date", "desc"),
    );
    const querySnapshot = await getDocs(q);

    return querySnapshot.docs.map((docSnap) => ({
      id: docSnap.id,
      ...docSnap.data(),
    }));
  } catch (e) {
    console.error("Erreur lors de la récupération :", e);
    throw e;
  }
}

export function ecouterCroissances(
  childId: string,
  callback: (docs: any[]) => void
) {
  const q = query(
    collection(db, "croissances"),
    where("childId", "==", childId),
    orderBy("date", "desc"),
  );

  const unsubscribe = onSnapshot(q, (snapshot) => {
    const liste = snapshot.docs.map((docSnap) => ({
      id: docSnap.id,
      ...docSnap.data(),
    }));
    callback(liste);
  });

  return unsubscribe;
}

export async function modifierCroissance(
  childId: string,
  id: string,
  nouvellesDonnees: any
) {
  try {
    const docRef = doc(db, "croissances", id);
    const docSnap = await getDoc(docRef);

    if (
      !docSnap.exists() ||
      docSnap.data().childId !== childId
    ) {
      throw new Error("Accès refusé");
    }

    await updateDoc(docRef, {
      ...nouvellesDonnees,
      updatedAt: new Date(),
    });
    console.log("Croissance modifiée avec succès");
    return true;
  } catch (e) {
    console.error("Erreur lors de la modification :", e);
    throw e;
  }
}

export async function supprimerCroissance(childId: string, id: string) {
  try {
    const docRef = doc(db, "croissances", id);
    const docSnap = await getDoc(docRef);

    if (
      !docSnap.exists() ||
      docSnap.data().childId !== childId
    ) {
      throw new Error("Accès refusé");
    }

    await deleteDoc(docRef);
    console.log("Croissance supprimée avec succès");
    return true;
  } catch (e) {
    console.error("Erreur lors de la suppression :", e);
    throw e;
  }
}
