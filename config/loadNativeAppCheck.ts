// Import dynamique isolé : RNFirebase ne doit être chargé que dans un build natif
// configuré (voir config/appCheck.ts).
export const loadNativeAppCheck = () => import("@react-native-firebase/app-check");
