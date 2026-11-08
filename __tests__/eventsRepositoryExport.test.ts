// Lectures d'export : serveur uniquement, pagination sans troncature,
// décomptes alignés sur ce qui est exporté.
import { getCountFromServer, getDocs, getDocsFromServer, startAfter } from "firebase/firestore";

import {
  countCommentsForExport,
  countEventsForExport,
  countLikesForExport,
  EXPORT_MAX_DOCS,
  EXPORT_PAGE_SIZE,
  getCommentsForExport,
  getEventsForExport,
  getLikesForExport,
} from "@/services/eventsRepository";

jest.mock("@/config/firebase", () => ({ db: {} }));

type Constraint = { kind: string; [k: string]: unknown };
type FakeQuery = { collection: string; constraints: Constraint[] };
type FakeDoc = { id: string; data: () => Record<string, unknown> };

/** Faux serveur : jeux de documents par collection, filtrés par `where ==`, triés par id. */
let server: Record<string, Array<Record<string, unknown> & { id: string }>> = {};

function match(q: FakeQuery) {
  const wheres = q.constraints.filter((c) => c.kind === "where");
  let rows = (server[q.collection] ?? [])
    .filter((row) => wheres.every((w) => row[w.field as string] === w.value))
    .sort((a, b) => a.id.localeCompare(b.id));
  const after = q.constraints.find((c) => c.kind === "startAfter");
  if (after) {
    const afterId = (after.snap as FakeDoc).id;
    rows = rows.filter((row) => row.id.localeCompare(afterId) > 0);
  }
  return rows;
}

function makeDocs(prefix: string, count: number, extra: Record<string, unknown>) {
  return Array.from({ length: count }, (_, i) => ({
    id: `${prefix}${String(i).padStart(6, "0")}`,
    ...extra,
  }));
}

beforeEach(() => {
  jest.clearAllMocks();
  server = {};
  const fs = jest.requireMock("firebase/firestore");
  fs.collection.mockImplementation((_db: unknown, name: string) => ({ name }));
  fs.where.mockImplementation((field: string, _op: string, value: unknown) => ({ kind: "where", field, value }));
  fs.limit.mockImplementation((n: number) => ({ kind: "limit", n }));
  (startAfter as jest.Mock).mockImplementation((snap: FakeDoc) => ({ kind: "startAfter", snap }));
  fs.query.mockImplementation((col: { name: string }, ...constraints: Constraint[]) => ({
    collection: col.name,
    constraints,
  }));
  (getDocsFromServer as jest.Mock).mockImplementation(async (q: FakeQuery) => {
    const lim = q.constraints.find((c) => c.kind === "limit")?.n as number | undefined;
    const rows = match(q).slice(0, lim ?? Infinity);
    const docs = rows.map((r) => ({ id: r.id, data: () => r }));
    return { docs, empty: docs.length === 0 };
  });
  (getCountFromServer as jest.Mock).mockImplementation(async (q: FakeQuery) => ({
    data: () => ({ count: match(q).length }),
  }));
});

describe("lectures d'export : serveur uniquement", () => {
  it("n'utilise jamais le cache (getDocs) pour les événements, likes et commentaires", async () => {
    server.events = makeDocs("e", 3, { childId: "c1", userId: "u1", type: "biberon" });
    await getEventsForExport("c1");
    await getLikesForExport("c1", "u1");
    await getCommentsForExport("c1", "u1");
    expect(getDocs).not.toHaveBeenCalled();
    expect(getDocsFromServer).toHaveBeenCalledTimes(3);
  });

  it("propage l'erreur hors ligne : aucun résultat partiel", async () => {
    (getDocsFromServer as jest.Mock).mockRejectedValue(Object.assign(new Error("offline"), { code: "unavailable" }));
    await expect(getEventsForExport("c1")).rejects.toThrow("offline");
  });
});

