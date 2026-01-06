import { Ionicons } from '@expo/vector-icons';
import { Stack } from 'expo-router';
import React, { useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

type ThemeOption = 'light' | 'dark' | 'auto';

export default function ThemeScreen() {
  const colorScheme = useColorScheme() ?? 'light';
  const [selectedTheme, setSelectedTheme] = useState<ThemeOption>('auto');

  const themeOptions: { value: ThemeOption; label: string; description: string; icon: keyof typeof Ionicons.glyphMap }[] = [
    {
      value: 'light',
      label: 'Clair',
      description: 'Thème clair pour une meilleure lisibilité en journée',
      icon: 'sunny',
    },
    {
      value: 'dark',
      label: 'Sombre',
      description: 'Thème sombre pour réduire la fatigue oculaire',
      icon: 'moon',
    },
    {
      value: 'auto',
      label: 'Automatique',
      description: 'Suit les paramètres système de votre appareil',
      icon: 'phone-portrait',
    },
  ];

  const renderThemeOption = (option: typeof themeOptions[0]) => {
    const isSelected = selectedTheme === option.value;

    return (
      <TouchableOpacity
        key={option.value}
        style={[
          styles.themeOption,
          {
            borderColor: isSelected
              ? Colors[colorScheme].tint
              : Colors[colorScheme].tabIconDefault + '20',
            backgroundColor: isSelected
              ? Colors[colorScheme].tint + '10'
              : 'transparent',
          },
        ]}
        onPress={() => setSelectedTheme(option.value)}
        activeOpacity={0.7}
      >
        <View
          style={[
            styles.iconContainer,
            {
              backgroundColor: isSelected
                ? Colors[colorScheme].tint + '20'
                : Colors[colorScheme].tabIconDefault + '10',
            },
          ]}
        >
          <Ionicons
            name={option.icon}
            size={28}
            color={isSelected ? Colors[colorScheme].tint : Colors[colorScheme].tabIconDefault}
          />
        </View>
        <View style={styles.themeContent}>
          <ThemedText
            style={[
              styles.themeLabel,
              {
                color: isSelected ? Colors[colorScheme].tint : Colors[colorScheme].text,
              },
            ]}
          >
            {option.label}
          </ThemedText>
          <Text style={[styles.themeDescription, { color: Colors[colorScheme].tabIconDefault }]}>
            {option.description}
          </Text>
        </View>
        {isSelected && (
          <Ionicons name="checkmark-circle" size={24} color={Colors[colorScheme].tint} />
        )}
      </TouchableOpacity>
    );
  };

  return (
    <ThemedView style={styles.screen}>
    <SafeAreaView style={[styles.container, { backgroundColor: Colors[colorScheme].background }]} edges={['bottom']}>
      <Stack.Screen
        options={{
          title: 'Thème',
          headerBackTitle: 'Retour',
        }}
      />
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <ThemedView style={styles.section}>
          <ThemedText style={[styles.sectionTitle, { color: Colors[colorScheme].tabIconDefault }]}>
            APPARENCE
          </ThemedText>
          <View style={styles.themesContainer}>
            {themeOptions.map(renderThemeOption)}
          </View>
        </ThemedView>

        <ThemedView style={styles.previewSection}>
          <ThemedText style={[styles.sectionTitle, { color: Colors[colorScheme].tabIconDefault }]}>
            APERÇU
          </ThemedText>
          <View style={styles.previewContainer}>
            <View style={styles.previewHeader}>
              <View style={[styles.previewCircle, { backgroundColor: Colors[colorScheme].tint }]} />
              <View style={styles.previewLines}>
                <View
                  style={[
                    styles.previewLine,
                    styles.previewLineShort,
                    { backgroundColor: Colors[colorScheme].text },
                  ]}
                />
                <View
                  style={[
                    styles.previewLine,
                    styles.previewLineVeryShort,
                    { backgroundColor: Colors[colorScheme].tabIconDefault },
                  ]}
                />
              </View>
            </View>
            <View style={styles.previewBody}>
              <View
                style={[
                  styles.previewLine,
                  styles.previewLineFull,
                  { backgroundColor: Colors[colorScheme].tabIconDefault + '40' },
                ]}
              />
              <View
                style={[
                  styles.previewLine,
                  styles.previewLineFull,
                  { backgroundColor: Colors[colorScheme].tabIconDefault + '40' },
                ]}
              />
              <View
                style={[
                  styles.previewLine,
                  styles.previewLineMedium,
                  { backgroundColor: Colors[colorScheme].tabIconDefault + '40' },
                ]}
              />
            </View>
          </View>
        </ThemedView>

        <ThemedView style={styles.infoBox}>
          <Ionicons name="information-circle" size={24} color={Colors[colorScheme].tint} />
          <ThemedText style={styles.infoText}>
            Le mode automatique adapte l'apparence de l'application en fonction des paramètres de
            votre appareil pour un confort optimal à toute heure.
          </ThemedText>
        </ThemedView>
      </ScrollView>
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
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 16,
  },
  themesContainer: {
    gap: 12,
  },
  themeOption: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderRadius: 12,
    borderWidth: 2,
  },
  iconContainer: {
    width: 56,
    height: 56,
    borderRadius: 28,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  themeContent: {
    flex: 1,
  },
  themeLabel: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 4,
  },
  themeDescription: {
    fontSize: 14,
    lineHeight: 18,
  },
  previewSection: {
    marginBottom: 24,
    borderRadius: 12,
    padding: 16,
  },
  previewContainer: {
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  previewHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  previewCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    marginRight: 12,
  },
  previewLines: {
    flex: 1,
  },
  previewLine: {
    height: 8,
    borderRadius: 4,
    marginBottom: 6,
  },
  previewLineShort: {
    width: '40%',
  },
  previewLineVeryShort: {
    width: '25%',
  },
  previewLineFull: {
    width: '100%',
  },
  previewLineMedium: {
    width: '60%',
  },
  previewBody: {
    marginTop: 8,
  },
  infoBox: {
    flexDirection: 'row',
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
