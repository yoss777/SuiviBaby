import { useEffect, useState } from "react";
import { Image, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { ThemedText } from "@/components/themed-text";
import BackgroundImage from "@/components/ui/BackgroundImage";
import { DotsLoader } from "@/components/ui/DotsLoader";
import { IconPulseDots } from "@/components/ui/IconPulseDtos";
import { Colors } from "@/constants/theme";
import { useAuth } from "@/contexts/AuthContext";
import { useBaby } from "@/contexts/BabyContext";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { obtenirEvenementsDuJourHybrid } from "@/migration/eventsHybridService";
import {
  buildTodayEventsData,
  setTodayEventsCache,
} from "@/services/todayEventsCache";
import { router } from "expo-router";

export default function BootScreen() {
  const colorScheme = useColorScheme() ?? "light";
  const { user, loading: authLoading } = useAuth();
  const {
    children,
    loading: babyLoading,
    activeChild,
    setActiveChild,
  } = useBaby();
  const [delayDone, setDelayDone] = useState(false);
  const [unauthDelayDone, setUnauthDelayDone] = useState(false);
  const [videoDone, setVideoDone] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setDelayDone(true), 1500);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (authLoading || user) {
      setUnauthDelayDone(false);
      return;
    }

    const timer = setTimeout(() => setUnauthDelayDone(true), 1500);
    return () => clearTimeout(timer);
  }, [authLoading, user]);

  useEffect(() => {
    const fallback = setTimeout(() => setVideoDone(true), 3000);
    return () => clearTimeout(fallback);
  }, []);

  useEffect(() => {
    let cancelled = false;

    const prefetchToday = async (childId: string) => {
      try {
        const events = await obtenirEvenementsDuJourHybrid(childId);
        if (cancelled) return;
        setTodayEventsCache(childId, buildTodayEventsData(events));
      } catch (error) {
        console.warn("[BOOT] Préchargement today échoué:", error);
      }
    };

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
        if (!unauthDelayDone || !videoDone) {
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

      if (!delayDone || !videoDone) {
        console.log("[BOOT] Attente du délai minimum...");
        return;
      }

      // Étape 4 : Décision de navigation basée sur le nombre d'enfants
      console.log(
        "[BOOT] Décision de navigation avec",
        children.length,
        "enfant(s), activeChild:",
        activeChild?.id,
        activeChild?.name,
      );

      if (children.length === 0) {
        console.log("[BOOT] Aucun enfant, redirection vers explore");
        router.replace("/explore");
        return;
      }

      if (children.length >= 1) {
        const targetChild = activeChild ?? children[0];
        if (!targetChild) {
          console.log("[BOOT] Aucun enfant, redirection vers explore");
          router.replace("/explore");
          return;
        }

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

        if (!cancelled) {
          router.replace("/(drawer)/baby");
        }
        return;
      }

      // Fallback
      console.log("[BOOT] Plusieurs enfants, redirection vers explore");
      router.replace("/explore");
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
    videoDone,
    user,
    children,
    setActiveChild,
  ]);

  return (
    <View style={{ flex: 1, backgroundColor: Colors[colorScheme].background }}>
      <BackgroundImage />
      {/* <AppBackground /> */}
      <SafeAreaView
        style={{ flex: 1, backgroundColor: "transparent" }}
        edges={["top", "bottom"]}
      >
        {/* {!videoDone ? (
          <Video
            source={require("@/assets/bootsplash2.mp4")}
            style={styles.fullscreenVideo}
            resizeMode={ResizeMode.CONTAIN}
            shouldPlay
            isLooping={false}
            isMuted
            onPlaybackStatusUpdate={(status) => {
              if (!status.isLoaded) return;
              if (status.didJustFinish) {
                setVideoDone(true);
              }
            }}
          />
        ) : ( */}
        <View
          style={{
            flex: 1,
            alignItems: "center",
            justifyContent: "center",
            paddingBottom: 24,
            paddingHorizontal: 24,
            gap: 24,
          }}
        >
          <Image
            source={require("@/assets/images/icon.png")}
            style={{
              width: 192,
              height: 192,
              marginBottom: 24,
              borderRadius: 24,
            }}
            resizeMode="contain"
          />
          <DotsLoader />
          <IconPulseDots />
          <ThemedText style={{ marginTop: 12, color: "#ffffff" }}>
            Préparation de votre espace...
          </ThemedText>
        </View>
        {/* )} */}
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  fullscreenVideo: {
    ...StyleSheet.absoluteFillObject,
  },
});
