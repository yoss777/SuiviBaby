import { PropsWithChildren } from "react";
import {
  Pressable,
  ScrollView,
  StyleProp,
  StyleSheet,
  TextStyle,
  ViewStyle,
} from "react-native";

import { ThemedText } from "@/components/themed-text";
import { getAccentColors } from "@/components/ui/accentColors";
import { getNeutralColors } from "@/constants/dashboardColors";
import { Colors } from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";

export type DateFilterValue = "today" | "past";

type DateFilterBarProps = PropsWithChildren<{
  selected: DateFilterValue;
  onSelect: (value: DateFilterValue) => void;
  containerStyle?: StyleProp<ViewStyle>;
  contentContainerStyle?: StyleProp<ViewStyle>;
  buttonStyle?: StyleProp<ViewStyle>;
  activeButtonStyle?: StyleProp<ViewStyle>;
  textStyle?: StyleProp<TextStyle>;
  activeTextStyle?: StyleProp<TextStyle>;
  variant?: "filled" | "soft";
  activeAccentColor?: string;
}>;

export function DateFilterBar({
  selected,
  onSelect,
  containerStyle,
  contentContainerStyle,
  buttonStyle,
  activeButtonStyle,
  textStyle,
  activeTextStyle,
  variant = "filled",
  activeAccentColor,
  children,
}: DateFilterBarProps) {
  const colorScheme = useColorScheme() ?? "light";
  const nc = getNeutralColors(colorScheme);
  const tintColor = Colors[colorScheme].tint;
  const accentColors = getAccentColors(
    activeAccentColor ?? tintColor,
    colorScheme,
  );
  // Active text must contrast with tint background (dark mode tint is white)
  const activeTextColor =
    colorScheme === "dark" ? Colors[colorScheme].background : nc.white;

  const mergedContainerStyle = [styles.container, containerStyle];
  const mergedContentStyle = [styles.content, contentContainerStyle];
  const mergedButtonStyle = [
    styles.button,
    variant === "soft" && {
      backgroundColor: nc.background,
      borderColor: nc.border,
      borderWidth: 1,
    },
    buttonStyle,
  ];
  const mergedTextStyle = [
    styles.text,
    variant === "soft" && { color: nc.textLight },
    textStyle,
  ];
  const resolvedActiveTextColor =
    variant === "soft" ? accentColors.softText : activeTextColor;
  const mergedActiveTextStyle = [
    styles.textActive,
    { color: resolvedActiveTextColor },
    activeTextStyle,
  ];
  const resolvedActiveButtonStyle =
    activeButtonStyle ||
    (variant === "soft"
      ? {
          backgroundColor: accentColors.softBg,
          borderColor: accentColors.softBorder,
          borderWidth: 1,
        }
      : {
          backgroundColor: tintColor,
        });
  const isTodaySelected = selected === "today";
  const isPastSelected = selected === "past";

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={mergedContainerStyle}
      contentContainerStyle={mergedContentStyle}
    >
      <Pressable
        onPress={() => onSelect("today")}
        style={[
          mergedButtonStyle,
          isTodaySelected && resolvedActiveButtonStyle,
        ]}
        accessibilityRole="button"
        accessibilityState={{ selected: isTodaySelected }}
      >
        <ThemedText
          style={[mergedTextStyle, isTodaySelected && mergedActiveTextStyle]}
        >
          Aujourd&apos;hui
        </ThemedText>
      </Pressable>

      <Pressable
        onPress={() => onSelect("past")}
        style={[mergedButtonStyle, isPastSelected && resolvedActiveButtonStyle]}
        accessibilityRole="button"
        accessibilityState={{ selected: isPastSelected }}
      >
        <ThemedText
          style={[mergedTextStyle, isPastSelected && mergedActiveTextStyle]}
        >
          Historique
        </ThemedText>
      </Pressable>

      {children}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    // borderBottomWidth: 1,
    borderBottomColor: "#e0e0e0",
  },
  content: {
    flexDirection: "row",
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  button: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 16,
    // borderWidth: 1,
  },
  text: {
    fontSize: 13,
    fontWeight: "600",
  },
  textActive: {
    // color applied dynamically via activeTextColor
  },
});
