// hooks/useNightMode.ts
// Hook pour adapter l'UX au mode nuit (22h-7h)
// Fournit des styles et valeurs adaptees pour le parent a 3h du matin

import { useContext, useMemo } from 'react';
import { ThemeContext } from '@/contexts/ThemeContext';

interface NightModeValues {
  isNightMode: boolean;
  /** Taille de bouton minimum (56px la nuit pour usage une main) */
  minButtonSize: number;
  /** Taille de police augmentee la nuit */
  fontSize: { small: number; normal: number; large: number };
  /** Conserve uniquement les animations decoratives. Les transitions fonctionnelles restent actives. */
  animations: {
    decorative: boolean;
    functional: boolean;
  };
  /** @deprecated Utiliser animations.decorative. */
  animationsEnabled: boolean;
  /** Utiliser retour haptique au lieu de sons */
  preferHaptic: boolean;
  /** Padding augmente pour les zones tactiles */
  hitSlop: { top: number; bottom: number; left: number; right: number };
}

export function useNightMode(): NightModeValues {
  const context = useContext(ThemeContext);
  const isNight = context?.isNightMode ?? false;

  return useMemo(() => ({
    isNightMode: isNight,
    minButtonSize: isNight ? 56 : 44,
    fontSize: isNight
      ? { small: 14, normal: 17, large: 22 }
      : { small: 12, normal: 15, large: 20 },
    animations: {
      decorative: !isNight,
      functional: true,
    },
    animationsEnabled: !isNight,
    preferHaptic: isNight,
    hitSlop: isNight
      ? { top: 12, bottom: 12, left: 12, right: 12 }
      : { top: 8, bottom: 8, left: 8, right: 8 },
  }), [isNight]);
}
