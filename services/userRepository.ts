// Accès Firestore aux documents rattachés à l'utilisateur : users,
// users_public, user_preferences, subscriptions (lecture seule côté client).
import { doc, getDoc, onSnapshot, setDoc } from 'firebase/firestore';
import type {
  DocumentData,
  DocumentSnapshot,
  FirestoreError,
  Unsubscribe,
} from 'firebase/firestore';
import { db } from '@/config/firebase';

type DocNext = (snapshot: DocumentSnapshot<DocumentData>) => void;
type OnError = (error: FirestoreError) => void;

/** Lit users/{uid}. */
export function getUserDoc(uid: string): Promise<DocumentSnapshot<DocumentData>> {
  return getDoc(doc(db, 'users', uid));
}

/** Lit users_public/{uid} (profil public). */
export function getPublicUserDoc(uid: string): Promise<DocumentSnapshot<DocumentData>> {
  return getDoc(doc(db, 'users_public', uid));
}

/** Lit user_preferences/{uid}. */
export function getUserPreferencesDoc(uid: string): Promise<DocumentSnapshot<DocumentData>> {
  return getDoc(doc(db, 'user_preferences', uid));
}

/** Écoute user_preferences/{uid}. */
export function listenToUserPreferencesDoc(uid: string, onNext: DocNext, onError?: OnError): Unsubscribe {
  return onSnapshot(doc(db, 'user_preferences', uid), onNext, onError);
}

/** Écrit (merge) user_preferences/{uid}. */
export function mergeUserPreferences(uid: string, data: DocumentData): Promise<void> {
  return setDoc(doc(db, 'user_preferences', uid), data, { merge: true });
}

/** Écoute subscriptions/{uid} (écrit uniquement par le serveur). */
export function listenToSubscriptionDoc(uid: string, onNext: DocNext, onError?: OnError): Unsubscribe {
  return onSnapshot(doc(db, 'subscriptions', uid), onNext, onError);
}
