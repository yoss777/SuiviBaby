import { ThemedText } from "@/components/themed-text";
import { ConfirmModal } from "@/components/ui/ConfirmModal";
import { DateFilterBar, DateFilterValue } from "@/components/ui/DateFilterBar";
import { LoadMoreButton } from "@/components/ui/LoadMoreButton";
import { SelectionToolbar } from "@/components/ui/SelectionToolbar";
import { HeaderMenu, HeaderMenuItem } from "@/components/ui/HeaderMenu";
import {
  DiapersEditData,
  DiapersType,
  MictionCouleur,
  SelleConsistance,
  SelleQuantite,
} from "@/components/forms/DiapersForm";
import { eventColors } from "@/constants/eventColors";
import { MAX_AUTO_LOAD_ATTEMPTS } from "@/constants/pagination";
import { getNeutralColors } from "@/constants/dashboardColors";
import { Colors } from "@/constants/theme";
import { useBaby } from "@/contexts/BabyContext";
import { useSheet } from "@/contexts/SheetContext";
import { useToast } from "@/contexts/ToastContext";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { useBatchSelect } from "@/hooks/useBatchSelect";
import {
  supprimerMiction,
  supprimerSelle,
} from "@/migration/eventsDoubleWriteService";
import {
  ecouterMictionsHybrid as ecouterMictions,
  ecouterSellesHybrid as ecouterSelles,
  getNextEventDateBeforeHybrid,
  hasMoreEventsBeforeHybrid,
} from "@/migration/eventsHybridService";
import { supprimerEvenement } from "@/services/eventsService";
import { Ionicons } from "@expo/vector-icons";
import FontAwesome from "@expo/vector-icons/FontAwesome5";
import * as Haptics from "expo-haptics";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { HeaderBackButton } from "@react-navigation/elements";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import { router, useLocalSearchParams } from "expo-router";
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
  errorColor,
  whiteColor,
}: {
  onPress: () => void;
  errorColor: string;
  whiteColor: string;
}) {
  return (
    <Pressable
      style={[styles.deleteAction, { backgroundColor: errorColor }]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel="Supprimer cette excrétion"
    >
      <Ionicons name="trash-outline" size={20} color={whiteColor} />
      <Text style={[styles.deleteActionText, { color: whiteColor }]}>Supprimer</Text>
    </Pressable>
  );
});

// ============================================
// SKELETON LOADING COMPONENT
// ============================================

