import { Ionicons } from '@expo/vector-icons';
import { Stack } from 'expo-router';
import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

export default function PrivacyScreen() {
  const colorScheme = useColorScheme() ?? 'light';

  const sections = [
    {
      title: '1. Collecte des données',
      content:
        'Mediscope collecte uniquement les données nécessaires au fonctionnement de l\'application et à la fourniture de nos services médicaux. Ces données incluent vos informations personnelles, vos données médicales, et les données de suivi de votre bébé.',
    },
    {
      title: '2. Utilisation des données',
      content:
        'Vos données sont utilisées exclusivement pour vous fournir les services de Mediscope, améliorer notre application, et vous envoyer des rappels médicaux importants. Nous ne vendons jamais vos données à des tiers.',
    },
    {
      title: '3. Protection des données',
      content:
        'Toutes vos données sont cryptées lors de leur transmission et stockage. Nous utilisons des technologies de sécurité de pointe pour protéger vos informations médicales sensibles contre tout accès non autorisé.',
    },
    {
      title: '4. Partage des données',
      content:
        'Vos données médicales ne sont partagées qu\'avec votre consentement explicite. Vous pouvez à tout moment contrôler qui a accès à vos informations via les paramètres de partage de l\'application.',
    },
    {
      title: '5. Vos droits',
      content:
        'Conformément au RGPD, vous avez le droit d\'accéder, de modifier, de supprimer ou de transférer vos données personnelles. Vous pouvez exercer ces droits à tout moment depuis les paramètres de l\'application.',
    },
    {
      title: '6. Cookies et traceurs',
      content:
        'Nous utilisons des cookies strictement nécessaires au fonctionnement de l\'application. Aucun cookie publicitaire ou de tracking n\'est utilisé sans votre consentement explicite.',
    },
    {
      title: '7. Conservation des données',
      content:
        'Vos données médicales sont conservées tant que votre compte est actif. En cas de suppression de compte, toutes vos données sont définitivement supprimées dans un délai de 30 jours.',
    },
    {
      title: '8. Données des mineurs',
      content:
        'Les données des enfants sont traitées avec une attention particulière et ne sont accessibles que par les parents ou tuteurs légaux autorisés.',
    },
    {
      title: '9. Modifications de la politique',
      content:
        'Nous pouvons mettre à jour cette politique de confidentialité. Vous serez informé de tout changement important via l\'application ou par email.',
    },
    {
      title: '10. Contact',
      content:
        'Pour toute question concernant la confidentialité de vos données, contactez-nous à privacy@mediscope.com ou via le formulaire de contact dans l\'application.',
    },
  ];

  return (
    <ThemedView style={styles.screen}>
    <SafeAreaView style={[styles.container, { backgroundColor: Colors[colorScheme].background }]} edges={['bottom']}>
      <Stack.Screen
        options={{
          title: 'Confidentialité',
          headerBackTitle: 'Retour',
        }}
      />
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <ThemedView style={styles.header}>
          <View style={[styles.headerIcon, { backgroundColor: Colors[colorScheme].tint + '20' }]}>
            <Ionicons name="shield-checkmark" size={32} color={Colors[colorScheme].tint} />
          </View>
          <ThemedText style={styles.headerTitle}>
            Politique de confidentialité
          </ThemedText>
          <Text style={[styles.headerDate, { color: Colors[colorScheme].tabIconDefault }]}>
            Dernière mise à jour : 1er janvier 2025
          </Text>
        </ThemedView>

        <ThemedView style={styles.content}>
          <ThemedText style={styles.intro}>
            Chez Mediscope, la protection de vos données personnelles et médicales est notre
            priorité absolue. Cette politique de confidentialité explique comment nous collectons,
            utilisons et protégeons vos informations.
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
          <Ionicons name="mail-outline" size={20} color={Colors[colorScheme].tint} />
          <ThemedText style={styles.footerText}>
            Pour toute question : privacy@mediscope.com
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
