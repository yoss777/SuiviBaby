import {
  ChildAccessDocument,
  ChildPermissions,
  ChildRole,
  DEFAULT_ROLE_PERMISSIONS,
} from "@/types/permissions";
import {
  deleteAccessDoc,
  deleteAccessIndex,
  getAccessDoc,
  getAccessDocs,
  getUserAccessIndex,
  mergeAccessIndex,
  setAccessDoc,
  updateAccessDoc,
} from "@/services/accessRepository";
import { nowTimestamp } from "@/services/firestoreTimestamps";

import { canManageEvents } from "@/utils/eventPermissions";

/**
 * Récupère les permissions d'un utilisateur pour un enfant
 */
export async function getUserChildAccess(
  childId: string,
  userId: string,
): Promise<ChildAccessDocument | null> {
  try {
    const accessSnap = await getAccessDoc(childId, userId);

    if (!accessSnap.exists()) {
      return null;
    }

    return accessSnap.data() as ChildAccessDocument;
  } catch (error) {
    console.error("Error fetching child access:", error);
    throw error;
  }
}

/**
 * Calcule les permissions effectives à partir d'un document d'accès
 */
export function calculatePermissions(
  accessDoc: ChildAccessDocument | null,
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

  const { role, canWriteLikes, canWriteComments } = accessDoc;

  return {
    hasAccess: true,
    role,
    canRead: true, // Tous les rôles peuvent lire
    // Derived from the role, not from the stored flag: a contributor can no
    // longer write events even if an older access document says so.
    canWriteEvents: canManageEvents(role),
    canWriteLikes,
    canWriteComments,
    canManageAccess: role === "owner",
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
    customPermissions?: Partial<
      Pick<
        ChildAccessDocument,
        "canWriteEvents" | "canWriteLikes" | "canWriteComments"
      >
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
        options?.customPermissions?.canWriteEvents ??
        defaultPermissions.canWriteEvents,
      canWriteLikes:
        options?.customPermissions?.canWriteLikes ??
        defaultPermissions.canWriteLikes,
      canWriteComments:
        options?.customPermissions?.canWriteComments ??
        defaultPermissions.canWriteComments,
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
    console.error("Error granting child access:", error);
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
    console.error("Error updating child access:", error);
    throw error;
  }
}

/**
 * Révoque l'accès d'un utilisateur pour un enfant
 */
export async function revokeChildAccess(
  childId: string,
  userId: string,
): Promise<void> {
  try {
    await deleteAccessDoc(childId, userId);
    await deleteAccessIndex(userId, childId);
  } catch (error) {
    console.error("Error revoking child access:", error);
    throw error;
  }
}

/**
 * Récupère tous les accès pour un enfant
 */
export async function getAllChildAccess(
  childId: string,
): Promise<Record<string, ChildAccessDocument>> {
  try {
    const accessSnap = await getAccessDocs(childId);

    const accesses: Record<string, ChildAccessDocument> = {};
    accessSnap.forEach((doc) => {
      accesses[doc.id] = doc.data() as ChildAccessDocument;
    });

    return accesses;
  } catch (error) {
    console.error("Error fetching all child access:", error);
    throw error;
  }
}

/**
 * Vérifie si un utilisateur a une permission spécifique
 */
export function hasPermission(
  permissions: ChildPermissions,
  permission: keyof Omit<
    ChildPermissions,
    "hasAccess" | "role" | "loading" | "error"
  >,
): boolean {
  return permissions[permission] === true;
}

/**
 * Crée l'accès owner lors de la création d'un enfant
 */
export async function createOwnerAccess(
  childId: string,
  ownerId: string,
): Promise<void> {
  await grantChildAccess(childId, ownerId, "owner", ownerId);
}

/**
 * Récupère la liste des childIds accessibles par un utilisateur
 */
export async function getAccessibleChildIds(userId: string): Promise<string[]> {
  const snapshot = await getUserAccessIndex(userId);

  const ids = new Set<string>();
  snapshot.docs.forEach((docSnap) => {
    const data = docSnap.data() as { childId?: string };
    if (data.childId) ids.add(data.childId);
  });

  return Array.from(ids.values());
}
