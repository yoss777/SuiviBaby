// Enregistrement du jeton de notification : projet Expo lu dans la config,
// réglage de l'utilisateur jamais écrasé, champs du widget temps réel (E3).

jest.mock("expo-constants", () => ({
  expoConfig: { version: "1.0.15", extra: { eas: { projectId: "proj-yoss7" } } },
}));

jest.mock("expo-notifications", () => ({
  getPermissionsAsync: jest.fn(),
  requestPermissionsAsync: jest.fn(),
  setNotificationChannelAsync: jest.fn(),
  getExpoPushTokenAsync: jest.fn(),
  unregisterForNotificationsAsync: jest.fn(() => Promise.resolve()),
  AndroidImportance: { MAX: 5 },
}));

jest.mock("@/config/firebase", () => ({ db: {} }));
let mockInstalled: number | null = 1;
let mockHang = false;
jest.mock("@/modules/widget-push", () => ({
  ...jest.requireActual("@/modules/widget-push"),
  installedWidgetCount: () => (mockHang ? new Promise(() => {}) : Promise.resolve(mockInstalled)),
}));

import * as Notifications from "expo-notifications";
import { deleteDoc, getDoc, setDoc, updateDoc } from "firebase/firestore";

import { refreshWidgetPresence, registerPushToken, removePushTokens, rewriteWidgetChild, setWidgetChild, SIGN_OUT_WAIT_MS } from "@/services/pushTokenService";
import { getDocs } from "firebase/firestore";

const mocked = <T>(fn: T) => fn as unknown as jest.Mock;

function permission(status: "granted" | "denied") {
  mocked(Notifications.getPermissionsAsync).mockResolvedValue({ status });
  mocked(Notifications.requestPermissionsAsync).mockResolvedValue({ status });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockInstalled = 1;
  mocked(Notifications.getExpoPushTokenAsync).mockResolvedValue({ data: "ExponentPushToken[abc]" });
});

describe("WidgetKit qui ne répond pas (revue en profondeur)", () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => {
    mockHang = false;
    jest.useRealTimers();
  });
  it("le jeton est quand même écrit après 3 s, présence du widget inconnue", async () => {
    mockHang = true;
    permission("granted");
    mocked(getDoc).mockResolvedValue({ exists: () => false });
    mocked(setDoc).mockResolvedValue(undefined);
    const p = registerPushToken("u7");
    await jest.advanceTimersByTimeAsync(3000);
    await p;
    expect(setDoc).toHaveBeenCalled();
    await removePushTokens("u7");
  });
});

describe("rewriteWidgetChild (après un nouveau consentement)", () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());
  it("réécrit l'enfant voulu même s'il était déjà noté comme écrit", async () => {
    mocked(updateDoc).mockResolvedValue(undefined);
    permission("granted");
    mocked(getDoc).mockResolvedValue({ exists: () => false });
    await registerPushToken("u9");
    setWidgetChild("cX");
    jest.advanceTimersByTime(3000);
    await Promise.resolve();
    mocked(updateDoc).mockClear();
    setWidgetChild("cX"); // déjà noté : rien
    jest.advanceTimersByTime(3000);
    expect(updateDoc).not.toHaveBeenCalled();
    rewriteWidgetChild();
    jest.advanceTimersByTime(0);
    expect(mocked(updateDoc).mock.calls.at(-1)?.[1]).toEqual({ widgetChildId: "cX" });
    await removePushTokens("u9");
  });
});

