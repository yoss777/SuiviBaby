import { useCallback, useEffect, useRef, useState } from "react";
import { Pressable, Image, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import * as Sentry from "@sentry/react-native";
import { useNetInfo } from "@react-native-community/netinfo";

import { ErrorBoundary } from "@/components/ErrorBoundary";
import BackgroundImage from "@/components/ui/BackgroundImage";
import { IconPulseDots } from "@/components/ui/IconPulseDtos";
import { useAuth } from "@/contexts/AuthContext";
import { useBaby } from "@/contexts/BabyContext";
import { obtenirEvenementsDuJour } from "@/services/eventsService";
import { obtenirPreferencesNotifications } from "@/services/userPreferencesService";
import { setPreferencesCache, setPermissionsCache } from "@/services/userPreferencesCache";
import { getUserChildAccess } from "@/utils/permissions";
import {
  buildTodayEventsData,
  getTodayEventsCache,
  setTodayEventsCache,
} from "@/services/todayEventsCache";
import { router } from "expo-router";
import { hasCompletedOnboarding } from "./(auth)/onboarding";

const BOOT_NETWORK_TIMEOUT_MS = 8000;

function logBoot(...args: unknown[]) {
  if (__DEV__) {
    console.log("[BOOT]", ...args);
  }
}

function BootScreenContent() {
  const {
    user,
    firebaseUser,
    loading: authLoading,
    status: authStatus,
    refreshUser,
  } = useAuth();
  const {
    children,
    loading: babyLoading,
    activeChild,
    setActiveChild,
  } = useBaby();
  const netInfo = useNetInfo();
  const [delayDone, setDelayDone] = useState(false);
  const [unauthDelayDone, setUnauthDelayDone] = useState(false);
  const [onboardingChecked, setOnboardingChecked] = useState(false);
  const [onboardingDone, setOnboardingDone] = useState(false);
  const [bootRetryKey, setBootRetryKey] = useState(0);
  const [bootStalled, setBootStalled] = useState(false);
  const [stallPhase, setStallPhase] = useState<"auth" | "children" | null>(null);
  const hasNavigatedRef = useRef(false);
  const bootResourceKeyRef = useRef<string | null>(null);
  const bootResourcePromiseRef = useRef<Promise<void> | null>(null);
  const bootAssignedChildIdRef = useRef<string | null>(null);

  // Sentry Performance: track startup time
  const startupSpanRef = useRef(
    Sentry.startInactiveSpan({ name: "app.boot", op: "app.start" }),
  );
  // R1+R9: Splash minimum — shorter if cache exists (warm return)
  useEffect(() => {
    const hasCache = activeChild?.id ? !!getTodayEventsCache(activeChild.id) : false;
    const minDelay = hasCache ? 500 : 1200;
    const timer = setTimeout(() => setDelayDone(true), minDelay);
    return () => clearTimeout(timer);
  }, [activeChild?.id]);

  // Check onboarding status once on mount
  useEffect(() => {
    hasCompletedOnboarding().then((done) => {
      setOnboardingDone(done);
      setOnboardingChecked(true);
    });
  }, []);

  useEffect(() => {
    if (authLoading || user) {
      setUnauthDelayDone(false);
      return;
    }

    const timer = setTimeout(() => setUnauthDelayDone(true), 1200);
    return () => clearTimeout(timer);
  }, [authLoading, user]);

  useEffect(() => {
    const nextPhase: "auth" | "children" | null =
      authLoading || (!!firebaseUser && !user && authStatus === "degraded")
        ? "auth"
        : user && babyLoading
        ? "children"
        : null;

    if (!nextPhase) {
      setBootStalled(false);
      setStallPhase(null);
      return;
    }

    setBootStalled(false);
    setStallPhase(nextPhase);

    const timer = setTimeout(() => {
      setStallPhase(nextPhase);
      setBootStalled(true);
    }, BOOT_NETWORK_TIMEOUT_MS);

    return () => clearTimeout(timer);
  }, [authLoading, user, firebaseUser, authStatus, babyLoading, bootRetryKey]);

  // P17a: Extract prefetch as useCallback
  const prefetchToday = useCallback(async (childId: string) => {
    try {
      const events = await obtenirEvenementsDuJour(childId);
      setTodayEventsCache(childId, buildTodayEventsData(events));
    } catch (error) {
      console.warn("[BOOT] Préchargement today échoué:", error);
    }
  }, []);

  const prefetchBootResources = useCallback(
    (childId: string, uid: string | null) => {
      const todayKey = new Date().toDateString();
      const resourceKey = `${bootRetryKey}:${uid ?? "anon"}:${childId}:${todayKey}`;

      if (bootResourceKeyRef.current === resourceKey && bootResourcePromiseRef.current) {
        return bootResourcePromiseRef.current;
      }

      const nextPromise = Promise.all([
        prefetchToday(childId),
        obtenirPreferencesNotifications()
          .then((prefs) =>
            setPreferencesCache({
              tips: prefs.tips ?? true,
              insights: prefs.insights ?? true,
              correlations: prefs.correlations ?? true,
            }),
          )
          .catch(() => {}),
        uid
          ? getUserChildAccess(childId, uid)
              .then((accessDoc) => {
                const role = accessDoc?.role ?? null;
                setPermissionsCache({
                  role,
                  canManageContent: role === "owner" || role === "admin",
                });
              })
              .catch(() => {})
          : Promise.resolve(),
      ]).then(() => undefined);

      bootResourceKeyRef.current = resourceKey;
      bootResourcePromiseRef.current = nextPromise;
      return nextPromise;
    },
    [bootRetryKey, prefetchToday],
  );

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      logBoot(
        "state",
        {
          authLoading,
          babyLoading,
          authStatus,
          hasUser: !!user,
          childrenCount: children.length,
        },
      );

      // Étape 1 : Attendre que l'auth soit chargée
      if (authLoading) {
        logBoot("En attente de l'auth");
        return;
      }

      // Étape 2 : Si pas d'utilisateur, vérifier onboarding puis rediriger
      if (!user) {
        if (firebaseUser && authStatus === "degraded") {
          logBoot("Session Firebase connue, user doc en attente");
          return;
        }

        if (!onboardingChecked || !unauthDelayDone) {
          return;
        }
        if (!onboardingDone) {
          if (hasNavigatedRef.current) return;
          hasNavigatedRef.current = true;
          logBoot("Redirection onboarding");
          router.replace("/(auth)/onboarding");
        } else {
          if (hasNavigatedRef.current) return;
          hasNavigatedRef.current = true;
          logBoot("Redirection login");
          router.replace("/(auth)/login");
        }
        return;
      }

      // Étape 3 : Attendre que les enfants soient chargés
      // IMPORTANT : babyLoading doit être false ET on doit avoir vérifié les enfants
      if (babyLoading) {
        const canContinueWithResolvedChild =
          bootStalled && (children.length > 0 || !!activeChild);
        if (canContinueWithResolvedChild) {
          logBoot("Chargement enfants lent, démarrage avec données résolues");
        } else {
          logBoot("En attente du chargement des enfants");
          return;
        }
      }

      if (!delayDone) {
        logBoot("Attente du délai minimum");
        return;
      }

      // Étape 4 : Déterminer la destination
      let navigate: () => void;

      if (children.length === 0) {
        logBoot("Aucun enfant, redirection add-baby");
        navigate = () => router.replace({ pathname: "/(drawer)/add-baby", params: { firstRun: "true" } } as any);
      } else {
        const targetChild = activeChild ?? children[0];
        if (!targetChild) {
          logBoot("Aucun enfant actif résolu, redirection explore");
          navigate = () => router.replace("/explore");
        } else {
          logBoot("Redirection baby", { childId: targetChild.id });

          if (
            !activeChild &&
            bootAssignedChildIdRef.current !== targetChild.id
          ) {
            bootAssignedChildIdRef.current = targetChild.id;
            setActiveChild(targetChild);
          }

          const preloadTimeout = new Promise((resolve) =>
            setTimeout(resolve, 2500),
          );
          const uid = firebaseUser?.uid ?? null;
          await Promise.race([
            prefetchBootResources(targetChild.id, uid),
            preloadTimeout,
          ]);
          if (cancelled) return;

          navigate = () => router.replace("/(drawer)/baby" as any);
        }
      }

      if (hasNavigatedRef.current) return;
      hasNavigatedRef.current = true;
      logBoot("Navigation");
      startupSpanRef.current?.end();
      navigate!();
    };

    run();

    return () => {
      cancelled = true;
    };
  }, [
    authLoading,
    authStatus,
    babyLoading,
    delayDone,
    unauthDelayDone,
    onboardingChecked,
    onboardingDone,
    user,
    firebaseUser,
    children,
    activeChild,
    setActiveChild,
    prefetchBootResources,
    bootStalled,
  ]);

  const hasAuthDegradedSession =
    authStatus === "degraded" && !!firebaseUser && !user;
  const isOffline =
    netInfo.isConnected === false || netInfo.isInternetReachable === false;
  const showBootFallback =
    hasAuthDegradedSession ||
    (bootStalled && (authLoading || (!!user && babyLoading && children.length === 0)));

  const handleRetry = useCallback(() => {
    setBootStalled(false);
    setBootRetryKey((prev) => prev + 1);
    bootAssignedChildIdRef.current = null;
    bootResourceKeyRef.current = null;
    bootResourcePromiseRef.current = null;

    if (firebaseUser) {
      refreshUser().catch((error) => {
        console.warn("[BOOT] refreshUser échoué:", error);
      });
    }
  }, [firebaseUser, refreshUser]);

  const fallbackTitle = isOffline
    ? "Connexion indisponible"
    : "Connexion trop lente";
  const fallbackMessage =
    hasAuthDegradedSession || stallPhase === "auth"
      ? "Impossible de vérifier votre session pour le moment. Vérifiez votre réseau puis réessayez."
      : "Les données de votre enfant mettent trop de temps à charger. Vérifiez votre réseau puis réessayez.";

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
          {showBootFallback ? (
            <View style={styles.feedbackCard}>
              <Text style={styles.feedbackTitle}>{fallbackTitle}</Text>
              <Text style={styles.feedbackText}>{fallbackMessage}</Text>
              <Text style={styles.feedbackHint}>
                {isOffline
                  ? "Aucune connexion internet détectée."
                  : "La connexion semble instable."}
              </Text>
              <Pressable
                style={({ pressed }) => [
                  styles.retryButton,
                  pressed && styles.retryButtonPressed,
                ]}
                onPress={handleRetry}
                accessibilityRole="button"
                accessibilityLabel="Réessayer le démarrage"
              >
                <Text style={styles.retryButtonText}>Réessayer</Text>
              </Pressable>
            </View>
          ) : (
            <IconPulseDots
              size={20}
              gap={16}
              minOpacity={0.3}
              maxOpacity={0.9}
              minScale={0.9}
              maxScale={1.1}
              cycleDurationMs={2400}
            />
          )}
        </View>
      </SafeAreaView>
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
    paddingHorizontal: 24,
    paddingBottom: 40,
    gap: 32,
  },
  logo: {
    width: 120,
    height: 120,
    borderRadius: 28,
  },
  feedbackCard: {
    width: "100%",
    maxWidth: 340,
    alignItems: "center",
    paddingVertical: 24,
    paddingHorizontal: 20,
    borderRadius: 20,
    backgroundColor: "rgba(255,255,255,0.9)",
    gap: 12,
  },
  feedbackTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: "#1f2937",
    textAlign: "center",
  },
  feedbackText: {
    fontSize: 14,
    lineHeight: 20,
    color: "#374151",
    textAlign: "center",
  },
  feedbackHint: {
    fontSize: 13,
    color: "#6b7280",
    textAlign: "center",
  },
  retryButton: {
    minWidth: 160,
    paddingVertical: 12,
    paddingHorizontal: 18,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#ec4899",
  },
  retryButtonPressed: {
    opacity: 0.88,
  },
  retryButtonText: {
    fontSize: 15,
    fontWeight: "700",
    color: "#ffffff",
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
