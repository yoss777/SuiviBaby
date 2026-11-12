import { parseEmailActionUrl } from "@/utils/passwordResetLink";
import { applyEmailVerificationLink } from "@/utils/emailVerification";
import * as Sentry from "@sentry/react-native";
import { getNeutralColors } from "@/constants/dashboardColors";
import { Colors } from "@/constants/theme";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { AuthProvider } from "@/contexts/AuthContext";
import { BabyProvider } from "@/contexts/BabyContext";
import { ModalProvider } from "@/contexts/ModalContext";
import { MomentsNotificationProvider } from "@/contexts/MomentsNotificationContext";
import { ThemeProvider as AppThemeProvider } from "@/contexts/ThemeContext";
import { PremiumProvider } from "@/contexts/PremiumContext";
import { SheetProvider } from "@/contexts/SheetContext";
import { SuccessAnimationProvider } from "@/contexts/SuccessAnimationContext";
import { ToastProvider, useToast } from "@/contexts/ToastContext";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { composeProviders } from "@/utils/composeProviders";
import { DarkTheme, DefaultTheme, ThemeProvider as NavigationThemeProvider } from "expo-router/react-navigation";
import { Stack, useRouter } from "expo-router";
import * as Linking from "expo-linking";
import { StatusBar } from "expo-status-bar";
import * as Notifications from "expo-notifications";
import { type ReactNode, useEffect } from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import "react-native-reanimated";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { PortalProvider } from "@gorhom/portal";
import { GlobalSheetManager } from "@/components/ui/GlobalSheetManager";
import { InvitationListener } from "@/components/ui/InvitationListener";
import { AppUpdateManager } from "@/components/ui/AppUpdateManager";

import { setupNotificationHandler } from "@/services/localNotificationService";
import { cleanupStaleExports } from "@/services/tempShareService";
import { setOnQueueFailure, startAutoSync } from "@/services/offlineQueueService";
import { retryFailedOptimistic } from "@/services/eventsService";
import { setOnFailure as setOptimisticOnFailure } from "@/services/optimisticEventsStore";
import { auth, ensureFirebaseAppCheck } from "@/config/firebase";
import { applyActionCode } from "firebase/auth";
import { Alert } from "react-native";
import { getSentryEnvironment } from "@/config/firebaseEnv";
import {
  filterBreadcrumb,
  filterEvent,
  filterTransaction,
  isTransientNetworkNoise,
} from "@/utils/sentryFilters";

Sentry.init({
  dsn: process.env.EXPO_PUBLIC_SENTRY_DSN || "",
  enabled: !__DEV__,
  // Never send health data, e-mails, names or transcripts (audit A6):
  // console breadcrumbs dropped, HTTP bodies removed, sensitive keys scrubbed.
  sendDefaultPii: false,
  beforeBreadcrumb: (breadcrumb) => filterBreadcrumb(breadcrumb),
  beforeSend: (event) => (isTransientNetworkNoise(event) ? null : filterEvent(event)),
  beforeSendTransaction: (event) => filterTransaction(event),
  // production / staging selon APP_ENV du build (config/firebaseEnv.ts).
  environment: getSentryEnvironment(__DEV__),
  // Performance monitoring
  tracesSampleRate: 0.2,
  enableAutoSessionTracking: true,
  sessionTrackingIntervalMillis: 30_000,
  // Breadcrumbs pour contexte des erreurs
  enableAutoPerformanceTracing: true,
  attachStacktrace: true,
  // Release / dist: set by the native SDK from the bundle id, version and
  // build number — the names the source maps upload uses.
  enableCaptureFailedRequests: true,
});

// Configurer le handler de notifications locales (rappels)
setupNotificationHandler();

// Démarrer la synchronisation automatique de la queue offline
startAutoSync();

// Purge les anciens fichiers d'export (données de santé) restés dans le cache.
void cleanupStaleExports();

// Initialiser App Check le plus tôt possible pour les appels Functions.
void ensureFirebaseAppCheck();

export const unstable_settings = {
  anchor: "(drawer)",
};

// Wrapper pour GestureHandlerRootView (nécessite style prop)
function GestureWrapper({ children }: { children: ReactNode }) {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      {children}
    </GestureHandlerRootView>
  );
}

/**
 * Provider stack — ordre important (premier = outermost).
 * Dépendances :
 *   Auth dépend de Modal
 *   Theme dépend de Auth
 *   Baby dépend de Auth
 *   MomentsNotification dépend de Auth + Baby
 *   Migration dépend de Auth + Modal
 */
const AppProviders = composeProviders([
  ErrorBoundary,
  GestureWrapper,
  SafeAreaProvider,
  PortalProvider,
  ToastProvider,
  ModalProvider,
  AuthProvider,
  AppThemeProvider,
  PremiumProvider,
  BabyProvider,
  MomentsNotificationProvider,
  SheetProvider,
  SuccessAnimationProvider,
]);

