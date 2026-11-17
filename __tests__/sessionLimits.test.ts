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
