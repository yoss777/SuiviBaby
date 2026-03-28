import { PumpingEditData } from "@/components/forms/PumpingForm";
import { ThemedText } from "@/components/themed-text";
import { ConfirmModal } from "@/components/ui/ConfirmModal";
import { DateFilterBar } from "@/components/ui/DateFilterBar";
import { LoadMoreButton } from "@/components/ui/LoadMoreButton";
import { SelectionToolbar } from "@/components/ui/SelectionToolbar";
import { HeaderMenu, HeaderMenuItem } from "@/components/ui/HeaderMenu";
import { eventColors } from "@/constants/eventColors";
import { MAX_AUTO_LOAD_ATTEMPTS } from "@/constants/pagination";
import { getNeutralColors, neutralColors } from "@/constants/dashboardColors";
import { Colors } from "@/constants/theme";
import { useBaby } from "@/contexts/BabyContext";
import { useSheet } from "@/contexts/SheetContext";
import { useToast } from "@/contexts/ToastContext";
import { useBatchSelect } from "@/hooks/useBatchSelect";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { useMergedOptimisticEvents } from "@/hooks/useMergedOptimisticEvents";
import { useSwipeHint } from "@/hooks/useSwipeHint";
import { supprimerPompage } from "@/migration/eventsDoubleWriteService";
import {
  ecouterPompagesHybrid as ecouterPompages,
  getNextEventDateBeforeHybrid,
  hasMoreEventsBeforeHybrid,
} from "@/migration/eventsHybridService";
import { Ionicons } from "@expo/vector-icons";
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

const toDate = (value: any): Date => {
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
      accessibilityLabel="Supprimer ce pompage"
    >
      <Ionicons name="trash-outline" size={20} color={neutralColors.white} />
      <Text style={styles.deleteActionText}>Supprimer</Text>
    </Pressable>
  );
});

// ============================================
// SKELETON LOADING COMPONENT
// ============================================

