// hooks/useNightMode.ts
// Hook pour adapter l'UX au mode nuit (22h-7h)
// Fournit des styles et valeurs adaptees pour le parent a 3h du matin

import { useContext, useMemo } from 'react';
import { ThemeContext } from '@/contexts/ThemeContext';
import { useReduceMotion } from '@/hooks/useReduceMotion';
import { shouldRunDecorativeLoop } from '@/utils/decorativeMotion';

interface NightModeValues {
  isNightMode: boolean;
  /** Le système demande de réduire les animations (SC 2.3.3) */
  reduceMotion: boolean;
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

  // « Réduire les animations » du système : aucune animation, même fonctionnelle
  const reduceMotion = useReduceMotion();

  return useMemo(() => {
    const decorative = shouldRunDecorativeLoop({ isNightMode: isNight, reduceMotion });
    return {
      isNightMode: isNight,
      reduceMotion,
      minButtonSize: isNight ? 56 : 44,
      fontSize: isNight
        ? { small: 14, normal: 17, large: 22 }
        : { small: 12, normal: 15, large: 20 },
      animations: {
        decorative,
        functional: !reduceMotion,
      },
      animationsEnabled: decorative,
      preferHaptic: isNight,
      hitSlop: isNight
        ? { top: 12, bottom: 12, left: 12, right: 12 }
        : { top: 8, bottom: 8, left: 8, right: 8 },
    };
  }, [isNight, reduceMotion]);
}
