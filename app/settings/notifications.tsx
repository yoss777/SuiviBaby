import { Ionicons } from '@expo/vector-icons';
import { Stack } from 'expo-router';
import React, { useState } from 'react';
import { ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

interface NotificationSetting {
  id: string;
  title: string;
  description: string;
  enabled: boolean;
}

export default function NotificationsScreen() {
  const colorScheme = useColorScheme() ?? 'light';

  const [pushEnabled, setPushEnabled] = useState(true);
  const [emailEnabled, setEmailEnabled] = useState(true);
  const [smsEnabled, setSmsEnabled] = useState(false);

  const [appointments, setAppointments] = useState(true);
  const [vaccinations, setVaccinations] = useState(true);
  const [medications, setMedications] = useState(true);
  const [labResults, setLabResults] = useState(true);
  const [prescriptions, setPrescriptions] = useState(false);

  const [marketing, setMarketing] = useState(false);
  const [updates, setUpdates] = useState(true);
  const [tips, setTips] = useState(true);

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
    <SafeAreaView style={[styles.container, { backgroundColor: Colors[colorScheme].background }]} edges={['bottom']}>
      <Stack.Screen
        options={{
          title: 'Notifications',
          headerBackTitle: 'Retour',
        }}
      />
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <ThemedView style={styles.section}>
          <ThemedText style={[styles.sectionTitle, { color: Colors[colorScheme].tabIconDefault }]}>
            CANAUX DE NOTIFICATION
          </ThemedText>
          {renderSettingItem(
            'Notifications push',
            'Recevoir des notifications sur votre appareil',
            pushEnabled,
            setPushEnabled
          )}
          {renderSettingItem(
            'Notifications par email',
            'Recevoir des notifications par email',
            emailEnabled,
            setEmailEnabled
          )}
          {renderSettingItem(
            'Notifications par SMS',
            'Recevoir des notifications par SMS',
            smsEnabled,
            setSmsEnabled
          )}
        </ThemedView>

        <ThemedView style={styles.section}>
          <ThemedText style={[styles.sectionTitle, { color: Colors[colorScheme].tabIconDefault }]}>
            RAPPELS MÉDICAUX
          </ThemedText>
          {renderSettingItem(
            'Rendez-vous',
            'Rappels pour vos rendez-vous médicaux',
            appointments,
            setAppointments
          )}
          {renderSettingItem(
            'Vaccinations',
            'Rappels pour les vaccinations',
            vaccinations,
            setVaccinations
          )}
          {renderSettingItem(
            'Médicaments',
            'Rappels de prise de médicaments',
            medications,
            setMedications
          )}
          {renderSettingItem(
            'Résultats de laboratoire',
            'Notifications pour les nouveaux résultats',
            labResults,
            setLabResults
          )}
          {renderSettingItem(
            'Ordonnances',
            'Rappels de renouvellement d\'ordonnances',
            prescriptions,
            setPrescriptions
          )}
        </ThemedView>

        <ThemedView style={styles.section}>
          <ThemedText style={[styles.sectionTitle, { color: Colors[colorScheme].tabIconDefault }]}>
            INFORMATIONS
          </ThemedText>
          {renderSettingItem(
            'Actualités et mises à jour',
            'Nouvelles fonctionnalités et améliorations',
            updates,
            setUpdates
          )}
          {renderSettingItem(
            'Conseils santé',
            'Conseils et astuces pour votre santé',
            tips,
            setTips
          )}
          {renderSettingItem(
            'Offres promotionnelles',
            'Informations sur les offres et promotions',
            marketing,
            setMarketing
          )}
        </ThemedView>

        <ThemedView style={styles.infoBox}>
          <Ionicons name="information-circle" size={24} color={Colors[colorScheme].tint} />
          <ThemedText style={styles.infoText}>
            Vous pouvez modifier vos préférences de notification à tout moment. Les notifications
            critiques relatives à la sécurité ne peuvent pas être désactivées.
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