const PumpingSkeleton = React.memo(function PumpingSkeleton({
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
      <View style={{ flex: 1, gap: 6 }}>
        <View style={[styles.skeletonBlock, { width: 120, height: 6, borderRadius: 3, backgroundColor: nc.borderLight }]}>
          <Animated.View
            style={[styles.shimmerOverlay, { backgroundColor: shimmerBg, transform: [{ translateX: shimmerTranslate }] }]}
          />
        </View>
        <View style={[styles.skeletonBlock, { width: 80, height: 12, backgroundColor: nc.borderLight }]}>
          <Animated.View
            style={[styles.shimmerOverlay, { backgroundColor: shimmerBg, transform: [{ translateX: shimmerTranslate }] }]}
          />
        </View>
      </View>
      <View style={[styles.skeletonBlock, { width: 40, height: 18, backgroundColor: nc.borderLight }]}>
        <Animated.View
          style={[styles.shimmerOverlay, { backgroundColor: shimmerBg, transform: [{ translateX: shimmerTranslate }] }]}
        />
      </View>
    </View>
  );

  return (
    <View style={styles.skeletonContainer}>
      <View style={styles.daySection}>
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
type FilterType = "today" | "past";

interface Pompage {
  id: string;
  quantiteGauche: number;
  quantiteDroite: number;
  date: { seconds: number };
  createdAt: { seconds: number };
}

interface PompageGroup {
  date: string;
  pompages: Pompage[];
  totalQuantityLeft: number;
  totalQuantityRight: number;
  totalQuantity: number;
  lastPompage: Pompage;
}

// ============================================
// COMPONENT
// ============================================

export default function PumpingScreen() {
  const { activeChild } = useBaby();
  const { setHeaderRight } = useHeaderRight();
  const colorScheme = useColorScheme() ?? "light";
  const nc = getNeutralColors(colorScheme);
  const { openSheet, closeSheet, isOpen } = useSheet();
  const { showToast, showUndoToast, showActionToast } = useToast();
  const { swipeableRef, triggerHint } = useSwipeHint();
  const { selectionMode, selectedIds, selectedCount, toggleSelectionMode, exitSelectionMode, toggleId, selectAll, clearSelection } = useBatchSelect();
  const headerOwnerId = useRef(
    `pumping-${Math.random().toString(36).slice(2)}`,
  );
  const navigation = useNavigation();
  const { setHeaderLeft } = useHeaderLeft();
  const sheetOwnerId = "pumping";

  const [showCalendar, setShowCalendar] = useState(false);
  const [selectedFilter, setSelectedFilter] = useState<FilterType | null>(null);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [layoutReady, setLayoutReady] = useState(false);
  const [pendingOpen, setPendingOpen] = useState(false);
  const [pendingEditData, setPendingEditData] = useState<PumpingEditData | null>(null);

  // États des données
  const [groupedPompages, setGroupedPompages] = useState<PompageGroup[]>([]);
  const [expandedDays, setExpandedDays] = useState<Set<string>>(new Set());
  const [pompagesLoaded, setPompagesLoaded] = useState(false);
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
    mergedEvents: pompages,
    setFirestoreEvents,
    refreshMerged,
  } = useMergedOptimisticEvents<Pompage>({
    childId: activeChild?.id,
  });

  const [softDeletedIds, setSoftDeletedIds] = useState<Set<string>>(new Set());

  const [deleteConfirm, setDeleteConfirm] = useState<{
    visible: boolean;
    pompage: Pompage | null;
  }>({ visible: false, pompage: null });

  const [batchDeleteConfirm, setBatchDeleteConfirm] = useState<{
    visible: boolean;
    ids: string[];
  }>({ visible: false, ids: [] });

  // Récupérer les paramètres de l'URL
  const { openModal, editId, returnTo } = useLocalSearchParams();
  const returnTargetParam = Array.isArray(returnTo) ? returnTo[0] : returnTo;

  const editIdRef = useRef<string | null>(null);
  const returnToRef = useRef<string | null>(null);

  // ============================================
  // EFFECTS - HEADER
  // ============================================

  // Gérer le bouton calendrier
  const handleCalendarPress = useCallback(() => {
    setShowCalendar((prev) => {
      const newValue = !prev;

      if (newValue) {
        const today = new Date();
        const todayString = `${today.getFullYear()}-${String(
          today.getMonth() + 1,
        ).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
        setSelectedDate(todayString);
        setSelectedFilter(null);
      }

      return newValue;
    });
  }, []);

  const openAddModal = useCallback(() => {
    setPendingEditData(null);
    setPendingOpen(true);
  }, []);

  // Menu items pour le header
  const menuItems: HeaderMenuItem[] = useMemo(() => [
    { label: "Ajouter", icon: "add-circle-outline", onPress: openAddModal },
    ...(groupedPompages.length > 0 || selectionMode ? [{
      label: selectionMode ? "Annuler sélection" : "Sélectionner",
      icon: (selectionMode ? "close-outline" : "checkmark-done-outline") as keyof typeof Ionicons.glyphMap,
      onPress: toggleSelectionMode,
    }] : []),
  ], [openAddModal, selectionMode, toggleSelectionMode, groupedPompages.length]);

  // Définir les boutons du header (calendrier + menu)
  useFocusEffect(
    useCallback(() => {
      const headerButtons = (
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            paddingRight: 16,
            gap: 0,
          }}
        >
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
      const backButton = (
        <HeaderBackButton
          onPress={() => {
            if (returnTargetParam === "home") {
              router.replace("/baby/home");
              return;
            }
            if (returnTargetParam === "chrono") {
              router.replace("/baby/chrono");
              return;
            }
            if (returnTargetParam === "journal") {
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
        if (returnTargetParam === "chrono") {
          router.replace("/baby/chrono");
          return true;
        }
        if (returnTargetParam === "journal") {
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

  // ============================================
  // EFFECTS - URL PARAMS
  // ============================================

  // Ouvrir automatiquement le modal si le paramètre openModal est présent
  useFocusEffect(
    useCallback(() => {
      if (openModal !== "true") return;
      setPendingEditData(null);
      setPendingOpen(true);
    }, [openModal]),
  );

  // Helper to build edit data from a Pompage
  const buildEditData = useCallback((pompage: Pompage): PumpingEditData => ({
    id: pompage.id,
    date: toDate(pompage.date),
    quantiteGauche: pompage.quantiteGauche,
    quantiteDroite: pompage.quantiteDroite,
  }), []);

  useEffect(() => {
    if (!pendingOpen || !layoutReady) return;
    const returnTarget = returnTargetParam ?? returnToRef.current;
    const isEditing = !!pendingEditData;
    const task = InteractionManager.runAfterInteractions(() => {
      stashReturnTo();
      openSheet({
        ownerId: sheetOwnerId,
        formType: "pumping",
        editData: pendingEditData ?? undefined,
        onSuccess: () => {
          ensureTodayInRange();
          applyTodayFilter();
          showToast(isEditing ? "Pompage modifié" : "Pompage enregistré");
        },
        onDismiss: () => {
          editIdRef.current = null;
          maybeReturnTo(returnTarget);
        },
      });
      navigation.setParams({ openModal: undefined, editId: undefined } as any);
      setPendingOpen(false);
      setPendingEditData(null);
    });
    return () => task.cancel?.();
  }, [
    pendingOpen,
    layoutReady,
    pendingEditData,
    returnTargetParam,
    openSheet,
    // @ts-expect-error — ensureTodayInRange is a useCallback declared later in the component
    ensureTodayInRange,
    // @ts-expect-error — applyTodayFilter is a useCallback declared later in the component
    applyTodayFilter,
  ]);

  useEffect(() => {
    if (!editId || !layoutReady) return;
    const normalizedId = Array.isArray(editId) ? editId[0] : editId;
    if (!normalizedId || editIdRef.current === normalizedId) return;
    const target = pompages.find((pompage) => pompage.id === normalizedId);
    if (!target) return;
    stashReturnTo();
    editIdRef.current = normalizedId;
    setPendingEditData(buildEditData(target));
    setPendingOpen(true);
    navigation.setParams({ openModal: undefined, editId: undefined } as any);
  }, [editId, layoutReady, pompages, buildEditData]);

  // ============================================
  // EFFECTS - DATA LISTENERS
  // ============================================

  useEffect(() => {
    if (!activeChild?.id) return;
    setLoadError(false);
    const versionAtSubscribe = loadMoreVersionRef.current;
    const endOfRange = rangeEndDate ? new Date(rangeEndDate) : new Date();
    endOfRange.setHours(23, 59, 59, 999);
    const startOfRange = new Date(endOfRange);
    startOfRange.setHours(0, 0, 0, 0);
    startOfRange.setDate(startOfRange.getDate() - (daysWindow - 1));

    let loadingSet = false;

    const handleListenerError = () => {
      setLoadError(true);
      setIsRefreshing(false);
      setPompagesLoaded(true);
    };

    const unsubscribe = ecouterPompages(
      activeChild.id,
      (data) => {
        setFirestoreEvents(data);
        if (!loadingSet) {
          loadingSet = true;
          setPompagesLoaded(true);
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
      const dataIds = new Set(pompages.map((e: Pompage) => e.id));
      const next = new Set<string>();
      prev.forEach((id) => { if (dataIds.has(id)) next.add(id); });
      return next.size === prev.size ? prev : next;
    });
  }, [pompages]);

  // Re-merge on tab focus — frozen tabs miss state updates
  useFocusEffect(
    useCallback(() => {
      refreshMerged();
    }, [refreshMerged]),
  );

  useEffect(() => {
    if (!activeChild?.id) return;
    setGroupedPompages([]);
    setPompagesLoaded(false);
    setEmptyDelayDone(false);
    setDaysWindow(14);
    setRangeEndDate(null);
    setIsLoadingMore(false);
    setHasMore(true);
    loadMoreVersionRef.current = 0;
    pendingLoadMoreRef.current = 0;
    setFirestoreEvents([]);
  }, [activeChild?.id, setFirestoreEvents]);

  // P7: Jump to most recent event date at mount
  useEffect(() => {
    if (!activeChild?.id) return;
    let cancelled = false;
    const endOfToday = new Date();
    endOfToday.setHours(23, 59, 59, 999);

    getNextEventDateBeforeHybrid(activeChild.id, "pompage", endOfToday)
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
    if (!pompagesLoaded) {
      setEmptyDelayDone(false);
      return;
    }
    if (groupedPompages.length > 0) {
      setEmptyDelayDone(true);
      return;
    }
    const timer = setTimeout(() => setEmptyDelayDone(true), 300);
    return () => clearTimeout(timer);
  }, [pompagesLoaded, groupedPompages.length]);

  // Swipe hint: trigger on first load when data is available
  useEffect(() => {
    if (pompagesLoaded && pompages.length > 0) {
      triggerHint();
    }
  }, [pompagesLoaded, pompages.length, triggerHint]);

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

      if (!auto || autoLoadMoreAttempts >= MAX_AUTO_LOAD_ATTEMPTS - 1) {
        // Clic manuel ou auto qui a épuisé ses tentatives : sauter directement au prochain événement
        const nextEventDate = await getNextEventDateBeforeHybrid(
          activeChild.id,
          "pompage",
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
      !autoLoadMore &&
      pompagesLoaded &&
      groupedPompages.length === 0 &&
      hasMore
    ) {
      setAutoLoadMore(true);
      setAutoLoadMoreAttempts(0);
    }
  }, [
    autoLoadMore,
    pompagesLoaded,
    groupedPompages.length,
    hasMore,
    selectedFilter,
    selectedDate,
  ]);

  useEffect(() => {
    if (!autoLoadMore) return;
    if (!pompagesLoaded || isLoadingMore) return;
    if (groupedPompages.length > 0 || !hasMore) {
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
    pompagesLoaded,
    isLoadingMore,
    groupedPompages.length,
    hasMore,
    autoLoadMoreAttempts,
    loadMoreStep,
  ]);

  useEffect(() => {
    if (!activeChild?.id) return;
    let cancelled = false;
    const endOfRange = rangeEndDate ? new Date(rangeEndDate) : new Date();
    endOfRange.setHours(23, 59, 59, 999);
    const startOfRange = new Date(endOfRange);
    startOfRange.setHours(0, 0, 0, 0);
    startOfRange.setDate(startOfRange.getDate() - (daysWindow - 1));
    const beforeDate = new Date(startOfRange.getTime() - 1);

    // Recalculer hasMore uniquement quand la fenêtre change pour éviter les requêtes inutiles.
    setHasMore(true);
    hasMoreEventsBeforeHybrid(activeChild.id, "pompage", beforeDate)
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

  // Filtrage et regroupement par jour
  useEffect(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayTime = today.getTime();

    const filtered = pompages.filter((pompage) => {
      if (softDeletedIds.has(pompage.id)) return false;
      const pompageDate = toDate(pompage.date);
      pompageDate.setHours(0, 0, 0, 0);
      const pompageTime = pompageDate.getTime();

      if (selectedDate) {
        const [calYear, calMonth, calDay] = selectedDate.split("-").map(Number);
        const calDate = new Date(calYear, calMonth - 1, calDay);
        calDate.setHours(0, 0, 0, 0);
        return pompageTime === calDate.getTime();
      }

      switch (selectedFilter) {
        case "today":
          return pompageTime === todayTime;
        case "past":
          return pompageTime < todayTime;
        case null:
        default:
          return true;
      }
    });

    const grouped = groupPompagesByDay(filtered);
    setGroupedPompages(grouped);
  }, [pompages, selectedFilter, selectedDate, showCalendar, softDeletedIds]);

  // ============================================
  // HELPERS - CALENDAR
  // ============================================

  // Préparer les dates marquées pour le calendrier
  const markedDates = useMemo(() => {
    const marked: Record<string, any> = {};

    pompages.forEach((pompage) => {
      const date = toDate(pompage.date);
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, "0");
      const day = String(date.getDate()).padStart(2, "0");
      const dateKey = `${year}-${month}-${day}`;

      marked[dateKey] = {
        marked: true,
        dotColor: Colors[colorScheme].tint,
      };
    });

    if (selectedDate) {
      marked[selectedDate] = {
        ...marked[selectedDate],
        selected: true,
        selectedColor: Colors[colorScheme].tint,
      };
    }

    return marked;
  }, [pompages, selectedDate, colorScheme]);

  const handleDateSelect = useCallback((day: DateData) => {
    setSelectedDate(day.dateString);
    setSelectedFilter(null);
    setShowCalendar(false);
    setExpandedDays(new Set([day.dateString]));
  }, []);

  const applyTodayFilter = useCallback(() => {
    const today = new Date();
    const todayKey = `${today.getFullYear()}-${String(
      today.getMonth() + 1,
    ).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
    setSelectedFilter("today");
    setSelectedDate(null);
    setShowCalendar(false);
    setExpandedDays(new Set([todayKey]));
  }, []);

  const clearSelectedDate = useCallback(() => {
    applyTodayFilter();
  }, [applyTodayFilter]);

  const handleFilterPress = useCallback((filter: FilterType) => {
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

  // ============================================
  // HELPERS - GROUPING
  // ============================================

  const groupPompagesByDay = (pompages: Pompage[]): PompageGroup[] => {
    const groups: { [key: string]: Pompage[] } = {};

    pompages.forEach((pompage) => {
      const date = new Date(pompage.date?.seconds * 1000);
      const dateKey = `${date.getFullYear()}-${String(
        date.getMonth() + 1,
      ).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;

      if (!groups[dateKey]) {
        groups[dateKey] = [];
      }
      groups[dateKey].push(pompage);
    });

    return Object.entries(groups)
      .map(([dateKey, pompages]) => {
        const date = new Date(dateKey);
        const totalQuantityLeft = pompages.reduce(
          (sum, pompage) => sum + (pompage.quantiteGauche || 0),
          0,
        );
        const totalQuantityRight = pompages.reduce(
          (sum, pompage) => sum + (pompage.quantiteDroite || 0),
          0,
        );
        const totalQuantity = totalQuantityLeft + totalQuantityRight;
        const lastPompage = pompages.reduce((latest, current) =>
          (current.date?.seconds || 0) > (latest.date?.seconds || 0)
            ? current
            : latest,
        );

        return {
          date: dateKey,
          pompages: pompages.sort(
            (a, b) => (b.date?.seconds || 0) - (a.date?.seconds || 0),
          ),
          totalQuantityLeft,
          totalQuantityRight,
          totalQuantity,
          lastPompage,
        };
      })
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  };

  // ============================================
  // HELPERS - UI
  // ============================================

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

  // ============================================
  // HANDLERS - MODAL
  // ============================================

  const openEditModal = useCallback((pompage: Pompage) => {
    if (pompage.id?.startsWith?.('__optimistic_')) {
      showToast('Enregistrement en cours...');
      return;
    }
    setPendingEditData(buildEditData(pompage));
    setPendingOpen(true);
  }, [buildEditData, showToast]);

  const handlePompageDelete = useCallback((pompage: Pompage) => {
    if (pompage.id?.startsWith?.('__optimistic_')) {
      showToast('Enregistrement en cours...');
      return;
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setDeleteConfirm({ visible: true, pompage });
  }, [showToast]);

  const confirmDelete = useCallback(async () => {
    if (!activeChild?.id || !deleteConfirm.pompage?.id) return;
    const pompageId = deleteConfirm.pompage.id;
    const childId = activeChild.id;
    setDeleteConfirm({ visible: false, pompage: null });

    // Soft-delete: hide immediately from UI
    setSoftDeletedIds((prev) => new Set(prev).add(pompageId));

    showUndoToast(
      "Pompage supprimé",
      // onUndo — restore visibility
      () => {
        setSoftDeletedIds((prev) => {
          const next = new Set(prev);
          next.delete(pompageId);
          return next;
        });
      },
      // onExpire — actually delete from Firestore
      async () => {
        try {
          await supprimerPompage(childId, pompageId);
        } catch {
          setSoftDeletedIds((prev) => {
            const next = new Set(prev);
            next.delete(pompageId);
            return next;
          });
          showActionToast("Erreur lors de la suppression", "Réessayer", () => {
            supprimerPompage(childId, pompageId).catch(() => {
              showActionToast("Erreur lors de la suppression", "Réessayer", () => {
                supprimerPompage(childId, pompageId);
              });
            });
          });
        }
      },
      4000,
    );
  }, [activeChild?.id, deleteConfirm.pompage, showUndoToast, showActionToast]);

  const handleBatchDelete = useCallback(() => {
    if (!activeChild?.id || selectedCount === 0) return;
    setBatchDeleteConfirm({ visible: true, ids: Array.from(selectedIds) });
  }, [activeChild?.id, selectedCount, selectedIds]);

  const confirmBatchDelete = useCallback(() => {
    const ids = batchDeleteConfirm.ids;
    const childId = activeChild?.id;
    if (!childId || ids.length === 0) return;
    setBatchDeleteConfirm({ visible: false, ids: [] });
    exitSelectionMode();

    // Soft-delete: hide immediately
    setSoftDeletedIds((prev) => {
      const next = new Set(prev);
      ids.forEach((id) => next.add(id));
      return next;
    });

    const msg = `${ids.length} élément${ids.length > 1 ? "s" : ""} supprimé${ids.length > 1 ? "s" : ""}`;
    showUndoToast(
      msg,
      // onUndo
      () => {
        setSoftDeletedIds((prev) => {
          const next = new Set(prev);
          ids.forEach((id) => next.delete(id));
          return next;
        });
      },
      // onExpire
      async () => {
        try {
          await Promise.all(ids.map((id) => supprimerPompage(childId, id)));
        } catch {
          setSoftDeletedIds((prev) => {
            const next = new Set(prev);
            ids.forEach((id) => next.delete(id));
            return next;
          });
          showActionToast("Erreur lors de la suppression", "Réessayer", () => {
            Promise.all(ids.map((id) => supprimerPompage(childId, id))).catch(() => {
              showActionToast("Erreur lors de la suppression", "Réessayer", () => {
                Promise.all(ids.map((id) => supprimerPompage(childId, id)));
              });
            });
          });
        }
      },
      4000,
    );
  }, [batchDeleteConfirm.ids, activeChild?.id, exitSelectionMode, showUndoToast, showActionToast]);

  const cancelBatchDelete = useCallback(() => {
    setBatchDeleteConfirm({ visible: false, ids: [] });
  }, []);

  const cancelDelete = useCallback(() => {
    setDeleteConfirm({ visible: false, pompage: null });
  }, []);

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

  const maybeReturnTo = (targetOverride?: string | null) => {
    const target = targetOverride ?? returnToRef.current;
    returnToRef.current = null;
    if (target === "home") {
      router.replace("/baby/home");
    } else if (target === "chrono") {
      router.replace("/baby/chrono");
    } else if (target === "journal") {
      router.replace("/baby/chrono");
    }
  };

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
  // RENDER - POMPAGE ITEM
  // ============================================

  const renderPompageItem = useCallback((pompage: Pompage, isLatest: boolean = false, isFirstInList: boolean = false) => {
    const totalQty =
      (pompage.quantiteGauche || 0) + (pompage.quantiteDroite || 0);
    const pompageTime = new Date(pompage.date?.seconds * 1000);

    return (
      <ReanimatedSwipeable
        ref={isFirstInList ? swipeableRef : undefined}
        key={pompage.id}
        renderRightActions={
          !pompage.id?.startsWith?.('__optimistic_')
            ? () => (
                <DeleteAction onPress={() => handlePompageDelete(pompage)} />
              )
            : undefined
        }
        friction={2}
        rightThreshold={40}
        overshootRight={false}
        enabled={!pompage.id?.startsWith?.('__optimistic_')}
      >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Modifier ce pompage"
        style={({ pressed }) => [
          styles.sessionCard,
          {
            borderColor: nc.borderLight,
            backgroundColor: pressed
              ? nc.backgroundPressed
              : selectionMode && selectedIds.has(pompage.id)
                ? Colors[colorScheme ?? "light"].tint + "15"
                : nc.backgroundCard,
            borderLeftWidth: selectionMode && selectedIds.has(pompage.id) ? 3 : 0,
            borderLeftColor: selectionMode && selectedIds.has(pompage.id) ? Colors[colorScheme ?? "light"].tint : "transparent",
          },
        ]}
        onPress={selectionMode ? () => toggleId(pompage.id) : () => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); openEditModal(pompage); }}
      >
        {selectionMode && (
          <Pressable
            onPress={() => toggleId(pompage.id)}
            style={{ marginRight: 8 }}
          >
            <Ionicons
              name={selectedIds.has(pompage.id) ? "checkbox" : "square-outline"}
              size={22}
              color={selectedIds.has(pompage.id) ? Colors[colorScheme].tint : nc.textMuted}
            />
          </Pressable>
        )}
        {/* Time badge */}
        <View style={styles.sessionTime}>
          <Text
            style={[
              styles.sessionTimeText,
              { color: nc.textMuted },
              isLatest && { color: nc.textStrong, fontWeight: "600" },
            ]}
          >
            {pompageTime.toLocaleTimeString("fr-FR", {
              hour: "2-digit",
              minute: "2-digit",
            })}
          </Text>
        </View>

        {/* Quantities visualization */}
        <View style={styles.sessionContent}>
          {/* Visual bar */}
          <View style={styles.quantityBar}>
            <View
              style={[
                styles.quantityBarLeft,
                { flex: pompage.quantiteGauche || 1 },
              ]}
            />
            <View
              style={[
                styles.quantityBarRight,
                { flex: pompage.quantiteDroite || 1 },
              ]}
            />
          </View>

          {/* Labels */}
          <View style={styles.quantityLabels}>
            <View style={styles.quantityLabelItem}>
              <View style={[styles.quantityDot, styles.quantityDotLeft]} />
              <Text style={[styles.quantityLabelValue, { color: nc.textNormal }]}>
                {pompage.quantiteGauche} ml
              </Text>
            </View>
            <View style={styles.quantityLabelItem}>
              <View style={[styles.quantityDot, styles.quantityDotRight]} />
              <Text style={[styles.quantityLabelValue, { color: nc.textNormal }]}>
                {pompage.quantiteDroite} ml
              </Text>
            </View>
          </View>
        </View>

        {/* Total */}
        <View style={styles.sessionTotal}>
          <Text style={styles.sessionTotalValue}>{totalQty}</Text>
          <Text style={[styles.sessionTotalUnit, { color: nc.textMuted }]}>ml</Text>
        </View>

        {/* Edit icon */}
        <Ionicons name="create-outline" size={18} color={nc.textMuted} />
      </Pressable>
      </ReanimatedSwipeable>
    );
  }, [nc, openEditModal, handlePompageDelete, selectionMode, selectedIds, toggleId, colorScheme, swipeableRef]);

  // ============================================
  // RENDER - DAY GROUP
  // ============================================

  const renderDayGroup = useCallback(({ item, index }: { item: PompageGroup; index: number }) => {
    const isExpanded = expandedDays.has(item.date);
    const hasMultiplePompages = item.pompages.length > 1;

    const formatDayLabel = () => {
      const today = new Date();
      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);
      const itemDate = new Date(item.date);

      if (itemDate.toDateString() === today.toDateString() && selectedFilter !== "today") {
        return "Aujourd'hui";
      } else if (itemDate.toDateString() === yesterday.toDateString()) {
        return "Hier";
      }
      return itemDate.toLocaleDateString("fr-FR", {
        weekday: "short",
        day: "numeric",
        month: "short",
      });
    };

    return (
      <View style={styles.daySection}>
        {/* Day Header with stats */}
        <View style={styles.dayHeader}>
          <Text style={[styles.dayLabel, { color: nc.textStrong }]}>{formatDayLabel()}</Text>
          <View style={styles.dayStats}>
            <View style={styles.dayStatItem}>
              <Text style={[styles.dayStatValue, { color: nc.textNormal }]}>{item.pompages.length}</Text>
              <Text style={[styles.dayStatLabel, { color: nc.textMuted }]}>
                session{item.pompages.length > 1 ? "s" : ""}
              </Text>
            </View>
            <View style={[styles.dayStatDivider, { backgroundColor: nc.border }]} />
            <View style={styles.dayStatItem}>
              <Text style={[styles.dayStatValue, styles.dayStatValueAccent]}>
                {item.totalQuantity}
              </Text>
              <Text style={[styles.dayStatLabel, { color: nc.textMuted }]}>ml total</Text>
            </View>
          </View>
        </View>

        {/* Stats breakdown */}
        <View style={styles.statsBreakdown}>
          <View style={styles.statsBreakdownItem}>
            <View
              style={[styles.statsBreakdownDot, { backgroundColor: nc.success }]}
            />
            <Text style={[styles.statsBreakdownLabel, { color: nc.textMuted }]}>Gauche</Text>
            <Text style={[styles.statsBreakdownValue, { color: nc.textNormal }]}>
              {item.totalQuantityLeft} ml
            </Text>
          </View>
          <View style={styles.statsBreakdownItem}>
            <View
              style={[styles.statsBreakdownDot, { backgroundColor: nc.todayAccent }]}
            />
            <Text style={[styles.statsBreakdownLabel, { color: nc.textMuted }]}>Droite</Text>
            <Text style={[styles.statsBreakdownValue, { color: nc.textNormal }]}>
              {item.totalQuantityRight} ml
            </Text>
          </View>
        </View>

        {/* Sessions list */}
        <View style={styles.sessionsContainer}>
          {renderPompageItem(item.lastPompage, true, index === 0)}

          {hasMultiplePompages && (
            <>
              {isExpanded &&
                item.pompages
                  .filter((pompage) => pompage.id !== item.lastPompage.id)
                  .map((pompage) => renderPompageItem(pompage, false))}

              <Pressable
                accessibilityRole="button"
                accessibilityLabel={isExpanded ? "Masquer les sessions" : "Voir toutes les sessions"}
                style={({ pressed }) => [
                  styles.expandTrigger,
                  { borderColor: nc.borderLight, backgroundColor: pressed ? nc.backgroundPressed : nc.backgroundCard },
                ]}
                onPress={() => toggleExpand(item.date)}
              >
                <Text style={styles.expandTriggerText}>
                  {isExpanded
                    ? "Masquer"
                    : `${item.pompages.length - 1} autre${item.pompages.length > 2 ? "s" : ""} session${item.pompages.length > 2 ? "s" : ""}`}
                </Text>
                <Ionicons
                  name={isExpanded ? "chevron-up" : "chevron-down"}
                  size={14}
                  color={eventColors.pumping.dark}
                />
              </Pressable>
            </>
          )}
        </View>
      </View>
    );
  }, [expandedDays, nc, renderPompageItem, toggleExpand, selectedFilter]);

  // ============================================
  // RENDER - MAIN
  // ============================================

  return (
    <GestureHandlerRootView style={[styles.container, { backgroundColor: nc.background }]}>
      <SafeAreaView
        style={{ flex: 1 }}
        edges={["bottom"]}
        onLayout={() => setLayoutReady(true)}
      >
        <View>
          {/* Filtres */}
          <View style={styles.filterRow}>
            <DateFilterBar
              selected={selectedDate ? "past" : selectedFilter ?? "today"}
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

          {/* Calendrier */}
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
            totalCount={groupedPompages.reduce((n, g) => n + g.pompages.length, 0)}
            onSelectAll={() => selectAll(groupedPompages.flatMap((g) => g.pompages.map((p) => p.id)))}
            onClearSelection={clearSelection}
            onDelete={handleBatchDelete}
          />
        )}

        {/* Liste des pompages */}
        {pompagesLoaded && emptyDelayDone ? (
          groupedPompages.length === 0 ? (
            <View style={styles.emptyContainer}>
              <View
                style={[
                  styles.emptyIconWrapper,
                  { backgroundColor: `${eventColors.pumping.dark}15` },
                ]}
              >
                <Ionicons
                  name="water-outline"
                  size={36}
                  color={eventColors.pumping.dark}
                />
              </View>
              <ThemedText style={[styles.emptyTitle, { color: nc.textStrong }]}>
                {pompages.length === 0
                  ? "Aucune session enregistrée"
                  : "Aucune session pour ce filtre"}
              </ThemedText>
              <ThemedText style={[styles.emptySubtitle, { color: nc.textMuted }]}>
                Suivez vos sessions de tire-lait
              </ThemedText>
              {pompages.length === 0 && (
                <Pressable
                  style={[styles.emptyCta, { backgroundColor: Colors[colorScheme].tint }]}
                  onPress={openAddModal}
                  accessibilityRole="button"
                  accessibilityLabel="Ajouter une session de pompage"
                >
                  <Ionicons name="add" size={20} color={nc.white} />
                  <Text style={styles.emptyCtaText}>Ajouter une session</Text>
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
              data={groupedPompages}
              keyExtractor={(item) => item.date}
              renderItem={renderDayGroup}
              showsVerticalScrollIndicator={false}
              contentContainerStyle={[styles.listContent, { flexGrow: 1 }]}
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
          <PumpingSkeleton colorScheme={colorScheme} />
        )}
      </SafeAreaView>
      <ConfirmModal
        visible={deleteConfirm.visible}
        title="Suppression"
        message="Voulez-vous vraiment supprimer ce pompage ?"
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

// ============================================
// STYLES
// ============================================

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  headerButton: {
    paddingVertical: 8,
    borderRadius: 8,
    paddingHorizontal: 8,
  },
  calendarContainer: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderBottomWidth: 1,
  },
  listContent: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 80,
  },

  // Day Section
  daySection: {
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
  dayStatValueAccent: {
    color: eventColors.pumping.dark,
  },
  dayStatLabel: {
    fontSize: 11,
  },
  dayStatDivider: {
    width: 1,
    height: 24,
  },

  // Stats breakdown
  statsBreakdown: {
    flexDirection: "row",
    gap: 16,
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

  // Sessions container
  sessionsContainer: {
    gap: 2,
  },

  // Session Card
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
  sessionContent: {
    flex: 1,
    gap: 6,
  },
  quantityBar: {
    flexDirection: "row",
    height: 6,
    borderRadius: 3,
    overflow: "hidden",
  },
  quantityBarLeft: {
    backgroundColor: neutralColors.success,
  },
  quantityBarRight: {
    backgroundColor: neutralColors.todayAccent,
  },
  quantityLabels: {
    flexDirection: "row",
    gap: 16,
  },
  quantityLabelItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  quantityDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  quantityDotLeft: {
    backgroundColor: neutralColors.success,
  },
  quantityDotRight: {
    backgroundColor: neutralColors.todayAccent,
  },
  quantityLabelValue: {
    fontSize: 11,
    fontWeight: "600",
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
    color: eventColors.pumping.dark,
  },
  sessionTotalUnit: {
    fontSize: 11,
    fontWeight: "500",
  },

  // Expand trigger
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
    color: eventColors.pumping.dark,
  },

  // Filter row & date chip
  filterRow: {},
  dateChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  dateChipText: {
    color: neutralColors.white,
    fontSize: 13,
    fontWeight: "600",
  },

  // Empty State
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
    color: neutralColors.white,
    fontSize: 15,
    fontWeight: "600",
  },

  // Swipe-to-delete
  deleteAction: {
    backgroundColor: neutralColors.error,
    justifyContent: "center",
    alignItems: "center",
    width: 80,
    borderRadius: 14,
    marginHorizontal: 4,
    marginVertical: 1,
    gap: 4,
  },
  deleteActionText: {
    color: neutralColors.white,
    fontSize: 11,
    fontWeight: "700",
  },

  // Skeleton
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
