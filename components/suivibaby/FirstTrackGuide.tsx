// components/suivibaby/FirstTrackGuide.tsx
// Guide du premier tracking — affiché une seule fois après l'ajout du premier bébé.
// Objectif : amener l'utilisateur à son premier enregistrement en < 30 secondes.

import {
  getCategoryColors,
  getCategoryTextColors,
  getNeutralColors,
} from "@/constants/dashboardColors";
import { useBaby } from "@/contexts/BabyContext";
import { useSheetActions } from "@/contexts/SheetContext";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { trackOnboardingEvent } from "@/services/onboardingAnalytics";
import FontAwesome from "@expo/vector-icons/FontAwesome6";
import * as Haptics from "expo-haptics";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Animated,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

interface FirstTrackGuideProps {
  onDismiss: () => void;
}

export function FirstTrackGuide({ onDismiss }: FirstTrackGuideProps) {
  const colorScheme = useColorScheme() ?? "light";
  const nc = getNeutralColors(colorScheme);
  // Tuiles dérivées des tokens de catégorie (lisibles en sombre) : Repas =
  // alimentation, Couche = santé, comme sur l'Accueil et le FAB.
  const cc = getCategoryColors(colorScheme);
  const ct = getCategoryTextColors(colorScheme);
  const feedingTile = {
    backgroundColor: cc.alimentation.background,
    borderColor: cc.alimentation.border,
  };
  const diaperTile = {
    backgroundColor: cc.sante.background,
    borderColor: cc.sante.border,
  };
  const { activeChild } = useBaby();
  const { openSheet } = useSheetActions();
  const [showCelebration, setShowCelebration] = useState(false);
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(0.8)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 500,
        useNativeDriver: true,
      }),
      Animated.spring(scaleAnim, {
        toValue: 1,
        damping: 12,
        useNativeDriver: true,
      }),
    ]).start();
  }, []);

  const handleQuickAdd = useCallback(
    (formType: string, subType: string) => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      openSheet({ ownerId: "first-track", formType, mealType: subType } as any);

      trackOnboardingEvent("first_track_completed", { type: formType, subType });

      setTimeout(() => {
        setShowCelebration(true);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }, 3000);
    },
    [openSheet],
  );

  const babyName = activeChild?.name?.split(" ")[0] || "votre bébé";

  if (showCelebration) {
    return (
      <Animated.View
        style={[
          styles.container,
          {
            backgroundColor: nc.backgroundCard,
            borderColor: nc.todayAccent + "30",
          },
          { opacity: fadeAnim, transform: [{ scale: scaleAnim }] },
        ]}
      >
        <Text style={styles.celebrationEmoji}>🎉</Text>
        <Text style={[styles.celebrationTitle, { color: nc.textStrong }]}>
          Bravo !
        </Text>
        <Text style={[styles.celebrationSubtitle, { color: nc.textLight }]}>
          {babyName} est bien suivi{activeChild?.gender === "female" ? "e" : ""}{" "}
          ! Vous pouvez ajouter des événements à tout moment avec le bouton + en
          bas à droite.
        </Text>
        <TouchableOpacity
          accessibilityRole="button"
          style={[styles.dismissButton, { backgroundColor: nc.todayAccent }]}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            onDismiss();
          }}
        >
          <Text style={[styles.dismissButtonText, { color: nc.onTodayAccent }]}>
            C&apos;est parti !
          </Text>
        </TouchableOpacity>
      </Animated.View>
    );
  }

  return (
    <Animated.View
      style={[
        styles.container,
        {
          backgroundColor: nc.backgroundCard,
          borderColor: nc.todayAccent + "30",
        },
        { opacity: fadeAnim, transform: [{ scale: scaleAnim }] },
      ]}
    >
      <View
        style={[styles.stepBadge, { backgroundColor: nc.todayAccent + "15" }]}
      >
        <Text style={[styles.stepBadgeText, { color: nc.todayAccent }]}>
          Étape 2/2
        </Text>
      </View>

      <Text style={[styles.title, { color: nc.textStrong }]}>
        Premier suivi de {babyName}
      </Text>
      <Text style={[styles.subtitle, { color: nc.textLight }]}>
        Enregistrez votre premier événement — ça prend 3 secondes !
      </Text>

      <View style={styles.quickActions}>
        <TouchableOpacity
          accessibilityRole="button"
          style={[styles.quickAction, feedingTile]}
          onPress={() => handleQuickAdd("meals", "biberon")}
        >
          <FontAwesome name="bottle-water" size={22} color={ct.alimentation} />
          <Text style={[styles.quickActionLabel, { color: ct.alimentation }]}>
            Biberon
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          accessibilityRole="button"
          style={[styles.quickAction, feedingTile]}
          onPress={() => handleQuickAdd("meals", "tetee")}
        >
          <FontAwesome name="person-breastfeeding" size={22} color={ct.alimentation} />
          <Text style={[styles.quickActionLabel, { color: ct.alimentation }]}>
            Tétée
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          accessibilityRole="button"
          style={[styles.quickAction, diaperTile]}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            openSheet({
              ownerId: "first-track",
              formType: "diapers",
              diapersType: "miction",
            } as any);
            trackOnboardingEvent("first_track_completed", { type: "diapers", subType: "miction" });
            setTimeout(() => {
              setShowCelebration(true);
              Haptics.notificationAsync(
                Haptics.NotificationFeedbackType.Success,
              );
            }, 3000);
          }}
        >
          <FontAwesome name="baby" size={22} color={ct.sante} />
          <Text style={[styles.quickActionLabel, { color: ct.sante }]}>
            Couche
          </Text>
        </TouchableOpacity>
      </View>

      <TouchableOpacity
        accessibilityRole="button"
        style={styles.skipButton}
        onPress={() => {
          trackOnboardingEvent("first_track_skipped");
          onDismiss();
        }}
      >
        <Text style={[styles.skipText, { color: nc.textLight }]}>
          Plus tard
        </Text>
      </TouchableOpacity>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginHorizontal: 16,
    marginTop: 12,
    marginBottom: 8,
    padding: 20,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: "center",
  },
  stepBadge: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
    marginBottom: 12,
  },
  stepBadgeText: {
    fontSize: 12,
    fontWeight: "600",
  },
  title: {
    fontSize: 20,
    fontWeight: "700",
    textAlign: "center",
    marginBottom: 6,
  },
  subtitle: {
    fontSize: 14,
    textAlign: "center",
    lineHeight: 20,
    marginBottom: 20,
  },
  quickActions: {
    flexDirection: "row",
    gap: 12,
    marginBottom: 16,
  },
  quickAction: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 16,
    borderRadius: 14,
    borderWidth: 1,
    gap: 8,
  },
  quickActionLabel: {
    fontSize: 13,
    fontWeight: "600",
  },
  skipButton: {
    minHeight: 44,
    paddingHorizontal: 16,
    justifyContent: "center",
  },
  skipText: {
    fontSize: 14,
    fontWeight: "500",
  },
  celebrationEmoji: {
    fontSize: 48,
    marginBottom: 12,
  },
  celebrationTitle: {
    fontSize: 24,
    fontWeight: "700",
    marginBottom: 8,
  },
  celebrationSubtitle: {
    fontSize: 14,
    textAlign: "center",
    lineHeight: 20,
    marginBottom: 20,
    paddingHorizontal: 10,
  },
  dismissButton: {
    paddingHorizontal: 28,
    paddingVertical: 12,
    borderRadius: 12,
  },
  dismissButtonText: {
    fontSize: 16,
    fontWeight: "600",
  },
});
