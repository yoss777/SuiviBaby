import { useContext } from 'react';
import { ThemeContext } from '@/contexts/ThemeContext';
import { useColorScheme as useSystemColorScheme } from 'react-native';

export function useColorScheme(): "light" | "dark" {
  const systemScheme = useSystemColorScheme() ?? 'light';
  const context = useContext(ThemeContext);

  if (!context) {
    return systemScheme;
  }

  return context.resolvedColorScheme;
}
