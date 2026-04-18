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
import { captureServiceError } from "@/utils/errorReporting";
import { getTodayTypes } from "@/services/todayEventsCache";
import { enqueueEvent, isOnline } from "./offlineQueueService";
import {
  addOptimisticCreate,
  addOptimisticUpdate,
  confirmOptimistic,
  failOptimistic,
  generateTempId,
  markOptimisticQueued,
} from "./optimisticEventsStore";

const getUserId = () => {
  const user = auth.currentUser;
  if (!user) throw new Error("Utilisateur non connecté");
  return user.uid;
};

function stripUndefinedFields<T extends Record<string, unknown>>(data: T): T {
  return Object.fromEntries(
    Object.entries(data).filter(([, value]) => value !== undefined),
  ) as T;
}

function convertDateFields(value: unknown): unknown {
  if (value == null) return value;
  if (value instanceof Date) return Timestamp.fromDate(value);
  if (
    typeof value === "object" &&
    "toDate" in value &&
    typeof value.toDate === "function"
  ) {
    return value;
  }
  if (Array.isArray(value)) return value.map(convertDateFields);
  if (typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, current]) => [
        key,
        convertDateFields(current),
      ]),
    );
  }
  return value;
}

// ============================================
// TYPES
// ============================================

export type EventType =
  | "biberon"
  | "tetee"
  | "solide" // Repas solide (diversification)
  | "pompage"
  | "couche" // Legacy/backend event; modern UI derives diaper tracking from miction/selle
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
  // Legacy/backend-only raw diaper change event.
  // The modern UI product contract models diaper tracking through
  // MictionEvent and SelleEvent.
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

function buildCreatePayload(
  childId: string,
  data: Omit<Event, "id" | "childId" | "userId" | "createdAt"> | any,
) {
  const cleanData = stripUndefinedFields(data);
  const convertedData = convertDateFields(cleanData) as typeof cleanData;

  return {
    ...convertedData,
    childId,
  };
}

function buildUpdatePayload(
  childId: string,
  id: string,
  data: Partial<Event>,
) {
  const cleanData = stripUndefinedFields(data as Record<string, unknown>);
  const convertedData = convertDateFields(cleanData) as typeof cleanData;
  const payload = {
    ...convertedData,
    childId,
    eventId: id,
  };

  return payload;
}

async function callCreateEventCF(
  payload: Record<string, unknown>,
): Promise<string> {
  const createEvent = httpsCallable<
    Record<string, unknown>,
    { id: string }
  >(functions, "validateAndCreateEvent");

  const result = await createEvent(payload);
  return result.data.id;
}

async function callUpdateEventCF(
  payload: Record<string, unknown>,
): Promise<void> {
  const updateEvent = httpsCallable<
    Record<string, unknown>,
    { success: boolean }
  >(functions, "validateAndUpdateEvent");

  await updateEvent(payload);
}

/**
 * Ajoute un événement via Cloud Function (validation serveur)
 * Si offline, l'événement est mis en queue et synchronisé au retour en ligne.
 */
