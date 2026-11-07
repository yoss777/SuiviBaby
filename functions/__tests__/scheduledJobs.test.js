/* global describe, it, expect, jest, beforeEach, afterEach */
// S11.2: scheduled jobs. checkAndSendReminders (threshold, opt-in, dedup,
// invalid tokens, failures) and the sendWeeklyRecap cases not covered in
// weeklyRecap.test.js (no consent, Resend failure, force-run week).
require("./setup");
const { memoryStore } = require("./memoryFirestore");
const { Expo } = require("expo-server-sdk");
const { Resend } = require("resend");
const adminMod = require("firebase-admin");

const expoClient = {
  sendPushNotificationsAsync: jest.fn(),
  chunkPushNotifications: jest.fn((m) => [m]),
};
Expo.mockImplementation(() => expoClient);
Expo.isExpoPushToken = jest.fn((t) => typeof t === "string" && t.startsWith("ExponentPushToken["));
const fns = require("../index");

const HOUR = 3600 * 1000;
const ts = (ms) => ({ toMillis: () => ms, toDate: () => new Date(ms) });
const keys = (docs, prefix) => [...docs.keys()].filter((k) => k.startsWith(prefix));
/** Fige seulement Date (les promesses et timers réels restent intacts). */
const setNow = (iso) => {
  jest.useFakeTimers({
    now: Date.parse(iso),
    doNotFake: ["nextTick", "setImmediate", "clearImmediate", "setTimeout", "clearTimeout", "setInterval", "clearInterval", "queueMicrotask", "performance", "hrtime"],
  });
};
const pushed = () => expoClient.sendPushNotificationsAsync.mock.calls.flatMap(([chunk]) => chunk);

