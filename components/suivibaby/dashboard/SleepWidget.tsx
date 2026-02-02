import {
  categoryColors,
  neutralColors,
} from "@/constants/dashboardColors";
import FontAwesome from "@expo/vector-icons/FontAwesome6";
import React, { memo, useEffect, useRef } from "react";
import {
  Animated,
  Easing,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

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

// Sleep color palette (derived from categoryColors.sommeil)
const sleepColors = {
  primary: categoryColors.sommeil.primary, // #7C6BA4
  background: categoryColors.sommeil.background, // #F5F3F8
  border: categoryColors.sommeil.border, // #EBE7F0
  textDark: "#4A3D6B", // Darker variant for text
  textMuted: "#7A6B9A", // Muted variant for subtitles
  buttonSecondaryBg: "#EDE9F4", // Secondary button background
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

  // Pulse animation for active sleep
  const pulseAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (isActive) {
      const pulse = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 1.02,
            duration: 1500,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 1500,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
        ]),
      );
      pulse.start();
      return () => pulse.stop();
    } else {
      pulseAnim.setValue(1);
    }
  }, [isActive, pulseAnim]);

  if (isActive) {
    return (
      <Animated.View
        style={[
          styles.statsCard,
          styles.sleepWidget,
          styles.sleepWidgetActive,
          { transform: [{ scale: pulseAnim }] },
        ]}
        accessibilityRole="timer"
        accessibilityLabel={`${isNap ? "Sieste" : "Nuit"} en cours depuis ${formatDuration(elapsedMinutes)}`}
      >
        <View style={styles.sleepWidgetHeader}>
          <View style={styles.sleepWidgetHeaderRow}>
            <FontAwesome
              name={isNap ? "bed" : "moon"}
              size={14}
              color={sleepColors.textDark}
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
      </Animated.View>
    );
  }

  return (
    <View
      style={[styles.statsCard, styles.sleepWidget]}
      accessibilityRole="none"
    >
      <Text style={styles.sleepWidgetTitle}>
        C'est l'heure des beaux rêves ?
      </Text>
      <Text style={styles.sleepWidgetSubtitle}>Tap pour démarrer</Text>
      <View style={styles.sleepWidgetButtons}>
        <TouchableOpacity
          style={
            preferNight ? styles.sleepWidgetSecondary : styles.sleepWidgetPrimary
          }
          onPress={() => onStartSleep(true)}
          accessibilityRole="button"
          accessibilityLabel="Démarrer une sieste"
        >
          <FontAwesome
            name="bed"
            size={12}
            color={
              preferNight
                ? sleepColors.primary
                : neutralColors.backgroundCard
            }
          />
          <Text
            style={
              preferNight
                ? styles.sleepWidgetSecondaryText
                : styles.sleepWidgetPrimaryText
            }
          >
            Sieste
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={
            preferNight ? styles.sleepWidgetPrimary : styles.sleepWidgetSecondary
          }
          onPress={() => onStartSleep(false)}
          accessibilityRole="button"
          accessibilityLabel="Démarrer une nuit de sommeil"
        >
          <FontAwesome
            name="moon"
            size={12}
            color={
              preferNight
                ? neutralColors.backgroundCard
                : sleepColors.primary
            }
          />
          <Text
            style={
              preferNight
                ? styles.sleepWidgetPrimaryText
                : styles.sleepWidgetSecondaryText
            }
          >
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
    backgroundColor: neutralColors.backgroundCard,
    padding: 16,
    borderRadius: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
  sleepWidget: {
    backgroundColor: sleepColors.background,
    borderWidth: 1,
    borderColor: sleepColors.border,
  },
  sleepWidgetActive: {
    borderColor: sleepColors.primary,
    borderWidth: 2,
    shadowColor: sleepColors.primary,
    shadowOpacity: 0.25,
    shadowRadius: 12,
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
    color: sleepColors.textDark,
  },
  sleepWidgetValue: {
    marginTop: 6,
    fontSize: 26,
    fontWeight: "700",
    color: sleepColors.textDark,
  },
  sleepWidgetSubtitle: {
    marginTop: 4,
    fontSize: 12,
    color: sleepColors.textMuted,
  },
  sleepWidgetButtons: {
    flexDirection: "row",
    gap: 10,
    marginTop: 10,
  },
  sleepWidgetPrimary: {
    flex: 1,
    backgroundColor: sleepColors.primary,
    paddingVertical: 10,
    borderRadius: 12,
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "center",
    gap: 6,
  },
  sleepWidgetPrimaryText: {
    color: neutralColors.backgroundCard,
    fontWeight: "700",
  },
  sleepWidgetSecondary: {
    flex: 1,
    backgroundColor: sleepColors.buttonSecondaryBg,
    paddingVertical: 10,
    borderRadius: 12,
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "center",
    gap: 6,
  },
  sleepWidgetSecondaryText: {
    color: sleepColors.primary,
    fontWeight: "700",
  },
  sleepWidgetStop: {
    marginTop: 10,
    backgroundColor: sleepColors.primary,
    paddingVertical: 10,
    borderRadius: 12,
    alignItems: "center",
  },
  sleepWidgetStopText: {
    color: neutralColors.backgroundCard,
    fontWeight: "700",
  },
});
