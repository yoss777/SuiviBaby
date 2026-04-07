import { DateFilterBar, DateFilterValue } from "@/components/ui/DateFilterBar";
import { LoadMoreButton } from "@/components/ui/LoadMoreButton";
import { SelectionToolbar } from "@/components/ui/SelectionToolbar";
import { HeaderMenu, HeaderMenuItem } from "@/components/ui/HeaderMenu";
import { SelectedDateChip } from "@/components/ui/SelectedDateChip";
import {
  JalonType,
  MilestonesEditData,
} from "@/components/forms/MilestonesForm";
import { ThemedText } from "@/components/themed-text";
import { eventColors } from "@/constants/eventColors";
import { MAX_AUTO_LOAD_ATTEMPTS } from "@/constants/pagination";
import { getNeutralColors, neutralColors } from "@/constants/dashboardColors";
import { Colors } from "@/constants/theme";
import { useBaby } from "@/contexts/BabyContext";
import { useSheet } from "@/contexts/SheetContext";
import { useToast } from "@/contexts/ToastContext";
import { useBatchSelect } from "@/hooks/useBatchSelect";
import { useMergedOptimisticEvents } from "@/hooks/useMergedOptimisticEvents";
import { useSwipeHint } from "@/hooks/useSwipeHint";
import { useColorScheme } from "@/hooks/use-color-scheme";
import {
  ecouterEvenements,
  getNextEventDateBefore,
  hasMoreEventsBefore,
  supprimerJalon,
} from "@/services/eventsService";
import { JalonEvent } from "@/services/eventsService";
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
  Image,
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
import { ConfirmModal } from "@/components/ui/ConfirmModal";

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

type MilestoneEventWithId = JalonEvent & { id: string };

type MilestoneGroup = {
  date: string;
  events: MilestoneEventWithId[];
  counts: Record<JalonType, number>;
  lastEvent: MilestoneEventWithId;
};

const TYPE_CONFIG: Record<
  JalonType,
  { label: string; color: string; icon: string; defaultTitle: string }
> = {
  dent: {
    label: "Nouvelle dent",
    color: eventColors.jalon.dark,
    icon: "tooth",
    defaultTitle: "Nouvelle dent",
  },
  pas: {
    label: "Nouveau pas",
    color: eventColors.jalon.dark,
    icon: "shoe-prints",
    defaultTitle: "Nouveau pas",
  },
  sourire: {
    label: "Nouveau sourire",
    color: eventColors.jalon.dark,
    icon: "face-smile",
    defaultTitle: "Nouveau sourire",
  },
  mot: {
    label: "Nouveau mot",
    color: eventColors.jalon.dark,
    icon: "comment-dots",
    defaultTitle: "Nouveau mot",
  },
  humeur: {
    label: "Humeur",
    color: eventColors.jalon.dark,
    icon: "heart",
    defaultTitle: "Humeur du jour",
  },
  photo: {
    label: "Moment photo",
    color: eventColors.jalon.dark,
    icon: "camera",
    defaultTitle: "Un beau moment",
  },
  autre: {
    label: "Autre moment",
    color: eventColors.jalon.dark,
    icon: "star",
    defaultTitle: "Moment important",
  },
};

const MOOD_OPTIONS: {
  value: 1 | 2 | 3 | 4 | 5;
  emoji: string;
  label: string;
}[] = [
  { value: 1, emoji: "😢", label: "Difficile" },
  { value: 2, emoji: "😐", label: "Mitigé" },
  { value: 3, emoji: "🙂", label: "OK" },
  { value: 4, emoji: "😄", label: "Content" },
  { value: 5, emoji: "🥰", label: "Rayonnant" },
];

const formatDateKey = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(
    date.getDate()
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
      accessibilityLabel="Supprimer ce jalon"
    >
      <Ionicons name="trash-outline" size={20} color={nc.white} />
      <Text style={[styles.deleteActionText, { color: nc.white }]}>Supprimer</Text>
    </Pressable>
  );
});

// ============================================
// SKELETON LOADING COMPONENT
// ============================================

