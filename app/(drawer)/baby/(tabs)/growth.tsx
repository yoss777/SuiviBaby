import { CroissanceEditData } from "@/components/forms/CroissanceForm";
import { ThemedText } from "@/components/themed-text";
import { DateFilterBar } from "@/components/ui/DateFilterBar";
import { LoadMoreButton } from "@/components/ui/LoadMoreButton";
import { SelectionToolbar } from "@/components/ui/SelectionToolbar";
import { HeaderMenu, HeaderMenuItem } from "@/components/ui/HeaderMenu";
import { eventColors } from "@/constants/eventColors";
import { MAX_AUTO_LOAD_ATTEMPTS } from "@/constants/pagination";
import { getNeutralColors, getBackgroundTint } from "@/constants/dashboardColors";
import { Colors } from "@/constants/theme";
import { useBaby } from "@/contexts/BabyContext";
import { useSheet } from "@/contexts/SheetContext";
import { useToast } from "@/contexts/ToastContext";
import { useBatchSelect } from "@/hooks/useBatchSelect";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { useMergedOptimisticEvents } from "@/hooks/useMergedOptimisticEvents";
import { useSwipeHint } from "@/hooks/useSwipeHint";
import {
  ecouterCroissancesHybrid,
  getNextEventDateBeforeHybrid,
  hasMoreEventsBeforeHybrid,
} from "@/migration/eventsHybridService";
import { CroissanceEvent, obtenirEvenements } from "@/services/eventsService";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import FontAwesome from "@expo/vector-icons/FontAwesome6";
import { HeaderBackButton } from "@react-navigation/elements";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import { router, useLocalSearchParams } from "expo-router";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Animated,
  BackHandler,
  FlatList,
  InteractionManager,
  LayoutAnimation,
  Platform,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  UIManager,
  View
} from "react-native";
import { Calendar, DateData } from "react-native-calendars";
import { SafeAreaView } from "react-native-safe-area-context";
import { useHeaderLeft, useHeaderRight } from "../../_layout";
import { ConfirmModal } from "@/components/ui/ConfirmModal";
import { supprimerCroissance } from "@/migration/eventsDoubleWriteService";
import * as Haptics from "expo-haptics";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import ReanimatedSwipeable from "react-native-gesture-handler/ReanimatedSwipeable";

// Enable LayoutAnimation on Android
if (
  Platform.OS === "android" &&
  UIManager.setLayoutAnimationEnabledExperimental
) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

// ============================================
// TYPES
// ============================================

type DateFilterValue = "today" | "past";

type GrowthEventWithId = CroissanceEvent & { id: string };

type GrowthGroup = {
  date: string;
  events: GrowthEventWithId[];
  lastEvent: GrowthEventWithId;
  counts: { poids: number; taille: number; tete: number };
};

