import { Ionicons } from "@expo/vector-icons";
import { Stack } from "expo-router";
import { useState } from "react";
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
import { Colors } from "@/constants/theme";
import { useThemePreference } from "@/contexts/ThemeContext";
import { useColorScheme } from "@/hooks/use-color-scheme";
import type { ThemePreference } from "@/services/userPreferencesService";

type ThemeOption = ThemePreference;

export default function ThemeScreen() {
  const colorScheme = useColorScheme() ?? "light";
  const { preference, isLoading, setPreference } = useThemePreference();
  const [isSaving, setIsSaving] = useState(false);
  const [modalConfig, setModalConfig] = useState({
    visible: false,
    title: "",
    message: "",
  });

  const themeOptions: {
    value: ThemeOption;
    label: string;
    description: string;
    icon: keyof typeof Ionicons.glyphMap;
  }[] = [
    {
      value: "light",
      label: "Clair",
      description: "Thème clair pour une meilleure lisibilité en journée",
      icon: "sunny",
    },
    {
      value: "dark",
      label: "Sombre",
      description: "Thème sombre pour réduire la fatigue oculaire",
      icon: "moon",
    },
    {
      value: "auto",
      label: "Automatique",
      description: "Suit les paramètres système de votre appareil",
      icon: "phone-portrait",
    },
  ];

  const closeModal = () => {
    setModalConfig((prev) => ({ ...prev, visible: false }));
  };

  const handleSelect = async (value: ThemeOption) => {
    if (isSaving || isLoading) return;
    if (value === preference) return;

    try {
      setIsSaving(true);
      await setPreference(value);
    } catch (error) {
      setModalConfig({
        visible: true,
        title: "Erreur",
        message: "Impossible de mettre a jour le theme.",
      });
    } finally {
      setIsSaving(false);
    }
  };

  const renderThemeOption = (option: (typeof themeOptions)[0]) => {
    const isSelected = preference === option.value;
    const isDisabled = isSaving || isLoading;

    return (
      <TouchableOpacity
        key={option.value}
        style={[
          styles.themeOption,
          { borderBottomColor: Colors[colorScheme].tabIconDefault + "20" },
          isSelected && { backgroundColor: Colors[colorScheme].tint + "10" },
        ]}
        onPress={() => handleSelect(option.value)}
        activeOpacity={0.7}
        disabled={isDisabled}
      >
        <View style={styles.themeLeft}>
          <View
            style={[
              styles.iconContainer,
              {
                backgroundColor: isSelected
                  ? Colors[colorScheme].tint + "20"
                  : Colors[colorScheme].tabIconDefault + "10",
              },
            ]}
          >
            <Ionicons
              name={option.icon}
              size={22}
              color={
                isSelected
                  ? Colors[colorScheme].tint
                  : Colors[colorScheme].tabIconDefault
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
                    : Colors[colorScheme].text,
                  fontWeight: isSelected ? "600" : "500",
                },
              ]}
            >
              {option.label}
            </ThemedText>
            <Text
              style={[
                styles.themeDescription,
                { color: Colors[colorScheme].tabIconDefault },
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
          { backgroundColor: Colors[colorScheme].background },
        ]}
        edges={["top", "bottom"]}
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
              fonction des paramètres de votre appareil pour un confort optimal
              à toute heure.
            </ThemedText>
          </ThemedView>
        </ScrollView>
        <InfoModal
          visible={modalConfig.visible}
          title={modalConfig.title}
          message={modalConfig.message}
          backgroundColor={Colors[colorScheme].background}
          textColor={Colors[colorScheme].text}
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
    // fontSize: 12,
    // fontWeight: '700',
    // textTransform: 'uppercase',
    // letterSpacing: 1,
    // marginBottom: 16,
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
