import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import FontAwesome from "@expo/vector-icons/FontAwesome6";
import { memo, useCallback, useState } from "react";
import {
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
  /** Summary displayed when collapsed (e.g., "5 repas • 120ml") */
  summary: string;
  /** Optional last activity time (e.g., "00:30") */
  lastActivity?: string;
  /** Optional secondary text (e.g., "il y a 2h") */
  timeSince?: string;
  /** Individual stats to show when expanded */
  items: StatItem[];
  /** If true, shows warning style */
  isWarning?: boolean;
  /** Called when the main header is pressed (optional quick-add) */
  onHeaderPress?: () => void;
  /** Called when the add button is pressed */
  onAddPress?: () => void;
  /** Current time for "time since" calculations */
  currentTime?: Date;
  /** Loading state */
  isLoading?: boolean;
  /** Start expanded */
  defaultExpanded?: boolean;
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
  summary,
  lastActivity,
  timeSince,
  items,
  isWarning = false,
  onHeaderPress,
  onAddPress,
  currentTime = new Date(),
  isLoading = false,
  defaultExpanded = false,
}: StatsGroupProps) {
  const [expanded, setExpanded] = useState(defaultExpanded);

  const toggleExpanded = useCallback(() => {
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

  if (isLoading) {
    return (
      <View style={styles.container}>
        <View style={styles.skeletonHeader} />
        <View style={styles.skeletonSummary} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header Row */}
      <Pressable
        style={({ pressed }) => [
          styles.header,
          pressed && styles.headerPressed,
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
          <Text style={styles.title}>{title}</Text>
          <Text style={[styles.summary, isWarning && styles.summaryWarning]}>
            {summary}
          </Text>
          {(lastActivity || timeSince) && (
            <>
              {/* {lastActivity && (
                <Text style={styles.lastActivity}>
                  Dernière fois: {lastActivity}
                </Text>
              )} */}
              {timeSince && (
                <Text
                  style={[
                    styles.timeSince,
                    isWarning && styles.timeSinceWarning,
                  ]}
                >
                  {timeSince}
                </Text>
              )}
            </>
          )}
        </View>

        <View style={styles.headerActions}>
          {onAddPress && (
            <Pressable
              style={({ pressed }) => [
                styles.addButton,
                { backgroundColor: `${color}15` },
                pressed && styles.addButtonPressed,
              ]}
              onPress={onAddPress}
              hitSlop={8}
              accessibilityLabel={`Ajouter ${title.toLowerCase()}`}
            >
              <FontAwesome name="plus" size={14} color={color} />
            </Pressable>
          )}
          <Pressable
            style={styles.expandButton}
            onPress={toggleExpanded}
            hitSlop={8}
            accessibilityLabel={expanded ? "Réduire" : "Développer"}
          >
            <Ionicons
              name={expanded ? "chevron-up" : "chevron-down"}
              size={20}
              color="#9ca3af"
            />
          </Pressable>
        </View>
      </Pressable>

      {/* Expanded Items */}
      {expanded && (
        <View style={styles.itemsContainer}>
          {items.map((item, index) => {
            const itemTimeSince = item.lastTimestamp
              ? getTimeSinceLastActivity(item.lastTimestamp, currentTime)
              : null;

            return (
              <Pressable
                key={item.key}
                style={({ pressed }) => [
                  styles.item,
                  index < items.length - 1 && styles.itemBorder,
                  pressed && styles.itemPressed,
                ]}
                onPress={item.onPress}
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
                  <Text style={styles.itemLabel}>{item.label}</Text>
                  {itemTimeSince && (
                    <Text style={styles.itemTimeSince}>{itemTimeSince}</Text>
                  )}
                </View>
                <View style={styles.itemValue}>
                  <Text style={[styles.itemValueText, { color: item.color }]}>
                    {item.value}
                  </Text>
                  {item.unit && (
                    <Text style={styles.itemUnit}>{item.unit}</Text>
                  )}
                </View>
              </Pressable>
            );
          })}
        </View>
      )}
    </View>
  );
});

// ============================================
// STYLES
// ============================================

const styles = StyleSheet.create({
  container: {
    backgroundColor: "white",
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
  headerPressed: {
    backgroundColor: "#f8f9fa",
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
    color: "#6b7280",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  summary: {
    fontSize: 18,
    fontWeight: "700",
    color: "#1f2937",
  },
  summaryWarning: {
    color: "#dc3545",
  },
  timeSince: {
    fontSize: 12,
    color: "#28a745",
    fontWeight: "500",
  },
  lastActivity: {
    fontSize: 12,
    color: "#6b7280",
    marginTop: 4,
  },
  timeSinceLabel: {
    fontSize: 11,
    color: "#9ca3af",
    marginTop: 6,
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  timeSinceWarning: {
    color: "#dc3545",
  },
  headerActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  addButton: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  addButtonPressed: {
    opacity: 0.7,
  },
  expandButton: {
    padding: 4,
  },
  itemsContainer: {
    borderTopWidth: 1,
    borderTopColor: "#f3f4f6",
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
    borderBottomColor: "#f3f4f6",
  },
  itemPressed: {
    backgroundColor: "#f9fafb",
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
    color: "#374151",
  },
  itemTimeSince: {
    fontSize: 12,
    color: "#9ca3af",
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
    color: "#9ca3af",
    marginTop: 1,
  },
  // Skeleton
  skeletonHeader: {
    height: 48,
    backgroundColor: "#f3f4f6",
    margin: 16,
    borderRadius: 12,
  },
  skeletonSummary: {
    height: 20,
    backgroundColor: "#f3f4f6",
    marginHorizontal: 16,
    marginBottom: 16,
    borderRadius: 8,
    width: "60%",
  },
});
