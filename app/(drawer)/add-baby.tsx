import { ThemedView } from '@/components/themed-view';
import { GenderRadioGroup } from '@/components/forms/GenderRadioGroup';
import { AllergiesEditor } from '@/components/forms/AllergiesEditor';
import { DateTimePickerRow } from '@/components/ui/DateTimePickerRow';
import { getNeutralColors } from '@/constants/dashboardColors';
import { Colors } from '@/constants/theme';
import { useAuth } from '@/contexts/AuthContext';
import { useModal } from '@/contexts/ModalContext';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { trackOnboardingEvent } from "@/services/onboardingAnalytics";
import FontAwesome from "@expo/vector-icons/FontAwesome5";
import * as Haptics from "expo-haptics";
import { router, useLocalSearchParams } from "expo-router";
import { createChildDoc } from '@/services/childRepository';
import { timestampFromDate } from '@/services/firestoreTimestamps';
import { createOwnerAccess } from '@/utils/permissions';
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from 'react-native-safe-area-context';

export default function AddBabyScreen() {
  const colorScheme = useColorScheme() ?? "light";
  const nc = getNeutralColors(colorScheme);
  const tint = Colors[colorScheme].tint;
  const { user } = useAuth();
  const { showAlert } = useModal();
  const { firstRun } = useLocalSearchParams<{ firstRun?: string }>();
  const isFirstRun = firstRun === "true";
  const [name, setName] = useState("");
  const [birthDate, setBirthDate] = useState<Date>(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return today;
  });
  const [gender, setGender] = useState<'male' | 'female' | ''>('');
  const [allergies, setAllergies] = useState<string[]>([]);
  const [showAllergies, setShowAllergies] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const isMountedRef = useRef(true);

  // Cleanup on unmount
  useEffect(() => {
    isMountedRef.current = true;
    return () => { isMountedRef.current = false; };
  }, []);

  const maxBirthDate = useMemo(() => {
    const today = new Date();
    today.setHours(23, 59, 59, 999);
    return today;
  }, []);

  const minBirthDate = useMemo(() => new Date(1900, 0, 1), []);

  // Dynamic styles that depend on theme
  const dynamicStyles = useMemo(() => StyleSheet.create({
    header: {
      alignItems: "center",
      padding: 32,
      paddingTop: 48,
      backgroundColor: nc.backgroundCard,
      borderBottomLeftRadius: 24,
      borderBottomRightRadius: 24,
      shadowColor: nc.shadow,
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.1,
      shadowRadius: 4,
      elevation: 3,
      marginBottom: 24,
    },
    subtitle: {
      fontSize: 15,
      color: nc.textLight,
      textAlign: "center" as const,
      paddingHorizontal: 16,
      lineHeight: 22,
    },
    label: {
      fontSize: 16,
      fontWeight: "600" as const,
      color: nc.textStrong,
      marginBottom: 8,
    },
    inputContainer: {
      flexDirection: "row" as const,
      alignItems: "center" as const,
      backgroundColor: nc.backgroundCard,
      borderRadius: 12,
      paddingHorizontal: 16,
      paddingVertical: 14,
      borderWidth: 1,
      borderColor: nc.border,
      gap: 12,
    },
    input: {
      flex: 1,
      fontSize: 16,
      color: nc.textStrong,
    },
    helperText: {
      fontSize: 13,
      color: nc.textLight,
      marginTop: 6,
      fontStyle: "italic" as const,
    },
    genderButton: {
      flex: 1,
      flexDirection: "row" as const,
      alignItems: "center" as const,
      justifyContent: "center" as const,
      paddingVertical: 16,
      paddingHorizontal: 12,
      borderRadius: 12,
      borderWidth: 2,
      borderColor: nc.border,
      backgroundColor: nc.backgroundCard,
      gap: 8,
    },
    genderText: {
      fontSize: 16,
      fontWeight: "600" as const,
      color: nc.textStrong,
    },
    submitButton: {
      backgroundColor: nc.success,
      flexDirection: "row" as const,
      alignItems: "center" as const,
      justifyContent: "center" as const,
      paddingVertical: 16,
      paddingHorizontal: 24,
      borderRadius: 12,
      gap: 12,
      marginTop: 8,
      shadowColor: nc.success,
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.3,
      shadowRadius: 8,
      elevation: 5,
    },
    submitButtonDisabled: {
      backgroundColor: nc.textMuted,
      shadowOpacity: 0,
    },
    submitButtonText: {
      color: nc.white,
      fontSize: 18,
      fontWeight: "600" as const,
    },
    infoBox: {
      flexDirection: "row" as const,
      backgroundColor: nc.todayAccent + "15",
      padding: 16,
      marginHorizontal: 20,
      marginTop: 24,
      marginBottom: 32,
      borderRadius: 12,
      gap: 12,
      borderLeftWidth: 4,
      borderLeftColor: nc.todayAccent,
    },
    infoText: {
      flex: 1,
      fontSize: 14,
      color: nc.todayAccent,
      lineHeight: 20,
    },
  }), [nc, colorScheme]);

  // Valider le formulaire
  const validateForm = useCallback((): boolean => {
    if (!name.trim()) {
      showAlert('Erreur', 'Veuillez saisir le nom de l\'enfant');
      return false;
    }

    const today = new Date();
    today.setHours(23, 59, 59, 999);
    if (birthDate > today) {
      showAlert(
        'Erreur',
        'La date de naissance ne peut pas être dans le futur. L\'enfant doit être né pour être ajouté.'
      );
      return false;
    }

    if (!gender) {
      showAlert('Erreur', 'Veuillez sélectionner le sexe de l\'enfant');
      return false;
    }

    return true;
  }, [name, birthDate, gender, showAlert]);

  // Gender selection with haptic
  const handleGenderSelect = useCallback((value: 'male' | 'female') => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setGender(value);
  }, []);

  // Ajouter l'enfant
  const handleAddBaby = useCallback(async () => {
    if (!validateForm()) return;
    if (!user?.uid) {
      showAlert('Erreur', 'Utilisateur non connecté');
      return;
    }

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setIsLoading(true);

    try {
      const parentEmail = user.email?.toLowerCase();
      const childData = {
        name: name.trim(),
        birthDate: timestampFromDate(birthDate),
        gender: gender,
        ownerId: user.uid,
        parentIds: [user.uid],
        parentEmails: parentEmail ? [parentEmail] : [],
        photoUri: "",
        // Facultatif : champ absent plutôt que liste vide à la création
        ...(allergies.length > 0 ? { allergies } : {}),
      };

      const childId = await createChildDoc(childData);
      await createOwnerAccess(childId, user.uid);

      if (!isMountedRef.current) return;

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

      if (isFirstRun) {
        // Premier flow : rediriger vers le dashboard avec guide premier tracking
        trackOnboardingEvent("first_baby_added");
        router.replace({ pathname: "/(drawer)/baby", params: { firstTrack: "true" } } as any);
      } else {
        showAlert(
          'Succès',
          `${name} a été ajouté avec succès !`,
          [
            {
              text: 'OK',
              onPress: () => router.back(),
            },
          ]
        );
      }

      // Réinitialiser le formulaire
      setName('');
      const resetDate = new Date();
      resetDate.setHours(0, 0, 0, 0);
      setBirthDate(resetDate);
      setGender('');
      setAllergies([]);
      setShowAllergies(false);
    } catch (error) {
      if (!isMountedRef.current) return;
      console.error('Erreur lors de l\'ajout de l\'enfant:', error);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      showAlert('Erreur', 'Impossible d\'ajouter l\'enfant. Veuillez réessayer.');
    } finally {
      if (isMountedRef.current) {
        setIsLoading(false);
      }
    }
  }, [validateForm, user, name, birthDate, gender, allergies, showAlert]);

  return (
    <ThemedView style={styles.screen}>
      <SafeAreaView style={styles.safeArea} edges={['bottom']}>
        <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
          <View style={dynamicStyles.header}>
            <FontAwesome name="baby" size={48} color={tint} />
            {isFirstRun ? (
              <>
                <Text style={[styles.welcomeTitle, { color: nc.textStrong, marginTop: 16 }]}>
                  Félicitations !
                </Text>
                <Text style={[dynamicStyles.subtitle, { marginTop: 8 }]}>
                  Votre compte est créé. Commencez par ajouter votre bébé pour démarrer le suivi.
                </Text>
                <View style={[styles.stepIndicator, { backgroundColor: tint + '15' }]}>
                  <Text style={[styles.stepText, { color: tint }]}>Étape 1/2 — Ajouter votre bébé</Text>
                </View>
              </>
            ) : (
              <Text style={[dynamicStyles.subtitle, { marginTop: 20 }]}>
                Renseignez les informations de votre enfant
              </Text>
            )}
          </View>

          {/* Formulaire */}
          <View style={styles.form}>
            {/* Nom de l'enfant */}
            <View style={styles.formGroup}>
              <Text style={dynamicStyles.label}>
                Nom complet <Text style={[styles.required, { color: nc.errorText }]}>*</Text>
              </Text>
              <View style={dynamicStyles.inputContainer}>
                <FontAwesome name="user" size={16} color={nc.textLight} />
                <TextInput
                  style={dynamicStyles.input}
                  placeholder="Ex: Marie Dubois"
                  placeholderTextColor={nc.textMuted}
                  value={name}
                  onChangeText={setName}
                  editable={!isLoading}
                  autoCapitalize="words"
                  accessibilityLabel="Nom complet de l'enfant"
                  accessibilityRole="none"
                />
              </View>
            </View>

            {/* Date de naissance */}
            <View style={styles.formGroup}>
              <Text style={dynamicStyles.label}>
                Date de naissance <Text style={[styles.required, { color: nc.errorText }]}>*</Text>
              </Text>
              <DateTimePickerRow
                label="Né(e) le"
                value={birthDate}
                mode="date"
                colorScheme={colorScheme}
                disabled={isLoading}
                onChange={setBirthDate}
                minimumDate={minBirthDate}
                maximumDate={maxBirthDate}
                icon="calendar"
                accessibilityLabel="Modifier la date de naissance"
              />
            </View>

            {/* Sexe de l'enfant */}
            <View style={styles.formGroup}>
              <Text style={dynamicStyles.label}>
                Sexe <Text style={[styles.required, { color: nc.errorText }]}>*</Text>
              </Text>
              <GenderRadioGroup
                value={gender}
                onChange={handleGenderSelect}
                colorScheme={colorScheme}
                disabled={isLoading}
              />
            </View>

            {/* Allergies connues (facultatif, repliées par défaut) */}
            <View style={styles.formGroup}>
              <TouchableOpacity
                style={styles.allergiesToggle}
                onPress={() => setShowAllergies((v) => !v)}
                disabled={isLoading}
                accessibilityRole="button"
                accessibilityLabel="Allergies connues, facultatif"
                accessibilityState={{ expanded: showAllergies }}
              >
                <Text style={dynamicStyles.label}>
                  Allergies connues <Text style={{ color: nc.textLight, fontWeight: '400' }}>(facultatif)</Text>
                </Text>
                <FontAwesome name={showAllergies ? 'chevron-up' : 'chevron-down'} size={14} color={nc.textLight} />
              </TouchableOpacity>
              {showAllergies ? (
                <AllergiesEditor
                  value={allergies}
                  onChange={setAllergies}
                  colorScheme={colorScheme}
                  disabled={isLoading}
                />
              ) : allergies.length > 0 ? (
                <Text style={dynamicStyles.helperText}>{allergies.join(', ')}</Text>
              ) : null}
            </View>

            {/* Bouton d'ajout */}
            <TouchableOpacity
              style={[
                dynamicStyles.submitButton,
                isLoading && dynamicStyles.submitButtonDisabled,
              ]}
              onPress={handleAddBaby}
              disabled={isLoading}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel="Ajouter l'enfant"
              accessibilityState={{ disabled: isLoading }}
            >
              {isLoading ? (
                <ActivityIndicator size="small" color={nc.white} />
              ) : (
                <>
                  <FontAwesome name="plus-circle" size={18} color={nc.white} />
                  <Text style={dynamicStyles.submitButtonText}>Ajouter l&apos;enfant</Text>
                </>
              )}
            </TouchableOpacity>
          </View>

          {/* Information */}
          <View style={dynamicStyles.infoBox}>
            <FontAwesome name="info-circle" size={20} color={nc.todayAccent} />
            <Text style={dynamicStyles.infoText}>
              L&apos;enfant sera immédiatement ajouté à votre liste de suivi. Vous pourrez modifier ses informations plus tard depuis les paramètres.
            </Text>
          </View>
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
  },
  container: {
    flex: 1,
  },
  form: {
    paddingHorizontal: 20,
  },
  formGroup: {
    marginBottom: 24,
  },
  required: {
    // couleur appliquée en ligne : nc.errorText (≥ 4.5:1 dans les deux thèmes)
  },
  allergiesToggle: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    minHeight: 44,
  },
  genderContainer: {
    flexDirection: "row",
    gap: 12,
  },
  welcomeTitle: {
    fontSize: 24,
    fontWeight: "700",
    textAlign: "center",
  },
  stepIndicator: {
    marginTop: 12,
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 20,
  },
  stepText: {
    fontSize: 13,
    fontWeight: "600",
  },
});