const DiapersSkeleton = React.memo(function DiapersSkeleton({
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

interface Excretion {
  id: string;
  type?: DiapersType;
  date: { seconds: number };
  createdAt: { seconds: number };
  // Attributs miction
  couleur?: MictionCouleur;
  volume?: number;
  // Attributs selle
  consistance?: SelleConsistance;
  couleurSelle?: string;
  quantite?: SelleQuantite;
}

interface ExcretionGroup {
  date: string;
  dateFormatted: string;
  excretions: Excretion[];
  mictionsCount: number;
  sellesCount: number;
  lastExcretion: Excretion;
}

// ============================================
// PURE HELPERS
// ============================================

function getExcretionTypeLabel(type?: DiapersType): string {
  if (!type) return "Inconnu";
  return type === "miction" ? "Miction" : "Selle";
}

function getExcretionIcon(type?: DiapersType): string {
  if (type === "miction") return "water";
  if (type === "selle") return "poop";
  return "question";
}

function getExcretionColor(type?: DiapersType): string {
  if (type === "miction") return eventColors.miction.dark;
  if (type === "selle") return eventColors.selle.dark;
  return eventColors.default.dark;
}

function groupExcretionsByDay(excretions: Excretion[]): ExcretionGroup[] {
  const groups: { [key: string]: Excretion[] } = {};

  excretions.forEach((excretion) => {
    const date = new Date(excretion.date?.seconds * 1000);
    const dateKey = `${date.getFullYear()}-${String(
      date.getMonth() + 1
    ).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;

    if (!groups[dateKey]) {
      groups[dateKey] = [];
    }
    groups[dateKey].push(excretion);
  });

  return Object.entries(groups)
    .map(([dateKey, items]) => {
      const date = new Date(dateKey);
      const mictionsCount = items.filter((e) => e.type === "miction").length;
      const sellesCount = items.filter((e) => e.type === "selle").length;
      const lastExcretion = items.reduce((latest, current) =>
        (current.date?.seconds || 0) > (latest.date?.seconds || 0)
          ? current
          : latest
      );

      return {
        date: dateKey,
        dateFormatted: date.toLocaleDateString("fr-FR", {
          weekday: "long",
          day: "numeric",
          month: "long",
          year: "numeric",
        }),
        excretions: items.sort(
          (a, b) => (b.date?.seconds || 0) - (a.date?.seconds || 0)
        ),
        mictionsCount,
        sellesCount,
        lastExcretion,
      };
    })
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
}

// ============================================
// COMPONENT
// ============================================

export default function DiapersScreen() {
  const { activeChild } = useBaby();
  const { setHeaderRight } = useHeaderRight();
  const colorScheme = useColorScheme() ?? "light";
  const nc = getNeutralColors(colorScheme);
  const { openSheet, closeSheet, isOpen } = useSheet();
  const { showToast, showUndoToast } = useToast();
  const headerOwnerId = useRef(
    `diapers-${Math.random().toString(36).slice(2)}`
  );
  const { selectionMode, selectedIds, selectedCount, toggleSelectionMode, exitSelectionMode, toggleId, selectAll, clearSelection } = useBatchSelect();
  const navigation = useNavigation();
  const { setHeaderLeft } = useHeaderLeft();

  const [showCalendar, setShowCalendar] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [selectedFilter, setSelectedFilter] = useState<DateFilterValue | null>("today");
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [layoutReady, setLayoutReady] = useState(false);
  const [pendingOpen, setPendingOpen] = useState(false);
  const sheetOwnerId = "diapers";

  // Data states
  const [excretions, setExcretions] = useState<Excretion[]>([]);
  const [groupedExcretions, setGroupedExcretions] = useState<ExcretionGroup[]>(
    []
  );
  const [expandedDays, setExpandedDays] = useState<Set<string>>(new Set());
  const [mictionsLoaded, setMictionsLoaded] = useState(false);
  const [sellesLoaded, setSellesLoaded] = useState(false);
  const [emptyDelayDone, setEmptyDelayDone] = useState(false);
  const [daysWindow, setDaysWindow] = useState(14);
  const [rangeEndDate, setRangeEndDate] = useState<Date | null>(null);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [autoLoadMore, setAutoLoadMore] = useState(false);
  const [autoLoadMoreAttempts, setAutoLoadMoreAttempts] = useState(0);
  const loadMoreVersionRef = useRef(0);
  const pendingLoadMoreRef = useRef(0);

  // Form pattern states
  const [pendingEditData, setPendingEditData] =
    useState<DiapersEditData | null>(null);
  const [pendingDiapersType, setPendingDiapersType] =
    useState<DiapersType>("miction");

  const [deleteConfirm, setDeleteConfirm] = useState<{
    visible: boolean;
    excretion: Excretion | null;
  }>({ visible: false, excretion: null });

  const [softDeletedIds, setSoftDeletedIds] = useState<Set<string>>(new Set());
  const [batchDeleteConfirm, setBatchDeleteConfirm] = useState<{ visible: boolean; ids: string[] }>({ visible: false, ids: [] });

  // URL params
  const { tab, openModal, editId, returnTo } = useLocalSearchParams();
  const returnTargetParam = Array.isArray(returnTo) ? returnTo[0] : returnTo;

  const editIdRef = useRef<string | null>(null);
  const returnToRef = useRef<string | null>(null);

  // ============================================
  // FORM HELPERS
  // ============================================
  const buildEditData = useCallback(
    (excretion: Excretion): DiapersEditData => ({
      id: excretion.id,
      type: excretion.type || "miction",
      date: new Date(excretion.date.seconds * 1000),
      couleur: excretion.couleur,
      consistance: excretion.consistance,
      quantite: excretion.quantite,
    }),
    []
  );

  const openAddModal = useCallback((diapersType: DiapersType = "miction") => {
    setPendingDiapersType(diapersType);
    setPendingEditData(null);
    setPendingOpen(true);
  }, []);

  const openEditModal = useCallback(
    (excretion: Excretion) => {
      setPendingDiapersType(excretion.type || "miction");
      setPendingEditData(buildEditData(excretion));
      setPendingOpen(true);
    },
    [buildEditData]
  );

  // ============================================
  // EFFECTS - HEADER
  // ============================================

  const handleCalendarPress = useCallback(() => {
    setShowCalendar((prev) => {
      const newValue = !prev;

      if (newValue) {
        const today = new Date();
        const todayString = `${today.getFullYear()}-${String(
          today.getMonth() + 1
        ).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
        setSelectedDate(todayString);
      }

      return newValue;
    });
  }, []);

  const menuItems: HeaderMenuItem[] = useMemo(() => [
    { label: "Ajouter", icon: "add-circle-outline", onPress: openAddModal },
    {
      label: selectionMode ? "Annuler sélection" : "Sélectionner",
      icon: selectionMode ? "close-outline" : "checkmark-done-outline",
      onPress: toggleSelectionMode,
    },
  ], [openAddModal, selectionMode, toggleSelectionMode]);

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

  // ============================================
  // EFFECTS - URL PARAMS
  // ============================================

  useEffect(() => {
    if (tab === "selles") {
      setPendingDiapersType("selle");
    } else if (tab === "mictions") {
      setPendingDiapersType("miction");
    }
  }, [tab]);

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

  useFocusEffect(
    useCallback(() => {
      if (openModal !== "true") return;
      const diapersType = (tab === "selles" ? "selle" : "miction") as DiapersType;
      openAddModal(diapersType);
    }, [openModal, tab, openAddModal])
  );

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
        (endOfToday.getTime() - prev.getTime()) / (24 * 60 * 60 * 1000)
      );
      setDaysWindow((window) => window + diffDays);
      return endOfToday;
    });
  }, []);

  // ============================================
  // SHEET OPEN EFFECT
  // ============================================
  useEffect(() => {
    if (!pendingOpen || !layoutReady) return;
    const returnTarget = returnTargetParam ?? returnToRef.current;
    const isEditing = !!pendingEditData;
    const task = InteractionManager.runAfterInteractions(() => {
      stashReturnTo();
      openSheet({
        ownerId: sheetOwnerId,
        formType: "diapers",
        diapersType: pendingDiapersType,
        editData: pendingEditData ?? undefined,
        onSuccess: () => {
          ensureTodayInRange();
          applyTodayFilter();
          showToast(isEditing ? "Couche modifiee" : "Couche enregistree");
        },
        onDismiss: () => {
          editIdRef.current = null;
          maybeReturnTo(returnTarget);
        },
      });
      (navigation as any).setParams({
        openModal: undefined,
        editId: undefined,
      });
      setPendingOpen(false);
    });
    return () => task.cancel?.();
  }, [
    pendingOpen,
    layoutReady,
    pendingDiapersType,
    pendingEditData,
    navigation,
    stashReturnTo,
    openSheet,
    returnTargetParam,
    maybeReturnTo,
    ensureTodayInRange,
    // @ts-expect-error — applyTodayFilter is a useCallback declared later in the component
    applyTodayFilter,
    showToast,
  ]);

  useEffect(() => {
    if (!editId || !layoutReady) return;
    const normalizedId = Array.isArray(editId) ? editId[0] : editId;
    if (!normalizedId || editIdRef.current === normalizedId) return;
    const target = excretions.find(
      (excretion) => excretion.id === normalizedId
    );
    if (!target) return;
    stashReturnTo();
    editIdRef.current = normalizedId;
    openEditModal(target);
    (navigation as any).setParams({
      openModal: undefined,
      editId: undefined,
    });
  }, [editId, layoutReady, excretions, navigation, openEditModal, stashReturnTo]);

  const handlePullToRefresh = useCallback(() => {
    setIsRefreshing(true);
    setRefreshKey((k) => k + 1);
  }, []);

  // ============================================
  // EFFECTS - DATA LISTENERS
  // ============================================

  useEffect(() => {
    if (!activeChild?.id) return;
    const versionAtSubscribe = loadMoreVersionRef.current;
    const endOfRange = rangeEndDate ? new Date(rangeEndDate) : new Date();
    endOfRange.setHours(23, 59, 59, 999);
    const startOfRange = new Date(endOfRange);
    startOfRange.setHours(0, 0, 0, 0);
    startOfRange.setDate(startOfRange.getDate() - (daysWindow - 1));

    let mictionsData: Excretion[] = [];
    let sellesData: Excretion[] = [];

    const mergeAndSortExcretions = () => {
      const merged = [...mictionsData, ...sellesData].sort(
        (a, b) => (b.date?.seconds || 0) - (a.date?.seconds || 0)
      );
      setExcretions(merged);
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

    const unsubscribeMictions = ecouterMictions(
      activeChild.id,
      (mictions) => {
        mictionsData = mictions.map((m) => ({
          ...m,
          type: "miction" as DiapersType,
        }));
        setMictionsLoaded(true);
        mergeAndSortExcretions();
      },
      { waitForServer: true, depuis: startOfRange, jusqu: endOfRange }
    );

    const unsubscribeSelles = ecouterSelles(
      activeChild.id,
      (selles) => {
        sellesData = selles.map((s) => ({
          ...s,
          type: "selle" as DiapersType,
        }));
        setSellesLoaded(true);
        mergeAndSortExcretions();
      },
      { waitForServer: true, depuis: startOfRange, jusqu: endOfRange }
    );

    return () => {
      unsubscribeMictions();
      unsubscribeSelles();
    };
  }, [activeChild, daysWindow, rangeEndDate, refreshKey]);

  useEffect(() => {
    if (!activeChild?.id) return;
    setExcretions([]);
    setGroupedExcretions([]);
    setMictionsLoaded(false);
    setSellesLoaded(false);
    setEmptyDelayDone(false);
    setDaysWindow(14);
    setRangeEndDate(null);
    setIsLoadingMore(false);
    setHasMore(true);
    loadMoreVersionRef.current = 0;
    pendingLoadMoreRef.current = 0;
  }, [activeChild?.id]);

  const isExcretionsLoading = !(mictionsLoaded && sellesLoaded);

  useEffect(() => {
    if (isExcretionsLoading) {
      setEmptyDelayDone(false);
      return;
    }
    if (groupedExcretions.length > 0) {
      setEmptyDelayDone(true);
      return;
    }
    const timer = setTimeout(() => setEmptyDelayDone(true), 300);
    return () => clearTimeout(timer);
  }, [isExcretionsLoading, groupedExcretions.length]);

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
        const nextEventDate = await getNextEventDateBeforeHybrid(
          activeChild.id,
          ["miction", "selle"],
          beforeDate
        );

        if (nextEventDate) {
          const startOfNext = new Date(nextEventDate);
          startOfNext.setHours(0, 0, 0, 0);
          const diffDays =
            Math.floor(
              (endOfRange.getTime() - startOfNext.getTime()) /
                (24 * 60 * 60 * 1000)
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
    [hasMore, activeChild?.id, autoLoadMoreAttempts, daysWindow, rangeEndDate]
  );

  const handleLoadMore = useCallback(() => {
    loadMoreStep(false);
  }, [loadMoreStep]);

  useEffect(() => {
    if (selectedFilter === "today" || selectedDate) return;
    if (
      !autoLoadMore &&
      !isExcretionsLoading &&
      groupedExcretions.length === 0 &&
      hasMore
    ) {
      setAutoLoadMore(true);
      setAutoLoadMoreAttempts(0);
    }
  }, [
    autoLoadMore,
    isExcretionsLoading,
    groupedExcretions.length,
    hasMore,
    selectedFilter,
    selectedDate,
  ]);

  useEffect(() => {
    if (!autoLoadMore) return;
    if (isExcretionsLoading || isLoadingMore) return;
    if (groupedExcretions.length > 0 || !hasMore) {
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
    isExcretionsLoading,
    isLoadingMore,
    groupedExcretions.length,
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

    setHasMore(true);
    hasMoreEventsBeforeHybrid(activeChild.id, ["miction", "selle"], beforeDate)
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

  const applyTodayFilter = useCallback(() => {
    const today = new Date();
    const todayKey = `${today.getFullYear()}-${String(
      today.getMonth() + 1
    ).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
    setSelectedFilter("today");
    setSelectedDate(null);
    setShowCalendar(false);
    setExpandedDays(new Set([todayKey]));
  }, []);

  const clearSelectedDate = useCallback(() => {
    applyTodayFilter();
  }, [applyTodayFilter]);

  const handleFilterPress = useCallback(
    (filter: DateFilterValue) => {
      if (filter === "today") {
        applyTodayFilter();
        return;
      }

      setSelectedFilter(filter);
      setSelectedDate(null);
      setShowCalendar(false);
      setExpandedDays(new Set());
    },
    [applyTodayFilter]
  );

  useFocusEffect(
    useCallback(() => {
      if (!selectedDate) {
        applyTodayFilter();
      }
    }, [applyTodayFilter, selectedDate])
  );

  // Filtering (memoized)
  const filteredExcretions = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayTime = today.getTime();

    return excretions.filter((excretion) => {
      if (softDeletedIds.has(excretion.id)) return false;
      const excretionDate = new Date(excretion.date.seconds * 1000);
      excretionDate.setHours(0, 0, 0, 0);
      const excretionTime = excretionDate.getTime();

      if (selectedDate) {
        const [calYear, calMonth, calDay] = selectedDate.split("-").map(Number);
        const calDate = new Date(calYear, calMonth - 1, calDay);
        calDate.setHours(0, 0, 0, 0);
        return excretionTime === calDate.getTime();
      }

      if (selectedFilter === "today") return excretionTime === todayTime;
      if (selectedFilter === "past") return excretionTime < todayTime;
      return true;
    });
  }, [excretions, selectedFilter, selectedDate, softDeletedIds]);

  // Grouping by day
  useEffect(() => {
    const grouped = groupExcretionsByDay(filteredExcretions);
    setGroupedExcretions(grouped);
  }, [filteredExcretions]);

  // ============================================
  // HELPERS - CALENDAR
  // ============================================

  const markedDates = useMemo(() => {
    const marked: Record<string, any> = {};

    excretions.forEach((excretion) => {
      const date = new Date(excretion.date.seconds * 1000);
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
  }, [excretions, selectedDate, colorScheme]);

  const handleDateSelect = useCallback((day: DateData) => {
    setSelectedDate(day.dateString);
    setSelectedFilter(null);
    setShowCalendar(false);
    setExpandedDays(new Set([day.dateString]));
  }, []);

  // ============================================
  // HELPERS - UI
  // ============================================

  const toggleExpand = useCallback((dateKey: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExpandedDays((prev) => {
      const newExpandedDays = new Set(prev);
      if (newExpandedDays.has(dateKey)) {
        newExpandedDays.delete(dateKey);
      } else {
        newExpandedDays.add(dateKey);
      }
      return newExpandedDays;
    });
  }, []);

  // ============================================
  // HANDLERS - DELETE
  // ============================================

  const handleExcretionDelete = useCallback((excretion: Excretion) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setDeleteConfirm({ visible: true, excretion });
  }, []);

  const confirmDelete = useCallback(async () => {
    if (!activeChild?.id || !deleteConfirm.excretion?.id) return;
    const { id, type } = deleteConfirm.excretion;
    const childId = activeChild.id;
    setDeleteConfirm({ visible: false, excretion: null });

    // Soft-delete: hide immediately from UI
    setSoftDeletedIds((prev) => new Set(prev).add(id));

    showUndoToast(
      "Couche supprimee",
      // onUndo - restore visibility
      () => {
        setSoftDeletedIds((prev) => {
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
      },
      // onExpire - actually delete from Firestore
      async () => {
        try {
          if (type === "selle") {
            await supprimerSelle(childId, id);
          } else {
            await supprimerMiction(childId, id);
          }
        } catch {
          // Restore if delete fails
          setSoftDeletedIds((prev) => {
            const next = new Set(prev);
            next.delete(id);
            return next;
          });
          showToast("Erreur lors de la suppression");
        }
      },
      4000,
    );
  }, [activeChild?.id, deleteConfirm.excretion, showUndoToast, showToast]);

  const cancelDelete = useCallback(() => {
    setDeleteConfirm({ visible: false, excretion: null });
  }, []);

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
    setSoftDeletedIds((prev) => { const next = new Set(prev); ids.forEach((id) => next.add(id)); return next; });
    const msg = `${ids.length} élément${ids.length > 1 ? "s" : ""} supprimé${ids.length > 1 ? "s" : ""}`;
    showUndoToast(msg,
      () => { setSoftDeletedIds((prev) => { const next = new Set(prev); ids.forEach((id) => next.delete(id)); return next; }); },
      async () => {
        try { await Promise.all(ids.map((id) => supprimerEvenement(childId, id))); }
        catch { setSoftDeletedIds((prev) => { const next = new Set(prev); ids.forEach((id) => next.delete(id)); return next; }); showToast("Erreur lors de la suppression"); }
      }, 4000);
  }, [batchDeleteConfirm.ids, activeChild?.id, exitSelectionMode, showUndoToast, showToast]);

  const cancelBatchDelete = useCallback(() => { setBatchDeleteConfirm({ visible: false, ids: [] }); }, []);

  // ============================================
  // RENDER - EXCRETION ITEM
  // ============================================

  const renderExcretionItem = useCallback(
    (excretion: Excretion, isLast: boolean = false) => {
      const typeLabel = getExcretionTypeLabel(excretion.type);
      const color = getExcretionColor(excretion.type);
      const excretionTime = new Date(excretion.date?.seconds * 1000);

      const detailParts: string[] = [];
      if (excretion.type === "miction" && excretion.couleur) {
        const couleurLabel =
          excretion.couleur === "claire"
            ? "Claire"
            : excretion.couleur === "jaune"
              ? "Jaune"
              : excretion.couleur === "foncee"
                ? "Foncee"
                : "Autre";
        detailParts.push(couleurLabel);
      }
      if (excretion.type === "selle") {
        if (excretion.consistance) {
          const consistanceLabel =
            excretion.consistance === "liquide"
              ? "Liquide"
              : excretion.consistance === "molle"
                ? "Molle"
                : excretion.consistance === "normale"
                  ? "Normale"
                  : "Dure";
          detailParts.push(consistanceLabel);
        }
        if (excretion.quantite) {
          const quantiteLabel =
            excretion.quantite === "peu"
              ? "Peu"
              : excretion.quantite === "moyen"
                ? "Moyen"
                : "Beaucoup";
          detailParts.push(quantiteLabel);
        }
      }
      const detailsText = detailParts.join(" · ");

      return (
        <ReanimatedSwipeable
          key={excretion.id}
          renderRightActions={() => (
            <DeleteAction onPress={() => handleExcretionDelete(excretion)} errorColor={nc.error} whiteColor={nc.white} />
          )}
          friction={2}
          rightThreshold={40}
          overshootRight={false}
        >
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Modifier cette excretion"
            style={({ pressed }) => [
              styles.sessionCard,
              {
                borderColor: nc.borderLight,
                backgroundColor: pressed ? nc.backgroundPressed : nc.backgroundCard,
                shadowColor: nc.shadow,
              },
            ]}
            onPress={selectionMode ? () => toggleId(excretion.id) : () => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); openEditModal(excretion); }}
          >
            {selectionMode && (
              <Pressable
                onPress={() => toggleId(excretion.id)}
                style={{ marginRight: 8 }}
              >
                <Ionicons
                  name={selectedIds.has(excretion.id) ? "checkbox" : "square-outline"}
                  size={22}
                  color={selectedIds.has(excretion.id) ? Colors[colorScheme].tint : nc.textMuted}
                />
              </Pressable>
            )}
            {/* Time badge */}
            <View style={styles.sessionTime}>
              <Text
                style={[
                  styles.sessionTimeText,
                  { color: nc.textMuted },
                  isLast && { color: nc.textStrong, fontWeight: "600" },
                ]}
              >
                {excretionTime.toLocaleTimeString("fr-FR", {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </Text>
            </View>

            {/* Content */}
            <View style={styles.sessionContent}>
              <View
                style={[
                  styles.sessionIconWrapper,
                  { backgroundColor: color + "20" },
                ]}
              >
                <FontAwesome
                  name={getExcretionIcon(excretion.type)}
                  size={14}
                  color={color}
                />
              </View>
              <View style={styles.sessionDetails}>
                <Text style={[styles.sessionType, { color: nc.textStrong }]}>
                  {typeLabel}
                </Text>
                {detailsText.length > 0 && (
                  <Text style={[styles.sessionDetailText, { color: nc.textMuted }]}>
                    {detailsText}
                  </Text>
                )}
              </View>
            </View>

            <Ionicons name="create-outline" size={18} color={nc.textMuted} />
          </Pressable>
        </ReanimatedSwipeable>
      );
    },
    [nc, openEditModal, handleExcretionDelete, selectionMode, selectedIds, toggleId, colorScheme]
  );

  // ============================================
  // RENDER - DAY GROUP
  // ============================================

  const renderDayGroup = useCallback(
    ({ item }: { item: ExcretionGroup }) => {
      const isExpanded = expandedDays.has(item.date);
      const hasMultipleExcretions = item.excretions.length > 1;

      const formatDayLabel = () => {
        const today = new Date();
        const yesterday = new Date(today);
        yesterday.setDate(yesterday.getDate() - 1);
        const itemDate = new Date(item.date);

        if (
          itemDate.toDateString() === today.toDateString() &&
          selectedFilter !== "today"
        ) {
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
        <View style={styles.dayGroup}>
          {/* Day Header with stats */}
          <View style={styles.dayHeader}>
            <Text style={[styles.dayLabel, { color: nc.textStrong }]}>
              {formatDayLabel()}
            </Text>
            <View style={styles.dayStats}>
              <View style={styles.dayStatItem}>
                <Text style={[styles.dayStatValue, { color: nc.textNormal }]}>
                  {item.mictionsCount + item.sellesCount}
                </Text>
                <Text style={[styles.dayStatLabel, { color: nc.textMuted }]}>
                  excretion{item.mictionsCount + item.sellesCount > 1 ? "s" : ""}
                </Text>
              </View>
            </View>
          </View>

          {/* Stats breakdown */}
          <View style={styles.statsBreakdown}>
            {item.mictionsCount > 0 && (
              <View style={styles.statsBreakdownItem}>
                <View
                  style={[
                    styles.statsBreakdownDot,
                    { backgroundColor: eventColors.miction.dark },
                  ]}
                />
                <Text style={[styles.statsBreakdownLabel, { color: nc.textMuted }]}>
                  Miction{item.mictionsCount > 1 ? "s" : ""}
                </Text>
                <Text style={[styles.statsBreakdownValue, { color: nc.textNormal }]}>
                  {item.mictionsCount}
                </Text>
              </View>
            )}
            {item.sellesCount > 0 && (
              <View style={styles.statsBreakdownItem}>
                <View
                  style={[
                    styles.statsBreakdownDot,
                    { backgroundColor: eventColors.selle.dark },
                  ]}
                />
                <Text style={[styles.statsBreakdownLabel, { color: nc.textMuted }]}>
                  Selle{item.sellesCount > 1 ? "s" : ""}
                </Text>
                <Text style={[styles.statsBreakdownValue, { color: nc.textNormal }]}>
                  {item.sellesCount}
                </Text>
              </View>
            )}
          </View>

          {/* Sessions list */}
          <View style={styles.sessionsContainer}>
            {renderExcretionItem(item.lastExcretion, true)}

            {hasMultipleExcretions && (
              <>
                {isExpanded &&
                  item.excretions
                    .filter(
                      (excretion) => excretion.id !== item.lastExcretion.id
                    )
                    .map((excretion) => renderExcretionItem(excretion, false))}

                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={
                    isExpanded
                      ? "Masquer les excretions"
                      : "Voir toutes les excretions"
                  }
                  style={({ pressed }) => [
                    styles.expandTrigger,
                    {
                      borderColor: nc.borderLight,
                      backgroundColor: pressed
                        ? nc.backgroundPressed
                        : nc.backgroundCard,
                    },
                  ]}
                  onPress={() => toggleExpand(item.date)}
                >
                  <Text
                    style={[
                      styles.expandTriggerText,
                      { color: Colors[colorScheme].tint },
                    ]}
                  >
                    {isExpanded
                      ? "Masquer"
                      : `${item.excretions.length - 1} autre${item.excretions.length > 2 ? "s" : ""} excretion${item.excretions.length > 2 ? "s" : ""}`}
                  </Text>
                  <Ionicons
                    name={isExpanded ? "chevron-up" : "chevron-down"}
                    size={14}
                    color={nc.textMuted}
                  />
                </Pressable>
              </>
            )}
          </View>
        </View>
      );
    },
    [expandedDays, nc, renderExcretionItem, toggleExpand, selectedFilter, colorScheme]
  );

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
          {/* Filters with date chip */}
          <View style={styles.filterRow}>
            <DateFilterBar
              selected={selectedDate ? ("past" as DateFilterValue) : (selectedFilter as DateFilterValue)}
              onSelect={handleFilterPress}
            >
              {selectedDate && (
                <Pressable
                  style={[styles.dateChip, { backgroundColor: Colors[colorScheme].tint }]}
                  onPress={clearSelectedDate}
                  accessibilityRole="button"
                  accessibilityLabel="Effacer la date selectionnee"
                >
                  <Text style={[styles.dateChipText, { color: nc.white }]}>
                    {formatSelectedDateLabel(selectedDate)}
                  </Text>
                  <Ionicons name="close" size={14} color={nc.white} />
                </Pressable>
              )}
            </DateFilterBar>
          </View>

          {/* Calendar */}
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

        {/* Barre de sélection */}
        {selectionMode && (
          <SelectionToolbar
            selectedCount={selectedCount}
            totalCount={groupedExcretions.reduce((n, g) => n + g.excretions.length, 0)}
            onSelectAll={() => selectAll(groupedExcretions.flatMap((g) => g.excretions.map((e) => e.id)))}
            onClearSelection={clearSelection}
            onDelete={handleBatchDelete}
          />
        )}

        {/* Excretions list */}
        {isExcretionsLoading || !emptyDelayDone ? (
          <DiapersSkeleton colorScheme={colorScheme} />
        ) : groupedExcretions.length === 0 ? (
          <View style={styles.emptyContainer}>
            <View
              style={[
                styles.emptyIconWrapper,
                { backgroundColor: `${eventColors.miction.dark}15` },
              ]}
            >
              <FontAwesome
                name="tint"
                size={36}
                color={eventColors.miction.dark}
              />
            </View>
            <ThemedText style={[styles.emptyTitle, { color: nc.textStrong }]}>
              {excretions.length === 0
                ? "Aucune couche enregistree"
                : "Aucune couche pour ce filtre"}
            </ThemedText>
            <ThemedText style={[styles.emptySubtitle, { color: nc.textMuted }]}>
              Suivez les changes de bebe
            </ThemedText>

            {excretions.length === 0 && (
              <Pressable
                style={[
                  styles.emptyCta,
                  { backgroundColor: Colors[colorScheme].tint },
                ]}
                onPress={() => openAddModal()}
                accessibilityRole="button"
                accessibilityLabel="Ajouter une couche"
              >
                <Ionicons name="add" size={20} color={nc.white} />
                <Text style={[styles.emptyCtaText, { color: nc.white }]}>Ajouter une couche</Text>
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
            data={groupedExcretions}
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
                  hasMore={hasMore}
                  loading={isLoadingMore}
                  onPress={handleLoadMore}
                  text="Voir plus"
                  accentColor={Colors[colorScheme].tint}
                />
              )
            }
          />
        )}
      </SafeAreaView>
      <ConfirmModal
        visible={deleteConfirm.visible}
        title="Suppression"
        message="Voulez-vous vraiment supprimer cette couche ?"
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
    paddingTop: 8,
    paddingBottom: 80,
  },
  // Day Group
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
  // Stats breakdown
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
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  sessionIconWrapper: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  sessionDetails: {
    flex: 1,
  },
  sessionType: {
    fontSize: 15,
    fontWeight: "600",
  },
  sessionDetailText: {
    fontSize: 12,
    marginTop: 2,
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
    fontSize: 15,
    fontWeight: "600",
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
  // Swipe-to-delete
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
