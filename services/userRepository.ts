// Accès Firestore aux documents rattachés à l'utilisateur : users,
// users_public, subscriptions (lecture seule côté client). Les préférences
// (user_preferences) vivent dans userPreferencesService.ts.
import { doc, getDoc, onSnapshot } from 'firebase/firestore';
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

/** Écoute subscriptions/{uid} (écrit uniquement par le serveur). */
export function listenToSubscriptionDoc(uid: string, onNext: DocNext, onError?: OnError): Unsubscribe {
  return onSnapshot(doc(db, 'subscriptions', uid), onNext, onError);
}
