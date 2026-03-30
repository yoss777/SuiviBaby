// app/(auth)/verify-email.tsx
// Email verification screen — same visual language as forgot-password.tsx

import { getNeutralColors } from "@/constants/dashboardColors";
import { useAuth } from "@/contexts/AuthContext";
import { useColorScheme } from "@/hooks/use-color-scheme";
import FontAwesome from "@expo/vector-icons/FontAwesome6";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import { sendEmailVerification } from "firebase/auth";
import { useCallback, useEffect, useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { auth } from "@/config/firebase";

const COOLDOWN_SECONDS = 60;

export default function VerifyEmailScreen() {
  const colorScheme = useColorScheme() ?? "light";
  const nc = getNeutralColors(colorScheme);
  const router = useRouter();
  const { firebaseUser } = useAuth();

  const [sent, setSent] = useState(true); // Already sent on signup
  const [cooldown, setCooldown] = useState(COOLDOWN_SECONDS);
  const [error, setError] = useState("");

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

  const handleResend = useCallback(async () => {
    const user = auth.currentUser;
    if (!user) return;

    setError("");
    try {
      await sendEmailVerification(user);
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setSent(true);
      setCooldown(COOLDOWN_SECONDS);
    } catch (err: any) {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      if (err.code === "auth/too-many-requests") {
        setError("Trop de tentatives. Réessayez dans quelques minutes.");
        setCooldown(COOLDOWN_SECONDS);
      } else {
        setError("Une erreur est survenue. Veuillez réessayer.");
      }
    }
  }, []);

  const handleContinue = useCallback(() => {
    // Let the user continue — AuthContext will handle the rest
    router.replace("/boot");
  }, [router]);

  const canResend = cooldown === 0;
  const email = firebaseUser?.email || auth.currentUser?.email || "";

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
        {/* Header */}
        <View style={styles.header}>
          <View style={[styles.iconContainer, { backgroundColor: nc.backgroundCard }]}>
            <FontAwesome name="envelope-circle-check" size={40} color={nc.todayAccent} />
          </View>
          <Text style={[styles.title, { color: nc.textStrong }]}>
            Vérifiez votre email
          </Text>
          <Text style={[styles.subtitle, { color: nc.textMuted }]}>
            Un email de vérification a été envoyé à {email}. Vérifiez votre boîte de réception et vos spams.
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
              accessibilityLabel="Email de vérification envoyé"
            >
              <FontAwesome name="check" size={14} color={nc.successText} />
              <Text style={[styles.successText, { color: nc.successText }]}>
                Email envoyé avec succès
              </Text>
            </View>
          )}

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

          {/* Resend button */}
          <TouchableOpacity
            style={[
              styles.mainButton,
              { backgroundColor: nc.todayAccent, shadowColor: nc.todayAccent },
              !canResend && styles.mainButtonDisabled,
            ]}
            onPress={handleResend}
            disabled={!canResend}
            activeOpacity={0.8}
            accessibilityRole="button"
            accessibilityLabel={
              cooldown > 0
                ? `Renvoyer dans ${cooldown} secondes`
                : "Renvoyer l'email de vérification"
            }
            accessibilityHint="Renvoie un email de vérification à votre adresse"
            accessibilityState={{ disabled: !canResend }}
          >
            <Text style={styles.mainButtonText}>
              {cooldown > 0
                ? `Renvoyer dans ${cooldown}s`
                : "Renvoyer l'email"}
            </Text>
          </TouchableOpacity>

          {/* Continue without verifying */}
          <View style={styles.switchContainer}>
            <TouchableOpacity
              onPress={handleContinue}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              accessibilityRole="link"
              accessibilityLabel="Continuer sans vérifier"
              accessibilityHint="Vous pourrez vérifier votre email plus tard"
            >
              <Text style={[styles.switchLink, { color: nc.todayAccent }]}>
                Continuer sans vérifier
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Footer */}
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

// Styles matching forgot-password.tsx visual language
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
