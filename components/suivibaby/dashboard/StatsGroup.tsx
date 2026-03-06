import { getNeutralColors } from "@/constants/dashboardColors";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import FontAwesome from "@expo/vector-icons/FontAwesome6";
import * as Haptics from "expo-haptics";
import type { ReactNode } from "react";
import { memo, useCallback, useEffect, useRef, useState } from "react";
import {
  Animated,
  LayoutAnimation,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  UIManager,
  View,
} from "react-native";

// Enable LayoutAnimation on Android
if (
  Platform.OS === "android" &&
  UIManager.setLayoutAnimationEnabledExperimental
) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

// ============================================
// TYPES
// ============================================

export interface StatItem {
  key: string;
  label: string;
  value: string | number;
  unit?: string;
  icon: string;
  iconType?: "fa" | "mc"; // FontAwesome or MaterialCommunityIcons
  color: string;
  lastTimestamp?: number;
  onPress?: () => void;
}

export interface StatsGroupProps {
  title: string;
  icon: string;
  iconType?: "fa" | "mc";
  color: string;
  /** Background color for the card (pastel tint) */
  backgroundColor?: string;
  /** Border color for the card */
  borderColor?: string;
  /** Summary displayed when collapsed (e.g., "5 repas • 120ml") */
  summary: ReactNode;
  /** Optional last activity time (e.g., "00:30") */
  lastActivity?: string;
  /** Optional secondary text (e.g., "il y a 2h") */
  timeSince?: string;
  /** Optional label for timeSince (e.g., "Dernier repas") */
  timeSinceLabel?: string;
  /** Individual stats to show when expanded */
  items: StatItem[];
  /** If true, shows warning style */
  isWarning?: boolean;
  /** Called when the main header is pressed (optional) */
  onHeaderPress?: () => void;
  /** Current time for "time since" calculations */
  currentTime?: Date;
  /** Loading state */
  isLoading?: boolean;
  /** Start expanded */
  defaultExpanded?: boolean;
  /** Color scheme for dark mode support */
  colorScheme?: "light" | "dark";
}

// ============================================
// HELPERS
// ============================================

const getTimeSinceLastActivity = (
  lastTimestamp: number,
  currentTime: Date,
): string | null => {
  if (!lastTimestamp || isNaN(lastTimestamp)) return null;

  const now = currentTime.getTime();
  const diffMinutes = Math.floor((now - lastTimestamp) / (1000 * 60));

  if (diffMinutes < 0) return null;
  if (diffMinutes === 0) return "à l'instant";

  const diffHours = Math.floor(diffMinutes / 60);
  const remainingMinutes = diffMinutes % 60;

  if (diffHours > 0) {
    return `il y a ${diffHours}h${remainingMinutes > 0 ? `${remainingMinutes}` : ""}`;
  }

  return `il y a ${diffMinutes}min`;
};

// ============================================
// COMPONENT
// ============================================

