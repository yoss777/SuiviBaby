import { Ionicons } from '@expo/vector-icons';
import { Stack } from 'expo-router';
import React, { useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

interface ExportFormat {
  id: string;
  name: string;
  description: string;
  icon: keyof typeof Ionicons.glyphMap;
  extension: string;
}

interface DataCategory {
  id: string;
  name: string;
  description: string;
  icon: keyof typeof Ionicons.glyphMap;
  selected: boolean;
}

export default function ExportScreen() {
  const colorScheme = useColorScheme() ?? 'light';
  const [selectedFormat, setSelectedFormat] = useState('pdf');
  const [isExporting, setIsExporting] = useState(false);

  const [categories, setCategories] = useState<DataCategory[]>([
    {
      id: 'consultations',
      name: 'Consultations',
      description: 'Historique des consultations médicales',
      icon: 'medical',
      selected: true,
    },
    {
      id: 'vaccinations',
      name: 'Vaccinations',
      description: 'Carnet de vaccination',
      icon: 'shield-checkmark',
      selected: true,
    },
    {
      id: 'prescriptions',
      name: 'Ordonnances',
      description: 'Ordonnances et prescriptions',
      icon: 'document-text',
      selected: true,
    },
    {
      id: 'lab-results',
      name: 'Résultats de laboratoire',
      description: 'Analyses et résultats médicaux',
      icon: 'flask',
      selected: true,
    },
    {
      id: 'baby-tracking',
      name: 'Suivi bébé',
      description: 'Données de suivi du bébé',
      icon: 'baby',
      selected: false,
    },
  ]);

  const exportFormats: ExportFormat[] = [
    {
      id: 'pdf',
      name: 'PDF',
      description: 'Document portable et facile à partager',
      icon: 'document-text',
      extension: '.pdf',
    },
    {
      id: 'json',
      name: 'JSON',
      description: 'Format structuré pour développeurs',
      icon: 'code-slash',
      extension: '.json',
    },
    {
      id: 'csv',
      name: 'CSV',
      description: 'Tableur compatible Excel',
      icon: 'grid',
      extension: '.csv',
    },
  ];

  const toggleCategory = (id: string) => {
    setCategories((prev) =>
      prev.map((cat) => (cat.id === id ? { ...cat, selected: !cat.selected } : cat))
    );
  };

  const handleExport = () => {
    const selectedCategories = categories.filter((cat) => cat.selected);

    if (selectedCategories.length === 0) {
      Alert.alert('Erreur', 'Veuillez sélectionner au moins une catégorie à exporter');
      return;
    }

    setIsExporting(true);

    setTimeout(() => {
      setIsExporting(false);
      Alert.alert(
        'Export réussi',
        `Vos données ont été exportées au format ${selectedFormat.toUpperCase()}`,
        [{ text: 'OK' }]
      );
    }, 2000);
  };

  const renderFormatOption = (format: ExportFormat) => {
    const isSelected = selectedFormat === format.id;

    return (
      <TouchableOpacity
        key={format.id}
        style={[
          styles.formatOption,
          {
            borderColor: isSelected
              ? Colors[colorScheme].tint
              : Colors[colorScheme].tabIconDefault + '20',
            backgroundColor: isSelected
              ? Colors[colorScheme].tint + '10'
              : 'transparent',
          },
        ]}
        onPress={() => setSelectedFormat(format.id)}
        activeOpacity={0.7}
      >
        <View
          style={[
            styles.formatIcon,
            {
              backgroundColor: isSelected
                ? Colors[colorScheme].tint + '20'
                : Colors[colorScheme].tabIconDefault + '10',
            },
          ]}
        >
          <Ionicons
            name={format.icon}
            size={24}
            color={isSelected ? Colors[colorScheme].tint : Colors[colorScheme].tabIconDefault}
          />
        </View>
        <View style={styles.formatContent}>
          <ThemedText
            style={[
              styles.formatName,
              {
                color: isSelected ? Colors[colorScheme].tint : Colors[colorScheme].text,
              },
            ]}
          >
            {format.name}
          </ThemedText>
          <Text style={[styles.formatDescription, { color: Colors[colorScheme].tabIconDefault }]}>
            {format.description}
          </Text>
        </View>
        {isSelected && (
          <Ionicons name="checkmark-circle" size={24} color={Colors[colorScheme].tint} />
        )}
      </TouchableOpacity>
    );
  };

  const renderCategoryOption = (category: DataCategory) => (
    <TouchableOpacity
      key={category.id}
      style={[
        styles.categoryOption,
        { borderBottomColor: Colors[colorScheme].tabIconDefault + '20' },
      ]}
      onPress={() => toggleCategory(category.id)}
      activeOpacity={0.7}
    >
      <View style={styles.categoryLeft}>
        <View
          style={[
            styles.categoryIcon,
            { backgroundColor: Colors[colorScheme].tint + '15' },
          ]}
        >
          <Ionicons
            name={category.icon}
            size={22}
            color={Colors[colorScheme].tint}
          />
        </View>
        <View style={styles.categoryContent}>
          <ThemedText style={styles.categoryName}>
            {category.name}
          </ThemedText>
          <Text style={[styles.categoryDescription, { color: Colors[colorScheme].tabIconDefault }]}>
            {category.description}
          </Text>
        </View>
      </View>
      <View
        style={[
          styles.checkbox,
          {
            borderColor: category.selected
              ? Colors[colorScheme].tint
              : Colors[colorScheme].tabIconDefault + '50',
            backgroundColor: category.selected
              ? Colors[colorScheme].tint
              : 'transparent',
          },
        ]}
      >
        {category.selected && (
          <Ionicons name="checkmark" size={18} color="#fff" />
        )}
      </View>
    </TouchableOpacity>
  );

  return (
    <ThemedView style={styles.screen}>
    <SafeAreaView style={[styles.container, { backgroundColor: Colors[colorScheme].background }]} edges={['bottom']}>
      <Stack.Screen
        options={{
          title: 'Exporter les données',
          headerBackTitle: 'Retour',
        }}
      />
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <ThemedView style={styles.section}>
          <ThemedText style={[styles.sectionTitle, { color: Colors[colorScheme].tabIconDefault }]}>
            FORMAT D'EXPORT
          </ThemedText>
          <View style={styles.formatsContainer}>
            {exportFormats.map(renderFormatOption)}
          </View>
        </ThemedView>

        <ThemedView style={styles.section}>
          <ThemedText style={[styles.sectionTitle, { color: Colors[colorScheme].tabIconDefault }]}>
            CATÉGORIES DE DONNÉES
          </ThemedText>
          <View style={styles.categoriesContainer}>
            {categories.map(renderCategoryOption)}
          </View>
        </ThemedView>

        <ThemedView style={styles.infoBox}>
          <Ionicons name="shield-checkmark" size={24} color={Colors[colorScheme].tint} />
          <ThemedText style={styles.infoText}>
            Vos données seront exportées de manière sécurisée. Assurez-vous de stocker le
            fichier exporté dans un endroit sûr.
          </ThemedText>
        </ThemedView>

        <TouchableOpacity
          style={[
            styles.exportButton,
            {
              backgroundColor: Colors[colorScheme].tint,
              opacity: isExporting ? 0.6 : 1,
            },
          ]}
          onPress={handleExport}
          disabled={isExporting}
          activeOpacity={0.8}
        >
          <Ionicons name="cloud-download" size={20} color="#fff" />
          <Text style={styles.exportButtonText}>
            {isExporting ? 'Export en cours...' : 'Exporter les données'}
          </Text>
        </TouchableOpacity>
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
  formatsContainer: {
    gap: 12,
  },
  formatOption: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 12,
    borderWidth: 2,
  },
  formatIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  formatContent: {
    flex: 1,
  },
  formatName: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 2,
  },
  formatDescription: {
    fontSize: 13,
  },
  categoriesContainer: {
    borderRadius: 12,
    overflow: 'hidden',
  },
  categoryOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    paddingHorizontal: 4,
    borderBottomWidth: 1,
  },
  categoryLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  categoryIcon: {
    width: 40,
    height: 40,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  categoryContent: {
    flex: 1,
  },
  categoryName: {
    fontSize: 16,
    fontWeight: '500',
    marginBottom: 2,
  },
  categoryDescription: {
    fontSize: 13,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 6,
    borderWidth: 2,
    justifyContent: 'center',
    alignItems: 'center',
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
  exportButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    borderRadius: 12,
    marginBottom: 24,
    gap: 8,
  },
  exportButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});
