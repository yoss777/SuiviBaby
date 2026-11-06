/* global Buffer, describe, it, expect, jest, beforeEach, afterEach */
// GDPR sprint 3: server consent proof (3.2) and Sign in with Apple token
// revocation (3.3), on the in-memory Firestore.
const crypto = require("node:crypto");
const { mockBucket } = require("./setup");
const { memoryStore } = require("./memoryFirestore");
const fns = require("../index");

const adminMod = require("firebase-admin");
const call = (uid, data) => ({ auth: { uid, token: { email: `${uid}@t.com` } }, data, app: true });
const YEARS = 365 * 24 * 3600 * 1000;

describe("recordHealthConsent", () => {
  beforeEach(() => jest.clearAllMocks());

  it("rejects unauthenticated callers", async () => {
    memoryStore({});
    await expect(fns.recordHealthConsent({ auth: null, data: { version: "2.1" } })).rejects.toThrow("Authentification");
  });

  it.each([[undefined], ["1.0"], [2.1], [null], ["2.1 "]])("rejects version %p", async (version) => {
    const docs = memoryStore({});
    await expect(fns.recordHealthConsent(call("u1", { version }))).rejects.toMatchObject({ code: "invalid-argument" });
    expect([...docs.keys()].filter((k) => k.startsWith("consent_records/"))).toEqual([]);
  });

  it("rejects missing data", async () => {
    memoryStore({});
    await expect(fns.recordHealthConsent(call("u1", undefined))).rejects.toMatchObject({ code: "invalid-argument" });
  });

  it("appends a proof record and sets the preference read by the app", async () => {
    const docs = memoryStore({});
    await expect(fns.recordHealthConsent(call("u1", { version: "2.1", platform: "ios" }))).resolves.toEqual({ version: "2.1" });

    const records = [...docs.entries()].filter(([p]) => p.startsWith("consent_records/"));
    expect(records).toHaveLength(1);
    expect(records[0][1]).toEqual({ uid: "u1", type: "health_data", version: "2.1", granted: true, grantedAt: "TS", platform: "ios" });
    expect(docs.get("user_preferences/u1").healthDataConsent).toEqual({
      granted: true,
      grantedAt: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/),
      version: "2.1",
    });
  });

  it("keeps other preferences and omits platform when absent", async () => {
    const docs = memoryStore({ "user_preferences/u1": { theme: "dark" } });
    await fns.recordHealthConsent(call("u1", { version: "2.1" }));
    expect(docs.get("user_preferences/u1")).toMatchObject({ theme: "dark" });
    const [, record] = [...docs.entries()].find(([p]) => p.startsWith("consent_records/"));
    expect(record).not.toHaveProperty("platform");
  });

  it("appends a new record on each call (history)", async () => {
    const docs = memoryStore({});
    await fns.recordHealthConsent(call("u1", { version: "2.1" }));
    await fns.recordHealthConsent(call("u1", { version: "2.1" }));
    expect([...docs.keys()].filter((k) => k.startsWith("consent_records/"))).toHaveLength(2);
  });

  it.each([[""], ["x".repeat(21)], [42], ["ios<script>"]])("rejects platform %p", async (platform) => {
    memoryStore({});
    await expect(fns.recordHealthConsent(call("u1", { version: "2.1", platform }))).rejects.toMatchObject({ code: "invalid-argument" });
  });

  it("is rate limited", async () => {
    memoryStore({ "rate_limits/u1": { consent_timestamps: Array(100).fill(Date.now()) } });
    await expect(fns.recordHealthConsent(call("u1", { version: "2.1" }))).rejects.toMatchObject({ code: "resource-exhausted" });
  });
});

