import { useEffect, useState } from "react";
import { Image, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { ThemedText } from "@/components/themed-text";
import BackgroundImage from "@/components/ui/BackgroundImage";
import { DotsLoader } from "@/components/ui/DotsLoader";
import { IconPulseDots } from "@/components/ui/IconPulseDtos";
import { Colors } from "@/constants/theme";
import { useAuth } from "@/contexts/AuthContext";
import { useBaby } from "@/contexts/BabyContext";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { router } from "expo-router";

export default function BootScreen() {
  const colorScheme = useColorScheme() ?? "light";
  const { user, loading: authLoading } = useAuth();
  const { children, loading: babyLoading, setActiveChild } = useBaby();
  const [delayDone, setDelayDone] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setDelayDone(true), 5000);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    console.log(
      "[BOOT] authLoading:",
      authLoading,
      "babyLoading:",
      babyLoading,
      "user:",
      !!user,
      "children.length:",
      children.length
    );

    // Étape 1 : Attendre que l'auth soit chargée
    if (authLoading) {
      console.log("[BOOT] En attente de l'auth...");
      return;
    }

    // Étape 2 : Si pas d'utilisateur, rediriger vers login
    if (!user) {
      console.log("[BOOT] Pas de user, redirection vers login");
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

    // Étape 4 : Décision de navigation basée sur le nombre d'enfants
    console.log(
      "[BOOT] Décision de navigation avec",
      children.length,
      "enfant(s)"
    );

    if (children.length === 0) {
      console.log("[BOOT] Aucun enfant, redirection vers explore");
      router.replace("/explore");
      return;
    }

    if (children.length === 1) {
      console.log("[BOOT] 1 enfant, redirection vers baby");
      setActiveChild(children[0]);
      router.replace("/(drawer)/baby");
      return;
    }

    // Plusieurs enfants
    console.log("[BOOT] Plusieurs enfants, redirection vers explore");
    router.replace("/explore");
  }, [authLoading, babyLoading, delayDone, user, children, setActiveChild]);

  return (
    <SafeAreaView
      style={{ flex: 1, backgroundColor: Colors[colorScheme].background }}
    >
      <BackgroundImage />
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
          style={{ width: 192, height: 192, marginBottom: 24, borderRadius:24 }}
          resizeMode="contain"
        />
        <DotsLoader />
        <IconPulseDots />
        <ThemedText style={{ marginTop: 12, color:"#ffffff" }}>
          Préparation de votre espace...
        </ThemedText>
      </View>
    </SafeAreaView>
  );
}