describe("registerPushToken", () => {
  it("demande le jeton pour le projet Expo de la config (app.json)", async () => {
    permission("granted");
    mocked(getDoc).mockResolvedValue({ exists: () => false });
    await registerPushToken("u1");
    expect(Notifications.getExpoPushTokenAsync).toHaveBeenCalledWith({ projectId: "proj-yoss7" });
  });

  it("nouvel appareil : enabled selon la permission, et champs du widget", async () => {
    permission("granted");
    mocked(getDoc).mockResolvedValue({ exists: () => false });
    await registerPushToken("u1");
    const data = mocked(setDoc).mock.calls[0][1];
    expect(data).toMatchObject({
      userId: "u1",
      token: "ExponentPushToken[abc]",
      enabled: true,
      appVersion: "1.0.15",
      widgetPush: true,
    });
    expect(typeof data.widgetCap).toBe("number");
    expect(data).toHaveProperty("tz");
  });

  it("appareil déjà à cet utilisateur : ne remet pas enabled à true", async () => {
    permission("granted");
    mocked(getDoc).mockResolvedValue({ exists: () => true, data: () => ({ userId: "u1", enabled: false }) });
    await registerPushToken("u1");
    const data = mocked(setDoc).mock.calls[0][1];
    expect(data).not.toHaveProperty("enabled");
    expect(data).not.toHaveProperty("registeredAt");
  });

  it("jeton repris d'un autre compte : l'enfant du widget de l'ancien compte est retiré", async () => {
    permission("granted");
    mocked(getDocs).mockResolvedValue({ docs: [] });
    await removePushTokens("u0"); // aucun enfant voulu
    mocked(getDoc).mockRejectedValue(Object.assign(new Error("denied"), { code: "permission-denied" }));
    await registerPushToken("u2");
    expect(mocked(setDoc).mock.calls.at(-1)[1]).toMatchObject({ userId: "u2", widgetChildId: "DELETE_FIELD" });
  });

  it("jeton repris d'un autre compte (doc illisible) : réglage reposé", async () => {
    permission("granted");
    mocked(getDoc).mockRejectedValue(Object.assign(new Error("denied"), { code: "permission-denied" }));
    await registerPushToken("u2");
    expect(mocked(setDoc).mock.calls[0][1]).toMatchObject({ userId: "u2", enabled: true });
  });

  it("lecture en échec (réseau) : ne touche pas au réglage de l'utilisateur", async () => {
    permission("granted");
    mocked(getDoc).mockRejectedValue(Object.assign(new Error("offline"), { code: "unavailable" }));
    await registerPushToken("u1");
    expect(mocked(setDoc).mock.calls[0][1]).not.toHaveProperty("enabled");
  });
});

describe("setWidgetChild", () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it("écrit l'enfant du widget après l'anti-rebond, une seule fois", async () => {
    permission("granted");
    mocked(getDoc).mockResolvedValue({ exists: () => false });
    mocked(updateDoc).mockResolvedValue(undefined);
    await registerPushToken("u1");
    setWidgetChild("c1");
    setWidgetChild("c2");
    expect(updateDoc).not.toHaveBeenCalled();
    jest.advanceTimersByTime(3000);
    expect(updateDoc).toHaveBeenCalledTimes(1);
    expect(mocked(updateDoc).mock.calls[0][1]).toEqual({ widgetChildId: "c2" });
    setWidgetChild("c2");
    jest.advanceTimersByTime(3000);
    expect(updateDoc).toHaveBeenCalledTimes(1);
  });

  it("enfant demandé avant l'enregistrement du jeton : écrit par registerPushToken ; réécrit après déconnexion", async () => {
    permission("granted");
    mocked(getDoc).mockResolvedValue({ exists: () => false });
    mocked(getDocs).mockResolvedValue({ docs: [] });
    await removePushTokens("u0"); // état propre
    setWidgetChild("c9");
    await registerPushToken("u1");
    expect(mocked(setDoc).mock.calls.at(-1)[1]).toMatchObject({ widgetChildId: "c9" });
    jest.advanceTimersByTime(3000);
    expect(updateDoc).not.toHaveBeenCalled(); // déjà écrit
    await removePushTokens("u1");
    mocked(updateDoc).mockResolvedValue(undefined);
    await registerPushToken("u1");
    setWidgetChild("c9");
    jest.advanceTimersByTime(3000);
    expect(updateDoc).toHaveBeenCalledWith(undefined, { widgetChildId: "c9" });
  });

  it("écriture en échec (réseau) : nouvel essai après 10 s, puis abandon de l'enfant remplacé", async () => {
    permission("granted");
    mocked(getDoc).mockResolvedValue({ exists: () => false });
    mocked(getDocs).mockResolvedValue({ docs: [] });
    await removePushTokens("u0");
    await registerPushToken("u1");
    mocked(updateDoc).mockRejectedValueOnce(Object.assign(new Error("offline"), { code: "unavailable" }));
    setWidgetChild("c5");
    jest.advanceTimersByTime(3000);
    await Promise.resolve();
    await Promise.resolve();
    expect(updateDoc).toHaveBeenCalledTimes(1);
    mocked(updateDoc).mockResolvedValue(undefined);
    jest.advanceTimersByTime(10_000);
    expect(updateDoc).toHaveBeenCalledTimes(2);
    expect(mocked(updateDoc).mock.calls[1][1]).toEqual({ widgetChildId: "c5" });
  });

  it("enfant changé pendant une écriture en échec : le nouvel enfant est bien écrit", async () => {
    permission("granted");
    mocked(getDoc).mockResolvedValue({ exists: () => false });
    mocked(getDocs).mockResolvedValue({ docs: [] });
    await removePushTokens("u0");
    await registerPushToken("u1");
    let rejectA: (e: unknown) => void = () => {};
    mocked(updateDoc).mockImplementationOnce(() => new Promise((_r, rej) => (rejectA = rej)));
    setWidgetChild("A");
    jest.advanceTimersByTime(3000);
    setWidgetChild("B");
    rejectA(Object.assign(new Error("offline"), { code: "unavailable" }));
    for (let i = 0; i < 10; i++) await Promise.resolve();
    mocked(updateDoc).mockResolvedValue(undefined);
    jest.advanceTimersByTime(3000);
    expect(mocked(updateDoc).mock.calls.at(-1)[1]).toEqual({ widgetChildId: "B" });
  });

  it("jeton supprimé côté serveur (not-found) : réenregistré avec l'enfant voulu", async () => {
    permission("granted");
    mocked(getDoc).mockResolvedValue({ exists: () => false });
    mocked(getDocs).mockResolvedValue({ docs: [] });
    await removePushTokens("u0");
    await registerPushToken("u1");
    const setCalls = mocked(setDoc).mock.calls.length;
    mocked(updateDoc).mockRejectedValueOnce(Object.assign(new Error("gone"), { code: "not-found" }));
    setWidgetChild("c7");
    jest.advanceTimersByTime(3000);
    for (let i = 0; i < 40; i++) await Promise.resolve();
    expect(mocked(setDoc).mock.calls.length).toBeGreaterThan(setCalls);
    expect(mocked(setDoc).mock.calls.at(-1)[1]).toMatchObject({ userId: "u1", widgetChildId: "c7" });
  });
});

