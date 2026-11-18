import { defaultEndFor, exceedsMaxSession } from "@/utils/sessionLimits";

const H = 3600_000;
const T = Date.UTC(2026, 10, 17, 12, 0);

it("24 h ou plus : refusé ; moins : accepté", () => {
  expect(exceedsMaxSession(new Date(T), new Date(T + 24 * H))).toBe(true);
  expect(exceedsMaxSession(new Date(T), new Date(T + 23 * H + 59 * 60_000))).toBe(false);
});

it("fin proposée : maintenant, jamais 24 h ou plus après le début", () => {
  expect(defaultEndFor(new Date(T - 2 * H), T).getTime()).toBe(T);
  expect(exceedsMaxSession(new Date(T - 46 * H), defaultEndFor(new Date(T - 46 * H), T))).toBe(false);
});

import { unusualSessionMessage } from "@/utils/sessionLimits";

it("durée inhabituelle : sieste > 6 h, nuit > 15 h, balade > 9 h (< 24 h) ; sinon rien", () => {
  const s = new Date(T);
  expect(unusualSessionMessage("nap", s, new Date(T + 7 * H + 10 * 60_000))).toBe(
    "7 h 10 pour une sieste, c'est inhabituel : est-ce une erreur de date ou d'heure ?",
  );
  expect(unusualSessionMessage("nap", s, new Date(T + 5 * H))).toBeNull();
  expect(unusualSessionMessage("night", s, new Date(T + 11 * H))).toBeNull();
  expect(unusualSessionMessage("night", s, new Date(T + 16 * H))).toContain("une nuit");
  expect(unusualSessionMessage("walk", s, new Date(T + 10 * H))).toContain("une balade");
  // 24 h ou plus : refusé ailleurs (exceedsMaxSession), pas ici.
  expect(unusualSessionMessage("nap", s, new Date(T + 25 * H))).toBeNull();
  // En cours : jusqu'à maintenant.
  expect(unusualSessionMessage("nap", new Date(T - 8 * H), null, T)).toContain("8 h");
});

import { lateNapMessage, napCrossesMidnight } from "@/utils/sessionLimits";

it("sieste : jamais le lendemain ; démarrée entre 20:00 et 5:00 → plutôt une nuit", () => {
  const start = new Date(2026, 10, 16, 14, 0);
  expect(napCrossesMidnight(start, new Date(2026, 10, 16, 16, 0))).toBe(false);
  expect(napCrossesMidnight(start, new Date(2026, 10, 17, 0, 30))).toBe(true);
  expect(lateNapMessage(new Date(2026, 10, 16, 14, 0))).toBeNull();
  expect(lateNapMessage(new Date(2026, 10, 16, 22, 5))).toBe("Une sieste à 22:05 ? À cette heure-ci, c'est plutôt une nuit.");
  expect(lateNapMessage(new Date(2026, 10, 17, 4, 30))).toContain("04:30");
});
