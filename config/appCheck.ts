// App Check setup notes
// ─────────────────────
// We rely on two SDKs side-by-side, on purpose:
//   - firebase/app-check (web): ReCaptchaV3Provider for the web build
//   - @react-native-firebase/app-check (native): the only path on iOS /
//     Android that can do real App Attest / Play Integrity attestation.
//     The JS Firebase SDK does not implement native attestation on RN.
// The native package is loaded via dynamic import below, gated by
// nativeAppCheckConfigured (= GoogleService-Info.plist + google-services.json
// present at build time). app.config.js registers the matching Expo plugins.
// Keep @react-native-firebase on a major tested with the current Expo SDK
// (58: v26.4 — v27 resolves Firebase through SPM only and needs dynamic
// frameworks); bump it together with the SDK upgrade, never on its own.
import Constants from "expo-constants";
import { captureServiceError } from "@/utils/errorReporting";
import NetInfo from "@react-native-community/netinfo";
import { getSentryEnvironment } from "./firebaseEnv";
import { loadNativeAppCheck } from "./loadNativeAppCheck";
import {
  CustomProvider,
  ReCaptchaV3Provider,
  getToken as getJsAppCheckToken,
  initializeAppCheck,
} from "firebase/app-check";
import type { AppCheck } from "firebase/app-check";
import type { FirebaseApp } from "firebase/app";
import { Platform } from "react-native";

const DEFAULT_TOKEN_TTL_MS = 55 * 60 * 1000;
// Au démarrage, le fournisseur natif peut répondre « provider-not-ready ».
const TOKEN_CHECK_ATTEMPTS = 3;
const TOKEN_CHECK_DELAY_MS = 2000;
const MAX_REPORTS_PER_OPERATION = 5;
const NETWORK_CHECK_TIMEOUT_MS = 2000;

type ExpoExtra = {
  appCheck?: {
    nativeConfigured?: boolean;
  };
};

let appCheckInitializationPromise: Promise<void> | null = null;
let appCheckInitialized = false;
const reportedFailures = new Set<string>();
const reportsByOperation = new Map<string, number>();
let startupCheckDone = false;

function getAppCheckExtra(): ExpoExtra["appCheck"] {
  return ((Constants.expoConfig?.extra ?? {}) as ExpoExtra).appCheck;
}

function decodeJwtPayload(token: string): Record<string, unknown> | null {
  const parts = token.split(".");
  if (parts.length < 2) {
    return null;
  }

  const normalizedPayload = parts[1].replace(/-/g, "+").replace(/_/g, "/");
  const paddedPayload = normalizedPayload.padEnd(
    Math.ceil(normalizedPayload.length / 4) * 4,
    "=",
  );

  try {
    if (typeof globalThis.atob === "function") {
      return JSON.parse(globalThis.atob(paddedPayload)) as Record<string, unknown>;
    }

    return JSON.parse(Buffer.from(paddedPayload, "base64").toString("utf8")) as Record<
      string,
      unknown
    >;
  } catch {
    return null;
  }
}

function getExpireTimeMillis(token: string): number {
  const payload = decodeJwtPayload(token);
  const exp = Number(payload?.exp);

  if (Number.isFinite(exp) && exp > 0) {
    return exp * 1000;
  }

  return Date.now() + DEFAULT_TOKEN_TTL_MS;
}

function failureCode(error: unknown): string {
  const code = (error as { code?: unknown } | null)?.code;
  return typeof code === "string" ? code : "unknown";
}

function isProviderNotReady(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return `${failureCode(error)} ${message}`.includes("provider-not-ready");
}

// Message sans valeur variable ni suite ressemblant à un jeton.
function failureDetail(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message
    .replace(/[A-Za-z0-9_.-]{24,}/g, "[masqué]")
    .replace(/\d+/g, "#")
    .slice(0, 120);
}

