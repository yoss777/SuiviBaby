import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AppState, useColorScheme as useSystemColorScheme } from 'react-native';

import { useAuth } from '@/contexts/AuthContext';
import {
  mettreAJourReglagesTheme,
  obtenirReglagesTheme,
  ThemePreference,
} from '@/services/userPreferencesService';
import { isNightHour, resolveColorScheme, resolveDarkAtNight } from '@/utils/themeResolution';

const THEME_STORAGE_KEY = '@suivibaby_theme_preference';
const LEGACY_THEME_KEY = '@samaye_theme_preference';
/** '1' / '0' ; absente = interrupteur jamais touché. */
const DARK_AT_NIGHT_STORAGE_KEY = '@suivibaby_dark_at_night';

function isNightTime(): boolean {
  return isNightHour(new Date().getHours());
}

function isThemePreference(value: unknown): value is ThemePreference {
  return value === 'light' || value === 'dark' || value === 'auto';
}

function parseStoredDarkAtNight(raw: string | null): boolean | undefined {
  if (raw === '1') return true;
  if (raw === '0') return false;
  return undefined;
}

interface ThemeContextValue {
  preference: ThemePreference;
  resolvedColorScheme: 'light' | 'dark';
  /**
   * Heure de nuit (22 h – 7 h), quel que soit le thème et l'interrupteur :
   * pilote l'ergonomie de nuit (useNightMode). Ne pas la lier à darkAtNight.
   */
  isNightMode: boolean;
  /** « Sombre la nuit » effectif (défaut : activé). */
  darkAtNight: boolean;
  /** Valeur enregistrée ; undefined = jamais touchée. */
  storedDarkAtNight: boolean | undefined;
  isLoading: boolean;
  /** Choisir Automatique active aussi « Sombre la nuit », dans la même écriture. */
  setPreference: (value: ThemePreference) => Promise<void>;
  setDarkAtNight: (value: boolean) => Promise<void>;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const systemScheme = useSystemColorScheme() ?? 'light';
  const { firebaseUser } = useAuth();
  const [preference, setPreferenceState] = useState<ThemePreference>('auto');
  const [storedDarkAtNight, setStoredDarkAtNight] = useState<boolean | undefined>(undefined);
  const [localLoaded, setLocalLoaded] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const localLoadedRef = useRef(false);

  // Step 1: Load local preference ASAP (fast, no network)
  useEffect(() => {
    if (localLoadedRef.current) return;
    localLoadedRef.current = true;
    (async () => {
      try {
        const [local, localDark] = await Promise.all([
          AsyncStorage.getItem(THEME_STORAGE_KEY),
          AsyncStorage.getItem(DARK_AT_NIGHT_STORAGE_KEY),
        ]);
        setStoredDarkAtNight(parseStoredDarkAtNight(localDark));
        if (isThemePreference(local)) {
          setPreferenceState(local);
          return;
        }
        // Migration depuis l'ancienne clé Samaye
        const legacy = await AsyncStorage.getItem(LEGACY_THEME_KEY);
        if (isThemePreference(legacy)) {
          setPreferenceState(legacy);
          await AsyncStorage.setItem(THEME_STORAGE_KEY, legacy);
          await AsyncStorage.removeItem(LEGACY_THEME_KEY);
        }
      } catch {
        // valeurs par défaut
      } finally {
        setLocalLoaded(true);
      }
    })();
  }, []);

