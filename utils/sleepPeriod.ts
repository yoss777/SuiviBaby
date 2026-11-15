// utils/sleepPeriod.ts
// Sieste ou nuit pour un sommeil lancé sans choix explicite (bouton du widget) :
// nuit de 19:00 à 6:00, sieste le reste du temps. Le widget Android/iOS
// recopie la même règle (code isolé) pour afficher « Sieste » ou « Nuit ».
export const NIGHT_START_HOUR = 19;
export const NIGHT_END_HOUR = 6;

export function isNapHour(date: Date): boolean {
  const h = date.getHours();
  return h >= NIGHT_END_HOUR && h < NIGHT_START_HOUR;
}