function RootLayout() {
  return (
    <AppProviders>
      <OptimisticFailureToastBridge />
      <AppNavigation />
      <GlobalSheetManager />
      <InvitationListener />
      <AppUpdateManager />
    </AppProviders>
  );
}

export default Sentry.wrap(RootLayout);

function OptimisticFailureToastBridge() {
  const { showToast, showActionToast } = useToast();

  useEffect(() => {
    // Échec d'une saisie : on dit laquelle, et on propose « Réessayer » avec
    // les données conservées (sauf si un nouvel envoi ne peut pas réussir).
    setOptimisticOnFailure((message, failure) => {
      if (failure?.retryable) {
        showActionToast(message, "Réessayer", () => retryFailedOptimistic(failure), 8000);
      } else {
        showToast(message, 5000);
      }
    });
    // Saisies hors ligne abandonnées par la file : message, détail dans la bannière.
    setOnQueueFailure(({ message }) => showToast(message, 6000));
    return () => {
      setOptimisticOnFailure(null);
      setOnQueueFailure(null);
    };
  }, [showToast, showActionToast]);

  return null;
}

function AppNavigation() {
  const colorScheme = useColorScheme() ?? "light";
  const router = useRouter();

  // Handle tap on a notification → navigate to the relevant screen
  useEffect(() => {
    const subscription = Notifications.addNotificationResponseReceivedListener(
      (response) => {
        const data = response.notification.request.content.data as
          | { route?: string }
          | undefined;
        if (data?.route) {
          router.push(data.route as any);
        }
      },
    );
    return () => subscription.remove();
  }, [router]);

  // Intercepter les deep links Firebase (reset password)
  useEffect(() => {
    const handleUrl = (event: { url: string }) => {
      const url = event.url;
      // Liens d'action Firebase (mode=resetPassword ou verifyEmail, même page)
      // et deep links suivibaby://reset-password?oobCode=xxx
      // Le code est validé (forme et mode) avant d'atteindre le routeur.
      const action = parseEmailActionUrl(url);
      if (action?.mode === "resetPassword") {
        router.replace({
          pathname: "/(auth)/reset-password",
          params: { oobCode: action.oobCode },
        });
      } else if (action?.mode === "verifyEmail") {
        // Lien de vérification : même page d'action que la réinitialisation
        // (réglage Firebase) ; il ne doit jamais ouvrir l'écran du mot de passe.
        void applyEmailVerificationLink(action.oobCode, {
          applyCode: (code) => applyActionCode(auth, code),
          currentUser: () => auth.currentUser,
        }).then((result) => {
          if (result === "verified") {
            Alert.alert("Adresse e-mail vérifiée", "Merci, votre adresse est confirmée.");
            if (auth.currentUser) router.replace("/boot");
          } else {
            Alert.alert(
              "Lien expiré",
              "Ce lien de vérification n'est plus valide. Demandez un nouvel e-mail depuis l'application.",
            );
          }
        });
      }
    };

    // Gérer l'URL initiale (app ouverte via deep link)
    Linking.getInitialURL().then((url) => {
      if (url) handleUrl({ url });
    });

    // Gérer les URLs reçues pendant que l'app est ouverte
    const subscription = Linking.addEventListener("url", handleUrl);
    return () => subscription.remove();
  }, [router]);

  const baseTheme = colorScheme === "dark" ? DarkTheme : DefaultTheme;
  const navigationTheme = {
    ...baseTheme,
    colors: {
      ...baseTheme.colors,
      // Une seule couleur de fond pour l'en-tête et l'écran (nc.background) :
      // plus de ligne de couture #fff / #f9fafb en clair.
      background: getNeutralColors(colorScheme).background,
      card: getNeutralColors(colorScheme).background,
      text: Colors[colorScheme].text,
      primary: Colors[colorScheme].tint,
      border: Colors[colorScheme].tabIconDefault + "30",
    },
  };

  return (
    <NavigationThemeProvider value={navigationTheme}>
      {/* En-tête commun des écrans de la pile racine (paramètres, partage…) :
          bouton retour et titre dans la couleur du texte, comme les écrans du
          menu, au lieu de la couleur primaire du thème (bleu/sarcelle). */}
      <Stack
        screenOptions={{
          headerTintColor: Colors[colorScheme].text,
          headerTitleStyle: { color: Colors[colorScheme].text },
          headerStyle: { backgroundColor: Colors[colorScheme].background },
          headerShadowVisible: false,
          contentStyle: { backgroundColor: Colors[colorScheme].background },
        }}
      >
        <Stack.Screen
          name="(auth)"
          options={{ headerShown: false }}
        />
        <Stack.Screen
          name="(drawer)"
          options={{ headerShown: false }}
        />
        <Stack.Screen
          name="boot"
          options={{ headerShown: false }}
        />
        <Stack.Screen
          name="child-picker"
          options={{ headerShown: false }}
        />
        <Stack.Screen
          name="index"
          options={{ headerShown: false }}
        />
      </Stack>
      <StatusBar style={colorScheme === "dark" ? "light" : "dark"} />
    </NavigationThemeProvider>
  );
}
