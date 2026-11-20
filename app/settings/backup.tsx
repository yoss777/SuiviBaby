// Écran « Sauvegarde » : explique, sans rien simuler, comment les données
// sont conservées. Les saisies partent vers Firestore dès qu'il y a du réseau
// (file hors ligne sinon) ; il n'existe ni sauvegarde manuelle ni restauration.
import { Ionicons } from '@expo/vector-icons';
import { Stack, useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { getBackgroundTint, getNeutralColors } from '@/constants/dashboardColors';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { getWaitingCount } from '@/services/offlineQueueService';

/** Texte d'état selon le nombre de saisies encore dans la file hors ligne. */
export function backupStatusText(waiting: number | null): string {
  if (waiting === null) return 'Vérification en cours…';
  if (waiting === 0) return 'Tout est enregistré sur nos serveurs.';
  if (waiting === 1) return '1 saisie attend le réseau pour être envoyée.';
  return `${waiting} saisies attendent le réseau pour être envoyées.`;
}

export default function BackupScreen() {
  const colorScheme = useColorScheme() ?? 'light';
  const nc = getNeutralColors(colorScheme);
  const tint = Colors[colorScheme].tint;
  const router = useRouter();
  const [waiting, setWaiting] = useState<number | null>(null);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      getWaitingCount()
        .then((n) => {
          if (active) setWaiting(n);
        })
        .catch(() => {
          if (active) setWaiting(0);
        });
      return () => {
        active = false;
      };
    }, [])
  );

  const upToDate = waiting === 0;

  return (
    <View style={[styles.screen, { backgroundColor: nc.background }]}>
      <SafeAreaView style={styles.container} edges={['bottom']}>
        <Stack.Screen options={{ title: 'Sauvegarde', headerBackTitle: 'Retour' }} />
        <ScrollView contentContainerStyle={styles.scrollContent}>
          <View style={[styles.card, { backgroundColor: nc.backgroundCard }]}>
            <View style={styles.statusHeader}>
              <View
                style={[styles.statusIcon, { backgroundColor: getBackgroundTint(upToDate ? nc.success : tint, 0.15) }]}
                importantForAccessibility="no-hide-descendants"
                accessibilityElementsHidden
              >
                <Ionicons
                  name={upToDate ? 'cloud-done' : 'cloud-upload'}
                  size={30}
                  color={upToDate ? nc.success : tint}
                />
              </View>
              <View style={styles.statusContent}>
                <ThemedText style={styles.statusTitle} accessibilityRole="header">
                  Sauvegarde automatique
                </ThemedText>
                <Text style={[styles.statusText, { color: nc.textLight }]} accessibilityLiveRegion="polite">
                  {backupStatusText(waiting)}
                </Text>
              </View>
            </View>
          </View>

          <View style={[styles.card, { backgroundColor: nc.backgroundCard }]}>
            <ThemedText style={styles.paragraph}>
              Il n&apos;y a rien à faire : chaque saisie est envoyée sur nos serveurs dès que votre
              téléphone a du réseau. Hors ligne, elle est gardée sur le téléphone puis envoyée au
              retour du réseau.
            </ThemedText>
            <ThemedText style={styles.paragraph}>
              Si vous changez de téléphone, connectez-vous avec le même compte : tout le suivi est
              là. Les proches invités voient les mêmes données.
            </ThemedText>
            <Text style={[styles.note, { color: nc.textLight }]}>
              Données hébergées par Google Firebase dans l&apos;Union européenne.
            </Text>
          </View>

          <TouchableOpacity
            style={[styles.button, { backgroundColor: tint }]}
            onPress={() => router.push('/settings/export')}
            accessibilityRole="button"
            accessibilityLabel="Exporter mes données"
            accessibilityHint="Ouvre l'écran d'export pour garder une copie de vos données"
          >
            <Ionicons name="download-outline" size={20} color={Colors[colorScheme].onTint} />
            <Text style={[styles.buttonText, { color: Colors[colorScheme].onTint }]}>
              Exporter mes données
            </Text>
          </TouchableOpacity>
          <Text style={[styles.note, styles.centered, { color: nc.textLight }]}>
            Pour garder votre propre copie de toutes vos données.
          </Text>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  container: { flex: 1 },
  scrollContent: { padding: 16, paddingBottom: 32 },
  card: { marginBottom: 16, borderRadius: 12, padding: 20 },
  statusHeader: { flexDirection: 'row', alignItems: 'center' },
  statusIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  statusContent: { flex: 1 },
  statusTitle: { fontSize: 18, fontWeight: '600', marginBottom: 4 },
  statusText: { fontSize: 14, lineHeight: 20 },
  paragraph: { fontSize: 15, lineHeight: 22, marginBottom: 12 },
  note: { fontSize: 13, lineHeight: 18 },
  centered: { textAlign: 'center', marginTop: 8 },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
    padding: 16,
    borderRadius: 12,
    gap: 8,
  },
  buttonText: { fontSize: 16, fontWeight: '600' },
});
