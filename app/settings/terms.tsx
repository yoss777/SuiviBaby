import { Ionicons } from '@expo/vector-icons';
import { Stack } from 'expo-router';
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
      title: '1. Qui fournit le service',
      content:
        'Le service est propose par SuiviBaby, [adresse complete], [pays]. Contact : support@suivibaby.com.',
    },
{
      title: '2. Avertissement médical important',
      content:
        'SuiviBaby est un outil d\'organisation personnelle. Il ne constitue pas un dispositif médical, ne fournit aucun diagnostic et ne remplace jamais l\'avis, l\'examen ou la prescription d\'un pédiatre ou d\'un professionnel de santé qualifié.',
    },
    {
      title: '3. Responsabilité de l\'utilisateur',
      content:
        'Vous certifiez être le tuteur légal de l\'enfant pour lequel vous créez un profil. Vous êtes responsable de l\'exactitude des données saisies et de la confidentialité de vos identifiants d\'accès.',
    },
    {
      title: '4. Utilisation appropriee',
      content:
        'Vous vous engagez a utiliser l\'application conformement aux lois en vigueur, ne pas detourner le service a des fins frauduleuses et fournir des informations exactes.',
    },
    {
      title: '5. Donnees et sauvegarde',
      content:
        "Vos donnees sont enregistrees dans le cloud pour assurer leur synchronisation, dans la region us-central1. Des fonctionnalites d'export peuvent etre proposees, mais vous restez responsable de vos sauvegardes personnelles.",
    },
    {
      title: '6. Propriete intellectuelle',
      content:
        'Le contenu, les marques, le design et le code de l\'application sont la propriete de SuiviBaby ou de ses partenaires.',
    },
    {
      title: '7. Disponibilite du service',
      content:
        'Nous nous efforcons de maintenir le service disponible, mais ne garantissons pas une disponibilite continue (maintenance, incidents, dependances techniques).',
    },
{
      title: '8. Suppression du compte',
      content:
        'L\'utilisateur peut supprimer son compte via les paramètres de l\'application. Cette action est irréversible et entraîne la suppression immédiate de toutes les données de suivi associées.',
    },
    {
      title: '9. Limitation de responsabilité',
      content:
        'SuiviBaby décline toute responsabilité en cas de perte de données ou d\'interprétation erronée des graphiques de suivi par l\'utilisateur. Le service est fourni "en l\'état".',
    },
    {
      title: '10. Modifications',
      content:
        'Nous pouvons modifier ces conditions. En cas de changement important, vous serez informe via l\'application ou par email.',
    },
    {
      title: '11. Droit applicable',
      content:
        'Ces conditions sont regies par le droit francais. Tout litige releve de la competence des tribunaux de Paris.',
    },
  ];

  return (
    <ThemedView style={styles.screen}>
      <SafeAreaView style={[styles.container, { backgroundColor: Colors[colorScheme].background }]} edges={['top','bottom']}>
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
              Dernière mise à jour : 1er janvier 2026
            </Text>
          </ThemedView>

          <ThemedView style={styles.content}>
            <ThemedText style={styles.intro}>
              Bienvenue sur SuiviBaby. Ces conditions d'utilisation regissent votre accès et
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
              Pour toute question : support@suivibaby.com
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
