// Style unique des fenêtres de l'app (information, confirmation, choix) et de
// leurs boutons, calqués sur le pied des formulaires : même hauteur (52), mêmes
// arrondis (14), « Annuler » en contour, action principale pleine. Une fenêtre
// ouverte depuis un formulaire a ainsi les mêmes boutons que lui.
import React from "react";
import { Pressable, StyleSheet, Text, type ViewStyle } from "react-native";

import { getNeutralColors, neutralColors } from "@/constants/dashboardColors";
import { Colors } from "@/constants/theme";
import { radius, space } from "@/constants/tokens";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { pressedOpacity, RIPPLE_CLIP, usePressRipple } from "./pressFeedback";

/** Rouge destructif unique de l'app (token `destructive`, comme DESTRUCTIVE_COLOR). */
const DESTRUCTIVE = neutralColors.destructive;

export type DialogButtonVariant = "primary" | "secondary" | "destructive";

/** Hauteur et arrondis des boutons de pied de formulaire, repris tels quels. */
export const DIALOG_BUTTON_MIN_HEIGHT = 52;
export const DIALOG_BUTTON_RADIUS = 14;

export function DialogButton({
  text,
  variant,
  onPress,
  layout,
  color,
  textColor,
  disabled = false,
  testID,
}: {
  text: string;
  variant: DialogButtonVariant;
  onPress: () => void;
  /** "row" : partage la ligne ; "stack" : pleine largeur. */
  layout: "row" | "stack";
  /** Couleur imposée par l'appelant (ex. bouton d'une fenêtre existante). */
  color?: string;
  textColor?: string;
  disabled?: boolean;
  testID?: string;
}) {
  const scheme = useColorScheme() ?? "light";
  const nc = getNeutralColors(scheme);
  const theme = Colors[scheme];
  const ripple = usePressRipple();

  const filled = variant !== "secondary";
  const bg =
    color ?? (variant === "destructive" ? DESTRUCTIVE : variant === "primary" ? theme.tint : nc.background);
  const ink =
    textColor ?? (variant === "destructive" ? "#fff" : variant === "primary" ? theme.onTint : nc.textNormal);
  const box: ViewStyle = filled
    ? { backgroundColor: bg }
    : { backgroundColor: bg, borderWidth: 1, borderColor: nc.border };

  return (
    <Pressable
      style={({ pressed }) => [
        styles.button,
        layout === "row" ? styles.row : styles.stack,
        box,
        disabled && styles.disabled,
        pressedOpacity(pressed),
      ]}
      android_ripple={ripple}
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      accessibilityLabel={text}
      accessibilityHint={variant === "destructive" ? "Action définitive" : undefined}
      testID={testID}
    >
      {/* Plafond ×2 : en très grande police, les boutons restent à l'écran. */}
      <Text style={[filled ? styles.strong : styles.normal, { color: ink }]} maxFontSizeMultiplier={2}>
        {text}
      </Text>
    </Pressable>
  );
}

/** Boîte, titre et message communs aux trois fenêtres. */
export const dialogStyles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "rgba(0,0,0,0.5)",
    padding: space.lg,
  },
  card: {
    width: "100%",
    maxWidth: 400,
    // Jamais plus haute que l'écran (très grande police) : le contenu défile,
    // les boutons restent visibles (recette 1.0.22, test 22).
    maxHeight: "88%",
    borderRadius: radius.xl,
    padding: space.xl,
  },
  title: {
    fontSize: 20,
    fontWeight: "700",
    marginBottom: space.xs,
    textAlign: "center",
  },
  message: {
    fontSize: 15,
    lineHeight: 22,
    marginBottom: space.lg,
    textAlign: "center",
  },
  messageContainer: {
    marginBottom: space.lg,
  },
  buttonsRow: {
    flexDirection: "row",
    gap: space.sm,
  },
  buttonsStack: {
    flexDirection: "column",
    gap: space.sm,
  },
});

const styles = StyleSheet.create({
  button: {
    ...RIPPLE_CLIP,
    minHeight: DIALOG_BUTTON_MIN_HEIGHT,
    paddingVertical: 14,
    paddingHorizontal: space.md,
    borderRadius: DIALOG_BUTTON_RADIUS,
    alignItems: "center",
    justifyContent: "center",
  },
  row: { flex: 1 },
  disabled: { opacity: 0.5 },
  stack: { alignSelf: "stretch" },
  strong: { fontSize: 16, fontWeight: "700", textAlign: "center" },
  normal: { fontSize: 16, fontWeight: "600", textAlign: "center" },
});
