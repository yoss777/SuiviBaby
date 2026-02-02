import { ThemedText } from "@/components/themed-text";
import { DateFilterBar, DateFilterValue } from "@/components/ui/DateFilterBar";
import { IconPulseDots } from "@/components/ui/IconPulseDtos";
import { LoadMoreButton } from "@/components/ui/LoadMoreButton";
import { eventColors } from "@/constants/eventColors";
import { MAX_AUTO_LOAD_ATTEMPTS } from "@/constants/pagination";
import { Colors } from "@/constants/theme";
import { useBaby } from "@/contexts/BabyContext";
import { useSheet } from "@/contexts/SheetContext";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { modifierSommeil } from "@/migration/eventsDoubleWriteService";
import {
  ecouterBainsHybrid,
  ecouterSommeilsHybrid,
  getNextEventDateBeforeHybrid,
  hasMoreEventsBeforeHybrid,
} from "@/migration/eventsHybridService";
import { BainEvent, SommeilEvent } from "@/services/eventsService";
import { Ionicons } from "@expo/vector-icons";
import FontAwesome from "@expo/vector-icons/FontAwesome6";
import { HeaderBackButton } from "@react-navigation/elements";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import { router, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  BackHandler,
  FlatList,
  InteractionManager,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { Calendar, DateData } from "react-native-calendars";
import { SafeAreaView } from "react-native-safe-area-context";
import { useHeaderLeft, useHeaderRight } from "../../_layout";
import {
  RoutineType,
  RoutinesEditData,
  SleepMode,
} from "@/components/forms/RoutinesForm";
import { useModal } from "@/contexts/ModalContext";

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
  const colors = Colors[colorScheme];
  const { openSheet, closeSheet, isOpen } = useSheet();
  const { showAlert } = useModal();
  const navigation = useNavigation();
  const headerOwnerId = useRef(
    `routines-${Math.random().toString(36).slice(2)}`,
  );

  const { openModal, editId, returnTo, type, mode } = useLocalSearchParams();
  const returnTargetParam = Array.isArray(returnTo) ? returnTo[0] : returnTo;
  const sheetOwnerId = "routines";

  const [showCalendar, setShowCalendar] = useState(false);
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

  const openAddModal = useCallback((routineType: RoutineType, sleepMode: SleepMode = "nap") => {
    setPendingEditData(null);
    setPendingRoutineType(routineType);
    setPendingSleepMode(sleepMode);
    setPendingOpen(true);
  }, []);

  const handleAddPress = useCallback(() => {
    openAddModal("sommeil", "nap");
  }, [openAddModal]);

  useFocusEffect(
    useCallback(() => {
      const headerButtons = (
        <View style={styles.headerButtons}>
          <Pressable
            onPress={handleCalendarPress}
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
          <Pressable onPress={handleAddPress} style={styles.headerButton}>
            <Ionicons name="add" size={24} color={Colors[colorScheme].tint} />
          </Pressable>
        </View>
      );
      setHeaderRight(headerButtons, headerOwnerId.current);
      return () => {
        setHeaderRight(null, headerOwnerId.current);
      };
    }, [
      handleCalendarPress,
      handleAddPress,
      showCalendar,
      colorScheme,
      setHeaderRight,
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
          labelVisible={false}
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
  }, [activeChild?.id, daysWindow, rangeEndDate]);

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
        selectedTextColor: "#ffffff",
      };
    }
    if (selectedFilter === "today") {
      const todayKey = formatDateKey(new Date());
      marked[todayKey] = {
        ...marked[todayKey],
        selected: true,
        selectedColor: Colors[colorScheme].tint,
        selectedTextColor: "#ffffff",
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

  const handleDateSelect = (day: DateData) => {
    setSelectedDate(day.dateString);
    setSelectedFilter(null);
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
  }, [events, selectedFilter, selectedDate, showCalendar]);

  const loadMoreStep = useCallback(
    async (auto = false) => {
      if (!hasMore || !activeChild?.id) return;
      setIsLoadingMore(true);
      pendingLoadMoreRef.current = 2;
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
          ["sommeil", "bain"],
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

    const task = InteractionManager.runAfterInteractions(() => {
      stashReturnTo();

      openSheet({
        ownerId: sheetOwnerId,
        formType: "routines",
        routineType: pendingRoutineType,
        sleepMode: pendingSleepMode,
        editData: pendingEditData ?? undefined,
        sommeilEnCours: sommeilEnCours ? { id: sommeilEnCours.id } : null,
        onSuccess: ensureTodayInRange,
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
      });
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
    });
  }, [editId, layoutReady, events, navigation, openEditModal, stashReturnTo]);

  // ============================================
  // STOP ONGOING SLEEP
  // ============================================
  const handleStopSleep = async () => {
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
    } catch (error) {
      console.error("Erreur arrêt sommeil:", error);
      showAlert("Erreur", "Impossible d'arrêter le sommeil.");
    }
  };

  // ============================================
  // RENDER HELPERS
  // ============================================
  const buildDetails = (event: RoutineEvent) => {
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
  };

  const toggleExpand = useCallback((date: string) => {
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

  const renderEventItem = (event: RoutineEvent, isLast = false) => {
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
      <Pressable
        key={event.id}
        style={({ pressed }) => [
          styles.sessionCard,
          pressed && styles.sessionCardPressed,
        ]}
        onPress={() => openEditModal(event)}
      >
        <View style={styles.sessionTime}>
          {isSleep && sleepEnd ? (
            <>
              <Text
                style={[
                  styles.sessionTimeText,
                  isLast && styles.sessionTimeTextLast,
                ]}
              >
                {formatTime(time)}
              </Text>
              <Text style={styles.sessionTimeArrow}>↓</Text>
              <Text style={styles.sessionTimeTextSecondary}>
                {formatTime(sleepEnd)}
              </Text>
            </>
          ) : isSleep && sleepIsOngoing ? (
            <>
              <Text
                style={[
                  styles.sessionTimeText,
                  isLast && styles.sessionTimeTextLast,
                ]}
              >
                {formatTime(time)}
              </Text>
              <Text style={styles.sessionTimeArrow}>↓</Text>
              <Text style={[styles.sessionTimeOngoing, { color: eventColors.sommeil.dark }]}>
                en cours
              </Text>
            </>
          ) : (
            <Text
              style={[
                styles.sessionTimeText,
                isLast && styles.sessionTimeTextLast,
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
            <Text style={styles.sessionType}>
              {isSleep
                ? event.isNap
                  ? "Sieste"
                  : "Nuit de sommeil"
                : config.label}
            </Text>
            {isSleep ? (
              <>
                {(sleepEnd || sleepIsOngoing) && sleepMeta.length > 0 && (
                  <Text style={styles.sessionDetailText}>
                    {sleepMeta.join(" · ")}
                  </Text>
                )}
              </>
            ) : (
              <Text style={styles.sessionDetailText}>
                {buildDetails(event)}
              </Text>
            )}
          </View>
        </View>
        {isSleep && (
          <View style={styles.sessionTotal}>
            <Text style={styles.sessionTotalValue}>
              {formatDuration(sleepDuration)}
            </Text>
          </View>
        )}
        <Ionicons name="chevron-forward" size={18} color="#d1d5db" />
      </Pressable>
    );
  };

  const renderDayGroup = ({ item }: { item: RoutineGroup }) => {
    const [year, month, day] = item.date.split("-").map(Number);
    const date = new Date(year, month - 1, day);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    const dayLabel =
      date.toDateString() === today.toDateString()
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
          <Text style={styles.dayLabel}>{dayLabel}</Text>
          <View style={styles.dayStats}>
            <View style={styles.dayStatItem}>
              <Text style={styles.dayStatValue}>{item.events.length}</Text>
              <Text style={styles.dayStatLabel}>
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
              <Text style={styles.statsBreakdownLabel}>
                Sieste{napCount > 1 ? "s" : ""}
              </Text>
              <Text style={styles.statsBreakdownValue}>{napCount}</Text>
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
              <Text style={styles.statsBreakdownLabel}>
                Nuit{nightCount > 1 ? "s" : ""}
              </Text>
              <Text style={styles.statsBreakdownValue}>{nightCount}</Text>
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
              <Text style={styles.statsBreakdownLabel}>
                Bain{bainCount > 1 ? "s" : ""}
              </Text>
              <Text style={styles.statsBreakdownValue}>{bainCount}</Text>
            </View>
          )}
        </View>
        <View style={styles.dayContent}>
          <View style={styles.sessionsContainer}>
            {renderEventItem(item.lastEvent, true)}
            {item.events.length > 1 &&
              isExpanded &&
              item.events
                .filter((evt) => evt.id !== item.lastEvent.id)
                .map((evt) => renderEventItem(evt, false))}
            {item.events.length > 1 && (
              <Pressable
                style={styles.expandTrigger}
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
      </View>
    );
  };

  // ============================================
  // RENDER
  // ============================================
  return (
    <View style={styles.container}>
      <SafeAreaView
        style={{ flex: 1 }}
        edges={["bottom"]}
        onLayout={() => setLayoutReady(true)}
      >
        <View>
          <View style={styles.filterRow}>
            <DateFilterBar
              selected={selectedFilter}
              onSelect={handleFilterPress}
            />
            <View style={styles.quickActionsRow}>
              <TouchableOpacity
                style={styles.quickActionButton}
                onPress={() => openAddModal("sommeil", "nap")}
              >
                <FontAwesome
                  name="bed"
                  size={14}
                  color={Colors[colorScheme].tint}
                />
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.quickActionButton}
                onPress={() => openAddModal("sommeil", "night")}
              >
                <FontAwesome
                  name="moon"
                  size={14}
                  color={Colors[colorScheme].tint}
                />
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.quickActionButton}
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
            <View style={styles.calendarContainer}>
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

        {sommeilEnCours && (
          <View style={styles.timerCard}>
            <Text style={styles.timerTitle}>
              {sommeilEnCours.isNap ? "Sieste" : "Nuit"} en cours
            </Text>
            <Text style={styles.timerValue}>
              {formatDuration(elapsedMinutes)}
            </Text>
            <Text style={styles.timerSubtitle}>
              Début {formatTime(toDate(sommeilEnCours.heureDebut))}
            </Text>
            <TouchableOpacity
              style={styles.timerButtonStop}
              onPress={handleStopSleep}
            >
              <Text style={styles.timerButtonText}>Terminer</Text>
            </TouchableOpacity>
          </View>
        )}

        {Object.values(loaded).every(Boolean) && emptyDelayDone ? (
          groupedEvents.length === 0 ? (
            <View style={styles.emptyContainer}>
              <Ionicons
                name="calendar-outline"
                size={64}
                color={Colors[colorScheme].tabIconDefault}
              />
              <ThemedText style={styles.emptyText}>
                {events.length === 0
                  ? "Aucune routine enregistrée"
                  : "Aucune routine pour ce filtre"}
              </ThemedText>
              {!(selectedFilter === "today" || selectedDate) && (
                <LoadMoreButton
                  isLoading={isLoadingMore}
                  hasMore={hasMore}
                  onPress={handleLoadMore}
                  color={Colors[colorScheme].tint}
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
                    isLoading={isLoadingMore}
                    hasMore={hasMore}
                    onPress={handleLoadMore}
                    color={Colors[colorScheme].tint}
                  />
                )
              }
            />
          )
        ) : (
          <View style={styles.loadingContainer}>
            <IconPulseDots color={Colors[colorScheme].tint} />
            <Text style={styles.loadingText}>Chargement des routines…</Text>
          </View>
        )}
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f8f9fa",
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
    borderBottomColor: "#e0e0e0",
  },
  timerCard: {
    marginHorizontal: 20,
    marginBottom: 16,
    borderRadius: 18,
    padding: 16,
    backgroundColor: "#f5f0ff",
    gap: 8,
  },
  timerTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#4c2c79",
  },
  timerValue: {
    fontSize: 28,
    fontWeight: "700",
    color: "#4c2c79",
  },
  timerSubtitle: {
    fontSize: 12,
    color: "#6b5c85",
  },
  timerButtonStop: {
    marginTop: 8,
    backgroundColor: "#6f42c1",
    paddingVertical: 10,
    borderRadius: 12,
    alignItems: "center",
  },
  timerButtonText: {
    color: "#fff",
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
    backgroundColor: "#f0f0f0",
  },
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 40,
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
    color: "#111827",
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
    color: "#374151",
  },
  dayStatLabel: {
    fontSize: 11,
    color: "#9ca3af",
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
    color: "#6b7280",
  },
  statsBreakdownValue: {
    fontSize: 12,
    fontWeight: "600",
    color: "#374151",
  },
  dayContent: {
    gap: 10,
  },
  sessionsContainer: {
    backgroundColor: "#ffffff",
    borderRadius: 16,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 1,
  },
  sessionCard: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 14,
    paddingHorizontal: 16,
    gap: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#f3f4f6",
  },
  sessionCardPressed: {
    backgroundColor: "#f9fafb",
  },
  sessionTime: {
    width: 52,
  },
  sessionTimeText: {
    fontSize: 13,
    fontWeight: "500",
    color: "#9ca3af",
  },
  sessionTimeArrow: {
    fontSize: 12,
    color: "#9ca3af",
    lineHeight: 12,
    alignSelf: "flex-start",
  },
  sessionTimeTextSecondary: {
    fontSize: 12,
    fontWeight: "600",
    color: "#9ca3af",
  },
  sessionTimeOngoing: {
    fontSize: 11,
    fontWeight: "700",
  },
  sessionTimeTextLast: {
    color: "#374151",
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
    color: "#111827",
  },
  sessionDetailText: {
    fontSize: 12,
    color: "#6b7280",
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
    color: eventColors.sommeil.dark,
  },
  expandTrigger: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: "#f3f4f6",
  },
  expandTriggerText: {
    fontSize: 13,
    fontWeight: "500",
  },
  loadingContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingTop: 24,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    color: "#6b7280",
  },
  emptyContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyText: {
    fontSize: 18,
    color: "#666",
    marginTop: 16,
    fontWeight: "600",
  },
});
