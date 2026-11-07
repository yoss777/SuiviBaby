// Accès Firestore bas niveau à la collection « events » (et aux collections
// eventLikes / eventComments pour l'export RGPD). Les écritures d'événements
// restent dans eventsService.ts.
import {
  collection,
  doc,
  getCountFromServer,
  getDoc,
  getDocs,
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

const EXPORT_LIMIT = 10000;

/** Événements d'un enfant pour l'export : tous, ou seulement ceux de l'utilisateur. */
export function getEventsForExport(
  childId: string,
  userId: string,
  seesAllEvents: boolean,
): Promise<QuerySnapshot<DocumentData>> {
  return getDocs(
    query(
      collection(db, 'events'),
      where('childId', '==', childId),
      ...(seesAllEvents ? [] : [where('userId', '==', userId)]),
      limit(EXPORT_LIMIT),
    ),
  );
}

/** J'aime de l'utilisateur sur un enfant, pour l'export. */
export function getLikesForExport(childId: string, userId: string): Promise<QuerySnapshot<DocumentData>> {
  return getDocs(
    query(
      collection(db, 'eventLikes'),
      where('childId', '==', childId),
      where('userId', '==', userId),
      limit(EXPORT_LIMIT),
    ),
  );
}

/** Commentaires de l'utilisateur sur un enfant, pour l'export. */
export function getCommentsForExport(childId: string, userId: string): Promise<QuerySnapshot<DocumentData>> {
  return getDocs(
    query(
      collection(db, 'eventComments'),
      where('childId', '==', childId),
      where('userId', '==', userId),
      limit(EXPORT_LIMIT),
    ),
  );
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
