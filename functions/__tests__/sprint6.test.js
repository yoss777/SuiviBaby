/* global describe, it, expect, jest, beforeEach, afterEach */
// Sprint 6 (fiabilité) : création d'événement idempotente côté serveur.
const { memoryStore } = require("./memoryFirestore");
const fns = require("../index");
const adminMod = require("firebase-admin");
const { Resend } = require("resend");

const nowSec = () => Math.floor(Date.now() / 1000);
const call = (uid, data = {}) => ({
  auth: { uid, token: { email: `${uid}@t.com`, auth_time: nowSec() } },
  data,
  app: true,
});
const eventKeys = (docs) => [...docs.keys()].filter((k) => k.startsWith("events/"));
const base = () => ({ "children/c1/access/u1": { role: "owner" }, "children/c2/access/u1": { role: "owner" }, "children/c1/access/u2": { role: "admin" } });

beforeEach(() => jest.clearAllMocks());

describe("validateAndCreateEvent : idempotence", () => {
  it("avec idempotencyKey : identifiant déterministe, document créé une seule fois", async () => {
    const docs = memoryStore(base());
    const data = { childId: "c1", type: "biberon", quantite: 120, idempotencyKey: "u1_1_abc" };
    const first = await fns.validateAndCreateEvent(call("u1", data));
    const second = await fns.validateAndCreateEvent(call("u1", data));
    expect(second).toEqual(first);
    expect(first.id).toMatch(/^idem_[0-9a-f]{40}$/);
    expect(eventKeys(docs)).toEqual([`events/${first.id}`]);
    expect(docs.get(`events/${first.id}`)).toMatchObject({ childId: "c1", userId: "u1", idempotencyKey: "u1_1_abc", quantite: 120 });
  });

  it("deux envois simultanés de la même clé ne donnent qu'un document", async () => {
    const docs = memoryStore(base());
    const data = { childId: "c1", type: "biberon", quantite: 90, idempotencyKey: "k_parallel" };
    const [a, b] = await Promise.all([
      fns.validateAndCreateEvent(call("u1", data)),
      fns.validateAndCreateEvent(call("u1", data)),
    ]);
    expect(a.id).toBe(b.id);
    expect(eventKeys(docs)).toHaveLength(1);
  });

  it("la même clé pour un autre enfant ou un autre utilisateur crée un autre événement", async () => {
    const docs = memoryStore(base());
    const k = "shared_key";
    const a = await fns.validateAndCreateEvent(call("u1", { childId: "c1", type: "biberon", quantite: 1, idempotencyKey: k }));
    const b = await fns.validateAndCreateEvent(call("u1", { childId: "c2", type: "biberon", quantite: 1, idempotencyKey: k }));
    const c = await fns.validateAndCreateEvent(call("u2", { childId: "c1", type: "biberon", quantite: 1, idempotencyKey: k }));
    expect(new Set([a.id, b.id, c.id]).size).toBe(3);
    expect(eventKeys(docs)).toHaveLength(3);
  });

  it("reconnaît un événement créé avant la mise à jour (identifiant aléatoire, même clé)", async () => {
    const docs = memoryStore({
      ...base(),
      "events/legacy1": { childId: "c1", userId: "u1", type: "biberon", idempotencyKey: "old_key" },
    });
    const res = await fns.validateAndCreateEvent(call("u1", { childId: "c1", type: "biberon", quantite: 5, idempotencyKey: "old_key" }));
    expect(res).toEqual({ id: "legacy1" });
    expect(eventKeys(docs)).toEqual(["events/legacy1"]);
  });

  it("app 1.0.8 sans clé : création classique, identifiant aléatoire, un document par appel", async () => {
    const docs = memoryStore(base());
    const data = { childId: "c1", type: "biberon", quantite: 100 };
    const a = await fns.validateAndCreateEvent(call("u1", data));
    const b = await fns.validateAndCreateEvent(call("u1", data));
    expect(a.id).not.toBe(b.id);
    expect(a.id).not.toMatch(/^idem_/);
    expect(eventKeys(docs)).toHaveLength(2);
    expect(docs.get(`events/${a.id}`)).not.toHaveProperty("idempotencyKey");
  });

  it("refuse une clé mal formée sans rien écrire", async () => {
    const docs = memoryStore(base());
    for (const idempotencyKey of ["a/b", "x".repeat(101), 42, "é accent"]) {
      await expect(
        fns.validateAndCreateEvent(call("u1", { childId: "c1", type: "biberon", quantite: 1, idempotencyKey })),
      ).rejects.toMatchObject({ code: "invalid-argument" });
    }
    expect(eventKeys(docs)).toHaveLength(0);
  });

  it("une clé vide est traitée comme absente", async () => {
    const docs = memoryStore(base());
    await fns.validateAndCreateEvent(call("u1", { childId: "c1", type: "biberon", quantite: 1, idempotencyKey: "" }));
    expect(eventKeys(docs)).toHaveLength(1);
  });

  it("n'écrit pas un doublon si les droits manquent", async () => {
    const docs = memoryStore({});
    await expect(
      fns.validateAndCreateEvent(call("u1", { childId: "c1", type: "biberon", quantite: 1, idempotencyKey: "k" })),
    ).rejects.toMatchObject({ code: "permission-denied" });
    expect(eventKeys(docs)).toHaveLength(0);
  });
});