  // Step 2: Once user is known, sync from Firestore (may override local)
  useEffect(() => {
    if (!localLoaded) return;

    if (!firebaseUser) {
      setIsLoading(false);
      return;
    }

    let isMounted = true;
    setIsLoading(true);

    obtenirReglagesTheme()
      .then(({ theme, darkAtNight }) => {
        if (!isMounted) return;
        setPreferenceState(theme);
        AsyncStorage.setItem(THEME_STORAGE_KEY, theme).catch(() => {});
        setStoredDarkAtNight(darkAtNight);
        if (darkAtNight === undefined) {
          AsyncStorage.removeItem(DARK_AT_NIGHT_STORAGE_KEY).catch(() => {});
        } else {
          AsyncStorage.setItem(DARK_AT_NIGHT_STORAGE_KEY, darkAtNight ? '1' : '0').catch(() => {});
        }
      })
      // Hors ligne ou erreur : on garde les valeurs locales (avant : retour
      // forcé à « Automatique », qui changeait le thème d'un compte Clair).
      .catch(() => {})
      .finally(() => {
        if (isMounted) setIsLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [firebaseUser, localLoaded]);

  const [nightMode, setNightMode] = useState(isNightTime);

  // Re-check night mode every minute, and right away when the app comes back
  // to the foreground (the interval is paused in the background).
  useEffect(() => {
    const interval = setInterval(() => {
      setNightMode(isNightTime());
    }, 60_000);
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') setNightMode(isNightTime());
    });
    return () => {
      clearInterval(interval);
      sub.remove();
    };
  }, []);

  const darkAtNight = resolveDarkAtNight(storedDarkAtNight);

  const resolvedColorScheme = useMemo(
    () =>
      resolveColorScheme({
        preference,
        darkAtNight,
        isNight: nightMode,
        systemScheme: systemScheme === 'dark' ? 'dark' : 'light',
      }),
    [preference, darkAtNight, nightMode, systemScheme]
  );

  /** Mise à jour optimiste groupée, avec retour arrière des deux valeurs. */
  const applySettings = useCallback(
    async (next: { theme?: ThemePreference; darkAtNight?: boolean }) => {
      const previousTheme = preference;
      const previousDark = storedDarkAtNight;
      if (next.theme !== undefined) {
        setPreferenceState(next.theme);
        AsyncStorage.setItem(THEME_STORAGE_KEY, next.theme).catch(() => {});
      }
      if (next.darkAtNight !== undefined) {
        setStoredDarkAtNight(next.darkAtNight);
        AsyncStorage.setItem(DARK_AT_NIGHT_STORAGE_KEY, next.darkAtNight ? '1' : '0').catch(() => {});
      }

      if (!firebaseUser) return;

      try {
        await mettreAJourReglagesTheme(next);
      } catch (error) {
        setPreferenceState(previousTheme);
        AsyncStorage.setItem(THEME_STORAGE_KEY, previousTheme).catch(() => {});
        setStoredDarkAtNight(previousDark);
        if (previousDark === undefined) {
          AsyncStorage.removeItem(DARK_AT_NIGHT_STORAGE_KEY).catch(() => {});
        } else {
          AsyncStorage.setItem(DARK_AT_NIGHT_STORAGE_KEY, previousDark ? '1' : '0').catch(() => {});
        }
        throw error;
      }
    },
    [firebaseUser, preference, storedDarkAtNight]
  );

  const setPreference = useCallback(
    async (value: ThemePreference) => {
      if (value === preference) return;
      // Automatique active « Sombre la nuit » (reste modifiable ensuite).
      await applySettings(value === 'auto' ? { theme: value, darkAtNight: true } : { theme: value });
    },
    [preference, applySettings]
  );

  const setDarkAtNight = useCallback(
    async (value: boolean) => {
      if (value === darkAtNight && storedDarkAtNight !== undefined) return;
      await applySettings({ darkAtNight: value });
    },
    [darkAtNight, storedDarkAtNight, applySettings]
  );

  // Block render until local preference is loaded (prevents theme flash)
  if (!localLoaded) return null;

  return (
    <ThemeContext.Provider
      value={{
        preference,
        resolvedColorScheme,
        isNightMode: nightMode,
        darkAtNight,
        storedDarkAtNight,
        isLoading,
        setPreference,
        setDarkAtNight,
      }}
    >
      {children}
    </ThemeContext.Provider>
  );
}

export function useThemePreference() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useThemePreference must be used within ThemeProvider');
  }
  return context;
}

export { ThemeContext };
