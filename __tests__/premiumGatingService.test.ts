import {
  decidePdfExportAccess,
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
        "pdf_export_limit",
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

  describe("pdf_export_limit message", () => {
    it("states the PDF is Premium/Famille and never limits the JSON export", () => {
      const m = PAYWALL_MESSAGES.pdf_export_limit;
      expect(m.title).toBe("Export PDF utilisé");
      expect(m.description).toContain("Premium et Famille");
      expect(m.description).toContain("JSON");
      expect(m.description).toContain("gratuit");
      for (const msg of Object.values(PAYWALL_MESSAGES)) {
        expect(msg.description).not.toMatch(/export.*illimit/i);
      }
    });
  });

  describe("decidePdfExportAccess", () => {
    it("allows users with access regardless of quota", () => {
      expect(decidePdfExportAccess(true, null)).toBe("allow");
      expect(decidePdfExportAccess(true, { allowed: false, remaining: 0 })).toBe("allow");
    });
    it("allows the free trial when one export remains", () => {
      expect(decidePdfExportAccess(false, { allowed: true, remaining: 1 })).toBe("allow_trial");
    });
    it("shows the paywall when the trial is used up", () => {
      expect(decidePdfExportAccess(false, { allowed: false, remaining: 0 })).toBe("paywall");
      expect(decidePdfExportAccess(false, { allowed: true, remaining: 0 })).toBe("paywall");
      expect(decidePdfExportAccess(false, { allowed: true, remaining: null })).toBe("paywall");
    });
    it("errors out when the quota status is unreadable", () => {
      expect(decidePdfExportAccess(false, null)).toBe("error");
      expect(decidePdfExportAccess(false, undefined)).toBe("error");
    });
  });

  describe("FREE_LIMITS", () => {
    it("should expose the expected static limits", () => {
      expect(FREE_LIMITS.voiceCommandsPerDay).toBe(3);
      expect(FREE_LIMITS.historyDays).toBe(90);
      expect(FREE_LIMITS.maxSharedUsers).toBe(2);
    });
  });
});
