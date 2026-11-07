/* global describe, it, expect */
// Heures calmes : helpers purs (validation des valeurs stockées, heure locale
// dans le fuseau de l'utilisateur, plage qui passe minuit, changement d'heure).
const {
  DEFAULT_QUIET_HOURS,
  normalizeQuietHours,
  isInQuietHours,
} = require("../lib/quietHours");

const at = (iso) => Date.parse(iso);

describe("normalizeQuietHours", () => {
  it("applique 22:00-07:00 Europe/Paris activé quand le champ manque", () => {
    for (const raw of [undefined, null, {}, "x", 42, []]) {
      expect(normalizeQuietHours(raw)).toEqual({ enabled: true, start: "22:00", end: "07:00", timeZone: "Europe/Paris" });
    }
    expect(DEFAULT_QUIET_HOURS).toEqual({ enabled: true, start: "22:00", end: "07:00", timeZone: "Europe/Paris" });
  });

  it("garde les valeurs valides", () => {
    expect(normalizeQuietHours({ enabled: false, start: "21:30", end: "06:15", timeZone: "America/Montreal" }))
      .toEqual({ enabled: false, start: "21:30", end: "06:15", timeZone: "America/Montreal" });
  });

  it("retombe sur les valeurs par défaut champ par champ si une valeur est invalide", () => {
    expect(normalizeQuietHours({ start: "25:00", end: "7h", timeZone: "Mars/Olympus" })).toEqual(DEFAULT_QUIET_HOURS);
    expect(normalizeQuietHours({ start: "23:00", end: "24:00", timeZone: "" }))
      .toEqual({ enabled: true, start: "23:00", end: "07:00", timeZone: "Europe/Paris" });
    expect(normalizeQuietHours({ start: 2200, end: null, timeZone: 5, enabled: "non" })).toEqual(DEFAULT_QUIET_HOURS);
    expect(normalizeQuietHours({ start: "22:60" }).start).toBe("22:00");
  });
});

