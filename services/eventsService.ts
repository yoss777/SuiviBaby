// services/eventsService.ts
// Service unifié pour TOUS les types d'événements
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
  setDoc,
  Timestamp,
  updateDoc,
  where
} from "firebase/firestore";
import { auth, db } from "../config/firebase";

const getUserId = () => {
  const user = auth.currentUser;
  if (!user) throw new Error("Utilisateur non connecté");
  return user.uid;
};

// ============================================
// TYPES
// ============================================

export type EventType =
  | "biberon"
  | "tetee"
  | "pompage"
  | "couche"        // Change de couche (sans détail)
  | "miction"       // Pipi
  | "selle"         // Popo
  | "sommeil"
  | "croissance"    // Taille, poids, tête
  | "vaccin"
  | "vitamine";

export interface BaseEvent {
  id?: string;
  childId: string;
  userId: string;
  type: EventType;
  date: Date | Timestamp;
  createdAt: Date | Timestamp;
  updatedAt?: Date | Timestamp;
  note?: string;
  migratedAt?: Date | Timestamp; // Pour tracking migration
}

// Interfaces spécifiques par type
export interface BiberonEvent extends BaseEvent {
  type: "biberon";
  quantite: number; // ml
}

export interface TeteeEvent extends BaseEvent {
  type: "tetee";
  coteGauche: boolean;
  coteDroit: boolean;
  dureeGauche?: number; // minutes
  dureeDroite?: number; // minutes
}

export interface PompageEvent extends BaseEvent {
  type: "pompage";
  quantiteGauche?: number; // ml
  quantiteDroite?: number; // ml
  duree?: number; // minutes
}

export interface CoucheEvent extends BaseEvent {
  type: "couche";
  // Juste un change de couche, sans détail médical
  // Les détails médicaux sont dans MictionEvent et SelleEvent
}

export interface MictionEvent extends BaseEvent {
  type: "miction";
  volume?: number; // ml
  couleur?: "claire" | "jaune" | "foncee" | "autre";
  avecCouche?: boolean; // Si c'était dans une couche
}

export interface SelleEvent extends BaseEvent {
  type: "selle";
  consistance?: "liquide" | "molle" | "normale" | "dure";
  couleur?: string;
  quantite?: "peu" | "moyen" | "beaucoup";
  avecCouche?: boolean; // Si c'était dans une couche
}

export interface SommeilEvent extends BaseEvent {
  type: "sommeil";
  duree?: number; // minutes
  heureDebut?: Date | Timestamp;
  heureFin?: Date | Timestamp;
}

export interface CroissanceEvent extends BaseEvent {
  type: "croissance";
  tailleCm?: number;
  poidsKg?: number;
  teteCm?: number;
}

export interface VaccinEvent extends BaseEvent {
  type: "vaccin";
  nomVaccin: string;
  lieu?: string;
}

export interface VitamineEvent extends BaseEvent {
  type: "vitamine";
  nomVitamine: string;
  dosage?: string;
}

export type Event =
  | BiberonEvent
  | TeteeEvent
  | PompageEvent
  | CoucheEvent
  | MictionEvent
  | SelleEvent
  | SommeilEvent
  | CroissanceEvent
  | VaccinEvent
  | VitamineEvent;

// ============================================
// CRUD UNIFIÉ
// ============================================

const COLLECTION_NAME = "events";

/**
 * Ajoute un événement
 */
export async function ajouterEvenement(
  childId: string,
  data: Omit<Event, "id" | "childId" | "userId" | "createdAt">
): Promise<string> {
  try {
    const userId = getUserId();

    const eventData = {
      ...data,
      childId,
      userId,
      createdAt: Timestamp.now(),
      date: data.date instanceof Date ? Timestamp.fromDate(data.date) : data.date,
    };

    const ref = await addDoc(collection(db, COLLECTION_NAME), eventData);
    console.log(`✅ ${data.type} ajouté avec l'ID :`, ref.id);
    return ref.id;
  } catch (e) {
    console.error("❌ Erreur lors de l'ajout :", e);
    throw e;
  }
}

/**
 * ✨ Ajoute un événement avec un ID spécifique (pour double écriture)
 * Utilise setDoc au lieu de addDoc pour spécifier l'ID
 */
