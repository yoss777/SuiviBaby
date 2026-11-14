/* global describe, it, expect, jest, beforeEach, afterEach */
// Widget temps réel (E5) : filtre des écritures, destinataires, gardes,
// calcul par fuseau d'appareil, taille du message, interrupteur.
require("./setup");
const { Buffer } = require("node:buffer");
const { memoryStore } = require("./memoryFirestore");
const { Expo } = require("expo-server-sdk");

const expoClient = {
  sendPushNotificationsAsync: jest.fn(),
  chunkPushNotifications: jest.fn((m) => [m]),
};
Expo.mockImplementation(() => expoClient);
Expo.isExpoPushToken = jest.fn((t) => typeof t === "string" && t.startsWith("ExponentPushToken["));

const fanout = require("../src/widget/fanout");

const HOUR = 3600 * 1000;
const NOW = Date.parse("2026-11-13T16:00:00Z"); // 17:00 à Paris
const ts = (ms) => ({ toMillis: () => ms, toDate: () => new Date(ms) });
const pushed = () => expoClient.sendPushNotificationsAsync.mock.calls.flatMap(([chunk]) => chunk);

function seed(extra = {}) {
  return {
    "app_config/widgetPush": { enabled: true },
    "children/c1": { name: "Léa Martin", ownerId: "mum" },
    "children/c1/access/mum": { role: "owner" },
    "children/c1/access/dad": { role: "admin" },
    "users/mum": {},
    "users/dad": {},
    "user_preferences/mum": { healthDataConsent: { granted: true, version: "2.2" } },
    "user_preferences/dad": {
      healthDataConsent: { granted: true, version: "2.2" },
      notifications: { reminders: { enabled: true, thresholds: { repas: 3, changes: 2 } } },
    },
    "subscriptions/dad": { tier: "premium", status: "active" },
    "device_tokens/m1": { userId: "mum", token: "ExponentPushToken[m1]", platform: "android", widgetPush: true, widgetCap: 1, widgetChildId: "c1", tz: "Europe/Paris" },
    "device_tokens/d1": { userId: "dad", token: "ExponentPushToken[d1]", platform: "android", widgetPush: true, widgetCap: 1, widgetChildId: "c1", tz: "America/New_York" },
    "events/e1": { childId: "c1", userId: "dad", type: "biberon", date: ts(NOW - 2 * HOUR), quantite: 120, note: "secret" },
    "events/e2": { childId: "c1", userId: "mum", type: "miction", date: ts(NOW - 3 * HOUR) },
    "events/e3": { childId: "c1", userId: "dad", type: "sommeil", date: ts(NOW - HOUR), heureDebut: ts(NOW - HOUR), isNap: true },
    ...extra,
  };
}

let logSpy;
beforeEach(() => {
  jest.clearAllMocks();
  jest.useFakeTimers({ now: NOW, doNotFake: ["nextTick", "setImmediate", "setTimeout", "clearTimeout", "queueMicrotask", "performance", "hrtime"] });
  expoClient.sendPushNotificationsAsync.mockImplementation(async (chunk) => chunk.map(() => ({ status: "ok", id: "x" })));
  logSpy = jest.spyOn(console, "log").mockImplementation(() => {});
});
afterEach(() => {
  jest.useRealTimers();
  logSpy.mockRestore();
});

describe("eventChange", () => {
  it("ignore les types hors widget, les jalons et les vieux événements", () => {
    expect(fanout.eventChange(null, { type: "jalon", childId: "c1", date: ts(NOW) }, NOW)).toBeNull();
    expect(fanout.eventChange(null, { type: "biberon", childId: "c1", date: ts(NOW - 40 * HOUR) }, NOW)).toBeNull();
    expect(fanout.eventChange(null, { type: "biberon", date: ts(NOW) }, NOW)).toBeNull();
  });

  it("priorité haute pour un début ou une fin de session, normale sinon", () => {
    const sleep = { type: "sommeil", childId: "c1", date: ts(NOW), heureDebut: ts(NOW) };
    expect(fanout.eventChange(null, sleep, NOW)).toEqual({ childId: "c1", urgent: true });
    expect(fanout.eventChange(sleep, { ...sleep, heureFin: ts(NOW) }, NOW)).toEqual({ childId: "c1", urgent: true });
    expect(fanout.eventChange(sleep, { ...sleep, note: "x" }, NOW)).toEqual({ childId: "c1", urgent: false });
    expect(fanout.eventChange(null, { type: "biberon", childId: "c1", date: ts(NOW) }, NOW)).toEqual({ childId: "c1", urgent: false });
    // Suppression d'un ancien événement encore dans la fenêtre.
    expect(fanout.eventChange({ type: "selle", childId: "c1", date: ts(NOW - HOUR) }, null, NOW)).toEqual({ childId: "c1", urgent: false });
  });
});

