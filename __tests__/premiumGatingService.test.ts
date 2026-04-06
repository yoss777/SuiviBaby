import AsyncStorage from "@react-native-async-storage/async-storage";

// Mock config/firebase (required by transitive imports)
jest.mock("@/config/firebase", () => ({
  auth: { currentUser: { uid: "test-uid" } },
  db: {},
  functions: {},
}));

import {
  FREE_LIMITS,
  getVoiceCommandCount,
  incrementVoiceCommand,
  getRemainingVoiceCommands,
  getPdfExportCount,
  incrementPdfExport,
  getRemainingPdfExports,
  getHistoryCutoffDate,
  PAYWALL_MESSAGES,
} from "@/services/premiumGatingService";

beforeEach(() => {
  jest.clearAllMocks();
});

describe("premiumGatingService", () => {
  // ============================================
  // VOICE COMMANDS (daily counter)
  // ============================================

  describe("getVoiceCommandCount", () => {
    it("should return 0 on a new day (reset counter)", async () => {
      const today = new Date().toISOString().slice(0, 10);
      (AsyncStorage.getItem as jest.Mock).mockResolvedValueOnce("2025-01-01"); // different date

      const count = await getVoiceCommandCount();

      expect(count).toBe(0);
      expect(AsyncStorage.setItem).toHaveBeenCalledWith(
        "@suivibaby_voice_date",
        today,
      );
      expect(AsyncStorage.setItem).toHaveBeenCalledWith(
        "@suivibaby_voice_count",
        "0",
      );
    });

    it("should return stored count on same day", async () => {
      const today = new Date().toISOString().slice(0, 10);
      (AsyncStorage.getItem as jest.Mock)
        .mockResolvedValueOnce(today) // date matches
        .mockResolvedValueOnce("2"); // count

      const count = await getVoiceCommandCount();

      expect(count).toBe(2);
    });

    it("should return 0 if no stored count on same day", async () => {
      const today = new Date().toISOString().slice(0, 10);
      (AsyncStorage.getItem as jest.Mock)
        .mockResolvedValueOnce(today)
        .mockResolvedValueOnce(null);

      const count = await getVoiceCommandCount();

      expect(count).toBe(0);
    });

    it("should return 0 on AsyncStorage error", async () => {
      (AsyncStorage.getItem as jest.Mock).mockRejectedValueOnce(
        new Error("Storage error"),
      );

      const count = await getVoiceCommandCount();

      expect(count).toBe(0);
    });
  });

  describe("incrementVoiceCommand", () => {
    it("should allow increment when under limit", async () => {
      const today = new Date().toISOString().slice(0, 10);
      (AsyncStorage.getItem as jest.Mock)
        .mockResolvedValueOnce(today)
        .mockResolvedValueOnce("1");

      const allowed = await incrementVoiceCommand();

      expect(allowed).toBe(true);
      expect(AsyncStorage.setItem).toHaveBeenCalledWith(
        "@suivibaby_voice_count",
        "2",
      );
    });

    it("should deny increment when at limit", async () => {
      const today = new Date().toISOString().slice(0, 10);
      (AsyncStorage.getItem as jest.Mock)
        .mockResolvedValueOnce(today)
        .mockResolvedValueOnce(String(FREE_LIMITS.voiceCommandsPerDay));

      const allowed = await incrementVoiceCommand();

      expect(allowed).toBe(false);
    });

    it("should allow on AsyncStorage write error (permissive default)", async () => {
      const today = new Date().toISOString().slice(0, 10);
      (AsyncStorage.getItem as jest.Mock)
        .mockResolvedValueOnce(today)
        .mockResolvedValueOnce("0");
      (AsyncStorage.setItem as jest.Mock).mockRejectedValueOnce(
        new Error("Write error"),
      );

      const allowed = await incrementVoiceCommand();

      expect(allowed).toBe(true);
    });
  });

  describe("getRemainingVoiceCommands", () => {
    it("should return max when count is 0", async () => {
      const today = new Date().toISOString().slice(0, 10);
      (AsyncStorage.getItem as jest.Mock)
        .mockResolvedValueOnce(today)
        .mockResolvedValueOnce("0");

      const remaining = await getRemainingVoiceCommands();

      expect(remaining).toBe(FREE_LIMITS.voiceCommandsPerDay);
    });

    it("should return 0 when at limit", async () => {
      const today = new Date().toISOString().slice(0, 10);
      (AsyncStorage.getItem as jest.Mock)
        .mockResolvedValueOnce(today)
        .mockResolvedValueOnce(String(FREE_LIMITS.voiceCommandsPerDay));

      const remaining = await getRemainingVoiceCommands();

      expect(remaining).toBe(0);
    });

    it("should never return negative", async () => {
      const today = new Date().toISOString().slice(0, 10);
      (AsyncStorage.getItem as jest.Mock)
        .mockResolvedValueOnce(today)
        .mockResolvedValueOnce("999"); // way over limit

      const remaining = await getRemainingVoiceCommands();

      expect(remaining).toBe(0);
    });
  });

  // ============================================
  // PDF EXPORTS (lifetime counter)
  // ============================================

  describe("getPdfExportCount", () => {
    it("should return 0 when no exports stored", async () => {
      (AsyncStorage.getItem as jest.Mock).mockResolvedValueOnce(null);

      const count = await getPdfExportCount();

      expect(count).toBe(0);
    });

    it("should return stored count", async () => {
      (AsyncStorage.getItem as jest.Mock).mockResolvedValueOnce("1");

      const count = await getPdfExportCount();

      expect(count).toBe(1);
    });

    it("should return 0 on error", async () => {
      (AsyncStorage.getItem as jest.Mock).mockRejectedValueOnce(
        new Error("fail"),
      );

      const count = await getPdfExportCount();

      expect(count).toBe(0);
    });
  });

  describe("incrementPdfExport", () => {
    it("should allow first export", async () => {
      (AsyncStorage.getItem as jest.Mock).mockResolvedValueOnce(null);

      const allowed = await incrementPdfExport();

      expect(allowed).toBe(true);
      expect(AsyncStorage.setItem).toHaveBeenCalledWith(
        "@suivibaby_export_count",
        "1",
      );
    });

    it("should deny when lifetime limit reached", async () => {
      (AsyncStorage.getItem as jest.Mock).mockResolvedValueOnce(
        String(FREE_LIMITS.totalPdfExports),
      );

      const allowed = await incrementPdfExport();

      expect(allowed).toBe(false);
      expect(AsyncStorage.setItem).not.toHaveBeenCalled();
    });

    it("should allow on write error (permissive default)", async () => {
      (AsyncStorage.getItem as jest.Mock).mockResolvedValueOnce("0");
      (AsyncStorage.setItem as jest.Mock).mockRejectedValueOnce(
        new Error("fail"),
      );

      const allowed = await incrementPdfExport();

      expect(allowed).toBe(true);
    });
  });

  describe("getRemainingPdfExports", () => {
    it("should return 1 when no exports used", async () => {
      (AsyncStorage.getItem as jest.Mock).mockResolvedValueOnce(null);

      const remaining = await getRemainingPdfExports();

      expect(remaining).toBe(FREE_LIMITS.totalPdfExports);
    });

    it("should return 0 when limit reached", async () => {
      (AsyncStorage.getItem as jest.Mock).mockResolvedValueOnce(
        String(FREE_LIMITS.totalPdfExports),
      );

      const remaining = await getRemainingPdfExports();

      expect(remaining).toBe(0);
    });
  });

  // ============================================
  // HISTORY FILTER
  // ============================================

  describe("getHistoryCutoffDate", () => {
    it("should return null for premium users (no limit)", () => {
      const cutoff = getHistoryCutoffDate(true);

      expect(cutoff).toBeNull();
    });

    it("should return date 90 days ago for free users", () => {
      const cutoff = getHistoryCutoffDate(false);
      const expected = new Date();
      expected.setDate(expected.getDate() - FREE_LIMITS.historyDays);

      expect(cutoff).not.toBeNull();
      // Allow 1 second tolerance
      expect(Math.abs(cutoff!.getTime() - expected.getTime())).toBeLessThan(
        1000,
      );
    });
  });

  // ============================================
  // PAYWALL MESSAGES
  // ============================================

  describe("PAYWALL_MESSAGES", () => {
    it("should have messages for all triggers", () => {
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

  // ============================================
  // FREE_LIMITS constants
  // ============================================

  describe("FREE_LIMITS", () => {
    it("should have correct default values", () => {
      expect(FREE_LIMITS.voiceCommandsPerDay).toBe(3);
      expect(FREE_LIMITS.totalPdfExports).toBe(1);
      expect(FREE_LIMITS.historyDays).toBe(90);
      expect(FREE_LIMITS.maxSharedUsers).toBe(2);
    });
  });
});