describe("courses avec la déconnexion et le changement d'enfant", () => {
  /** Laisse avancer les promesses jusqu'à ce que la condition soit vraie. */
  async function until(cond: () => boolean): Promise<void> {
    for (let i = 0; i < 50 && !cond(); i++) await Promise.resolve();
    if (!cond()) throw new Error("condition jamais atteinte");
  }
  /** setDoc qui reste en cours jusqu'à finish(). */
  function holdSetDoc(): { finish: () => void } {
    const ctl = { finish: () => {} };
    mocked(setDoc).mockImplementation(() => new Promise<void>((r) => (ctl.finish = r)));
    return { finish: () => ctl.finish() };
  }
  const lastSetDoc = () => (mocked(setDoc).mock.calls.at(-1) ?? [])[1] as Record<string, unknown>;

  beforeEach(async () => {
    jest.useFakeTimers();
    permission("granted");
    mocked(getDoc).mockResolvedValue({ exists: () => false });
    mocked(getDocs).mockResolvedValue({ docs: [] });
    mocked(deleteDoc).mockResolvedValue(undefined);
    mocked(updateDoc).mockResolvedValue(undefined);
    await removePushTokens("u0"); // état propre
    jest.clearAllMocks();
  });
  afterEach(() => {
    mocked(setDoc).mockReset();
    mocked(getDoc).mockReset();
    jest.useRealTimers();
  });

  it("déconnexion pendant les lectures : le jeton n'est jamais recréé", async () => {
    let release!: (v: unknown) => void;
    mocked(getDoc).mockImplementation(() => new Promise((r) => (release = r)));
    const pending = registerPushToken("u1");
    await until(() => !!release);
    const signOut = removePushTokens("u1");
    release({ exists: () => false });
    await Promise.all([pending, signOut]);
    expect(setDoc).not.toHaveBeenCalled();
  });

  it("déconnexion pendant l'écriture : supprimé avant la fin de la déconnexion", async () => {
    const hold = holdSetDoc();
    const pending = registerPushToken("u1");
    await until(() => mocked(setDoc).mock.calls.length > 0);
    let signedOut = false;
    const signOut = removePushTokens("u1").then(() => (signedOut = true));
    await Promise.resolve();
    expect(signedOut).toBe(false); // attend l'enregistrement en cours
    hold.finish();
    await Promise.all([pending, signOut]);
    // Le jeton recréé par l'enregistrement en cours est supprimé (document de
    // ce téléphone, suppression idempotente).
    expect(deleteDoc).toHaveBeenCalled();
  });

  it("hors ligne, enregistrement qui ne se termine pas : la déconnexion n'attend que 5 s", async () => {
    const hold = holdSetDoc(); // ne se termine qu'à la fin du test
    const pending = registerPushToken("u1");
    await until(() => mocked(setDoc).mock.calls.length > 0);
    let signedOut = false;
    const signOut = removePushTokens("u1").then(() => (signedOut = true));
    // Lecture du réseau (NetInfo) avant les attentes bornées : laisser passer.
    for (let i = 0; i < 10; i++) await Promise.resolve();
    expect(signedOut).toBe(false);
    jest.advanceTimersByTime(SIGN_OUT_WAIT_MS);
    await signOut;
    expect(signedOut).toBe(true);
    expect(deleteDoc).toHaveBeenCalled();
    // Réseau revenu : l'écriture se termine, le jeton recréé est supprimé.
    hold.finish();
    await pending;
    expect(deleteDoc).toHaveBeenCalled();
  });

  it("réseau absent (NetInfo) : la déconnexion n'attend rien et ne tente aucune suppression (recette 1.0.22, test 21)", async () => {
    const NetInfo = require("@react-native-community/netinfo");
    NetInfo.fetch.mockResolvedValueOnce({ isConnected: false, isInternetReachable: false });
    mocked(getDocs).mockClear();
    await removePushTokens("u1");
    expect(getDocs).not.toHaveBeenCalled();
    expect(deleteDoc).not.toHaveBeenCalled();
  });

  it("hors ligne, suppression des jetons qui ne se termine pas : la déconnexion n'attend que 5 s", async () => {
    await registerPushToken("u1"); // jeton de ce téléphone connu
    mocked(deleteDoc).mockImplementationOnce(() => new Promise(() => {})); // jamais résolue
    let signedOut = false;
    const signOut = removePushTokens("u1").then(() => (signedOut = true));
    // Lecture du réseau (NetInfo) avant les attentes bornées : laisser passer.
    for (let i = 0; i < 10; i++) await Promise.resolve();
    expect(signedOut).toBe(false);
    jest.advanceTimersByTime(SIGN_OUT_WAIT_MS);
    await signOut;
    expect(signedOut).toBe(true);
  });

  it("reconnexion rapide pendant l'écriture : le jeton de la nouvelle session n'est jamais supprimé", async () => {
    const hold = holdSetDoc();
    const first = registerPushToken("u1");
    await until(() => mocked(setDoc).mock.calls.length > 0);
    // Déconnexion lancée, puis nouvelle connexion avant la fin de l'écriture.
    const signOut = removePushTokens("u1");
    const second = registerPushToken("u2");
    hold.finish();
    await until(() => mocked(setDoc).mock.calls.length > 1);
    hold.finish();
    await Promise.all([first, signOut, second]);
    expect(deleteDoc).not.toHaveBeenCalled();
    expect(lastSetDoc()).toMatchObject({ userId: "u2" });
    expect(Notifications.unregisterForNotificationsAsync).not.toHaveBeenCalled();
  });

  it("deux enregistrements simultanés du même compte : une seule écriture", async () => {
    await Promise.all([registerPushToken("u1"), registerPushToken("u1")]);
    expect(setDoc).toHaveBeenCalledTimes(1);
  });

  it("enfant changé pendant l'enregistrement : le nouvel enfant est écrit ensuite", async () => {
    setWidgetChild("cA");
    const hold = holdSetDoc();
    const pending = registerPushToken("u1");
    await until(() => mocked(setDoc).mock.calls.length > 0);
    expect(lastSetDoc()).toMatchObject({ widgetChildId: "cA" });
    setWidgetChild("cB");
    hold.finish();
    await pending;
    jest.advanceTimersByTime(3000);
    expect(mocked(updateDoc).mock.calls.map((c) => c[1])).toContainEqual({ widgetChildId: "cB" });
  });
});

