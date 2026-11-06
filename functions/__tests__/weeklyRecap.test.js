/* global describe, it, expect, jest, beforeEach, afterEach */
// GDPR sprint 3 (3.5): the weekly recap e-mail carries no health figures, goes
// only to verified owners/admins, and can be unsubscribed in one click.
const crypto = require("node:crypto");
require("./setup");
const { memoryStore } = require("./memoryFirestore");
const fns = require("../index");

const adminMod = require("firebase-admin");
const { Resend } = require("resend");
const { buildRecapHTML } = require("../emailTemplates");
const { buildRecapHTML: realBuildRecapHTML } = jest.requireActual("../emailTemplates");

const SECRET = "unsub-secret-for-tests";
const BASE = "https://europe-west1-samaye-53723.cloudfunctions.net/unsubscribeRecap";
const tokenFor = (uid, secret = SECRET) => crypto.createHmac("sha256", secret).update(uid).digest("hex");
const ts = (ms) => ({ toMillis: () => ms, toDate: () => new Date(ms) });
const NOT_FAKED = ["hrtime", "nextTick", "performance", "queueMicrotask", "requestAnimationFrame", "cancelAnimationFrame",
  "requestIdleCallback", "cancelIdleCallback", "setImmediate", "clearImmediate", "setInterval", "clearInterval", "setTimeout", "clearTimeout"];

// ---------------------------------------------------------------------------
describe("buildRecapHTML", () => {
  const html = realBuildRecapHTML({
    childName: "Léo <b>",
    openAppUrl: "suivibaby://baby/home",
    unsubscribeUrl: `${BASE}?uid=u1&token=abc`,
  });

  it("greets with the child's first name (escaped), links the app and the unsubscribe page", () => {
    expect(html).toContain("Léo &lt;b&gt;");
    expect(html).not.toContain("Léo <b>");
    expect(html).toContain('href="suivibaby://baby/home"');
    expect(html).toContain(`href="${BASE}?uid=u1&amp;token=abc"`);
    expect(html).toContain("Le récap de la semaine est prêt");
  });

  it("contains no health figures or health sections", () => {
    const text = html.replace(/<style[\s\S]*?<\/style>/g, "").replace(/<[^>]+>/g, " ");
    expect(text).not.toMatch(/\d+\s*(ml|kg|cm|min|h\b)/i);
    expect(text).not.toMatch(/\b\d+\s+(repas|biberons?|tétées|changes|pipis|selles|siestes|nuits|vaccins?|médicaments?|symptômes?)/i);
    for (const word of ["Santé", "Croissance", "Sommeil", "Alimentation", "Poids", "Taille", "Tire-lait", "vs semaine"]) {
      expect(text).not.toContain(word);
    }
  });
});

