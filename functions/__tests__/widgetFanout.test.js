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
// Regroupement actif mais court dans les tests (20 ms au lieu de 2 s) : les
// chemins du marqueur sont réellement parcourus par toute la suite.
const SUITE_COALESCE_MS = 20;
fanout._setCoalesceMsForTests(SUITE_COALESCE_MS);
// Écart entre envois urgents (R14) coupé pour la suite historique, activé
// dans ses propres tests.
fanout._setUrgentGapMsForTests(0);

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
    "device_tokens/m1": { userId: "mum", token: "ExponentPushToken[m1]", platform: "android", widgetPush: true, widgetCap: 3, widgetChildId: "c1", tz: "Europe/Paris" },
    "device_tokens/d1": { userId: "dad", token: "ExponentPushToken[d1]", platform: "android", widgetPush: true, widgetCap: 3, widgetChildId: "c1", tz: "America/New_York" },
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

  it("droit de saisie : un Proche (contributor) reçoit canWrite=false", async () => {
    memoryStore(seed({ "children/c1/access/dad": { role: "contributor" } }));
    await fanout.fanOutWidget(require("firebase-admin").firestore(), "c1", { urgent: true });
    const msgs = pushed();
    expect(msgs.find((m) => m.to.endsWith("[m1]")).data.p.canWrite).toBe(true);
    expect(msgs.find((m) => m.to.endsWith("[d1]")).data.p.canWrite).toBe(false);
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
      "device_tokens/x1": { userId: "dad", token: "ExponentPushToken[x1]", platform: "android", widgetPush: true, widgetCap: 3, widgetChildId: "c2" },
    }));
    await fanout.fanOutWidget(require("firebase-admin").firestore(), "c1", { urgent: true });
    expect(pushed()).toHaveLength(0);

    jest.clearAllMocks();
    memoryStore(seed({
      "device_tokens/m1": { userId: "mum", token: "ExponentPushToken[m1]", platform: "android", widgetPush: true, widgetCap: 0, widgetChildId: "c1" },
      "device_tokens/d1": { userId: "dad", token: "ExponentPushToken[d1]", platform: "ios", widgetPush: true, widgetCap: 3, widgetChildId: "c1" },
    }));
    await fanout.fanOutWidget(require("firebase-admin").firestore(), "c1", { urgent: true });
    expect(pushed()).toHaveLength(0);
  });

  it("ancienne version (widgetCap < 3, widgetPush resté vrai sans widget) : plus de données", async () => {
    memoryStore(seed({
      "device_tokens/m1": { userId: "mum", token: "ExponentPushToken[m1]", platform: "android", widgetPush: true, widgetCap: 2, widgetChildId: "c1", tz: "Europe/Paris" },
    }));
    await fanout.fanOutWidget(require("firebase-admin").firestore(), "c1", { urgent: true });
    expect(pushed().map((m) => m.to)).toEqual(["ExponentPushToken[d1]"]);
  });

  it("iPhone activé (app_config/widgetPush.ios) : notification silencieuse, priorité normale, sans titre", async () => {
    memoryStore(seed({
      "app_config/widgetPush": { enabled: true, ios: true },
      "device_tokens/d1": { userId: "dad", token: "ExponentPushToken[d1]", platform: "ios", widgetPush: true, widgetCap: 3, widgetChildId: "c1", tz: "Europe/Paris" },
    }));
    await fanout.fanOutWidget(require("firebase-admin").firestore(), "c1", { urgent: true });
    const ios = pushed().find((m) => m.to === "ExponentPushToken[d1]");
    expect(ios).toMatchObject({ _contentAvailable: true, priority: "normal", data: { t: "w1", c: "c1" } });
    expect(ios.title).toBeUndefined();
    expect(ios.body).toBeUndefined();
    expect(ios.sound).toBeUndefined();
    // Android inchangé.
    expect(pushed().find((m) => m.to === "ExponentPushToken[m1]")).toMatchObject({ priority: "high" });
    expect(pushed().find((m) => m.to === "ExponentPushToken[m1]")._contentAvailable).toBeUndefined();
  });

  it("clé des liens de l'appareil ajoutée aux données ; clé mal formée ignorée", async () => {
    memoryStore(seed({
      "device_tokens/m1": { userId: "mum", token: "ExponentPushToken[m1]", platform: "android", widgetPush: true, widgetCap: 3, widgetChildId: "c1", tz: "Europe/Paris", widgetLinkKey: "0123456789abcdef0123456789abcdef" },
      "device_tokens/d1": { userId: "dad", token: "ExponentPushToken[d1]", platform: "android", widgetPush: true, widgetCap: 3, widgetChildId: "c1", tz: "Europe/Paris", widgetLinkKey: "<script>" },
    }));
    await fanout.fanOutWidget(require("firebase-admin").firestore(), "c1", { urgent: true });
    const byTo = Object.fromEntries(pushed().map((m) => [m.to, m]));
    expect(byTo["ExponentPushToken[m1]"].data.p.linkKey).toBe("0123456789abcdef0123456789abcdef");
    expect(byTo["ExponentPushToken[d1]"].data.p.linkKey).toBeUndefined();
  });

  it("iPhone : plafond des notifications silencieuses (2 min pour une session, 20 min sinon)", async () => {
    const ios = (lastIosPushAt) => ({
      "app_config/widgetPush": { enabled: true, ios: true },
      "device_tokens/i1": { userId: "dad", token: "ExponentPushToken[i1]", platform: "ios", widgetPush: true, widgetCap: 3, widgetChildId: "c1", tz: "Europe/Paris", lastIosPushAt },
    });
    const toIos = () => pushed().filter((m) => m.to === "ExponentPushToken[i1]");
    // Envoi il y a 5 min : un évènement ordinaire attend, un début/fin de session passe.
    let docs = memoryStore(seed(ios(NOW - 5 * 60_000)));
    await fanout.fanOutWidget(require("firebase-admin").firestore(), "c1", { urgent: false });
    expect(toIos()).toHaveLength(0);
    await fanout.fanOutWidget(require("firebase-admin").firestore(), "c1", { urgent: true });
    expect(toIos()).toHaveLength(1);
    expect(docs.get("device_tokens/i1").lastIosPushAt).toBe(NOW);
    // Envoi il y a 1 min : même un début de session attend.
    jest.clearAllMocks();
    docs = memoryStore(seed(ios(NOW - 60_000)));
    await fanout.fanOutWidget(require("firebase-admin").firestore(), "c1", { urgent: true });
    expect(toIos()).toHaveLength(0);
    // Android jamais plafonné.
    expect(pushed().some((m) => m.to === "ExponentPushToken[m1]")).toBe(true);
  });

  it("version exigée réglable (app_config) : 2.3 écarte un consentement 2.2 ; réglage illisible → 2.3 (jamais plus permissif)", async () => {
    const base = seed({ "user_preferences/dad": { healthDataConsent: { granted: true, version: "2.2" } } });
    memoryStore({ ...base, "app_config/widgetPush": { ...base["app_config/widgetPush"], minConsentVersion: "2.3" } });
    await fanout.fanOutWidget(require("firebase-admin").firestore(), "c1", { urgent: true });
    expect(pushed().map((m) => m.to)).not.toContain("ExponentPushToken[a1]");
    jest.clearAllMocks();
    expoClient.sendPushNotificationsAsync.mockImplementation(async (chunk) => chunk.map(() => ({ status: "ok", id: "x" })));
    memoryStore({ ...base, "app_config/widgetPush": { ...base["app_config/widgetPush"], minConsentVersion: "2.3; drop" } });
    await fanout.fanOutWidget(require("firebase-admin").firestore(), "c1", { urgent: true });
    expect(pushed().map((m) => m.to)).not.toContain("ExponentPushToken[a1]");
  });

  it("version exigée : nombre 2.3 ou « 2.3 » avec espaces compris ; jamais en dessous de 2.2", () => {
    const { widgetMinConsentVersion } = require("../src/shared/consent");
    expect(widgetMinConsentVersion({ minConsentVersion: 2.3 })).toBe("2.3");
    expect(widgetMinConsentVersion({ minConsentVersion: " 2.3 " })).toBe("2.3");
    expect(widgetMinConsentVersion({ minConsentVersion: "2.1" })).toBe("2.2");
    expect(widgetMinConsentVersion({ minConsentVersion: "" })).toBe("2.3");
    expect(widgetMinConsentVersion({})).toBe("2.2");
    expect(widgetMinConsentVersion(null)).toBe("2.2");
  });

  it("consentement d'une version trop ancienne pour le widget : aucune donnée envoyée", async () => {
    const docs = memoryStore(seed({ "user_preferences/dad": { healthDataConsent: { granted: true, version: "2.1" } } }));
    await fanout.fanOutWidget(require("firebase-admin").firestore(), "c1", { urgent: true });
    // Aucune donnée (w1) vers ses appareils : seulement l'effacement (w0) de
    // celui qui affiche déjà l'enfant (données reçues sous l'ancienne version).
    expect(pushed().filter((m) => m.data?.t === "w1").map((m) => m.to)).toEqual(["ExponentPushToken[m1]"]);
    const wipes = pushed().filter((m) => m.data?.t === "w0");
    expect(wipes.map((m) => m.to)).toEqual(["ExponentPushToken[d1]"]);
    expect(wipes[0].data.p.childName ?? "").toBe("");
    // Enfant retiré du jeton : pas d'effacement répété au prochain envoi.
    expect(docs.get("device_tokens/d1").widgetChildId).toBeUndefined();
    jest.clearAllMocks();
    expoClient.sendPushNotificationsAsync.mockImplementation(async (chunk) => chunk.map(() => ({ status: "ok", id: "x" })));
    await fanout.fanOutWidget(require("firebase-admin").firestore(), "c1", { urgent: true });
    expect(pushed().filter((m) => m.data?.t === "w0")).toHaveLength(0);
  });

  it("température : la valeur mesurée, comme dans l'app (choix produit, politique 2.3)", async () => {
    memoryStore(seed({ "events/t1": { childId: "c1", userId: "dad", type: "temperature", date: ts(NOW - HOUR), valeur: 38.5 } }));
    await fanout.fanOutWidget(require("firebase-admin").firestore(), "c1", { urgent: true });
    const raw = JSON.stringify(pushed().map((m) => m.data));
    expect(raw).toContain("Temp. 38,5 °C");
  });

  it("médicament et vaccin : ni le nom saisi ni aucun texte libre dans le message", async () => {
    memoryStore(seed({
      "events/m1": { childId: "c1", userId: "dad", type: "medicament", date: ts(NOW - HOUR), nomMedicament: "antibiotique otite" },
      "events/v1": { childId: "c1", userId: "dad", type: "vaccin", date: ts(NOW - HOUR), nomVaccin: "Hépatite B rappel" },
    }));
    await fanout.fanOutWidget(require("firebase-admin").firestore(), "c1", { urgent: true });
    const raw = JSON.stringify(pushed().map((m) => m.data));
    expect(raw).not.toContain("antibiotique");
    expect(raw).not.toContain("Hépatite");
    expect(raw).toContain("Médicament");
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
    // Envoi en échec : résumé au niveau « error » (alertable), plus « info ».
    expect(errSpy).toHaveBeenCalledWith("widgetFanout: done", expect.objectContaining({ reason: "failed", sent: 0, failed: 2 }));
    expect(infoSpy).not.toHaveBeenCalledWith("widgetFanout: done", expect.anything());
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
    // Début d'une tétée (état vide → côté en cours) : urgent.
    const tomb = { leftSeconds: 0, rightSeconds: 0, runningSide: null, runningSince: null, startedAt: null, updatedAt: 0 };
    const left = { ...tomb, runningSide: "left", runningSince: NOW - 1000, startedAt: NOW - 1000, updatedAt: NOW };
    await fanout.onWidgetLiveWrite({ params: { childId: "c1", sessionId: "nursing" }, ...event(tomb, left) });
    expect(pushed().length).toBeGreaterThan(0);
    expect(pushed().every((m) => m.priority === "high")).toBe(true);
  });
});

