/* global describe, it, expect, jest, beforeEach */
// Effacement à distance du widget : membre retiré, consentement retiré,
// compte supprimé. Seuls ses appareils, seulement ceux qui comprennent « w0 ».
require("./setup");
const { memoryStore } = require("./memoryFirestore");
const { Expo } = require("expo-server-sdk");

const expoClient = {
  sendPushNotificationsAsync: jest.fn(),
  chunkPushNotifications: jest.fn((m) => [m]),
};
Expo.mockImplementation(() => expoClient);
Expo.isExpoPushToken = jest.fn((t) => typeof t === "string" && t.startsWith("ExponentPushToken["));

const wipe = require("../src/widget/wipe");
const pushed = () => expoClient.sendPushNotificationsAsync.mock.calls.flatMap(([chunk]) => chunk);
const db = () => require("firebase-admin").firestore();

function seed(extra = {}) {
  return {
    "device_tokens/a1": { userId: "dad", token: "ExponentPushToken[a1]", platform: "android", widgetPush: true, widgetCap: 2, widgetChildId: "c1" },
    "device_tokens/i1": { userId: "dad", token: "ExponentPushToken[i1]", platform: "ios", widgetPush: true, widgetCap: 2, widgetChildId: "c1" },
    // Ancienne version (cap 1) : pas de « w0 », mais l'enfant est retiré du jeton.
    "device_tokens/old": { userId: "dad", token: "ExponentPushToken[old]", platform: "android", widgetPush: true, widgetCap: 1, widgetChildId: "c1" },
    // Autre bébé affiché sur un appareil du même parent : intouché.
    "device_tokens/a2": { userId: "dad", token: "ExponentPushToken[a2]", platform: "android", widgetPush: true, widgetCap: 2, widgetChildId: "c2" },
    // Autre membre du foyer : intouché.
    "device_tokens/m1": { userId: "mum", token: "ExponentPushToken[m1]", platform: "android", widgetPush: true, widgetCap: 2, widgetChildId: "c1" },
    ...extra,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  expoClient.sendPushNotificationsAsync.mockImplementation(async (chunk) => chunk.map(() => ({ status: "ok", id: "x" })));
  jest.spyOn(console, "log").mockImplementation(() => {});
});

describe("wipeWidgetForUser", () => {
  it("membre retiré de c1 : « w0 » à ses appareils qui affichent c1 (cap ≥ 2), rien aux autres", async () => {
    const docs = memoryStore(seed());
    expect(await wipe.wipeWidgetForUser(db(), "dad", "c1", { nowMs: 1000 })).toMatchObject({ devices: 2, ok: true, skippedOldCap: 1 });
    const msgs = pushed();
    expect(msgs.map((m) => m.to).sort()).toEqual(["ExponentPushToken[a1]", "ExponentPushToken[i1]"]);
    for (const m of msgs) {
      expect(m.data).toMatchObject({ t: "w0", c: "c1", s: 1000 });
      // Données vides : ni prénom ni données du bébé.
      expect(m.data.p.childName).toBeFalsy();
      expect(m.data.p.day).toBeUndefined();
    }
    expect(msgs.find((m) => m.to.endsWith("[i1]"))).toMatchObject({ _contentAvailable: true, priority: "normal" });
    expect(msgs.find((m) => m.to.endsWith("[a1]"))).toMatchObject({ priority: "high" });
    // Enfant retiré de tous ses jetons qui l'affichaient (même l'ancien), pas des autres.
    expect(docs.get("device_tokens/a1").widgetChildId).toBeUndefined();
    expect(docs.get("device_tokens/old").widgetChildId).toBeUndefined();
    expect(docs.get("device_tokens/a2").widgetChildId).toBe("c2");
    expect(docs.get("device_tokens/m1").widgetChildId).toBe("c1");
  });

  it("consentement retiré ou compte supprimé (tout enfant) : tous ses appareils", async () => {
    memoryStore(seed());
    await wipe.wipeWidgetForUser(db(), "dad", null);
    expect(pushed().map((m) => m.to).sort()).toEqual([
      "ExponentPushToken[a1]",
      "ExponentPushToken[a2]",
      "ExponentPushToken[i1]",
    ]);
  });

  it("interrupteur d'urgence : rien n'est envoyé", async () => {
    memoryStore(seed({ "app_config/widgetPush": { enabled: true, wipe: false } }));
    expect(await wipe.wipeWidgetForUser(db(), "dad", "c1")).toMatchObject({ devices: 0 });
    expect(pushed()).toHaveLength(0);
  });

  it("ne lève jamais (Expo en panne) : la suppression de compte continue", async () => {
    memoryStore(seed());
    expoClient.sendPushNotificationsAsync.mockRejectedValue(new Error("expo down"));
    await expect(wipe.wipeWidgetForUser(db(), "dad", "c1")).resolves.toMatchObject({ ok: false });
  });
});

describe("déclencheurs", () => {
  const run = (fn, params, before, after) =>
    fn({
      params,
      data: {
        before: { exists: before != null, data: () => before },
        after: { exists: after != null, data: () => after },
      },
    });

  it("accès supprimé : effacement ; accès créé ou rôle changé : rien", async () => {
    memoryStore(seed());
    const fn = wipe.onWidgetAccessRemoved;
    await run(fn, { childId: "c1", uid: "dad" }, { role: "admin" }, { role: "contributor" });
    await run(fn, { childId: "c1", uid: "dad" }, null, { role: "admin" });
    expect(pushed()).toHaveLength(0);
    await run(fn, { childId: "c1", uid: "dad" }, { role: "admin" }, null);
    expect(pushed()).toHaveLength(2);
  });

  it("consentement santé retiré : effacement ; toujours valide : rien", async () => {
    memoryStore(seed());
    const ok = { healthDataConsent: { granted: true, version: "2.2" } };
    const fn = wipe.onWidgetConsentChanged;
    await run(fn, { uid: "dad" }, ok, { ...ok, theme: "dark" });
    expect(pushed()).toHaveLength(0);
    await run(fn, { uid: "dad" }, ok, { healthDataConsent: { granted: false } });
    expect(pushed()).toHaveLength(3);
  });
});
