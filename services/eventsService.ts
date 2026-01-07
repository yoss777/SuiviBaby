// services/eventsService.ts
// Service unifié pour tous les types d'événements (biberons, seins, couches, sommeil)
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
    Timestamp,
    updateDoc,
    where,
} from "firebase/firestore";
import { auth, db } from "../config/firebase";

const getUserId = () => {
  const user = auth.currentUser;
  if (!user) {
    throw new Error("Utilisateur non connecté");
  }
  return user.uid;
};

// Types d'événements supportés
export type EventType = 'biberons' | 'seins' | 'couches' | 'sommeil';

// Interface pour les données d'événement
export interface EventData {
  childId: string;
  userId: string;
  type: EventType;
  date: Date | Timestamp;
  createdAt: Date | Timestamp;
  quantite: number | null;
  // Champs optionnels selon le type
  coteGauche?: boolean;
  coteDroit?: boolean;
  pipi?: boolean;
  popo?: boolean;
  note?: string;
  migratedAt?: Date | Timestamp;
}

/**
 * Ajoute un événement (biberon, tétée, couche, sommeil)
 */
export async function ajouterEvenement(childId: string, data: Partial<EventData>) {
  try {
    const userId = getUserId();
    
    // Déterminer la collection selon le type
    const collectionName = getCollectionName(data.type as EventType);
    
    const eventData: Partial<EventData> = {
      ...data,
      childId,
      userId,
      createdAt: new Date(),
      // Si date n'est pas fournie, utiliser maintenant
      date: data.date || new Date(),
    };

    const ref = await addDoc(collection(db, collectionName), eventData);
    console.log(`✅ ${data.type} ajouté avec l'ID :`, ref.id);
    return ref;
  } catch (e) {
    console.error("❌ Erreur lors de l'ajout :", e);
    throw e;
  }
}

/**
 * Ajoute un biberon
 */
export async function ajouterBiberon(childId: string, quantite: number, date?: Date, note?: string) {
  return ajouterEvenement(childId, {
    type: 'biberons',
    quantite,
    date: date || new Date(),
    note,
  });
}

/**
 * Ajoute une tétée
 */
export async function ajouterTetee(
  childId: string,
  options: {
    coteGauche?: boolean;
    coteDroit?: boolean;
    quantite?: number | null; // Durée en minutes
    date?: Date;
    note?: string;
  }
) {
  return ajouterEvenement(childId, {
    type: 'seins',
    quantite: options.quantite || null,
    coteGauche: options.coteGauche || false,
    coteDroit: options.coteDroit || false,
    date: options.date || new Date(),
    note: options.note,
  });
}

/**
 * Ajoute une couche
 */
export async function ajouterCouche(
  childId: string,
  options: {
    pipi?: boolean;
    popo?: boolean;
    date?: Date;
    note?: string;
  }
) {
  return ajouterEvenement(childId, {
    type: 'couches',
    quantite: null,
    pipi: options.pipi || false,
    popo: options.popo || false,
    date: options.date || new Date(),
    note: options.note,
  });
}

/**
 * Ajoute un sommeil
 */
export async function ajouterSommeil(
  childId: string,
  quantite: number | null, // Durée en minutes
  date?: Date,
  note?: string
) {
  return ajouterEvenement(childId, {
    type: 'sommeil',
    quantite,
    date: date || new Date(),
    note,
  });
}

/**
 * Récupère un événement par ID
 */
export async function obtenirEvenement(childId: string, id: string, type: EventType) {
  try {
    const userId = getUserId();
    const collectionName = getCollectionName(type);
    const docRef = doc(db, collectionName, id);
    const docSnap = await getDoc(docRef);

    if (docSnap.exists() && docSnap.data().userId === userId && docSnap.data().childId === childId) {
      return { id: docSnap.id, ...docSnap.data() };
    } else {
      console.log("Aucun événement trouvé avec cet ID ou accès refusé");
      return null;
    }
  } catch (e) {
    console.error("Erreur lors de la récupération :", e);
    throw e;
  }
}

/**
 * Récupère tous les événements d'un type pour un enfant
 */
export async function obtenirTousLesEvenements(childId: string, type?: EventType) {
  try {
    const userId = getUserId();
    
    if (type) {
      // Récupérer un seul type
      const collectionName = getCollectionName(type);
      const q = query(
        collection(db, collectionName),
        where("userId", "==", userId),
        where("childId", "==", childId),
        orderBy("date", "desc")
      );
      const querySnapshot = await getDocs(q);
      return querySnapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }));
    } else {
      // Récupérer tous les types (si vous avez une collection unique "events")
      // Adapter selon votre structure
      const allEvents = [];
      const types: EventType[] = ['biberons', 'seins', 'couches', 'sommeil'];
      
      for (const eventType of types) {
        const events = await obtenirTousLesEvenements(childId, eventType);
        allEvents.push(...events);
      }
      
      // Trier par date
      return allEvents.sort((a: any, b: any) => {
        const dateA = a.date?.toDate?.() || a.date;
        const dateB = b.date?.toDate?.() || b.date;
        return dateB - dateA;
      });
    }
  } catch (e) {
    console.error("Erreur lors de la récupération :", e);
    throw e;
  }
}

/**
 * Récupère les événements avec limite
 */
export async function obtenirEvenementsAvecLimite(
  childId: string,
  type: EventType,
  nombreLimit: number
) {
  try {
    const userId = getUserId();
    const collectionName = getCollectionName(type);
    const q = query(
      collection(db, collectionName),
      where("userId", "==", userId),
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
    throw e;
  }
}

/**
 * Écoute les événements en temps réel
 */
export function ecouterEvenements(
  childId: string,
  type: EventType,
  callback: (docs: any[]) => void
) {
  const userId = getUserId();
  const collectionName = getCollectionName(type);
  const q = query(
    collection(db, collectionName),
    where("userId", "==", userId),
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

/**
 * Modifie un événement
 */
export async function modifierEvenement(
  childId: string,
  id: string,
  type: EventType,
  nouveausDonnees: Partial<EventData>
) {
  try {
    const userId = getUserId();
    const collectionName = getCollectionName(type);
    const docRef = doc(db, collectionName, id);
    const docSnap = await getDoc(docRef);

    if (!docSnap.exists() || docSnap.data().userId !== userId || docSnap.data().childId !== childId) {
      throw new Error("Accès refusé");
    }

    await updateDoc(docRef, {
      ...nouveausDonnees,
      updatedAt: new Date(),
    });
    console.log("Événement modifié avec succès");
    return true;
  } catch (e) {
    console.error("Erreur lors de la modification :", e);
    throw e;
  }
}

/**
 * Supprime un événement
 */
export async function supprimerEvenement(childId: string, id: string, type: EventType) {
  try {
    const userId = getUserId();
    const collectionName = getCollectionName(type);
    const docRef = doc(db, collectionName, id);
    const docSnap = await getDoc(docRef);

    if (!docSnap.exists() || docSnap.data().userId !== userId || docSnap.data().childId !== childId) {
      throw new Error("Accès refusé");
    }

    await deleteDoc(docRef);
    console.log("Événement supprimé avec succès");
    return true;
  } catch (e) {
    console.error("Erreur lors de la suppression :", e);
    throw e;
  }
}

/**
 * Détermine le nom de la collection selon le type
 * Adaptez selon votre structure Firestore
 */
function getCollectionName(type: EventType): string {
  // Si vous avez des collections séparées
  return type; // 'biberons', 'seins', 'couches', 'sommeil'
  
  // Si vous avez une collection unique
  // return 'events';
}