// ---------------------------------------------------------------------------
describe("sendWeeklyRecap", () => {
  let users;
  let errorSpy;
  let logSpy;
  let warnSpy;
  const sent = () => Resend.mock.results.flatMap((r) => r.value.emails.send.mock.calls.map(([payload]) => payload));

  // One user per scenario, each with a single child "c-<uid>" with activity.
  function seed(entries) {
    const data = {};
    for (const [uid, { role = "owner", prefs = true, activity = true, userDoc }] of Object.entries(entries)) {
      const childId = `c-${uid}`;
      data[`user_preferences/${uid}`] = { notifications: { email: prefs } };
      if (userDoc) data[`users/${uid}`] = userDoc;
      data[`children/${childId}`] = { name: "Léo Martin" };
      data[`children/${childId}/access/${uid}`] = { role, userId: uid };
      data[`user_child_access/${uid}_${childId}`] = { userId: uid, childId };
      if (activity) data[`events/e-${uid}`] = { childId, userId: uid, type: "biberon", quantite: 120, date: ts(new Date(2026, 10, 4, 12).getTime()) };
    }
    return data;
  }

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers({ now: new Date(2026, 10, 9, 8, 0, 0), doNotFake: NOT_FAKED });
    process.env.RESEND_API_KEY = "re_test";
    process.env.RECAP_UNSUBSCRIBE_SECRET = SECRET;
    users = {};
    adminMod.auth.mockReturnValue({
      getUser: jest.fn(async (uid) => {
        if (!users[uid]) throw Object.assign(new Error("not found"), { code: "auth/user-not-found" });
        return users[uid];
      }),
    });
    errorSpy = jest.spyOn(console, "error").mockImplementation(() => {});
    logSpy = jest.spyOn(console, "log").mockImplementation(() => {});
    warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});
  });
  afterEach(() => {
    jest.useRealTimers();
    delete process.env.RESEND_API_KEY;
    delete process.env.RECAP_UNSUBSCRIBE_SECRET;
    [errorSpy, logSpy, warnSpy].forEach((s) => s.mockRestore());
  });

  const verified = (email) => ({ email, emailVerified: true, disabled: false });

  it("sends to verified owners and admins only, with the e-mail from Firebase Auth", async () => {
    users = {
      owner: verified("owner@t.com"),
      adm: verified("adm@t.com"),
      viewer: verified("viewer@t.com"),
      contrib: verified("contrib@t.com"),
      pend: verified("pend@t.com"),
      unverified: { email: "unv@t.com", emailVerified: false, disabled: false },
      disabled: { email: "dis@t.com", emailVerified: true, disabled: true },
      noemail: { emailVerified: true, disabled: false },
    };
    memoryStore(seed({
      owner: {},
      adm: { role: "admin" },
      viewer: { role: "viewer" },
      contrib: { role: "contributor" },
      pend: { userDoc: { pendingDeletion: { deletionDate: "2026-12-01" } } },
      unverified: {},
      disabled: {},
      noemail: {},
      ghost: {}, // no Auth user at all
    }));
    // A stale address in Firestore must never be used.
    await fns.sendWeeklyRecap();

    expect(sent().map((p) => p.to).sort()).toEqual(["adm@t.com", "owner@t.com"]);
  });

  it("does not fall back to the Firestore e-mail when Auth has none", async () => {
    users = { owner: { emailVerified: true, disabled: false } };
    memoryStore({ ...seed({ owner: { userDoc: { email: "stale@t.com" } } }), "users_public/owner": { email: "stale2@t.com" } });
    await fns.sendWeeklyRecap();
    expect(sent()).toEqual([]);
  });

  it("skips users who unsubscribed", async () => {
    users = { owner: verified("owner@t.com") };
    memoryStore(seed({ owner: { prefs: false } }));
    await fns.sendWeeklyRecap();
    expect(sent()).toEqual([]);
  });

  it("only mails for children where the user is owner or admin", async () => {
    users = { owner: verified("owner@t.com") };
    const data = seed({ owner: {} });
    // Second child where the same user is only a viewer.
    data["children/c2"] = { name: "Mia" };
    data["children/c2/access/owner"] = { role: "viewer", userId: "owner" };
    data["user_child_access/owner_c2"] = { userId: "owner", childId: "c2" };
    data["events/e-c2"] = { childId: "c2", userId: "x", type: "biberon", date: ts(new Date(2026, 10, 4, 12).getTime()) };
    memoryStore(data);
    await fns.sendWeeklyRecap();
    expect(sent()).toHaveLength(1);
    expect(buildRecapHTML).toHaveBeenCalledTimes(1);
    expect(buildRecapHTML).toHaveBeenCalledWith(expect.objectContaining({ childName: "Léo" }));
  });

  it("skips a child without activity that week", async () => {
    users = { owner: verified("owner@t.com") };
    memoryStore(seed({ owner: { activity: false } }));
    await fns.sendWeeklyRecap();
    expect(sent()).toEqual([]);
  });

  it("sends the neutral subject, unsubscribe headers and a template without stats", async () => {
    users = { owner: verified("owner@t.com") };
    memoryStore(seed({ owner: {} }));
    await fns.sendWeeklyRecap();

    const [payload] = sent();
    const url = `${BASE}?uid=owner&token=${tokenFor("owner")}`;
    expect(payload.subject).toBe("Le récap de la semaine est prêt");
    expect(payload.subject).not.toContain("Léo");
    expect(payload.headers).toEqual({
      "List-Unsubscribe": `<${url}>`,
      "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
    });
    expect(buildRecapHTML).toHaveBeenCalledWith({ childName: "Léo", openAppUrl: expect.any(String), unsubscribeUrl: url });
  });

  it("stores only metadata in recap_history, and does not resend the same week", async () => {
    users = { owner: verified("owner@t.com") };
    const docs = memoryStore(seed({ owner: {} }));
    await fns.sendWeeklyRecap();
    const histories = [...docs.entries()].filter(([p]) => p.startsWith("recap_history/")).map(([, d]) => d);
    expect(histories).toHaveLength(1);
    expect(Object.keys(histories[0]).sort()).toEqual(["childId", "sentAt", "userId", "weekEnd", "weekStart"]);
    expect(histories[0]).not.toHaveProperty("stats");

    await fns.sendWeeklyRecap();
    expect(sent()).toHaveLength(1);
  });

  it("sends nothing when the unsubscribe secret is missing", async () => {
    delete process.env.RECAP_UNSUBSCRIBE_SECRET;
    users = { owner: verified("owner@t.com") };
    memoryStore(seed({ owner: {} }));
    await fns.sendWeeklyRecap();
    expect(sent()).toEqual([]);
    expect(errorSpy).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
describe("unsubscribeRecap", () => {
  const makeRes = () => {
    const res = { statusCode: 200, body: "", headers: {} };
    res.status = jest.fn((c) => { res.statusCode = c; return res; });
    res.set = jest.fn((k, v) => { res.headers[k] = v; return res; });
    res.send = jest.fn((b) => { res.body = b; return res; });
    return res;
  };
  const req = (method, query) => ({ method, query, headers: {} });
  const prefs = (docs, uid) => docs.get(`user_preferences/${uid}`);

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.RECAP_UNSUBSCRIBE_SECRET = SECRET;
  });
  afterEach(() => delete process.env.RECAP_UNSUBSCRIBE_SECRET);

  it("GET with a good token shows a French confirmation page and changes nothing", async () => {
    const docs = memoryStore({ "user_preferences/u1": { notifications: { email: true } } });
    const res = makeRes();
    await fns.unsubscribeRecap(req("GET", { uid: "u1", token: tokenFor("u1") }), res);
    expect(res.statusCode).toBe(200);
    expect(res.headers["Content-Type"]).toMatch(/text\/html/);
    expect(res.body).toContain("<form");
    expect(res.body).toContain('method="POST"');
    expect(res.body).toMatch(/désabonner/i);
    expect(prefs(docs, "u1").notifications.email).toBe(true);
  });

  it("POST with a good token (one-click) turns the recap e-mail off", async () => {
    const docs = memoryStore({ "user_preferences/u1": { theme: "dark", notifications: { email: true } } });
    const res = makeRes();
    await fns.unsubscribeRecap(req("POST", { uid: "u1", token: tokenFor("u1") }), res);
    expect(res.statusCode).toBe(200);
    expect(prefs(docs, "u1").notifications.email).toBe(false);
    expect(prefs(docs, "u1").theme).toBe("dark");
    expect(res.body).toMatch(/désabonné/i);
  });

  it("POST works even when the preferences document does not exist yet", async () => {
    const docs = memoryStore({});
    await fns.unsubscribeRecap(req("POST", { uid: "u1", token: tokenFor("u1") }), makeRes());
    expect(prefs(docs, "u1").notifications.email).toBe(false);
  });

  it.each([
    ["a wrong token", () => tokenFor("u1", "other-secret")],
    ["a token for another user", () => tokenFor("u2")],
    ["a short token", () => "abc"],
    ["a non-hex token", () => "z".repeat(64)],
    ["an empty token", () => ""],
    ["no token", () => undefined],
  ])("rejects %s without changing anything", async (_label, token) => {
    const docs = memoryStore({ "user_preferences/u1": { notifications: { email: true } } });
    for (const method of ["GET", "POST"]) {
      const res = makeRes();
      await fns.unsubscribeRecap(req(method, { uid: "u1", token: token() }), res);
      expect(res.statusCode).toBe(403);
    }
    expect(prefs(docs, "u1").notifications.email).toBe(true);
  });

  it("rejects a missing uid, an array uid and unsupported methods", async () => {
    memoryStore({});
    let res = makeRes();
    await fns.unsubscribeRecap(req("POST", { token: tokenFor("u1") }), res);
    expect(res.statusCode).toBe(400);
    res = makeRes();
    await fns.unsubscribeRecap(req("POST", { uid: ["u1", "u2"], token: tokenFor("u1") }), res);
    expect(res.statusCode).toBe(400);
    res = makeRes();
    await fns.unsubscribeRecap(req("PUT", { uid: "u1", token: tokenFor("u1") }), res);
    expect(res.statusCode).toBe(405);
  });

  it("fails closed when the secret is not configured", async () => {
    delete process.env.RECAP_UNSUBSCRIBE_SECRET;
    const docs = memoryStore({ "user_preferences/u1": { notifications: { email: true } } });
    const res = makeRes();
    await fns.unsubscribeRecap(req("POST", { uid: "u1", token: tokenFor("u1", "") }), res);
    expect(res.statusCode).toBe(500);
    expect(prefs(docs, "u1").notifications.email).toBe(true);
  });

  it("escapes the uid in the confirmation page", async () => {
    memoryStore({});
    const uid = 'a"><script>x</script>';
    const res = makeRes();
    await fns.unsubscribeRecap(req("GET", { uid, token: tokenFor(uid) }), res);
    expect(res.body).not.toContain("<script>x");
  });
});
