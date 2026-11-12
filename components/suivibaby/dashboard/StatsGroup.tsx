import { radius, space } from "@/constants/tokens";
import { useMinuteTick } from "@/hooks/useMinuteTick";
import { flatInDark } from "@/constants/theme";
import { getBackgroundTint, getNeutralColors, neutralColors } from "@/constants/dashboardColors";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import FontAwesome from "@expo/vector-icons/FontAwesome6";
import * as Haptics from "expo-haptics";
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
import { configureLayoutAnimation, startLoop } from "@/utils/motion";
import { formatTimeSince } from "@/utils/timeSince";

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
  /**
   * Summary displayed when collapsed (e.g., "5 repas • 120 ml").
   * Texte seulement : il est aussi lu par VoiceOver/TalkBack (un ReactNode
   * serait annoncé « [object Object] »).
   */
  summary: string;
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
  /** Current time for "time since" calculations (sinon tick interne à la minute) */
  currentTime?: Date;
  /**
   * Dernière activité (ms) : le « il y a X » est calculé ici, avec le tick à la
   * minute du composant, pour que l'écran parent ne se re-rende pas.
   * Remplace `timeSince` quand il est fourni.
   */
  timeSinceTimestamp?: number;
  /** Seuils d'alerte évalués ici (un dépassement allume l'état warning). */
  warnings?: { timestamp?: number; thresholdMs: number | null }[];
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

const getTimeSinceLastActivity = formatTimeSince;

