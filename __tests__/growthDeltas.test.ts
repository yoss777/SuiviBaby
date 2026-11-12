import { computeGrowthDeltas, formatGrowthDelta } from "@/utils/growthDeltas";

const toDate = (v: any) => (v instanceof Date ? v : new Date(v));

describe("growthDeltas", () => {
  it("compares each metric with the previous measure of the same metric", () => {
    const map = computeGrowthDeltas(
      [
        { id: "c", date: "2026-03-01", poidsKg: 5.1, tailleCm: 58 },
        { id: "a", date: "2026-01-01", poidsKg: 4.2, tailleCm: 54, teteCm: 37 },
        { id: "b", date: "2026-02-01", poidsKg: 4.8 },
      ],
      toDate,
    );
    expect(map.has("a")).toBe(false); // first measure: nothing to compare
    expect(map.get("b")?.poidsKg).toBeCloseTo(0.6);
    expect(map.get("b")?.tailleCm).toBeUndefined();
    expect(map.get("c")?.poidsKg).toBeCloseTo(0.3);
    expect(map.get("c")?.tailleCm).toBeCloseTo(4); // vs January height (last known)
    expect(map.get("c")?.teteCm).toBeUndefined();
  });

  it("formats deltas in French with a neutral sign", () => {
    expect(formatGrowthDelta(0.25)).toBe("+0,3");
    expect(formatGrowthDelta(-0.1)).toBe("−0,1");
    expect(formatGrowthDelta(0.02)).toBe("=");
  });
});
