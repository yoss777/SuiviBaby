import { addDoc, collection, onSnapshot, orderBy, query } from "firebase/firestore";
import { db } from "../firebase";

// ➕ Ajouter une tétée
export async function ajouterMiction(data: any) {
  try {
    const ref = await addDoc(collection(db, "mictions"), {
      ...data,
      createdAt: new Date(),
    });
    console.log("Miction ajoutée avec l’ID :", ref.id);
    return ref;
  } catch (e) {
    console.error("Erreur lors de l'ajout :", e);
    throw e;
  }
}

// 🔄 Écouter en temps réel toutes les tétées
export function ecouterMictions(callback: (docs: any[]) => void) {
  const q = query(collection(db, "mictions"), orderBy("createdAt", "desc"));

  const unsubscribe = onSnapshot(q, (snapshot) => {
    const liste = snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }));
    callback(liste);
  });

  return unsubscribe; // 🔥 permet d’arrêter l’écoute
}
