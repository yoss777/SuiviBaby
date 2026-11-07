/* eslint-disable import/first */
// S11.3 : un test paramétré pour tous les helpers `ajouterX` de eventsService.

jest.mock("@/utils/errorReporting", () => ({
  addBreadcrumb: jest.fn(),
  captureServiceError: jest.fn(),
}));
jest.mock("@/services/offlineQueueService", () => ({
  enqueueEvent: jest.fn(() => Promise.resolve("offline_1")),
  isOnline: jest.fn(() => Promise.resolve(true)),
}));
jest.mock("@/config/firebase", () => ({
  auth: { currentUser: { uid: "user123" } },
  db: {},
  functions: {},
}));

import { httpsCallable } from "firebase/functions";
import * as offlineQueue from "@/services/offlineQueueService";
import * as svc from "@/services/eventsService";

const callable = jest.fn();
const enqueue = offlineQueue.enqueueEvent as jest.Mock;
const online = offlineQueue.isOnline as jest.Mock;

const KEY_FORMAT = /^[A-Za-z0-9_-]{1,100}$/;
const DATE = new Date("2026-04-01T10:00:00Z");

type Case = {
  name: string;
  type: string;
  call: () => Promise<unknown>;
  fields: Record<string, unknown>;
};

const cases: Case[] = [
  {
    name: "ajouterBiberon",
    type: "biberon",
    call: () => svc.ajouterBiberon("c1", 120, DATE, "ok"),
    fields: { quantite: 120, note: "ok" },
  },
  {
    name: "ajouterTetee",
    type: "tetee",
    call: () => svc.ajouterTetee("c1", { coteGauche: true, dureeGauche: 8, date: DATE }),
    fields: { coteGauche: true, coteDroit: false, dureeGauche: 8 },
  },
  {
    name: "ajouterPompage",
    type: "pompage",
    call: () => svc.ajouterPompage("c1", { quantiteGauche: 50, quantiteDroite: 60, duree: 15, date: DATE }),
    fields: { quantiteGauche: 50, quantiteDroite: 60, duree: 15 },
  },
  {
    name: "ajouterCouche",
    type: "couche",
    call: () => svc.ajouterCouche("c1", { date: DATE, note: "n" }),
    fields: { note: "n" },
  },
  {
    name: "ajouterMiction",
    type: "miction",
    call: () => svc.ajouterMiction("c1", { volume: 30, couleur: "claire", avecCouche: true, date: DATE }),
    fields: { volume: 30, couleur: "claire", avecCouche: true },
  },
  {
    name: "ajouterSelle",
    type: "selle",
    call: () => svc.ajouterSelle("c1", { consistance: "molle", quantite: "moyen", date: DATE }),
    fields: { consistance: "molle", quantite: "moyen" },
  },
  {
    name: "ajouterSommeil",
    type: "sommeil",
    call: () =>
      svc.ajouterSommeil("c1", {
        heureDebut: DATE,
        heureFin: new Date(DATE.getTime() + 90 * 60000),
        location: "lit",
      }),
    fields: { duree: 90, location: "lit", isNap: true },
  },
  {
    name: "ajouterTemperature",
    type: "temperature",
    call: () => svc.ajouterTemperature("c1", 38.2, { modePrise: "rectale" as any, date: DATE }),
    fields: { valeur: 38.2, modePrise: "rectale" },
  },
  {
    name: "ajouterMedicament",
    type: "medicament",
    call: () => svc.ajouterMedicament("c1", "Doliprane", { dosage: "2,5 ml", date: DATE }),
    fields: { nomMedicament: "Doliprane", dosage: "2,5 ml" },
  },
  {
    name: "ajouterSymptome",
    type: "symptome",
    call: () => svc.ajouterSymptome("c1", ["toux", "fièvre"], { date: DATE }),
    fields: { symptomes: ["toux", "fièvre"] },
  },
  {
    name: "ajouterVaccin",
    type: "vaccin",
    call: () => svc.ajouterVaccin("c1", "ROR", { lieu: "PMI", date: DATE }),
    fields: { nomVaccin: "ROR", lieu: "PMI" },
  },
  {
    name: "ajouterVitamine",
    type: "vitamine",
    call: () => svc.ajouterVitamine("c1", "Vitamine D", { dosage: "1 goutte", date: DATE }),
    fields: { nomVitamine: "Vitamine D", dosage: "1 goutte" },
  },
];

