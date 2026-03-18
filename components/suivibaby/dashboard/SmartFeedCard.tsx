// components/suivibaby/dashboard/SmartFeedCard.tsx
// Displays a single contextual tip card on the dashboard

import { getNeutralColors } from "@/constants/dashboardColors";
import type { Tip } from "@/types/content";
import { TIP_CATEGORY_LABELS } from "@/types/content";
import FontAwesome from "@expo/vector-icons/FontAwesome6";
import * as Haptics from "expo-haptics";
import React, { memo, useCallback } from "react";
import {
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

interface SmartFeedCardProps {
  tip: Tip;
  isBookmarked?: boolean;
  onRead: (tip: Tip) => void;
  onDismiss: (tipId: string) => void;
  onBookmark: (tipId: string) => void;
  colorScheme?: "light" | "dark";
}

export const SmartFeedCard = memo(function SmartFeedCard({
  tip,
  isBookmarked = false,
  onRead,
  onDismiss,
  onBookmark,
  colorScheme = "light",
}: SmartFeedCardProps) {
  const nc = getNeutralColors(colorScheme);

  const handleRead = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onRead(tip);
  }, [tip, onRead]);

  const handleDismiss = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onDismiss(tip.id);
  }, [tip.id, onDismiss]);

  const handleBookmark = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onBookmark(tip.id);
  }, [tip.id, onBookmark]);

  const catLabel = TIP_CATEGORY_LABELS[tip.category] ?? tip.category;

  return (
    <TouchableOpacity
      style={[
        styles.card,
        {
          backgroundColor: nc.backgroundCard,
          borderColor: tip.accentColor + "30",
        },
      ]}
      onPress={handleRead}
      activeOpacity={0.7}
      accessibilityRole="button"
      accessibilityLabel={`Conseil : ${tip.title}`}
      accessibilityHint="Appuyez pour lire l'article complet"
    >
      {/* Accent strip */}
      <View
        style={[styles.accentStrip, { backgroundColor: tip.accentColor }]}
      />

      <View style={styles.content}>
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <View
              style={[
                styles.iconCircle,
                { backgroundColor: tip.accentColor + "15" },
              ]}
            >
              <FontAwesome
                name={tip.icon || "lightbulb"}
                size={14}
                color={tip.accentColor}
              />
            </View>
            <View style={styles.headerText}>
              <Text
                style={[styles.category, { color: tip.accentColor }]}
              >
                {catLabel}
              </Text>
              <Text
                style={[styles.readTime, { color: nc.textMuted }]}
              >
                {tip.readTimeMinutes} min de lecture
              </Text>
            </View>
          </View>

          {/* Actions */}
          <View style={styles.actions}>
            <TouchableOpacity
              onPress={handleBookmark}
              hitSlop={{ top: 14, bottom: 14, left: 14, right: 14 }}
              accessibilityRole="button"
              accessibilityLabel={
                isBookmarked ? "Retirer des favoris" : "Ajouter aux favoris"
              }
            >
              <FontAwesome
                name="bookmark"
                solid={isBookmarked}
                size={14}
                color={isBookmarked ? tip.accentColor : nc.textMuted}
              />
            </TouchableOpacity>
            <TouchableOpacity
              onPress={handleDismiss}
              hitSlop={{ top: 14, bottom: 14, left: 14, right: 14 }}
              accessibilityRole="button"
              accessibilityLabel="Masquer ce conseil"
            >
              <FontAwesome name="xmark" size={14} color={nc.textMuted} />
            </TouchableOpacity>
          </View>
        </View>

        {/* Title + Summary */}
        <Text
          style={[styles.title, { color: nc.textStrong }]}
          numberOfLines={2}
        >
          {tip.title}
        </Text>
        <Text
          style={[styles.summary, { color: nc.textLight }]}
          numberOfLines={2}
        >
          {tip.summary}
        </Text>

        {/* Source + CTA */}
        <View style={styles.footer}>
          {tip.source && (
            <Text style={[styles.source, { color: nc.textMuted }]}>
              Source : {tip.source}
            </Text>
          )}
          <View
            style={[
              styles.ctaBadge,
              { backgroundColor: tip.accentColor + "15" },
            ]}
          >
            <Text
              style={[styles.ctaText, { color: tip.accentColor }]}
            >
              Lire
            </Text>
            <FontAwesome
              name="arrow-right"
              size={10}
              color={tip.accentColor}
            />
          </View>
        </View>
      </View>
    </TouchableOpacity>
  );
});

const styles = StyleSheet.create({
  card: {
    borderRadius: 12,
    borderWidth: 1,
    overflow: "hidden",
    flexDirection: "row",
    flex: 1,
  },
  accentStrip: {
    width: 4,
  },
  content: {
    flex: 1,
    padding: 12,
    justifyContent: "space-between",
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 8,
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  iconCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  headerText: {
    gap: 2,
  },
  category: {
    fontSize: 11,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  readTime: {
    fontSize: 10,
  },
  actions: {
    flexDirection: "row",
    gap: 12,
    alignItems: "center",
  },
  title: {
    fontSize: 15,
    fontWeight: "600",
    lineHeight: 20,
    marginBottom: 4,
  },
  summary: {
    fontSize: 13,
    lineHeight: 18,
    marginBottom: 8,
  },
  footer: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  source: {
    fontSize: 10,
    fontStyle: "italic",
  },
  ctaBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  ctaText: {
    fontSize: 12,
    fontWeight: "600",
  },
});
