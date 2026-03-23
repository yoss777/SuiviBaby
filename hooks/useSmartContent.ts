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
import { doc, onSnapshot } from "firebase/firestore";
import { db } from "@/config/firebase";
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
  childId: string | null;
  babyBirthDate: string | Date | null;
  babyName: string;
  tipsEnabled: boolean; // From notification preferences
  insightsEnabled?: boolean;
  correlationsEnabled?: boolean;
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

const CACHE_KEY_PREFIX = "samaye_smart_content_cache_v3_"; // Per-child cache
const CACHE_TTL_MS = 4 * 60 * 60 * 1000; // 4 hours
const TIP_HISTORY_KEY = "samaye_tip_history"; // { [tipId]: lastShownTimestamp }
const MAX_CAROUSEL_TIPS = 5;
const TIP_COOLDOWN_DAYS = 7; // Don't show the same tip again for 7 days

// ============================================
// HOOK
// ============================================

export function useSmartContent(params: SmartContentParams): SmartContentResult {
  const { events, childId, babyBirthDate, babyName, tipsEnabled, insightsEnabled = true, correlationsEnabled = true } = params;
  const cacheKey = childId ? `${CACHE_KEY_PREFIX}${childId}` : null;

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
        if (!cacheKey) throw new Error("no cache key");
        const cached = await AsyncStorage.getItem(cacheKey);
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
            getUserContentState(childId ?? undefined),
          ]);

        if (mounted) {
          setTips(fetchedTips);
          setMilestones(fetchedMilestones);
          setAllMilestonesState(fetchedAllMilestones);
          setUserContent(fetchedUserContent);
          setIsLoading(false);

          // Cache results (exclude milestoneStatuses — synced real-time via onSnapshot)
          if (cacheKey) AsyncStorage.setItem(
            cacheKey,
            JSON.stringify({
              tips: fetchedTips,
              milestones: fetchedMilestones,
              allMilestones: fetchedAllMilestones,
              userContent: { ...fetchedUserContent, milestoneStatuses: {} },
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
  }, [babyBirthDate, ageMonths, ageWeeks, tipsEnabled, refreshKey, cacheKey]);

  // Real-time listener for shared milestoneStatuses on child doc
  useEffect(() => {
    if (!childId) return;
    const unsubscribe = onSnapshot(
      doc(db, "children", childId),
      (snap) => {
        if (!snap.exists()) return;
        const data = snap.data();
        if (data.milestoneStatuses) {
          setUserContent((prev) => ({
            ...prev,
            milestoneStatuses: data.milestoneStatuses,
          }));
        }
      },
      () => {
        // Ignore errors (offline, permissions)
      },
    );
    return unsubscribe;
  }, [childId]);

  // Generate insights from events (client-side, no Firestore)
  // Stabilize insights: only recompute when the event count changes significantly,
  // not on every optimistic→real ID swap. Use a stable key based on event count + types.
  const eventsFingerprint = useMemo(() => {
    if (events.length === 0) return '';
    const typeCounts: Record<string, number> = {};
    for (const e of events) {
      const t = (e as any).type || 'unknown';
      typeCounts[t] = (typeCounts[t] || 0) + 1;
    }
    return `${events.length}_${Object.entries(typeCounts).sort().map(([k, v]) => `${k}:${v}`).join(',')}`;
  }, [events]);

  const insightsRef = useRef<ReturnType<typeof getTopInsights>>([]);
  const correlationsRef = useRef<ReturnType<typeof generateCorrelations>>([]);
  const lastInsightsFp = useRef('');
  const lastCorrelationsFp = useRef('');

  const insights = useMemo(() => {
    if (!insightsEnabled || !babyBirthDate || events.length === 0) return insightsRef.current = [];
    if (eventsFingerprint === lastInsightsFp.current) return insightsRef.current;
    lastInsightsFp.current = eventsFingerprint;
    insightsRef.current = getTopInsights(
      {
        events: events as Parameters<typeof getTopInsights>[0]["events"],
        babyName,
        ageMonths,
      },
      3,
    );
    return insightsRef.current;
  }, [eventsFingerprint, babyName, ageMonths, babyBirthDate, insightsEnabled]);

  // Generate correlations (needs 30+ days of data)
  const correlations = useMemo(() => {
    if (!correlationsEnabled || !babyBirthDate || events.length < 20) return correlationsRef.current = [];
    if (eventsFingerprint === lastCorrelationsFp.current) return correlationsRef.current;
    lastCorrelationsFp.current = eventsFingerprint;
    correlationsRef.current = generateCorrelations({
      events: events as Parameters<typeof generateCorrelations>[0]["events"],
      babyName,
    });
    return correlationsRef.current;
  }, [eventsFingerprint, babyName, babyBirthDate, correlationsEnabled]);

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
        await updateMilestoneStatusService(milestoneId, status, childId ?? undefined);
      } catch {
        // Optimistic update already applied
      }
    },
    [childId],
  );

  const refreshContent = useCallback(() => {
    if (cacheKey) AsyncStorage.removeItem(cacheKey).catch(() => {});
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
