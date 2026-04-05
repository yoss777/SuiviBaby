// components/ui/DateTimeSectionRow.tsx
// Complete date/time section: simple mode or chrono mode (start/end/ongoing/duration)

import { getNeutralColors } from "@/constants/dashboardColors";
import FontAwesome5 from "@expo/vector-icons/FontAwesome5";
import FontAwesome from "@expo/vector-icons/FontAwesome6";
import * as Haptics from "expo-haptics";
import { memo, useMemo } from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { DateTimePickerRow } from "./DateTimePickerRow";

// ============================================
// TYPES
// ============================================

interface OngoingToggleColors {
  bg: string;
  border: string;
  text: string;
}

interface DateTimeSectionRowProps {
  colorScheme: "light" | "dark";
  disabled?: boolean;
  onPickerToggle?: (visible: boolean) => void;

  // --- Mode simple (1 date + 1 heure) ---
  label?: string; // Default: "Date et heure"
  value?: Date;
  onChange?: (date: Date) => void;

  // --- Mode chrono (début/fin) ---
  chrono?: boolean;
  chronoLabel?: string; // Default: "Horaires"
  heureDebut?: Date;
  heureFin?: Date | null;
  onHeureDebutChange?: (date: Date) => void;
  onHeureFinChange?: (date: Date | null) => void;

  // Date début (chrono mode)
  showStartDate?: boolean; // Default: true if chrono
  startDateLabel?: string; // Default: "Date début" or "Date"

  // Date fin séparée (pour les nuits qui débordent)
  showEndDate?: boolean;
  endDateLabel?: string; // Default: "Date fin"

  // Toggle "En cours"
  showOngoingToggle?: boolean;
  isOngoing?: boolean;
  onOngoingChange?: (ongoing: boolean) => void;
  ongoingLabel?: string; // Default: "En cours"
  ongoingActiveColors?: OngoingToggleColors;

  // Durée calculée
  showDuration?: boolean;

  // Heure fin constraints
  heureFinMinimumDate?: Date;
  heureFinMaximumDate?: Date;
}

// ============================================
// HELPERS
// ============================================

const formatDuration = (minutes: number): string => {
  if (minutes <= 0) return "0 min";
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m > 0 ? `${h}h${String(m).padStart(2, "0")}` : `${h}h`;
};

// ============================================
// COMPONENT
// ============================================

