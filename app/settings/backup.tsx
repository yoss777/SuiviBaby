import { Ionicons } from '@expo/vector-icons';
import { Stack } from 'expo-router';
import { useState } from 'react';
import { Alert, ScrollView, StyleSheet, Switch, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

export default function BackupScreen() {
  const colorScheme = useColorScheme() ?? 'light';

  const [autoBackup, setAutoBackup] = useState(true);
  const [wifiOnly, setWifiOnly] = useState(true);
  const [includePhotos, setIncludePhotos] = useState(false);
  const [isBackingUp, setIsBackingUp] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);

  const lastBackup = '26 décembre 2025 à 14:30';
  const backupSize = '45.2 MB';

  const handleBackupNow = () => {
    setIsBackingUp(true);
    setTimeout(() => {
      setIsBackingUp(false);
      Alert.alert('Sauvegarde terminée', 'Vos données ont été sauvegardées avec succès');
    }, 2000);
  };

  const handleRestore = () => {
    Alert.alert(
      'Restaurer les données',
      'Êtes-vous sûr de vouloir restaurer vos données ? Les données actuelles seront remplacées.',
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Restaurer',
          style: 'destructive',
          onPress: () => {
            setIsRestoring(true);
            setTimeout(() => {
              setIsRestoring(false);
              Alert.alert('Restauration terminée', 'Vos données ont été restaurées avec succès');
            }, 2000);
          },
        },
      ]
    );
  };

  const renderSwitch = (value: boolean, onValueChange: (value: boolean) => void) => (
    <Switch
      value={value}
      onValueChange={onValueChange}
      trackColor={{
        false: Colors[colorScheme].tabIconDefault + '30',
        true: Colors[colorScheme].tint + '50',
      }}
      thumbColor={value ? Colors[colorScheme].tint : '#f4f3f4'}
      ios_backgroundColor={Colors[colorScheme].tabIconDefault + '30'}
    />
  );

  const renderSettingItem = (
    title: string,
    description: string,
    value: boolean,
    onValueChange: (value: boolean) => void
  ) => (
    <View style={styles.settingItem}>
      <View style={styles.settingContent}>
        <ThemedText style={styles.settingTitle}>{title}</ThemedText>
        <Text style={[styles.settingDescription, { color: Colors[colorScheme].tabIconDefault }]}>
          {description}
        </Text>
      </View>
      {renderSwitch(value, onValueChange)}
    </View>
  );

  return (
    <ThemedView style={styles.screen}>
    <SafeAreaView style={[styles.container, { backgroundColor: Colors[colorScheme].background }]} edges={['top','bottom']}>
      <Stack.Screen
        options={{
          title: 'Sauvegarde',
          headerBackTitle: 'Retour',
        }}
      />
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <ThemedView style={styles.statusCard}>
          <View style={styles.statusHeader}>
            <View
              style={[
                styles.statusIcon,
                { backgroundColor: Colors[colorScheme].tint + '20' },
              ]}
            >
              <Ionicons
                name="cloud-done"
                size={32}
                color={Colors[colorScheme].tint}
              />
            </View>
            <View style={styles.statusContent}>
              <ThemedText style={styles.statusTitle}>
                Dernière sauvegarde
              </ThemedText>
              <Text style={[styles.statusDate, { color: Colors[colorScheme].tabIconDefault }]}>
                {lastBackup}
              </Text>
            </View>
          </View>
          <View style={styles.statusFooter}>
            <View style={styles.statusInfo}>
              <Ionicons
                name="server-outline"
                size={16}
                color={Colors[colorScheme].tabIconDefault}
              />
              <Text style={[styles.statusInfoText, { color: Colors[colorScheme].tabIconDefault }]}>
                {backupSize}
              </Text>
            </View>
            <View style={styles.statusInfo}>
              <Ionicons
                name="checkmark-circle"
                size={16}
                color="#28a745"
              />
              <Text style={[styles.statusInfoText, { color: '#28a745' }]}>
                Synchronisé
              </Text>
            </View>
          </View>
        </ThemedView>

        <ThemedView style={styles.section}>
          <ThemedText style={[styles.sectionTitle, { color: Colors[colorScheme].tint }]}>
            PARAMÈTRES DE SAUVEGARDE
          </ThemedText>
          {renderSettingItem(
            'Sauvegarde automatique',
            'Sauvegarder automatiquement vos données',
            autoBackup,
            setAutoBackup
          )}
          {renderSettingItem(
            'Wi-Fi uniquement',
            'Sauvegarder uniquement sur Wi-Fi',
            wifiOnly,
            setWifiOnly
          )}
          {renderSettingItem(
            'Inclure les photos',
            'Sauvegarder les photos et documents',
            includePhotos,
            setIncludePhotos
          )}
        </ThemedView>

        <View style={styles.actionsContainer}>
          <TouchableOpacity
            style={[
              styles.actionButton,
              styles.primaryButton,
              {
                backgroundColor: Colors[colorScheme].tint,
                opacity: isBackingUp ? 0.6 : 1,
              },
            ]}
            onPress={handleBackupNow}
            disabled={isBackingUp}
            activeOpacity={0.8}
          >
            <Ionicons name="cloud-upload" size={20} color="#fff" />
            <Text style={styles.primaryButtonText}>
              {isBackingUp ? 'Sauvegarde en cours...' : 'Sauvegarder maintenant'}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.actionButton,
              styles.secondaryButton,
              {
                borderColor: Colors[colorScheme].tint,
                opacity: isRestoring ? 0.6 : 1,
              },
            ]}
            onPress={handleRestore}
            disabled={isRestoring}
            activeOpacity={0.8}
          >
            <Ionicons name="cloud-download" size={20} color={Colors[colorScheme].tint} />
            <Text style={[styles.secondaryButtonText, { color: Colors[colorScheme].tint }]}>
              {isRestoring ? 'Restauration en cours...' : 'Restaurer les données'}
            </Text>
          </TouchableOpacity>
        </View>

        <ThemedView style={styles.infoBox}>
          <Ionicons name="information-circle" size={24} color={Colors[colorScheme].tint} />
          <ThemedText style={styles.infoText}>
            Les sauvegardes sont cryptées et stockées de manière sécurisée. Vos données sont
            protégées et accessibles uniquement par vous.
          </ThemedText>
        </ThemedView>

        <ThemedView style={styles.section}>
          <ThemedText style={[styles.sectionTitle, { color: Colors[colorScheme].tint }]}>
            HISTORIQUE DES SAUVEGARDES
          </ThemedText>
          <View style={styles.historyItem}>
            <View style={styles.historyLeft}>
              <Ionicons
                name="time-outline"
                size={20}
                color={Colors[colorScheme].tabIconDefault}
              />
              <ThemedText style={styles.historyDate}>
                26 décembre 2025, 14:30
              </ThemedText>
            </View>
            <Text style={[styles.historySize, { color: Colors[colorScheme].tabIconDefault }]}>
              45.2 MB
            </Text>
          </View>
          <View style={styles.historyItem}>
            <View style={styles.historyLeft}>
              <Ionicons
                name="time-outline"
                size={20}
                color={Colors[colorScheme].tabIconDefault}
              />
              <ThemedText style={styles.historyDate}>
                25 décembre 2025, 10:15
              </ThemedText>
            </View>
            <Text style={[styles.historySize, { color: Colors[colorScheme].tabIconDefault }]}>
              44.8 MB
            </Text>
          </View>
          <View style={styles.historyItem}>
            <View style={styles.historyLeft}>
              <Ionicons
                name="time-outline"
                size={20}
                color={Colors[colorScheme].tabIconDefault}
              />
              <ThemedText style={styles.historyDate}>
                24 décembre 2025, 08:00
              </ThemedText>
            </View>
            <Text style={[styles.historySize, { color: Colors[colorScheme].tabIconDefault }]}>
              43.5 MB
            </Text>
          </View>
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
  statusCard: {
    marginBottom: 24,
    borderRadius: 12,
    padding: 20,
  },
  statusHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  statusIcon: {
    width: 60,
    height: 60,
    borderRadius: 30,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  statusContent: {
    flex: 1,
  },
  statusTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 4,
  },
  statusDate: {
    fontSize: 14,
  },
  statusFooter: {
    flexDirection: 'row',
    gap: 16,
  },
  statusInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  statusInfoText: {
    fontSize: 14,
    fontWeight: '500',
  },
  section: {
    marginBottom: 24,
    borderRadius: 12,
    padding: 16,
  },
  sectionTitle: {
    // fontSize: 13,
    // fontWeight: "600",
    // marginBottom: 16,
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 16,
  },
  settingItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
  },
  settingContent: {
    flex: 1,
    marginRight: 16,
  },
  settingTitle: {
    fontSize: 16,
    fontWeight: '500',
    marginBottom: 4,
  },
  settingDescription: {
    fontSize: 13,
    lineHeight: 18,
  },
  actionsContainer: {
    gap: 12,
    marginBottom: 24,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    borderRadius: 12,
    gap: 8,
  },
  primaryButton: {
    // backgroundColor set dynamically
  },
  primaryButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  secondaryButton: {
    borderWidth: 2,
    backgroundColor: 'transparent',
  },
  secondaryButtonText: {
    fontSize: 16,
    fontWeight: '600',
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
  historyItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
  },
  historyLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  historyDate: {
    fontSize: 14,
  },
  historySize: {
    fontSize: 14,
    fontWeight: '500',
  },
});
