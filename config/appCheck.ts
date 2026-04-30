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
// Keep @react-native-firebase pinned to a major that ships with Expo SDK 53;
// bump it together with the SDK upgrade, never on its own.
import Constants from "expo-constants";
import {
  CustomProvider,
  ReCaptchaV3Provider,
  initializeAppCheck,
} from "firebase/app-check";
import type { FirebaseApp } from "firebase/app";
import { Platform } from "react-native";

const DEFAULT_TOKEN_TTL_MS = 55 * 60 * 1000;

type ExpoExtra = {
  appCheck?: {
    nativeConfigured?: boolean;
  };
};

let appCheckInitializationPromise: Promise<void> | null = null;
let appCheckInitialized = false;

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

function isNativeAppCheckConfigured(): boolean {
  return getAppCheckExtra()?.nativeConfigured === true;
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
  if (!isNativeAppCheckConfigured()) {
    return;
  }

  const { default: reactNativeFirebaseAppCheck } = await import(
    "@react-native-firebase/app-check"
  );

  const nativeAppCheck = reactNativeFirebaseAppCheck();
  const provider = nativeAppCheck.newReactNativeFirebaseAppCheckProvider();

  provider.configure({
    android: {
      provider: __DEV__ ? "debug" : "playIntegrity",
      debugToken: process.env.EXPO_PUBLIC_FIREBASE_APPCHECK_DEBUG_TOKEN_ANDROID,
    },
    apple: {
      provider: __DEV__ ? "debug" : "appAttestWithDeviceCheckFallback",
      debugToken: process.env.EXPO_PUBLIC_FIREBASE_APPCHECK_DEBUG_TOKEN_APPLE,
    },
  });

  await nativeAppCheck.initializeAppCheck({
    provider,
    isTokenAutoRefreshEnabled: true,
  });

  initializeAppCheck(app, {
    provider: new CustomProvider({
      async getToken() {
        const result = await nativeAppCheck.getToken(false);
        return {
          token: result.token,
          expireTimeMillis: getExpireTimeMillis(result.token),
        };
      },
    }),
    isTokenAutoRefreshEnabled: true,
  });
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
      console.warn("[AppCheck] Initialization skipped:", error);
    });
  }

  return appCheckInitializationPromise;
}
