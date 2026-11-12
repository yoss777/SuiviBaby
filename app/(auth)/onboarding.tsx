// app/(auth)/onboarding.tsx
import { radius, space } from "@/constants/tokens";
import { InfoModal } from "@/components/ui/InfoModal";
import { APP_NAME } from "@/constants/app";
import { withAlpha } from "@/components/ui/accentColors";
import { getNeutralColors, neutralColors } from "@/constants/dashboardColors";
import { useColorScheme } from "@/hooks/use-color-scheme";
import {
  getBiometricType,
  isBiometricAvailable,
  setBiometricOptInPending,
} from "@/services/biometricAuthService";
import FontAwesome from "@expo/vector-icons/FontAwesome6";
import { trackOnboardingEvent } from "@/services/onboardingAnalytics";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import { useCallback, useRef, useState } from "react";
import {
  Animated,
  Dimensions,
  FlatList,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useExitOnBack } from "@/hooks/useExitOnBack";

const ONBOARDING_DONE_KEY = "@suivibaby_onboarding_done";
const LEGACY_ONBOARDING_KEY = "@samaye_onboarding_done";
const { width: SCREEN_WIDTH } = Dimensions.get("window");

// P1-22 : 3 écrans au plus avant la connexion (5 auparavant). Promesse exacte
// sur la saisie (« Un tap suffit » était faux : FAB, action, Ajouter).
// Couleur : une seule, le token de marque `nc.todayAccent` (indigo, lisible
// dans les deux thèmes), appliquée au rendu.
const SLIDES = [
  {
    icon: "baby-carriage" as const,
    title: `Bienvenue sur ${APP_NAME}`,
    description:
      "Alimentation, sommeil, couches et croissance au même endroit, avec les courbes OMS et des tendances incluses gratuitement.",
  },
  {
    icon: "clock" as const,
    title: "Saisie en 3 secondes",
    description:
      "Un biberon à 3 h du matin ? Trois touches, ou votre voix. Mode nuit automatique, pensé pour les parents fatigués.",
  },
  {
    icon: "users" as const,
    title: "Partagé et protégé",
    description:
      "Partagez le suivi avec votre partenaire, la nounou ou les grands-parents, en temps réel. Données chiffrées, zéro publicité, conformité RGPD.",
  },
];

