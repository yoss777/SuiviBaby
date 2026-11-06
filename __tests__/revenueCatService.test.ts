import { Platform } from "react-native";

// Mock react-native-purchases
const mockPurchases = {
  configure: jest.fn(),
  setLogLevel: jest.fn(),
  logIn: jest.fn(),
  logOut: jest.fn(),
  isAnonymous: jest.fn(),
  getCustomerInfo: jest.fn(),
  getOfferings: jest.fn(),
  purchasePackage: jest.fn(),
  restorePurchases: jest.fn(),
  addCustomerInfoUpdateListener: jest.fn(),
  removeCustomerInfoUpdateListener: jest.fn(),
};

jest.mock("react-native-purchases", () => ({
  __esModule: true,
  default: mockPurchases,
  LOG_LEVEL: { DEBUG: 4 },
}));

// Mock config/firebase
jest.mock("@/config/firebase", () => ({
  auth: { currentUser: { uid: "test-uid" } },
  db: {},
  functions: {},
}));

// Mock errorReporting
jest.mock("@/utils/errorReporting", () => ({
  captureServiceError: jest.fn(),
}));

// Helper: create a mock CustomerInfo with given entitlements
function mockCustomerInfo(
  activeEntitlements: Record<string, {
    isActive: boolean;
    periodType?: string;
    willRenew?: boolean;
    productIdentifier?: string;
  }> = {},
) {
  return {
    entitlements: { active: activeEntitlements },
  } as any;
}

// We need to reset the module state between tests (singleton isInitialized)
let revenueCatService: typeof import("@/services/revenueCatService");

beforeEach(() => {
  jest.clearAllMocks();
  jest.resetModules();
  // Re-import to reset isInitialized singleton
  revenueCatService = require("@/services/revenueCatService");
});

