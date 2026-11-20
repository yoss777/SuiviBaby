/* global describe, it, expect, jest, beforeEach */
// R22 : révocation du jeton d'un téléphone sans compte connecté.
require("./setup");
const { memoryStore } = require("./memoryFirestore");

const { revokeDeviceTokenCore, tokenDocId, rateLimitKey } = require("../src/notifications/deviceToken");
const db = () => require("firebase-admin").firestore();

const TOKEN = "ExponentPushToken[abcDEF123456]";
const DOC = `device_tokens/${tokenDocId(TOKEN)}`;
const NOW = Date.parse("2026-11-20T12:00:00Z");

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, "log").mockImplementation(() => {});
});

describe("revokeDeviceToken", () => {
  it("jeton et ancien compte corrects : le document de ce téléphone est supprimé", async () => {
    const docs = memoryStore({ [DOC]: { userId: "dad", token: TOKEN, platform: "ios" } });
    await expect(revokeDeviceTokenCore(db(), { token: TOKEN, userId: "dad", queuedAt: NOW }, "1.2.3.4")).resolves.toEqual({ ok: true });
    expect(docs.has(DOC)).toBe(false);
  });

  it("jeton repris par un autre compte sur ce téléphone : son document n'est jamais supprimé", async () => {
    const docs = memoryStore({ [DOC]: { userId: "mum", token: TOKEN, platform: "ios" } });
    await expect(revokeDeviceTokenCore(db(), { token: TOKEN, userId: "dad", queuedAt: NOW }, "1.2.3.4")).resolves.toEqual({ ok: true });
    expect(docs.has(DOC)).toBe(true);
  });

  it("jeton différent sous le même identifiant (collision de nettoyage) : rien supprimé", async () => {
    const docs = memoryStore({ [DOC]: { userId: "dad", token: "ExponentPushToken[abcDEF123456_]", platform: "ios" } });
    await revokeDeviceTokenCore(db(), { token: TOKEN, userId: "dad", queuedAt: NOW }, "1.2.3.4");
    expect(docs.has(DOC)).toBe(true);
  });

  it("document absent : même réponse (rien n'est révélé)", async () => {
    memoryStore({});
    await expect(revokeDeviceTokenCore(db(), { token: TOKEN, userId: "dad", queuedAt: NOW }, "1.2.3.4")).resolves.toEqual({ ok: true });
  });

  it.each([
    [{ token: "pas-un-jeton", userId: "dad" }],
    [{ token: TOKEN }],
    [{ token: TOKEN, userId: "a/b" }],
    [{ userId: "dad" }],
    [{ token: TOKEN, userId: "dad" }], // sans date
    [null],
  ])("entrée invalide refusée : %j", async (data) => {
    memoryStore({});
    await expect(revokeDeviceTokenCore(db(), data, "1.2.3.4")).rejects.toMatchObject({ code: "invalid-argument" });
  });

  it("plus de 10 appels par minute depuis la même adresse : refusé", async () => {
    memoryStore({});
    for (let i = 0; i < 10; i++) {
      await revokeDeviceTokenCore(db(), { token: TOKEN, userId: "dad", queuedAt: NOW }, "9.9.9.9");
    }
    await expect(revokeDeviceTokenCore(db(), { token: TOKEN, userId: "dad", queuedAt: NOW }, "9.9.9.9")).rejects.toMatchObject({
      code: "resource-exhausted",
    });
    // Une autre adresse n'est pas touchée.
    await expect(revokeDeviceTokenCore(db(), { token: TOKEN, userId: "dad", queuedAt: NOW }, "8.8.8.8")).resolves.toEqual({ ok: true });
  });

  it("clé de limitation sûre pour un identifiant de document (IPv6)", () => {
    expect(rateLimitKey("2001:db8::1")).toBe("revoke_ip_2001_db8__1");
    expect(rateLimitKey(undefined)).toBe("revoke_ip_unknown");
  });

  it("identifiant de document identique à celui de l'app", () => {
    expect(tokenDocId("ExponentPushToken[abc]")).toBe("ExponentPushToken_abc_");
  });

  it("jeton réinscrit APRÈS la demande (requête arrivée en retard) : document conservé", async () => {
    const docs = memoryStore({
      [DOC]: { userId: "dad", token: TOKEN, lastUsedAt: { toMillis: () => NOW + 5_000 } },
    });
    await revokeDeviceTokenCore(db(), { token: TOKEN, userId: "dad", queuedAt: NOW }, "1.2.3.4", NOW + 10_000);
    expect(docs.has(DOC)).toBe(true);
  });

  it("dernier usage avant la demande : supprimé", async () => {
    const docs = memoryStore({
      [DOC]: { userId: "dad", token: TOKEN, lastUsedAt: { toMillis: () => NOW - 60_000 } },
    });
    await revokeDeviceTokenCore(db(), { token: TOKEN, userId: "dad", queuedAt: NOW }, "1.2.3.4", NOW + 10_000);
    expect(docs.has(DOC)).toBe(false);
  });

  it("demande de plus de 30 jours : ignorée", async () => {
    const docs = memoryStore({ [DOC]: { userId: "dad", token: TOKEN } });
    await revokeDeviceTokenCore(db(), { token: TOKEN, userId: "dad", queuedAt: NOW - 31 * 86_400_000 }, "1.2.3.4", NOW);
    expect(docs.has(DOC)).toBe(true);
  });

  it("plafond global, quelle que soit l'adresse annoncée", async () => {
    memoryStore({});
    for (let i = 0; i < 120; i++) {
      await revokeDeviceTokenCore(db(), { token: TOKEN, userId: "dad", queuedAt: NOW }, `10.0.${Math.floor(i / 10)}.${i}`, NOW);
    }
    await expect(
      revokeDeviceTokenCore(db(), { token: TOKEN, userId: "dad", queuedAt: NOW }, "10.9.9.9", NOW),
    ).rejects.toMatchObject({ code: "resource-exhausted" });
  });

  it("compteur par adresse daté pour l'expiration automatique (TTL rate_limits.expireAt)", async () => {
    const docs = memoryStore({});
    await revokeDeviceTokenCore(db(), { token: TOKEN, userId: "dad", queuedAt: NOW }, "1.2.3.4", NOW);
    expect(docs.get(`rate_limits/${rateLimitKey("1.2.3.4")}`).expireAt).toBeDefined();
  });
});
