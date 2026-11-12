// utils/timeSince.ts
// « il y a … » du tableau de bord, lisible d'un coup d'œil et à voix haute.
// Minutes toujours sur deux chiffres après les heures (« 2 h 05 » et non
// « 2h5 », qui se lit « 2 h 50 »). Espace insécable entre nombre et unité
// pour qu'un retour à la ligne ne sépare jamais « 2 » de « h ».

const NBSP = " ";

/** Durée en minutes vers « 5 min », « 2 h », « 2 h 05 ». */
export function formatElapsedMinutes(totalMinutes: number): string {
  const minutes = Math.max(0, Math.floor(totalMinutes));
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours === 0) return `${minutes}${NBSP}min`;
  if (rest === 0) return `${hours}${NBSP}h`;
  return `${hours}${NBSP}h${NBSP}${String(rest).padStart(2, "0")}`;
}

/**
 * « à l'instant », « il y a 5 min », « il y a 2 h 05 ».
 * Renvoie null si l'horodatage est absent, invalide ou dans le futur.
 */
export function formatTimeSince(
  lastTimestamp: number | undefined | null,
  now: Date,
): string | null {
  if (!lastTimestamp || Number.isNaN(lastTimestamp)) return null;
  const diffMinutes = Math.floor((now.getTime() - lastTimestamp) / 60_000);
  if (diffMinutes < 0) return null;
  if (diffMinutes === 0) return "à l'instant";
  return `il y a ${formatElapsedMinutes(diffMinutes)}`;
}