beforeEach(() => {
  jest.clearAllMocks();
  (httpsCallable as jest.Mock).mockReturnValue(callable);
  callable.mockReset();
  callable.mockResolvedValue({ data: { id: "srv1" } });
  online.mockResolvedValue(true);
  enqueue.mockResolvedValue("offline_1");
});

describe.each(cases)("$name", ({ type, call, fields }) => {
  it("sends the right payload to validateAndCreateEvent with an idempotency key", async () => {
    const id = await call();

    expect(id).toBe("srv1");
    expect(httpsCallable).toHaveBeenCalledWith(expect.anything(), "validateAndCreateEvent");
    expect(callable).toHaveBeenCalledTimes(1);
    const payload = callable.mock.calls[0][0];
    expect(payload).toMatchObject({ type, childId: "c1", ...fields });
    expect(payload.idempotencyKey).toMatch(KEY_FORMAT);
    expect(payload.date).toBeDefined();
    expect(enqueue).not.toHaveBeenCalled();
  });

  it("does not leak undefined fields to the callable", async () => {
    await call();
    const payload = callable.mock.calls[0][0];
    expect(Object.values(payload)).not.toContain(undefined);
  });

  it("queues the same payload, with its key, when offline", async () => {
    online.mockResolvedValue(false);

    const id = await call();

    expect(id).toBe("offline_1");
    expect(callable).not.toHaveBeenCalled();
    expect(enqueue).toHaveBeenCalledTimes(1);
    expect(enqueue).toHaveBeenCalledWith(
      "create",
      expect.objectContaining({
        type,
        childId: "c1",
        ...fields,
        idempotencyKey: expect.stringMatching(KEY_FORMAT),
      }),
    );
  });

  it("propagates a server rejection", async () => {
    callable.mockRejectedValue(Object.assign(new Error("invalid"), { code: "functions/invalid-argument" }));
    await expect(call()).rejects.toThrow("invalid");
    expect(enqueue).not.toHaveBeenCalled();
  });
});

describe("ajouterCoucheAvecDetails", () => {
  it("creates couche, then miction and selle flagged avecCouche, with distinct keys", async () => {
    callable
      .mockResolvedValueOnce({ data: { id: "a" } })
      .mockResolvedValueOnce({ data: { id: "b" } })
      .mockResolvedValueOnce({ data: { id: "c" } });

    const ids = await svc.ajouterCoucheAvecDetails("c1", {
      avecMiction: true,
      mictionDetails: { volume: 20 },
      avecSelle: true,
      selleDetails: { consistance: "normale" },
      date: DATE,
    });

    expect(ids).toEqual(["a", "b", "c"]);
    const payloads = callable.mock.calls.map(([p]) => p);
    expect(payloads.map((p) => p.type)).toEqual(["couche", "miction", "selle"]);
    expect(payloads[1]).toMatchObject({ volume: 20, avecCouche: true });
    expect(payloads[2]).toMatchObject({ consistance: "normale", avecCouche: true });
    expect(new Set(payloads.map((p) => p.idempotencyKey)).size).toBe(3);
  });

  it("creates only the couche by default and queues it offline", async () => {
    online.mockResolvedValue(false);
    const ids = await svc.ajouterCoucheAvecDetails("c1", { date: DATE });
    expect(ids).toEqual(["offline_1"]);
    expect(enqueue).toHaveBeenCalledTimes(1);
  });
});
