import { getDoc } from "firebase/firestore";
import { Platform } from "react-native";
import { checkForUpdate, getCurrentVersion } from "@/services/appUpdateService";
import { captureServiceError } from "@/utils/errorReporting";

// Mock config/firebase (db is unused but imported by the service)
jest.mock("@/config/firebase", () => ({
  db: {},
}));

// Local override of expo-constants to control the "current" app version
jest.mock("expo-constants", () => ({
  expoConfig: { version: "1.0.0" },
}));

const mockGetDoc = getDoc as jest.Mock;
const mockCapture = captureServiceError as jest.Mock;

function snap(data: Record<string, unknown> | null) {
  return {
    exists: () => data !== null,
    data: () => data,
  };
}

const STORE = {
  ios: "https://apps.apple.com/app/suivi-baby/id123",
  android: "https://play.google.com/store/apps/details?id=com.tesfa.suivibaby",
};

beforeEach(() => {
  jest.clearAllMocks();
  // Default to android — individual tests can override
  Object.defineProperty(Platform, "OS", { get: () => "android", configurable: true });
});

describe("appUpdateService", () => {
  describe("getCurrentVersion", () => {
    it("returns the version from expo config", () => {
      expect(getCurrentVersion()).toBe("1.0.0");
    });
  });

  describe("checkForUpdate", () => {
    it("returns null when the doc does not exist", async () => {
      mockGetDoc.mockResolvedValueOnce(snap(null));
      const result = await checkForUpdate();
      expect(result).toBeNull();
    });

    it("flags updateAvailable=false when current version equals latestVersion", async () => {
      mockGetDoc.mockResolvedValueOnce(
        snap({ latestVersion: "1.0.0", storeUrl: STORE }),
      );
      const result = await checkForUpdate();
      expect(result).toEqual({
        updateAvailable: false,
        forceUpdate: false,
        latestVersion: "1.0.0",
        storeUrl: STORE.android,
      });
    });

    it("flags updateAvailable=true on a patch bump", async () => {
      mockGetDoc.mockResolvedValueOnce(
        snap({ latestVersion: "1.0.1", storeUrl: STORE }),
      );
      const result = await checkForUpdate();
      expect(result?.updateAvailable).toBe(true);
      expect(result?.forceUpdate).toBe(false);
      expect(result?.latestVersion).toBe("1.0.1");
    });

    it("flags updateAvailable=true on a minor bump", async () => {
      mockGetDoc.mockResolvedValueOnce(
        snap({ latestVersion: "1.1.0", storeUrl: STORE }),
      );
      const result = await checkForUpdate();
      expect(result?.updateAvailable).toBe(true);
      expect(result?.forceUpdate).toBe(false);
    });

    it("flags updateAvailable=true on a major bump", async () => {
      mockGetDoc.mockResolvedValueOnce(
        snap({ latestVersion: "2.0.0", storeUrl: STORE }),
      );
      const result = await checkForUpdate();
      expect(result?.updateAvailable).toBe(true);
    });

    it("flags forceUpdate=true when current version is below minVersion", async () => {
      mockGetDoc.mockResolvedValueOnce(
        snap({
          latestVersion: "1.0.1",
          minVersion: "1.0.1",
          storeUrl: STORE,
        }),
      );
      const result = await checkForUpdate();
      expect(result?.updateAvailable).toBe(true);
      expect(result?.forceUpdate).toBe(true);
    });

    it("flags forceUpdate=false when current version meets minVersion", async () => {
      mockGetDoc.mockResolvedValueOnce(
        snap({
          latestVersion: "1.0.1",
          minVersion: "1.0.0",
          storeUrl: STORE,
        }),
      );
      const result = await checkForUpdate();
      expect(result?.forceUpdate).toBe(false);
    });

    it("does not flag updateAvailable for an older latestVersion (regression)", async () => {
      mockGetDoc.mockResolvedValueOnce(
        snap({ latestVersion: "0.9.0", storeUrl: STORE }),
      );
      const result = await checkForUpdate();
      expect(result?.updateAvailable).toBe(false);
    });

    it("returns the iOS store URL on iOS", async () => {
      Object.defineProperty(Platform, "OS", { get: () => "ios", configurable: true });
      mockGetDoc.mockResolvedValueOnce(
        snap({ latestVersion: "1.0.1", storeUrl: STORE }),
      );
      const result = await checkForUpdate();
      expect(result?.storeUrl).toBe(STORE.ios);
    });

    it("returns the Android store URL on Android", async () => {
      mockGetDoc.mockResolvedValueOnce(
        snap({ latestVersion: "1.0.1", storeUrl: STORE }),
      );
      const result = await checkForUpdate();
      expect(result?.storeUrl).toBe(STORE.android);
    });

    it("returns null and reports the error when Firestore throws", async () => {
      const errSpy = jest.spyOn(console, "error").mockImplementation(() => {});
      mockGetDoc.mockRejectedValueOnce(new Error("network down"));
      const result = await checkForUpdate();
      expect(result).toBeNull();
      expect(mockCapture).toHaveBeenCalledWith(
        expect.any(Error),
        expect.objectContaining({
          service: "appUpdate",
          operation: "checkForUpdate",
        }),
      );
      errSpy.mockRestore();
    });

    it("handles missing patch in latestVersion (e.g. '1.1' vs '1.0.0')", async () => {
      mockGetDoc.mockResolvedValueOnce(
        snap({ latestVersion: "1.1", storeUrl: STORE }),
      );
      const result = await checkForUpdate();
      expect(result?.updateAvailable).toBe(true);
    });
  });
});
