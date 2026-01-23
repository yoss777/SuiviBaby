// services/pompagesService.ts
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

export async function ajouterPompage(childId: string, data: any) {
  try {
    const userId = getUserId();
    const ref = await addDoc(collection(db, "pompages"), {
      ...data,
      childId,
      userId,
      createdAt: new Date(),
    });
    console.log("Session pompage tire-lait ajoutée avec l'ID :", ref.id);
    return ref;
  } catch (e) {
    console.error("Erreur lors de l'ajout :", e);
    throw e;
  }
}

export async function obtenirPompage(childId: string, id: string) {
  try {
    const docRef = doc(db, "pompages", id);
    const docSnap = await getDoc(docRef);

    if (docSnap.exists() && docSnap.data().childId === childId) {
      return { id: docSnap.id, ...docSnap.data() };
    } else {
      console.log("Aucune session de pompage trouvée avec cet ID ou accès refusé");
      return null;
    }
  } catch (e) {
    console.error("Erreur lors de la récupération :", e);
    throw e;
  }
}

export async function obtenirTousLesPompages(childId: string) {
  try {
    const q = query(
      collection(db, "pompages"),
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

export async function obtenirPompagesAvecLimite(childId: string, nombreLimit: number) {
  try {
    const q = query(
      collection(db, "pompages"),
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

export function ecouterPompages(childId: string, callback: (docs: any[]) => void) {
  const q = query(
    collection(db, "pompages"),
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

export async function modifierPompage(childId: string, id: string, nouveausDonnees: any) {
  try {
    const docRef = doc(db, "pompages", id);
    const docSnap = await getDoc(docRef);

    if (!docSnap.exists() || docSnap.data().childId !== childId) {
      throw new Error("Accès refusé");
    }

    await updateDoc(docRef, {
      ...nouveausDonnees,
      updatedAt: new Date(),
    });
    console.log("Session de pompage modifiée avec succès");
    return true;
  } catch (e) {
    console.error("Erreur lors de la modification :", e);
    throw e;
  }
}

export async function supprimerPompage(childId: string, id: string) {
  try {
    const docRef = doc(db, "pompages", id);
    const docSnap = await getDoc(docRef);

    if (!docSnap.exists() || docSnap.data().childId !== childId) {
      throw new Error("Accès refusé");
    }

    await deleteDoc(docRef);
    console.log("Session de pompage supprimée avec succès");
    return true;
  } catch (e) {
    console.error("Erreur lors de la suppression :", e);
    throw e;
  }
}
