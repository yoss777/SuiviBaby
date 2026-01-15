import { useContext } from 'react';
import { useColorScheme as useSystemColorScheme } from 'react-native';

import { ThemeContext } from '@/contexts/ThemeContext';

export function useColorScheme() {
  const systemScheme = useSystemColorScheme() ?? 'light';
  const context = useContext(ThemeContext);

  if (!context) {
    return systemScheme;
  }

  return context.resolvedColorScheme;
}