describe("données du widget seulement si un widget est posé", () => {
  it("aucun widget posé : widgetPush faux ; widget ajouté puis app rouverte : passe à vrai", async () => {
    permission("granted");
    mocked(getDoc).mockResolvedValue({ exists: () => false });
    mocked(getDocs).mockResolvedValue({ docs: [] });
    await removePushTokens("u0");
    mockInstalled = 0;
    await registerPushToken("u1");
    expect(mocked(setDoc).mock.calls.at(-1)[1]).toMatchObject({ widgetPush: false });
    mockInstalled = 2;
    mocked(updateDoc).mockResolvedValue(undefined);
    await refreshWidgetPresence();
    expect(updateDoc).toHaveBeenCalledWith(undefined, { widgetPush: true });
    // Rien de changé ensuite : pas de nouvelle écriture.
    mocked(updateDoc).mockClear();
    await refreshWidgetPresence();
    expect(updateDoc).not.toHaveBeenCalled();
  });

  it("module natif absent (inconnu) : widgetPush non écrit (absent = aucun envoi)", async () => {
    permission("granted");
    mocked(getDoc).mockResolvedValue({ exists: () => false });
    mocked(getDocs).mockResolvedValue({ docs: [] });
    await removePushTokens("u0");
    mockInstalled = null;
    await registerPushToken("u1");
    expect(mocked(setDoc).mock.calls.at(-1)[1]).not.toHaveProperty("widgetPush");
  });
});

