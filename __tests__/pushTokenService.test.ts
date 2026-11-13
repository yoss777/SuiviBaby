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

import { registerPushToken, setWidgetChild } from "@/services/pushTokenService";

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

  it("jeton repris d'un autre compte (doc illisible) : réglage reposé", async () => {
    permission("granted");
    mocked(getDoc).mockRejectedValue(new Error("permission-denied"));
    await registerPushToken("u2");
    expect(mocked(setDoc).mock.calls[0][1]).toMatchObject({ userId: "u2", enabled: true });
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
});
