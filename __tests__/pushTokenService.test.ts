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
  AndroidImportance: { MAX: 5 },
}));

jest.mock("@/config/firebase", () => ({ db: {} }));
let mockInstalled: number | null = 1;
jest.mock("@/modules/widget-push", () => ({
  ...jest.requireActual("@/modules/widget-push"),
  installedWidgetCount: () => Promise.resolve(mockInstalled),
}));

import * as Notifications from "expo-notifications";
import { deleteDoc, getDoc, setDoc, updateDoc } from "firebase/firestore";

import { refreshWidgetPresence, registerPushToken, removePushTokens, setWidgetChild, SIGN_OUT_WAIT_MS } from "@/services/pushTokenService";
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
    expect(deleteDoc).toHaveBeenCalledTimes(1);
  });

  it("hors ligne, enregistrement qui ne se termine pas : la déconnexion n'attend que 5 s", async () => {
    const hold = holdSetDoc(); // ne se termine qu'à la fin du test
    const pending = registerPushToken("u1");
    await until(() => mocked(setDoc).mock.calls.length > 0);
    let signedOut = false;
    const signOut = removePushTokens("u1").then(() => (signedOut = true));
    await Promise.resolve();
    expect(signedOut).toBe(false);
    jest.advanceTimersByTime(SIGN_OUT_WAIT_MS);
    await signOut;
    expect(signedOut).toBe(true);
    expect(getDocs).toHaveBeenCalled();
    // Réseau revenu : l'écriture se termine, le jeton recréé est supprimé.
    hold.finish();
    await pending;
    expect(deleteDoc).toHaveBeenCalled();
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
