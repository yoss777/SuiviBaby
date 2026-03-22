import { ActivitiesEditData, ActiviteType } from "@/components/forms/ActivitiesForm";
import { PromenadeWidget } from "@/components/suivibaby/dashboard/PromenadeWidget";
import { ThemedText } from "@/components/themed-text";
import { ConfirmModal } from "@/components/ui/ConfirmModal";
import { DateFilterBar } from "@/components/ui/DateFilterBar";
import { LoadMoreButton } from "@/components/ui/LoadMoreButton";
import { SelectionToolbar } from "@/components/ui/SelectionToolbar";
import { HeaderMenu, HeaderMenuItem } from "@/components/ui/HeaderMenu";
import { eventColors } from "@/constants/eventColors";
import { MAX_AUTO_LOAD_ATTEMPTS } from "@/constants/pagination";
import { getNeutralColors } from "@/constants/dashboardColors";
import { Colors } from "@/constants/theme";
import { useBaby } from "@/contexts/BabyContext";
import { useSheet } from "@/contexts/SheetContext";
import { useToast } from "@/contexts/ToastContext";
import { useBatchSelect } from "@/hooks/useBatchSelect";
import { useSwipeHint } from "@/hooks/useSwipeHint";
import { useColorScheme } from "@/hooks/use-color-scheme";
import {
  ecouterActivitesHybrid,
  getNextEventDateBeforeHybrid,
  hasMoreEventsBeforeHybrid,
} from "@/migration/eventsHybridService";
import { supprimerActivite } from "@/migration/eventsDoubleWriteService";
import { ActiviteEvent } from "@/services/eventsService";
import {
  mergeWithFirestoreEvents,
  subscribe as subscribeOptimistic,
} from "@/services/optimisticEventsStore";
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
  FlatList,
  InteractionManager,
  LayoutAnimation,
  Platform,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  UIManager,
  View,
} from "react-native";
import { Calendar, DateData } from "react-native-calendars";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import ReanimatedSwipeable from "react-native-gesture-handler/ReanimatedSwipeable";
import { SafeAreaView } from "react-native-safe-area-context";
import { useHeaderLeft, useHeaderRight } from "../../_layout";

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

type ActivityEventWithId = ActiviteEvent & { id: string };

type ActivityGroup = {
  date: string;
  events: ActivityEventWithId[];
  counts: Record<ActiviteType, number>;
  lastEvent: ActivityEventWithId;
};

const TYPE_CONFIG: Record<
  ActiviteType,
  { label: string; color: string; icon: string }
> = {
  tummyTime: {
    label: "Tummy Time",
    color: eventColors.activite.dark,
    icon: "baby",
  },
  jeux: {
    label: "Jeux",
    color: eventColors.activite.dark,
    icon: "puzzle-piece",
  },
  lecture: {
    label: "Lecture",
    color: eventColors.activite.dark,
    icon: "book",
  },
  promenade: {
    label: "Promenade",
    color: eventColors.activite.dark,
    icon: "person-walking",
  },
  massage: {
    label: "Massage",
    color: eventColors.activite.dark,
    icon: "hand",
  },
  musique: {
    label: "Musique",
    color: eventColors.activite.dark,
    icon: "music",
  },
  eveil: {
    label: "Éveil sensoriel",
    color: eventColors.activite.dark,
    icon: "lightbulb",
  },
  sortie: {
    label: "Sortie",
    color: eventColors.activite.dark,
    icon: "door-open",
  },
  autre: {
    label: "Autre",
    color: eventColors.activite.dark,
    icon: "ellipsis",
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
      accessibilityLabel="Supprimer cette activité"
    >
      <Ionicons name="trash-outline" size={20} color={nc.white} />
      <Text style={[styles.deleteActionText, { color: nc.white }]}>Supprimer</Text>
    </Pressable>
  );
});

// ============================================
// SKELETON LOADING COMPONENT
// ============================================

