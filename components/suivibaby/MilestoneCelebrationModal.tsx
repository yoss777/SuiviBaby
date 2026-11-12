// components/suivibaby/MilestoneCelebrationModal.tsx
// Modal de célébration quand un milestone est atteint.
// Affiche emoji, titre, message avec animation et option de partage.
// Affichage pur : le jalon est marqué « célébré » par l'appelant, à l'affichage
// (même si la modale est fermée sans partager).

import { getNeutralColors, neutralColors } from "@/constants/dashboardColors";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { buildShareMessage, type MilestoneCelebration } from "@/services/milestoneCelebrationService";
import { isReduceMotionEnabled } from "@/utils/motion";
import * as Haptics from "expo-haptics";
import { useCallback, useEffect, useRef } from "react";
import {
  AccessibilityInfo,
  Animated,
  Modal,
  Share,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

interface Props {
  milestone: MilestoneCelebration | null;
  /** Prénom de l'enfant, utilisé dans le texte de partage. */
  childName?: string;
  onDismiss: () => void;
}

export function MilestoneCelebrationModal({ milestone, childName, onDismiss }: Props) {
  const colorScheme = useColorScheme() ?? "light";
  const nc = getNeutralColors(colorScheme);
  const scaleAnim = useRef(new Animated.Value(0)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (milestone) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      // Le titre et le message sont lus dès l'ouverture.
      AccessibilityInfo.announceForAccessibility?.(`${milestone.title}. ${milestone.message}`);
      if (isReduceMotionEnabled()) {
        // Animations réduites : pas de ressort ni d'échelle, rendu immédiat.
        scaleAnim.setValue(1);
        fadeAnim.setValue(1);
        return;
      }
      Animated.parallel([
        Animated.spring(scaleAnim, { toValue: 1, damping: 8, useNativeDriver: true }),
        Animated.timing(fadeAnim, { toValue: 1, duration: 300, useNativeDriver: true }),
      ]).start();
    } else {
      scaleAnim.setValue(0);
      fadeAnim.setValue(0);
    }
  }, [milestone, scaleAnim, fadeAnim]);

  const handleDismiss = useCallback(() => {
    if (isReduceMotionEnabled()) {
      onDismiss();
      return;
    }
    Animated.timing(fadeAnim, { toValue: 0, duration: 200, useNativeDriver: true }).start(() => {
      onDismiss();
    });
  }, [onDismiss, fadeAnim]);

  const handleShare = useCallback(async () => {
    if (!milestone) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      await Share.share({ message: buildShareMessage(milestone, childName) });
    } catch {
      // User cancelled share
    }
  }, [milestone, childName]);

  if (!milestone) return null;

  return (
    <Modal transparent visible animationType="none" onRequestClose={handleDismiss}>
      <Animated.View style={[styles.backdrop, { opacity: fadeAnim }]}>
        <Animated.View
          accessibilityViewIsModal
          style={[
            styles.card,
            { backgroundColor: nc.backgroundCard, transform: [{ scale: scaleAnim }] },
          ]}
        >
          {/* Emoji décoratif : le titre porte déjà le sens. */}
          <Text style={styles.emoji} accessible={false} importantForAccessibility="no">
            {milestone.emoji}
          </Text>
          <Text accessibilityRole="header" style={[styles.title, { color: nc.textStrong }]}>
            {milestone.title}
          </Text>
          <Text style={[styles.message, { color: nc.textLight }]}>{milestone.message}</Text>

          <View style={styles.actions}>
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel="Partager"
              accessibilityHint="Ouvre le partage de cette célébration"
              style={[styles.shareButton, { borderColor: nc.todayAccent }]}
              onPress={handleShare}
            >
              <Text style={[styles.shareText, { color: nc.todayAccent }]}>Partager</Text>
            </TouchableOpacity>
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel="Fermer"
              style={[styles.dismissButton, { backgroundColor: nc.todayAccent }]}
              onPress={handleDismiss}
            >
              <Text style={[styles.dismissText, { color: nc.onTodayAccent }]}>Fermer</Text>
            </TouchableOpacity>
          </View>
        </Animated.View>
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    alignItems: "center",
    padding: 32,
  },
  card: {
    width: "100%",
    borderRadius: 20,
    padding: 28,
    alignItems: "center",
    shadowColor: neutralColors.shadow,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.2,
    shadowRadius: 16,
    elevation: 10,
  },
  emoji: { fontSize: 56, marginBottom: 16 },
  title: { fontSize: 22, fontWeight: "700", textAlign: "center", marginBottom: 8 },
  message: { fontSize: 15, lineHeight: 22, textAlign: "center", marginBottom: 24 },
  actions: { flexDirection: "row", gap: 12, width: "100%" },
  shareButton: {
    flex: 1,
    minHeight: 44,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1.5,
    alignItems: "center",
    justifyContent: "center",
  },
  shareText: { fontSize: 15, fontWeight: "600" },
  dismissButton: {
    flex: 1,
    minHeight: 44,
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  dismissText: { fontSize: 15, fontWeight: "600" },
});
