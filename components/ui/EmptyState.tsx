import Ionicons from "@expo/vector-icons/Ionicons";
import React from "react";
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";

import { getBackgroundTint, getNeutralColors } from "@/constants/dashboardColors";
import { Colors } from "@/constants/theme";
import { radius, space } from "@/constants/tokens";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { pressedOpacity, usePressRipple } from "./pressFeedback";

export interface EmptyStateCta {
  label: string;
  onPress: () => void;
  /** Par défaut : le libellé visible. */
  accessibilityLabel?: string;
}

export interface EmptyStateProps {
  /** Icône déjà dimensionnée (36 pt conseillé) dans la couleur `accentColor`. */
  icon: React.ReactNode;
  /** Couleur de la catégorie : teinte la pastille d'icône. */
  accentColor: string;
  title: string;
  subtitle?: string;
  /** Bouton principal (aplat `tint`, texte `onTint`). */
  cta?: EmptyStateCta;
  /** Contenu sous le bouton (ex. « Charger plus »). */
  children?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}

/**
 * État vide partagé des écrans de liste (routines, jalons, activités,
 * croissance…) : pastille d'icône, phrase utile, CTA lisible en clair comme
 * en sombre.
 */
export function EmptyState({
  icon,
  accentColor,
  title,
  subtitle,
  cta,
  children,
  style,
}: EmptyStateProps) {
  const colorScheme = useColorScheme() ?? "light";
  const nc = getNeutralColors(colorScheme);
  const theme = Colors[colorScheme];
  const ripple = usePressRipple();

  return (
    <View style={[styles.container, style]}>
      <View
        style={[styles.iconWrapper, { backgroundColor: getBackgroundTint(accentColor, 0.08) }]}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      >
        {icon}
      </View>
      <Text accessibilityRole="header" style={[styles.title, { color: nc.textStrong }]}>
        {title}
      </Text>
      {subtitle ? (
        <Text style={[styles.subtitle, { color: nc.textLight }]}>{subtitle}</Text>
      ) : null}
      {cta ? (
        <Pressable
          style={({ pressed }) => [
            styles.cta,
            { backgroundColor: theme.tint },
            pressedOpacity(pressed),
          ]}
          android_ripple={ripple}
          onPress={cta.onPress}
          accessibilityRole="button"
          accessibilityLabel={cta.accessibilityLabel ?? cta.label}
        >
          <Ionicons name="add" size={20} color={theme.onTint} />
          <Text style={[styles.ctaText, { color: theme.onTint }]}>{cta.label}</Text>
        </Pressable>
      ) : null}
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: space.xxl,
  },
  iconWrapper: {
    width: 80,
    height: 80,
    borderRadius: 40,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: space.md,
  },
  title: {
    fontSize: 18,
    lineHeight: 24,
    fontWeight: "700",
    textAlign: "center",
  },
  subtitle: {
    fontSize: 14,
    lineHeight: 24,
    marginTop: 6,
    textAlign: "center",
  },
  cta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    minHeight: 44,
    paddingHorizontal: space.lg,
    paddingVertical: space.sm,
    borderRadius: radius.pill,
    marginTop: space.lg,
    overflow: "hidden", // borne le ripple Android au bouton
  },
  ctaText: {
    fontSize: 15,
    fontWeight: "600",
  },
});
