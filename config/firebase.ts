// config/firebase.ts
import { initializeApp } from "firebase/app";
// @ts-expect-error — getReactNativePersistence exists at runtime but not in firebase/auth types
import { getReactNativePersistence, indexedDBLocalPersistence, initializeAuth } from "firebase/auth";
import { connectFirestoreEmulator, getFirestore } from "firebase/firestore";
import { connectFunctionsEmulator, getFunctions } from "firebase/functions";
import { connectStorageEmulator, getStorage } from "firebase/storage";
import { Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { ensureFirebaseAppCheck as ensureAppCheckForApp } from "./appCheck";
import { getFirebaseWebConfig } from "./firebaseEnv";

// Web config of the environment chosen at build time by APP_ENV (production by
// default, staging for the EAS staging profile): see config/firebaseEnv.ts.
const firebaseConfig = getFirebaseWebConfig();

const app = initializeApp(firebaseConfig);

// Auth avec persistance adaptée à la plateforme
export const auth = Platform.OS === 'web'
  ? initializeAuth(app, {
      persistence: indexedDBLocalPersistence
    })
  : initializeAuth(app, {
      persistence: getReactNativePersistence(AsyncStorage)
    });

// Forcer les emails Firebase (reset password, etc.) en français
auth.languageCode = 'fr';

export const db = getFirestore(app);

// Optionnel: connecter l'émulateur Firestore en dev
const emulatorHost = process.env.EXPO_PUBLIC_FIRESTORE_EMULATOR_HOST;
if (emulatorHost) {
  const [host, port] = emulatorHost.split(":");
  connectFirestoreEmulator(db, host, Number(port));
}
export const storage = getStorage(app);

const storageEmulatorHost = process.env.EXPO_PUBLIC_STORAGE_EMULATOR_HOST;
if (storageEmulatorHost) {
  const [sHost, sPort] = storageEmulatorHost.split(":");
  connectStorageEmulator(storage, sHost, Number(sPort));
}

// Cloud Functions (region europe-west1 pour la latence EU)
export const functions = getFunctions(app, "europe-west1");

// Optionnel: connecter l'émulateur Functions en dev
const functionsEmulatorHost = process.env.EXPO_PUBLIC_FUNCTIONS_EMULATOR_HOST;
if (functionsEmulatorHost) {
  const [fHost, fPort] = functionsEmulatorHost.split(":");
  connectFunctionsEmulator(functions, fHost, Number(fPort));
}

export function ensureFirebaseAppCheck() {
  return ensureAppCheckForApp(app);
}
