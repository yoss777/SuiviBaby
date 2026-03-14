import { Ionicons } from '@expo/vector-icons';
import { Stack } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ScrollView, StyleSheet, Switch, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { getBackgroundTint, getNeutralColors } from '@/constants/dashboardColors';
import { Colors } from '@/constants/theme';
import { useModal } from '@/contexts/ModalContext';
import { useColorScheme } from '@/hooks/use-color-scheme';

export default function BackupScreen() {
  const colorScheme = useColorScheme() ?? 'light';
  const nc = getNeutralColors(colorScheme);
  const { showAlert } = useModal();
  const isMountedRef = useRef(true);

  const [autoBackup, setAutoBackup] = useState(true);
  const [wifiOnly, setWifiOnly] = useState(true);
  const [includePhotos, setIncludePhotos] = useState(false);
  const [isBackingUp, setIsBackingUp] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const lastBackup = '26 d\u00e9cembre 2025 \u00e0 14:30';
  const backupSize = '45.2 MB';

  const switchTrackColors = useMemo(
    () => ({
      false: nc.border,
      true: getBackgroundTint(Colors[colorScheme].tint, 0.31),
    }),
    [nc.border, colorScheme]
  );

  const switchThumbOff = useMemo(
    () => nc.backgroundCard,
    [nc.backgroundCard]
  );

  const handleBackupNow = useCallback(() => {
    setIsBackingUp(true);
    setTimeout(() => {
      if (!isMountedRef.current) return;
      setIsBackingUp(false);
      showAlert('Sauvegarde termin\u00e9e', 'Vos donn\u00e9es ont \u00e9t\u00e9 sauvegard\u00e9es avec succ\u00e8s');
    }, 2000);
  }, [showAlert]);

  const handleRestore = useCallback(() => {
    showAlert(
      'Restaurer les donn\u00e9es',
      '\u00cates-vous s\u00fbr de vouloir restaurer vos donn\u00e9es ? Les donn\u00e9es actuelles seront remplac\u00e9es.',
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Restaurer',
          style: 'destructive',
          onPress: () => {
            setIsRestoring(true);
            setTimeout(() => {
              if (!isMountedRef.current) return;
              setIsRestoring(false);
              showAlert('Restauration termin\u00e9e', 'Vos donn\u00e9es ont \u00e9t\u00e9 restaur\u00e9es avec succ\u00e8s');
            }, 2000);
          },
        },
      ]
    );
  }, [showAlert]);

  const renderSwitch = (
    value: boolean,
    onValueChange: (value: boolean) => void,
    label: string
  ) => (
    <View style={styles.switchHitArea}>
      <Switch
        value={value}
        onValueChange={onValueChange}
        trackColor={switchTrackColors}
        thumbColor={value ? Colors[colorScheme].tint : switchThumbOff}
        ios_backgroundColor={nc.border}
        accessibilityRole="switch"
        accessibilityLabel={label}
        accessibilityState={{ checked: value }}
      />
    </View>
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
        <Text style={[styles.settingDescription, { color: nc.textMuted }]}>
          {description}
        </Text>
      </View>
      {renderSwitch(value, onValueChange, title)}
    </View>
  );

  return (
    <ThemedView style={styles.screen}>
    <SafeAreaView style={[styles.container, { backgroundColor: nc.background }]} edges={['top','bottom']}>
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
                { backgroundColor: getBackgroundTint(Colors[colorScheme].tint, 0.13) },
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
                Derni\u00e8re sauvegarde
              </ThemedText>
              <Text style={[styles.statusDate, { color: nc.textMuted }]}>
                {lastBackup}
              </Text>
            </View>
          </View>
          <View style={styles.statusFooter}>
            <View style={styles.statusInfo}>
              <Ionicons
                name="server-outline"
                size={16}
                color={nc.textMuted}
              />
              <Text style={[styles.statusInfoText, { color: nc.textMuted }]}>
                {backupSize}
              </Text>
            </View>
            <View style={styles.statusInfo}>
              <Ionicons
                name="checkmark-circle"
                size={16}
                color={nc.success}
              />
              <Text style={[styles.statusInfoText, { color: nc.success }]}>
                Synchronis\u00e9
              </Text>
            </View>
          </View>
        </ThemedView>

        <ThemedView style={styles.section}>
          <ThemedText style={[styles.sectionTitle, { color: Colors[colorScheme].tint }]}>
            PARAM\u00c8TRES DE SAUVEGARDE
          </ThemedText>
          {renderSettingItem(
            'Sauvegarde automatique',
            'Sauvegarder automatiquement vos donn\u00e9es',
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
            accessibilityRole="button"
            accessibilityLabel={isBackingUp ? 'Sauvegarde en cours' : 'Sauvegarder maintenant'}
            accessibilityState={{ disabled: isBackingUp }}
          >
            <Ionicons name="cloud-upload" size={20} color={nc.white} />
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
            accessibilityRole="button"
            accessibilityLabel={isRestoring ? 'Restauration en cours' : 'Restaurer les donn\u00e9es'}
            accessibilityState={{ disabled: isRestoring }}
          >
            <Ionicons name="cloud-download" size={20} color={Colors[colorScheme].tint} />
            <Text style={[styles.secondaryButtonText, { color: Colors[colorScheme].tint }]}>
              {isRestoring ? 'Restauration en cours...' : 'Restaurer les donn\u00e9es'}
            </Text>
          </TouchableOpacity>
        </View>

        <ThemedView style={styles.infoBox}>
          <Ionicons name="information-circle" size={24} color={Colors[colorScheme].tint} />
          <ThemedText style={styles.infoText}>
            Les sauvegardes sont crypt\u00e9es et stock\u00e9es de mani\u00e8re s\u00e9curis\u00e9e. Vos donn\u00e9es sont
            prot\u00e9g\u00e9es et accessibles uniquement par vous.
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
                color={nc.textMuted}
              />
              <ThemedText style={styles.historyDate}>
                26 d\u00e9cembre 2025, 14:30
              </ThemedText>
            </View>
            <Text style={[styles.historySize, { color: nc.textMuted }]}>
              45.2 MB
            </Text>
          </View>
          <View style={styles.historyItem}>
            <View style={styles.historyLeft}>
              <Ionicons
                name="time-outline"
                size={20}
                color={nc.textMuted}
              />
              <ThemedText style={styles.historyDate}>
                25 d\u00e9cembre 2025, 10:15
              </ThemedText>
            </View>
            <Text style={[styles.historySize, { color: nc.textMuted }]}>
              44.8 MB
            </Text>
          </View>
          <View style={styles.historyItem}>
            <View style={styles.historyLeft}>
              <Ionicons
                name="time-outline"
                size={20}
                color={nc.textMuted}
              />
              <ThemedText style={styles.historyDate}>
                24 d\u00e9cembre 2025, 08:00
              </ThemedText>
            </View>
            <Text style={[styles.historySize, { color: nc.textMuted }]}>
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
  switchHitArea: {
    minWidth: 44,
    minHeight: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },
  actionsContainer: {
    gap: 12,
    marginBottom: 24,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
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
