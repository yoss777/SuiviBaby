/* eslint-disable import/first */
// Sprint 6 (6.1 à 6.3, 6.9) : intégration hors ligne. La vraie file
// (offlineQueueService) et les vraies écritures (eventsService) tournent sur
// une base SQLite factice et un serveur factice qui dédoublonne par clé.

jest.mock("@/utils/errorReporting", () => ({
  addBreadcrumb: jest.fn(),
  captureServiceError: jest.fn(),
}));
jest.mock("@/config/firebase", () => ({
  auth: { currentUser: { uid: "test-uid" } },
  db: {},
  functions: {},
}));

import NetInfo from "@react-native-community/netinfo";
import * as SQLite from "expo-sqlite";
import { httpsCallable } from "firebase/functions";
import { captureServiceError } from "@/utils/errorReporting";
import {
  MAX_RETRIES,
  MAX_TRANSIENT_FAILURES,
  enqueueEvent,
  getExhaustedEvents,
  getQueueSize,
  getWaitingCount,
  onExhaustedChange,
  onQueueChange,
  processQueue,
  retryExhaustedEvents,
  setOnQueueFailure,
  stopAutoSync,
} from "@/services/offlineQueueService";
import {
  getOptimisticEntries,
  resetOptimisticStoreForTests,
} from "@/services/optimisticEventsStore";
import {
  ajouterEvenementOptimistic,
  supprimerEvenement,
} from "@/services/eventsService";

