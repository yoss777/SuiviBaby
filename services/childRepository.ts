// Accès Firestore à l'agrégat « children/{childId} » (document enfant).
// Les accès/permissions vivent dans accessRepository.ts.
import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocFromServer,
  onSnapshot,
  updateDoc,
} from 'firebase/firestore';
import type {
  DocumentData,
  DocumentSnapshot,
  FirestoreError,
  Unsubscribe,
} from 'firebase/firestore';
import { db } from '@/config/firebase';

/** Lit le document d'un enfant. */
export function getChildDoc(childId: string): Promise<DocumentSnapshot<DocumentData>> {
  return getDoc(doc(db, 'children', childId));
}

/** Lit le document d'un enfant depuis le serveur (jamais le cache) : export. */
export function getChildDocFromServer(childId: string): Promise<DocumentSnapshot<DocumentData>> {
  return getDocFromServer(doc(db, 'children', childId));
}

/** Écoute le document d'un enfant (même sémantique que onSnapshot). */
export function listenToChildDoc(
  childId: string,
  onNext: (snapshot: DocumentSnapshot<DocumentData>) => void,
  onError?: (error: FirestoreError) => void,
): Unsubscribe {
  return onSnapshot(doc(db, 'children', childId), onNext, onError);
}

/** Met à jour des champs du document enfant (nom, allergies…). */
export function updateChildDoc(childId: string, data: DocumentData): Promise<void> {
  return updateDoc(doc(db, 'children', childId), data);
}

/** Crée un document enfant et retourne son id. */
export async function createChildDoc(data: DocumentData): Promise<string> {
  const ref = await addDoc(collection(db, 'children'), data);
  return ref.id;
}
