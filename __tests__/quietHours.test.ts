import {
  DEFAULT_QUIET_HOURS,
  dateToHHMM,
  getDeviceTimeZone,
  hhmmToDate,
  isInQuietHours,
  nextQuietHoursEnd,
  normalizeQuietHours,
  secondsAfterQuietHours,
} from "@/utils/quietHours";

const at = (iso: string) => Date.parse(iso);
const qh = (over = {}) => ({ enabled: true, start: "22:00", end: "07:00", timeZone: "Europe/Paris", ...over });

describe("normalizeQuietHours", () => {
  it("applique 22:00-07:00 Europe/Paris activé sans valeur ou avec une valeur invalide", () => {
    for (const raw of [undefined, null, {}, "x", 3]) {
      expect(normalizeQuietHours(raw)).toEqual(DEFAULT_QUIET_HOURS);
    }
    expect(normalizeQuietHours({ start: "99:00", end: "7h", timeZone: "Mars/Olympus", enabled: "oui" })).toEqual(DEFAULT_QUIET_HOURS);
  });

  it("garde les valeurs valides", () => {
    const v = { enabled: false, start: "21:30", end: "06:15", timeZone: "America/Montreal" };
    expect(normalizeQuietHours(v)).toEqual(v);
  });
});

describe("isInQuietHours", () => {
  it("passe minuit, bornes début incluse / fin exclue", () => {
    expect(isInQuietHours(qh(), at("2026-06-15T20:00:00Z"))).toBe(true);
    expect(isInQuietHours(qh(), at("2026-06-15T19:59:00Z"))).toBe(false);
    expect(isInQuietHours(qh(), at("2026-06-16T04:59:00Z"))).toBe(true);
    expect(isInQuietHours(qh(), at("2026-06-16T05:00:00Z"))).toBe(false);
  });

  it("même journée, désactivé, début == fin", () => {
    expect(isInQuietHours(qh({ start: "13:00", end: "15:00" }), at("2026-06-15T12:00:00Z"))).toBe(true);
    expect(isInQuietHours(qh({ enabled: false }), at("2026-06-15T22:00:00Z"))).toBe(false);
    expect(isInQuietHours(qh({ end: "22:00" }), at("2026-06-15T22:00:00Z"))).toBe(false);
  });

  it("fuseau de l'utilisateur et changement d'heure", () => {
    expect(isInQuietHours(qh({ timeZone: "America/Montreal" }), at("2026-06-15T10:00:00Z"))).toBe(true); // 06:00
    expect(isInQuietHours(qh({ timeZone: "America/Montreal" }), at("2026-06-15T20:00:00Z"))).toBe(false); // 16:00
    expect(isInQuietHours(qh(), at("2027-03-27T21:00:00Z"))).toBe(true); // 22:00 CET
    expect(isInQuietHours(qh(), at("2027-03-27T20:59:00Z"))).toBe(false);
    expect(isInQuietHours(qh(), at("2027-03-28T05:00:00Z"))).toBe(false); // 07:00 CEST
    expect(isInQuietHours(qh(), at("2027-03-28T04:59:00Z"))).toBe(true);
  });

  it("ne lève jamais sur des valeurs invalides", () => {
    expect(isInQuietHours({ enabled: true, start: "zz", end: null, timeZone: "Nope" } as never, at("2026-06-15T23:00:00Z"))).toBe(true);
    expect(isInQuietHours(undefined, at("2026-06-15T10:00:00Z"))).toBe(false);
  });
});

describe("nextQuietHoursEnd", () => {
  it("renvoie l'instant de fin de la plage en cours (même nuit, ou lendemain)", () => {
    expect(nextQuietHoursEnd(qh(), at("2026-06-15T22:30:00Z"))).toBe(at("2026-06-16T05:00:00Z")); // 00:30 -> 07:00
    expect(nextQuietHoursEnd(qh(), at("2026-06-15T20:30:00Z"))).toBe(at("2026-06-16T05:00:00Z")); // 22:30 -> 07:00
  });

  it("DST : la fin reste 07:00 locale (nuit de 23 h au printemps, 25 h à l'automne)", () => {
    expect(nextQuietHoursEnd(qh(), at("2027-03-27T21:30:00Z"))).toBe(at("2027-03-28T05:00:00Z"));
    expect(nextQuietHoursEnd(qh(), at("2026-10-24T20:30:00Z"))).toBe(at("2026-10-25T06:00:00Z"));
  });

  it("fuseau Montréal", () => {
    expect(nextQuietHoursEnd(qh({ timeZone: "America/Montreal" }), at("2026-06-16T03:00:00Z"))).toBe(at("2026-06-16T11:00:00Z"));
  });

  it("hors plage, désactivé ou start == end : renvoie l'instant donné", () => {
    expect(nextQuietHoursEnd(qh(), at("2026-06-15T10:00:00Z"))).toBe(at("2026-06-15T10:00:00Z"));
    expect(nextQuietHoursEnd(qh({ enabled: false }), at("2026-06-15T22:00:00Z"))).toBe(at("2026-06-15T22:00:00Z"));
    expect(nextQuietHoursEnd(qh({ end: "22:00" }), at("2026-06-15T22:00:00Z"))).toBe(at("2026-06-15T22:00:00Z"));
  });
});

describe("secondsAfterQuietHours", () => {
  beforeEach(() => {
    jest.useFakeTimers({ now: at("2026-06-15T18:00:00Z") }); // 20:00 Paris
  });
  afterEach(() => jest.useRealTimers());

  it("laisse inchangé un délai qui tombe hors des heures calmes", () => {
    expect(secondsAfterQuietHours(3600, qh())).toBe(3600); // 21:00
  });

  it("décale à la fin des heures calmes un délai qui tombe dedans", () => {
    expect(secondsAfterQuietHours(3 * 3600, qh())).toBe(11 * 3600); // 23:00 -> 07:00 = 11 h après 20:00
  });

  it("sans réglage ou désactivé : inchangé", () => {
    expect(secondsAfterQuietHours(3 * 3600, undefined)).toBe(11 * 3600); // défaut = activé
    expect(secondsAfterQuietHours(3 * 3600, qh({ enabled: false }))).toBe(3 * 3600);
  });
});

describe("conversion HH:MM <-> Date et fuseau de l'appareil", () => {
  it("round-trip", () => {
    expect(dateToHHMM(hhmmToDate("07:05"))).toBe("07:05");
    expect(dateToHHMM(hhmmToDate("22:00"))).toBe("22:00");
    expect(dateToHHMM(new Date(2026, 5, 15, 0, 0))).toBe("00:00");
  });

  it("hhmmToDate invalide : 00:00", () => {
    expect(dateToHHMM(hhmmToDate("zz"))).toBe("00:00");
  });

  it("fuseau de l'appareil, repli Europe/Paris", () => {
    expect(typeof getDeviceTimeZone()).toBe("string");
    const spy = jest.spyOn(Intl, "DateTimeFormat").mockImplementation(() => { throw new Error("no intl"); });
    expect(getDeviceTimeZone()).toBe("Europe/Paris");
    spy.mockRestore();
  });
});