describe("fanOutWidget", () => {
  it("envoie à chaque appareil qui affiche l'enfant, dans son fuseau, sans auteur ni note", async () => {
    memoryStore(seed());
    await fanout.fanOutWidget(require("firebase-admin").firestore(), "c1", { urgent: true });
    const msgs = pushed();
    expect(msgs.map((m) => m.to).sort()).toEqual(["ExponentPushToken[d1]", "ExponentPushToken[m1]"]);
    for (const m of msgs) {
      expect(m.priority).toBe("high");
      expect(m.ttl).toBe(900);
      expect(m.data).toMatchObject({ t: "w1", c: "c1" });
      expect(m.data.p).toMatchObject({ v: 1, childId: "c1", childName: "Léa Martin" });
      const raw = JSON.stringify(m.data);
      expect(raw).not.toContain("secret");
      expect(raw).not.toContain("dad");
      expect(raw).not.toContain("mum");
      expect(raw).not.toContain("null");
    }
    const mum = msgs.find((m) => m.to.endsWith("[m1]")).data.p;
    const dad = msgs.find((m) => m.to.endsWith("[d1]")).data.p;
    // Même état de l'enfant…
    // Sieste en cours depuis 16:00 : hors des sommeils terminés, comptée à part (avance seule).
    expect(mum.day).toMatchObject({ mealsCount: 1, bottleMl: 120, diapersCount: 1, sleepMinutes: 0 });
    expect(mum.day.sleepRunningFromMs).toBe(mum.live.sinceMs);
    expect(mum.live).toMatchObject({ kind: "sleep", nap: true });
    // …mais l'heure et le jour du fuseau de chaque appareil.
    expect(mum.live.sinceLabel).toBe("depuis 16:00");
    expect(dad.live.sinceLabel).toBe("depuis 10:00");
    expect(mum.dayStartMs).not.toBe(dad.dayStartMs);
    // Premium et rappels propres à chaque parent.
    expect(mum.isPremium).toBe(false);
    expect(dad.isPremium).toBe(true);
    expect(dad.alerts).toEqual({ mealAtMs: NOW + HOUR, diaperAtMs: NOW - HOUR });
    expect(mum.alerts).toEqual({});
  });

  it("interrupteur : rien sans app_config/widgetPush.enabled, et liste de bêta respectée", async () => {
    memoryStore(seed({ "app_config/widgetPush": { enabled: false } }));
    await fanout.fanOutWidget(require("firebase-admin").firestore(), "c1", { urgent: false });
    expect(pushed()).toHaveLength(0);

    jest.clearAllMocks();
    memoryStore(seed({ "app_config/widgetPush": { enabled: true, allowUids: ["mum"] } }));
    await fanout.fanOutWidget(require("firebase-admin").firestore(), "c1", { urgent: false });
    expect(pushed().map((m) => m.to)).toEqual(["ExponentPushToken[m1]"]);
    expect(pushed()[0].priority).toBe("normal");
  });

  it("écarte : sans consentement, compte en suppression, autre enfant affiché, pas de récepteur, iOS", async () => {
    memoryStore(seed({
      "user_preferences/mum": {},
      "users/dad": { pendingDeletion: { scheduledAt: "x" } },
      "device_tokens/x1": { userId: "dad", token: "ExponentPushToken[x1]", platform: "android", widgetPush: true, widgetCap: 1, widgetChildId: "c2" },
    }));
    await fanout.fanOutWidget(require("firebase-admin").firestore(), "c1", { urgent: true });
    expect(pushed()).toHaveLength(0);

    jest.clearAllMocks();
    memoryStore(seed({
      "device_tokens/m1": { userId: "mum", token: "ExponentPushToken[m1]", platform: "android", widgetPush: true, widgetCap: 0, widgetChildId: "c1" },
      "device_tokens/d1": { userId: "dad", token: "ExponentPushToken[d1]", platform: "ios", widgetPush: true, widgetCap: 1, widgetChildId: "c1" },
    }));
    await fanout.fanOutWidget(require("firebase-admin").firestore(), "c1", { urgent: true });
    expect(pushed()).toHaveLength(0);
  });

  it("tétée partagée en cours (non expirée) et enfant supprimé", async () => {
    memoryStore(seed({
      "children/c1/live/nursing": { leftSeconds: 300, rightSeconds: 0, runningSide: "right", runningSince: NOW - 60000, startedAt: NOW - 400000, updatedAt: NOW - 60000, v: 1, updatedBy: "mum" },
    }));
    await fanout.fanOutWidget(require("firebase-admin").firestore(), "c1", { urgent: true });
    const p = pushed().find((m) => m.to.endsWith("[m1]")).data.p;
    expect(p.lives.map((l) => l.kind)).toEqual(["nursing", "sleep"]);
    expect(JSON.stringify(p)).not.toContain("updatedBy");

    jest.clearAllMocks();
    memoryStore(seed({ "children/c1": { name: "Léa", deletedAt: ts(NOW) } }));
    await fanout.fanOutWidget(require("firebase-admin").firestore(), "c1", { urgent: true });
    expect(pushed()).toHaveLength(0);
  });

  it("envoi refusé par Expo (InvalidCredentials) : journalisé en erreur, motif « failed »", async () => {
    memoryStore(seed());
    const logger = require("firebase-functions/logger");
    const errSpy = jest.spyOn(logger, "error").mockImplementation(() => {});
    const infoSpy = jest.spyOn(logger, "info").mockImplementation(() => {});
    expoClient.sendPushNotificationsAsync.mockImplementation(async (chunk) =>
      chunk.map(() => ({ status: "error", message: "Unable to retrieve the FCM server key", details: { error: "InvalidCredentials" } })));
    await fanout.fanOutWidget(require("firebase-admin").firestore(), "c1", { urgent: true });
    expect(errSpy).toHaveBeenCalledWith("sendPushWithTickets: tickets in error", expect.objectContaining({ errorsByCode: { InvalidCredentials: 2 }, delivered: 0, failed: 2 }));
    expect(infoSpy).toHaveBeenCalledWith("widgetFanout: done", expect.objectContaining({ reason: "failed", sent: 0, failed: 2 }));
    errSpy.mockRestore();
    infoSpy.mockRestore();
  });

  it("jeton mort supprimé", async () => {
    const docs = memoryStore(seed());
    expoClient.sendPushNotificationsAsync.mockImplementation(async (chunk) =>
      chunk.map((m) => (m.to.endsWith("[d1]") ? { status: "error", details: { error: "DeviceNotRegistered" } } : { status: "ok", id: "x" })));
    await fanout.fanOutWidget(require("firebase-admin").firestore(), "c1", { urgent: true });
    expect(docs.has("device_tokens/d1")).toBe(false);
    expect(docs.has("device_tokens/m1")).toBe(true);
  });
});

