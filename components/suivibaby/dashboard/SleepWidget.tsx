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

export interface SleepWidgetProps {
  isActive: boolean;
  isNap?: boolean;
  elapsedMinutes: number;
  startTime?: string;
  onStartSleep: (isNap: boolean) => void;
  onStopSleep: () => void;
  showStopButton?: boolean;
  colorScheme?: "light" | "dark";
  sharedPulseAnim?: Animated.Value;
}

const formatDuration = (minutes?: number): string => {
  if (!minutes || minutes <= 0) return "0 min";
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m > 0 ? `${h}h${String(m).padStart(2, "0")}` : `${h}h`;
};

export const SleepWidget = memo(function SleepWidget({
  isActive,
  isNap,
  elapsedMinutes,
  startTime,
  onStartSleep,
  onStopSleep,
  showStopButton = true,
  colorScheme = "light",
  sharedPulseAnim,
}: SleepWidgetProps) {
  const nc = getNeutralColors(colorScheme);
  const cat = getCategoryColors(colorScheme);

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
  const ownPulseAnim = useRef(new Animated.Value(1)).current;
  const pulseAnim = sharedPulseAnim ?? ownPulseAnim;

  useEffect(() => {
    if (sharedPulseAnim) return;
    if (isActive) {
      const pulse = Animated.loop(
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
      pulse.start();
      return () => pulse.stop();
    } else {
      ownPulseAnim.setValue(1);
    }
  }, [isActive, pulseAnim]);

  // Unified container — same size whether active or inactive
  return (
    <Animated.View
      style={[
        styles.container,
        {
          backgroundColor: sleepColors.background,
          borderWidth: isActive ? 2 : 1,
          borderColor: isActive ? sleepColors.primary : sleepColors.border,
        },
        isActive && {
          shadowColor: sleepColors.primary,
          shadowOpacity: 0.25,
          shadowRadius: 12,
          transform: [{ scale: pulseAnim }],
        },
      ]}
      accessibilityRole={isActive ? "timer" : "none"}
      accessibilityLabel={
        isActive
          ? `${isNap ? "Sieste" : "Nuit"} en cours depuis ${formatDuration(elapsedMinutes)}`
          : "Démarrer un sommeil"
      }
    >
      {/* Header row — always present */}
      <View style={styles.headerRow}>
        <FontAwesome
          name={isActive ? (isNap ? "bed" : "moon") : "cloud-moon"}
          size={14}
          color={sleepColors.textDark}
        />
        <Text style={[styles.title, { color: sleepColors.textDark }]}>
          {isActive
            ? `${isNap ? "Sieste" : "Nuit"} en cours`
            : "C'est l'heure des beaux rêves ?"}
        </Text>
      </View>

      {/* Middle content */}
      {isActive ? (
        <>
          <Text
            style={[styles.timerValue, { color: sleepColors.textDark }]}
            accessibilityLiveRegion="polite"
          >
            {formatDuration(elapsedMinutes)}
          </Text>
          <Text style={[styles.subtitle, { color: sleepColors.textMuted }]}>
            Début {startTime}
          </Text>
        </>
      ) : (
        <Text style={[styles.subtitle, { color: sleepColors.textMuted, marginTop: 4 }]}>
          Tap pour démarrer
        </Text>
      )}

      {/* Action buttons */}
      {isActive ? (
        showStopButton && (
          <TouchableOpacity
            style={[styles.actionButton, { backgroundColor: sleepColors.primary }]}
            onPress={handleStop}
            accessibilityRole="button"
            accessibilityLabel="Terminer le sommeil"
          >
            <Text style={[styles.actionButtonText, { color: nc.backgroundCard }]}>
              Terminer
            </Text>
          </TouchableOpacity>
        )
      ) : (
        <View style={styles.buttonsRow}>
          <TouchableOpacity
            style={[
              styles.startButton,
              {
                backgroundColor: preferNight
                  ? sleepColors.buttonSecondaryBg
                  : sleepColors.primary,
              },
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
                styles.startButtonText,
                { color: preferNight ? sleepColors.primary : nc.backgroundCard },
              ]}
            >
              Sieste
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[
              styles.startButton,
              {
                backgroundColor: preferNight
                  ? sleepColors.primary
                  : sleepColors.buttonSecondaryBg,
              },
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
                styles.startButtonText,
                { color: preferNight ? nc.backgroundCard : sleepColors.primary },
              ]}
            >
              Nuit
            </Text>
          </TouchableOpacity>
        </View>
      )}
    </Animated.View>
  );
});

const styles = StyleSheet.create({
  container: {
    borderRadius: 16,
    padding: 16,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  title: {
    fontSize: 14,
    fontWeight: "700",
  },
  timerValue: {
    marginTop: 6,
    fontSize: 26,
    fontWeight: "700",
  },
  subtitle: {
    marginTop: 4,
    fontSize: 12,
  },
  buttonsRow: {
    flexDirection: "row",
    gap: 10,
    marginTop: 10,
  },
  startButton: {
    flex: 1,
    minHeight: 44,
    paddingVertical: 10,
    borderRadius: 12,
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "center",
    gap: 6,
  },
  startButtonText: {
    fontWeight: "700",
  },
  actionButton: {
    marginTop: 10,
    minHeight: 44,
    paddingVertical: 10,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  actionButtonText: {
    fontWeight: "700",
  },
});