describe("checkAndSendReminders", () => {
  let logSpy;
  let errSpy;

  function seed({ prefs = {}, hoursAgo = 5, type = "biberon", tokens = { t1: "ExponentPushToken[a]" }, extra = {}, access = true } = {}) {
    const data = {
      "user_preferences/u": {
        healthDataConsent: { granted: true, version: "2.2" },
        notifications: { push: true, reminders: { enabled: true, thresholds: { repas: 3 } } },
        ...prefs,
      },
      "children/c": { name: "Léa" },
      "user_child_access/u_c": { userId: "u", childId: "c" },
      ...(access ? { "children/c/access/u": { role: "owner", userId: "u" } } : {}),
      ...extra,
    };
    for (const [id, token] of Object.entries(tokens)) data[`device_tokens/${id}`] = { userId: "u", enabled: true, token };
    if (hoursAgo !== null) data["events/e"] = { childId: "c", type, date: ts(Date.now() - hoursAgo * HOUR) };
    return data;
  }

  beforeEach(() => {
    jest.clearAllMocks();
    // Heures calmes par défaut 22:00-07:00 : l'horloge est fixée à midi (Paris)
    // pour que les cas hors heures calmes ne dépendent pas de l'heure du test.
    setNow("2026-06-15T10:00:00Z");
    expoClient.sendPushNotificationsAsync.mockImplementation(async (chunk) => chunk.map(() => ({ status: "ok", id: "x" })));
    logSpy = jest.spyOn(console, "log").mockImplementation(() => {});
    errSpy = jest.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => {
    [logSpy, errSpy].forEach((s) => s.mockRestore());
    jest.useRealTimers();
  });

  it("notifies when the threshold is exceeded, with child and category in the message, and records history", async () => {
    const docs = memoryStore(seed({ hoursAgo: 5 }));
    await fns.checkAndSendReminders();
    expect(pushed()).toHaveLength(1);
    expect(pushed()[0]).toMatchObject({
      to: "ExponentPushToken[a]",
      title: "Rappel repas — Léa",
      body: "Plus de 5h depuis le dernier repas",
      data: { type: "reminder", category: "repas", childId: "c" },
    });
    const [h] = keys(docs, "notification_history/");
    expect(docs.get(h)).toMatchObject({ userId: "u", childId: "c", category: "repas", thresholdHours: 3, elapsedHours: 5 });
  });

  it("does not notify below the threshold, without event, for a category with threshold 0 or another category", async () => {
    for (const s of [
      seed({ hoursAgo: 2 }),
      seed({ hoursAgo: 2.9 }), // just under the threshold
      seed({ hoursAgo: null }),
      seed({ hoursAgo: 10, prefs: { notifications: { push: true, reminders: { enabled: true, thresholds: { repas: 0 } } } } }),
      seed({ hoursAgo: 10, type: "vitamine" }), // only repas has a threshold
    ]) {
      memoryStore(s);
      await fns.checkAndSendReminders();
    }
    expect(expoClient.sendPushNotificationsAsync).not.toHaveBeenCalled();
  });

  it("sends nothing when reminders are disabled or push is off", async () => {
    memoryStore(seed({ prefs: { notifications: { push: true, reminders: { enabled: false, thresholds: { repas: 1 } } } } }));
    await fns.checkAndSendReminders();
    memoryStore(seed({ prefs: { notifications: { push: false, reminders: { enabled: true, thresholds: { repas: 1 } } } } }));
    await fns.checkAndSendReminders();
    expect(expoClient.sendPushNotificationsAsync).not.toHaveBeenCalled();
  });

  it("ignores disabled device tokens and tokens that are not Expo push tokens", async () => {
    memoryStore(seed({
      tokens: { good: "ExponentPushToken[ok]", junk: "not-a-token" },
      extra: { "device_tokens/off": { userId: "u", enabled: false, token: "ExponentPushToken[off]" } },
    }));
    await fns.checkAndSendReminders();
    expect(pushed().map((m) => m.to)).toEqual(["ExponentPushToken[ok]"]);

    jest.clearAllMocks();
    memoryStore(seed({ tokens: { junk: "not-a-token" } }));
    await fns.checkAndSendReminders();
    expect(expoClient.sendPushNotificationsAsync).not.toHaveBeenCalled();
  });

  it("deduplicates: a second run within 2 h sends nothing, a run after 2 h notifies again", async () => {
    const docs = memoryStore(seed());
    await fns.checkAndSendReminders();
    await fns.checkAndSendReminders();
    expect(pushed()).toHaveLength(1);
    expect(keys(docs, "notification_history/")).toHaveLength(1);

    // Age the history entry beyond the 2 h window.
    const [h] = keys(docs, "notification_history/");
    docs.set(h, { ...docs.get(h), sentAt: ts(Date.now() - 2 * HOUR - 60000) });
    await fns.checkAndSendReminders();
    expect(pushed()).toHaveLength(2);
  });

  it("dedup is per user, child and category", async () => {
    const docs = memoryStore(seed());
    docs.set("notification_history/other", { userId: "u", childId: "c", category: "changes", sentAt: ts(Date.now() - 600000) });
    docs.set("notification_history/other2", { userId: "someone", childId: "c", category: "repas", sentAt: ts(Date.now() - 600000) });
    await fns.checkAndSendReminders();
    expect(pushed()).toHaveLength(1);
  });

  it("a failed send writes no history (retried next run) and does not stop the run", async () => {
    expoClient.sendPushNotificationsAsync.mockRejectedValueOnce(new Error("expo down"));
    const docs = memoryStore(seed());
    await fns.checkAndSendReminders();
    expect(keys(docs, "notification_history/")).toHaveLength(0);
    expect(errSpy).toHaveBeenCalled();
    await fns.checkAndSendReminders();
    expect(keys(docs, "notification_history/")).toHaveLength(1);
  });

  // S12.4: the push tickets are read. DeviceNotRegistered deletes the token and
  // no notification_history is written for a ticket in error.
  it("DeviceNotRegistered ticket: the token is deleted and no history is written", async () => {
    expoClient.sendPushNotificationsAsync.mockResolvedValueOnce([
      { status: "error", message: "not registered", details: { error: "DeviceNotRegistered" } },
    ]);
    const docs = memoryStore(seed());
    await fns.checkAndSendReminders();
    expect(docs.has("device_tokens/t1")).toBe(false);
    expect(keys(docs, "notification_history/")).toHaveLength(0);
  });

  describe("heures calmes (quiet hours)", () => {
    const quiet = (quietHours, extra = {}) => ({
      notifications: { push: true, reminders: { enabled: true, thresholds: { repas: 3 }, ...(quietHours ? { quietHours } : {}) } },
      ...extra,
    });
    const logger = require("firebase-functions/logger");
    let infoSpy;
    beforeEach(() => { infoSpy = jest.spyOn(logger, "info").mockImplementation(() => {}); });
    afterEach(() => infoSpy.mockRestore());
    const summary = () => infoSpy.mock.calls.filter(([m]) => m === "checkAndSendReminders: done").pop()?.[1];

    it("par défaut (champ absent) : rien entre 22:00 et 07:00 à Paris, envoi le jour", async () => {
      setNow("2026-06-15T21:00:00Z"); // 23:00 Paris
      const docs = memoryStore(seed({ hoursAgo: 5 }));
      await fns.checkAndSendReminders();
      expect(expoClient.sendPushNotificationsAsync).not.toHaveBeenCalled();
      expect(keys(docs, "notification_history/")).toHaveLength(0);

      setNow("2026-06-16T05:00:00Z"); // 07:00 Paris : la fin est exclue
      memoryStore(seed({ hoursAgo: 5 }));
      await fns.checkAndSendReminders();
      expect(pushed()).toHaveLength(1);
    });

    it("pas de file d'attente : le rappel part au passage suivant après la fin, dédup de 2 h conservée", async () => {
      const docs = memoryStore(seed({ hoursAgo: 5 }));
      setNow("2026-06-16T04:30:00Z"); // 06:30 Paris
      await fns.checkAndSendReminders();
      expect(pushed()).toHaveLength(0);
      setNow("2026-06-16T05:00:00Z"); // 07:00 Paris
      await fns.checkAndSendReminders();
      expect(pushed()).toHaveLength(1);
      setNow("2026-06-16T05:30:00Z"); // 07:30 : dédup 2 h
      await fns.checkAndSendReminders();
      expect(pushed()).toHaveLength(1);
      expect(keys(docs, "notification_history/")).toHaveLength(1);
    });

    it("plage qui passe minuit, plage dans la journée et heures personnalisées", async () => {
      setNow("2026-06-15T22:30:00Z"); // 00:30 Paris
      memoryStore(seed({ hoursAgo: 5, prefs: quiet({ enabled: true, start: "23:00", end: "06:00", timeZone: "Europe/Paris" }) }));
      await fns.checkAndSendReminders();
      expect(pushed()).toHaveLength(0);

      setNow("2026-06-15T10:00:00Z"); // 12:00 Paris, plage 12:00-14:00
      memoryStore(seed({ hoursAgo: 5, prefs: quiet({ enabled: true, start: "12:00", end: "14:00", timeZone: "Europe/Paris" }) }));
      await fns.checkAndSendReminders();
      expect(pushed()).toHaveLength(0);

      setNow("2026-06-15T05:00:00Z"); // 07:00 Paris, plage 23:00-06:00 : dehors
      memoryStore(seed({ hoursAgo: 5, prefs: quiet({ enabled: true, start: "23:00", end: "06:00", timeZone: "Europe/Paris" }) }));
      await fns.checkAndSendReminders();
      expect(pushed()).toHaveLength(1);
    });

    it("désactivé ou début == fin : envoi même la nuit", async () => {
      setNow("2026-06-15T23:30:00Z"); // 01:30 Paris
      memoryStore(seed({ hoursAgo: 5, prefs: quiet({ enabled: false, start: "22:00", end: "07:00", timeZone: "Europe/Paris" }) }));
      await fns.checkAndSendReminders();
      expect(pushed()).toHaveLength(1);

      jest.clearAllMocks();
      memoryStore(seed({ hoursAgo: 5, prefs: quiet({ enabled: true, start: "22:00", end: "22:00", timeZone: "Europe/Paris" }) }));
      await fns.checkAndSendReminders();
      expect(pushed()).toHaveLength(1);
    });

    it("heure du fuseau de l'utilisateur (America/Montreal)", async () => {
      const mtl = { enabled: true, start: "22:00", end: "07:00", timeZone: "America/Montreal" };
      setNow("2026-06-15T20:00:00Z"); // 22:00 Paris mais 16:00 Montréal : envoi
      memoryStore(seed({ hoursAgo: 5, prefs: quiet(mtl) }));
      await fns.checkAndSendReminders();
      expect(pushed()).toHaveLength(1);

      jest.clearAllMocks();
      setNow("2026-06-15T10:00:00Z"); // 12:00 Paris mais 06:00 Montréal : silence
      memoryStore(seed({ hoursAgo: 5, prefs: quiet(mtl) }));
      await fns.checkAndSendReminders();
      expect(pushed()).toHaveLength(0);
    });

    it("changement d'heure à Paris : 22:00 locale suit l'offset réel (CET puis CEST)", async () => {
      setNow("2027-03-27T20:30:00Z"); // 21:30 CET : envoi
      memoryStore(seed({ hoursAgo: 5 }));
      await fns.checkAndSendReminders();
      expect(pushed()).toHaveLength(1);

      jest.clearAllMocks();
      setNow("2027-03-27T21:00:00Z"); // 22:00 CET : silence
      memoryStore(seed({ hoursAgo: 5 }));
      await fns.checkAndSendReminders();
      expect(pushed()).toHaveLength(0);

      setNow("2027-03-28T04:30:00Z"); // 06:30 CEST (nuit de 23 h) : silence
      memoryStore(seed({ hoursAgo: 5 }));
      await fns.checkAndSendReminders();
      expect(pushed()).toHaveLength(0);

      setNow("2027-03-28T05:00:00Z"); // 07:00 CEST : envoi
      memoryStore(seed({ hoursAgo: 5 }));
      await fns.checkAndSendReminders();
      expect(pushed()).toHaveLength(1);
    });

    it("valeurs invalides : repli sur les défauts, le job ne plante pas", async () => {
      setNow("2026-06-15T21:00:00Z"); // 23:00 Paris
      for (const bad of [
        { enabled: true, start: "99:99", end: "xx", timeZone: "Mars/Olympus" },
        { enabled: "oui", start: 22, end: null, timeZone: 7 },
        "n'importe quoi",
      ]) {
        memoryStore(seed({ hoursAgo: 5, prefs: quiet(bad) }));
        await fns.checkAndSendReminders();
      }
      expect(pushed()).toHaveLength(0);
      expect(errSpy).not.toHaveBeenCalled();
    });

    it("compte skippedQuietHours dans le journal structuré du job", async () => {
      setNow("2026-06-15T21:00:00Z");
      memoryStore(seed({ hoursAgo: 5 }));
      await fns.checkAndSendReminders();
      expect(summary()).toMatchObject({ job: "checkAndSendReminders", skippedQuietHours: 1, sent: 0 });

      setNow("2026-06-15T10:00:00Z");
      memoryStore(seed({ hoursAgo: 5 }));
      await fns.checkAndSendReminders();
      expect(summary()).toMatchObject({ skippedQuietHours: 0, sent: 1 });
    });
  });

  it("skips a child whose access document is gone, even if the index entry remains (revoked member)", async () => {
    memoryStore(seed({ access: false }));
    await fns.checkAndSendReminders();
    expect(expoClient.sendPushNotificationsAsync).not.toHaveBeenCalled();
  });

  it("keeps the audience: any role with an access document is reminded", async () => {
    for (const role of ["owner", "admin", "contributor", "viewer"]) {
      jest.clearAllMocks();
      expoClient.sendPushNotificationsAsync.mockImplementation(async (chunk) => chunk.map(() => ({ status: "ok", id: "x" })));
      memoryStore(seed({ extra: { "children/c/access/u": { role, userId: "u" } } }));
      await fns.checkAndSendReminders();
      expect(pushed()).toHaveLength(1);
    }
  });

  it("an event whose date is missing or invalid never triggers an immediate reminder (fallback query)", async () => {
    for (const date of ["not a date", 12345, undefined]) {
      jest.clearAllMocks();
      const data = seed({ hoursAgo: null });
      data["events/bad"] = { childId: "c", type: "biberon", ...(date === undefined ? {} : { date }) };
      memoryStore(data);
      await fns.checkAndSendReminders();
      expect(expoClient.sendPushNotificationsAsync).not.toHaveBeenCalled();
    }
  });

  it("several overdue categories after the only token died: one send, the rest is skipped", async () => {
    expoClient.sendPushNotificationsAsync.mockResolvedValue([
      { status: "error", message: "gone", details: { error: "DeviceNotRegistered" } },
    ]);
    const data = seed({
      prefs: { notifications: { push: true, reminders: { enabled: true, thresholds: { repas: 3, changes: 3, vitamines: 3 } } } },
    });
    data["events/e2"] = { childId: "c", type: "couche", date: ts(Date.now() - 6 * HOUR) };
    data["events/e3"] = { childId: "c", type: "vitamine", date: ts(Date.now() - 6 * HOUR) };
    const docs = memoryStore(data);
    await fns.checkAndSendReminders();
    expect(expoClient.sendPushNotificationsAsync).toHaveBeenCalledTimes(1);
    expect(docs.has("device_tokens/t1")).toBe(false);
    expect(keys(docs, "notification_history/")).toHaveLength(0);
  });

  it("mixed tickets: the live device counts as delivered (history written), the dead token is removed", async () => {
    expoClient.sendPushNotificationsAsync.mockResolvedValueOnce([
      { status: "ok", id: "1" },
      { status: "error", message: "gone", details: { error: "DeviceNotRegistered" } },
    ]);
    const docs = memoryStore(seed({ tokens: { live: "ExponentPushToken[live]", dead: "ExponentPushToken[dead]" } }));
    await fns.checkAndSendReminders();
    expect(docs.has("device_tokens/live")).toBe(true);
    expect(docs.has("device_tokens/dead")).toBe(false);
    expect(keys(docs, "notification_history/")).toHaveLength(1);
  });

  it("a ticket in error other than DeviceNotRegistered keeps the token and writes no history", async () => {
    expoClient.sendPushNotificationsAsync.mockResolvedValueOnce([
      { status: "error", message: "rate", details: { error: "MessageRateExceeded" } },
    ]);
    const docs = memoryStore(seed());
    await fns.checkAndSendReminders();
    expect(docs.has("device_tokens/t1")).toBe(true);
    expect(keys(docs, "notification_history/")).toHaveLength(0);
  });

  it("two push chunks, the second throws: history is recorded for the delivered first chunk, no duplicate on retry", async () => {
    expoClient.chunkPushNotifications.mockImplementationOnce((m) => m.map((x) => [x]));
    expoClient.sendPushNotificationsAsync
      .mockResolvedValueOnce([{ status: "ok", id: "1" }])
      .mockRejectedValueOnce(new Error("expo down"));
    const docs = memoryStore(seed({ tokens: { a: "ExponentPushToken[a]", b: "ExponentPushToken[b]" } }));
    await fns.checkAndSendReminders();
    expect(keys(docs, "notification_history/")).toHaveLength(1);

    jest.clearAllMocks();
    expoClient.sendPushNotificationsAsync.mockImplementation(async (chunk) => chunk.map(() => ({ status: "ok", id: "x" })));
    await fns.checkAndSendReminders();
    // within the 2 h window: nobody is notified twice
    expect(expoClient.sendPushNotificationsAsync).not.toHaveBeenCalled();
  });

  it("two push chunks that both throw: no history, error reported, retried next run", async () => {
    expoClient.chunkPushNotifications.mockImplementationOnce((m) => m.map((x) => [x]));
    expoClient.sendPushNotificationsAsync.mockRejectedValue(new Error("expo down"));
    const docs = memoryStore(seed({ tokens: { a: "ExponentPushToken[a]", b: "ExponentPushToken[b]" } }));
    await fns.checkAndSendReminders();
    expect(keys(docs, "notification_history/")).toHaveLength(0);
    expect(errSpy).toHaveBeenCalled();
  });
});

describe("removeDeadTokens", () => {
  const reminders = require("../lib/reminders");
  const tok = (token, del) => ({ token, ref: { delete: del } });

  it("a failed delete does not reject (the reminder history is not dropped) and counts only the deleted tokens", async () => {
    const ok = jest.fn().mockResolvedValue();
    const ko = jest.fn().mockRejectedValue(new Error("unavailable"));
    const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
    const count = await reminders.removeDeadTokens(
      [tok("a", ok), tok("b", ko), tok("live", jest.fn())],
      new Set(["a", "b"]),
    );
    expect(count).toBe(1);
    expect(ok).toHaveBeenCalled();
    expect(ko).toHaveBeenCalled();
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it("deletes nothing when no token is dead", async () => {
    const del = jest.fn();
    expect(await reminders.removeDeadTokens([tok("a", del)], new Set())).toBe(0);
    expect(del).not.toHaveBeenCalled();
  });
});

describe("sendWeeklyRecap (additional cases)", () => {
  let spies;
  const sent = () => Resend.mock.results.flatMap((r) => r.value.emails.send.mock.calls.map(([p]) => p));
  const week = new Date(2026, 10, 4, 12).getTime();
  const base = (consent = { granted: true, version: "2.2" }) => ({
    "user_preferences/u": { notifications: { email: true }, ...(consent ? { healthDataConsent: consent } : {}) },
    "children/c": { name: "Léa" },
    "children/c/access/u": { role: "owner", userId: "u" },
    "user_child_access/u_c": { userId: "u", childId: "c" },
    "events/e": { childId: "c", type: "biberon", date: ts(week) },
  });

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers({ now: new Date(2026, 10, 9, 8, 0, 0), doNotFake: ["nextTick", "setImmediate", "setTimeout", "setInterval", "clearTimeout", "clearInterval", "queueMicrotask", "hrtime", "performance"] });
    process.env.RESEND_API_KEY = "re_test";
    process.env.RECAP_UNSUBSCRIBE_SECRET = "s".repeat(32);
    adminMod.auth.mockReturnValue({ getUser: jest.fn(async () => ({ email: "o@t.com", emailVerified: true, disabled: false })) });
    spies = ["log", "warn", "error"].map((m) => jest.spyOn(console, m).mockImplementation(() => {}));
  });
  afterEach(() => {
    jest.useRealTimers();
    delete process.env.RESEND_API_KEY;
    delete process.env.RECAP_UNSUBSCRIBE_SECRET;
    spies.forEach((s) => s.mockRestore());
  });

  it("sends nothing without a granted health consent", async () => {
    memoryStore(base(null));
    await fns.sendWeeklyRecap();
    memoryStore(base({ granted: false }));
    await fns.sendWeeklyRecap();
    expect(sent()).toEqual([]);
  });

  it("sends nothing without a Resend key", async () => {
    delete process.env.RESEND_API_KEY;
    memoryStore(base());
    await fns.sendWeeklyRecap();
    expect(sent()).toEqual([]);
  });

  it("a Resend error result writes no recap_history (so the next run retries)", async () => {
    memoryStore(base());
    Resend.mockImplementationOnce(() => ({ emails: { send: jest.fn(async () => ({ error: { name: "rate_limit", message: "slow down" } })) } }));
    const docs = memoryStore(base());
    await fns.sendWeeklyRecap();
    expect(keys(docs, "recap_history/")).toHaveLength(0);
  });

  it("the e-mail carries a neutral body: no figures, child first name only, unsubscribe header and history written", async () => {
    const docs = memoryStore(base());
    await fns.sendWeeklyRecap();
    const [p] = sent();
    expect(p.to).toBe("o@t.com");
    expect(p.headers["List-Unsubscribe"]).toMatch(/^<https:\/\/.+\/unsubscribeRecap\?uid=u&token=[0-9a-f]{64}>$/);
    expect(p.headers["List-Unsubscribe-Post"]).toBe("List-Unsubscribe=One-Click");
    expect(p.subject).not.toMatch(/\d/);
    expect(keys(docs, "recap_history/")).toHaveLength(1);
  });

  it("ignores events outside the recapped week", async () => {
    const d = base();
    d["events/e"] = { childId: "c", type: "biberon", date: ts(new Date(2026, 10, 1, 12).getTime()) }; // previous Sunday week
    memoryStore(d);
    await fns.sendWeeklyRecap();
    expect(sent()).toEqual([]);
  });
});

// Bornes de la semaine du récap, y compris les semaines de changement d'heure.
// Le code calcule en heure locale du processus : on fixe TZ=Europe/Paris ici
// (en production le runtime est en UTC, voir les notes de la revue ECC).
describe("sendWeeklyRecap week boundaries (Europe/Paris, DST weeks)", () => {
  const originalTz = process.env.TZ;
  let spies;
  const sent = () => Resend.mock.results.flatMap((r) => r.value.emails.send.mock.calls.map(([p]) => p));
  const FAKE = ["nextTick", "setImmediate", "setTimeout", "setInterval", "clearTimeout", "clearInterval", "queueMicrotask", "hrtime", "performance"];
  const run = async (nowLocal, eventLocal) => {
    jest.useFakeTimers({ now: nowLocal, doNotFake: FAKE });
    const docs = memoryStore({
      "user_preferences/u": { notifications: { email: true }, healthDataConsent: { granted: true, version: "2.2" } },
      "children/c": { name: "Léa" },
      "children/c/access/u": { role: "owner", userId: "u" },
      "user_child_access/u_c": { userId: "u", childId: "c" },
      "events/e": { childId: "c", type: "biberon", date: ts(eventLocal.getTime()) },
    });
    await fns.sendWeeklyRecap();
    jest.useRealTimers();
    return docs;
  };

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.TZ = "Europe/Paris";
    process.env.RESEND_API_KEY = "re_test";
    process.env.RECAP_UNSUBSCRIBE_SECRET = "s".repeat(32);
    adminMod.auth.mockReturnValue({ getUser: jest.fn(async () => ({ email: "o@t.com", emailVerified: true, disabled: false })) });
    spies = ["log", "warn", "error"].map((m) => jest.spyOn(console, m).mockImplementation(() => {}));
  });
  afterEach(() => {
    jest.useRealTimers();
    if (originalTz === undefined) delete process.env.TZ;
    else process.env.TZ = originalTz;
    delete process.env.RESEND_API_KEY;
    delete process.env.RECAP_UNSUBSCRIBE_SECRET;
    spies.forEach((s) => s.mockRestore());
  });

  it("the test really runs in Paris time", () => {
    expect(new Date(2026, 6, 1).getTimezoneOffset()).toBe(-120);
    expect(new Date(2026, 0, 1).getTimezoneOffset()).toBe(-60);
  });

  it("normal week (Mon 9 Nov 2026): Monday 00:00 and Sunday 23:59:59 are inside, the neighbours are outside", async () => {
    const now = new Date(2026, 10, 9, 8, 0, 0);
    expect(sent()).toHaveLength(0);
    const inside = [new Date(2026, 10, 2, 0, 0, 0), new Date(2026, 10, 8, 23, 59, 59)];
    const outside = [new Date(2026, 10, 1, 23, 59, 59), new Date(2026, 10, 9, 0, 0, 0)];
    for (const d of inside) {
      jest.clearAllMocks();
      await run(now, d);
      expect(sent()).toHaveLength(1);
    }
    for (const d of outside) {
      jest.clearAllMocks();
      await run(now, d);
      expect(sent()).toHaveLength(0);
    }
  });

  it("week after the spring change (Mon 30 Mar 2026, 7 days minus 1 h): bounds are local midnights", async () => {
    const now = new Date(2026, 2, 30, 8, 0, 0);
    const docs = await run(now, new Date(2026, 2, 29, 23, 30, 0));
    expect(sent()).toHaveLength(1);
    const [h] = keys(docs, "recap_history/");
    expect(docs.get(h).weekStart.toMillis()).toBe(new Date(2026, 2, 23, 0, 0, 0, 0).getTime());
    expect(docs.get(h).weekEnd.toMillis()).toBe(new Date(2026, 2, 29, 23, 59, 59, 999).getTime());
    jest.clearAllMocks();
    await run(now, new Date(2026, 2, 30, 0, 30, 0)); // Monday morning: next week
    expect(sent()).toHaveLength(0);
    await run(now, new Date(2026, 2, 22, 23, 30, 0)); // previous Sunday: previous week
    expect(sent()).toHaveLength(0);
  });

  it("week after the autumn change (Mon 26 Oct 2026, 7 days plus 1 h): bounds are local midnights", async () => {
    const now = new Date(2026, 9, 26, 8, 0, 0);
    const docs = await run(now, new Date(2026, 9, 25, 23, 30, 0));
    expect(sent()).toHaveLength(1);
    const [h] = keys(docs, "recap_history/");
    expect(docs.get(h).weekStart.toMillis()).toBe(new Date(2026, 9, 19, 0, 0, 0, 0).getTime());
    expect(docs.get(h).weekEnd.toMillis()).toBe(new Date(2026, 9, 25, 23, 59, 59, 999).getTime());
    jest.clearAllMocks();
    await run(now, new Date(2026, 9, 19, 0, 30, 0)); // first night of the week
    expect(sent()).toHaveLength(1);
    jest.clearAllMocks();
    await run(now, new Date(2026, 9, 26, 0, 30, 0));
    expect(sent()).toHaveLength(0);
  });
});