export async function ajouterEvenementAvecId(
  childId: string,
  id: string,
  data: Omit<Event, "id" | "childId" | "userId" | "createdAt">
): Promise<void> {
  try {
    const userId = getUserId();

    const eventData = {
      ...data,
      childId,
      userId,
      createdAt: Timestamp.now(),
      date: data.date instanceof Date ? Timestamp.fromDate(data.date) : data.date,
    };

    // Utiliser setDoc au lieu de addDoc pour spécifier l'ID
    const docRef = doc(db, COLLECTION_NAME, id);
    await setDoc(docRef, eventData);

    console.log(`✅ ${data.type} ajouté avec ID spécifique :`, id);
  } catch (e) {
    console.error("❌ Erreur lors de l'ajout avec ID :", e);
    throw e;
  }
}

/**
 * Récupère un événement par ID
 */
export async function obtenirEvenement(
  childId: string,
  id: string
): Promise<Event | null> {
  try {
    const userId = getUserId();
    const docRef = doc(db, COLLECTION_NAME, id);
    const docSnap = await getDoc(docRef);

    if (
      docSnap.exists() &&
      docSnap.data().userId === userId &&
      docSnap.data().childId === childId
    ) {
      return { id: docSnap.id, ...docSnap.data() } as Event;
    }
    return null;
  } catch (e) {
    console.error("Erreur lors de la récupération :", e);
    throw e;
  }
}

/**
 * Récupère tous les événements (ou filtrés par type)
 */
export async function obtenirEvenements(
  childId: string,
  options?: {
    type?: EventType | EventType[];
    limite?: number;
    depuis?: Date;
    jusqu?: Date;
  }
): Promise<Event[]> {
  try {
    const userId = getUserId();

    let q = query(
      collection(db, COLLECTION_NAME),
      where("userId", "==", userId),
      where("childId", "==", childId)
    );

    // Filtre par type(s)
    if (options?.type) {
      const types = Array.isArray(options.type) ? options.type : [options.type];
      q = query(q, where("type", "in", types));
    }

    // Filtre par date
    if (options?.depuis) {
      q = query(q, where("date", ">=", Timestamp.fromDate(options.depuis)));
    }
    if (options?.jusqu) {
      q = query(q, where("date", "<=", Timestamp.fromDate(options.jusqu)));
    }

    // Ordre et limite
    q = query(q, orderBy("date", "desc"));
    if (options?.limite) {
      q = query(q, limit(options.limite));
    }

    const snapshot = await getDocs(q);
    return snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    })) as Event[];
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
  callback: (events: Event[]) => void,
  options?: {
    type?: EventType | EventType[];
    limite?: number;
    depuis?: Date;
    jusqu?: Date;
    waitForServer?: boolean;
  }
): () => void {
  const userId = getUserId();
  let hasReceivedServerSnapshot = false;

  let q = query(
    collection(db, COLLECTION_NAME),
    where("userId", "==", userId),
    where("childId", "==", childId)
  );

  if (options?.type) {
    const types = Array.isArray(options.type) ? options.type : [options.type];
    q = query(q, where("type", "in", types));
  }

  if (options?.depuis) {
    q = query(q, where("date", ">=", Timestamp.fromDate(options.depuis)));
  }
  if (options?.jusqu) {
    q = query(q, where("date", "<=", Timestamp.fromDate(options.jusqu)));
  }

  q = query(q, orderBy("date", "desc"));
  if (options?.limite) {
    q = query(q, limit(options.limite));
  }

  const waitForServerTimeoutMs = 800;
  let fallbackTimer: ReturnType<typeof setTimeout> | null = null;
  let fallbackTriggered = false;
  let cachedEvents: Event[] | null = null;

  const unsubscribe = onSnapshot(
    q,
    { includeMetadataChanges: !!options?.waitForServer },
    (snapshot) => {
      if (!snapshot.metadata.fromCache) {
        hasReceivedServerSnapshot = true;
        if (fallbackTimer) {
          clearTimeout(fallbackTimer);
          fallbackTimer = null;
        }
      }

      const events = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      })) as Event[];

      if (snapshot.metadata.fromCache) {
        cachedEvents = events;
      }

      if (
        options?.waitForServer &&
        !hasReceivedServerSnapshot &&
        snapshot.metadata.fromCache &&
        snapshot.empty
      ) {
        if (!fallbackTimer && !fallbackTriggered) {
          fallbackTimer = setTimeout(() => {
            if (!hasReceivedServerSnapshot) {
              fallbackTriggered = true;
              callback(cachedEvents ?? []);
            }
          }, waitForServerTimeoutMs);
        }
        return;
      }

      callback(events);
    }
  );

  return () => {
    if (fallbackTimer) {
      clearTimeout(fallbackTimer);
      fallbackTimer = null;
    }
    unsubscribe();
  };
}

