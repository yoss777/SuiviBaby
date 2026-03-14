import { ThemedText } from "@/components/themed-text";
import { DateFilterBar, DateFilterValue } from "@/components/ui/DateFilterBar";
import { ConfirmModal } from "@/components/ui/ConfirmModal";
import { LoadMoreButton } from "@/components/ui/LoadMoreButton";
import { SelectionToolbar } from "@/components/ui/SelectionToolbar";
import { HeaderMenu, HeaderMenuItem } from "@/components/ui/HeaderMenu";
import { eventColors } from "@/constants/eventColors";
import { MAX_AUTO_LOAD_ATTEMPTS } from "@/constants/pagination";
import { getCategoryColors, getNeutralColors } from "@/constants/dashboardColors";
import { Colors } from "@/constants/theme";
import { useBaby } from "@/contexts/BabyContext";
import { useSheet } from "@/contexts/SheetContext";
import { useToast } from "@/contexts/ToastContext";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { useBatchSelect } from "@/hooks/useBatchSelect";
import { useSwipeHint } from "@/hooks/useSwipeHint";
import { modifierSommeil, supprimerSommeil, supprimerBain } from "@/migration/eventsDoubleWriteService";
import {
  ecouterBainsHybrid,
  ecouterSommeilsHybrid,
  getNextEventDateBeforeHybrid,
  hasMoreEventsBeforeHybrid,
} from "@/migration/eventsHybridService";
import { BainEvent, SommeilEvent, supprimerEvenement } from "@/services/eventsService";
import { Ionicons } from "@expo/vector-icons";
import FontAwesome from "@expo/vector-icons/FontAwesome6";
import { HeaderBackButton } from "@react-navigation/elements";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import { router, useLocalSearchParams } from "expo-router";
import * as Haptics from "expo-haptics";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Animated,
  BackHandler,
  Easing,
  FlatList,
  InteractionManager,
  LayoutAnimation,
  Platform,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  UIManager,
  View,
} from "react-native";
import { Calendar, DateData } from "react-native-calendars";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import ReanimatedSwipeable from "react-native-gesture-handler/ReanimatedSwipeable";
import { SafeAreaView } from "react-native-safe-area-context";
import { useHeaderLeft, useHeaderRight } from "../../_layout";
import {
  RoutineType,
  RoutinesEditData,
  SleepMode,
} from "@/components/forms/RoutinesForm";

// Enable LayoutAnimation on Android
if (
  Platform.OS === "android" &&
  UIManager.setLayoutAnimationEnabledExperimental
) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

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
  colorScheme,
}: {
  onPress: () => void;
  colorScheme: "light" | "dark";
}) {
  const nc = getNeutralColors(colorScheme);
  return (
    <Pressable
      style={[styles.deleteAction, { backgroundColor: nc.error }]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel="Supprimer cet événement"
    >
      <Ionicons name="trash-outline" size={20} color={nc.white} />
      <Text style={[styles.deleteActionText, { color: nc.white }]}>Supprimer</Text>
    </Pressable>
  );
});

// ============================================
// SKELETON LOADING COMPONENT
// ============================================

