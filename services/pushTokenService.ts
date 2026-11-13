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
  getDoc,
  getDocs,
  query,
  setDoc,
  Timestamp,
  updateDoc,
  where,
} from "firebase/firestore";
import { db } from "@/config/firebase";
import { captureServiceError } from "@/utils/errorReporting";

const COLLECTION = "device_tokens";
// Projet EAS courant (@yoss7/suivibaby), lu dans app.json : l'ancien identifiant
// codé en dur datait d'avant le transfert du projet vers le compte yoss7.
const PROJECT_ID: string | undefined =
  Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;

/** Cache du token courant pour toggle enabled sans re-fetch */
let cachedToken: string | null = null;
/** Permission de notification accordée lors du dernier getExpoPushToken. */
let notificationsGranted = false;

/**
 * Capacité « widget temps réel » de cette version de l'app, lue par le
 * serveur avant d'envoyer les données du widget (plan-temps-reel.md, E3) :
 * 1 = récepteur natif Android présent ; iOS : 0 tant que E7 n'est pas livré.
 */
const WIDGET_CAP = Platform.OS === "android" ? 1 : 0;

function deviceTimeZone(): string | null {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || null;
  } catch {
    return null;
  }
}

/**
 * Obtient le push token Expo.
 * Retourne null si indisponible (web, permissions refusées).
 */
async function getExpoPushToken(): Promise<string | null> {
  if (Platform.OS === "web") return null;

  // Push tokens ne fonctionnent pas dans Expo Go (SDK 53+)
  if (Constants.appOwnership === "expo") return null;

  const { status } = await Notifications.getPermissionsAsync();
  notificationsGranted = status === "granted";
  if (!notificationsGranted) {
    const { status: newStatus } =
      await Notifications.requestPermissionsAsync();
    notificationsGranted = newStatus === "granted";
    // Android : le jeton sert aussi aux données du widget (messages sans
    // notification visible), qui n'ont pas besoin de la permission.
    if (!notificationsGranted && Platform.OS !== "android") return null;
  }

  // Android nécessite un channel
  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync("default", {
      name: "default",
      // Faux positif d'import/namespace (enum compilé en IIFE) : exporté à l'exécution.
      // eslint-disable-next-line import/namespace
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: "#FF231F7C",
    });
  }

  if (!PROJECT_ID) return null;
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

    // Le réglage « notifications » de l'utilisateur ne doit pas être remis à
    // true à chaque connexion : on ne le pose qu'à la création (ou à la
    // reprise du jeton par un autre compte, dont le doc n'est pas lisible).
    let ownExisting = false;
    try {
      const snap = await getDoc(docRef);
      ownExisting = snap.exists() && snap.data().userId === userId;
    } catch {
      ownExisting = false;
    }

    await setDoc(
      docRef,
      {
        userId,
        token,
        platform: Platform.OS as "ios" | "android",
        ...(ownExisting ? {} : { enabled: notificationsGranted, registeredAt: Timestamp.now() }),
        lastUsedAt: Timestamp.now(),
        // Widget temps réel (E3) : fuseau pour le « jour », version et capacité.
        tz: deviceTimeZone(),
        appVersion: Constants.expoConfig?.version ?? null,
        widgetCap: WIDGET_CAP,
        widgetPush: true,
      },
      { merge: true },
    );
  } catch (error) {
    console.error("Erreur registerPushToken:", error);
    captureServiceError(error, { service: "pushToken", operation: "registerPushToken" });
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
    captureServiceError(error, { service: "pushToken", operation: "removePushTokens" });
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

let widgetChildTimer: ReturnType<typeof setTimeout> | null = null;
let lastWidgetChildId: string | null = null;

/**
 * Enfant affiché par le widget de cet appareil : le serveur n'envoie à
 * l'appareil que les données de cet enfant. Anti-rebond de 3 s (changement
 * de bébé rapide), sans effet tant que le jeton n'est pas connu.
 */
export function setWidgetChild(childId: string): void {
  if (childId === lastWidgetChildId) return;
  if (widgetChildTimer) clearTimeout(widgetChildTimer);
  widgetChildTimer = setTimeout(() => {
    widgetChildTimer = null;
    const docId = getTokenDocId();
    if (!docId) return;
    lastWidgetChildId = childId;
    updateDoc(doc(db, COLLECTION, docId), { widgetChildId: childId }).catch((error) => {
      lastWidgetChildId = null;
      captureServiceError(error, { service: "pushToken", operation: "setWidgetChild" });
    });
  }, 3000);
}
