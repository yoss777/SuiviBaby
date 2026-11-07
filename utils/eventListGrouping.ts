// Filtrage par jour et regroupement des listes d'événements (repas,
// pompages, couches). Fonctions pures : testées sans React.
import { getDateTime, toDate } from "@/utils/date";

export { getDateTime };

export type DayFilter = "today" | "past";

/** Clé de jour locale « YYYY-MM-DD ». */
export function dayKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(
    date.getDate(),
  ).padStart(2, "0")}`;
}

/** Début du jour local (ms), NaN pour une date invalide. Ne mute pas `date`. */
function startOfDayTime(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

/** Début du jour local d'une clé « YYYY-MM-DD ». */
function keyStartTime(key: string): number {
  const [year, month, day] = key.split("-").map(Number);
  return new Date(year, month - 1, day).getTime();
}

export type FilterByDayOptions = {
  selectedDate: string | null;
  filter: DayFilter | null;
  softDeletedIds: ReadonlySet<string>;
  now?: Date;
};

/**
 * Ordre des règles : élément supprimé (soft-delete) masqué, puis date choisie
 * dans le calendrier, puis filtre « aujourd'hui » / « passé » (null = tout).
 */
export function filterByDay<T extends { id: string; date: unknown }>(
  items: readonly T[],
  { selectedDate, filter, softDeletedIds, now = new Date() }: FilterByDayOptions,
): T[] {
  const todayTime = startOfDayTime(now);
  const selectedTime = selectedDate ? keyStartTime(selectedDate) : null;

  return items.filter((item) => {
    if (softDeletedIds.has(item.id)) return false;
    const itemTime = startOfDayTime(toDate(item.date));

    if (selectedTime !== null) return itemTime === selectedTime;

    switch (filter) {
      case "today":
        return itemTime === todayTime;
      case "past":
        return itemTime < todayTime;
      default:
        return true;
    }
  });
}

export type EventGroup<T> = {
  /** Clé de jour « YYYY-MM-DD ». */
  date: string;
  /** Éléments du jour, du plus récent au plus ancien. */
  items: T[];
  /** Élément le plus récent du jour (ligne affichée en tête). */
  lead: T;
};

/**
 * Regroupe par jour local : groupes du plus récent au plus ancien, éléments
 * du plus récent au plus ancien, `summarize` ajoute les totaux propres à
 * chaque écran.
 */
export function groupByDay<T extends { date: unknown }, S extends object = object>(
  items: readonly T[],
  summarize?: (items: T[]) => S,
): (EventGroup<T> & S)[] {
  const groups = new Map<string, T[]>();

  items.forEach((item) => {
    const key = dayKey(toDate(item.date));
    const bucket = groups.get(key);
    if (bucket) bucket.push(item);
    else groups.set(key, [item]);
  });

  return Array.from(groups.entries())
    .map(([date, bucket]) => {
      const lead = bucket.reduce((latest, current) =>
        getDateTime(current.date) > getDateTime(latest.date) ? current : latest,
      );
      const sorted = [...bucket].sort((a, b) => getDateTime(b.date) - getDateTime(a.date));
      return {
        ...(summarize ? summarize(sorted) : ({} as S)),
        date,
        items: sorted,
        lead,
      };
    })
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
}
