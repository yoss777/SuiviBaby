// services/pushTokenService.ts
// Enregistre / supprime le push token Expo dans Firestore
// pour permettre l'envoi de notifications push via Cloud Functions.

import AsyncStorage from "@react-native-async-storage/async-storage";
import NetInfo from "@react-native-community/netinfo";
import Constants from "expo-constants";
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";
import {
  deleteDoc,
  doc,
  getDoc,
  setDoc,
  deleteField,
  Timestamp,
  updateDoc,
} from "firebase/firestore";
import { httpsCallable } from "firebase/functions";

import { db, functions } from "@/config/firebase";
import { widgetPushIosCap } from "@/services/widgetPushIos";
import { installedWidgetCount } from "@/modules/widget-push";
import { getWidgetLinkKey } from "@/services/widgetLinkKey";
import { captureServiceError } from "@/utils/errorReporting";
import { isConnectivityError } from "@/utils/networkError";

const COLLECTION = "device_tokens";
// Projet EAS courant (@yoss7/suivibaby), lu dans app.json : l'ancien identifiant
// codé en dur datait d'avant le transfert du projet vers le compte yoss7.
const PROJECT_ID: string | undefined =
  Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;

/** Cache du token courant pour toggle enabled sans re-fetch */
let cachedToken: string | null = null;

// Enfant affiché par le widget (setWidgetChild) : souhaité, et dernier écrit.
let widgetChildTimer: ReturnType<typeof setTimeout> | null = null;
let desiredWidgetChildId: string | null = null;
let lastWidgetChildId: string | null = null;
/** Compte du dernier enregistrement réussi (réenregistrement si le jeton a disparu). */
let registeredUserId: string | null = null;
/**
 * Génération de session : avancée à chaque déconnexion. Un enregistrement
 * commencé avant ne doit ni recréer le jeton du compte déconnecté (le serveur
 * continuerait à lui envoyer les données du bébé), ni marquer son état.
 */
let sessionGen = 0;
/** Génération du dernier enregistrement démarré (reconnexion rapide pendant une écriture). */
let lastStartedGen = -1;
/** Attente maximale d'un enregistrement en cours à la déconnexion. */
export const SIGN_OUT_WAIT_MS = 5000;
/** Enregistrement en cours (même compte, même session) : mutualisé. */
let inFlight: { userId: string; gen: number; promise: Promise<void> } | null = null;
/** Délais des nouvelles tentatives d'écriture de l'enfant du widget. */
const WIDGET_CHILD_RETRY_MS = [10_000, 30_000, 120_000];
/** Permission de notification accordée lors du dernier getExpoPushToken. */
let notificationsGranted = false;

/**
 * Capacité « widget temps réel » de cette version de l'app, lue par le
 * serveur avant d'envoyer les données du widget (plan-temps-reel.md, E3) :
 * 1 = récepteur natif Android présent, ou tâche d'arrière-plan iPhone
 * enregistrée (E7, option 1 : notification silencieuse, livraison au mieux) ;
 * 2 = comprend aussi l'effacement à distance (« w0 ») ;
 * 3 = n'annonce widgetPush que si un widget est posé (le serveur n'envoie les
 *     données qu'à partir de 3 : les anciennes versions gardaient widgetPush
 *     vrai sans widget).
 */
const widgetCap = (): Promise<number> => (Platform.OS === "android" ? Promise.resolve(3) : widgetPushIosCap());

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

  if (!PROJECT_ID) {
    // Sans projet, aucun jeton : ni rappels ni widget en temps réel. À voir.
    captureServiceError(new Error("EAS projectId missing in app config"), {
      service: "pushToken",
      operation: "getExpoPushToken",
    });
    return null;
  }
  const tokenData = await Notifications.getExpoPushTokenAsync({
    projectId: PROJECT_ID,
  });

  cachedToken = tokenData.data; // "ExponentPushToken[xxxx]"
  return cachedToken;
}

