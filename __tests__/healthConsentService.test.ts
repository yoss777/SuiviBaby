import { getDoc } from "firebase/firestore";
import {
  HEALTH_CONSENT_VERSION,
  fetchHealthConsentStatus,
  hasValidHealthConsent,
  recordHealthConsent,
  resetHealthConsentCache,
} from "@/services/healthConsentService";

jest.mock("@/config/firebase", () => ({
  auth: { currentUser: { uid: "u1" } },
  db: {},
  functions: {},
}));

const mockCallable = jest.fn();
jest.mock("firebase/functions", () => ({
  httpsCallable: jest.fn(() => mockCallable),
}));

jest.mock("react-native", () => ({ Platform: { OS: "ios" } }));

const snap = (data: unknown) => ({ exists: () => data !== undefined, data: () => data });

describe("healthConsentService", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    resetHealthConsentCache();
  });

  it("exposes the 2.1 consent version", () => {
    expect(HEALTH_CONSENT_VERSION).toBe("2.1");
  });

  describe("hasValidHealthConsent", () => {
    it("accepts a granted consent with the current version", () => {
      expect(
        hasValidHealthConsent({ granted: true, grantedAt: "x", version: "2.1" }),
      ).toBe(true);
    });
    it.each([
      [undefined],
      [null],
      [{ granted: false, grantedAt: "x", version: "2.1" }],
      [{ granted: true, grantedAt: "x", version: "1.0" }],
      [{ granted: true, grantedAt: "x" }],
      ["garbage"],
    ])("rejects %p", (value) => {
      expect(hasValidHealthConsent(value as any)).toBe(false);
    });
  });

  describe("fetchHealthConsentStatus", () => {
    it("returns false when the preference doc is missing", async () => {
      (getDoc as jest.Mock).mockResolvedValue(snap(undefined));
      await expect(fetchHealthConsentStatus("u1")).resolves.toBe(false);
    });

    it("returns false when the version is outdated", async () => {
      (getDoc as jest.Mock).mockResolvedValue(
        snap({ healthDataConsent: { granted: true, grantedAt: "x", version: "1.0" } }),
      );
      await expect(fetchHealthConsentStatus("u1")).resolves.toBe(false);
    });

    it("returns true and caches the result for the uid (single read)", async () => {
      (getDoc as jest.Mock).mockResolvedValue(
        snap({ healthDataConsent: { granted: true, grantedAt: "x", version: "2.1" } }),
      );
      await expect(fetchHealthConsentStatus("u1")).resolves.toBe(true);
      await expect(fetchHealthConsentStatus("u1")).resolves.toBe(true);
      expect(getDoc).toHaveBeenCalledTimes(1);
    });

    it("does not cache a missing consent", async () => {
      (getDoc as jest.Mock).mockResolvedValue(snap(undefined));
      await fetchHealthConsentStatus("u1");
      await fetchHealthConsentStatus("u1");
      expect(getDoc).toHaveBeenCalledTimes(2);
    });

    it("propagates read errors", async () => {
      (getDoc as jest.Mock).mockRejectedValue(new Error("offline"));
      await expect(fetchHealthConsentStatus("u1")).rejects.toThrow("offline");
    });
  });

  describe("recordHealthConsent", () => {
    it("calls the callable with version and platform and marks uid as consented", async () => {
      mockCallable.mockResolvedValue({ data: { version: "2.1" } });
      await recordHealthConsent("u1");
      expect(mockCallable).toHaveBeenCalledWith({ version: "2.1", platform: "ios" });
      // cached: no Firestore read needed afterwards
      await expect(fetchHealthConsentStatus("u1")).resolves.toBe(true);
      expect(getDoc).not.toHaveBeenCalled();
    });

    it("propagates callable failures and does not cache", async () => {
      mockCallable.mockRejectedValue(new Error("network"));
      await expect(recordHealthConsent("u1")).rejects.toThrow("network");
      (getDoc as jest.Mock).mockResolvedValue(snap(undefined));
      await expect(fetchHealthConsentStatus("u1")).resolves.toBe(false);
    });
  });
});
