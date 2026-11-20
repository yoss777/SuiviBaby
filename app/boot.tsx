import { canManageEvents } from "@/utils/eventPermissions";
import { APP_NAME } from "@/constants/app";
import { useCallback, useEffect, useRef, useState } from "react";
import { Pressable, Image, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import * as Sentry from "@sentry/react-native";
import { useNetInfo } from "@react-native-community/netinfo";

import { captureServiceError } from "@/utils/errorReporting";

import { ErrorBoundary } from "@/components/ErrorBoundary";
import BackgroundImage from "@/components/ui/BackgroundImage";
import { IconPulseDots } from "@/components/ui/IconPulseDtos";
import { useAuth } from "@/contexts/AuthContext";
import { useBaby } from "@/contexts/BabyContext";
import { hasPendingDeletion } from "@/services/accountDeletionService";
import {
  isBiometricEnabled,
  unlockWithBiometric,
} from "@/services/biometricAuthService";
import { fetchHealthConsentStatus } from "@/services/healthConsentService";
import { obtenirEvenementsDuJour } from "@/services/eventsService";
import {
  obtenirPreferencesNotifications,
  synchroniserFuseauHoraire,
} from "@/services/userPreferencesService";
import { setPreferencesCache, setPermissionsCache } from "@/services/userPreferencesCache";
import { getUserChildAccess } from "@/utils/permissions";
import {
  getTodayEventsCache,
  loadTodayEventsOnce,
} from "@/services/todayEventsCache";
import { router } from "expo-router";
import { hasCompletedOnboarding } from "./(auth)/onboarding";
import { neutralColors } from "@/constants/dashboardColors";

const BOOT_NETWORK_TIMEOUT_MS = 8000;
const BOOT_AUTO_RETRY_INTERVAL_MS = 10_000;
const BOOT_AUTO_RETRY_MAX = 12;
/** Au-delà, l'écran de chargement propose « Réessayer » quoi qu'il bloque. */
const BOOT_WATCHDOG_MS = 20_000;
/** Pendant une demande d'empreinte affichée (l'utilisateur répond). */
const BOOT_WATCHDOG_BIOMETRIC_MS = 60_000;
/** Lectures locales ou réseau d'une étape du démarrage. */
const BOOT_STEP_TIMEOUT_MS = 15_000;

class BootStepTimeoutError extends Error {}

function withBootTimeout<T>(promise: Promise<T>, ms = BOOT_STEP_TIMEOUT_MS): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new BootStepTimeoutError("délai dépassé")), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

function logBoot(...args: unknown[]) {
  if (__DEV__ && process.env.NODE_ENV !== "test") {
    console.log("[BOOT]", ...args);
  }
}

