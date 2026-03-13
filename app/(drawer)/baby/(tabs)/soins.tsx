import { SoinsEditData, SoinsType } from "@/components/forms/SoinsForm";
import { ThemedText } from "@/components/themed-text";
import { ConfirmModal } from "@/components/ui/ConfirmModal";
import { DateFilterBar, DateFilterValue } from "@/components/ui/DateFilterBar";
import { LoadMoreButton } from "@/components/ui/LoadMoreButton";
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
  supprimerTemperature,
  supprimerMedicament,
  supprimerSymptome,
  supprimerVaccin,
  supprimerVitamine,
} from "@/migration/eventsDoubleWriteService";
import { supprimerEvenement } from "@/services/eventsService";
import {
  ecouterMedicamentsHybrid,
  ecouterSymptomesHybrid,
  ecouterTemperaturesHybrid,
  ecouterVaccinsHybrid,
  ecouterVitaminesHybrid,
  getNextEventDateBeforeHybrid,
  hasMoreEventsBeforeHybrid,
} from "@/migration/eventsHybridService";
import { Ionicons } from "@expo/vector-icons";
import FontAwesome from "@expo/vector-icons/FontAwesome6";
import * as Haptics from "expo-haptics";
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
}: {
  onPress: () => void;
}) {
  return (
    <Pressable
      style={styles.deleteAction}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel="Supprimer cet événement"
    >
      <Ionicons name="trash-outline" size={20} color="#fff" />
      <Text style={styles.deleteActionText}>Supprimer</Text>
    </Pressable>
  );
});

// ============================================
// SKELETON LOADING COMPONENT
// ============================================

