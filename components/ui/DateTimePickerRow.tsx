// components/ui/DateTimePickerRow.tsx
// Reusable row: label left, date/time value right, tap to open picker

import { getNeutralColors } from "@/constants/dashboardColors";
import { Colors } from "@/constants/theme";
import FontAwesome5 from "@expo/vector-icons/FontAwesome5";
import * as Haptics from "expo-haptics";
import React, { memo, useCallback, useRef, useState } from "react";
import {
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import DateTimePicker from "@react-native-community/datetimepicker";
import { useFormScroll } from "./FormScrollContext";

interface DateTimePickerRowProps {
  label: string;
  value: Date;
  mode: "date" | "time";
  colorScheme: "light" | "dark";
  disabled?: boolean;
  onChange: (date: Date) => void;
  onPickerToggle?: (visible: boolean) => void;
  minimumDate?: Date;
  maximumDate?: Date;
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

const isSameDateTime = (a: Date, b: Date) => a.getTime() === b.getTime();

export const DateTimePickerRow = memo(function DateTimePickerRow({
  label,
  value,
  mode,
  colorScheme,
  disabled = false,
  onChange,
  minimumDate,
  maximumDate,
  icon,
  valueStyle = mode === "date" ? "small" : "normal",
  accessibilityLabel: a11yLabel,
  accessibilityHint: a11yHint,
}: DateTimePickerRowProps) {
  const nc = getNeutralColors(colorScheme);
  const formScroll = useFormScroll();
  const [showPicker, setShowPicker] = useState(false);
  // On iOS spinner, keep a controlled temporary value until user confirms.
  const [pendingValue, setPendingValue] = useState(value);
  const pendingValueRef = useRef(value);
  const openValueRef = useRef(value);

  const handleOpen = useCallback(() => {
    if (disabled) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    openValueRef.current = value;
    pendingValueRef.current = value;
    setPendingValue(value);
    setShowPicker(true);
    if (Platform.OS === "ios") {
      setTimeout(() => {
        formScroll?.scrollToEnd();
      }, 80);
    }
  }, [disabled, formScroll, value]);

  // Android: onChange fires once on confirm, dismiss fires with no date
  const handleChangeAndroid = useCallback(
    (_: unknown, date?: Date) => {
      setShowPicker(false);
      if (date) onChange(date);
    },
    [onChange],
  );

  // iOS spinner: onChange fires on every scroll tick. Update the form live
  // so the displayed value cannot appear stuck behind the sheet re-render.
  const handleChangeIOS = useCallback(
    (_: unknown, date?: Date) => {
      if (!date) return;
      pendingValueRef.current = date;
      setPendingValue(date);
      onChange(date);
    },
    [onChange],
  );

  const handleConfirmIOS = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setShowPicker(false);
    if (!isSameDateTime(pendingValueRef.current, value)) {
      onChange(pendingValueRef.current);
    }
  }, [onChange, value]);

  const handleCancelIOS = useCallback(() => {
    pendingValueRef.current = openValueRef.current;
    setPendingValue(openValueRef.current);
    setShowPicker(false);
    if (!isSameDateTime(openValueRef.current, value)) {
      onChange(openValueRef.current);
    }
  }, [onChange, value]);

  const isIOS = Platform.OS === "ios";

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
        <View style={isIOS ? styles.pickerContainer : undefined}>
          {isIOS && (
            <View style={[styles.pickerToolbar, { borderColor: nc.border }]}>
              <TouchableOpacity
                onPress={handleCancelIOS}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                accessibilityRole="button"
                accessibilityLabel="Annuler"
              >
                <Text style={[styles.toolbarButton, { color: nc.textMuted }]}>
                  Annuler
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleConfirmIOS}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                accessibilityRole="button"
                accessibilityLabel="Valider"
              >
                <Text style={[styles.toolbarButton, styles.toolbarConfirm, { color: Colors[colorScheme].tint }]}>
                  OK
                </Text>
              </TouchableOpacity>
            </View>
          )}
          <DateTimePicker
            value={isIOS ? pendingValue : value}
            mode={mode}
            is24Hour={mode === "time"}
            display={isIOS ? "spinner" : "default"}
            themeVariant={colorScheme}
            minimumDate={minimumDate}
            maximumDate={maximumDate}
            onChange={isIOS ? handleChangeIOS : handleChangeAndroid}
            style={isIOS ? styles.pickerIOS : undefined}
          />
        </View>
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
  pickerContainer: {
    alignItems: "stretch",
    width: "100%",
  },
  pickerIOS: {
    alignSelf: "center",
    width: "100%",
  },
  pickerToolbar: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  toolbarButton: {
    fontSize: 16,
    fontWeight: "500",
  },
  toolbarConfirm: {
    fontWeight: "700",
  },
});
