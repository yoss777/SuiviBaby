// __tests__/biometricAuthService.test.ts
// T6 — Sprint 1
// Verifies the v2 biometric service no longer touches passwords and that
// the legacy v1 secrets are purged exactly once on startup.

const mockSecureStore = {
  getItemAsync: jest.fn(),
  setItemAsync: jest.fn(),
  deleteItemAsync: jest.fn(),
};

const mockLocalAuth = {
  hasHardwareAsync: jest.fn(),
  isEnrolledAsync: jest.fn(),
  authenticateAsync: jest.fn(),
  supportedAuthenticationTypesAsync: jest.fn(),
  AuthenticationType: { FACIAL_RECOGNITION: 1, FINGERPRINT: 2 },
};

jest.mock("expo-secure-store", () => mockSecureStore);
jest.mock("expo-local-authentication", () => mockLocalAuth);

const LEGACY_KEYS = [
  "samaye_bio_email",
  "samaye_bio_password",
  "samaye_bio_enabled",
];

beforeEach(() => {
  jest.resetModules();
  Object.values(mockSecureStore).forEach((fn) => fn.mockReset());
  Object.values(mockLocalAuth).forEach((fn) => {
    if (typeof fn === "function" && "mockReset" in fn) {
      (fn as jest.Mock).mockReset();
    }
  });
  // Default: success path for SecureStore writes
  mockSecureStore.setItemAsync.mockResolvedValue(undefined);
  mockSecureStore.deleteItemAsync.mockResolvedValue(undefined);
});

describe("purgeLegacyBiometricCredentials", () => {
  it("deletes the three legacy keys when the purge has not run", async () => {
    mockSecureStore.getItemAsync.mockResolvedValue(null);
    const { purgeLegacyBiometricCredentials } = require("../services/biometricAuthService");

    await purgeLegacyBiometricCredentials();

    for (const key of LEGACY_KEYS) {
      expect(mockSecureStore.deleteItemAsync).toHaveBeenCalledWith(key);
    }
    expect(mockSecureStore.setItemAsync).toHaveBeenCalledWith(
      "suivibaby_bio_v1_purged",
      "true",
    );
  });

  it("is a no-op when the purge marker is already set", async () => {
    mockSecureStore.getItemAsync.mockResolvedValue("true");
    const { purgeLegacyBiometricCredentials } = require("../services/biometricAuthService");

    await purgeLegacyBiometricCredentials();

    expect(mockSecureStore.deleteItemAsync).not.toHaveBeenCalled();
  });

  it("never reads the legacy password key", async () => {
    mockSecureStore.getItemAsync.mockResolvedValue(null);
    const { purgeLegacyBiometricCredentials } = require("../services/biometricAuthService");

    await purgeLegacyBiometricCredentials();

    const reads = mockSecureStore.getItemAsync.mock.calls.map(([k]) => k);
    expect(reads).not.toContain("samaye_bio_password");
  });
});

describe("enableBiometric", () => {
  it("stores only the uid and the enabled flag — never a password", async () => {
    const { enableBiometric } = require("../services/biometricAuthService");

    await enableBiometric("uid-123");

    expect(mockSecureStore.setItemAsync).toHaveBeenCalledWith(
      "suivibaby_bio_uid_v2",
      "uid-123",
    );
    expect(mockSecureStore.setItemAsync).toHaveBeenCalledWith(
      "suivibaby_bio_enabled_v2",
      "true",
    );
    const writtenKeys = mockSecureStore.setItemAsync.mock.calls.map(([k]) => k);
    expect(writtenKeys).not.toContain("samaye_bio_password");
    expect(writtenKeys.some((k) => /password/i.test(k))).toBe(false);
  });

  it("ignores empty uids", async () => {
    const { enableBiometric } = require("../services/biometricAuthService");

    await enableBiometric("");

    expect(mockSecureStore.setItemAsync).not.toHaveBeenCalled();
  });
});

describe("unlockWithBiometric", () => {
  it("returns the stored uid on biometric success", async () => {
    mockSecureStore.getItemAsync.mockResolvedValueOnce("uid-123");
    mockLocalAuth.authenticateAsync.mockResolvedValue({ success: true });
    const { unlockWithBiometric } = require("../services/biometricAuthService");

    await expect(unlockWithBiometric()).resolves.toBe("uid-123");
  });

  it("returns null when no uid is stored", async () => {
    mockSecureStore.getItemAsync.mockResolvedValueOnce(null);
    const { unlockWithBiometric } = require("../services/biometricAuthService");

    await expect(unlockWithBiometric()).resolves.toBeNull();
    expect(mockLocalAuth.authenticateAsync).not.toHaveBeenCalled();
  });

  it("returns null when the prompt fails", async () => {
    mockSecureStore.getItemAsync.mockResolvedValueOnce("uid-123");
    mockLocalAuth.authenticateAsync.mockResolvedValue({ success: false });
    const { unlockWithBiometric } = require("../services/biometricAuthService");

    await expect(unlockWithBiometric()).resolves.toBeNull();
  });
});

describe("disableBiometric", () => {
  it("removes only the v2 keys", async () => {
    const { disableBiometric } = require("../services/biometricAuthService");

    await disableBiometric();

    const deleted = mockSecureStore.deleteItemAsync.mock.calls.map(([k]) => k);
    expect(deleted).toEqual(
      expect.arrayContaining(["suivibaby_bio_uid_v2", "suivibaby_bio_enabled_v2"]),
    );
    // Should not touch legacy keys directly here — purge handles those.
    expect(deleted).not.toContain("samaye_bio_password");
  });
});
