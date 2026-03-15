// services/pushTokenService.ts
// Enregistre / supprime le push token Expo dans Firestore
// pour permettre l'envoi de notifications push via Cloud Functions.

import Constants from "expo-constants";
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";
import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  query,
  setDoc,
  Timestamp,
  updateDoc,
  where,
} from "firebase/firestore";
import { db } from "@/config/firebase";

const COLLECTION = "device_tokens";
const PROJECT_ID = "0c759940-43b8-4cb3-9dc5-d0faa2eacf41";

/** Cache du token courant pour toggle enabled sans re-fetch */
let cachedToken: string | null = null;

/**
 * Obtient le push token Expo.
 * Retourne null si indisponible (web, permissions refusées).
 */
async function getExpoPushToken(): Promise<string | null> {
  if (Platform.OS === "web") return null;

  // Push tokens ne fonctionnent pas dans Expo Go (SDK 53+)
  if (Constants.appOwnership === "expo") return null;

  const { status } = await Notifications.getPermissionsAsync();
  if (status !== "granted") {
    const { status: newStatus } =
      await Notifications.requestPermissionsAsync();
    if (newStatus !== "granted") return null;
  }

  // Android nécessite un channel
  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync("default", {
      name: "default",
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: "#FF231F7C",
    });
  }

  const tokenData = await Notifications.getExpoPushTokenAsync({
    projectId: PROJECT_ID,
  });

  cachedToken = tokenData.data; // "ExponentPushToken[xxxx]"
  return cachedToken;
}

/**
 * Enregistre le push token dans Firestore.
 * Utilise token comme ID de document pour idempotence.
 */
export async function registerPushToken(userId: string): Promise<void> {
  try {
    const token = await getExpoPushToken();
    if (!token) return;

    // Utiliser un hash stable du token comme docId
    const docId = token.replace(/[^a-zA-Z0-9]/g, "_");
    const docRef = doc(db, COLLECTION, docId);

    await setDoc(
      docRef,
      {
        userId,
        token,
        platform: Platform.OS as "ios" | "android",
        enabled: true,
        registeredAt: Timestamp.now(),
        lastUsedAt: Timestamp.now(),
      },
      { merge: true },
    );
  } catch (error) {
    console.error("Erreur registerPushToken:", error);
  }
}

/**
 * Supprime tous les push tokens d'un utilisateur.
 * À appeler au signOut.
 */
export async function removePushTokens(userId: string): Promise<void> {
  try {
    const q = query(
      collection(db, COLLECTION),
      where("userId", "==", userId),
    );
    const snapshot = await getDocs(q);

    await Promise.all(snapshot.docs.map((d) => deleteDoc(d.ref)));
  } catch (error) {
    console.error("Erreur removePushTokens:", error);
  }
}

/**
 * Met à jour le lastUsedAt du token courant.
 * Appeler périodiquement (ex: au login) pour savoir quels tokens sont encore actifs.
 */
export async function refreshPushToken(userId: string): Promise<void> {
  // registerPushToken fait déjà un merge avec lastUsedAt
  await registerPushToken(userId);
}

/**
 * Retourne le docId Firestore du token courant (ou null).
 */
function getTokenDocId(): string | null {
  if (!cachedToken) return null;
  return cachedToken.replace(/[^a-zA-Z0-9]/g, "_");
}

/**
 * Active ou désactive les push pour le device courant.
 * Met à jour le champ `enabled` dans device_tokens.
 */
export async function setDevicePushEnabled(enabled: boolean): Promise<void> {
  const docId = getTokenDocId();
  if (!docId) {
    // Token pas encore enregistré — tenter de le récupérer
    const token = await getExpoPushToken();
    if (!token) return;
    const fallbackDocId = token.replace(/[^a-zA-Z0-9]/g, "_");
    await updateDoc(doc(db, COLLECTION, fallbackDocId), { enabled });
    return;
  }
  await updateDoc(doc(db, COLLECTION, docId), { enabled });
}

/**
 * Vérifie si les push sont activées pour le device courant.
 */
export async function isDevicePushEnabled(): Promise<boolean> {
  const docId = getTokenDocId();
  if (!docId) return true; // Par défaut activé
  try {
    const { getDoc } = await import("firebase/firestore");
    const snap = await getDoc(doc(db, COLLECTION, docId));
    if (!snap.exists()) return true;
    return snap.data().enabled !== false;
  } catch {
    return true;
  }
}
