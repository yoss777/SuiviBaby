// components/suivibaby/dashboard/PromenadeWidget.tsx
// Start/stop chrono widget for walks (same pattern as SleepWidget)

import { getNeutralColors } from "@/constants/dashboardColors";
import { eventColors } from "@/constants/eventColors";
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

export interface PromenadeWidgetProps {
  isActive: boolean;
  elapsedMinutes: number;
  startTime?: string;
  onStart: () => void;
  onStop: () => void;
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

export const PromenadeWidget = memo(function PromenadeWidget({
  isActive,
  elapsedMinutes,
  startTime,
  onStart,
  onStop,
  showStopButton = true,
  colorScheme = "light",
}: PromenadeWidgetProps) {
  const nc = getNeutralColors(colorScheme);
  const accentColor = eventColors.activite.dark;
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const busy = useRef(false);

  // Pulse animation when active
  useEffect(() => {
    if (isActive) {
      const loop = Animated.loop(
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
      loop.start();
      return () => loop.stop();
    } else {
      pulseAnim.setValue(1);
    }
  }, [isActive, pulseAnim]);

  const handleStart = useCallback(() => {
    if (busy.current) return;
    busy.current = true;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onStart();
    setTimeout(() => {
      busy.current = false;
    }, 600);
  }, [onStart]);

  const handleStop = useCallback(() => {
    if (busy.current) return;
    busy.current = true;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    onStop();
    setTimeout(() => {
      busy.current = false;
    }, 600);
  }, [onStop]);

  // ============================================
  // ACTIVE STATE — chrono running
  // ============================================

  if (isActive) {
    return (
      <Animated.View
        style={[
          styles.container,
          {
            backgroundColor: accentColor + "10",
            borderWidth: 2,
            borderColor: accentColor,
            shadowColor: accentColor,
            shadowOpacity: 0.25,
            shadowRadius: 12,
          },
          { transform: [{ scale: pulseAnim }] },
        ]}
        accessibilityRole="timer"
        accessibilityLabel={`Promenade en cours depuis ${formatDuration(elapsedMinutes)}`}
      >
        <View style={styles.activeRow}>
          <View style={styles.activeLeft}>
            <FontAwesome name="person-walking" size={22} color={accentColor} />
            <View>
              <Text style={[styles.activeLabel, { color: nc.textStrong }]}>
                {"Promenade en cours"}
              </Text>
              <Text style={[styles.activeTime, { color: accentColor }]}>
                {formatDuration(elapsedMinutes)}
                {startTime && (
                  <Text style={[styles.startTime, { color: nc.textMuted }]}>
                    {`  · depuis ${startTime}`}
                  </Text>
                )}
              </Text>
            </View>
          </View>

          {showStopButton && (
            <TouchableOpacity
              style={[styles.stopButton, { backgroundColor: accentColor }]}
              onPress={handleStop}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel="Terminer la promenade"
              accessibilityHint="Arrête le chrono et ouvre le formulaire"
              accessibilityState={{ disabled: false }}
            >
              <FontAwesome name="stop" size={12} color={nc.background} />
              <Text style={[styles.stopText, { color: nc.background }]}>
                {"Terminer"}
              </Text>
            </TouchableOpacity>
          )}
        </View>
      </Animated.View>
    );
  }

  // ============================================
  // INACTIVE STATE — start button
  // ============================================

  return (
    <TouchableOpacity
      style={[
        styles.container,
        {
          backgroundColor: nc.backgroundCard,
          borderColor: nc.borderLight,
        },
      ]}
      onPress={handleStart}
      activeOpacity={0.7}
      accessibilityRole="button"
      accessibilityLabel="Démarrer une promenade"
      accessibilityHint="Lance le chrono de promenade"
      accessibilityState={{ disabled: false }}
    >
      <View style={styles.inactiveRow}>
        <FontAwesome name="person-walking" size={18} color={accentColor} />
        <Text style={[styles.inactiveLabel, { color: nc.textStrong }]}>
          {"Démarrer une promenade"}
        </Text>
        <FontAwesome name="play" size={12} color={accentColor} />
      </View>
    </TouchableOpacity>
  );
});

// ============================================
// STYLES
// ============================================

const styles = StyleSheet.create({
  container: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 14,
  },
  // Active state
  activeRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  activeLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    flex: 1,
  },
  activeLabel: {
    fontSize: 13,
    fontWeight: "600",
  },
  activeTime: {
    fontSize: 18,
    fontWeight: "700",
    marginTop: 2,
  },
  startTime: {
    fontSize: 12,
    fontWeight: "400",
  },
  stopButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 14,
    minHeight: 44,
    borderRadius: 10,
    justifyContent: "center",
  },
  stopText: {
    fontSize: 13,
    fontWeight: "600",
  },
  // Inactive state
  inactiveRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  inactiveLabel: {
    flex: 1,
    fontSize: 14,
    fontWeight: "500",
  },
});
