// app/(auth)/login.tsx
import FontAwesome from "@expo/vector-icons/FontAwesome6";
import { createUserWithEmailAndPassword, signInWithEmailAndPassword } from "firebase/auth";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
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
import { useAuth } from "@/contexts/AuthContext";
import { createPatientUser } from "@/services/userService";

export default function LoginScreen() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [babyName, setBabyName] = useState(""); // ✅ État pour le nom du bébé
  const [isLogin, setIsLogin] = useState(true);
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  // Rediriger automatiquement si l'utilisateur est déjà authentifié
  useEffect(() => {
    if (!authLoading && user) {
      router.replace("/explore");
    }
  }, [authLoading, user, router]);

  const handleAuth = async () => {
    if (!email.trim() || !password.trim()) {
      Alert.alert("Erreur", "Veuillez remplir tous les champs");
      return;
    }

    // ✅ Validation pour le nom du bébé en mode inscription
    if (!isLogin && !babyName.trim()) {
      Alert.alert("Erreur", "Veuillez entrer le nom du bébé");
      return;
    }

    if (password.length < 6) {
      Alert.alert("Erreur", "Le mot de passe doit contenir au moins 6 caractères");
      return;
    }

    setLoading(true);

    try {
      if (isLogin) {
        await signInWithEmailAndPassword(auth, email.trim(), password);
      } else {
        // ✅ Création du compte
        const userCredential = await createUserWithEmailAndPassword(auth, email.trim(), password);

        // ✅ Sauvegarde du profil patient complet dans Firestore
        const defaultUserName = email.trim().split("@")[0];
        await createPatientUser(
          userCredential.user.uid,
          email.trim(),
          defaultUserName,
          babyName.trim()
        );

        Alert.alert("Succès", "Compte créé avec succès !");
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
      
      Alert.alert("Erreur", errorMessage);
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
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Header avec icône */}
        <View style={styles.header}>
          <View style={styles.iconContainer}>
            <FontAwesome name="baby-carriage" size={48} color="#4A90E2" />
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

          {/* ✅ Champ Nom du bébé (seulement en mode inscription) */}
          {!isLogin && (
            <View style={styles.inputContainer}>
              <View style={styles.inputIconContainer}>
                <FontAwesome name="baby" size={20} color="#6c757d" />
              </View>
              <TextInput
                style={styles.input}
                placeholder="Nom du bébé"
                placeholderTextColor="#adb5bd"
                value={babyName}
                onChangeText={setBabyName}
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

          {/* Bouton principal */}
          <TouchableOpacity
            style={[styles.mainButton, loading && styles.mainButtonDisabled]}
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

          {/* Lien pour basculer entre connexion et inscription */}
          <View style={styles.switchContainer}>
            <Text style={styles.switchText}>
              {isLogin ? "Pas encore de compte ?" : "Déjà un compte ?"}
            </Text>
            <TouchableOpacity
              onPress={() => setIsLogin(!isLogin)}
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
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 5,
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
});