describe("déconnexion hors ligne : plus de notifications pour l'ancien compte (R9, Android)", () => {
  const { Platform } = require("react-native");
  const originalOS = Platform.OS;
  const NetInfo = require("@react-native-community/netinfo");
  const AsyncStorage = require("@react-native-async-storage/async-storage");
  const {
    PUSH_UNREGISTER_PENDING_KEY,
    retryPendingPushUnregister,
  } = require("@/services/pushTokenService");
  let store: Record<string, string>;
  beforeEach(() => {
    store = {};
    AsyncStorage.getItem.mockImplementation((k: string) => Promise.resolve(store[k] ?? null));
    AsyncStorage.setItem.mockImplementation((k: string, v: string) => {
      store[k] = v;
      return Promise.resolve();
    });
    AsyncStorage.removeItem.mockImplementation((k: string) => {
      delete store[k];
      return Promise.resolve();
    });
    jest.spyOn(NetInfo, "fetch").mockResolvedValue({ isConnected: false, isInternetReachable: false });
    Platform.OS = "android";
  });
  afterEach(() => {
    Platform.OS = originalOS;
    jest.restoreAllMocks();
  });

  it("iPhone : pas de désinscription native (sans effet sur le jeton, risque pour la réinscription)", async () => {
    Platform.OS = "ios";
    await removePushTokens("u1");
    expect(Notifications.unregisterForNotificationsAsync).not.toHaveBeenCalled();
  });

  it("hors ligne : le téléphone est désinscrit (jeton invalide, le serveur le supprimera)", async () => {
    store[PUSH_UNREGISTER_PENDING_KEY] = "1"; // reste d'une fois précédente
    await removePushTokens("u1");
    expect(Notifications.unregisterForNotificationsAsync).toHaveBeenCalledTimes(1);
    expect(store[PUSH_UNREGISTER_PENDING_KEY]).toBeUndefined();
  });

  it("fin de session déjà traitée par la déconnexion : l'écouteur d'authentification ne désinscrit pas une 2e fois", async () => {
    const { stopPushAfterSessionEnd } = require("@/services/pushTokenService");
    await removePushTokens("u1");
    await stopPushAfterSessionEnd();
    expect(Notifications.unregisterForNotificationsAsync).toHaveBeenCalledTimes(1);
    // Déconnexion forcée ensuite (sans removePushTokens) : désinscription.
    await stopPushAfterSessionEnd();
    expect(Notifications.unregisterForNotificationsAsync).toHaveBeenCalledTimes(2);
  });

  it("reconnexion rapide : l'inscription attend la fin de la désinscription en cours", async () => {
    const { stopPushOnThisDevice } = require("@/services/pushTokenService");
    let finishUnregister: () => void = () => {};
    mocked(Notifications.unregisterForNotificationsAsync).mockImplementationOnce(
      () => new Promise<void>((r) => (finishUnregister = r)),
    );
    jest.spyOn(NetInfo, "fetch").mockResolvedValue({ isConnected: true, isInternetReachable: true });
    permission("granted");
    mocked(getDoc).mockResolvedValue({ exists: () => false });
    mocked(setDoc).mockResolvedValue(undefined);
    const stop = stopPushOnThisDevice();
    const reg = registerPushToken("u2");
    for (let i = 0; i < 10; i++) await Promise.resolve();
    expect(Notifications.getExpoPushTokenAsync).not.toHaveBeenCalled();
    finishUnregister();
    await Promise.all([stop, reg]);
    expect(Notifications.getExpoPushTokenAsync).toHaveBeenCalled();
    expect(setDoc).toHaveBeenCalled();
  });

  it("désinscription impossible (Android hors ligne) : notée, puis terminée au lancement suivant", async () => {
    mocked(Notifications.unregisterForNotificationsAsync).mockRejectedValueOnce(new Error("SERVICE_NOT_AVAILABLE"));
    await removePushTokens("u1");
    expect(store[PUSH_UNREGISTER_PENDING_KEY]).toBe("1");
    await retryPendingPushUnregister();
    expect(Notifications.unregisterForNotificationsAsync).toHaveBeenCalledTimes(2);
    expect(store[PUSH_UNREGISTER_PENDING_KEY]).toBeUndefined();
  });

  it("rien en attente : aucun appel au lancement", async () => {
    await retryPendingPushUnregister();
    expect(Notifications.unregisterForNotificationsAsync).not.toHaveBeenCalled();
  });

  it("nouvelle connexion : téléphone réinscrit, plus rien en attente", async () => {
    store[PUSH_UNREGISTER_PENDING_KEY] = "1";
    jest.spyOn(NetInfo, "fetch").mockResolvedValue({ isConnected: true, isInternetReachable: true });
    permission("granted");
    mocked(getDoc).mockResolvedValue({ exists: () => false });
    mocked(setDoc).mockResolvedValue(undefined);
    await registerPushToken("u2");
    await Promise.resolve();
    expect(store[PUSH_UNREGISTER_PENDING_KEY]).toBeUndefined();
  });
});

