// components/suivibaby/dashboard/InsightCard.tsx
// Displays a data-driven insight on the dashboard — dismissible via X button or swipe

import { getNeutralColors } from "@/constants/dashboardColors";
import type { Insight } from "@/types/content";
import FontAwesome from "@expo/vector-icons/FontAwesome6";
import * as Haptics from "expo-haptics";
import React, { memo, useCallback } from "react";
import { Dimensions, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import Animated, {
  FadeOut,
  LinearTransition,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { Gesture, GestureDetector } from "react-native-gesture-handler";

const SCREEN_WIDTH = Dimensions.get("window").width;
const SWIPE_THRESHOLD = SCREEN_WIDTH * 0.3;

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

  const translateX = useSharedValue(0);
  const opacity = useSharedValue(1);
  const cardHeight = useSharedValue<number | undefined>(undefined);

  const handleLearnMore = useCallback(() => {
    if (!onLearnMore) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onLearnMore(insight);
  }, [insight, onLearnMore]);

  const dismiss = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onDismiss?.(insight.id);
  }, [insight.id, onDismiss]);

  const handleDismissButton = useCallback(() => {
    // Fade out then dismiss
    opacity.value = withTiming(0, { duration: 250 });
    translateX.value = withTiming(0, { duration: 250 });
    setTimeout(() => {
      dismiss();
    }, 250);
  }, [dismiss, opacity, translateX]);

  const panGesture = onDismiss
    ? Gesture.Pan()
        .activeOffsetX([-15, 15])
        .failOffsetY([-10, 10])
        .onUpdate((e) => {
          translateX.value = e.translationX;
          // Fade as user drags further
          opacity.value = 1 - Math.min(Math.abs(e.translationX) / SWIPE_THRESHOLD, 0.6);
        })
        .onEnd((e) => {
          if (Math.abs(e.translationX) > SWIPE_THRESHOLD) {
            // Swipe far enough — dismiss
            const direction = e.translationX > 0 ? 1 : -1;
            translateX.value = withTiming(direction * SCREEN_WIDTH, { duration: 200 });
            opacity.value = withTiming(0, { duration: 200 });
            runOnJS(dismiss)();
          } else {
            // Snap back
            translateX.value = withTiming(0, { duration: 200 });
            opacity.value = withTiming(1, { duration: 200 });
          }
        })
    : undefined;

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
    opacity: opacity.value,
  }));

  const cardContent = (
    <Animated.View
      style={[
        styles.card,
        {
          backgroundColor: nc.backgroundCard,
          borderColor: insight.accentColor + "25",
        },
        animatedStyle,
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
          {/* Type badge + dismiss */}
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
                onPress={handleDismissButton}
                hitSlop={{ top: 16, bottom: 16, left: 16, right: 16 }}
                accessibilityRole="button"
                accessibilityLabel="Masquer"
              >
                <FontAwesome name="xmark" size={14} color={nc.textMuted} />
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
    </Animated.View>
  );

  if (panGesture) {
    return <GestureDetector gesture={panGesture}>{cardContent}</GestureDetector>;
  }

  return cardContent;
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
