import React, { memo } from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import FontAwesome from "@expo/vector-icons/FontAwesome6";

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
  const hour = new Date().getHours();
  const preferNight = hour >= 20 || hour < 6;

  if (isActive) {
    return (
      <View
        style={[styles.statsCard, styles.sleepWidget]}
        accessibilityRole="timer"
        accessibilityLabel={`${isNap ? "Sieste" : "Nuit"} en cours depuis ${formatDuration(elapsedMinutes)}`}
      >
        <View style={styles.sleepWidgetHeader}>
          <View style={styles.sleepWidgetHeaderRow}>
            <FontAwesome
              name={isNap ? "bed" : "moon"}
              size={14}
              color={styles.sleepWidgetTitle.color}
            />
            <Text style={styles.sleepWidgetTitle}>
              {isNap ? "Sieste" : "Nuit"} en cours
            </Text>
          </View>
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
      <Text style={styles.sleepWidgetTitle}>C'est l'heure des beaux rêves ?</Text>
      <Text style={styles.sleepWidgetSubtitle}>Tap pour démarrer</Text>
      <View style={styles.sleepWidgetButtons}>
        <TouchableOpacity
          style={preferNight ? styles.sleepWidgetSecondary : styles.sleepWidgetPrimary}
          onPress={() => onStartSleep(true)}
          accessibilityRole="button"
          accessibilityLabel="Démarrer une sieste"
        >
          <FontAwesome
            name="bed"
            size={12}
            color={preferNight ? styles.sleepWidgetSecondaryText.color : styles.sleepWidgetPrimaryText.color}
          />
          <Text style={preferNight ? styles.sleepWidgetSecondaryText : styles.sleepWidgetPrimaryText}>
            Sieste
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={preferNight ? styles.sleepWidgetPrimary : styles.sleepWidgetSecondary}
          onPress={() => onStartSleep(false)}
          accessibilityRole="button"
          accessibilityLabel="Démarrer une nuit de sommeil"
        >
          <FontAwesome
            name="moon"
            size={12}
            color={preferNight ? styles.sleepWidgetPrimaryText.color : styles.sleepWidgetSecondaryText.color}
          />
          <Text style={preferNight ? styles.sleepWidgetPrimaryText : styles.sleepWidgetSecondaryText}>
            Nuit
          </Text>
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
  sleepWidgetHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
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
    flexDirection: "row",
    justifyContent: "center",
    gap: 6,
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
    flexDirection: "row",
    justifyContent: "center",
    gap: 6,
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
