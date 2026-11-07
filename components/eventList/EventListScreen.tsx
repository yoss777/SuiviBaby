// Écran générique de liste d'événements (repas, pompages, couches), piloté
// par une config de module (components/eventList/configs).
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import React, { useCallback } from "react";
import {
  FlatList,
  Platform,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  UIManager,
  View,
} from "react-native";
import { Calendar } from "react-native-calendars";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import ReanimatedSwipeable from "react-native-gesture-handler/ReanimatedSwipeable";
import { SafeAreaView } from "react-native-safe-area-context";

import { ThemedText } from "@/components/themed-text";
import { ConfirmModal } from "@/components/ui/ConfirmModal";
import { DateFilterBar } from "@/components/ui/DateFilterBar";
import { LoadMoreButton } from "@/components/ui/LoadMoreButton";
import { SelectedDateChip } from "@/components/ui/SelectedDateChip";
import { SelectionToolbar } from "@/components/ui/SelectionToolbar";
import { getNeutralColors } from "@/constants/dashboardColors";
import { Colors } from "@/constants/theme";
import { useEventList } from "@/hooks/eventList/useEventList";
import { isOptimisticId } from "@/hooks/eventList/useSoftDelete";
import { formatDayLabel, formatSelectedDateLabel } from "@/utils/dayLabel";
import type { EventGroup } from "@/utils/eventListGrouping";

import { EventListSkeleton } from "./EventListSkeleton";
import { eventListStyles } from "./styles";
import type { BaseEvent, EventListConfig } from "./types";

