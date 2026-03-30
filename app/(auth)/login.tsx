// app/(auth)/login.tsx
import { InfoModal } from "@/components/ui/InfoModal";
import { getNeutralColors } from "@/constants/dashboardColors";
import { useAuth } from "@/contexts/AuthContext";
import { useBaby } from "@/contexts/BabyContext";
import { useColorScheme } from "@/hooks/use-color-scheme";
import {
  clearCredentials,
  getBiometricType,
  getCredentials,
  isBiometricAvailable,
  isBiometricEnabled,
  saveCredentials,
} from "@/services/biometricAuthService";
import {
  isAppleSignInAvailable,
  signInWithApple,
  signInWithGoogle,
} from "@/services/socialAuthService";
import { createPatientUser } from "@/services/userService";
import AsyncStorage from "@react-native-async-storage/async-storage";
import FontAwesome from "@expo/vector-icons/FontAwesome6";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import {
  createUserWithEmailAndPassword,
  sendEmailVerification,
  signInWithEmailAndPassword,
} from "firebase/auth";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  KeyboardAvoidingView,
  LayoutAnimation,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  UIManager,
  View,
} from "react-native";
import { auth } from "../../config/firebase";

const LAST_EMAIL_KEY = "@samaye_last_email";
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Enable LayoutAnimation on Android
if (Platform.OS === "android" && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

const PASSWORD_RULES = [
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

export default function LoginScreen() {
  const colorScheme = useColorScheme() ?? "light";
  const nc = getNeutralColors(colorScheme);
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
  const [failedAttempts, setFailedAttempts] = useState(0);
  const [cooldownEnd, setCooldownEnd] = useState<number | null>(null);
  const [cooldownRemaining, setCooldownRemaining] = useState(0);
  const [emailTouched, setEmailTouched] = useState(false);
  const [capsLockOn, setCapsLockOn] = useState(false);
  const [biometricAvailable, setBiometricAvailable] = useState(false);
  const [biometricEnabled, setBiometricEnabled] = useState(false);
  const [biometricType, setBiometricType] = useState("Biométrie");
  const [appleAvailable, setAppleAvailable] = useState(false);
  const [socialLoading, setSocialLoading] = useState(false);
  const scrollViewRef = useRef<ScrollView>(null);
  const [infoModal, setInfoModal] = useState({
    visible: false,
    title: "",
    message: "",
  });

  const emailValid = useMemo(() => EMAIL_REGEX.test(email.trim()), [email]);

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

  const resetPasswordFields = useCallback(() => {
    setPassword("");
    setConfirmPassword("");
    setShowPassword(false);
    setShowConfirmPassword(false);
  }, []);

  const resetAllFields = useCallback(() => {
    setEmail("");
    setUserName("");
    resetPasswordFields();
  }, [resetPasswordFields]);

  const showModal = useCallback((title: string, message: string) => {
    setInfoModal({ visible: true, title, message });
  }, []);

  // Charger le dernier email (#6), check biométrie (#1)
  // Note: onboarding check is handled by boot.tsx before reaching login
  useEffect(() => {
    AsyncStorage.getItem(LAST_EMAIL_KEY).then((saved) => {
      if (saved) setEmail(saved);
    }).catch(() => {});

    (async () => {
      try {
        const available = await isBiometricAvailable();
        setBiometricAvailable(available);
        if (available) {
          const enabled = await isBiometricEnabled();
          setBiometricEnabled(enabled);
          const type = await getBiometricType();
          setBiometricType(type);
        }
      } catch {
        setBiometricAvailable(false);
      }

      // Check Apple Sign-In availability
      isAppleSignInAvailable().then(setAppleAvailable);
    })();
  }, []);

  // Social sign-in handlers
  const handleGoogleSignIn = useCallback(async () => {
    setSocialLoading(true);
    try {
      const user = await signInWithGoogle();
      if (!user) return; // User cancelled
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (error: any) {
      const code = error?.code || "";
      if (code === "SIGN_IN_CANCELLED" || code === "12501" || code === "ERR_REQUEST_CANCELED") return;
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      showModal("Erreur", "La connexion avec Google a échoué. Veuillez réessayer.");
    } finally {
      setSocialLoading(false);
    }
  }, [showModal]);

  const handleAppleSignIn = useCallback(async () => {
    setSocialLoading(true);
    try {
      await signInWithApple();
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (error: any) {
      const code = error?.code || "";
      if (code === "ERR_REQUEST_CANCELED" || code === "ERR_CANCELED") return;
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      showModal("Erreur", "La connexion avec Apple a échoué. Veuillez réessayer.");
    } finally {
      setSocialLoading(false);
    }
  }, [showModal]);

  // Détection caps lock (#10)
  const handlePasswordKeyPress = useCallback((e: any) => {
    const key = e.nativeEvent?.key;
    if (key && key.length === 1 && /[A-Z]/.test(key) && !/[a-z]/.test(key)) {
      setCapsLockOn(true);
    } else if (key && key.length === 1 && /[a-z]/.test(key)) {
      setCapsLockOn(false);
    }
  }, []);

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
      router.replace("/(drawer)/baby" as any);
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

  // Cooldown countdown timer
  useEffect(() => {
    if (!cooldownEnd) return;
    const tick = () => {
      const remaining = Math.ceil((cooldownEnd - Date.now()) / 1000);
      if (remaining <= 0) {
        setCooldownEnd(null);
        setCooldownRemaining(0);
      } else {
        setCooldownRemaining(remaining);
      }
    };
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [cooldownEnd]);

  const isCoolingDown = cooldownEnd !== null && cooldownRemaining > 0;

  const handleForgotPassword = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push({
      pathname: "/(auth)/forgot-password",
      params: email.trim() ? { email: email.trim() } : {},
    } as any);
  }, [email, router]);

  const handleAuth = useCallback(async () => {
    if (isCoolingDown) return;

    if (!isLogin && !hasConsented) {
      setShowConsentError(true);
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      setTimeout(() => setShowConsentError(false), 2000);
      return;
    }

    if (!email.trim() || !password.trim()) {
      showModal("Erreur", "Veuillez remplir tous les champs");
      return;
    }

    if (!isLogin && !userName.trim()) {
      showModal("Erreur", "Veuillez entrer votre pseudo");
      return;
    }

    if (!isLogin) {
      if (unmetRules.length > 0) {
        showModal(
          "Erreur",
          "Mot de passe trop faible. Utilisez 8+ caracteres, 1 chiffre, 1 caractere special.",
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
        setFailedAttempts(0);
        // Sauvegarder l'email pour pré-remplissage (#6 Remember me)
        AsyncStorage.setItem(LAST_EMAIL_KEY, email.trim()).catch(() => {});
        // Si biometric activé (via onboarding) mais pas de credentials sauvés,
        // les sauvegarder maintenant après login réussi
        if (biometricEnabled) {
          saveCredentials(email.trim(), password).catch(() => {});
        }
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      } else {
        const userCredential = await createUserWithEmailAndPassword(
          auth,
          email.trim(),
          password,
        );

        const defaultUserName = email.trim().split("@")[0];
        await createPatientUser(
          userCredential.user.uid,
          email.trim(),
          userName.trim() || defaultUserName,
        );

        // Envoyer l'email de vérification
        sendEmailVerification(userCredential.user).catch(() => {});

        // Sauvegarder l'email pour pré-remplissage
        AsyncStorage.setItem(LAST_EMAIL_KEY, email.trim()).catch(() => {});
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        resetAllFields();

        // Rediriger vers l'écran de vérification email
        router.replace("/(auth)/verify-email");
      }
    } catch (error: any) {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);

      // Track failed login attempts for rate limiting
      if (isLogin) {
        const newCount = failedAttempts + 1;
        setFailedAttempts(newCount);
        if (newCount >= 5) {
          setCooldownEnd(Date.now() + 60_000);
        } else if (newCount >= 3) {
          setCooldownEnd(Date.now() + 15_000);
        }
      }

      let errorMessage = "Une erreur est survenue";

      switch (error.code) {
        case "auth/invalid-email":
          errorMessage = "Adresse email invalide";
          break;
        case "auth/user-disabled":
          errorMessage = "Ce compte a été désactivé";
          break;
        case "auth/user-not-found":
        case "auth/wrong-password":
        case "auth/invalid-credential":
          errorMessage = "Email ou mot de passe incorrect";
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
        case "auth/too-many-requests":
          errorMessage = "Trop de tentatives. Réessayez dans quelques minutes.";
          break;
        default:
          errorMessage = "Une erreur est survenue. Veuillez réessayer.";
      }

      showModal("Erreur", errorMessage);
    } finally {
      setLoading(false);
    }
  }, [isLogin, hasConsented, email, password, userName, confirmPassword, unmetRules, showModal, resetAllFields, isCoolingDown, failedAttempts]);

  // Connexion biométrique (#1)
  const handleBiometricLogin = useCallback(async () => {
    try {
      const creds = await getCredentials();
      if (!creds) return;
      setLoading(true);
      await signInWithEmailAndPassword(auth, creds.email, creds.password);
      setFailedAttempts(0);
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (error: any) {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      if (error.code === "auth/wrong-password" || error.code === "auth/user-not-found" || error.code === "auth/invalid-credential") {
        await clearCredentials();
        setBiometricEnabled(false);
        showModal("Erreur", "Identifiants expirés. Veuillez vous reconnecter manuellement.");
      } else {
        showModal("Erreur", "Une erreur est survenue. Veuillez réessayer.");
      }
    } finally {
      setLoading(false);
    }
  }, [showModal]);


  const handleEmailChange = useCallback((text: string) => {
    setEmail(text);
    if (!emailTouched && text.length > 0) setEmailTouched(true);
  }, [emailTouched]);

  // Auto-scroll vers le champ actif (#4 Keyboard-aware)
  const handleInputFocus = useCallback((yOffset: number) => {
    setTimeout(() => {
      scrollViewRef.current?.scrollTo({ y: yOffset, animated: true });
    }, 300);
  }, []);

  const handleToggleMode = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    LayoutAnimation.configureNext({
      duration: 350,
      create: { type: LayoutAnimation.Types.easeInEaseOut, property: LayoutAnimation.Properties.opacity },
      update: { type: LayoutAnimation.Types.easeInEaseOut },
      delete: { type: LayoutAnimation.Types.easeInEaseOut, property: LayoutAnimation.Properties.opacity },
    });
    setIsLogin(!isLogin);
    resetAllFields();
    setEmailTouched(false);
    setCapsLockOn(false);
  }, [isLogin, resetAllFields]);

  const handleTogglePassword = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setShowPassword(!showPassword);
  }, [showPassword]);

  const handleToggleConfirmPassword = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setShowConfirmPassword(!showConfirmPassword);
  }, [showConfirmPassword]);

  const handleToggleConsent = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setHasConsented(!hasConsented);
    setShowConsentError(false);
  }, [hasConsented]);

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
        onClose={() => setInfoModal({ visible: false, title: "", message: "" })}
      />
      <ScrollView
        ref={scrollViewRef}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Header avec icône */}
        <View style={styles.header}>
          <View style={[styles.iconContainer, { backgroundColor: nc.backgroundCard }]}>
            <FontAwesome name="baby-carriage" size={40} color={nc.todayAccent} />
          </View>
          <Text style={[styles.title, { color: nc.textStrong }]}>
            {isLogin ? "Bienvenue" : "Créer un compte"}
          </Text>
          <Text style={[styles.subtitle, { color: nc.textMuted }]}>
            {isLogin
              ? "Connectez-vous pour suivre le quotidien de votre bébé"
              : "Commencez à suivre le quotidien de votre bébé"}
          </Text>
        </View>

        {/* Formulaire */}
        <View style={styles.formContainer}>
          {/* Champ Email */}
          <View>
            <View style={[styles.inputContainer, { backgroundColor: nc.backgroundCard }]}>
              <View style={styles.inputIconContainer}>
                <FontAwesome name="envelope" size={20} color={nc.textMuted} />
              </View>
              <TextInput
                style={[styles.input, { color: nc.textStrong }]}
                placeholder="Adresse email"
                placeholderTextColor={nc.textLight}
                value={email}
                onChangeText={handleEmailChange}
                onBlur={() => setEmailTouched(true)}
                keyboardType="email-address"
                autoCapitalize="none"
                autoComplete="email"
                autoCorrect={false}
                spellCheck={false}
                editable={!loading}
                accessibilityLabel="Adresse email"
              />
              {emailTouched && email.trim().length > 0 && (
                <FontAwesome
                  name={emailValid ? "circle-check" : "circle-xmark"}
                  size={18}
                  color={emailValid ? "#22c55e" : nc.error}
                  style={styles.emailValidationIcon}
                />
              )}
            </View>
            {emailTouched && email.trim().length > 0 && !emailValid && (
              <Text style={[styles.inlineHint, { color: nc.error }]}>
                Format d'email invalide
              </Text>
            )}
          </View>

          {/* Champ Pseudo (seulement en mode inscription) */}
          {!isLogin && (
            <View style={[styles.inputContainer, { backgroundColor: nc.backgroundCard }]}>
              <View style={styles.inputIconContainer}>
                <FontAwesome name="user" size={20} color={nc.textMuted} />
              </View>
              <TextInput
                style={[styles.input, { color: nc.textStrong }]}
                placeholder="Pseudo"
                placeholderTextColor={nc.textLight}
                value={userName}
                onChangeText={setUserName}
                autoCapitalize="words"
                editable={!loading}
                accessibilityLabel="Pseudo"
                onFocus={() => handleInputFocus(150)}
              />
            </View>
          )}

          {/* Champ Mot de passe */}
          <View>
            <View style={[styles.inputContainer, { backgroundColor: nc.backgroundCard }]}>
              <View style={styles.inputIconContainer}>
                <FontAwesome name="lock" size={20} color={nc.textMuted} />
              </View>
              <TextInput
                style={[styles.input, { color: nc.textStrong, backgroundColor: 'transparent' }]}
                placeholder="Mot de passe"
                placeholderTextColor={nc.textLight}
                value={password}
                onChangeText={setPassword}
                onKeyPress={handlePasswordKeyPress}
                onFocus={() => handleInputFocus(200)}
                secureTextEntry={!showPassword}
                autoCapitalize="none"
                autoComplete="password"
                editable={!loading}
                accessibilityLabel="Mot de passe"
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
            {capsLockOn && (
              <View style={styles.capsLockRow}>
                <FontAwesome name="triangle-exclamation" size={12} color={nc.todayAccent} />
                <Text style={[styles.inlineHint, { color: nc.todayAccent }]}>
                  Verrouillage majuscules activé
                </Text>
              </View>
            )}
          </View>

          {/* Lien mot de passe oublié (mode connexion uniquement) */}
          {isLogin && (
            <View>
              <TouchableOpacity
                onPress={handleForgotPassword}
                disabled={loading}
                style={styles.forgotPasswordContainer}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                accessibilityRole="button"
                accessibilityLabel="Mot de passe oublié"
              >
                <Text style={[styles.forgotPasswordText, { color: nc.todayAccent }]}>
                  Mot de passe oublié ?
                </Text>
              </TouchableOpacity>
            </View>
          )}

          {!isLogin && password.length > 0 && (
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

          {!isLogin && (
            <View style={[styles.inputContainer, { backgroundColor: nc.backgroundCard }]}>
              <View style={styles.inputIconContainer}>
                <FontAwesome name="lock" size={20} color={nc.textMuted} />
              </View>
              <TextInput
                style={[styles.input, { color: nc.textStrong, backgroundColor: 'transparent' }]}
                placeholder="Confirmer le mot de passe"
                placeholderTextColor={nc.textLight}
                value={confirmPassword}
                onChangeText={setConfirmPassword}
                onFocus={() => handleInputFocus(300)}
                secureTextEntry={!showConfirmPassword}
                autoCapitalize="none"
                autoComplete="password"
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
          )}

          {/* Bouton principal */}
          <TouchableOpacity
            style={[
              styles.mainButton,
              { backgroundColor: nc.todayAccent, shadowColor: nc.todayAccent },
              (loading || isCoolingDown) && styles.mainButtonDisabled,
              !isLogin &&
                !hasConsented &&
                showConsentError && { backgroundColor: nc.error },
            ]}
            onPress={handleAuth}
            disabled={loading || isCoolingDown}
            accessibilityRole="button"
            accessibilityLabel={isLogin ? "Se connecter" : "Créer mon compte"}
          >
            {loading ? (
              <ActivityIndicator color={nc.white} />
            ) : isCoolingDown ? (
              <>
                <FontAwesome name="clock" size={20} color={nc.white} />
                <Text style={[styles.mainButtonText, { color: nc.white }]}>
                  Réessayer dans {cooldownRemaining}s
                </Text>
              </>
            ) : (
              <>
                <Text style={[styles.mainButtonText, { color: nc.white }]}>
                  {isLogin ? "Se connecter" : "Créer mon compte"}
                </Text>
                <FontAwesome name="arrow-right" size={20} color={nc.white} />
              </>
            )}
          </TouchableOpacity>

          {/* Bouton biométrique (#1) */}
          {isLogin && biometricAvailable && biometricEnabled && (
            <TouchableOpacity
              style={[styles.biometricButton, { borderColor: nc.todayAccent }]}
              onPress={handleBiometricLogin}
              disabled={loading}
              accessibilityRole="button"
              accessibilityLabel={`Se connecter avec ${biometricType}`}
            >
              <FontAwesome
                name={biometricType === "Face ID" ? "face-smile" : "fingerprint"}
                size={22}
                color={nc.todayAccent}
              />
              <Text style={[styles.biometricButtonText, { color: nc.todayAccent }]}>
                Se connecter avec {biometricType}
              </Text>
            </TouchableOpacity>
          )}

          {/* Séparateur social */}
          <View style={styles.dividerRow}>
            <View style={[styles.dividerLine, { backgroundColor: nc.borderLight }]} />
            <Text style={[styles.dividerText, { color: nc.textMuted }]}>ou</Text>
            <View style={[styles.dividerLine, { backgroundColor: nc.borderLight }]} />
          </View>

          {/* Boutons de connexion sociale */}
          <TouchableOpacity
            style={[styles.socialButton, { backgroundColor: nc.backgroundCard, borderColor: nc.borderLight }]}
            onPress={handleGoogleSignIn}
            disabled={loading || socialLoading}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel="Continuer avec Google"
            accessibilityHint="Se connecter ou créer un compte avec Google"
          >
            {socialLoading ? (
              <ActivityIndicator size="small" color={nc.textMuted} />
            ) : (
              <>
                <FontAwesome name="google" size={20} color="#4285F4" />
                <Text style={[styles.socialButtonText, { color: nc.textStrong }]}>
                  Continuer avec Google
                </Text>
              </>
            )}
          </TouchableOpacity>

          {appleAvailable && (
            <TouchableOpacity
              style={[styles.socialButton, { backgroundColor: nc.textStrong }]}
              onPress={handleAppleSignIn}
              disabled={loading || socialLoading}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel="Continuer avec Apple"
              accessibilityHint="Se connecter ou créer un compte avec Apple"
            >
              <FontAwesome name="apple" size={22} color={nc.background} />
              <Text style={[styles.socialButtonText, { color: nc.background }]}>
                Continuer avec Apple
              </Text>
            </TouchableOpacity>
          )}

          {/* Note légale pour connexion sociale */}
          <Text style={[styles.socialLegalText, { color: nc.textLight }]}>
            En continuant, vous acceptez les conditions et la politique de confidentialité.
          </Text>

          {/* Consentement aux conditions et politique de confidentialité */}
          {!isLogin && (
            <View
              style={[
                styles.legalContainer,
                showConsentError && [
                  styles.legalErrorBorder,
                  { backgroundColor: nc.errorBg, borderColor: nc.error },
                ],
              ]}
            >
              <TouchableOpacity
                onPress={handleToggleConsent}
                style={styles.consentCheckbox}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: hasConsented }}
                accessibilityLabel="Accepter les conditions et la politique de confidentialité"
              >
                <FontAwesome
                  name={hasConsented ? "check-square" : "square"}
                  size={20}
                  color={showConsentError ? nc.error : nc.todayAccent}
                />
              </TouchableOpacity>
              <Text
                style={[
                  styles.legalText,
                  { color: nc.textMuted },
                  showConsentError && { color: nc.error, fontWeight: "bold" },
                ]}
              >
                J'accepte{" "}
              </Text>
              <TouchableOpacity
                onPress={() => router.push("/(auth)/terms")}
                accessibilityRole="link"
                accessibilityLabel="Voir les conditions d'utilisation"
              >
                <Text
                  style={[
                    styles.legalLink,
                    { color: nc.todayAccent },
                    showConsentError && {
                      color: nc.error,
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
                  { color: nc.textMuted },
                  showConsentError && { color: nc.error, fontWeight: "bold" },
                ]}
              >
                {" "}
                et{" "}
              </Text>
              <TouchableOpacity
                onPress={() => router.push("/(auth)/privacy")}
                disabled={loading}
                accessibilityRole="link"
                accessibilityLabel="Voir la politique de confidentialité"
              >
                <Text
                  style={[
                    styles.legalLink,
                    { color: nc.todayAccent },
                    showConsentError && {
                      color: nc.error,
                      fontWeight: "bold",
                    },
                  ]}
                >
                  la politique de confidentialite
                </Text>
              </TouchableOpacity>
              <Text style={[styles.legalText, { color: nc.textMuted }]}>.</Text>
            </View>
          )}

          {/* Lien pour basculer entre connexion et inscription */}
          <View style={styles.switchContainer}>
            <Text style={[styles.switchText, { color: nc.textMuted }]}>
              {isLogin ? "Pas encore de compte ?" : "Déjà un compte ?"}
            </Text>
            <TouchableOpacity
              onPress={handleToggleMode}
              disabled={loading}
              accessibilityRole="button"
              accessibilityLabel={isLogin ? "Créer un compte" : "Se connecter"}
            >
              <Text style={[styles.switchLink, { color: nc.todayAccent }]}>
                {isLogin ? "Créer un compte" : "Se connecter"}
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

const styles = StyleSheet.create({
  container: {
    flex: 1,
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
    fontSize: 32,
    fontWeight: "700",
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
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
  switchContainer: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 8,
    marginTop: 8,
  },
  switchText: {
    fontSize: 15,
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
  legalContainer: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 16,
    paddingHorizontal: 12,
  },
  legalText: {
    fontSize: 12,
  },
  legalLink: {
    fontSize: 12,
    fontWeight: "600",
  },
  legalErrorBorder: {
    padding: 8,
    borderRadius: 8,
    borderWidth: 1,
  },
  consentCheckbox: {
    marginRight: 8,
    padding: 4,
  },
  forgotPasswordContainer: {
    alignSelf: "flex-end",
    marginTop: -8,
  },
  forgotPasswordText: {
    fontSize: 14,
    fontWeight: "500",
  },
  emailValidationIcon: {
    marginLeft: 8,
  },
  inlineHint: {
    fontSize: 12,
    fontWeight: "500",
    marginTop: 4,
    marginLeft: 4,
  },
  capsLockRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 4,
    marginLeft: 4,
  },
  dividerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginVertical: 4,
  },
  dividerLine: {
    flex: 1,
    height: 1,
  },
  dividerText: {
    fontSize: 14,
    fontWeight: "500",
  },
  socialButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    height: 56,
    borderRadius: 12,
    gap: 12,
    borderWidth: 1,
    borderColor: "transparent",
  },
  socialButtonText: {
    fontSize: 16,
    fontWeight: "600",
  },
  socialLegalText: {
    fontSize: 11,
    textAlign: "center",
    lineHeight: 16,
  },
  biometricButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    height: 56,
    borderRadius: 12,
    borderWidth: 2,
    gap: 12,
  },
  biometricButtonText: {
    fontSize: 16,
    fontWeight: "600",
  },
});