export const DateTimeSectionRow = memo(function DateTimeSectionRow({
  colorScheme,
  disabled = false,
  onPickerToggle,
  // Simple mode
  label = "Date et heure",
  value,
  onChange,
  // Chrono mode
  chrono = false,
  chronoLabel = "Horaires",
  heureDebut,
  heureFin,
  onHeureDebutChange,
  onHeureFinChange,
  showStartDate = true,
  startDateLabel,
  showEndDate = false,
  endDateLabel = "Date fin",
  // Toggle
  showOngoingToggle = false,
  isOngoing = false,
  onOngoingChange,
  ongoingLabel = "En cours",
  ongoingActiveColors,
  // Duration
  showDuration = false,
  // Constraints
  heureFinMinimumDate,
  heureFinMaximumDate,
}: DateTimeSectionRowProps) {
  const nc = getNeutralColors(colorScheme);

  // Computed duration
  const computedDuration = useMemo(() => {
    if (!showDuration || !heureDebut || !heureFin) return null;
    const ms = heureFin.getTime() - heureDebut.getTime();
    return Math.max(1, Math.round(ms / 60000));
  }, [showDuration, heureDebut, heureFin]);

  // ============================================
  // SIMPLE MODE
  // ============================================

  if (!chrono && value && onChange) {
    return (
      <View style={styles.section}>
        <Text style={[styles.sectionLabel, { color: nc.textLight }]}>
          {label}
        </Text>
        <DateTimePickerRow
          label="Date"
          value={value}
          mode="date"
          colorScheme={colorScheme}
          disabled={disabled}
          onChange={(date) => {
            const next = new Date(value);
            next.setFullYear(
              date.getFullYear(),
              date.getMonth(),
              date.getDate(),
            );
            onChange(next);
          }}
          onPickerToggle={onPickerToggle}
        />
        <DateTimePickerRow
          label="Heure"
          value={value}
          mode="time"
          colorScheme={colorScheme}
          disabled={disabled}
          onChange={(date) => {
            const next = new Date(value);
            next.setHours(date.getHours(), date.getMinutes(), 0, 0);
            onChange(next);
          }}
          onPickerToggle={onPickerToggle}
        />
      </View>
    );
  }

  // ============================================
  // CHRONO MODE
  // ============================================

  if (!heureDebut || !onHeureDebutChange) return null;

  const handleToggleOngoing = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onOngoingChange?.(!isOngoing);
  };

  const handleHeureDebutDateChange = (date: Date) => {
    const next = new Date(heureDebut);
    next.setFullYear(date.getFullYear(), date.getMonth(), date.getDate());
    onHeureDebutChange(next);
    // Also update heureFin date if it exists and is not null
    if (heureFin && onHeureFinChange && !showEndDate) {
      const nextFin = new Date(heureFin);
      nextFin.setFullYear(date.getFullYear(), date.getMonth(), date.getDate());
      onHeureFinChange(nextFin);
    }
  };

  const handleHeureDebutTimeChange = (date: Date) => {
    const next = new Date(heureDebut);
    next.setHours(date.getHours(), date.getMinutes(), 0, 0);
    onHeureDebutChange(next);
    // Push heureFin if it would be before new heureDebut
    if (heureFin && onHeureFinChange && next >= heureFin) {
      onHeureFinChange(new Date(next.getTime() + 60000));
    }
  };

  const handleHeureFinDateChange = (date: Date) => {
    if (!heureFin || !onHeureFinChange) return;
    const next = new Date(heureFin);
    next.setFullYear(date.getFullYear(), date.getMonth(), date.getDate());
    onHeureFinChange(next);
  };

  const handleHeureFinTimeChange = (date: Date) => {
    if (!onHeureFinChange) return;
    // Ensure heureFin is after heureDebut
    const fin =
      date > heureDebut ? date : new Date(heureDebut.getTime() + 60000);
    onHeureFinChange(fin);
  };

  const defaultStartDateLabel = showEndDate ? "Date début" : "Date";

  return (
    <View style={styles.section}>
      <Text style={[styles.sectionLabel, { color: nc.textLight }]}>
        {chronoLabel}
      </Text>

      {/* Date début */}
      {showStartDate && (
        <DateTimePickerRow
          label={startDateLabel ?? defaultStartDateLabel}
          value={heureDebut}
          mode="date"
          colorScheme={colorScheme}
          disabled={disabled}
          onChange={handleHeureDebutDateChange}
          onPickerToggle={onPickerToggle}
          valueStyle="small"
        />
      )}

      {/* Heure début */}
      <DateTimePickerRow
        label="Début"
        value={heureDebut}
        mode="time"
        colorScheme={colorScheme}
        disabled={disabled}
        onChange={handleHeureDebutTimeChange}
        onPickerToggle={onPickerToggle}
      />

      {/* Toggle "En cours" */}
      {showOngoingToggle && (
        <TouchableOpacity
          style={[
            styles.toggleRow,
            {
              borderColor: isOngoing
                ? (ongoingActiveColors?.border ?? nc.textMuted)
                : nc.border,
              backgroundColor: isOngoing
                ? (ongoingActiveColors?.bg ?? nc.borderLight)
                : nc.background,
            },
          ]}
          onPress={handleToggleOngoing}
          disabled={disabled}
          activeOpacity={0.7}
          accessibilityRole="switch"
          accessibilityLabel={ongoingLabel}
          accessibilityState={{ checked: isOngoing }}
          accessibilityHint={`Active si ${ongoingLabel.toLowerCase()}`}
        >
          <Text
            style={[
              styles.toggleLabel,
              {
                color: isOngoing
                  ? (ongoingActiveColors?.text ?? nc.textStrong)
                  : nc.textLight,
              },
            ]}
          >
            {ongoingLabel}
          </Text>
          <FontAwesome
            name={isOngoing ? "toggle-on" : "toggle-off"}
            size={22}
            color={
              isOngoing
                ? (ongoingActiveColors?.border ?? nc.textStrong)
                : nc.textMuted
            }
          />
        </TouchableOpacity>
      )}

      {/* Date fin (for overnight events) */}
      {!isOngoing && showEndDate && heureFin && (
        <DateTimePickerRow
          label={endDateLabel}
          value={heureFin}
          mode="date"
          colorScheme={colorScheme}
          disabled={disabled}
          onChange={handleHeureFinDateChange}
          onPickerToggle={onPickerToggle}
          valueStyle="small"
        />
      )}

      {/* Heure fin */}
      {!isOngoing && (
        <DateTimePickerRow
          label="Fin"
          value={heureFin ?? new Date()}
          mode="time"
          colorScheme={colorScheme}
          disabled={disabled}
          onChange={handleHeureFinTimeChange}
          onPickerToggle={onPickerToggle}
          minimumDate={heureFinMinimumDate ?? heureDebut}
          maximumDate={heureFinMaximumDate}
        />
      )}

      {/* Durée calculée */}
      {!isOngoing && showDuration && computedDuration != null && (
        <View style={styles.durationRow}>
          <FontAwesome5 name="clock" size={12} color={nc.textMuted} />
          <Text style={[styles.durationText, { color: nc.textMuted }]}>
            {`Durée : ${formatDuration(computedDuration)}`}
          </Text>
        </View>
      )}
    </View>
  );
});

// ============================================
// STYLES
// ============================================

const styles = StyleSheet.create({
  section: {
    gap: 0,
  },
  sectionLabel: {
    fontSize: 12,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    paddingTop: 16,
    marginBottom: 12,
  },
  toggleRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1,
    marginBottom: 6,
  },
  toggleLabel: {
    fontSize: 14,
    fontWeight: "500",
  },
  durationRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingTop: 4,
  },
  durationText: {
    fontSize: 13,
    fontWeight: "500",
  },
});
