// components/suivibaby/dashboard/PromenadeWidget.tsx
// Unified layout — same container size whether active or inactive

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

export interface PromenadeWidgetProps {
  isActive: boolean;
  elapsedMinutes: number;
  startTime?: string;
  onStart: () => void;
  onStop: () => void;
  /** Bouton crayon → ouvre la sheet d'édition (ajuster heureFin/note avant écriture). */
  onEdit?: () => void;
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

export const PromenadeWidget = memo(function PromenadeWidget({
  isActive,
  elapsedMinutes,
  startTime,
  onStart,
  onStop,
  onEdit,
  showStopButton = true,
  colorScheme = "light",
  sharedPulseAnim,
}: PromenadeWidgetProps) {
  const nc = getNeutralColors(colorScheme);
  const accentColor = eventColors.activite.dark;
  const textColor = colorScheme === "dark" ? "#A7F3D0" : "#065F46";
  const subtitleColor = colorScheme === "dark" ? "#6EE7B7" : "#047857";
  const bgColor = colorScheme === "dark" ? `${accentColor}15` : `${accentColor}10`;
  const ownPulseAnim = useRef(new Animated.Value(1)).current;
  const pulseAnim = sharedPulseAnim ?? ownPulseAnim;
  const busy = useRef(false);

  useEffect(() => {
    busy.current = false;
  }, [isActive]);

  useEffect(() => {
    if (sharedPulseAnim) return;
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
    setTimeout(() => { busy.current = false; }, 600);
  }, [onStart]);

  const handleStop = useCallback(() => {
    if (busy.current) return;
    busy.current = true;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    onStop();
    setTimeout(() => { busy.current = false; }, 600);
  }, [onStop]);

  const handleEdit = useCallback(() => {
    if (busy.current) return;
    if (!onEdit) return;
    busy.current = true;
    setTimeout(() => { busy.current = false; }, 600);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onEdit();
  }, [onEdit]);

  // Unified container — same structure in both states
  return (
    <Animated.View
      style={[
        styles.container,
        {
          backgroundColor: isActive ? bgColor : nc.backgroundCard,
          borderWidth: isActive ? 2 : 1,
          borderColor: isActive ? accentColor : nc.borderLight,
        },
        isActive && {
          shadowColor: accentColor,
          shadowOpacity: 0.25,
          shadowRadius: 12,
          transform: [{ scale: pulseAnim }],
        },
      ]}
      accessibilityRole={isActive ? "timer" : undefined}
      accessibilityLabel={
        isActive
          ? `Promenade en cours depuis ${formatDuration(elapsedMinutes)}`
          : "Démarrer une promenade"
      }
    >
      {/* Header row */}
      <View style={styles.headerRow}>
        <FontAwesome
          name="person-walking"
          size={14}
          color={isActive ? textColor : accentColor}
        />
        <Text
          style={[
            styles.title,
            { color: isActive ? textColor : nc.textStrong },
          ]}
        >
          {isActive ? "Promenade en cours" : "Démarrer une promenade"}
        </Text>
        {!isActive && (
          <TouchableOpacity
            onPress={handleStart}
            style={styles.playButton}
            accessibilityRole="button"
            accessibilityLabel="Démarrer une promenade"
          >
            <FontAwesome name="play" size={12} color={accentColor} />
          </TouchableOpacity>
        )}
      </View>

      {/* Active content */}
      {isActive && (
        <>
          <Text
            style={[styles.timerValue, { color: textColor }]}
            accessibilityLiveRegion="polite"
          >
            {formatDuration(elapsedMinutes)}
          </Text>
          {startTime && (
            <Text style={[styles.subtitle, { color: subtitleColor }]}>
              Début {startTime}
            </Text>
          )}
          {showStopButton && (
            <View style={styles.actionRow}>
              <TouchableOpacity
                style={[styles.actionButton, { backgroundColor: accentColor }]}
                onPress={handleStop}
                accessibilityRole="button"
                accessibilityLabel="Terminer la promenade"
              >
                <Text style={[styles.actionButtonText, { color: nc.backgroundCard }]}>
                  Terminer
                </Text>
              </TouchableOpacity>
              {onEdit && (
                <TouchableOpacity
                  style={[
                    styles.editButton,
                    {
                      backgroundColor: colorScheme === "dark" ? `${accentColor}15` : bgColor,
                      borderColor: `${accentColor}40`,
                    },
                  ]}
                  onPress={handleEdit}
                  activeOpacity={0.7}
                  accessibilityRole="button"
                  accessibilityLabel="Ajuster la promenade avant d'enregistrer"
                >
                  <FontAwesome name="pen-to-square" size={15} color={accentColor} />
                </TouchableOpacity>
              )}
            </View>
          )}
        </>
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
    flex: 1,
    fontSize: 14,
    fontWeight: "700",
  },
  playButton: {
    padding: 4,
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
  actionButton: {
    flex: 1,
    minHeight: 44,
    paddingVertical: 10,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  actionButtonText: {
    fontWeight: "700",
  },
  actionRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 10,
  },
  editButton: {
    width: 44,
    height: 44,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
});
