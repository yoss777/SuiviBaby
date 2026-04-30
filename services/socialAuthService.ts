// services/socialAuthService.ts
import { Platform } from "react-native";
import {
  GoogleAuthProvider,
  OAuthProvider,
  signInWithCredential,
} from "firebase/auth";
import { auth } from "@/config/firebase";
import { createPatientUser, getUserById } from "./userService";

const GOOGLE_WEB_CLIENT_ID =
  "222899144223-qvsv6p8jfdpv1vvrf1vgb620cvutr7bp.apps.googleusercontent.com";

// Lazy-load native modules (unavailable in Expo Go)
let GoogleSignin: any = null;
let AppleAuthentication: any = null;
let Crypto: any = null;

try {
  const gs = require("@react-native-google-signin/google-signin");
  GoogleSignin = gs.GoogleSignin;
} catch {}

if (Platform.OS === "ios") {
  try {
    AppleAuthentication = require("expo-apple-authentication");
    Crypto = require("expo-crypto");
  } catch {}
}

let googleConfigured = false;

function configureGoogleIfNeeded() {
  if (googleConfigured || !GoogleSignin) return;
  GoogleSignin.configure({ webClientId: GOOGLE_WEB_CLIENT_ID });
  googleConfigured = true;
}

/**
 * Ensure user profile exists in Firestore after social sign-in.
 */
async function ensureUserProfile(user: {
  uid: string;
  email: string | null;
  displayName: string | null;
}): Promise<void> {
  const existing = await getUserById(user.uid);
  if (existing) return;

  const email = user.email ?? "";
  const userName =
    user.displayName?.trim() || email.split("@")[0] || "Utilisateur";
  await createPatientUser(user.uid, email, userName);
}

/**
 * Sign in with Google. Returns the Firebase user.
 */
export async function signInWithGoogle() {
  if (!GoogleSignin) {
    throw new Error("Google Sign-In non disponible");
  }

  configureGoogleIfNeeded();

  await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
  const response = await GoogleSignin.signIn();

  if (response.type === "cancelled") {
    return null;
  }

  const idToken = response.data?.idToken;
  if (!idToken) {
    throw new Error("Impossible de récupérer le token Google");
  }

  const credential = GoogleAuthProvider.credential(idToken);
  const result = await signInWithCredential(auth, credential);
  await ensureUserProfile(result.user);
  return result.user;
}

/**
 * Sign in with Apple (iOS only). Returns the Firebase user.
 */
export async function signInWithApple() {
  if (!AppleAuthentication || !Crypto) {
    throw new Error("Apple Sign-In non disponible");
  }

  // Generate nonce
  const rawNonce = generateNonce(32);
  const hashedNonce = await Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    rawNonce,
  );

  const appleCredential = await AppleAuthentication.signInAsync({
    requestedScopes: [
      AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
      AppleAuthentication.AppleAuthenticationScope.EMAIL,
    ],
    nonce: hashedNonce,
  });

  if (!appleCredential.identityToken) {
    throw new Error("Impossible de récupérer le token Apple");
  }

  const provider = new OAuthProvider("apple.com");
  const credential = provider.credential({
    idToken: appleCredential.identityToken,
    rawNonce,
  });

  const result = await signInWithCredential(auth, credential);

  // Apple only provides name on first sign-in
  const fullName = appleCredential.fullName;
  const displayName = fullName
    ? [fullName.givenName, fullName.familyName].filter(Boolean).join(" ")
    : null;

  await ensureUserProfile({
    uid: result.user.uid,
    email: result.user.email,
    displayName: displayName || result.user.displayName,
  });

  return result.user;
}

/**
 * Check if Apple Sign-In is available on this device.
 */
export async function isAppleSignInAvailable(): Promise<boolean> {
  if (Platform.OS !== "ios" || !AppleAuthentication) return false;
  try {
    return await AppleAuthentication.isAvailableAsync();
  } catch {
    return false;
  }
}

/**
 * Sign out from Google (clear cached session).
 */
export async function signOutGoogle(): Promise<void> {
  if (!GoogleSignin) return;
  try {
    await GoogleSignin.signOut();
  } catch {}
}

/**
 * Generate a cryptographically secure random nonce string.
 * Requires expo-crypto (loaded lazily on iOS for Apple Sign-In).
 */
function generateNonce(length: number): string {
  if (!Crypto?.getRandomBytes) {
    throw new Error("expo-crypto unavailable — cannot generate secure nonce");
  }
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  const bytes: Uint8Array = Crypto.getRandomBytes(length);
  let result = "";
  for (let i = 0; i < length; i++) {
    result += chars[bytes[i] % chars.length];
  }
  return result;
}
