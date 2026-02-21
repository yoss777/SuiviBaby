// app/(auth)/reset-password.tsx
import { InfoModal } from "@/components/ui/InfoModal";
import { Colors } from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";
import FontAwesome from "@expo/vector-icons/FontAwesome6";
import { useLocalSearchParams, useRouter } from "expo-router";
import { confirmPasswordReset, verifyPasswordResetCode } from "firebase/auth";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { auth } from "../../config/firebase";

export default function ResetPasswordScreen() {
  const colorScheme = useColorScheme() ?? "light";
  const router = useRouter();
  const { oobCode } = useLocalSearchParams<{ oobCode: string }>();

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [verifying, setVerifying] = useState(true);
  const [email, setEmail] = useState("");
  const [invalidCode, setInvalidCode] = useState(false);
  const [infoModal, setInfoModal] = useState({
    visible: false,
    title: "",
    message: "",
  });

  const passwordRules = [
    {
      id: "length",
      label: "8+ caractères",
      test: (value: string) => value.length >= 8,
    },
    {
      id: "number",
      label: "1 chiffre",
      test: (value: string) => /\d/.test(value),
    },
    {
      id: "special",
      label: "1 caractère spécial",
      test: (value: string) => /[^A-Za-z0-9]/.test(value),
    },
  ];
  const unmetRules = passwordRules.filter((rule) => !rule.test(password));
  const strengthScore = passwordRules.length - unmetRules.length;
  const strengthPercent = Math.round(
    (strengthScore / passwordRules.length) * 100
  );
  const strengthLabel =
    strengthScore === 3 ? "Fort" : strengthScore === 2 ? "Moyen" : "Faible";

  const showModal = (title: string, message: string) => {
    setInfoModal({ visible: true, title, message });
  };

  // Vérifier que le code est valide au chargement
  useEffect(() => {
    const verifyCode = async () => {
      if (!oobCode) {
        setInvalidCode(true);
        setVerifying(false);
        return;
      }
      try {
        const userEmail = await verifyPasswordResetCode(auth, oobCode);
        setEmail(userEmail);
      } catch {
        setInvalidCode(true);
      } finally {
        setVerifying(false);
      }
    };
    verifyCode();
  }, [oobCode]);

  const handleResetPassword = async () => {
    if (unmetRules.length > 0) {
      showModal(
        "Erreur",
        "Mot de passe trop faible. Utilisez 8+ caractères, 1 chiffre, 1 caractère spécial."
      );
      return;
    }

    if (password !== confirmPassword) {
      showModal("Erreur", "Les mots de passe ne correspondent pas.");
      return;
    }

    setLoading(true);
    try {
      await confirmPasswordReset(auth, oobCode!, password);
      showModal(
        "Mot de passe modifié",
        "Votre mot de passe a été réinitialisé avec succès. Vous pouvez maintenant vous connecter."
      );
    } catch (error: any) {
      let errorMessage = "Une erreur est survenue";
      switch (error.code) {
        case "auth/expired-action-code":
          errorMessage =
            "Ce lien a expiré. Veuillez refaire une demande de réinitialisation.";
          break;
        case "auth/invalid-action-code":
          errorMessage =
            "Ce lien est invalide ou a déjà été utilisé.";
          break;
        case "auth/weak-password":
          errorMessage = "Le mot de passe est trop faible.";
          break;
        default:
          errorMessage = error.message;
      }
      showModal("Erreur", errorMessage);
    } finally {
      setLoading(false);
    }
  };

  if (verifying) {
    return (
      <View style={[styles.container, styles.centered]}>
        <ActivityIndicator size="large" color="#4A90E2" />
        <Text style={styles.verifyingText}>Vérification du lien...</Text>
      </View>
    );
  }

  if (invalidCode) {
    return (
      <View style={[styles.container, styles.centered]}>
        <InfoModal
          visible={infoModal.visible}
          title={infoModal.title}
          message={infoModal.message}
          backgroundColor={Colors[colorScheme].background}
          textColor={Colors[colorScheme].text}
          onClose={() =>
            setInfoModal({ visible: false, title: "", message: "" })
          }
        />
        <View style={styles.errorContainer}>
          <FontAwesome name="circle-xmark" size={60} color="#dc3545" />
          <Text style={styles.errorTitle}>Lien invalide</Text>
          <Text style={styles.errorMessage}>
            Ce lien de réinitialisation est invalide ou a expiré. Veuillez
            refaire une demande depuis l'écran de connexion.
          </Text>
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => router.replace("/(auth)/login")}
          >
            <FontAwesome name="arrow-left" size={16} color="white" />
            <Text style={styles.backButtonText}>Retour à la connexion</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      style={styles.container}
    >
      <InfoModal
        visible={infoModal.visible}
        title={infoModal.title}
        message={infoModal.message}
        backgroundColor={Colors[colorScheme].background}
        textColor={Colors[colorScheme].text}
        onClose={() => {
          setInfoModal({ visible: false, title: "", message: "" });
          // Rediriger vers login après succès
          if (infoModal.title === "Mot de passe modifié") {
            router.replace("/(auth)/login");
          }
        }}
      />
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.iconContainer}>
            <FontAwesome name="key" size={36} color="#4A90E2" />
          </View>
          <Text style={styles.title}>Nouveau mot de passe</Text>
          <Text style={styles.subtitle}>
            Choisissez un nouveau mot de passe pour {email}
          </Text>
        </View>

        {/* Formulaire */}
        <View style={styles.formContainer}>
          {/* Nouveau mot de passe */}
          <View style={styles.inputContainer}>
            <View style={styles.inputIconContainer}>
              <FontAwesome name="lock" size={20} color="#6c757d" />
            </View>
            <TextInput
              style={styles.input}
              placeholder="Nouveau mot de passe"
              placeholderTextColor="#adb5bd"
              value={password}
              onChangeText={setPassword}
              secureTextEntry={!showPassword}
              autoCapitalize="none"
              editable={!loading}
            />
            <TouchableOpacity
              style={styles.eyeIcon}
              onPress={() => setShowPassword(!showPassword)}
              disabled={loading}
            >
              <FontAwesome
                name={showPassword ? "eye" : "eye-slash"}
                size={20}
                color="#6c757d"
              />
            </TouchableOpacity>
          </View>

          {/* Barre de force */}
          {password.length > 0 && (
            <View style={styles.strengthRow}>
              <View style={styles.strengthBarTrack}>
                <View
                  style={[
                    styles.strengthBarFill,
                    { width: `${strengthPercent}%` },
                  ]}
                />
              </View>
              <Text style={styles.strengthLabel}>Force: {strengthLabel}</Text>
            </View>
          )}

          {/* Confirmer mot de passe */}
          <View style={styles.inputContainer}>
            <View style={styles.inputIconContainer}>
              <FontAwesome name="lock" size={20} color="#6c757d" />
            </View>
            <TextInput
              style={styles.input}
              placeholder="Confirmer le mot de passe"
              placeholderTextColor="#adb5bd"
              value={confirmPassword}
              onChangeText={setConfirmPassword}
              secureTextEntry={!showConfirmPassword}
              autoCapitalize="none"
              editable={!loading}
            />
            <TouchableOpacity
              style={styles.eyeIcon}
              onPress={() => setShowConfirmPassword(!showConfirmPassword)}
              disabled={loading}
            >
              <FontAwesome
                name={showConfirmPassword ? "eye" : "eye-slash"}
                size={20}
                color="#6c757d"
              />
            </TouchableOpacity>
          </View>

          {/* Bouton valider */}
          <TouchableOpacity
            style={[styles.mainButton, loading && styles.mainButtonDisabled]}
            onPress={handleResetPassword}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="white" />
            ) : (
              <>
                <Text style={styles.mainButtonText}>
                  Réinitialiser le mot de passe
                </Text>
                <FontAwesome name="check" size={20} color="white" />
              </>
            )}
          </TouchableOpacity>

          {/* Retour connexion */}
          <TouchableOpacity
            style={styles.linkContainer}
            onPress={() => router.replace("/(auth)/login")}
            disabled={loading}
          >
            <FontAwesome name="arrow-left" size={14} color="#4A90E2" />
            <Text style={styles.linkText}>Retour à la connexion</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f8f9fa",
  },
  centered: {
    justifyContent: "center",
    alignItems: "center",
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: "center",
    padding: 20,
  },
  header: {
    alignItems: "center",
    marginBottom: 40,
  },
  iconContainer: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: "white",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 24,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 3,
  },
  title: {
    fontSize: 28,
    fontWeight: "700",
    color: "#212529",
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 15,
    color: "#6c757d",
    textAlign: "center",
    paddingHorizontal: 20,
  },
  formContainer: {
    gap: 16,
  },
  inputContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "white",
    borderRadius: 12,
    paddingHorizontal: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  inputIconContainer: {
    marginRight: 12,
  },
  input: {
    flex: 1,
    height: 56,
    fontSize: 16,
    color: "#212529",
  },
  eyeIcon: {
    padding: 8,
  },
  strengthRow: {
    gap: 6,
  },
  strengthBarTrack: {
    height: 8,
    borderRadius: 4,
    backgroundColor: "#e9ecef",
    overflow: "hidden",
  },
  strengthBarFill: {
    height: "100%",
    backgroundColor: "#4A90E2",
  },
  strengthLabel: {
    fontSize: 12,
    color: "#6c757d",
  },
  mainButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#4A90E2",
    height: 56,
    borderRadius: 12,
    marginTop: 8,
    gap: 12,
    shadowColor: "#4A90E2",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 5,
  },
  mainButtonDisabled: {
    opacity: 0.6,
  },
  mainButtonText: {
    color: "white",
    fontSize: 18,
    fontWeight: "600",
  },
  linkContainer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginTop: 8,
  },
  linkText: {
    fontSize: 15,
    color: "#4A90E2",
    fontWeight: "600",
  },
  verifyingText: {
    marginTop: 16,
    fontSize: 16,
    color: "#6c757d",
  },
  errorContainer: {
    alignItems: "center",
    paddingHorizontal: 32,
    gap: 16,
  },
  errorTitle: {
    fontSize: 24,
    fontWeight: "700",
    color: "#212529",
  },
  errorMessage: {
    fontSize: 15,
    color: "#6c757d",
    textAlign: "center",
    lineHeight: 22,
  },
  backButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#4A90E2",
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 12,
    gap: 10,
    marginTop: 8,
  },
  backButtonText: {
    color: "white",
    fontSize: 16,
    fontWeight: "600",
  },
});