export async function hasCompletedOnboarding(): Promise<boolean> {
  try {
    const value = await AsyncStorage.getItem(ONBOARDING_DONE_KEY);
    if (value === "true") return true;
    // Migration depuis l'ancienne clé Samaye
    const legacy = await AsyncStorage.getItem(LEGACY_ONBOARDING_KEY);
    if (legacy === "true") {
      await AsyncStorage.setItem(ONBOARDING_DONE_KEY, "true");
      await AsyncStorage.removeItem(LEGACY_ONBOARDING_KEY);
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

export async function markOnboardingComplete(): Promise<void> {
  await AsyncStorage.setItem(ONBOARDING_DONE_KEY, "true");
}

export default function OnboardingScreen() {
  useExitOnBack();
  const colorScheme = useColorScheme() ?? "light";
  const nc = getNeutralColors(colorScheme);
  const router = useRouter();
  const flatListRef = useRef<FlatList>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const scrollX = useRef(new Animated.Value(0)).current;
  const [showBiometricPrompt, setShowBiometricPrompt] = useState(false);
  const [biometricType, setBiometricType] = useState("Biométrie");

  const goToLogin = useCallback(() => {
    router.replace("/(auth)/login");
  }, [router]);

  const finishOnboarding = useCallback(async () => {
    markOnboardingComplete();
    trackOnboardingEvent("onboarding_completed");
    // Check if biometric is available to propose it
    const available = await isBiometricAvailable();
    if (available) {
      const type = await getBiometricType();
      setBiometricType(type);
      setShowBiometricPrompt(true);
    } else {
      goToLogin();
    }
  }, [goToLogin]);

  const handleAcceptBiometric = useCallback(async () => {
    setShowBiometricPrompt(false);
    // No uid available yet — record the intent. The login screen will
    // call enableBiometric(uid) after the first successful sign-in.
    await setBiometricOptInPending();
    goToLogin();
  }, [goToLogin]);

  const handleDeclineBiometric = useCallback(() => {
    setShowBiometricPrompt(false);
    goToLogin();
  }, [goToLogin]);

  const handleNext = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (currentIndex < SLIDES.length - 1) {
      flatListRef.current?.scrollToIndex({ index: currentIndex + 1 });
      setCurrentIndex(currentIndex + 1);
    } else {
      finishOnboarding();
    }
  }, [currentIndex, finishOnboarding]);

  const handleSkip = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    markOnboardingComplete();
    trackOnboardingEvent("onboarding_skipped", { slide: currentIndex });
    goToLogin();
  }, [goToLogin, currentIndex]);

  const renderItem = useCallback(
    ({ item }: { item: (typeof SLIDES)[number] }) => (
      <View
        style={[styles.slide, { width: SCREEN_WIDTH }]}
        accessible
        accessibilityLabel={`${item.title}. ${item.description}`}
        accessibilityHint={`Écran ${SLIDES.indexOf(item) + 1} sur ${SLIDES.length}`}
      >
        <View
          style={[styles.iconCircle, { backgroundColor: withAlpha(nc.todayAccent, 0.12) }]}
        >
          <FontAwesome name={item.icon} size={60} color={nc.todayAccent} accessibilityElementsHidden />
        </View>
        <Text
          style={[styles.slideTitle, { color: nc.textStrong }]}
          accessibilityRole="header"
        >
          {item.title}
        </Text>
        <Text style={[styles.slideDescription, { color: nc.textLight }]}>
          {item.description}
        </Text>
      </View>
    ),
    [nc],
  );

  return (
    <View style={[styles.container, { backgroundColor: nc.background }]}>
      <TouchableOpacity
        style={styles.skipButton}
        onPress={handleSkip}
        accessibilityRole="button"
        accessibilityLabel="Passer l'introduction"
      >
        <Text style={[styles.skipText, { color: nc.textLight }]}>Passer</Text>
      </TouchableOpacity>

      <Animated.FlatList
        ref={flatListRef}
        data={SLIDES}
        renderItem={renderItem}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        bounces={false}
        keyExtractor={(_, i) => String(i)}
        onScroll={Animated.event(
          [{ nativeEvent: { contentOffset: { x: scrollX } } }],
          { useNativeDriver: false },
        )}
        onMomentumScrollEnd={(e) => {
          const index = Math.round(
            e.nativeEvent.contentOffset.x / SCREEN_WIDTH,
          );
          setCurrentIndex(index);
        }}
        scrollEventThrottle={16}
      />

      {/* Pagination dots */}
      <View style={styles.pagination}>
        {SLIDES.map((_, index) => {
          const inputRange = [
            (index - 1) * SCREEN_WIDTH,
            index * SCREEN_WIDTH,
            (index + 1) * SCREEN_WIDTH,
          ];
          const dotWidth = scrollX.interpolate({
            inputRange,
            outputRange: [8, 24, 8],
            extrapolate: "clamp",
          });
          const dotOpacity = scrollX.interpolate({
            inputRange,
            outputRange: [0.3, 1, 0.3],
            extrapolate: "clamp",
          });
          return (
            <Animated.View
              key={index}
              style={[
                styles.dot,
                {
                  width: dotWidth,
                  opacity: dotOpacity,
                  backgroundColor: nc.todayAccent,
                },
              ]}
            />
          );
        })}
      </View>

      {/* Bouton suivant / commencer */}
      <TouchableOpacity
        style={[styles.nextButton, { backgroundColor: nc.todayAccent }]}
        onPress={handleNext}
        accessibilityRole="button"
        accessibilityLabel={
          currentIndex === SLIDES.length - 1 ? "Commencer" : "Suivant"
        }
      >
        <Text style={[styles.nextButtonText, { color: nc.onTodayAccent }]}>
          {currentIndex === SLIDES.length - 1 ? "Commencer" : "Suivant"}
        </Text>
        <FontAwesome
          name={currentIndex === SLIDES.length - 1 ? "rocket" : "arrow-right"}
          size={18}
          color={nc.onTodayAccent}
        />
      </TouchableOpacity>
      <InfoModal
        visible={showBiometricPrompt}
        title={`Verrouiller l'app avec ${biometricType} ?`}
        message={`À chaque ouverture de l'app, ${biometricType} sera demandé pour accéder à vos données. Si vous vous déconnectez, vous devrez retaper votre mot de passe pour réactiver le verrou. Modifiable dans les réglages.`}
        backgroundColor={nc.backgroundCard}
        textColor={nc.textStrong}
        confirmText="Activer"
        dismissText="Plus tard"
        onConfirm={handleAcceptBiometric}
        onClose={handleDeclineBiometric}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
  },
  skipButton: {
    position: "absolute",
    top: 60,
    right: 20,
    zIndex: 10,
    minWidth: 44,
    minHeight: 44,
    padding: 14,
    justifyContent: "center",
    alignItems: "center",
  },
  skipText: {
    fontSize: 16,
    fontWeight: "500",
  },
  slide: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 40,
  },
  iconCircle: {
    width: 140,
    height: 140,
    borderRadius: 70,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 40,
  },
  slideTitle: {
    fontSize: 28,
    fontWeight: "700",
    textAlign: "center",
    marginBottom: space.md,
  },
  slideDescription: {
    fontSize: 16,
    lineHeight: 24,
    textAlign: "center",
  },
  pagination: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: space.xs,
    marginBottom: space.xxl,
  },
  dot: {
    height: 8,
    borderRadius: 4,
  },
  nextButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    height: 56,
    borderRadius: radius.md,
    marginHorizontal: space.lg,
    marginBottom: 40,
    gap: space.sm,
    shadowColor: neutralColors.shadow,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 5,
  },
  nextButtonText: {
    fontSize: 18,
    fontWeight: "600",
  },
});
