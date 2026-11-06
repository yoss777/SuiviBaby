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
  const { firebaseUser } = useAuth();
  const { activeChild } = useBaby();
  const permissions = useChildPermissions(activeChild?.id, firebaseUser?.uid);
  const cached = getPermissionsCache();
  if (permissions.loading && cached) return cached.canManageContent;
  return canManageEvents(permissions.role);
}
