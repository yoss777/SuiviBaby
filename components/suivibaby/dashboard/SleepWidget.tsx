import {
  getCategoryColors,
  getNeutralColors,
} from "@/constants/dashboardColors";
import FontAwesome from "@expo/vector-icons/FontAwesome6";
import * as Haptics from "expo-haptics";
import React, { memo, useCallback, useEffect, useRef } from "react";
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
  showStopButton?: boolean;
  colorScheme?: "light" | "dark";
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
  showStopButton = true,
  colorScheme = "light",
}: SleepWidgetProps) {
  const nc = getNeutralColors(colorScheme);
  const cat = getCategoryColors(colorScheme);

  // Derive sleep colors from category colors + dark-aware variants
  const sleepColors = {
    primary: cat.sommeil.primary,
    background: cat.sommeil.background,
    border: cat.sommeil.border,
    textDark: colorScheme === "dark" ? "#D4C8F0" : "#4A3D6B",
    textMuted: colorScheme === "dark" ? "#9B8CBF" : "#7A6B9A",
    buttonSecondaryBg: colorScheme === "dark" ? "#2A2140" : "#EDE9F4",
  };

  const hour = new Date().getHours();
  const preferNight = hour >= 20 || hour < 6;
  const busy = useRef(false);

  const handleStart = useCallback(
    (isNapValue: boolean) => {
      if (busy.current) return;
      busy.current = true;
      setTimeout(() => { busy.current = false; }, 600);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      onStartSleep(isNapValue);
    },
    [onStartSleep],
  );

  const handleStop = useCallback(() => {
    if (busy.current) return;
    busy.current = true;
    setTimeout(() => { busy.current = false; }, 600);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    onStopSleep();
  }, [onStopSleep]);

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
          { backgroundColor: nc.backgroundCard },
          styles.sleepWidget,
          {
            backgroundColor: sleepColors.background,
            borderWidth: 2,
            borderColor: sleepColors.primary,
            shadowColor: sleepColors.primary,
            shadowOpacity: 0.25,
            shadowRadius: 12,
          },
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
            <Text style={[styles.sleepWidgetTitle, { color: sleepColors.textDark }]}>
              {isNap ? "Sieste" : "Nuit"} en cours
            </Text>
          </View>
        </View>
        <Text
          style={[styles.sleepWidgetValue, { color: sleepColors.textDark }]}
          accessibilityLiveRegion="polite"
        >
          {formatDuration(elapsedMinutes)}
        </Text>
        <Text style={[styles.sleepWidgetSubtitle, { color: sleepColors.textMuted }]}>
          Début {startTime}
        </Text>
        {showStopButton && (
          <TouchableOpacity
            style={[styles.sleepWidgetStop, { backgroundColor: sleepColors.primary }]}
            onPress={handleStop}
            accessibilityRole="button"
            accessibilityLabel="Terminer le sommeil"
          >
            <Text style={[styles.sleepWidgetStopText, { color: nc.backgroundCard }]}>
              Terminer
            </Text>
          </TouchableOpacity>
        )}
      </Animated.View>
    );
  }

  return (
    <View
      style={[
        styles.statsCard,
        { backgroundColor: nc.backgroundCard },
        styles.sleepWidget,
        {
          backgroundColor: sleepColors.background,
          borderWidth: 1,
          borderColor: sleepColors.border,
        },
      ]}
      accessibilityRole="none"
    >
      <Text style={[styles.sleepWidgetTitle, { color: sleepColors.textDark }]}>
        C'est l'heure des beaux rêves ?
      </Text>
      <Text style={[styles.sleepWidgetSubtitle, { color: sleepColors.textMuted }]}>
        Tap pour démarrer
      </Text>
      <View style={styles.sleepWidgetButtons}>
        <TouchableOpacity
          style={[
            styles.sleepWidgetButton,
            preferNight
              ? { backgroundColor: sleepColors.buttonSecondaryBg }
              : { backgroundColor: sleepColors.primary },
          ]}
          onPress={() => handleStart(true)}
          accessibilityRole="button"
          accessibilityLabel="Démarrer une sieste"
        >
          <FontAwesome
            name="bed"
            size={12}
            color={preferNight ? sleepColors.primary : nc.backgroundCard}
          />
          <Text
            style={[
              styles.sleepWidgetButtonText,
              { color: preferNight ? sleepColors.primary : nc.backgroundCard },
            ]}
          >
            Sieste
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[
            styles.sleepWidgetButton,
            preferNight
              ? { backgroundColor: sleepColors.primary }
              : { backgroundColor: sleepColors.buttonSecondaryBg },
          ]}
          onPress={() => handleStart(false)}
          accessibilityRole="button"
          accessibilityLabel="Démarrer une nuit de sommeil"
        >
          <FontAwesome
            name="moon"
            size={12}
            color={preferNight ? nc.backgroundCard : sleepColors.primary}
          />
          <Text
            style={[
              styles.sleepWidgetButtonText,
              { color: preferNight ? nc.backgroundCard : sleepColors.primary },
            ]}
          >
            Nuit
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
});

// ============================================
// STYLES (layout only — colors applied inline)
// ============================================

const styles = StyleSheet.create({
  statsCard: {
    flex: 1,
    padding: 16,
    borderRadius: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
  sleepWidget: {
    overflow: "hidden",
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
  },
  sleepWidgetValue: {
    marginTop: 6,
    fontSize: 26,
    fontWeight: "700",
  },
  sleepWidgetSubtitle: {
    marginTop: 4,
    fontSize: 12,
  },
  sleepWidgetButtons: {
    flexDirection: "row",
    gap: 10,
    marginTop: 10,
  },
  sleepWidgetButton: {
    flex: 1,
    minHeight: 44,
    paddingVertical: 10,
    borderRadius: 12,
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "center",
    gap: 6,
  },
  sleepWidgetButtonText: {
    fontWeight: "700",
  },
  sleepWidgetStop: {
    marginTop: 10,
    minHeight: 44,
    paddingVertical: 10,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  sleepWidgetStopText: {
    fontWeight: "700",
  },
});
