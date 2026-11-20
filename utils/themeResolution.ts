// utils/themeResolution.ts
// Calcul du thème affiché à partir du choix (Clair / Sombre / Automatique)
// et de l'interrupteur « Sombre la nuit » (22 h – 7 h).
//
// Attention : « Sombre la nuit » ne pilote que les couleurs. L'ergonomie de
// nuit (useNightMode : grands boutons, animations coupées, accueil épuré)
// dépend de l'heure seule et ne doit jamais être liée à cet interrupteur.

import type { ThemePreference } from '@/services/userPreferencesService';

export const NIGHT_START_HOUR = 22;
export const NIGHT_END_HOUR = 7;

export function isNightHour(hour: number): boolean {
  return hour >= NIGHT_START_HOUR || hour < NIGHT_END_HOUR;
}

/** Interrupteur jamais touché (champ absent) : activé, pour tous les comptes. */
export function resolveDarkAtNight(stored: boolean | undefined): boolean {
  return stored ?? true;
}

export function resolveColorScheme(params: {
  preference: ThemePreference;
  darkAtNight: boolean;
  isNight: boolean;
  systemScheme: 'light' | 'dark';
}): 'light' | 'dark' {
  const { preference, darkAtNight, isNight, systemScheme } = params;
  if (preference === 'dark') return 'dark';
  if (darkAtNight && isNight) return 'dark';
  return preference === 'auto' ? systemScheme : 'light';
}

/** Description d'un choix dans l'écran Thème, selon l'interrupteur. */
export function themeOptionDescription(option: ThemePreference, darkAtNight: boolean): string {
  switch (option) {
    case 'light':
      return darkAtNight ? 'Clair le jour, sombre de 22 h à 7 h' : 'Clair à toute heure';
    case 'dark':
      return 'Sombre à toute heure';
    case 'auto':
      return darkAtNight
        ? 'Suit votre téléphone, et passe en sombre de 22 h à 7 h'
        : 'Suit votre téléphone, même la nuit';
  }
}

/** Valeur affichée sur la ligne « Thème » des Paramètres. */
export function themeSummaryLabel(preference: ThemePreference, darkAtNight: boolean): string {
  switch (preference) {
    case 'dark':
      return 'Sombre';
    case 'light':
      return darkAtNight ? 'Clair · sombre la nuit' : 'Clair';
    case 'auto':
      return darkAtNight ? 'Automatique' : 'Automatique · sans sombre la nuit';
  }
}

/**
 * Message unique pour les comptes existants en Clair qui n'ont jamais touché
 * l'interrupteur : ils passent en sombre la nuit avec la 1.0.24 sans l'avoir
 * demandé. Les comptes Automatique ne voient aucun changement.
 */
export function shouldShowDarkAtNightNotice(params: {
  preference: ThemePreference;
  storedDarkAtNight: boolean | undefined;
  isNight: boolean;
  alreadyShown: boolean;
}): boolean {
  const { preference, storedDarkAtNight, isNight, alreadyShown } = params;
  return preference === 'light' && storedDarkAtNight === undefined && isNight && !alreadyShown;
}

/**
 * Apparence imposée aux éléments natifs (clavier, alertes, sélecteurs de
 * date, feuille de partage), qui suivent le téléphone et non nos couleurs.
 * 'auto' = suivre le téléphone : indispensable en Automatique hors nuit
 * forcée, car pendant un forçage React Native ne donne plus le vrai réglage
 * du téléphone (useColorScheme renvoie la valeur forcée).
 */
export function nativeAppearanceOverride(params: {
  preference: ThemePreference;
  darkAtNight: boolean;
  isNight: boolean;
}): 'light' | 'dark' | 'auto' {
  const { preference, darkAtNight, isNight } = params;
  if (preference === 'dark') return 'dark';
  if (darkAtNight && isNight) return 'dark';
  return preference === 'light' ? 'light' : 'auto';
}