describe("jalon 4 : urgence de la tétée, lectures groupées, regroupement", () => {
  const db = () => require("firebase-admin").firestore();

  it("tétée partagée : tout changement visible est urgent ; un état vide réécrit ne l'est pas", () => {
    // Fin de tétée = état vide écrit (EMPTY_NURSING_TIMER), pas une suppression.
    const tomb = { leftSeconds: 0, rightSeconds: 0, runningSide: null, runningSince: null, startedAt: null, updatedAt: 0 };
    const left = { leftSeconds: 0, rightSeconds: 0, runningSide: "left", runningSince: NOW - 60_000, startedAt: NOW - 60_000, updatedAt: NOW - 1000 };
    const right = { ...left, leftSeconds: 60, runningSide: "right", runningSince: NOW - 5000, updatedAt: NOW - 500 };
    const paused = { ...left, leftSeconds: 60, runningSide: null, runningSince: null, updatedAt: NOW - 500 };
    const expired = { ...paused, updatedAt: NOW - 30 * HOUR };
    expect(fanout.liveChange(tomb, left, NOW)).toEqual({ urgent: true }); // début
    expect(fanout.liveChange(left, tomb, NOW)).toEqual({ urgent: true }); // fin
    // Décision du 18/11 : les autres téléphones suivent en direct.
    expect(fanout.liveChange(left, right, NOW)).toEqual({ urgent: true }); // bascule de côté
    expect(fanout.liveChange(left, paused, NOW)).toEqual({ urgent: true }); // pause
    expect(fanout.liveChange(paused, left, NOW)).toEqual({ urgent: true }); // reprise
    expect(fanout.liveChange(expired, left, NOW)).toEqual({ urgent: true }); // nouveau départ
    expect(fanout.liveChange(null, tomb, NOW)).toEqual({ urgent: false });
    expect(fanout.liveChange(null, left, NOW)).toEqual({ urgent: true });
  });

  it("regroupement : widget désactivé → ni marqueur ni envoi", async () => {
    memoryStore(seed({ "app_config/widgetPush": { enabled: false } }));
    await fanout.coalescedFanOut(db(), "c1", { urgent: false });
    expect((await db().doc("widget_fanout/c1").get()).exists).toBe(false);
    expect(pushed()).toHaveLength(0);
  });

  it("regroupement : coalesceMs 0 dans la config → envoi direct, sans marqueur (regroupement actif par défaut)", async () => {
    memoryStore(seed({ "app_config/widgetPush": { enabled: true, coalesceMs: 0 } }));
    await fanout.coalescedFanOut(db(), "c1", { urgent: false });
    expect((await db().doc("widget_fanout/c1").get()).exists).toBe(false);
    expect(pushed()).toHaveLength(2);
    // Contre-épreuve : sans le réglage, le marqueur est posé.
    memoryStore(seed());
    await fanout.coalescedFanOut(db(), "c1", { urgent: false });
    expect((await db().doc("widget_fanout/c1").get()).exists).toBe(true);
  });

  it("urgent : part sans attendre le délai de regroupement", async () => {
    memoryStore(seed());
    fanout._setCoalesceMsForTests(1500);
    try {
      const t0 = performance.now();
      await fanout.coalescedFanOut(db(), "c1", { urgent: true });
      expect(performance.now() - t0).toBeLessThan(1000);
      expect(pushed()).toHaveLength(2);
    } finally {
      fanout._setCoalesceMsForTests(SUITE_COALESCE_MS);
    }
  });

  it("appareils lus en une seule requête, préférences et abonnements en un aller-retour", async () => {
    memoryStore(seed());
    const firestore = db();
    await fanout.fanOutWidget(firestore, "c1", { urgent: true });
    const deviceQueries = firestore.collection.mock.calls.filter(([name]) => name === "device_tokens");
    expect(deviceQueries).toHaveLength(1);
    const prefRefs = firestore.getAll.mock.calls.flat().map((r) => r.path);
    expect(prefRefs).toEqual(expect.arrayContaining(["user_preferences/mum", "subscriptions/mum", "user_preferences/dad", "subscriptions/dad"]));
    expect(pushed()).toHaveLength(2);
  });

  it("un appareil d'un ancien membre (plus dans access) ne reçoit rien", async () => {
    memoryStore(seed({
      "device_tokens/x1": { userId: "ex", token: "ExponentPushToken[x1]", platform: "android", widgetPush: true, widgetCap: 3, widgetChildId: "c1", tz: "Europe/Paris" },
    }));
    await fanout.fanOutWidget(db(), "c1", { urgent: true });
    expect(pushed().map((m) => m.to)).not.toContain("ExponentPushToken[x1]");
  });

  it("deux saisies rapprochées non urgentes : un seul envoi (le dernier)", async () => {
    memoryStore(seed());
    fanout._setCoalesceMsForTests(30);
    try {
      await Promise.all([
        fanout.coalescedFanOut(db(), "c1", { urgent: false }),
        fanout.coalescedFanOut(db(), "c1", { urgent: false }),
      ]);
    } finally {
      fanout._setCoalesceMsForTests(SUITE_COALESCE_MS);
    }
    // 2 appareils, un seul envoi chacun.
    expect(pushed()).toHaveLength(2);
  });

  it("un envoi urgent part tout de suite et rend caduc l'envoi non urgent en attente", async () => {
    memoryStore(seed());
    fanout._setCoalesceMsForTests(30);
    try {
      const pending = fanout.coalescedFanOut(db(), "c1", { urgent: false });
      // Ordre fixé : le jeton du non urgent est posé avant l'urgent.
      for (let i = 0; i < 100 && !(await db().doc("widget_fanout/c1").get()).exists; i++) {
        await new Promise((r) => setImmediate(r));
      }
      expect((await db().doc("widget_fanout/c1").get()).exists).toBe(true);
      await fanout.coalescedFanOut(db(), "c1", { urgent: true });
      expect(pushed()).toHaveLength(2);
      expect(pushed().every((m) => m.priority === "high")).toBe(true);
      await pending;
    } finally {
      fanout._setCoalesceMsForTests(SUITE_COALESCE_MS);
    }
    expect(pushed()).toHaveLength(2);
  });
});

