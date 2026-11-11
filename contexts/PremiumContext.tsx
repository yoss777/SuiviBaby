// contexts/PremiumContext.tsx
// État global du statut Premium de l'utilisateur.
// Gère le cache offline (AsyncStorage TTL 7j), le mode dev toggle,
// et sera connecté à RevenueCat quand les API keys seront prêtes.

import AsyncStorage from "@react-native-async-storage/async-storage";
import { listenToSubscriptionDoc } from "@/services/userRepository";
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

import { useAuth } from "@/contexts/AuthContext";
import {
  initRevenueCat,
  loginRevenueCat,
  logoutRevenueCat,
  getTierFromCustomerInfo,
  getStatusFromCustomerInfo,
  getBillingPeriodFromCustomerInfo,
  addCustomerInfoListener,
} from "@/services/revenueCatService";

// ============================================
// TYPES
// ============================================

export type PremiumTier = "free" | "premium" | "family";

export type PremiumFeature =
  | "unlimited_history"
  | "pdf_export"
  | "unlimited_voice"
  | "unlimited_sharing"
  | "advanced_stats"
  | "oms_curves"
  | "ai_insights"
  | "widgets"
  | "night_mode_premium" // night mode de base est gratuit, features premium la nuit
  | "pediatre_report"
  | "milestones_capsule";

export type SubscriptionStatus =
  | "active"
  | "trial"
  | "expired"
  | "billing_issue"
  | "cancelled"
  | "grandfathered";

interface SubscriptionData {
  tier: PremiumTier;
  status: SubscriptionStatus;
  billingPeriod?: BillingPeriod;
  expiresAt?: string;
  grandfathered?: boolean;
  startDate?: string;
}

export type BillingPeriod = "monthly" | "annual" | "lifetime" | "unknown";

interface PremiumContextValue {
  tier: PremiumTier;
  status: SubscriptionStatus;
  billingPeriod: BillingPeriod;
  isPremium: boolean;
  isFamily: boolean;
  isGrandfathered: boolean;
  isTrial: boolean;
  hasBillingIssue: boolean;
  checkFeatureAccess: (feature: PremiumFeature) => boolean;
  /** Mode dev uniquement — toggle pour simuler Premium */
  devOverrideTier: (tier: PremiumTier | null) => void;
  devOverrideBilling: (period: BillingPeriod | null) => void;
  isLoading: boolean;
}

// ============================================
// FEATURE ACCESS MAP
// ============================================

const PREMIUM_FEATURES: Set<PremiumFeature> = new Set([
  "unlimited_history",
  "pdf_export",
  "unlimited_voice",
  "unlimited_sharing",
  "ai_insights",
  "widgets",
  "pediatre_report",
  "milestones_capsule",
]);

// Fonctionnalités gratuites pour tous (décision Q7, 2026-11-07) : gardées dans
// le type PremiumFeature pour ne rien casser, mais jamais bloquées.
// Partage illimité pour tous depuis le 2026-11-11.
const FREE_FEATURES: ReadonlySet<PremiumFeature> = new Set<PremiumFeature>(["advanced_stats", "oms_curves", "unlimited_sharing"]);

/** Vrai si la fonctionnalité est accessible à tous, quel que soit l'abonnement. */
export function isAlwaysFreeFeature(feature: PremiumFeature): boolean {
  return FREE_FEATURES.has(feature);
}

// Features réservées au tier Family (offre Famille plus proposée à la vente,
// produits conservés dans les stores pour les abonnés existants)
const FAMILY_ONLY_FEATURES: Set<PremiumFeature> = new Set([
  // Pour l'instant, family = premium + 5 comptes liés.
  // Les features family-only seront ajoutées ici.
]);

// ============================================
// CACHE
// ============================================

const CACHE_KEY = "@suivibaby_premium_cache";
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 jours

interface CachedPremiumState {
  /** Account the state belongs to: several accounts can share a device. */
  uid: string;
  tier: PremiumTier;
  status: SubscriptionStatus;
  grandfathered: boolean;
  cachedAt: number;
}

