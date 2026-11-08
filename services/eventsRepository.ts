// Accès Firestore bas niveau à la collection « events » (et aux collections
// eventLikes / eventComments pour l'export RGPD). Les écritures d'événements
// restent dans eventsService.ts.
import {
  collection,
  doc,
  getCountFromServer,
  getDoc,
  getDocs,
  getDocsFromServer,
  limit,
  onSnapshot,
  orderBy,
  query,
  startAfter,
  where,
} from 'firebase/firestore';
import type {
  DocumentData,
  DocumentSnapshot,
  FirestoreError,
  Query,
  QueryConstraint,
  QueryDocumentSnapshot,
  QuerySnapshot,
  Unsubscribe,
} from 'firebase/firestore';
import { db } from '@/config/firebase';

/** Lit un événement par id. */
export function getEventDoc(eventId: string): Promise<DocumentSnapshot<DocumentData>> {
  return getDoc(doc(db, 'events', eventId));
}

/**
 * Requête paginée des événements d'un type (date décroissante). Le curseur
 * (`after`) n'est appliqué que s'il est fourni.
 */
function typedEventsQuery(
  childId: string,
  eventType: string,
  pageSize: number,
  after?: DocumentSnapshot | null,
): Query {
  const constraints: QueryConstraint[] = [
    where('childId', '==', childId),
    where('type', '==', eventType),
    orderBy('date', 'desc'),
    limit(pageSize),
  ];
  if (after) constraints.push(startAfter(after));
  return query(collection(db, 'events'), ...constraints);
}

/** Lit une page d'événements d'un type, après un curseur optionnel. */
export function getTypedEventsPage(
  childId: string,
  eventType: string,
  pageSize: number,
  after?: DocumentSnapshot | null,
): Promise<QuerySnapshot<DocumentData>> {
  return getDocs(typedEventsQuery(childId, eventType, pageSize, after));
}

/** Écoute les N derniers événements d'un type (temps réel). */
export function listenToTypedEvents(
  childId: string,
  eventType: string,
  pageSize: number,
  onNext: (snapshot: QuerySnapshot<DocumentData>) => void,
  onError?: (error: FirestoreError) => void,
): Unsubscribe {
  return onSnapshot(typedEventsQuery(childId, eventType, pageSize), onNext, onError);
}

/** Page de jalons plus anciens que le curseur (galerie). */
export function getMilestonesPageAfter(
  childId: string,
  cursor: DocumentSnapshot,
  pageSize: number,
): Promise<QuerySnapshot<DocumentData>> {
  return getDocs(
    query(
      collection(db, 'events'),
      where('childId', '==', childId),
      where('type', 'in', ['jalon']),
      orderBy('date', 'desc'),
      startAfter(cursor),
      limit(pageSize),
    ),
  );
}

/** Écoute les 100 derniers jalons (par createdAt) d'un enfant (badge notifications). */
export function listenToRecentJalons(
  childId: string,
  onNext: (snapshot: QuerySnapshot<DocumentData>) => void,
  onError?: (error: FirestoreError) => void,
): Unsubscribe {
  return onSnapshot(
    query(
      collection(db, 'events'),
      where('childId', '==', childId),
      where('type', '==', 'jalon'),
      orderBy('createdAt', 'desc'),
      limit(100),
    ),
    onNext,
    onError,
  );
}

/** Taille d'une page de lecture pour l'export. */
export const EXPORT_PAGE_SIZE = 2000;
/**
 * Plafond dur par collection et par enfant (garde-fou mémoire). Au-delà,
 * `truncated` est vrai et l'écran doit l'annoncer : jamais de troncature muette.
 */
export const EXPORT_MAX_DOCS = 100000;

/** Résultat d'une lecture complète pour l'export. */
export interface ExportRead {
  docs: QueryDocumentSnapshot<DocumentData>[];
  /** Vrai si le plafond dur a été atteint alors qu'il restait des documents. */
  truncated: boolean;
}

/**
 * Lit TOUS les documents d'une requête d'égalité, depuis le SERVEUR (jamais le
 * cache : un export hors ligne serait partiel), par pages `startAfter` (ordre
 * implicite par identifiant, aucun index composite requis). Toute erreur
 * (hors ligne, droits) est propagée : pas de résultat partiel.
 */