// ---------------------------------------------------------------------------
// Base SQLite factice : interprète les requêtes de offlineQueueService.
// ---------------------------------------------------------------------------
type Row = Record<string, any>;
function makeFakeDb() {
  let rows: Row[] = [];
  const where = (sql: string, args: any[]): ((r: Row) => boolean) => {
    const clause = sql.split(/\bWHERE\b/i)[1]?.split(/\bORDER BY\b/i)[0] ?? "";
    const preds: ((r: Row) => boolean)[] = [];
    let i = 0;
    for (const raw of clause.split(/\bAND\b/i).map((c) => c.trim()).filter(Boolean)) {
      let m: RegExpMatchArray | null;
      if ((m = raw.match(/^status IN \((.*)\)$/))) {
        const set = m[1].split(",").map((x) => x.trim().replace(/'/g, ""));
        preds.push((r) => set.includes(r.status));
      } else if ((m = raw.match(/^(\w+) (=|<|>=) (\?|'[^']*'|\d+)$/))) {
        const [, col, op, rhs] = m;
        const val = rhs === "?" ? args[i++] : rhs.startsWith("'") ? rhs.slice(1, -1) : Number(rhs);
        preds.push((r) => (op === "=" ? r[col] === val : op === "<" ? r[col] < val : r[col] >= val));
      } else throw new Error(`fake sqlite: unsupported WHERE ${raw}`);
    }
    return (r) => preds.every((p) => p(r));
  };
  const whereArgs = (sql: string, args: any[]) =>
    args.slice((sql.split(/\bWHERE\b/i)[0].match(/\?/g) ?? []).length);
  return {
    get rows() {
      return rows;
    },
    reset() {
      rows = [];
    },
    execAsync: jest.fn(async () => {}),
    runAsync: jest.fn(async (sql: string, ...args: any[]) => {
      if (/^\s*INSERT INTO pending_events/i.test(sql)) {
        const [id, uid, action, payload, createdAt] = args;
        rows.push({
          id,
          uid,
          action,
          payload,
          status: "pending",
          retryCount: 0,
          transientFailures: 0,
          lastError: null,
          createdAt,
        });
        return { changes: 1 };
      }
      const test = where(sql, whereArgs(sql, args));
      if (/^\s*DELETE FROM pending_events/i.test(sql)) {
        const before = rows.length;
        rows = rows.filter((r) => !test(r));
        return { changes: before - rows.length };
      }
      if (/^\s*UPDATE pending_events SET/i.test(sql)) {
        const set = sql.split(/\bSET\b/i)[1].split(/\bWHERE\b/i)[0];
        const setArgs = args.slice(0, (set.match(/\?/g) ?? []).length);
        let n = 0;
        for (const r of rows.filter(test)) {
          let a = 0;
          for (const part of set.split(",").map((x) => x.trim())) {
            const [col, rhs] = part.split(/\s=\s/);
            if (rhs === "?") r[col] = setArgs[a++];
            else if (rhs.startsWith("'")) r[col] = rhs.slice(1, -1);
            else if (/^\w+ \+ 1$/.test(rhs)) r[col] = (r[col] ?? 0) + 1;
            else r[col] = Number(rhs);
          }
          n++;
        }
        return { changes: n };
      }
      throw new Error(`fake sqlite: unsupported ${sql}`);
    }),
    getFirstAsync: jest.fn(async (sql: string, ...args: any[]) => ({
      count: rows.filter(where(sql, args)).length,
    })),
    getAllAsync: jest.fn(async (sql: string, ...args: any[]) =>
      rows
        .filter(where(sql, args))
        .sort((a, b) => a.createdAt - b.createdAt)
        .map((r) => ({ ...r })),
    ),
  };
}
const fakeDb = makeFakeDb();

// ---------------------------------------------------------------------------
// Serveur factice : dédoublonne les créations par idempotencyKey.
// ---------------------------------------------------------------------------
const server = {
  events: new Map<string, any>(),
  /** Appels qui ont atteint le serveur, quel que soit leur sort. */
  calls: [] as { name: string; payload: any }[],
  /** Erreurs à renvoyer, dans l'ordre, AVANT de traiter. */
  failures: [] as Error[],
  /** Traiter l'appel puis perdre la réponse (coupure réseau). */
  loseNextResponse: false,
  /** Erreur pour les appels dont le payload satisfait ce test. */
  rejectWhen: null as null | ((name: string, p: any) => Error | null),
};
const err = (message: string, code: string) => Object.assign(new Error(message), { code });
const netErr = () => err("network request failed", "functions/unavailable");

function serverCall(name: string) {
  return async (payload: any) => {
    server.calls.push({ name, payload });
    const rejected = server.rejectWhen?.(name, payload);
    if (rejected) throw rejected;
    const failure = server.failures.shift();
    if (failure) throw failure;
    let result: any = { data: { success: true } };
    if (name === "validateAndCreateEvent") {
      const key = payload.idempotencyKey;
      const existing = key && [...server.events.values()].find((e) => e.idempotencyKey === key);
      if (existing) result = { data: { id: existing.id } };
      else {
        const id = `srv${server.events.size + 1}`;
        server.events.set(id, { ...payload, id });
        result = { data: { id } };
      }
    }
    if (name === "deleteEventCascade") server.events.delete(payload.eventId);
    if (server.loseNextResponse) {
      server.loseNextResponse = false;
      throw netErr();
    }
    return result;
  };
}

const setNetwork = (connected: boolean) =>
  (NetInfo.fetch as jest.Mock).mockResolvedValue({ isConnected: connected });

/** Lance un cycle de la file en laissant passer la pause entre deux écritures. */
async function cycle(): Promise<number> {
  const p = processQueue();
  await jest.advanceTimersByTimeAsync(2000);
  return p;
}
async function settle() {
  await jest.advanceTimersByTimeAsync(5000);
}

const biberon = () => ({ type: "biberon", quantite: 120, date: new Date("2026-04-01T10:00:00Z") });
const queuedCreate = (quantite: number) => ({
  childId: "c1",
  type: "biberon",
  quantite,
  date: { seconds: 1, nanoseconds: 0 },
});

beforeEach(() => {
  jest.useFakeTimers();
  jest.clearAllMocks();
  (SQLite.openDatabaseAsync as jest.Mock).mockResolvedValue(fakeDb);
  fakeDb.reset();
  resetOptimisticStoreForTests();
  setOnQueueFailure(null);
  server.events.clear();
  server.calls = [];
  server.failures = [];
  server.loseNextResponse = false;
  server.rejectWhen = null;
  (httpsCallable as jest.Mock).mockImplementation((_f: unknown, name: string) => serverCall(name));
  setNetwork(true);
});
afterEach(() => {
  stopAutoSync();
  jest.clearAllTimers();
  jest.useRealTimers();
});

describe("saisie hors ligne puis reconnexion", () => {
  it("une création faite hors ligne part une seule fois au retour du réseau", async () => {
    setNetwork(false);
    ajouterEvenementOptimistic("c1", biberon());
    await settle();

    expect(server.calls).toHaveLength(0);
    expect(fakeDb.rows).toHaveLength(1);
    expect(JSON.parse(fakeDb.rows[0].payload).idempotencyKey).toEqual(expect.any(String));
    expect(await getWaitingCount()).toBe(1);
    expect(getOptimisticEntries("c1")[0].status).toBe("queued_offline");

    setNetwork(true);
    expect(await cycle()).toBe(1);

    expect(server.events.size).toBe(1);
    expect(fakeDb.rows).toHaveLength(0);
    expect(await getQueueSize()).toBe(0);
  });

  it("réponse perdue en ligne : les nouveaux essais (même clé) ne créent pas de second événement", async () => {
    server.loseNextResponse = true; // le serveur crée, le client ne le sait pas
    ajouterEvenementOptimistic("c1", biberon());
    await settle();

    expect(server.calls.length).toBeGreaterThanOrEqual(2);
    expect(server.events.size).toBe(1);
    expect(fakeDb.rows).toHaveLength(0);
    expect(getOptimisticEntries("c1")[0].status).toBe("confirmed");
  });

  it("créé côté serveur puis mis en file (tous les essais en ligne échouent) : le rejeu ne double pas", async () => {
    let first = true;
    (httpsCallable as jest.Mock).mockImplementation((_f: unknown, name: string) => {
      const call = serverCall(name);
      return async (payload: any) => {
        if (first && name === "validateAndCreateEvent") {
          first = false;
          server.loseNextResponse = true;
          await call(payload).catch(() => {});
        }
        throw netErr();
      };
    });
    ajouterEvenementOptimistic("c1", biberon());
    await settle();
    expect(server.events.size).toBe(1);
    expect(fakeDb.rows).toHaveLength(1); // mise en file malgré la création déjà faite

    (httpsCallable as jest.Mock).mockImplementation((_f: unknown, name: string) => serverCall(name));
    await cycle();

    expect(server.events.size).toBe(1); // dédoublonné par la clé
    expect(fakeDb.rows).toHaveLength(0);
  });

  it("une écriture de l'app 1.0.8 (sans clé) reçoit une clé stable et ne double pas", async () => {
    const id = await enqueueEvent("create", queuedCreate(80));
    // Ligne ancienne : on retire la clé que enqueueEvent a ajoutée.
    const row = fakeDb.rows.find((r) => r.id === id)!;
    const payload = JSON.parse(row.payload);
    delete payload.idempotencyKey;
    row.payload = JSON.stringify(payload);

    server.loseNextResponse = true; // créé côté serveur, réponse perdue : reste en file
    await cycle();
    expect(server.events.size).toBe(1);
    expect(fakeDb.rows).toHaveLength(1);
    stopAutoSync();

    await cycle();
    expect(server.events.size).toBe(1);
    expect(fakeDb.rows).toHaveLength(0);
    expect(server.calls[0].payload.idempotencyKey).toBe(id);
    expect(server.calls[1].payload.idempotencyKey).toBe(id);
  });

  it("enqueueEvent ajoute une clé à toute création, et garde celle qu'on lui donne", async () => {
    const a = await enqueueEvent("create", queuedCreate(1));
    const b = await enqueueEvent("create", { ...queuedCreate(2), idempotencyKey: "given" });
    const c = await enqueueEvent("update", { childId: "c1", eventId: "e1" });
    const key = (id: string) => JSON.parse(fakeDb.rows.find((r) => r.id === id)!.payload).idempotencyKey;
    expect(key(a)).toBe(a);
    expect(key(b)).toBe("given");
    expect(key(c)).toBeUndefined();
  });

  it("une suppression faite hors ligne est rejouée au retour du réseau", async () => {
    server.events.set("e1", { id: "e1" });
    setNetwork(false);
    await supprimerEvenement("c1", "e1");
    expect(server.events.has("e1")).toBe(true);
    setNetwork(true);
    await cycle();
    expect(server.events.has("e1")).toBe(false);
    expect(fakeDb.rows).toHaveLength(0);
  });
});

describe("échec visible et file qui ne bloque plus", () => {
  it("un refus définitif épuise l'écriture : Sentry, message, écran de synchronisation, compteurs cohérents", async () => {
    const onFailure = jest.fn();
    setOnQueueFailure(onFailure);
    const waiting: number[] = [];
    const exhausted: number[] = [];
    const off1 = onQueueChange((n) => waiting.push(n));
    const off2 = onExhaustedChange((n) => exhausted.push(n));

    await enqueueEvent("create", queuedCreate(9999));
    server.rejectWhen = () => err("Quantité biberon doit être entre 0 et 500 ml.", "functions/invalid-argument");

    for (let i = 0; i < MAX_RETRIES - 1; i++) {
      await cycle();
      expect(onFailure).not.toHaveBeenCalled();
      expect(await getWaitingCount()).toBe(1);
    }
    await cycle();

    expect(onFailure).toHaveBeenCalledTimes(1);
    expect(onFailure).toHaveBeenCalledWith({
      count: 1,
      message:
        "Un enregistrement n'a pas pu être envoyé. Touchez la bannière en haut de l'écran pour le réessayer.",
    });
    expect(captureServiceError).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        service: "offlineQueue",
        operation: "processQueue",
        extra: expect.objectContaining({ action: "create", reason: "permanent", code: "functions/invalid-argument" }),
      }),
    );
    // Aucune donnée saisie dans le contexte Sentry.
    expect(JSON.stringify((captureServiceError as jest.Mock).mock.calls)).not.toContain("9999");

    expect(await getWaitingCount()).toBe(0);
    const stuck = await getExhaustedEvents();
    expect(stuck).toHaveLength(1);
    expect(stuck[0].lastError).toContain("entre 0 et 500");
    expect(waiting[waiting.length - 1]).toBe(0);
    expect(exhausted[exhausted.length - 1]).toBe(1);

    // Plus rejouée aux cycles suivants, donc pas de nouveau message.
    server.calls = [];
    await cycle();
    expect(server.calls).toHaveLength(0);
    expect(onFailure).toHaveBeenCalledTimes(1);

    // Réarmement par l'utilisateur : l'écriture repart.
    server.rejectWhen = null;
    expect(await retryExhaustedEvents()).toBe(1);
    await jest.advanceTimersByTimeAsync(2000);
    expect(server.events.size).toBe(1);
    expect(await getExhaustedEvents()).toHaveLength(0);
    off1();
    off2();
  });

  it("le message annonce le nombre d'écritures quand il y en a plusieurs", async () => {
    const onFailure = jest.fn();
    setOnQueueFailure(onFailure);
    await enqueueEvent("update", { childId: "c1", eventId: "e1" });
    jest.setSystemTime(Date.now() + 10);
    await enqueueEvent("update", { childId: "c1", eventId: "e2" });
    server.rejectWhen = () => err("Event was modified", "functions/aborted");
    await cycle();
    expect(onFailure).toHaveBeenCalledWith({
      count: 2,
      message:
        "2 enregistrements n'ont pas pu être envoyés. Touchez la bannière en haut de l'écran pour les réessayer.",
    });
  });

  it("un conflit de version (aborted) est définitif tout de suite et ne bloque pas la suite de la file", async () => {
    const onFailure = jest.fn();
    setOnQueueFailure(onFailure);
    await enqueueEvent("update", { childId: "c1", eventId: "e1", quantite: 5, expectedUpdatedAt: 1 });
    jest.setSystemTime(Date.now() + 10);
    await enqueueEvent("create", queuedCreate(100));
    server.rejectWhen = (name) =>
      name === "validateAndUpdateEvent" ? err("Event was modified", "functions/aborted") : null;

    expect(await cycle()).toBe(1); // la création passe malgré le conflit devant elle

    expect(server.events.size).toBe(1);
    const stuck = await getExhaustedEvents();
    expect(stuck).toHaveLength(1);
    expect(stuck[0].action).toBe("update");
    expect(onFailure).toHaveBeenCalledWith(expect.objectContaining({ count: 1 }));
    expect(captureServiceError).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ extra: expect.objectContaining({ reason: "conflict" }) }),
    );
    expect(await getWaitingCount()).toBe(0);
  });

  it("une écriture qui échoue toujours en erreur transitoire est mise de côté après le plafond, la file continue", async () => {
    const onFailure = jest.fn();
    setOnQueueFailure(onFailure);
    await enqueueEvent("create", queuedCreate(1));
    jest.setSystemTime(Date.now() + 10);
    await enqueueEvent("create", queuedCreate(2));
    server.rejectWhen = (_n, p) => (p.quantite === 1 ? err("internal", "functions/internal") : null);

    // Sous le plafond : la file rend la main (le serveur est peut-être en difficulté), l'écriture reste valide.
    for (let i = 0; i < MAX_TRANSIENT_FAILURES - 1; i++) {
      expect(await cycle()).toBe(0);
      expect(server.events.size).toBe(0);
      expect(await getWaitingCount()).toBe(2);
      stopAutoSync(); // annule le rejeu programmé
    }
    expect(onFailure).not.toHaveBeenCalled();

    // Plafond atteint : l'écriture 1 est mise de côté, l'écriture 2 part dans le même cycle.
    expect(await cycle()).toBe(1);
    expect([...server.events.values()].map((e) => e.quantite)).toEqual([2]);
    expect(onFailure).toHaveBeenCalledWith(expect.objectContaining({ count: 1 }));
    expect(captureServiceError).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ extra: expect.objectContaining({ reason: "transient-cap" }) }),
    );
    const stuck = await getExhaustedEvents();
    expect(stuck).toHaveLength(1);
    expect(JSON.parse(stuck[0].payload).quantite).toBe(1); // jamais supprimée
    expect(await getWaitingCount()).toBe(0);

    // Réarmée, elle repart avec un compteur remis à zéro.
    server.rejectWhen = null;
    await retryExhaustedEvents();
    await jest.advanceTimersByTimeAsync(2000);
    expect(server.events.size).toBe(2);
    expect(fakeDb.rows).toHaveLength(0);
  });

  it("une panne d'infrastructure ne consomme pas les tentatives et reprend sans perte", async () => {
    await enqueueEvent("create", queuedCreate(3));
    server.failures = [err("The request was aborted because there was no available instance", "functions/unavailable")];
    await cycle();
    expect(fakeDb.rows[0].retryCount).toBe(0);
    expect(await getWaitingCount()).toBe(1);
    stopAutoSync();
    await cycle();
    expect(server.events.size).toBe(1);
    expect(fakeDb.rows).toHaveLength(0);
  });
});
