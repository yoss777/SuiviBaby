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

import * as Notifications from "expo-notifications";
import { getDoc, setDoc, updateDoc } from "firebase/firestore";

import { registerPushToken, removePushTokens, setWidgetChild } from "@/services/pushTokenService";
import { getDocs } from "firebase/firestore";

const mocked = <T>(fn: T) => fn as unknown as jest.Mock;

function permission(status: "granted" | "denied") {
  mocked(Notifications.getPermissionsAsync).mockResolvedValue({ status });
  mocked(Notifications.requestPermissionsAsync).mockResolvedValue({ status });
}

beforeEach(() => {
  jest.clearAllMocks();
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