describe("suppression d'un événement idempotent : pierre tombale (L5)", () => {
  const data = { childId: "c1", type: "biberon", quantite: 120, idempotencyKey: "u1_tomb_1" };

  it("un rejeu de la création après suppression ne ressuscite pas l'événement", async () => {
    const docs = memoryStore(base());
    const created = await fns.validateAndCreateEvent(call("u1", data));
    expect(docs.has(`events/${created.id}`)).toBe(true);

    await fns.deleteEventCascade(call("u1", { childId: "c1", eventId: created.id }));
    expect(docs.has(`events/${created.id}`)).toBe(false);
    expect(docs.has(`deleted_idem/${created.id}`)).toBe(true);

    // Rejeu tardif de la même création (file hors ligne, réponse perdue…).
    const replay = await fns.validateAndCreateEvent(call("u1", data));
    expect(replay.id).toBe(created.id);
    expect(docs.has(`events/${created.id}`)).toBe(false);
  });

  it("la pierre tombale ne contient aucune donnée de santé ni d'identité", async () => {
    const docs = memoryStore(base());
    const created = await fns.validateAndCreateEvent(call("u1", data));
    await fns.deleteEventCascade(call("u1", { childId: "c1", eventId: created.id }));
    const tomb = docs.get(`deleted_idem/${created.id}`);
    expect(Object.keys(tomb).sort()).toEqual(["deletedAt", "expireAt"]); // expireAt = TTL (S12.5)
  });

  it("une autre clé d'idempotence reste créable après cette suppression", async () => {
    const docs = memoryStore(base());
    const created = await fns.validateAndCreateEvent(call("u1", data));
    await fns.deleteEventCascade(call("u1", { childId: "c1", eventId: created.id }));
    const other = await fns.validateAndCreateEvent(call("u1", { ...data, idempotencyKey: "u1_tomb_2" }));
    expect(other.id).not.toBe(created.id);
    expect(docs.has(`events/${other.id}`)).toBe(true);
  });

  it("la suppression d'un événement sans identifiant déterministe n'écrit aucune pierre tombale", async () => {
    const docs = memoryStore({ ...base(), "events/plain1": { childId: "c1", userId: "u1", type: "biberon" } });
    await fns.deleteEventCascade(call("u1", { childId: "c1", eventId: "plain1" }));
    expect([...docs.keys()].filter((k) => k.startsWith("deleted_idem/"))).toHaveLength(0);
  });
});

describe("requestAccountDeletion : e-mail de confirmation", () => {
  let errorSpy;
  beforeEach(() => {
    process.env.RESEND_API_KEY = "re_test";
    adminMod.auth.mockReturnValue({ getUser: jest.fn().mockResolvedValue({ email: "u1@t.com" }) });
    errorSpy = jest.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => {
    delete process.env.RESEND_API_KEY;
    errorSpy.mockRestore();
  });

  it("indique emailSent: true quand l'e-mail part", async () => {
    memoryStore({ "users/u1": {} });
    const res = await fns.requestAccountDeletion(call("u1"));
    expect(res).toMatchObject({ deletionDate: expect.any(String), emailSent: true });
  });

  it("indique emailSent: false quand Resend renvoie une erreur (la demande reste enregistrée)", async () => {
    const docs = memoryStore({ "users/u1": {} });
    Resend.mockImplementationOnce(() => ({
      emails: { send: jest.fn().mockResolvedValue({ error: { name: "validation_error", message: "bad" } }) },
    }));
    const res = await fns.requestAccountDeletion(call("u1"));
    expect(res.emailSent).toBe(false);
    expect(docs.get("users/u1").pendingDeletion.deletionDate).toBe(res.deletionDate);
  });

  it("une demande déjà enregistrée ne renvoie pas emailSent (rien n'a été renvoyé)", async () => {
    const existing = { scheduledAt: new Date().toISOString(), deletionDate: new Date(Date.now() + 86400000).toISOString() };
    memoryStore({ "users/u1": { pendingDeletion: existing } });
    const res = await fns.requestAccountDeletion(call("u1"));
    expect(res).toEqual({ deletionDate: existing.deletionDate });
  });
});
