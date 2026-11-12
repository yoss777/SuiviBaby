import {
  decidePdfExportAccess,
  FREE_LIMITS,
  PAYWALL_MESSAGES,
  PREMIUM_LIMITS,
} from "@/services/premiumGatingService";

describe("premiumGatingService", () => {
  describe("PAYWALL_MESSAGES", () => {
    it("should define messages for all triggers", () => {
      const triggers = ["voice_limit", "pdf_export_limit"] as const;

      for (const trigger of triggers) {
        expect(PAYWALL_MESSAGES[trigger]).toBeDefined();
        expect(PAYWALL_MESSAGES[trigger].title).toBeTruthy();
        expect(PAYWALL_MESSAGES[trigger].description).toBeTruthy();
        expect(PAYWALL_MESSAGES[trigger].ctaText).toBeTruthy();
      }
    });

    // Décision Q7 (2026-11-07) : Famille n'est plus proposée, statistiques
    // avancées et courbes OMS sont gratuites.
    it("never promotes the Famille offer, advanced stats or OMS curves", () => {
      expect(Object.keys(PAYWALL_MESSAGES)).not.toContain("advanced_stats");
      for (const msg of Object.values(PAYWALL_MESSAGES)) {
        const text = `${msg.title} ${msg.description} ${msg.ctaText}`;
        expect(text).not.toMatch(/famille/i);
        expect(text).not.toMatch(/OMS/);
        expect(text).not.toMatch(/statistiques avancées/i);
      }
    });

    // 2026-11-11 : partage illimité pour tous, voix Premium plafonnée à 50/jour,
    // historique non limité, pas d'insights IA.
    it("only advertises limits that are really enforced", () => {
      expect(Object.keys(PAYWALL_MESSAGES).sort()).toEqual(["pdf_export_limit", "voice_limit"]);
      for (const msg of Object.values(PAYWALL_MESSAGES)) {
        const text = `${msg.title} ${msg.description} ${msg.ctaText}`;
        expect(text).not.toMatch(/illimit/i);
        expect(text).not.toMatch(/insights/i);
      }
    });

    it("voice_limit states the honest Premium allowance", () => {
      const m = PAYWALL_MESSAGES.voice_limit;
      expect(m.description).toContain("3 commandes vocales");
      expect(m.description).toContain("jusqu'à 50");
      expect(m.ctaText).toBe("Passer à Premium");
    });
  });

  describe("pdf_export_limit message", () => {
    it("states the PDF is Premium and never limits the JSON export", () => {
      const m = PAYWALL_MESSAGES.pdf_export_limit;
      expect(m.title).toBe("Export PDF utilisé");
      expect(m.description).toContain("Premium");
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
      expect(PREMIUM_LIMITS.voiceCommandsPerDay).toBe(50);
    });
  });
});
