import { useCallback, useEffect, useState } from "react";
import { Image, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { ErrorBoundary } from "@/components/ErrorBoundary";
import BackgroundImage from "@/components/ui/BackgroundImage";
import { IconPulseDots } from "@/components/ui/IconPulseDtos";
import { useAuth } from "@/contexts/AuthContext";
import { useBaby } from "@/contexts/BabyContext";
import { obtenirEvenementsDuJourHybrid } from "@/migration/eventsHybridService";
import { obtenirPreferencesNotifications } from "@/services/userPreferencesService";
import { setPreferencesCache } from "@/services/userPreferencesCache";
import {
  buildTodayEventsData,
  getTodayEventsCache,
  setTodayEventsCache,
} from "@/services/todayEventsCache";
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
          // Prefetch events + user preferences in parallel
          await Promise.race([
            Promise.all([
              prefetchToday(targetChild.id),
              obtenirPreferencesNotifications()
                .then((prefs) => setPreferencesCache({
                  tips: prefs.tips ?? true,
                  insights: prefs.insights ?? true,
                  correlations: prefs.correlations ?? true,
                }))
                .catch(() => {}),
            ]),
            preloadTimeout,
          ]);
          if (cancelled) return;

          navigate = () => router.replace("/(drawer)/baby" as any);
        }
      } else {
        console.log("[BOOT] Fallback, redirection vers explore");
        navigate = () => router.replace("/explore" as any);
      }

      // Naviguer directement
      console.log("[BOOT] Navigation directe");
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
