// utils/sleepPeriod.ts
// Sieste ou nuit pour un sommeil lancé sans choix explicite (bouton du widget) :
// nuit de 19:00 à 8:00, sieste le reste du temps (8:00 décidé par Yoss le 2026-11-15). Le widget Android/iOS
// recopie la même règle (code isolé) pour afficher « Sieste » ou « Nuit ».
export const NIGHT_START_HOUR = 19;
export const NIGHT_END_HOUR = 8;

export function isNapHour(date: Date): boolean {
  const h = date.getHours();
  return h >= NIGHT_END_HOUR && h < NIGHT_START_HOUR;
}