// Seul `isConnected` est fiable ici : `isInternetReachable` peut valoir false sur
// un réseau qui bloque la sonde de NetInfo alors que Firebase répond. Sans réponse
// à temps, on remonte : mieux vaut une alerte de trop qu'une panne invisible.
async function isDeviceOffline(): Promise<boolean> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const timeout = new Promise<null>((resolve) => {
      timer = setTimeout(() => resolve(null), NETWORK_CHECK_TIMEOUT_MS);
    });
    const state = await Promise.race([NetInfo.fetch(), timeout]);
    return state?.isConnected === false;
  } catch {
    return false;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

// Sans jeton, le SDK appelle quand même la fonction, sans preuve et sans
// erreur visible : c'est ainsi que la panne iOS est restée inaperçue. Une
// remontée par cause et par lancement (le rafraîchissement automatique réessaie).
// L'erreur est réécrite : le filtre « connexion » de captureServiceError classe
// tout code `unavailable` comme une coupure, ce qui masquerait une vraie panne
// d'attestation. Seul un téléphone réellement hors ligne est ignoré.
async function reportAppCheckFailure(error: unknown, operation: string): Promise<void> {
  try {
    const code = failureCode(error);
    if (code.endsWith("network-request-failed") || (await isDeviceOffline())) return;
    const detail = failureDetail(error);
    const key = `${operation}:${code}:${detail}`;
    const operationCount = reportsByOperation.get(operation) ?? 0;
    if (reportedFailures.has(key) || operationCount >= MAX_REPORTS_PER_OPERATION) return;
    reportedFailures.add(key);
    reportsByOperation.set(operation, operationCount + 1);
    captureServiceError(new Error(`App Check ${operation}: ${code}`), {
      service: "appCheck",
      operation,
      extra: { platform: Platform.OS, code, detail },
    });
  } catch (reportError) {
    console.warn("[AppCheck] Failure report skipped:", reportError);
  }
}

// Demande un premier jeton pour détecter tout de suite une attestation en échec.
async function checkNativeToken(appCheck: AppCheck): Promise<void> {
  try {
    for (let attempt = 1; attempt <= TOKEN_CHECK_ATTEMPTS; attempt += 1) {
      try {
        await getJsAppCheckToken(appCheck, false);
        return;
      } catch (error) {
        // Toute autre erreur passe déjà par le fournisseur (getToken ci-dessous).
        if (!isProviderNotReady(error)) return;
        if (attempt === TOKEN_CHECK_ATTEMPTS) {
          await reportAppCheckFailure(error, "startupToken");
          return;
        }
        await new Promise((resolve) => setTimeout(resolve, TOKEN_CHECK_DELAY_MS));
      }
    }
  } finally {
    startupCheckDone = true;
  }
}

function isNativeAppCheckConfigured(): boolean {
  return getAppCheckExtra()?.nativeConfigured === true;
}

function isNativeAppCheckRuntimeEnabled(): boolean {
  if (!isNativeAppCheckConfigured()) {
    return false;
  }

  // In development, Metro can serve JS to Expo Go or to a dev client that was
  // built before RNFirebase was linked. Importing RNFirebase there hard-crashes
  // with "Native module RNFBAppModule not found". Keep native App Check opt-in
  // for local dev; production builds still initialize it when configured.
  if (__DEV__) {
    return process.env.EXPO_PUBLIC_FIREBASE_APPCHECK_NATIVE_DEV_ENABLED === "true";
  }

  return true;
}

async function initializeWebAppCheck(app: FirebaseApp): Promise<void> {
  const siteKey = process.env.EXPO_PUBLIC_FIREBASE_APPCHECK_WEB_SITE_KEY;
  if (!siteKey) {
    return;
  }

  initializeAppCheck(app, {
    provider: new ReCaptchaV3Provider(siteKey),
    isTokenAutoRefreshEnabled: true,
  });
}

async function initializeNativeAppCheck(app: FirebaseApp): Promise<void> {
  if (!isNativeAppCheckRuntimeEnabled()) {
    if (getSentryEnvironment(__DEV__) === "production") {
      void reportAppCheckFailure(new Error("App Check natif non configuré dans ce build"), "notConfigured");
    }
    return;
  }

  let rnfbAppCheck: typeof import("@react-native-firebase/app-check");
  try {
    rnfbAppCheck = await loadNativeAppCheck();
  } catch (error) {
    console.warn("[AppCheck] Native module unavailable, skipping native App Check:", error);
    void reportAppCheckFailure(error, "nativeModule");
    return;
  }

  // API modulaire (@react-native-firebase v22+ ; l'espace de noms par défaut
  // disparaît en v27).
  const provider = new rnfbAppCheck.ReactNativeFirebaseAppCheckProvider();
  provider.configure({
    android: {
      provider: __DEV__ ? "debug" : "playIntegrity",
      // Jamais dans un build de production : il permettrait d'obtenir des jetons
      // sans attestation.
      debugToken: __DEV__ ? process.env.EXPO_PUBLIC_FIREBASE_APPCHECK_DEBUG_TOKEN_ANDROID : undefined,
    },
    apple: {
      provider: __DEV__ ? "debug" : "appAttestWithDeviceCheckFallback",
      debugToken: __DEV__ ? process.env.EXPO_PUBLIC_FIREBASE_APPCHECK_DEBUG_TOKEN_APPLE : undefined,
    },
  });

  // Synchrone en v26 : l'initialisation native part en arrière-plan ;
  // checkNativeToken vérifie ensuite qu'un jeton est bien obtenu.
  const nativeAppCheck = rnfbAppCheck.initializeAppCheck(undefined, {
    provider,
    isTokenAutoRefreshEnabled: true,
  });

  const appCheck = initializeAppCheck(app, {
    provider: new CustomProvider({
      async getToken() {
        try {
          const result = await rnfbAppCheck.getToken(nativeAppCheck, false);
          return {
            token: result.token,
            expireTimeMillis: getExpireTimeMillis(result.token),
          };
        } catch (error) {
          // Normal pendant le démarrage ; anormal ensuite.
          if (startupCheckDone || !isProviderNotReady(error)) {
            void reportAppCheckFailure(error, "getToken");
          }
          throw error;
        }
      },
    }),
    isTokenAutoRefreshEnabled: true,
  });
  void checkNativeToken(appCheck);
}

async function initializeForCurrentPlatform(app: FirebaseApp): Promise<void> {
  if (appCheckInitialized) {
    return;
  }

  if (Platform.OS === "web") {
    await initializeWebAppCheck(app);
  } else {
    await initializeNativeAppCheck(app);
  }

  appCheckInitialized = true;
}

export function ensureFirebaseAppCheck(app: FirebaseApp): Promise<void> {
  if (!appCheckInitializationPromise) {
    appCheckInitializationPromise = initializeForCurrentPlatform(app).catch((error) => {
      // Sans App Check, les Cloud Functions refusent les appels : ne jamais
      // laisser cet échec silencieux en production.
      console.warn("[AppCheck] Initialization skipped:", error);
      captureServiceError(error, { service: "appCheck", operation: "initialize" });
    });
  }

  return appCheckInitializationPromise;
}
