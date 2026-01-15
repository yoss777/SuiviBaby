import { Ionicons } from '@expo/vector-icons';
import { Stack } from 'expo-router';
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
      title: '1. Responsable du traitement',
      content:
        'SuiviBaby, [Adresse complete], [Pays]. Contact : privacy@suivibaby.com. DPO : [Nom/Email si applicable, sinon "non designe"].',
    },
    {
      title: '2. Donnees collectees',
      content:
        'Compte : email, pseudo, identifiant utilisateur. Enfants : prenom/nom, date de naissance, sexe, photo (si fournie). Suivi : evenements de suivi (biberons, tetees, changes, sommeil, etc.). Donnees techniques : version de l\'app, plateforme, logs techniques en cas d\'erreur.',
    },
    {
      title: '3. Finalites et base legale',
      content:
        'Fournir le service et synchroniser vos donnees (execution du contrat). Securiser l\'acces et prevenir la fraude (interet legitime). Ameliorer l\'app et corriger les bugs (interet legitime). Notifications importantes liees au service (interet legitime / consentement si requis).',
    },
    {
      title: '4. Hebergement et sous-traitants',
      content:
        'Les donnees sont hebergees par Google Firebase (Google LLC). [Preciser la region d\'hebergement : Europe/France]. Si un transfert hors UE a lieu, il est encadre par les clauses contractuelles types de la Commission europeenne.',
    },
    {
      title: '5. Durees de conservation',
      content:
        'Donnees de compte : tant que votre compte est actif. Donnees de suivi : tant que le compte est actif. En cas de suppression, vos donnees sont supprimees sous 30 jours, sauf obligation legale ou sauvegardes techniques.',
    },
    {
      title: '6. Partage des donnees',
      content:
        'Vos donnees ne sont jamais vendues. Elles peuvent etre partagees uniquement avec nos sous-traitants techniques (Firebase) pour le fonctionnement du service et avec les personnes que vous autorisez explicitement via les fonctions de partage.',
    },
    {
      title: '7. Vos droits',
      content:
        'Conformement au RGPD, vous disposez des droits d\'acces, rectification, suppression, limitation, opposition et portabilite. Vous pouvez exercer ces droits en nous contactant a privacy@SuiviBaby.com. Vous avez aussi le droit d\'introduire une reclamation aupres de la CNIL.',
    },
    {
      title: '8. Securite',
      content:
        'Les donnees sont chiffrees en transit (HTTPS/TLS). L\'acces est strictement limite aux personnes autorisees. [Optionnel : chiffrement au repos via Firebase si confirme].',
    },
    {
      title: '9. Modifications',
      content:
        'Toute modification importante de cette politique sera notifiee dans l\'application ou par email.',
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
              Dernière mise à jour : 1er janvier 2026
            </Text>
          </ThemedView>

          <ThemedView style={styles.content}>
            <ThemedText style={styles.intro}>
              Chez SuiviBaby, la protection de vos donnees personnelles est notre
              priorite absolue. Cette politique explique comment nous collectons, utilisons et
              protegeons vos informations.
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
              Pour toute question : privacy@suivibaby.com
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
