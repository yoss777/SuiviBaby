// hooks/useDarkAtNightNotice.ts
// Une seule fois : prévient les comptes existants en Clair qu'avec la 1.0.24
// l'écran passe en sombre de 22 h à 7 h (« Sombre la nuit » activé par
// défaut), avec un bouton pour le désactiver tout de suite.

import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useRef } from 'react';

import { useThemePreference } from '@/contexts/ThemeContext';
import { useToast } from '@/contexts/ToastContext';
import { shouldShowDarkAtNightNotice } from '@/utils/themeResolution';

export const DARK_AT_NIGHT_NOTICE_KEY = '@suivibaby_dark_at_night_notice_shown';

export function useDarkAtNightNotice(): void {
  const { preference, storedDarkAtNight, isNightMode, isLoading, setDarkAtNight } = useThemePreference();
  const { showActionToast } = useToast();
  const doneRef = useRef(false);

  useEffect(() => {
    if (doneRef.current || isLoading) return;
    if (!shouldShowDarkAtNightNotice({ preference, storedDarkAtNight, isNight: isNightMode, alreadyShown: false })) {
      return;
    }
    let active = true;
    AsyncStorage.getItem(DARK_AT_NIGHT_NOTICE_KEY)
      .then((shown) => {
        if (!active || shown || doneRef.current) return;
        doneRef.current = true;
        AsyncStorage.setItem(DARK_AT_NIGHT_NOTICE_KEY, '1').catch(() => {});
        showActionToast(
          "La nuit, de 22 h à 7 h, l'écran passe maintenant en sombre. Réglable dans Paramètres › Thème.",
          'Désactiver',
          () => {
            setDarkAtNight(false).catch(() => {});
          },
          10_000
        );
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [preference, storedDarkAtNight, isNightMode, isLoading, setDarkAtNight, showActionToast]);
}
