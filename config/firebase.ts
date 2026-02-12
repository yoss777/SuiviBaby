// config/firebase.ts
import { initializeApp } from "firebase/app";
import { getReactNativePersistence, indexedDBLocalPersistence, initializeAuth } from "firebase/auth";
import { connectFirestoreEmulator, getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";
import { Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

const firebaseConfig = {
  apiKey: "AIzaSyBJUP-b3NPExx-4RfWFLvrbAM5pEfHvAOg",
  authDomain: "samaye-53723.firebaseapp.com",
  databaseURL: "https://samaye-53723-default-rtdb.firebaseio.com",
  projectId: "samaye-53723",
  storageBucket: "samaye-53723.firebasestorage.app",
  messagingSenderId: "222899144223",
  appId: "1:222899144223:web:bdec5b5754d15fc987372a",
  measurementId: "G-SN50WE00WE"
};

const app = initializeApp(firebaseConfig);

// Auth avec persistance adaptée à la plateforme
export const auth = Platform.OS === 'web'
  ? initializeAuth(app, {
      persistence: indexedDBLocalPersistence
    })
  : initializeAuth(app, {
      persistence: getReactNativePersistence(AsyncStorage)
    });

export const db = getFirestore(app);

// Optionnel: connecter l'émulateur Firestore en dev
const emulatorHost = process.env.EXPO_PUBLIC_FIRESTORE_EMULATOR_HOST;
if (emulatorHost) {
  const [host, port] = emulatorHost.split(":");
  connectFirestoreEmulator(db, host, Number(port));
}
export const storage = getStorage(app);