/** Libellé lu par le lecteur d'écran : titre, résumé puis « il y a … ». */
export function buildStatsGroupA11yLabel({
  title,
  summary,
  timeSince,
  timeSinceLabel,
}: {
  title: string;
  summary: string;
  timeSince?: string;
  timeSinceLabel?: string;
}): string {
  const parts = [title, summary];
  if (timeSince) {
    parts.push(timeSinceLabel ? `${timeSinceLabel} ${timeSince}` : timeSince);
  }
  return parts.filter(Boolean).join(", ");
}

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
  timeSince: timeSinceProp,
  timeSinceLabel,
  items,
  isWarning: isWarningProp = false,
  onHeaderPress,
  currentTime: currentTimeProp,
  timeSinceTimestamp,
  warnings,
  isLoading = false,
  defaultExpanded = false,
  colorScheme = "light",
}: StatsGroupProps) {
  const nc = getNeutralColors(colorScheme);
  const { currentTime: tickTime } = useMinuteTick(currentTimeProp === undefined);
  const currentTime = currentTimeProp ?? tickTime;
  const nowMs = currentTime.getTime();
  const timeSince =
    timeSinceTimestamp !== undefined
      ? (getTimeSinceLastActivity(timeSinceTimestamp, currentTime) ?? undefined)
      : timeSinceProp;
  const isWarning =
    isWarningProp ||
    !!warnings?.some(
      (w) =>
        w.thresholdMs !== null &&
        !!w.timestamp &&
        nowMs - w.timestamp > w.thresholdMs,
    );
  const [expanded, setExpanded] = useState(defaultExpanded);

  const toggleExpanded = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    configureLayoutAnimation(LayoutAnimation.Presets.easeInEaseOut);
    setExpanded((prev) => !prev);
  }, []);

  const handleHeaderPress = useCallback(() => {
    if (onHeaderPress) {
      onHeaderPress();
    } else {
      toggleExpanded();
    }
  }, [onHeaderPress, toggleExpanded]);

  // Un seul élément accessible (P2-11) : l'en-tête porte l'état déplié ; quand
  // l'en-tête a sa propre action, le dépliage passe par une action nommée.
  const handleAccessibilityAction = useCallback(
    (event: { nativeEvent: { actionName: string } }) => {
      if (event.nativeEvent.actionName === "toggle") toggleExpanded();
      else if (event.nativeEvent.actionName === "activate") handleHeaderPress();
    },
    [toggleExpanded, handleHeaderPress],
  );

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
      startLoop(shimmer);
      return () => shimmer.stop();
    }
  }, [isLoading, shimmerAnim]);

  if (isLoading) {
    const shimmerTranslate = shimmerAnim.interpolate({
      inputRange: [0, 1],
      outputRange: [-200, 200],
    });
    const shimmerBg = colorScheme === "dark" ? nc.shimmerDark : nc.shimmerLight;

    return (
      <View style={[styles.container, flatInDark(colorScheme), { backgroundColor: nc.backgroundCard }]}>
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
    styles.container, flatInDark(colorScheme),
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
        accessibilityLabel={buildStatsGroupA11yLabel({
          title,
          summary,
          timeSince,
          timeSinceLabel,
        })}
        accessibilityHint={
          onHeaderPress
            ? undefined
            : expanded
              ? "Masque le détail"
              : "Affiche le détail"
        }
        accessibilityState={{ expanded }}
        accessibilityActions={
          onHeaderPress
            ? [
                { name: "activate" },
                { name: "toggle", label: expanded ? "Réduire" : "Développer" },
              ]
            : undefined
        }
        onAccessibilityAction={onHeaderPress ? handleAccessibilityAction : undefined}
      >
        <View style={[styles.iconContainer, { backgroundColor: getBackgroundTint(color, 0.08) }]}>
          {renderIcon(icon, iconType, 22, color)}
        </View>

        <View style={styles.headerContent}>
          <Text style={[styles.title, { color: nc.textLight }]}>{title}</Text>
          <Text
            style={[
              styles.summary,
              { color: nc.textStrong },
              isWarning && { color: nc.errorText },
            ]}
          >
            {summary}
          </Text>
          {(lastActivity || timeSince) && (
            <>
              {timeSince && (
                <Text
                  style={[
                    styles.timeSince,
                    { color: nc.textLight },
                    isWarning && { color: nc.errorText },
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
          {onHeaderPress ? (
            // L'en-tête fait autre chose : le chevron garde son appui au doigt,
            // mais reste masqué au lecteur d'écran (action « Développer »).
            <Pressable
              style={styles.expandButton}
              onPress={(e) => {
                e.stopPropagation();
                toggleExpanded();
              }}
              hitSlop={8}
              accessible={false}
              importantForAccessibility="no-hide-descendants"
            >
              <Ionicons
                name={expanded ? "chevron-up" : "chevron-down"}
                size={20}
                color={nc.textMuted}
              />
            </Pressable>
          ) : (
            // Décoratif : tout l'en-tête déplie.
            <View
              style={styles.expandButton}
              accessible={false}
              importantForAccessibility="no-hide-descendants"
            >
              <Ionicons
                name={expanded ? "chevron-up" : "chevron-down"}
                size={20}
                color={nc.textMuted}
              />
            </View>
          )}
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
                accessibilityLabel={[
                  `${item.label}, ${item.value}${item.unit ? ` ${item.unit}` : ""}`,
                  itemTimeSince,
                ]
                  .filter(Boolean)
                  .join(", ")}
              >
                <View
                  style={[
                    styles.itemIcon,
                    { backgroundColor: getBackgroundTint(item.color, 0.06) },
                  ]}
                >
                  {/* La couleur de catégorie reste un repère (pastille), jamais
                      la couleur du chiffre : corail 2,9:1, doré 1,7:1 sur blanc. */}
                  {renderIcon(item.icon, item.iconType, 16, item.color)}
                </View>
                <View style={styles.itemContent}>
                  <Text style={[styles.itemLabel, { color: nc.textNormal }]}>
                    {item.label}
                  </Text>
                  {itemTimeSince && (
                    <Text style={[styles.itemTimeSince, { color: nc.textLight }]}>
                      {itemTimeSince}
                    </Text>
                  )}
                </View>
                <View style={styles.itemValue}>
                  <Text style={[styles.itemValueText, { color: nc.textStrong }]}>
                    {item.value}
                  </Text>
                  {item.unit && (
                    <Text style={[styles.itemUnit, { color: nc.textLight }]}>
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
    borderRadius: radius.lg,
    shadowColor: neutralColors.shadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
    overflow: "hidden",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    padding: space.md,
    gap: space.sm,
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
    gap: space.xs,
  },
  expandButton: {
    padding: space.sm,
    margin: -8,
  },
  itemsContainer: {
    borderTopWidth: 1,
  },
  item: {
    flexDirection: "row",
    alignItems: "center",
    minHeight: 48,
    paddingVertical: space.sm,
    paddingHorizontal: space.md,
    gap: space.sm,
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
    padding: space.md,
    gap: space.sm,
  },
  skeletonIcon: {
    width: 48,
    height: 48,
    borderRadius: 14,
    overflow: "hidden",
  },
  skeletonContent: {
    flex: 1,
    gap: space.xs,
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
    borderRadius: radius.sm,
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
