// Minutes « à la pendule » : l'Accueil et le widget passent à « 1 min » ensemble.
import { clockMinutesBetween } from "@/utils/clockMinutes";

const at = (h: number, m: number, s = 0) => new Date(2026, 10, 16, h, m, s).getTime();

it("secondes du début ignorées : 10:00:40 → 0 min à 10:00:59, 1 min à 10:01:00", () => {
  expect(clockMinutesBetween(at(10, 0, 40), at(10, 0, 59))).toBe(0);
  expect(clockMinutesBetween(at(10, 0, 40), at(10, 1, 0))).toBe(1);
  expect(clockMinutesBetween(at(10, 0, 40), at(11, 8, 30))).toBe(68);
});

it("jamais négatif ni NaN (début dans le futur, date invalide)", () => {
  expect(clockMinutesBetween(at(10, 5), at(10, 0))).toBe(0);
  expect(clockMinutesBetween(NaN, at(10, 0))).toBe(0);
});

it("à cheval sur minuit : 23:59:30 → 00:01:10 = 2 min", () => {
  expect(clockMinutesBetween(at(23, 59, 30), new Date(2026, 10, 17, 0, 1, 10).getTime())).toBe(2);
});