describe("jalon 4 : replis et filtres (revue ECC)", () => {
  const db = () => require("firebase-admin").firestore();
  // Regroupement actif (court) pour ces tests : sinon le marqueur n'est jamais touché.
  const withCoalesce = async (fn) => {
    fanout._setCoalesceMsForTests(10);
    try {
      await fn();
    } finally {
      fanout._setCoalesceMsForTests(SUITE_COALESCE_MS);
    }
  };
  const failingMarker = (firestore, method) => {
    const realDoc = firestore.doc.getMockImplementation();
    const calls = { n: 0 };
    firestore.doc.mockImplementation((p) => {
      const r = realDoc(p);
      if (p.startsWith("widget_fanout/")) {
        r[method] = async () => {
          calls.n += 1;
          throw Object.assign(new Error(`boom on widget_fanout/c1`), { code: "unavailable" });
        };
      }
      return r;
    });
    return calls;
  };

  it("marqueur impossible à écrire : l'écriture est tentée, journalisée sans identifiant, et l'envoi part", async () => {
    memoryStore(seed());
    const firestore = db();
    const calls = failingMarker(firestore, "set");
    const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
    await withCoalesce(() => fanout.coalescedFanOut(firestore, "c1", { urgent: false }));
    // R14 : marqueur incertain → la réservation tranche (un urgent en attente a
    // peut-être passé la main) ; l'écriture a bien été tentée.
    expect(calls.n).toBeGreaterThanOrEqual(1);
    expect(warn).toHaveBeenCalledWith("widgetFanout: coalesce marker failed", expect.objectContaining({ code: "unavailable" }));
    expect(JSON.stringify(warn.mock.calls)).not.toContain("c1");
    expect(pushed()).toHaveLength(2);
    warn.mockRestore();
  });

  it("marqueur illisible après l'attente : la lecture est tentée et l'envoi part", async () => {
    memoryStore(seed());
    const firestore = db();
    const calls = failingMarker(firestore, "get");
    await withCoalesce(() => fanout.coalescedFanOut(firestore, "c1", { urgent: false }));
    expect(calls.n).toBeGreaterThanOrEqual(1);
    expect(pushed()).toHaveLength(2);
  });

  it("marqueur avec date d'expiration (politique TTL)", async () => {
    memoryStore(seed());
    await withCoalesce(() => fanout.coalescedFanOut(db(), "c1", { urgent: true }));
    const marker = (await db().doc("widget_fanout/c1").get()).data();
    expect(marker.expireAt.toMillis()).toBeGreaterThanOrEqual(Date.now() + 23 * HOUR);
    expect(marker.expireAt.toMillis()).toBeLessThanOrEqual(Date.now() + 25 * HOUR);
  });

  it("urgent puis non urgent, regroupement actif : le non urgent envoie aussi (jamais de perte)", async () => {
    memoryStore(seed());
    await withCoalesce(async () => {
      await fanout.coalescedFanOut(db(), "c1", { urgent: true });
      await fanout.coalescedFanOut(db(), "c1", { urgent: false });
    });
    expect(pushed()).toHaveLength(4);
  });

  it("aucun appareil n'affiche l'enfant : ni marqueur ni attente", async () => {
    memoryStore(seed({ "device_tokens/m1": { userId: "mum", widgetChildId: "c2" }, "device_tokens/d1": { userId: "dad", widgetChildId: "c2" } }));
    await withCoalesce(() => fanout.coalescedFanOut(db(), "c1", { urgent: false }));
    expect((await db().doc("widget_fanout/c1").get()).exists).toBe(false);
    expect(pushed()).toHaveLength(0);
  });

  it("coalesceMs invalide (null) : réglage par défaut, le regroupement reste actif", async () => {
    memoryStore(seed({ "app_config/widgetPush": { enabled: true, coalesceMs: null } }));
    await withCoalesce(() => fanout.coalescedFanOut(db(), "c1", { urgent: false }));
    expect((await db().doc("widget_fanout/c1").get()).exists).toBe(true);
  });

  it("marqueur illisible : deux non urgents rapprochés envoient tous les deux (au lieu d'un seul)", async () => {
    memoryStore(seed());
    const firestore = db();
    const realDoc = firestore.doc.getMockImplementation();
    firestore.doc.mockImplementation((p) => {
      const r = realDoc(p);
      if (p.startsWith("widget_fanout/")) r.get = async () => { throw Object.assign(new Error("x"), { code: "unavailable" }); };
      return r;
    });
    const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
    await Promise.all([
      fanout.coalescedFanOut(firestore, "c1", { urgent: false }),
      fanout.coalescedFanOut(firestore, "c1", { urgent: false }),
    ]);
    expect(pushed()).toHaveLength(4);
    expect(warn).toHaveBeenCalledWith("widgetFanout: coalesce marker unreadable", expect.objectContaining({ code: "unavailable" }));
    warn.mockRestore();
  });

  it("préférences illisibles : le membre est écarté, l'autre reçoit", async () => {
    memoryStore(seed());
    const firestore = db();
    const realGetAll = firestore.getAll.getMockImplementation();
    firestore.getAll.mockImplementation(async (...refs) => {
      if (refs.some((r) => r.path.startsWith("user_preferences/"))) throw new Error("deadline");
      return realGetAll(...refs);
    });
    const realDoc = firestore.doc.getMockImplementation();
    firestore.doc.mockImplementation((p) => {
      const r = realDoc(p);
      if (p === "user_preferences/mum") r.get = async () => { throw new Error("denied"); };
      return r;
    });
    jest.spyOn(console, "warn").mockImplementation(() => {});
    await fanout.fanOutWidget(firestore, "c1", { urgent: true });
    expect(pushed().map((m) => m.to)).toEqual(["ExponentPushToken[d1]"]);
    console.warn.mockRestore();
  });

  it("abonnement illisible : le membre est écarté (jamais rétrogradé en version gratuite)", async () => {
    memoryStore(seed());
    const firestore = db();
    const realGetAll = firestore.getAll.getMockImplementation();
    firestore.getAll.mockImplementation(async (...refs) => {
      if (refs.some((r) => r.path.startsWith("user_preferences/"))) throw new Error("deadline");
      return realGetAll(...refs);
    });
    const realDoc = firestore.doc.getMockImplementation();
    firestore.doc.mockImplementation((p) => {
      const r = realDoc(p);
      if (p === "subscriptions/dad") r.get = async () => { throw new Error("denied"); };
      return r;
    });
    jest.spyOn(console, "warn").mockImplementation(() => {});
    await fanout.fanOutWidget(firestore, "c1", { urgent: true });
    expect(pushed().map((m) => m.to)).toEqual(["ExponentPushToken[m1]"]);
    console.warn.mockRestore();
  });

  it("dernier repas illisible : l'envoi part, repas « inconnu », erreur journalisée", async () => {
    memoryStore(seed());
    const reminderLib = require("../lib/reminders");
    const spy = jest.spyOn(reminderLib, "getLastEventMillis").mockRejectedValueOnce(Object.assign(new Error("x"), { code: "unavailable" }));
    const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
    await fanout.fanOutWidget(db(), "c1", { urgent: true });
    expect(pushed()).toHaveLength(2);
    expect(warn).toHaveBeenCalledWith("widgetFanout: last event unreadable", { code: "unavailable" });
    spy.mockRestore();
    warn.mockRestore();
  });

  it("envoi gagnant en échec passager : réessayé une fois", async () => {
    memoryStore(seed());
    const firestore = db();
    const realDoc = firestore.doc.getMockImplementation();
    let failed = false;
    firestore.doc.mockImplementation((p) => {
      const r = realDoc(p);
      if (p === "children/c1" && !failed) {
        r.get = async () => {
          failed = true;
          throw Object.assign(new Error("x"), { code: "unavailable" });
        };
      }
      return r;
    });
    jest.spyOn(console, "warn").mockImplementation(() => {});
    await fanout.coalescedFanOut(firestore, "c1", { urgent: true });
    expect(failed).toBe(true);
    expect(pushed()).toHaveLength(2);
    console.warn.mockRestore();
  });

  it("déclencheur de la tétée : bascule de côté urgente ; état vide réécrit en priorité normale", async () => {
    memoryStore(seed());
    const event = (before, after) => ({
      data: { before: { exists: !!before, data: () => before }, after: { exists: !!after, data: () => after } },
    });
    const left = { leftSeconds: 0, rightSeconds: 0, runningSide: "left", runningSince: NOW - 60_000, startedAt: NOW - 60_000, updatedAt: NOW - 1000 };
    const right = { ...left, leftSeconds: 60, runningSide: "right", runningSince: NOW - 5000, updatedAt: NOW };
    await fanout.onWidgetLiveWrite({ params: { childId: "c1", sessionId: "nursing" }, ...event(left, right) });
    expect(pushed().length).toBeGreaterThan(0);
    expect(pushed().every((m) => m.priority === "high")).toBe(true);
    jest.clearAllMocks();
    expoClient.sendPushNotificationsAsync.mockImplementation(async (chunk) => chunk.map(() => ({ status: "ok", id: "x" })));
    const tomb = { leftSeconds: 0, rightSeconds: 0, runningSide: null, runningSince: null, startedAt: null, updatedAt: 0 };
    await fanout.onWidgetLiveWrite({ params: { childId: "c1", sessionId: "nursing" }, ...event(tomb, tomb) });
    expect(pushed().length).toBeGreaterThan(0);
    expect(pushed().every((m) => m.priority === "normal")).toBe(true);
    jest.clearAllMocks();
    expoClient.sendPushNotificationsAsync.mockImplementation(async (chunk) => chunk.map(() => ({ status: "ok", id: "x" })));
    // Autre session partagée (pas une tétée) : urgente par défaut.
    await fanout.onWidgetLiveWrite({ params: { childId: "c1", sessionId: "autre" }, ...event(tomb, tomb) });
    expect(pushed().every((m) => m.priority === "high")).toBe(true);
  });

  it("rattrapage iPhone : un envoi urgent bloqué par l'écart de 2 min part dès la fin de l'écart, iPhone seul", async () => {
    const docs = memoryStore(seed({
      "app_config/widgetPush": { enabled: true, ios: true },
      "device_tokens/i1": { userId: "dad", token: "ExponentPushToken[i1]", platform: "ios", widgetPush: true, widgetCap: 3, widgetChildId: "c1", tz: "Europe/Paris", lastIosPushAt: NOW - 60_000 },
    }));
    const waits = [];
    fanout._setCatchUpSleepForTests(async (ms) => {
      waits.push(ms);
      jest.setSystemTime(Date.now() + ms);
    });
    try {
      await fanout.coalescedFanOut(db(), "c1", { urgent: true });
    } finally {
      fanout._setCatchUpSleepForTests(null);
    }
    const toIos = pushed().filter((m) => m.to === "ExponentPushToken[i1]");
    const toAndroid = pushed().filter((m) => m.to === "ExponentPushToken[m1]");
    // Bloqué au premier passage, envoyé au rattrapage, après ~1 min (fin de l'écart).
    expect(toIos).toHaveLength(1);
    expect(waits).toHaveLength(1);
    expect(waits[0]).toBeGreaterThan(55_000);
    expect(waits[0]).toBeLessThanOrEqual(61_000);
    // Le Samsung n'est pas servi deux fois.
    expect(toAndroid).toHaveLength(1);
    expect(docs.get("device_tokens/i1").lastIosPushAt).toBeGreaterThan(NOW);
  });

  it("rattrapage iPhone : deux urgents écartés pendant le même écart → un seul rattrapage, un seul envoi", async () => {
    memoryStore(seed({
      "app_config/widgetPush": { enabled: true, ios: true },
      "device_tokens/i1": { userId: "dad", token: "ExponentPushToken[i1]", platform: "ios", widgetPush: true, widgetCap: 3, widgetChildId: "c1", tz: "Europe/Paris", lastIosPushAt: NOW - 60_000 },
    }));
    const waits = [];
    let release;
    const gate = new Promise((r) => { release = r; });
    fanout._setCatchUpSleepForTests(async (ms) => {
      waits.push(ms);
      await gate; // les deux rattrapages éventuels dorment en même temps
    });
    try {
      // Le premier rattrapage dort ; le second urgent arrive pendant l'écart
      // (la transaction réelle sérialise les réservations ; le simulateur
      // ne rejoue pas les transactions concurrentes, d'où l'ordre explicite).
      const a = fanout.coalescedFanOut(db(), "c1", { urgent: true });
      for (let i = 0; i < 100 && waits.length === 0; i++) await new Promise((r) => setImmediate(r));
      expect(waits).toHaveLength(1);
      await fanout.coalescedFanOut(db(), "c1", { urgent: true }); // rend la main sans dormir
      jest.setSystemTime(Date.now() + 61_000);
      release();
      await a;
    } finally {
      fanout._setCatchUpSleepForTests(null);
    }
    expect(waits).toHaveLength(1);
    expect(pushed().filter((m) => m.to === "ExponentPushToken[i1]")).toHaveLength(1);
  });

  it("rattrapage iPhone : deux iPhone écartés à des heures différentes → tous deux servis au rattrapage", async () => {
    memoryStore(seed({
      "app_config/widgetPush": { enabled: true, ios: true },
      "device_tokens/i1": { userId: "dad", token: "ExponentPushToken[i1]", platform: "ios", widgetPush: true, widgetCap: 3, widgetChildId: "c1", tz: "Europe/Paris", lastIosPushAt: NOW - 60_000 },
      "device_tokens/i2": { userId: "mum", token: "ExponentPushToken[i2]", platform: "ios", widgetPush: true, widgetCap: 3, widgetChildId: "c1", tz: "Europe/Paris", lastIosPushAt: NOW - 10_000 },
    }));
    const waits = [];
    fanout._setCatchUpSleepForTests(async (ms) => {
      waits.push(ms);
      jest.setSystemTime(Date.now() + ms);
    });
    try {
      await fanout.coalescedFanOut(db(), "c1", { urgent: true });
    } finally {
      fanout._setCatchUpSleepForTests(null);
    }
    // Attente jusqu'à la libération du second (~110 s), un seul rattrapage.
    expect(waits).toHaveLength(1);
    expect(waits[0]).toBeGreaterThan(105_000);
    const to = pushed().map((m) => m.to);
    expect(to.filter((t) => t === "ExponentPushToken[i1]")).toHaveLength(1);
    expect(to.filter((t) => t === "ExponentPushToken[i2]")).toHaveLength(1);
  });

  it("rattrapage iPhone : jamais pour un envoi non urgent (plafond de 20 min)", async () => {
    memoryStore(seed({
      "app_config/widgetPush": { enabled: true, ios: true },
      "device_tokens/i1": { userId: "dad", token: "ExponentPushToken[i1]", platform: "ios", widgetPush: true, widgetCap: 3, widgetChildId: "c1", tz: "Europe/Paris", lastIosPushAt: NOW - 60_000 },
    }));
    const waits = [];
    fanout._setCatchUpSleepForTests(async (ms) => { waits.push(ms); });
    try {
      await fanout.coalescedFanOut(db(), "c1", { urgent: false });
    } finally {
      fanout._setCatchUpSleepForTests(null);
    }
    expect(waits).toHaveLength(0);
    expect(pushed().filter((m) => m.to === "ExponentPushToken[i1]")).toHaveLength(0);
  });

  it("coalesceMs invalide (\"\", négatif) : réglage par défaut, marqueur posé", async () => {
    for (const bad of ["", -5, "100"]) {
      memoryStore(seed({ "app_config/widgetPush": { enabled: true, coalesceMs: bad } }));
      await fanout.coalescedFanOut(db(), "c1", { urgent: false });
      expect((await db().doc("widget_fanout/c1").get()).exists).toBe(true);
    }
  });

  it("appareils qui affichent l'enfant sans widget posé (widgetPush faux) : ni marqueur ni attente", async () => {
    memoryStore(seed({
      "device_tokens/m1": { userId: "mum", token: "ExponentPushToken[m1]", platform: "android", widgetPush: false, widgetCap: 3, widgetChildId: "c1" },
      "device_tokens/d1": { userId: "dad", token: "ExponentPushToken[d1]", platform: "android", widgetPush: false, widgetCap: 3, widgetChildId: "c1" },
    }));
    await fanout.coalescedFanOut(db(), "c1", { urgent: false });
    expect((await db().doc("widget_fanout/c1").get()).exists).toBe(false);
    expect(pushed()).toHaveLength(0);
  });

  it("suppression de l'enfant : le marqueur de regroupement est effacé", async () => {
    memoryStore(seed({ "widget_fanout/c1": { token: "t", at: NOW } }));
    const { deleteChildDataBatched } = require("../src/deletion/childData");
    await deleteChildDataBatched(db(), "c1");
    expect((await db().doc("widget_fanout/c1").get()).exists).toBe(false);
  });

  it("lecture groupée en échec : repli sur des lectures une à une, l'envoi part", async () => {
    memoryStore(seed());
    const firestore = db();
    // Seule la lecture groupée des préférences échoue (celle des comptes en
    // suppression, indispensable, passe).
    const realGetAll = firestore.getAll.getMockImplementation();
    firestore.getAll.mockImplementation(async (...refs) => {
      if (refs.some((r) => r.path.startsWith("user_preferences/"))) throw new Error("deadline");
      return realGetAll(...refs);
    });
    await fanout.fanOutWidget(firestore, "c1", { urgent: true });
    expect(pushed()).toHaveLength(2);
  });

  it("nouvelle tétée qui remplace une tétée en pause encore utilisable : urgente", () => {
    const paused = { leftSeconds: 60, rightSeconds: 0, runningSide: null, runningSince: null, startedAt: NOW - 20 * 60_000, updatedAt: NOW - 600_000 };
    const fresh = { leftSeconds: 0, rightSeconds: 0, runningSide: "left", runningSince: NOW - 1000, startedAt: NOW - 1000, updatedAt: NOW };
    expect(fanout.liveChange(paused, fresh, NOW)).toEqual({ urgent: true });
  });

  it("compte en suppression isolé : l'autre parent reçoit, lui non", async () => {
    memoryStore(seed({ "users/dad": { pendingDeletion: true } }));
    await fanout.fanOutWidget(db(), "c1", { urgent: true });
    expect(pushed().map((m) => m.to)).toEqual(["ExponentPushToken[m1]"]);
  });
});