export async function ajouterEvenement(
  childId: string,
  data: Omit<Event, "id" | "childId" | "userId" | "createdAt">,
): Promise<string> {
  const payload = buildCreatePayload(childId, data);

  // Si offline, mettre en queue
  const online = await isOnline();
  if (!online) {
    const offlineId = await enqueueEvent("create", payload);
    return offlineId;
  }

  return callCreateEventCF(payload);
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
    captureServiceError(e, { service: "events", operation: "ajouterEvenementAvecId" });
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
    captureServiceError(e, { service: "events", operation: "obtenirEvenement" });
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
    // Appliquer un limit uniquement si demandé explicitement.
    // Les queries avec filtre date (depuis/jusqu) sont naturellement bornées.
    // Les queries sans filtre date ET sans limite sont rares (export) et légitimes.
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
    captureServiceError(e, { service: "events", operation: "obtenirEvenements" });
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
        snapshot.metadata.fromCache
      ) {
        console.log(`[L:${lid}] CACHE waiting for server`);
        if (!fallbackTimer && !fallbackTriggered) {
          fallbackTimer = setTimeout(() => {
            console.log(`[L:${lid}] FALLBACK after ${waitForServerTimeoutMs}ms server=${hasReceivedServerSnapshot}`);
            if (!hasReceivedServerSnapshot) {
              fallbackTriggered = true;
              console.log(`[L:${lid}] CB ${cachedEvents?.length ?? 0} cached events`);
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
      captureServiceError(error, { service: "events", operation: "ecouterEvenements" });
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
  const payload = buildUpdatePayload(childId, id, data);

  // Si offline, mettre en queue
  const online = await isOnline();
  if (!online) {
    await enqueueEvent("update", payload as Record<string, unknown>);
    return;
  }

  await callUpdateEventCF(payload as Record<string, unknown>);
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
 * Ajoute un simple change de couche (sans détail médical).
 * Ce type reste supporté côté backend mais n'est plus un event UI moderne de
 * premier niveau: l'application affiche surtout `miction` / `selle`.
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
 * Helper combiné : couche + miction et/ou selle.
 * Kept for compatibility with legacy/backend flows; the modern UI still reads
 * and propagates the diaper domain primarily through `miction` / `selle`.
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
        // Legacy raw diaper-change stats are still counted for historical data.
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
  const optimisticEvent = convertDateFields({
    ...data,
    idempotencyKey,
    id: tempId,
    childId,
    date: data.date || new Date(),
    userId: auth.currentUser?.uid || '',
    createdAt: new Date(),
  });

  addOptimisticCreate(childId, optimisticEvent, tempId);

  const dataWithKey = { ...data, idempotencyKey };
  const payload = buildCreatePayload(childId, dataWithKey);

  void (async () => {
    try {
      if (!(await isOnline())) {
        await enqueueEvent('create', payload);
        markOptimisticQueued(tempId);
        return;
      }

      const realId = await withRetry(() => callCreateEventCF(payload));
      confirmOptimistic(tempId, realId);
    } catch (error) {
      if (isNetworkError(error)) {
        try {
          await enqueueEvent('create', payload);
          markOptimisticQueued(tempId);
        } catch {
          // enqueue failed — keep optimistic entry visible as last resort
        }
        return;
      }
      failOptimistic(tempId);
    }
  })();

  return tempId;
}

/**
 * Modifie un événement avec affichage optimiste immédiat.
 * Le CF tourne en arrière-plan avec 2 retries.
 */
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
  const cleanData = stripUndefinedFields(
    data as Record<string, unknown>,
  ) as Partial<Event>;
  const updatedEvent = convertDateFields({
    ...cleanData,
    id: eventId,
    childId,
  });

  addOptimisticUpdate(eventId, childId, updatedEvent, previousEvent);

  const payload = buildUpdatePayload(childId, eventId, cleanData);

  void (async () => {
    try {
      if (!(await isOnline())) {
        await enqueueEvent('update', payload as Record<string, unknown>);
        markOptimisticQueued(eventId);
        return;
      }

      await withRetry(() => callUpdateEventCF(payload as Record<string, unknown>));
      confirmOptimistic(eventId);
    } catch (error) {
      if (isNetworkError(error)) {
        try {
          await enqueueEvent('update', payload as Record<string, unknown>);
          markOptimisticQueued(eventId);
        } catch {
          // enqueue failed — keep optimistic entry visible as last resort
        }
        return;
      }
      failOptimistic(eventId);
    }
  })();
}

// ============================================
// DATE RANGE HELPERS (ex-migration convenience)
// ============================================

function getTodayRange() {
  const now = new Date();
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  const endOfDayInclusive = new Date(endOfDay.getTime() - 1);
  return { startOfDay, endOfDayInclusive };
}

function getRecentRange() {
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfYesterday = new Date(startOfToday);
  startOfYesterday.setDate(startOfYesterday.getDate() - 1);
  const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  const endOfDayInclusive = new Date(endOfDay.getTime() - 1);
  return { startOfYesterday, endOfDayInclusive };
}

/** Fetch today's events (all tracked types). */
export async function obtenirEvenementsDuJour(childId: string) {
  const { startOfDay, endOfDayInclusive } = getTodayRange();
  const types = getTodayTypes() as EventType[];
  return obtenirEvenements(childId, { type: types, depuis: startOfDay, jusqu: endOfDayInclusive });
}

/** Listen to recent events (yesterday+today, all tracked types). */
export function ecouterEvenementsDuJour(
  childId: string,
  callback: (events: any[]) => void,
  options?: { waitForServer?: boolean },
  onError?: (error: Error) => void,
): () => void {
  const { startOfYesterday, endOfDayInclusive } = getRecentRange();
  const types = getTodayTypes() as EventType[];
  return ecouterEvenements(childId, callback, {
    type: types, depuis: startOfYesterday, jusqu: endOfDayInclusive, waitForServer: options?.waitForServer,
  }, onError);
}

/** Check if there are events before a given date. */
export async function hasMoreEventsBefore(
  childId: string,
  types: EventType | EventType[],
  beforeDate: Date,
) {
  const events = await obtenirEvenements(childId, { type: types, jusqu: beforeDate, limite: 1 });
  return events.length > 0;
}

/** Get the date of the most recent event before a given date. */
export async function getNextEventDateBefore(
  childId: string,
  types: EventType | EventType[],
  beforeDate: Date,
): Promise<Date | null> {
  const events = await obtenirEvenements(childId, { type: types, jusqu: beforeDate, limite: 1 });
  if (events.length === 0) return null;
  const eventDate = events[0].date;
  if (eventDate && typeof (eventDate as any).toDate === 'function') return (eventDate as any).toDate();
  return eventDate instanceof Date ? eventDate : new Date(eventDate as any);
}

// ============================================
// JALON PHOTO CLEANUP HELPERS
// ============================================

const FIREBASE_STORAGE_BUCKET = "samaye-53723.firebasestorage.app";

export async function deletePhotoFromStorage(photoUrl: string): Promise<void> {
  try {
    const match = photoUrl.match(/\/o\/([^?]+)/);
    if (!match) {
      console.warn("[DELETE_PHOTO] URL non reconnue:", photoUrl);
      return;
    }
    const encodedPath = match[1];
    const filePath = decodeURIComponent(encodedPath);
    console.log("[DELETE_PHOTO] Suppression de:", filePath);

    const user = auth.currentUser;
    if (!user) {
      console.warn("[DELETE_PHOTO] Utilisateur non connecté");
      return;
    }
    const token = await user.getIdToken();

    const deleteUrl = `https://firebasestorage.googleapis.com/v0/b/${FIREBASE_STORAGE_BUCKET}/o/${encodedPath}`;
    const response = await fetch(deleteUrl, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });

    if (response.ok || response.status === 404) {
      console.log("[DELETE_PHOTO] Photo supprimée avec succès");
    } else {
      console.error("[DELETE_PHOTO] Erreur:", response.status, await response.text());
    }
  } catch (error) {
    console.error("[DELETE_PHOTO] Erreur:", error);
  }
}

/** Supprime un jalon avec nettoyage des photos Firebase Storage. */
export async function supprimerJalon(childId: string, id: string) {
  try {
    const event = await obtenirEvenement(childId, id);
    if ((event as any)?.photos && Array.isArray((event as any).photos)) {
      for (const photoUrl of (event as any).photos) {
        if (photoUrl?.startsWith("https://firebasestorage.googleapis.com")) {
          await deletePhotoFromStorage(photoUrl);
        }
      }
    }
  } catch (error) {
    console.error("[SUPPRIMER_JALON] Erreur récupération événement:", error);
  }
  return supprimerEvenement(childId, id);
}
