import {
  FREE_LIMITS,
  getHistoryCutoffDate,
  PAYWALL_MESSAGES,
} from "@/services/premiumGatingService";

describe("premiumGatingService", () => {
  describe("getHistoryCutoffDate", () => {
    it("should return null for premium users", () => {
      expect(getHistoryCutoffDate(true)).toBeNull();
    });

    it("should return date 90 days ago for free users", () => {
      const cutoff = getHistoryCutoffDate(false);
      const expected = new Date();
      expected.setDate(expected.getDate() - FREE_LIMITS.historyDays);

      expect(cutoff).not.toBeNull();
      expect(Math.abs(cutoff!.getTime() - expected.getTime())).toBeLessThan(1000);
    });
  });

  describe("PAYWALL_MESSAGES", () => {
    it("should define messages for all triggers", () => {
      const triggers = [
        "voice_limit",
        "export_limit",
        "history_limit",
        "sharing_limit",
        "advanced_stats",
        "ai_insights",
      ] as const;

      for (const trigger of triggers) {
        expect(PAYWALL_MESSAGES[trigger]).toBeDefined();
        expect(PAYWALL_MESSAGES[trigger].title).toBeTruthy();
        expect(PAYWALL_MESSAGES[trigger].description).toBeTruthy();
        expect(PAYWALL_MESSAGES[trigger].ctaText).toBeTruthy();
      }
    });
  });

  describe("FREE_LIMITS", () => {
    it("should expose the expected static limits", () => {
      expect(FREE_LIMITS.voiceCommandsPerDay).toBe(3);
      expect(FREE_LIMITS.totalPdfExports).toBe(1);
      expect(FREE_LIMITS.historyDays).toBe(90);
      expect(FREE_LIMITS.maxSharedUsers).toBe(2);
    });
  });
});