describe("R14 : débit des envois urgents par enfant", () => {
  const db = () => require("firebase-admin").firestore();
  const highCount = () => pushed().filter((m) => m.priority === "high").length;
  let summary;
  beforeEach(() => {
    summary = jest.spyOn(require("../lib/reminders"), "logJobSummary");
    fanout._setWaitSliceMsForTests(5);
  });
  afterEach(() => {
    fanout._setUrgentGapMsForTests(0);
    fanout._setWaitSliceMsForTests(1000);
    summary.mockRestore();
  });
  const settle = () => new Promise((r) => setTimeout(r, 40));
  const summaries = () => summary.mock.calls.map((c) => c[2]);

  it("valeurs par défaut : 5 s d'écart, 60 urgents par heure", () => {
    expect(fanout.URGENT_GAP_MS).toBe(5000);
    expect(fanout.URGENT_PER_HOUR).toBe(60);
  });

  it("rafale d'urgents dans l'écart : le premier part tout de suite, UN seul envoi urgent à la fin de l'écart", async () => {
    memoryStore(seed({ "app_config/widgetPush": { enabled: true, urgentGapMs: 300 } }));
    await fanout.coalescedFanOut(db(), "c1", { urgent: true });
    expect(highCount()).toBe(2); // 2 appareils
    jest.setSystemTime(NOW + 50);
    const a = fanout.coalescedFanOut(db(), "c1", { urgent: true });
    const b = fanout.coalescedFanOut(db(), "c1", { urgent: true });
    await new Promise((r) => setTimeout(r, 30));
    jest.setSystemTime(NOW + 400); // écart écoulé au réveil
    await Promise.all([a, b]);
    expect(highCount()).toBe(4); // un seul envoi de plus (2 appareils)
    // Rafale de 2 : exactement un déclenchement écarté, l'autre envoie en différé.
    expect(summaries().filter((f) => f.rateLimited === true && f.reason === "coalesced")).toHaveLength(1);
    expect(summaries().filter((f) => f.urgentSlot === "deferred").length).toBeGreaterThan(0);
  });

  it("l'envoi différé porte l'état le plus récent (le dernier déclenchement gagne)", async () => {
    memoryStore(seed({ "app_config/widgetPush": { enabled: true, urgentGapMs: 300 } }));
    await fanout.coalescedFanOut(db(), "c1", { urgent: true });
    jest.setSystemTime(NOW + 50);
    const first = fanout.coalescedFanOut(db(), "c1", { urgent: true });
    await new Promise((r) => setTimeout(r, 5));
    const last = fanout.coalescedFanOut(db(), "c1", { urgent: true });
    await new Promise((r) => setTimeout(r, 30));
    jest.setSystemTime(NOW + 400);
    await Promise.all([first, last]);
    expect(highCount()).toBe(4);
    // Le premier est écarté par un urgent plus récent.
    expect(summaries().filter((f) => f.supersededBy === "urgent")).toHaveLength(1);
  });

  it("au-delà de l'écart : chaque urgent part tout de suite", async () => {
    memoryStore(seed({ "app_config/widgetPush": { enabled: true, urgentGapMs: 300 } }));
    await fanout.coalescedFanOut(db(), "c1", { urgent: true });
    jest.setSystemTime(NOW + 1000);
    await fanout.coalescedFanOut(db(), "c1", { urgent: true });
    expect(highCount()).toBe(4);
  });

  it("plafond horaire atteint : l'urgent passe en priorité normale, regroupé", async () => {
    memoryStore(seed({ "app_config/widgetPush": { enabled: true, urgentGapMs: 0, urgentPerHour: 1 } }));
    await fanout.coalescedFanOut(db(), "c1", { urgent: true });
    jest.setSystemTime(NOW + 1000);
    await fanout.coalescedFanOut(db(), "c1", { urgent: true });
    expect(highCount()).toBe(2);
    expect(pushed().filter((m) => m.priority === "normal")).toHaveLength(2);
    expect(summaries().some((f) => f.reason === "urgent-capped")).toBe(true);
    expect(summaries().some((f) => f.urgentCapped === true)).toBe(true);
  });

  it("plafond horaire : une heure plus tard, de nouveau urgent", async () => {
    memoryStore(seed({ "app_config/widgetPush": { enabled: true, urgentGapMs: 0, urgentPerHour: 1 } }));
    await fanout.coalescedFanOut(db(), "c1", { urgent: true });
    jest.setSystemTime(NOW + HOUR + 1000);
    await fanout.coalescedFanOut(db(), "c1", { urgent: true });
    expect(highCount()).toBe(4);
  });

  it("urgentGapMs 0 et urgentPerHour 0 : aucune limite", async () => {
    memoryStore(seed({ "app_config/widgetPush": { enabled: true, urgentGapMs: 0, urgentPerHour: 0 } }));
    for (let i = 0; i < 3; i++) await fanout.coalescedFanOut(db(), "c1", { urgent: true });
    expect(highCount()).toBe(6);
  });

  it("réglage invalide (texte, négatif) : valeurs par défaut", async () => {
    memoryStore(seed({ "app_config/widgetPush": { enabled: true, urgentGapMs: "vite", urgentPerHour: -3 } }));
    fanout._setUrgentGapMsForTests(fanout.URGENT_GAP_MS);
    await fanout.coalescedFanOut(db(), "c1", { urgent: true });
    expect(highCount()).toBe(2);
    const marker = (await db().doc("widget_fanout/c1").get()).data();
    expect(marker.lastUrgentAt).toBe(NOW);
    expect(marker.urgentHourCount).toBe(1);
  });

  it("réservation impossible (transaction en erreur) : l'urgent part quand même", async () => {
    memoryStore(seed({ "app_config/widgetPush": { enabled: true, urgentGapMs: 300 } }));
    const firestore = db();
    const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
    firestore.runTransaction.mockImplementationOnce(async () => {
      throw Object.assign(new Error("aborted"), { code: "aborted" });
    });
    await fanout.coalescedFanOut(firestore, "c1", { urgent: true });
    // Envoyé quand même, en mode plafonné (pas compté : pas de priorité haute
    // Android ; l'iPhone garde l'écart urgent).
    expect(pushed()).toHaveLength(2);
    expect(highCount()).toBe(0);
    expect(warn).toHaveBeenCalledWith("widgetFanout: urgent slot failed", expect.objectContaining({ phase: "claim", code: "aborted" }));
    expect(summaries().some((f) => f.urgentSlot === "failopen" && f.urgentCapped === true)).toBe(true);
    warn.mockRestore();
  });

  it("réservation : un créneau pris, le suivant attend la fin de l'écart (transaction Firestore en production)", async () => {
    memoryStore(seed());
    const firestore = db();
    const ref = firestore.doc("widget_fanout/c1");
    const opts = { gapMs: 300, perHour: 60 };
    expect(await fanout.claimUrgentSlot(firestore, ref, "t1", { ...opts, nowMs: NOW })).toEqual({ action: "send" });
    expect(await fanout.claimUrgentSlot(firestore, ref, "t2", { ...opts, nowMs: NOW + 100 })).toEqual({ action: "wait", waitMs: 200 });
    // Le jeton du dernier déclenchement est posé, même en attente.
    expect((await ref.get()).data().token).toBe("t2");
    expect(await fanout.claimUrgentSlot(firestore, ref, "t3", { ...opts, nowMs: NOW + 300 })).toEqual({ action: "send" });
  });

  it("urgence héritée : la fin de tétée en attente est remplacée par une saisie non urgente, l'envoi part quand même en URGENT (revue ECC)", async () => {
    memoryStore(seed({ "app_config/widgetPush": { enabled: true, urgentGapMs: 300 } }));
    await fanout.coalescedFanOut(db(), "c1", { urgent: true }); // changement de côté
    expect(highCount()).toBe(2);
    jest.setSystemTime(NOW + 50);
    const end = fanout.coalescedFanOut(db(), "c1", { urgent: true }); // fin de tétée : attend
    await settle();
    expect((await db().doc("widget_fanout/c1").get()).data().urgentPending).toBe(true);
    const history = fanout.coalescedFanOut(db(), "c1", { urgent: false }); // tétée enregistrée dans l'historique
    await settle();
    jest.setSystemTime(NOW + 400);
    await Promise.all([end, history]);
    expect(highCount()).toBe(4); // parti en urgent, une seule fois
    expect(pushed().filter((m) => m.priority === "normal")).toHaveLength(0);
    expect(summaries().some((f) => f.supersededBy === "normal")).toBe(true);
    expect(summaries().some((f) => f.inheritedUrgent === true && f.reason === "sent")).toBe(true);
    expect((await db().doc("widget_fanout/c1").get()).data().urgentPending).toBe(false);
  });

  it("sans urgent en attente, une saisie non urgente reste en priorité normale", async () => {
    memoryStore(seed({ "app_config/widgetPush": { enabled: true, urgentGapMs: 300 } }));
    await fanout.coalescedFanOut(db(), "c1", { urgent: true });
    jest.setSystemTime(NOW + 1000);
    await fanout.coalescedFanOut(db(), "c1", { urgent: false });
    expect(highCount()).toBe(2);
    expect(pushed().filter((m) => m.priority === "normal")).toHaveLength(2);
  });

  it("plafond atteint pendant l'attente : envoi au-delà du plafond (normal sur Android)", async () => {
    memoryStore(seed({
      "app_config/widgetPush": { enabled: true, urgentGapMs: 300, urgentPerHour: 1 },
    }));
    await fanout.coalescedFanOut(db(), "c1", { urgent: true }); // compte 1/1
    jest.setSystemTime(NOW + 50);
    const p = fanout.coalescedFanOut(db(), "c1", { urgent: true }); // attend puis plafond
    await settle();
    jest.setSystemTime(NOW + 400);
    await p;
    expect(highCount()).toBe(2);
    expect(pushed().filter((m) => m.priority === "normal")).toHaveLength(2);
    expect(summaries().some((f) => f.reason === "urgent-capped")).toBe(true);
  });

  it("fenêtre d'une heure : plafond jusqu'à la dernière milliseconde, compteur remis à 1 ensuite", async () => {
    memoryStore(seed());
    const firestore = db();
    const ref = firestore.doc("widget_fanout/c1");
    const opts = { gapMs: 0, perHour: 1 };
    expect(await fanout.claimUrgentSlot(firestore, ref, "a", { ...opts, nowMs: NOW })).toEqual({ action: "send" });
    expect(await fanout.claimUrgentSlot(firestore, ref, "b", { ...opts, nowMs: NOW + HOUR - 1 })).toEqual({ action: "downgrade" });
    expect(await fanout.claimUrgentSlot(firestore, ref, "c", { ...opts, nowMs: NOW + HOUR })).toEqual({ action: "send" });
    const data = (await ref.get()).data();
    expect(data.urgentHourCount).toBe(1);
    expect(data.urgentHourStart).toBe(NOW + HOUR);
  });

  it("réglage trop grand plafonné à 15 s et signalé ; réglage invalide signalé", async () => {
    memoryStore(seed({ "app_config/widgetPush": { enabled: true, urgentGapMs: 999999, urgentPerHour: "beaucoup" } }));
    const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
    await fanout.coalescedFanOut(db(), "c1", { urgent: true });
    expect(warn).toHaveBeenCalledWith("widgetFanout: config value capped", { key: "urgentGapMs", max: 15000 });
    expect(warn).toHaveBeenCalledWith("widgetFanout: invalid config value, default used", { key: "urgentPerHour" });
    warn.mockRestore();
  });

  it("deux enfants : limites indépendantes", async () => {
    memoryStore(seed({
      "app_config/widgetPush": { enabled: true, urgentGapMs: 300 },
      "children/c2": { name: "Tom", ownerId: "mum" },
      "children/c2/access/mum": { role: "owner" },
      "device_tokens/m2": { userId: "mum", token: "ExponentPushToken[m2]", platform: "android", widgetPush: true, widgetCap: 3, widgetChildId: "c2", tz: "Europe/Paris" },
    }));
    await fanout.coalescedFanOut(db(), "c1", { urgent: true });
    await fanout.coalescedFanOut(db(), "c2", { urgent: true }); // pas bloqué par c1
    expect(pushed().filter((m) => m.priority === "high").map((m) => m.to)).toContain("ExponentPushToken[m2]");
  });

  const iosSeed = (extra = {}) => seed({
    "device_tokens/i1": { userId: "dad", token: "ExponentPushToken[i1]", platform: "ios", widgetPush: true, widgetCap: 3, widgetChildId: "c1", tz: "Europe/Paris", lastIosPushAt: NOW - 5 * 60_000 },
    ...extra,
  });

  it("plafonné : Android en priorité normale, mais l'iPhone garde l'écart URGENT (servi à 5 min, pas à 20)", async () => {
    memoryStore(iosSeed({ "app_config/widgetPush": { enabled: true, ios: true, urgentGapMs: 0, urgentPerHour: 1 } }));
    fanout._setCatchUpSleepForTests(async () => {});
    try {
      await fanout.coalescedFanOut(db(), "c1", { urgent: true }); // 1/1, iPhone servi (5 min > 2 min)
      jest.setSystemTime(NOW + 3 * 60_000); // 3 min après : < 20 min (écart normal), > 2 min (écart urgent)
      await fanout.coalescedFanOut(db(), "c1", { urgent: true }); // plafonné
    } finally {
      fanout._setCatchUpSleepForTests(null);
    }
    const toIos = pushed().filter((m) => m.to === "ExponentPushToken[i1]");
    expect(toIos).toHaveLength(2);
    const lastAndroid = pushed().filter((m) => m.to === "ExponentPushToken[m1]").pop();
    expect(lastAndroid.priority).toBe("normal");
  });

  it("plafonné puis une saisie non urgente prend la main : elle hérite et part en mode plafonné (iPhone protégé)", async () => {
    memoryStore(iosSeed({ "app_config/widgetPush": { enabled: true, ios: true, urgentGapMs: 0, urgentPerHour: 1 } }));
    fanout._setCatchUpSleepForTests(async () => {});
    try {
      await fanout.coalescedFanOut(db(), "c1", { urgent: true });
      jest.setSystemTime(NOW + 3 * 60_000);
      const end = fanout.coalescedFanOut(db(), "c1", { urgent: true }); // plafonné, attend le regroupement
      await new Promise((r) => setTimeout(r, 2));
      const history = fanout.coalescedFanOut(db(), "c1", { urgent: false }); // prend la main
      await Promise.all([end, history]);
    } finally {
      fanout._setCatchUpSleepForTests(null);
    }
    expect(pushed().filter((m) => m.to === "ExponentPushToken[i1]")).toHaveLength(2);
    expect(summaries().some((f) => f.inheritedUrgent === true && f.urgentCapped === true)).toBe(true);
  });

  it("nouvelle réservation alors qu'un autre urgent a pris la main : rien n'est écrit, l'autre envoie", async () => {
    memoryStore(seed());
    const firestore = db();
    const ref = firestore.doc("widget_fanout/c1");
    await fanout.claimUrgentSlot(firestore, ref, "a", { gapMs: 300, perHour: 60, nowMs: NOW });
    await fanout.claimUrgentSlot(firestore, ref, "b", { gapMs: 300, perHour: 60, nowMs: NOW + 10 }); // b attend, jeton b
    expect(await fanout.claimUrgentSlot(firestore, ref, "a", { gapMs: 300, perHour: 60, nowMs: NOW + 20, reclaim: true })).toEqual({ action: "superseded", byUrgent: true });
    expect((await ref.get()).data().token).toBe("b");
    // Nouvelle réservation qui doit encore attendre : n'écrit pas.
    const before = (await ref.get()).data();
    expect(await fanout.claimUrgentSlot(firestore, ref, "b", { gapMs: 300, perHour: 60, nowMs: NOW + 30, reclaim: true })).toEqual({ action: "wait", waitMs: 270 });
    expect((await ref.get()).data()).toEqual(before);
  });

  it("heure enregistrée dans le futur : ignorée (pas d'attente en boucle jusqu'au délai)", async () => {
    memoryStore(seed({ "widget_fanout/c1": { lastUrgentAt: NOW + 10 * 60_000 } }));
    const firestore = db();
    const ref = firestore.doc("widget_fanout/c1");
    expect(await fanout.claimUrgentSlot(firestore, ref, "a", { gapMs: 300, perHour: 60, nowMs: NOW })).toEqual({ action: "send" });
  });

  it("drapeau « urgent en attente » trop ancien : une saisie normale reste normale", async () => {
    memoryStore(seed({
      "app_config/widgetPush": { enabled: true, urgentGapMs: 300 },
      "widget_fanout/c1": { urgentPending: true, urgentPendingAt: NOW - 5 * 60_000 },
    }));
    await fanout.coalescedFanOut(db(), "c1", { urgent: false });
    expect(highCount()).toBe(0);
    expect(pushed().filter((m) => m.priority === "normal")).toHaveLength(2);
  });

  it("marqueur illisible chez une saisie normale : envoi urgent par la réservation (un urgent en attente n'est pas rétrogradé)", async () => {
    memoryStore(seed({ "app_config/widgetPush": { enabled: true, urgentGapMs: 300 } }));
    const firestore = db();
    const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
    const ref = firestore.doc("widget_fanout/c1");
    const realGet = ref.get.bind(ref);
    let failed = false;
    const origDoc = firestore.doc.getMockImplementation();
    firestore.doc.mockImplementation((path) => {
      const r = origDoc(path);
      if (path === "widget_fanout/c1") {
        const g = r.get;
        r.get = async () => {
          if (!failed) {
            failed = true;
            throw Object.assign(new Error("x"), { code: "unavailable" });
          }
          return g();
        };
      }
      return r;
    });
    await fanout.coalescedFanOut(firestore, "c1", { urgent: false });
    expect(highCount()).toBe(2);
    expect(summaries().some((f) => f.markerUncertain === true && f.reason === "sent")).toBe(true);
    void realGet;
    warn.mockRestore();
  });

  it("chaque ligne de journal porte l'identifiant court du déclenchement (sans donnée personnelle)", async () => {
    memoryStore(seed({ "app_config/widgetPush": { enabled: true, urgentGapMs: 300 } }));
    await fanout.coalescedFanOut(db(), "c1", { urgent: true });
    const sent = summaries().find((f) => f.reason === "sent");
    expect(sent.trig).toMatch(/^[a-z0-9-]{8}$/);
    expect(sent.urgentRequested).toBe(true);
    expect(JSON.stringify(summaries())).not.toContain("c1");
  });

  it("coalesceMs 0 : interrupteur d'urgence, aucune limite ni marqueur", async () => {
    memoryStore(seed({ "app_config/widgetPush": { enabled: true, coalesceMs: 0, urgentGapMs: 300 } }));
    await fanout.coalescedFanOut(db(), "c1", { urgent: true });
    await fanout.coalescedFanOut(db(), "c1", { urgent: true });
    expect(highCount()).toBe(4);
    expect((await db().doc("widget_fanout/c1").get()).exists).toBe(false);
  });

  it("réservation refaite en erreur après l'attente : drapeau remis à faux, envoi plafonné, failopen", async () => {
    memoryStore(seed({ "app_config/widgetPush": { enabled: true, urgentGapMs: 300 } }));
    const firestore = db();
    const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
    await fanout.coalescedFanOut(firestore, "c1", { urgent: true });
    jest.setSystemTime(NOW + 50);
    const p = fanout.coalescedFanOut(firestore, "c1", { urgent: true });
    await settle(); // première réservation faite : attente
    jest.setSystemTime(NOW + 400);
    firestore.runTransaction.mockImplementationOnce(async () => {
      throw Object.assign(new Error("aborted"), { code: "aborted" });
    });
    await p;
    expect(warn).toHaveBeenCalledWith("widgetFanout: urgent slot failed", expect.objectContaining({ phase: "reclaim" }));
    expect(summaries().some((f) => f.urgentSlot === "failopen" && f.waitedMs > 0 && f.urgentCapped === true)).toBe(true);
    expect((await firestore.doc("widget_fanout/c1").get()).data().urgentPending).toBe(false);
    warn.mockRestore();
  });

  it("remise à faux du drapeau : jamais celui d'un autre déclenchement", async () => {
    memoryStore(seed({ "widget_fanout/c1": { token: "autre", urgentPending: true, urgentPendingAt: NOW } }));
    const firestore = db();
    await fanout._clearUrgentPendingIfMineForTests(firestore, firestore.doc("widget_fanout/c1"), "moi");
    expect((await firestore.doc("widget_fanout/c1").get()).data().urgentPending).toBe(true);
  });

  it("réservation remplacée par une saisie normale : étiquette supersededBy « normal »", async () => {
    memoryStore(seed());
    const firestore = db();
    const ref = firestore.doc("widget_fanout/c1");
    await firestore.doc("widget_fanout/c1").set({ token: "n1", tokenUrgent: false });
    expect(await fanout.claimUrgentSlot(firestore, ref, "a", { gapMs: 300, perHour: 60, nowMs: NOW, reclaim: true })).toEqual({ action: "superseded", byUrgent: false });
  });

  it("l'héritier note l'identifiant de l'urgent d'origine (inheritedFrom)", async () => {
    memoryStore(seed({ "app_config/widgetPush": { enabled: true, urgentGapMs: 300 } }));
    await fanout.coalescedFanOut(db(), "c1", { urgent: true });
    jest.setSystemTime(NOW + 50);
    const end = fanout.coalescedFanOut(db(), "c1", { urgent: true });
    await settle();
    const pendingTrig = (await db().doc("widget_fanout/c1").get()).data().urgentTrig;
    expect(pendingTrig).toMatch(/^[a-z0-9-]{8}$/);
    const history = fanout.coalescedFanOut(db(), "c1", { urgent: false });
    await settle();
    jest.setSystemTime(NOW + 400);
    await Promise.all([end, history]);
    expect(summaries().some((f) => f.inheritedFrom === pendingTrig && f.reason === "sent")).toBe(true);
  });

  it("drapeau trop ancien : envoi normal signalé stalePending", async () => {
    memoryStore(seed({
      "app_config/widgetPush": { enabled: true, urgentGapMs: 300 },
      "widget_fanout/c1": { urgentPending: true, urgentPendingAt: NOW - 10 * 60_000 },
    }));
    await fanout.coalescedFanOut(db(), "c1", { urgent: false });
    expect(summaries().some((f) => f.stalePending === true && f.reason === "sent")).toBe(true);
  });

  it("envoi en échec après son nouvel essai : ligne « failed » avec le déclenchement, drapeau remis pour une reprise", async () => {
    memoryStore(seed({ "app_config/widgetPush": { enabled: true, urgentGapMs: 300 } }));
    const firestore = db();
    const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
    firestore.getAll.mockRejectedValue(Object.assign(new Error("boom"), { code: "unavailable" }));
    await expect(fanout.coalescedFanOut(firestore, "c1", { urgent: true })).rejects.toThrow("boom");
    const failed = summaries().find((f) => f.reason === "failed");
    expect(failed).toMatchObject({ urgentRequested: true, errorCode: "unavailable" });
    expect(failed.trig).toMatch(/^[a-z0-9-]{8}$/);
    const marker = (await firestore.doc("widget_fanout/c1").get()).data();
    expect(marker.urgentPending).toBe(true);
    expect(marker.urgentTrig).toBe(failed.trig);
    warn.mockRestore();
  });

  it("rattrapage iPhone : l'identifiant du déclenchement figure sur sa ligne", async () => {
    memoryStore(seed({
      "app_config/widgetPush": { enabled: true, ios: true },
      "device_tokens/i1": { userId: "dad", token: "ExponentPushToken[i1]", platform: "ios", widgetPush: true, widgetCap: 3, widgetChildId: "c1", tz: "Europe/Paris", lastIosPushAt: NOW - 60_000 },
    }));
    fanout._setCatchUpSleepForTests(async (ms) => jest.setSystemTime(Date.now() + ms));
    try {
      await fanout.coalescedFanOut(db(), "c1", { urgent: true });
    } finally {
      fanout._setCatchUpSleepForTests(null);
    }
    const lines = summaries().filter((f) => f.reason === "sent");
    expect(lines.length).toBe(2); // envoi + rattrapage
    expect(lines[0].trig).toBeDefined();
    expect(lines[1].trig).toBe(lines[0].trig);
    expect(lines[1].iosOnly).toBe(true);
  });

  it("rattrapage iPhone qui finirait après 160 s : sauté et signalé", async () => {
    memoryStore(seed({ "app_config/widgetPush": { enabled: true, ios: true } }));
    const out = await fanout._iosCatchUpForTests(db(), "c1", { enabled: true, ios: true }, { iosRetryAtMs: NOW + 100_000 }, { trig: "t" }, NOW - 70_000);
    expect(out.iosCatchUp).toBe("skipped-deadline");
    expect(summaries().some((f) => f.reason === "ios-catchup-skipped" && f.trig === "t")).toBe(true);
  });
});
