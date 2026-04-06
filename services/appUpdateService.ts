// services/appUpdateService.ts
// Checks for new app versions via Firestore app_config collection

import { doc, getDoc } from "firebase/firestore";
import { Platform } from "react-native";
import Constants from "expo-constants";
import { db } from "../config/firebase";
import { captureServiceError } from "@/utils/errorReporting";

export interface AppVersionInfo {
  latestVersion: string;
  minVersion?: string; // Force update below this version
  releaseNotes?: string;
  storeUrl: {
    ios: string;
    android: string;
  };
}

const APP_CONFIG_DOC = "latest_version";

/**
 * Get the current app version from Expo config
 */
export function getCurrentVersion(): string {
  return Constants.expoConfig?.version ?? "1.0.0";
}

/**
 * Compare two semver strings. Returns:
 * -1 if a < b, 0 if a === b, 1 if a > b
 */
function compareSemver(a: string, b: string): number {
  const pa = a.split(".").map(Number);
  const pb = b.split(".").map(Number);
  for (let i = 0; i < 3; i++) {
    const na = pa[i] ?? 0;
    const nb = pb[i] ?? 0;
    if (na < nb) return -1;
    if (na > nb) return 1;
  }
  return 0;
}

/**
 * Check if a new version is available
 */
export async function checkForUpdate(): Promise<{
  updateAvailable: boolean;
  forceUpdate: boolean;
  latestVersion: string;
  storeUrl: string;
} | null> {
  try {
    const docRef = doc(db, "app_config", APP_CONFIG_DOC);
    const docSnap = await getDoc(docRef);

    if (!docSnap.exists()) return null;

    const data = docSnap.data() as AppVersionInfo;
    const currentVersion = getCurrentVersion();
    const isOutdated = compareSemver(currentVersion, data.latestVersion) < 0;
    const isForceUpdate = data.minVersion
      ? compareSemver(currentVersion, data.minVersion) < 0
      : false;

    const storeUrl = Platform.OS === "ios"
      ? data.storeUrl.ios
      : data.storeUrl.android;

    return {
      updateAvailable: isOutdated,
      forceUpdate: isForceUpdate,
      latestVersion: data.latestVersion,
      storeUrl,
    };
  } catch (e) {
    console.error("[appUpdateService] checkForUpdate error:", e);
    captureServiceError(e, { service: "appUpdate", operation: "checkForUpdate" });
    return null;
  }
}

/**
 * Get the store URL for the current platform
 */
export function getStoreUrl(): string {
  const bundleId = "com.tesfa.suivibaby";
  if (Platform.OS === "ios") {
    // App Store link — replace APPLE_ID with real ID when published
    return `https://apps.apple.com/app/samaye/${bundleId}`;
  }
  return `https://play.google.com/store/apps/details?id=${bundleId}`;
}
