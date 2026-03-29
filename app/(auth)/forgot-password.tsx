// app/(auth)/forgot-password.tsx
// Dedicated forgot-password screen — same visual language as login.tsx

import { getNeutralColors } from "@/constants/dashboardColors";
import { useColorScheme } from "@/hooks/use-color-scheme";
import FontAwesome from "@expo/vector-icons/FontAwesome6";
import * as Haptics from "expo-haptics";
import { useLocalSearchParams, useRouter } from "expo-router";
import { sendPasswordResetEmail } from "firebase/auth";
import { useCallback, useEffect, useRef, useState } from "react";
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
import { auth } from "@/config/firebase";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const COOLDOWN_SECONDS = 60;

export default function ForgotPasswordScreen() {
  const colorScheme = useColorScheme() ?? "light";
  const nc = getNeutralColors(colorScheme);
  const router = useRouter();
  const { email: emailParam } = useLocalSearchParams<{ email?: string }>();

  const [email, setEmail] = useState(emailParam ?? "");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");
  const [cooldown, setCooldown] = useState(0);
  const inputRef = useRef<TextInput>(null);

  // Cooldown timer
  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setInterval(() => {
      setCooldown((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [cooldown]);

  // Auto-focus email input if not pre-filled
  useEffect(() => {
    if (!emailParam) {
      setTimeout(() => inputRef.current?.focus(), 400);
    }
  }, [emailParam]);

  const handleSubmit = useCallback(async () => {
    const trimmed = email.trim();
    if (!trimmed) {
      setError("Entrez votre adresse email");
      return;
    }
    if (!EMAIL_REGEX.test(trimmed)) {
      setError("Adresse email invalide");
      return;
    }

    setLoading(true);
    setError("");

    try {
      await sendPasswordResetEmail(auth, trimmed, {
        url: "https://samaye-53723.firebaseapp.com/reset-password",
        handleCodeInApp: true,
        iOS: { bundleId: "com.tesfa.suivibaby" },
        android: { packageName: "com.tesfa.suivibaby", installApp: true },
      });
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setSent(true);
      setCooldown(COOLDOWN_SECONDS);
    } catch (err: any) {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);

      // Anti-enumeration: treat user-not-found as success
      if (err.code === "auth/user-not-found") {
        setSent(true);
        setCooldown(COOLDOWN_SECONDS);
        return;
      }

      if (err.code === "auth/too-many-requests") {
        setError("Trop de tentatives. Réessayez dans quelques minutes.");
        setCooldown(COOLDOWN_SECONDS);
      } else if (err.code === "auth/invalid-email") {
        setError("Adresse email invalide");
      } else {
        setError("Une erreur est survenue. Veuillez réessayer.");
      }
    } finally {
      setLoading(false);
    }
  }, [email]);

  const canSubmit = !loading && cooldown === 0;

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      style={[styles.container, { backgroundColor: nc.background }]}
    >
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
            {/* Header — same pattern as login.tsx */}
            <View style={styles.header}>
              <View style={[styles.iconContainer, { backgroundColor: nc.backgroundCard }]}>
                <FontAwesome
                  name={sent ? "circle-check" : "lock"}
                  size={40}
                  color={sent ? nc.success : nc.todayAccent}
                />
              </View>
              <Text style={[styles.title, { color: nc.textStrong }]}>
                {sent ? "Email envoyé" : "Mot de passe oublié ?"}
              </Text>
              <Text style={[styles.subtitle, { color: nc.textMuted }]}>
                {sent
                  ? `Un lien de réinitialisation a été envoyé à ${email.trim()}. Vérifiez votre boîte de réception et vos spams.`
                  : "Entrez votre adresse email pour recevoir un lien de réinitialisation."}
              </Text>
            </View>

            <View style={styles.formContainer}>
              {/* Success banner */}
              {sent && (
                <View
                  style={[
                    styles.successBanner,
                    { backgroundColor: nc.successBg, borderColor: nc.success },
                  ]}
                  accessibilityRole="alert"
                  accessibilityLabel="Email de réinitialisation envoyé avec succès"
                >
                  <FontAwesome name="check" size={14} color={nc.successText} />
                  <Text style={[styles.successText, { color: nc.successText }]}>
                    Email envoyé avec succès
                  </Text>
                </View>
              )}

              {/* Email input — same style as login.tsx */}
              <View style={[styles.inputContainer, { backgroundColor: nc.backgroundCard }]}>
                <View style={styles.inputIconContainer}>
                  <FontAwesome name="envelope" size={20} color={nc.textMuted} />
                </View>
                <TextInput
                  ref={inputRef}
                  style={[styles.input, { color: nc.textStrong }]}
                  placeholder="Adresse email"
                  placeholderTextColor={nc.textLight}
                  value={email}
                  onChangeText={(text) => {
                    setEmail(text);
                    if (error) setError("");
                  }}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                  autoComplete="email"
                  returnKeyType="send"
                  onSubmitEditing={canSubmit ? handleSubmit : undefined}
                  editable={!loading}
                  accessibilityLabel="Adresse email"
                  accessibilityHint="Entrez l'email associé à votre compte"
                />
              </View>

              {/* Error message */}
              {!!error && (
                <Text
                  style={[styles.errorText, { color: nc.error }]}
                  accessibilityRole="alert"
                  accessibilityLabel={error}
                >
                  {error}
                </Text>
              )}

              {/* Submit button — same style as login mainButton */}
              <TouchableOpacity
                style={[
                  styles.mainButton,
                  { backgroundColor: nc.todayAccent, shadowColor: nc.todayAccent },
                  !canSubmit && styles.mainButtonDisabled,
                ]}
                onPress={handleSubmit}
                disabled={!canSubmit}
                activeOpacity={0.8}
                accessibilityRole="button"
                accessibilityLabel={
                  cooldown > 0
                    ? `Renvoyer dans ${cooldown} secondes`
                    : sent
                      ? "Renvoyer l'email de réinitialisation"
                      : "Envoyer le lien de réinitialisation"
                }
                accessibilityHint="Envoie un email avec un lien pour créer un nouveau mot de passe"
                accessibilityState={{ disabled: !canSubmit }}
              >
                {loading ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Text style={styles.mainButtonText}>
                    {cooldown > 0
                      ? `Renvoyer dans ${cooldown}s`
                      : sent
                        ? "Renvoyer l'email"
                        : "Envoyer le lien"}
                  </Text>
                )}
              </TouchableOpacity>

              {/* Back to login */}
              <View style={styles.switchContainer}>
                <TouchableOpacity
                  onPress={() => router.back()}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  accessibilityRole="link"
                  accessibilityLabel="Retour à la connexion"
                >
                  <Text style={[styles.switchLink, { color: nc.todayAccent }]}>
                    Retour à la connexion
                  </Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* Footer — same as login */}
            <View style={styles.footer}>
              <FontAwesome name="shield-halved" size={16} color={nc.textMuted} />
              <Text style={[styles.footerText, { color: nc.textMuted }]}>
                Vos données sont sécurisées et privées
              </Text>
            </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

// Styles matching login.tsx visual language
const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: "center",
    paddingHorizontal: 20,
    paddingBottom: 40,
  },
  header: {
    alignItems: "center",
    marginBottom: 28,
  },
  iconContainer: {
    width: 100,
    height: 100,
    borderRadius: 50,
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
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 15,
    textAlign: "center",
    lineHeight: 22,
    paddingHorizontal: 12,
  },
  formContainer: {
    gap: 12,
  },
  successBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1,
  },
  successText: {
    fontSize: 14,
    fontWeight: "600",
    flex: 1,
  },
  inputContainer: {
    flexDirection: "row",
    alignItems: "center",
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
  },
  errorText: {
    fontSize: 13,
    fontWeight: "500",
    marginLeft: 4,
  },
  mainButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    height: 56,
    borderRadius: 12,
    marginTop: 4,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 5,
  },
  mainButtonDisabled: {
    opacity: 0.6,
  },
  mainButtonText: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "600",
  },
  switchContainer: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    marginTop: 4,
  },
  switchLink: {
    fontSize: 15,
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
  },
});
