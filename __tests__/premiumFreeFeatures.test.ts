import { isAlwaysFreeFeature } from "@/contexts/PremiumContext";

// Le SDK RevenueCat n'est pas transformable par Jest : seul le helper pur est testé.
jest.mock("@/services/revenueCatService", () => ({}));
jest.mock("@/contexts/AuthContext", () => ({ useAuth: jest.fn() }));

// Décision Q7 (2026-11-07) : statistiques avancées et courbes OMS gratuites ;
// voix, export PDF et partage restent réellement limités en gratuit.
describe("isAlwaysFreeFeature", () => {
  it("treats advanced stats and OMS curves as free for everyone", () => {
    expect(isAlwaysFreeFeature("advanced_stats")).toBe(true);
    expect(isAlwaysFreeFeature("oms_curves")).toBe(true);
  });

  it("keeps the gated features gated", () => {
    expect(isAlwaysFreeFeature("unlimited_voice")).toBe(false);
    expect(isAlwaysFreeFeature("pdf_export")).toBe(false);
  });

  it("makes sharing free for everyone (2026-11-11)", () => {
    expect(isAlwaysFreeFeature("unlimited_sharing")).toBe(true);
  });
});
