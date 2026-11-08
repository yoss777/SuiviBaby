// Accès Firestore aux droits : children/{childId}/access/{userId} (source de
// vérité) et user_child_access/{userId}_{childId} (index par utilisateur).
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocFromServer,
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
import { nowTimestamp } from '@/services/firestoreTimestamps';
import {
  DEFAULT_ROLE_PERMISSIONS,
  type ChildAccessDocument,
  type ChildRole,
} from '@/types/permissions';

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

/** Lit le document d'accès depuis le serveur (jamais le cache) : rôle fiable pour l'export. */
export function getAccessDocFromServer(childId: string, userId: string): Promise<DocumentSnapshot<DocumentData>> {
  return getDocFromServer(accessDocRef(childId, userId));
}

/** Document d'accès typé d'un utilisateur sur un enfant (null s'il n'existe pas). */
export async function getChildAccess(
  childId: string,
  userId: string,
): Promise<ChildAccessDocument | null> {
  const snap = await getDoc(accessDocRef(childId, userId));
  return snap.exists() ? (snap.data() as ChildAccessDocument) : null;
}

/** Tous les documents d'accès d'un enfant, indexés par userId. */
export async function getAllChildAccess(
  childId: string,
): Promise<Record<string, ChildAccessDocument>> {
  const snap = await getDocs(collection(db, 'children', childId, 'access'));
  const accesses: Record<string, ChildAccessDocument> = {};
  snap.forEach((docSnap) => {
    accesses[docSnap.id] = docSnap.data() as ChildAccessDocument;
  });
  return accesses;
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

// ============================================
// ÉCRITURES D'ACCÈS (anciennement dans utils/permissions.ts)
// ============================================

/**
 * Accorde l'accès à un utilisateur pour un enfant : document d'accès (rôle et
 * droits par défaut) puis entrée d'index user_child_access.
 */
export async function grantChildAccess(
  childId: string,
  userId: string,
  role: ChildRole,
  grantedBy: string,
  options?: {
    invitationId?: string;
    customPermissions?: Partial<
      Pick<ChildAccessDocument, 'canWriteEvents' | 'canWriteLikes' | 'canWriteComments'>
    >;
  },
): Promise<void> {
  try {
    // Permissions par défaut selon le rôle
    const defaultPermissions = DEFAULT_ROLE_PERMISSIONS[role];

    const accessDoc: ChildAccessDocument = {
      userId,
      role,
      canWriteEvents:
        options?.customPermissions?.canWriteEvents ?? defaultPermissions.canWriteEvents,
      canWriteLikes:
        options?.customPermissions?.canWriteLikes ?? defaultPermissions.canWriteLikes,
      canWriteComments:
        options?.customPermissions?.canWriteComments ?? defaultPermissions.canWriteComments,
      grantedBy,
      grantedAt: nowTimestamp(),
      ...(options?.invitationId && { invitationId: options.invitationId }),
    };

    await setAccessDoc(childId, userId, accessDoc);
    await mergeAccessIndex(userId, childId, {
      userId,
      childId,
      invitationId: options?.invitationId ?? null,
      grantedBy,
      grantedAt: nowTimestamp(),
    });
  } catch (error) {
    console.error('Error granting child access:', error);
    throw error;
  }
}

/**
 * Met à jour le rôle d'un utilisateur pour un enfant.
 *
 * Sprint 12.6 : les règles Firestore refusent désormais cette écriture côté
 * client ; l'app passe par setMemberRole (childSharingService). Conservée pour
 * scripts/testPermissions.ts et ses tests.
 */
export async function updateChildAccess(
  childId: string,
  userId: string,
  updates: Partial<ChildAccessDocument>,
): Promise<void> {
  try {
    // A role change resets the write flags to that role's defaults; otherwise
    // a member demoted to viewer would keep canWriteEvents/Likes/Comments.
    const roleDefaults = updates.role
      ? (({ role: _role, ...flags }) => flags)(DEFAULT_ROLE_PERMISSIONS[updates.role])
      : {};
    await updateAccessDoc(childId, userId, { ...roleDefaults, ...updates });
  } catch (error) {
    console.error('Error updating child access:', error);
    throw error;
  }
}

/** Révoque l'accès d'un utilisateur pour un enfant (document + index). */
export async function revokeChildAccess(childId: string, userId: string): Promise<void> {
  try {
    await deleteAccessDoc(childId, userId);
    await deleteAccessIndex(userId, childId);
  } catch (error) {
    console.error('Error revoking child access:', error);
    throw error;
  }
}

/** Crée l'accès owner lors de la création d'un enfant. */
export async function createOwnerAccess(childId: string, ownerId: string): Promise<void> {
  await grantChildAccess(childId, ownerId, 'owner', ownerId);
}
