// services/vaccinsService.ts
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
import { captureServiceError } from "@/utils/errorReporting";

const getUserId = () => {
  const user = auth.currentUser;
  if (!user) throw new Error("Utilisateur non connecté");
  return user.uid;
};

export async function ajouterVaccin(childId: string, data: Record<string, unknown>) {
  try {
    const userId = getUserId();
    const ref = await addDoc(collection(db, "vaccins"), {
      ...data,
      childId,
      userId,
      createdAt: new Date(),
    });
    console.log("Prise de Vaccins ajoutée avec l'ID :", ref.id);
    return ref;
  } catch (e) {
    console.error("Erreur lors de l'ajout :", e);
    captureServiceError(e, { service: "vaccins", operation: "ajouterVaccin" });
    throw e;
  }
}

export async function obtenirVaccin(childId: string, id: string) {
  try {
    const docRef = doc(db, "vaccins", id);
    const docSnap = await getDoc(docRef);

    if (docSnap.exists() && docSnap.data().childId === childId) {
      return { id: docSnap.id, ...docSnap.data() };
    } else {
      console.log("Aucune prise de vaccins trouvée avec cet ID ou accès refusé");
      return null;
    }
  } catch (e) {
    console.error("Erreur lors de la récupération :", e);
    captureServiceError(e, { service: "vaccins", operation: "obtenirVaccin" });
    throw e;
  }
}

export async function obtenirToutesLesVaccins(childId: string) {
  try {
    const q = query(
      collection(db, "vaccins"),
      where("childId", "==", childId),
      orderBy("date", "desc")
    );
    const querySnapshot = await getDocs(q);

    return querySnapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }));
  } catch (e) {
    console.error("Erreur lors de la récupération :", e);
    captureServiceError(e, { service: "vaccins", operation: "obtenirToutesLesVaccins" });
    throw e;
  }
}

export async function obtenirVaccinsAvecLimite(childId: string, nombreLimit: number) {
  try {
    const q = query(
      collection(db, "vaccins"),
      where("childId", "==", childId),
      orderBy("date", "desc"),
      limit(nombreLimit)
    );
    const querySnapshot = await getDocs(q);

    return querySnapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }));
  } catch (e) {
    console.error("Erreur lors de la récupération :", e);
    captureServiceError(e, { service: "vaccins", operation: "obtenirVaccinsAvecLimite" });
    throw e;
  }
}

export function ecouterVaccins(
  childId: string,
  callback: (docs: Array<{ id: string } & Record<string, unknown>>) => void,
) {
  const q = query(
    collection(db, "vaccins"),
    where("childId", "==", childId),
    orderBy("date", "desc")
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

export async function modifierVaccin(
  childId: string,
  id: string,
  nouveausDonnees: Record<string, unknown>,
) {
  try {
    const docRef = doc(db, "vaccins", id);
    const docSnap = await getDoc(docRef);

    if (!docSnap.exists() || docSnap.data().childId !== childId) {
      throw new Error("Accès refusé");
    }

    await updateDoc(docRef, {
      ...nouveausDonnees,
      updatedAt: new Date(),
    });
    console.log("Prise de vaccins modifiée avec succès");
    return true;
  } catch (e) {
    console.error("Erreur lors de la modification :", e);
    captureServiceError(e, { service: "vaccins", operation: "modifierVaccin" });
    throw e;
  }
}

export async function supprimerVaccin(childId: string, id: string) {
  try {
    const docRef = doc(db, "vaccins", id);
    const docSnap = await getDoc(docRef);

    if (!docSnap.exists() || docSnap.data().childId !== childId) {
      throw new Error("Accès refusé");
    }

    await deleteDoc(docRef);
    console.log("Prise de vaccins supprimée avec succès");
    return true;
  } catch (e) {
    console.error("Erreur lors de la suppression :", e);
    captureServiceError(e, { service: "vaccins", operation: "supprimerVaccin" });
    throw e;
  }
}
