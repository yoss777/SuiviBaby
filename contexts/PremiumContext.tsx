// contexts/PremiumContext.tsx
// État global du statut Premium de l'utilisateur.
// Gère le cache offline (AsyncStorage TTL 7j), le mode dev toggle,
// et sera connecté à RevenueCat quand les API keys seront prêtes.

import AsyncStorage from "@react-native-async-storage/async-storage";
import { doc, onSnapshot } from "firebase/firestore";
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

import { db } from "@/config/firebase";
import { useAuth } from "@/contexts/AuthContext";
import {
  initRevenueCat,
  loginRevenueCat,
  logoutRevenueCat,
  getTierFromCustomerInfo,
  getStatusFromCustomerInfo,
  addCustomerInfoListener,
} from "@/services/revenueCatService";

// ============================================
// TYPES
// ============================================

export type PremiumTier = "free" | "premium" | "family";

export type PremiumFeature =
  | "unlimited_history"
  | "unlimited_export"
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
  expiresAt?: string;
  grandfathered?: boolean;
  startDate?: string;
}

interface PremiumContextValue {
  tier: PremiumTier;
  status: SubscriptionStatus;
  isPremium: boolean;
  isFamily: boolean;
  isGrandfathered: boolean;
  isTrial: boolean;
  hasBillingIssue: boolean;
  checkFeatureAccess: (feature: PremiumFeature) => boolean;
  /** Mode dev uniquement — toggle pour simuler Premium */
  devOverrideTier: (tier: PremiumTier | null) => void;
  isLoading: boolean;
}

// ============================================
// FEATURE ACCESS MAP
// ============================================

const PREMIUM_FEATURES: Set<PremiumFeature> = new Set([
  "unlimited_history",
  "unlimited_export",
  "unlimited_voice",
  "unlimited_sharing",
  "advanced_stats",
  "oms_curves",
  "ai_insights",
  "widgets",
  "pediatre_report",
  "milestones_capsule",
]);

// Features réservées au tier Family
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
  tier: PremiumTier;
  status: SubscriptionStatus;
  grandfathered: boolean;
  cachedAt: number;
}

async function loadCache(): Promise<CachedPremiumState | null> {
  try {
    const raw = await AsyncStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const cached: CachedPremiumState = JSON.parse(raw);
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
  const [isLoading, setIsLoading] = useState(true);
  const [devOverride, setDevOverride] = useState<PremiumTier | null>(null);

  // Step 1: Load cache on mount (instant, no network)
  useEffect(() => {
    loadCache().then((cached) => {
      if (cached) {
        setTier(cached.tier);
        setStatus(cached.status);
        setGrandfathered(cached.grandfathered);
      }
    });
    // Init RevenuCat SDK (no user yet)
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

    const syncFromRevenueCat = async () => {
      try {
        // Login to RevenuCat with Firebase UID
        const customerInfo = await loginRevenueCat(firebaseUser.uid);
        if (cancelled || !customerInfo) return;

        const rcTier = getTierFromCustomerInfo(customerInfo);
        const rcStatus = getStatusFromCustomerInfo(customerInfo);

        setTier(rcTier);
        setStatus(rcStatus);
        saveCache({ tier: rcTier, status: rcStatus, grandfathered: false });
        setIsLoading(false);
      } catch {
        // RevenuCat failed — fallback to Firestore
        if (!cancelled) syncFromFirestore();
      }
    };

    const syncFromFirestore = () => {
      const docRef = doc(db, "subscriptions", firebaseUser.uid);
      return onSnapshot(
        docRef,
        (snap) => {
          if (cancelled) return;
          if (snap.exists()) {
            const data = snap.data() as SubscriptionData;
            setTier(data.tier ?? "free");
            setStatus(data.status ?? "active");
            setGrandfathered(data.grandfathered ?? false);
            saveCache({ tier: data.tier ?? "free", status: data.status ?? "active", grandfathered: data.grandfathered ?? false });
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
      setTier(rcTier);
      setStatus(rcStatus);
      saveCache({ tier: rcTier, status: rcStatus, grandfathered: false });
    });

    syncFromRevenueCat();

    // Firestore listener for grandfathered status (not in RevenuCat)
    const docRef = doc(db, "subscriptions", firebaseUser.uid);
    const unsubFirestore = onSnapshot(
      docRef,
      (snap) => {
        if (cancelled) return;
        if (snap.exists()) {
          const data = snap.data() as SubscriptionData;
          if (data.grandfathered) setGrandfathered(true);
        }
      },
      () => {}
    );

    return () => {
      cancelled = true;
      removeRCListener();
      unsubFirestore();
    };
  }, [firebaseUser?.uid]);

  const effectiveTier = devOverride ?? tier;

  const isPremium = effectiveTier === "premium" || effectiveTier === "family";
  const isFamily = effectiveTier === "family";
  const isTrial = status === "trial";
  const hasBillingIssue = status === "billing_issue";

  const checkFeatureAccess = useCallback(
    (feature: PremiumFeature): boolean => {
      // Grandfathered users keep existing features but not new Premium ones
      if (grandfathered && !devOverride) {
        // Grandfathered = accès historique illimité + partage illimité + exports
        // Mais PAS : IA, widgets, rapport pédiatre, capsules
        const grandfatheredFeatures: Set<PremiumFeature> = new Set([
          "unlimited_history",
          "unlimited_export",
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

  const devOverrideTier = useCallback((newTier: PremiumTier | null) => {
    if (__DEV__) {
      setDevOverride(newTier);
    }
  }, []);

  const value = useMemo<PremiumContextValue>(
    () => ({
      tier: effectiveTier,
      status,
      isPremium,
      isFamily,
      isGrandfathered: grandfathered,
      isTrial,
      hasBillingIssue,
      checkFeatureAccess,
      devOverrideTier,
      isLoading,
    }),
    [effectiveTier, status, isPremium, isFamily, grandfathered, isTrial, hasBillingIssue, checkFeatureAccess, devOverrideTier, isLoading]
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