/**
 * Modifie un événement
 */
export async function modifierEvenement(
  childId: string,
  id: string,
  data: Partial<Event>
): Promise<void> {
  try {
    const userId = getUserId();
    const docRef = doc(db, COLLECTION_NAME, id);
    const docSnap = await getDoc(docRef);

    if (
      !docSnap.exists() ||
      docSnap.data().userId !== userId ||
      docSnap.data().childId !== childId
    ) {
      throw new Error("Accès refusé");
    }

    await updateDoc(docRef, {
      ...data,
      updatedAt: Timestamp.now(),
    });
    console.log("✅ Événement modifié");
  } catch (e) {
    console.error("Erreur lors de la modification :", e);
    throw e;
  }
}

/**
 * Supprime un événement
 */
export async function supprimerEvenement(
  childId: string,
  id: string
): Promise<void> {
  try {
    const userId = getUserId();
    const docRef = doc(db, COLLECTION_NAME, id);
    const docSnap = await getDoc(docRef);

    if (
      !docSnap.exists() ||
      docSnap.data().userId !== userId ||
      docSnap.data().childId !== childId
    ) {
      throw new Error("Accès refusé");
    }

    await deleteDoc(docRef);
    console.log("✅ Événement supprimé");
  } catch (e) {
    console.error("Erreur lors de la suppression :", e);
    throw e;
  }
}

// ============================================
// HELPERS SPÉCIFIQUES PAR TYPE
// ============================================

export async function ajouterBiberon(
  childId: string,
  quantite: number,
  date?: Date,
  note?: string
) {
  return ajouterEvenement(childId, {
    type: "biberon",
    quantite,
    date: date || new Date(),
    note,
  } as BiberonEvent);
}

export async function ajouterTetee(
  childId: string,
  options: {
    coteGauche?: boolean;
    coteDroit?: boolean;
    dureeGauche?: number;
    dureeDroite?: number;
    date?: Date;
    note?: string;
  }
) {
  return ajouterEvenement(childId, {
    type: "tetee",
    coteGauche: options.coteGauche || false,
    coteDroit: options.coteDroit || false,
    dureeGauche: options.dureeGauche,
    dureeDroite: options.dureeDroite,
    date: options.date || new Date(),
    note: options.note,
  } as TeteeEvent);
}

export async function ajouterPompage(
  childId: string,
  options: {
    quantiteGauche?: number;
    quantiteDroite?: number;
    duree?: number;
    date?: Date;
    note?: string;
  }
) {
  return ajouterEvenement(childId, {
    type: "pompage",
    quantiteGauche: options.quantiteGauche,
    quantiteDroite: options.quantiteDroite,
    duree: options.duree,
    date: options.date || new Date(),
    note: options.note,
  } as PompageEvent);
}

/**
 * Ajoute un simple change de couche (sans détail médical)
 */
export async function ajouterCouche(
  childId: string,
  options?: {
    date?: Date;
    note?: string;
  }
) {
  return ajouterEvenement(childId, {
    type: "couche",
    date: options?.date || new Date(),
    note: options?.note,
  } as CoucheEvent);
}

/**
 * Ajoute une miction (pipi) avec détails médicaux
 */
export async function ajouterMiction(
  childId: string,
  options: {
    volume?: number;
    couleur?: "claire" | "jaune" | "foncee" | "autre";
    avecCouche?: boolean;
    date?: Date;
    note?: string;
  }
) {
  return ajouterEvenement(childId, {
    type: "miction",
    volume: options.volume,
    couleur: options.couleur,
    avecCouche: options.avecCouche,
    date: options.date || new Date(),
    note: options.note,
  } as MictionEvent);
}

/**
 * Ajoute une selle (popo) avec détails médicaux
 */
