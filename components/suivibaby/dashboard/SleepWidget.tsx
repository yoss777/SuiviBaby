import React, { memo } from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";

// ============================================
// TYPES
// ============================================

export interface SleepWidgetProps {
  isActive: boolean;
  isNap?: boolean;
  elapsedMinutes: number;
  startTime?: string;
  onStartSleep: (isNap: boolean) => void;
  onStopSleep: () => void;
}

// ============================================
// HELPERS
// ============================================

const formatDuration = (minutes?: number): string => {
  if (!minutes || minutes <= 0) return "0 min";
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m > 0 ? `${h}h${String(m).padStart(2, "0")}` : `${h}h`;
};

// ============================================
// COMPONENT
// ============================================

export const SleepWidget = memo(function SleepWidget({
  isActive,
  isNap,
  elapsedMinutes,
  startTime,
  onStartSleep,
  onStopSleep,
}: SleepWidgetProps) {
  if (isActive) {
    return (
      <View
        style={[styles.statsCard, styles.sleepWidget]}
        accessibilityRole="timer"
        accessibilityLabel={`${isNap ? "Sieste" : "Nuit"} en cours depuis ${formatDuration(elapsedMinutes)}`}
      >
        <View style={styles.sleepWidgetHeader}>
          <Text style={styles.sleepWidgetTitle}>
            {isNap ? "Sieste" : "Nuit"} en cours
          </Text>
        </View>
        <Text
          style={styles.sleepWidgetValue}
          accessibilityLiveRegion="polite"
        >
          {formatDuration(elapsedMinutes)}
        </Text>
        <Text style={styles.sleepWidgetSubtitle}>Début {startTime}</Text>
        <TouchableOpacity
          style={styles.sleepWidgetStop}
          onPress={onStopSleep}
          accessibilityRole="button"
          accessibilityLabel="Terminer le sommeil"
        >
          <Text style={styles.sleepWidgetStopText}>Terminer</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View
      style={[styles.statsCard, styles.sleepWidget]}
      accessibilityRole="none"
    >
      <Text style={styles.sleepWidgetTitle}>Nouvelle session</Text>
      <Text style={styles.sleepWidgetSubtitle}>Tap pour démarrer</Text>
      <View style={styles.sleepWidgetButtons}>
        <TouchableOpacity
          style={styles.sleepWidgetPrimary}
          onPress={() => onStartSleep(true)}
          accessibilityRole="button"
          accessibilityLabel="Démarrer une sieste"
        >
          <Text style={styles.sleepWidgetPrimaryText}>Sieste</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.sleepWidgetSecondary}
          onPress={() => onStartSleep(false)}
          accessibilityRole="button"
          accessibilityLabel="Démarrer une nuit de sommeil"
        >
          <Text style={styles.sleepWidgetSecondaryText}>Nuit</Text>
        </TouchableOpacity>
      </View>
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
  sleepWidget: {
    backgroundColor: "#f5f0ff",
    borderWidth: 1,
    borderColor: "#ede7f6",
  },
  sleepWidgetHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  sleepWidgetTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: "#4c2c79",
  },
  sleepWidgetValue: {
    marginTop: 6,
    fontSize: 26,
    fontWeight: "700",
    color: "#4c2c79",
  },
  sleepWidgetSubtitle: {
    marginTop: 4,
    fontSize: 12,
    color: "#6b5c85",
  },
  sleepWidgetButtons: {
    flexDirection: "row",
    gap: 10,
    marginTop: 10,
  },
  sleepWidgetPrimary: {
    flex: 1,
    backgroundColor: "#6f42c1",
    paddingVertical: 10,
    borderRadius: 12,
    alignItems: "center",
  },
  sleepWidgetPrimaryText: {
    color: "#fff",
    fontWeight: "700",
  },
  sleepWidgetSecondary: {
    flex: 1,
    backgroundColor: "#efe7ff",
    paddingVertical: 10,
    borderRadius: 12,
    alignItems: "center",
  },
  sleepWidgetSecondaryText: {
    color: "#6f42c1",
    fontWeight: "700",
  },
  sleepWidgetStop: {
    marginTop: 10,
    backgroundColor: "#6f42c1",
    paddingVertical: 10,
    borderRadius: 12,
    alignItems: "center",
  },
  sleepWidgetStopText: {
    color: "#fff",
    fontWeight: "700",
  },
});