const formatDateKey = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(
    date.getDate(),
  ).padStart(2, "0")}`;

const formatTime = (date: Date) =>
  date.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });

const toDate = (value: any) => {
  if (value?.seconds) return new Date(value.seconds * 1000);
  if (value?.toDate) return value.toDate();
  if (value instanceof Date) return value;
  return new Date(value);
};

const formatSelectedDateLabel = (dateString: string) => {
  const [year, month, day] = dateString.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  return date.toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
};

// ============================================
// DELETE ACTION COMPONENT
// ============================================

const DeleteAction = React.memo(function DeleteAction({
  onPress,
}: {
  onPress: () => void;
}) {
  return (
    <Pressable
      style={styles.deleteAction}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel="Supprimer cette mesure"
    >
      <Ionicons name="trash-outline" size={20} color="#fff" />
      <Text style={styles.deleteActionText}>Supprimer</Text>
    </Pressable>
  );
});

// ============================================
// SKELETON LOADING COMPONENT
// ============================================

const GrowthSkeleton = React.memo(function GrowthSkeleton({
  colorScheme,
}: {
  colorScheme: "light" | "dark";
}) {
  const nc = getNeutralColors(colorScheme);
  const shimmerAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const shimmer = Animated.loop(
      Animated.timing(shimmerAnim, {
        toValue: 1,
        duration: 1200,
        useNativeDriver: true,
      }),
    );
    shimmer.start();
    return () => shimmer.stop();
  }, [shimmerAnim]);

  const shimmerTranslate = shimmerAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [-200, 200],
  });
  const shimmerBg =
    colorScheme === "dark"
      ? nc.shimmerDark
      : nc.shimmerLight;

  const renderSkeletonCard = (key: number) => (
    <View
      key={key}
      style={[
        styles.sessionCard,
        { borderColor: nc.borderLight, backgroundColor: nc.backgroundCard },
      ]}
    >
      <View style={[styles.skeletonBlock, { width: 44, height: 14, backgroundColor: nc.borderLight }]}>
        <Animated.View
          style={[styles.shimmerOverlay, { backgroundColor: shimmerBg, transform: [{ translateX: shimmerTranslate }] }]}
        />
      </View>
      <View style={[styles.skeletonBlock, { width: 32, height: 32, borderRadius: 8, backgroundColor: nc.borderLight }]}>
        <Animated.View
          style={[styles.shimmerOverlay, { backgroundColor: shimmerBg, transform: [{ translateX: shimmerTranslate }] }]}
        />
      </View>
      <View style={{ flex: 1, gap: 6 }}>
        <View style={[styles.skeletonBlock, { width: 60, height: 14, backgroundColor: nc.borderLight }]}>
          <Animated.View
            style={[styles.shimmerOverlay, { backgroundColor: shimmerBg, transform: [{ translateX: shimmerTranslate }] }]}
          />
        </View>
        <View style={[styles.skeletonBlock, { width: 140, height: 12, backgroundColor: nc.borderLight }]}>
          <Animated.View
            style={[styles.shimmerOverlay, { backgroundColor: shimmerBg, transform: [{ translateX: shimmerTranslate }] }]}
          />
        </View>
      </View>
    </View>
  );

  return (
    <View style={styles.skeletonContainer}>
      <View style={styles.dayGroup}>
        <View style={styles.dayHeader}>
          <View style={[styles.skeletonBlock, { width: 80, height: 16, backgroundColor: nc.borderLight }]}>
            <Animated.View
              style={[styles.shimmerOverlay, { backgroundColor: shimmerBg, transform: [{ translateX: shimmerTranslate }] }]}
            />
          </View>
          <View style={[styles.skeletonBlock, { width: 40, height: 14, backgroundColor: nc.borderLight }]}>
            <Animated.View
              style={[styles.shimmerOverlay, { backgroundColor: shimmerBg, transform: [{ translateX: shimmerTranslate }] }]}
            />
          </View>
        </View>
        <View style={styles.sessionsContainer}>
          {renderSkeletonCard(1)}
          {renderSkeletonCard(2)}
          {renderSkeletonCard(3)}
        </View>
      </View>
    </View>
  );
});

// ============================================
// COMPONENT
// ============================================

export default function GrowthScreen() {
  const { activeChild } = useBaby();
  const { setHeaderRight } = useHeaderRight();
  const { setHeaderLeft } = useHeaderLeft();
  const colorScheme = useColorScheme() ?? "light";
  const nc = getNeutralColors(colorScheme);
  const { openSheet, closeSheet, isOpen } = useSheet();
  const { showToast, showUndoToast, showActionToast } = useToast();
  const { swipeableRef, triggerHint } = useSwipeHint();
  const navigation = useNavigation();
  const { selectionMode, selectedIds, selectedCount, toggleSelectionMode, exitSelectionMode, toggleId, selectAll, clearSelection } = useBatchSelect();
  const headerOwnerId = useRef(`growth-${Math.random().toString(36).slice(2)}`);

  const { openModal, editId, returnTo } = useLocalSearchParams();
  const returnTargetParam = Array.isArray(returnTo) ? returnTo[0] : returnTo;
  const sheetOwnerId = "growth";

  const [showCalendar, setShowCalendar] = useState(false);
  const [selectedFilter, setSelectedFilter] =
    useState<DateFilterValue>("today");
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [layoutReady, setLayoutReady] = useState(false);
  const [pendingOpen, setPendingOpen] = useState(false);
  const [pendingEditData, setPendingEditData] =
    useState<CroissanceEditData | null>(null);

  const [groupedEvents, setGroupedEvents] = useState<GrowthGroup[]>([]);
  const [expandedDays, setExpandedDays] = useState<Set<string>>(new Set());
  const [loaded, setLoaded] = useState({ croissance: false });
  const [loadError, setLoadError] = useState(false);
  const [emptyDelayDone, setEmptyDelayDone] = useState(false);
  const [daysWindow, setDaysWindow] = useState(14);
  const [rangeEndDate, setRangeEndDate] = useState<Date | null>(null);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [autoLoadMore, setAutoLoadMore] = useState(false);
  const [autoLoadMoreAttempts, setAutoLoadMoreAttempts] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const loadMoreVersionRef = useRef(0);
  const pendingLoadMoreRef = useRef(0);
  const sortMergedEvents = useCallback(
    (merged: any[]) =>
      [...(merged as GrowthEventWithId[])].sort(
        (a, b) => toDate(b.date).getTime() - toDate(a.date).getTime(),
      ),
    [],
  );
  const {
    mergedEvents: events,
    setFirestoreEvents,
    refreshMerged,
  } = useMergedOptimisticEvents<GrowthEventWithId>({
    childId: activeChild?.id,
    transformMerged: sortMergedEvents,
  });

  const [deleteConfirm, setDeleteConfirm] = useState<{
    visible: boolean;
    event: GrowthEventWithId | null;
  }>({ visible: false, event: null });

  const [batchDeleteConfirm, setBatchDeleteConfirm] = useState<{ visible: boolean; ids: string[] }>({ visible: false, ids: [] });

  const [softDeletedIds, setSoftDeletedIds] = useState<Set<string>>(new Set());

  const [precedingEvent, setPrecedingEvent] = useState<GrowthEventWithId | null>(null);

  const editIdRef = useRef<string | null>(null);
  const returnToRef = useRef<string | null>(null);

  const normalizeParam = (value: string | string[] | undefined) =>
    Array.isArray(value) ? value[0] : value;

  const stashReturnTo = useCallback(() => {
    const target = normalizeParam(returnTo);
    if (!target) return;
    if (target === "home" || target === "chrono" || target === "journal") {
      returnToRef.current = target;
      return;
    }
    returnToRef.current = null;
  }, [returnTo]);

  const maybeReturnTo = useCallback((targetOverride?: string | null) => {
    const target = targetOverride ?? returnToRef.current;
    returnToRef.current = null;
    if (target === "home") {
      router.replace("/baby/home");
    } else if (target === "chrono" || target === "journal") {
      router.replace("/baby/chrono");
    }
  }, []);

  const ensureTodayInRange = useCallback(() => {
    const endOfToday = new Date();
    endOfToday.setHours(23, 59, 59, 999);

    setRangeEndDate((prev) => {
      if (!prev) {
        setDaysWindow(14);
        return endOfToday;
      }
      if (prev >= endOfToday) return prev;
      const diffDays = Math.ceil(
        (endOfToday.getTime() - prev.getTime()) / (24 * 60 * 60 * 1000),
      );
      setDaysWindow((window) => window + diffDays);
      return endOfToday;
    });
  }, []);

  // ============================================
  // DELTA CALCULATION (P1 #4)
  // Each event compares to its chronological predecessor.
  // precedingEvent is prefetched from before the visible window so the
  // oldest visible event still gets a delta.
  // ============================================
  const deltaMap = useMemo(() => {
    const map = new Map<string, { label: string; value: string; positive: boolean }[]>();
    if (events.length === 0) return map;

    const allEvents: GrowthEventWithId[] = precedingEvent
      ? [precedingEvent, ...events]
      : [...events];
    const sorted = allEvents.sort(
      (a, b) => toDate(a.date).getTime() - toDate(b.date).getTime(),
    );

    for (let i = 1; i < sorted.length; i++) {
      const current = sorted[i];
      const prev = sorted[i - 1];
      const deltas: { label: string; value: string; positive: boolean }[] = [];
      if (current.poidsKg && prev.poidsKg) {
        const diff = current.poidsKg - prev.poidsKg;
        deltas.push({
          label: "kg",
          value: `${diff > 0 ? "+" : ""}${diff.toFixed(1)}`,
          positive: diff >= 0,
        });
      }
      if (current.tailleCm && prev.tailleCm) {
        const diff = current.tailleCm - prev.tailleCm;
        deltas.push({
          label: "cm",
          value: `${diff > 0 ? "+" : ""}${diff.toFixed(1)}`,
          positive: diff >= 0,
        });
      }
      if (current.teteCm && prev.teteCm) {
        const diff = current.teteCm - prev.teteCm;
        deltas.push({
          label: "PC",
          value: `${diff > 0 ? "+" : ""}${diff.toFixed(1)}`,
          positive: diff >= 0,
        });
      }
      if (deltas.length > 0) {
        map.set(current.id, deltas);
      }
    }
    return map;
  }, [events, precedingEvent]);

  // ============================================
  // BUILD EDIT DATA
  // ============================================
  const buildEditData = useCallback(
    (event: GrowthEventWithId): CroissanceEditData => {
      return {
        id: event.id,
        date: toDate(event.date),
        tailleCm: event.tailleCm,
        poidsKg: event.poidsKg,
        teteCm: event.teteCm,
      };
    },
    [],
  );

  // ============================================
  // OPEN ADD / EDIT MODAL
  // ============================================
  const openAddModal = useCallback(() => {
    setPendingEditData(null);
    setPendingOpen(true);
  }, []);

  const openEditModal = useCallback(
    (event: GrowthEventWithId) => {
      if (event.id?.startsWith?.('__optimistic_')) {
        showToast('Enregistrement en cours...');
        return;
      }
      setPendingEditData(buildEditData(event));
      setPendingOpen(true);
    },
    [buildEditData, showToast],
  );

  // ============================================
  // HEADER
  // ============================================
  const handleCalendarPress = useCallback(() => {
    setShowCalendar((prev) => {
      const nextValue = !prev;
      if (nextValue) {
        const today = new Date();
        setSelectedDate(formatDateKey(today));
      }
      return nextValue;
    });
  }, []);

  const applyTodayFilter = useCallback(() => {
    const todayKey = formatDateKey(new Date());
    setSelectedFilter("today");
    setSelectedDate(null);
    setShowCalendar(false);
    setExpandedDays(new Set([todayKey]));
  }, []);

  const clearSelectedDate = useCallback(() => {
    applyTodayFilter();
  }, [applyTodayFilter]);

  const menuItems: HeaderMenuItem[] = useMemo(() => [
    { label: "Ajouter", icon: "add-circle-outline", onPress: openAddModal },
    ...(groupedEvents.length > 0 || selectionMode ? [{
      label: selectionMode ? "Annuler sélection" : "Sélectionner",
      icon: (selectionMode ? "close-outline" : "checkmark-done-outline") as keyof typeof Ionicons.glyphMap,
      onPress: toggleSelectionMode,
    }] : []),
  ], [openAddModal, selectionMode, toggleSelectionMode, groupedEvents.length]);

  useFocusEffect(
    useCallback(() => {
      const headerButtons = (
        <View style={styles.headerButtons}>
          <Pressable
            onPress={handleCalendarPress}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            style={[
              styles.headerButton,
              { paddingLeft: 12 },
              showCalendar && {
                backgroundColor: Colors[colorScheme].tint + "20",
              },
            ]}
          >
            <Ionicons
              name="calendar-outline"
              size={24}
              color={Colors[colorScheme].tint}
            />
          </Pressable>
          <HeaderMenu items={menuItems} />
        </View>
      );
      setHeaderRight(headerButtons, headerOwnerId.current);
      return () => {
        setHeaderRight(null, headerOwnerId.current);
      };
    }, [
      handleCalendarPress,
      showCalendar,
      colorScheme,
      setHeaderRight,
      menuItems,
    ]),
  );

  useFocusEffect(
    useCallback(() => {
      const returnTarget = returnTargetParam ?? returnToRef.current;
      const backButton = (
        <HeaderBackButton
          onPress={() => {
            if (returnTarget === "home") {
              router.replace("/baby/home");
              return;
            }
            if (returnTarget === "chrono" || returnTarget === "journal") {
              router.replace("/baby/chrono");
              return;
            }
            router.replace("/baby/plus");
          }}
          tintColor={Colors[colorScheme].text}
        />
      );
      setHeaderLeft(backButton, headerOwnerId.current);
      return () => {
        setHeaderLeft(null, headerOwnerId.current);
      };
    }, [colorScheme, returnTargetParam, setHeaderLeft]),
  );

  useFocusEffect(
    useCallback(() => {
      const onBackPress = () => {
        if (isOpen) {
          closeSheet();
          return true;
        }
        const returnTarget = returnTargetParam ?? returnToRef.current;
        if (returnTarget === "home") {
          router.replace("/baby/home");
          return true;
        }
        if (returnTarget === "chrono" || returnTarget === "journal") {
          router.replace("/baby/chrono");
          return true;
        }
        router.replace("/baby/plus");
        return true;
      };

      const subscription = BackHandler.addEventListener(
        "hardwareBackPress",
        onBackPress,
      );
      return () => subscription.remove();
    }, [closeSheet, isOpen, returnTargetParam]),
  );

  // ============================================
  // DATA LISTENERS
  // ============================================
  useEffect(() => {
    if (!activeChild?.id) return;
    setLoadError(false);

    const handleListenerError = () => {
      setLoadError(true);
      setLoaded({ croissance: true });
      setIsRefreshing(false);
    };

    const versionAtSubscribe = loadMoreVersionRef.current;
    const endOfRange = rangeEndDate ? new Date(rangeEndDate) : new Date();
    endOfRange.setHours(23, 59, 59, 999);
    const startOfRange = new Date(endOfRange);
    startOfRange.setHours(0, 0, 0, 0);
    startOfRange.setDate(startOfRange.getDate() - (daysWindow - 1));

    let loadingSet = false;

    const unsubscribe = ecouterCroissancesHybrid(
      activeChild.id,
      (data) => {
        setFirestoreEvents(data as GrowthEventWithId[]);
        if (!loadingSet) {
          loadingSet = true;
          setLoaded({ croissance: true });
          setIsRefreshing(false);
        }
        if (
          pendingLoadMoreRef.current > 0 &&
          versionAtSubscribe === loadMoreVersionRef.current
        ) {
          pendingLoadMoreRef.current -= 1;
          if (pendingLoadMoreRef.current <= 0) {
            setIsLoadingMore(false);
          }
        }
      },
      { waitForServer: true, depuis: startOfRange, jusqu: endOfRange },
      handleListenerError,
    );

    return () => {
      unsubscribe();
    };
  }, [activeChild?.id, daysWindow, rangeEndDate, refreshKey, setFirestoreEvents]);

  useEffect(() => {
    setSoftDeletedIds((prev) => {
      if (prev.size === 0) return prev;
      const mergedIds = new Set(events.map((e) => e.id));
      const next = new Set<string>();
      prev.forEach((id) => { if (mergedIds.has(id)) next.add(id); });
      return next.size === prev.size ? prev : next;
    });
  }, [events]);

  // Re-merge on tab focus — frozen tabs miss state updates
  useFocusEffect(
    useCallback(() => {
      refreshMerged();
    }, [refreshMerged]),
  );

  useEffect(() => {
    if (!activeChild?.id) return;
    setGroupedEvents([]);
    setLoaded({ croissance: false });
    setEmptyDelayDone(false);
    setDaysWindow(14);
    setRangeEndDate(null);
    setIsLoadingMore(false);
    setHasMore(true);
    setExpandedDays(new Set());
    setPrecedingEvent(null);
    loadMoreVersionRef.current = 0;
    pendingLoadMoreRef.current = 0;
    setFirestoreEvents([]);
  }, [activeChild?.id, setFirestoreEvents]);

  useEffect(() => {
    if (!activeChild?.id) return;
    let cancelled = false;
    const endOfToday = new Date();
    endOfToday.setHours(23, 59, 59, 999);

    getNextEventDateBeforeHybrid(activeChild.id, "croissance", endOfToday)
      .then((nextDate) => {
        if (cancelled) return;
        setDaysWindow(14);
        setRangeEndDate(nextDate ?? endOfToday);
      })
      .catch(() => {
        if (cancelled) return;
        setDaysWindow(14);
        setRangeEndDate(endOfToday);
      });

    return () => {
      cancelled = true;
    };
  }, [activeChild?.id]);

  useEffect(() => {
    if (!Object.values(loaded).every(Boolean)) {
      setEmptyDelayDone(false);
      return;
    }
    if (groupedEvents.length > 0) {
      setEmptyDelayDone(true);
      return;
    }
    const timer = setTimeout(() => setEmptyDelayDone(true), 300);
    return () => clearTimeout(timer);
  }, [loaded, groupedEvents.length]);

  // Swipe hint: trigger on first load when data is available
  useEffect(() => {
    if (loaded.croissance && events.length > 0) {
      triggerHint();
    }
  }, [loaded.croissance, events.length, triggerHint]);

  useEffect(() => {
    if (!activeChild?.id) return;
    let cancelled = false;
    const endOfRange = rangeEndDate ? new Date(rangeEndDate) : new Date();
    endOfRange.setHours(23, 59, 59, 999);
    const startOfRange = new Date(endOfRange);
    startOfRange.setHours(0, 0, 0, 0);
    startOfRange.setDate(startOfRange.getDate() - (daysWindow - 1));
    const beforeDate = new Date(startOfRange.getTime() - 1);

    setHasMore(true);
    hasMoreEventsBeforeHybrid(activeChild.id, "croissance", beforeDate)
      .then((result) => {
        if (!cancelled) setHasMore(result);
      })
      .catch(() => {
        if (!cancelled) setHasMore(false);
      });

    return () => {
      cancelled = true;
    };
  }, [activeChild?.id, daysWindow, rangeEndDate]);

  // Prefetch the one event just before the visible window for delta calculation
  useEffect(() => {
    if (!activeChild?.id) return;
    let cancelled = false;
    const endOfRange = rangeEndDate ? new Date(rangeEndDate) : new Date();
    endOfRange.setHours(23, 59, 59, 999);
    const startOfRange = new Date(endOfRange);
    startOfRange.setHours(0, 0, 0, 0);
    startOfRange.setDate(startOfRange.getDate() - (daysWindow - 1));
    const beforeDate = new Date(startOfRange.getTime() - 1);

    obtenirEvenements(activeChild.id, {
      type: "croissance",
      jusqu: beforeDate,
      limite: 1,
    })
      .then((result) => {
        if (cancelled) return;
        if (result.length > 0) {
          const evt = result[0] as GrowthEventWithId;
          setPrecedingEvent(evt);
        } else {
          setPrecedingEvent(null);
        }
      })
      .catch(() => {
        if (!cancelled) setPrecedingEvent(null);
      });

    return () => {
      cancelled = true;
    };
  }, [activeChild?.id, daysWindow, rangeEndDate]);

  // ============================================
  // FILTERS + GROUPING
  // ============================================
  const markedDates = useMemo(() => {
    const marked: Record<string, any> = {};
    events.forEach((item) => {
      const date = toDate(item.date);
      const key = formatDateKey(date);
      marked[key] = {
        ...(marked[key] || {}),
        marked: true,
        dotColor: eventColors.croissance.dark,
      };
    });
    if (selectedDate) {
      marked[selectedDate] = {
        ...marked[selectedDate],
        selected: true,
        selectedColor: Colors[colorScheme].tint,
        selectedTextColor: nc.white,
      };
    }
    if (selectedFilter === "today" && !selectedDate) {
      const todayKey = formatDateKey(new Date());
      marked[todayKey] = {
        ...marked[todayKey],
        selected: true,
        selectedColor: Colors[colorScheme].tint,
        selectedTextColor: nc.white,
      };
    }
    return marked;
  }, [events, selectedDate, selectedFilter, colorScheme]);

  const handleDateSelect = (day: DateData) => {
    setSelectedDate(day.dateString);
    setShowCalendar(false);
    setExpandedDays(new Set([day.dateString]));
  };

  const handleFilterPress = (filter: DateFilterValue) => {
    if (filter === "today") {
      applyTodayFilter();
      return;
    }
    setSelectedFilter(filter);
    setSelectedDate(null);
    setShowCalendar(false);
    setExpandedDays(new Set());
  };

  useFocusEffect(
    useCallback(() => {
      if (!selectedDate) {
        applyTodayFilter();
      }
    }, [applyTodayFilter, selectedDate]),
  );

  useEffect(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayTime = today.getTime();

    const filtered = events.filter((item) => {
      if (softDeletedIds.has(item.id)) return false;
      const date = toDate(item.date);
      date.setHours(0, 0, 0, 0);
      const time = date.getTime();

      if (selectedDate) {
        const [year, month, day] = selectedDate.split("-").map(Number);
        const selected = new Date(year, month - 1, day);
        selected.setHours(0, 0, 0, 0);
        return time === selected.getTime();
      }

      if (selectedFilter === "today") return time === todayTime;
      if (selectedFilter === "past") return time < todayTime;
      return true;
    });

    const groups: Record<string, GrowthEventWithId[]> = {};
    filtered.forEach((item) => {
      const date = toDate(item.date);
      const key = formatDateKey(date);
      if (!groups[key]) groups[key] = [];
      groups[key].push(item);
    });

    const grouped = Object.entries(groups)
      .map(([date, items]) => {
        const sorted = items.sort(
          (a, b) => toDate(b.date).getTime() - toDate(a.date).getTime(),
        );
        const counts = { poids: 0, taille: 0, tete: 0 };
        sorted.forEach((e) => {
          if (e.poidsKg) counts.poids++;
          if (e.tailleCm) counts.taille++;
          if (e.teteCm) counts.tete++;
        });
        return {
          date,
          events: sorted,
          lastEvent: sorted[0],
          counts,
        };
      })
      .sort((a, b) => (a.date < b.date ? 1 : -1));

    setGroupedEvents(grouped);
  }, [events, selectedFilter, selectedDate, showCalendar, softDeletedIds]);

  const loadMoreStep = useCallback(
    async (auto = false) => {
      if (!hasMore || !activeChild?.id) return;
      setIsLoadingMore(true);
      pendingLoadMoreRef.current = 1;
      loadMoreVersionRef.current += 1;

      const endOfRange = rangeEndDate ? new Date(rangeEndDate) : new Date();
      endOfRange.setHours(23, 59, 59, 999);
      const startOfRange = new Date(endOfRange);
      startOfRange.setHours(0, 0, 0, 0);
      startOfRange.setDate(startOfRange.getDate() - (daysWindow - 1));
      const beforeDate = new Date(startOfRange.getTime() - 1);
      const nextEventDate = await getNextEventDateBeforeHybrid(
        activeChild.id,
        "croissance",
        beforeDate,
      );

      if (nextEventDate) {
        const startOfNext = new Date(nextEventDate);
        startOfNext.setHours(0, 0, 0, 0);
        const diffDays =
          Math.floor(
            (endOfRange.getTime() - startOfNext.getTime()) /
              (24 * 60 * 60 * 1000),
          ) + 1;
        setDaysWindow((prev) => Math.max(prev, diffDays));
      } else {
        setHasMore(false);
        pendingLoadMoreRef.current = 0;
        setIsLoadingMore(false);
        setAutoLoadMore(false);
      }

      if (!auto) {
        setAutoLoadMore(true);
        setAutoLoadMoreAttempts(0);
      }
    },
    [hasMore, activeChild?.id, daysWindow, rangeEndDate],
  );

  const handlePullToRefresh = useCallback(() => {
    setIsRefreshing(true);
    setRefreshKey((k) => k + 1);
  }, []);

  const handleLoadMore = useCallback(() => {
    loadMoreStep(false);
  }, [loadMoreStep]);

  useEffect(() => {
    if (selectedFilter === "today" || selectedDate) return;
    if (
      Object.values(loaded).every(Boolean) &&
      groupedEvents.length === 0 &&
      hasMore
    ) {
      setAutoLoadMore(true);
      setAutoLoadMoreAttempts(0);
    }
  }, [loaded, groupedEvents.length, hasMore, selectedFilter, selectedDate]);

  useEffect(() => {
    if (!autoLoadMore) return;
    if (!Object.values(loaded).every(Boolean) || isLoadingMore) return;
    if (groupedEvents.length > 0 || !hasMore) {
      setAutoLoadMore(false);
      setAutoLoadMoreAttempts(0);
      return;
    }
    if (autoLoadMoreAttempts >= MAX_AUTO_LOAD_ATTEMPTS) {
      setAutoLoadMore(false);
      return;
    }
    setAutoLoadMoreAttempts((prev) => prev + 1);
    loadMoreStep(true);
  }, [
    autoLoadMore,
    loaded,
    isLoadingMore,
    groupedEvents.length,
    hasMore,
    autoLoadMoreAttempts,
    loadMoreStep,
  ]);

  // ============================================
  // SHEET LOGIC - USING FORM TYPE PATTERN
  // ============================================
  useFocusEffect(
    useCallback(() => {
      if (openModal !== "true") return;
      openAddModal();
    }, [openModal, openAddModal]),
  );

  useEffect(() => {
    if (!pendingOpen || !layoutReady) return;
    const returnTarget = returnTargetParam ?? returnToRef.current;
    const isEditing = !!pendingEditData;
    const task = InteractionManager.runAfterInteractions(() => {
      stashReturnTo();
      openSheet({
        ownerId: sheetOwnerId,
        formType: "croissance",
        editData: pendingEditData ?? undefined,
        onSuccess: () => {
          ensureTodayInRange();
          applyTodayFilter();
          showToast(
            isEditing ? "Mesure modifiee" : "Mesure enregistree",
          );
        },
        onDismiss: () => {
          editIdRef.current = null;
          maybeReturnTo(returnTarget);
        },
      });
      navigation.setParams({
        openModal: undefined,
        editId: undefined,
      } as any);
      setPendingOpen(false);
    });
    return () => task.cancel?.();
  }, [
    pendingOpen,
    layoutReady,
    pendingEditData,
    navigation,
    stashReturnTo,
    openSheet,
    returnTargetParam,
    maybeReturnTo,
    ensureTodayInRange,
    applyTodayFilter,
    showToast,
  ]);

  useEffect(() => {
    if (!editId || !layoutReady) return;
    const normalizedId = Array.isArray(editId) ? editId[0] : editId;
    if (!normalizedId || editIdRef.current === normalizedId) return;
    const target = events.find((evt) => evt.id === normalizedId);
    if (!target) return;
    stashReturnTo();
    editIdRef.current = normalizedId;
    openEditModal(target);
    navigation.setParams({
      openModal: undefined,
      editId: undefined,
    } as any);
  }, [editId, layoutReady, events, navigation, openEditModal, stashReturnTo]);

  // ============================================
  // RENDER HELPERS
  // ============================================
  const buildDetailParts = (event: GrowthEventWithId) => {
    const parts: { value: string; unit: string }[] = [];
    if (event.poidsKg) parts.push({ value: `${event.poidsKg}`, unit: "kg" });
    if (event.tailleCm) parts.push({ value: `${event.tailleCm}`, unit: "cm" });
    if (event.teteCm) parts.push({ value: `${event.teteCm}`, unit: "cm PC" });
    return parts;
  };

  const toggleExpand = useCallback((date: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExpandedDays((prev) => {
      const next = new Set(prev);
      if (next.has(date)) {
        next.delete(date);
      } else {
        next.add(date);
      }
      return next;
    });
  }, []);

  const handleEventDelete = useCallback((event: GrowthEventWithId) => {
    if (event.id?.startsWith?.('__optimistic_')) {
      showToast('Enregistrement en cours...');
      return;
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setDeleteConfirm({ visible: true, event });
  }, [showToast]);

  const confirmDelete = useCallback(async () => {
    if (!activeChild?.id || !deleteConfirm.event?.id) return;
    const eventId = deleteConfirm.event.id;
    const childId = activeChild.id;
    setDeleteConfirm({ visible: false, event: null });

    // Soft-delete: hide immediately from UI
    setSoftDeletedIds((prev) => new Set(prev).add(eventId));

    showUndoToast(
      "Mesure supprimee",
      // onUndo — restore visibility
      () => {
        setSoftDeletedIds((prev) => {
          const next = new Set(prev);
          next.delete(eventId);
          return next;
        });
      },
      // onExpire — actually delete from Firestore
      async () => {
        try {
          await supprimerCroissance(childId, eventId);
        } catch {
          // Restore if delete fails
          setSoftDeletedIds((prev) => {
            const next = new Set(prev);
            next.delete(eventId);
            return next;
          });
          showActionToast("Erreur lors de la suppression", "Réessayer", () => {
            supprimerCroissance(childId, eventId).catch(() => {
              showActionToast("Erreur lors de la suppression", "Réessayer", () => {
                supprimerCroissance(childId, eventId);
              });
            });
          });
        }
      },
      4000,
    );
  }, [activeChild?.id, deleteConfirm.event, showUndoToast, showActionToast]);

  const handleBatchDelete = useCallback(() => {
    if (!activeChild?.id || selectedCount === 0) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setBatchDeleteConfirm({ visible: true, ids: Array.from(selectedIds) });
  }, [activeChild?.id, selectedIds, selectedCount]);

  const confirmBatchDelete = useCallback(() => {
    if (!activeChild?.id || batchDeleteConfirm.ids.length === 0) return;
    const ids = batchDeleteConfirm.ids;
    const childId = activeChild.id;
    setBatchDeleteConfirm({ visible: false, ids: [] });
    exitSelectionMode();

    // Soft-delete: hide immediately from UI
    setSoftDeletedIds((prev) => {
      const next = new Set(prev);
      ids.forEach((id) => next.add(id));
      return next;
    });

    showUndoToast(
      `${ids.length} élément${ids.length > 1 ? "s" : ""} supprimé${ids.length > 1 ? "s" : ""}`,
      // onUndo — restore visibility
      () => {
        setSoftDeletedIds((prev) => {
          const next = new Set(prev);
          ids.forEach((id) => next.delete(id));
          return next;
        });
      },
      // onExpire — actually delete from Firestore
      async () => {
        try {
          await Promise.all(ids.map((id) => supprimerCroissance(childId, id)));
        } catch {
          // Restore if delete fails
          setSoftDeletedIds((prev) => {
            const next = new Set(prev);
            ids.forEach((id) => next.delete(id));
            return next;
          });
          showActionToast("Erreur lors de la suppression", "Réessayer", () => {
            Promise.all(ids.map((id) => supprimerCroissance(childId, id))).catch(() => {
              showActionToast("Erreur lors de la suppression", "Réessayer", () => {
                Promise.all(ids.map((id) => supprimerCroissance(childId, id)));
              });
            });
          });
        }
      },
      4000,
    );
  }, [activeChild?.id, batchDeleteConfirm.ids, exitSelectionMode, showUndoToast, showActionToast]);

  const cancelBatchDelete = useCallback(() => {
    setBatchDeleteConfirm({ visible: false, ids: [] });
  }, []);

  const cancelDelete = useCallback(() => {
    setDeleteConfirm({ visible: false, event: null });
  }, []);

  const renderEventItem = (event: GrowthEventWithId, isLast = false, isFirstInList = false) => {
    const time = toDate(event.date);
    const parts = buildDetailParts(event);
    const deltas = deltaMap.get(event.id) ?? null;
    return (
      <ReanimatedSwipeable
        ref={isFirstInList ? swipeableRef : undefined}
        key={event.id}
        renderRightActions={
          !event.id?.startsWith?.('__optimistic_')
            ? () => (
                <DeleteAction onPress={() => handleEventDelete(event)} />
              )
            : undefined
        }
        friction={2}
        rightThreshold={40}
        overshootRight={false}
        enabled={!event.id?.startsWith?.('__optimistic_')}
      >
        <Pressable
          style={({ pressed }) => {
            const isSelected = selectionMode && selectedIds.has(event.id);
            return [
              styles.sessionCard,
              {
                borderColor: nc.borderLight,
                backgroundColor: pressed
                  ? nc.backgroundPressed
                  : isSelected
                    ? Colors[colorScheme ?? "light"].tint + "15"
                    : nc.backgroundCard,
                borderLeftWidth: isSelected ? 3 : 0,
                borderLeftColor: isSelected
                  ? Colors[colorScheme ?? "light"].tint
                  : "transparent",
              },
            ];
          }}
          onPress={selectionMode ? () => toggleId(event.id) : () => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); openEditModal(event); }}
          accessibilityRole="button"
          accessibilityLabel="Modifier cette mesure"
        >
          {selectionMode && (
            <Pressable
              onPress={() => toggleId(event.id)}
              style={{ marginRight: 8 }}
            >
              <Ionicons
                name={selectedIds.has(event.id) ? "checkbox" : "square-outline"}
                size={22}
                color={selectedIds.has(event.id) ? Colors[colorScheme].tint : nc.textMuted}
              />
            </Pressable>
          )}
          <View style={styles.sessionTime}>
            <Text
              style={[
                styles.sessionTimeText,
                { color: nc.textMuted },
                isLast && [styles.sessionTimeTextLast, { color: nc.textStrong }],
              ]}
            >
              {formatTime(time)}
            </Text>
          </View>
          <View
            style={[
              styles.sessionIconWrapper,
              { backgroundColor: `${eventColors.croissance.dark}20` },
            ]}
          >
            <FontAwesome
              name="seedling"
              size={14}
              color={eventColors.croissance.dark}
            />
          </View>
          <View style={styles.sessionContent}>
            <View style={styles.sessionDetails}>
              <Text style={[styles.sessionType, { color: nc.textStrong }]}>Mesure</Text>
              <View style={styles.metricLines}>
                {event.poidsKg != null && (() => {
                  const delta = deltas?.find((d) => d.label === "kg");
                  return (
                    <View style={styles.metricLineRow}>
                      <View style={[styles.metricPill, { backgroundColor: getBackgroundTint("#7c3aed", 0.1) }]}>
                        <FontAwesome name="weight-scale" size={10} color="#7c3aed" />
                        <Text style={[styles.metricPillText, { color: nc.textStrong }]}>
                          {event.poidsKg} kg
                        </Text>
                      </View>
                      {delta && (
                        <View style={[styles.deltaBadge, { backgroundColor: delta.positive ? nc.successBg : nc.errorBg }]}>
                          <Ionicons name={delta.positive ? "trending-up" : "trending-down"} size={10} color={delta.positive ? nc.successText : nc.errorText} />
                          <Text style={[styles.deltaText, { color: delta.positive ? nc.successText : nc.errorText }]}>
                            {delta.value} {delta.label}
                          </Text>
                        </View>
                      )}
                    </View>
                  );
                })()}
                {event.tailleCm != null && (() => {
                  const delta = deltas?.find((d) => d.label === "cm");
                  return (
                    <View style={styles.metricLineRow}>
                      <View style={[styles.metricPill, { backgroundColor: getBackgroundTint("#2f80ed", 0.1) }]}>
                        <FontAwesome name="ruler-vertical" size={10} color="#2f80ed" />
                        <Text style={[styles.metricPillText, { color: nc.textStrong }]}>
                          {event.tailleCm} cm
                        </Text>
                      </View>
                      {delta && (
                        <View style={[styles.deltaBadge, { backgroundColor: delta.positive ? nc.successBg : nc.errorBg }]}>
                          <Ionicons name={delta.positive ? "trending-up" : "trending-down"} size={10} color={delta.positive ? nc.successText : nc.errorText} />
                          <Text style={[styles.deltaText, { color: delta.positive ? nc.successText : nc.errorText }]}>
                            {delta.value} {delta.label}
                          </Text>
                        </View>
                      )}
                    </View>
                  );
                })()}
                {event.teteCm != null && (() => {
                  const delta = deltas?.find((d) => d.label === "PC");
                  return (
                    <View style={styles.metricLineRow}>
                      <View style={[styles.metricPill, { backgroundColor: getBackgroundTint(nc.warning, 0.1) }]}>
                        <MaterialCommunityIcons name="baby-face-outline" size={12} color={nc.warning} />
                        <Text style={[styles.metricPillText, { color: nc.textStrong }]}>
                          {event.teteCm} cm
                        </Text>
                      </View>
                      {delta && (
                        <View style={[styles.deltaBadge, { backgroundColor: delta.positive ? nc.successBg : nc.errorBg }]}>
                          <Ionicons name={delta.positive ? "trending-up" : "trending-down"} size={10} color={delta.positive ? nc.successText : nc.errorText} />
                          <Text style={[styles.deltaText, { color: delta.positive ? nc.successText : nc.errorText }]}>
                            {delta.value} {delta.label}
                          </Text>
                        </View>
                      )}
                    </View>
                  );
                })()}
              </View>
            </View>
          </View>
          <Ionicons name="chevron-forward" size={18} color={nc.border} />
        </Pressable>
      </ReanimatedSwipeable>
    );
  };

  const renderDayGroup = ({ item, index }: { item: GrowthGroup; index: number }) => {
    const [year, month, day] = item.date.split("-").map(Number);
    const date = new Date(year, month - 1, day);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    const formatDayLabel = () => {
      const shortDate = date.toLocaleDateString("fr-FR", {
        weekday: "short",
        day: "numeric",
        month: "short",
      });
      if (selectedFilter === "today") return shortDate;
      if (date.toDateString() === today.toDateString()) return "Aujourd'hui";
      if (date.toDateString() === yesterday.toDateString()) return "Hier";
      return shortDate;
    };
    const dayLabel = formatDayLabel();

    const isExpanded = expandedDays.has(item.date);

    return (
      <View style={styles.dayGroup}>
        <View style={styles.dayHeader}>
          <Text style={[styles.dayLabel, { color: nc.textStrong }]}>{dayLabel}</Text>
          <View style={styles.dayStats}>
            <View style={styles.dayStatItem}>
              <Text style={[styles.dayStatValue, { color: nc.textNormal }]}>{item.events.length}</Text>
              <Text style={[styles.dayStatLabel, { color: nc.textMuted }]}>
                mesure{item.events.length > 1 ? "s" : ""}
              </Text>
            </View>
          </View>
        </View>
        <View style={styles.statsBreakdown}>
          {[
            { key: "poids", label: "Poids", color: "#7c3aed" },
            { key: "taille", label: "Taille", color: "#2f80ed" },
            { key: "tete", label: "PC", color: nc.warning },
          ].map(({ key, label, color }) => {
            const count = item.counts[key as keyof typeof item.counts];
            if (count === 0) return null;
            return (
              <View key={key} style={styles.statsBreakdownItem}>
                <View style={[styles.statsBreakdownDot, { backgroundColor: color }]} />
                <Text style={[styles.statsBreakdownLabel, { color: nc.textMuted }]}>{label}</Text>
                <Text style={[styles.statsBreakdownValue, { color: nc.textNormal }]}>{count}</Text>
              </View>
            );
          })}
        </View>
        <View style={styles.dayContent}>
          <View style={styles.sessionsContainer}>
            {renderEventItem(item.lastEvent, true, index === 0)}
            {item.events.length > 1 &&
              isExpanded &&
              item.events
                .filter((evt) => evt.id !== item.lastEvent.id)
                .map((evt) => renderEventItem(evt, false))}
            {item.events.length > 1 && (
              <Pressable
                style={[styles.expandTrigger, { borderTopColor: nc.borderLight }]}
                onPress={() => toggleExpand(item.date)}
                accessibilityRole="button"
                accessibilityLabel={isExpanded ? "Masquer les mesures" : "Voir les autres mesures"}
              >
                <Text
                  style={[
                    styles.expandTriggerText,
                    { color: Colors[colorScheme].tint },
                  ]}
                >
                  {isExpanded
                    ? "Masquer"
                    : `${item.events.length - 1} autre${
                        item.events.length > 2 ? "s" : ""
                      } mesure${item.events.length > 2 ? "s" : ""}`}
                </Text>
                <Ionicons
                  name={isExpanded ? "chevron-up" : "chevron-down"}
                  size={14}
                  color={Colors[colorScheme].tint}
                />
              </Pressable>
            )}
          </View>
        </View>
      </View>
    );
  };

  // ============================================
  // RENDER
  // ============================================
  return (
    <GestureHandlerRootView style={[styles.container, { backgroundColor: nc.background }]}>
      <SafeAreaView
        style={{ flex: 1 }}
        edges={["bottom"]}
        onLayout={() => setLayoutReady(true)}
      >
        <View>
          <View style={styles.filterRow}>
            <DateFilterBar
              selected={selectedDate ? ("past" as DateFilterValue) : selectedFilter}
              onSelect={handleFilterPress}
            >
              {selectedDate && (
                <Pressable
                  style={[styles.dateChip, { backgroundColor: Colors[colorScheme].tint }]}
                  onPress={clearSelectedDate}
                  accessibilityRole="button"
                  accessibilityLabel="Effacer la date sélectionnée"
                >
                  <Text style={[styles.dateChipText, { color: colorScheme === "dark" ? Colors[colorScheme].background : nc.white }]}>
                    {formatSelectedDateLabel(selectedDate)}
                  </Text>
                  <Ionicons name="close" size={14} color={colorScheme === "dark" ? Colors[colorScheme].background : nc.white} />
                </Pressable>
              )}
            </DateFilterBar>
          </View>
          {showCalendar && (
            <View style={[styles.calendarContainer, { borderBottomColor: nc.border }]}>
              <Calendar
                onDayPress={handleDateSelect}
                markedDates={markedDates}
                theme={{
                  backgroundColor: Colors[colorScheme].background,
                  calendarBackground: Colors[colorScheme].background,
                  textSectionTitleColor: Colors[colorScheme].text,
                  selectedDayBackgroundColor: Colors[colorScheme].tint,
                  selectedDayTextColor: colorScheme === "dark" ? Colors[colorScheme].background : nc.white,
                  todayTextColor: Colors[colorScheme].tint,
                  dayTextColor: Colors[colorScheme].text,
                  textDisabledColor: Colors[colorScheme].tabIconDefault,
                  dotColor: Colors[colorScheme].tint,
                  selectedDotColor: nc.white,
                  arrowColor: Colors[colorScheme].tint,
                  monthTextColor: Colors[colorScheme].text,
                  indicatorColor: Colors[colorScheme].tint,
                }}
              />
            </View>
          )}
        </View>

        {/* Barre de sélection */}
        {selectionMode && (
          <SelectionToolbar
            selectedCount={selectedCount}
            totalCount={groupedEvents.reduce((n, g) => n + g.events.length, 0)}
            onSelectAll={() => selectAll(groupedEvents.flatMap((g) => g.events.map((e) => e.id)))}
            onClearSelection={clearSelection}
            onDelete={handleBatchDelete}
          />
        )}

        {Object.values(loaded).every(Boolean) && emptyDelayDone ? (
          groupedEvents.length === 0 ? (
            <View style={styles.emptyContainer}>
              <View
                style={[
                  styles.emptyIconWrapper,
                  { backgroundColor: `${eventColors.croissance.dark}15` },
                ]}
              >
                <FontAwesome
                  name="seedling"
                  size={36}
                  color={eventColors.croissance.dark}
                />
              </View>
              <ThemedText style={[styles.emptyTitle, { color: nc.textStrong }]}>
                {events.length === 0
                  ? "Aucune mesure enregistree"
                  : "Aucune mesure pour ce filtre"}
              </ThemedText>
              <ThemedText style={[styles.emptySubtitle, { color: nc.textMuted }]}>
                Suivez le poids, la taille et le perimetre cranien
              </ThemedText>
              {events.length === 0 && (
                <Pressable
                  style={[styles.emptyCta, { backgroundColor: Colors[colorScheme].tint }]}
                  onPress={openAddModal}
                  accessibilityRole="button"
                  accessibilityLabel="Ajouter une mesure"
                >
                  <Ionicons name="add" size={20} color={nc.white} />
                  <Text style={styles.emptyCtaText}>Ajouter une mesure</Text>
                </Pressable>
              )}
              {!(selectedFilter === "today" || selectedDate) && (
                <LoadMoreButton
                  hasMore={hasMore}
                  loading={isLoadingMore}
                  onPress={handleLoadMore}
                  text="Voir plus"
                  accentColor={Colors[colorScheme].tint}
                />
              )}
            </View>
          ) : (
            <FlatList
              data={groupedEvents}
              keyExtractor={(item) => item.date}
              renderItem={renderDayGroup}
              showsVerticalScrollIndicator={false}
              contentContainerStyle={styles.listContent}
              ListFooterComponent={
                selectedFilter === "today" || selectedDate ? null : (
                  <LoadMoreButton
                    hasMore={hasMore}
                    loading={isLoadingMore}
                    onPress={handleLoadMore}
                    text="Voir plus"
                    accentColor={Colors[colorScheme].tint}
                  />
                )
              }
              refreshControl={
                <RefreshControl
                  refreshing={isRefreshing}
                  onRefresh={handlePullToRefresh}
                  tintColor={Colors[colorScheme].tint}
                />
              }
            />
          )
        ) : (
          <GrowthSkeleton colorScheme={colorScheme} />
        )}
      </SafeAreaView>

      <ConfirmModal
        visible={deleteConfirm.visible}
        title="Suppression"
        message="Voulez-vous vraiment supprimer cette mesure ?"
        confirmText="Supprimer"
        cancelText="Annuler"
        backgroundColor={Colors[colorScheme].background}
        textColor={Colors[colorScheme].text}
        onCancel={cancelDelete}
        onConfirm={confirmDelete}
      />

      <ConfirmModal
        visible={batchDeleteConfirm.visible}
        title="Suppression groupée"
        message={`Voulez-vous vraiment supprimer ${batchDeleteConfirm.ids.length} élément${batchDeleteConfirm.ids.length > 1 ? "s" : ""} ?`}
        confirmText="Supprimer"
        cancelText="Annuler"
        backgroundColor={Colors[colorScheme].background}
        textColor={Colors[colorScheme].text}
        onCancel={cancelBatchDelete}
        onConfirm={confirmBatchDelete}
      />
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  headerButtons: {
    flexDirection: "row",
    alignItems: "center",
    paddingRight: 16,
    gap: 0,
  },
  headerButton: {
    paddingHorizontal: 8,
    paddingVertical: 8,
    borderRadius: 8,
  },
  calendarContainer: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderBottomWidth: 1,
  },
  filterRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingRight: 16,
  },
  dateChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
  },
  dateChipText: {
    color: "#fff",
    fontSize: 13,
    fontWeight: "600",
  },
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 80,
  },
  dayGroup: {
    marginBottom: 24,
  },
  dayHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  dayLabel: {
    fontSize: 15,
    fontWeight: "700",
  },
  dayStats: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  dayStatItem: {
    alignItems: "flex-end",
  },
  dayStatValue: {
    fontSize: 16,
    fontWeight: "700",
  },
  dayStatLabel: {
    fontSize: 11,
  },
  dayContent: {
    gap: 10,
  },
  sessionsContainer: {
    gap: 2,
  },
  sessionCard: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 14,
    paddingHorizontal: 16,
    gap: 12,
    borderRadius: 14,
    borderWidth: 1,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 3,
    elevation: 1,
  },
  sessionTime: {
    width: 52,
  },
  sessionTimeText: {
    fontSize: 13,
    fontWeight: "500",
  },
  sessionTimeTextLast: {
    fontWeight: "600",
  },
  sessionIconWrapper: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  sessionContent: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  sessionDetails: {
    flex: 1,
    gap: 2,
  },
  sessionType: {
    fontSize: 15,
    fontWeight: "600",
  },
  metricLines: {
    gap: 4,
  },
  metricLineRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  metricPillRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
  metricPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  metricPillText: {
    fontSize: 12,
    fontWeight: "600",
  },
  deltaRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 4,
    marginTop: 2,
  },
  deltaBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  deltaText: {
    fontSize: 10,
    fontWeight: "600",
  },
  expandTrigger: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    paddingVertical: 12,
    borderTopWidth: 1,
  },
  expandTriggerText: {
    fontSize: 13,
    fontWeight: "500",
  },
  emptyContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 32,
  },
  emptyIconWrapper: {
    width: 80,
    height: 80,
    borderRadius: 40,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: "700",
    textAlign: "center",
  },
  emptySubtitle: {
    fontSize: 14,
    marginTop: 6,
    textAlign: "center",
  },
  emptyCta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 24,
    marginTop: 20,
  },
  emptyCtaText: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "600",
  },
  deleteAction: {
    backgroundColor: "#ef4444",
    justifyContent: "center",
    alignItems: "center",
    width: 80,
    borderRadius: 14,
    marginHorizontal: 4,
    marginVertical: 1,
    gap: 4,
  },
  deleteActionText: {
    color: "#fff",
    fontSize: 11,
    fontWeight: "700",
  },
  skeletonContainer: {
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  skeletonBlock: {
    borderRadius: 4,
    overflow: "hidden",
  },
  shimmerOverlay: {
    position: "absolute",
    top: 0,
    bottom: 0,
    width: 200,
  },
  statsBreakdown: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
    marginBottom: 12,
    paddingHorizontal: 4,
  },
  statsBreakdownItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  statsBreakdownDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  statsBreakdownLabel: {
    fontSize: 12,
  },
  statsBreakdownValue: {
    fontSize: 12,
    fontWeight: "600",
  },
});