const MilestoneSkeleton = React.memo(function MilestoneSkeleton({
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
        <View style={[styles.skeletonBlock, { width: 80, height: 14, backgroundColor: nc.borderLight }]}>
          <Animated.View
            style={[styles.shimmerOverlay, { backgroundColor: shimmerBg, transform: [{ translateX: shimmerTranslate }] }]}
          />
        </View>
        <View style={[styles.skeletonBlock, { width: 120, height: 12, backgroundColor: nc.borderLight }]}>
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

export default function MilestonesScreen() {
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
    `milestones-${Math.random().toString(36).slice(2)}`
  );

  const { openModal, editId, returnTo, type } = useLocalSearchParams();
  const returnTargetParam = Array.isArray(returnTo) ? returnTo[0] : returnTo;
  const sheetOwnerId = "milestones";

  const [showCalendar, setShowCalendar] = useState(false);
  const [selectedFilter, setSelectedFilter] = useState<DateFilterValue>("today");
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [layoutReady, setLayoutReady] = useState(false);
  const [pendingOpen, setPendingOpen] = useState(false);

  const [groupedEvents, setGroupedEvents] = useState<MilestoneGroup[]>([]);
  const [expandedDays, setExpandedDays] = useState<Set<string>>(new Set());
  const [loaded, setLoaded] = useState({ jalons: false });
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
  const {
    mergedEvents: events,
    setFirestoreEvents,
    refreshMerged,
  } = useMergedOptimisticEvents<MilestoneEventWithId>({
    childId: activeChild?.id,
  });

  const [deleteConfirm, setDeleteConfirm] = useState<{
    visible: boolean;
    event: MilestoneEventWithId | null;
  }>({ visible: false, event: null });

  const [softDeletedIds, setSoftDeletedIds] = useState<Set<string>>(new Set());

  const [batchDeleteConfirm, setBatchDeleteConfirm] = useState<{ visible: boolean; ids: string[] }>({ visible: false, ids: [] });

  // Form pattern states
  const [pendingEditData, setPendingEditData] =
    useState<MilestonesEditData | null>(null);
  const [pendingJalonType, setPendingJalonType] = useState<JalonType>("dent");

  const editIdRef = useRef<string | null>(null);
  const returnToRef = useRef<string | null>(null);

  const normalizeParam = (value: string | string[] | undefined) =>
    Array.isArray(value) ? value[0] : value;

  const stashReturnTo = useCallback(() => {
    const target = normalizeParam(returnTo);
    if (!target) return;
    if (
      target === "home" ||
      target === "chrono" ||
      target === "journal" ||
      target === "moments"
    ) {
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
    } else if (target === "moments") {
      router.replace("/baby/moments");
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
  // FORM HELPERS
  // ============================================
  const buildEditData = useCallback(
    (event: MilestoneEventWithId): MilestonesEditData => ({
      id: event.id,
      typeJalon: event.typeJalon,
      titre: event.titre,
      description: event.description,
      note: event.note,
      humeur: event.humeur,
      photos: event.photos,
      date: toDate(event.date),
    }),
    []
  );

  const openAddModal = useCallback((jalonType: JalonType) => {
    setPendingJalonType(jalonType);
    setPendingEditData(null);
    setPendingOpen(true);
  }, []);

  const openEditModal = useCallback(
    (event: MilestoneEventWithId) => {
      if (event.id?.startsWith?.('__optimistic_')) {
        showToast('Enregistrement en cours...');
        return;
      }
      setPendingJalonType(event.typeJalon);
      setPendingEditData(buildEditData(event));
      setShowCalendar(false);
      setPendingOpen(true);
    },
    [buildEditData, showToast]
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
        setExpandedDays(new Set([formatDateKey(today)]));
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

  const handleAddPress = useCallback(() => {
    openAddModal("dent");
  }, [openAddModal]);

  const menuItems: HeaderMenuItem[] = useMemo(() => [
    { label: "Ajouter", icon: "add-circle-outline", onPress: handleAddPress },
    ...(groupedEvents.length > 0 || selectionMode ? [{
      label: selectionMode ? "Annuler sélection" : "Sélectionner",
      icon: (selectionMode ? "close-outline" : "checkmark-done-outline") as keyof typeof Ionicons.glyphMap,
      onPress: toggleSelectionMode,
    }] : []),
  ], [handleAddPress, selectionMode, toggleSelectionMode, groupedEvents.length]);

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
    ])
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
            if (returnTarget === "moments") {
              router.replace("/baby/moments");
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
    }, [colorScheme, returnTargetParam, setHeaderLeft])
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
        if (returnTarget === "moments") {
          router.replace("/baby/moments");
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
        onBackPress
      );
      return () => subscription.remove();
    }, [closeSheet, isOpen, returnTargetParam])
  );

  // ============================================
  // DATA LISTENERS
  // ============================================
  useEffect(() => {
    if (!activeChild?.id) return;
    setLoadError(false);

    const handleListenerError = () => {
      setLoadError(true);
      setLoaded({ jalons: true });
      setIsRefreshing(false);
    };

    const versionAtSubscribe = loadMoreVersionRef.current;
    const endOfRange = rangeEndDate ? new Date(rangeEndDate) : new Date();
    endOfRange.setHours(23, 59, 59, 999);
    const startOfRange = new Date(endOfRange);
    startOfRange.setHours(0, 0, 0, 0);
    startOfRange.setDate(startOfRange.getDate() - (daysWindow - 1));
    let loadingSet = false;

    const unsubscribe = ecouterEvenements(
      activeChild.id,
      (data) => {
        const evts = data as MilestoneEventWithId[];
        setFirestoreEvents(evts);
        if (!loadingSet) {
          loadingSet = true;
          setLoaded({ jalons: true });
          setIsRefreshing(false);
        }
        if (
          pendingLoadMoreRef.current > 0 &&
          versionAtSubscribe === loadMoreVersionRef.current
        ) {
          pendingLoadMoreRef.current = 0;
          setIsLoadingMore(false);
        }
      },
      { type: "jalon", waitForServer: true, depuis: startOfRange, jusqu: endOfRange },
      handleListenerError,
    );

    return () => {
      unsubscribe();
    };
  }, [activeChild?.id, daysWindow, rangeEndDate, refreshKey, setFirestoreEvents]);

  useEffect(() => {
    setSoftDeletedIds((prev) => {
      if (prev.size === 0) return prev;
      const ids = new Set(events.map((e) => e.id));
      const next = new Set<string>();
      prev.forEach((id) => { if (ids.has(id)) next.add(id); });
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
    setLoaded({ jalons: false });
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

    getNextEventDateBefore(activeChild.id, ["jalon"], endOfToday)
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
    if (!loaded.jalons) {
      setEmptyDelayDone(false);
      return;
    }
    if (groupedEvents.length > 0) {
      setEmptyDelayDone(true);
      return;
    }
    const timer = setTimeout(() => setEmptyDelayDone(true), 300);
    return () => clearTimeout(timer);
  }, [loaded.jalons, groupedEvents.length]);

  useEffect(() => {
    if (loaded.jalons && groupedEvents.length > 0) {
      triggerHint();
    }
  }, [loaded.jalons, groupedEvents.length, triggerHint]);

  // ============================================
  // FILTERS
  // ============================================
  useFocusEffect(
    useCallback(() => {
      if (!selectedDate) {
        applyTodayFilter();
      }
    }, [applyTodayFilter, selectedDate])
  );

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

  const handleDateSelect = (day: DateData) => {
    setSelectedDate(day.dateString);
    setShowCalendar(false);
    setExpandedDays(new Set([day.dateString]));
  };

  const filteredEvents = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayTime = today.getTime();

    return events.filter((item) => {
      if (softDeletedIds.has(item.id)) return false;
      const date = toDate(item.date);
      date.setHours(0, 0, 0, 0);
      const time = date.getTime();
      if (selectedDate) return formatDateKey(date) === selectedDate;
      if (selectedFilter === "today") return time === todayTime;
      if (selectedFilter === "past") return time < todayTime;
      return true;
    });
  }, [events, selectedFilter, selectedDate, softDeletedIds]);

  useEffect(() => {
    const groups: Record<string, MilestoneGroup> = {};
    filteredEvents.forEach((event) => {
      const key = formatDateKey(toDate(event.date));
      if (!groups[key]) {
        groups[key] = {
          date: key,
          events: [],
          counts: {
            dent: 0,
            pas: 0,
            sourire: 0,
            mot: 0,
            humeur: 0,
            photo: 0,
            autre: 0,
          },
          lastEvent: event,
        };
      }
      groups[key].events.push(event);
      groups[key].counts[event.typeJalon] += 1;
      if (toDate(event.date) > toDate(groups[key].lastEvent.date)) {
        groups[key].lastEvent = event;
      }
    });

    const sorted = Object.values(groups).sort(
      (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
    );

    sorted.forEach((group) => {
      group.events.sort(
        (a, b) => toDate(b.date).getTime() - toDate(a.date).getTime()
      );
    });

    setGroupedEvents(sorted);
  }, [filteredEvents]);

  // ============================================
  // LOAD MORE
  // ============================================
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
    hasMoreEventsBefore(activeChild.id, ["jalon"], beforeDate)
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
        const nextEventDate = await getNextEventDateBefore(
          activeChild.id,
          ["jalon"],
          beforeDate
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
    [hasMore, activeChild?.id, autoLoadMoreAttempts, daysWindow, rangeEndDate]
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
    if (loaded.jalons && groupedEvents.length === 0 && hasMore) {
      setAutoLoadMore(true);
      setAutoLoadMoreAttempts(0);
    }
  }, [
    loaded.jalons,
    groupedEvents.length,
    hasMore,
    selectedFilter,
    selectedDate,
  ]);

  useEffect(() => {
    if (!autoLoadMore) return;
    if (!loaded.jalons || isLoadingMore) return;
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
    loaded.jalons,
    isLoadingMore,
    groupedEvents.length,
    hasMore,
    autoLoadMoreAttempts,
    loadMoreStep,
  ]);

  // ============================================
  // SHEET OPEN EFFECT
  // ============================================
  useFocusEffect(
    useCallback(() => {
      if (openModal !== "true") return;
      const normalizedType = normalizeParam(type);
      const jalonType =
        normalizedType && Object.keys(TYPE_CONFIG).includes(normalizedType)
          ? (normalizedType as JalonType)
          : "dent";
      openAddModal(jalonType);
    }, [openModal, type, openAddModal])
  );

  useEffect(() => {
    if (!pendingOpen || !layoutReady) return;
    const returnTarget = returnTargetParam ?? returnToRef.current;
    const isEditing = !!pendingEditData;
    const task = InteractionManager.runAfterInteractions(() => {
      stashReturnTo();
      openSheet({
        ownerId: sheetOwnerId,
        formType: "milestones",
        jalonType: pendingJalonType,
        editData: pendingEditData ?? undefined,
        onSuccess: () => {
          ensureTodayInRange();
          applyTodayFilter();
          showToast(isEditing ? "Jalon modifie" : "Jalon enregistre");
        },
        onDismiss: () => {
          editIdRef.current = null;
          maybeReturnTo(returnTarget);
        },
      });
      (navigation as any).setParams({
        openModal: undefined,
        editId: undefined,
        type: undefined,
        mode: undefined,
      });
      setPendingOpen(false);
    });
    return () => task.cancel?.();
  }, [
    pendingOpen,
    layoutReady,
    pendingJalonType,
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
    (navigation as any).setParams({
      openModal: undefined,
      editId: undefined,
      type: undefined,
      mode: undefined,
    });
  }, [editId, layoutReady, events, navigation, openEditModal, stashReturnTo]);

  const markedDates = useMemo(() => {
    const marked: Record<string, any> = {};
    events.forEach((item) => {
      const dateKey = formatDateKey(toDate(item.date));
      marked[dateKey] = {
        marked: true,
        dotColor: eventColors.jalon.dark,
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

  // ============================================
  // RENDER HELPERS
  // ============================================
  const renderEventItem = (event: MilestoneEventWithId, isLast = false, isFirstInList = false) => {
    const config = TYPE_CONFIG[event.typeJalon];
    const date = toDate(event.date);
    const moodEmoji =
      typeof event.humeur === "number"
        ? MOOD_OPTIONS.find((m) => m.value === event.humeur)?.emoji
        : null;
    const titleText =
      event.typeJalon === "autre"
        ? event.titre ?? TYPE_CONFIG.autre.label
        : TYPE_CONFIG[event.typeJalon].label;
    return (
      <ReanimatedSwipeable
        key={event.id}
        ref={isFirstInList ? swipeableRef : undefined}
        renderRightActions={
          !event.id?.startsWith?.('__optimistic_')
            ? () => (
                <DeleteAction onPress={() => handleEventDelete(event)} colorScheme={colorScheme} />
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
          accessibilityLabel="Modifier ce jalon"
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
              {formatTime(date)}
            </Text>
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
              {titleText ? (
                <Text style={[styles.sessionType, { color: nc.textStrong }]}>{titleText}</Text>
              ) : null}
              {event.description ? (
                <Text style={[styles.sessionDetailText, { color: nc.textMuted }]}>{event.description}</Text>
              ) : null}
              {event.typeJalon === "humeur" && moodEmoji ? (
                <Text style={styles.sessionMood}>{moodEmoji}</Text>
              ) : null}
            </View>
            {event.photos?.[0] ? (
              <Image
                source={{ uri: event.photos[0] }}
                style={[styles.sessionPhoto, { backgroundColor: nc.backgroundPressed }]}
              />
            ) : null}
          </View>
          <Ionicons name="chevron-forward" size={18} color={nc.border} />
        </Pressable>
      </ReanimatedSwipeable>
    );
  };

  const toggleExpand = useCallback((dateKey: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExpandedDays((prev) => {
      const next = new Set(prev);
      if (next.has(dateKey)) {
        next.delete(dateKey);
      } else {
        next.add(dateKey);
      }
      return next;
    });
  }, []);

  const handleEventDelete = useCallback((event: MilestoneEventWithId) => {
    if (event.id?.startsWith?.('__optimistic_')) {
      showToast('Enregistrement en cours...');
      return;
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setDeleteConfirm({ visible: true, event });
  }, [showToast]);

  const handleBatchDelete = useCallback(() => {
    if (!activeChild?.id || selectedCount === 0) return;
    const ids = Array.from(selectedIds);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setBatchDeleteConfirm({ visible: true, ids });
  }, [activeChild?.id, selectedIds, selectedCount]);

  const confirmBatchDelete = useCallback(() => {
    if (!activeChild?.id) return;
    const childId = activeChild.id;
    const ids = batchDeleteConfirm.ids;
    setBatchDeleteConfirm({ visible: false, ids: [] });
    exitSelectionMode();

    // Soft-delete: hide immediately from UI
    setSoftDeletedIds((prev) => {
      const next = new Set(prev);
      ids.forEach((id) => next.add(id));
      return next;
    });

    showUndoToast(
      `${ids.length} jalon${ids.length > 1 ? "s" : ""} supprimé${ids.length > 1 ? "s" : ""}`,
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
          await Promise.all(ids.map((id) => supprimerJalon(childId, id)));
        } catch {
          // Restore if delete fails
          setSoftDeletedIds((prev) => {
            const next = new Set(prev);
            ids.forEach((id) => next.delete(id));
            return next;
          });
          showActionToast("Erreur lors de la suppression", "Réessayer", () => {
            Promise.all(ids.map((id) => supprimerJalon(childId, id))).catch(() => {
              showActionToast("Erreur lors de la suppression", "Réessayer", () => {
                Promise.all(ids.map((id) => supprimerJalon(childId, id)));
              });
            });
          });
        }
      }
    );
  }, [activeChild?.id, batchDeleteConfirm.ids, exitSelectionMode, showUndoToast, showActionToast]);

  const cancelBatchDelete = useCallback(() => {
    setBatchDeleteConfirm({ visible: false, ids: [] });
  }, []);

  const confirmDelete = useCallback(async () => {
    if (!activeChild?.id || !deleteConfirm.event?.id) return;
    const eventId = deleteConfirm.event.id;
    const childId = activeChild.id;
    setDeleteConfirm({ visible: false, event: null });

    // Soft-delete: hide immediately from UI
    setSoftDeletedIds((prev) => new Set(prev).add(eventId));

    showUndoToast(
      "Jalon supprime",
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
          await supprimerJalon(childId, eventId);
        } catch {
          // Restore if delete fails
          setSoftDeletedIds((prev) => {
            const next = new Set(prev);
            next.delete(eventId);
            return next;
          });
          showActionToast("Erreur lors de la suppression", "Réessayer", () => {
            supprimerJalon(childId, eventId).catch(() => {
              showActionToast("Erreur lors de la suppression", "Réessayer", () => {
                supprimerJalon(childId, eventId);
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

  const renderDayGroup = ({ item, index }: { item: MilestoneGroup; index: number }) => {
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
                jalon{item.events.length > 1 ? "s" : ""}
              </Text>
            </View>
          </View>
        </View>

        <View style={styles.statsBreakdown}>
          {(Object.keys(TYPE_CONFIG) as JalonType[])
            .filter((type) => item.counts[type] > 0)
            .map((type) => (
              <View key={type} style={styles.statsBreakdownItem}>
                <View
                  style={[
                    styles.statsBreakdownDot,
                    { backgroundColor: TYPE_CONFIG[type].color },
                  ]}
                />
                <Text style={[styles.statsBreakdownLabel, { color: nc.textMuted }]}>
                  {TYPE_CONFIG[type].label}
                  {item.counts[type] > 1 ? "s" : ""}
                </Text>
                <Text style={[styles.statsBreakdownValue, { color: nc.textNormal }]}>
                  {item.counts[type]}
                </Text>
              </View>
            ))}
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
                accessibilityLabel={isExpanded ? "Masquer les jalons" : "Voir les autres jalons"}
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
                      } jalon${item.events.length > 2 ? "s" : ""}`}
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
        style={styles.safeArea}
        edges={["bottom"]}
        onLayout={() => setLayoutReady(true)}
      >
        <View>
          <View style={styles.filterRow}>
            <DateFilterBar
              selected={selectedDate ? ("past" as DateFilterValue) : selectedFilter}
              onSelect={handleFilterPress}
              variant="soft"
              activeAccentColor={eventColors.jalon.dark}
            >
              {selectedDate && (
                <SelectedDateChip
                  label={formatSelectedDateLabel(selectedDate)}
                  accentColor={eventColors.jalon.dark}
                  onPress={clearSelectedDate}
                />
              )}
            </DateFilterBar>
          </View>
          {showCalendar && (
            <View style={[styles.calendarContainer, { borderBottomColor: nc.border }]}>
              <Calendar
                current={selectedDate || undefined}
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

        {loaded.jalons && emptyDelayDone ? (
          groupedEvents.length === 0 ? (
            <View style={styles.emptyContainer}>
              <View
                style={[
                  styles.emptyIconWrapper,
                  { backgroundColor: `${eventColors.jalon.dark}15` },
                ]}
              >
                <FontAwesome
                  name="star"
                  size={36}
                  color={eventColors.jalon.dark}
                />
              </View>
              <ThemedText style={[styles.emptyTitle, { color: nc.textStrong }]}>
                {events.length === 0
                  ? "Aucun jalon enregistré"
                  : "Aucun jalon pour ce filtre"}
              </ThemedText>
              <ThemedText style={[styles.emptySubtitle, { color: nc.textMuted }]}>
                Capturez les premiers pas, sourires et moments importants
              </ThemedText>
              {events.length === 0 && (
                <Pressable
                  style={[styles.emptyCta, { backgroundColor: Colors[colorScheme].tint }]}
                  onPress={() => openAddModal("dent")}
                  accessibilityRole="button"
                  accessibilityLabel="Ajouter un jalon"
                >
                  <Ionicons name="add" size={20} color={nc.white} />
                  <Text style={[styles.emptyCtaText, { color: nc.white }]}>Ajouter un jalon</Text>
                </Pressable>
              )}
              {!(selectedFilter === "today" || selectedDate) && (
                <LoadMoreButton
                  loading={isLoadingMore || autoLoadMore}
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
              contentContainerStyle={styles.listContent}
              ListFooterComponent={
                selectedFilter === "today" || selectedDate ? null : (
                  <LoadMoreButton
                    loading={isLoadingMore || autoLoadMore}
                    hasMore={hasMore}
                    onPress={handleLoadMore}
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
          <MilestoneSkeleton colorScheme={colorScheme} />
        )}
      </SafeAreaView>
      <ConfirmModal
        visible={deleteConfirm.visible}
        title="Suppression"
        message="Voulez-vous vraiment supprimer ce jalon ?"
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
        message={`Voulez-vous vraiment supprimer ${batchDeleteConfirm.ids.length} jalon${batchDeleteConfirm.ids.length > 1 ? "s" : ""} ?`}
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

// ============================================
// STYLES
// ============================================

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  safeArea: {
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
    fontSize: 13,
    fontWeight: "600",
  },
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 80,
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
    shadowColor: neutralColors.shadow,
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
  sessionMood: {
    fontSize: 16,
  },
  sessionPhoto: {
    width: 44,
    height: 44,
    borderRadius: 10,
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
});
