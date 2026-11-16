// hooks/useCanManageContent.ts
// Whether the current user can add or edit events for the active child
// (owner or admin). While permissions load, falls back to the cached value so
// add controls (voice dock, FAB) don't flicker on app start.
import { useAuth } from "@/contexts/AuthContext";
import { useBaby } from "@/contexts/BabyContext";
import { useChildPermissions } from "@/hooks/useChildPermissions";
import { canManageEvents } from "@/utils/eventPermissions";
import { getPermissionsCache } from "@/services/userPreferencesCache";

export function useCanManageContent(): boolean {
  return useCanManageContentState().canManage;
}

/**
 * Même droit, avec `known` : faux tant que les droits chargent sans valeur en
 * cache (un lien du widget attend la réponse au lieu de refuser à tort).
 */
export function useCanManageContentState(): { canManage: boolean; known: boolean } {
  const { firebaseUser } = useAuth();
  const { activeChild } = useBaby();
  const permissions = useChildPermissions(activeChild?.id, firebaseUser?.uid);
  // Cache seulement pour le bébé qu'il concerne (sinon, après un changement de
  // bébé, un Proche pouvait être traité en parent le temps du chargement).
  const cache = getPermissionsCache();
  const cached = cache && cache.childId === activeChild?.id ? cache : null;
  if (permissions.loading && cached) return { canManage: cached.canManageContent, known: true };
  return { canManage: canManageEvents(permissions.role), known: !permissions.loading };
}