/** Un widget SuiviBaby est-il posé ? null : inconnu (module absent, erreur). */
const WIDGET_PROBE_TIMEOUT_MS = 3000;
/** Valeur de repli si `p` ne répond pas à temps (signalé une fois par cas). */
async function withTimeout<T>(p: Promise<T>, ms: number, fallback: T, operation: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const late = Symbol("late");
  try {
    const r = await Promise.race([p, new Promise<typeof late>((resolve) => { timer = setTimeout(() => resolve(late), ms); })]);
    if (r === late) {
      captureServiceError(new Error(`${operation}: no answer in ${ms} ms`), { service: "pushToken", operation });
      return fallback;
    }
    return r as T;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function widgetInstalled(): Promise<boolean | null> {
  const n = await installedWidgetCount();
  return n == null ? null : n > 0;
}

let lastWidgetPush: boolean | null = null;

/**
 * Retour au premier plan : widget ajouté ou retiré depuis ? Met à jour le
 * jeton de l'appareil (le serveur n'envoie qu'aux appareils qui en ont un).
 */
export async function refreshWidgetPresence(): Promise<boolean | null> {
  const docId = getTokenDocId();
  if (!docId || !registeredUserId) return null;
  const installed = await widgetInstalled();
  // Inconnu : on n'écrase pas la valeur enregistrée.
  if (installed == null || installed === lastWidgetPush) return installed;
  try {
    await updateDoc(doc(db, COLLECTION, docId), { widgetPush: installed });
    lastWidgetPush = installed;
  } catch (error) {
    if (!isConnectivityError(error)) captureServiceError(error, { service: "pushToken", operation: "widgetPresence" });
  }
  return installed;
}

async function linkKeyField(): Promise<{ widgetLinkKey?: string }> {
  const key = await getWidgetLinkKey();
  return key ? { widgetLinkKey: key } : {};
}

/**
 * Enregistre le push token dans Firestore.
 * Utilise token comme ID de document pour idempotence.
 */
export function registerPushToken(userId: string): Promise<void> {
  if (inFlight && inFlight.userId === userId && inFlight.gen === sessionGen) return inFlight.promise;
  const gen = sessionGen;
  lastStartedGen = gen;
  const promise = registerOnce(userId, gen).finally(() => {
    if (inFlight?.promise === promise) inFlight = null;
  });
  inFlight = { userId, gen, promise };
  return promise;
}

async function registerOnce(userId: string, gen: number): Promise<void> {
  try {
    // Désinscription de la session précédente encore en cours : on l'attend,
    // sinon elle pouvait invalider le jeton tout juste obtenu pour ce compte
    // (reconnexion rapide), et ses rappels n'arrivaient plus, sans le dire.
    if (stopInFlight) await stopInFlight;
    // Révocation d'un ancien compte en attente : envoyée avant d'écrire, pour
    // qu'elle ne supprime jamais le document que ce compte va écrire.
    await flushTokenRevocation();
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
    } catch (error) {
      // permission-denied : le doc appartient à un autre compte (reprise
      // attendue). Toute autre erreur : on ne touche pas au réglage.
      const code = (error as { code?: string } | null)?.code;
      ownExisting = code !== "permission-denied";
      if (ownExisting) captureServiceError(error, { service: "pushToken", operation: "readTokenDoc" });
    }

    // Bornées : si WidgetKit ou l'enregistrement de la tâche iPhone ne
    // répondent pas, le jeton (et donc les rappels) restait sans être écrit.
    const installed = await withTimeout(widgetInstalled(), WIDGET_PROBE_TIMEOUT_MS, null, "widgetInstalled");
    const cap = await withTimeout(widgetCap(), WIDGET_PROBE_TIMEOUT_MS, 0, "widgetCap");
    const linkKey = await linkKeyField();
    // Déconnexion pendant les lectures : rien n'est écrit.
    if (gen !== sessionGen) return;
    // Enfant réellement écrit (il peut changer pendant l'écriture).
    const writtenChildId = desiredWidgetChildId;
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
        widgetCap: cap,
        // Données du widget envoyées seulement si un widget est posé
        // (minimisation des données de santé) ; revu au retour au premier plan.
        // Inconnu (module absent) : champ inchangé ; absent = pas d'envoi.
        ...(installed == null ? {} : { widgetPush: installed }),
        // Clé des liens de cet appareil : le serveur l'ajoute aux liens du
        // widget qu'il réécrit (sinon, confirmation demandée à l'appui).
        ...linkKey,
        // Enfant affiché par le widget, s'il est déjà connu (sinon posé par
        // setWidgetChild). Jeton repris d'un autre compte : l'enfant de l'ancien
        // compte est retiré (sinon le serveur continuait à lui écrire ce bébé).
        ...(writtenChildId
          ? { widgetChildId: writtenChildId }
          : ownExisting
            ? {}
            : { widgetChildId: deleteField() }),
      },
      { merge: true },
    );
    // Téléphone réinscrit pour ce compte : plus de désinscription ni de
    // révocation en attente (le document lui appartient maintenant).
    AsyncStorage.removeItem(PUSH_UNREGISTER_PENDING_KEY).catch(() => {});
    AsyncStorage.removeItem(PUSH_REVOKE_PENDING_KEY).catch(() => {});
    // Nouvelle session : la fin de session précédente est oubliée.
    sessionEndHandled = false;
    // Déconnexion pendant l'écriture : le jeton recréé est supprimé aussitôt,
    // sauf si un enregistrement a démarré depuis (reconnexion rapide, même
    // document) : c'est lui qui fait foi.
    if (gen !== sessionGen) {
      if (lastStartedGen > gen) return;
      await deleteDoc(docRef).catch((error) =>
        captureServiceError(error, { service: "pushToken", operation: "registerAfterSignOut" }),
      );
      return;
    }
    lastWidgetChildId = writtenChildId;
    registeredUserId = userId;
    lastWidgetPush = installed;
    // Autre enfant voulu pendant l'écriture : on l'écrit à son tour.
    if (desiredWidgetChildId && desiredWidgetChildId !== writtenChildId) {
      scheduleWidgetChildWrite(desiredWidgetChildId, 0, 0);
    }
  } catch (error) {
    console.error("Erreur registerPushToken:", error);
    captureServiceError(error, { service: "pushToken", operation: "registerPushToken" });
  }
}

