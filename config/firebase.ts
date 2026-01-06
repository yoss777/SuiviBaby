// config/firebase.ts
import { initializeApp } from "firebase/app";
import { indexedDBLocalPersistence, initializeAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";
import { Platform } from "react-native";

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
  : (() => {
      // Import dynamique pour éviter le bundling sur web
      const ReactNativeAsyncStorage = require('@react-native-async-storage/async-storage').default;
      const { getReactNativePersistence } = require('firebase/auth');
      return initializeAuth(app, {
        persistence: getReactNativePersistence(ReactNativeAsyncStorage)
      });
    })();

export const db = getFirestore(app);
export const storage = getStorage(app);