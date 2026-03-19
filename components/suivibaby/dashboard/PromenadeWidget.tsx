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
  sharedPulseAnim?: Animated.Value; // Shared pulse for sync with other widgets
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
  sharedPulseAnim,
}: PromenadeWidgetProps) {
  const nc = getNeutralColors(colorScheme);
  const accentColor = eventColors.activite.dark; // #10b981 — border, bg, button
  const textColor = colorScheme === "dark" ? "#A7F3D0" : "#065F46"; // light mint / dark emerald
  const subtitleColor = colorScheme === "dark" ? "#6EE7B7" : "#047857";
  const ownPulseAnim = useRef(new Animated.Value(1)).current;
  const pulseAnim = sharedPulseAnim ?? ownPulseAnim;
  const busy = useRef(false);

  // Pulse animation when active (only if using own anim, not shared)
  useEffect(() => {
    if (sharedPulseAnim) return; // Shared pulse managed by parent
    if (isActive) {
      const loop = Animated.loop(
        Animated.sequence([
          Animated.timing(ownPulseAnim, {
            toValue: 1.02,
            duration: 1500,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.timing(ownPulseAnim, {
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
      ownPulseAnim.setValue(1);
    }
  }, [isActive, ownPulseAnim, sharedPulseAnim]);

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
          styles.activeContainer,
          {
            backgroundColor: accentColor + "10",
            borderWidth: 2,
            borderColor: accentColor,
            shadowColor: accentColor,
            shadowOpacity: 0.25,
            shadowRadius: 12,
            shadowOffset: { width: 0, height: 2 },
            elevation: 4,
          },
          { transform: [{ scale: pulseAnim }] },
        ]}
        accessibilityRole="timer"
        accessibilityLabel={`Promenade en cours depuis ${formatDuration(elapsedMinutes)}`}
      >
        <View style={styles.activeHeader}>
          <FontAwesome name="person-walking" size={14} color={textColor} />
          <Text style={[styles.activeLabel, { color: textColor }]}>
            {"Promenade en cours"}
          </Text>
        </View>
        <Text
          style={[styles.activeTime, { color: textColor }]}
          accessibilityLiveRegion="polite"
        >
          {formatDuration(elapsedMinutes)}
        </Text>
        {startTime && (
          <Text style={[styles.activeSubtitle, { color: subtitleColor }]}>
            {`Début ${startTime}`}
          </Text>
        )}
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
            <Text style={[styles.stopText, { color: nc.backgroundCard }]}>
              {"Terminer"}
            </Text>
          </TouchableOpacity>
        )}
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
  // Active state (vertical layout — hero duration, full-width stop button)
  activeContainer: {
    borderRadius: 16,
    padding: 16,
    overflow: "hidden",
  },
  activeHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  activeLabel: {
    fontSize: 14,
    fontWeight: "700",
  },
  activeTime: {
    marginTop: 6,
    fontSize: 26,
    fontWeight: "700",
  },
  activeSubtitle: {
    marginTop: 4,
    fontSize: 12,
  },
  stopButton: {
    marginTop: 10,
    minHeight: 44,
    paddingVertical: 10,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  stopText: {
    fontWeight: "700",
  },
  // Inactive state (horizontal — compact start button)
  container: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 14,
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
