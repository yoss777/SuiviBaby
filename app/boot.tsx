import { useCallback, useEffect, useState } from "react";
import { Image, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { ErrorBoundary } from "@/components/ErrorBoundary";
import BackgroundImage from "@/components/ui/BackgroundImage";
import { InfoModal } from "@/components/ui/InfoModal";
import { IconPulseDots } from "@/components/ui/IconPulseDtos";
import { useAuth } from "@/contexts/AuthContext";
import { useBaby } from "@/contexts/BabyContext";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { getNeutralColors } from "@/constants/dashboardColors";
import { obtenirEvenementsDuJourHybrid } from "@/migration/eventsHybridService";
import {
  getBiometricType,
  clearCredentials,
} from "@/services/biometricAuthService";
import {
  buildTodayEventsData,
  getTodayEventsCache,
  setTodayEventsCache,
} from "@/services/todayEventsCache";
import { BIOMETRIC_PROMPT_PENDING_KEY } from "@/app/(auth)/login";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { router } from "expo-router";

function BootScreenContent() {
  const { user, loading: authLoading } = useAuth();
  const {
    children,
    loading: babyLoading,
    activeChild,
    setActiveChild,
  } = useBaby();
  const [delayDone, setDelayDone] = useState(false);
  const [unauthDelayDone, setUnauthDelayDone] = useState(false);
  const [showBiometricPrompt, setShowBiometricPrompt] = useState(false);
  const [biometricType, setBiometricType] = useState("Biométrie");
  const [pendingNavigation, setPendingNavigation] = useState<(() => void) | null>(null);
  const colorScheme = useColorScheme() ?? "light";
  const nc = getNeutralColors(colorScheme);

  // R1+R9: Splash minimum — shorter if cache exists (warm return)
  useEffect(() => {
    const hasCache = activeChild?.id ? !!getTodayEventsCache(activeChild.id) : false;
    const minDelay = hasCache ? 500 : 1200;
    const timer = setTimeout(() => setDelayDone(true), minDelay);
    return () => clearTimeout(timer);
  }, [activeChild?.id]);

  useEffect(() => {
    if (authLoading || user) {
      setUnauthDelayDone(false);
      return;
    }

    const timer = setTimeout(() => setUnauthDelayDone(true), 1200);
    return () => clearTimeout(timer);
  }, [authLoading, user]);

  // P17a: Extract prefetch as useCallback
  const prefetchToday = useCallback(async (childId: string) => {
    try {
      const events = await obtenirEvenementsDuJourHybrid(childId);
      setTodayEventsCache(childId, buildTodayEventsData(events));
    } catch (error) {
      console.warn("[BOOT] Préchargement today échoué:", error);
    }
  }, []);

  const handleAcceptBiometric = useCallback(async () => {
    setShowBiometricPrompt(false);
    await AsyncStorage.removeItem(BIOMETRIC_PROMPT_PENDING_KEY);
    // Credentials already saved by login.tsx via saveCredentials()
    // Just navigate
    if (pendingNavigation) {
      pendingNavigation();
      setPendingNavigation(null);
    }
  }, [pendingNavigation]);

  const handleDeclineBiometric = useCallback(async () => {
    setShowBiometricPrompt(false);
    await AsyncStorage.removeItem(BIOMETRIC_PROMPT_PENDING_KEY);
    // User declined — remove saved credentials
    await clearCredentials();
    if (pendingNavigation) {
      pendingNavigation();
      setPendingNavigation(null);
    }
  }, [pendingNavigation]);

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      console.log(
        "[BOOT] authLoading:",
        authLoading,
        "babyLoading:",
        babyLoading,
        "user:",
        !!user,
        "children.length:",
        children.length,
      );

      // Étape 1 : Attendre que l'auth soit chargée
      if (authLoading) {
        console.log("[BOOT] En attente de l'auth...");
        return;
      }

      // Étape 2 : Si pas d'utilisateur, rediriger vers login
      if (!user) {
        console.log("[BOOT] Pas de user, redirection vers login");
        if (!unauthDelayDone) {
          return;
        }
        router.replace("/(auth)/login");
        return;
      }

      // Étape 3 : Attendre que les enfants soient chargés
      // IMPORTANT : babyLoading doit être false ET on doit avoir vérifié les enfants
      if (babyLoading) {
        console.log("[BOOT] En attente du chargement des enfants...");
        return;
      }

      if (!delayDone) {
        console.log("[BOOT] Attente du délai minimum...");
        return;
      }

      // Étape 4 : Déterminer la destination
      let navigate: () => void;

      if (children.length === 0) {
        console.log("[BOOT] Aucun enfant, redirection vers explore");
        navigate = () => router.replace("/explore");
      } else if (children.length >= 1) {
        const targetChild = activeChild ?? children[0];
        if (!targetChild) {
          console.log("[BOOT] Aucun enfant, redirection vers explore");
          navigate = () => router.replace("/explore");
        } else {
          if (children.length === 1) {
            console.log("[BOOT] 1 enfant, redirection vers baby");
          } else {
            console.log("[BOOT] Enfant actif trouvé, redirection vers baby");
          }
          // Ne pas écraser activeChild s'il est déjà défini par le contexte
          if (!activeChild) {
            setActiveChild(targetChild);
          }

          const preloadTimeout = new Promise((resolve) =>
            setTimeout(resolve, 2500),
          );
          await Promise.race([prefetchToday(targetChild.id), preloadTimeout]);
          if (cancelled) return;

          navigate = () => router.replace("/(drawer)/baby" as any);
        }
      } else {
        console.log("[BOOT] Fallback, redirection vers explore");
        navigate = () => router.replace("/explore" as any);
      }

      // Étape 5 : Vérifier si un prompt biométrique est en attente
      const biometricPending = await AsyncStorage.getItem(BIOMETRIC_PROMPT_PENDING_KEY);
      console.log("[BOOT] biometricPending flag:", biometricPending);
      if (biometricPending) {
        const type = await getBiometricType();
        console.log("[BOOT] Affichage prompt biométrique, type:", type);
        setBiometricType(type);
        setPendingNavigation(() => navigate!);
        setShowBiometricPrompt(true);
        return;
      }

      // Pas de prompt — naviguer directement
      console.log("[BOOT] Pas de prompt biométrique, navigation directe");
      navigate!();
    };

    run();

    return () => {
      cancelled = true;
    };
  }, [
    authLoading,
    babyLoading,
    delayDone,
    unauthDelayDone,
    user,
    children,
    activeChild,
    setActiveChild,
    prefetchToday,
  ]);

  return (
    <View style={styles.root}>
      <BackgroundImage />
      <SafeAreaView
        style={styles.safe}
        edges={["top", "bottom"]}
        accessibilityRole="summary"
        accessibilityLabel="Écran de chargement"
      >
        <View style={styles.content}>
          <Image
            source={require("@/assets/images/icon.png")}
            style={styles.logo}
            resizeMode="contain"
            accessibilityLabel="Logo Suivi Baby"
          />
          <IconPulseDots
            size={20}
            gap={16}
            minOpacity={0.3}
            maxOpacity={0.9}
            minScale={0.9}
            maxScale={1.1}
            cycleDurationMs={2400}
          />
        </View>
      </SafeAreaView>
      <InfoModal
        visible={showBiometricPrompt}
        title={`Activer ${biometricType} ?`}
        message={`Souhaitez-vous utiliser ${biometricType} pour vous connecter plus rapidement la prochaine fois ?`}
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
  root: {
    flex: 1,
  },
  safe: {
    flex: 1,
    backgroundColor: "transparent",
  },
  content: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingBottom: 40,
    gap: 32,
  },
  logo: {
    width: 120,
    height: 120,
    borderRadius: 28,
  },
});

// P12b: ErrorBoundary wrapper
export default function BootScreen() {
  return (
    <ErrorBoundary>
      <BootScreenContent />
    </ErrorBoundary>
  );
}