const ActivitySkeleton = React.memo(function ActivitySkeleton({
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
// COMPONENT
// ============================================

export default function ActivitiesScreen() {
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
  const headerOwnerId = useRef(
    `activities-${Math.random().toString(36).slice(2)}`,
  );

  const { openModal, editId, returnTo, type } = useLocalSearchParams();
  const returnTargetParam = Array.isArray(returnTo) ? returnTo[0] : returnTo;
  const sheetOwnerId = "activities";

  const [showCalendar, setShowCalendar] = useState(false);
  const [selectedFilter, setSelectedFilter] = useState<DateFilterValue>("today");
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [layoutReady, setLayoutReady] = useState(false);
  const [pendingOpen, setPendingOpen] = useState(false);
  const [pendingEditData, setPendingEditData] = useState<ActivitiesEditData | null>(null);
  const [pendingActiviteType, setPendingActiviteType] = useState<ActiviteType>("tummyTime");

  const [events, setEvents] = useState<ActivityEventWithId[]>([]);
  const [groupedEvents, setGroupedEvents] = useState<ActivityGroup[]>([]);
  const [expandedDays, setExpandedDays] = useState<Set<string>>(new Set());
  const [loaded, setLoaded] = useState({ activites: false });
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
  const latestFirestoreActivitesRef = useRef<ActivityEventWithId[]>([]);

  const [deleteConfirm, setDeleteConfirm] = useState<{
    visible: boolean;
    event: ActivityEventWithId | null;
  }>({ visible: false, event: null });

  const [softDeletedIds, setSoftDeletedIds] = useState<Set<string>>(new Set());

  // Detect ongoing promenade (iso sommeilEnCours in routines.tsx)
  const promenadeEnCours = useMemo(() => {
    return events.find(
      (item: any) => item.typeActivite === "promenade" && item.heureDebut && !item.heureFin,
    ) as (ActivityEventWithId & { heureDebut: any }) | undefined;
  }, [events]);

  // Real-time elapsed timer for ongoing promenade
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    if (!promenadeEnCours) return;
    const interval = setInterval(() => setNow(new Date()), 60000);
    return () => clearInterval(interval);
  }, [promenadeEnCours]);

  const elapsedPromenadeMinutes = useMemo(() => {
    if (!promenadeEnCours?.heureDebut) return 0;
    const start = toDate(promenadeEnCours.heureDebut);
    return Math.max(0, Math.round((now.getTime() - start.getTime()) / 60000));
  }, [promenadeEnCours, now]);

  const [batchDeleteConfirm, setBatchDeleteConfirm] = useState<{ visible: boolean; ids: string[] }>({ visible: false, ids: [] });

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
  // BUILD EDIT DATA
  // ============================================
  const buildEditData = useCallback((event: ActivityEventWithId): ActivitiesEditData => {
    return {
      id: event.id,
      typeActivite: event.typeActivite as ActiviteType,
      duree: event.duree,
      description: event.description,
      date: toDate(event.date),
      heureDebut: (event as any).heureDebut ? toDate((event as any).heureDebut) : undefined,
      heureFin: (event as any).heureFin ? toDate((event as any).heureFin) : undefined,
    };
  }, []);

  // ============================================
  // OPEN ADD / EDIT MODAL
  // ============================================
  const openAddModal = useCallback((activiteType: ActiviteType = "tummyTime") => {
    setPendingActiviteType(activiteType);
    setPendingEditData(null);
    setPendingOpen(true);
  }, []);

  const openEditModal = useCallback((event: ActivityEventWithId) => {
    setPendingActiviteType(event.typeActivite as ActiviteType);
    setPendingEditData(buildEditData(event));
    setPendingOpen(true);
  }, [buildEditData]);

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
    { label: "Ajouter", icon: "add-circle-outline", onPress: () => openAddModal("tummyTime") },
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
  // Unified debounced pipeline: both Firestore snapshots and optimistic store
  // changes feed into a single merge+setData, avoiding duplicate renders/flashes.
  useEffect(() => {
    if (!activeChild?.id) return;
    const versionAtSubscribe = loadMoreVersionRef.current;
    const endOfRange = rangeEndDate ? new Date(rangeEndDate) : new Date();
    endOfRange.setHours(23, 59, 59, 999);
    const startOfRange = new Date(endOfRange);
    startOfRange.setHours(0, 0, 0, 0);
    startOfRange.setDate(startOfRange.getDate() - (daysWindow - 1));

    let mergeTimer: ReturnType<typeof setTimeout> | null = null;
    let lastFingerprint = '';
    let loadingSet = false;

    const scheduleMerge = () => {
      if (mergeTimer) clearTimeout(mergeTimer);
      mergeTimer = setTimeout(() => {
        const firestoreEvents = latestFirestoreActivitesRef.current;
        const merged = mergeWithFirestoreEvents(firestoreEvents, activeChild.id) as ActivityEventWithId[];

        const hasOptimistic = merged.some(
          (e: any) => e.id?.startsWith?.('__optimistic_'),
        );
        const fingerprint = `${merged.length}_${hasOptimistic ? 'O' : 'C'}_${merged
          .slice(0, 20)
          .map((e: any) => `${e.type || ''}_${e.date?.seconds || Math.floor((e.date?.getTime?.() || 0) / 1000)}`)
          .join('|')}`;

        if (fingerprint === lastFingerprint) return;
        lastFingerprint = fingerprint;

        setEvents(merged);

        // Clean up soft-deleted IDs that are no longer in the dataset
        setSoftDeletedIds((prev) => {
          if (prev.size === 0) return prev;
          const ids = new Set(merged.map((e) => e.id));
          const next = new Set<string>();
          prev.forEach((id) => { if (ids.has(id)) next.add(id); });
          return next.size === prev.size ? prev : next;
        });
      }, 50);
    };

    const unsubscribe = ecouterActivitesHybrid(
      activeChild.id,
      (data) => {
        const evts = data as ActivityEventWithId[];
        latestFirestoreActivitesRef.current = evts;
        if (!loadingSet) {
          loadingSet = true;
          setLoaded({ activites: true });
          setIsRefreshing(false);
        }
        if (
          pendingLoadMoreRef.current > 0 &&
          versionAtSubscribe === loadMoreVersionRef.current
        ) {
          pendingLoadMoreRef.current = 0;
          setIsLoadingMore(false);
        }
        scheduleMerge();
      },
      { waitForServer: true, depuis: startOfRange, jusqu: endOfRange },
    );

    const unsubOptimistic = subscribeOptimistic(scheduleMerge);

    return () => {
      if (mergeTimer) clearTimeout(mergeTimer);
      unsubscribe();
      unsubOptimistic();
    };
  }, [activeChild?.id, daysWindow, rangeEndDate, refreshKey]);

  useEffect(() => {
    if (!activeChild?.id) return;
    setEvents([]);
    setGroupedEvents([]);
    setLoaded({ activites: false });
    setEmptyDelayDone(false);
    setDaysWindow(14);
    setRangeEndDate(null);
    setIsLoadingMore(false);
    setHasMore(true);
    setExpandedDays(new Set());
    loadMoreVersionRef.current = 0;
    pendingLoadMoreRef.current = 0;
  }, [activeChild?.id]);

  // Jump to most recent event date at mount
  useEffect(() => {
    if (!activeChild?.id) return;
    let cancelled = false;
    const endOfToday = new Date();
    endOfToday.setHours(23, 59, 59, 999);

    getNextEventDateBeforeHybrid(activeChild.id, ["activite"], endOfToday)
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

    return () => { cancelled = true; };
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
    if (Object.values(loaded).every(Boolean) && groupedEvents.length > 0) {
      triggerHint();
    }
  }, [loaded, groupedEvents.length, triggerHint]);

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
    hasMoreEventsBeforeHybrid(activeChild.id, ["activite"], beforeDate)
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
        dotColor: eventColors.activite.dark,
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

    const groups: Record<string, ActivityEventWithId[]> = {};
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
          tummyTime: 0,
          jeux: 0,
          lecture: 0,
          promenade: 0,
          massage: 0,
          musique: 0,
          eveil: 0,
          sortie: 0,
          autre: 0,
        } as Record<ActiviteType, number>;
        sorted.forEach((item) => {
          counts[item.typeActivite as ActiviteType] += 1;
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
      pendingLoadMoreRef.current = 1;
      loadMoreVersionRef.current += 1;

      if (auto && autoLoadMoreAttempts >= MAX_AUTO_LOAD_ATTEMPTS - 1) {
        const endOfRange = rangeEndDate ? new Date(rangeEndDate) : new Date();
        endOfRange.setHours(23, 59, 59, 999);
        const startOfRange = new Date(endOfRange);
        startOfRange.setHours(0, 0, 0, 0);
        startOfRange.setDate(startOfRange.getDate() - (daysWindow - 1));
        const beforeDate = new Date(startOfRange.getTime() - 1);
        const nextEventDate = await getNextEventDateBeforeHybrid(
          activeChild.id,
          ["activite"],
          beforeDate,
        );

        if (nextEventDate) {
          setDaysWindow(14);
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
      const normalizedType = normalizeParam(type);
      const activiteType: ActiviteType =
        normalizedType && Object.keys(TYPE_CONFIG).includes(normalizedType)
          ? (normalizedType as ActiviteType)
          : "tummyTime";
      openAddModal(activiteType);
    }, [openModal, type, openAddModal]),
  );

  useEffect(() => {
    if (!pendingOpen || !layoutReady) return;
    const returnTarget = returnTargetParam ?? returnToRef.current;
    const isEditing = !!pendingEditData;
    const task = InteractionManager.runAfterInteractions(() => {
      stashReturnTo();
      openSheet({
        ownerId: sheetOwnerId,
        formType: "activities",
        activiteType: pendingActiviteType,
        editData: pendingEditData ?? undefined,
        promenadeEnCours: promenadeEnCours ? { id: promenadeEnCours.id } : null,
        onSuccess: () => {
          ensureTodayInRange();
          applyTodayFilter();
          showToast(isEditing ? "Activite modifiee" : "Activite enregistree");
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
      } as any);
      setPendingOpen(false);
    });
    return () => task.cancel?.();
  }, [
    pendingOpen,
    layoutReady,
    pendingActiviteType,
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
      type: undefined,
    } as any);
  }, [editId, layoutReady, events, navigation, openEditModal, stashReturnTo]);

  // ============================================
  // RENDER HELPERS
  // ============================================
  const buildDetails = (event: ActivityEventWithId): { duration?: string; description?: string } | null => {
    const e = event as any;
    const isPromenade = event.typeActivite === "promenade";
    let duration: string | undefined;

    if (isPromenade && e.heureDebut && e.heureFin) {
      const d = Math.max(0, Math.round((toDate(e.heureFin).getTime() - toDate(e.heureDebut).getTime()) / 60000));
      duration = formatDuration(d);
    } else if (isPromenade && e.heureDebut && !e.heureFin) {
      const d = Math.max(0, Math.round((now.getTime() - toDate(e.heureDebut).getTime()) / 60000));
      duration = formatDuration(d);
    } else {
      duration = event.duree ? formatDuration(event.duree) : undefined;
    }

    const description = event.description || undefined;
    if (!duration && !description) return null;
    return { duration, description };
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

  const handleEventDelete = useCallback((event: ActivityEventWithId) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setDeleteConfirm({ visible: true, event });
  }, []);

  const confirmDelete = useCallback(async () => {
    if (!activeChild?.id || !deleteConfirm.event?.id) return;
    const eventId = deleteConfirm.event.id;
    const childId = activeChild.id;
    setDeleteConfirm({ visible: false, event: null });

    // Soft-delete: hide immediately from UI
    setSoftDeletedIds((prev) => new Set(prev).add(eventId));

    showUndoToast(
      "Activite supprimee",
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
          await supprimerActivite(childId, eventId);
        } catch {
          // Restore if delete fails
          setSoftDeletedIds((prev) => {
            const next = new Set(prev);
            next.delete(eventId);
            return next;
          });
          showActionToast("Erreur lors de la suppression", "Réessayer", () => {
            supprimerActivite(childId, eventId).catch(() => {
              showActionToast("Erreur lors de la suppression", "Réessayer", () => {
                supprimerActivite(childId, eventId);
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
          await Promise.all(ids.map((id) => supprimerActivite(childId, id)));
        } catch {
          // Restore if delete fails
          setSoftDeletedIds((prev) => {
            const next = new Set(prev);
            ids.forEach((id) => next.delete(id));
            return next;
          });
          showActionToast("Erreur lors de la suppression", "Réessayer", () => {
            Promise.all(ids.map((id) => supprimerActivite(childId, id))).catch(() => {
              showActionToast("Erreur lors de la suppression", "Réessayer", () => {
                Promise.all(ids.map((id) => supprimerActivite(childId, id)));
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

  // Stop ongoing promenade (iso handleStopSleep in routines.tsx)
  const handleStopPromenade = useCallback(() => {
    if (!activeChild?.id || !promenadeEnCours) return;
    const start = toDate(promenadeEnCours.heureDebut);

    // Open form with heureFin pre-filled — don't modify base until user confirms
    // (iso home.tsx handleStopPromenade pattern)
    openSheet({
      ownerId: sheetOwnerId,
      formType: "activities",
      activiteType: "promenade",
      editData: {
        id: promenadeEnCours.id,
        typeActivite: "promenade",
        date: start,
        heureDebut: start,
        heureFin: new Date(),
        duree: Math.max(1, Math.round((Date.now() - start.getTime()) / 60000)),
        description: (promenadeEnCours as any).description,
      },
      promenadeEnCours: { id: promenadeEnCours.id },
    });
  }, [activeChild?.id, promenadeEnCours, openSheet]);

  const cancelDelete = useCallback(() => {
    setDeleteConfirm({ visible: false, event: null });
  }, []);

  const renderEventItem = (event: ActivityEventWithId, isLast = false, isFirstInList = false) => {
    const time = toDate(event.date);
    const config = TYPE_CONFIG[event.typeActivite as ActiviteType];
    return (
      <ReanimatedSwipeable
        key={event.id}
        ref={isFirstInList ? swipeableRef : undefined}
        renderRightActions={() => (
          <DeleteAction onPress={() => handleEventDelete(event)} colorScheme={colorScheme} />
        )}
        friction={2}
        rightThreshold={40}
        overshootRight={false}
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
                shadowColor: nc.shadow,
                borderLeftWidth: isSelected ? 3 : 0,
                borderLeftColor: isSelected
                  ? Colors[colorScheme ?? "light"].tint
                  : "transparent",
              },
            ];
          }}
          onPress={selectionMode ? () => toggleId(event.id) : () => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); openEditModal(event); }}
          accessibilityRole="button"
          accessibilityLabel="Modifier cette activité"
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
            {(() => {
              const isPromenade = event.typeActivite === "promenade";
              const walkStart = isPromenade && (event as any).heureDebut ? toDate((event as any).heureDebut) : null;
              const walkEnd = isPromenade && (event as any).heureFin ? toDate((event as any).heureFin) : null;
              const walkOngoing = isPromenade && walkStart && !walkEnd;

              if (walkStart && walkEnd) {
                return (
                  <>
                    <Text style={[styles.sessionTimeText, { color: nc.textMuted }, isLast && [styles.sessionTimeTextLast, { color: nc.textStrong }]]}>
                      {formatTime(walkStart)}
                    </Text>
                    <Text style={[styles.sessionTimeArrow, { color: nc.textMuted }]}>{"↓"}</Text>
                    <Text style={[styles.sessionTimeText, { color: nc.textMuted }]}>
                      {formatTime(walkEnd)}
                    </Text>
                  </>
                );
              }
              if (walkOngoing) {
                return (
                  <>
                    <Text style={[styles.sessionTimeText, { color: nc.textMuted }, isLast && [styles.sessionTimeTextLast, { color: nc.textStrong }]]}>
                      {formatTime(walkStart)}
                    </Text>
                    <Text style={[styles.sessionTimeArrow, { color: nc.textMuted }]}>{"↓"}</Text>
                    <Text style={[styles.sessionTimeOngoing, { color: eventColors.activite.dark }]}>
                      {"en cours"}
                    </Text>
                  </>
                );
              }
              return (
                <Text style={[styles.sessionTimeText, { color: nc.textMuted }, isLast && [styles.sessionTimeTextLast, { color: nc.textStrong }]]}>
                  {formatTime(time)}
                </Text>
              );
            })()}
          </View>
          <View
            style={[
              styles.sessionIconWrapper,
              { backgroundColor: `${config.color}20` },
            ]}
          >
            <FontAwesome
              name={config.icon as any}
              size={14}
              color={config.color}
            />
          </View>
          <View style={styles.sessionContent}>
            <View style={styles.sessionDetails}>
              <Text style={[styles.sessionType, { color: nc.textStrong }]}>{config.label}</Text>
              {(() => {
                const details = buildDetails(event);
                if (!details) return null;
                return (
                  <View style={styles.sessionMetricRow}>
                    {details.duration && (
                      <Text style={[styles.sessionMetricBold, { color: nc.textNormal }]}>
                        {details.duration}
                      </Text>
                    )}
                    {details.duration && details.description && (
                      <Text style={[styles.sessionMetricSep, { color: nc.textMuted }]}> · </Text>
                    )}
                    {details.description && (
                      <Text style={[styles.sessionMetricLight, { color: nc.textMuted }]} numberOfLines={1}>
                        {details.description}
                      </Text>
                    )}
                  </View>
                );
              })()}
            </View>
          </View>
          <Ionicons name="chevron-forward" size={18} color={nc.border} />
        </Pressable>
      </ReanimatedSwipeable>
    );
  };

  const renderDayGroup = ({ item, index }: { item: ActivityGroup; index: number }) => {
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
                activité{item.events.length > 1 ? "s" : ""}
              </Text>
            </View>
          </View>
        </View>
        <View style={styles.statsBreakdown}>
          {(Object.keys(item.counts) as ActiviteType[]).map((type) => {
            const count = item.counts[type];
            if (count === 0) return null;
            const config = TYPE_CONFIG[type];
            return (
              <View key={type} style={styles.statsBreakdownItem}>
                <View
                  style={[
                    styles.statsBreakdownDot,
                    { backgroundColor: config.color },
                  ]}
                />
                <Text style={[styles.statsBreakdownLabel, { color: nc.textMuted }]}>{config.label}</Text>
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
                accessibilityLabel={isExpanded ? "Masquer les activités" : "Voir les autres activités"}
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
                      } activité${item.events.length > 2 ? "s" : ""}`}
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
            <View style={styles.quickActionsRow}>
              <Pressable
                style={[styles.quickActionButton, { backgroundColor: nc.backgroundPressed }]}
                onPress={() => openAddModal("tummyTime")}
              >
                <FontAwesome
                  name="baby"
                  size={14}
                  color={Colors[colorScheme].tint}
                />
              </Pressable>
              <Pressable
                style={[styles.quickActionButton, { backgroundColor: nc.backgroundPressed }]}
                onPress={() => openAddModal("jeux")}
              >
                <FontAwesome
                  name="puzzle-piece"
                  size={14}
                  color={Colors[colorScheme].tint}
                />
              </Pressable>
              <Pressable
                style={[styles.quickActionButton, { backgroundColor: nc.backgroundPressed }]}
                onPress={() => openAddModal("promenade")}
              >
                <FontAwesome
                  name="person-walking"
                  size={14}
                  color={Colors[colorScheme].tint}
                />
              </Pressable>
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

        {/* Promenade en cours widget (same component as home.tsx) */}
        {(promenadeEnCours || !selectionMode) && (
          <View style={{ paddingHorizontal: 16, marginBottom: 12 }}>
            <PromenadeWidget
              isActive={!!promenadeEnCours}
              elapsedMinutes={elapsedPromenadeMinutes}
              startTime={
                promenadeEnCours?.heureDebut
                  ? formatTime(toDate(promenadeEnCours.heureDebut))
                  : undefined
              }
              onStart={() => {
                openAddModal("promenade");
              }}
              onStop={handleStopPromenade}
              colorScheme={colorScheme}
            />
          </View>
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
                  { backgroundColor: `${eventColors.activite.dark}15` },
                ]}
              >
                <FontAwesome
                  name="baby"
                  size={36}
                  color={eventColors.activite.dark}
                />
              </View>
              <ThemedText style={[styles.emptyTitle, { color: nc.textStrong }]}>
                {events.length === 0
                  ? "Aucune activité enregistrée"
                  : "Aucune activité pour ce filtre"}
              </ThemedText>
              <ThemedText style={[styles.emptySubtitle, { color: nc.textMuted }]}>
                Suivez les activités et le temps d'éveil
              </ThemedText>
              {events.length === 0 && (
                <Pressable
                  style={[styles.emptyCta, { backgroundColor: Colors[colorScheme].tint }]}
                  onPress={() => openAddModal("tummyTime")}
                  accessibilityRole="button"
                  accessibilityLabel="Ajouter une activité"
                >
                  <Ionicons name="add" size={20} color={nc.white} />
                  <Text style={[styles.emptyCtaText, { color: nc.white }]}>Ajouter une activité</Text>
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
          <ActivitySkeleton colorScheme={colorScheme} />
        )}
      </SafeAreaView>
      <ConfirmModal
        visible={deleteConfirm.visible}
        title="Suppression"
        message="Voulez-vous vraiment supprimer cette activité ?"
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
    fontSize: 10,
    lineHeight: 12,
  },
  sessionTimeOngoing: {
    fontSize: 11,
    fontWeight: "600",
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
  sessionDetailText: {
    fontSize: 12,
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
  sessionMetricRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  sessionMetricBold: {
    fontSize: 12,
    fontWeight: "700",
  },
  sessionMetricSep: {
    fontSize: 12,
  },
  sessionMetricLight: {
    fontSize: 12,
    flex: 1,
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
