// components/suivibaby/MilestoneTimeline.tsx
// Interactive timeline of developmental milestones grouped by age range

import { getNeutralColors } from "@/constants/dashboardColors";
import type { MilestoneRef, MilestoneStatus } from "@/types/content";
import {
  MILESTONE_CATEGORY_COLORS,
  MILESTONE_CATEGORY_ICONS,
  MILESTONE_CATEGORY_LABELS,
  MILESTONE_STATUS_ICONS,
  MILESTONE_STATUS_LABELS,
} from "@/types/content";
import FontAwesome from "@expo/vector-icons/FontAwesome6";
import * as Haptics from "expo-haptics";
import React, { memo, useCallback, useMemo, useState } from "react";
import {
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

// ============================================
// TYPES
// ============================================

interface MilestoneTimelineProps {
  milestones: MilestoneRef[];
  ageWeeks: number;
  milestoneStatuses: Record<string, MilestoneStatus>;
  onStatusChange: (milestoneId: string, status: MilestoneStatus) => void;
  colorScheme?: "light" | "dark";
}

type FilterStatus = "all" | MilestoneStatus;

// ============================================
// AGE GROUPS
// ============================================

interface AgeGroup {
  key: string;
  label: string;
  minWeeks: number;
  maxWeeks: number;
}

const AGE_GROUPS: AgeGroup[] = [
  { key: "0-3m", label: "0 - 3 mois", minWeeks: 0, maxWeeks: 13 },
  { key: "3-6m", label: "3 - 6 mois", minWeeks: 13, maxWeeks: 26 },
  { key: "6-9m", label: "6 - 9 mois", minWeeks: 26, maxWeeks: 39 },
  { key: "9-12m", label: "9 - 12 mois", minWeeks: 39, maxWeeks: 52 },
  { key: "12-18m", label: "12 - 18 mois", minWeeks: 52, maxWeeks: 78 },
  { key: "18-24m", label: "18 - 24 mois", minWeeks: 78, maxWeeks: 104 },
];

function getAgeGroupForMilestone(m: MilestoneRef): string {
  for (const g of AGE_GROUPS) {
    if (m.ageTypicalWeeks >= g.minWeeks && m.ageTypicalWeeks < g.maxWeeks) {
      return g.key;
    }
  }
  return AGE_GROUPS[AGE_GROUPS.length - 1].key;
}

function getCurrentAgeGroupIndex(ageWeeks: number): number {
  for (let i = 0; i < AGE_GROUPS.length; i++) {
    if (ageWeeks < AGE_GROUPS[i].maxWeeks) return i;
  }
  return AGE_GROUPS.length - 1;
}

// ============================================
// HELPERS
// ============================================

function getStatusColors(nc: ReturnType<typeof getNeutralColors>): Record<MilestoneStatus, string> {
  return {
    not_started: nc.textMuted,
    in_progress: nc.warning,
    done: nc.success,
  };
}

function getEffectiveStatus(
  milestoneId: string,
  statuses: Record<string, MilestoneStatus>,
): MilestoneStatus {
  return statuses[milestoneId] ?? "not_started";
}

function weeksToLabel(weeks: number): string {
  if (weeks < 5) return `${weeks} sem`;
  const months = Math.round(weeks / 4.33);
  if (months < 12) return `${months} mois`;
  const years = Math.floor(months / 12);
  const rem = months % 12;
  if (rem === 0) return `${years} an${years > 1 ? "s" : ""}`;
  return `${years}a ${rem}m`;
}

const STATUS_SORT_ORDER: Record<MilestoneStatus, number> = {
  in_progress: 0,
  not_started: 1,
  done: 2,
};

// ============================================
// STATUS SELECTOR
// ============================================

const StatusSelector = memo(function StatusSelector({
  currentStatus,
  onSelect,
  nc,
}: {
  currentStatus: MilestoneStatus;
  onSelect: (status: MilestoneStatus) => void;
  nc: ReturnType<typeof getNeutralColors>;
}) {
  const statuses: MilestoneStatus[] = ["not_started", "in_progress", "done"];
  const statusColors = getStatusColors(nc);

  return (
    <View style={styles.statusRow}>
      {statuses.map((status) => {
        const isActive = currentStatus === status;
        const color = statusColors[status];
        return (
          <TouchableOpacity
            key={status}
            style={[
              styles.statusBtn,
              {
                backgroundColor: isActive ? color + "20" : nc.borderLight + "50",
                borderColor: isActive ? color : "transparent",
              },
            ]}
            onPress={() => onSelect(status)}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel={MILESTONE_STATUS_LABELS[status]}
            accessibilityState={{ selected: isActive }}
          >
            <FontAwesome
              name={MILESTONE_STATUS_ICONS[status]}
              size={10}
              color={isActive ? color : nc.textMuted}
            />
            <Text
              style={[
                styles.statusText,
                { color: isActive ? color : nc.textMuted },
                isActive && styles.statusTextActive,
              ]}
            >
              {MILESTONE_STATUS_LABELS[status]}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
});

// ============================================
// FILTER BAR
// ============================================

const FILTER_OPTIONS: { key: FilterStatus; label: string; icon: string }[] = [
  { key: "all", label: "Tous", icon: "list" },
  { key: "in_progress", label: "En cours", icon: "circle-half-stroke" },
  { key: "not_started", label: "À venir", icon: "circle" },
  { key: "done", label: "Réalisés", icon: "circle-check" },
];

// ============================================
// MAIN COMPONENT
// ============================================

export const MilestoneTimeline = memo(function MilestoneTimeline({
  milestones,
  ageWeeks,
  milestoneStatuses,
  onStatusChange,
  colorScheme = "light",
}: MilestoneTimelineProps) {
  const nc = getNeutralColors(colorScheme);
  const statusColors = useMemo(() => getStatusColors(nc), [nc]);
  const [filter, setFilter] = useState<FilterStatus>("all");
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());

  const currentGroupIndex = useMemo(
    () => getCurrentAgeGroupIndex(ageWeeks),
    [ageWeeks],
  );

  const handleStatusChange = useCallback(
    (milestoneId: string, status: MilestoneStatus) => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      onStatusChange(milestoneId, status);
    },
    [onStatusChange],
  );

  const handleFilterChange = useCallback((f: FilterStatus) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setFilter(f);
  }, []);

  const toggleGroup = useCallback((groupKey: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(groupKey)) {
        next.delete(groupKey);
      } else {
        next.add(groupKey);
      }
      return next;
    });
  }, []);

  // Group milestones by age range
  const groupedData = useMemo(() => {
    const groups: {
      group: AgeGroup;
      items: { milestone: MilestoneRef; status: MilestoneStatus }[];
      doneCount: number;
      totalCount: number;
      isCurrentOrNext: boolean;
      isPast: boolean;
      isFuture: boolean;
    }[] = [];

    for (let gi = 0; gi < AGE_GROUPS.length; gi++) {
      const group = AGE_GROUPS[gi];
      const groupMilestones = milestones
        .filter((m) => getAgeGroupForMilestone(m) === group.key)
        .map((m) => ({
          milestone: m,
          status: getEffectiveStatus(m.id, milestoneStatuses),
        }));

      if (groupMilestones.length === 0) continue;

      // Apply filter
      const filtered =
        filter === "all"
          ? groupMilestones
          : groupMilestones.filter((m) => m.status === filter);

      const doneCount = groupMilestones.filter((m) => m.status === "done").length;
      const isCurrentOrNext = gi === currentGroupIndex || gi === currentGroupIndex + 1;
      const isPast = gi < currentGroupIndex;
      const isFuture = gi > currentGroupIndex + 1;

      // Sort within group
      const sorted = [...filtered].sort((a, b) => {
        const orderDiff = STATUS_SORT_ORDER[a.status] - STATUS_SORT_ORDER[b.status];
        if (orderDiff !== 0) return orderDiff;
        return a.milestone.ageTypicalWeeks - b.milestone.ageTypicalWeeks;
      });

      groups.push({
        group,
        items: sorted,
        doneCount,
        totalCount: groupMilestones.length,
        isCurrentOrNext,
        isPast,
        isFuture,
      });
    }

    return groups;
  }, [milestones, milestoneStatuses, filter, currentGroupIndex]);

  // Auto-collapse past and future groups on first render
  useMemo(() => {
    const autoCollapsed = new Set<string>();
    for (const g of groupedData) {
      // Only auto-collapse if ALL milestones in the group are done, or if it's a future group
      const allDone = g.totalCount > 0 && g.doneCount === g.totalCount;
      if (allDone || g.isFuture) {
        autoCollapsed.add(g.group.key);
      }
    }
    // Only set if collapsedGroups is empty (first render)
    if (collapsedGroups.size === 0 && autoCollapsed.size > 0) {
      setCollapsedGroups(autoCollapsed);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupedData.length]);

  // Global counts for filter badges
  const counts = useMemo(() => {
    const c: Record<FilterStatus, number> = {
      all: milestones.length,
      not_started: 0,
      in_progress: 0,
      done: 0,
    };
    for (const m of milestones) {
      const s = getEffectiveStatus(m.id, milestoneStatuses);
      c[s]++;
    }
    return c;
  }, [milestones, milestoneStatuses]);

  if (milestones.length === 0) {
    return (
      <View style={[styles.emptyContainer, { backgroundColor: nc.backgroundCard }]}>
        <FontAwesome name="baby" size={32} color={nc.textMuted} />
        <Text style={[styles.emptyText, { color: nc.textMuted }]}>
          {"Pas de jalons disponibles"}
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Filter bar */}
      <View style={styles.filterBar}>
        {FILTER_OPTIONS.map((opt) => {
          const isActive = filter === opt.key;
          const color =
            opt.key === "all"
              ? nc.textStrong
              : statusColors[opt.key as MilestoneStatus];
          return (
            <TouchableOpacity
              key={opt.key}
              style={[
                styles.filterChip,
                {
                  backgroundColor: isActive ? color + "15" : nc.borderLight + "50",
                  borderColor: isActive ? color + "40" : "transparent",
                },
              ]}
              onPress={() => handleFilterChange(opt.key)}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel={`Filtre ${opt.label}`}
              accessibilityState={{ selected: isActive }}
            >
              <FontAwesome
                name={opt.icon}
                size={11}
                color={isActive ? color : nc.textMuted}
              />
              <Text
                style={[
                  styles.filterText,
                  { color: isActive ? color : nc.textMuted },
                  isActive && styles.filterTextActive,
                ]}
              >
                {opt.label}
              </Text>
              <View
                style={[
                  styles.filterBadge,
                  { backgroundColor: isActive ? color + "25" : nc.borderLight },
                ]}
              >
                <Text
                  style={[
                    styles.filterBadgeText,
                    { color: isActive ? color : nc.textMuted },
                  ]}
                >
                  {counts[opt.key]}
                </Text>
              </View>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Groups */}
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {groupedData.map((groupData) => {
          const { group, items, doneCount, totalCount, isCurrentOrNext, isPast } =
            groupData;
          const isCollapsed = collapsedGroups.has(group.key);
          const progressPct =
            totalCount > 0 ? Math.round((doneCount / totalCount) * 100) : 0;
          const groupColor = isCurrentOrNext
            ? "#5B9BD5"
            : isPast
              ? nc.success
              : nc.textMuted;

          return (
            <View key={group.key} style={styles.groupContainer}>
              {/* Group header */}
              <TouchableOpacity
                style={[
                  styles.groupHeader,
                  {
                    backgroundColor: nc.backgroundCard,
                    borderColor: isCurrentOrNext
                      ? groupColor + "30"
                      : nc.borderLight,
                  },
                ]}
                onPress={() => toggleGroup(group.key)}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityLabel={`${group.label}, ${doneCount} sur ${totalCount} réalisés`}
                accessibilityState={{ expanded: !isCollapsed }}
              >
                <View style={styles.groupHeaderLeft}>
                  <FontAwesome
                    name={isCollapsed ? "chevron-right" : "chevron-down"}
                    size={10}
                    color={nc.textMuted}
                  />
                  <Text
                    style={[
                      styles.groupTitle,
                      { color: nc.textStrong },
                      isCurrentOrNext && styles.groupTitleCurrent,
                    ]}
                  >
                    {group.label}
                  </Text>
                  {isCurrentOrNext && (
                    <View
                      style={[
                        styles.currentBadge,
                        { backgroundColor: groupColor + "20" },
                      ]}
                    >
                      <Text style={[styles.currentBadgeText, { color: groupColor }]}>
                        {"Maintenant"}
                      </Text>
                    </View>
                  )}
                </View>

                <View style={styles.groupHeaderRight}>
                  {/* Mini progress */}
                  <View
                    style={[
                      styles.groupProgress,
                      { backgroundColor: nc.borderLight },
                    ]}
                  >
                    <View
                      style={[
                        styles.groupProgressFill,
                        {
                          backgroundColor: groupColor,
                          width: `${progressPct}%`,
                        },
                      ]}
                    />
                  </View>
                  <Text style={[styles.groupCount, { color: nc.textMuted }]}>
                    {doneCount}/{totalCount}
                  </Text>
                </View>
              </TouchableOpacity>

              {/* Group items */}
              {!isCollapsed && (
                <View style={styles.groupItems}>
                  {items.length === 0 && (
                    <Text
                      style={[styles.groupEmptyText, { color: nc.textMuted }]}
                    >
                      {"Aucun jalon dans ce filtre"}
                    </Text>
                  )}

                  {items.map(({ milestone, status }, index) => {
                    const catColor =
                      MILESTONE_CATEGORY_COLORS[milestone.category] ??
                      nc.textMuted;
                    const catIcon =
                      MILESTONE_CATEGORY_ICONS[milestone.category] ?? "circle";
                    const catLabel =
                      MILESTONE_CATEGORY_LABELS[milestone.category] ??
                      milestone.category;
                    const statusColor = statusColors[status];
                    const isDone = status === "done";

                    const rangeWeeks =
                      milestone.ageMaxWeeks - milestone.ageMinWeeks;
                    const progress =
                      isDone
                        ? 1
                        : rangeWeeks > 0
                          ? Math.min(
                              1,
                              Math.max(
                                0,
                                (ageWeeks - milestone.ageMinWeeks) / rangeWeeks,
                              ),
                            )
                          : 0;

                    const isLast = index === items.length - 1;

                    return (
                      <View key={milestone.id} style={styles.itemRow}>
                        {/* Timeline dot + line */}
                        <View style={styles.timelineColumn}>
                          <View
                            style={[
                              styles.dot,
                              {
                                backgroundColor: statusColor,
                                borderColor:
                                  status === "in_progress"
                                    ? statusColor
                                    : "transparent",
                              },
                              status === "in_progress" && styles.dotActive,
                            ]}
                          >
                            {isDone && (
                              <FontAwesome
                                name="check"
                                size={8}
                                color="#fff"
                              />
                            )}
                          </View>
                          {!isLast && (
                            <View
                              style={[
                                styles.line,
                                {
                                  backgroundColor: isDone
                                    ? nc.success + "40"
                                    : nc.borderLight,
                                },
                              ]}
                            />
                          )}
                        </View>

                        {/* Card */}
                        <View
                          style={[
                            styles.card,
                            {
                              backgroundColor: nc.backgroundCard,
                              borderColor:
                                status === "in_progress"
                                  ? statusColor + "40"
                                  : nc.borderLight,
                              opacity: isDone ? 0.7 : 1,
                            },
                          ]}
                        >
                          {/* Header */}
                          <View style={styles.cardHeader}>
                            <View
                              style={[
                                styles.categoryBadge,
                                { backgroundColor: catColor + "20" },
                              ]}
                            >
                              <FontAwesome
                                name={catIcon}
                                size={10}
                                color={catColor}
                              />
                              <Text
                                style={[
                                  styles.categoryText,
                                  { color: catColor },
                                ]}
                              >
                                {catLabel}
                              </Text>
                            </View>
                            <Text
                              style={[styles.ageRange, { color: nc.textMuted }]}
                            >
                              {weeksToLabel(milestone.ageMinWeeks)} -{" "}
                              {weeksToLabel(milestone.ageMaxWeeks)}
                            </Text>
                          </View>

                          {/* Title */}
                          <Text
                            style={[
                              styles.title,
                              { color: nc.textStrong },
                              isDone && styles.titleDone,
                            ]}
                          >
                            {milestone.title}
                          </Text>

                          {/* Description */}
                          <Text
                            style={[
                              styles.description,
                              { color: nc.textLight },
                            ]}
                          >
                            {milestone.description}
                          </Text>

                          {/* Progress bar */}
                          {status !== "not_started" && (
                            <View style={styles.progressContainer}>
                              <View
                                style={[
                                  styles.progressBg,
                                  { backgroundColor: nc.borderLight },
                                ]}
                              >
                                <View
                                  style={[
                                    styles.progressFill,
                                    {
                                      backgroundColor: statusColor,
                                      width: `${Math.round(progress * 100)}%`,
                                    },
                                  ]}
                                />
                              </View>
                              <Text
                                style={[
                                  styles.progressText,
                                  { color: nc.textMuted },
                                ]}
                              >
                                {isDone
                                  ? "100%"
                                  : `${Math.round(progress * 100)}%`}
                              </Text>
                            </View>
                          )}

                          {/* Tips */}
                          {!isDone && milestone.tips && (
                            <View
                              style={[
                                styles.tipsBox,
                                { backgroundColor: catColor + "10" },
                              ]}
                            >
                              <FontAwesome
                                name="lightbulb"
                                size={12}
                                color={catColor}
                              />
                              <Text
                                style={[
                                  styles.tipsText,
                                  { color: nc.textNormal },
                                ]}
                              >
                                {milestone.tips}
                              </Text>
                            </View>
                          )}

                          {/* Status selector */}
                          <StatusSelector
                            currentStatus={status}
                            onSelect={(s) =>
                              handleStatusChange(milestone.id, s)
                            }
                            nc={nc}
                          />

                          {/* Source */}
                          {milestone.source && (
                            <Text
                              style={[styles.source, { color: nc.textMuted }]}
                            >
                              Source : {milestone.source}
                            </Text>
                          )}
                        </View>
                      </View>
                    );
                  })}
                </View>
              )}
            </View>
          );
        })}
      </ScrollView>
    </View>
  );
});

// ============================================
// STYLES
// ============================================

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  filterBar: {
    flexDirection: "row",
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 6,
  },
  filterChip: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
  },
  filterText: {
    fontSize: 10,
    fontWeight: "500",
  },
  filterTextActive: {
    fontWeight: "700",
  },
  filterBadge: {
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 4,
  },
  filterBadgeText: {
    fontSize: 9,
    fontWeight: "700",
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingBottom: 80,
  },
  emptyContainer: {
    padding: 32,
    borderRadius: 12,
    alignItems: "center",
    gap: 12,
    margin: 16,
  },
  emptyText: {
    fontSize: 14,
    textAlign: "center",
  },
  // Group styles
  groupContainer: {
    marginBottom: 12,
  },
  groupHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
  },
  groupHeaderLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  groupTitle: {
    fontSize: 14,
    fontWeight: "500",
  },
  groupTitleCurrent: {
    fontWeight: "700",
  },
  currentBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
  },
  currentBadgeText: {
    fontSize: 9,
    fontWeight: "700",
  },
  groupHeaderRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  groupProgress: {
    width: 40,
    height: 4,
    borderRadius: 2,
    overflow: "hidden",
  },
  groupProgressFill: {
    height: "100%",
    borderRadius: 2,
  },
  groupCount: {
    fontSize: 11,
    fontWeight: "600",
    minWidth: 24,
    textAlign: "right",
  },
  groupItems: {
    marginTop: 8,
    marginLeft: 4,
  },
  groupEmptyText: {
    fontSize: 13,
    textAlign: "center",
    paddingVertical: 16,
  },
  // Item styles
  itemRow: {
    flexDirection: "row",
    marginBottom: 4,
  },
  timelineColumn: {
    width: 24,
    alignItems: "center",
  },
  dot: {
    width: 16,
    height: 16,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 16,
    zIndex: 1,
  },
  dotActive: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 3,
    marginTop: 14,
  },
  line: {
    width: 2,
    flex: 1,
    marginTop: -2,
  },
  card: {
    flex: 1,
    marginLeft: 8,
    marginBottom: 8,
    borderRadius: 10,
    borderWidth: 1,
    padding: 12,
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 6,
  },
  categoryBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
  },
  categoryText: {
    fontSize: 10,
    fontWeight: "600",
  },
  ageRange: {
    fontSize: 10,
  },
  title: {
    fontSize: 14,
    fontWeight: "600",
    marginBottom: 4,
  },
  titleDone: {
    textDecorationLine: "line-through",
    opacity: 0.7,
  },
  description: {
    fontSize: 12,
    lineHeight: 18,
    marginBottom: 8,
  },
  progressContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 8,
  },
  progressBg: {
    flex: 1,
    height: 4,
    borderRadius: 2,
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    borderRadius: 2,
  },
  progressText: {
    fontSize: 10,
    fontWeight: "600",
    width: 30,
    textAlign: "right",
  },
  tipsBox: {
    flexDirection: "row",
    gap: 8,
    padding: 8,
    borderRadius: 8,
    marginBottom: 8,
  },
  tipsText: {
    flex: 1,
    fontSize: 12,
    lineHeight: 16,
  },
  statusRow: {
    flexDirection: "row",
    gap: 6,
    marginBottom: 6,
  },
  statusBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    minHeight: 36,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
  },
  statusText: {
    fontSize: 10,
  },
  statusTextActive: {
    fontWeight: "700",
  },
  source: {
    fontSize: 9,
    fontStyle: "italic",
  },
});
