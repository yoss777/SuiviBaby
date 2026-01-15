import { Ionicons } from '@expo/vector-icons';
import { Stack } from 'expo-router';
import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { InfoModal } from '@/components/ui/InfoModal';
import { Colors } from '@/constants/theme';
import { useAuth } from '@/contexts/AuthContext';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { modifierNomUtilisateur } from '@/services/usersService';

export default function ProfileScreen() {
  const colorScheme = useColorScheme() ?? 'light';
  const { userName, email, refreshUser } = useAuth();
  const [displayName, setDisplayName] = useState(userName ?? '');
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [modalConfig, setModalConfig] = useState({
    visible: false,
    title: '',
    message: '',
  });

  const closeModal = () => {
    setModalConfig((prev) => ({ ...prev, visible: false }));
  };

  useEffect(() => {
    setDisplayName(userName ?? '');
  }, [userName]);

  const handleSave = async () => {
    const trimmedName = displayName.trim();
    setErrorMessage('');
    if (trimmedName.length < 6) {
      setModalConfig({
        visible: true,
        title: 'Pseudo invalide',
        message: 'Le pseudo doit contenir au moins 6 caracteres.',
      });
      return;
    }

    try {
      setIsSaving(true);
      await modifierNomUtilisateur(trimmedName);
      await refreshUser();
      setModalConfig({
        visible: true,
        title: 'Succès',
        message: 'Profil mis a jour avec succès',
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Erreur inconnue.';
      setErrorMessage(message);
      setModalConfig({
        visible: true,
        title: 'Erreur',
        message: 'Impossible de mettre a jour le profil. Reessayez.',
      });
    } finally {
      setIsSaving(false);
    }
  };

  const trimmedName = displayName.trim();
  const isInvalid = trimmedName.length < 6;
  const isUnchanged = trimmedName === (userName ?? '').trim();
  const isSaveDisabled = isSaving || isInvalid || isUnchanged;

  return (
    <ThemedView style={styles.screen}>
      <SafeAreaView style={[styles.container, { backgroundColor: Colors[colorScheme].background }]} edges={['bottom']}>
        <Stack.Screen
          options={{
            title: 'Profil',
            headerBackTitle: 'Retour',
          }}
        />
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          <ThemedView style={styles.section}>
            <ThemedText style={[styles.sectionTitle, { color: Colors[colorScheme].tabIconDefault }]}>
              Profil
            </ThemedText>

            <View style={styles.inputGroup}>
              <ThemedText style={styles.label}>Pseudo</ThemedText>
              <TextInput
                style={[
                  styles.input,
                  {
                    backgroundColor: Colors[colorScheme].background,
                    color: Colors[colorScheme].text,
                    borderColor: Colors[colorScheme].tabIconDefault + '30',
                  },
                ]}
                value={displayName}
                onChangeText={setDisplayName}
                placeholder="Entrez votre pseudo"
                placeholderTextColor={Colors[colorScheme].tabIconDefault}
              />
              {isInvalid && (
                <Text style={[styles.helperText, { color: Colors[colorScheme].tabIconDefault }]}>
                  6 caracteres minimum.
                </Text>
              )}
            </View>

            {!!errorMessage && (
              <Text style={styles.errorText}>{errorMessage}</Text>
            )}

            <View style={styles.inputGroup}>
              <ThemedText style={styles.label}>Email</ThemedText>
              <TextInput
                style={[
                  styles.input,
                  styles.inputDisabled,
                  {
                    backgroundColor: Colors[colorScheme].background,
                    color: Colors[colorScheme].tabIconDefault,
                    borderColor: Colors[colorScheme].tabIconDefault + '30',
                  },
                ]}
                value={email ?? ''}
                editable={false}
                placeholder="Email du compte"
                placeholderTextColor={Colors[colorScheme].tabIconDefault}
              />
            </View>
          </ThemedView>

          <TouchableOpacity
            style={[
              styles.saveButton,
              { backgroundColor: Colors[colorScheme].tint },
              isSaveDisabled && styles.saveButtonDisabled,
            ]}
            onPress={handleSave}
            activeOpacity={0.8}
            disabled={isSaveDisabled}
            accessibilityRole="button"
            accessibilityState={{ disabled: isSaveDisabled }}
          >
            <Ionicons name="checkmark" size={20} color="#fff" />
            <Text style={styles.saveButtonText}>
              {isSaving ? 'Enregistrement...' : 'Enregistrer'}
            </Text>
          </TouchableOpacity>
        </ScrollView>
        <InfoModal
          visible={modalConfig.visible}
          title={modalConfig.title}
          message={modalConfig.message}
          backgroundColor={Colors[colorScheme].background}
          textColor={Colors[colorScheme].text}
          onClose={closeModal}
        />
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
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 16,
  },
  inputGroup: {
    marginBottom: 16,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 8,
  },
  helperText: {
    fontSize: 12,
    marginTop: 6,
  },
  input: {
    height: 48,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 16,
    fontSize: 16,
  },
  inputDisabled: {
    opacity: 0.7,
  },
  errorText: {
    color: '#d9534f',
    fontSize: 12,
    marginBottom: 12,
  },
  saveButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    borderRadius: 12,
    marginBottom: 24,
    gap: 8,
  },
  saveButtonDisabled: {
    opacity: 0.6,
  },
  saveButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});
