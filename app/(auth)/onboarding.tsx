// app/(auth)/onboarding.tsx
import { InfoModal } from "@/components/ui/InfoModal";
import { getNeutralColors } from "@/constants/dashboardColors";
import { useColorScheme } from "@/hooks/use-color-scheme";
import {
  enableBiometric,
  getBiometricType,
  isBiometricAvailable,
} from "@/services/biometricAuthService";
import FontAwesome from "@expo/vector-icons/FontAwesome6";
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

const ONBOARDING_DONE_KEY = "@samaye_onboarding_done";
const { width: SCREEN_WIDTH } = Dimensions.get("window");

const SLIDES = [
  {
    icon: "baby-carriage" as const,
    title: "Bienvenue sur Suivi Baby",
    description:
      "L'app qui vous accompagne au quotidien pour suivre l'alimentation, le sommeil et la croissance de votre bébé.",
    color: "#6366f1",
  },
  {
    icon: "chart-line" as const,
    title: "Suivi complet",
    description:
      "Biberons, tétées, couches, sommeil, croissance, activités... Tout est centralisé pour ne rien oublier.",
    color: "#22c55e",
  },
  {
    icon: "cloud" as const,
    title: "Sécurisé et synchronisé",
    description:
      "Vos données sont chiffrées et synchronisées en temps réel. Partagez l'accès avec votre partenaire.",
    color: "#f59e0b",
  },
];

export async function hasCompletedOnboarding(): Promise<boolean> {
  try {
    const value = await AsyncStorage.getItem(ONBOARDING_DONE_KEY);
    return value === "true";
  } catch {
    return false;
  }
}

export async function markOnboardingComplete(): Promise<void> {
  await AsyncStorage.setItem(ONBOARDING_DONE_KEY, "true");
}

export default function OnboardingScreen() {
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
    await enableBiometric();
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
    goToLogin();
  }, [goToLogin]);

  const renderItem = useCallback(
    ({ item }: { item: (typeof SLIDES)[number] }) => (
      <View style={[styles.slide, { width: SCREEN_WIDTH }]}>
        <View
          style={[styles.iconCircle, { backgroundColor: item.color + "20" }]}
        >
          <FontAwesome name={item.icon} size={60} color={item.color} />
        </View>
        <Text style={[styles.slideTitle, { color: nc.textStrong }]}>
          {item.title}
        </Text>
        <Text style={[styles.slideDescription, { color: nc.textMuted }]}>
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
        <Text style={[styles.skipText, { color: nc.textMuted }]}>Passer</Text>
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
        <Text style={[styles.nextButtonText, { color: nc.white }]}>
          {currentIndex === SLIDES.length - 1 ? "Commencer" : "Suivant"}
        </Text>
        <FontAwesome
          name={currentIndex === SLIDES.length - 1 ? "rocket" : "arrow-right"}
          size={18}
          color={nc.white}
        />
      </TouchableOpacity>
      <InfoModal
        visible={showBiometricPrompt}
        title={`Activer ${biometricType} ?`}
        message={`Connectez-vous plus rapidement avec ${biometricType}. Vous pourrez modifier ce choix dans les réglages.`}
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
    padding: 8,
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
    marginBottom: 16,
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
    gap: 8,
    marginBottom: 32,
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
    borderRadius: 12,
    marginHorizontal: 20,
    marginBottom: 40,
    gap: 12,
    shadowColor: "#000",
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