const RoutinesSkeleton = React.memo(function RoutinesSkeleton({
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
        { borderColor: nc.borderLight, backgroundColor: nc.backgroundCard, shadowColor: nc.shadow },
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
// TYPES
// ============================================

type RoutineEvent = (SommeilEvent | BainEvent) & { id: string };

type RoutineGroup = {
  date: string;
  events: RoutineEvent[];
  counts: Record<RoutineType, number>;
  lastEvent: RoutineEvent;
};

const TYPE_CONFIG: Record<
  RoutineType,
  { label: string; color: string; icon: string }
> = {
  sommeil: {
    label: "Sommeil",
    color: eventColors.sommeil.dark,
    icon: "bed",
  },
  bain: {
    label: "Bain",
    color: eventColors.bain.dark,
    icon: "bath",
  },
};

const formatDateKey = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(
    date.getDate(),
  ).padStart(2, "0")}`;

const formatTime = (date: Date) =>
  date.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });

const formatDuration = (minutes?: number) => {
  if (!minutes || minutes <= 0) return "0 min";
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m > 0 ? `${h}h${String(m).padStart(2, "0")}` : `${h}h`;
};

const toDate = (value: any) => {
  if (value?.seconds) return new Date(value.seconds * 1000);
  if (value?.toDate) return value.toDate();
  if (value instanceof Date) return value;
  return new Date(value);
};

// ============================================
// COMPONENT
// ============================================

export default function RoutinesScreen() {
  const { activeChild } = useBaby();
  const { setHeaderRight } = useHeaderRight();
  const { setHeaderLeft } = useHeaderLeft();
  const colorScheme = useColorScheme() ?? "light";
  const nc = getNeutralColors(colorScheme);
  const { openSheet, closeSheet, isOpen } = useSheet();
  const { showToast, showUndoToast, showActionToast } = useToast();
  const { swipeableRef, triggerHint } = useSwipeHint();
  const navigation = useNavigation();
  const headerOwnerId = useRef(
    `routines-${Math.random().toString(36).slice(2)}`,
  );
  const { selectionMode, selectedIds, selectedCount, toggleSelectionMode, exitSelectionMode, toggleId, selectAll, clearSelection } = useBatchSelect();

  const { openModal, editId, returnTo, type, mode } = useLocalSearchParams();
  const returnTargetParam = Array.isArray(returnTo) ? returnTo[0] : returnTo;
  const sheetOwnerId = "routines";

  const [showCalendar, setShowCalendar] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [selectedFilter, setSelectedFilter] = useState<DateFilterValue | null>(null);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [layoutReady, setLayoutReady] = useState(false);
  const [pendingOpen, setPendingOpen] = useState(false);

  const [events, setEvents] = useState<RoutineEvent[]>([]);
  const [groupedEvents, setGroupedEvents] = useState<RoutineGroup[]>([]);
  const [expandedDays, setExpandedDays] = useState<Set<string>>(new Set());
  const [loaded, setLoaded] = useState({ sommeil: false, bain: false });
  const [emptyDelayDone, setEmptyDelayDone] = useState(false);
  const [daysWindow, setDaysWindow] = useState(14);
  const [rangeEndDate, setRangeEndDate] = useState<Date | null>(null);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [autoLoadMore, setAutoLoadMore] = useState(false);
  const [autoLoadMoreAttempts, setAutoLoadMoreAttempts] = useState(0);
  const loadMoreVersionRef = useRef(0);
  const pendingLoadMoreRef = useRef(0);

  const [pendingEditData, setPendingEditData] = useState<RoutinesEditData | null>(null);
  const [pendingRoutineType, setPendingRoutineType] = useState<RoutineType>("sommeil");
  const [pendingSleepMode, setPendingSleepMode] = useState<SleepMode>("nap");

  const [deleteConfirm, setDeleteConfirm] = useState<{
    visible: boolean;
    event: RoutineEvent | null;
  }>({ visible: false, event: null });

  const [softDeletedIds, setSoftDeletedIds] = useState<Set<string>>(new Set());
  const [batchDeleteConfirm, setBatchDeleteConfirm] = useState<{ visible: boolean; ids: string[] }>({ visible: false, ids: [] });

  const [now, setNow] = useState(new Date());

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

  useEffect(() => {
    stashReturnTo();
  }, [stashReturnTo]);

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
  // HEADER
  // ============================================
  const handleCalendarPress = useCallback(() => {
    setShowCalendar((prev) => {
      const nextValue = !prev;
      if (nextValue) {
        const today = new Date();
        setSelectedDate(formatDateKey(today));
        setSelectedFilter(null);
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

  const openAddModal = useCallback((routineType: RoutineType, sleepMode: SleepMode = "nap") => {
    setPendingEditData(null);
    setPendingRoutineType(routineType);
    setPendingSleepMode(sleepMode);
    setPendingOpen(true);
  }, []);

  const handleAddPress = useCallback(() => {
    openAddModal("sommeil", "nap");
  }, [openAddModal]);

  const menuItems: HeaderMenuItem[] = useMemo(() => [
    { label: "Ajouter", icon: "add-circle-outline", onPress: handleAddPress },
    {
      label: selectionMode ? "Annuler sélection" : "Sélectionner",
      icon: selectionMode ? "close-outline" : "checkmark-done-outline",
      onPress: toggleSelectionMode,
    },
  ], [handleAddPress, selectionMode, toggleSelectionMode]);

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
      const backButton = (
        <HeaderBackButton
          onPress={() => {
            if (returnTargetParam === "home") {
              router.replace("/baby/home");
              return;
            }
            if (
              returnTargetParam === "chrono" ||
              returnTargetParam === "journal"
            ) {
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
        if (returnTargetParam === "home") {
          router.replace("/baby/home");
          return true;
        }
        if (returnTargetParam === "chrono" || returnTargetParam === "journal") {
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
    }, [closeSheet, isOpen, returnTargetParam, router]),
  );

  const handlePullToRefresh = useCallback(() => {
    setIsRefreshing(true);
    setRefreshKey((k) => k + 1);
  }, []);

  // ============================================
  // DATA LISTENERS
  // ============================================
  useEffect(() => {
    if (!activeChild?.id) return;
    const versionAtSubscribe = loadMoreVersionRef.current;
    const endOfRange = rangeEndDate ? new Date(rangeEndDate) : new Date();
    endOfRange.setHours(23, 59, 59, 999);
    const startOfRange = new Date(endOfRange);
    startOfRange.setHours(0, 0, 0, 0);
    startOfRange.setDate(startOfRange.getDate() - (daysWindow - 1));

    let sommeilsData: RoutineEvent[] = [];
    let bainsData: RoutineEvent[] = [];

    const merge = () => {
      const merged = [...sommeilsData, ...bainsData].sort(
        (a, b) => toDate(b.date).getTime() - toDate(a.date).getTime(),
      );
      setEvents(merged);
      setIsRefreshing(false);

      // Clean up soft-deleted IDs that are no longer in the dataset
      setSoftDeletedIds((prev) => {
        if (prev.size === 0) return prev;
        const ids = new Set(merged.map((e) => e.id));
        const next = new Set<string>();
        prev.forEach((id) => { if (ids.has(id)) next.add(id); });
        return next.size === prev.size ? prev : next;
      });

      if (
        pendingLoadMoreRef.current > 0 &&
        versionAtSubscribe === loadMoreVersionRef.current
      ) {
        pendingLoadMoreRef.current -= 1;
        if (pendingLoadMoreRef.current <= 0) {
          setIsLoadingMore(false);
        }
      }
    };

    const unsubscribeSommeils = ecouterSommeilsHybrid(
      activeChild.id,
      (data) => {
        sommeilsData = data as RoutineEvent[];
        setLoaded((prev) => ({ ...prev, sommeil: true }));
        merge();
      },
      { waitForServer: true, depuis: startOfRange, jusqu: endOfRange },
    );

    const unsubscribeBains = ecouterBainsHybrid(
      activeChild.id,
      (data) => {
        bainsData = data as RoutineEvent[];
        setLoaded((prev) => ({ ...prev, bain: true }));
        merge();
      },
      { waitForServer: true, depuis: startOfRange, jusqu: endOfRange },
    );

    return () => {
      unsubscribeSommeils();
      unsubscribeBains();
    };
  }, [activeChild?.id, daysWindow, rangeEndDate, refreshKey]);

  useEffect(() => {
    if (!activeChild?.id) return;
    setEvents([]);
    setGroupedEvents([]);
    setLoaded({ sommeil: false, bain: false });
    setEmptyDelayDone(false);
    setDaysWindow(14);
    setRangeEndDate(null);
    setIsLoadingMore(false);
    setHasMore(true);
    setExpandedDays(new Set());
    loadMoreVersionRef.current = 0;
    pendingLoadMoreRef.current = 0;
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
    if (Object.values(loaded).every(Boolean) && events.length > 0) {
      triggerHint();
    }
  }, [loaded, events.length, triggerHint]);

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
    hasMoreEventsBeforeHybrid(activeChild.id, ["sommeil", "bain"], beforeDate)
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
        dotColor:
          item.type === "bain"
            ? eventColors.bain.dark
            : eventColors.sommeil.dark,
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
    if (selectedFilter === "today") {
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

  const sommeilEnCours = useMemo(() => {
    return events.find(
      (item) => item.type === "sommeil" && !item.heureFin && item.heureDebut,
    ) as (SommeilEvent & { id: string }) | undefined;
  }, [events]);

  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | null = null;
    if (sommeilEnCours) {
      timer = setInterval(() => setNow(new Date()), 60000);
    }
    return () => {
      if (timer) clearInterval(timer);
    };
  }, [sommeilEnCours]);

  const elapsedMinutes = useMemo(() => {
    if (!sommeilEnCours?.heureDebut) return 0;
    const start = toDate(sommeilEnCours.heureDebut);
    return Math.max(0, Math.round((now.getTime() - start.getTime()) / 60000));
  }, [sommeilEnCours, now]);

  const pulseAnim = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (sommeilEnCours) {
      const pulse = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 1.015, duration: 1500, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
          Animated.timing(pulseAnim, { toValue: 1, duration: 1500, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        ]),
      );
      pulse.start();
      return () => pulse.stop();
    } else {
      pulseAnim.setValue(1);
    }
  }, [sommeilEnCours, pulseAnim]);

  const handleDateSelect = useCallback((day: DateData) => {
    setSelectedDate(day.dateString);
    setSelectedFilter(null);
    setShowCalendar(false);
    setExpandedDays(new Set([day.dateString]));
  }, []);

  const handleFilterPress = useCallback((filter: DateFilterValue) => {
    if (filter === "today") {
      applyTodayFilter();
      return;
    }
    setSelectedFilter(filter);
    setSelectedDate(null);
    setShowCalendar(false);
    setExpandedDays(new Set());
  }, [applyTodayFilter]);

  useFocusEffect(
    useCallback(() => {
      if (!selectedFilter && !selectedDate) {
        applyTodayFilter();
      }
    }, [applyTodayFilter, selectedDate, selectedFilter]),
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

    const groups: Record<string, RoutineEvent[]> = {};
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
        const counts = {
          sommeil: 0,
          bain: 0,
        } as Record<RoutineType, number>;
        sorted.forEach((item) => {
          counts[item.type as RoutineType] += 1;
        });
        return {
          date,
          events: sorted,
          counts,
          lastEvent: sorted[0],
        };
      })
      .sort((a, b) => (a.date < b.date ? 1 : -1));

    setGroupedEvents(grouped);
  }, [events, selectedFilter, selectedDate, showCalendar, softDeletedIds]);

  const loadMoreStep = useCallback(
    async (auto = false) => {
      if (!hasMore || !activeChild?.id) return;
      setIsLoadingMore(true);
      pendingLoadMoreRef.current = 2;
      loadMoreVersionRef.current += 1;

      const endOfRange = rangeEndDate ? new Date(rangeEndDate) : new Date();
      endOfRange.setHours(23, 59, 59, 999);
      const startOfRange = new Date(endOfRange);
      startOfRange.setHours(0, 0, 0, 0);
      startOfRange.setDate(startOfRange.getDate() - (daysWindow - 1));
      const beforeDate = new Date(startOfRange.getTime() - 1);

      if (!auto || autoLoadMoreAttempts >= MAX_AUTO_LOAD_ATTEMPTS - 1) {
        // Clic manuel ou auto épuisé : sauter directement au prochain événement
        const nextEventDate = await getNextEventDateBeforeHybrid(
          activeChild.id,
          ["sommeil", "bain"],
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
          setRangeEndDate(nextEventDate);
        } else {
          setHasMore(false);
          pendingLoadMoreRef.current = 0;
          setIsLoadingMore(false);
          setAutoLoadMore(false);
        }
      } else {
        setDaysWindow((prev) => prev + 14);
      }

      if (!auto) {
        setAutoLoadMore(true);
        setAutoLoadMoreAttempts(0);
      }
    },
    [hasMore, activeChild?.id, autoLoadMoreAttempts, daysWindow, rangeEndDate],
  );

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
  // SHEET LOGIC
  // ============================================
  const buildEditData = useCallback((event: RoutineEvent): RoutinesEditData => {
    if (event.type === "sommeil") {
      return {
        id: event.id,
        type: "sommeil",
        date: toDate(event.date),
        heureDebut: event.heureDebut ? toDate(event.heureDebut) : toDate(event.date),
        heureFin: event.heureFin ? toDate(event.heureFin) : null,
        isNap: event.isNap,
        location: event.location,
        quality: event.quality,
        duree: event.duree,
        note: event.note,
      };
    }
    // Bain
    const bain = event as BainEvent & { id: string };
    return {
      id: bain.id,
      type: "bain",
      date: toDate(bain.date),
      temperatureEau: bain.temperatureEau,
      produits: bain.produits,
      duree: bain.duree,
      note: bain.note,
    };
  }, []);

  const openEditModal = useCallback((event: RoutineEvent) => {
    const editData = buildEditData(event);
    setPendingEditData(editData);
    setPendingRoutineType(event.type as RoutineType);
    if (event.type === "sommeil") {
      setPendingSleepMode(event.isNap ? "nap" : "night");
    }
    setPendingOpen(true);
  }, [buildEditData]);

  const handleEventDelete = useCallback((event: RoutineEvent) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setDeleteConfirm({ visible: true, event });
  }, []);

  const confirmDelete = useCallback(async () => {
    if (!activeChild?.id || !deleteConfirm.event?.id) return;
    const eventId = deleteConfirm.event.id;
    const eventType = deleteConfirm.event.type;
    const childId = activeChild.id;
    setDeleteConfirm({ visible: false, event: null });

    // Soft-delete: hide immediately from UI
    setSoftDeletedIds((prev) => new Set(prev).add(eventId));

    showUndoToast(
      "Événement supprimé",
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
          if (eventType === "sommeil") {
            await supprimerSommeil(childId, eventId);
          } else {
            await supprimerBain(childId, eventId);
          }
        } catch {
          // Restore if delete fails
          setSoftDeletedIds((prev) => {
            const next = new Set(prev);
            next.delete(eventId);
            return next;
          });
          const retryDelete = eventType === "sommeil"
            ? () => supprimerSommeil(childId, eventId)
            : () => supprimerBain(childId, eventId);
          showActionToast("Erreur lors de la suppression", "Réessayer", () => {
            retryDelete().catch(() => {
              showActionToast("Erreur lors de la suppression", "Réessayer", () => {
                retryDelete();
              });
            });
          });
        }
      },
      4000,
    );
  }, [activeChild?.id, deleteConfirm.event, showUndoToast, showActionToast]);

  const cancelDelete = useCallback(() => {
    setDeleteConfirm({ visible: false, event: null });
  }, []);

  const confirmBatchDelete = useCallback(() => {
    if (!activeChild?.id) return;
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
          await Promise.all(ids.map((id) => supprimerEvenement(childId, id)));
        } catch {
          // Restore if delete fails
          setSoftDeletedIds((prev) => {
            const next = new Set(prev);
            ids.forEach((id) => next.delete(id));
            return next;
          });
          showActionToast("Erreur lors de la suppression", "Réessayer", () => {
            Promise.all(ids.map((id) => supprimerEvenement(childId, id))).catch(() => {
              showActionToast("Erreur lors de la suppression", "Réessayer", () => {
                Promise.all(ids.map((id) => supprimerEvenement(childId, id)));
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

  useFocusEffect(
    useCallback(() => {
      if (openModal !== "true") return;
      const normalizedType = normalizeParam(type);
      const normalizedMode = normalizeParam(mode);
      const routineType: RoutineType =
        normalizedType && ["bain", "sommeil"].includes(normalizedType)
          ? (normalizedType as RoutineType)
          : "sommeil";
      const sleepMode: SleepMode =
        normalizedMode === "night" ? "night" : "nap";

      setPendingEditData(null);
      setPendingRoutineType(routineType);
      setPendingSleepMode(sleepMode);
      setPendingOpen(true);
    }, [openModal, type, mode]),
  );

  useEffect(() => {
    if (!pendingOpen || !layoutReady) return;
    const returnTarget = returnTargetParam ?? returnToRef.current;

    const isEditing = !!pendingEditData;
    const task = InteractionManager.runAfterInteractions(() => {
      stashReturnTo();

      openSheet({
        ownerId: sheetOwnerId,
        formType: "routines",
        routineType: pendingRoutineType,
        sleepMode: pendingSleepMode,
        editData: pendingEditData ?? undefined,
        sommeilEnCours: sommeilEnCours ? { id: sommeilEnCours.id } : null,
        onSuccess: () => {
          ensureTodayInRange();
          applyTodayFilter();
          showToast(isEditing ? "Routine modifiée" : "Routine enregistrée");
        },
        onDismiss: () => {
          editIdRef.current = null;
          maybeReturnTo(returnTarget);
        },
      });

      navigation.setParams({
        openModal: undefined,
        editId: undefined,
        type: undefined,
        mode: undefined,
      } as any);
      setPendingOpen(false);
    });
    return () => task.cancel?.();
  }, [
    pendingOpen,
    layoutReady,
    pendingEditData,
    pendingRoutineType,
    pendingSleepMode,
    sommeilEnCours,
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
      type: undefined,
      mode: undefined,
    } as any);
  }, [editId, layoutReady, events, navigation, openEditModal, stashReturnTo]);

  // ============================================
  // STOP ONGOING SLEEP
  // ============================================
  const handleStopSleep = useCallback(async () => {
    if (!activeChild?.id || !sommeilEnCours) return;
    try {
      const fin = new Date();
      const start = toDate(sommeilEnCours.heureDebut);
      const duree = Math.max(
        0,
        Math.round((fin.getTime() - start.getTime()) / 60000),
      );
      await modifierSommeil(activeChild.id, sommeilEnCours.id, {
        heureFin: fin,
        duree,
      });
      openEditModal({
        ...(sommeilEnCours as any),
        heureFin: fin,
        duree,
      });
    } catch {
      showToast("Impossible d'arrêter le sommeil.");
    }
  }, [activeChild?.id, sommeilEnCours, openEditModal, showToast]);

  // ============================================
  // RENDER HELPERS
  // ============================================
  const buildDetails = useCallback((event: RoutineEvent) => {
    if (event.type === "sommeil") {
      const start = event.heureDebut
        ? toDate(event.heureDebut)
        : toDate(event.date);
      const end = event.heureFin ? toDate(event.heureFin) : null;
      const duration =
        event.duree ??
        (end ? Math.round((end.getTime() - start.getTime()) / 60000) : 0);
      const parts = [
        formatDuration(duration),
        event.location,
        event.quality,
      ].filter(Boolean);
      return parts.length > 0 ? parts.join(" · ") : undefined;
    }

    const bath = event as any;
    const parts = [
      bath.duree ? `${bath.duree} min` : null,
      bath.temperatureEau ? `${bath.temperatureEau}°C` : null,
      bath.produits,
    ].filter(Boolean);
    return parts.length > 0 ? parts.join(" · ") : undefined;
  }, []);

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

  const handleBatchDelete = useCallback(() => {
    if (!activeChild?.id || selectedCount === 0) return;
    const ids = Array.from(selectedIds);
    setBatchDeleteConfirm({ visible: true, ids });
  }, [activeChild?.id, selectedIds, selectedCount]);

  const renderEventItem = useCallback((event: RoutineEvent, isLast = false, isFirstInList = false) => {
    const time = toDate(event.date);
    const config = TYPE_CONFIG[event.type as RoutineType];
    const isSleep = event.type === "sommeil";
    const sleepEnd = isSleep && event.heureFin ? toDate(event.heureFin) : null;
    const sleepMeta = isSleep
      ? [event.location, event.quality].filter(Boolean)
      : [];
    const sleepIsOngoing = isSleep && !sleepEnd;
    const sleepDuration =
      isSleep && event.heureDebut && sleepEnd
        ? Math.max(
            0,
            Math.round(
              (sleepEnd.getTime() - toDate(event.heureDebut).getTime()) / 60000,
            ),
          )
        : isSleep && sleepIsOngoing && event.heureDebut
          ? Math.max(
              0,
              Math.round(
                (now.getTime() - toDate(event.heureDebut).getTime()) / 60000,
              ),
            )
          : isSleep
            ? (event.duree ?? 0)
            : 0;
    return (
      <ReanimatedSwipeable
        ref={isFirstInList ? swipeableRef : undefined}
        key={event.id}
        renderRightActions={() => (
          <DeleteAction onPress={() => handleEventDelete(event)} colorScheme={colorScheme} />
        )}
        friction={2}
        rightThreshold={40}
        overshootRight={false}
      >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Modifier cet événement"
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
              shadowColor: nc.shadow,
              borderLeftWidth: isSelected ? 3 : 0,
              borderLeftColor: isSelected
                ? Colors[colorScheme ?? "light"].tint
                : "transparent",
            },
          ];
        }}
        onPress={selectionMode ? () => toggleId(event.id) : () => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); openEditModal(event); }}
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
          {isSleep && sleepEnd ? (
            <>
              <Text
                style={[
                  styles.sessionTimeText,
                  { color: nc.textMuted },
                  isLast && { color: nc.textStrong, fontWeight: "600" },
                ]}
              >
                {formatTime(time)}
              </Text>
              <Text style={[styles.sessionTimeArrow, { color: nc.textMuted }]}>↓</Text>
              <Text style={[styles.sessionTimeTextSecondary, { color: nc.textMuted }]}>
                {formatTime(sleepEnd)}
              </Text>
            </>
          ) : isSleep && sleepIsOngoing ? (
            <>
              <Text
                style={[
                  styles.sessionTimeText,
                  { color: nc.textMuted },
                  isLast && { color: nc.textStrong, fontWeight: "600" },
                ]}
              >
                {formatTime(time)}
              </Text>
              <Text style={[styles.sessionTimeArrow, { color: nc.textMuted }]}>↓</Text>
              <Text style={[styles.sessionTimeOngoing, { color: eventColors.sommeil.dark }]}>
                en cours
              </Text>
            </>
          ) : (
            <Text
              style={[
                styles.sessionTimeText,
                { color: nc.textMuted },
                isLast && { color: nc.textStrong, fontWeight: "600" },
              ]}
            >
              {formatTime(time)}
            </Text>
          )}
        </View>
        <View
          style={[
            styles.sessionIconWrapper,
            { backgroundColor: `${config.color}20` },
          ]}
        >
          {isSleep ? (
            <FontAwesome
              name={event.isNap ? "bed" : "moon"}
              size={14}
              color={eventColors.sommeil.dark}
            />
          ) : (
            <FontAwesome
              name={config.icon as any}
              size={14}
              color={config.color}
            />
          )}
        </View>
        <View style={styles.sessionContent}>
          <View style={styles.sessionDetails}>
            <Text style={[styles.sessionType, { color: nc.textStrong }]}>
              {isSleep
                ? event.isNap
                  ? "Sieste"
                  : "Nuit de sommeil"
                : config.label}
            </Text>
            {isSleep ? (
              <>
                {(sleepEnd || sleepIsOngoing) && sleepMeta.length > 0 && (
                  <Text style={[styles.sessionDetailText, { color: nc.textMuted }]}>
                    {sleepMeta.join(" · ")}
                  </Text>
                )}
              </>
            ) : (
              <Text style={[styles.sessionDetailText, { color: nc.textMuted }]}>
                {buildDetails(event)}
              </Text>
            )}
          </View>
        </View>
        {isSleep && (
          <View style={styles.sessionTotal}>
            <Text style={[styles.sessionTotalValue, { color: eventColors.sommeil.dark }]}>
              {formatDuration(sleepDuration)}
            </Text>
          </View>
        )}
        <Ionicons name="create-outline" size={18} color={nc.textMuted} />
      </Pressable>
      </ReanimatedSwipeable>
    );
  }, [nc, openEditModal, handleEventDelete, buildDetails, now, selectionMode, selectedIds, toggleId, colorScheme, swipeableRef]);

  const renderDayGroup = useCallback(({ item, index }: { item: RoutineGroup; index: number }) => {
    const [year, month, day] = item.date.split("-").map(Number);
    const date = new Date(year, month - 1, day);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    const dayLabel =
      date.toDateString() === today.toDateString() && selectedFilter !== "today"
        ? "Aujourd'hui"
        : date.toDateString() === yesterday.toDateString()
          ? "Hier"
          : date.toLocaleDateString("fr-FR", {
              weekday: "short",
              day: "numeric",
              month: "short",
            });

    const isExpanded = expandedDays.has(item.date);
    const bainCount = item.counts.bain;
    const napCount = item.events.filter(
      (evt) => evt.type === "sommeil" && evt.isNap,
    ).length;
    const nightCount = item.events.filter(
      (evt) => evt.type === "sommeil" && !evt.isNap,
    ).length;

    return (
      <View style={styles.dayGroup}>
        <View style={styles.dayHeader}>
          <Text style={[styles.dayLabel, { color: nc.textStrong }]}>{dayLabel}</Text>
          <View style={styles.dayStats}>
            <View style={styles.dayStatItem}>
              <Text style={[styles.dayStatValue, { color: nc.textNormal }]}>{item.events.length}</Text>
              <Text style={[styles.dayStatLabel, { color: nc.textMuted }]}>
                routine{item.events.length > 1 ? "s" : ""}
              </Text>
            </View>
          </View>
        </View>
        <View style={styles.statsBreakdown}>
          {napCount > 0 && (
            <View style={styles.statsBreakdownItem}>
              <View
                style={[
                  styles.statsBreakdownDot,
                  { backgroundColor: eventColors.sommeil.dark },
                ]}
              />
              <Text style={[styles.statsBreakdownLabel, { color: nc.textMuted }]}>
                Sieste{napCount > 1 ? "s" : ""}
              </Text>
              <Text style={[styles.statsBreakdownValue, { color: nc.textNormal }]}>{napCount}</Text>
            </View>
          )}
          {nightCount > 0 && (
            <View style={styles.statsBreakdownItem}>
              <View
                style={[
                  styles.statsBreakdownDot,
                  { backgroundColor: eventColors.sommeil.dark },
                ]}
              />
              <Text style={[styles.statsBreakdownLabel, { color: nc.textMuted }]}>
                Nuit{nightCount > 1 ? "s" : ""}
              </Text>
              <Text style={[styles.statsBreakdownValue, { color: nc.textNormal }]}>{nightCount}</Text>
            </View>
          )}
          {bainCount > 0 && (
            <View style={styles.statsBreakdownItem}>
              <View
                style={[
                  styles.statsBreakdownDot,
                  { backgroundColor: eventColors.bain.dark },
                ]}
              />
              <Text style={[styles.statsBreakdownLabel, { color: nc.textMuted }]}>
                Bain{bainCount > 1 ? "s" : ""}
              </Text>
              <Text style={[styles.statsBreakdownValue, { color: nc.textNormal }]}>{bainCount}</Text>
            </View>
          )}
        </View>
        <View style={styles.sessionsContainer}>
          {renderEventItem(item.lastEvent, true, index === 0)}
          {item.events.length > 1 &&
            isExpanded &&
            item.events
              .filter((evt) => evt.id !== item.lastEvent.id)
              .map((evt) => renderEventItem(evt, false))}
          {item.events.length > 1 && (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={isExpanded ? "Masquer les routines" : "Voir toutes les routines"}
              style={({ pressed }) => [
                styles.expandTrigger,
                { borderColor: nc.borderLight, backgroundColor: pressed ? nc.backgroundPressed : nc.backgroundCard },
              ]}
              onPress={() => toggleExpand(item.date)}
            >
              <Text style={[styles.expandTriggerText, { color: Colors[colorScheme].tint }]}>
                {isExpanded
                  ? "Masquer"
                  : `${item.events.length - 1} autre${
                      item.events.length > 2 ? "s" : ""
                    } routine${item.events.length > 2 ? "s" : ""}`}
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
    );
  }, [expandedDays, nc, renderEventItem, toggleExpand, selectedFilter, colorScheme]);

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
              selected={selectedDate ? ("past" as DateFilterValue) : (selectedFilter ?? "today")}
              onSelect={handleFilterPress}
            >
              {selectedDate && (
                <Pressable
                  style={[styles.dateChip, { backgroundColor: Colors[colorScheme].tint }]}
                  onPress={clearSelectedDate}
                  accessibilityRole="button"
                  accessibilityLabel="Effacer la date sélectionnée"
                >
                  <Text style={[styles.dateChipText, { color: nc.white }]}>
                    {formatSelectedDateLabel(selectedDate)}
                  </Text>
                  <Ionicons name="close" size={14} color={nc.white} />
                </Pressable>
              )}
            </DateFilterBar>
            <View style={styles.quickActionsRow}>
              <TouchableOpacity
                style={[styles.quickActionButton, { backgroundColor: nc.backgroundPressed }]}
                onPress={() => openAddModal("sommeil", "nap")}
              >
                <FontAwesome
                  name="bed"
                  size={14}
                  color={Colors[colorScheme].tint}
                />
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.quickActionButton, { backgroundColor: nc.backgroundPressed }]}
                onPress={() => openAddModal("sommeil", "night")}
              >
                <FontAwesome
                  name="moon"
                  size={14}
                  color={Colors[colorScheme].tint}
                />
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.quickActionButton, { backgroundColor: nc.backgroundPressed }]}
                onPress={() => openAddModal("bain")}
              >
                <FontAwesome
                  name="bath"
                  size={14}
                  color={Colors[colorScheme].tint}
                />
              </TouchableOpacity>
            </View>
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
                  selectedDayTextColor: nc.white,
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

        {sommeilEnCours && (
          <Animated.View
            style={[
              styles.sleepWidgetWrapper,
              {
                backgroundColor: getCategoryColors(colorScheme).sommeil.background,
                borderWidth: 2,
                borderColor: getCategoryColors(colorScheme).sommeil.primary,
                shadowColor: getCategoryColors(colorScheme).sommeil.primary,
                shadowOpacity: 0.25,
                shadowRadius: 12,
                shadowOffset: { width: 0, height: 2 },
                elevation: 4,
                transform: [{ scale: pulseAnim }],
              },
            ]}
            accessibilityRole="timer"
            accessibilityLabel={`${sommeilEnCours.isNap ? "Sieste" : "Nuit"} en cours depuis ${formatDuration(elapsedMinutes)}`}
          >
            <View style={styles.sleepWidgetHeaderRow}>
              <FontAwesome
                name={sommeilEnCours.isNap ? "bed" : "moon"}
                size={14}
                color={colorScheme === "dark" ? "#D4C8F0" : "#4A3D6B"}
              />
              <Text style={[styles.sleepWidgetTitle, { color: colorScheme === "dark" ? "#D4C8F0" : "#4A3D6B" }]}>
                {sommeilEnCours.isNap ? "Sieste" : "Nuit"} en cours
              </Text>
            </View>
            <Text style={[styles.sleepWidgetValue, { color: colorScheme === "dark" ? "#D4C8F0" : "#4A3D6B" }]}>
              {formatDuration(elapsedMinutes)}
            </Text>
            <Text style={[styles.sleepWidgetSubtitle, { color: colorScheme === "dark" ? "#9B8CBF" : "#7A6B9A" }]}>
              Début {formatTime(toDate(sommeilEnCours.heureDebut))}
            </Text>
            <TouchableOpacity
              style={[styles.sleepWidgetStop, { backgroundColor: getCategoryColors(colorScheme).sommeil.primary }]}
              onPress={handleStopSleep}
              accessibilityRole="button"
              accessibilityLabel="Terminer le sommeil"
            >
              <Text style={[styles.sleepWidgetStopText, { color: nc.backgroundCard }]}>Terminer</Text>
            </TouchableOpacity>
          </Animated.View>
        )}

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
                  { backgroundColor: `${eventColors.sommeil.dark}15` },
                ]}
              >
                <Ionicons
                  name="bed-outline"
                  size={36}
                  color={eventColors.sommeil.dark}
                />
              </View>
              <ThemedText style={[styles.emptyTitle, { color: nc.textStrong }]}>
                {events.length === 0
                  ? "Aucune routine enregistrée"
                  : "Aucune routine pour ce filtre"}
              </ThemedText>
              <ThemedText style={[styles.emptySubtitle, { color: nc.textMuted }]}>
                Suivez le sommeil et les bains
              </ThemedText>
              {events.length === 0 && (
                <Pressable
                  style={[styles.emptyCta, { backgroundColor: Colors[colorScheme].tint }]}
                  onPress={() => openAddModal("sommeil", "nap")}
                  accessibilityRole="button"
                  accessibilityLabel="Ajouter une routine"
                >
                  <Ionicons name="add" size={20} color={nc.white} />
                  <Text style={[styles.emptyCtaText, { color: nc.white }]}>Ajouter une routine</Text>
                </Pressable>
              )}
              {!(selectedFilter === "today" || selectedDate) && (
                <LoadMoreButton
                  loading={isLoadingMore}
                  hasMore={hasMore}
                  onPress={handleLoadMore}
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
              contentContainerStyle={[styles.listContent, { flexGrow: 1 }]}
              refreshControl={
                <RefreshControl
                  refreshing={isRefreshing}
                  onRefresh={handlePullToRefresh}
                  tintColor={Colors[colorScheme].tint}
                />
              }
              ListFooterComponent={
                selectedFilter === "today" || selectedDate ? null : (
                  <LoadMoreButton
                    loading={isLoadingMore}
                    hasMore={hasMore}
                    onPress={handleLoadMore}
                    accentColor={Colors[colorScheme].tint}
                  />
                )
              }
            />
          )
        ) : (
          <RoutinesSkeleton colorScheme={colorScheme} />
        )}
      </SafeAreaView>
      <ConfirmModal
        visible={deleteConfirm.visible}
        title="Suppression"
        message={
          deleteConfirm.event?.type === "sommeil"
            ? "Voulez-vous vraiment supprimer ce sommeil ?"
            : "Voulez-vous vraiment supprimer ce bain ?"
        }
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
  sleepWidgetWrapper: {
    marginHorizontal: 16,
    marginBottom: 12,
    borderRadius: 16,
    padding: 16,
    overflow: "hidden",
  },
  sleepWidgetHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  sleepWidgetTitle: {
    fontSize: 14,
    fontWeight: "700",
  },
  sleepWidgetValue: {
    marginTop: 6,
    fontSize: 26,
    fontWeight: "700",
  },
  sleepWidgetSubtitle: {
    marginTop: 4,
    fontSize: 12,
  },
  sleepWidgetStop: {
    marginTop: 10,
    minHeight: 44,
    paddingVertical: 10,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  sleepWidgetStopText: {
    fontWeight: "700",
  },
  filterRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingRight: 16,
  },
  quickActionsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginLeft: 8,
  },
  quickActionButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  listContent: {
    paddingHorizontal: 16,
    paddingTop: 8,
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
  sessionTimeArrow: {
    fontSize: 12,
    lineHeight: 12,
    alignSelf: "flex-start",
  },
  sessionTimeTextSecondary: {
    fontSize: 12,
    fontWeight: "600",
  },
  sessionTimeOngoing: {
    fontSize: 11,
    fontWeight: "700",
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
  sessionDetailText: {
    fontSize: 12,
  },
  sessionTotal: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: 2,
    minWidth: 50,
    justifyContent: "flex-end",
  },
  sessionTotalValue: {
    fontSize: 18,
    fontWeight: "700",
  },
  expandTrigger: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    paddingVertical: 12,
    borderRadius: 14,
    borderWidth: 1,
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
    fontSize: 15,
    fontWeight: "600",
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
    fontSize: 13,
    fontWeight: "600",
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
  deleteAction: {
    justifyContent: "center",
    alignItems: "center",
    width: 80,
    borderRadius: 14,
    marginHorizontal: 4,
    marginVertical: 1,
    gap: 4,
  },
  deleteActionText: {
    fontSize: 11,
    fontWeight: "700",
  },
});
