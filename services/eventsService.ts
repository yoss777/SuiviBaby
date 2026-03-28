// services/eventsService.ts
// Service unifié pour TOUS les types d'événements
import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  setDoc,
  Timestamp,
  where,
} from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { auth, db, functions } from "../config/firebase";
import { enqueueEvent, isOnline } from "./offlineQueueService";
import {
  addOptimisticCreate,
  addOptimisticUpdate,
  confirmOptimistic,
  failOptimistic,
  generateTempId,
  removeOptimistic,
} from "./optimisticEventsStore";

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
  | "solide" // Repas solide (diversification)
  | "pompage"
  | "couche" // Change de couche (sans détail)
  | "miction" // Pipi
  | "selle" // Popo
  | "sommeil"
  | "bain"
  | "temperature"
  | "medicament"
  | "symptome"
  | "croissance" // Taille, poids, tête
  | "vaccin"
  | "vitamine"
  | "activite" // Activités d'éveil
  | "jalon" // Jalons et moments
  | "nettoyage_nez"; // Nettoyage de nez

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
  typeBiberon?: "lait_maternel" | "lait_infantile" | "eau" | "jus" | "autre";
}

export interface TeteeEvent extends BaseEvent {
  type: "tetee";
  coteGauche: boolean;
  coteDroit: boolean;
  dureeGauche?: number; // minutes
  dureeDroite?: number; // minutes
}

export interface SolideEvent extends BaseEvent {
  type: "solide";
  typeSolide:
    | "puree"
    | "compote"
    | "cereales"
    | "yaourt"
    | "morceaux"
    | "autre";
  momentRepas?:
    | "petit_dejeuner"
    | "dejeuner"
    | "gouter"
    | "diner"
    | "collation";
  ingredients?: string; // Liste libre des ingrédients
  quantite?: "peu" | "moyen" | "beaucoup";
  nouveauAliment?: boolean; // Flag pour premier essai
  nomNouvelAliment?: string; // Nom de l'aliment introduit (ex: "avocat", "fraise")
  allergenes?: string[]; // Liste des allergènes présents
  reaction?: "aucune" | "legere" | "importante"; // Réaction si nouvel aliment
  aime?: boolean; // Bébé a aimé ou non
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
  heureDebut?: Date | Timestamp;
  heureFin?: Date | Timestamp; // Le sommeil est peut-être en cours
  duree?: number; // minutes // Calculé à partir de heureDebut et heureFin
  location?: "lit" | "cododo" | "poussette" | "voiture" | "autre";
  quality?: "paisible" | "agité" | "mauvais";
  isNap: boolean; // Si c'est une sieste (true) ou sommeil nocturne (false)
}

export interface BainEvent extends BaseEvent {
  type: "bain";
  duree?: number; // minutes
  temperatureEau?: number; // °C
  produits?: string;
}

export interface NettoyageNezEvent extends BaseEvent {
  type: "nettoyage_nez";
  methode?: "serum" | "mouche_bebe" | "coton" | "autre";
  resultat?: "efficace" | "mucus_clair" | "mucus_epais" | "mucus_colore";
}

export interface TemperatureEvent extends BaseEvent {
  type: "temperature";
  valeur: number; // °C
  modePrise?: "rectale" | "axillaire" | "auriculaire" | "frontale" | "autre";
}

export interface MedicamentEvent extends BaseEvent {
  type: "medicament";
  nomMedicament: string;
  dosage?: string;
  voie?: "orale" | "topique" | "inhalation" | "autre";
}

export interface SymptomeEvent extends BaseEvent {
  type: "symptome";
  symptomes: string[];
  intensite?: "leger" | "modere" | "fort";
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
  dosage?: string;
  lieu?: string;
}

export interface VitamineEvent extends BaseEvent {
  type: "vitamine";
  nomVitamine: string;
  dosage?: string;
}

export interface ActiviteEvent extends BaseEvent {
  type: "activite";
  typeActivite:
    | "tummyTime"
    | "jeux"
    | "lecture"
    | "promenade"
    | "massage"
    | "musique"
    | "eveil"
    | "sortie"
    | "autre";
  duree?: number; // minutes
  description?: string;
  heureDebut?: Date | Timestamp; // For chrono mode (promenade)
  heureFin?: Date | Timestamp; // For chrono mode (promenade)
}