function BootScreenContent() {
  const {
    user,
    firebaseUser,
    loading: authLoading,
    status: authStatus,
    refreshUser,
    signOut,
  } = useAuth();
  const {
    children,
    loading: babyLoading,
    activeChild,
    setActiveChild,
  } = useBaby();
  const netInfo = useNetInfo();
  const [delayDone, setDelayDone] = useState(false);
  const [unauthDelayDone, setUnauthDelayDone] = useState(false);
  const [onboardingChecked, setOnboardingChecked] = useState(false);
  const [onboardingDone, setOnboardingDone] = useState(false);
  const [bootRetryKey, setBootRetryKey] = useState(0);
  const [bootStalled, setBootStalled] = useState(false);
  const [stallPhase, setStallPhase] = useState<"auth" | "children" | null>(null);
  const [biometricCheck, setBiometricCheck] = useState<
    "pending" | "running" | "passed" | "failed"
  >("pending");
  const biometricCheckStartedRef = useRef(false);
  // Health consent gate: one Firestore read per boot (no listener).
  const [consentCheck, setConsentCheck] = useState<
    "pending" | "running" | "granted" | "error"
  >("pending");
  const consentCheckStartedRef = useRef(false);
  const hasNavigatedRef = useRef(false);
  // Écran de chargement affiché trop longtemps sans issue (étape bloquée,
  // par exemple après la recréation de l'activité Android quand la taille de
  // police change app ouverte) : on propose « Réessayer ».
  const [bootTooLong, setBootTooLong] = useState(false);
  // Incrémenté à chaque « Réessayer » : le résultat tardif d'un essai
  // abandonné est ignoré.
  const bootGenerationRef = useRef(0);
  const bootResourceKeyRef = useRef<string | null>(null);
  const bootResourcePromiseRef = useRef<Promise<void> | null>(null);
  const bootAssignedChildIdRef = useRef<string | null>(null);

  // Sentry Performance: track startup time
  const startupSpanRef = useRef(
    Sentry.startInactiveSpan({ name: "app.boot", op: "app.start" }),
  );
  // R1+R9: Splash minimum — shorter if cache exists (warm return)
  useEffect(() => {
    const hasCache = activeChild?.id ? !!getTodayEventsCache(activeChild.id) : false;
    const minDelay = hasCache ? 500 : 1200;
    const timer = setTimeout(() => setDelayDone(true), minDelay);
    return () => clearTimeout(timer);
  }, [activeChild?.id]);

  // Check onboarding status once on mount
  useEffect(() => {
    hasCompletedOnboarding().then((done) => {
      setOnboardingDone(done);
      setOnboardingChecked(true);
    });
  }, []);

  useEffect(() => {
    if (authLoading || user) {
      setUnauthDelayDone(false);
      return;
    }

    const timer = setTimeout(() => setUnauthDelayDone(true), 1200);
    return () => clearTimeout(timer);
  }, [authLoading, user]);

  useEffect(() => {
    const nextPhase: "auth" | "children" | null =
      authLoading || (!!firebaseUser && !user && authStatus === "degraded")
        ? "auth"
        : user && babyLoading
        ? "children"
        : null;

    if (!nextPhase) {
      setBootStalled(false);
      setStallPhase(null);
      return;
    }

    setBootStalled(false);
    setStallPhase(nextPhase);

    const timer = setTimeout(() => {
      setStallPhase(nextPhase);
      setBootStalled(true);
    }, BOOT_NETWORK_TIMEOUT_MS);

    return () => clearTimeout(timer);
  }, [authLoading, user, firebaseUser, authStatus, babyLoading, bootRetryKey]);

  // P17a: Extract prefetch as useCallback
  const prefetchToday = useCallback(async (childId: string) => {
    try {
      // S7.5 : lecture partagée avec le préchargement de BabyContext.
      await loadTodayEventsOnce(childId, obtenirEvenementsDuJour);
    } catch (error) {
      console.warn("[BOOT] Préchargement today échoué:", error);
    }
  }, []);

  const prefetchBootResources = useCallback(
    (childId: string, uid: string | null) => {
      const todayKey = new Date().toDateString();
      const resourceKey = `${bootRetryKey}:${uid ?? "anon"}:${childId}:${todayKey}`;

      if (bootResourceKeyRef.current === resourceKey && bootResourcePromiseRef.current) {
        return bootResourcePromiseRef.current;
      }

      // Heures calmes : aligne le fuseau stocké sur celui du téléphone. Hors du
      // Promise.all : le démarrage n'attend pas cette écriture (elle ne lève jamais).
      if (uid) void synchroniserFuseauHoraire();

      const nextPromise = Promise.all([
        prefetchToday(childId),
        obtenirPreferencesNotifications()
          .then((prefs) =>
            setPreferencesCache({
              tips: prefs.tips ?? true,
              insights: prefs.insights ?? true,
              correlations: prefs.correlations ?? true,
            }),
          )
          .catch(() => {}),
        uid
          ? getUserChildAccess(childId, uid)
              .then((accessDoc) => {
                const role = accessDoc?.role ?? null;
                setPermissionsCache({
                  childId,
                  role,
                  canManageContent: canManageEvents(role),
                });
              })
              .catch(() => {})
          : Promise.resolve(),
      ]).then(() => undefined);

      bootResourceKeyRef.current = resourceKey;
      bootResourcePromiseRef.current = nextPromise;
      return nextPromise;
    },
    [bootRetryKey, prefetchToday],
  );

  // S7.5 : le préchargement démarre dès que l'enfant cible est connu et que
  // les verrous (consentement, biométrie) sont passés, en parallèle du délai
  // minimal du splash. `run()` attend ensuite la même promesse (mémoïsée).
  useEffect(() => {
    if (!user || !firebaseUser || hasPendingDeletion(user)) return;
    if (consentCheck !== "granted" || biometricCheck !== "passed") return;
    if (babyLoading && !bootStalled) return;
    const targetChild = activeChild ?? children[0];
    if (!targetChild) return;
    prefetchBootResources(targetChild.id, firebaseUser.uid).catch(() => {});
  }, [
    user,
    firebaseUser,
    consentCheck,
    biometricCheck,
    babyLoading,
    bootStalled,
    activeChild,
    children,
    prefetchBootResources,
  ]);

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      logBoot(
        "state",
        {
          authLoading,
          babyLoading,
          authStatus,
          hasUser: !!user,
          childrenCount: children.length,
        },
      );

      // Étape 1 : Attendre que l'auth soit chargée
      if (authLoading) {
        logBoot("En attente de l'auth");
        return;
      }

      // Étape 2 : Si pas d'utilisateur, vérifier onboarding puis rediriger
      if (!user) {
        if (firebaseUser && authStatus === "degraded") {
          logBoot("Session Firebase connue, user doc en attente");
          return;
        }

        if (!onboardingChecked || !unauthDelayDone) {
          return;
        }
        if (!onboardingDone) {
          if (hasNavigatedRef.current) return;
          hasNavigatedRef.current = true;
          logBoot("Redirection onboarding");
          router.replace("/(auth)/onboarding");
        } else {
          if (hasNavigatedRef.current) return;
          hasNavigatedRef.current = true;
          logBoot("Redirection login");
          router.replace("/(auth)/login");
        }
        return;
      }

      if (hasPendingDeletion(user)) {
        if (hasNavigatedRef.current) return;
        hasNavigatedRef.current = true;
        logBoot("Redirection pending deletion");
        router.replace("/(auth)/pending-deletion");
        return;
      }

      // Étape 2.4 : consentement données de santé (RGPD art. 9). Absent ou
      // version obsolète → écran de consentement bloquant. Lecture unique.
      if (consentCheck === "pending" && !consentCheckStartedRef.current) {
        const uid = firebaseUser?.uid;
        if (!uid) return;
        consentCheckStartedRef.current = true;
        setConsentCheck("running");
        const generation = bootGenerationRef.current;
        try {
          const granted = await withBootTimeout(fetchHealthConsentStatus(uid));
          if (generation !== bootGenerationRef.current) return;
          if (granted) {
            setConsentCheck("granted");
          } else {
            if (hasNavigatedRef.current) return;
            hasNavigatedRef.current = true;
            logBoot("Consentement santé manquant, redirection");
            router.replace("/(auth)/health-consent");
          }
        } catch (error) {
          // Unknown state (offline...): do not let the user through, offer retry.
          if (generation !== bootGenerationRef.current) return;
          console.warn("[BOOT] Lecture du consentement échouée:", error);
          captureServiceError(error, {
            service: "boot",
            operation: error instanceof BootStepTimeoutError ? "consentRead.timeout" : "consentRead",
          });
          consentCheckStartedRef.current = false;
          setConsentCheck("error");
        }
        return;
      }

      if (consentCheck === "running" || consentCheck === "error") {
        return;
      }

      // Étape 2.5 : verrou biométrique. Si l'utilisateur a activé le verrou,
      // on prompte avant tout chargement enfants. Échec → signOut + login.
      if (biometricCheck === "pending" && !biometricCheckStartedRef.current) {
        biometricCheckStartedRef.current = true;
        const generation = bootGenerationRef.current;
        let enabled: boolean;
        try {
          enabled = await withBootTimeout(isBiometricEnabled());
        } catch (error) {
          // Lecture locale bloquée : on ne laisse pas passer sans le verrou,
          // et on ne déconnecte pas non plus. « Réessayer » relance l'étape.
          captureServiceError(error, {
            service: "boot",
            operation: error instanceof BootStepTimeoutError ? "biometricEnabled.timeout" : "biometricEnabled",
          });
          if (generation === bootGenerationRef.current) setBootTooLong(true);
          return;
        }
        if (generation !== bootGenerationRef.current) return;
        if (!enabled) {
          setBiometricCheck("passed");
        } else {
          setBiometricCheck("running");
          try {
            const expectedUid = await unlockWithBiometric();
            if (generation !== bootGenerationRef.current) return;
            if (expectedUid && expectedUid === firebaseUser?.uid) {
              setBiometricCheck("passed");
            } else {
              setBiometricCheck("failed");
            }
          } catch (error) {
            if (generation !== bootGenerationRef.current) return;
            captureServiceError(error, { service: "boot", operation: "biometricUnlock" });
            setBiometricCheck("failed");
          }
        }
        return;
      }

      // « pending » avec l'étape déjà lancée = lecture du réglage en cours (ou
      // bloquée) : on attend. Sans ce garde, un nouveau rendu pendant la
      // lecture sautait le verrou et ouvrait l'accueil sans empreinte.
      if (biometricCheck === "pending" || biometricCheck === "running") {
        return;
      }

      if (biometricCheck === "failed") {
        if (hasNavigatedRef.current) return;
        hasNavigatedRef.current = true;
        logBoot("Verrou biométrique refusé — signOut puis login");
        try {
          await signOut();
        } catch {
          // ignored — on route quand même vers login
        }
        router.replace("/(auth)/login");
        return;
      }

      // Étape 3 : Attendre que les enfants soient chargés
      // IMPORTANT : babyLoading doit être false ET on doit avoir vérifié les enfants
      if (babyLoading) {
        const canContinueWithResolvedChild =
          bootStalled && (children.length > 0 || !!activeChild);
        if (canContinueWithResolvedChild) {
          logBoot("Chargement enfants lent, démarrage avec données résolues");
        } else {
          logBoot("En attente du chargement des enfants");
          return;
        }
      }

      if (!delayDone) {
        logBoot("Attente du délai minimum");
        return;
      }

      // Étape 4 : Déterminer la destination
      let navigate: () => void;

      if (children.length === 0) {
        logBoot("Aucun enfant, redirection add-baby");
        navigate = () => router.replace({ pathname: "/(drawer)/add-baby", params: { firstRun: "true" } } as any);
      } else {
        const targetChild = activeChild ?? children[0];
        if (!targetChild) {
          logBoot("Aucun enfant actif résolu, redirection child-picker");
          navigate = () => router.replace("/child-picker");
        } else {
          logBoot("Redirection baby", { childId: targetChild.id });

          if (
            !activeChild &&
            bootAssignedChildIdRef.current !== targetChild.id
          ) {
            bootAssignedChildIdRef.current = targetChild.id;
            setActiveChild(targetChild);
          }

          const preloadTimeout = new Promise((resolve) =>
            setTimeout(resolve, 2500),
          );
          const uid = firebaseUser?.uid ?? null;
          await Promise.race([
            prefetchBootResources(targetChild.id, uid),
            preloadTimeout,
          ]);
          if (cancelled) return;

          navigate = () => router.replace("/(drawer)/baby" as any);
        }
      }

      if (hasNavigatedRef.current) return;
      hasNavigatedRef.current = true;
      logBoot("Navigation");
      startupSpanRef.current?.end();
      navigate!();
    };

    run();

    return () => {
      cancelled = true;
    };
  }, [
    authLoading,
    authStatus,
    babyLoading,
    delayDone,
    unauthDelayDone,
    onboardingChecked,
    onboardingDone,
    user,
    firebaseUser,
    children,
    activeChild,
    setActiveChild,
    prefetchBootResources,
    bootStalled,
    biometricCheck,
    consentCheck,
    signOut,
  ]);

  const hasAuthDegradedSession =
    authStatus === "degraded" && !!firebaseUser && !user;
  const isOffline =
    netInfo.isConnected === false || netInfo.isInternetReachable === false;
  const networkFallback =
    hasAuthDegradedSession ||
    consentCheck === "error" ||
    (bootStalled && (authLoading || (!!user && babyLoading && children.length === 0)));
  const showBootFallback = networkFallback || bootTooLong;

  // Demande d'empreinte affichée : l'utilisateur peut prendre son temps, la
  // carte « Démarrage trop long » n'apparaît qu'au bout d'une minute.
  const biometricPromptOpen = biometricCheck === "running";
  useEffect(() => {
    const timer = setTimeout(() => {
      if (!hasNavigatedRef.current) setBootTooLong(true);
    }, biometricPromptOpen ? BOOT_WATCHDOG_BIOMETRIC_MS : BOOT_WATCHDOG_MS);
    return () => clearTimeout(timer);
  }, [bootRetryKey, biometricPromptOpen]);

  // Essais automatiques épuisés : on le dit, pour que l'utilisateur appuie.
  const [autoRetryExhausted, setAutoRetryExhausted] = useState(false);

  /**
   * auto : essai lancé par l'app (retour du réseau, filet de 10 s). Il ne
   * touche jamais à l'étape d'empreinte : relancer une demande que
   * l'utilisateur est en train de faire l'annulerait (et sur Android, un
   * second appel peut échouer et déconnecter). Seul l'appui sur
   * « Réessayer » relance une demande d'empreinte perdue.
   */
  const handleRetry = useCallback((opts?: { auto?: boolean }) => {
    const auto = opts?.auto === true;
    setBootStalled(false);
    setBootTooLong(false);
    if (!auto) setAutoRetryExhausted(false);
    setBootRetryKey((prev) => prev + 1);
    if (consentCheck === "error" || consentCheck === "running") {
      bootGenerationRef.current += 1;
      consentCheckStartedRef.current = false;
      setConsentCheck("pending");
    }
    // Étape d'empreinte jamais terminée (fenêtre perdue) : on la relance.
    if (!auto && (biometricCheck === "pending" || biometricCheck === "running")) {
      bootGenerationRef.current += 1;
      biometricCheckStartedRef.current = false;
      setBiometricCheck("pending");
    }
    bootAssignedChildIdRef.current = null;
    bootResourceKeyRef.current = null;
    bootResourcePromiseRef.current = null;

    if (firebaseUser) {
      refreshUser().catch((error) => {
        console.warn("[BOOT] refreshUser échoué:", error);
      });
    }
  }, [consentCheck, biometricCheck, firebaseUser, refreshUser]);

  // Retour automatique après un démarrage hors ligne (test 27), sans attendre
  // un appui sur « Réessayer » :
  // 1. dès qu'internet est confirmé joignable (isInternetReachable passe à
  //    vrai : au simple retour du Wi-Fi il vaut encore null, et un essai
  //    lancé à ce moment échoue) ;
  // 2. filet : tant que l'écran « Connexion … » est affiché et que le
  //    téléphone n'est pas hors ligne, un essai toutes les 10 s (12 au plus),
  //    car Firestore peut mettre jusqu'à ~60 s à se reconnecter seul.
  const handleRetryRef = useRef(handleRetry);
  useEffect(() => {
    handleRetryRef.current = handleRetry;
  }, [handleRetry]);
  const isOnline = netInfo.isConnected === true && netInfo.isInternetReachable === true;
  const wasOnlineRef = useRef(isOnline);
  // Compteur hors effet : un essai masque l'écran « Connexion … » quelques
  // secondes puis il revient ; le compteur ne repart à zéro qu'à un nouveau
  // retour du réseau, sinon le plafond ne serait jamais atteint.
  const autoRetryCountRef = useRef(0);
  useEffect(() => {
    const cameOnline = !wasOnlineRef.current && isOnline;
    wasOnlineRef.current = isOnline;
    if (!cameOnline) return;
    autoRetryCountRef.current = 0;
    setAutoRetryExhausted(false);
    if (networkFallback) handleRetryRef.current({ auto: true });
  }, [isOnline, networkFallback]);

  // Problèmes de réseau seulement : on ne relance jamais toutes les 10 s une
  // demande d'empreinte que l'utilisateur est peut-être en train de faire.
  const autoRetryActive = networkFallback && !isOffline;
  useEffect(() => {
    if (!autoRetryActive) return;
    const interval = setInterval(() => {
      if (autoRetryCountRef.current >= BOOT_AUTO_RETRY_MAX) {
        clearInterval(interval);
        setAutoRetryExhausted(true);
        return;
      }
      autoRetryCountRef.current += 1;
      handleRetryRef.current({ auto: true });
    }, BOOT_AUTO_RETRY_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [autoRetryActive]);

  const tooLongOnly = bootTooLong && !networkFallback;
  const fallbackTitle = isOffline
    ? "Connexion indisponible"
    : tooLongOnly
    ? "Démarrage trop long"
    : "Connexion trop lente";
  const fallbackMessage = tooLongOnly
    ? "Le démarrage prend plus de temps que prévu. Réessayez ; si cela continue, fermez puis rouvrez l'application."
    : hasAuthDegradedSession || stallPhase === "auth" || consentCheck === "error"
      ? "Impossible de vérifier votre session pour le moment. Vérifiez votre réseau puis réessayez."
      : "Les données de votre enfant mettent trop de temps à charger. Vérifiez votre réseau puis réessayez.";

  return (
    <View style={styles.root}>
      <BackgroundImage />
      <SafeAreaView
        style={styles.safe}
        edges={["top", "bottom"]}
        accessibilityRole="summary"
        accessibilityLabel="Écran de chargement"
      >
        <View style={styles.content}>
          <Image
            source={require("@/assets/images/icon.png")}
            style={styles.logo}
            resizeMode="contain"
            accessibilityLabel={`Logo ${APP_NAME}`}
          />
          {showBootFallback ? (
            <View style={styles.feedbackCard}>
              <Text style={styles.feedbackTitle}>{fallbackTitle}</Text>
              <Text style={styles.feedbackText}>{fallbackMessage}</Text>
              {!tooLongOnly && (
                <Text style={styles.feedbackHint}>
                  {isOffline
                    ? "Aucune connexion internet détectée."
                    : autoRetryExhausted
                    ? "La connexion semble instable. Appuyez sur Réessayer."
                    : "La connexion semble instable."}
                </Text>
              )}
              <Pressable
                style={({ pressed }) => [
                  styles.retryButton,
                  pressed && styles.retryButtonPressed,
                ]}
                onPress={() => handleRetry()}
                accessibilityRole="button"
                accessibilityLabel="Réessayer le démarrage"
              >
                <Text style={styles.retryButtonText}>Réessayer</Text>
              </Pressable>
              {hasAuthDegradedSession && (
                // Issue pour un compte qui ne se charge jamais (droits, compte
                // abîmé) : la session est gardée en mode dégradé, sans autre
                // moyen d'en sortir ou de changer de compte.
                <Pressable
                  style={({ pressed }) => [styles.signOutLink, pressed && styles.retryButtonPressed]}
                  onPress={() => {
                    signOut().catch((error) => console.warn("[BOOT] signOut échoué:", error));
                  }}
                  accessibilityRole="button"
                  hitSlop={8}
                >
                  <Text style={styles.signOutText}>Se déconnecter</Text>
                </Pressable>
              )}
            </View>
          ) : (
            <IconPulseDots
              size={20}
              gap={16}
              minOpacity={0.3}
              maxOpacity={0.9}
              minScale={0.9}
              maxScale={1.1}
              cycleDurationMs={2400}
            />
          )}
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  safe: {
    flex: 1,
    backgroundColor: "transparent",
  },
  content: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
    paddingBottom: 40,
    gap: 32,
  },
  logo: {
    width: 120,
    height: 120,
    borderRadius: 28,
  },
  feedbackCard: {
    width: "100%",
    maxWidth: 340,
    alignItems: "center",
    paddingVertical: 24,
    paddingHorizontal: 20,
    borderRadius: 20,
    backgroundColor: "rgba(255,255,255,0.9)",
    gap: 12,
  },
  feedbackTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: neutralColors.textStrong,
    textAlign: "center",
  },
  feedbackText: {
    fontSize: 14,
    lineHeight: 20,
    color: "#374151",
    textAlign: "center",
  },
  feedbackHint: {
    fontSize: 13,
    color: neutralColors.textLight,
    textAlign: "center",
  },
  retryButton: {
    minWidth: 160,
    paddingVertical: 12,
    paddingHorizontal: 18,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#ec4899",
  },
  retryButtonPressed: {
    opacity: 0.88,
  },
  retryButtonText: {
    fontSize: 15,
    fontWeight: "700",
    color: neutralColors.white,
  },
  signOutLink: {
    minHeight: 44,
    paddingHorizontal: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  signOutText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#374151",
    textDecorationLine: "underline",
  },
});

// P12b: ErrorBoundary wrapper
export default function BootScreen() {
  return (
    <ErrorBoundary>
      <BootScreenContent />
    </ErrorBoundary>
  );
}
