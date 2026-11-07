import { getNeutralColors } from "@/constants/dashboardColors";
import FontAwesome from "@expo/vector-icons/FontAwesome6";
import { memo } from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";

export type Gender = "male" | "female";

const GENDER_COLORS = {
  female: "#FF69B4",
  male: "#4A90E2",
} as const;

const OPTIONS: { value: Gender; label: string; icon: string }[] = [
  { value: "female", label: "Fille", icon: "venus" },
  { value: "male", label: "Garçon", icon: "mars" },
];

type Props = {
  value: Gender | "";
  onChange: (value: Gender) => void;
  colorScheme: "light" | "dark";
  disabled?: boolean;
  /** Libellé lu par le lecteur d'écran pour le groupe. */
  accessibilityLabel?: string;
};

/**
 * Choix du sexe : groupe de boutons radio. Le lecteur d'écran annonce
 * « Fille, bouton radio, coché, 1 sur 2 » au lieu de deux boutons sans lien.
 */
export const GenderRadioGroup = memo(function GenderRadioGroup({
  value,
  onChange,
  colorScheme,
  disabled = false,
  accessibilityLabel = "Sexe",
}: Props) {
  const nc = getNeutralColors(colorScheme);

  return (
    <View
      style={styles.container}
      accessibilityRole="radiogroup"
      accessibilityLabel={accessibilityLabel}
    >
      {OPTIONS.map((option) => {
        const checked = value === option.value;
        const accent = GENDER_COLORS[option.value];
        return (
          <TouchableOpacity
            key={option.value}
            style={[
              styles.button,
              { borderColor: nc.border, backgroundColor: nc.backgroundCard },
              checked && { borderColor: accent, backgroundColor: accent },
            ]}
            onPress={() => onChange(option.value)}
            disabled={disabled}
            activeOpacity={0.7}
            accessibilityRole="radio"
            accessibilityLabel={option.label}
            accessibilityState={{ checked, disabled }}
          >
            <FontAwesome
              name={option.icon}
              size={24}
              color={checked ? nc.white : accent}
            />
            <Text
              style={[
                styles.text,
                { color: nc.textStrong },
                checked && { color: nc.white },
              ]}
            >
              {option.label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    gap: 12,
  },
  button: {
    flex: 1,
    minHeight: 56,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 16,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: 2,
    gap: 8,
  },
  text: {
    fontSize: 16,
    fontWeight: "600",
  },
});
