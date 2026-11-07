// Groupes par jour affichés : filtre (soft-delete, date, aujourd'hui/passé)
// puis regroupement. Recalculé au passage de minuit (useCalendarDay).
import { useMemo } from "react";

import { useCalendarDay } from "@/hooks/useMinuteTick";
import { filterByDay, groupByDay, type DayFilter } from "@/utils/eventListGrouping";

type Options<T extends { id: string; date: unknown }, S extends object> = {
  items: readonly T[];
  softDeletedIds: ReadonlySet<string>;
  selectedDate: string | null;
  selectedFilter: DayFilter | null;
  summarize?: (items: T[]) => S;
};

export function useDayGroups<T extends { id: string; date: unknown }, S extends object>({
  items,
  softDeletedIds,
  selectedDate,
  selectedFilter,
  summarize,
}: Options<T, S>) {
  // Jour calendaire : le filtre « aujourd'hui » suit le passage de minuit.
  const calendarDay = useCalendarDay();
  return useMemo(
    () =>
      groupByDay(
        filterByDay(items, { selectedDate, filter: selectedFilter, softDeletedIds }),
        summarize,
      ),
    // calendarDay : recalcul à minuit, même sans nouvelle donnée.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [items, selectedFilter, selectedDate, softDeletedIds, summarize, calendarDay],
  );
}
