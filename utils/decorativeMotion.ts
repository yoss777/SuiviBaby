// utils/decorativeMotion.ts
// Règle unique des animations décoratives en boucle (auras, badges qui
// pulsent, icônes flottantes) : jamais la nuit (22 h – 7 h, mode nuit du
// thème) et jamais avec « Réduire les animations » (WCAG 2.3.3). Les
// indicateurs fonctionnels (chargement) suivent seulement Réduire les animations.

import { isTipsQuietHour } from "@/utils/tipsAutoScroll";

/**
 * Heure de nuit (22 h – 7 h, mêmes bornes que le mode nuit du thème), pour
 * les composants légers qui ne lisent pas le ThemeContext.
 */
export function isNightHour(date: Date): boolean {
  return isTipsQuietHour(date);
}

export function shouldRunDecorativeLoop({
  isNightMode,
  reduceMotion,
}: {
  isNightMode: boolean;
  reduceMotion: boolean;
}): boolean {
  return !isNightMode && !reduceMotion;
}