export const StatsGroup = memo(function StatsGroup({
  title,
  icon,
  iconType = "fa",
  color,
  backgroundColor,
  borderColor,
  summary,
  lastActivity,
  timeSince,
  timeSinceLabel,
  items,
  isWarning = false,
  onHeaderPress,
  currentTime = new Date(),
  isLoading = false,
  defaultExpanded = false,
  colorScheme = "light",
}: StatsGroupProps) {
  const nc = getNeutralColors(colorScheme);
  const [expanded, setExpanded] = useState(defaultExpanded);

  const toggleExpanded = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExpanded((prev) => !prev);
  }, []);

  const handleHeaderPress = useCallback(() => {
    if (onHeaderPress) {
      onHeaderPress();
    } else {
      toggleExpanded();
    }
  }, [onHeaderPress, toggleExpanded]);

  const renderIcon = (
    iconName: string,
    type: "fa" | "mc" = "fa",
    size = 20,
    iconColor = color,
  ) => {
    if (iconName === "baby-bottle" || type === "mc") {
      return (
        <MaterialCommunityIcons
          name={iconName as any}
          size={size}
          color={iconColor}
        />
      );
    }
    return <FontAwesome name={iconName as any} size={size} color={iconColor} />;
  };

  // Shimmer animation for skeleton
  const shimmerAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (isLoading) {
      const shimmer = Animated.loop(
        Animated.timing(shimmerAnim, {
          toValue: 1,
          duration: 1200,
          useNativeDriver: true,
        }),
      );
      shimmer.start();
      return () => shimmer.stop();
    }
  }, [isLoading, shimmerAnim]);

  if (isLoading) {
    const shimmerTranslate = shimmerAnim.interpolate({
      inputRange: [0, 1],
      outputRange: [-200, 200],
    });
    const shimmerBg =
      colorScheme === "dark"
        ? "rgba(255, 255, 255, 0.08)"
        : "rgba(255, 255, 255, 0.4)";

    return (
      <View style={[styles.container, { backgroundColor: nc.backgroundCard }]}>
        <View style={styles.skeletonRow}>
          <View style={[styles.skeletonIcon, { backgroundColor: nc.borderLight }]}>
            <Animated.View
              style={[
                styles.shimmerOverlay,
                { backgroundColor: shimmerBg, transform: [{ translateX: shimmerTranslate }] },
              ]}
            />
          </View>
          <View style={styles.skeletonContent}>
            <View style={[styles.skeletonTitle, { backgroundColor: nc.borderLight }]}>
              <Animated.View
                style={[
                  styles.shimmerOverlay,
                  { backgroundColor: shimmerBg, transform: [{ translateX: shimmerTranslate }] },
                ]}
              />
            </View>
            <View style={[styles.skeletonSummary, { backgroundColor: nc.borderLight }]}>
              <Animated.View
                style={[
                  styles.shimmerOverlay,
                  { backgroundColor: shimmerBg, transform: [{ translateX: shimmerTranslate }] },
                ]}
              />
            </View>
          </View>
        </View>
      </View>
    );
  }

  const containerStyle = [
    styles.container,
    { backgroundColor: backgroundColor ?? nc.backgroundCard },
    borderColor && { borderWidth: 1, borderColor },
  ];

  return (
    <View style={containerStyle}>
      {/* Header Row */}
      <Pressable
        style={({ pressed }) => [
          styles.header,
          pressed && { backgroundColor: nc.backgroundPressed },
        ]}
        onPress={handleHeaderPress}
        accessibilityRole="button"
        accessibilityLabel={`${title}: ${summary}`}
        accessibilityHint="Appuyez pour voir les détails"
      >
        <View style={[styles.iconContainer, { backgroundColor: `${color}15` }]}>
          {renderIcon(icon, iconType, 22, color)}
        </View>

        <View style={styles.headerContent}>
          <Text style={[styles.title, { color: nc.textLight }]}>{title}</Text>
          {typeof summary === "string" ? (
            <Text
              style={[
                styles.summary,
                { color: nc.textStrong },
                isWarning && { color: nc.error },
              ]}
            >
              {summary}
            </Text>
          ) : (
            <View style={isWarning ? { opacity: 0.8 } : undefined}>
              {summary}
            </View>
          )}
          {(lastActivity || timeSince) && (
            <>
              {timeSince && (
                <Text
                  style={[
                    styles.timeSince,
                    { color: nc.textMuted },
                    isWarning && { color: nc.error },
                  ]}
                >
                  {timeSinceLabel
                    ? `${timeSinceLabel}, ${timeSince}`
                    : timeSince}
                </Text>
              )}
            </>
          )}
        </View>

        <View style={styles.headerActions}>
          <Pressable
            style={styles.expandButton}
            onPress={(e) => {
              e.stopPropagation();
              toggleExpanded();
            }}
            hitSlop={8}
            accessibilityLabel={expanded ? "Réduire" : "Développer"}
          >
            <Ionicons
              name={expanded ? "chevron-up" : "chevron-down"}
              size={20}
              color={nc.textMuted}
            />
          </Pressable>
        </View>
      </Pressable>

      {/* Expanded Items */}
      {expanded && (
        <View style={[styles.itemsContainer, { borderTopColor: nc.borderLight }]}>
          {items.map((item, index) => {
            const itemTimeSince = item.lastTimestamp
              ? getTimeSinceLastActivity(item.lastTimestamp, currentTime)
              : null;
            const isItemDisabled = !item.onPress;

            return (
              <Pressable
                key={item.key}
                style={({ pressed }) => [
                  styles.item,
                  index < items.length - 1 && [
                    styles.itemBorder,
                    { borderBottomColor: nc.borderLight },
                  ],
                  pressed && !isItemDisabled && { backgroundColor: nc.background },
                  isItemDisabled && styles.itemDisabled,
                ]}
                onPress={
                  item.onPress
                    ? () => {
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                        item.onPress!();
                      }
                    : undefined
                }
                disabled={isItemDisabled}
                accessibilityRole="button"
                accessibilityLabel={`${item.label}: ${item.value} ${item.unit || ""}`}
              >
                <View
                  style={[
                    styles.itemIcon,
                    { backgroundColor: `${item.color}10` },
                  ]}
                >
                  {renderIcon(item.icon, item.iconType, 16, item.color)}
                </View>
                <View style={styles.itemContent}>
                  <Text style={[styles.itemLabel, { color: nc.textNormal }]}>
                    {item.label}
                  </Text>
                  {itemTimeSince && (
                    <Text style={[styles.itemTimeSince, { color: nc.textMuted }]}>
                      {itemTimeSince}
                    </Text>
                  )}
                </View>
                <View style={styles.itemValue}>
                  <Text style={[styles.itemValueText, { color: item.color }]}>
                    {item.value}
                  </Text>
                  {item.unit && (
                    <Text style={[styles.itemUnit, { color: nc.textMuted }]}>
                      {item.unit}
                    </Text>
                  )}
                </View>
                {!isItemDisabled && (
                  <Ionicons name="chevron-forward" size={16} color={nc.textMuted} />
                )}
              </Pressable>
            );
          })}
        </View>
      )}
    </View>
  );
});

