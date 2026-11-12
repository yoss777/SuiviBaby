// components/suivibaby/dashboard/PromoBanner.tsx
// Contextual promotion banner for the dashboard

import { radius, space } from "@/constants/tokens";
import { getNeutralColors, promoAccent } from "@/constants/dashboardColors";
import type { Promotion } from "@/types/promo";
import { PROMO_TYPE_ICONS, PROMO_TYPE_LABELS } from "@/types/promo";
import FontAwesome from "@expo/vector-icons/FontAwesome6";
import * as Haptics from "expo-haptics";
import React, { memo, useCallback } from "react";
import {
  Clipboard,
  StyleSheet,
  Text,
  Pressable,
  View,
} from "react-native";
import { pressedOpacity, RIPPLE_CLIP, usePressRipple } from "@/components/ui/pressFeedback";

interface PromoBannerProps {
  promo: Promotion;
  onPress: (promo: Promotion) => void;
  onDismiss: (promoId: string) => void;
  onCopyCode?: (code: string) => void;
  colorScheme?: "light" | "dark";
  transparent?: boolean;
}

const PROMO_ACCENT = promoAccent;

export const PromoBanner = memo(function PromoBanner({
  promo,
  onPress,
  onDismiss,
  onCopyCode,
  colorScheme = "light",
  transparent = false,
}: PromoBannerProps) {
  const ripple = usePressRipple();
  const rippleBorderless = { ...ripple, borderless: true };
  const nc = getNeutralColors(colorScheme);
  const typeIcon = PROMO_TYPE_ICONS[promo.type] ?? "tag";
  const typeLabel = PROMO_TYPE_LABELS[promo.type] ?? promo.type;

  const handlePress = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onPress(promo);
  }, [promo, onPress]);

  const handleDismiss = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onDismiss(promo.id);
  }, [promo.id, onDismiss]);

  const handleCopyCode = useCallback(() => {
    if (!promo.promoCode) return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    Clipboard.setString(promo.promoCode);
    onCopyCode?.(promo.promoCode);
  }, [promo.promoCode, onCopyCode]);

  return (
    <Pressable
      android_ripple={ripple}
      style={({ pressed }) => [
        styles.card,
        {
          backgroundColor: transparent ? "transparent" : nc.backgroundCard,
          borderColor: PROMO_ACCENT + "40",
        },
        pressedOpacity(pressed),
      ]}
      onPress={handlePress}
      accessibilityRole="button"
      accessibilityLabel={`Offre : ${promo.title}`}
      accessibilityHint="Appuyez pour voir les détails de l'offre"
      accessibilityState={{ disabled: false }}
    >
      {/* Gold accent strip */}
      <View style={[styles.accentStrip, { backgroundColor: PROMO_ACCENT }]} />

      <View style={styles.content}>
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <View
              style={[
                styles.iconCircle,
                { backgroundColor: PROMO_ACCENT + "15" },
              ]}
            >
              <FontAwesome name={typeIcon} size={14} color={PROMO_ACCENT} />
            </View>
            <View
              style={[styles.typeBadge, { backgroundColor: PROMO_ACCENT + "15" }]}
            >
              <Text style={[styles.typeText, { color: PROMO_ACCENT }]}>
                {typeLabel}
              </Text>
            </View>
          </View>

          {/* Dismiss */}
          <Pressable
            android_ripple={rippleBorderless}
            style={({ pressed }) => pressedOpacity(pressed, 0.2)}
            onPress={handleDismiss}
            hitSlop={{ top: 16, bottom: 16, left: 16, right: 16 }}
            accessibilityRole="button"
            accessibilityLabel="Masquer cette offre"
            accessibilityHint="Cette offre ne sera plus affichée"
            accessibilityState={{ disabled: false }}
          >
            <FontAwesome name="xmark" size={14} color={nc.textMuted} />
          </Pressable>
        </View>

        {/* Title */}
        <Text
          style={[styles.title, { color: nc.textStrong }]}
          numberOfLines={2}
        >
          {promo.title}
        </Text>

        {/* Description */}
        <Text
          style={[styles.description, { color: nc.textLight }]}
          numberOfLines={2}
        >
          {promo.shortDescription ?? promo.description}
        </Text>

        {/* Footer: promo code + CTA */}
        <View style={styles.footer}>
          {promo.promoCode && (
            <Pressable
              android_ripple={ripple}
              style={({ pressed }) => [
                styles.codeContainer,
                { backgroundColor: nc.borderLight + "50" },
                pressedOpacity(pressed),
              ]}
              onPress={handleCopyCode}
              hitSlop={{ top: 16, bottom: 16, left: 16, right: 16 }}
              accessibilityRole="button"
              accessibilityLabel={`Code promo : ${promo.promoCode}. Appuyez pour copier`}
              accessibilityHint="Copie le code dans le presse-papier"
              accessibilityState={{ disabled: false }}
            >
              <FontAwesome name="copy" size={10} color={nc.textMuted} />
              <Text style={[styles.codeText, { color: nc.textStrong }]}>
                {promo.promoCode}
              </Text>
            </Pressable>
          )}
          <View
            style={[styles.ctaBadge, { backgroundColor: PROMO_ACCENT + "15" }]}
          >
            <Text style={[styles.ctaText, { color: PROMO_ACCENT }]}>
              {"Voir l'offre"}
            </Text>
            <FontAwesome name="arrow-right" size={10} color={PROMO_ACCENT} />
          </View>
        </View>
      </View>
    </Pressable>
  );
});

const styles = StyleSheet.create({
  card: {
    borderRadius: radius.md,
    borderWidth: 1,
    overflow: "hidden",
    flexDirection: "row",
  },
  accentStrip: {
    width: 4,
  },
  content: {
    flex: 1,
    padding: space.sm,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: space.xs,
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.xs,
  },
  iconCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  typeBadge: {
    paddingHorizontal: space.xs,
    paddingVertical: 3,
    borderRadius: radius.sm,
  },
  typeText: {
    fontSize: 12,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  title: {
    fontSize: 15,
    fontWeight: "600",
    lineHeight: 20,
    marginBottom: space.xxs,
  },
  description: {
    fontSize: 13,
    lineHeight: 18,
    marginBottom: 10,
  },
  footer: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  codeContainer: {
    ...RIPPLE_CLIP,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: radius.sm,
  },
  codeText: {
    fontSize: 12,
    fontWeight: "700",
    fontFamily: "monospace",
    letterSpacing: 1,
  },
  ctaBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.xxs,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 10,
  },
  ctaText: {
    fontSize: 12,
    fontWeight: "600",
  },
});
