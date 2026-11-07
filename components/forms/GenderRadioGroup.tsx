import { getNeutralColors } from "@/constants/dashboardColors";
import FontAwesome from "@expo/vector-icons/FontAwesome6";
import { memo } from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";

export type Gender = "male" | "female";

/**
 * Couleurs d'aplat de l'option cochée et couleur du texte/icône posé dessus.
 * Paires vérifiées dans __tests__/paletteContrast.test.ts (≥ 4.5:1) :
 * - rose #FF69B4 + texte sombre #1f2937 (5.5:1) — le blanc n'atteint que 2.65:1 ;
 * - bleu #2563eb (blue-600) + texte blanc (5.2:1) — l'ancien #4A90E2 plafonnait à 3.3:1.
 */
export const GENDER_COLORS = {
  female: "#FF69B4",
  male: "#2563eb",
} as const;

export const GENDER_SELECTED_TEXT = {
  female: "#1f2937",
  male: "#ffffff",
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
              color={checked ? GENDER_SELECTED_TEXT[option.value] : accent}
            />
            <Text
              style={[
                styles.text,
                { color: nc.textStrong },
                checked && { color: GENDER_SELECTED_TEXT[option.value] },
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
