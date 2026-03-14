import { Ionicons } from "@expo/vector-icons";
import { Stack } from "expo-router";
import { useEffect, useMemo, useState } from "react";
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
import { useColorScheme } from "@/hooks/use-color-scheme";
import type { LanguagePreference } from "@/services/userPreferencesService";
import {
  mettreAJourPreferenceLanguage,
  obtenirPreferenceLanguage,
} from "@/services/userPreferencesService";

interface Language {
  code: string;
  name: string;
  nativeName: string;
  flag: string;
}

export default function LanguageScreen() {
  const colorScheme = useColorScheme() ?? "light";
  const nc = getNeutralColors(colorScheme);
  const [selectedLanguage, setSelectedLanguage] =
    useState<LanguagePreference>("fr");
  const [isSaving, setIsSaving] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [modalConfig, setModalConfig] = useState({
    visible: false,
    title: "",
    message: "",
  });

  const languages = useMemo<Language[]>(
    () => [
      { code: "fr", name: "French", nativeName: "Fran\u00e7ais", flag: "\ud83c\uddeb\ud83c\uddf7" },
      { code: "en", name: "English", nativeName: "English", flag: "\ud83c\uddec\ud83c\udde7" },
      { code: "es", name: "Spanish", nativeName: "Espa\u00f1ol", flag: "\ud83c\uddea\ud83c\uddf8" },
      { code: "de", name: "German", nativeName: "Deutsch", flag: "\ud83c\udde9\ud83c\uddea" },
      { code: "it", name: "Italian", nativeName: "Italiano", flag: "\ud83c\uddee\ud83c\uddf9" },
      { code: "pt", name: "Portuguese", nativeName: "Portugu\u00eas", flag: "\ud83c\uddf5\ud83c\uddf9" },
      { code: "ar", name: "Arabic", nativeName: "\u0627\u0644\u0639\u0631\u0628\u064a\u0629", flag: "\ud83c\uddf8\ud83c\udde6" },
    ],
    []
  );

  useEffect(() => {
    let isMounted = true;
    const loadPreference = async () => {
      try {
        const preference = await obtenirPreferenceLanguage();
        if (isMounted) setSelectedLanguage(preference);
      } catch (error) {
        if (!isMounted) return;
        setModalConfig({
          visible: true,
          title: "Erreur",
          message: "Impossible de charger la langue.",
        });
      } finally {
        if (isMounted) setIsLoading(false);
      }
    };

    loadPreference();
    return () => {
      isMounted = false;
    };
  }, []);

  const closeModal = () => {
    setModalConfig((prev) => ({ ...prev, visible: false }));
  };

  const handleSelect = async (language: LanguagePreference) => {
    if (isSaving || isLoading) return;
    if (language === selectedLanguage) return;

    const previous = selectedLanguage;
    setSelectedLanguage(language);

    try {
      setIsSaving(true);
      await mettreAJourPreferenceLanguage(language);
    } catch (error) {
      setSelectedLanguage(previous);
      setModalConfig({
        visible: true,
        title: "Erreur",
        message: "Impossible de mettre a jour la langue.",
      });
    } finally {
      setIsSaving(false);
    }
  };

  const renderLanguageOption = (language: Language) => {
    const isSelected = selectedLanguage === language.code;
    const isDisabled = isSaving || isLoading;

    return (
      <TouchableOpacity
        key={language.code}
        style={[
          styles.languageOption,
          {
            borderBottomColor: nc.borderLightAlpha,
            backgroundColor: isSelected
              ? getBackgroundTint(Colors[colorScheme].tint, 0.06)
              : "transparent",
          },
        ]}
        onPress={() => handleSelect(language.code as LanguagePreference)}
        activeOpacity={0.7}
        disabled={isDisabled}
        accessibilityRole="radio"
        accessibilityLabel={`${language.nativeName} (${language.name})`}
        accessibilityState={{ selected: isSelected, disabled: isDisabled }}
      >
        <View style={styles.languageLeft}>
          <Text style={styles.flag}>{language.flag}</Text>
          <View style={styles.languageContent}>
            <ThemedText
              style={[
                styles.languageName,
                {
                  color: isSelected
                    ? Colors[colorScheme].tint
                    : nc.textStrong,
                  fontWeight: isSelected ? "600" : "500",
                },
              ]}
            >
              {language.nativeName}
            </ThemedText>
            <Text
              style={[
                styles.languageEnglishName,
                { color: nc.textMuted },
              ]}
            >
              {language.name}
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
            title: "Langue",
            headerBackTitle: "Retour",
          }}
        />
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          <ThemedView style={styles.section}>
            {/* <ThemedText
              style={[
                styles.sectionTitle,
                { color: Colors[colorScheme].tint },
              ]}
            >
              Langue
            </ThemedText> */}
            <View style={styles.languagesContainer}>
              {languages.map(renderLanguageOption)}
            </View>
          </ThemedView>

          <ThemedView style={styles.infoBox}>
            <Ionicons
              name="information-circle"
              size={24}
              color={Colors[colorScheme].tint}
            />
            <ThemedText style={styles.infoText}>
              Le changement de langue sera appliqu\u00e9 imm\u00e9diatement \u00e0 l'ensemble
              de l'application. Les donn\u00e9es m\u00e9dicales resteront dans leur langue
              d'origine.
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
  languagesContainer: {
    borderRadius: 12,
    overflow: "hidden",
  },
  languageOption: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 16,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
  },
  languageLeft: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
  },
  flag: {
    fontSize: 32,
    marginRight: 16,
  },
  languageContent: {
    flex: 1,
  },
  languageName: {
    fontSize: 18,
    marginBottom: 2,
  },
  languageEnglishName: {
    fontSize: 14,
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
