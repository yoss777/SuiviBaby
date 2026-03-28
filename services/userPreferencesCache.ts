// In-memory caches prefilled during boot so home.tsx can render with
// correct initial values and avoid layout shifts / flash of content.

// ============================================
// NOTIFICATION PREFERENCES
// ============================================

interface CachedNotificationPrefs {
  tips: boolean;
  insights: boolean;
  correlations: boolean;
}

let cachedPrefs: CachedNotificationPrefs | null = null;

export function setPreferencesCache(prefs: CachedNotificationPrefs): void {
  cachedPrefs = prefs;
}

export function getPreferencesCache(): CachedNotificationPrefs | null {
  return cachedPrefs;
}

export function clearPreferencesCache(): void {
  cachedPrefs = null;
}

// ============================================
// CHILD PERMISSIONS (role)
// ============================================

interface CachedPermissions {
  role: string | null;
  canManageContent: boolean;
}

let cachedPermissions: CachedPermissions | null = null;

export function setPermissionsCache(perms: CachedPermissions): void {
  cachedPermissions = perms;
}

export function getPermissionsCache(): CachedPermissions | null {
  return cachedPermissions;
}

export function clearPermissionsCache(): void {
  cachedPermissions = null;
}
