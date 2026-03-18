// components/suivibaby/dashboard/MilestoneTimelineCard.tsx
// Compact dashboard card showing upcoming milestones

import { getNeutralColors } from "@/constants/dashboardColors";
import type { MilestoneRef } from "@/types/content";
import { MILESTONE_CATEGORY_COLORS } from "@/types/content";
import FontAwesome from "@expo/vector-icons/FontAwesome6";
import * as Haptics from "expo-haptics";
import { memo, useCallback, useMemo } from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";

interface MilestoneTimelineCardProps {
  milestones: MilestoneRef[];
  ageWeeks: number;
  onViewAll: () => void;
  colorScheme?: "light" | "dark";
}

function weeksToLabel(weeks: number): string {
  if (weeks < 5) return `${weeks} sem`;
  const months = Math.round(weeks / 4.33);
  if (months < 12) return `~${months} mois`;
  const years = Math.floor(months / 12);
  const rem = months % 12;
  if (rem === 0) return `~${years} an${years > 1 ? "s" : ""}`;
  return `~${years}a ${rem}m`;
}

export const MilestoneTimelineCard = memo(function MilestoneTimelineCard({
  milestones,
  ageWeeks,
  onViewAll,
  colorScheme = "light",
}: MilestoneTimelineCardProps) {
  const nc = getNeutralColors(colorScheme);

  const upcoming = useMemo(
    () =>
      milestones
        .filter((m) => ageWeeks <= m.ageMaxWeeks)
        .sort((a, b) => a.ageTypicalWeeks - b.ageTypicalWeeks)
        .slice(0, 3),
    [milestones, ageWeeks],
  );

  const handleViewAll = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onViewAll();
  }, [onViewAll]);

  if (upcoming.length === 0) return null;

  return (
    <TouchableOpacity
      style={[
        styles.card,
        { backgroundColor: nc.backgroundCard, borderColor: nc.borderLight },
      ]}
      onPress={handleViewAll}
      activeOpacity={0.7}
      accessibilityRole="button"
      accessibilityLabel="Prochains jalons de développement"
      accessibilityHint="Appuyez pour voir tous les jalons"
    >
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <FontAwesome name="flag-checkered" size={14} color={nc.textStrong} />
          <Text style={[styles.headerTitle, { color: nc.textStrong }]}>
            Prochains jalons
          </Text>
        </View>
        <View style={styles.headerRight}>
          <Text style={[styles.viewAll, { color: nc.textMuted }]}>
            Voir tout
          </Text>
          <FontAwesome name="chevron-right" size={10} color={nc.textMuted} />
        </View>
      </View>

      {/* Milestones list */}
      <View style={styles.list}>
        {upcoming.map((m, index) => {
          const catColor =
            MILESTONE_CATEGORY_COLORS[m.category] ?? nc.textMuted;
          const rangeWeeks = m.ageMaxWeeks - m.ageMinWeeks;
          const progress =
            rangeWeeks > 0
              ? Math.min(
                  1,
                  Math.max(0, (ageWeeks - m.ageMinWeeks) / rangeWeeks),
                )
              : 0;
          const isActive =
            ageWeeks >= m.ageMinWeeks && ageWeeks <= m.ageMaxWeeks;

          return (
            <View key={m.id}>
              {index > 0 && (
                <View
                  style={[styles.divider, { backgroundColor: nc.borderLight }]}
                />
              )}
              <View style={styles.milestoneRow}>
                <View
                  style={[
                    styles.milestoneDot,
                    {
                      backgroundColor: isActive ? catColor : nc.borderLight,
                    },
                  ]}
                />
                <View style={styles.milestoneContent}>
                  <Text
                    style={[
                      styles.milestoneTitle,
                      { color: nc.textStrong },
                      isActive && { color: catColor },
                    ]}
                    numberOfLines={1}
                  >
                    {m.title}
                  </Text>
                  <Text style={[styles.milestoneAge, { color: nc.textMuted }]}>
                    {weeksToLabel(m.ageTypicalWeeks)}
                  </Text>
                </View>
                {/* Mini progress */}
                {isActive && (
                  <View
                    style={[
                      styles.miniProgress,
                      { backgroundColor: nc.borderLight },
                    ]}
                  >
                    <View
                      style={[
                        styles.miniProgressFill,
                        {
                          backgroundColor: catColor,
                          width: `${Math.round(progress * 100)}%`,
                        },
                      ]}
                    />
                  </View>
                )}
              </View>
            </View>
          );
        })}
      </View>
    </TouchableOpacity>
  );
});

const styles = StyleSheet.create({
  card: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 12,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 10,
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  headerTitle: {
    fontSize: 14,
    fontWeight: "600",
  },
  headerRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  viewAll: {
    fontSize: 12,
  },
  list: {
    gap: 0,
  },
  divider: {
    height: 1,
    marginVertical: 6,
  },
  milestoneRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  milestoneDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  milestoneContent: {
    flex: 1,
  },
  milestoneTitle: {
    fontSize: 13,
    fontWeight: "500",
  },
  milestoneAge: {
    fontSize: 10,
  },
  miniProgress: {
    width: 40,
    height: 3,
    borderRadius: 2,
    overflow: "hidden",
  },
  miniProgressFill: {
    height: "100%",
    borderRadius: 2,
  },
});