describe("déconnexion : seul le jeton de ce téléphone est supprimé", () => {
  afterEach(() => jest.restoreAllMocks());
  it("supprime le document de ce téléphone, sans toucher aux autres appareils du compte", async () => {
    const NetInfo = require("@react-native-community/netinfo");
    jest.spyOn(NetInfo, "fetch").mockResolvedValue({ isConnected: true, isInternetReachable: true });
    permission("granted");
    mocked(getDoc).mockResolvedValue({ exists: () => false });
    mocked(setDoc).mockResolvedValue(undefined);
    mocked(deleteDoc).mockResolvedValue(undefined);
    const firestore = require("firebase/firestore");
    await registerPushToken("u1");
    mocked(firestore.doc).mockClear();
    await removePushTokens("u1");
    expect(getDocs).not.toHaveBeenCalled();
    expect(deleteDoc).toHaveBeenCalledTimes(1);
    expect(firestore.doc).toHaveBeenCalledWith(expect.anything(), "device_tokens", "ExponentPushToken_abc_");
  });

  it("jeton inconnu (jamais enregistré cette session) : rien supprimé, téléphone désinscrit (Android)", async () => {
    const { Platform } = require("react-native");
    const os = Platform.OS;
    Platform.OS = "android";
    try {
      const NetInfo = require("@react-native-community/netinfo");
      jest.spyOn(NetInfo, "fetch").mockResolvedValue({ isConnected: true, isInternetReachable: true });
      const { stopPushOnThisDevice } = require("@/services/pushTokenService");
      await stopPushOnThisDevice(); // oublie le jeton connu
      mocked(Notifications.unregisterForNotificationsAsync).mockClear();
      await removePushTokens("u1");
      expect(deleteDoc).not.toHaveBeenCalled();
      expect(Notifications.unregisterForNotificationsAsync).toHaveBeenCalledTimes(1);
    } finally {
      Platform.OS = os;
    }
  });
});