export async function ajouterSelle(
  childId: string,
  options: {
    consistance?: "liquide" | "molle" | "normale" | "dure";
    couleur?: string;
    quantite?: "peu" | "moyen" | "beaucoup";
    avecCouche?: boolean;
    date?: Date;
    note?: string;
  }
) {
  return ajouterEvenement(childId, {
    type: "selle",
    consistance: options.consistance,
    couleur: options.couleur,
    quantite: options.quantite,
    avecCouche: options.avecCouche,
    date: options.date || new Date(),
    note: options.note,
  } as SelleEvent);
}

/**
 * Helper combiné : couche + miction et/ou selle
 * Utile pour enregistrer rapidement "change de couche avec pipi et popo"
 */
export async function ajouterCoucheAvecDetails(
  childId: string,
  options: {
    avecMiction?: boolean;
    mictionDetails?: Partial<MictionEvent>;
    avecSelle?: boolean;
    selleDetails?: Partial<SelleEvent>;
    date?: Date;
    note?: string;
  }
) {
  const date = options.date || new Date();
  const eventIds: string[] = [];

  // Toujours ajouter le change de couche
  const coucheId = await ajouterCouche(childId, { date, note: options.note });
  eventIds.push(coucheId);

  // Ajouter miction si présente
  if (options.avecMiction) {
    const mictionId = await ajouterMiction(childId, {
      ...options.mictionDetails,
      avecCouche: true,
      date,
    });
    eventIds.push(mictionId);
  }

  // Ajouter selle si présente
  if (options.avecSelle) {
    const selleId = await ajouterSelle(childId, {
      ...options.selleDetails,
      avecCouche: true,
      date,
    });
    eventIds.push(selleId);
  }

  return eventIds;
}

export async function ajouterSommeil(
  childId: string,
  options: {
    duree?: number;
    heureDebut?: Date;
    heureFin?: Date;
    date?: Date;
    note?: string;
  }
) {
  return ajouterEvenement(childId, {
    type: "sommeil",
    duree: options.duree,
    heureDebut: options.heureDebut,
    heureFin: options.heureFin,
    date: options.date || new Date(),
    note: options.note,
  } as SommeilEvent);
}

export async function ajouterVaccin(
  childId: string,
  nomVaccin: string,
  options?: {
    lieu?: string;
    date?: Date;
    note?: string;
  }
) {
  return ajouterEvenement(childId, {
    type: "vaccin",
    nomVaccin,
    lieu: options?.lieu,
    date: options?.date || new Date(),
    note: options?.note,
  } as VaccinEvent);
}

export async function ajouterVitamine(
  childId: string,
  nomVitamine: string,
  options?: {
    dosage?: string;
    date?: Date;
    note?: string;
  }
) {
  return ajouterEvenement(childId, {
    type: "vitamine",
    nomVitamine,
    dosage: options?.dosage,
    date: options?.date || new Date(),
    note: options?.note,
  } as VitamineEvent);
}

// ============================================
// STATISTIQUES & ANALYTICS
// ============================================

/**
 * Statistiques pour les dernières 24h
 */
export async function obtenirStats24h(childId: string) {
  const hier = new Date();
  hier.setHours(hier.getHours() - 24);

  const events = await obtenirEvenements(childId, { depuis: hier });

  const stats = {
    biberons: { count: 0, totalMl: 0 },
    tetees: { count: 0, totalMinutes: 0 },
    mictions: { count: 0 },
    selles: { count: 0 },
    couches: { count: 0 },
    sommeil: { count: 0, totalMinutes: 0 },
  };

  events.forEach((event) => {
    switch (event.type) {
      case "biberon":
        stats.biberons.count++;
        stats.biberons.totalMl += (event as BiberonEvent).quantite;
        break;
      case "tetee":
        stats.tetees.count++;
        const tetee = event as TeteeEvent;
        stats.tetees.totalMinutes +=
          (tetee.dureeGauche || 0) + (tetee.dureeDroite || 0);
        break;
      case "miction":
        stats.mictions.count++;
        break;
      case "selle":
        stats.selles.count++;
        break;
      case "couche":
        stats.couches.count++;
        break;
      case "sommeil":
        stats.sommeil.count++;
        stats.sommeil.totalMinutes += (event as SommeilEvent).duree || 0;
        break;
    }
  });

  return stats;
}