/**
 * Supprime tous les push tokens d'un utilisateur.
 * À appeler au signOut.
 */
/**
 * Fin de session locale : plus aucun nouvel essai (enfant du widget,
 * réenregistrement) ne part pour l'ancien compte. Aussi appelée seule à une
 * déconnexion forcée (session révoquée), où les jetons ne peuvent plus être
 * supprimés faute d'authentification.
 */
export function resetPushSession(): void {
  sessionGen++;
  if (widgetChildTimer) clearTimeout(widgetChildTimer);
  widgetChildTimer = null;
  lastWidgetChildId = null;
  desiredWidgetChildId = null;
  registeredUserId = null;
  lastWidgetPush = null;
}

/**
 * Désinscription de ce téléphone restée à faire (Android hors ligne : la
 * suppression du jeton FCM a besoin du réseau). Réessayée au prochain
 * lancement sans compte connecté.
 */
export const PUSH_UNREGISTER_PENDING_KEY = "@suivibaby_push_unregister_pending";
const UNREGISTER_TIMEOUT_MS = 3000;

/**
 * Android : plus aucune notification sur ce téléphone pour l'ancien compte,
 * quand son jeton n'a pas pu être supprimé du serveur (déconnexion hors
 * ligne, déconnexion forcée). Le jeton FCM est supprimé : au prochain envoi,
 * Expo répond DeviceNotRegistered et le serveur supprime le document
 * (functions/src/notifications/reminders.js). Une nouvelle connexion
 * réinscrit le téléphone (getExpoPushTokenAsync). R9. Sans effet sur iPhone.
 */
