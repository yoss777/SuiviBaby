/* global describe, it, expect, jest, beforeEach, afterEach */
// S12.4: lastEventAt per reminder category on the child document, kept up to
// date by the event callables, read by the reminder and recap jobs (with a
// query fallback while the field is missing), dead push tokens, bounded
// concurrency and the end-of-run structured log.
require("./setup");
const { memoryStore } = require("./memoryFirestore");
const { Expo } = require("expo-server-sdk");
const { Resend } = require("resend");
const adminMod = require("firebase-admin");
const logger = require("firebase-functions/logger");

const expoClient = {
  sendPushNotificationsAsync: jest.fn(),
  chunkPushNotifications: jest.fn((m) => [m]),
};
Expo.mockImplementation(() => expoClient);
Expo.isExpoPushToken = jest.fn((t) => typeof t === "string" && t.startsWith("ExponentPushToken["));
const fns = require("../index");
const reminders = require("../lib/reminders");

const HOUR = 3600 * 1000;
const ts = (ms) => ({ toMillis: () => ms, toDate: () => new Date(ms) });
const call = (uid, data) => ({ auth: { uid, token: { email: `${uid}@t.com` } }, data, app: true });
const keys = (docs, prefix) => [...docs.keys()].filter((k) => k.startsWith(prefix));
const pushed = () => expoClient.sendPushNotificationsAsync.mock.calls.flatMap(([chunk]) => chunk);
const ms = (v) => v?.toMillis?.();

describe("categories", () => {
  it("maps event types to the reminder categories the job uses", () => {
    expect(reminders.categoryForType("biberon")).toBe("repas");
    expect(reminders.categoryForType("tetee")).toBe("repas");
    expect(reminders.categoryForType("pompage")).toBe("pompages");
    expect(reminders.categoryForType("selle")).toBe("changes");
    expect(reminders.categoryForType("vitamine")).toBe("vitamines");
    expect(reminders.categoryForType("bain")).toBeNull();
    expect(reminders.categoryForType(undefined)).toBeNull();
  });
});

