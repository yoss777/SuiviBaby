import { parseResetPasswordUrl } from "@/utils/passwordResetLink";
import * as Sentry from "@sentry/react-native";
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
import { DarkTheme, DefaultTheme, ThemeProvider as NavigationThemeProvider } from "@react-navigation/native";
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
import { startAutoSync } from "@/services/offlineQueueService";
import { setOnFailure as setOptimisticOnFailure } from "@/services/optimisticEventsStore";
import { ensureFirebaseAppCheck } from "@/config/firebase";
import { filterBreadcrumb, filterEvent, filterTransaction } from "@/utils/sentryFilters";

Sentry.init({
  dsn: process.env.EXPO_PUBLIC_SENTRY_DSN || "",
  enabled: !__DEV__,
  // Never send health data, e-mails, names or transcripts (audit A6):
  // console breadcrumbs dropped, HTTP bodies removed, sensitive keys scrubbed.
  sendDefaultPii: false,
  beforeBreadcrumb: (breadcrumb) => filterBreadcrumb(breadcrumb),
  beforeSend: (event) => filterEvent(event),
  beforeSendTransaction: (event) => filterTransaction(event),
  environment: __DEV__ ? "development" : "production",
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
  const { showToast } = useToast();

  useEffect(() => {
    setOptimisticOnFailure((message) => showToast(message));
    return () => {
      setOptimisticOnFailure(null);
    };
  }, [showToast]);

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
      // Gérer les URLs Firebase action (mode=resetPassword&oobCode=xxx)
      // et les deep links suivibaby://reset-password?oobCode=xxx
      // Le code est validé (forme et mode) avant d'atteindre le routeur.
      const oobCode = parseResetPasswordUrl(url);
      if (oobCode) {
        router.replace({
          pathname: "/(auth)/reset-password",
          params: { oobCode },
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
      background: Colors[colorScheme].background,
      card: Colors[colorScheme].background,
      text: Colors[colorScheme].text,
      primary: Colors[colorScheme].tint,
      border: Colors[colorScheme].tabIconDefault + "30",
    },
  };

  return (
    <NavigationThemeProvider value={navigationTheme}>
      <Stack initialRouteName="boot">
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
          name="explore"
          options={{ headerShown: false }}
        />
        <Stack.Screen
          name="index"
          options={{ headerShown: false }}
        />
      </Stack>
      <StatusBar
        style={colorScheme === "dark" ? "light" : "dark"}
        translucent={false}
        backgroundColor={Colors[colorScheme].background}
      />
    </NavigationThemeProvider>
  );
}
