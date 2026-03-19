// hooks/useSmartContent.ts
// Combines tips, insights, milestones, and correlations for the dashboard

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { getAgeInMonths, getAgeInWeeks } from "@/utils/ageUtils";
import { getTopInsights } from "@/services/insightEngine";
import { generateCorrelations } from "@/services/correlationService";
import {
  fetchAllMilestones,
  fetchTipsForAge,
  getUpcomingMilestones,
  getUserContentState,
  dismissTip as dismissTipService,
  bookmarkTip as bookmarkTipService,
  removeBookmark as removeBookmarkService,
  updateMilestoneStatus as updateMilestoneStatusService,
} from "@/services/smartContentService";
import type { MilestoneStatus } from "@/types/content";
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
  availableTips: Tip[];
  insights: Insight[];
  correlations: Insight[];
  allMilestones: MilestoneRef[];
  upcomingMilestones: MilestoneRef[];
  userContent: UserContent;
  isLoading: boolean;
  dismissTip: (tipId: string) => Promise<void>;
  bookmarkTip: (tipId: string) => Promise<void>;
  removeBookmark: (tipId: string) => Promise<void>;
  updateMilestoneStatus: (milestoneId: string, status: import("@/types/content").MilestoneStatus) => Promise<void>;
  refreshContent: () => void;
}

const CACHE_KEY = "samaye_smart_content_cache_v2"; // Bumped to invalidate stale cache
const CACHE_TTL_MS = 4 * 60 * 60 * 1000; // 4 hours
const TIP_HISTORY_KEY = "samaye_tip_history"; // { [tipId]: lastShownTimestamp }
const MAX_CAROUSEL_TIPS = 5;
const TIP_COOLDOWN_DAYS = 7; // Don't show the same tip again for 7 days

// ============================================
// HOOK
// ============================================

export function useSmartContent(params: SmartContentParams): SmartContentResult {
  const { events, babyBirthDate, babyName, tipsEnabled } = params;

  const [tips, setTips] = useState<Tip[]>([]);
  const [milestones, setMilestones] = useState<MilestoneRef[]>([]);
  const [allMilestonesState, setAllMilestonesState] = useState<MilestoneRef[]>([]);
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
      setTips([]);
      setMilestones([]);
      setAllMilestonesState([]);
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
              setAllMilestonesState(parsed.allMilestones || []);
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
        const [fetchedTips, fetchedMilestones, fetchedAllMilestones, fetchedUserContent] =
          await Promise.all([
            fetchTipsForAge(ageMonths, 20),
            getUpcomingMilestones(ageWeeks, 5),
            fetchAllMilestones(),
            getUserContentState(),
          ]);

        if (mounted) {
          setTips(fetchedTips);
          setMilestones(fetchedMilestones);
          setAllMilestonesState(fetchedAllMilestones);
          setUserContent(fetchedUserContent);
          setIsLoading(false);

          // Cache results
          AsyncStorage.setItem(
            CACHE_KEY,
            JSON.stringify({
              tips: fetchedTips,
              milestones: fetchedMilestones,
              allMilestones: fetchedAllMilestones,
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

  // Tip history: { [tipId]: timestamp } — loaded from AsyncStorage
  const [tipHistory, setTipHistory] = useState<Record<string, number>>({});

  useEffect(() => {
    AsyncStorage.getItem(TIP_HISTORY_KEY)
      .then((raw) => {
        if (raw) setTipHistory(JSON.parse(raw));
      })
      .catch(() => {});
  }, []);

  // Smart tip selection: 5 random tips, prefer unseen, respect cooldown
  const availableTips = useMemo(() => {
    if (tips.length === 0) return [];

    const dismissed = new Set(userContent.dismissedTips);
    const now = Date.now();
    const cooldownMs = TIP_COOLDOWN_DAYS * 24 * 60 * 60 * 1000;

    // Filter: not dismissed
    const candidates = tips.filter((t) => !dismissed.has(t.id));
    if (candidates.length === 0) return [];

    // Score each tip: unseen = 0, seen long ago = low, seen recently = high
    const scored = candidates.map((tip) => {
      const lastSeen = tipHistory[tip.id] ?? 0;
      const daysSince = (now - lastSeen) / (24 * 60 * 60 * 1000);
      const isOnCooldown = lastSeen > 0 && daysSince < TIP_COOLDOWN_DAYS;
      // Lower score = show first. Unseen tips get score 0, old tips get low score
      const score = isOnCooldown
        ? 1000 + tip.priority // Push to end
        : lastSeen === 0
          ? tip.priority // Never seen = highest priority
          : tip.priority + (TIP_COOLDOWN_DAYS - daysSince); // Seen but cooled down
      return { tip, score };
    });

    // Sort by score (lower = better), then shuffle ties for variety
    scored.sort((a, b) => {
      const diff = a.score - b.score;
      if (Math.abs(diff) < 0.5) return Math.random() - 0.5; // Shuffle ties
      return diff;
    });

    // Take top MAX_CAROUSEL_TIPS
    const selected = scored.slice(0, MAX_CAROUSEL_TIPS).map((s) => s.tip);

    // Record that these tips were shown
    const newHistory = { ...tipHistory };
    for (const t of selected) {
      newHistory[t.id] = now;
    }
    // Persist asynchronously (don't block render)
    AsyncStorage.setItem(TIP_HISTORY_KEY, JSON.stringify(newHistory)).catch(() => {});
    // Don't call setTipHistory here to avoid infinite loop — history updates on next session

    return selected;
  }, [tips, userContent.dismissedTips, tipHistory]);

  // Best single tip (for backward compat)
  const currentTip = availableTips.length > 0 ? availableTips[0] : null;

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

  const updateMilestoneStatus = useCallback(
    async (milestoneId: string, status: MilestoneStatus) => {
      // Optimistic update
      setUserContent((prev) => ({
        ...prev,
        milestoneStatuses: {
          ...prev.milestoneStatuses,
          [milestoneId]: status,
        },
      }));
      try {
        await updateMilestoneStatusService(milestoneId, status);
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
    availableTips,
    insights,
    correlations,
    allMilestones: allMilestonesState,
    upcomingMilestones: milestones,
    userContent,
    isLoading,
    dismissTip,
    bookmarkTip,
    removeBookmark,
    updateMilestoneStatus,
    refreshContent,
  };
}
