import { Ionicons } from '@expo/vector-icons';
import { Stack } from 'expo-router';
import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

export default function TermsScreen() {
  const colorScheme = useColorScheme() ?? 'light';

  const sections = [
    {
      title: '1. Acceptation des conditions',
      content:
        'En utilisant Mediscope, vous acceptez les présentes conditions d\'utilisation. Si vous n\'acceptez pas ces conditions, veuillez ne pas utiliser l\'application.',
    },
    {
      title: '2. Description du service',
      content:
        'Mediscope est une application de gestion d\'informations médicales personnelles. Elle permet de stocker, organiser et suivre vos données de santé et celles de votre famille.',
    },
    {
      title: '3. Utilisation appropriée',
      content:
        'Vous vous engagez à utiliser l\'application de manière responsable et conforme aux lois en vigueur. Toute utilisation frauduleuse ou abusive peut entraîner la suspension de votre compte.',
    },
    {
      title: '4. Propriété intellectuelle',
      content:
        'Tous les contenus, designs, logos et marques de l\'application sont la propriété de Mediscope et sont protégés par les lois sur la propriété intellectuelle.',
    },
    {
      title: '5. Responsabilité médicale',
      content:
        'Mediscope est un outil d\'organisation et ne remplace pas un avis médical professionnel. Consultez toujours un professionnel de santé pour vos besoins médicaux.',
    },
    {
      title: '6. Exactitude des données',
      content:
        'Vous êtes responsable de l\'exactitude des informations que vous saisissez dans l\'application. Mediscope ne peut être tenu responsable d\'erreurs dans les données entrées par l\'utilisateur.',
    },
    {
      title: '7. Disponibilité du service',
      content:
        'Nous nous efforçons de maintenir l\'application accessible 24/7, mais ne garantissons pas une disponibilité ininterrompue. Des maintenances peuvent être effectuées.',
    },
    {
      title: '8. Modifications du service',
      content:
        'Nous nous réservons le droit de modifier, suspendre ou arrêter tout ou partie du service à tout moment, avec ou sans préavis.',
    },
    {
      title: '9. Limitation de responsabilité',
      content:
        'Dans la mesure permise par la loi, Mediscope ne sera pas responsable des dommages indirects, spéciaux ou consécutifs résultant de l\'utilisation de l\'application.',
    },
    {
      title: '10. Résiliation',
      content:
        'Vous pouvez résilier votre compte à tout moment depuis les paramètres. Nous nous réservons le droit de suspendre ou résilier votre accès en cas de violation des conditions.',
    },
    {
      title: '11. Droit applicable',
      content:
        'Ces conditions sont régies par le droit français. Tout litige sera soumis à la compétence exclusive des tribunaux français.',
    },
    {
      title: '12. Modifications des conditions',
      content:
        'Nous pouvons modifier ces conditions à tout moment. Les modifications importantes vous seront notifiées via l\'application ou par email.',
    },
  ];

  return (
    <ThemedView style={styles.screen}>
    <SafeAreaView style={[styles.container, { backgroundColor: Colors[colorScheme].background }]} edges={['bottom']}>
      <Stack.Screen
        options={{
          title: 'Conditions d\'utilisation',
          headerBackTitle: 'Retour',
        }}
      />
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <ThemedView style={styles.header}>
          <View style={[styles.headerIcon, { backgroundColor: Colors[colorScheme].tint + '20' }]}>
            <Ionicons name="document-text" size={32} color={Colors[colorScheme].tint} />
          </View>
          <ThemedText style={styles.headerTitle}>
            Conditions d'utilisation
          </ThemedText>
          <Text style={[styles.headerDate, { color: Colors[colorScheme].tabIconDefault }]}>
            Dernière mise à jour : 1er janvier 2025
          </Text>
        </ThemedView>

        <ThemedView style={styles.content}>
          <ThemedText style={styles.intro}>
            Bienvenue sur Mediscope. Ces conditions d'utilisation régissent votre accès et
            utilisation de notre application. Veuillez les lire attentivement.
          </ThemedText>

          {sections.map((section, index) => (
            <View key={index} style={styles.section}>
              <ThemedText style={styles.sectionTitle}>
                {section.title}
              </ThemedText>
              <Text style={[styles.sectionContent, { color: Colors[colorScheme].tabIconDefault }]}>
                {section.content}
              </Text>
            </View>
          ))}
        </ThemedView>

        <ThemedView style={styles.footer}>
          <Ionicons name="information-circle" size={20} color={Colors[colorScheme].tint} />
          <ThemedText style={styles.footerText}>
            Pour toute question : support@mediscope.com
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
  header: {
    alignItems: 'center',
    padding: 24,
    borderRadius: 12,
    marginBottom: 16,
  },
  headerIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: '700',
    marginBottom: 8,
    textAlign: 'center',
  },
  headerDate: {
    fontSize: 14,
  },
  content: {
    padding: 20,
    borderRadius: 12,
    marginBottom: 16,
  },
  intro: {
    fontSize: 15,
    lineHeight: 22,
    marginBottom: 24,
  },
  section: {
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 8,
  },
  sectionContent: {
    fontSize: 14,
    lineHeight: 20,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderRadius: 12,
    marginBottom: 24,
    gap: 12,
  },
  footerText: {
    fontSize: 14,
  },
});
