// Libellés de jour des listes d'événements.

function parseDayKey(key: string): Date {
  const [year, month, day] = key.split("-").map(Number);
  return new Date(year, month - 1, day);
}

/**
 * En-tête d'un groupe : « Aujourd'hui » (sauf si le filtre « aujourd'hui »
 * est actif, l'onglet le dit déjà), « Hier », sinon « sam. 7 nov. ».
 */
export function formatDayLabel(
  key: string,
  { selectedFilter, now = new Date() }: { selectedFilter: string | null; now?: Date },
): string {
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  const itemDate = parseDayKey(key);

  if (itemDate.toDateString() === now.toDateString() && selectedFilter !== "today") {
    return "Aujourd'hui";
  }
  if (itemDate.toDateString() === yesterday.toDateString()) {
    return "Hier";
  }
  return itemDate.toLocaleDateString("fr-FR", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}

/** Puce de la date choisie dans le calendrier : « 7 nov. ». */
export function formatSelectedDateLabel(dateString: string): string {
  return parseDayKey(dateString).toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "short",
  });
}
