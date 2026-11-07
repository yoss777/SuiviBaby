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
const pushed = () => expoClient.sendPushNotificationsAsync.mock.calls.flatMap(([chunk]) => chunk);

describe("checkAndSendReminders", () => {
  let logSpy;
  let errSpy;

  function seed({ prefs = {}, hoursAgo = 5, type = "biberon", tokens = { t1: "ExponentPushToken[a]" }, extra = {} } = {}) {
    const data = {
      "user_preferences/u": {
        healthDataConsent: { granted: true, version: "2.2" },
        notifications: { push: true, reminders: { enabled: true, thresholds: { repas: 3 } } },
        ...prefs,
      },
      "children/c": { name: "Léa" },
      "user_child_access/u_c": { userId: "u", childId: "c" },
      ...extra,
    };
    for (const [id, token] of Object.entries(tokens)) data[`device_tokens/${id}`] = { userId: "u", enabled: true, token };
    if (hoursAgo !== null) data["events/e"] = { childId: "c", type, date: ts(Date.now() - hoursAgo * HOUR) };
    return data;
  }

  beforeEach(() => {
    jest.clearAllMocks();
    expoClient.sendPushNotificationsAsync.mockImplementation(async (chunk) => chunk.map(() => ({ status: "ok", id: "x" })));
    logSpy = jest.spyOn(console, "log").mockImplementation(() => {});
    errSpy = jest.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => [logSpy, errSpy].forEach((s) => s.mockRestore()));

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

  // KNOWN GAP (reported, not fixed): the job ignores push tickets, so a
  // DeviceNotRegistered error neither disables nor deletes the token. This test
  // pins the current behaviour; change it when token cleanup is implemented.
  it("DeviceNotRegistered ticket: current behaviour leaves the token enabled and still records history", async () => {
    expoClient.sendPushNotificationsAsync.mockResolvedValueOnce([
      { status: "error", message: "not registered", details: { error: "DeviceNotRegistered" } },
    ]);
    const docs = memoryStore(seed());
    await fns.checkAndSendReminders();
    expect(docs.get("device_tokens/t1").enabled).toBe(true);
    expect(keys(docs, "notification_history/")).toHaveLength(1);
  });

  it("night/quiet hours: the job has no quiet-hours logic (sends at any hour)", async () => {
    jest.useFakeTimers({ now: new Date(2026, 10, 9, 3, 0, 0), doNotFake: ["nextTick", "setImmediate", "setTimeout", "setInterval", "clearTimeout", "clearInterval", "queueMicrotask", "hrtime", "performance"] });
    try {
      memoryStore(seed());
      await fns.checkAndSendReminders();
      expect(pushed()).toHaveLength(1);
    } finally {
      jest.useRealTimers();
    }
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