let stopInFlight: Promise<void> | null = null;
// Fin de session déjà traitée par removePushTokens (document supprimé en
// ligne) : la désinscription locale est alors inutile.
let sessionEndHandled = false;

export function stopPushOnThisDevice(): Promise<void> {
  // Un seul appel natif à la fois (la déconnexion hors ligne l'appelait deux fois).
  if (stopInFlight) return stopInFlight;
  stopInFlight = doStopPush().finally(() => {
    stopInFlight = null;
  });
  return stopInFlight;
}

/**
 * Fin de session vue par l'écouteur d'authentification : désinscription
 * locale seulement si removePushTokens n'a pas déjà supprimé le document
 * (déconnexion hors ligne, délai dépassé, déconnexion forcée).
 */
export function stopPushAfterSessionEnd(userId?: string | null): Promise<void> {
  if (sessionEndHandled) {
    sessionEndHandled = false;
    return Promise.resolve();
  }
  // Déconnexion forcée : le document n'a pas été supprimé. Révocation serveur
  // (jeton lu avant que la désinscription ne l'oublie), puis désinscription.
  const token = cachedToken;
  return Promise.all([queueTokenRevocation(token, userId), stopPushOnThisDevice()]).then(() => undefined);
}

async function doStopPush(): Promise<void> {
  cachedToken = null;
  // iPhone : unregisterForRemoteNotifications ne rend pas le jeton invalide
  // (les notifications peuvent continuer d'arriver, Apple ne le garantit pas)
  // et une réinscription peut ensuite ne jamais répondre : on ne l'appelle
  // pas. La protection iPhone doit venir du serveur (SUIVI_ACTIONS R22).
  if (Platform.OS === "ios") return;
  let ok = false;
  try {
    ok = await withTimeout(
      Notifications.unregisterForNotificationsAsync().then(() => true),
      UNREGISTER_TIMEOUT_MS,
      false,
      "unregisterPush",
    );
  } catch (error) {
    if (!isConnectivityError(error)) captureServiceError(error, { service: "pushToken", operation: "unregisterPush" });
  }
  try {
    if (ok) await AsyncStorage.removeItem(PUSH_UNREGISTER_PENDING_KEY);
    else await AsyncStorage.setItem(PUSH_UNREGISTER_PENDING_KEY, "1");
  } catch {
    // stockage indisponible : la désinscription sera retentée à la prochaine déconnexion
  }
}

// ============================================
// R22 — révocation serveur du jeton, sans compte connecté
// ============================================

/**
 * Jeton de l'ancien compte à révoquer côté serveur ({ token, userId }), quand
 * la déconnexion n'a pas pu supprimer son document (hors ligne, délai, refus,
 * déconnexion forcée). Indispensable sur iPhone, où la désinscription locale
 * ne rend pas le jeton invalide. Envoyé au retour du réseau, compte connecté
 * ou non (fonction revokeDeviceToken).
 */
export const PUSH_REVOKE_PENDING_KEY = "@suivibaby_push_revoke_pending";
const REVOKE_TIMEOUT_MS = 8000;
/**
 * queuedAt : heure de la demande (horloge du téléphone, comme lastUsedAt du
 * document). Le serveur ne supprime pas un jeton réinscrit après elle.
 */
type PendingRevocation = { token: string; userId: string; queuedAt: number };
const MAX_REVOCATION_AGE_MS = 30 * 24 * 60 * 60 * 1000;

const revokeDeviceTokenCF = httpsCallable<PendingRevocation, { ok: boolean }>(functions, "revokeDeviceToken");
let revokeInFlight: Promise<void> | null = null;

