import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  Timestamp,
  collection,
  collectionGroup,
  getDocs,
  query,
  where,
} from 'firebase/firestore';
import { db } from '@/config/firebase';
import {
  ChildRole,
  ChildAccessDocument,
  ChildPermissions,
  DEFAULT_ROLE_PERMISSIONS,
} from '@/types/permissions';

/**
 * Récupère les permissions d'un utilisateur pour un enfant
 */
export async function getUserChildAccess(
  childId: string,
  userId: string
): Promise<ChildAccessDocument | null> {
  try {
    const accessRef = doc(db, 'children', childId, 'access', userId);
    const accessSnap = await getDoc(accessRef);

    if (!accessSnap.exists()) {
      return null;
    }

    return accessSnap.data() as ChildAccessDocument;
  } catch (error) {
    console.error('Error fetching child access:', error);
    throw error;
  }
}

/**
 * Calcule les permissions effectives à partir d'un document d'accès
 */
export function calculatePermissions(
  accessDoc: ChildAccessDocument | null
): ChildPermissions {
  if (!accessDoc) {
    return {
      hasAccess: false,
      role: null,
      canRead: false,
      canWriteEvents: false,
      canWriteLikes: false,
      canWriteComments: false,
      canManageAccess: false,
      loading: false,
    };
  }

  const { role, canWriteEvents, canWriteLikes, canWriteComments } = accessDoc;

  return {
    hasAccess: true,
    role,
    canRead: true, // Tous les rôles peuvent lire
    canWriteEvents,
    canWriteLikes,
    canWriteComments,
    canManageAccess: role === 'owner',
    loading: false,
  };
}

/**
 * Accorde l'accès à un utilisateur pour un enfant
 */
export async function grantChildAccess(
  childId: string,
  userId: string,
  role: ChildRole,
  grantedBy: string,
  options?: {
    invitationId?: string;
    customPermissions?: Partial<Pick<ChildAccessDocument, 'canWriteEvents' | 'canWriteLikes' | 'canWriteComments'>>;
  }
): Promise<void> {
  try {
    const accessRef = doc(db, 'children', childId, 'access', userId);
    const indexRef = doc(db, 'user_child_access', `${userId}_${childId}`);

    // Permissions par défaut selon le rôle
    const defaultPermissions = DEFAULT_ROLE_PERMISSIONS[role];

    const accessDoc: ChildAccessDocument = {
      userId,
      role,
      canWriteEvents: options?.customPermissions?.canWriteEvents ?? defaultPermissions.canWriteEvents,
      canWriteLikes: options?.customPermissions?.canWriteLikes ?? defaultPermissions.canWriteLikes,
      canWriteComments: options?.customPermissions?.canWriteComments ?? defaultPermissions.canWriteComments,
      grantedBy,
      grantedAt: Timestamp.now(),
      ...(options?.invitationId && { invitationId: options.invitationId }),
    };

    await setDoc(accessRef, accessDoc);
    await setDoc(indexRef, {
      userId,
      childId,
      invitationId: options?.invitationId ?? null,
      grantedBy,
      grantedAt: Timestamp.now(),
    }, { merge: true });
  } catch (error) {
    console.error('Error granting child access:', error);
    throw error;
  }
}

/**
 * Met à jour le rôle d'un utilisateur pour un enfant
 */
export async function updateChildAccess(
  childId: string,
  userId: string,
  updates: Partial<ChildAccessDocument>
): Promise<void> {
  try {
    const accessRef = doc(db, 'children', childId, 'access', userId);
    await updateDoc(accessRef, updates);
  } catch (error) {
    console.error('Error updating child access:', error);
    throw error;
  }
}

/**
 * Révoque l'accès d'un utilisateur pour un enfant
 */
export async function revokeChildAccess(
  childId: string,
  userId: string
): Promise<void> {
  try {
    const accessRef = doc(db, 'children', childId, 'access', userId);
    const indexRef = doc(db, 'user_child_access', `${userId}_${childId}`);
    await deleteDoc(accessRef);
    await deleteDoc(indexRef);
  } catch (error) {
    console.error('Error revoking child access:', error);
    throw error;
  }
}

/**
 * Récupère tous les accès pour un enfant
 */
export async function getAllChildAccess(
  childId: string
): Promise<Record<string, ChildAccessDocument>> {
  try {
    const accessCollectionRef = collection(db, 'children', childId, 'access');
    const accessSnap = await getDocs(accessCollectionRef);

    const accesses: Record<string, ChildAccessDocument> = {};
    accessSnap.forEach((doc) => {
      accesses[doc.id] = doc.data() as ChildAccessDocument;
    });

    return accesses;
  } catch (error) {
    console.error('Error fetching all child access:', error);
    throw error;
  }
}

/**
 * Vérifie si un utilisateur a une permission spécifique
 */
export function hasPermission(
  permissions: ChildPermissions,
  permission: keyof Omit<ChildPermissions, 'hasAccess' | 'role' | 'loading' | 'error'>
): boolean {
  return permissions[permission] === true;
}

/**
 * Crée l'accès owner lors de la création d'un enfant
 */
export async function createOwnerAccess(
  childId: string,
  ownerId: string
): Promise<void> {
  await grantChildAccess(childId, ownerId, 'owner', ownerId);
}

/**
 * Récupère la liste des childIds accessibles par un utilisateur
 */
export async function getAccessibleChildIds(userId: string): Promise<string[]> {
  const q = query(
    collection(db, 'user_child_access'),
    where('userId', '==', userId)
  );
  const snapshot = await getDocs(q);

  const ids = new Set<string>();
  snapshot.docs.forEach((docSnap) => {
    const data = docSnap.data() as { childId?: string };
    if (data.childId) ids.add(data.childId);
  });

  return Array.from(ids.values());
}
