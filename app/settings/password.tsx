import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { Stack, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { InfoModal } from '@/components/ui/InfoModal';
import { auth } from '@/config/firebase';
import { getNeutralColors } from '@/constants/dashboardColors';
import { Colors } from '@/constants/theme';
import { useToast } from '@/contexts/ToastContext';
import { useColorScheme } from '@/hooks/use-color-scheme';
import {
  EmailAuthProvider,
  reauthenticateWithCredential,
  sendPasswordResetEmail,
  updatePassword,
} from 'firebase/auth';

export default function PasswordScreen() {
  const colorScheme = useColorScheme() ?? 'light';
  const nc = getNeutralColors(colorScheme);
  const router = useRouter();
  const { showToast, showActionToast } = useToast();
  const isMountedRef = useRef(true);

  useEffect(() => {
    return () => {
      isMountedRef.current = false;
    };
  }, []);

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

  const closeModal = useCallback(() => {
    setModalConfig((prev) => ({ ...prev, visible: false, onConfirm: undefined }));
  }, []);

  const passwordRules = useMemo(() => [
    { id: 'length', label: '8+ caracteres', test: (value: string) => value.length >= 8 },
    { id: 'number', label: '1 chiffre', test: (value: string) => /\d/.test(value) },
    {
      id: 'special',
      label: '1 caractere special',
      test: (value: string) => /[^A-Za-z0-9]/.test(value),
    },
  ], []);

  const unmetRules = useMemo(
    () => passwordRules.filter((rule) => !rule.test(newPassword)),
    [passwordRules, newPassword]
  );
  const strengthScore = passwordRules.length - unmetRules.length;
  const strengthPercent = useMemo(
    () => Math.round((strengthScore / passwordRules.length) * 100),
    [strengthScore, passwordRules.length]
  );
  const strengthLabel = useMemo(
    () => strengthScore === 3 ? 'Fort' : strengthScore === 2 ? 'Moyen' : 'Faible',
    [strengthScore]
  );

  const mapFirebaseError = useCallback((error: unknown) => {
    if (!error || typeof error !== 'object') {
      return 'Une erreur est survenue. Reessayez.';
    }

    const code = 'code' in error ? String(error.code) : '';
    if (code === 'auth/wrong-password') {
      return 'Mot de passe actuel incorrect.';
    }
    if (code === 'auth/too-many-requests') {
      return 'Trop de tentatives. Reessayez plus tard.';
    }
    if (code === 'auth/weak-password') {
      return 'Mot de passe trop faible. Utilisez 8+ caracteres, 1 chiffre, 1 caractere special.';
    }
    if (code === 'auth/requires-recent-login') {
      return 'Veuillez vous reconnecter pour changer votre mot de passe.';
    }

    return 'Impossible de modifier le mot de passe.';
  }, []);

  const handleForgotPassword = useCallback(async () => {
    const user = auth.currentUser;
    setErrorMessage('');
    if (!user?.email) {
      setErrorMessage('Email introuvable pour la reinitialisation.');
      return;
    }

    try {
      setIsSaving(true);
      await sendPasswordResetEmail(auth, user.email);
      if (!isMountedRef.current) return;
      showToast('Email de reinitialisation envoye');
    } catch (error) {
      if (!isMountedRef.current) return;
      const message = mapFirebaseError(error);
      setErrorMessage(message);
      showActionToast(
        'Echec de l\'envoi de l\'email.',
        'Reessayer',
        () => { handleForgotPassword(); }
      );
    } finally {
      if (isMountedRef.current) {
        setIsSaving(false);
      }
    }
  }, [mapFirebaseError, showToast, showActionToast]);

  const handleChangePassword = useCallback(async () => {
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
      if (!isMountedRef.current) return;
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      showToast('Mot de passe modifie avec succes');
      setModalConfig({
        visible: true,
        title: 'Succes',
        message: 'Mot de passe modifie avec succes.',
        onConfirm: () => router.back(),
      });
    } catch (error) {
      if (!isMountedRef.current) return;
      const message = mapFirebaseError(error);
      setErrorMessage(message);
      showActionToast(
        'Impossible de modifier le mot de passe.',
        'Reessayer',
        () => { handleChangePassword(); }
      );
    } finally {
      if (isMountedRef.current) {
        setIsSaving(false);
      }
    }
  }, [currentPassword, newPassword, confirmPassword, unmetRules, mapFirebaseError, showToast, showActionToast, router]);

  const isInvalid = useMemo(() =>
    !currentPassword ||
    !newPassword ||
    !confirmPassword ||
    unmetRules.length > 0 ||
    newPassword !== confirmPassword ||
    newPassword === currentPassword,
    [currentPassword, newPassword, confirmPassword, unmetRules]
  );
  const isSaveDisabled = isSaving || isInvalid;

  return (
    <View style={[styles.screen, { backgroundColor: nc.background }]}>
      <SafeAreaView style={[styles.container, { backgroundColor: nc.background }]} edges={['bottom']}>
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
          <View style={[styles.section, { backgroundColor: nc.backgroundCard }]}>
            <ThemedText style={[styles.sectionTitle, { color: nc.textMuted }]}>
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
                      backgroundColor: nc.backgroundPressed,
                      color: nc.textStrong,
                      borderColor: nc.borderLight,
                    },
                  ]}
                  value={currentPassword}
                  onChangeText={(value) => {
                    setCurrentPassword(value);
                    if (errorMessage) setErrorMessage('');
                  }}
                  placeholder="Entrez votre mot de passe actuel"
                  placeholderTextColor={nc.textMuted}
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
                    color={nc.textMuted}
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
                <Text style={[styles.forgotLinkText, { color: nc.textMuted }]}>
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
                      backgroundColor: nc.backgroundPressed,
                      color: nc.textStrong,
                      borderColor: nc.borderLight,
                    },
                  ]}
                  value={newPassword}
                  onChangeText={(value) => {
                    setNewPassword(value);
                    if (errorMessage) setErrorMessage('');
                  }}
                  placeholder="Entrez votre nouveau mot de passe"
                  placeholderTextColor={nc.textMuted}
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
                    color={nc.textMuted}
                  />
                </TouchableOpacity>
              </View>
              {newPassword.length > 0 && unmetRules.length > 0 && (
                <Text style={[styles.hint, { color: nc.textMuted }]}>
                  {unmetRules.map((rule) => rule.label).join(', ')}
                </Text>
              )}
              <View style={[styles.strengthBarTrack, { backgroundColor: nc.borderLight }, newPassword.length === 0 && styles.strengthBarTrackEmpty]}>
                <View
                  style={[
                    styles.strengthBarFill,
                    {
                      width: `${strengthPercent}%`,
                      backgroundColor:
                        unmetRules.length === 0
                          ? nc.success
                          : unmetRules.length === 1
                          ? nc.warning
                          : nc.error,
                    },
                  ]}
                />
              </View>
              {newPassword.length > 0 && (
                <Text style={[styles.strengthLabel, { color: nc.textMuted }]}>
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
                      backgroundColor: nc.backgroundPressed,
                      color: nc.textStrong,
                      borderColor: nc.borderLight,
                    },
                  ]}
                  value={confirmPassword}
                  onChangeText={(value) => {
                    setConfirmPassword(value);
                    if (errorMessage) setErrorMessage('');
                  }}
                  placeholder="Confirmez votre nouveau mot de passe"
                  placeholderTextColor={nc.textMuted}
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
                    color={nc.textMuted}
                  />
                </TouchableOpacity>
              </View>
            </View>
            {!!errorMessage && (
              <Text style={[styles.errorText, { color: nc.error }]}>{errorMessage}</Text>
            )}
          </View>

          <View style={[styles.infoBox, { backgroundColor: nc.backgroundCard }]}>
            <Ionicons name="information-circle" size={24} color={Colors[colorScheme].tint} />
            <ThemedText style={styles.infoText}>
              Conseil: 8+ caracteres, 1 chiffre, 1 caractere special.
            </ThemedText>
          </View>

          <TouchableOpacity
            style={[
              styles.saveButton,
              { backgroundColor: nc.todayAccent, shadowColor: nc.todayAccent },
              isSaveDisabled && styles.saveButtonDisabled,
            ]}
            onPress={handleChangePassword}
            activeOpacity={0.8}
            disabled={isSaveDisabled}
            accessibilityRole="button"
            accessibilityState={{ disabled: isSaveDisabled }}
          >
            <Ionicons name="checkmark" size={20} color={colorScheme === 'dark' ? nc.white : nc.backgroundCard} />
            <Text style={[styles.saveButtonText, { color: colorScheme === 'dark' ? nc.white : nc.backgroundCard }]}>
              {isSaving ? 'Enregistrement...' : 'Changer le mot de passe'}
            </Text>
          </TouchableOpacity>
        </ScrollView>
        <InfoModal
          visible={modalConfig.visible}
          title={modalConfig.title}
          message={modalConfig.message}
          backgroundColor={nc.background}
          textColor={nc.textStrong}
          onClose={closeModal}
          onConfirm={modalConfig.onConfirm}
        />
      </SafeAreaView>
    </View>
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
    backgroundColor: undefined as unknown as string, // set dynamically
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
    color: undefined as unknown as string, // set dynamically
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
    paddingVertical: 16,
    borderRadius: 12,
    marginBottom: 24,
    gap: 12,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 5,
  },
  saveButtonDisabled: {
    opacity: 0.6,
  },
  saveButtonText: {
    fontSize: 18,
    fontWeight: '600',
  },
});
