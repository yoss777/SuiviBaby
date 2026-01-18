import { Ionicons } from "@expo/vector-icons";
import { Stack } from "expo-router";
import { useEffect, useState } from "react";
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
  const [selectedLanguage, setSelectedLanguage] =
    useState<LanguagePreference>("fr");
  const [isSaving, setIsSaving] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [modalConfig, setModalConfig] = useState({
    visible: false,
    title: "",
    message: "",
  });

  const languages: Language[] = [
    { code: "fr", name: "French", nativeName: "Français", flag: "🇫🇷" },
    { code: "en", name: "English", nativeName: "English", flag: "🇬🇧" },
    { code: "es", name: "Spanish", nativeName: "Español", flag: "🇪🇸" },
    { code: "de", name: "German", nativeName: "Deutsch", flag: "🇩🇪" },
    { code: "it", name: "Italian", nativeName: "Italiano", flag: "🇮🇹" },
    { code: "pt", name: "Portuguese", nativeName: "Português", flag: "🇵🇹" },
    { code: "ar", name: "Arabic", nativeName: "العربية", flag: "🇸🇦" },
  ];

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

    return (
      <TouchableOpacity
        key={language.code}
        style={[
          styles.languageOption,
          {
            borderBottomColor: Colors[colorScheme].tabIconDefault + "20",
            backgroundColor: isSelected
              ? Colors[colorScheme].tint + "10"
              : "transparent",
          },
        ]}
        onPress={() => handleSelect(language.code)}
        activeOpacity={0.7}
        disabled={isSaving || isLoading}
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
                    : Colors[colorScheme].text,
                  fontWeight: isSelected ? "600" : "500",
                },
              ]}
            >
              {language.nativeName}
            </ThemedText>
            <Text
              style={[
                styles.languageEnglishName,
                { color: Colors[colorScheme].tabIconDefault },
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
          { backgroundColor: Colors[colorScheme].background },
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
              Le changement de langue sera appliqué immédiatement à l'ensemble
              de l'application. Les données médicales resteront dans leur langue
              d'origine.
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
