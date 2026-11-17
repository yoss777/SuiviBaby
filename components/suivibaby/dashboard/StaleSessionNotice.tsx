// Session (sieste, nuit, balade) en cours depuis implausiblement longtemps :
// jamais arrêtée seule (l'heure de fin réelle est inconnue), on invite à la
// corriger. Message + icône (pas la couleur seule) et bouton vers le formulaire.
import { radius, space } from "@/constants/tokens";
import { pressedOpacity, RIPPLE_CLIP, usePressRipple } from "@/components/ui/pressFeedback";
import FontAwesome from "@expo/vector-icons/FontAwesome6";
import React, { memo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

export const STALE_SESSION_MESSAGE = "En cours depuis longtemps — oubliée ?";
export const STALE_SESSION_FIX_LABEL = "Corriger l'heure de fin";

/** Ambre lisible : #8A4B00 ≥ 5,5:1 sur les fonds clairs, #FBBF24 ≥ 6,6:1 sur les sombres. */
export const staleWarningColor = (colorScheme: "light" | "dark") => (colorScheme === "dark" ? "#FBBF24" : "#8A4B00");

interface Props {
  colorScheme: "light" | "dark";
  /** Absent : message seul (pas de droit de modification). */
  onFix?: () => void;
  /** Phrase lue par le lecteur d'écran pour le bouton (ex. « …de la sieste »). */
  fixAccessibilityLabel?: string;
}

export const StaleSessionNotice = memo(function StaleSessionNotice({ colorScheme, onFix, fixAccessibilityLabel }: Props) {
  const ripple = usePressRipple();
  const color = staleWarningColor(colorScheme);
  return (
    <View style={styles.wrap}>
      <View style={styles.messageRow} accessible accessibilityRole="alert" accessibilityLabel={STALE_SESSION_MESSAGE}>
        <FontAwesome name="triangle-exclamation" size={13} color={color} />
        <Text style={[styles.message, { color }]}>{STALE_SESSION_MESSAGE}</Text>
      </View>
      {onFix ? (
        <Pressable
          android_ripple={ripple}
          style={({ pressed }) => [styles.button, { borderColor: color }, pressedOpacity(pressed)]}
          onPress={onFix}
          accessibilityRole="button"
          accessibilityLabel={fixAccessibilityLabel ?? STALE_SESSION_FIX_LABEL}
        >
          <Text style={[styles.buttonText, { color }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>
            {STALE_SESSION_FIX_LABEL}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  wrap: { marginTop: space.xs, gap: space.xs },
  messageRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  message: { flex: 1, fontSize: 13, fontWeight: "700" },
  button: {
    ...RIPPLE_CLIP,
    minHeight: 44,
    paddingHorizontal: space.sm,
    borderRadius: radius.md,
    borderWidth: 1.5,
    alignItems: "center",
    justifyContent: "center",
  },
  buttonText: { fontSize: 14, fontWeight: "700", textAlign: "center" },
});