describe("revenueCatService", () => {
  // ============================================
  // INIT
  // ============================================

  describe("initRevenueCat", () => {
    it("should configure SDK with test key in dev mode", async () => {
      await revenueCatService.initRevenueCat();

      expect(mockPurchases.configure).toHaveBeenCalledWith(
        expect.objectContaining({
          apiKey: "test_BHbHbhlPMXdgMEKwlhISZchIPkO",
        }),
      );
    });

    it("should pass userId if provided", async () => {
      await revenueCatService.initRevenueCat("user-123");

      expect(mockPurchases.configure).toHaveBeenCalledWith(
        expect.objectContaining({
          appUserID: "user-123",
        }),
      );
    });

    it("should be a singleton — second call does nothing", async () => {
      await revenueCatService.initRevenueCat();
      await revenueCatService.initRevenueCat();

      expect(mockPurchases.configure).toHaveBeenCalledTimes(1);
    });

    it("should handle init failure gracefully", async () => {
      mockPurchases.configure.mockImplementationOnce(() => {
        throw new Error("SDK init failed");
      });

      await revenueCatService.initRevenueCat();

      // Should not throw, and subsequent calls should retry
      expect(mockPurchases.configure).toHaveBeenCalledTimes(1);
    });
  });

  // ============================================
  // LOGIN / LOGOUT
  // ============================================

  describe("loginRevenueCat", () => {
    it("should return null if not initialized", async () => {
      // Don't call init
      const result = await revenueCatService.loginRevenueCat("user-123");

      expect(result).toBeNull();
      expect(mockPurchases.logIn).not.toHaveBeenCalled();
    });

    it("should return customerInfo on success", async () => {
      await revenueCatService.initRevenueCat();
      const info = mockCustomerInfo();
      mockPurchases.logIn.mockResolvedValueOnce({ customerInfo: info });

      const result = await revenueCatService.loginRevenueCat("user-123");

      expect(result).toBe(info);
      expect(mockPurchases.logIn).toHaveBeenCalledWith("user-123");
    });

    it("should return null on error", async () => {
      await revenueCatService.initRevenueCat();
      mockPurchases.logIn.mockRejectedValueOnce(new Error("Login failed"));

      const result = await revenueCatService.loginRevenueCat("user-123");

      expect(result).toBeNull();
    });
  });

  describe("logoutRevenueCat", () => {
    it("should do nothing if not initialized", async () => {
      await revenueCatService.logoutRevenueCat();

      expect(mockPurchases.logOut).not.toHaveBeenCalled();
    });

    it("should call Purchases.logOut when initialized and user is identified", async () => {
      await revenueCatService.initRevenueCat();
      mockPurchases.isAnonymous.mockResolvedValueOnce(false);

      await revenueCatService.logoutRevenueCat();

      expect(mockPurchases.logOut).toHaveBeenCalledTimes(1);
    });

    it("should skip logOut when current user is already anonymous", async () => {
      await revenueCatService.initRevenueCat();
      mockPurchases.isAnonymous.mockResolvedValueOnce(true);

      await revenueCatService.logoutRevenueCat();

      expect(mockPurchases.logOut).not.toHaveBeenCalled();
    });

    it("should not throw on error", async () => {
      await revenueCatService.initRevenueCat();
      mockPurchases.isAnonymous.mockResolvedValueOnce(false);
      mockPurchases.logOut.mockRejectedValueOnce(new Error("Logout failed"));

      await expect(
        revenueCatService.logoutRevenueCat(),
      ).resolves.toBeUndefined();
    });
  });

  // ============================================
  // CUSTOMER INFO
  // ============================================

  describe("getCustomerInfo", () => {
    it("should return null if not initialized", async () => {
      const result = await revenueCatService.getCustomerInfo();

      expect(result).toBeNull();
    });

    it("should return customer info when initialized", async () => {
      await revenueCatService.initRevenueCat();
      const info = mockCustomerInfo();
      mockPurchases.getCustomerInfo.mockResolvedValueOnce(info);

      const result = await revenueCatService.getCustomerInfo();

      expect(result).toBe(info);
    });

    it("should return null on error", async () => {
      await revenueCatService.initRevenueCat();
      mockPurchases.getCustomerInfo.mockRejectedValueOnce(new Error("fail"));

      const result = await revenueCatService.getCustomerInfo();

      expect(result).toBeNull();
    });
  });

  // ============================================
  // ENTITLEMENT CHECKS
  // ============================================

  describe("hasEntitlement", () => {
    it("should return true for active entitlement", () => {
      const info = mockCustomerInfo({
        premium: { isActive: true },
      });

      expect(revenueCatService.hasEntitlement(info, "premium")).toBe(true);
    });

    it("should return false for missing entitlement", () => {
      const info = mockCustomerInfo({});

      expect(revenueCatService.hasEntitlement(info, "premium")).toBe(false);
    });

    it("should return false for inactive entitlement", () => {
      const info = mockCustomerInfo({
        premium: { isActive: false },
      });

      expect(revenueCatService.hasEntitlement(info, "premium")).toBe(false);
    });
  });

  // ============================================
  // TIER DETECTION
  // ============================================

  describe("getTierFromCustomerInfo", () => {
    it("should return 'free' when no entitlements", () => {
      const info = mockCustomerInfo({});

      expect(revenueCatService.getTierFromCustomerInfo(info)).toBe("free");
    });

    it("should return 'premium' with premium entitlement", () => {
      const info = mockCustomerInfo({
        premium: { isActive: true },
      });

      expect(revenueCatService.getTierFromCustomerInfo(info)).toBe("premium");
    });

    it("should return 'family' with family entitlement", () => {
      const info = mockCustomerInfo({
        family: { isActive: true },
      });

      expect(revenueCatService.getTierFromCustomerInfo(info)).toBe("family");
    });

    it("should prioritize family over premium", () => {
      const info = mockCustomerInfo({
        premium: { isActive: true },
        family: { isActive: true },
      });

      expect(revenueCatService.getTierFromCustomerInfo(info)).toBe("family");
    });
  });

  // ============================================
  // STATUS DETECTION
  // ============================================

  describe("getStatusFromCustomerInfo", () => {
    it("should return 'expired' when no active entitlements", () => {
      const info = mockCustomerInfo({});

      expect(revenueCatService.getStatusFromCustomerInfo(info)).toBe("expired");
    });

    it("should return 'trial' for trial period", () => {
      const info = mockCustomerInfo({
        premium: { isActive: true, periodType: "TRIAL", willRenew: true },
      });

      expect(revenueCatService.getStatusFromCustomerInfo(info)).toBe("trial");
    });

    it("should return 'cancelled' when willRenew is false", () => {
      const info = mockCustomerInfo({
        premium: {
          isActive: true,
          periodType: "NORMAL",
          willRenew: false,
        },
      });

      expect(revenueCatService.getStatusFromCustomerInfo(info)).toBe(
        "cancelled",
      );
    });

    it("should return 'active' for normal active subscription", () => {
      const info = mockCustomerInfo({
        premium: {
          isActive: true,
          periodType: "NORMAL",
          willRenew: true,
        },
      });

      expect(revenueCatService.getStatusFromCustomerInfo(info)).toBe("active");
    });

    it("should check family entitlement if premium not present", () => {
      const info = mockCustomerInfo({
        family: { isActive: true, periodType: "TRIAL", willRenew: true },
      });

      expect(revenueCatService.getStatusFromCustomerInfo(info)).toBe("trial");
    });
  });

  // ============================================
  // BILLING PERIOD
  // ============================================

  describe("getBillingPeriodFromCustomerInfo", () => {
    it("should return 'unknown' when no entitlements", () => {
      const info = mockCustomerInfo({});

      expect(revenueCatService.getBillingPeriodFromCustomerInfo(info)).toBe(
        "unknown",
      );
    });

    it("should detect monthly from product ID", () => {
      const info = mockCustomerInfo({
        premium: {
          isActive: true,
          productIdentifier: "suivibaby_premium_monthly",
        },
      });

      expect(revenueCatService.getBillingPeriodFromCustomerInfo(info)).toBe(
        "monthly",
      );
    });

    it("should detect annual from product ID", () => {
      const info = mockCustomerInfo({
        premium: {
          isActive: true,
          productIdentifier: "suivibaby_premium_annual",
        },
      });

      expect(revenueCatService.getBillingPeriodFromCustomerInfo(info)).toBe(
        "annual",
      );
    });

    it("should detect lifetime from product ID", () => {
      const info = mockCustomerInfo({
        premium: {
          isActive: true,
          productIdentifier: "suivibaby_premium_lifetime",
        },
      });

      expect(revenueCatService.getBillingPeriodFromCustomerInfo(info)).toBe(
        "lifetime",
      );
    });

    it("should return 'unknown' for unrecognized product ID", () => {
      const info = mockCustomerInfo({
        premium: {
          isActive: true,
          productIdentifier: "suivibaby_premium_custom",
        },
      });

      expect(revenueCatService.getBillingPeriodFromCustomerInfo(info)).toBe(
        "unknown",
      );
    });
  });

  // ============================================
  // PURCHASES
  // ============================================

  describe("purchasePackage", () => {
    it("should return success with customerInfo", async () => {
      await revenueCatService.initRevenueCat();
      const info = mockCustomerInfo({ premium: { isActive: true } });
      mockPurchases.purchasePackage.mockResolvedValueOnce({
        customerInfo: info,
      });

      const result = await revenueCatService.purchasePackage({} as any);

      expect(result).toEqual({ success: true, customerInfo: info });
    });

    it("should return success:false on user cancellation", async () => {
      await revenueCatService.initRevenueCat();
      mockPurchases.purchasePackage.mockRejectedValueOnce({
        userCancelled: true,
      });

      const result = await revenueCatService.purchasePackage({} as any);

      expect(result).toEqual({ success: false, customerInfo: null });
    });

    it("should throw on non-cancellation error", async () => {
      await revenueCatService.initRevenueCat();
      mockPurchases.purchasePackage.mockRejectedValueOnce(
        new Error("Payment failed"),
      );

      await expect(
        revenueCatService.purchasePackage({} as any),
      ).rejects.toThrow("Payment failed");
    });
  });

  describe("restorePurchases", () => {
    it("should return customerInfo on success", async () => {
      await revenueCatService.initRevenueCat();
      const info = mockCustomerInfo();
      mockPurchases.restorePurchases.mockResolvedValueOnce(info);

      const result = await revenueCatService.restorePurchases();

      expect(result).toBe(info);
    });

    it("should throw on error", async () => {
      await revenueCatService.initRevenueCat();
      mockPurchases.restorePurchases.mockRejectedValueOnce(
        new Error("Restore failed"),
      );

      await expect(revenueCatService.restorePurchases()).rejects.toThrow(
        "Restore failed",
      );
    });

    it("returns null, without calling the SDK, when RevenueCat is not configured", async () => {
      const g = globalThis as unknown as { __DEV__: boolean };
      const previousDev = g.__DEV__;
      g.__DEV__ = false; // release build: the placeholder key is refused
      try {
        const result = await revenueCatService.restorePurchases();
        expect(result).toBeNull();
        expect(mockPurchases.restorePurchases).not.toHaveBeenCalled();
      } finally {
        g.__DEV__ = previousDev;
      }
    });
  });

  // ============================================
  // LISTENER
  // ============================================

  describe("addCustomerInfoListener", () => {
    it("should return noop if not initialized", () => {
      const callback = jest.fn();

      const unsubscribe = revenueCatService.addCustomerInfoListener(callback);

      expect(
        mockPurchases.addCustomerInfoUpdateListener,
      ).not.toHaveBeenCalled();
      expect(typeof unsubscribe).toBe("function");
      unsubscribe(); // should not throw
    });

    it("should add and remove listener when initialized", async () => {
      await revenueCatService.initRevenueCat();
      const callback = jest.fn();

      const unsubscribe = revenueCatService.addCustomerInfoListener(callback);

      expect(
        mockPurchases.addCustomerInfoUpdateListener,
      ).toHaveBeenCalledWith(callback);

      unsubscribe();

      expect(
        mockPurchases.removeCustomerInfoUpdateListener,
      ).toHaveBeenCalledWith(callback);
    });
  });

  // ============================================
  // CONSTANTS
  // ============================================

  describe("constants", () => {
    it("should export correct entitlement IDs", () => {
      expect(revenueCatService.ENTITLEMENT_PREMIUM).toBe("premium");
      expect(revenueCatService.ENTITLEMENT_FAMILY).toBe("family");
    });
  });
});