async function readAllFromServer(
  collectionName: string,
  filters: QueryConstraint[],
): Promise<ExportRead> {
  const docs: QueryDocumentSnapshot<DocumentData>[] = [];
  let cursor: QueryDocumentSnapshot<DocumentData> | null = null;
  const pageQuery = (pageSize: number) =>
    query(
      collection(db, collectionName),
      ...filters,
      ...(cursor ? [startAfter(cursor)] : []),
      limit(pageSize),
    );

  while (docs.length < EXPORT_MAX_DOCS) {
    const pageSize = Math.min(EXPORT_PAGE_SIZE, EXPORT_MAX_DOCS - docs.length);
    const snap = await getDocsFromServer(pageQuery(pageSize));
    docs.push(...snap.docs);
    // Page incomplète : c'était la dernière.
    if (snap.docs.length < pageSize) return { docs, truncated: false };
    cursor = snap.docs[snap.docs.length - 1];
  }
  // Plafond atteint pile : reste-t-il quelque chose derrière ?
  const probe = await getDocsFromServer(pageQuery(1));
  return { docs, truncated: !probe.empty };
}

function eventFilters(childId: string, authorUid?: string | null, type?: string): QueryConstraint[] {
  return [
    where('childId', '==', childId),
    ...(authorUid ? [where('userId', '==', authorUid)] : []),
    ...(type ? [where('type', '==', type)] : []),
  ];
}

/**
 * Événements d'un enfant pour l'export. Parent : tous (sans `authorUid`) ;
 * Proche : seulement ceux qu'il a saisis (`authorUid`). Aucun marqueur de
 * suppression logique n'existe sur les événements (suppression définitive par
 * deleteEventCascade) : rien à exclure.
 */
export function getEventsForExport(
  childId: string,
  options: { authorUid?: string | null; type?: string } = {},
): Promise<ExportRead> {
  return readAllFromServer('events', eventFilters(childId, options.authorUid, options.type));
}

/** J'aime de l'utilisateur sur un enfant, pour l'export. */
export function getLikesForExport(childId: string, userId: string): Promise<ExportRead> {
  return readAllFromServer('eventLikes', eventFilters(childId, userId));
}

/** Commentaires de l'utilisateur sur un enfant, pour l'export. */
export function getCommentsForExport(childId: string, userId: string): Promise<ExportRead> {
  return readAllFromServer('eventComments', eventFilters(childId, userId));
}

async function countFromServer(collectionName: string, filters: QueryConstraint[]): Promise<number> {
  const snap = await getCountFromServer(query(collection(db, collectionName), ...filters));
  return snap.data().count;
}

/**
 * Nombre d'événements d'un type pour l'export (mêmes filtres que
 * getEventsForExport), par agrégation serveur. Échoue hors ligne.
 */
export function countEventsForExport(
  childId: string,
  options: { type: string; authorUid?: string | null },
): Promise<number> {
  return countFromServer('events', eventFilters(childId, options.authorUid, options.type));
}

/** Nombre de j'aime de l'utilisateur sur un enfant (agrégation serveur). */
export function countLikesForExport(childId: string, userId: string): Promise<number> {
  return countFromServer('eventLikes', eventFilters(childId, userId));
}

/** Nombre de commentaires de l'utilisateur sur un enfant (agrégation serveur). */
export function countCommentsForExport(childId: string, userId: string): Promise<number> {
  return countFromServer('eventComments', eventFilters(childId, userId));
}

/**
 * Nombre d'événements d'un enfant (filtré par types si fournis), par agrégation
 * serveur : une lecture facturée par tranche de 1000 entrées d'index, aucun
 * document transféré. Échoue hors ligne (l'appelant ignore alors le jalon).
 */
export async function countChildEvents(childId: string, types?: string[]): Promise<number> {
  const constraints: QueryConstraint[] = [where('childId', '==', childId)];
  if (types && types.length > 0) constraints.push(where('type', 'in', types));
  const snap = await getCountFromServer(query(collection(db, 'events'), ...constraints));
  return snap.data().count;
}

/** Date du plus ancien événement d'un enfant (1 lecture), ou null s'il n'en a aucun. */
export async function getFirstEventDate(childId: string): Promise<Date | null> {
  const snap = await getDocs(
    query(
      collection(db, 'events'),
      where('childId', '==', childId),
      orderBy('date', 'asc'),
      limit(1),
    ),
  );
  if (snap.empty) return null;
  const raw = snap.docs[0].data().date;
  const date =
    raw && typeof raw.toDate === 'function' ? raw.toDate() : raw instanceof Date ? raw : new Date(raw);
  return Number.isNaN(date.getTime()) ? null : date;
}