export interface JalonEvent extends BaseEvent {
  type: "jalon";
  typeJalon: "dent" | "pas" | "sourire" | "mot" | "humeur" | "photo" | "autre";
  titre?: string;
  description?: string;
  photos?: string[]; // URLs
  humeur?: 1 | 2 | 3 | 4 | 5;
}

export type Event =
  | BiberonEvent
  | TeteeEvent
  | SolideEvent
  | PompageEvent
  | CoucheEvent
  | MictionEvent
  | SelleEvent
  | SommeilEvent
  | BainEvent
  | TemperatureEvent
  | MedicamentEvent
  | SymptomeEvent
  | CroissanceEvent
  | VaccinEvent
  | VitamineEvent
  | ActiviteEvent
  | JalonEvent
  | NettoyageNezEvent;

// ============================================
// CRUD UNIFIÉ
// ============================================

const COLLECTION_NAME = "events";

/**
 * Ajoute un événement via Cloud Function (validation serveur)
 * Si offline, l'événement est mis en queue et synchronisé au retour en ligne.
 */
export async function ajouterEvenement(
  childId: string,
  data: Omit<Event, "id" | "childId" | "userId" | "createdAt">,
): Promise<string> {
  const payload = {
    ...data,
    childId,
    date:
      data.date instanceof Date ? Timestamp.fromDate(data.date) : data.date,
  };

  // Si offline, mettre en queue
  const online = await isOnline();
  if (!online) {
    const offlineId = await enqueueEvent("create", payload);
    return offlineId;
  }

  const createEvent = httpsCallable<
    Record<string, unknown>,
    { id: string }
  >(functions, "validateAndCreateEvent");

  const result = await createEvent(payload);
  return result.data.id;
}

/**
 * ✨ Ajoute un événement avec un ID spécifique (pour double écriture)
 * Utilise setDoc au lieu de addDoc pour spécifier l'ID
 */
