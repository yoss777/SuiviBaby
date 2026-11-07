// Accès Firestore aux demandes de suppression d'enfant (childDeletionRequests).
import { arrayUnion, collection, doc, limit, onSnapshot, query, updateDoc, where } from 'firebase/firestore';
import type {
  DocumentData,
  FirestoreError,
  QuerySnapshot,
  Unsubscribe,
} from 'firebase/firestore';
import { db } from '@/config/firebase';

/** Écoute les demandes dont l'utilisateur est propriétaire (limite optionnelle). */
export function listenToOwnerDeletionRequests(
  ownerId: string,
  onNext: (snapshot: QuerySnapshot<DocumentData>) => void,
  onError?: (error: FirestoreError) => void,
  maxResults?: number,
): Unsubscribe {
  const q = query(
    collection(db, 'childDeletionRequests'),
    where('ownerIds', 'array-contains', ownerId),
    ...(maxResults !== undefined ? [limit(maxResults)] : []),
  );
  return onSnapshot(q, onNext, onError);
}

/** Marque une demande comme vue par l'utilisateur (seenByUserIds). */
export function markDeletionRequestSeen(requestId: string, userId: string): Promise<void> {
  return updateDoc(doc(db, 'childDeletionRequests', requestId), {
    seenByUserIds: arrayUnion(userId),
  });
}