async function loadCache(uid: string): Promise<CachedPremiumState | null> {
  try {
    const raw = await AsyncStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const cached: CachedPremiumState = JSON.parse(raw);
    // Another account's tier must never leak (legacy entries have no uid).
    if (cached.uid !== uid) return null;
    if (Date.now() - cached.cachedAt > CACHE_TTL_MS) return null;
    return cached;
  } catch {
    return null;
  }
}

async function saveCache(state: Omit<CachedPremiumState, "cachedAt">) {
  try {
    await AsyncStorage.setItem(
      CACHE_KEY,
      JSON.stringify({ ...state, cachedAt: Date.now() })
    );
  } catch {
    // Cache failure is non-critical
  }
}

// ============================================
// CONTEXT
// ============================================

const PremiumContext = createContext<PremiumContextValue | null>(null);

export function PremiumProvider({ children }: { children: React.ReactNode }) {
  const { firebaseUser } = useAuth();
  const [tier, setTier] = useState<PremiumTier>("free");
  const [status, setStatus] = useState<SubscriptionStatus>("active");
  const [grandfathered, setGrandfathered] = useState(false);
  const [billingPeriod, setBillingPeriod] = useState<BillingPeriod>("unknown");
  const [isLoading, setIsLoading] = useState(true);
  const [devOverride, setDevOverride] = useState<PremiumTier | null>(null);
  const [devBillingOverride, setDevBillingOverride] = useState<BillingPeriod | null>(null);

  // Step 1: Init RevenuCat SDK on mount (no user yet)
  useEffect(() => {
    initRevenueCat().catch(() => {});
  }, []);

  // Step 2: When user changes, sync with RevenuCat + Firestore fallback
  useEffect(() => {
    if (!firebaseUser?.uid) {
      setTier("free");
      setStatus("active");
      setGrandfathered(false);
      setIsLoading(false);
      logoutRevenueCat().catch(() => {});
      return;
    }

    let cancelled = false;
    let unsubFallback: (() => void) | null = null;
    const uid = firebaseUser.uid;
    // Set once RevenuCat or Firestore answered: the cache must not override it.
    let liveResolved = false;

    // Instant state from this account's cache while RevenuCat / Firestore load.
    loadCache(uid).then((cached) => {
      if (cancelled || liveResolved || !cached) return;
      setTier(cached.tier);
      setStatus(cached.status);
      setGrandfathered(cached.grandfathered);
    });

    const syncFromRevenueCat = async () => {
      try {
        // Login to RevenuCat with Firebase UID
        const customerInfo = await loginRevenueCat(firebaseUser.uid);
        if (cancelled) return;
        if (!customerInfo) {
          // SDK not initialised or login failed: Firestore is the source of truth.
          unsubFallback = syncFromFirestore();
          return;
        }

        const rcTier = getTierFromCustomerInfo(customerInfo);
        const rcStatus = getStatusFromCustomerInfo(customerInfo);
        const rcBilling = getBillingPeriodFromCustomerInfo(customerInfo);

        setTier(rcTier);
        setStatus(rcStatus);
        setBillingPeriod(rcBilling);
        liveResolved = true;
        saveCache({ uid, tier: rcTier, status: rcStatus, grandfathered: false });
        setIsLoading(false);
      } catch {
        // RevenuCat failed — fallback to Firestore
        if (!cancelled) unsubFallback = syncFromFirestore();
      }
    };

    const syncFromFirestore = () => {
      return listenToSubscriptionDoc(
        firebaseUser.uid,
        (snap) => {
          if (cancelled) return;
          if (snap.exists()) {
            const data = snap.data() as SubscriptionData;
            setTier(data.tier ?? "free");
            setStatus(data.status ?? "active");
            setBillingPeriod(data.billingPeriod ?? "unknown");
            setGrandfathered(data.grandfathered ?? false);
            liveResolved = true;
            saveCache({ uid, tier: data.tier ?? "free", status: data.status ?? "active", grandfathered: data.grandfathered ?? false });
          }
          setIsLoading(false);
        },
        () => { if (!cancelled) setIsLoading(false); }
      );
    };

    // RevenuCat real-time listener
    const removeRCListener = addCustomerInfoListener((info) => {
      if (cancelled) return;
      const rcTier = getTierFromCustomerInfo(info);
      const rcStatus = getStatusFromCustomerInfo(info);
      const rcBilling = getBillingPeriodFromCustomerInfo(info);
      setTier(rcTier);
      setStatus(rcStatus);
      setBillingPeriod(rcBilling);
      liveResolved = true;
      saveCache({ uid, tier: rcTier, status: rcStatus, grandfathered: false });
    });

    syncFromRevenueCat();

    // Firestore listener for grandfathered status (not in RevenuCat)
    const unsubFirestore = listenToSubscriptionDoc(
      firebaseUser.uid,
      (snap) => {
        if (cancelled) return;
        if (snap.exists()) {
          const data = snap.data() as SubscriptionData;
          if (data.grandfathered) setGrandfathered(true);
          if (data.billingPeriod) setBillingPeriod(data.billingPeriod);
        }
      },
      () => {}
    );

    return () => {
      cancelled = true;
      removeRCListener();
      unsubFirestore();
      unsubFallback?.();
    };
  }, [firebaseUser?.uid]);

  const effectiveTier = devOverride ?? tier;

  const isPremium = effectiveTier === "premium" || effectiveTier === "family";
  const isFamily = effectiveTier === "family";
  const isTrial = status === "trial";
  const hasBillingIssue = status === "billing_issue";

  const checkFeatureAccess = useCallback(
    (feature: PremiumFeature): boolean => {
      if (isAlwaysFreeFeature(feature)) return true;

      // Grandfathered users keep existing features but not new Premium ones
      if (grandfathered && !devOverride) {
        // Grandfathered = accès historique illimité + partage illimité + export PDF
        // Mais PAS : IA, widgets, rapport pédiatre, capsules
        const grandfatheredFeatures: Set<PremiumFeature> = new Set([
          "unlimited_history",
          "pdf_export",
          "unlimited_voice",
          "unlimited_sharing",
        ]);
        if (grandfatheredFeatures.has(feature)) return true;
      }

      // Free tier — no premium features
      if (!isPremium) return false;

      // Family-only check
      if (FAMILY_ONLY_FEATURES.has(feature) && !isFamily) return false;

      // Premium or Family — all premium features
      return PREMIUM_FEATURES.has(feature);
    },
    [isPremium, isFamily, grandfathered, devOverride]
  );

  const effectiveBilling = devBillingOverride ?? billingPeriod;

  const devOverrideTier = useCallback((newTier: PremiumTier | null) => {
    if (__DEV__) {
      setDevOverride(newTier);
    }
  }, []);

  const devOverrideBilling = useCallback((period: BillingPeriod | null) => {
    if (__DEV__) {
      setDevBillingOverride(period);
    }
  }, []);

  const value = useMemo<PremiumContextValue>(
    () => ({
      tier: effectiveTier,
      status,
      billingPeriod: effectiveBilling,
      isPremium,
      isFamily,
      isGrandfathered: grandfathered,
      isTrial,
      hasBillingIssue,
      checkFeatureAccess,
      devOverrideTier,
      devOverrideBilling,
      isLoading,
    }),
    [effectiveTier, status, effectiveBilling, isPremium, isFamily, grandfathered, isTrial, hasBillingIssue, checkFeatureAccess, devOverrideTier, devOverrideBilling, isLoading]
  );

  return (
    <PremiumContext.Provider value={value}>{children}</PremiumContext.Provider>
  );
}

export function usePremium(): PremiumContextValue {
  const context = useContext(PremiumContext);
  if (!context) {
    throw new Error("usePremium must be used within PremiumProvider");
  }
  return context;
}
