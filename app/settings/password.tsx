import { Ionicons } from '@expo/vector-icons';
import { Stack, useRouter } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { InfoModal } from '@/components/ui/InfoModal';
import { auth } from '@/config/firebase';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import {
  EmailAuthProvider,
  reauthenticateWithCredential,
  sendPasswordResetEmail,
  updatePassword,
} from 'firebase/auth';

export default function PasswordScreen() {
  const colorScheme = useColorScheme() ?? 'light';
  const router = useRouter();

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [modalConfig, setModalConfig] = useState({
    visible: false,
    title: '',
    message: '',
    onConfirm: undefined as undefined | (() => void),
  });

  const closeModal = () => {
    setModalConfig((prev) => ({ ...prev, visible: false, onConfirm: undefined }));
  };

  const passwordRules = [
    { id: 'length', label: '8+ caracteres', test: (value: string) => value.length >= 8 },
    { id: 'number', label: '1 chiffre', test: (value: string) => /\d/.test(value) },
    {
      id: 'special',
      label: '1 caractere special',
      test: (value: string) => /[^A-Za-z0-9]/.test(value),
    },
  ];
  const unmetRules = passwordRules.filter((rule) => !rule.test(newPassword));
  const strengthScore = passwordRules.length - unmetRules.length;
  const strengthPercent = Math.round((strengthScore / passwordRules.length) * 100);
  const strengthLabel =
    strengthScore === 3 ? 'Fort' : strengthScore === 2 ? 'Moyen' : 'Faible';

  const mapFirebaseError = (error: unknown) => {
    if (!error || typeof error !== 'object') {
      return 'Une erreur est survenue. Réessayez.';
    }

    const code = 'code' in error ? String(error.code) : '';
    if (code === 'auth/wrong-password') {
      return 'Mot de passe actuel incorrect.';
    }
    if (code === 'auth/too-many-requests') {
      return 'Trop de tentatives. Réessayez plus tard.';
    }
    if (code === 'auth/weak-password') {
      return 'Mot de passe trop faible. Utilisez 8+ caracteres, 1 chiffre, 1 caractere special.';
    }
    if (code === 'auth/requires-recent-login') {
      return 'Veuillez vous reconnecter pour changer votre mot de passe.';
    }

    return 'Impossible de modifier le mot de passe.';
  };

  const handleForgotPassword = async () => {
    const user = auth.currentUser;
    setErrorMessage('');
    if (!user?.email) {
      setErrorMessage('Email introuvable pour la reinitialisation.');
      return;
    }

    try {
      setIsSaving(true);
      await sendPasswordResetEmail(auth, user.email);
      setModalConfig({
        visible: true,
        title: 'Email envoye',
        message: 'Un email de reinitialisation a ete envoye.',
        onConfirm: undefined,
      });
    } catch (error) {
      setErrorMessage(mapFirebaseError(error));
    } finally {
      setIsSaving(false);
    }
  };

  const handleChangePassword = async () => {
    setErrorMessage('');
    if (!currentPassword || !newPassword || !confirmPassword) {
      setErrorMessage('Veuillez remplir tous les champs.');
      return;
    }

    if (unmetRules.length > 0) {
      setErrorMessage('Mot de passe trop faible. Utilisez 8+ caracteres, 1 chiffre, 1 caractere special.');
      return;
    }

    if (newPassword === currentPassword) {
      setErrorMessage('Le nouveau mot de passe doit etre different.');
      return;
    }

    if (newPassword !== confirmPassword) {
      setErrorMessage('Les nouveaux mots de passe ne correspondent pas.');
      return;
    }

    const user = auth.currentUser;
    if (!user || !user.email) {
      setErrorMessage('Utilisateur non authentifie.');
      return;
    }

    try {
      setIsSaving(true);
      const credential = EmailAuthProvider.credential(user.email, currentPassword);
      await reauthenticateWithCredential(user, credential);
      await updatePassword(user, newPassword);
      setModalConfig({
        visible: true,
        title: 'Succès',
        message: 'Mot de passe modifié avec succès.',
        onConfirm: () => router.back(),
      });
    } catch (error) {
      setErrorMessage(mapFirebaseError(error));
    } finally {
      setIsSaving(false);
    }
  };

  const isInvalid =
    !currentPassword ||
    !newPassword ||
    !confirmPassword ||
    unmetRules.length > 0 ||
    newPassword !== confirmPassword ||
    newPassword === currentPassword;
  const isSaveDisabled = isSaving || isInvalid;

  return (
    <ThemedView style={styles.screen}>
      <SafeAreaView style={[styles.container, { backgroundColor: Colors[colorScheme].background }]} edges={['bottom']}>
        <Stack.Screen
          options={{
            title: 'Mot de passe',
            headerBackTitle: 'Retour',
          }}
        />
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          <ThemedView style={styles.section}>
            <ThemedText style={[styles.sectionTitle, { color: Colors[colorScheme].tabIconDefault }]}>
              Mot de passe
            </ThemedText>

            <View style={styles.inputGroup}>
              <ThemedText style={styles.label}>
                Mot de passe actuel
              </ThemedText>
              <View style={styles.passwordContainer}>
                <TextInput
                  style={[
                    styles.input,
                    {
                      backgroundColor: Colors[colorScheme].background,
                      color: Colors[colorScheme].text,
                      borderColor: Colors[colorScheme].tabIconDefault + '30',
                    },
                  ]}
                  value={currentPassword}
                  onChangeText={(value) => {
                    setCurrentPassword(value);
                    if (errorMessage) setErrorMessage('');
                  }}
                  placeholder="Entrez votre mot de passe actuel"
                  placeholderTextColor={Colors[colorScheme].tabIconDefault}
                  secureTextEntry={!showCurrentPassword}
                  textContentType="password"
                  autoCapitalize="none"
                  autoCorrect={false}
                />
                <TouchableOpacity
                  style={styles.eyeIcon}
                  onPress={() => setShowCurrentPassword(!showCurrentPassword)}
                  accessibilityRole="button"
                >
                  <Ionicons
                    name={showCurrentPassword ? 'eye-off-outline' : 'eye-outline'}
                    size={22}
                    color={Colors[colorScheme].tabIconDefault}
                  />
                </TouchableOpacity>
              </View>
              <TouchableOpacity
                onPress={handleForgotPassword}
                style={styles.forgotLink}
                accessibilityRole="button"
                disabled={isSaving}
                accessibilityState={{ disabled: isSaving }}
              >
                <Text style={[styles.forgotLinkText, { color: Colors[colorScheme].tabIconDefault }]}>
                  Mot de passe oublie ?
                </Text>
              </TouchableOpacity>
            </View>

            <View style={styles.inputGroup}>
              <ThemedText style={styles.label}>
                Nouveau mot de passe
              </ThemedText>
              <View style={styles.passwordContainer}>
                <TextInput
                  style={[
                    styles.input,
                    {
                      backgroundColor: Colors[colorScheme].background,
                      color: Colors[colorScheme].text,
                      borderColor: Colors[colorScheme].tabIconDefault + '30',
                    },
                  ]}
                  value={newPassword}
                  onChangeText={(value) => {
                    setNewPassword(value);
                    if (errorMessage) setErrorMessage('');
                  }}
                  placeholder="Entrez votre nouveau mot de passe"
                  placeholderTextColor={Colors[colorScheme].tabIconDefault}
                  secureTextEntry={!showNewPassword}
                  textContentType="newPassword"
                  autoCapitalize="none"
                  autoCorrect={false}
                />
                <TouchableOpacity
                  style={styles.eyeIcon}
                  onPress={() => setShowNewPassword(!showNewPassword)}
                  accessibilityRole="button"
                >
                  <Ionicons
                    name={showNewPassword ? 'eye-off-outline' : 'eye-outline'}
                    size={22}
                    color={Colors[colorScheme].tabIconDefault}
                  />
                </TouchableOpacity>
              </View>
              {newPassword.length > 0 && unmetRules.length > 0 && (
                <Text style={[styles.hint, { color: Colors[colorScheme].tabIconDefault }]}>
                  {unmetRules.map((rule) => rule.label).join(', ')}
                </Text>
              )}
              <View style={[styles.strengthBarTrack, newPassword.length === 0 && styles.strengthBarTrackEmpty]}>
                <View
                  style={[
                    styles.strengthBarFill,
                    {
                      width: `${strengthPercent}%`,
                      backgroundColor:
                        unmetRules.length === 0
                          ? '#28a745'
                          : unmetRules.length === 1
                          ? '#f0ad4e'
                          : '#dc3545',
                    },
                  ]}
                />
              </View>
              {newPassword.length > 0 && (
                <Text style={[styles.strengthLabel, { color: Colors[colorScheme].tabIconDefault }]}>
                  Force: {strengthLabel}
                </Text>
              )}
            </View>

            <View style={styles.inputGroup}>
              <ThemedText style={styles.label}>
                Confirmer le nouveau mot de passe
              </ThemedText>
              <View style={styles.passwordContainer}>
                <TextInput
                  style={[
                    styles.input,
                    {
                      backgroundColor: Colors[colorScheme].background,
                      color: Colors[colorScheme].text,
                      borderColor: Colors[colorScheme].tabIconDefault + '30',
                    },
                  ]}
                  value={confirmPassword}
                  onChangeText={(value) => {
                    setConfirmPassword(value);
                    if (errorMessage) setErrorMessage('');
                  }}
                  placeholder="Confirmez votre nouveau mot de passe"
                  placeholderTextColor={Colors[colorScheme].tabIconDefault}
                  secureTextEntry={!showConfirmPassword}
                  textContentType="password"
                  autoCapitalize="none"
                  autoCorrect={false}
                />
                <TouchableOpacity
                  style={styles.eyeIcon}
                  onPress={() => setShowConfirmPassword(!showConfirmPassword)}
                  accessibilityRole="button"
                >
                  <Ionicons
                    name={showConfirmPassword ? 'eye-off-outline' : 'eye-outline'}
                    size={22}
                    color={Colors[colorScheme].tabIconDefault}
                  />
                </TouchableOpacity>
              </View>
            </View>
            {!!errorMessage && (
              <Text style={styles.errorText}>{errorMessage}</Text>
            )}
          </ThemedView>

          <ThemedView style={styles.infoBox}>
            <Ionicons name="information-circle" size={24} color={Colors[colorScheme].tint} />
            <ThemedText style={styles.infoText}>
              Conseil: 8+ caracteres, 1 chiffre, 1 caractere special.
            </ThemedText>
          </ThemedView>

          <TouchableOpacity
            style={[
              styles.saveButton,
              { backgroundColor: Colors[colorScheme].tint },
              isSaveDisabled && styles.saveButtonDisabled,
            ]}
            onPress={handleChangePassword}
            activeOpacity={0.8}
            disabled={isSaveDisabled}
            accessibilityRole="button"
            accessibilityState={{ disabled: isSaveDisabled }}
          >
            <Ionicons name="checkmark" size={20} color="#fff" />
            <Text style={styles.saveButtonText}>
              {isSaving ? 'Enregistrement...' : 'Changer le mot de passe'}
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
          onConfirm={modalConfig.onConfirm}
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
  passwordContainer: {
    position: 'relative',
  },
  forgotLink: {
    alignSelf: 'flex-start',
    marginTop: 8,
  },
  forgotLinkText: {
    fontSize: 12,
    fontWeight: '600',
  },
  strengthBarTrack: {
    height: 6,
    borderRadius: 999,
    backgroundColor: '#e9ecef',
    marginTop: 10,
    overflow: 'hidden',
  },
  strengthBarTrackEmpty: {
    opacity: 0.4,
  },
  strengthBarFill: {
    height: '100%',
    borderRadius: 999,
  },
  strengthLabel: {
    fontSize: 12,
    marginTop: 6,
  },
  input: {
    height: 48,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingRight: 50,
    fontSize: 16,
  },
  eyeIcon: {
    position: 'absolute',
    right: 16,
    top: 13,
  },
  hint: {
    fontSize: 12,
    marginTop: 4,
  },
  errorText: {
    color: '#d9534f',
    fontSize: 12,
    marginTop: 4,
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