// ============================================
// STYLES (layout only — colors applied inline via nc)
// ============================================

const styles = StyleSheet.create({
  container: {
    borderRadius: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
    overflow: "hidden",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    padding: 16,
    gap: 12,
  },
  iconContainer: {
    width: 48,
    height: 48,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  headerContent: {
    flex: 1,
    gap: 2,
  },
  title: {
    fontSize: 13,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  summary: {
    fontSize: 16,
    fontWeight: "700",
  },
  timeSince: {
    fontSize: 12,
    fontWeight: "500",
  },
  headerActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  expandButton: {
    padding: 12,
    margin: -8,
  },
  itemsContainer: {
    borderTopWidth: 1,
  },
  item: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    paddingHorizontal: 16,
    gap: 12,
  },
  itemBorder: {
    borderBottomWidth: 1,
  },
  itemDisabled: {
    opacity: 0.7,
  },
  itemIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  itemContent: {
    flex: 1,
  },
  itemLabel: {
    fontSize: 15,
    fontWeight: "500",
  },
  itemTimeSince: {
    fontSize: 12,
    marginTop: 1,
  },
  itemValue: {
    alignItems: "flex-end",
  },
  itemValueText: {
    fontSize: 17,
    fontWeight: "700",
  },
  itemUnit: {
    fontSize: 12,
    marginTop: 1,
  },
  // Skeleton with shimmer
  skeletonRow: {
    flexDirection: "row",
    alignItems: "center",
    padding: 16,
    gap: 12,
  },
  skeletonIcon: {
    width: 48,
    height: 48,
    borderRadius: 14,
    overflow: "hidden",
  },
  skeletonContent: {
    flex: 1,
    gap: 8,
  },
  skeletonTitle: {
    height: 14,
    width: "40%",
    borderRadius: 6,
    overflow: "hidden",
  },
  skeletonSummary: {
    height: 20,
    width: "70%",
    borderRadius: 8,
    overflow: "hidden",
  },
  shimmerOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    width: 100,
  },
});
