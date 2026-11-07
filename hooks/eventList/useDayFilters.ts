// Filtre jour (aujourd'hui / passé / date du calendrier), calendrier et
// jours dépliés des écrans de liste d'événements.
import { useFocusEffect } from "@react-navigation/native";
import * as Haptics from "expo-haptics";
import { useCallback, useMemo, useState } from "react";
import { LayoutAnimation } from "react-native";
import type { DateData } from "react-native-calendars";

import { toDate } from "@/utils/date";
import { dayKey, type DayFilter } from "@/utils/eventListGrouping";
import { configureLayoutAnimation } from "@/utils/motion";

type Options = {
  items: readonly { date: unknown }[];
  /** Couleur des points et de la date choisie du calendrier. */
  tint: string;
  /** Au retour sur l'écran, revenir à « aujourd'hui » même depuis « passé ». */
  resetToTodayOnFocus: boolean;
};

export function useDayFilters({ items, tint, resetToTodayOnFocus }: Options) {
  const [selectedFilter, setSelectedFilter] = useState<DayFilter | null>(null);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [showCalendar, setShowCalendar] = useState(false);
  const [expandedDays, setExpandedDays] = useState<Set<string>>(new Set());

  // « Aujourd'hui » : filtre actif, calendrier fermé, jour courant déplié.
  const applyTodayFilter = useCallback(() => {
    setSelectedFilter("today");
    setSelectedDate(null);
    setShowCalendar(false);
    setExpandedDays(new Set([dayKey(new Date())]));
  }, []);

  const handleFilterPress = useCallback(
    (filter: DayFilter) => {
      if (filter === "today") {
        applyTodayFilter();
        return;
      }
      setSelectedFilter(filter);
      setSelectedDate(null);
      setShowCalendar(false);
      setExpandedDays(new Set());
    },
    [applyTodayFilter],
  );

  // Choisir un jour dans le calendrier le déplie.
  const handleDateSelect = useCallback((day: DateData) => {
    setSelectedDate(day.dateString);
    setSelectedFilter(null);
    setShowCalendar(false);
    setExpandedDays(new Set([day.dateString]));
  }, []);

  const clearSelectedDate = useCallback(() => {
    applyTodayFilter();
  }, [applyTodayFilter]);

  // Ouvrir le calendrier présélectionne aujourd'hui ; le fermer garde la date.
  const handleCalendarPress = useCallback(() => {
    setShowCalendar((prev) => {
      const next = !prev;
      if (next) {
        setSelectedDate(dayKey(new Date()));
        setSelectedFilter(null);
      }
      return next;
    });
  }, []);

  const toggleExpand = useCallback((key: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    configureLayoutAnimation(LayoutAnimation.Presets.easeInEaseOut);
    setExpandedDays((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  // Points du calendrier : un par jour ayant au moins un événement.
  const markedDates = useMemo(() => {
    const marked: Record<string, any> = {};
    items.forEach((item) => {
      marked[dayKey(toDate(item.date))] = { marked: true, dotColor: tint };
    });
    if (selectedDate) {
      marked[selectedDate] = {
        ...marked[selectedDate],
        selected: true,
        selectedColor: tint,
      };
    }
    return marked;
  }, [items, selectedDate, tint]);

  // Au focus : « aujourd'hui » si rien n'est choisi (couches : dès qu'aucune
  // date n'est choisie, même depuis « passé »).
  const filterForFocus = resetToTodayOnFocus ? null : selectedFilter;
  useFocusEffect(
    useCallback(() => {
      if (!filterForFocus && !selectedDate) {
        applyTodayFilter();
      }
    }, [applyTodayFilter, selectedDate, filterForFocus]),
  );

  return {
    selectedFilter,
    selectedDate,
    showCalendar,
    expandedDays,
    markedDates,
    applyTodayFilter,
    handleFilterPress,
    handleDateSelect,
    clearSelectedDate,
    handleCalendarPress,
    toggleExpand,
  };
}
