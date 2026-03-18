// components/suivibaby/dashboard/InsightCard.tsx
// Displays a data-driven insight on the dashboard

import { getNeutralColors } from "@/constants/dashboardColors";
import type { Insight } from "@/types/content";
import FontAwesome from "@expo/vector-icons/FontAwesome6";
import * as Haptics from "expo-haptics";
import React, { memo, useCallback } from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";

interface InsightCardProps {
  insight: Insight;
  onLearnMore?: (insight: Insight) => void;
  onDismiss?: (insightId: string) => void;
  colorScheme?: "light" | "dark";
}

const TYPE_CONFIG: Record<
  string,
  { icon: string; label: string; bgOpacity: string }
> = {
  positive: { icon: "circle-check", label: "Bravo", bgOpacity: "15" },
  warning: { icon: "triangle-exclamation", label: "Attention", bgOpacity: "15" },
  info: { icon: "circle-info", label: "Info", bgOpacity: "12" },
  milestone: { icon: "star", label: "Étape", bgOpacity: "15" },
};

export const InsightCard = memo(function InsightCard({
  insight,
  onLearnMore,
  onDismiss,
  colorScheme = "light",
}: InsightCardProps) {
  const nc = getNeutralColors(colorScheme);
  const config = TYPE_CONFIG[insight.type] ?? TYPE_CONFIG.info;

  const handleLearnMore = useCallback(() => {
    if (!onLearnMore) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onLearnMore(insight);
  }, [insight, onLearnMore]);

  const handleDismiss = useCallback(() => {
    if (!onDismiss) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onDismiss(insight.id);
  }, [insight.id, onDismiss]);

  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor:
            nc.backgroundCard,
          borderColor: insight.accentColor + "25",
        },
      ]}
      accessibilityRole="summary"
      accessibilityLabel={`${config.label} : ${insight.message}`}
    >
      <View style={styles.row}>
        {/* Type icon */}
        <View
          style={[
            styles.iconCircle,
            { backgroundColor: insight.accentColor + config.bgOpacity },
          ]}
        >
          <FontAwesome
            name={insight.icon || config.icon}
            size={16}
            color={insight.accentColor}
          />
        </View>

        {/* Content */}
        <View style={styles.content}>
          {/* Type badge */}
          <View style={styles.badgeRow}>
            <View
              style={[
                styles.typeBadge,
                { backgroundColor: insight.accentColor + "15" },
              ]}
            >
              <FontAwesome
                name={config.icon}
                size={8}
                color={insight.accentColor}
              />
              <Text
                style={[styles.typeText, { color: insight.accentColor }]}
              >
                {config.label}
              </Text>
            </View>
            {onDismiss && (
              <TouchableOpacity
                onPress={handleDismiss}
                hitSlop={{ top: 16, bottom: 16, left: 16, right: 16 }}
                accessibilityRole="button"
                accessibilityLabel="Masquer cet insight"
                accessibilityHint="Cet insight ne sera plus affiché"
              >
                <FontAwesome name="xmark" size={12} color={nc.textMuted} />
              </TouchableOpacity>
            )}
          </View>

          {/* Title */}
          {insight.title && (
            <Text style={[styles.title, { color: nc.textStrong }]}>
              {insight.title}
            </Text>
          )}

          {/* Message */}
          <Text style={[styles.message, { color: nc.textNormal }]}>
            {insight.message}
          </Text>

          {/* Learn more */}
          {insight.relatedTipId && onLearnMore && (
            <TouchableOpacity
              style={styles.learnMore}
              onPress={handleLearnMore}
              hitSlop={{ top: 16, bottom: 16, left: 16, right: 16 }}
              accessibilityRole="button"
              accessibilityLabel="En savoir plus"
              accessibilityHint="Ouvre un article avec plus de détails"
            >
              <Text
                style={[styles.learnMoreText, { color: insight.accentColor }]}
              >
                En savoir plus
              </Text>
              <FontAwesome
                name="arrow-right"
                size={10}
                color={insight.accentColor}
              />
            </TouchableOpacity>
          )}
        </View>
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  card: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 12,
  },
  row: {
    flexDirection: "row",
    gap: 10,
  },
  iconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 2,
  },
  content: {
    flex: 1,
  },
  badgeRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 4,
  },
  typeBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
  },
  typeText: {
    fontSize: 10,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  title: {
    fontSize: 14,
    fontWeight: "600",
    marginBottom: 2,
  },
  message: {
    fontSize: 13,
    lineHeight: 18,
  },
  learnMore: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: 6,
  },
  learnMoreText: {
    fontSize: 12,
    fontWeight: "600",
  },
});