// ---------------------------------------------------------------------------
describe("registerAppleRevocation", () => {
  const { privateKey, publicKey } = crypto.generateKeyPairSync("ec", { namedCurve: "P-256" });
  const pem = privateKey.export({ type: "pkcs8", format: "pem" });
  let authApi;
  let errorSpy;
  let warnSpy;

  const setSecrets = () => {
    process.env.APPLE_TEAM_ID = "TEAM123456";
    process.env.APPLE_KEY_ID = "KEY1234567";
    process.env.APPLE_PRIVATE_KEY = pem;
  };
  const clearSecrets = () => {
    delete process.env.APPLE_TEAM_ID;
    delete process.env.APPLE_KEY_ID;
    delete process.env.APPLE_PRIVATE_KEY;
  };

  beforeEach(() => {
    jest.clearAllMocks();
    setSecrets();
    authApi = {
      getUser: jest.fn().mockResolvedValue({ providerData: [{ providerId: "apple.com" }] }),
      deleteUser: jest.fn().mockResolvedValue(undefined),
      updateUser: jest.fn().mockResolvedValue(undefined),
      revokeRefreshTokens: jest.fn().mockResolvedValue(undefined),
    };
    adminMod.auth.mockReturnValue(authApi);
    global.fetch = jest.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ refresh_token: "rt-1" }), text: async () => "" });
    errorSpy = jest.spyOn(console, "error").mockImplementation(() => {});
    warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});
  });
  afterEach(() => {
    clearSecrets();
    delete global.fetch;
    errorSpy.mockRestore();
    warnSpy.mockRestore();
  });

  it("rejects unauthenticated callers", async () => {
    memoryStore({});
    await expect(fns.registerAppleRevocation({ auth: null, data: { authorizationCode: "c" } })).rejects.toThrow("Authentification");
  });

  it.each([[undefined], [""], [123], ["x".repeat(1001)]])("rejects authorizationCode %p", async (authorizationCode) => {
    memoryStore({});
    await expect(fns.registerAppleRevocation(call("u1", { authorizationCode }))).rejects.toMatchObject({ code: "invalid-argument" });
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("rejects users without the apple.com provider", async () => {
    authApi.getUser.mockResolvedValue({ providerData: [{ providerId: "google.com" }] });
    const docs = memoryStore({});
    await expect(fns.registerAppleRevocation(call("u1", { authorizationCode: "c" }))).rejects.toMatchObject({ code: "failed-precondition" });
    expect(global.fetch).not.toHaveBeenCalled();
    expect(docs.has("apple_tokens/u1")).toBe(false);
  });

  it("exchanges the code with a valid ES256 client secret and stores the refresh token", async () => {
    const docs = memoryStore({});
    await expect(fns.registerAppleRevocation(call("u1", { authorizationCode: "code-abc" }))).resolves.toEqual({ stored: true });

    const [url, init] = global.fetch.mock.calls[0];
    expect(url).toBe("https://appleid.apple.com/auth/token");
    expect(init.method).toBe("POST");
    const body = new URLSearchParams(init.body);
    expect(body.get("grant_type")).toBe("authorization_code");
    expect(body.get("code")).toBe("code-abc");
    expect(body.get("client_id")).toBe("com.tesfa.suivibaby");

    const [h, p, s] = body.get("client_secret").split(".");
    expect(JSON.parse(Buffer.from(h, "base64url"))).toEqual({ alg: "ES256", kid: "KEY1234567", typ: "JWT" });
    const payload = JSON.parse(Buffer.from(p, "base64url"));
    expect(payload).toMatchObject({ iss: "TEAM123456", aud: "https://appleid.apple.com", sub: "com.tesfa.suivibaby" });
    expect(payload.exp).toBeGreaterThan(payload.iat);
    expect(payload.exp - payload.iat).toBeLessThanOrEqual(15777000);
    const ok = crypto.verify("sha256", Buffer.from(`${h}.${p}`), { key: publicKey, dsaEncoding: "ieee-p1363" }, Buffer.from(s, "base64url"));
    expect(ok).toBe(true);

    expect(docs.get("apple_tokens/u1")).toEqual({ refreshToken: "rt-1", createdAt: "TS" });
  });

  it("accepts a private key whose newlines are escaped", async () => {
    process.env.APPLE_PRIVATE_KEY = pem.replace(/\n/g, "\\n");
    memoryStore({});
    await expect(fns.registerAppleRevocation(call("u1", { authorizationCode: "c" }))).resolves.toEqual({ stored: true });
  });

  it("returns { stored: false } and warns, without throwing, when secrets are absent", async () => {
    clearSecrets();
    const docs = memoryStore({});
    await expect(fns.registerAppleRevocation(call("u1", { authorizationCode: "c" }))).resolves.toEqual({ stored: false });
    expect(warnSpy).toHaveBeenCalled();
    expect(global.fetch).not.toHaveBeenCalled();
    expect(docs.has("apple_tokens/u1")).toBe(false);
  });

  it("returns { stored: false } and logs an error when Apple refuses the code", async () => {
    global.fetch.mockResolvedValue({ ok: false, status: 400, json: async () => ({ error: "invalid_grant" }), text: async () => "invalid_grant" });
    const docs = memoryStore({});
    await expect(fns.registerAppleRevocation(call("u1", { authorizationCode: "c" }))).resolves.toEqual({ stored: false });
    expect(errorSpy).toHaveBeenCalled();
    expect(docs.has("apple_tokens/u1")).toBe(false);
  });

  it("returns { stored: false } when the network fails or no refresh token comes back", async () => {
    memoryStore({});
    global.fetch.mockRejectedValueOnce(new Error("network"));
    await expect(fns.registerAppleRevocation(call("u1", { authorizationCode: "c" }))).resolves.toEqual({ stored: false });
    global.fetch.mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({}), text: async () => "" });
    await expect(fns.registerAppleRevocation(call("u1", { authorizationCode: "c" }))).resolves.toEqual({ stored: false });
  });
});

