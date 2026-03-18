// hooks/useSmartContent.ts
// Combines tips, insights, milestones, and correlations for the dashboard

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { getAgeInMonths, getAgeInWeeks } from "@/utils/ageUtils";
import { getTopInsights } from "@/services/insightEngine";
import { generateCorrelations } from "@/services/correlationService";
import {
  fetchTipsForAge,
  getUpcomingMilestones,
  getUserContentState,
  dismissTip as dismissTipService,
  bookmarkTip as bookmarkTipService,
  removeBookmark as removeBookmarkService,
} from "@/services/smartContentService";
import type { Insight, MilestoneRef, Tip, UserContent } from "@/types/content";
import { DEFAULT_USER_CONTENT } from "@/types/content";

// ============================================
// TYPES
// ============================================

interface SmartContentParams {
  events: Array<{
    id: string;
    type: string;
    date: Date;
    quality?: string;
    location?: string;
    isNap?: boolean;
    duree?: number;
    heureDebut?: Date;
    heureFin?: Date;
    typeSolide?: string;
    nouveauAliment?: boolean;
    nomNouvelAliment?: string;
    reaction?: string;
    quantiteMl?: number;
    valeur?: number;
    jalonType?: string;
    titre?: string;
    note?: string;
  }>;
  babyBirthDate: string | Date | null;
  babyName: string;
  tipsEnabled: boolean; // From notification preferences
}

interface SmartContentResult {
  currentTip: Tip | null;
  insights: Insight[];
  correlations: Insight[];
  upcomingMilestones: MilestoneRef[];
  userContent: UserContent;
  isLoading: boolean;
  dismissTip: (tipId: string) => Promise<void>;
  bookmarkTip: (tipId: string) => Promise<void>;
  removeBookmark: (tipId: string) => Promise<void>;
  refreshContent: () => void;
}

const CACHE_KEY = "samaye_smart_content_cache";
const CACHE_TTL_MS = 4 * 60 * 60 * 1000; // 4 hours

// ============================================
// HOOK
// ============================================

export function useSmartContent(params: SmartContentParams): SmartContentResult {
  const { events, babyBirthDate, babyName, tipsEnabled } = params;

  const [tips, setTips] = useState<Tip[]>([]);
  const [milestones, setMilestones] = useState<MilestoneRef[]>([]);
  const [userContent, setUserContent] = useState<UserContent>(DEFAULT_USER_CONTENT);
  const [isLoading, setIsLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);
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

  const ageWeeks = useMemo(
    () => (babyBirthDate ? getAgeInWeeks(babyBirthDate) : 0),
    [babyBirthDate],
  );

  // Fetch tips and milestones from Firestore
  useEffect(() => {
    if (!babyBirthDate || !tipsEnabled) {
      setIsLoading(false);
      return;
    }

    let mounted = true;

    const fetchData = async () => {
      try {
        // Try cache first
        const cached = await AsyncStorage.getItem(CACHE_KEY);
        if (cached) {
          const parsed = JSON.parse(cached);
          if (Date.now() - parsed.timestamp < CACHE_TTL_MS) {
            if (mounted) {
              setTips(parsed.tips || []);
              setMilestones(parsed.milestones || []);
              setUserContent(parsed.userContent || DEFAULT_USER_CONTENT);
              setIsLoading(false);
            }
            return;
          }
        }
      } catch {
        // Cache miss, proceed to fetch
      }

      try {
        const [fetchedTips, fetchedMilestones, fetchedUserContent] =
          await Promise.all([
            fetchTipsForAge(ageMonths, 20),
            getUpcomingMilestones(ageWeeks, 5),
            getUserContentState(),
          ]);

        if (mounted) {
          setTips(fetchedTips);
          setMilestones(fetchedMilestones);
          setUserContent(fetchedUserContent);
          setIsLoading(false);

          // Cache results
          AsyncStorage.setItem(
            CACHE_KEY,
            JSON.stringify({
              tips: fetchedTips,
              milestones: fetchedMilestones,
              userContent: fetchedUserContent,
              timestamp: Date.now(),
            }),
          ).catch(() => {});
        }
      } catch {
        if (mounted) setIsLoading(false);
      }
    };

    fetchData();
    return () => {
      mounted = false;
    };
  }, [babyBirthDate, ageMonths, ageWeeks, tipsEnabled, refreshKey]);

  // Generate insights from events (client-side, no Firestore)
  const insights = useMemo(() => {
    if (!babyBirthDate || events.length === 0) return [];
    return getTopInsights(
      {
        events: events as Parameters<typeof getTopInsights>[0]["events"],
        babyName,
        ageMonths,
      },
      3,
    );
  }, [events, babyName, ageMonths, babyBirthDate]);

  // Generate correlations (needs 30+ days of data)
  const correlations = useMemo(() => {
    if (!babyBirthDate || events.length < 20) return [];
    return generateCorrelations({
      events: events as Parameters<typeof generateCorrelations>[0]["events"],
      babyName,
    });
  }, [events, babyName, babyBirthDate]);

  // Select the best tip to show (not dismissed, not already seen recently)
  const currentTip = useMemo(() => {
    if (tips.length === 0) return null;

    const dismissed = new Set(userContent.dismissedTips);
    const available = tips.filter((t) => !dismissed.has(t.id));

    if (available.length === 0) return null;

    // Sort by priority, return the best one
    return available.sort((a, b) => a.priority - b.priority)[0];
  }, [tips, userContent.dismissedTips]);

  // Actions
  const dismissTip = useCallback(
    async (tipId: string) => {
      setUserContent((prev) => ({
        ...prev,
        dismissedTips: [...prev.dismissedTips, tipId],
      }));
      try {
        await dismissTipService(tipId);
      } catch {
        // Optimistic update already applied
      }
    },
    [],
  );

  const bookmarkTip = useCallback(
    async (tipId: string) => {
      setUserContent((prev) => ({
        ...prev,
        bookmarks: [...prev.bookmarks, tipId],
      }));
      try {
        await bookmarkTipService(tipId);
      } catch {
        // Optimistic update already applied
      }
    },
    [],
  );

  const removeBookmark = useCallback(
    async (tipId: string) => {
      setUserContent((prev) => ({
        ...prev,
        bookmarks: prev.bookmarks.filter((b) => b !== tipId),
      }));
      try {
        await removeBookmarkService(tipId);
      } catch {
        // Optimistic update already applied
      }
    },
    [],
  );

  const refreshContent = useCallback(() => {
    AsyncStorage.removeItem(CACHE_KEY).catch(() => {});
    setRefreshKey((k) => k + 1);
    setIsLoading(true);
  }, []);

  return {
    currentTip,
    insights,
    correlations,
    upcomingMilestones: milestones,
    userContent,
    isLoading,
    dismissTip,
    bookmarkTip,
    removeBookmark,
    refreshContent,
  };
}
