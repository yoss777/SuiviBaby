import PompagesChart from "@/components/suivibaby/PompagesChart";
import { APP_NAME } from "@/constants/app";
import RepasChart from "@/components/suivibaby/RepasChart";
import { SafeBoundary } from "@/components/SafeBoundary";
import SommeilChart from "@/components/suivibaby/SommeilChart";
import { IconPulseDots } from "@/components/ui/IconPulseDtos";
import { SkeletonBlock } from "@/components/ui/Skeleton";
import { getChartColors, getNeutralColors } from "@/constants/dashboardColors";
import { Colors } from "@/constants/theme";
import { PaywallPrompt } from "@/components/ui/PaywallPrompt";
import { useBaby } from "@/contexts/BabyContext";
import { usePremium } from "@/contexts/PremiumContext";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { useForegroundServerRefresh } from "@/hooks/useForegroundServerRefresh";
import {
  mergeFirestoreSnapshots,
  useMergedOptimisticEvents,
} from "@/hooks/useMergedOptimisticEvents";
import { ecouterEvenements, obtenirEvenements } from "@/services/eventsService";
import { decidePdfExportAccess } from "@/services/premiumGatingService";
import { buildAllergiesReportLine } from "@/utils/childAllergies";
import {
  consumeExportQuota,
  getExportUsageStatus,
  type UsageQuotaStatus,
} from "@/services/premiumUsageService";
import { captureServiceError } from "@/utils/errorReporting";
import {
  addWeeks,
  buildReportWeekRows,
  countInRange,
  getReportWeekBoundaries,
  toMillis,
} from "@/utils/statsAggregations";
import {
  combineLiveAndHistory,
  getEarliestNeededMs,
  getHistoryRangeToLoad,
  getLiveSince,
  splitStatsEventsByType,
  withTimeout,
  type StatsSplit,
} from "@/utils/statsWindow";
import { countStatsRender, markStatsMount } from "@/utils/statsPerf";
import FontAwesome from "@expo/vector-icons/FontAwesome6";
import { HeaderBackButton } from "expo-router/react-navigation";
import { useFocusEffect } from "expo-router/react-navigation";
import * as Haptics from "expo-haptics";
import * as Print from "expo-print";
import { router, useLocalSearchParams } from "expo-router";
import { adoptTempFile, deleteTempFile, shareTempFile } from "@/services/tempShareService";
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import {
  Animated,
  ActivityIndicator,
  Alert,
  BackHandler,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from "react-native";
import PagerView from "react-native-pager-view";
import { useHeaderLeft } from "../../_layout";
import { runAfterInteractions } from "@/utils/afterInteractions";

type TabKey = "tetees" | "pompages" | "sommeil";

const TAB_CONFIG: {
  key: TabKey;
  icon: string;
  label: string;
  a11yLabel: string;
  a11yHint: string;
}[] = [
  {
    key: "tetees",
    icon: "utensils",
    label: "Repas",
    a11yLabel: "Onglet Repas",
    a11yHint: "Afficher les statistiques des repas",
  },
  {
    key: "pompages",
    icon: "pump-medical",
    label: "Pompages",
    a11yLabel: "Onglet Pompages",
    a11yHint: "Afficher les statistiques des pompages",
  },
  {
    key: "sommeil",
    icon: "bed",
    label: "Sommeil",
    a11yLabel: "Onglet Sommeil",
    a11yHint: "Afficher les statistiques du sommeil",
  },
];

const tabFromParam = (raw: string | undefined): TabKey =>
  raw === "pompages" ? "pompages" : raw === "sommeil" ? "sommeil" : "tetees";
const tabIndexOf = (tab: TabKey) => TAB_CONFIG.findIndex((t) => t.key === tab);

// Number of events received per Firestore listener; null until its first
// snapshot. One reducer instead of five flags: one render per snapshot.
type Source = keyof StatsSplit<unknown>;
type SourceCounts = Record<Source, number | null>;
const NOT_LOADED: SourceCounts = { repas: null, pompages: null, sommeils: null };

const REPAS_TYPES = ["tetee", "biberon", "solide"] as const;
const SOURCE_TYPES: Record<Source, ("tetee" | "biberon" | "solide" | "pompage" | "sommeil")[]> = {
  repas: [...REPAS_TYPES],
  pompages: ["pompage"],
  sommeils: ["sommeil"],
};
const ALL_STATS_TYPES = [...REPAS_TYPES, "pompage", "sommeil"] as const;
const emptySplit = (): StatsSplit<any> => ({ repas: [], pompages: [], sommeils: [] });
const SOURCES: Source[] = ["repas", "pompages", "sommeils"];
// One-shot reads give up after this delay (spinners never hang).
const READ_TIMEOUT_MS = 15_000;
const PROBE_TIMEOUT_MS = 5_000;
const ACCESS_DENIED_MESSAGE = "Accès refusé à ces données";
type CountsAction =
  | { type: "reset" }
  | { type: "loaded"; source: Source; count: number }
  | { type: "failed" };
function countsReducer(state: SourceCounts, action: CountsAction): SourceCounts {
  switch (action.type) {
    case "reset":
      return NOT_LOADED;
    case "loaded":
      return state[action.source] === action.count
        ? state
        : { ...state, [action.source]: action.count };
    case "failed":
      return {
        repas: state.repas ?? 0,
        pompages: state.pompages ?? 0,
        sommeils: state.sommeils ?? 0,
      };
  }
}


export default function StatsScreen() {
  countStatsRender("StatsScreen");
  const mountMarkedRef = useRef(false);
  if (!mountMarkedRef.current) {
    mountMarkedRef.current = true;
    markStatsMount();
  }
  const { activeChild } = useBaby();
  const colorScheme = useColorScheme() ?? "light";
  const nc = useMemo(() => getNeutralColors(colorScheme), [colorScheme]);
  const chartColors = useMemo(() => getChartColors(colorScheme), [colorScheme]);
  const { width: windowWidth } = useWindowDimensions();
  const screenWidth = windowWidth - 40;
  const { setHeaderLeft } = useHeaderLeft();
  const {
    mergedEvents: tetees,
    setFirestoreEvents: setRepasFirestoreEvents,
    remergeIfChanged: remergeRepas,
  } = useMergedOptimisticEvents<any>({
    childId: activeChild?.id,
    // Already sorted by date (descending) by mergeWithFirestoreEvents.
  });
  const {
    mergedEvents: pompages,
    setFirestoreEvents: setPompagesFirestoreEvents,
    remergeIfChanged: remergePompages,
  } = useMergedOptimisticEvents<any>({
    childId: activeChild?.id,
  });
  const {
    mergedEvents: sommeils,
    setFirestoreEvents: setSommeilsFirestoreEvents,
    remergeIfChanged: remergeSommeils,
  } = useMergedOptimisticEvents<any>({
    childId: activeChild?.id,
  });
  const [counts, dispatchCounts] = useReducer(countsReducer, NOT_LOADED);
  const [tabWidth, setTabWidth] = useState(0);
  const underlineX = useRef(new Animated.Value(0)).current;
  const pagerRef = useRef<PagerView>(null);
  const getThisWeekStart = useCallback(() => {
    const now = new Date();
    const day = now.getDay();
    const dayOfWeek = day === 0 ? 7 : day;
    const d = new Date(now);
    d.setDate(d.getDate() - (dayOfWeek - 1));
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);
  const [weekByTab, setWeekByTab] = useState<Record<TabKey, Date>>(() => {
    const w = getThisWeekStart();
    return { tetees: w, pompages: w, sommeil: w };
  });
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [loadError, setLoadError] = useState<string | null>(null);
  // Live listeners cover [liveSince, now]; older weeks are fetched on demand
  // into `history` (docs/STATS_PERF_REFONTE.md, sprint 3).
  const liveRef = useRef<StatsSplit<any>>(emptySplit());
  const historyRef = useRef<StatsSplit<any>>(emptySplit());
  const liveSinceRef = useRef(getLiveSince().getTime());
  const historyFromRef = useRef(liveSinceRef.current);
  const subscriptionRef = useRef(0);
  // Bumped by every listener snapshot: a server read started before a
  // snapshot must not overwrite it (see applyServerRange).
  const liveVersionRef = useRef<Record<Source, number>>({ repas: 0, pompages: 0, sommeils: 0 });
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState(false);
  const [historyRetryKey, setHistoryRetryKey] = useState(0);
  const [refreshFailed, setRefreshFailed] = useState(false);
  const historyFailedForRef = useRef<number | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [showPdfPaywall, setShowPdfPaywall] = useState(false);
  const { checkFeatureAccess } = usePremium();
  const [pompagesDayMs, setPompagesDayMs] = useState<number | null>(null);

  // Récupérer les paramètres de l'URL
  const { tab, returnTo } = useLocalSearchParams();
  const returnTarget = Array.isArray(returnTo) ? returnTo[0] : returnTo;
  const rawTab = Array.isArray(tab) ? tab[0] : tab;

  const [selectedTab, setSelectedTab] = useState<TabKey>(() => tabFromParam(rawTab));
  const selectedTabRef = useRef(selectedTab);
  const initialPageRef = useRef(tabIndexOf(selectedTab));
  // Pages are mounted on their first visit only: opening the screen renders
  // one chart instead of three.
  const [visitedTabs, setVisitedTabs] = useState<Record<TabKey, boolean>>(() => ({
    tetees: false,
    pompages: false,
    sommeil: false,
    [tabFromParam(rawTab)]: true,
  }));
  const selectTab = useCallback((next: TabKey) => {
    selectedTabRef.current = next;
    setSelectedTab(next);
    setVisitedTabs((prev) => (prev[next] ? prev : { ...prev, [next]: true }));
  }, []);
  // Charts mount once the navigation transition is over; a light loader shows
  // meanwhile, so the screen responds from the first frame.
  const [chartsReady, setChartsReady] = useState(false);
  useEffect(() => {
    const ready = () => setChartsReady(true);
    const task = runAfterInteractions(ready);
    // Safety net: an animation registered as an interaction must never keep
    // the charts on the loader.
    const fallback = setTimeout(ready, 400);
    return () => {
      task.cancel();
      clearTimeout(fallback);
    };
  }, []);

  // Mapper le paramètre tab vers l'onglet stats + filtre RepasChart
  const initialTypeFilter = useMemo(
    () =>
      rawTab === "biberons"
        ? "biberons"
        : rawTab === "tetees"
          ? "seins"
          : rawTab === "solides"
            ? "solides"
            : undefined,
    [rawTab],
  );

  // Onglet initial : `initialPage` du pager. Ensuite, suivre les changements
  // du paramètre (l'écran reste monté entre deux navigations).
  const syncedTabParamRef = useRef(rawTab);
  useEffect(() => {
    if (syncedTabParamRef.current === rawTab) return;
    syncedTabParamRef.current = rawTab;
    const next = tabFromParam(rawTab);
    selectTab(next);
    pagerRef.current?.setPageWithoutAnimation(tabIndexOf(next));
  }, [rawTab, selectTab]);

  useEffect(() => {
    if (tabWidth === 0) return;
    const tabIndex = TAB_CONFIG.findIndex((t) => t.key === selectedTab);
    const target = tabIndex * tabWidth;
    Animated.timing(underlineX, {
      toValue: target,
      duration: 220,
      useNativeDriver: true,
    }).start();
  }, [selectedTab, tabWidth, underlineX]);

  const handleTabChange = useCallback(
    (tab: TabKey) => {
      if (tab === selectedTabRef.current) return;
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      pagerRef.current?.setPage(tabIndexOf(tab));
      selectTab(tab);
    },
    [selectTab],
  );

  const handlePageSelected = useCallback(
    (e: { nativeEvent: { position: number } }) => {
      const tab = TAB_CONFIG[e.nativeEvent.position]?.key;
      if (tab && tab !== selectedTabRef.current) {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        selectTab(tab);
      }
    },
    [selectTab],
  );

  // Factored navigation handler
  const navigateReturn = useCallback(() => {
    if (returnTarget === "home") {
      router.replace("/baby/home");
      return true;
    }
    if (returnTarget === "chrono") {
      router.replace("/baby/chrono");
      return true;
    }
    if (returnTarget === "journal") {
      router.replace("/baby/chrono");
      return true;
    }
    router.replace("/baby/plus");
    return true;
  }, [returnTarget]);

  useFocusEffect(
    useCallback(() => {
      if (!returnTarget) {
        setHeaderLeft(null, "stats");
        return () => {
          setHeaderLeft(null, "stats");
        };
      }
      const backButton = (
        <HeaderBackButton
          onPress={() => navigateReturn()}
          tintColor={Colors[colorScheme].text}
        />
      );
      setHeaderLeft(backButton, "stats");

      return () => {
        setHeaderLeft(null, "stats");
      };
    }, [colorScheme, returnTarget, setHeaderLeft, navigateReturn]),
  );

  useFocusEffect(
    useCallback(() => {
      if (!returnTarget) return;
      const subscription = BackHandler.addEventListener(
        "hardwareBackPress",
        navigateReturn,
      );
      return () => subscription.remove();
    }, [returnTarget, navigateReturn]),
  );

  // Error handler for Firestore listeners
  const handleListenerError = useCallback((error?: Error) => {
    const code = (error as { code?: string } | undefined)?.code;
    setLoadError(
      code === "permission-denied" ? ACCESS_DENIED_MESSAGE : "Impossible de charger les données",
    );
    dispatchCounts({ type: "failed" });
  }, []);

  const setFirestoreBySource = useMemo(
    () => ({
      repas: setRepasFirestoreEvents,
      pompages: setPompagesFirestoreEvents,
      sommeils: setSommeilsFirestoreEvents,
    }),
    [setRepasFirestoreEvents, setPompagesFirestoreEvents, setSommeilsFirestoreEvents],
  );
  const pushSource = useCallback(
    (source: Source) => {
      setFirestoreBySource[source](
        combineLiveAndHistory(liveRef.current[source], historyRef.current[source]),
      );
    },
    [setFirestoreBySource],
  );
  const sourceCount = (source: Source) =>
    liveRef.current[source].length + historyRef.current[source].length;

  // Server read of everything loaded so far ([history start, now]): replaces
  // the live part and the loaded history range, keeps older probe events.
  // Used by pull-to-refresh, focus and coming back from background; listeners
  // stay subscribed, so nothing disappears from the screen meanwhile. Tokens
  // are captured before the await so a late answer can be recognised.
  const fetchLoadedRangeFromServer = useCallback(async () => {
    if (!activeChild?.id) return null;
    const subscription = subscriptionRef.current;
    const liveSince = liveSinceRef.current;
    const liveVersions = { ...liveVersionRef.current };
    const from = Math.min(historyFromRef.current, liveSince);
    const events = await withTimeout(
      obtenirEvenements(activeChild.id, {
        type: [...ALL_STATS_TYPES],
        depuis: new Date(from),
        source: "server",
      }),
      READ_TIMEOUT_MS,
    );
    return { events, from, liveSince, liveVersions, subscription };
  }, [activeChild?.id]);
  const applyServerRange = useCallback(
    (result: Awaited<ReturnType<typeof fetchLoadedRangeFromServer>>) => {
      if (!result || result.subscription !== subscriptionRef.current) return;
      const split = splitStatsEventsByType(result.events);
      SOURCES.forEach((source) => {
        const fresh = split[source];
        // A snapshot arrived during the read: the listener is newer, keep it.
        if (liveVersionRef.current[source] === result.liveVersions[source]) {
          liveRef.current[source] = fresh.filter((e) => toMillis(e.date) >= result.liveSince);
        }
        historyRef.current[source] = [
          ...fresh.filter((e) => toMillis(e.date) < result.liveSince),
          ...historyRef.current[source].filter((e) => toMillis(e.date) < result.from),
        ];
        pushSource(source);
      });
    },
    [pushSource],
  );

  useForegroundServerRefresh({
    enabled: !!activeChild?.id,
    childId: activeChild?.id,
    refresh: fetchLoadedRangeFromServer,
    apply: applyServerRange,
  });

  useEffect(() => {
    if (!activeChild?.id) return;
    const childId = activeChild.id;
    const subscription = ++subscriptionRef.current;
    const isCurrent = () => subscriptionRef.current === subscription;

    // Reset before subscribing (child change or retry after an error). The
    // merged lists themselves are reset by useMergedOptimisticEvents on child change.
    setLoadError(null);
    dispatchCounts({ type: "reset" });
    liveRef.current = emptySplit();
    historyRef.current = emptySplit();
    liveSinceRef.current = getLiveSince().getTime();
    historyFromRef.current = liveSinceRef.current;
    historyFailedForRef.current = null;
    setHistoryError(false);
    setRefreshFailed(false);
    const liveSince = new Date(liveSinceRef.current);
    const probed: Record<Source, boolean> = { repas: false, pompages: false, sommeils: false };

    const subscribe = (source: Source) =>
      ecouterEvenements(
        childId,
        (events) => {
          if (!isCurrent()) return;
          liveVersionRef.current[source] += 1;
          liveRef.current[source] = events;
          pushSource(source);
          if (events.length > 0 || historyRef.current[source].length > 0 || probed[source]) {
            dispatchCounts({ type: "loaded", source, count: sourceCount(source) });
            return;
          }
          // Nothing in the window: look for one older event so an account with
          // only older data still gets its charts (and week navigation)
          // instead of the "no data" screen.
          probed[source] = true;
          withTimeout(
            obtenirEvenements(childId, {
              type: SOURCE_TYPES[source],
              jusqu: new Date(liveSinceRef.current - 1),
              limite: 1,
              // The server, not a possibly empty offline cache, says whether
              // older data exists.
              source: "server",
            }),
            PROBE_TIMEOUT_MS,
          )
            .then((older) => {
              if (!isCurrent()) return;
              historyRef.current[source] = mergeFirestoreSnapshots(
                historyRef.current[source],
                older,
              );
              pushSource(source);
            })
            .catch(() => {
              // Offline or timeout: show what the window has (empty state, as
              // before) and probe again on the next snapshot.
              probed[source] = false;
            })
            .finally(() => {
              if (!isCurrent()) return;
              dispatchCounts({ type: "loaded", source, count: sourceCount(source) });
            });
        },
        {
          type: SOURCE_TYPES[source],
          depuis: liveSince,
          waitForServer: true,
          cacheFirst: true,
        },
        handleListenerError,
      );

    const unsubscribers = [subscribe("repas"), subscribe("pompages"), subscribe("sommeils")];
    return () => unsubscribers.forEach((unsubscribe) => unsubscribe());
  }, [activeChild?.id, refreshKey, handleListenerError, pushSource]);

  // Re-merge on tab focus — frozen tabs can miss optimistic updates. Only
  // emits when the merged lists actually changed (no re-render otherwise).
  // Weeks older than the live window have no listener: when some were
  // loaded, re-read them on return so edits made elsewhere show up.
  useFocusEffect(
    useCallback(() => {
      remergeRepas();
      remergePompages();
      remergeSommeils();
      if (historyFromRef.current < liveSinceRef.current) {
        fetchLoadedRangeFromServer()
          .then(applyServerRange)
          .catch(() => {
            // Opportunistic; pull-to-refresh reports failures.
          });
      }
    }, [
      applyServerRange,
      fetchLoadedRangeFromServer,
      remergePompages,
      remergeRepas,
      remergeSommeils,
    ]),
  );

  const repasCount = counts.repas;
  const isTeteesLoading = repasCount === null;
  const isPompagesLoading = counts.pompages === null;
  const isSommeilLoading = counts.sommeils === null;
  // A snapshot is merged after a short debounce: while events were received
  // but the merged list is still empty, keep the loader instead of flashing
  // the empty state (replaces the former fixed 300 ms delays).
  // Once a source has been shown, it stays shown until the next reset: a first
  // event arriving on an empty list must not remount the chart (losing its
  // week and filter) during the merge debounce.
  const shownRef = useRef({ tetees: false, pompages: false, sommeil: false });
  if (counts === NOT_LOADED) {
    shownRef.current = { tetees: false, pompages: false, sommeil: false };
  }
  const isTeteesReady =
    !isTeteesLoading &&
    (shownRef.current.tetees || repasCount === 0 || tetees.length > 0);
  const isPompagesReady =
    !isPompagesLoading &&
    (shownRef.current.pompages || counts.pompages === 0 || pompages.length > 0);
  const isSommeilReady =
    !isSommeilLoading &&
    (shownRef.current.sommeil || counts.sommeils === 0 || sommeils.length > 0);
  shownRef.current = {
    tetees: isTeteesReady,
    pompages: isPompagesReady,
    sommeil: isSommeilReady,
  };
  const isAllReady = isTeteesReady && isPompagesReady && isSommeilReady;

  // Once the first chart is on screen, mount the other tabs in the background
  // so a later swipe shows them at once.
  const activeTabReady =
    selectedTab === "tetees"
      ? isTeteesReady
      : selectedTab === "pompages"
        ? isPompagesReady
        : isSommeilReady;
  const prewarmDone = visitedTabs.tetees && visitedTabs.pompages && visitedTabs.sommeil;
  useEffect(() => {
    if (!chartsReady || !activeTabReady || prewarmDone) return;
    const prewarm = () =>
      setVisitedTabs({ tetees: true, pompages: true, sommeil: true });
    const task = runAfterInteractions(prewarm);
    const fallback = setTimeout(prewarm, 800);
    return () => {
      task.cancel();
      clearTimeout(fallback);
    };
  }, [chartsReady, activeTabReady, prewarmDone]);


  // Per-tab week change callbacks
  // Same week → same state object: no re-render when a chart reports the
  // week it already shows (it does so on mount).
  const setTabWeek = useCallback((tab: TabKey, ws: Date) => {
    setWeekByTab((prev) =>
      prev[tab].getTime() === ws.getTime() ? prev : { ...prev, [tab]: ws },
    );
  }, []);
  const handleRepasWeekChange = useCallback(
    (ws: Date) => setTabWeek("tetees", ws),
    [setTabWeek],
  );
  const handlePompagesWeekChange = useCallback(
    (ws: Date) => setTabWeek("pompages", ws),
    [setTabWeek],
  );
  const handleSommeilWeekChange = useCallback(
    (ws: Date) => setTabWeek("sommeil", ws),
    [setTabWeek],
  );

  // Displayed week = the active tab's week
  const displayWeek = weekByTab[selectedTab];

  // Weekly counts for resume cards — synced with displayed week
  const thisWeekCounts = useMemo(() => {
    const startMs = displayWeek.getTime();
    const endMs = addWeeks(displayWeek, 1).getTime();
    return {
      repas: countInRange(tetees, startMs, endMs),
      pompages: countInRange(pompages, startMs, endMs),
      sommeil: countInRange(sommeils, startMs, endMs),
    };
  }, [tetees, pompages, sommeils, displayWeek]);

  // Week label for resume cards
  const weekLabel = useMemo(() => {
    const weekEnd = new Date(displayWeek);
    weekEnd.setDate(weekEnd.getDate() + 6);
    const fmt = (d: Date) =>
      d.toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
    return `${fmt(displayWeek)} – ${fmt(weekEnd)}`;
  }, [displayWeek]);

  // Pull-to-refresh: one server read of the loaded range; the charts keep
  // their data on screen meanwhile.
  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true);
    try {
      applyServerRange(await fetchLoadedRangeFromServer());
      setRefreshFailed(false);
    } catch {
      // Keep what is displayed (listeners stay subscribed) and say it was
      // not updated. The read error itself is reported by eventsService.
      setRefreshFailed(true);
    } finally {
      setIsRefreshing(false);
    }
  }, [applyServerRange, fetchLoadedRangeFromServer]);

  // After a listener error: subscribe again from scratch.
  const handleRetry = useCallback(() => {
    dispatchCounts({ type: "reset" });
    setRefreshKey((k) => k + 1);
  }, []);

  const handlePompagesDayChange = useCallback((day: Date) => {
    const ms = day.getTime();
    setPompagesDayMs((prev) => (prev === ms ? prev : ms));
  }, []);

  // Older weeks on demand: when a chart shows a week (or the pumping chart a
  // day) before what is loaded, fetch the missing range once.
  const earliestNeededMs = useMemo(
    () =>
      getEarliestNeededMs(
        [weekByTab.tetees, weekByTab.pompages, weekByTab.sommeil],
        pompagesDayMs === null ? [] : [pompagesDayMs],
      ),
    [weekByTab, pompagesDayMs],
  );
  // A failed load is not retried for the same need (no loop when offline):
  // the user sees "unavailable · retry", and moving to another week retries.
  useEffect(() => {
    if (!activeChild?.id || historyLoading || loadError) return;
    if (historyFailedForRef.current !== null) {
      if (historyFailedForRef.current === earliestNeededMs) return;
      historyFailedForRef.current = null;
      setHistoryError(false);
    }
    const range = getHistoryRangeToLoad(earliestNeededMs, historyFromRef.current);
    if (!range) return;
    const subscription = subscriptionRef.current;
    setHistoryLoading(true);
    // Server read: offline, an empty cache answer would mark these weeks as
    // loaded with zero events.
    withTimeout(
      obtenirEvenements(activeChild.id, {
        type: [...ALL_STATS_TYPES],
        depuis: range.from,
        jusqu: range.to,
        source: "server",
      }),
      READ_TIMEOUT_MS,
    )
      .then((events) => {
        if (subscriptionRef.current !== subscription) return;
        historyFromRef.current = range.from.getTime();
        const split = splitStatsEventsByType(events);
        SOURCES.forEach((source) => {
          historyRef.current[source] = mergeFirestoreSnapshots(
            historyRef.current[source],
            split[source],
          );
          pushSource(source);
        });
      })
      .catch(() => {
        if (subscriptionRef.current !== subscription) return;
        historyFailedForRef.current = earliestNeededMs;
        setHistoryError(true);
      })
      .finally(() => setHistoryLoading(false));
  }, [activeChild?.id, earliestNeededMs, historyLoading, historyRetryKey, loadError, pushSource]);

  const retryHistory = useCallback(() => {
    historyFailedForRef.current = null;
    setHistoryError(false);
    setHistoryRetryKey((k) => k + 1);
  }, []);

  const repasBoundaryExtras = useMemo(
    () => ({ childId: activeChild?.id, count: tetees.length }),
    [activeChild?.id, tetees.length],
  );
  const pompagesBoundaryExtras = useMemo(
    () => ({ childId: activeChild?.id, count: pompages.length }),
    [activeChild?.id, pompages.length],
  );
  const sommeilBoundaryExtras = useMemo(
    () => ({ childId: activeChild?.id, sleepCount: sommeils.length }),
    [activeChild?.id, sommeils.length],
  );

  // PDF Export — 3-month weekly trend report
  const exportReport = useCallback(async (): Promise<boolean> => {
    const name = activeChild?.name || "Bébé";
    const now = new Date();
    const dateStr = now.toLocaleDateString("fr-FR", {
      day: "numeric",
      month: "long",
      year: "numeric",
    });

    const fmtH = (min: number) => {
      const h = Math.floor(min / 60);
      const m = Math.round(min % 60);
      return h > 0
        ? `${h}h${m > 0 ? m.toString().padStart(2, "0") : ""}`
        : `${m}min`;
    };

    // The screen only holds a few weeks: read the 12 report weeks once, and
    // keep the on-screen versions (optimistic edits) for ids present in both.
    let report: StatsSplit<any> = { repas: tetees, pompages, sommeils };
    let partialSince: Date | null = null;
    if (activeChild?.id) {
      try {
        const fetched = splitStatsEventsByType(
          await withTimeout(
            obtenirEvenements(activeChild.id, {
              type: [...ALL_STATS_TYPES],
              depuis: new Date(getReportWeekBoundaries(now)[0]),
              source: "server",
            }),
            READ_TIMEOUT_MS,
          ),
        );
        report = {
          repas: mergeFirestoreSnapshots(tetees, fetched.repas),
          pompages: mergeFirestoreSnapshots(pompages, fetched.pompages),
          sommeils: mergeFirestoreSnapshots(sommeils, fetched.sommeils),
        };
      } catch {
        // Offline: this report goes to a doctor, never pass partial weeks
        // off as complete. Ask, and say it in the document if accepted.
        const loadedFrom = new Date(Math.min(historyFromRef.current, liveSinceRef.current));
        const proceed = await new Promise<boolean>((resolve) =>
          Alert.alert(
            "Rapport incomplet",
            `Hors connexion, le rapport ne couvrira que les données depuis le ${loadedFrom.toLocaleDateString("fr-FR", { day: "numeric", month: "long" })}.`,
            [
              { text: "Annuler", style: "cancel", onPress: () => resolve(false) },
              { text: "Continuer", onPress: () => resolve(true) },
            ],
            { cancelable: true, onDismiss: () => resolve(false) },
          ),
        );
        if (!proceed) return false;
        partialSince = loadedFrom;
      }
    }

    // 12 weekly rows, one pass per event list
    const weekRows = buildReportWeekRows(report.repas, report.pompages, report.sommeils, now);

    const locLabel: Record<string, string> = {
      lit: "Lit",
      cododo: "Co-dodo",
      poussette: "Poussette",
      voiture: "Voiture",
      autre: "Autre",
    };
    const fmtLieux = (lieux: Record<string, number>) => {
      return (
        Object.entries(lieux)
          .filter(([_, v]) => v > 0)
          .map(([k, v]) => `${locLabel[k] || k}: ${v}`)
          .join(", ") || "—"
      );
    };

    const repasRows = weekRows
      .map(
        (r) =>
          `<tr><td>${r.label}</td><td>${r.tetees}</td><td>${r.biberons}</td><td>${r.solides}</td><td><b>${r.repasTotal}</b></td></tr>`,
      )
      .join("");

    const pompagesRows = weekRows
      .map(
        (r) =>
          `<tr><td>${r.label}</td><td>${r.pompages}</td><td>${r.pompagesMl > 0 ? r.pompagesMl + " ml" : "—"}</td></tr>`,
      )
      .join("");

    const sommeilRows = weekRows
      .map(
        (r) =>
          `<tr><td>${r.label}</td><td>${r.nuits}</td><td>${fmtLieux(r.nuitLieux)}</td><td>${r.siestes}</td><td>${fmtLieux(r.siesteLieux)}</td><td>${fmtH(r.sommeilMinutes)}</td></tr>`,
      )
      .join("");

    // Current week summary
    const cw = weekRows[weekRows.length - 1];

    const html = `
      <html>
      <head><meta charset="utf-8"><style>
        body { font-family: -apple-system, Helvetica, sans-serif; padding: 28px; color: #1e2a36; font-size: 12px; }
        h1 { font-size: 20px; color: #6366f1; margin-bottom: 2px; }
        h2 { font-size: 15px; color: #374151; margin-top: 22px; margin-bottom: 8px; border-bottom: 2px solid #e5e7eb; padding-bottom: 4px; }
        .subtitle { font-size: 12px; color: #9ca3af; margin-bottom: 16px; }
        .grid { display: flex; gap: 10px; margin: 10px 0 16px; }
        .card { flex: 1; border: 1px solid #e5e7eb; border-radius: 10px; padding: 12px; text-align: center; }
        .card-value { font-size: 24px; font-weight: 700; }
        .card-label { font-size: 10px; color: #6b7280; margin-top: 3px; }
        .blue { color: #2f80ed; } .green { color: #2e7d32; } .purple { color: #7c3aed; }
        table { width: 100%; border-collapse: collapse; margin-top: 6px; font-size: 11px; }
        th { background: #f3f4f6; color: #374151; font-weight: 600; text-align: left; padding: 6px 8px; border: 1px solid #e5e7eb; }
        td { padding: 5px 8px; border: 1px solid #e5e7eb; }
        tr:nth-child(even) { background: #f9fafb; }
        .footer { margin-top: 28px; font-size: 10px; color: #9ca3af; text-align: center; border-top: 1px solid #e5e7eb; padding-top: 10px; }
        .section-icon { display: inline-block; width: 18px; height: 18px; border-radius: 4px; text-align: center; line-height: 18px; font-size: 11px; margin-right: 6px; vertical-align: middle; }
      </style></head>
      <body>
        <h1>Rapport 3 mois — ${name}</h1>
        <div class="subtitle">${dateStr} · Tendance sur 12 semaines</div>
        ${buildAllergiesReportLine(activeChild?.allergies)}
        ${
          partialSince
            ? `<div class="subtitle" style="color:#b45309">Données partielles : généré hors connexion, semaines antérieures au ${partialSince.toLocaleDateString("fr-FR")} non incluses.</div>`
            : ""
        }

        <div class="grid">
          <div class="card">
            <div class="card-value blue">${cw.repasTotal}</div>
            <div class="card-label">Repas cette semaine</div>
          </div>
          <div class="card">
            <div class="card-value green">${cw.pompages}</div>
            <div class="card-label">Pompages cette semaine</div>
          </div>
          <div class="card">
            <div class="card-value purple">${cw.sommeilTotal}</div>
            <div class="card-label">Sommeils cette semaine</div>
          </div>
        </div>

        <h2>🍽 Repas — Évolution hebdomadaire</h2>
        <table>
          <tr><th>Semaine</th><th>Tétées</th><th>Biberons</th><th>Solides</th><th>Total</th></tr>
          ${repasRows}
        </table>

        <h2>🍼 Pompages — Évolution hebdomadaire</h2>
        <table>
          <tr><th>Semaine</th><th>Sessions</th><th>Volume</th></tr>
          ${pompagesRows}
        </table>

        <h2>😴 Sommeil — Évolution hebdomadaire</h2>
        <table>
          <tr><th>Semaine</th><th>Nuits</th><th>Lieux (nuit)</th><th>Siestes</th><th>Lieux (sieste)</th><th>Durée totale</th></tr>
          ${sommeilRows}
        </table>

        <div class="footer">Généré par ${APP_NAME} · ${dateStr}</div>
      </body>
      </html>
    `;

    let uri: string;
    try {
      ({ uri } = await Print.printToFileAsync({ html, base64: false }));
    } catch (e) {
      captureServiceError(e, { service: "stats", operation: "exportPDF.print" });
      Alert.alert("Export impossible", "Le PDF n'a pas pu être généré. Réessayez.");
      return false;
    }
    try {
      // Moved to the exports folder, purged after ~1h (not right after the
      // share: the receiving app may read it later). It holds health data.
      uri = await adoptTempFile(uri, `suivibaby_stats_${Date.now()}.pdf`);
      const shared = await shareTempFile(uri, {
        mimeType: "application/pdf",
        UTI: "com.adobe.pdf",
      });
      if (!shared) {
        await deleteTempFile(uri);
        Alert.alert("Partage indisponible", "Le partage n'est pas disponible sur cet appareil.");
        return false;
      }
    } catch (e) {
      // Usually the user closing the share sheet; reported in case it is not.
      captureServiceError(e, { service: "stats", operation: "exportPDF.share" });
      return false;
    }
    return true;
  }, [activeChild?.id, activeChild?.name, activeChild?.allergies, tetees, pompages, sommeils]);

  const handleExportPDF = useCallback(async () => {
    if (isExporting) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setIsExporting(true);
    try {
      // Premium/Famille/grandfathered: illimité. Free: 1 essai (quota serveur).
      const hasAccess = checkFeatureAccess("pdf_export");
      let quota: UsageQuotaStatus | null = null;
      if (!hasAccess) {
        try {
          quota = await getExportUsageStatus();
        } catch (e) {
          captureServiceError(e, { service: "stats", operation: "exportPDF.quotaStatus" });
        }
      }
      const decision = decidePdfExportAccess(hasAccess, quota);
      if (decision === "error") {
        Alert.alert(
          "Vérification impossible",
          "Impossible de vérifier votre accès à l'export PDF. Vérifiez votre connexion et réessayez.",
        );
        return;
      }
      if (decision === "paywall") {
        setShowPdfPaywall(true);
        return;
      }
      const ok = await exportReport();
      if (ok && decision === "allow_trial" && activeChild?.id) {
        try {
          await consumeExportQuota([activeChild.id]);
        } catch (e) {
          captureServiceError(e, { service: "stats", operation: "exportPDF.consumeQuota" });
        }
      }
    } catch (e) {
      captureServiceError(e, { service: "stats", operation: "exportPDF" });
      Alert.alert("Export impossible", "Le rapport n'a pas pu être préparé. Réessayez.");
    } finally {
      setIsExporting(false);
    }
  }, [isExporting, exportReport, checkFeatureAccess, activeChild?.id]);

  // Refresh tint color: use chart accent per tab
  const refreshTintColor =
    selectedTab === "tetees"
      ? chartColors.tetees.blue
      : selectedTab === "pompages"
        ? chartColors.pompages.green
        : chartColors.sommeil.purple;

  const pageDots = (
    <View style={styles.dotsContainer}>
      {TAB_CONFIG.map((tabItem) => {
        const isActive = selectedTab === tabItem.key;
        const dotColor = isActive
          ? tabItem.key === "tetees"
            ? chartColors.tetees.blue
            : tabItem.key === "pompages"
              ? chartColors.pompages.green
              : chartColors.sommeil.purple
          : nc.textMuted;
        return (
          <View
            key={tabItem.key}
            style={[
              styles.dot,
              { backgroundColor: dotColor },
              isActive && styles.dotActive,
            ]}
          />
        );
      })}
    </View>
  );

  return (
    <View style={[styles.container, { backgroundColor: nc.background }]}>
      {showPdfPaywall && (
        <PaywallPrompt
          trigger="pdf_export_limit"
          variant="banner"
          onDismiss={() => setShowPdfPaywall(false)}
        />
      )}
      {/* BOUTONS DE SÉLECTION (icônes) */}
      <View
        style={styles.tabContainer}
        onLayout={(event) => {
          const width = Math.floor(
            event.nativeEvent.layout.width / TAB_CONFIG.length,
          );
          if (width !== tabWidth) setTabWidth(width);
        }}
        accessibilityRole="tablist"
      >
        {TAB_CONFIG.map((tabItem) => {
          const isActive = selectedTab === tabItem.key;
          const activeColor =
            tabItem.key === "tetees"
              ? chartColors.tetees.blue
              : tabItem.key === "pompages"
                ? chartColors.pompages.green
                : chartColors.sommeil.purple;
          return (
            <TouchableOpacity
              key={tabItem.key}
              style={styles.tabButton}
              onPress={() => handleTabChange(tabItem.key)}
              accessibilityRole="tab"
              accessibilityState={{ selected: isActive }}
              accessibilityLabel={tabItem.a11yLabel}
              accessibilityHint={tabItem.a11yHint}
            >
              <FontAwesome
                name={tabItem.icon}
                size={22}
                color={isActive ? activeColor : nc.textMuted}
              />
              <Text
                style={[
                  styles.tabLabel,
                  { color: nc.textLight },
                  isActive && { color: activeColor, fontWeight: "700" },
                ]}
              >
                {tabItem.label}
              </Text>
            </TouchableOpacity>
          );
        })}
        {tabWidth > 0 && (
          <Animated.View
            pointerEvents="none"
            style={[
              styles.tabUnderline,
              {
                width: tabWidth,
                transform: [{ translateX: underlineX }],
                backgroundColor:
                  selectedTab === "tetees"
                    ? chartColors.tetees.blue
                    : selectedTab === "pompages"
                      ? chartColors.pompages.green
                      : chartColors.sommeil.purple,
              },
            ]}
          />
        )}
      </View>

      {/* RESUME CARDS + EXPORT */}
      {!loadError && (
          <View>
            <View style={styles.weekLabelRow}>
              <Text style={[styles.weekLabel, { color: nc.textLight }]}>
                {weekLabel}
              </Text>
              {historyLoading && (
                <ActivityIndicator
                  size="small"
                  color={nc.textMuted}
                  accessibilityLabel="Chargement des semaines précédentes"
                />
              )}
            </View>
            {!historyLoading && historyError && (
              <TouchableOpacity
                onPress={retryHistory}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                accessibilityRole="button"
                accessibilityLabel="Semaines précédentes indisponibles, réessayer"
              >
                <Text style={[styles.statusNote, { color: nc.errorText }]}>
                  Semaines précédentes indisponibles · Réessayer
                </Text>
              </TouchableOpacity>
            )}
            {refreshFailed && (
              <Text style={[styles.statusNote, { color: nc.textLight }]}>
                Actualisation impossible, données non mises à jour
              </Text>
            )}
            <View style={styles.resumeRow}>
              <TouchableOpacity
                style={[
                  styles.resumeCard,
                  { borderColor: chartColors.tetees.blue + "40" },
                ]}
                onPress={() => handleTabChange("tetees")}
                accessibilityRole="button"
                accessibilityLabel={
                  isTeteesReady
                    ? `${thisWeekCounts.repas} repas cette semaine`
                    : "Résumé repas, chargement"
                }
                accessibilityHint="Affiche le détail"
              >
                <FontAwesome
                  name="utensils"
                  size={14}
                  color={chartColors.tetees.blue}
                />
                {isTeteesReady ? (
                  <Text
                    style={[
                      styles.resumeValue,
                      { color: nc.textStrong },
                    ]}
                  >
                    {thisWeekCounts.repas}
                  </Text>
                ) : (
                  <SkeletonBlock width={22} height={18} radius={4} />
                )}
                <Text style={[styles.resumeLabel, { color: nc.textLight }]}>
                  repas
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.resumeCard,
                  { borderColor: chartColors.pompages.green + "40" },
                ]}
                onPress={() => handleTabChange("pompages")}
                accessibilityRole="button"
                accessibilityLabel={
                  isPompagesReady
                    ? `${thisWeekCounts.pompages} pompages cette semaine`
                    : "Résumé pompages, chargement"
                }
                accessibilityHint="Affiche le détail"
              >
                <FontAwesome
                  name="pump-medical"
                  size={14}
                  color={chartColors.pompages.green}
                />
                {isPompagesReady ? (
                  <Text
                    style={[
                      styles.resumeValue,
                      { color: nc.textStrong },
                    ]}
                  >
                    {thisWeekCounts.pompages}
                  </Text>
                ) : (
                  <SkeletonBlock width={22} height={18} radius={4} />
                )}
                <Text style={[styles.resumeLabel, { color: nc.textLight }]}>
                  pompages
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.resumeCard,
                  { borderColor: chartColors.sommeil.purple + "40" },
                ]}
                onPress={() => handleTabChange("sommeil")}
                accessibilityRole="button"
                accessibilityLabel={
                  isSommeilReady
                    ? `${thisWeekCounts.sommeil} sommeils cette semaine`
                    : "Résumé sommeil, chargement"
                }
                accessibilityHint="Affiche le détail"
              >
                <FontAwesome
                  name="bed"
                  size={14}
                  color={chartColors.sommeil.purple}
                />
                {isSommeilReady ? (
                  <Text
                    style={[
                      styles.resumeValue,
                      { color: nc.textStrong },
                    ]}
                  >
                    {thisWeekCounts.sommeil}
                  </Text>
                ) : (
                  <SkeletonBlock width={22} height={18} radius={4} />
                )}
                <Text style={[styles.resumeLabel, { color: nc.textLight }]}>
                  sommeils
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.exportButton,
                  { borderColor: nc.border },
                  !isAllReady && { opacity: 0.4 },
                ]}
                onPress={handleExportPDF}
                disabled={!isAllReady || isExporting}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                accessibilityRole="button"
                accessibilityLabel="Exporter le rapport en PDF"
              >
                {isExporting ? (
                  <ActivityIndicator size="small" color={nc.textMuted} />
                ) : (
                  <FontAwesome name="file-pdf" size={16} color={nc.textMuted} />
                )}
              </TouchableOpacity>
            </View>
          </View>
        )}

      {loadError ? (
        <View style={styles.errorContainer}>
          <FontAwesome name="wifi" size={40} color={nc.textMuted} />
          <Text style={[styles.errorTitle, { color: nc.textNormal }]}>
            {loadError}
          </Text>
          <Text style={[styles.errorSubtitle, { color: nc.textLight }]}>
            {loadError === ACCESS_DENIED_MESSAGE
              ? "Votre accès à ce profil a peut-être changé"
              : "Vérifiez votre connexion internet"}
          </Text>
          <TouchableOpacity
            style={[styles.retryButton, { backgroundColor: refreshTintColor }]}
            onPress={handleRetry}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            accessibilityRole="button"
            accessibilityLabel="Réessayer le chargement"
          >
            <FontAwesome name="arrows-rotate" size={14} color={nc.white} />
            <Text style={[styles.retryText, { color: nc.white }]}>
              Réessayer
            </Text>
          </TouchableOpacity>
        </View>
      ) : (
        <View style={styles.pagerWrapper}>
          <PagerView
            ref={pagerRef}
            style={styles.pager}
            initialPage={initialPageRef.current}
            onPageSelected={handlePageSelected}
            overdrag
          >
            <ScrollView
              key="repas"
              contentContainerStyle={styles.scrollContainer}
              keyboardShouldPersistTaps="handled"
              nestedScrollEnabled
              refreshControl={
                <RefreshControl
                  refreshing={isRefreshing}
                  onRefresh={handleRefresh}
                  tintColor={chartColors.tetees.blue}
                />
              }
            >
              {!chartsReady || !visitedTabs.tetees || !isTeteesReady ? (
                <View style={styles.loaderContainer}>
                  <IconPulseDots color={chartColors.tetees.blue} />
                </View>
              ) : (
                <SafeBoundary
                  name="stats.RepasChart"
                  extras={repasBoundaryExtras}
                >
                  <RepasChart
                    tetees={tetees}
                    initialTypeFilter={initialTypeFilter}
                    colorScheme={colorScheme}
                    screenWidth={screenWidth}
                    onWeekChange={handleRepasWeekChange}
                  />
                </SafeBoundary>
              )}
            </ScrollView>
            <ScrollView
              key="pompages"
              contentContainerStyle={styles.scrollContainer}
              keyboardShouldPersistTaps="handled"
              nestedScrollEnabled
              refreshControl={
                <RefreshControl
                  refreshing={isRefreshing}
                  onRefresh={handleRefresh}
                  tintColor={chartColors.pompages.green}
                />
              }
            >
              {!chartsReady || !visitedTabs.pompages || !isPompagesReady ? (
                <View style={styles.loaderContainer}>
                  <IconPulseDots color={chartColors.pompages.green} />
                </View>
              ) : (
                <SafeBoundary
                  name="stats.PompagesChart"
                  extras={pompagesBoundaryExtras}
                >
                  <PompagesChart
                    pompages={pompages}
                    colorScheme={colorScheme}
                    screenWidth={screenWidth}
                    onWeekChange={handlePompagesWeekChange}
                    onDayChange={handlePompagesDayChange}
                  />
                </SafeBoundary>
              )}
            </ScrollView>
            <ScrollView
              key="sommeil"
              contentContainerStyle={styles.scrollContainer}
              keyboardShouldPersistTaps="handled"
              nestedScrollEnabled
              refreshControl={
                <RefreshControl
                  refreshing={isRefreshing}
                  onRefresh={handleRefresh}
                  tintColor={chartColors.sommeil.purple}
                />
              }
            >
              {!chartsReady || !visitedTabs.sommeil || !isSommeilReady ? (
                <View style={styles.loaderContainer}>
                  <IconPulseDots color={chartColors.sommeil.purple} />
                </View>
              ) : (
                <SafeBoundary
                  name="stats.SommeilChart"
                  extras={sommeilBoundaryExtras}
                >
                  <SommeilChart
                    sommeils={sommeils}
                    repas={tetees}
                    babyName={activeChild?.name}
                    colorScheme={colorScheme}
                    screenWidth={screenWidth}
                    onWeekChange={handleSommeilWeekChange}
                  />
                </SafeBoundary>
              )}
            </ScrollView>
          </PagerView>
        </View>
      )}
      {/* Page dots */}
      {!loadError && pageDots}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  tabContainer: {
    flexDirection: "row",
    justifyContent: "center",
    marginHorizontal: 20,
    paddingVertical: 8,
    marginBottom: 10,
    position: "relative",
  },
  tabButton: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 12,
    flex: 1,
    alignItems: "center",
    gap: 4,
  },
  tabLabel: {
    fontSize: 12,
    fontWeight: "600",
    textAlign: "center",
  },
  tabUnderline: {
    position: "absolute",
    bottom: 0,
    left: 0,
    height: 2,
    borderRadius: 2,
  },
  scrollContainer: {
    flexGrow: 1,
    alignItems: "center",
    // paddingBottom: 8,
  },
  loaderContainer: {
    flex: 1,
    width: "100%",
    minHeight: 300,
    justifyContent: "center",
    alignItems: "center",
  },
  errorContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 40,
    gap: 8,
  },
  errorTitle: {
    fontSize: 17,
    fontWeight: "600",
    marginTop: 12,
    textAlign: "center",
  },
  errorSubtitle: {
    fontSize: 14,
    textAlign: "center",
  },
  retryButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 16,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 12,
  },
  retryText: {
    fontSize: 15,
    fontWeight: "600",
  },
  statusNote: {
    fontSize: 12,
    textAlign: "center",
    marginBottom: 4,
  },
  weekLabelRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  weekLabel: {
    fontSize: 12,
    fontWeight: "600",
    textAlign: "center",
    marginBottom: 6,
    textTransform: "capitalize",
  },
  resumeRow: {
    flexDirection: "row",
    gap: 10,
    marginHorizontal: 20,
    marginBottom: 10,
  },
  resumeCard: {
    flex: 1,
    alignItems: "center",
    gap: 4,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
  },
  resumeValue: {
    fontSize: 18,
    fontWeight: "700",
  },
  resumeLabel: {
    fontSize: 12,
    fontWeight: "600",
  },
  exportButton: {
    justifyContent: "center",
    alignItems: "center",
    width: 40,
    borderRadius: 12,
    borderWidth: 1,
  },
  pagerWrapper: {
    flex: 1,
  },
  pager: {
    flex: 1,
  },
  dotsContainer: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 6,
    paddingVertical: 16,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    opacity: 0.4,
  },
  dotActive: {
    width: 8,
    height: 8,
    borderRadius: 4,
    opacity: 1,
  },
});
