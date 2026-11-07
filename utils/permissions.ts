// Lecture et calcul des permissions (aucune écriture : les écritures d'accès
// vivent dans services/accessRepository.ts).
import { ChildAccessDocument, ChildPermissions } from "@/types/permissions";
import {
  getAllChildAccess as getAllAccess,
  getChildAccess,
  getUserAccessIndex,
} from "@/services/accessRepository";
import { canManageEvents } from "@/utils/eventPermissions";

/**
 * Récupère les permissions d'un utilisateur pour un enfant
 */
export async function getUserChildAccess(
  childId: string,
  userId: string,
): Promise<ChildAccessDocument | null> {
  try {
    return await getChildAccess(childId, userId);
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
 * Récupère tous les accès pour un enfant
 */
export async function getAllChildAccess(
  childId: string,
): Promise<Record<string, ChildAccessDocument>> {
  try {
    return await getAllAccess(childId);
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
