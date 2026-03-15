let LocalAuthentication: typeof import("expo-local-authentication") | null =
  null;
let SecureStore: typeof import("expo-secure-store") | null = null;

try {
  LocalAuthentication = require("expo-local-authentication");
  SecureStore = require("expo-secure-store");
} catch {
  // Native modules not available (Expo Go or missing native rebuild)
}

const BIOMETRIC_EMAIL_KEY = "samaye_bio_email";
const BIOMETRIC_PASSWORD_KEY = "samaye_bio_password";
const BIOMETRIC_ENABLED_KEY = "samaye_bio_enabled";

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
    if (
      types.includes(
        LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION,
      )
    ) {
      return "Face ID";
    }
    if (
      types.includes(LocalAuthentication.AuthenticationType.FINGERPRINT)
    ) {
      return "Touch ID";
    }
  } catch {
    // fall through
  }
  return "Biométrie";
}

export async function isBiometricEnabled(): Promise<boolean> {
  if (!SecureStore) return false;
  try {
    const enabled = await SecureStore.getItemAsync(BIOMETRIC_ENABLED_KEY);
    return enabled === "true";
  } catch {
    return false;
  }
}

export async function saveCredentials(
  email: string,
  password: string,
): Promise<void> {
  if (!SecureStore) return;
  await SecureStore.setItemAsync(BIOMETRIC_EMAIL_KEY, email);
  await SecureStore.setItemAsync(BIOMETRIC_PASSWORD_KEY, password);
  await SecureStore.setItemAsync(BIOMETRIC_ENABLED_KEY, "true");
}

export async function getCredentials(): Promise<{
  email: string;
  password: string;
} | null> {
  if (!LocalAuthentication || !SecureStore) return null;
  const result = await LocalAuthentication.authenticateAsync({
    promptMessage: "Connectez-vous avec la biométrie",
    cancelLabel: "Annuler",
    disableDeviceFallback: false,
  });

  if (!result.success) return null;

  const email = await SecureStore.getItemAsync(BIOMETRIC_EMAIL_KEY);
  const password = await SecureStore.getItemAsync(BIOMETRIC_PASSWORD_KEY);

  if (!email || !password) return null;
  return { email, password };
}

export async function clearCredentials(): Promise<void> {
  if (!SecureStore) return;
  await SecureStore.deleteItemAsync(BIOMETRIC_EMAIL_KEY);
  await SecureStore.deleteItemAsync(BIOMETRIC_PASSWORD_KEY);
  await SecureStore.deleteItemAsync(BIOMETRIC_ENABLED_KEY);
}
