// components/ui/BoundedNumberInput.tsx
//
// Stepper +/- borné, factorise le pattern dupliqué dans PumpingForm,
// MealsForm (biberon), SoinsForm (température), ActivitiesForm (durée),
// RoutinesForm (durée bain).
//
// Pourquoi un composant partagé : avant, chaque form re-codait le stepper,
// le long-press, les bornes via Math.min/max sur le setter, l'accessibilité,
// les styles. Résultat : 5 implémentations divergentes → 5 risques d'oubli
// (min manquant, max manquant, NaN non géré, valeur hors-borne envoyée à
// la CF qui rejette).
//
// Ici on garantit :
//  - valeur clampée à [min, max] (NaN/undefined → min).
//  - long-press accélère après 400ms (parité avec l'existant).
//  - haptic feedback Light à chaque cran (parité).
//  - boutons désactivés visuellement aux bornes atteintes.
//  - aria labels sensés pour VoiceOver/TalkBack.

import { memo, useCallback, useEffect, useRef } from "react";
import {
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  type AccessibilityRole,
} from "react-native";
import * as Haptics from "expo-haptics";

interface BoundedNumberInputProps {
  /** Valeur actuelle (sera clampée si hors [min, max]). */
  value: number;
  /** Callback appelé avec la nouvelle valeur déjà clampée. */
  onChange: (next: number) => void;

  /** Borne inférieure (inclusive). Par défaut 0. */
  min?: number;
  /** Borne supérieure (inclusive). Obligatoire — on refuse de défendre un
   *  champ sans plafond, c'est tout le point. */
  max: number;
  /** Incrément par tap. Par défaut 5. */
  step?: number;

  /** Suffixe affiché à côté de la valeur (ex: "ml", "min"). Optionnel. */
  suffix?: string;
  /** Désactive les deux boutons. */
  disabled?: boolean;

  /** Couleurs neutres injectées (suit le pattern du codebase). */
  colors: {
    background: string;
    backgroundPressed: string;
    textStrong: string;
    textMuted: string;
  };

  /** Label accessibilité pour le bouton "-". Ex: "Diminuer quantité gauche". */
  decrementAccessibilityLabel: string;
  /** Label accessibilité pour le bouton "+". Ex: "Augmenter quantité gauche". */
  incrementAccessibilityLabel: string;
  /** Optionnel : role accessibilité pour la valeur affichée. */
  valueAccessibilityRole?: AccessibilityRole;
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

export const BoundedNumberInput = memo(function BoundedNumberInput({
  value,
  onChange,
  min = 0,
  max,
  step = 5,
  suffix,
  disabled = false,
  colors,
  decrementAccessibilityLabel,
  incrementAccessibilityLabel,
  valueAccessibilityRole,
}: BoundedNumberInputProps) {
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Clean up timers if the component unmounts mid-long-press.
  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  const handlePressIn = useCallback((action: () => void) => {
    action();
    timeoutRef.current = setTimeout(() => {
      intervalRef.current = setInterval(action, 100);
    }, 400);
  }, []);

  const handlePressOut = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  const clamped = clamp(value, min, max);
  const atMin = clamped <= min;
  const atMax = clamped >= max;

  const decrement = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => null);
    const next = clamp(clamped - step, min, max);
    if (next !== clamped) onChange(next);
  }, [clamped, step, min, max, onChange]);

  const increment = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => null);
    const next = clamp(clamped + step, min, max);
    if (next !== clamped) onChange(next);
  }, [clamped, step, min, max, onChange]);

  return (
    <View style={styles.row}>
      <TouchableOpacity
        style={[
          styles.button,
          { backgroundColor: colors.backgroundPressed },
          (disabled || atMin) && styles.buttonDisabled,
        ]}
        onPressIn={() => !disabled && !atMin && handlePressIn(decrement)}
        onPressOut={handlePressOut}
        disabled={disabled || atMin}
        accessibilityRole="button"
        accessibilityLabel={decrementAccessibilityLabel}
        accessibilityState={{ disabled: disabled || atMin }}
      >
        <Text
          style={[
            styles.buttonText,
            { color: disabled || atMin ? colors.textMuted : colors.textStrong },
          ]}
        >
          -
        </Text>
      </TouchableOpacity>

      <Text
        style={[styles.value, { color: colors.textStrong }]}
        accessibilityRole={valueAccessibilityRole}
        accessibilityLabel={
          suffix ? `${clamped} ${suffix}` : String(clamped)
        }
      >
        {clamped}
        {suffix ? ` ${suffix}` : ""}
      </Text>

      <TouchableOpacity
        style={[
          styles.button,
          { backgroundColor: colors.backgroundPressed },
          (disabled || atMax) && styles.buttonDisabled,
        ]}
        onPressIn={() => !disabled && !atMax && handlePressIn(increment)}
        onPressOut={handlePressOut}
        disabled={disabled || atMax}
        accessibilityRole="button"
        accessibilityLabel={incrementAccessibilityLabel}
        accessibilityState={{ disabled: disabled || atMax }}
      >
        <Text
          style={[
            styles.buttonText,
            { color: disabled || atMax ? colors.textMuted : colors.textStrong },
          ]}
        >
          +
        </Text>
      </TouchableOpacity>
    </View>
  );
});

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 16,
    marginBottom: 8,
  },
  button: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    fontSize: 18,
    fontWeight: "700",
  },
  value: {
    fontSize: 16,
    fontWeight: "600",
  },
});
