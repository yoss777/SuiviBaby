import { resolveEndTime } from "@/components/ui/DateTimeSectionRow";

const d = (day: number, h: number, m = 0) => new Date(2026, 10, day, h, m);
const at = (h: number, m = 0) => new Date(2026, 10, 1, h, m);

describe("heure de fin d'un sommeil", () => {
  it("plus tôt que le début : le lendemain (nuit à cheval sur minuit)", () => {
    expect(resolveEndTime(d(14, 21, 39), at(0, 0), d(14, 21, 40), true)).toEqual(d(15, 0, 0));
    expect(resolveEndTime(d(14, 21, 39), at(6, 19), null, true)).toEqual(d(15, 6, 19));
  });
  it("plus tard le même jour : inchangé", () => {
    expect(resolveEndTime(d(14, 13, 0), at(14, 30), d(14, 13, 1), true)).toEqual(d(14, 14, 30));
  });
  it("date de fin déjà au lendemain : son jour est gardé", () => {
    expect(resolveEndTime(d(14, 21, 39), at(2, 0), d(15, 1, 0), true)).toEqual(d(15, 2, 0));
  });
  it("événement d'un seul jour : au plus tôt 1 min après le début", () => {
    expect(resolveEndTime(d(14, 10, 0), at(9, 0), null, false)).toEqual(d(14, 10, 1));
  });
});
