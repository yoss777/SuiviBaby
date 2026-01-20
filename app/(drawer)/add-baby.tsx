import { ThemedView } from '@/components/themed-view';
import { db } from '@/config/firebase';
import { Colors } from '@/constants/theme';
import { useAuth } from '@/contexts/AuthContext';
import { useModal } from '@/contexts/ModalContext';
import { useColorScheme } from '@/hooks/use-color-scheme';
import FontAwesome from "@expo/vector-icons/FontAwesome5";
import { router } from "expo-router";
import { addDoc, collection } from 'firebase/firestore';
import { useState } from "react";
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
  const colorScheme = useColorScheme();
  const { user } = useAuth();
  const { showAlert } = useModal();
  const [name, setName] = useState("");
  const [birthDate, setBirthDate] = useState("");
  const [gender, setGender] = useState<'male' | 'female' | ''>('');
  const [isLoading, setIsLoading] = useState(false);

  // Formater la date pendant la saisie (DD/MM/YYYY)
  const handleDateChange = (text: string) => {
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
  };

  // Valider la date
  const isValidDate = (dateStr: string): boolean => {
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
  };

  // Valider le formulaire
  const validateForm = (): boolean => {
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
  };

  // Ajouter l'enfant
  const handleAddBaby = async () => {
    if (!validateForm()) return;
    if (!user?.uid) {
      showAlert('Erreur', 'Utilisateur non connecté');
      return;
    }

    setIsLoading(true);

    try {
      const childData = {
        name: name.trim(),
        birthDate: birthDate,
        gender: gender,
        parentIds: [user.uid],
        photoUri: "",
      };

      await addDoc(collection(db, 'children'), childData);

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

      // Réinitialiser le formulaire
      setName('');
      setBirthDate('');
      setGender('');
    } catch (error) {
      console.error('Erreur lors de l\'ajout de l\'enfant:', error);
      showAlert('Erreur', 'Impossible d\'ajouter l\'enfant. Veuillez réessayer.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <ThemedView style={styles.screen}>
      <SafeAreaView style={[styles.safeArea, { backgroundColor: Colors[colorScheme].background }]} edges={['bottom']}>
        <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
          <View style={styles.header}>
            <FontAwesome name="baby" size={48} color="#4A90E2" />
            {/* <Text style={styles.title}>Ajouter un enfant</Text> */}
            <Text style={[styles.subtitle,{ marginTop: 20, }]}>
              Renseignez les informations de votre enfant
            </Text>
          </View>

          {/* Formulaire */}
          <View style={styles.form}>
            {/* Nom de l'enfant */}
            <View style={styles.formGroup}>
              <Text style={styles.label}>
                Nom complet <Text style={styles.required}>*</Text>
              </Text>
              <View style={styles.inputContainer}>
                <FontAwesome name="user" size={16} color="#666" />
                <TextInput
                  style={styles.input}
                  placeholder="Ex: Marie Dubois"
                  value={name}
                  onChangeText={setName}
                  editable={!isLoading}
                  autoCapitalize="words"
                />
              </View>
            </View>

            {/* Date de naissance */}
            <View style={styles.formGroup}>
              <Text style={styles.label}>
                Date de naissance <Text style={styles.required}>*</Text>
              </Text>
              <View style={styles.inputContainer}>
                <FontAwesome name="calendar" size={16} color="#666" />
                <TextInput
                  style={styles.input}
                  placeholder="JJ/MM/AAAA"
                  value={birthDate}
                  onChangeText={handleDateChange}
                  editable={!isLoading}
                  keyboardType="numeric"
                  maxLength={10}
                />
              </View>
              <Text style={styles.helperText}>
                Format: jour/mois/année (ex: 15/03/2024)
              </Text>
            </View>

            {/* Sexe de l'enfant */}
            <View style={styles.formGroup}>
              <Text style={styles.label}>
                Sexe <Text style={styles.required}>*</Text>
              </Text>
              <View style={styles.genderContainer}>
                <TouchableOpacity
                  style={[
                    styles.genderButton,
                    gender === 'female' && styles.genderButtonSelected,
                  ]}
                  onPress={() => setGender('female')}
                  disabled={isLoading}
                  activeOpacity={0.7}
                >
                  <FontAwesome
                    name="venus"
                    size={24}
                    color={gender === 'female' ? '#fff' : '#FF69B4'}
                  />
                  <Text
                    style={[
                      styles.genderText,
                      gender === 'female' && styles.genderTextSelected,
                    ]}
                  >
                    Fille
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[
                    styles.genderButton,
                    gender === 'male' && styles.genderButtonSelected,
                  ]}
                  onPress={() => setGender('male')}
                  disabled={isLoading}
                  activeOpacity={0.7}
                >
                  <FontAwesome
                    name="mars"
                    size={24}
                    color={gender === 'male' ? '#fff' : '#4A90E2'}
                  />
                  <Text
                    style={[
                      styles.genderText,
                      gender === 'male' && styles.genderTextSelected,
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
                styles.submitButton,
                isLoading && styles.submitButtonDisabled,
              ]}
              onPress={handleAddBaby}
              disabled={isLoading}
              activeOpacity={0.7}
            >
              {isLoading ? (
                <ActivityIndicator size="small" color="white" />
              ) : (
                <>
                  <FontAwesome name="plus-circle" size={18} color="white" />
                  <Text style={styles.submitButtonText}>Ajouter l'enfant</Text>
                </>
              )}
            </TouchableOpacity>
          </View>

          {/* Information */}
          <View style={styles.infoBox}>
            <FontAwesome name="info-circle" size={20} color="#17a2b8" />
            <Text style={styles.infoText}>
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
  header: {
    alignItems: "center",
    padding: 32,
    paddingTop: 48,
    backgroundColor: "white",
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
    marginBottom: 24,
  },
  title: {
    fontSize: 28,
    fontWeight: "700",
    color: "#212529",
    marginTop: 16,
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 15,
    color: "#6c757d",
    textAlign: "center",
    paddingHorizontal: 16,
    lineHeight: 22,
  },
  form: {
    paddingHorizontal: 20,
  },
  formGroup: {
    marginBottom: 24,
  },
  label: {
    fontSize: 16,
    fontWeight: "600",
    color: "#333",
    marginBottom: 8,
  },
  required: {
    color: "#dc3545",
  },
  inputContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "white",
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderWidth: 1,
    borderColor: "#e9ecef",
    gap: 12,
  },
  input: {
    flex: 1,
    fontSize: 16,
    color: "#333",
  },
  helperText: {
    fontSize: 13,
    color: "#6c757d",
    marginTop: 6,
    fontStyle: "italic",
  },
  genderContainer: {
    flexDirection: "row",
    gap: 12,
  },
  genderButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 16,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: "#e9ecef",
    backgroundColor: "white",
    gap: 8,
  },
  genderButtonSelected: {
    borderColor: "#4A90E2",
    backgroundColor: "#4A90E2",
  },
  genderText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#333",
  },
  genderTextSelected: {
    color: "white",
  },
  submitButton: {
    backgroundColor: "#28a745",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 16,
    paddingHorizontal: 24,
    borderRadius: 12,
    gap: 12,
    marginTop: 8,
    shadowColor: "#28a745",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 5,
  },
  submitButtonDisabled: {
    backgroundColor: "#ccc",
    shadowOpacity: 0,
  },
  submitButtonText: {
    color: "white",
    fontSize: 18,
    fontWeight: "600",
  },
  infoBox: {
    flexDirection: "row",
    backgroundColor: "#d1ecf1",
    padding: 16,
    marginHorizontal: 20,
    marginTop: 24,
    marginBottom: 32,
    borderRadius: 12,
    gap: 12,
    borderLeftWidth: 4,
    borderLeftColor: "#17a2b8",
  },
  infoText: {
    flex: 1,
    fontSize: 14,
    color: "#0c5460",
    lineHeight: 20,
  },
});
