import { useColorScheme } from "@/hooks/use-color-scheme";
import { Ionicons } from "@expo/vector-icons";
import { Pressable, StyleSheet, Text } from "react-native";
import { getAccentColors } from "./accentColors";

type SelectedDateChipProps = {
  label: string;
  accentColor: string;
  onPress: () => void;
};

export function SelectedDateChip({
  label,
  accentColor,
  onPress,
}: SelectedDateChipProps) {
  const colorScheme = useColorScheme() ?? "light";
  const accentColors = getAccentColors(accentColor, colorScheme);

  return (
    <Pressable
      style={[
        styles.chip,
        {
          backgroundColor: accentColors.softBg,
          borderColor: accentColors.softBorder,
        },
      ]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel="Effacer la date sélectionnée"
    >
      <Text style={[styles.text, { color: accentColors.softText }]}>
        {label}
      </Text>
      <Ionicons name="close" size={14} color={accentColors.softText} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 16,
    borderWidth: 1,
  },
  text: {
    fontSize: 13,
    fontWeight: "600",
  },
});
