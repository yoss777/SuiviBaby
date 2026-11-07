import { getDateTime, isValidDate, toDate, toDateOr } from "@/utils/date";

describe("toDate", () => {
  const ref = new Date(2026, 10, 7, 13, 5, 0);

  it("renvoie la même instance pour une Date", () => {
    expect(toDate(ref)).toBe(ref);
  });

  it("utilise .toDate() des Timestamp Firestore", () => {
    expect(toDate({ toDate: () => ref }).getTime()).toBe(ref.getTime());
  });

  it("gère {seconds, nanoseconds}", () => {
    const seconds = Math.floor(ref.getTime() / 1000);
    expect(toDate({ seconds, nanoseconds: 500_000_000 }).getTime()).toBe(
      seconds * 1000 + 500,
    );
  });

  it("gère {_seconds} (JSON des Cloud Functions)", () => {
    expect(toDate({ _seconds: 10 }).getTime()).toBe(10_000);
  });

  // Écart voulu avec l'ancienne copie locale (`value?.seconds` faux pour 0).
  it("gère {seconds: 0} (epoch)", () => {
    expect(toDate({ seconds: 0 }).getTime()).toBe(0);
  });

  it("lit un objet qui n'expose que toMillis()", () => {
    expect(toDate({ toMillis: () => 1_700_000_000_000 }).getTime()).toBe(1_700_000_000_000);
  });

  it("accepte nombre et chaîne", () => {
    expect(toDate(ref.getTime()).getTime()).toBe(ref.getTime());
    expect(toDate("2026-11-07T12:00:00.000Z").getTime()).toBe(
      Date.UTC(2026, 10, 7, 12),
    );
  });

  // Écart voulu : l'ancienne copie faisait new Date(null) = epoch.
  it("renvoie une date invalide pour null / undefined / objet inconnu", () => {
    expect(isValidDate(toDate(null))).toBe(false);
    expect(isValidDate(toDate(undefined))).toBe(false);
    expect(isValidDate(toDate({ foo: 1 }))).toBe(false);
  });
});

describe("toDateOr", () => {
  const fallback = new Date(2020, 0, 1);

  it("renvoie la date convertie quand elle est valide", () => {
    expect(toDateOr({ seconds: 10 }, fallback).getTime()).toBe(10_000);
  });

  it("renvoie le repli pour null, undefined ou une valeur invalide", () => {
    expect(toDateOr(null, fallback)).toBe(fallback);
    expect(toDateOr(undefined, fallback)).toBe(fallback);
    expect(toDateOr("pas une date", fallback)).toBe(fallback);
  });
});

describe("getDateTime", () => {
  it("renvoie les millisecondes d'une date valide", () => {
    expect(getDateTime({ seconds: 2 })).toBe(2000);
  });

  it("renvoie 0 pour une date absente ou invalide", () => {
    expect(getDateTime(null)).toBe(0);
    expect(getDateTime(undefined)).toBe(0);
    expect(getDateTime("n'importe quoi")).toBe(0);
  });

  it("permet de trier du plus récent au plus ancien", () => {
    const items = [{ date: { seconds: 1 } }, { date: null }, { date: { seconds: 3 } }];
    const sorted = [...items].sort((a, b) => getDateTime(b.date) - getDateTime(a.date));
    expect(sorted.map((i) => getDateTime(i.date))).toEqual([3000, 1000, 0]);
  });
});
