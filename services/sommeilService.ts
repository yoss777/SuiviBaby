// services/sommeilService.ts
import {
  addDoc,
  collection,
  deleteDoc,
  deleteField,
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
import { captureServiceError } from "@/utils/errorReporting";

const getUserId = () => {
  const user = auth.currentUser;
  if (!user) throw new Error("Utilisateur non connecté");
  return user.uid;
};

export async function ajouterSommeil(childId: string, data: Record<string, unknown>) {
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
    captureServiceError(e, { service: "sommeil", operation: "ajouterSommeil" });
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
    captureServiceError(e, { service: "sommeil", operation: "obtenirSommeil" });
    throw e;
  }
}

export async function obtenirTousLesSommeils(childId: string) {
  try {
    const q = query(
      collection(db, "sommeils"),
      where("childId", "==", childId),
      orderBy("date", "desc"),
    );
    const querySnapshot = await getDocs(q);

    return querySnapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }));
  } catch (e) {
    console.error("Erreur lors de la récupération :", e);
    captureServiceError(e, { service: "sommeil", operation: "obtenirTousLesSommeils" });
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
      orderBy("date", "desc"),
      limit(nombreLimit),
    );
    const querySnapshot = await getDocs(q);

    return querySnapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }));
  } catch (e) {
    console.error("Erreur lors de la récupération :", e);
    captureServiceError(e, { service: "sommeil", operation: "obtenirSommeilsAvecLimite" });
    throw e;
  }
}

export function ecouterSommeils(
  childId: string,
  callback: (docs: Array<{ id: string } & Record<string, unknown>>) => void,
) {
  const q = query(
    collection(db, "sommeils"),
    where("childId", "==", childId),
    orderBy("date", "desc"),
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
  nouvellesDonnees: Record<string, unknown>,
) {
  try {
    const docRef = doc(db, "sommeils", id);
    const docSnap = await getDoc(docRef);

    if (!docSnap.exists() || docSnap.data().childId !== childId) {
      throw new Error("Accès refusé");
    }

    // Handle null values as field deletions
    const updateData: Record<string, unknown> = {
      ...nouvellesDonnees,
      updatedAt: new Date(),
    };
    if (nouvellesDonnees.heureFin === null) {
      updateData.heureFin = deleteField();
    }
    if (nouvellesDonnees.duree === null) {
      updateData.duree = deleteField();
    }

    // updateDoc's signature requires PartialWithFieldValue<DocumentData>;
    // our Record<string, unknown> is structurally identical but TS treats
    // them as incompatible. Cast at the call site only.
    await updateDoc(docRef, updateData as Record<string, never>);
    console.log("Sommeil modifié avec succès");
    return true;
  } catch (e) {
    console.error("Erreur lors de la modification :", e);
    captureServiceError(e, { service: "sommeil", operation: "modifierSommeil" });
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
    captureServiceError(e, { service: "sommeil", operation: "supprimerSommeil" });
    throw e;
  }
}
