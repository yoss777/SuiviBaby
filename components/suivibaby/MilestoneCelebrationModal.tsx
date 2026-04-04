// components/suivibaby/MilestoneCelebrationModal.tsx
// Modal de célébration quand un milestone est atteint.
// Affiche emoji, titre, message avec animation et option de partage.

import { getNeutralColors } from "@/constants/dashboardColors";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { markMilestoneCelebrated, type MilestoneCelebration } from "@/services/milestoneCelebrationService";
import * as Haptics from "expo-haptics";
import { useCallback, useEffect, useRef } from "react";
import {
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
  onDismiss: () => void;
}

export function MilestoneCelebrationModal({ milestone, onDismiss }: Props) {
  const colorScheme = useColorScheme() ?? "light";
  const nc = getNeutralColors(colorScheme);
  const scaleAnim = useRef(new Animated.Value(0)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (milestone) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Animated.parallel([
        Animated.spring(scaleAnim, { toValue: 1, damping: 8, useNativeDriver: true }),
        Animated.timing(fadeAnim, { toValue: 1, duration: 300, useNativeDriver: true }),
      ]).start();
    } else {
      scaleAnim.setValue(0);
      fadeAnim.setValue(0);
    }
  }, [milestone]);

  const handleDismiss = useCallback(() => {
    if (milestone) {
      markMilestoneCelebrated(milestone.id);
    }
    Animated.timing(fadeAnim, { toValue: 0, duration: 200, useNativeDriver: true }).start(() => {
      onDismiss();
    });
  }, [milestone, onDismiss, fadeAnim]);

  const handleShare = useCallback(async () => {
    if (!milestone) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      await Share.share({
        message: `${milestone.emoji} ${milestone.title}\n${milestone.message}\n\nSuivi avec Suivi Baby`,
      });
    } catch {
      // User cancelled share
    }
  }, [milestone]);

  if (!milestone) return null;

  return (
    <Modal transparent visible animationType="none">
      <Animated.View style={[styles.backdrop, { opacity: fadeAnim }]}>
        <Animated.View
          style={[
            styles.card,
            { backgroundColor: nc.backgroundCard, transform: [{ scale: scaleAnim }] },
          ]}
        >
          <Text style={styles.emoji}>{milestone.emoji}</Text>
          <Text style={[styles.title, { color: nc.textStrong }]}>{milestone.title}</Text>
          <Text style={[styles.message, { color: nc.textMuted }]}>{milestone.message}</Text>

          <View style={styles.actions}>
            <TouchableOpacity
              style={[styles.shareButton, { borderColor: nc.todayAccent }]}
              onPress={handleShare}
            >
              <Text style={[styles.shareText, { color: nc.todayAccent }]}>Partager</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.dismissButton, { backgroundColor: nc.todayAccent }]}
              onPress={handleDismiss}
            >
              <Text style={[styles.dismissText, { color: nc.white }]}>Merci !</Text>
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
    shadowColor: "#000",
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
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1.5,
    alignItems: "center",
  },
  shareText: { fontSize: 15, fontWeight: "600" },
  dismissButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: "center",
  },
  dismissText: { fontSize: 15, fontWeight: "600" },
});
