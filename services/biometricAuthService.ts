import { Platform } from "react-native";

let LocalAuthentication: typeof import("expo-local-authentication") | null =
  null;
let SecureStore: typeof import("expo-secure-store") | null = null;

try {
  LocalAuthentication = require("expo-local-authentication");
  SecureStore = require("expo-secure-store");
} catch {
  // Native modules not available (Expo Go or missing native rebuild)
}

// v2 — passwordless biometric. We store only the user id we expect to find
// in auth.currentUser; the Firebase RN persistence layer keeps the session
// alive separately. The biometric prompt is a presence check, not an
// authentication factor against Firebase.
const BIO_ENABLED_KEY = "suivibaby_bio_enabled_v2";
const BIO_USER_ID_KEY = "suivibaby_bio_uid_v2";
// Intent flag set during onboarding (before any login). Consumed by the
// login screen on first successful sign-in to call enableBiometric() with
// the real uid.
const BIO_OPT_IN_PENDING_KEY = "suivibaby_bio_opt_in_pending_v2";

// v1 — legacy keys that stored email + plaintext password. Purged on first
// launch after upgrading; never read again.
const LEGACY_KEYS = [
  "samaye_bio_email",
  "samaye_bio_password",
  "samaye_bio_enabled",
];
const LEGACY_PURGE_DONE_KEY = "suivibaby_bio_v1_purged";

/**
 * One-shot purge of v1 biometric secrets (email + plaintext password).
 * Safe to call repeatedly — short-circuits after the first successful run.
 */
export async function purgeLegacyBiometricCredentials(): Promise<void> {
  if (!SecureStore) return;
  try {
    const done = await SecureStore.getItemAsync(LEGACY_PURGE_DONE_KEY);
    if (done === "true") return;
    for (const key of LEGACY_KEYS) {
      try {
        await SecureStore.deleteItemAsync(key);
      } catch {
        // best-effort
      }
    }
    await SecureStore.setItemAsync(LEGACY_PURGE_DONE_KEY, "true");
  } catch {
    // non-fatal
  }
}

export async function isBiometricAvailable(): Promise<boolean> {
  if (!LocalAuthentication) return false;
  try {
    const compatible = await LocalAuthentication.hasHardwareAsync();
    if (!compatible) return false;
    const enrolled = await LocalAuthentication.isEnrolledAsync();
    return enrolled;
  } catch {
    return false;
  }
}

export async function getBiometricType(): Promise<string> {
  if (!LocalAuthentication) return "Biométrie";
  try {
    const types =
      await LocalAuthentication.supportedAuthenticationTypesAsync();
    const hasFace = types.includes(
      LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION,
    );
    const hasFingerprint = types.includes(
      LocalAuthentication.AuthenticationType.FINGERPRINT,
    );

    if (Platform.OS === "ios") {
      if (hasFace) return "Face ID";
      if (hasFingerprint) return "Touch ID";
    } else {
      // Android: priorité empreinte (plus courant), termes génériques
      if (hasFingerprint) return "l'empreinte digitale";
      if (hasFace) return "la reconnaissance faciale";
    }
  } catch {
    // fall through
  }
  return "la biométrie";
}

export async function isBiometricEnabled(): Promise<boolean> {
  if (!SecureStore) return false;
  try {
    const enabled = await SecureStore.getItemAsync(BIO_ENABLED_KEY);
    return enabled === "true";
  } catch {
    return false;
  }
}

/**
 * Enable biometric unlock for a given user id. Stores no credentials —
 * just the flag and the expected uid.
 */
export async function enableBiometric(userId: string): Promise<void> {
  if (!SecureStore || !userId) return;
  await SecureStore.setItemAsync(BIO_USER_ID_KEY, userId);
  await SecureStore.setItemAsync(BIO_ENABLED_KEY, "true");
}

/**
 * Record the user's intent to enable biometric, before any uid is known
 * (e.g. during onboarding, before sign-in). The login screen consumes
 * this flag on the first successful sign-in and calls enableBiometric()
 * with the real uid.
 */
export async function setBiometricOptInPending(): Promise<void> {
  if (!SecureStore) return;
  await SecureStore.setItemAsync(BIO_OPT_IN_PENDING_KEY, "true");
}

/**
 * Read-and-clear the pending opt-in flag. Returns true exactly once after
 * a setBiometricOptInPending() call.
 */
export async function consumeBiometricOptInPending(): Promise<boolean> {
  if (!SecureStore) return false;
  try {
    const value = await SecureStore.getItemAsync(BIO_OPT_IN_PENDING_KEY);
    if (value !== "true") return false;
    await SecureStore.deleteItemAsync(BIO_OPT_IN_PENDING_KEY);
    return true;
  } catch {
    return false;
  }
}

export async function disableBiometric(): Promise<void> {
  if (!SecureStore) return;
  try {
    await SecureStore.deleteItemAsync(BIO_USER_ID_KEY);
  } catch {}
  try {
    await SecureStore.deleteItemAsync(BIO_ENABLED_KEY);
  } catch {}
}

export async function getBiometricUserId(): Promise<string | null> {
  if (!SecureStore) return null;
  try {
    return await SecureStore.getItemAsync(BIO_USER_ID_KEY);
  } catch {
    return null;
  }
}

/**
 * Prompt the biometric sensor. Returns the expected uid on success, or
 * null if biometric is disabled, the prompt failed, or no uid is stored.
 * Callers must verify auth.currentUser?.uid matches before granting access.
 */
export async function unlockWithBiometric(): Promise<string | null> {
  if (!LocalAuthentication || !SecureStore) return null;
  const expectedUid = await getBiometricUserId();
  if (!expectedUid) return null;

  const result = await LocalAuthentication.authenticateAsync({
    promptMessage: "Connectez-vous avec la biométrie",
    cancelLabel: "Annuler",
    disableDeviceFallback: false,
  });
  if (!result.success) return null;
  return expectedUid;
}
