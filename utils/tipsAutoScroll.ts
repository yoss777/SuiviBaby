// utils/tipsAutoScroll.ts
// Règle de défilement automatique du carrousel de conseils (WCAG 2.2.2) :
// jamais la nuit (22 h – 7 h, mêmes bornes que le mode nuit du thème), jamais
// avec « Réduire les animations », jamais avec un lecteur d'écran actif.

export const TIPS_QUIET_START_HOUR = 22;
export const TIPS_QUIET_END_HOUR = 7;

export function isTipsQuietHour(date: Date): boolean {
  const hour = date.getHours();
  return hour >= TIPS_QUIET_START_HOUR || hour < TIPS_QUIET_END_HOUR;
}

export function shouldAutoScrollTips({
  now,
  reduceMotion,
  screenReaderEnabled,
}: {
  now: Date;
  reduceMotion: boolean;
  screenReaderEnabled: boolean;
}): boolean {
  if (reduceMotion || screenReaderEnabled) return false;
  return !isTipsQuietHour(now);
}