describe("widgetMessageData", () => {
  it("raccourcit le fil du jour sous la taille limite", () => {
    const recent = Array.from({ length: 15 }, (_, i) => ({ ms: NOW - i * 60000, kind: "other", icon: "medicament", label: "x".repeat(200) }));
    const data = fanout.widgetMessageData("c1", NOW, { v: 1, childName: "Léa", lives: [], recent, alerts: {} });
    expect(Buffer.byteLength(JSON.stringify(data))).toBeLessThanOrEqual(3500);
    expect(data.p.recent.length).toBeLessThan(15);
  });
});

describe("triggers", () => {
  it("onWidgetEventWrite ignore un jalon ; onWidgetLiveWrite relit l'enfant", async () => {
    memoryStore(seed());
    const event = (before, after) => ({
      data: { before: { exists: !!before, data: () => before }, after: { exists: !!after, data: () => after } },
    });
    await fanout.onWidgetEventWrite(event(null, { type: "jalon", childId: "c1", date: ts(NOW) }));
    expect(pushed()).toHaveLength(0);
    await fanout.onWidgetEventWrite(event(null, { type: "selle", childId: "c1", date: ts(NOW) }));
    expect(pushed()).toHaveLength(2);
    jest.clearAllMocks();
    await fanout.onWidgetLiveWrite({ params: { childId: "c1" } });
    expect(pushed().every((m) => m.priority === "high")).toBe(true);
  });
});
