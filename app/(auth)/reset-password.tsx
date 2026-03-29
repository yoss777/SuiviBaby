// app/(auth)/reset-password.tsx
// Reset password screen — same visual language as forgot-password.tsx

import { getNeutralColors } from "@/constants/dashboardColors";
import { useColorScheme } from "@/hooks/use-color-scheme";
import FontAwesome from "@expo/vector-icons/FontAwesome6";
import * as Haptics from "expo-haptics";
import { useLocalSearchParams, useRouter } from "expo-router";
import { confirmPasswordReset, verifyPasswordResetCode } from "firebase/auth";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  Easing,
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

const PASSWORD_RULES = [
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

export default function ResetPasswordScreen() {
  const colorScheme = useColorScheme() ?? "light";
  const nc = getNeutralColors(colorScheme);
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
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState("");
  const confirmRef = useRef<TextInput>(null);

  const unmetRules = useMemo(
    () => PASSWORD_RULES.filter((rule) => !rule.test(password)),
    [password],
  );
  const strengthScore = PASSWORD_RULES.length - unmetRules.length;
  const strengthPercent = Math.round(
    (strengthScore / PASSWORD_RULES.length) * 100,
  );
  const strengthLabel =
    strengthScore === 3 ? "Fort" : strengthScore === 2 ? "Moyen" : "Faible";

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

  const handleResetPassword = useCallback(async () => {
    setError("");

    if (unmetRules.length > 0) {
      setError("Mot de passe trop faible. Utilisez 8+ caractères, 1 chiffre, 1 caractère spécial.");
      return;
    }

    if (password !== confirmPassword) {
      setError("Les mots de passe ne correspondent pas.");
      return;
    }

    setLoading(true);
    try {
      await confirmPasswordReset(auth, oobCode!, password);
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setSuccess(true);
    } catch (err: any) {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      switch (err.code) {
        case "auth/expired-action-code":
          setError("Ce lien a expiré. Veuillez refaire une demande de réinitialisation.");
          break;
        case "auth/invalid-action-code":
          setError("Ce lien est invalide ou a déjà été utilisé.");
          break;
        case "auth/weak-password":
          setError("Le mot de passe est trop faible.");
          break;
        default:
          setError("Une erreur est survenue. Veuillez réessayer.");
      }
    } finally {
      setLoading(false);
    }
  }, [unmetRules, password, confirmPassword, oobCode]);

  const handleTogglePassword = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setShowPassword((prev) => !prev);
  }, []);

  const handleToggleConfirmPassword = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setShowConfirmPassword((prev) => !prev);
  }, []);

  // Skeleton shimmer animation
  const shimmerAnim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!verifying) return;
    const loop = Animated.loop(
      Animated.timing(shimmerAnim, {
        toValue: 1,
        duration: 1200,
        easing: Easing.linear,
        useNativeDriver: true,
      }),
    );
    loop.start();
    return () => loop.stop();
  }, [verifying, shimmerAnim]);

  const shimmerOpacity = shimmerAnim.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: [0.3, 0.7, 0.3],
  });

  if (verifying) {
    return (
      <View style={[styles.container, styles.centered, { backgroundColor: nc.background }]}>
        <View style={styles.skeletonContainer}>
          <Animated.View
            style={[styles.skeletonCircle, { backgroundColor: nc.borderLight, opacity: shimmerOpacity }]}
          />
          <Animated.View
            style={[styles.skeletonTitle, { backgroundColor: nc.borderLight, opacity: shimmerOpacity }]}
          />
          <Animated.View
            style={[styles.skeletonSubtitle, { backgroundColor: nc.borderLight, opacity: shimmerOpacity }]}
          />
          <Animated.View
            style={[styles.skeletonInput, { backgroundColor: nc.borderLight, opacity: shimmerOpacity }]}
          />
          <Animated.View
            style={[styles.skeletonInput, { backgroundColor: nc.borderLight, opacity: shimmerOpacity }]}
          />
          <Animated.View
            style={[styles.skeletonButton, { backgroundColor: nc.borderLight, opacity: shimmerOpacity }]}
          />
        </View>
        <Text style={[styles.verifyingText, { color: nc.textMuted }]}>
          Vérification du lien...
        </Text>
      </View>
    );
  }

  if (invalidCode) {
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
          <View style={styles.header}>
            <View style={[styles.iconContainer, { backgroundColor: nc.backgroundCard }]}>
              <FontAwesome name="circle-xmark" size={40} color={nc.error} />
            </View>
            <Text style={[styles.title, { color: nc.textStrong }]}>
              Lien invalide
            </Text>
            <Text style={[styles.subtitle, { color: nc.textMuted }]}>
              Ce lien de réinitialisation est invalide ou a expiré. Veuillez refaire une demande depuis l'écran de connexion.
            </Text>
          </View>

          <View style={styles.switchContainer}>
            <TouchableOpacity
              onPress={() => router.replace("/(auth)/login")}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              accessibilityRole="link"
              accessibilityLabel="Retour à la connexion"
            >
              <Text style={[styles.switchLink, { color: nc.todayAccent }]}>
                Retour à la connexion
              </Text>
            </TouchableOpacity>
          </View>

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
        {/* Header — same pattern as forgot-password.tsx */}
        <View style={styles.header}>
          <View style={[styles.iconContainer, { backgroundColor: nc.backgroundCard }]}>
            <FontAwesome
              name={success ? "circle-check" : "key"}
              size={40}
              color={success ? nc.success : nc.todayAccent}
            />
          </View>
          <Text style={[styles.title, { color: nc.textStrong }]}>
            {success ? "Mot de passe modifié" : "Nouveau mot de passe"}
          </Text>
          <Text style={[styles.subtitle, { color: nc.textMuted }]}>
            {success
              ? "Votre mot de passe a été réinitialisé avec succès. Vous pouvez maintenant vous connecter."
              : `Choisissez un nouveau mot de passe pour ${email}`}
          </Text>
        </View>

        <View style={styles.formContainer}>
          {/* Success banner */}
          {success && (
            <View
              style={[
                styles.successBanner,
                { backgroundColor: nc.successBg, borderColor: nc.success },
              ]}
              accessibilityRole="alert"
              accessibilityLabel="Mot de passe réinitialisé avec succès"
            >
              <FontAwesome name="check" size={14} color={nc.successText} />
              <Text style={[styles.successText, { color: nc.successText }]}>
                Mot de passe modifié avec succès
              </Text>
            </View>
          )}

          {!success && (
            <>
              {/* Nouveau mot de passe */}
              <View style={[styles.inputContainer, { backgroundColor: nc.backgroundCard }]}>
                <View style={styles.inputIconContainer}>
                  <FontAwesome name="lock" size={20} color={nc.textMuted} />
                </View>
                <TextInput
                  style={[styles.input, { color: nc.textStrong }]}
                  placeholder="Nouveau mot de passe"
                  placeholderTextColor={nc.textLight}
                  value={password}
                  onChangeText={(text) => {
                    setPassword(text);
                    if (error) setError("");
                  }}
                  secureTextEntry={!showPassword}
                  autoCapitalize="none"
                  autoCorrect={false}
                  autoComplete="new-password"
                  returnKeyType="next"
                  onSubmitEditing={() => confirmRef.current?.focus()}
                  editable={!loading}
                  accessibilityLabel="Nouveau mot de passe"
                  accessibilityHint="Entrez votre nouveau mot de passe"
                />
                <TouchableOpacity
                  style={styles.eyeIcon}
                  onPress={handleTogglePassword}
                  disabled={loading}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  accessibilityRole="button"
                  accessibilityLabel={showPassword ? "Masquer le mot de passe" : "Afficher le mot de passe"}
                >
                  <FontAwesome
                    name={showPassword ? "eye" : "eye-slash"}
                    size={20}
                    color={nc.textMuted}
                  />
                </TouchableOpacity>
              </View>

              {/* Barre de force */}
              {password.length > 0 && (
                <View style={styles.strengthRow}>
                  <View style={[styles.strengthBarTrack, { backgroundColor: nc.borderLight }]}>
                    <View
                      style={[
                        styles.strengthBarFill,
                        { width: `${strengthPercent}%`, backgroundColor: nc.todayAccent },
                      ]}
                    />
                  </View>
                  <Text style={[styles.strengthLabel, { color: nc.textMuted }]}>
                    Force: {strengthLabel}
                  </Text>
                </View>
              )}

              {/* Confirmer mot de passe */}
              <View style={[styles.inputContainer, { backgroundColor: nc.backgroundCard }]}>
                <View style={styles.inputIconContainer}>
                  <FontAwesome name="lock" size={20} color={nc.textMuted} />
                </View>
                <TextInput
                  ref={confirmRef}
                  style={[styles.input, { color: nc.textStrong }]}
                  placeholder="Confirmer le mot de passe"
                  placeholderTextColor={nc.textLight}
                  value={confirmPassword}
                  onChangeText={(text) => {
                    setConfirmPassword(text);
                    if (error) setError("");
                  }}
                  secureTextEntry={!showConfirmPassword}
                  autoCapitalize="none"
                  autoCorrect={false}
                  autoComplete="new-password"
                  returnKeyType="done"
                  onSubmitEditing={handleResetPassword}
                  editable={!loading}
                  accessibilityLabel="Confirmer le mot de passe"
                  accessibilityHint="Retapez le mot de passe pour confirmer"
                />
                <TouchableOpacity
                  style={styles.eyeIcon}
                  onPress={handleToggleConfirmPassword}
                  disabled={loading}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  accessibilityRole="button"
                  accessibilityLabel={showConfirmPassword ? "Masquer la confirmation" : "Afficher la confirmation"}
                >
                  <FontAwesome
                    name={showConfirmPassword ? "eye" : "eye-slash"}
                    size={20}
                    color={nc.textMuted}
                  />
                </TouchableOpacity>
              </View>
            </>
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

          {/* Submit / Go to login button */}
          <TouchableOpacity
            style={[
              styles.mainButton,
              { backgroundColor: nc.todayAccent, shadowColor: nc.todayAccent },
              loading && styles.mainButtonDisabled,
            ]}
            onPress={success ? () => router.replace("/(auth)/login") : handleResetPassword}
            disabled={loading}
            activeOpacity={0.8}
            accessibilityRole="button"
            accessibilityLabel={success ? "Se connecter" : "Réinitialiser le mot de passe"}
            accessibilityHint={success ? "Retourne à l'écran de connexion" : "Confirme le nouveau mot de passe"}
            accessibilityState={{ disabled: loading }}
          >
            {loading ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <Text style={styles.mainButtonText}>
                {success ? "Se connecter" : "Réinitialiser"}
              </Text>
            )}
          </TouchableOpacity>

          {/* Back to login */}
          {!success && (
            <View style={styles.switchContainer}>
              <TouchableOpacity
                onPress={() => router.replace("/(auth)/login")}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                accessibilityRole="link"
                accessibilityLabel="Retour à la connexion"
              >
                <Text style={[styles.switchLink, { color: nc.todayAccent }]}>
                  Retour à la connexion
                </Text>
              </TouchableOpacity>
            </View>
          )}
        </View>

        {/* Footer — same as forgot-password */}
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
  centered: {
    justifyContent: "center",
    alignItems: "center",
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
  eyeIcon: {
    padding: 12,
  },
  strengthRow: {
    gap: 6,
  },
  strengthBarTrack: {
    height: 8,
    borderRadius: 4,
    overflow: "hidden",
  },
  strengthBarFill: {
    height: "100%",
  },
  strengthLabel: {
    fontSize: 12,
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
  verifyingText: {
    marginTop: 16,
    fontSize: 16,
  },
  skeletonContainer: {
    width: "100%",
    paddingHorizontal: 20,
    alignItems: "center",
    gap: 16,
  },
  skeletonCircle: {
    width: 100,
    height: 100,
    borderRadius: 50,
    marginBottom: 8,
  },
  skeletonTitle: {
    width: 220,
    height: 28,
    borderRadius: 8,
  },
  skeletonSubtitle: {
    width: 280,
    height: 16,
    borderRadius: 6,
    marginBottom: 16,
  },
  skeletonInput: {
    width: "100%",
    height: 56,
    borderRadius: 12,
  },
  skeletonButton: {
    width: "100%",
    height: 56,
    borderRadius: 12,
    marginTop: 8,
  },
});
