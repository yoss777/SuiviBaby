// services/eventsService.ts
// Service unifié pour TOUS les types d'événements
import {
  collection,
  doc,
  getDoc,
  getDocs,
  getDocsFromServer,
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
import { addBreadcrumb, captureServiceError } from "@/utils/errorReporting";
import { generateIdempotencyKey } from "@/utils/idempotencyKey";
import { isConflictError, isNetworkError, isNotFoundError } from "@/utils/networkError";
import { getTodayTypes } from "@/services/todayEventsCache";
import { enqueueEvent, isOnline } from "./offlineQueueService";
import {
  addOptimisticCreate,
  addOptimisticUpdate,
  confirmOptimistic,
  failOptimistic,
  generateTempId,
  markOptimisticQueued,
  notifyOptimisticFailure,
  setOptimisticInFlight,
  updateOptimisticCreate,
  type OptimisticFailure,
} from "./optimisticEventsStore";

const getUserId = () => {
  const user = auth.currentUser;
  if (!user) throw new Error("Utilisateur non connecté");
  return user.uid;
};

const pendingOptimisticCreateUpdates = new Map<
  string,
  { childId: string; data: Partial<Event>; previousEvent: any }
>();

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

// Domain types live in services/events/types.ts. Re-export so existing
// callers `import { Event, EventType, JalonEvent, ... } from
// "@/services/eventsService"` continue to work without churn.
export type {
  ActiviteEvent,
  BainEvent,
  BaseEvent,
  BiberonEvent,
  CoucheEvent,
  CroissanceEvent,
  Event,
  EventType,
  JalonEvent,
  MedicamentEvent,
  MictionEvent,
  NettoyageNezEvent,
  PompageEvent,
  SelleEvent,
  SolideEvent,
  SommeilEvent,
  SymptomeEvent,
  TeteeEvent,
  TemperatureEvent,
  VaccinEvent,
  VitamineEvent,
} from "./events/types";
import type {
  ActiviteEvent,
  BainEvent,
  BiberonEvent,
  CoucheEvent,
  CroissanceEvent,
  Event,
  EventType,
  JalonEvent,
  MedicamentEvent,
  MictionEvent,
  NettoyageNezEvent,
  PompageEvent,
  SelleEvent,
  SolideEvent,
  SommeilEvent,
  SymptomeEvent,
  TeteeEvent,
  TemperatureEvent,
  VaccinEvent,
  VitamineEvent,
} from "./events/types";

// ============================================
// CRUD UNIFIÉ
// ============================================

const COLLECTION_NAME = "events";

/** "queued" : hors ligne, la suppression partira à la reconnexion. */
export type DeleteOutcome = "deleted" | "queued";

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
  expectedUpdatedAt?: number,
) {
  const cleanData = stripUndefinedFields(data as Record<string, unknown>);
  const convertedData = convertDateFields(cleanData) as typeof cleanData;
  const payload: Record<string, unknown> = {
    ...convertedData,
    childId,
    eventId: id,
  };

  // Optional optimistic lock token (T2.2). The server compares this against
  // the current event.updatedAt and rejects with "aborted" on mismatch.
  if (typeof expectedUpdatedAt === "number" && Number.isFinite(expectedUpdatedAt)) {
    payload.expectedUpdatedAt = expectedUpdatedAt;
  }

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
  // La clé est fixée AVANT la mise en file : le rejeu hors ligne et un éventuel
  // nouvel essai envoient la même, le serveur ne crée l'événement qu'une fois.
  const payload = buildCreatePayload(childId, {
    ...data,
    idempotencyKey:
      (data as { idempotencyKey?: string }).idempotencyKey ??
      generateIdempotencyKey(auth.currentUser?.uid),
  });

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
    source?: "default" | "server";
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

    const snapshot =
      options?.source === "server" ? await getDocsFromServer(q) : await getDocs(q);
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

// Per-snapshot listener traces: development only (they ran on every snapshot
// of every listener in production).
const listenerLog: (message: string) => void = __DEV__
  ? (message) => console.log(message)
  : () => {};

/**
 * Écoute les événements en temps réel
 */
/**
 * permission-denied est attendu quand l'accès à l'enfant vient de disparaître
 * (suppression demandée : le serveur retire tous les accès, partage retiré)
 * alors qu'un écran l'écoute encore. Dans ce cas : simple trace. Si l'accès
 * existe toujours, c'est une vraie erreur de règle : signalée avec contexte.
 */
async function reportListenerError(error: unknown, childId: string, types: string) {
  const extra = { childId, types };
  const code = (error as { code?: string } | null)?.code;
  if (code === "permission-denied" && auth.currentUser) {
    try {
      const access = await getDoc(
        doc(db, "children", childId, "access", auth.currentUser.uid),
      );
      if (!access.exists()) {
        addBreadcrumb("events", "listener stopped: child access removed", extra, "info");
        return;
      }
    } catch {
      // Access unreadable: report the original error below.
    }
  }
  captureServiceError(error, { service: "events", operation: "ecouterEvenements", extra });
}

export function ecouterEvenements(
  childId: string,
  callback: (events: Event[]) => void,
  options?: {
    type?: EventType | EventType[];
    limite?: number;
    depuis?: Date;
    jusqu?: Date;
    waitForServer?: boolean;
    /**
     * With waitForServer: deliver a non-empty cache snapshot at once (the
     * server snapshot follows), and only wait for the server when the cache
     * is empty, to avoid flashing an empty state. Used by the stats screen.
     */
    cacheFirst?: boolean;
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
  listenerLog(`[L:${lid}] SETUP type=${tl} wfs=${!!options?.waitForServer} imc=${!!options?.waitForServer}`);

  const unsubscribe = onSnapshot(
    q,
    { includeMetadataChanges: !!options?.waitForServer },
    (snapshot) => {
      listenerLog(`[L:${lid}] SNAP type=${tl} sz=${snapshot.size} empty=${snapshot.empty} cache=${snapshot.metadata.fromCache} server=${hasReceivedServerSnapshot} fb=${fallbackTriggered}`);

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
        !(options.cacheFirst && events.length > 0)
      ) {
        listenerLog(`[L:${lid}] CACHE waiting for server`);
        if (!fallbackTimer && !fallbackTriggered) {
          fallbackTimer = setTimeout(() => {
            listenerLog(`[L:${lid}] FALLBACK after ${waitForServerTimeoutMs}ms server=${hasReceivedServerSnapshot}`);
            if (!hasReceivedServerSnapshot) {
              fallbackTriggered = true;
              listenerLog(`[L:${lid}] CB ${cachedEvents?.length ?? 0} cached events`);
              callback(cachedEvents ?? []);
            }
          }, waitForServerTimeoutMs);
        }
        return;
      }

      listenerLog(`[L:${lid}] CB ${events.length} events`);
      callback(events);
    },
    (error) => {
      console.error(`[L:${lid}] ERROR:`, error);
      reportListenerError(error, childId, tl);
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
 * Modifie un événement via Cloud Function (validation serveur).
 * `expectedUpdatedAt` (millis) permet d'activer le verrou optimiste T2.2 :
 * la CF refuse l'écriture si le serveur a un updatedAt plus récent.
 */
export async function modifierEvenement(
  childId: string,
  id: string,
  data: Partial<Event>,
  expectedUpdatedAt?: number,
): Promise<void> {
  const payload = buildUpdatePayload(childId, id, data, expectedUpdatedAt);

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
): Promise<DeleteOutcome> {
  // Si offline, mettre en queue : la suppression n'est PAS faite, l'appelant
  // doit le dire (« synchronisation en attente »).
  const online = await isOnline();
  if (!online) {
    await enqueueEvent("delete", { childId, eventId: id });
    return "queued";
  }

  const deleteEvent = httpsCallable<
    { childId: string; eventId: string },
    { success: boolean; deleted: { event: number; likes: number; comments: number } }
  >(functions, "deleteEventCascade");

  try {
    await deleteEvent({ childId, eventId: id });
  } catch (error) {
    // Suppression idempotente : « introuvable » = l'événement n'existe plus
    // (un envoi précédent a abouti, ou un autre appareil l'a supprimé).
    if (!isNotFoundError(error)) throw error;
  }
  return "deleted";
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
// 24h aggregation lives in services/events/stats.ts. Re-export so the
// existing public API remains stable.
export { obtenirStats24h } from "./events/stats";
export type { Stats24h } from "./events/stats";

// ============================================
// OPTIMISTIC UI WRAPPERS
// ============================================

// Retry helper: 2 retries with increasing delay (1s, 3s)
const RETRY_DELAYS = [1000, 3000];

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
 * Rappels optionnels d'une écriture optimiste (nettoyage de photo téléversée,
 * par exemple). `onConfirmed` : le serveur a accepté l'écriture (jamais appelé
 * pour une écriture mise en file hors ligne). `onFailed` : refus définitif ou
 * mise en file impossible.
 */
export interface OptimisticWriteOptions {
  onConfirmed?: () => void;
  onFailed?: (error: unknown) => void;
  /** false : « Réessayer » n'a pas de sens (ex. photo supprimée après l'échec). */
  retryable?: boolean;
}

function runCallback(fn: (() => void) | undefined, operation: string) {
  try {
    fn?.();
  } catch (error) {
    captureServiceError(error, { service: "events", operation });
  }
}

/**
 * L'écriture n'a pu ni partir ni être mise en file : la signaler (entrée
 * annulée, message avec le type, Sentry) au lieu de la laisser croire réussie.
 */
function failWrite(
  operation: "create" | "update",
  operationId: string,
  error: unknown,
  eventType: unknown,
  options: OptimisticWriteOptions | undefined,
  retryable: boolean,
  /** De quoi reconstruire l'échec si l'entrée optimiste a disparu entre-temps. */
  fallback: { childId: string; eventId?: string; retryData: any; previousEvent?: any },
) {
  captureServiceError(error, {
    service: "events",
    operation: operation === "create" ? "ajouterEvenementOptimistic" : "modifierEvenementOptimistic",
    extra: { eventType: typeof eventType === "string" ? eventType : null },
  });
  const canRetry = retryable && options?.retryable !== false;
  const failure = failOptimistic(operationId, { retryable: canRetry });
  if (!failure) {
    // Entrée déjà retirée (purge, réconciliation) : l'utilisateur doit quand
    // même savoir que l'écriture a échoué, avec de quoi la refaire.
    notifyOptimisticFailure({
      operation,
      eventType: typeof eventType === "string" ? eventType : null,
      childId: fallback.childId,
      eventId: operation === "update" ? fallback.eventId : undefined,
      retryData: fallback.retryData,
      previousEvent: fallback.previousEvent,
      event: operation === "update" ? fallback.previousEvent : fallback.retryData,
      retryable: canRetry,
    });
  }
  runCallback(() => options?.onFailed?.(error), "onFailed");
}

/**
 * Ajoute un événement avec affichage optimiste immédiat.
 * Retourne un tempId synchrone ; le CF tourne en arrière-plan avec 2 retries.
 */
export function ajouterEvenementOptimistic(
  childId: string,
  data: any,
  options?: OptimisticWriteOptions,
): string {
  const tempId = generateTempId();
  // Idempotency key: if the CF succeeds but the response is lost, retries
  // (and the offline replay) send the same key — the server deduplicates
  // instead of creating a second event.
  const idempotencyKey: string =
    data?.idempotencyKey ?? generateIdempotencyKey(auth.currentUser?.uid);
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

  const createFallback = { childId, retryData: optimisticEvent };
  // En vol : l'entrée n'est pas purgée comme « périmée » pendant les essais.
  setOptimisticInFlight(tempId, true);

  void (async () => {
    try {
      if (!(await isOnline())) {
        await enqueueEvent('create', payload);
        markOptimisticQueued(tempId);
        return;
      }

      const realId = await withRetry(() => callCreateEventCF(payload));
      confirmOptimistic(tempId, realId);
      runCallback(options?.onConfirmed, "onConfirmed");
      const pendingUpdate = pendingOptimisticCreateUpdates.get(tempId);
      if (pendingUpdate) {
        pendingOptimisticCreateUpdates.delete(tempId);
        modifierEvenementOptimistic(
          pendingUpdate.childId,
          realId,
          pendingUpdate.data,
          { ...pendingUpdate.previousEvent, id: realId },
        );
      }
    } catch (error) {
      if (isNetworkError(error)) {
        try {
          await enqueueEvent('create', payload);
          markOptimisticQueued(tempId);
        } catch (enqueueError) {
          // Ni envoyée ni mise en file : ne surtout pas la laisser affichée
          // comme enregistrée.
          pendingOptimisticCreateUpdates.delete(tempId);
          failWrite("create", tempId, enqueueError, data?.type, options, true, createFallback);
        }
        return;
      }
      pendingOptimisticCreateUpdates.delete(tempId);
      failWrite("create", tempId, error, data?.type, options, true, createFallback);
    } finally {
      setOptimisticInFlight(tempId, false);
    }
  })();

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
  expectedUpdatedAt?: number,
  options?: OptimisticWriteOptions,
): string {
  const cleanData = stripUndefinedFields(
    data as Record<string, unknown>,
  ) as Partial<Event>;
  const updatedEvent = convertDateFields({
    ...cleanData,
    id: eventId,
    childId,
  });

  if (eventId.startsWith("__optimistic_")) {
    const updated = updateOptimisticCreate(eventId, updatedEvent);
    if (updated) {
      pendingOptimisticCreateUpdates.set(eventId, {
        childId,
        data: cleanData,
        previousEvent,
      });
    }
    return eventId;
  }

  const operationId = addOptimisticUpdate(
    eventId,
    childId,
    updatedEvent,
    previousEvent,
  );

  const payload = buildUpdatePayload(childId, eventId, cleanData, expectedUpdatedAt);
  const eventType = previousEvent?.type ?? (cleanData as { type?: unknown }).type;

  const updateFallback = {
    childId,
    eventId,
    retryData: updatedEvent,
    previousEvent,
  };
  setOptimisticInFlight(operationId, true);

  void (async () => {
    try {
      if (!(await isOnline())) {
        await enqueueEvent('update', payload as Record<string, unknown>);
        markOptimisticQueued(operationId);
        return;
      }

      await withRetry(() => callUpdateEventCF(payload as Record<string, unknown>));
      confirmOptimistic(operationId);
      runCallback(options?.onConfirmed, "onConfirmed");
    } catch (error) {
      if (isNetworkError(error)) {
        try {
          await enqueueEvent('update', payload as Record<string, unknown>);
          markOptimisticQueued(operationId);
        } catch (enqueueError) {
          failWrite("update", operationId, enqueueError, eventType, options, true, updateFallback);
        }
        return;
      }
      // Conflit de version : le même envoi échouera toujours, « Réessayer »
      // écraserait la modification faite ailleurs.
      failWrite("update", operationId, error, eventType, options, !isConflictError(error), updateFallback);
    } finally {
      setOptimisticInFlight(operationId, false);
    }
  })();

  return operationId;
}

/**
 * « Réessayer » après un échec signalé par failOptimistic : renvoie les données
 * conservées. Une création garde sa clé d'idempotence (si elle était partie
 * malgré tout, le serveur ne la double pas).
 */
export function retryFailedOptimistic(failure: OptimisticFailure): void {
  if (!failure.retryable) return;
  const { id: _id, userId: _userId, createdAt: _createdAt, childId: _childId, ...data } =
    failure.retryData ?? {};
  if (failure.operation === "create") {
    ajouterEvenementOptimistic(failure.childId, data);
    return;
  }
  if (!failure.eventId) return;
  modifierEvenementOptimistic(
    failure.childId,
    failure.eventId,
    data,
    failure.previousEvent ?? failure.event,
  );
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

// Photo / jalon cleanup helpers live in services/events/photoCleanup.ts.
export {
  deletePhotoFromStorage,
  supprimerJalon,
} from "./events/photoCleanup";
