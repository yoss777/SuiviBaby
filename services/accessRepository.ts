// Accès Firestore aux droits : children/{childId}/access/{userId} (source de
// vérité) et user_child_access/{userId}_{childId} (index par utilisateur).
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  query,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';
import type {
  DocumentData,
  DocumentSnapshot,
  FirestoreError,
  QuerySnapshot,
  Unsubscribe,
} from 'firebase/firestore';
import { db } from '@/config/firebase';

const accessDocRef = (childId: string, userId: string) =>
  doc(db, 'children', childId, 'access', userId);
const accessIndexRef = (userId: string, childId: string) =>
  doc(db, 'user_child_access', `${userId}_${childId}`);
const userAccessIndexQuery = (userId: string) =>
  query(collection(db, 'user_child_access'), where('userId', '==', userId), limit(200));

/** Lit le document d'accès d'un utilisateur sur un enfant. */
export function getAccessDoc(childId: string, userId: string): Promise<DocumentSnapshot<DocumentData>> {
  return getDoc(accessDocRef(childId, userId));
}

/** Lit tous les documents d'accès d'un enfant. */
export function getAccessDocs(childId: string): Promise<QuerySnapshot<DocumentData>> {
  return getDocs(collection(db, 'children', childId, 'access'));
}

/** Écoute le document d'accès d'un utilisateur sur un enfant. */
export function listenToAccessDoc(
  childId: string,
  userId: string,
  onNext: (snapshot: DocumentSnapshot<DocumentData>) => void,
  onError?: (error: FirestoreError) => void,
): Unsubscribe {
  return onSnapshot(accessDocRef(childId, userId), onNext, onError);
}

/** Écoute tous les documents d'accès d'un enfant. */
export function listenToAccessCollection(
  childId: string,
  onNext: (snapshot: QuerySnapshot<DocumentData>) => void,
  onError?: (error: FirestoreError) => void,
): Unsubscribe {
  return onSnapshot(collection(db, 'children', childId, 'access'), onNext, onError);
}

/** Écoute l'index user_child_access d'un utilisateur (200 max). */
export function listenToUserAccessIndex(
  userId: string,
  onNext: (snapshot: QuerySnapshot<DocumentData>) => void,
  onError?: (error: FirestoreError) => void,
): Unsubscribe {
  return onSnapshot(userAccessIndexQuery(userId), onNext, onError);
}

/** Lit l'index user_child_access d'un utilisateur (200 max). */
export function getUserAccessIndex(userId: string): Promise<QuerySnapshot<DocumentData>> {
  return getDocs(userAccessIndexQuery(userId));
}

/** Écrit le document d'accès. */
export function setAccessDoc(childId: string, userId: string, data: DocumentData): Promise<void> {
  return setDoc(accessDocRef(childId, userId), data);
}

/** Met à jour le document d'accès. */
export function updateAccessDoc(childId: string, userId: string, data: DocumentData): Promise<void> {
  return updateDoc(accessDocRef(childId, userId), data);
}

/** Supprime le document d'accès. */
export function deleteAccessDoc(childId: string, userId: string): Promise<void> {
  return deleteDoc(accessDocRef(childId, userId));
}

/** Écrit (merge) l'entrée d'index user_child_access. */
export function mergeAccessIndex(userId: string, childId: string, data: DocumentData): Promise<void> {
  return setDoc(accessIndexRef(userId, childId), data, { merge: true });
}

/** Supprime l'entrée d'index user_child_access. */
export function deleteAccessIndex(userId: string, childId: string): Promise<void> {
  return deleteDoc(accessIndexRef(userId, childId));
}
