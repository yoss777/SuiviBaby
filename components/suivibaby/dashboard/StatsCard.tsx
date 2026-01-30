import React, { memo, useEffect, useRef } from "react";
import {
  Animated,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import FontAwesome from "@expo/vector-icons/FontAwesome6";

// ============================================
// TYPES
// ============================================

export interface StatsCardProps {
  title: string;
  value: string | number;
  unit: string;
  icon: string;
  color: string;
  lastActivity?: string;
  lastTimestamp?: number;
  onPress?: () => void;
  remindersEnabled?: boolean;
  reminderThreshold?: number;
  currentTime?: Date;
}

// ============================================
// HELPERS
// ============================================

const getTimeSinceLastActivity = (
  lastTimestamp: number,
  currentTime: Date
): string | null => {
  if (!lastTimestamp || isNaN(lastTimestamp)) return null;

  const now = new Date(currentTime.getTime());
  const actionTime = new Date(lastTimestamp);

  const nowTotalMinutes = Math.floor(now.getTime() / (1000 * 60));
  const actionTotalMinutes = Math.floor(actionTime.getTime() / (1000 * 60));

  const diffMinutes = nowTotalMinutes - actionTotalMinutes;

  if (diffMinutes < 0) return null;
  if (diffMinutes === 0) return "à l'instant";

  const diffHours = Math.floor(diffMinutes / 60);
  const remainingMinutes = diffMinutes % 60;

  if (diffHours > 0) {
    return `il y a ${diffHours}h${remainingMinutes > 0 ? ` ${remainingMinutes}min` : ""}`;
  }

  return `il y a ${diffMinutes}min`;
};

// ============================================
// COMPONENT
// ============================================

export const StatsCard = memo(function StatsCard({
  title,
  value,
  unit,
  icon,
  color,
  lastActivity,
  lastTimestamp,
  onPress,
  remindersEnabled = false,
  reminderThreshold = 0,
  currentTime = new Date(),
}: StatsCardProps) {
  const lastSessionDate = currentTime.getTime() - (lastTimestamp || 0);
  const warnThreshold =
    remindersEnabled && reminderThreshold > 0
      ? reminderThreshold * 60 * 60 * 1000
      : null;

  const isWarning =
    lastTimestamp && warnThreshold !== null && lastSessionDate > warnThreshold;

  const timeSince = lastTimestamp
    ? getTimeSinceLastActivity(lastTimestamp, currentTime)
    : null;

  return (
    <TouchableOpacity
      activeOpacity={0.7}
      onPress={onPress}
      style={styles.statsCard}
      accessibilityRole="button"
      accessibilityLabel={`${title}: ${value} ${unit}${lastActivity ? `. Dernière fois: ${lastActivity}` : ""}`}
      accessibilityHint={onPress ? "Appuyez pour voir les détails" : undefined}
    >
      <View style={styles.statsHeader}>
        {title === "Biberons" ? (
          <MaterialCommunityIcons name="baby-bottle" size={20} color={color} />
        ) : (
          <FontAwesome name={icon as any} size={20} color={color} />
        )}
        <Text style={styles.statsTitle}>{title}</Text>
      </View>
      <Text style={[styles.statsValue, { color }]}>
        {value} {unit}
      </Text>
      {lastActivity && (
        <Text style={styles.statsLastActivity}>
          Dernière fois: {lastActivity}
        </Text>
      )}
      {timeSince && (
        <Text
          style={[styles.statsTimeSince, isWarning && { color: "#dc3545" }]}
        >
          {timeSince}
        </Text>
      )}
    </TouchableOpacity>
  );
});

// ============================================
// SKELETON LOADING
// ============================================

export const StatsCardSkeleton = memo(function StatsCardSkeleton() {
  const opacity = useRef(new Animated.Value(0.3)).current;

  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, {
          toValue: 1,
          duration: 800,
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 0.3,
          duration: 800,
          useNativeDriver: true,
        }),
      ])
    );
    animation.start();
    return () => animation.stop();
  }, [opacity]);

  return (
    <View style={styles.statsCard} accessibilityLabel="Chargement en cours">
      <View style={styles.statsHeader}>
        <Animated.View
          style={[styles.skeletonIcon, { opacity }]}
        />
        <Animated.View
          style={[styles.skeletonTitle, { opacity }]}
        />
      </View>
      <Animated.View
        style={[styles.skeletonValue, { opacity }]}
      />
      <Animated.View
        style={[styles.skeletonSubtext, { opacity }]}
      />
    </View>
  );
});

// ============================================
// STYLES
// ============================================

const styles = StyleSheet.create({
  statsCard: {
    flex: 1,
    backgroundColor: "white",
    padding: 16,
    borderRadius: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  statsHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 8,
    gap: 8,
  },
  statsTitle: {
    fontSize: 14,
    color: "#6c757d",
    fontWeight: "500",
  },
  statsValue: {
    fontSize: 24,
    fontWeight: "700",
    marginBottom: 4,
  },
  statsLastActivity: {
    fontSize: 12,
    color: "#6c757d",
  },
  statsTimeSince: {
    fontSize: 11,
    color: "#28a745",
    fontWeight: "500",
  },
  // Skeleton styles
  skeletonIcon: {
    width: 20,
    height: 20,
    backgroundColor: "#e9ecef",
    borderRadius: 10,
  },
  skeletonTitle: {
    width: 60,
    height: 14,
    backgroundColor: "#e9ecef",
    borderRadius: 7,
  },
  skeletonValue: {
    width: 80,
    height: 24,
    backgroundColor: "#e9ecef",
    borderRadius: 8,
    marginBottom: 8,
  },
  skeletonSubtext: {
    width: 100,
    height: 12,
    backgroundColor: "#e9ecef",
    borderRadius: 6,
  },
});
