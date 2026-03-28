// In-memory cache for user notification preferences.
// Prefilled during boot so home.tsx can render with correct initial values
// and avoid the flash of widgets appearing then hiding.

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