describe("isInQuietHours", () => {
  const qh = (over = {}) => ({ enabled: true, start: "22:00", end: "07:00", timeZone: "Europe/Paris", ...over });

  it("plage qui passe minuit : dedans la nuit, dehors le jour, bornes début inclus / fin exclue", () => {
    // Été : Paris = UTC+2
    expect(isInQuietHours(qh(), at("2026-06-15T20:00:00Z"))).toBe(true); // 22:00 pile
    expect(isInQuietHours(qh(), at("2026-06-15T19:59:00Z"))).toBe(false); // 21:59
    expect(isInQuietHours(qh(), at("2026-06-15T22:30:00Z"))).toBe(true); // 00:30
    expect(isInQuietHours(qh(), at("2026-06-16T04:59:00Z"))).toBe(true); // 06:59
    expect(isInQuietHours(qh(), at("2026-06-16T05:00:00Z"))).toBe(false); // 07:00 pile
    expect(isInQuietHours(qh(), at("2026-06-15T10:00:00Z"))).toBe(false); // midi
  });

  it("plage dans la même journée", () => {
    const q = qh({ start: "13:00", end: "15:00" });
    expect(isInQuietHours(q, at("2026-06-15T11:00:00Z"))).toBe(true); // 13:00
    expect(isInQuietHours(q, at("2026-06-15T12:59:00Z"))).toBe(true);
    expect(isInQuietHours(q, at("2026-06-15T13:00:00Z"))).toBe(false); // 15:00
    expect(isInQuietHours(q, at("2026-06-15T10:59:00Z"))).toBe(false);
  });

  it("désactivé ou début == fin : jamais d'heures calmes", () => {
    expect(isInQuietHours(qh({ enabled: false }), at("2026-06-15T22:30:00Z"))).toBe(false);
    expect(isInQuietHours(qh({ start: "22:00", end: "22:00" }), at("2026-06-15T22:30:00Z"))).toBe(false);
    expect(isInQuietHours(qh({ start: "00:00", end: "00:00" }), at("2026-06-15T10:00:00Z"))).toBe(false);
  });

  it("utilise le fuseau de l'utilisateur (America/Montreal = UTC-4 en été)", () => {
    const q = qh({ timeZone: "America/Montreal" });
    expect(isInQuietHours(q, at("2026-06-15T10:00:00Z"))).toBe(true); // 06:00 à Montréal
    expect(isInQuietHours(q, at("2026-06-15T11:00:00Z"))).toBe(false); // 07:00
    expect(isInQuietHours(q, at("2026-06-16T02:00:00Z"))).toBe(true); // 22:00
    expect(isInQuietHours(q, at("2026-06-15T20:00:00Z"))).toBe(false); // 16:00 (22:00 Paris)
  });

  it("changement d'heure Europe/Paris : l'heure locale suit l'offset réel", () => {
    // Passage à l'heure d'été le 2027-03-28 (02:00 -> 03:00) : 01:30 CET = 00:30Z.
    const q = qh({ start: "02:30", end: "03:30" });
    expect(isInQuietHours(q, at("2027-03-28T00:30:00Z"))).toBe(false); // 01:30 CET
    expect(isInQuietHours(q, at("2027-03-28T01:00:00Z"))).toBe(true); // 03:00 CEST : dans 02:30-03:30 (02:30 n'a pas existé)
    expect(isInQuietHours(q, at("2027-03-28T01:30:00Z"))).toBe(false); // 03:30 CEST : fin exclue
    // Nuit avant le changement : 22:00 CET = 21:00Z ; nuit après : 22:00 CEST = 20:00Z.
    const night = qh();
    expect(isInQuietHours(night, at("2027-03-27T21:00:00Z"))).toBe(true);
    expect(isInQuietHours(night, at("2027-03-27T20:30:00Z"))).toBe(false); // 21:30 CET
    expect(isInQuietHours(night, at("2027-03-28T20:00:00Z"))).toBe(true);
    expect(isInQuietHours(night, at("2027-03-28T19:30:00Z"))).toBe(false); // 21:30 CEST
    // 07:00 locale le matin du changement = 05:00Z (CEST) : fin de plage.
    expect(isInQuietHours(night, at("2027-03-28T05:00:00Z"))).toBe(false);
    expect(isInQuietHours(night, at("2027-03-28T04:59:00Z"))).toBe(true);
  });

  it("changement d'heure d'automne (retour à l'heure d'hiver)", () => {
    // 2026-10-25 : 03:00 CEST -> 02:00 CET. 02:30 existe deux fois (00:30Z et 01:30Z).
    const night = qh();
    expect(isInQuietHours(night, at("2026-10-25T00:30:00Z"))).toBe(true);
    expect(isInQuietHours(night, at("2026-10-25T01:30:00Z"))).toBe(true);
    expect(isInQuietHours(night, at("2026-10-25T05:59:00Z"))).toBe(true); // 06:59 CET
    expect(isInQuietHours(night, at("2026-10-25T06:00:00Z"))).toBe(false); // 07:00 CET
  });

  it("minuit est géré (heure 24 des anciens moteurs)", () => {
    expect(isInQuietHours(qh({ timeZone: "UTC" }), at("2026-06-15T00:00:00Z"))).toBe(true);
  });

  it("valeurs invalides en entrée : ne lève jamais", () => {
    expect(() => isInQuietHours({ enabled: true, start: "zz", end: null, timeZone: "Nope/Nope" }, at("2026-06-15T23:00:00Z"))).not.toThrow();
    expect(isInQuietHours({ start: "zz", end: null, timeZone: "Nope/Nope" }, at("2026-06-15T23:00:00Z"))).toBe(true); // défaut Paris 01:00
    expect(isInQuietHours(undefined, at("2026-06-15T10:00:00Z"))).toBe(false);
  });
});
