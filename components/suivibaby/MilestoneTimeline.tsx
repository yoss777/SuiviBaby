// components/suivibaby/MilestoneTimeline.tsx
// Visual timeline of expected milestones by age

import { getNeutralColors } from "@/constants/dashboardColors";
import type { MilestoneRef } from "@/types/content";
import {
  MILESTONE_CATEGORY_COLORS,
  MILESTONE_CATEGORY_ICONS,
  MILESTONE_CATEGORY_LABELS,
} from "@/types/content";
import FontAwesome from "@expo/vector-icons/FontAwesome6";
import React, { memo, useMemo } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";

interface MilestoneTimelineProps {
  milestones: MilestoneRef[];
  ageWeeks: number;
  recordedJalonTypes?: string[]; // Already recorded jalon types
  colorScheme?: "light" | "dark";
}

function getStatus(
  milestone: MilestoneRef,
  ageWeeks: number,
  recorded: Set<string>,
): "done" | "now" | "upcoming" | "past" {
  if (
    milestone.relatedJalonType &&
    recorded.has(milestone.relatedJalonType)
  ) {
    return "done";
  }
  if (ageWeeks > milestone.ageMaxWeeks) return "past";
  if (ageWeeks >= milestone.ageMinWeeks) return "now";
  return "upcoming";
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

export const MilestoneTimeline = memo(function MilestoneTimeline({
  milestones,
  ageWeeks,
  recordedJalonTypes = [],
  colorScheme = "light",
}: MilestoneTimelineProps) {
  const nc = getNeutralColors(colorScheme);
  const recorded = useMemo(
    () => new Set(recordedJalonTypes),
    [recordedJalonTypes],
  );

  const sorted = useMemo(
    () => [...milestones].sort((a, b) => a.ageTypicalWeeks - b.ageTypicalWeeks),
    [milestones],
  );

  if (sorted.length === 0) {
    return (
      <View style={[styles.emptyContainer, { backgroundColor: nc.backgroundCard }]}>
        <FontAwesome name="baby" size={32} color={nc.textMuted} />
        <Text style={[styles.emptyText, { color: nc.textMuted }]}>
          Pas de jalons disponibles pour cet âge
        </Text>
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      {sorted.map((milestone, index) => {
        const status = getStatus(milestone, ageWeeks, recorded);
        const catColor =
          MILESTONE_CATEGORY_COLORS[milestone.category] ?? nc.textMuted;
        const catIcon =
          MILESTONE_CATEGORY_ICONS[milestone.category] ?? "circle";
        const catLabel =
          MILESTONE_CATEGORY_LABELS[milestone.category] ?? milestone.category;

        // Progress bar for age range
        const rangeWeeks = milestone.ageMaxWeeks - milestone.ageMinWeeks;
        const progress =
          rangeWeeks > 0
            ? Math.min(
                1,
                Math.max(0, (ageWeeks - milestone.ageMinWeeks) / rangeWeeks),
              )
            : status === "done" || status === "past"
              ? 1
              : 0;

        const isLast = index === sorted.length - 1;

        return (
          <View key={milestone.id} style={styles.itemRow}>
            {/* Timeline line */}
            <View style={styles.timelineColumn}>
              <View
                style={[
                  styles.dot,
                  {
                    backgroundColor:
                      status === "done"
                        ? nc.success
                        : status === "now"
                          ? catColor
                          : nc.borderLight,
                    borderColor:
                      status === "now" ? catColor : "transparent",
                  },
                  status === "now" && styles.dotActive,
                ]}
              >
                {status === "done" && (
                  <FontAwesome name="check" size={8} color="#fff" />
                )}
              </View>
              {!isLast && (
                <View
                  style={[
                    styles.line,
                    {
                      backgroundColor:
                        status === "done" || status === "past"
                          ? nc.success + "40"
                          : nc.borderLight,
                    },
                  ]}
                />
              )}
            </View>

            {/* Content */}
            <View
              style={[
                styles.card,
                {
                  backgroundColor: nc.backgroundCard,
                  borderColor:
                    status === "now" ? catColor + "40" : nc.borderLight,
                  opacity: status === "past" ? 0.5 : 1,
                },
              ]}
            >
              {/* Header */}
              <View style={styles.cardHeader}>
                <View style={[styles.categoryBadge, { backgroundColor: catColor + "20" }]}>
                  <FontAwesome name={catIcon} size={10} color={catColor} />
                  <Text style={[styles.categoryText, { color: catColor }]}>
                    {catLabel}
                  </Text>
                </View>
                <Text style={[styles.ageRange, { color: nc.textMuted }]}>
                  {weeksToLabel(milestone.ageMinWeeks)} -{" "}
                  {weeksToLabel(milestone.ageMaxWeeks)}
                </Text>
              </View>

              {/* Title */}
              <Text
                style={[
                  styles.title,
                  { color: nc.textStrong },
                  status === "done" && styles.titleDone,
                ]}
              >
                {status === "done" ? "✓ " : ""}
                {milestone.title}
              </Text>

              {/* Description */}
              <Text style={[styles.description, { color: nc.textLight }]}>
                {milestone.description}
              </Text>

              {/* Progress bar (only for "now" status) */}
              {status === "now" && (
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
                          backgroundColor: catColor,
                          width: `${Math.round(progress * 100)}%`,
                        },
                      ]}
                    />
                  </View>
                  <Text style={[styles.progressText, { color: nc.textMuted }]}>
                    {Math.round(progress * 100)}%
                  </Text>
                </View>
              )}

              {/* Tips */}
              {status === "now" && milestone.tips && (
                <View
                  style={[
                    styles.tipsBox,
                    { backgroundColor: catColor + "10" },
                  ]}
                >
                  <FontAwesome name="lightbulb" size={12} color={catColor} />
                  <Text style={[styles.tipsText, { color: nc.textNormal }]}>
                    {milestone.tips}
                  </Text>
                </View>
              )}

              {/* Source */}
              {milestone.source && (
                <Text style={[styles.source, { color: nc.textMuted }]}>
                  Source : {milestone.source}
                </Text>
              )}
            </View>
          </View>
        );
      })}
    </ScrollView>
  );
});

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    paddingHorizontal: 16,
    paddingVertical: 12,
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
    marginBottom: 6,
  },
  tipsText: {
    flex: 1,
    fontSize: 12,
    lineHeight: 16,
  },
  source: {
    fontSize: 9,
    fontStyle: "italic",
  },
});
