import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { Stack } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { InfoModal } from "@/components/ui/InfoModal";
import { getBackgroundTint, getNeutralColors } from "@/constants/dashboardColors";
import { Colors } from "@/constants/theme";
import { useThemePreference } from "@/contexts/ThemeContext";
import { useToast } from "@/contexts/ToastContext";
import { useColorScheme } from "@/hooks/use-color-scheme";
import type { ThemePreference } from "@/services/userPreferencesService";

type ThemeOption = ThemePreference;

export default function ThemeScreen() {
  const colorScheme = useColorScheme() ?? "light";
  const nc = getNeutralColors(colorScheme);
  const { preference, isLoading, setPreference } = useThemePreference();
  const { showToast } = useToast();
  const [isSaving, setIsSaving] = useState(false);
  const isMountedRef = useRef(true);

  useEffect(() => {
    return () => { isMountedRef.current = false; };
  }, []);
  const [modalConfig, setModalConfig] = useState({
    visible: false,
    title: "",
    message: "",
  });

  const themeOptions = useMemo<
    {
      value: ThemeOption;
      label: string;
      description: string;
      icon: keyof typeof Ionicons.glyphMap;
    }[]
  >(
    () => [
      {
        value: "light",
        label: "Clair",
        description: "Th\u00e8me clair pour une meilleure lisibilit\u00e9 en journ\u00e9e",
        icon: "sunny",
      },
      {
        value: "dark",
        label: "Sombre",
        description: "Th\u00e8me sombre pour r\u00e9duire la fatigue oculaire",
        icon: "moon",
      },
      {
        value: "auto",
        label: "Automatique",
        description: "Suit les param\u00e8tres syst\u00e8me de votre appareil",
        icon: "phone-portrait",
      },
    ],
    []
  );

  const closeModal = () => {
    setModalConfig((prev) => ({ ...prev, visible: false }));
  };

  const handleSelect = useCallback(async (value: ThemeOption) => {
    if (isSaving || isLoading) return;
    if (value === preference) return;

    try {
      setIsSaving(true);
      // P8b: Haptic feedback
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      await setPreference(value);
      if (!isMountedRef.current) return;
      // P6: Success toast
      showToast("Thème mis à jour");
    } catch (error) {
      if (!isMountedRef.current) return;
      setModalConfig({
        visible: true,
        title: "Erreur",
        message: "Impossible de mettre a jour le theme.",
      });
    } finally {
      if (isMountedRef.current) setIsSaving(false);
    }
  }, [isSaving, isLoading, preference, setPreference]);

  const renderThemeOption = (option: (typeof themeOptions)[0]) => {
    const isSelected = preference === option.value;
    const isDisabled = isSaving || isLoading;

    return (
      <TouchableOpacity
        key={option.value}
        style={[
          styles.themeOption,
          { borderBottomColor: nc.borderLightAlpha },
          isSelected && {
            backgroundColor: getBackgroundTint(Colors[colorScheme].tint, 0.06),
          },
        ]}
        onPress={() => handleSelect(option.value)}
        activeOpacity={0.7}
        disabled={isDisabled}
        accessibilityRole="radio"
        accessibilityLabel={`${option.label}: ${option.description}`}
        accessibilityState={{ selected: isSelected, disabled: isDisabled }}
      >
        <View style={styles.themeLeft}>
          <View
            style={[
              styles.iconContainer,
              {
                backgroundColor: isSelected
                  ? getBackgroundTint(Colors[colorScheme].tint, 0.13)
                  : nc.backgroundPressed,
              },
            ]}
          >
            <Ionicons
              name={option.icon}
              size={22}
              color={
                isSelected
                  ? Colors[colorScheme].tint
                  : nc.textMuted
              }
            />
          </View>
          <View style={styles.themeContent}>
            <ThemedText
              style={[
                styles.themeLabel,
                {
                  color: isSelected
                    ? Colors[colorScheme].tint
                    : nc.textStrong,
                  fontWeight: isSelected ? "600" : "500",
                },
              ]}
            >
              {option.label}
            </ThemedText>
            <Text
              style={[
                styles.themeDescription,
                { color: nc.textMuted },
              ]}
            >
              {option.description}
            </Text>
          </View>
        </View>
        {isSelected && (
          <Ionicons
            name="checkmark-circle"
            size={24}
            color={Colors[colorScheme].tint}
          />
        )}
      </TouchableOpacity>
    );
  };

  return (
    <ThemedView style={styles.screen}>
      <SafeAreaView
        style={[
          styles.container,
          { backgroundColor: nc.background },
        ]}
        edges={["top", "bottom"]}
      >
        <Stack.Screen
          options={{
            title: "Th\u00e8me",
            headerBackTitle: "Retour",
          }}
        />
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          <ThemedView style={styles.section}>
            <ThemedText
              style={[
                styles.sectionTitle,
                { color: Colors[colorScheme].tint },
              ]}
            >
              Apparence
            </ThemedText>
            <View style={styles.themesContainer}>
              {themeOptions.map(renderThemeOption)}
            </View>
          </ThemedView>

          <ThemedView style={styles.infoBox}>
            <Ionicons
              name="information-circle"
              size={24}
              color={Colors[colorScheme].tint}
            />
            <ThemedText style={styles.infoText}>
              Le mode automatique adapte l'apparence de l'application en
              fonction des param\u00e8tres de votre appareil pour un confort optimal
              \u00e0 toute heure.
            </ThemedText>
          </ThemedView>
        </ScrollView>
        <InfoModal
          visible={modalConfig.visible}
          title={modalConfig.title}
          message={modalConfig.message}
          backgroundColor={nc.background}
          textColor={nc.textStrong}
          onClose={closeModal}
        />
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  container: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
  },
  section: {
    marginBottom: 24,
    borderRadius: 12,
    padding: 16,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: "600",
    marginBottom: 16,
  },
  themesContainer: {
    borderRadius: 12,
    overflow: "hidden",
  },
  themeOption: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 14,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
  },
  themeLeft: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
  },
  iconContainer: {
    width: 40,
    height: 40,
    borderRadius: 10,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 16,
  },
  themeContent: {
    flex: 1,
  },
  themeLabel: {
    fontSize: 16,
    marginBottom: 2,
  },
  themeDescription: {
    fontSize: 13,
    lineHeight: 18,
  },
  infoBox: {
    flexDirection: "row",
    padding: 16,
    borderRadius: 12,
    marginBottom: 24,
    gap: 12,
  },
  infoText: {
    flex: 1,
    fontSize: 14,
    lineHeight: 20,
  },
});
