// app/(auth)/reset-password.tsx
import { InfoModal } from "@/components/ui/InfoModal";
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
import { auth } from "../../config/firebase";

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
  const [infoModal, setInfoModal] = useState({
    visible: false,
    title: "",
    message: "",
  });

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

  const showModal = useCallback((title: string, message: string) => {
    setInfoModal({ visible: true, title, message });
  }, []);

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
    if (unmetRules.length > 0) {
      showModal(
        "Erreur",
        "Mot de passe trop faible. Utilisez 8+ caractères, 1 chiffre, 1 caractère spécial.",
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
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      showModal(
        "Mot de passe modifié",
        "Votre mot de passe a été réinitialisé avec succès. Vous pouvez maintenant vous connecter.",
      );
    } catch (error: any) {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
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
          errorMessage = "Une erreur est survenue. Veuillez réessayer.";
      }
      showModal("Erreur", errorMessage);
    } finally {
      setLoading(false);
    }
  }, [unmetRules, password, confirmPassword, oobCode, showModal]);

  const handleTogglePassword = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setShowPassword(!showPassword);
  }, [showPassword]);

  const handleToggleConfirmPassword = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setShowConfirmPassword(!showConfirmPassword);
  }, [showConfirmPassword]);

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
          {/* Skeleton icon circle */}
          <Animated.View
            style={[
              styles.skeletonCircle,
              { backgroundColor: nc.borderLight, opacity: shimmerOpacity },
            ]}
          />
          {/* Skeleton title */}
          <Animated.View
            style={[
              styles.skeletonTitle,
              { backgroundColor: nc.borderLight, opacity: shimmerOpacity },
            ]}
          />
          {/* Skeleton subtitle */}
          <Animated.View
            style={[
              styles.skeletonSubtitle,
              { backgroundColor: nc.borderLight, opacity: shimmerOpacity },
            ]}
          />
          {/* Skeleton input fields */}
          <Animated.View
            style={[
              styles.skeletonInput,
              { backgroundColor: nc.borderLight, opacity: shimmerOpacity },
            ]}
          />
          <Animated.View
            style={[
              styles.skeletonInput,
              { backgroundColor: nc.borderLight, opacity: shimmerOpacity },
            ]}
          />
          {/* Skeleton button */}
          <Animated.View
            style={[
              styles.skeletonButton,
              { backgroundColor: nc.borderLight, opacity: shimmerOpacity },
            ]}
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
      <View style={[styles.container, styles.centered, { backgroundColor: nc.background }]}>
        <InfoModal
          visible={infoModal.visible}
          title={infoModal.title}
          message={infoModal.message}
          backgroundColor={nc.backgroundCard}
          textColor={nc.textStrong}
          onClose={() =>
            setInfoModal({ visible: false, title: "", message: "" })
          }
        />
        <View style={styles.errorContainer}>
          <FontAwesome name="circle-xmark" size={60} color={nc.error} />
          <Text style={[styles.errorTitle, { color: nc.textStrong }]}>
            Lien invalide
          </Text>
          <Text style={[styles.errorMessage, { color: nc.textMuted }]}>
            Ce lien de réinitialisation est invalide ou a expiré. Veuillez
            refaire une demande depuis l'écran de connexion.
          </Text>
          <TouchableOpacity
            style={[styles.backButton, { backgroundColor: nc.todayAccent }]}
            onPress={() => router.replace("/(auth)/login")}
            accessibilityRole="button"
            accessibilityLabel="Retour à la connexion"
          >
            <FontAwesome name="arrow-left" size={16} color={nc.white} />
            <Text style={[styles.backButtonText, { color: nc.white }]}>
              Retour à la connexion
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      style={[styles.container, { backgroundColor: nc.background }]}
    >
      <InfoModal
        visible={infoModal.visible}
        title={infoModal.title}
        message={infoModal.message}
        backgroundColor={nc.backgroundCard}
        textColor={nc.textStrong}
        onClose={() => {
          setInfoModal({ visible: false, title: "", message: "" });
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
          <View style={[styles.iconContainer, { backgroundColor: nc.backgroundCard }]}>
            <FontAwesome name="key" size={36} color={nc.todayAccent} />
          </View>
          <Text style={[styles.title, { color: nc.textStrong }]}>
            Nouveau mot de passe
          </Text>
          <Text style={[styles.subtitle, { color: nc.textMuted }]}>
            Choisissez un nouveau mot de passe pour {email}
          </Text>
        </View>

        {/* Formulaire */}
        <View style={styles.formContainer}>
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
              onChangeText={setPassword}
              secureTextEntry={!showPassword}
              autoCapitalize="none"
              editable={!loading}
              accessibilityLabel="Nouveau mot de passe"
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
              style={[styles.input, { color: nc.textStrong }]}
              placeholder="Confirmer le mot de passe"
              placeholderTextColor={nc.textLight}
              value={confirmPassword}
              onChangeText={setConfirmPassword}
              secureTextEntry={!showConfirmPassword}
              autoCapitalize="none"
              editable={!loading}
              accessibilityLabel="Confirmer le mot de passe"
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

          {/* Bouton valider */}
          <TouchableOpacity
            style={[
              styles.mainButton,
              { backgroundColor: nc.todayAccent, shadowColor: nc.todayAccent },
              loading && styles.mainButtonDisabled,
            ]}
            onPress={handleResetPassword}
            disabled={loading}
            accessibilityRole="button"
            accessibilityLabel="Réinitialiser le mot de passe"
          >
            {loading ? (
              <ActivityIndicator color={nc.white} />
            ) : (
              <>
                <Text style={[styles.mainButtonText, { color: nc.white }]}>
                  Réinitialiser le mot de passe
                </Text>
                <FontAwesome name="check" size={20} color={nc.white} />
              </>
            )}
          </TouchableOpacity>

          {/* Retour connexion */}
          <TouchableOpacity
            style={styles.linkContainer}
            onPress={() => router.replace("/(auth)/login")}
            disabled={loading}
            accessibilityRole="button"
            accessibilityLabel="Retour à la connexion"
          >
            <FontAwesome name="arrow-left" size={14} color={nc.todayAccent} />
            <Text style={[styles.linkText, { color: nc.todayAccent }]}>
              Retour à la connexion
            </Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

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
    paddingHorizontal: 20,
  },
  formContainer: {
    gap: 16,
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
  mainButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    height: 56,
    borderRadius: 12,
    marginTop: 8,
    gap: 12,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 5,
  },
  mainButtonDisabled: {
    opacity: 0.6,
  },
  mainButtonText: {
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
    fontWeight: "600",
  },
  verifyingText: {
    marginTop: 16,
    fontSize: 16,
  },
  errorContainer: {
    alignItems: "center",
    paddingHorizontal: 32,
    gap: 16,
  },
  errorTitle: {
    fontSize: 24,
    fontWeight: "700",
  },
  errorMessage: {
    fontSize: 15,
    textAlign: "center",
    lineHeight: 22,
  },
  backButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 12,
    gap: 10,
    marginTop: 8,
  },
  backButtonText: {
    fontSize: 16,
    fontWeight: "600",
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
