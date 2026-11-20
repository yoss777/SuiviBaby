// R2 : un abonnement échu ne doit plus être vu Premium, ni par le document
// Firestore (repli sans RevenueCat), ni par la copie locale (7 jours).
import { act, render, waitFor } from "@testing-library/react-native";
import React from "react";
import { Text } from "react-native";

import { entitledTier, isEntitledSubscription, msUntilEntitlementEnds } from "@/utils/premiumEntitlement";

const NOW = Date.parse("2026-11-20T12:00:00Z");
const PAST = "2026-11-19T12:00:00Z";
const FUTURE = "2026-11-21T12:00:00Z";

describe("isEntitledSubscription (même règle que le serveur)", () => {
  it.each([
    ["premium actif", { tier: "premium", status: "active" }, true],
    ["essai", { tier: "premium", status: "trial" }, true],
    ["actif, date dépassée (renouvellement automatique)", { tier: "premium", status: "active", expiresAt: PAST }, true],
    ["annulé, période payée en cours", { tier: "premium", status: "cancelled", expiresAt: FUTURE }, true],
    ["annulé, période payée finie", { tier: "premium", status: "cancelled", expiresAt: PAST }, false],
    ["annulé sans date", { tier: "premium", status: "cancelled" }, false],
    ["incident de paiement, période de grâce", { tier: "family", status: "billing_issue", expiresAt: FUTURE }, true],
    ["incident de paiement, échu", { tier: "family", status: "billing_issue", expiresAt: PAST }, false],
    ["expiré mais tier resté premium", { tier: "premium", status: "expired" }, false],
    ["date illisible", { tier: "premium", status: "cancelled", expiresAt: "bientôt" }, false],
    ["gratuit", { tier: "free", status: "active" }, false],
  ] as const)("%s", (_label, sub, expected) => {
    expect(isEntitledSubscription(sub, NOW)).toBe(expected);
  });

  it("niveau accordé : gratuit quand le droit est échu", () => {
    expect(entitledTier({ tier: "family", status: "cancelled", expiresAt: PAST }, NOW)).toBe("free");
    expect(entitledTier({ tier: "family", status: "cancelled", expiresAt: FUTURE }, NOW)).toBe("family");
  });

  it("délai avant la fin du droit : seulement pour un abonné annulé encore couvert", () => {
    expect(msUntilEntitlementEnds({ tier: "premium", status: "cancelled", expiresAt: FUTURE }, NOW)).toBe(86_400_000);
    expect(msUntilEntitlementEnds({ tier: "premium", status: "active", expiresAt: FUTURE }, NOW)).toBeNull();
    expect(msUntilEntitlementEnds({ tier: "premium", status: "cancelled", expiresAt: PAST }, NOW)).toBeNull();
  });
});

// ---------- PremiumContext ----------
let mockSubDoc: Record<string, unknown> | null = null;
jest.mock("@/services/userRepository", () => ({
  listenToSubscriptionDoc: (_uid: string, onNext: (snap: unknown) => void) => {
    onNext({ exists: () => mockSubDoc !== null, data: () => mockSubDoc });
    return () => {};
  },
}));
jest.mock("@/services/revenueCatService", () => ({
  initRevenueCat: jest.fn(() => Promise.resolve()),
  // RevenueCat indisponible : Firestore fait foi.
  loginRevenueCat: jest.fn(() => Promise.resolve(null)),
  logoutRevenueCat: jest.fn(() => Promise.resolve()),
  getTierFromCustomerInfo: jest.fn(),
  getStatusFromCustomerInfo: jest.fn(),
  getBillingPeriodFromCustomerInfo: jest.fn(),
  getExpiresAtFromCustomerInfo: jest.fn(),
  addCustomerInfoListener: jest.fn(() => () => {}),
}));
const mockUser = { uid: "u1" };
jest.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ firebaseUser: mockUser }) }));

import { PremiumProvider, usePremium } from "@/contexts/PremiumContext";

const AsyncStorage = require("@react-native-async-storage/async-storage");
let ctx: ReturnType<typeof usePremium>;
function Probe() {
  ctx = usePremium();
  return <Text>{ctx.tier}</Text>;
}

describe("PremiumContext : abonnement échu", () => {
  let store: Record<string, string>;
  beforeEach(() => {
    store = {};
    AsyncStorage.getItem.mockImplementation((k: string) => Promise.resolve(store[k] ?? null));
    AsyncStorage.setItem.mockImplementation((k: string, v: string) => {
      store[k] = v;
      return Promise.resolve();
    });
    jest.spyOn(Date, "now").mockReturnValue(NOW);
  });
  afterEach(() => jest.restoreAllMocks());

  it("document Firestore annulé et période finie : pas Premium", async () => {
    mockSubDoc = { tier: "premium", status: "cancelled", expiresAt: PAST };
    render(<PremiumProvider><Probe /></PremiumProvider>);
    await waitFor(() => expect(ctx.isLoading).toBe(false));
    expect(ctx.isPremium).toBe(false);
    expect(ctx.tier).toBe("free");
    expect(ctx.checkFeatureAccess("pdf_export")).toBe(false);
  });

  it("document Firestore annulé, période en cours : Premium", async () => {
    mockSubDoc = { tier: "premium", status: "cancelled", expiresAt: FUTURE };
    render(<PremiumProvider><Probe /></PremiumProvider>);
    await waitFor(() => expect(ctx.isLoading).toBe(false));
    expect(ctx.isPremium).toBe(true);
  });

  it("statut « grandfathered » sans le booléen : lu comme le serveur", async () => {
    mockSubDoc = { tier: "free", status: "grandfathered" };
    render(<PremiumProvider><Probe /></PremiumProvider>);
    await waitFor(() => expect(ctx.isGrandfathered).toBe(true));
    expect(ctx.checkFeatureAccess("pdf_export")).toBe(true);
  });

  it("copie locale (hors ligne) d'un abonné annulé, période finie : pas Premium", async () => {
    mockSubDoc = null; // pas de document : seule la copie locale parle
    store["@suivibaby_premium_cache"] = JSON.stringify({
      uid: "u1",
      tier: "premium",
      status: "cancelled",
      grandfathered: false,
      expiresAt: PAST,
      cachedAt: NOW - 1000,
    });
    render(<PremiumProvider><Probe /></PremiumProvider>);
    await waitFor(() => expect(AsyncStorage.getItem).toHaveBeenCalled());
    await act(async () => {});
    expect(ctx.isPremium).toBe(false);
  });

  it("la période payée se termine app ouverte : l'écran repasse en gratuit", async () => {
    jest.useFakeTimers({ now: NOW });
    jest.spyOn(Date, "now").mockImplementation(() => jest.now());
    try {
      mockSubDoc = { tier: "premium", status: "cancelled", expiresAt: new Date(NOW + 60_000).toISOString() };
      render(<PremiumProvider><Probe /></PremiumProvider>);
      await act(async () => {
        await jest.advanceTimersByTimeAsync(0);
      });
      expect(ctx.isPremium).toBe(true);
      await act(async () => {
        await jest.advanceTimersByTimeAsync(62_000);
      });
      expect(ctx.isPremium).toBe(false);
    } finally {
      jest.useRealTimers();
    }
  });
});
