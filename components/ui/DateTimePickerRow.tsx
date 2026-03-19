// components/ui/DateTimePickerRow.tsx
// Reusable row: label left, date/time value right, tap to open picker

import { getNeutralColors } from "@/constants/dashboardColors";
import FontAwesome5 from "@expo/vector-icons/FontAwesome5";
import * as Haptics from "expo-haptics";
import React, { memo, useCallback, useState } from "react";
import {
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import DateTimePicker from "@react-native-community/datetimepicker";

interface DateTimePickerRowProps {
  label: string;
  value: Date;
  mode: "date" | "time";
  colorScheme: "light" | "dark";
  disabled?: boolean;
  onChange: (date: Date) => void;
  onPickerToggle?: (visible: boolean) => void;
  minimumDate?: Date;
  icon?: string; // FontAwesome5 icon name (optional, shown before label)
  valueStyle?: "normal" | "small"; // "small" for date display, "normal" for time
  accessibilityLabel?: string;
  accessibilityHint?: string;
}

const formatDate = (date: Date) =>
  date.toLocaleDateString("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });

const formatTime = (date: Date) =>
  date.toLocaleTimeString("fr-FR", {
    hour: "2-digit",
    minute: "2-digit",
  });

export const DateTimePickerRow = memo(function DateTimePickerRow({
  label,
  value,
  mode,
  colorScheme,
  disabled = false,
  onChange,
  onPickerToggle,
  minimumDate,
  icon,
  valueStyle = mode === "date" ? "small" : "normal",
  accessibilityLabel: a11yLabel,
  accessibilityHint: a11yHint,
}: DateTimePickerRowProps) {
  const nc = getNeutralColors(colorScheme);
  const [showPicker, setShowPicker] = useState(false);

  const handleOpen = useCallback(() => {
    if (disabled) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setShowPicker(true);
    onPickerToggle?.(true);
  }, [disabled, onPickerToggle]);

  const handleChange = useCallback(
    (_: unknown, date?: Date) => {
      setShowPicker(false);
      onPickerToggle?.(false);
      if (date) onChange(date);
    },
    [onChange, onPickerToggle],
  );

  const displayValue =
    mode === "date" ? formatDate(value) : formatTime(value);

  return (
    <>
      <TouchableOpacity
        style={[
          styles.row,
          { borderColor: nc.border, backgroundColor: nc.background },
        ]}
        onPress={handleOpen}
        disabled={disabled}
        activeOpacity={0.7}
        accessibilityRole="button"
        accessibilityLabel={a11yLabel ?? `Modifier ${label.toLowerCase()}`}
        accessibilityHint={
          a11yHint ??
          `Ouvre le sélecteur ${mode === "date" ? "de date" : "d'heure"}`
        }
        accessibilityState={{ disabled }}
      >
        {icon && (
          <FontAwesome5
            name={icon}
            size={14}
            color={nc.textMuted}
          />
        )}
        <Text style={[styles.label, { color: nc.textLight }]}>
          {label}
        </Text>
        <Text
          style={[
            styles.value,
            { color: nc.textStrong },
            valueStyle === "small" && styles.valueSmall,
          ]}
        >
          {displayValue}
        </Text>
      </TouchableOpacity>

      {showPicker && (
        <DateTimePicker
          value={value}
          mode={mode}
          is24Hour={mode === "time"}
          display={Platform.OS === "ios" ? "spinner" : "default"}
          themeVariant={colorScheme}
          minimumDate={minimumDate}
          onChange={handleChange}
        />
      )}
    </>
  );
});

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1,
    marginBottom: 6,
    gap: 8,
  },
  label: {
    fontSize: 14,
    fontWeight: "500",
    flex: 1,
  },
  value: {
    fontSize: 18,
    fontWeight: "700",
  },
  valueSmall: {
    fontSize: 15,
    fontWeight: "500",
  },
});
