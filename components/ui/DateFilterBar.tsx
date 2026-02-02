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
  children,
}: DateFilterBarProps) {
  const colorScheme = useColorScheme() ?? "light";
  const tintColor = Colors[colorScheme].tint;

  const mergedContainerStyle = [styles.container, containerStyle];
  const mergedContentStyle = [styles.content, contentContainerStyle];
  const mergedButtonStyle = [styles.button, buttonStyle];
  const mergedTextStyle = [styles.text, textStyle];
  const mergedActiveTextStyle = [styles.textActive, activeTextStyle];
  const resolvedActiveButtonStyle = activeButtonStyle || {
    backgroundColor: tintColor,
  };
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
          isTodaySelected &&
            (activeButtonStyle || { backgroundColor: tintColor }),
        ]}
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
    color: "#fff",
  },
});