const SoinsSkeleton = React.memo(function SoinsSkeleton({
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
      ? "rgba(255, 255, 255, 0.08)"
      : "rgba(255, 255, 255, 0.4)";

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
type HealthType = SoinsType;

type HealthEvent = {
  id: string;
  type: HealthType;
  date: { seconds: number } | Date;
  createdAt?: { seconds: number } | Date;
  note?: string;
  valeur?: number;
  modePrise?:
    | "axillaire"
    | "auriculaire"
    | "buccale"
    | "frontale"
    | "rectale"
    | "autre";
  nomMedicament?: string;
  dosage?: string;
  voie?: "orale" | "topique" | "inhalation" | "autre";
  symptomes?: string[];
  intensite?: "léger" | "modéré" | "fort";
  nomVaccin?: string;
  nomVitamine?: string;
};

type HealthGroup = {
  date: string;
  events: HealthEvent[];
  counts: Record<HealthType, number>;
  lastEvent: HealthEvent;
};

const TYPE_CONFIG: Record<
  HealthType,
  { label: string; color: string; icon: string }
> = {
  temperature: {
    label: "Température",
    color: eventColors.temperature.dark,
    icon: "temperature-half",
  },
  medicament: {
    label: "Médicament",
    color: eventColors.medicament.dark,
    icon: "pills",
  },
  symptome: {
    label: "Symptôme",
    color: eventColors.symptome.dark,
    icon: "virus",
  },
  vaccin: {
    label: "Vaccin",
    color: eventColors.vaccin.dark,
    icon: "syringe",
  },
  vitamine: {
    label: "Vitamine",
    color: eventColors.vitamine.dark,
    icon: "pills",
  },
};

// ============================================
// HELPERS
// ============================================
const toDate = (value: any): Date => {
  if (!value) return new Date();
  if (value?.seconds) return new Date(value.seconds * 1000);
  if (value?.toDate) return value.toDate();
  if (value instanceof Date) return value;
  return new Date(value);
};

const formatDateKey = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;

const formatTime = (date: Date) =>
  date.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });

const formatTemperature = (value?: number) =>
  typeof value === "number" ? `${value}°C` : "";

// ============================================
// COMPONENT
// ============================================

export default function SoinsScreen() {
  const { activeChild } = useBaby();
  const { setHeaderRight } = useHeaderRight();
  const { setHeaderLeft } = useHeaderLeft();
  const colorScheme = useColorScheme() ?? "light";
  const nc = getNeutralColors(colorScheme);
  const { openSheet, closeSheet, isOpen } = useSheet();
  const { showToast, showUndoToast } = useToast();
  const navigation = useNavigation();
  const headerOwnerId = useRef(`soins-${Math.random().toString(36).slice(2)}`);
  const { selectionMode, selectedIds, selectedCount, toggleSelectionMode, exitSelectionMode, toggleId } = useBatchSelect();

  const { openModal, editId, returnTo, type } = useLocalSearchParams();
  const returnTargetParam = Array.isArray(returnTo) ? returnTo[0] : returnTo;
  const sheetOwnerId = "soins";

  const [showCalendar, setShowCalendar] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [selectedFilter, setSelectedFilter] = useState<DateFilterValue | null>("today");
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [layoutReady, setLayoutReady] = useState(false);
  const [pendingOpen, setPendingOpen] = useState(false);
  const [pendingEditData, setPendingEditData] = useState<SoinsEditData | null>(null);
  const [pendingSoinsType, setPendingSoinsType] = useState<SoinsType>("temperature");

  const [events, setEvents] = useState<HealthEvent[]>([]);
  const [groupedEvents, setGroupedEvents] = useState<HealthGroup[]>([]);
  const [expandedDays, setExpandedDays] = useState<Set<string>>(new Set());
  const [loaded, setLoaded] = useState({
    temperature: false,
    medicament: false,
    symptome: false,
    vaccin: false,
    vitamine: false,
  });
  const [emptyDelayDone, setEmptyDelayDone] = useState(false);
  const [daysWindow, setDaysWindow] = useState(14);
  const [rangeEndDate, setRangeEndDate] = useState<Date | null>(null);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [autoLoadMore, setAutoLoadMore] = useState(false);
  const [autoLoadMoreAttempts, setAutoLoadMoreAttempts] = useState(0);
  const loadMoreVersionRef = useRef(0);
  const pendingLoadMoreRef = useRef(0);

  const [deleteConfirm, setDeleteConfirm] = useState<{
    visible: boolean;
    event: HealthEvent | null;
  }>({ visible: false, event: null });

  const [softDeletedIds, setSoftDeletedIds] = useState<Set<string>>(new Set());

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
  const buildEditData = useCallback((event: HealthEvent): SoinsEditData => {
    return {
      id: event.id,
      type: event.type,
      date: toDate(event.date),
      note: event.note,
      valeur: event.valeur,
      modePrise: event.modePrise,
      nomMedicament: event.nomMedicament,
      dosage: event.dosage,
      voie: event.voie,
      symptomes: event.symptomes,
      intensite: event.intensite,
      nomVaccin: event.nomVaccin,
      nomVitamine: event.nomVitamine,
    };
  }, []);

  // ============================================
  // OPEN ADD / EDIT MODAL
  // ============================================
  const openAddModal = useCallback((soinsType: SoinsType = "temperature") => {
    setPendingSoinsType(soinsType);
    setPendingEditData(null);
    setPendingOpen(true);
  }, []);

  const openEditModal = useCallback((event: HealthEvent) => {
    setPendingSoinsType(event.type);
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

  useFocusEffect(
    useCallback(() => {
      const headerButtons = (
        <View style={styles.headerButtons}>
          <Pressable
            onPress={toggleSelectionMode}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            style={styles.headerButton}
            accessibilityRole="button"
            accessibilityLabel={selectionMode ? "Annuler la sélection" : "Mode sélection"}
          >
            {selectionMode ? (
              <Text style={{ color: Colors[colorScheme].tint, fontSize: 14, fontWeight: "600" }}>Annuler</Text>
            ) : (
              <Ionicons name="checkmark-done-outline" size={22} color={Colors[colorScheme].tint} />
            )}
          </Pressable>
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
          <Pressable
            onPress={() => openAddModal("temperature")}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            style={styles.headerButton}
          >
            <Ionicons name="add" size={24} color={Colors[colorScheme].tint} />
          </Pressable>
        </View>
      );
      setHeaderRight(headerButtons, headerOwnerId.current);
      return () => {
        setHeaderRight(null, headerOwnerId.current);
      };
    }, [handleCalendarPress, showCalendar, colorScheme, setHeaderRight, openAddModal, selectionMode, toggleSelectionMode, selectedCount]),
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
    }, [closeSheet, isOpen, returnTargetParam]),
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

    let temperaturesData: HealthEvent[] = [];
    let medicamentsData: HealthEvent[] = [];
    let symptomesData: HealthEvent[] = [];
    let vaccinsData: HealthEvent[] = [];
    let vitaminesData: HealthEvent[] = [];

    const merge = () => {
      const merged = [
        ...temperaturesData,
        ...medicamentsData,
        ...symptomesData,
        ...vaccinsData,
        ...vitaminesData,
      ].sort((a, b) => toDate(b.date).getTime() - toDate(a.date).getTime());
      setEvents(merged);
      setIsRefreshing(false);

      // Clean up soft-deleted IDs that are no longer in the dataset
      setSoftDeletedIds((prev) => {
        if (prev.size === 0) return prev;
        const dataIds = new Set(merged.map((e: any) => e.id));
        const next = new Set<string>();
        prev.forEach((id) => { if (dataIds.has(id)) next.add(id); });
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

    const unsubscribeTemperatures = ecouterTemperaturesHybrid(
      activeChild.id,
      (data) => {
        temperaturesData = data as HealthEvent[];
        setLoaded((prev) => ({ ...prev, temperature: true }));
        merge();
      },
      { waitForServer: true, depuis: startOfRange, jusqu: endOfRange },
    );
    const unsubscribeMedicaments = ecouterMedicamentsHybrid(
      activeChild.id,
      (data) => {
        medicamentsData = data as HealthEvent[];
        setLoaded((prev) => ({ ...prev, medicament: true }));
        merge();
      },
      { waitForServer: true, depuis: startOfRange, jusqu: endOfRange },
    );
    const unsubscribeSymptomes = ecouterSymptomesHybrid(
      activeChild.id,
      (data) => {
        symptomesData = data as HealthEvent[];
        setLoaded((prev) => ({ ...prev, symptome: true }));
        merge();
      },
      { waitForServer: true, depuis: startOfRange, jusqu: endOfRange },
    );
    const unsubscribeVaccins = ecouterVaccinsHybrid(
      activeChild.id,
      (data) => {
        vaccinsData = data as HealthEvent[];
        setLoaded((prev) => ({ ...prev, vaccin: true }));
        merge();
      },
      { waitForServer: true, depuis: startOfRange, jusqu: endOfRange },
    );
    const unsubscribeVitamines = ecouterVitaminesHybrid(
      activeChild.id,
      (data) => {
        vitaminesData = data as HealthEvent[];
        setLoaded((prev) => ({ ...prev, vitamine: true }));
        merge();
      },
      { waitForServer: true, depuis: startOfRange, jusqu: endOfRange },
    );

    return () => {
      unsubscribeTemperatures();
      unsubscribeMedicaments();
      unsubscribeSymptomes();
      unsubscribeVaccins();
      unsubscribeVitamines();
    };
  }, [activeChild?.id, daysWindow, rangeEndDate, refreshKey]);

  useEffect(() => {
    if (!activeChild?.id) return;
    setEvents([]);
    setGroupedEvents([]);
    setLoaded({
      temperature: false,
      medicament: false,
      symptome: false,
      vaccin: false,
      vitamine: false,
    });
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

  useEffect(() => {
    if (!activeChild?.id) return;
    let cancelled = false;
    const endOfRange = rangeEndDate ? new Date(rangeEndDate) : new Date();
    endOfRange.setHours(23, 59, 59, 999);
    const startOfRange = new Date(endOfRange);
    startOfRange.setHours(0, 0, 0, 0);
    startOfRange.setDate(startOfRange.getDate() - (daysWindow - 1));
    const beforeDate = new Date(startOfRange.getTime() - 1);
    const types: HealthType[] = [
      "temperature",
      "medicament",
      "symptome",
      "vaccin",
      "vitamine",
    ];

    setHasMore(true);
    hasMoreEventsBeforeHybrid(activeChild.id, types, beforeDate)
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
  }, [events, selectedDate, colorScheme]);

  const handleDateSelect = useCallback((day: DateData) => {
    setSelectedFilter(null);
    setSelectedDate(day.dateString);
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
      if (!selectedDate && !selectedFilter) {
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

    const groups: Record<string, HealthEvent[]> = {};
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
          temperature: 0,
          medicament: 0,
          symptome: 0,
          vaccin: 0,
          vitamine: 0,
        } as Record<HealthType, number>;
        sorted.forEach((item) => {
          counts[item.type] += 1;
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
      pendingLoadMoreRef.current = 5;
      loadMoreVersionRef.current += 1;

      if (!auto || autoLoadMoreAttempts >= MAX_AUTO_LOAD_ATTEMPTS - 1) {
        const endOfRange = rangeEndDate ? new Date(rangeEndDate) : new Date();
        endOfRange.setHours(23, 59, 59, 999);
        const startOfRange = new Date(endOfRange);
        startOfRange.setHours(0, 0, 0, 0);
        startOfRange.setDate(startOfRange.getDate() - (daysWindow - 1));
        const beforeDate = new Date(startOfRange.getTime() - 1);
        const types: HealthType[] = [
          "temperature",
          "medicament",
          "symptome",
          "vaccin",
          "vitamine",
        ];
        const nextEventDate = await getNextEventDateBeforeHybrid(
          activeChild.id,
          types,
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
      const soinsType: SoinsType =
        normalizedType &&
        ["temperature", "medicament", "symptome", "vaccin", "vitamine"].includes(normalizedType)
          ? (normalizedType as SoinsType)
          : "temperature";
      openAddModal(soinsType);
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
        formType: "soins",
        soinsType: pendingSoinsType,
        editData: pendingEditData ?? undefined,
        onSuccess: () => {
          ensureTodayInRange();
          applyTodayFilter();
          showToast(isEditing ? "Soin modifié" : "Soin enregistré");
        },
        onDismiss: () => {
          editIdRef.current = null;
          maybeReturnTo(returnTarget);
        },
      });
      navigation.setParams({ openModal: undefined, editId: undefined } as any);
      setPendingOpen(false);
    });
    return () => task.cancel?.();
  }, [
    pendingOpen,
    layoutReady,
    pendingSoinsType,
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
    navigation.setParams({ openModal: undefined, editId: undefined } as any);
  }, [
    editId,
    layoutReady,
    events,
    navigation,
    openEditModal,
    stashReturnTo,
  ]);

  // ============================================
  // RENDER HELPERS
  // ============================================
  const buildDetails = useCallback((event: HealthEvent) => {
    if (event.type === "temperature") {
      return [formatTemperature(event.valeur), event.modePrise]
        .filter(Boolean)
        .join(" · ");
    }
    if (event.type === "medicament") {
      return [event.nomMedicament, event.dosage, event.voie]
        .filter(Boolean)
        .join(" · ");
    }
    if (event.type === "symptome") {
      const list = event.symptomes?.join(", ");
      return [list, event.intensite].filter(Boolean).join(" · ");
    }
    if (event.type === "vaccin") {
      return [event.nomVaccin, event.dosage].filter(Boolean).join(" · ");
    }
    if (event.type === "vitamine") {
      return [event.nomVitamine, event.dosage].filter(Boolean).join(" · ");
    }
    return "";
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

  const handleEventDelete = useCallback((event: HealthEvent) => {
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
      "Soin supprimé",
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
          const supprimerMap: Record<HealthType, (childId: string, id: string) => Promise<void>> = {
            temperature: supprimerTemperature,
            medicament: supprimerMedicament,
            symptome: supprimerSymptome,
            vaccin: supprimerVaccin,
            vitamine: supprimerVitamine,
          };
          await supprimerMap[eventType](childId, eventId);
        } catch {
          // Restore if delete fails
          setSoftDeletedIds((prev) => {
            const next = new Set(prev);
            next.delete(eventId);
            return next;
          });
          showToast("Erreur lors de la suppression");
        }
      },
      4000,
    );
  }, [activeChild?.id, deleteConfirm.event, showUndoToast, showToast]);

  const cancelDelete = useCallback(() => {
    setDeleteConfirm({ visible: false, event: null });
  }, []);

  const handleBatchDelete = useCallback(async () => {
    if (!activeChild?.id || selectedCount === 0) return;
    const ids = Array.from(selectedIds);
    exitSelectionMode();
    try {
      await Promise.all(ids.map((id) => supprimerEvenement(activeChild.id, id)));
      showToast(`${ids.length} élément${ids.length > 1 ? "s" : ""} supprimé${ids.length > 1 ? "s" : ""}`);
    } catch {
      showToast("Erreur lors de la suppression");
    }
  }, [activeChild?.id, selectedIds, selectedCount, exitSelectionMode, showToast]);

  const renderEventItem = useCallback((event: HealthEvent) => {
    const time = toDate(event.date);
    const config = TYPE_CONFIG[event.type];
    return (
      <ReanimatedSwipeable
        key={event.id}
        friction={2}
        rightThreshold={40}
        overshootRight={false}
        renderRightActions={() => <DeleteAction onPress={() => handleEventDelete(event)} />}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Modifier cet événement"
          style={({ pressed }) => [
            styles.sessionCard,
            { backgroundColor: pressed ? nc.backgroundPressed : nc.backgroundCard },
            { borderColor: nc.borderLight },
          ]}
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
            <Text style={[styles.sessionTimeText, { color: nc.textMuted }]}>
              {formatTime(time)}
            </Text>
          </View>
          <View
            style={[
              styles.sessionIconWrapper,
              { backgroundColor: `${config.color}20` },
            ]}
          >
            <FontAwesome name={config.icon as any} size={14} color={config.color} />
          </View>
          <View style={styles.sessionDetails}>
            <Text style={[styles.sessionType, { color: nc.textStrong }]}>{config.label}</Text>
            <Text style={[styles.sessionDetailText, { color: nc.textMuted }]}>{buildDetails(event)}</Text>
          </View>
          <Ionicons name="create-outline" size={18} color={nc.textMuted} />
        </Pressable>
      </ReanimatedSwipeable>
    );
  }, [nc, openEditModal, buildDetails, handleEventDelete, selectionMode, selectedIds, toggleId, colorScheme]);

  const renderDayGroup = useCallback(({ item }: { item: HealthGroup }) => {
    const [year, month, day] = item.date.split("-").map(Number);
    const date = new Date(year, month - 1, day);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    const formatDayLabel = () => {
      if (date.toDateString() === today.toDateString() && selectedFilter !== "today") {
        return "Aujourd'hui";
      } else if (date.toDateString() === yesterday.toDateString()) {
        return "Hier";
      }
      return date.toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short" });
    };

    const isExpanded = expandedDays.has(item.date);
    const hasMultiple = item.events.length > 1;

    return (
      <View style={styles.daySection}>
        <View style={styles.dayHeader}>
          <Text style={[styles.dayLabel, { color: nc.textStrong }]}>{formatDayLabel()}</Text>
          <View style={styles.dayStats}>
            <View style={styles.dayStatItem}>
              <Text style={[styles.dayStatValue, { color: nc.textNormal }]}>{item.events.length}</Text>
              <Text style={[styles.dayStatLabel, { color: nc.textMuted }]}>
                évènement{item.events.length > 1 ? "s" : ""}
              </Text>
            </View>
          </View>
        </View>

        <View style={styles.statsBreakdown}>
          {(Object.keys(TYPE_CONFIG) as HealthType[]).map((type) => {
            const count = item.counts[type];
            if (!count) return null;
            return (
              <View key={type} style={styles.statsBreakdownItem}>
                <View
                  style={[
                    styles.statsBreakdownDot,
                    { backgroundColor: TYPE_CONFIG[type].color },
                  ]}
                />
                <Text style={[styles.statsBreakdownLabel, { color: nc.textMuted }]}>
                  {TYPE_CONFIG[type].label}
                  {count > 1 ? "s" : ""}
                </Text>
                <Text style={[styles.statsBreakdownValue, { color: nc.textNormal }]}>{count}</Text>
              </View>
            );
          })}
        </View>

        <View style={styles.sessionsContainer}>
          {renderEventItem(item.lastEvent)}
          {hasMultiple && (
            <>
              {isExpanded &&
                item.events
                  .filter((evt) => evt.id !== item.lastEvent.id)
                  .map((evt) => renderEventItem(evt))}
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={isExpanded ? "Masquer les événements" : `Voir ${item.events.length - 1} autre${item.events.length > 2 ? "s" : ""} événement${item.events.length > 2 ? "s" : ""}`}
                style={({ pressed }) => [
                  styles.expandTrigger,
                  { borderColor: nc.borderLight, backgroundColor: pressed ? nc.backgroundPressed : nc.backgroundCard },
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
                    : `${item.events.length - 1} autre${item.events.length > 2 ? "s" : ""} événement${item.events.length > 2 ? "s" : ""}`}
                </Text>
                <Ionicons
                  name={isExpanded ? "chevron-up" : "chevron-down"}
                  size={14}
                  color={Colors[colorScheme].tint}
                />
              </Pressable>
            </>
          )}
        </View>
      </View>
    );
  }, [expandedDays, nc, colorScheme, selectedFilter, renderEventItem, toggleExpand]);

  // ============================================
  // RENDER
  // ============================================
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <View style={[styles.container, { backgroundColor: nc.background }]}>
        <SafeAreaView
          style={{ flex: 1 }}
          edges={["bottom"]}
          onLayout={() => setLayoutReady(true)}
        >
          <View>
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
                    accessibilityLabel="Effacer la date sélectionnée"
                  >
                    <Text style={styles.dateChipText}>
                      {formatSelectedDateLabel(selectedDate)}
                    </Text>
                    <Ionicons name="close" size={14} color="#fff" />
                  </Pressable>
                )}
              </DateFilterBar>
              <View style={styles.quickActionsRow}>
                <Pressable
                  style={({ pressed }) => [styles.quickActionButton, { backgroundColor: pressed ? nc.border : nc.backgroundPressed }]}
                  onPress={() => openAddModal("temperature")}
                  accessibilityRole="button"
                  accessibilityLabel="Ajouter une température"
                >
                  <FontAwesome name="temperature-half" size={14} color={Colors[colorScheme].tint} />
                </Pressable>
                <Pressable
                  style={({ pressed }) => [styles.quickActionButton, { backgroundColor: pressed ? nc.border : nc.backgroundPressed }]}
                  onPress={() => openAddModal("vitamine")}
                  accessibilityRole="button"
                  accessibilityLabel="Ajouter une vitamine"
                >
                  <FontAwesome name="pills" size={14} color={Colors[colorScheme].tint} />
                </Pressable>
                <Pressable
                  style={({ pressed }) => [styles.quickActionButton, { backgroundColor: pressed ? nc.border : nc.backgroundPressed }]}
                  onPress={() => openAddModal("vaccin")}
                  accessibilityRole="button"
                  accessibilityLabel="Ajouter un vaccin"
                >
                  <FontAwesome name="syringe" size={14} color={Colors[colorScheme].tint} />
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
                    selectedDayTextColor: "#ffffff",
                    todayTextColor: Colors[colorScheme].tint,
                    dayTextColor: Colors[colorScheme].text,
                    textDisabledColor: Colors[colorScheme].tabIconDefault,
                    dotColor: Colors[colorScheme].tint,
                    selectedDotColor: "#ffffff",
                    arrowColor: Colors[colorScheme].tint,
                    monthTextColor: Colors[colorScheme].text,
                    indicatorColor: Colors[colorScheme].tint,
                  }}
                />
              </View>
            )}
          </View>

          {Object.values(loaded).every(Boolean) && emptyDelayDone ? (
            groupedEvents.length === 0 ? (
              <View style={styles.emptyContainer}>
                <View
                  style={[
                    styles.emptyIconWrapper,
                    { backgroundColor: `${eventColors.temperature.dark}15` },
                  ]}
                >
                  <Ionicons
                    name="medkit-outline"
                    size={36}
                    color={eventColors.temperature.dark}
                  />
                </View>
                <ThemedText style={[styles.emptyTitle, { color: nc.textStrong }]}>
                  {events.length === 0
                    ? "Aucun soin enregistré"
                    : "Aucun soin pour ce filtre"}
                </ThemedText>
                <ThemedText style={[styles.emptySubtitle, { color: nc.textMuted }]}>
                  Suivez les soins et traitements
                </ThemedText>
                {events.length === 0 && (
                  <Pressable
                    style={[styles.emptyCta, { backgroundColor: Colors[colorScheme].tint }]}
                    onPress={() => openAddModal("temperature")}
                    accessibilityRole="button"
                    accessibilityLabel="Enregistrer un soin"
                  >
                    <Ionicons name="add" size={20} color="#fff" />
                    <Text style={styles.emptyCtaText}>Enregistrer un soin</Text>
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
            )
          ) : (
            <SoinsSkeleton colorScheme={colorScheme} />
          )}
        </SafeAreaView>
        {selectionMode && selectedCount > 0 && (
          <View style={styles.batchDeleteBar}>
            <Pressable
              style={styles.batchDeleteButton}
              onPress={handleBatchDelete}
              accessibilityRole="button"
              accessibilityLabel={`Supprimer ${selectedCount} élément${selectedCount > 1 ? "s" : ""}`}
            >
              <Ionicons name="trash-outline" size={18} color="#fff" />
              <Text style={styles.batchDeleteText}>
                Supprimer ({selectedCount})
              </Text>
            </Pressable>
          </View>
        )}
        <ConfirmModal
          visible={deleteConfirm.visible}
          title="Suppression"
          message="Voulez-vous vraiment supprimer ce soin ?"
          confirmText="Supprimer"
          cancelText="Annuler"
          backgroundColor={Colors[colorScheme].background}
          textColor={Colors[colorScheme].text}
          onCancel={cancelDelete}
          onConfirm={confirmDelete}
        />
      </View>
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
    flexGrow: 1,
  },
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
  },
  sessionTime: {
    width: 52,
  },
  sessionTimeText: {
    fontSize: 13,
    fontWeight: "500",
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
  expandTrigger: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    marginTop: 2,
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
  batchDeleteBar: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 16,
    paddingVertical: 12,
    paddingBottom: 32,
    backgroundColor: "rgba(0,0,0,0.02)",
  },
  batchDeleteButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "#ef4444",
    paddingVertical: 14,
    borderRadius: 14,
  },
  batchDeleteText: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "700",
  },
});