describe("maintenance of children/{id}.lastEventAt by the event callables", () => {
  const D1 = Date.now() - 5 * HOUR;
  const D2 = Date.now() - 2 * HOUR;
  const base = () => ({
    "children/c": { name: "Léa" },
    "children/c/access/u": { role: "owner", userId: "u" },
  });
  let warnSpy;
  beforeEach(() => {
    jest.clearAllMocks();
    warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});
  });
  afterEach(() => warnSpy.mockRestore());

  it("creating an event sets its category and the overall value; the other categories are initialised to null", async () => {
    const docs = memoryStore(base());
    const { id } = await fns.validateAndCreateEvent(call("u", { childId: "c", type: "biberon", quantite: 100, date: new Date(D1).toISOString() }));
    expect(id).toBeDefined();
    const last = docs.get("children/c").lastEventAt;
    expect(ms(last.repas)).toBe(D1);
    expect(ms(last.any)).toBe(D1);
    expect(last).toMatchObject({ pompages: null, changes: null, vitamines: null });
  });

  it("a newer event of the same category moves the value forward, an older one does not", async () => {
    const docs = memoryStore(base());
    await fns.validateAndCreateEvent(call("u", { childId: "c", type: "biberon", quantite: 100, date: new Date(D1).toISOString() }));
    await fns.validateAndCreateEvent(call("u", { childId: "c", type: "tetee", date: new Date(D2).toISOString() }));
    expect(ms(docs.get("children/c").lastEventAt.repas)).toBe(D2);
    await fns.validateAndCreateEvent(call("u", { childId: "c", type: "biberon", quantite: 80, date: new Date(D1 - HOUR).toISOString() }));
    expect(ms(docs.get("children/c").lastEventAt.repas)).toBe(D2);
  });

  it("an event type without reminder category only moves the overall value", async () => {
    const docs = memoryStore(base());
    await fns.validateAndCreateEvent(call("u", { childId: "c", type: "bain", date: new Date(D2).toISOString() }));
    const last = docs.get("children/c").lastEventAt;
    expect(ms(last.any)).toBe(D2);
    expect(last.repas).toBeNull();
  });

  it("an idempotent replay does not touch lastEventAt a second time", async () => {
    const docs = memoryStore(base());
    const data = { childId: "c", type: "biberon", quantite: 100, date: new Date(D1).toISOString(), idempotencyKey: "k1" };
    await fns.validateAndCreateEvent(call("u", data));
    expect(ms(docs.get("children/c").lastEventAt.repas)).toBe(D1);
    docs.get("children/c").lastEventAt.repas = ts(1);
    await fns.validateAndCreateEvent(call("u", data));
    expect(ms(docs.get("children/c").lastEventAt.repas)).toBe(1);
  });

  it("a key-based creation also maintains lastEventAt", async () => {
    const docs = memoryStore(base());
    await fns.validateAndCreateEvent(call("u", { childId: "c", type: "pompage", date: new Date(D1).toISOString(), idempotencyKey: "k2" }));
    expect(ms(docs.get("children/c").lastEventAt.pompages)).toBe(D1);
  });

  it("updating an event's type or date recomputes both the old and the new category", async () => {
    const docs = memoryStore({
      ...base(),
      "events/e1": { childId: "c", userId: "u", type: "biberon", date: ts(D1) },
      "events/e2": { childId: "c", userId: "u", type: "biberon", date: ts(D1 - HOUR) },
      "children/c": { name: "Léa", lastEventAt: { repas: ts(D1), pompages: null, changes: null, vitamines: null, any: ts(D1) } },
    });
    await fns.validateAndUpdateEvent(call("u", { childId: "c", eventId: "e1", type: "pompage" }));
    const last = docs.get("children/c").lastEventAt;
    expect(ms(last.repas)).toBe(D1 - HOUR); // e2 is now the latest meal
    expect(ms(last.pompages)).toBe(D1);
  });

  it("legacy child with lastEventAt: null: the whole map is written (no dotted update on a null parent)", async () => {
    const docs = memoryStore({ ...base(), "children/c": { name: "Léa", lastEventAt: null } });
    await fns.validateAndCreateEvent(call("u", { childId: "c", type: "biberon", quantite: 100, date: new Date(D1).toISOString() }));
    const last = docs.get("children/c").lastEventAt;
    expect(ms(last.repas)).toBe(D1);
    expect(ms(last.any)).toBe(D1);
    expect(last).toMatchObject({ pompages: null, changes: null, vitamines: null });
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it("a scalar legacy lastEventAt is replaced by the map too", async () => {
    const docs = memoryStore({ ...base(), "children/c": { name: "Léa", lastEventAt: "oops" } });
    await fns.validateAndCreateEvent(call("u", { childId: "c", type: "bain", date: new Date(D2).toISOString() }));
    expect(ms(docs.get("children/c").lastEventAt.any)).toBe(D2);
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it("transaction retry (create): `created` is reset, a concurrent winner means no refresh", async () => {
    const refresh = jest.spyOn(reminders, "safeRefreshLastEventAt");
    const docs = memoryStore(base(), {
      txRetries: 1,
      // between the attempts someone else creates the same event
      beforeRetry: (d, attempt, paths) => d.set(paths[0], { childId: "c", userId: "u", type: "biberon", date: ts(D1) }),
    });
    const data = { childId: "c", type: "biberon", quantite: 100, date: new Date(D1).toISOString(), idempotencyKey: "k-retry" };
    const { id } = await fns.validateAndCreateEvent(call("u", data));
    expect(docs.has(`events/${id}`)).toBe(true);
    expect(refresh).not.toHaveBeenCalled();
    refresh.mockRestore();
  });

  it("transaction retry (update): touchedTypes is reset, only the types of the last attempt are refreshed", async () => {
    const refresh = jest.spyOn(reminders, "safeRefreshLastEventAt");
    memoryStore(
      {
        ...base(),
        "events/e1": { childId: "c", userId: "u", type: "biberon", date: ts(D1) },
      },
      {
        txRetries: 1,
        // the first attempt saw "biberon"; a concurrent edit makes it "selle"
        beforeRetry: (d) => d.set("events/e1", { childId: "c", userId: "u", type: "selle", date: ts(D1) }),
      },
    );
    await fns.validateAndUpdateEvent(call("u", { childId: "c", eventId: "e1", type: "pompage" }));
    expect(refresh).toHaveBeenCalledTimes(1);
    expect([...refresh.mock.calls[0][2]].sort()).toEqual(["pompage", "selle"]);
    refresh.mockRestore();
  });

  it("memory store sanity: reads after a write fail like Firestore, orderBy skips documents without the field", async () => {
    const docs = memoryStore({ "a/1": { n: 1 }, "a/2": {}, "a/3": { n: 3 } });
    const db = require("firebase-admin").firestore();
    const snap = await db.collection("a").orderBy("n").get();
    expect(snap.docs.map((d) => d.id)).toEqual(["1", "3"]);
    await expect(db.runTransaction(async (tx) => {
      tx.set(db.doc("a/9"), { n: 9 });
      await tx.get(db.doc("a/1"));
    })).rejects.toThrow(/reads to be executed before all writes/);
    expect(docs.has("a/9")).toBe(false);
  });

  it("updating the date moves the value", async () => {
    const docs = memoryStore({
      ...base(),
      "events/e1": { childId: "c", userId: "u", type: "biberon", date: ts(D1) },
      "children/c": { name: "Léa", lastEventAt: { repas: ts(D1), any: ts(D1), pompages: null, changes: null, vitamines: null } },
    });
    await fns.validateAndUpdateEvent(call("u", { childId: "c", eventId: "e1", date: new Date(D2).toISOString() }));
    expect(ms(docs.get("children/c").lastEventAt.repas)).toBe(D2);
  });

  it("deleting the latest event falls back to the previous one, deleting the only one sets null", async () => {
    const docs = memoryStore({
      ...base(),
      "events/e1": { childId: "c", userId: "u", type: "biberon", date: ts(D2) },
      "events/e2": { childId: "c", userId: "u", type: "biberon", date: ts(D1) },
      "children/c": { name: "Léa", lastEventAt: { repas: ts(D2), any: ts(D2), pompages: null, changes: null, vitamines: null } },
    });
    await fns.deleteEventCascade(call("u", { childId: "c", eventId: "e1" }));
    expect(ms(docs.get("children/c").lastEventAt.repas)).toBe(D1);
    await fns.deleteEventCascade(call("u", { childId: "c", eventId: "e2" }));
    const last = docs.get("children/c").lastEventAt;
    expect(last.repas).toBeNull();
    expect(last.any).toBeNull();
  });

  it("a failure of the maintenance never fails the event write (logged instead)", async () => {
    const docs = memoryStore(base());
    docs.delete("children/c"); // the transaction finds no child: nothing to update
    await expect(
      fns.validateAndCreateEvent(call("u", { childId: "c", type: "biberon", quantite: 100, date: new Date(D1).toISOString() }))
    ).resolves.toHaveProperty("id");
    const broken = { doc: () => { throw new Error("tx aborted"); } };
    await expect(reminders.safeRefreshLastEventAt(broken, "c", ["biberon"])).resolves.toBe(false);
    expect(warnSpy).toHaveBeenCalled();
  });

  it("an admin removing a reported event via resolveReport keeps lastEventAt coherent", async () => {
    // Covered by the same helper: recompute after the deletion.
    const docs = memoryStore({
      "events/e1": { childId: "c", type: "biberon", date: ts(D2) },
      "children/c": { name: "Léa", lastEventAt: { repas: ts(D2), any: ts(D2), pompages: null, changes: null, vitamines: null } },
    });
    docs.delete("events/e1");
    await reminders.refreshLastEventAt(adminMod.firestore(), "c", ["biberon"]);
    expect(docs.get("children/c").lastEventAt.repas).toBeNull();
  });
});

describe("checkAndSendReminders reads lastEventAt (no event query when present)", () => {
  let logSpy;
  let infoSpy;
  const prefs = {
    healthDataConsent: { granted: true, version: "2.2" },
    notifications: { push: true, reminders: { enabled: true, thresholds: { repas: 3 } } },
  };
  const seed = (child, withEvent = null) => ({
    "user_preferences/u": prefs,
    "children/c": { name: "Léa", ...child },
    "user_child_access/u_c": { userId: "u", childId: "c" },
    "children/c/access/u": { role: "owner", userId: "u" },
    "device_tokens/t1": { userId: "u", enabled: true, token: "ExponentPushToken[a]" },
    ...(withEvent ? { "events/e": withEvent } : {}),
  });
  const lastEvents = (hours) => ({ lastEventAt: { repas: ts(Date.now() - hours * HOUR), pompages: null, changes: null, vitamines: null, any: ts(Date.now() - hours * HOUR) } });

  beforeEach(() => {
    jest.clearAllMocks();
    // Heures calmes par défaut 22:00-07:00 : horloge figée à midi (Paris) pour ne pas dépendre de l'heure d'exécution.
    jest.spyOn(Date, "now").mockReturnValue(Date.parse("2026-06-15T10:00:00Z"));
    expoClient.sendPushNotificationsAsync.mockImplementation(async (chunk) => chunk.map(() => ({ status: "ok", id: "x" })));
    logSpy = jest.spyOn(console, "log").mockImplementation(() => {});
    jest.spyOn(console, "error").mockImplementation(() => {});
    infoSpy = jest.spyOn(logger, "info").mockImplementation(() => {});
  });
  afterEach(() => jest.restoreAllMocks());

  it("notifies from lastEventAt alone, without touching the events collection", async () => {
    const docs = memoryStore(seed(lastEvents(5)));
    const spy = jest.spyOn(adminMod.firestore(), "collection");
    await fns.checkAndSendReminders();
    expect(pushed()).toHaveLength(1);
    expect(spy.mock.calls.map(([c]) => c)).not.toContain("events");
    expect(keys(docs, "notification_history/")).toHaveLength(1);
  });

  it("does not notify when lastEventAt is recent or null", async () => {
    memoryStore(seed(lastEvents(1)));
    await fns.checkAndSendReminders();
    memoryStore(seed({ lastEventAt: { repas: null, any: null } }, { childId: "c", type: "biberon", date: ts(Date.now() - 9 * HOUR) }));
    await fns.checkAndSendReminders();
    expect(expoClient.sendPushNotificationsAsync).not.toHaveBeenCalled();
  });

  it("falls back to the events query when the field is missing (migration-safe)", async () => {
    memoryStore(seed({}, { childId: "c", type: "biberon", date: ts(Date.now() - 5 * HOUR) }));
    await fns.checkAndSendReminders();
    expect(pushed()).toHaveLength(1);
    expect(infoSpy).toHaveBeenCalledWith(
      "checkAndSendReminders: done",
      expect.objectContaining({ fallbackReads: 1 })
    );
  });

  it("falls back for a single missing category while others come from the field", async () => {
    memoryStore(seed({ lastEventAt: { pompages: null } }, { childId: "c", type: "biberon", date: ts(Date.now() - 5 * HOUR) }));
    await fns.checkAndSendReminders();
    expect(pushed()).toHaveLength(1);
  });

  it("logs a structured summary with duration and counts", async () => {
    memoryStore(seed(lastEvents(5)));
    await fns.checkAndSendReminders();
    expect(infoSpy).toHaveBeenCalledWith(
      "checkAndSendReminders: done",
      expect.objectContaining({ job: "checkAndSendReminders", users: 1, sent: 1, skipped: 0, errors: 0, deadTokens: 0, durationMs: expect.any(Number) })
    );
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining("sent=1"));
  });

  it("a user that throws does not stop the others and is counted in errors", async () => {
    const data = seed(lastEvents(5));
    data["user_preferences/u2"] = prefs;
    data["user_child_access/u2_c"] = { userId: "u2", childId: "c" };
    data["children/c/access/u2"] = { role: "admin", userId: "u2" };
    data["device_tokens/t2"] = { userId: "u2", enabled: true, token: "ExponentPushToken[b]" };
    memoryStore(data);
    expoClient.sendPushNotificationsAsync.mockRejectedValueOnce(new Error("expo down"));
    await fns.checkAndSendReminders();
    expect(pushed().map((m) => m.to).sort()).toEqual(["ExponentPushToken[a]", "ExponentPushToken[b]"]);
    expect(infoSpy).toHaveBeenCalledWith("checkAndSendReminders: done", expect.objectContaining({ sent: 1, errors: 1 }));
  });
});

describe("dead push tokens", () => {
  const prefs = {
    healthDataConsent: { granted: true, version: "2.2" },
    notifications: { push: true, reminders: { enabled: true, thresholds: { repas: 3 } } },
  };
  const seed = (tokens) => {
    const d = {
      "user_preferences/u": prefs,
      "children/c": { name: "Léa", lastEventAt: { repas: ts(Date.now() - 5 * HOUR), pompages: null, changes: null, vitamines: null, any: ts(Date.now() - 5 * HOUR) } },
      "user_child_access/u_c": { userId: "u", childId: "c" },
      "children/c/access/u": { role: "owner", userId: "u" },
    };
    for (const [id, token] of Object.entries(tokens)) d[`device_tokens/${id}`] = { userId: "u", enabled: true, token };
    return d;
  };
  beforeEach(() => {
    jest.clearAllMocks();
    // Heures calmes par défaut 22:00-07:00 : horloge figée à midi (Paris) pour ne pas dépendre de l'heure d'exécution.
    jest.spyOn(Date, "now").mockReturnValue(Date.parse("2026-06-15T10:00:00Z"));
    jest.spyOn(console, "log").mockImplementation(() => {});
    jest.spyOn(console, "error").mockImplementation(() => {});
    jest.spyOn(logger, "info").mockImplementation(() => {});
  });
  afterEach(() => jest.restoreAllMocks());

  it("DeviceNotRegistered on the only token: token doc deleted, no notification_history", async () => {
    expoClient.sendPushNotificationsAsync.mockResolvedValueOnce([
      { status: "error", message: "gone", details: { error: "DeviceNotRegistered" } },
    ]);
    const docs = memoryStore(seed({ t1: "ExponentPushToken[a]" }));
    await fns.checkAndSendReminders();
    expect(docs.has("device_tokens/t1")).toBe(false);
    expect(keys(docs, "notification_history/")).toHaveLength(0);
    expect(logger.info).toHaveBeenCalledWith("checkAndSendReminders: done", expect.objectContaining({ deadTokens: 1, sent: 0 }));
  });

  it("only the dead token is removed; the history is written because another device got the push", async () => {
    expoClient.sendPushNotificationsAsync.mockResolvedValueOnce([
      { status: "ok", id: "1" },
      { status: "error", message: "gone", details: { error: "DeviceNotRegistered" } },
    ]);
    const docs = memoryStore(seed({ t1: "ExponentPushToken[a]", t2: "ExponentPushToken[b]" }));
    await fns.checkAndSendReminders();
    const survivors = keys(docs, "device_tokens/");
    expect(survivors).toHaveLength(1);
    expect(keys(docs, "notification_history/")).toHaveLength(1);
  });

  it("another ticket error (not a dead token) keeps the token and writes no history so the next run retries", async () => {
    expoClient.sendPushNotificationsAsync.mockResolvedValueOnce([
      { status: "error", message: "slow", details: { error: "MessageRateExceeded" } },
    ]);
    const docs = memoryStore(seed({ t1: "ExponentPushToken[a]" }));
    await fns.checkAndSendReminders();
    expect(docs.has("device_tokens/t1")).toBe(true);
    expect(keys(docs, "notification_history/")).toHaveLength(0);
  });

  it("a response without tickets is treated as delivered (no crash)", async () => {
    expoClient.sendPushNotificationsAsync.mockResolvedValueOnce(undefined);
    const docs = memoryStore(seed({ t1: "ExponentPushToken[a]" }));
    await fns.checkAndSendReminders();
    expect(keys(docs, "notification_history/")).toHaveLength(1);
  });
});

describe("bounded concurrency", () => {
  it("never runs more than N tasks at once, keeps order of results and covers every item", async () => {
    let running = 0;
    let peak = 0;
    const items = Array.from({ length: 25 }, (_, i) => i);
    const out = await reminders.mapInChunks(items, 4, async (i) => {
      running += 1;
      peak = Math.max(peak, running);
      await new Promise((r) => setTimeout(r, 2));
      running -= 1;
      return i * 2;
    });
    expect(peak).toBeLessThanOrEqual(4);
    expect(out).toEqual(items.map((i) => i * 2));
  });

  it("handles empty input and an invalid size", async () => {
    expect(await reminders.mapInChunks([], 4, async () => 1)).toEqual([]);
    expect(await reminders.mapInChunks([1, 2], 0, async (x) => x)).toEqual([1, 2]);
  });

  it("isolates a failing task when asked to settle", async () => {
    const out = await reminders.mapInChunks([1, 2, 3], 2, async (x) => { if (x === 2) throw new Error("x"); return x; }, { settle: true });
    expect(out.map((r) => r.status)).toEqual(["fulfilled", "rejected", "fulfilled"]);
  });
});

describe("sendWeeklyRecap uses lastEventAt.any", () => {
  let infoSpy;
  const sent = () => Resend.mock.results.flatMap((r) => r.value.emails.send.mock.calls.map(([p]) => p));
  const week = new Date(2026, 10, 4, 12).getTime();
  const seed = (child, event) => ({
    "user_preferences/u": { notifications: { email: true }, healthDataConsent: { granted: true, version: "2.2" } },
    "children/c": { name: "Léa", ...child },
    "children/c/access/u": { role: "owner", userId: "u" },
    "user_child_access/u_c": { userId: "u", childId: "c" },
    ...(event ? { "events/e": event } : {}),
  });
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers({ now: new Date(2026, 10, 9, 8, 0, 0), doNotFake: ["nextTick", "setImmediate", "setTimeout", "setInterval", "clearTimeout", "clearInterval", "queueMicrotask", "hrtime", "performance"] });
    process.env.RESEND_API_KEY = "re_test";
    process.env.RECAP_UNSUBSCRIBE_SECRET = "s".repeat(32);
    adminMod.auth.mockReturnValue({ getUser: jest.fn(async () => ({ email: "o@t.com", emailVerified: true, disabled: false })) });
    ["log", "warn", "error"].forEach((m) => jest.spyOn(console, m).mockImplementation(() => {}));
    infoSpy = jest.spyOn(logger, "info").mockImplementation(() => {});
  });
  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
    delete process.env.RESEND_API_KEY;
    delete process.env.RECAP_UNSUBSCRIBE_SECRET;
  });

  it("sends when the overall last event falls inside the week, with no events query", async () => {
    memoryStore(seed({ lastEventAt: { any: ts(week) } }));
    const spy = jest.spyOn(adminMod.firestore(), "collection");
    await fns.sendWeeklyRecap();
    expect(sent()).toHaveLength(1);
    expect(spy.mock.calls.map(([c]) => c)).not.toContain("events");
  });

  it("skips without a query when the last event is before the week or null", async () => {
    memoryStore(seed({ lastEventAt: { any: ts(new Date(2026, 10, 1, 12).getTime()) } }));
    await fns.sendWeeklyRecap();
    memoryStore(seed({ lastEventAt: { any: null } }));
    await fns.sendWeeklyRecap();
    expect(sent()).toEqual([]);
  });

  it("queries when the last event is after the week (earlier ones may be inside it)", async () => {
    memoryStore(seed({ lastEventAt: { any: ts(new Date(2026, 10, 9, 6).getTime()) } }, { childId: "c", type: "biberon", date: ts(week) }));
    await fns.sendWeeklyRecap();
    expect(sent()).toHaveLength(1);
  });

  it("falls back to the query when the field is missing", async () => {
    memoryStore(seed({}, { childId: "c", type: "biberon", date: ts(week) }));
    await fns.sendWeeklyRecap();
    expect(sent()).toHaveLength(1);
  });

  it("logs a structured summary with duration and counts", async () => {
    memoryStore(seed({ lastEventAt: { any: ts(week) } }));
    await fns.sendWeeklyRecap();
    expect(infoSpy).toHaveBeenCalledWith(
      "sendWeeklyRecap: done",
      expect.objectContaining({ job: "sendWeeklyRecap", users: 1, sent: 1, skipped: 0, errors: 0, durationMs: expect.any(Number) })
    );
  });
});
