import { isNapHour } from "@/utils/sleepPeriod";

it("nuit de 19:00 à 8:00, sieste le reste du temps", () => {
  const at = (h: number, m = 0) => new Date(2026, 10, 14, h, m);
  expect(isNapHour(at(7, 59))).toBe(false);
  expect(isNapHour(at(8))).toBe(true);
  expect(isNapHour(at(14))).toBe(true);
  expect(isNapHour(at(18, 59))).toBe(true);
  expect(isNapHour(at(19))).toBe(false);
  expect(isNapHour(at(23))).toBe(false);
});