export async function ajouterEvenementAvecId(
  childId: string,
  id: string,
  data: Omit<Event, "id" | "childId" | "userId" | "createdAt">,
): Promise<void> {
  try {
    const userId = getUserId();

    const eventData = {
      ...data,
      childId,
      userId,
      createdAt: Timestamp.now(),
      date:
        data.date instanceof Date ? Timestamp.fromDate(data.date) : data.date,
    };

    // setDoc avec merge: true crée ou fusionne si le document existe déjà
    const docRef = doc(db, COLLECTION_NAME, id);
    await setDoc(docRef, eventData, { merge: true });
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
  id: string,
): Promise<Event | null> {
  try {
    const docRef = doc(db, COLLECTION_NAME, id);
    const docSnap = await getDoc(docRef);

    if (docSnap.exists() && docSnap.data().childId === childId) {
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
  },
): Promise<Event[]> {
  try {
    let q = query(
      collection(db, COLLECTION_NAME),
      where("childId", "==", childId),
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
  },
  onError?: (error: Error) => void,
): () => void {
  let hasReceivedServerSnapshot = false;

  let q = query(
    collection(db, COLLECTION_NAME),
    where("childId", "==", childId),
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

  const lid = Math.random().toString(36).slice(2, 6);
  const tl = Array.isArray(options?.type)
    ? options.type.length > 3 ? `[${options.type.length} types]` : options.type.join(",")
    : options?.type ?? "all";
  console.log(`[L:${lid}] SETUP type=${tl} wfs=${!!options?.waitForServer} imc=${!!options?.waitForServer}`);

  const unsubscribe = onSnapshot(
    q,
    { includeMetadataChanges: !!options?.waitForServer },
    (snapshot) => {
      console.log(`[L:${lid}] SNAP type=${tl} sz=${snapshot.size} empty=${snapshot.empty} cache=${snapshot.metadata.fromCache} server=${hasReceivedServerSnapshot} fb=${fallbackTriggered}`);

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
        console.log(`[L:${lid}] BLOCKED waiting for server`);
        if (!fallbackTimer && !fallbackTriggered) {
          fallbackTimer = setTimeout(() => {
            console.log(`[L:${lid}] FALLBACK after ${waitForServerTimeoutMs}ms server=${hasReceivedServerSnapshot}`);
            if (!hasReceivedServerSnapshot) {
              fallbackTriggered = true;
              callback(cachedEvents ?? []);
            }
          }, waitForServerTimeoutMs);
        }
        return;
      }

      console.log(`[L:${lid}] CB ${events.length} events`);
      callback(events);
    },
    (error) => {
      console.error(`[L:${lid}] ERROR:`, error);
      onError?.(error);
    },
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
 * Modifie un événement via Cloud Function (validation serveur)
 */
export async function modifierEvenement(
  childId: string,
  id: string,
  data: Partial<Event>,
): Promise<void> {
  const payload = {
    ...data,
    childId,
    eventId: id,
  };

  // Convertir les dates si nécessaire
  if (data.date && data.date instanceof Date) {
    (payload as any).date = Timestamp.fromDate(data.date);
  }

  // Si offline, mettre en queue
  const online = await isOnline();
  if (!online) {
    await enqueueEvent("update", payload as Record<string, unknown>);
    return;
  }

  const updateEvent = httpsCallable<
    Record<string, unknown>,
    { success: boolean }
  >(functions, "validateAndUpdateEvent");

  await updateEvent(payload);
}

/**
 * Supprime un événement et ses interactions sociales via Cloud Function (atomique)
 */
export async function supprimerEvenement(
  childId: string,
  id: string,
): Promise<void> {
  // Si offline, mettre en queue
  const online = await isOnline();
  if (!online) {
    await enqueueEvent("delete", { childId, eventId: id });
    return;
  }

  const deleteEvent = httpsCallable<
    { childId: string; eventId: string },
    { success: boolean; deleted: { event: number; likes: number; comments: number } }
  >(functions, "deleteEventCascade");

  await deleteEvent({ childId, eventId: id });
}

// ============================================
// HELPERS SPÉCIFIQUES PAR TYPE
// ============================================

export async function ajouterBiberon(
  childId: string,
  quantite: number,
  date?: Date,
  note?: string,
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
  },
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
  },
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
  },
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
  },
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
  },
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
  },
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
    location?: "lit" | "cododo" | "poussette" | "voiture" | "autre";
    quality?: "paisible" | "agité" | "mauvais";
    isNap?: boolean;
    note?: string;
  },
) {
  const heureDebut = options.heureDebut;
  const heureFin = options.heureFin;
  const calculatedDuration =
    heureDebut && heureFin
      ? Math.max(
          0,
          Math.round((heureFin.getTime() - heureDebut.getTime()) / 60000),
        )
      : undefined;
  return ajouterEvenement(childId, {
    type: "sommeil",
    duree: options.duree ?? calculatedDuration,
    heureDebut,
    heureFin,
    location: options.location,
    quality: options.quality,
    isNap: options.isNap ?? true,
    date: options.date || heureDebut || new Date(),
    note: options.note,
  } as SommeilEvent);
}

export async function ajouterTemperature(
  childId: string,
  valeur: number,
  options?: {
    modePrise?: TemperatureEvent["modePrise"];
    date?: Date;
    note?: string;
  },
) {
  return ajouterEvenement(childId, {
    type: "temperature",
    valeur,
    modePrise: options?.modePrise,
    date: options?.date || new Date(),
    note: options?.note,
  } as TemperatureEvent);
}

export async function ajouterMedicament(
  childId: string,
  nomMedicament: string,
  options?: {
    dosage?: string;
    voie?: MedicamentEvent["voie"];
    date?: Date;
    note?: string;
  },
) {
  return ajouterEvenement(childId, {
    type: "medicament",
    nomMedicament,
    dosage: options?.dosage,
    voie: options?.voie,
    date: options?.date || new Date(),
    note: options?.note,
  } as MedicamentEvent);
}

export async function ajouterSymptome(
  childId: string,
  symptomes: string[],
  options?: {
    intensite?: SymptomeEvent["intensite"];
    date?: Date;
    note?: string;
  },
) {
  return ajouterEvenement(childId, {
    type: "symptome",
    symptomes,
    intensite: options?.intensite,
    date: options?.date || new Date(),
    note: options?.note,
  } as SymptomeEvent);
}