describe("règle Proche / Parent", () => {
  beforeEach(() => {
    server.events = [
      { id: "e1", childId: "c1", userId: "me", type: "biberon" },
      { id: "e2", childId: "c1", userId: "other", type: "biberon" },
      { id: "e3", childId: "c1", userId: "me", type: "selle" },
      { id: "e4", childId: "c2", userId: "me", type: "selle" },
    ];
  });

  it("sans auteur : tous les événements de l'enfant", async () => {
    const res = await getEventsForExport("c1");
    expect(res.docs.map((d) => d.id)).toEqual(["e1", "e2", "e3"]);
  });

  it("avec auteur : uniquement les événements saisis par cet utilisateur", async () => {
    const res = await getEventsForExport("c1", { authorUid: "me" });
    expect(res.docs.map((d) => d.id)).toEqual(["e1", "e3"]);
  });

  it("avec type : uniquement ce type (lecture ciblée des types sélectionnés)", async () => {
    const res = await getEventsForExport("c1", { authorUid: "me", type: "selle" });
    expect(res.docs.map((d) => d.id)).toEqual(["e3"]);
  });

  it("likes et commentaires : seulement ceux de l'utilisateur", async () => {
    server.eventLikes = [
      { id: "l1", childId: "c1", userId: "me" },
      { id: "l2", childId: "c1", userId: "other" },
    ];
    server.eventComments = [
      { id: "m1", childId: "c1", userId: "other" },
      { id: "m2", childId: "c1", userId: "me" },
    ];
    expect((await getLikesForExport("c1", "me")).docs.map((d) => d.id)).toEqual(["l1"]);
    expect((await getCommentsForExport("c1", "me")).docs.map((d) => d.id)).toEqual(["m2"]);
  });
});

describe("pagination au-delà de la limite historique de 10 000", () => {
  it("exporte tout (10 050 événements) en plusieurs pages", async () => {
    server.events = makeDocs("e", 10050, { childId: "c1", userId: "u1", type: "biberon" });
    const res = await getEventsForExport("c1");
    expect(res.docs).toHaveLength(10050);
    expect(res.truncated).toBe(false);
    expect(new Set(res.docs.map((d) => d.id)).size).toBe(10050);
    expect((getDocsFromServer as jest.Mock).mock.calls.length).toBeGreaterThan(1);
  });

  it("une taille exactement multiple de la page ne boucle pas et ne tronque pas", async () => {
    server.eventLikes = makeDocs("l", EXPORT_PAGE_SIZE * 2, { childId: "c1", userId: "u1" });
    const res = await getLikesForExport("c1", "u1");
    expect(res.docs).toHaveLength(EXPORT_PAGE_SIZE * 2);
    expect(res.truncated).toBe(false);
  });

  it("au plafond dur : signale la troncature explicitement", async () => {
    server.events = makeDocs("e", EXPORT_MAX_DOCS + 5, { childId: "c1", userId: "u1", type: "biberon" });
    const res = await getEventsForExport("c1");
    expect(res.docs).toHaveLength(EXPORT_MAX_DOCS);
    expect(res.truncated).toBe(true);
  });

  it("pile au plafond dur : pas de troncature signalée", async () => {
    server.events = makeDocs("e", EXPORT_MAX_DOCS, { childId: "c1", userId: "u1", type: "biberon" });
    const res = await getEventsForExport("c1");
    expect(res.docs).toHaveLength(EXPORT_MAX_DOCS);
    expect(res.truncated).toBe(false);
  });
});

describe("décomptes serveur", () => {
  beforeEach(() => {
    server.events = [
      { id: "e1", childId: "c1", userId: "me", type: "biberon" },
      { id: "e2", childId: "c1", userId: "other", type: "biberon" },
      { id: "e3", childId: "c1", userId: "me", type: "selle" },
    ];
    server.eventLikes = [
      { id: "l1", childId: "c1", userId: "me" },
      { id: "l2", childId: "c1", userId: "other" },
    ];
    server.eventComments = [{ id: "m1", childId: "c1", userId: "me" }];
  });

  it("compte par type pour un parent (tous les auteurs)", async () => {
    expect(await countEventsForExport("c1", { type: "biberon" })).toBe(2);
  });

  it("compte par type pour un proche (ses saisies)", async () => {
    expect(await countEventsForExport("c1", { type: "biberon", authorUid: "me" })).toBe(1);
  });

  it("les comptes d'une sélection égalent le nombre d'éléments exportés", async () => {
    for (const authorUid of [undefined, "me"]) {
      for (const type of ["biberon", "selle"]) {
        const exported = (await getEventsForExport("c1", { authorUid })).docs.filter(
          (d) => (d.data() as { type: string }).type === type,
        ).length;
        expect(await countEventsForExport("c1", { type, authorUid })).toBe(exported);
      }
    }
    expect(await countLikesForExport("c1", "me")).toBe((await getLikesForExport("c1", "me")).docs.length);
    expect(await countCommentsForExport("c1", "me")).toBe((await getCommentsForExport("c1", "me")).docs.length);
  });

  it("propage l'échec hors ligne", async () => {
    (getCountFromServer as jest.Mock).mockRejectedValue(new Error("offline"));
    await expect(countEventsForExport("c1", { type: "biberon" })).rejects.toThrow("offline");
  });
});