// ---------------------------------------------------------------------------
describe("purgeUserData: Apple revocation and consent retention", () => {
  const UID = "parent1";
  const past = new Date(Date.now() - 86400000).toISOString();
  const { privateKey } = crypto.generateKeyPairSync("ec", { namedCurve: "P-256" });
  const pem = privateKey.export({ type: "pkcs8", format: "pem" });
  let authApi;
  let errorSpy;

  const base = () => ({
    [`users/${UID}`]: { email: "p1@t.com", pendingDeletion: { deletionDate: past } },
    [`apple_tokens/${UID}`]: { refreshToken: "rt-9" },
  });

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.APPLE_TEAM_ID = "TEAM123456";
    process.env.APPLE_KEY_ID = "KEY1234567";
    process.env.APPLE_PRIVATE_KEY = pem;
    authApi = {
      getUser: jest.fn().mockResolvedValue({ email: "p1@t.com" }),
      deleteUser: jest.fn().mockResolvedValue(undefined),
      updateUser: jest.fn().mockResolvedValue(undefined),
      revokeRefreshTokens: jest.fn().mockResolvedValue(undefined),
    };
    adminMod.auth.mockReturnValue(authApi);
    mockBucket.getFiles.mockResolvedValue([[]]);
    global.fetch = jest.fn().mockResolvedValue({ ok: true, status: 200, text: async () => "" });
    errorSpy = jest.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => {
    delete process.env.APPLE_TEAM_ID;
    delete process.env.APPLE_KEY_ID;
    delete process.env.APPLE_PRIVATE_KEY;
    delete global.fetch;
    errorSpy.mockRestore();
  });

  it("revokes the refresh token before deleting Auth, then deletes the stored token", async () => {
    const docs = memoryStore(base());
    await fns.processScheduledDeletions();

    const [url, init] = global.fetch.mock.calls[0];
    expect(url).toBe("https://appleid.apple.com/auth/revoke");
    const body = new URLSearchParams(init.body);
    expect(body.get("token")).toBe("rt-9");
    expect(body.get("token_type_hint")).toBe("refresh_token");
    expect(body.get("client_id")).toBe("com.tesfa.suivibaby");
    expect(body.get("client_secret").split(".")).toHaveLength(3);
    expect(docs.has(`apple_tokens/${UID}`)).toBe(false);
    expect(global.fetch.mock.invocationCallOrder[0]).toBeLessThan(authApi.deleteUser.mock.invocationCallOrder[0]);
    expect(docs.has(`users/${UID}`)).toBe(false);
  });

  it("does nothing Apple-related without a stored token", async () => {
    const state = base();
    delete state[`apple_tokens/${UID}`];
    memoryStore(state);
    await fns.processScheduledDeletions();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("logs an error but completes the purge when Apple refuses the revocation", async () => {
    global.fetch.mockResolvedValue({ ok: false, status: 400, text: async () => "invalid_client" });
    const docs = memoryStore(base());
    await fns.processScheduledDeletions();
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining("Apple"), expect.anything());
    expect(docs.has(`apple_tokens/${UID}`)).toBe(false);
    expect(docs.has(`users/${UID}`)).toBe(false);
    expect(authApi.deleteUser).toHaveBeenCalledWith(UID);
  });

  it("logs an error but completes the purge when the network fails or secrets are missing", async () => {
    global.fetch.mockRejectedValue(new Error("network"));
    let docs = memoryStore(base());
    await fns.processScheduledDeletions();
    expect(errorSpy).toHaveBeenCalled();
    expect(docs.has(`users/${UID}`)).toBe(false);

    delete process.env.APPLE_PRIVATE_KEY;
    errorSpy.mockClear();
    global.fetch.mockClear();
    docs = memoryStore(base());
    await fns.processScheduledDeletions();
    expect(global.fetch).not.toHaveBeenCalled();
    expect(errorSpy).toHaveBeenCalled();
    expect(docs.has(`apple_tokens/${UID}`)).toBe(false);
    expect(docs.has(`users/${UID}`)).toBe(false);
  });

  it("keeps consent records for 5 years instead of deleting them", async () => {
    const before = Date.now();
    const docs = memoryStore({
      ...base(),
      "consent_records/c1": { uid: UID, type: "health_data", version: "2.1", granted: true },
      "consent_records/c2": { uid: UID, type: "health_data", version: "2.0", granted: true },
      "consent_records/other": { uid: "someone", type: "health_data", version: "2.1", granted: true },
    });
    await fns.processScheduledDeletions();

    for (const id of ["c1", "c2"]) {
      const record = docs.get(`consent_records/${id}`);
      expect(record).toMatchObject({ uid: UID, type: "health_data", granted: true });
      const expireAt = record.expireAt.toMillis();
      expect(expireAt).toBeGreaterThanOrEqual(before + 5 * YEARS);
      expect(expireAt).toBeLessThanOrEqual(Date.now() + 5 * YEARS + 2 * 24 * 3600 * 1000);
    }
    expect(docs.get("consent_records/other")).not.toHaveProperty("expireAt");
    expect(docs.has(`users/${UID}`)).toBe(false);
  });
});

describe("firestore.indexes.json", () => {
  it("declares the TTL on consent_records.expireAt", () => {
    const { fieldOverrides } = require("../../firestore.indexes.json");
    expect(fieldOverrides).toContainEqual({ collectionGroup: "consent_records", fieldPath: "expireAt", ttl: true, indexes: [] });
  });
});