export async function ajouterVaccin(
  childId: string,
  nomVaccin: string,
  options?: {
    dosage?: string;
    lieu?: string;
    date?: Date;
    note?: string;
  },
) {
  return ajouterEvenement(childId, {
    type: "vaccin",
    nomVaccin,
    dosage: options?.dosage,
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
  },
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
    bains: { count: 0 },
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
      case "bain":
        stats.bains.count++;
        break;
    }
  });

  return stats;
}

// ============================================
// OPTIMISTIC UI WRAPPERS
// ============================================

// Retry helper: 2 retries with increasing delay (1s, 3s)
const RETRY_DELAYS = [1000, 3000];

function isNetworkError(error: unknown): boolean {
  const msg = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
  return (
    msg.includes('network') ||
    msg.includes('timeout') ||
    msg.includes('fetch') ||
    msg.includes('failed to connect') ||
    msg.includes('internet') ||
    msg.includes('offline') ||
    msg.includes('unavailable')
  );
}

async function withRetry<T>(fn: () => Promise<T>): Promise<T> {
  let lastError: unknown;
  // First attempt (no delay)
  try {
    return await fn();
  } catch (e) {
    lastError = e;
  }
  // Retries
  for (const delay of RETRY_DELAYS) {
    await new Promise((r) => setTimeout(r, delay));
    try {
      return await fn();
    } catch (e) {
      lastError = e;
    }
  }
  throw lastError;
}

/**
 * Ajoute un événement avec affichage optimiste immédiat.
 * Retourne un tempId synchrone ; le CF tourne en arrière-plan avec 2 retries.
 */
export function ajouterEvenementOptimistic(
  childId: string,
  data: any,
): string {
  const tempId = generateTempId();
  // Idempotency key: if the CF succeeds but the response is lost, retries
  // will send the same key — the CF deduplicates instead of creating a second event.
  const idempotencyKey = `${auth.currentUser?.uid}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  const optimisticEvent = {
    ...data,
    id: tempId,
    childId,
    date: data.date || new Date(),
    userId: auth.currentUser?.uid || '',
    createdAt: new Date(),
  };

  addOptimisticCreate(childId, optimisticEvent, tempId);

  // Fire CF in background with retries — same idempotencyKey across all attempts
  const dataWithKey = { ...data, idempotencyKey };
  withRetry(() => ajouterEvenement(childId, dataWithKey))
    .then((realId) => {
      confirmOptimistic(tempId, realId);
    })
    .catch(async (error) => {
      if (isNetworkError(error)) {
        // Enqueue for offline sync so the create isn't lost
        const payload: Record<string, unknown> = {
          ...dataWithKey,
          childId,
        };
        if (data.date && data.date instanceof Date) {
          payload.date = Timestamp.fromDate(data.date);
        }
        try {
          await enqueueEvent('create', payload);
          // Offline queue takes over — remove optimistic entry so there's no
          // duplicate when the queue syncs and the Firestore snapshot arrives.
          removeOptimistic(tempId);
        } catch {
          // enqueue failed — keep optimistic entry visible as last resort
        }
        return;
      }
      failOptimistic(tempId);
    });

  return tempId;
}

/**
 * Modifie un événement avec affichage optimiste immédiat.
 * Le CF tourne en arrière-plan avec 2 retries.
 */
export function modifierEvenementOptimistic(
  childId: string,
  eventId: string,
  data: Partial<Event>,
  previousEvent: any,
): void {
  const updatedEvent = {
    ...previousEvent,
    ...data,
    id: eventId,
    childId,
  };

  addOptimisticUpdate(eventId, childId, updatedEvent, previousEvent);

  // Fire CF in background with retries
  withRetry(() => modifierEvenement(childId, eventId, data))
    .then(() => {
      confirmOptimistic(eventId);
    })
    .catch(async (error) => {
      if (isNetworkError(error)) {
        // Enqueue for offline sync so the update isn't lost
        const payload: Record<string, unknown> = {
          ...data,
          childId,
          eventId,
        };
        if (data.date && data.date instanceof Date) {
          payload.date = Timestamp.fromDate(data.date);
        }
        try {
          await enqueueEvent('update', payload);
          // Offline queue takes over — remove optimistic entry to avoid
          // stale overlay when the queue syncs.
          removeOptimistic(eventId);
        } catch {
          // enqueue failed — keep optimistic entry visible as last resort
        }
        return;
      }
      failOptimistic(eventId);
    });
}