// Enable LayoutAnimation on Android
if (Platform.OS === "android" && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

// ============================================
// DELETE ACTION COMPONENT
// ============================================

const DeleteAction = React.memo(function DeleteAction({
  onPress,
  label,
  errorColor,
  whiteColor,
}: {
  onPress: () => void;
  label: string;
  errorColor: string;
  whiteColor: string;
}) {
  return (
    <Pressable
      style={[styles.deleteAction, { backgroundColor: errorColor }]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <Ionicons name="trash-outline" size={20} color={whiteColor} />
      <Text style={[styles.deleteActionText, { color: whiteColor }]}>Supprimer</Text>
    </Pressable>
  );
});

// ============================================
// SCREEN
// ============================================

export function EventListScreen<T extends BaseEvent, S extends object>({
  config,
}: {
  config: EventListConfig<T, S>;
}) {
  const list = useEventList(config);
  const {
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
    showContent,
    onAdd,
  } = list;
  const nc = getNeutralColors(colorScheme);
  const tint = Colors[colorScheme].tint;
  const { selectionMode, selectedIds, toggleId } = batch;
  const { openEdit } = sheetFlow;
  const { requestDelete } = softDelete;
  const { expandedDays, toggleExpand, selectedFilter } = filters;

  // ============================================
  // RENDER - ROW
  // ============================================

  const renderRow = useCallback(
    (item: T, isLatest: boolean, isFirstInList: boolean) => {
      const optimistic = isOptimisticId(item.id);
      const deletable = canManage && !!item.id && !optimistic;
      const isSelected = selectionMode && selectedIds.has(item.id);

      return (
        <ReanimatedSwipeable
          key={item.id}
          ref={isFirstInList ? swipeableRef : undefined}
          renderRightActions={
            deletable
              ? () => (
                  <DeleteAction
                    label={config.a11y.deleteAction}
                    onPress={() => requestDelete(item)}
                    errorColor={nc.error}
                    whiteColor={nc.white}
                  />
                )
              : undefined
          }
          friction={2}
          rightThreshold={40}
          overshootRight={false}
          enabled={deletable}
        >
          <Pressable
            accessibilityRole={canManage ? "button" : undefined}
            accessibilityLabel={canManage ? config.a11y.row : undefined}
            disabled={!canManage}
            style={({ pressed }) => [
              eventListStyles.sessionCard,
              {
                borderColor: nc.borderLight,
                backgroundColor: pressed
                  ? nc.backgroundPressed
                  : isSelected
                    ? tint + "15"
                    : nc.backgroundCard,
                shadowColor: nc.shadow,
                borderLeftWidth: isSelected ? 3 : 0,
                borderLeftColor: isSelected ? tint : "transparent",
              },
            ]}
            // Lecture seule (Proche) : ni édition ni sélection.
            onPress={
              !canManage
                ? undefined
                : selectionMode
                  ? () => toggleId(item.id)
                  : () => {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      openEdit(item);
                    }
            }
          >
            {selectionMode && (
              <Pressable onPress={() => toggleId(item.id)} style={{ marginRight: 8 }}>
                <Ionicons
                  name={selectedIds.has(item.id) ? "checkbox" : "square-outline"}
                  size={22}
                  color={selectedIds.has(item.id) ? tint : nc.textMuted}
                />
              </Pressable>
            )}
            {config.renderRow({ item, isLatest, nc, colorScheme })}
            {/* Edit icon */}
            {canManage && <Ionicons name="create-outline" size={18} color={nc.textMuted} />}
          </Pressable>
        </ReanimatedSwipeable>
      );
    },
    [canManage, selectionMode, selectedIds, swipeableRef, config, requestDelete, nc, tint, toggleId, openEdit, colorScheme],
  );

  // ============================================
  // RENDER - DAY GROUP
  // ============================================

  const renderDayGroup = useCallback(
    ({ item: group, index }: { item: EventGroup<T> & S; index: number }) => {
      const isExpanded = expandedDays.has(group.date);
      const extra = group.items.length - 1;
      const expandColors = config.expandColors(nc, colorScheme);

      return (
        <View style={eventListStyles.daySection}>
          {config.renderDaySummary({
            group,
            dayLabel: formatDayLabel(group.date, { selectedFilter }),
            nc,
            colorScheme,
          })}

          {/* Sessions list */}
          <View style={eventListStyles.sessionsContainer}>
            {renderRow(group.lead, true, index === 0)}

            {extra > 0 && (
              <>
                {isExpanded &&
                  group.items
                    .filter((item) => item.id !== group.lead.id)
                    .map((item) => renderRow(item, false, false))}

                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={config.a11y.expand(isExpanded, extra)}
                  style={({ pressed }) => [
                    styles.expandTrigger,
                    {
                      borderColor: nc.borderLight,
                      backgroundColor: pressed ? nc.backgroundPressed : nc.backgroundCard,
                    },
                  ]}
                  onPress={() => toggleExpand(group.date)}
                >
                  <Text style={[styles.expandTriggerText, { color: expandColors.text }]}>
                    {isExpanded ? "Masquer" : config.texts.expandMore(extra)}
                  </Text>
                  <Ionicons
                    name={isExpanded ? "chevron-up" : "chevron-down"}
                    size={14}
                    color={expandColors.chevron}
                  />
                </Pressable>
              </>
            )}
          </View>
        </View>
      );
    },
    [expandedDays, config, nc, colorScheme, selectedFilter, renderRow, toggleExpand],
  );

  // ============================================
  // RENDER - MAIN
  // ============================================

  const loadMoreButton = loadMoreHidden ? null : (
    <LoadMoreButton
      hasMore={window.hasMore}
      loading={window.isLoadingMore}
      onPress={window.handleLoadMore}
      text="Voir plus"
      accentColor={tint}
    />
  );

  const modalColors =
    config.texts.modalTone === "card"
      ? { backgroundColor: nc.backgroundCard, textColor: nc.textStrong, confirmButtonColor: nc.error }
      : { backgroundColor: Colors[colorScheme].background, textColor: Colors[colorScheme].text };

  const { selectedDate } = filters;
  const batchCount = softDelete.batchDeleteConfirm.ids.length;

  return (
    <GestureHandlerRootView style={[styles.container, { backgroundColor: nc.background }]}>
      <SafeAreaView
        style={{ flex: 1 }}
        edges={["bottom"]}
        onLayout={sheetFlow.onLayout}
        testID="event-list-body"
      >
        <View>
          {/* Filtres */}
          <View style={config.layout.paddedFilterRow ? styles.filterRowPadded : undefined}>
            <DateFilterBar
              selected={selectedDate ? "past" : (selectedFilter ?? "today")}
              onSelect={filters.handleFilterPress}
              variant="soft"
              activeAccentColor={config.accent}
            >
              {selectedDate && (
                <SelectedDateChip
                  label={formatSelectedDateLabel(selectedDate)}
                  accentColor={config.accent}
                  onPress={filters.clearSelectedDate}
                />
              )}
            </DateFilterBar>
          </View>

          {/* Calendrier */}
          {filters.showCalendar && (
            <View style={[styles.calendarContainer, { borderBottomColor: nc.border }]}>
              <Calendar
                onDayPress={filters.handleDateSelect}
                markedDates={filters.markedDates}
                theme={{
                  backgroundColor: Colors[colorScheme].background,
                  calendarBackground: Colors[colorScheme].background,
                  textSectionTitleColor: Colors[colorScheme].text,
                  selectedDayBackgroundColor: tint,
                  selectedDayTextColor:
                    colorScheme === "dark" ? Colors[colorScheme].background : nc.white,
                  todayTextColor: tint,
                  dayTextColor: Colors[colorScheme].text,
                  textDisabledColor: Colors[colorScheme].tabIconDefault,
                  dotColor: tint,
                  selectedDotColor: nc.white,
                  arrowColor: tint,
                  monthTextColor: Colors[colorScheme].text,
                  indicatorColor: tint,
                }}
              />
            </View>
          )}
        </View>

        {/* Barre de sélection */}
        {selectionMode && (
          <SelectionToolbar
            selectedCount={batch.selectedCount}
            totalCount={groups.reduce((n, g) => n + g.items.length, 0)}
            onSelectAll={() => batch.selectAll(groups.flatMap((g) => g.items.map((i) => i.id)))}
            onClearSelection={batch.clearSelection}
            onDelete={() => softDelete.requestBatchDelete(Array.from(selectedIds))}
          />
        )}

        {/* Liste */}
        {!showContent ? (
          <EventListSkeleton colorScheme={colorScheme} variant={config.skeleton} />
        ) : groups.length === 0 ? (
          <View style={styles.emptyContainer}>
            <View style={[styles.emptyIconWrapper, { backgroundColor: `${config.accent}15` }]}>
              {config.empty.renderIcon(config.accent)}
            </View>
            <ThemedText style={[styles.emptyTitle, { color: nc.textStrong }]}>
              {data.items.length === 0 ? config.empty.titleNone : config.empty.titleFiltered}
            </ThemedText>
            <ThemedText style={[styles.emptySubtitle, { color: nc.textLight }]}>
              {config.empty.subtitle}
            </ThemedText>
            {data.items.length === 0 && (
              <Pressable
                style={[styles.emptyCta, { backgroundColor: tint }]}
                onPress={onAdd}
                accessibilityRole="button"
                accessibilityLabel={config.empty.ctaA11y}
              >
                <Ionicons name="add" size={20} color={nc.white} />
                <Text style={[styles.emptyCtaText, { color: nc.white }]}>{config.empty.ctaLabel}</Text>
              </Pressable>
            )}
            {loadMoreButton}
          </View>
        ) : (
          <FlatList
            data={groups}
            keyExtractor={(item) => item.date}
            renderItem={renderDayGroup}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={[styles.listContent, config.layout.growList && { flexGrow: 1 }]}
            ListFooterComponent={loadMoreButton}
            refreshControl={
              <RefreshControl
                refreshing={data.isRefreshing}
                onRefresh={data.handlePullToRefresh}
                tintColor={tint}
              />
            }
          />
        )}
      </SafeAreaView>
      <ConfirmModal
        visible={softDelete.deleteConfirm.visible}
        title={config.texts.deleteTitle}
        message={config.texts.deleteMessage}
        confirmText="Supprimer"
        cancelText="Annuler"
        {...modalColors}
        onCancel={softDelete.cancelDelete}
        onConfirm={softDelete.confirmDelete}
      />
      <ConfirmModal
        visible={softDelete.batchDeleteConfirm.visible}
        title="Suppression groupée"
        message={config.texts.batchDeleteMessage(batchCount)}
        confirmText="Supprimer"
        cancelText="Annuler"
        {...modalColors}
        onCancel={softDelete.cancelBatchDelete}
        onConfirm={softDelete.confirmBatchDelete}
      />
    </GestureHandlerRootView>
  );
}

// ============================================
// STYLES
// ============================================

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  calendarContainer: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderBottomWidth: 1,
  },
  listContent: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 80,
  },
  filterRowPadded: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingRight: 16,
  },

  // Expand trigger
  expandTrigger: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    paddingVertical: 12,
    borderRadius: 14,
    borderWidth: 1,
  },
  expandTriggerText: {
    fontSize: 13,
    fontWeight: "500",
  },

  // Empty State
  emptyContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 32,
  },
  emptyIconWrapper: {
    width: 80,
    height: 80,
    borderRadius: 40,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: "700",
    textAlign: "center",
  },
  emptySubtitle: {
    fontSize: 14,
    marginTop: 6,
    textAlign: "center",
  },
  emptyCta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 24,
    marginTop: 20,
  },
  emptyCtaText: {
    fontSize: 15,
    fontWeight: "600",
  },

  // Swipe-to-delete
  deleteAction: {
    justifyContent: "center",
    alignItems: "center",
    width: 80,
    borderRadius: 14,
    marginHorizontal: 4,
    marginVertical: 1,
    gap: 4,
  },
  deleteActionText: {
    fontSize: 12,
    fontWeight: "700",
  },
});
