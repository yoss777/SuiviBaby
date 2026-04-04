// components/ui/PaywallPrompt.tsx
// Composant paywall contextuel réutilisable.
// S'affiche quand une feature Premium est bloquée, avec un message adapté.

import { getNeutralColors } from "@/constants/dashboardColors";
import { useColorScheme } from "@/hooks/use-color-scheme";
import {
  PAYWALL_MESSAGES,
  type PaywallTrigger,
} from "@/services/premiumGatingService";
import FontAwesome from "@expo/vector-icons/FontAwesome6";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import { useCallback } from "react";
import {
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

interface PaywallPromptProps {
  trigger: PaywallTrigger;
  /** Style d'affichage : inline (dans le contenu) ou modal (plein écran) */
  variant?: "inline" | "banner";
  /** Callback quand l'utilisateur ferme le prompt (optionnel) */
  onDismiss?: () => void;
}

export function PaywallPrompt({
  trigger,
  variant = "inline",
  onDismiss,
}: PaywallPromptProps) {
  const colorScheme = useColorScheme() ?? "light";
  const nc = getNeutralColors(colorScheme);
  const router = useRouter();
  const message = PAYWALL_MESSAGES[trigger];

  const handleUpgrade = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    router.push("/settings/premium");
  }, [router]);

  if (variant === "banner") {
    return (
      <View
        style={[
          styles.banner,
          { backgroundColor: nc.todayAccent + "10", borderColor: nc.todayAccent + "30" },
        ]}
      >
        <View style={styles.bannerContent}>
          <FontAwesome name="crown" size={16} color={nc.todayAccent} />
          <View style={styles.bannerText}>
            <Text style={[styles.bannerTitle, { color: nc.textStrong }]}>
              {message.title}
            </Text>
            <Text style={[styles.bannerDescription, { color: nc.textMuted }]}>
              {message.description}
            </Text>
          </View>
        </View>
        <View style={styles.bannerActions}>
          <TouchableOpacity
            style={[styles.upgradeButton, { backgroundColor: nc.todayAccent }]}
            onPress={handleUpgrade}
          >
            <Text style={[styles.upgradeButtonText, { color: nc.white }]}>
              {message.ctaText}
            </Text>
          </TouchableOpacity>
          {onDismiss && (
            <TouchableOpacity onPress={onDismiss} style={styles.dismissButton}>
              <Text style={[styles.dismissText, { color: nc.textLight }]}>
                Plus tard
              </Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    );
  }

  // Inline variant (compact)
  return (
    <TouchableOpacity
      style={[
        styles.inline,
        { backgroundColor: nc.todayAccent + "10", borderColor: nc.todayAccent + "30" },
      ]}
      onPress={handleUpgrade}
      activeOpacity={0.7}
    >
      <FontAwesome name="lock" size={14} color={nc.todayAccent} />
      <Text style={[styles.inlineText, { color: nc.todayAccent }]}>
        {message.ctaText}
      </Text>
      <FontAwesome name="arrow-right" size={12} color={nc.todayAccent} />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  // Banner variant
  banner: {
    marginHorizontal: 16,
    marginVertical: 8,
    padding: 16,
    borderRadius: 14,
    borderWidth: 1,
  },
  bannerContent: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
  },
  bannerText: { flex: 1 },
  bannerTitle: { fontSize: 15, fontWeight: "700", marginBottom: 4 },
  bannerDescription: { fontSize: 13, lineHeight: 18 },
  bannerActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginTop: 14,
  },
  upgradeButton: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    alignItems: "center",
  },
  upgradeButtonText: { fontSize: 14, fontWeight: "600" },
  dismissButton: { paddingHorizontal: 8, paddingVertical: 10 },
  dismissText: { fontSize: 13, fontWeight: "500" },

  // Inline variant
  inline: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
  },
  inlineText: { fontSize: 13, fontWeight: "600", flex: 1 },
});
