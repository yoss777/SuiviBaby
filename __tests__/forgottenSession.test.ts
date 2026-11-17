import { suggestForgottenEnd } from "@/utils/forgottenSession";

const H = 3600_000;
const NOW = Date.UTC(2026, 10, 17, 19, 0);

it("pas oubliée : rien (le formulaire reste « en cours »)", () => {
  expect(suggestForgottenEnd(new Date(NOW - 5 * H), "nap", NOW)).toBeNull();
  expect(suggestForgottenEnd(new Date(NOW - 14 * H), "night", NOW)).toBeNull();
  expect(suggestForgottenEnd(new Date(NOW - 8 * H), "walk", NOW)).toBeNull();
});

it("oubliée : début + durée typique (sieste 1 h 30, nuit 10 h, balade 1 h)", () => {
  const start = new Date(NOW - 46 * H);
  expect(suggestForgottenEnd(start, "nap", NOW)!.getTime()).toBe(start.getTime() + 1.5 * H);
  expect(suggestForgottenEnd(start, "night", NOW)!.getTime()).toBe(start.getTime() + 10 * H);
  expect(suggestForgottenEnd(new Date(NOW - 10 * H), "walk", NOW)!.getTime()).toBe(NOW - 9 * H);
});
