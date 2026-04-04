import { ThemedView } from '@/components/themed-view';
import { db } from '@/config/firebase';
import { getNeutralColors } from '@/constants/dashboardColors';
import { Colors } from '@/constants/theme';
import { useAuth } from '@/contexts/AuthContext';
import { useModal } from '@/contexts/ModalContext';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { trackOnboardingEvent } from "@/services/onboardingAnalytics";
import FontAwesome from "@expo/vector-icons/FontAwesome5";
import * as Haptics from "expo-haptics";
import { router, useLocalSearchParams } from "expo-router";
import { addDoc, collection } from 'firebase/firestore';
import { createOwnerAccess } from '@/utils/permissions';
import { useCallback, useMemo, useRef, useState } from "react";
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

// Semantic accent colors for gender selection
const GENDER_COLORS = {
  female: '#FF69B4',
  male: '#4A90E2',
} as const;

export default function AddBabyScreen() {
  const colorScheme = useColorScheme() ?? "light";
  const nc = getNeutralColors(colorScheme);
  const tint = Colors[colorScheme].tint;
  const { user } = useAuth();
  const { showAlert } = useModal();
  const { firstRun } = useLocalSearchParams<{ firstRun?: string }>();
  const isFirstRun = firstRun === "true";
  const [name, setName] = useState("");
  const [birthDate, setBirthDate] = useState("");
  const [gender, setGender] = useState<'male' | 'female' | ''>('');
  const [isLoading, setIsLoading] = useState(false);
  const isMountedRef = useRef(true);

  // Cleanup on unmount
  useMemo(() => {
    isMountedRef.current = true;
    return () => { isMountedRef.current = false; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  // Formater la date pendant la saisie (DD/MM/YYYY)
  const handleDateChange = useCallback((text: string) => {
    // Supprimer tout sauf les chiffres
    const cleaned = text.replace(/\D/g, '');

    // Ajouter les slashes automatiquement
    let formatted = cleaned;
    if (cleaned.length >= 2) {
      formatted = cleaned.slice(0, 2) + '/' + cleaned.slice(2);
    }
    if (cleaned.length >= 4) {
      formatted = cleaned.slice(0, 2) + '/' + cleaned.slice(2, 4) + '/' + cleaned.slice(4, 8);
    }

    setBirthDate(formatted);
  }, []);

  // Valider la date
  const isValidDate = useCallback((dateStr: string): boolean => {
    if (dateStr.length !== 10) return false;

    const [day, month, year] = dateStr.split('/').map(Number);
    if (!day || !month || !year) return false;

    // Vérifier les plages valides
    if (day < 1 || day > 31) return false;
    if (month < 1 || month > 12) return false;
    if (year < 1900 || year > new Date().getFullYear()) return false;

    // Vérifier que la date existe
    const date = new Date(year, month - 1, day);
    return date.getDate() === day && date.getMonth() === month - 1;
  }, []);

  // Valider le formulaire
  const validateForm = useCallback((): boolean => {
    if (!name.trim()) {
      showAlert('Erreur', 'Veuillez saisir le nom de l\'enfant');
      return false;
    }

    if (!isValidDate(birthDate)) {
      showAlert('Erreur', 'Veuillez saisir une date de naissance valide (JJ/MM/AAAA)');
      return false;
    }

    if (!gender) {
      showAlert('Erreur', 'Veuillez sélectionner le sexe de l\'enfant');
      return false;
    }

    return true;
  }, [name, birthDate, gender, isValidDate, showAlert]);

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
        birthDate: birthDate,
        gender: gender,
        ownerId: user.uid,
        parentIds: [user.uid],
        parentEmails: parentEmail ? [parentEmail] : [],
        photoUri: "",
      };

      const childRef = await addDoc(collection(db, 'children'), childData);
      await createOwnerAccess(childRef.id, user.uid);

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
      setBirthDate('');
      setGender('');
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
  }, [validateForm, user, name, birthDate, gender, showAlert]);

  return (
    <ThemedView style={styles.screen}>
      <SafeAreaView style={styles.safeArea} edges={['bottom']}>
        <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
          <View style={dynamicStyles.header}>
            <FontAwesome name="baby" size={48} color={tint} />
            {isFirstRun ? (
              <>
                <Text style={[styles.welcomeTitle, { color: nc.textStrong, marginTop: 16 }]}>
                  Felicitations !
                </Text>
                <Text style={[dynamicStyles.subtitle, { marginTop: 8 }]}>
                  Votre compte est cree. Commencez par ajouter votre bebe pour demarrer le suivi.
                </Text>
                <View style={[styles.stepIndicator, { backgroundColor: tint + '15' }]}>
                  <Text style={[styles.stepText, { color: tint }]}>Etape 1/2 — Ajouter votre bebe</Text>
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
                Nom complet <Text style={styles.required}>*</Text>
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
                Date de naissance <Text style={styles.required}>*</Text>
              </Text>
              <View style={dynamicStyles.inputContainer}>
                <FontAwesome name="calendar" size={16} color={nc.textLight} />
                <TextInput
                  style={dynamicStyles.input}
                  placeholder="JJ/MM/AAAA"
                  placeholderTextColor={nc.textMuted}
                  value={birthDate}
                  onChangeText={handleDateChange}
                  editable={!isLoading}
                  keyboardType="numeric"
                  maxLength={10}
                  accessibilityLabel="Date de naissance au format jour mois année"
                  accessibilityRole="none"
                />
              </View>
              <Text style={dynamicStyles.helperText}>
                Format: jour/mois/année (ex: 15/03/2024)
              </Text>
            </View>

            {/* Sexe de l'enfant */}
            <View style={styles.formGroup}>
              <Text style={dynamicStyles.label}>
                Sexe <Text style={styles.required}>*</Text>
              </Text>
              <View style={styles.genderContainer}>
                <TouchableOpacity
                  style={[
                    dynamicStyles.genderButton,
                    gender === 'female' && { borderColor: GENDER_COLORS.female, backgroundColor: GENDER_COLORS.female },
                  ]}
                  onPress={() => handleGenderSelect('female')}
                  disabled={isLoading}
                  activeOpacity={0.7}
                  accessibilityRole="button"
                  accessibilityLabel="Sélectionner Fille"
                  accessibilityState={{ selected: gender === 'female' }}
                >
                  <FontAwesome
                    name="venus"
                    size={24}
                    color={gender === 'female' ? nc.white : GENDER_COLORS.female}
                  />
                  <Text
                    style={[
                      dynamicStyles.genderText,
                      gender === 'female' && { color: nc.white },
                    ]}
                  >
                    Fille
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[
                    dynamicStyles.genderButton,
                    gender === 'male' && { borderColor: GENDER_COLORS.male, backgroundColor: GENDER_COLORS.male },
                  ]}
                  onPress={() => handleGenderSelect('male')}
                  disabled={isLoading}
                  activeOpacity={0.7}
                  accessibilityRole="button"
                  accessibilityLabel="Sélectionner Garçon"
                  accessibilityState={{ selected: gender === 'male' }}
                >
                  <FontAwesome
                    name="mars"
                    size={24}
                    color={gender === 'male' ? nc.white : GENDER_COLORS.male}
                  />
                  <Text
                    style={[
                      dynamicStyles.genderText,
                      gender === 'male' && { color: nc.white },
                    ]}
                  >
                    Garçon
                  </Text>
                </TouchableOpacity>
              </View>
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
                  <Text style={dynamicStyles.submitButtonText}>Ajouter l'enfant</Text>
                </>
              )}
            </TouchableOpacity>
          </View>

          {/* Information */}
          <View style={dynamicStyles.infoBox}>
            <FontAwesome name="info-circle" size={20} color={nc.todayAccent} />
            <Text style={dynamicStyles.infoText}>
              L'enfant sera immédiatement ajouté à votre liste de suivi. Vous pourrez modifier ses informations plus tard depuis les paramètres.
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
    color: "#ef4444",
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
