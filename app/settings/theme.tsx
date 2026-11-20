import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { Stack } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { ThemedText } from "@/components/themed-text";
import { InfoModal } from "@/components/ui/InfoModal";
import { SkeletonList } from "@/components/ui/Skeleton";
import { getBackgroundTint, getNeutralColors } from "@/constants/dashboardColors";
import { Colors } from "@/constants/theme";
import { useThemePreference } from "@/contexts/ThemeContext";
import { useToast } from "@/contexts/ToastContext";
import { useColorScheme } from "@/hooks/use-color-scheme";
import type { ThemePreference } from "@/services/userPreferencesService";
import { themeOptionDescription } from "@/utils/themeResolution";

type ThemeOption = ThemePreference;

export default function ThemeScreen() {
  const colorScheme = useColorScheme() ?? "light";
  const nc = getNeutralColors(colorScheme);
  const { preference, isLoading, setPreference, darkAtNight, setDarkAtNight } = useThemePreference();
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
      icon: keyof typeof Ionicons.glyphMap;
    }[]
  >(
    () => [
      {
        value: "light",
        label: "Clair",
        icon: "sunny",
      },
      {
        value: "dark",
        label: "Sombre",
        icon: "moon",
      },
      {
        value: "auto",
        label: "Automatique",
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
      showToast(value === "auto" ? "Thème Automatique, sombre la nuit activé" : "Thème mis à jour");
    } catch (error) {
      if (!isMountedRef.current) return;
      setModalConfig({
        visible: true,
        title: "Erreur",
        message: "Impossible d'enregistrer. Votre choix précédent est rétabli.",
      });
    } finally {
      if (isMountedRef.current) setIsSaving(false);
    }
  }, [isSaving, isLoading, preference, setPreference, showToast]);

  const handleToggleDarkAtNight = useCallback(async (value: boolean) => {
    if (isSaving || isLoading) return;
    try {
      setIsSaving(true);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      await setDarkAtNight(value);
      if (!isMountedRef.current) return;
      showToast(value ? "Sombre la nuit activé" : "Sombre la nuit désactivé");
    } catch {
      if (!isMountedRef.current) return;
      setModalConfig({
        visible: true,
        title: "Erreur",
        message: "Impossible d'enregistrer. Votre choix précédent est rétabli.",
      });
    } finally {
      if (isMountedRef.current) setIsSaving(false);
    }
  }, [isSaving, isLoading, setDarkAtNight, showToast]);

  const renderThemeOption = (option: (typeof themeOptions)[0]) => {
    const isSelected = preference === option.value;
    const isDisabled = isSaving || isLoading;
    const description = themeOptionDescription(option.value, darkAtNight);

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
        accessibilityLabel={`${option.label} : ${description}`}
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
                { color: nc.textLight },
              ]}
            >
              {description}
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
    <View style={[styles.screen, { backgroundColor: nc.background }]}>
      <SafeAreaView
        style={[
          styles.container,
          { backgroundColor: nc.background },
        ]}
        edges={["bottom"]}
      >
        <Stack.Screen
          options={{
            title: "Thème",
            headerBackTitle: "Retour",
          }}
        />
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          <View style={[styles.section, { backgroundColor: nc.backgroundCard }]}>
            <ThemedText
              style={[
                styles.sectionTitle,
                { color: Colors[colorScheme].tint },
              ]}
            >
              Apparence
            </ThemedText>
            <View style={styles.themesContainer} accessibilityRole="radiogroup">
              {isLoading ? (
                <SkeletonList rows={themeOptions.length} />
              ) : (
                themeOptions.map(renderThemeOption)
              )}
            </View>
          </View>

          {!isLoading && (
            <View style={[styles.section, { backgroundColor: nc.backgroundCard }]}>
              {preference === "dark" ? (
                <Text style={[styles.themeDescription, { color: nc.textLight }]}>
                  Le thème Sombre est déjà sombre à toute heure.
                </Text>
              ) : (
                <View style={styles.switchRow}>
                  <View style={styles.themeContent}>
                    <ThemedText style={[styles.themeLabel, { color: nc.textStrong, fontWeight: "500" }]}>
                      Sombre la nuit
                    </ThemedText>
                    <Text style={[styles.themeDescription, { color: nc.textLight }]}>
                      De 22 h à 7 h, l&apos;écran passe en sombre pour ne pas vous éblouir.
                    </Text>
                  </View>
                  <View style={styles.switchHitArea}>
                    <Switch
                      value={darkAtNight}
                      onValueChange={handleToggleDarkAtNight}
                      disabled={isSaving}
                      trackColor={{
                        false: nc.border,
                        true: getBackgroundTint(Colors[colorScheme].tint, 0.31),
                      }}
                      thumbColor={darkAtNight ? Colors[colorScheme].tint : nc.backgroundCard}
                      ios_backgroundColor={nc.border}
                      accessibilityRole="switch"
                      accessibilityLabel="Sombre la nuit, de 22 h à 7 h"
                      accessibilityState={{ checked: darkAtNight, disabled: isSaving }}
                    />
                  </View>
                </View>
              )}
            </View>
          )}

          <View style={[styles.infoBox, { backgroundColor: nc.backgroundCard }]}>
            <Ionicons
              name="information-circle"
              size={24}
              color={Colors[colorScheme].tint}
            />
            <ThemedText style={styles.infoText}>
              Que « Sombre la nuit » soit activé ou non, de 22 h à 7 h
              l&apos;application agrandit ses boutons et coupe les animations.
            </ThemedText>
          </View>
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
    </View>
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
  switchRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  switchHitArea: {
    minWidth: 44,
    minHeight: 44,
    justifyContent: "center",
    alignItems: "center",
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
