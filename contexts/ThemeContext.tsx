import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useColorScheme as useSystemColorScheme } from 'react-native';

import { useAuth } from '@/contexts/AuthContext';
import {
  obtenirPreferenceTheme,
  mettreAJourPreferenceTheme,
  ThemePreference,
} from '@/services/userPreferencesService';

const THEME_STORAGE_KEY = '@suivibaby_theme_preference';
const LEGACY_THEME_KEY = '@samaye_theme_preference';
const NIGHT_START_HOUR = 22;
const NIGHT_END_HOUR = 7;

function isNightTime(): boolean {
  const hour = new Date().getHours();
  return hour >= NIGHT_START_HOUR || hour < NIGHT_END_HOUR;
}

interface ThemeContextValue {
  preference: ThemePreference;
  resolvedColorScheme: 'light' | 'dark';
  isNightMode: boolean;
  isLoading: boolean;
  setPreference: (value: ThemePreference) => Promise<void>;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const systemScheme = useSystemColorScheme() ?? 'light';
  const { firebaseUser } = useAuth();
  const [preference, setPreferenceState] = useState<ThemePreference>('auto');
  const [localLoaded, setLocalLoaded] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const localLoadedRef = useRef(false);

  // Step 1: Load local preference ASAP (fast, no network)
  useEffect(() => {
    if (localLoadedRef.current) return;
    localLoadedRef.current = true;
    AsyncStorage.getItem(THEME_STORAGE_KEY)
      .then(async (local) => {
        if (local && (local === 'light' || local === 'dark' || local === 'auto')) {
          setPreferenceState(local as ThemePreference);
          return;
        }
        // Migration depuis l'ancienne clé Samaye
        const legacy = await AsyncStorage.getItem(LEGACY_THEME_KEY);
        if (legacy && (legacy === 'light' || legacy === 'dark' || legacy === 'auto')) {
          setPreferenceState(legacy as ThemePreference);
          await AsyncStorage.setItem(THEME_STORAGE_KEY, legacy);
          await AsyncStorage.removeItem(LEGACY_THEME_KEY);
        }
      })
      .catch(() => {})
      .finally(() => setLocalLoaded(true));
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

    obtenirPreferenceTheme()
      .then((themePreference) => {
        if (isMounted) {
          setPreferenceState(themePreference);
          AsyncStorage.setItem(THEME_STORAGE_KEY, themePreference).catch(() => {});
        }
      })
      .catch(() => {
        if (isMounted) setPreferenceState('auto');
      })
      .finally(() => {
        if (isMounted) setIsLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [firebaseUser, localLoaded]);

  const [nightMode, setNightMode] = useState(isNightTime);

  // Re-check night mode every minute
  useEffect(() => {
    const interval = setInterval(() => {
      setNightMode(isNightTime());
    }, 60_000);
    return () => clearInterval(interval);
  }, []);

  const resolvedColorScheme = useMemo(() => {
    if (preference === 'auto') {
      // Force dark mode at night (22h-7h) even if system is light
      return nightMode ? 'dark' : systemScheme;
    }
    return preference;
  }, [preference, systemScheme, nightMode]);

  const setPreference = async (value: ThemePreference) => {
    if (value === preference) return;
    const previous = preference;
    setPreferenceState(value);
    // Toujours persister localement
    AsyncStorage.setItem(THEME_STORAGE_KEY, value).catch(() => {});

    if (!firebaseUser) return;

    try {
      await mettreAJourPreferenceTheme(value);
    } catch (error) {
      setPreferenceState(previous);
      AsyncStorage.setItem(THEME_STORAGE_KEY, previous).catch(() => {});
      throw error;
    }
  };

  // Block render until local preference is loaded (prevents theme flash)
  if (!localLoaded) return null;

  return (
    <ThemeContext.Provider
      value={{
        preference,
        resolvedColorScheme,
        isNightMode: nightMode,
        isLoading,
        setPreference,
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
