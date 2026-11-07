// Aides Timestamp Firestore pour la couche UI : l'UI n'importe jamais
// `firebase/firestore` (règle ESLint no-restricted-imports), seul le type
// (`import type`) reste autorisé.
import { Timestamp } from 'firebase/firestore';

/** Timestamp Firestore à partir d'une Date. */
export function timestampFromDate(date: Date): Timestamp {
  return Timestamp.fromDate(date);
}

/** Timestamp Firestore « maintenant ». */
export function nowTimestamp(): Timestamp {
  return Timestamp.now();
}

/** Vrai si la valeur est un Timestamp Firestore (instanceof). */
export function isFirestoreTimestamp(value: unknown): value is Timestamp {
  return value instanceof Timestamp;
}
