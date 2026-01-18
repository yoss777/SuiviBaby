// app/(auth)/login.tsx
import { InfoModal } from "@/components/ui/InfoModal";
import { Colors } from "@/constants/theme";
import { useAuth } from "@/contexts/AuthContext";
import { useBaby } from "@/contexts/BabyContext";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { createPatientUser } from "@/services/userService";
import FontAwesome from "@expo/vector-icons/FontAwesome6";
import { useRouter } from "expo-router";
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
} from "firebase/auth";
import { useEffect, useRef, useState } from "react";
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

export default function LoginScreen() {
  const colorScheme = useColorScheme() ?? "light";
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const {
    children,
    loading: babyLoading,
    childrenLoaded,
    setActiveChild,
  } = useBaby();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [userName, setUserName] = useState("");
  const [isLogin, setIsLogin] = useState(true);
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [confirmPassword, setConfirmPassword] = useState("");
  const [hasConsented, setHasConsented] = useState(false);
  const [showConsentError, setShowConsentError] = useState(false);
  const navigationLocked = useRef(false);
  const [infoModal, setInfoModal] = useState({
    visible: false,
    title: "",
    message: "",
  });

  const passwordRules = [
    {
      id: "length",
      label: "8+ caracteres",
      test: (value: string) => value.length >= 8,
    },
    {
      id: "number",
      label: "1 chiffre",
      test: (value: string) => /\d/.test(value),
    },
    {
      id: "special",
      label: "1 caractere special",
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

  const resetPasswordFields = () => {
    setPassword("");
    setConfirmPassword("");
    setShowPassword(false);
    setShowConfirmPassword(false);
  };

  const resetAllFields = () => {
    setEmail("");
    setUserName("");
    resetPasswordFields();
  };

  const showModal = (title: string, message: string) => {
    setInfoModal({ visible: true, title, message });
  };

  // Rediriger automatiquement si l'utilisateur est déjà authentifié
  useEffect(() => {
    if (
      authLoading ||
      !user ||
      babyLoading ||
      !childrenLoaded ||
      navigationLocked.current
    ) {
      return;
    }

    if (children.length === 1) {
      navigationLocked.current = true;
      setActiveChild(children[0]);
      router.replace("/(drawer)/baby");
      return;
    }

    if (navigationLocked.current) return;
    navigationLocked.current = true;
    router.replace("/explore");
  }, [
    authLoading,
    babyLoading,
    children,
    user,
    childrenLoaded,
    setActiveChild,
    router,
  ]);

  const handleAuth = async () => {
    if (!isLogin && !hasConsented) {
      setShowConsentError(true);
      // On réinitialise l'erreur après 2 secondes
      setTimeout(() => setShowConsentError(false), 2000);
      return;
    }

    if (!email.trim() || !password.trim()) {
      showModal("Erreur", "Veuillez remplir tous les champs");
      return;
    }

    // ✅ Validation pour le pseudo en mode inscription
    if (!isLogin && !userName.trim()) {
      showModal("Erreur", "Veuillez entrer votre pseudo");
      return;
    }

    if (!isLogin) {
      if (unmetRules.length > 0) {
        showModal(
          "Erreur",
          "Mot de passe trop faible. Utilisez 8+ caracteres, 1 chiffre, 1 caractere special."
        );
        return;
      }

      if (password !== confirmPassword) {
        showModal("Erreur", "Les mots de passe ne correspondent pas");
        return;
      }
    }

    setLoading(true);

    try {
      if (isLogin) {
        await signInWithEmailAndPassword(auth, email.trim(), password);
      } else {
        // ✅ Création du compte
        const userCredential = await createUserWithEmailAndPassword(
          auth,
          email.trim(),
          password
        );

        // ✅ Sauvegarde du profil patient complet dans Firestore
        const defaultUserName = email.trim().split("@")[0];
        await createPatientUser(
          userCredential.user.uid,
          email.trim(),
          userName.trim() || defaultUserName
        );

        resetAllFields();
        showModal("Succès", "Compte créé avec succès !");
      }
      // Une fois connecté, l'effet d'auth redirige vers l'écran principal
    } catch (error: any) {
      let errorMessage = "Une erreur est survenue";

      switch (error.code) {
        case "auth/invalid-email":
          errorMessage = "Adresse email invalide";
          break;
        case "auth/user-disabled":
          errorMessage = "Ce compte a été désactivé";
          break;
        case "auth/user-not-found":
          errorMessage = "Aucun compte trouvé avec cet email";
          break;
        case "auth/wrong-password":
          errorMessage = "Mot de passe incorrect";
          break;
        case "auth/email-already-in-use":
          errorMessage = "Cet email est déjà utilisé";
          break;
        case "auth/weak-password":
          errorMessage = "Le mot de passe est trop faible";
          break;
        case "auth/network-request-failed":
          errorMessage = "Erreur de connexion réseau";
          break;
        default:
          errorMessage = error.message;
      }

      showModal("Erreur", errorMessage);
      console.log("Erreur", errorMessage);
    } finally {
      setLoading(false);
    }
  };

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
        onClose={() => setInfoModal({ visible: false, title: "", message: "" })}
      />
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Header avec icône */}
        <View style={styles.header}>
          <View style={styles.iconContainer}>
            <FontAwesome name="baby-carriage" size={40} color="#4A90E2" />
          </View>
          <Text style={styles.title}>
            {isLogin ? "Bienvenue" : "Créer un compte"}
          </Text>
          <Text style={styles.subtitle}>
            {isLogin
              ? "Connectez-vous pour suivre le quotidien de votre bébé"
              : "Commencez à suivre le quotidien de votre bébé"}
          </Text>
        </View>

        {/* Formulaire */}
        <View style={styles.formContainer}>
          {/* Champ Email */}
          <View style={styles.inputContainer}>
            <View style={styles.inputIconContainer}>
              <FontAwesome name="envelope" size={20} color="#6c757d" />
            </View>
            <TextInput
              style={styles.input}
              placeholder="Adresse email"
              placeholderTextColor="#adb5bd"
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              autoComplete="email"
              editable={!loading}
            />
          </View>

          {/* ✅ Champ Pseudo (seulement en mode inscription) */}
          {!isLogin && (
            <View style={styles.inputContainer}>
              <View style={styles.inputIconContainer}>
                <FontAwesome name="user" size={20} color="#6c757d" />
              </View>
              <TextInput
                style={styles.input}
                placeholder="Pseudo"
                placeholderTextColor="#adb5bd"
                value={userName}
                onChangeText={setUserName}
                autoCapitalize="words"
                editable={!loading}
              />
            </View>
          )}

          {/* Champ Mot de passe */}
          <View style={styles.inputContainer}>
            <View style={styles.inputIconContainer}>
              <FontAwesome name="lock" size={20} color="#6c757d" />
            </View>
            <TextInput
              style={styles.input}
              placeholder="Mot de passe"
              placeholderTextColor="#adb5bd"
              value={password}
              onChangeText={setPassword}
              secureTextEntry={!showPassword}
              autoCapitalize="none"
              autoComplete="password"
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

          {!isLogin && password.length > 0 && (
            <>
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
            </>
          )}

          {!isLogin && (
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
                autoComplete="password"
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
          )}

          {/* Bouton principal */}
          <TouchableOpacity
            // style={[
            //   styles.mainButton,
            //   (loading || (!isLogin && !hasConsented)) &&
            //     styles.mainButtonDisabled,
            // ]}
            // onPress={handleAuth}
            // disabled={loading || (!isLogin && !hasConsented)}

            style={[
              styles.mainButton,
              loading && styles.mainButtonDisabled,
              !isLogin &&
                !hasConsented &&
                showConsentError && { backgroundColor: "#d32f2f" }, // Rouge en cas d'oubli
            ]}
            onPress={handleAuth}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="white" />
            ) : (
              <>
                <Text style={styles.mainButtonText}>
                  {isLogin ? "Se connecter" : "Créer mon compte"}
                </Text>
                <FontAwesome name="arrow-right" size={20} color="white" />
              </>
            )}
          </TouchableOpacity>

          {/* ✅ Consentement aux conditions et politique de confidentialité */}
          {!isLogin && (
            <View
              style={[
                {
                  alignItems: "center",
                  flexDirection: "row",
                  flexWrap: "wrap",
                  justifyContent: "center",
                },
                styles.legalContainer,
                showConsentError && styles.legalErrorBorder, // Ajout d'une bordure ou d'un fond léger
              ]}
            >
              <TouchableOpacity
                onPress={() => {
                  setHasConsented(!hasConsented);
                  setShowConsentError(false);
                }}
                style={{ marginRight: 8 }}
              >
                <FontAwesome
                  name={hasConsented ? "check-square" : "square"}
                  size={20}
                  color={showConsentError ? "#d32f2f" : "#4A90E2"}
                />
              </TouchableOpacity>
              <Text
                style={[
                  styles.legalText,
                  showConsentError && { color: "#d32f2f", fontWeight: "bold" },
                ]}
              >
                J'accepte{" "}
              </Text>
              <TouchableOpacity onPress={() => router.push("/(auth)/terms")}>
                <Text
                  style={[
                    styles.legalLink,
                    showConsentError && {
                      color: "#d32f2f",
                      fontWeight: "bold",
                    },
                  ]}
                >
                  les conditions
                </Text>
              </TouchableOpacity>
              <Text
                style={[
                  styles.legalText,
                  showConsentError && { color: "#d32f2f", fontWeight: "bold" },
                ]}
              >
                {" "}
                et{" "}
              </Text>
              <TouchableOpacity
                onPress={() => router.push("/(auth)/privacy")}
                disabled={loading}
              >
                <Text
                  style={[
                    styles.legalLink,
                    showConsentError && {
                      color: "#d32f2f",
                      fontWeight: "bold",
                    },
                  ]}
                >
                  la politique de confidentialite
                </Text>
              </TouchableOpacity>
              <Text style={styles.legalText}>.</Text>
            </View>
          )}

          {/* Lien pour basculer entre connexion et inscription */}
          <View style={styles.switchContainer}>
            <Text style={styles.switchText}>
              {isLogin ? "Pas encore de compte ?" : "Déjà un compte ?"}
            </Text>
            <TouchableOpacity
              onPress={() => {
                setIsLogin(!isLogin);
                resetAllFields();
              }}
              disabled={loading}
            >
              <Text style={styles.switchLink}>
                {isLogin ? "Créer un compte" : "Se connecter"}
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Footer */}
        <View style={styles.footer}>
          <FontAwesome name="shield-halved" size={16} color="#6c757d" />
          <Text style={styles.footerText}>
            Vos données sont sécurisées et privées
          </Text>
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
    fontSize: 32,
    fontWeight: "700",
    color: "#212529",
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
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
  switchContainer: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 8,
    marginTop: 8,
  },
  switchText: {
    fontSize: 15,
    color: "#6c757d",
  },
  switchLink: {
    fontSize: 15,
    color: "#4A90E2",
    fontWeight: "600",
  },
  footer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginTop: 40,
  },
  footerText: {
    fontSize: 13,
    color: "#6c757d",
  },
  legalContainer: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    marginTop: 16,
    paddingHorizontal: 12,
  },
  legalText: {
    fontSize: 12,
    color: "#6c757d",
  },
  legalLink: {
    fontSize: 12,
    color: "#4A90E2",
    fontWeight: "600",
  },
  legalErrorBorder: {
    backgroundColor: "#ffebee", // Fond rouge très léger
    padding: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#d32f2f",
  },
});