describe("isReceiptOwnedByAnotherAccount", () => {
  const { isReceiptOwnedByAnotherAccount } = jest.requireActual(
    "@/services/revenueCatService",
  ) as typeof import("@/services/revenueCatService");

  it("detects the 'receipt already in use' restore error (Keep with original App User ID)", () => {
    expect(isReceiptOwnedByAnotherAccount({ code: "7" })).toBe(true);
    expect(isReceiptOwnedByAnotherAccount({ code: 7 })).toBe(true);
  });

  it("ignores other errors", () => {
    expect(isReceiptOwnedByAnotherAccount({ code: "1" })).toBe(false);
    expect(isReceiptOwnedByAnotherAccount(new Error("network"))).toBe(false);
    expect(isReceiptOwnedByAnotherAccount(null)).toBe(false);
  });
});

describe("restore failures (6.8)", () => {
  const { classifyRestoreError, restoreFailureMessage, RESTORE_NOT_CONFIGURED_MESSAGE } = jest.requireActual(
    "@/services/revenueCatService",
  ) as typeof import("@/services/revenueCatService");

  it("recognises a purchase that belongs to another account", () => {
    expect(classifyRestoreError({ code: "7" })).toBe("other-account");
    expect(classifyRestoreError({ code: 13 })).toBe("other-account");
  });

  it("recognises network problems", () => {
    for (const code of ["10", 35, "32"]) expect(classifyRestoreError({ code })).toBe("network");
    expect(classifyRestoreError({ userInfo: { readableErrorCode: "NETWORK_ERROR" } })).toBe("network");
  });

  it("recognises configuration problems", () => {
    for (const code of ["23", "11", "14"]) expect(classifyRestoreError({ code })).toBe("configuration");
  });

  it("falls back to 'other' for anything else, including odd values", () => {
    for (const e of [{ code: "0" }, { code: "2" }, new Error("x"), null, undefined, "boom", 42]) {
      expect(classifyRestoreError(e)).toBe("other");
    }
  });

  it("has a distinct message per cause, verbatim", () => {
    expect(restoreFailureMessage("other-account")).toEqual({
      title: "Abonnement lié à un autre compte",
      message:
        "Cet abonnement est rattaché à un autre compte SuiviBaby. Connectez-vous avec le compte qui a effectué l'achat pour en profiter.",
    });
    expect(restoreFailureMessage("network")).toEqual({
      title: "Connexion indisponible",
      message: "Impossible de restaurer les achats : vérifiez votre connexion internet puis réessayez.",
    });
    expect(restoreFailureMessage("configuration")).toEqual({
      title: "Restauration indisponible",
      message: RESTORE_NOT_CONFIGURED_MESSAGE,
    });
    expect(restoreFailureMessage("other")).toEqual({
      title: "Erreur",
      message: "La restauration des achats a échoué. Réessayez, ou contactez le support si le problème persiste.",
    });
    expect(RESTORE_NOT_CONFIGURED_MESSAGE).toBe(
      "La restauration des achats n'est pas disponible pour le moment. Réessayez plus tard ou contactez le support si le problème persiste.",
    );
  });
});
