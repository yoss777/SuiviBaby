// components/suivibaby/dashboard/ReferralCard.tsx
// Referral program card with share functionality

import { getNeutralColors } from "@/constants/dashboardColors";
import { Colors } from "@/constants/theme";
import { REFERRAL_TIERS, getReferralTier } from "@/types/promo";
import FontAwesome from "@expo/vector-icons/FontAwesome6";
import * as Haptics from "expo-haptics";
import React, { memo, useCallback } from "react";
import {
  Clipboard,
  Share,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

interface ReferralCardProps {
  referralCode: string;
  referralCount: number;
  onCopyCode: () => void;
  colorScheme?: "light" | "dark";
}

export const ReferralCard = memo(function ReferralCard({
  referralCode,
  referralCount,
  onCopyCode,
  colorScheme = "light",
}: ReferralCardProps) {
  const nc = getNeutralColors(colorScheme);
  const tint = Colors[colorScheme].tint;
  const currentTier = getReferralTier(referralCount);

  const handleShare = useCallback(async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      await Share.share({
        message: `Rejoins-moi sur Samaye pour suivre le développement de ton bébé ! Utilise mon code ${referralCode} pour obtenir 1 mois Premium offert. https://samaye.app/invite/${referralCode}`,
      });
    } catch {
      // User cancelled
    }
  }, [referralCode]);

  const handleCopy = useCallback(() => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    Clipboard.setString(referralCode);
    onCopyCode();
  }, [referralCode, onCopyCode]);

  // Find next tier
  const nextTier = REFERRAL_TIERS.find((t) => referralCount < t.minReferrals);

  return (
    <View
      style={[
        styles.card,
        { backgroundColor: nc.backgroundCard, borderColor: tint + "30" },
      ]}
      accessibilityRole="summary"
      accessibilityLabel={`Programme parrainage : ${referralCount} parrainage${referralCount > 1 ? "s" : ""}`}
    >
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <FontAwesome name="user-plus" size={14} color={tint} />
          <Text style={[styles.headerTitle, { color: nc.textStrong }]}>
            {"Inviter des parents"}
          </Text>
        </View>
        {currentTier && (
          <View style={[styles.tierBadge, { backgroundColor: tint + "15" }]}>
            <FontAwesome
              name={
                REFERRAL_TIERS.find((t) => t.tier === currentTier)?.icon ??
                "medal"
              }
              size={10}
              color={tint}
            />
            <Text style={[styles.tierText, { color: tint }]}>
              {REFERRAL_TIERS.find((t) => t.tier === currentTier)?.label}
            </Text>
          </View>
        )}
      </View>

      {/* Description */}
      <Text style={[styles.description, { color: nc.textLight }]}>
        {"Partagez votre code et gagnez 1 mois Premium par parrainage"}
      </Text>

      {/* Progress to next tier */}
      {nextTier && (
        <View style={styles.progressRow}>
          <View
            style={[styles.progressBg, { backgroundColor: nc.borderLight }]}
          >
            <View
              style={[
                styles.progressFill,
                {
                  backgroundColor: tint,
                  width: `${Math.min(100, Math.round((referralCount / nextTier.minReferrals) * 100))}%`,
                },
              ]}
            />
          </View>
          <Text style={[styles.progressText, { color: nc.textMuted }]}>
            {referralCount}/{nextTier.minReferrals} {nextTier.label}
          </Text>
        </View>
      )}

      {/* Code + actions */}
      <View style={styles.actions}>
        <TouchableOpacity
          style={[styles.codeBtn, { backgroundColor: nc.borderLight + "50" }]}
          onPress={handleCopy}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel={`Code parrainage : ${referralCode}. Appuyez pour copier`}
        >
          <FontAwesome name="copy" size={12} color={nc.textMuted} />
          <Text style={[styles.codeText, { color: nc.textStrong }]}>
            {referralCode}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.shareBtn, { backgroundColor: tint }]}
          onPress={handleShare}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel="Partager le code de parrainage"
          accessibilityHint="Ouvre le menu de partage"
        >
          <FontAwesome name="share-nodes" size={12} color={nc.white} />
          <Text style={[styles.shareText, { color: nc.white }]}>
            {"Partager"}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  card: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 14,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 6,
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  headerTitle: {
    fontSize: 14,
    fontWeight: "600",
  },
  tierBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  tierText: {
    fontSize: 10,
    fontWeight: "700",
  },
  description: {
    fontSize: 13,
    lineHeight: 18,
    marginBottom: 10,
  },
  progressRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 12,
  },
  progressBg: {
    flex: 1,
    height: 4,
    borderRadius: 2,
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    borderRadius: 2,
  },
  progressText: {
    fontSize: 10,
    fontWeight: "500",
    minWidth: 80,
  },
  actions: {
    flexDirection: "row",
    gap: 8,
  },
  codeBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 10,
    borderRadius: 10,
  },
  codeText: {
    fontSize: 12,
    fontWeight: "700",
    fontFamily: "monospace",
    letterSpacing: 1,
  },
  shareBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 10,
  },
  shareText: {
    fontSize: 12,
    fontWeight: "600",
  },
});