async function readPendingRevocation(): Promise<PendingRevocation | null> {
  try {
    const raw = await AsyncStorage.getItem(PUSH_REVOKE_PENDING_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<PendingRevocation>;
    const valid =
      typeof parsed.token === "string" &&
      typeof parsed.userId === "string" &&
      typeof parsed.queuedAt === "number" &&
      Date.now() - parsed.queuedAt < MAX_REVOCATION_AGE_MS;
    if (!valid) {
      // Demande illisible ou trop ancienne : oubliée (sinon réessayée sans fin).
      await AsyncStorage.removeItem(PUSH_REVOKE_PENDING_KEY).catch(() => {});
      return null;
    }
    return { token: parsed.token as string, userId: parsed.userId as string, queuedAt: parsed.queuedAt as number };
  } catch {
    return null;
  }
}

/**
 * Met le jeton en attente, puis lance la révocation sans l'attendre : hors
 * ligne, l'appel échouerait après plusieurs secondes et la déconnexion doit
 * rester immédiate. Nouvel essai au retour du réseau ou au lancement.
 */
export async function queueTokenRevocation(token: string | null, userId: string | null | undefined): Promise<void> {
  if (!token || !userId) return;
  try {
    await AsyncStorage.setItem(PUSH_REVOKE_PENDING_KEY, JSON.stringify({ token, userId, queuedAt: Date.now() }));
  } catch (error) {
    captureServiceError(error, { service: "pushToken", operation: "queueTokenRevocation" });
  }
  void flushTokenRevocation();
}

/** Retour du réseau : envoie une révocation restée en attente. Renvoie l'arrêt de l'écoute. */
export function startTokenRevocationRetry(): () => void {
  try {
    return NetInfo.addEventListener((state) => {
      if (state.isConnected !== false && state.isInternetReachable === true) void flushTokenRevocation();
    });
  } catch {
    return () => {};
  }
}

/**
 * Envoie la révocation en attente. Réussite, ou demande refusée comme
 * invalide : on l'oublie. Réseau absent ou autre erreur : on la garde pour la
 * prochaine fois (lancement, retour du réseau, prochaine inscription).
 */
export function flushTokenRevocation(): Promise<void> {
  if (revokeInFlight) return revokeInFlight;
  revokeInFlight = (async () => {
    const pending = await readPendingRevocation();
    if (!pending) return;
    try {
      const done = await withTimeout(
        revokeDeviceTokenCF(pending).then(() => true),
        REVOKE_TIMEOUT_MS,
        false,
        "revokeDeviceToken",
      );
      if (done) await AsyncStorage.removeItem(PUSH_REVOKE_PENDING_KEY).catch(() => {});
    } catch (error) {
      const code = (error as { code?: string })?.code ?? "";
      if (code.endsWith("invalid-argument")) {
        await AsyncStorage.removeItem(PUSH_REVOKE_PENDING_KEY).catch(() => {});
      }
      if (!isConnectivityError(error)) {
        captureServiceError(error, { service: "pushToken", operation: "revokeDeviceToken" });
      }
    }
  })().finally(() => {
    revokeInFlight = null;
  });
  return revokeInFlight;
}

/**
 * Lancement sans compte connecté : termine une désinscription (Android) ou
 * une révocation serveur restée à faire.
 */
export async function retryPendingPushUnregister(): Promise<void> {
  let pending: string | null = null;
  try {
    pending = await AsyncStorage.getItem(PUSH_UNREGISTER_PENDING_KEY);
  } catch {
    pending = null;
  }
  if (pending) await stopPushOnThisDevice();
  await flushTokenRevocation();
}

/** Réseau absent (lecture NetInfo bornée à 1 s ; dans le doute : en ligne). */
async function isOfflineNow(): Promise<boolean> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const state = await Promise.race([
      NetInfo.fetch(),
      new Promise<null>((resolve) => {
        timer = setTimeout(() => resolve(null), 1000);
      }),
    ]);
    return !!state && (state.isConnected === false || state.isInternetReachable === false);
  } catch {
    return false;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/**
 * Fin de session sur CE téléphone : seul son jeton est supprimé. Avant, tous
 * les jetons du compte (tous ses appareils) l'étaient : se déconnecter de
 * l'un coupait les notifications et le widget des autres jusqu'à leur
 * prochaine ouverture de l'app.
 */
export async function removePushTokens(userId: string): Promise<void> {
  // Jeton de ce téléphone, lu avant toute remise à zéro.
  const docId = getTokenDocId();
  const token = cachedToken;
  // Remise à zéro AVANT les appels réseau : un nouvel essai planifié ne doit
  // ni réécrire l'enfant ni réenregistrer le jeton pendant la déconnexion,
  // même si la suppression échoue. Le prochain enregistrement réécrit l'enfant.
  resetPushSession();
  // Génération de la session qui suit cette déconnexion.
  const genAtSignOut = sessionGen;
  // Hors connexion : ni l'enregistrement en cours ni la suppression ne peuvent
  // aboutir avant la déconnexion (le serveur refusera ensuite, faute
  // d'authentification). On n'attend pas : la déconnexion prenait 5 s et plus
  // (recette 1.0.22, test 21). Le téléphone n'applique déjà plus rien (widget
  // vidé, enfant oublié) ; le document orphelin est ignoré par l'appareil.
  if (await isOfflineNow()) {
    captureServiceError(new Error("removePushTokens: skipped (offline)"), {
      service: "pushToken",
      operation: "removePushTokensOffline",
    });
    // Le document reste sur le serveur : révocation au retour du réseau
    // (R22), et désinscription locale (Android, R9).
    await queueTokenRevocation(token, userId);
    await stopPushOnThisDevice();
    sessionEndHandled = true;
    return;
  }
  // Enregistrement en cours : il voit la nouvelle génération et n'écrit rien,
  // ou supprime ce qu'il a recréé. On l'attend pour que cela se fasse avant la
  // déconnexion Firebase (sinon refusé faute d'authentification).
  // Attente bornée : hors ligne, l'écriture ne se termine qu'au retour du
  // réseau ; la déconnexion ne doit jamais rester bloquée. Au-delà, la
  // génération protège encore (rien de marqué, document supprimé à sa fin).
  const pending = inFlight?.promise;
  if (pending) {
    let timer: ReturnType<typeof setTimeout> | undefined;
    await Promise.race([
      pending.catch(() => undefined),
      new Promise<void>((resolve) => {
        timer = setTimeout(resolve, SIGN_OUT_WAIT_MS);
      }),
    ]);
    if (timer) clearTimeout(timer);
  }
  // Nouvelle connexion commencée sur ce téléphone depuis la déconnexion
  // (même document, puisqu'il dérive du jeton) : c'est elle qui fait foi,
  // on ne supprime pas son jeton, et on ne désinscrit pas le téléphone.
  if (lastStartedGen >= genAtSignOut) {
    sessionEndHandled = true;
    return;
  }
  // Jeton inconnu (enregistrement jamais abouti pendant cette session) : on
  // ne peut pas viser le document ; on rend le jeton invalide, le serveur le
  // supprimera au prochain envoi (R9).
  if (!docId) {
    await stopPushOnThisDevice();
    sessionEndHandled = true;
    return;
  }
  // Suppression bornée : hors ligne, elle ne se termine qu'au retour du
  // réseau, et la déconnexion restait figée. Au-delà du délai, on continue,
  // on le signale et on désinscrit le téléphone.
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timedOut = Symbol("timeout");
  try {
    const removal = deleteDoc(doc(db, COLLECTION, docId)).catch((error: unknown) => {
      // Document absent ou repris par un autre compte sur ce téléphone :
      // rien à supprimer pour celui-ci. Pas de désinscription locale ici :
      // le jeton est partagé, elle couperait l'autre compte.
      if ((error as { code?: string })?.code === "permission-denied") {
        // Document absent ou repris par un autre compte : rien à faire.
        captureServiceError(error, { service: "pushToken", operation: "removePushTokensDenied" });
        return;
      }
      throw error;
    });
    const outcome = await Promise.race([
      removal.then(() => undefined),
      new Promise<typeof timedOut>((resolve) => {
        timer = setTimeout(() => resolve(timedOut), SIGN_OUT_WAIT_MS);
      }),
    ]);
    if (outcome === timedOut) {
      // La promesse continue en arrière-plan ; son éventuel échec est signalé.
      removal.catch((error) =>
        captureServiceError(error, { service: "pushToken", operation: "removePushTokensLate" }),
      );
      captureServiceError(new Error("removePushTokens: timed out (offline?)"), {
        service: "pushToken",
        operation: "removePushTokensTimeout",
      });
      await queueTokenRevocation(token, userId);
      await stopPushOnThisDevice();
    }
    sessionEndHandled = true;
  } catch (error) {
    console.error("Erreur removePushTokens:", error);
    captureServiceError(error, { service: "pushToken", operation: "removePushTokens" });
    // Suppression en échec : le document reste ; révocation serveur (R22).
    await queueTokenRevocation(token, userId);
  } finally {
    if (timer) clearTimeout(timer);
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


/**
 * Enfant affiché par le widget de cet appareil : le serveur n'envoie à
 * l'appareil que les données de cet enfant. Anti-rebond de 3 s (changement
 * de bébé rapide), sans effet tant que le jeton n'est pas connu.
 */
/**
 * Le serveur a pu retirer l'enfant du jeton (effacement à distance, p. ex.
 * consentement d'une version trop ancienne) sans que l'app le sache : après un
 * nouveau consentement, l'enfant voulu est réécrit même s'il était déjà noté.
 */
export function rewriteWidgetChild(): void {
  lastWidgetChildId = null;
  if (desiredWidgetChildId) scheduleWidgetChildWrite(desiredWidgetChildId, 0, 0);
}

export function setWidgetChild(childId: string): void {
  desiredWidgetChildId = childId;
  if (childId === lastWidgetChildId) return;
  scheduleWidgetChildWrite(childId, 3000, 0);
}

/**
 * Écrit l'enfant du widget. Échec : nouvel essai (10 s, 30 s, 2 min) tant que
 * cet enfant est toujours celui voulu ; sans quoi le serveur ne trouvait plus
 * l'appareil et le widget restait figé sans signal. Jeton supprimé entre-temps
 * (not-found, jeton mort nettoyé) : réenregistrement, qui écrit l'enfant voulu.
 */
function scheduleWidgetChildWrite(childId: string, delayMs: number, attempt: number): void {
  if (widgetChildTimer) clearTimeout(widgetChildTimer);
  widgetChildTimer = setTimeout(() => {
    widgetChildTimer = null;
    const docId = getTokenDocId();
    // Jeton pas encore enregistré : registerPushToken écrira l'enfant souhaité.
    // Déjà écrit entre-temps (par registerPushToken), ou autre enfant voulu : rien à faire.
    if (!docId || childId === lastWidgetChildId || childId !== desiredWidgetChildId) return;
    lastWidgetChildId = childId;
    updateDoc(doc(db, COLLECTION, docId), { widgetChildId: childId }).catch((error) => {
      // Un autre enfant est voulu entre-temps (ou déconnexion) : son écriture
      // est déjà planifiée ; ne pas annuler son minuteur pour réessayer celui-ci.
      if (childId !== desiredWidgetChildId) return;
      lastWidgetChildId = null;
      const code = (error as { code?: string } | null)?.code;
      if (code === "not-found" && registeredUserId) {
        void registerPushToken(registeredUserId);
        return;
      }
      if (!isConnectivityError(error)) {
        captureServiceError(error, { service: "pushToken", operation: "setWidgetChild" });
      }
      const next = WIDGET_CHILD_RETRY_MS[attempt];
      if (next != null) scheduleWidgetChildWrite(childId, next, attempt + 1);
      // Derniers essais épuisés (réseau) : un signal, le widget reste figé.
      else if (isConnectivityError(error)) {
        captureServiceError(error, { service: "pushToken", operation: "setWidgetChildGaveUp" });
      }
    });
  }, delayMs);
}
