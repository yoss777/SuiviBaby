// hooks/usePromos.ts
// Manages promotional content display on the dashboard

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getAgeInMonths } from "@/utils/ageUtils";
import {
  dismissPromo as dismissPromoService,
  fetchActivePromos,
  getUserPromoState,
  trackClick as trackClickService,
  trackImpression as trackImpressionService,
} from "@/services/promoService";
import type { Promotion, UserPromos } from "@/types/promo";
import { DEFAULT_USER_PROMOS } from "@/types/promo";

interface UsePromosParams {
  babyBirthDate: string | Date | null;
  marketingEnabled: boolean;
}

interface UsePromosResult {
  currentPromo: Promotion | null;
  referralCode: string;
  referralCount: number;
  isLoading: boolean;
  dismissPromo: (promoId: string) => Promise<void>;
  trackClick: (promoId: string) => Promise<void>;
}

// Anti-spam: don't show promos more than once per 24h
const PROMO_COOLDOWN_MS = 24 * 60 * 60 * 1000;
// Don't show promos at night (22h-7h)
const NIGHT_START = 22;
const NIGHT_END = 7;

function isNightTime(): boolean {
  const hour = new Date().getHours();
  return hour >= NIGHT_START || hour < NIGHT_END;
}

export function usePromos(params: UsePromosParams): UsePromosResult {
  const { babyBirthDate, marketingEnabled } = params;

  const [promos, setPromos] = useState<Promotion[]>([]);
  const [userPromos, setUserPromos] = useState<UserPromos>(DEFAULT_USER_PROMOS);
  const [isLoading, setIsLoading] = useState(true);
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const ageMonths = useMemo(
    () => (babyBirthDate ? getAgeInMonths(babyBirthDate) : 0),
    [babyBirthDate],
  );

  // Fetch promos and user state
  useEffect(() => {
    if (!babyBirthDate || !marketingEnabled) {
      setPromos([]);
      setIsLoading(false);
      return;
    }

    let mounted = true;

    const fetchData = async () => {
      try {
        const [fetchedPromos, fetchedUserPromos] = await Promise.all([
          fetchActivePromos(ageMonths),
          getUserPromoState(),
        ]);

        if (mounted) {
          setPromos(fetchedPromos);
          setUserPromos(fetchedUserPromos);
          setIsLoading(false);
        }
      } catch {
        if (mounted) setIsLoading(false);
      }
    };

    fetchData();
    return () => {
      mounted = false;
    };
  }, [babyBirthDate, ageMonths, marketingEnabled]);

  // Select the best promo to show
  const currentPromo = useMemo(() => {
    if (promos.length === 0 || isNightTime()) return null;

    // Anti-spam: check cooldown
    if (userPromos.lastPromoShownAt) {
      const lastShown =
        userPromos.lastPromoShownAt instanceof Date
          ? userPromos.lastPromoShownAt
          : new Date(userPromos.lastPromoShownAt as unknown as string);
      if (Date.now() - lastShown.getTime() < PROMO_COOLDOWN_MS) return null;
    }

    const dismissed = new Set(userPromos.dismissedPromos);
    const available = promos.filter((p) => !dismissed.has(p.id));

    if (available.length === 0) return null;
    return available[0]; // Already sorted by priority
  }, [promos, userPromos]);

  // Track impression when a promo is first shown
  useEffect(() => {
    if (currentPromo && !userPromos.seenPromos.includes(currentPromo.id)) {
      trackImpressionService(currentPromo.id).catch(() => {});
    }
  }, [currentPromo?.id]);

  // Actions
  const dismissPromo = useCallback(async (promoId: string) => {
    setUserPromos((prev) => ({
      ...prev,
      dismissedPromos: [...prev.dismissedPromos, promoId],
    }));
    try {
      await dismissPromoService(promoId);
    } catch {
      // Optimistic update
    }
  }, []);

  const trackClick = useCallback(async (promoId: string) => {
    setUserPromos((prev) => ({
      ...prev,
      clickedPromos: [...prev.clickedPromos, promoId],
    }));
    try {
      await trackClickService(promoId);
    } catch {
      // Optimistic update
    }
  }, []);

  return {
    currentPromo,
    referralCode: userPromos.referralCode ?? "",
    referralCount: userPromos.referralCount,
    isLoading,
    dismissPromo,
    trackClick,
  };
}
