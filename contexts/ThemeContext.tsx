import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { useColorScheme as useSystemColorScheme } from 'react-native';

import { useAuth } from '@/contexts/AuthContext';
import {
  obtenirPreferenceTheme,
  mettreAJourPreferenceTheme,
  ThemePreference,
} from '@/services/userPreferencesService';

interface ThemeContextValue {
  preference: ThemePreference;
  resolvedColorScheme: 'light' | 'dark';
  isLoading: boolean;
  setPreference: (value: ThemePreference) => Promise<void>;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const systemScheme = useSystemColorScheme() ?? 'light';
  const { firebaseUser } = useAuth();
  const [preference, setPreferenceState] = useState<ThemePreference>('auto');
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;
    const loadPreference = async () => {
      if (!firebaseUser) {
        if (isMounted) {
          setPreferenceState('auto');
          setIsLoading(false);
        }
        return;
      }

      try {
        const themePreference = await obtenirPreferenceTheme();
        if (isMounted) {
          setPreferenceState(themePreference);
        }
      } catch (error) {
        if (isMounted) {
          setPreferenceState('auto');
        }
      } finally {
        if (isMounted) setIsLoading(false);
      }
    };

    setIsLoading(true);
    loadPreference();

    return () => {
      isMounted = false;
    };
  }, [firebaseUser]);

  const resolvedColorScheme = useMemo(() => {
    return preference === 'auto' ? systemScheme : preference;
  }, [preference, systemScheme]);

  const setPreference = async (value: ThemePreference) => {
    if (value === preference) return;
    const previous = preference;
    setPreferenceState(value);

    if (!firebaseUser) return;

    try {
      await mettreAJourPreferenceTheme(value);
    } catch (error) {
      setPreferenceState(previous);
      throw error;
    }
  };

  return (
    <ThemeContext.Provider
      value={{
        preference,
        resolvedColorScheme,
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
