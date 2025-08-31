import { addDoc, collection, onSnapshot, orderBy, query } from "firebase/firestore";
import { db } from "../firebase";

// ➕ Ajouter une tirelait
export async function ajouterPompage(data: any) {
  try {
    const ref = await addDoc(collection(db, "pompages"), {
      ...data,
      createdAt: new Date(),
    });
    console.log("Session pompage tire-lait ajoutée avec l’ID :", ref.id);
    return ref;
  } catch (e) {
    console.error("Erreur lors de l'ajout :", e);
    throw e;
  }
}

// 🔄 Écouter en temps réel toutes les sessions tire-lait
export function ecouterPompages(callback: (docs: any[]) => void) {
  const q = query(collection(db, "pompages"), orderBy("createdAt", "desc"));

  const unsubscribe = onSnapshot(q, (snapshot) => {
    const liste = snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }));
    callback(liste);
  });

  return unsubscribe; // 🔥 permet d’arrêter l’écoute
}
