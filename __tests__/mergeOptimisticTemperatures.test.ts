import { mergeOptimisticTemperatures } from "@/utils/mergeOptimisticTemperatures";

const d = (h: number) => new Date(2026, 5, 15, h);
const toDate = (v: any) => (v instanceof Date ? v : v?.toDate ? v.toDate() : new Date(v));
const entry = (over: any = {}) => ({
  tempId: "__optimistic_1",
  operation: "create",
  status: "pending",
  childId: "c1",
  createdAt: 0,
  event: { type: "temperature", valeur: 38.6, date: d(10) },
  ...over,
});

describe("M3 températures optimistes / en file dans l'entrée des insights", () => {
  const weekly = [{ id: "w1", type: "temperature", date: d(8), valeur: 37 }];

  it("ajoute une température en attente (pending)", () => {
    const out = mergeOptimisticTemperatures(weekly as any, [entry()] as any, toDate);
    expect(out).toHaveLength(2);
    expect(out[1]).toMatchObject({ id: "__optimistic_1", type: "temperature", valeur: 38.6 });
    expect(out[1].date).toEqual(d(10));
  });

  it("ajoute une température en file hors ligne (queued_offline)", () => {
    const out = mergeOptimisticTemperatures([], [entry({ status: "queued_offline" })] as any, toDate);
    expect(out).toHaveLength(1);
  });

  it("ignore les entrées échouées et les autres types", () => {
    const out = mergeOptimisticTemperatures(
      weekly as any,
      [entry({ status: "failed" }), entry({ tempId: "x", event: { type: "biberon", date: d(9) } })] as any,
      toDate,
    );
    expect(out).toHaveLength(1);
  });

  it("pas de doublon quand le document serveur est déjà là (realId)", () => {
    const out = mergeOptimisticTemperatures(weekly as any, [entry({ status: "confirmed", realId: "w1" })] as any, toDate);
    expect(out).toHaveLength(1);
  });

  it("pas de doublon quand même valeur et même instant", () => {
    const w = [{ id: "srv", type: "temperature", date: d(10), valeur: 38.6 }];
    expect(mergeOptimisticTemperatures(w as any, [entry({ status: "confirmed" })] as any, toDate)).toHaveLength(1);
  });

  it("une modification en attente remplace la valeur du document serveur", () => {
    const out = mergeOptimisticTemperatures(
      weekly as any,
      [entry({ operation: "update", realId: "w1", event: { type: "temperature", valeur: 39.2, date: d(8) } })] as any,
      toDate,
    );
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ id: "w1", valeur: 39.2 });
  });

  it("accepte une date de type Timestamp et ignore une valeur absente", () => {
    const ts = { toDate: () => d(11) };
    const out = mergeOptimisticTemperatures(
      [] as any[],
      [entry({ event: { type: "temperature", valeur: 38.1, date: ts } }), entry({ tempId: "n", event: { type: "temperature", date: d(9) } })] as any,
      toDate,
    );
    expect(out).toHaveLength(1);
    expect(out[0].date).toEqual(d(11));
  });

  it("ne modifie pas la liste d'entrée", () => {
    const before = JSON.stringify(weekly);
    mergeOptimisticTemperatures(weekly as any, [entry()] as any, toDate);
    expect(JSON.stringify(weekly)).toBe(before);
  });
});
