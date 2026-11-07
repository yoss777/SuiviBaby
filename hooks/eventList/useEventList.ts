// Assemble les hooks d'un écran de liste d'événements à partir de sa config.
import { useCallback, useEffect, useState } from "react";

import type { BaseEvent, EventListConfig } from "@/components/eventList/types";
import { Colors } from "@/constants/theme";
import { useAuth } from "@/contexts/AuthContext";
import { useBaby } from "@/contexts/BabyContext";
import { useToast } from "@/contexts/ToastContext";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { useBatchSelect } from "@/hooks/useBatchSelect";
import { useChildPermissions } from "@/hooks/useChildPermissions";
import { useSwipeHint } from "@/hooks/useSwipeHint";
import { canManageEvents } from "@/utils/eventPermissions";

import { useDayFilters } from "./useDayFilters";
import { useDayGroups } from "./useDayGroups";
import { useEventListData } from "./useEventListData";
import { useEventListHeader } from "./useEventListHeader";
import { useEventSheetFlow } from "./useEventSheetFlow";
import { useAutoLoadMore, useEventWindow } from "./useEventWindow";
import { useSoftDelete } from "./useSoftDelete";

/** Délai avant l'état vide : évite un flash quand les données arrivent juste après. */
export const EMPTY_STATE_DELAY_MS = 300;

export function useEventList<T extends BaseEvent, S extends object>(
  config: EventListConfig<T, S>,
) {
  const { activeChild } = useBaby();
  const { firebaseUser } = useAuth();
  const childId = activeChild?.id;
  const colorScheme = useColorScheme() ?? "light";
  const { showToast } = useToast();
  const batch = useBatchSelect();
  const { swipeableRef, triggerHint } = useSwipeHint();

  // Rôle lu seulement pour les écrans qui en dépendent (pas d'écouteur sinon).
  const permissions = useChildPermissions(
    config.permissions === "manage" ? childId : null,
    firebaseUser?.uid,
  );
  const canManage = config.permissions === "all" || canManageEvents(permissions.role);

  const window = useEventWindow({
    childId,
    eventTypes: config.eventTypes,
    jumpToLatestOnMount: config.jumpToLatestOnMount,
    loadMore: config.loadMore,
  });

  const data = useEventListData<T>({
    childId,
    eventTypes: config.eventTypes,
    normalizeSnapshot: config.normalizeSnapshot,
    sortMerged: config.sortMerged,
    window,
  });

  const filters = useDayFilters({
    items: data.items,
    tint: Colors[colorScheme].tint,
    resetToTodayOnFocus: config.filters.resetToTodayOnFocus,
  });

  const softDelete = useSoftDelete<T>({
    childId,
    items: data.items,
    texts: config.texts,
    showToast,
    onBatchStart: batch.exitSelectionMode,
  });

  const groups = useDayGroups<T, S>({
    items: data.items,
    softDeletedIds: softDelete.softDeletedIds,
    selectedDate: filters.selectedDate,
    selectedFilter: filters.selectedFilter,
    summarize: config.summarize,
  });

  const { ensureTodayInRange } = window;
  const { applyTodayFilter } = filters;
  const onSaved = useCallback(() => {
    ensureTodayInRange();
    applyTodayFilter();
  }, [ensureTodayInRange, applyTodayFilter]);

  const sheetFlow = useEventSheetFlow<T>({
    sheet: config.sheet,
    parseTabParam: config.parseTabParam,
    items: data.items,
    showToast,
    onSaved,
  });

  const { openAdd } = sheetFlow;
  const onAdd = useCallback(() => openAdd(), [openAdd]);

  useEventListHeader({
    ownerPrefix: config.key,
    colorScheme,
    showCalendar: filters.showCalendar,
    onCalendarPress: filters.handleCalendarPress,
    calendarButtonInset: config.layout.calendarButtonInset,
    onAdd,
    hasGroups: groups.length > 0,
    selectionMode: batch.selectionMode,
    toggleSelectionMode: batch.toggleSelectionMode,
    isSheetOpen: sheetFlow.isOpen,
    closeSheet: sheetFlow.closeSheet,
    returnTargetParam: sheetFlow.returnTargetParam,
    returnToRef: sheetFlow.returnToRef,
    backUsesStashedReturn: config.navigation.backUsesStashedReturn,
  });

  // « Voir plus » et chargement automatique masqués sous « aujourd'hui » ou une date choisie.
  const loadMoreHidden = filters.selectedFilter === "today" || !!filters.selectedDate;
  useAutoLoadMore(window, {
    loaded: data.loaded,
    groupsCount: groups.length,
    blocked: loadMoreHidden,
  });

  const [emptyDelayDone, setEmptyDelayDone] = useState(false);
  useEffect(() => {
    if (!data.loaded) {
      setEmptyDelayDone(false);
      return;
    }
    if (groups.length > 0) {
      setEmptyDelayDone(true);
      return;
    }
    const timer = setTimeout(() => setEmptyDelayDone(true), EMPTY_STATE_DELAY_MS);
    return () => clearTimeout(timer);
  }, [data.loaded, groups.length]);

  // Swipe hint: trigger on first load when data is available
  useEffect(() => {
    if (data.loaded && groups.length > 0) {
      triggerHint();
    }
  }, [data.loaded, groups.length, triggerHint]);

  return {
    colorScheme,
    canManage,
    batch,
    swipeableRef,
    window,
    data,
    filters,
    softDelete,
    groups,
    sheetFlow,
    loadMoreHidden,
    showContent: data.loaded && emptyDelayDone,
    onAdd,
  };
}
