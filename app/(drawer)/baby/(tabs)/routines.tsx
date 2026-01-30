import { ThemedText } from "@/components/themed-text";
import { ConfirmModal } from "@/components/ui/ConfirmModal";
import { DateFilterBar } from "@/components/ui/DateFilterBar";
import { IconPulseDots } from "@/components/ui/IconPulseDtos";
import { LoadMoreButton } from "@/components/ui/LoadMoreButton";
import { eventColors } from "@/constants/eventColors";
import { MAX_AUTO_LOAD_ATTEMPTS } from "@/constants/pagination";
import { Colors } from "@/constants/theme";
import { useBaby } from "@/contexts/BabyContext";
import { useModal } from "@/contexts/ModalContext";
import { useSheet } from "@/contexts/SheetContext";
import { useColorScheme } from "@/hooks/use-color-scheme";
import {
  ajouterBain,
  ajouterSommeil,
  modifierBain,
  modifierSommeil,
  supprimerBain,
  supprimerSommeil,
} from "@/migration/eventsDoubleWriteService";
import {
  ecouterBainsHybrid,
  ecouterSommeilsHybrid,
  getNextEventDateBeforeHybrid,
  hasMoreEventsBeforeHybrid,
} from "@/migration/eventsHybridService";
import { BainEvent, SommeilEvent } from "@/services/eventsService";
import { Ionicons } from "@expo/vector-icons";
import FontAwesome5 from "@expo/vector-icons/FontAwesome5";
import FontAwesome from "@expo/vector-icons/FontAwesome6";
import DateTimePicker from "@react-native-community/datetimepicker";
import { HeaderBackButton } from "@react-navigation/elements";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import { router, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  BackHandler,
  FlatList,
  InteractionManager,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { Calendar, DateData } from "react-native-calendars";
import { SafeAreaView } from "react-native-safe-area-context";
import { useHeaderLeft, useHeaderRight } from "../../_layout";

// ============================================
// TYPES
// ============================================

type RoutineType = "sommeil" | "bain";

type FilterType = "today" | "past";

type RoutineEvent = (SommeilEvent | BainEvent) & { id: string };

type RoutineGroup = {
  date: string;
  events: RoutineEvent[];
  counts: Record<RoutineType, number>;
  lastEvent: RoutineEvent;
};

const LOCATION_OPTIONS: SommeilEvent["location"][] = [
  "lit",
  "cododo",
  "poussette",
  "voiture",
  "autre",
];
const QUALITY_OPTIONS: SommeilEvent["quality"][] = [
  "paisible",
  "agité",
  "mauvais",
];

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

const formatDateLabel = (date: Date) =>
  `${date.toLocaleDateString("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
  })} ${date.getFullYear()}`;

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
  const { openSheet, closeSheet, viewProps, isOpen } = useSheet();
  const { showAlert } = useModal();
  const navigation = useNavigation();
  const headerOwnerId = useRef(
    `routines-${Math.random().toString(36).slice(2)}`,
  );

  const { openModal, editId, returnTo, type, mode } = useLocalSearchParams();
  const returnTargetParam = Array.isArray(returnTo) ? returnTo[0] : returnTo;
  const sheetOwnerId = "routines";
  const isSheetActive = viewProps?.ownerId === sheetOwnerId;

  const [showCalendar, setShowCalendar] = useState(false);
  const [selectedFilter, setSelectedFilter] = useState<FilterType | null>(null);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [layoutReady, setLayoutReady] = useState(false);
  const [pendingOpen, setPendingOpen] = useState(false);
  const [pendingMode, setPendingMode] = useState<"add" | "edit" | null>(null);

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

  const [editingBain, setEditingBain] = useState<
    (BainEvent & { id: string }) | null
  >(null);
  const [editingSommeil, setEditingSommeil] = useState<
    (SommeilEvent & { id: string }) | null
  >(null);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [sheetType, setSheetType] = useState<"nap" | "night" | "bain">("nap");
  const [dateHeure, setDateHeure] = useState<Date>(new Date());
  const [showDate, setShowDate] = useState(false);
  const [showTime, setShowTime] = useState(false);

  const [dureeBain, setDureeBain] = useState(10);
  const [temperatureEau, setTemperatureEau] = useState(37);
  const [produits, setProduits] = useState("");
  const [noteBain, setNoteBain] = useState("");

  const [heureDebut, setHeureDebut] = useState<Date>(new Date());
  const [heureFin, setHeureFin] = useState<Date | null>(null);
  const [isOngoing, setIsOngoing] = useState(false);
  const [isNap, setIsNap] = useState(true);
  const [location, setLocation] = useState<SommeilEvent["location"]>();
  const [quality, setQuality] = useState<SommeilEvent["quality"]>();
  const [noteSommeil, setNoteSommeil] = useState("");

  const [showDateStart, setShowDateStart] = useState(false);
  const [showTimeStart, setShowTimeStart] = useState(false);
  const [showDateEnd, setShowDateEnd] = useState(false);
  const [showTimeEnd, setShowTimeEnd] = useState(false);

  const [now, setNow] = useState(new Date());

  const editIdRef = useRef<string | null>(null);
  const returnToRef = useRef<string | null>(null);
  const pendingTypeRef = useRef<RoutineType | null>(null);
  const pendingSleepModeRef = useRef<"nap" | "night" | null>(null);

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

  const handleAddPress = useCallback(() => {
    pendingTypeRef.current = "sommeil";
    pendingSleepModeRef.current = "nap";
    setPendingMode("add");
    setPendingOpen(true);
  }, []);

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

  const handleFilterPress = (filter: FilterType) => {
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
  const resetBainForm = useCallback(() => {
    setDateHeure(new Date());
    setDureeBain(10);
    setTemperatureEau(37);
    setProduits("");
    setNoteBain("");
    setEditingBain(null);
  }, []);

  const resetSleepForm = useCallback((preset?: "nap" | "night") => {
    setHeureDebut(new Date());
    setHeureFin(null);
    setIsOngoing(false);
    const napMode = preset !== "night";
    setIsNap(napMode);
    setLocation(undefined);
    setQuality(undefined);
    setNoteSommeil("");
    setEditingSommeil(null);
  }, []);

  const openEditModal = useCallback((item: RoutineEvent) => {
    if (item.type === "sommeil") {
      const debut = item.heureDebut
        ? toDate(item.heureDebut)
        : toDate(item.date);
      const fin = item.heureFin ? toDate(item.heureFin) : null;
      setHeureDebut(debut);
      setHeureFin(fin);
      setIsOngoing(!fin);
      setIsNap(item.isNap ?? true);
      setLocation(item.location);
      setQuality(item.quality);
      setNoteSommeil(item.note ?? "");
      setEditingSommeil(item as any);
      setEditingBain(null);
      setSheetType(item.isNap ? "nap" : "night");
      setIsSubmitting(false);
      setPendingMode("edit");
      setPendingOpen(true);
      return;
    }
    setEditingBain(item as any);
    setEditingSommeil(null);
    setSheetType("bain");
    setDateHeure(toDate(item.date));
    setDureeBain((item as any).duree ?? 10);
    setTemperatureEau((item as any).temperatureEau ?? 37);
    setProduits((item as any).produits ?? "");
    setNoteBain(item.note ?? "");
    setIsSubmitting(false);

    setPendingMode("edit");
    setPendingOpen(true);
  }, []);

  function buildSheetProps() {
    const returnTarget = returnTargetParam ?? returnToRef.current;
    const isBainSheet = !!editingBain || sheetType === "bain";
    return {
      ownerId: sheetOwnerId,
      title: editingBain
        ? "Modifier le bain"
        : editingSommeil
          ? "Modifier le sommeil"
          : isBainSheet
            ? "Nouveau bain"
            : "Nouveau sommeil",
      icon: isBainSheet ? "bath" : "bed",
      accentColor: isBainSheet
        ? eventColors.bain.dark
        : eventColors.sommeil.dark,
      isEditing: !!editingBain || !!editingSommeil,
      isSubmitting,
      onSubmit: handleSubmit,
      onDelete:
        editingBain || editingSommeil
          ? () => setShowDeleteModal(true)
          : undefined,
      children: renderSheetContent(),
      onDismiss: () => {
        setIsSubmitting(false);
        setEditingBain(null);
        setEditingSommeil(null);
        editIdRef.current = null;
        maybeReturnTo(returnTarget);
      },
    };
  }

  useEffect(() => {
    if (!isSheetActive) return;
    openSheet(buildSheetProps());
  }, [
    isSheetActive,
    openSheet,
    dateHeure,
    dureeBain,
    temperatureEau,
    produits,
    noteBain,
    showDate,
    showTime,
    heureDebut,
    heureFin,
    isOngoing,
    isNap,
    location,
    quality,
    noteSommeil,
    showDateStart,
    showTimeStart,
    showDateEnd,
    showTimeEnd,
    editingSommeil,
    editingBain,
    sheetType,
  ]);

  useFocusEffect(
    useCallback(() => {
      if (openModal !== "true") return;
      const normalizedType = normalizeParam(type);
      const normalizedMode = normalizeParam(mode);
      pendingTypeRef.current =
        normalizedType && ["bain", "sommeil"].includes(normalizedType)
          ? (normalizedType as RoutineType)
          : null;
      if (normalizedType === "sommeil") {
        pendingSleepModeRef.current =
          normalizedMode === "night" ? "night" : "nap";
      } else {
        pendingSleepModeRef.current = null;
      }
      setPendingMode("add");
      setPendingOpen(true);
    }, [openModal, type, mode]),
  );

  useEffect(() => {
    if (!pendingOpen || !layoutReady) return;
    const task = InteractionManager.runAfterInteractions(() => {
      stashReturnTo();
      const pendingType = pendingTypeRef.current;
      if (pendingMode !== "edit") {
        if (pendingType === "bain") {
          resetBainForm();
          setSheetType("bain");
          pendingSleepModeRef.current = null;
        } else {
          const preset =
            pendingSleepModeRef.current ??
            (normalizeParam(mode) === "night" ? "night" : "nap");
          resetSleepForm(preset);
          setSheetType(preset);
        }
      }
      openSheet(buildSheetProps());
      navigation.setParams({
        openModal: undefined,
        editId: undefined,
        type: undefined,
        mode: undefined,
      });
      setPendingOpen(false);
      setPendingMode(null);
      pendingTypeRef.current = null;
      pendingSleepModeRef.current = null;
    });
    return () => task.cancel?.();
  }, [
    pendingOpen,
    layoutReady,
    pendingMode,
    navigation,
    resetBainForm,
    resetSleepForm,
    stashReturnTo,
    openSheet,
    mode,
    returnTargetParam,
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
  // SUBMIT / DELETE
  // ============================================
  const handleSubmit = async () => {
    if (!activeChild?.id || isSubmitting) return;
    try {
      setIsSubmitting(true);
      if (sheetType === "bain" || editingBain) {
        const data = {
          date: dateHeure,
          note: noteBain.trim() ? noteBain.trim() : undefined,
          duree: dureeBain || undefined,
          temperatureEau: temperatureEau || undefined,
          produits: produits.trim() ? produits.trim() : undefined,
        };

        if (editingBain) {
          await modifierBain(activeChild.id, editingBain.id, data);
        } else {
          await ajouterBain(activeChild.id, data);
        }
      } else {
        if (!isOngoing && heureFin && heureFin.getTime() < heureDebut.getTime()) {
          showAlert(
            "Attention",
            "La date de fin ne peut pas être antérieure à la date de début.",
          );
          setIsSubmitting(false);
          return;
        }
        // Empêcher de créer un sommeil en cours si un autre est déjà en cours
        if (isOngoing && !editingSommeil && sommeilEnCours) {
          showAlert(
            "Attention",
            "Un sommeil est déjà en cours. Terminez-le avant d'en commencer un nouveau.",
          );
          setIsSubmitting(false);
          return;
        }
        const fin = isOngoing ? null : (heureFin ?? undefined);
        const start = heureDebut;
        const dataToSave = {
          heureDebut: start,
          heureFin: fin,
          duree:
            start && fin
              ? Math.max(
                  0,
                  Math.round((fin.getTime() - start.getTime()) / 60000),
                )
              : undefined,
          location,
          quality,
          isNap,
          date: start,
          note: noteSommeil.trim() ? noteSommeil.trim() : undefined,
        };

        if (editingSommeil) {
          await modifierSommeil(activeChild.id, editingSommeil.id, dataToSave);
        } else {
          await ajouterSommeil(activeChild.id, dataToSave);
        }
      }

      closeSheet();
    } catch (error) {
      console.error("Erreur lors de la sauvegarde:", error);
      showAlert("Erreur", "Impossible de sauvegarder.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const confirmDelete = async () => {
    if ((!editingBain && !editingSommeil) || !activeChild?.id || isSubmitting)
      return;
    try {
      setIsSubmitting(true);
      if (editingBain) {
        await supprimerBain(activeChild.id, editingBain.id);
      } else if (editingSommeil) {
        await supprimerSommeil(activeChild.id, editingSommeil.id);
      }
      closeSheet();
    } catch (error) {
      console.error("Erreur suppression:", error);
      showAlert("Erreur", "Impossible de supprimer.");
    } finally {
      setIsSubmitting(false);
      setShowDeleteModal(false);
    }
  };

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

  const renderSheetContent = () => {
    const isEditingBain = !!editingBain;
    const isEditingSommeil = !!editingSommeil;

    const handleSelectType = (next: "nap" | "night" | "bain") => {
      if (isEditingBain && next !== "bain") return;
      if (isEditingSommeil && next === "bain") return;
      if (next === "bain") {
        if (sheetType !== "bain") {
          resetBainForm();
        }
        setSheetType("bain");
        setEditingSommeil(null);
        return;
      }
      if (sheetType === "bain") {
        resetSleepForm(next === "night" ? "night" : "nap");
      }
      setSheetType(next);
      setIsNap(next === "nap");
      setEditingBain(null);
    };

    const renderTypePicker = () => (
      <View style={styles.typeRow}>
        {[
          { key: "nap", label: "Sieste" },
          { key: "night", label: "Nuit" },
          { key: "bain", label: "Bain" },
        ].map((item) => {
          const active = sheetType === item.key;
          const isDisabled = isEditingBain
            ? item.key !== "bain"
            : isEditingSommeil
              ? item.key === "bain"
              : false;
          return (
            <TouchableOpacity
              key={item.key}
              style={[
                styles.typeChip,
                active && styles.typeChipActive,
                isDisabled && styles.typeChipDisabled,
              ]}
              disabled={isDisabled}
              activeOpacity={1}
              onPress={() => handleSelectType(item.key as any)}
            >
              <Text
                style={[
                  styles.typeChipText,
                  active && styles.typeChipTextActive,
                ]}
              >
                {item.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    );

    if (sheetType !== "bain") {
      return (
        <View style={styles.sheetContent}>
          {renderTypePicker()}

          <View style={styles.chipSection}>
            <Text style={styles.chipLabel}>Lieu</Text>
            <View style={styles.chipRow}>
              {LOCATION_OPTIONS.map((option) => (
                <TouchableOpacity
                  key={option}
                  style={[
                    styles.chip,
                    location === option && styles.chipActive,
                  ]}
                  onPress={() => setLocation(option)}
                >
                  <Text
                    style={[
                      styles.chipText,
                      location === option && styles.chipTextActive,
                    ]}
                  >
                    {option}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          <View style={styles.chipSection}>
            <Text style={styles.chipLabel}>Qualité</Text>
            <View style={styles.chipRow}>
              {QUALITY_OPTIONS.map((option) => (
                <TouchableOpacity
                  key={option}
                  style={[styles.chip, quality === option && styles.chipActive]}
                  onPress={() => setQuality(option)}
                >
                  <Text
                    style={[
                      styles.chipText,
                      quality === option && styles.chipTextActive,
                    ]}
                  >
                    {option}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>Note</Text>
            <TextInput
              value={noteSommeil}
              onChangeText={setNoteSommeil}
              placeholder="Ajouter une note"
              style={styles.input}
            />
          </View>

          <View style={styles.rowBetween}>
            <TouchableOpacity
              style={styles.dateButton}
              onPress={() => setShowDateStart(true)}
            >
              <FontAwesome5
                name="calendar-alt"
                size={16}
                color={Colors[colorScheme].tint}
              />
              <Text style={styles.dateButtonText}>Date début</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.dateButton}
              onPress={() => setShowTimeStart(true)}
            >
              <FontAwesome5
                name="clock"
                size={16}
                color={Colors[colorScheme].tint}
              />
              <Text style={styles.dateButtonText}>Heure début</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.rowBetween}>
            <TouchableOpacity
              style={[styles.dateButton, isOngoing && styles.dateButtonDisabled]}
              onPress={() => {
                if (!isOngoing) {
                  setHeureFin((prev) => prev ?? new Date());
                  setShowDateEnd(true);
                }
              }}
            >
              <FontAwesome5
                name="calendar-alt"
                size={16}
                color={Colors[colorScheme].tint}
              />
              <Text style={styles.dateButtonText}>Date fin</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.dateButton, isOngoing && styles.dateButtonDisabled]}
              onPress={() => {
                if (!isOngoing) {
                  setHeureFin((prev) => prev ?? new Date());
                  setShowTimeEnd(true);
                }
              }}
            >
              <FontAwesome5
                name="clock"
                size={16}
                color={Colors[colorScheme].tint}
              />
              <Text style={styles.dateButtonText}>Heure fin</Text>
            </TouchableOpacity>
          </View>

          <TouchableOpacity
            style={styles.checkboxRow}
            onPress={() => setIsOngoing((prev) => !prev)}
          >
            <View
              style={[styles.checkbox, isOngoing && styles.checkboxChecked]}
            >
              {isOngoing && <FontAwesome name="check" size={12} color="#fff" />}
            </View>
            <Text style={styles.checkboxLabel}>Sommeil en cours</Text>
          </TouchableOpacity>

          <View style={styles.sleepSelectedDateTime}>
            <Text style={styles.sleepSelectedDate}>
              {formatDateLabel(heureDebut)}
            </Text>
            <Text style={styles.sleepSelectedTime}>
              {formatTime(heureDebut)}
            </Text>
            {!isOngoing && heureFin && (
              <>
                {formatDateLabel(heureFin) !== formatDateLabel(heureDebut) && (
                  <Text style={styles.sleepSelectedDate}>
                    {formatDateLabel(heureFin)}
                  </Text>
                )}
                <Text style={styles.sleepSelectedTime}>
                  → {formatTime(heureFin)}
                </Text>
              </>
            )}
          </View>

          {showDateStart && (
            <DateTimePicker
              value={heureDebut}
              mode="date"
              display={Platform.OS === "ios" ? "spinner" : "default"}
              onChange={(_, date) => {
                setShowDateStart(false);
                if (date) {
                  setHeureDebut((prev) => {
                    const next = new Date(prev);
                    next.setFullYear(
                      date.getFullYear(),
                      date.getMonth(),
                      date.getDate(),
                    );
                    return next;
                  });
                }
              }}
            />
          )}
          {showTimeStart && (
            <DateTimePicker
              value={heureDebut}
              mode="time"
              is24Hour
              display={Platform.OS === "ios" ? "spinner" : "default"}
              onChange={(_, date) => {
                setShowTimeStart(false);
                if (date) {
                  setHeureDebut((prev) => {
                    const next = new Date(prev);
                    next.setHours(date.getHours(), date.getMinutes(), 0, 0);
                    return next;
                  });
                }
              }}
            />
          )}
          {showDateEnd && heureFin && (
            <DateTimePicker
              value={heureFin}
              mode="date"
              display={Platform.OS === "ios" ? "spinner" : "default"}
              onChange={(_, date) => {
                setShowDateEnd(false);
                if (date) {
                  setHeureFin((prev) => {
                    const base = prev ?? new Date();
                    const next = new Date(base);
                    next.setFullYear(
                      date.getFullYear(),
                      date.getMonth(),
                      date.getDate(),
                    );
                    return next;
                  });
                }
              }}
            />
          )}
          {showTimeEnd && heureFin && (
            <DateTimePicker
              value={heureFin}
              mode="time"
              is24Hour
              display={Platform.OS === "ios" ? "spinner" : "default"}
              onChange={(_, date) => {
                setShowTimeEnd(false);
                if (date) {
                  setHeureFin((prev) => {
                    const base = prev ?? new Date();
                    const next = new Date(base);
                    next.setHours(date.getHours(), date.getMinutes(), 0, 0);
                    return next;
                  });
                }
              }}
            />
          )}
        </View>
      );
    }

    return (
      <View style={styles.sheetContent}>
        {renderTypePicker()}

        <View style={styles.inputGroup}>
          <Text style={styles.inputLabel}>Durée (minutes)</Text>
          <View style={styles.quantityPickerRow}>
            <TouchableOpacity
              style={[
                styles.quantityButton,
                isSubmitting && styles.quantityButtonDisabled,
              ]}
              onPress={() => setDureeBain((value) => Math.max(0, value - 5))}
              disabled={isSubmitting}
            >
              <Text
                style={[
                  styles.quantityButtonText,
                  isSubmitting && styles.quantityButtonTextDisabled,
                ]}
              >
                -
              </Text>
            </TouchableOpacity>
            <Text style={styles.quantityPickerValue}>{dureeBain} min</Text>
            <TouchableOpacity
              style={[
                styles.quantityButton,
                isSubmitting && styles.quantityButtonDisabled,
              ]}
              onPress={() => setDureeBain((value) => value + 5)}
              disabled={isSubmitting}
            >
              <Text
                style={[
                  styles.quantityButtonText,
                  isSubmitting && styles.quantityButtonTextDisabled,
                ]}
              >
                +
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.inputGroup}>
          <Text style={styles.inputLabel}>Température de l'eau (°C)</Text>
          <View style={styles.quantityPickerRow}>
            <TouchableOpacity
              style={[
                styles.quantityButton,
                isSubmitting && styles.quantityButtonDisabled,
              ]}
              onPress={() =>
                setTemperatureEau((value) => Math.max(20, value - 1))
              }
              disabled={isSubmitting}
            >
              <Text
                style={[
                  styles.quantityButtonText,
                  isSubmitting && styles.quantityButtonTextDisabled,
                ]}
              >
                -
              </Text>
            </TouchableOpacity>
            <Text style={styles.quantityPickerValue}>{temperatureEau}°C</Text>
            <TouchableOpacity
              style={[
                styles.quantityButton,
                isSubmitting && styles.quantityButtonDisabled,
              ]}
              onPress={() =>
                setTemperatureEau((value) => Math.min(45, value + 1))
              }
              disabled={isSubmitting}
            >
              <Text
                style={[
                  styles.quantityButtonText,
                  isSubmitting && styles.quantityButtonTextDisabled,
                ]}
              >
                +
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.inputGroup}>
          <Text style={styles.inputLabel}>Produits</Text>
          <TextInput
            value={produits}
            onChangeText={setProduits}
            placeholder="Gel lavant, huile..."
            style={styles.input}
          />
        </View>

        <View style={styles.inputGroup}>
          <Text style={styles.inputLabel}>Note</Text>
          <TextInput
            value={noteBain}
            onChangeText={setNoteBain}
            placeholder="Ajouter une note"
            style={styles.input}
          />
        </View>

        <View style={styles.dateTimeContainerWithPadding}>
          <TouchableOpacity
            style={styles.dateButton}
            onPress={() => setShowDate(true)}
          >
            <FontAwesome5
              name="calendar-alt"
              size={16}
              color={Colors[colorScheme].tint}
            />
            <Text style={styles.dateButtonText}>Date</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.dateButton}
            onPress={() => setShowTime(true)}
          >
            <FontAwesome5
              name="clock"
              size={16}
              color={Colors[colorScheme].tint}
            />
            <Text style={styles.dateButtonText}>Heure</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.selectedDateTime}>
          <Text style={styles.selectedDate}>
            {dateHeure.toLocaleDateString("fr-FR", {
              weekday: "long",
              year: "numeric",
              month: "long",
              day: "numeric",
            })}
          </Text>
          <Text style={styles.selectedTime}>
            {dateHeure.toLocaleTimeString("fr-FR", {
              hour: "2-digit",
              minute: "2-digit",
            })}
          </Text>
        </View>

        {showDate && (
          <DateTimePicker
            value={dateHeure}
            mode="date"
            display={Platform.OS === "ios" ? "spinner" : "default"}
            onChange={(_, date) => {
              setShowDate(false);
              if (date) {
                setDateHeure((prev) => {
                  const next = new Date(prev);
                  next.setFullYear(
                    date.getFullYear(),
                    date.getMonth(),
                    date.getDate(),
                  );
                  return next;
                });
              }
            }}
          />
        )}
        {showTime && (
          <DateTimePicker
            value={dateHeure}
            mode="time"
            is24Hour
            display={Platform.OS === "ios" ? "spinner" : "default"}
            onChange={(_, date) => {
              setShowTime(false);
              if (date) {
                setDateHeure((prev) => {
                  const next = new Date(prev);
                  next.setHours(date.getHours(), date.getMinutes(), 0, 0);
                  return next;
                });
              }
            }}
          />
        )}
      </View>
    );
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
          // isLast && [
          //   styles.sessionCardLast,
          //   {
          //     backgroundColor:
          //       (event.type === "sommeil"
          //         ? eventColors.sommeil.light
          //         : eventColors.bain.light) + "40",
          //   },
          // ],
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
    const sommeilCount = item.counts.sommeil;
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
                onPress={() => {
                  pendingTypeRef.current = "sommeil";
                  pendingSleepModeRef.current = "nap";
                  setPendingMode("add");
                  setPendingOpen(true);
                }}
              >
                <FontAwesome
                  name="bed"
                  size={14}
                  color={Colors[colorScheme].tint}
                />
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.quickActionButton}
                onPress={() => {
                  pendingTypeRef.current = "sommeil";
                  pendingSleepModeRef.current = "night";
                  setPendingMode("add");
                  setPendingOpen(true);
                }}
              >
                <FontAwesome
                  name="moon"
                  size={14}
                  color={Colors[colorScheme].tint}
                />
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.quickActionButton}
                onPress={() => {
                  pendingTypeRef.current = "bain";
                  pendingSleepModeRef.current = null;
                  setPendingMode("add");
                  setPendingOpen(true);
                }}
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
              <IconPulseDots color={Colors[colorScheme].tint} />
              <ThemedText style={styles.emptyText}>
                {events.length === 0
                  ? "Aucune routine enregistrée"
                  : "Aucune routine pour ce filtre"}
              </ThemedText>
            </View>
          ) : (
            <FlatList
              data={groupedEvents}
              keyExtractor={(item) => item.date}
              renderItem={renderDayGroup}
              showsVerticalScrollIndicator={false}
              contentContainerStyle={styles.listContent}
              ListFooterComponent={
                <LoadMoreButton
                  isLoading={isLoadingMore}
                  hasMore={hasMore}
                  onPress={handleLoadMore}
                  color={Colors[colorScheme].tint}
                />
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

      <ConfirmModal
        visible={showDeleteModal}
        title="Supprimer"
        message={
          editingSommeil
            ? "Cette entrée de sommeil sera supprimée définitivement."
            : "Cette entrée de bain sera supprimée définitivement."
        }
        confirmText="Supprimer"
        cancelText="Annuler"
        backgroundColor={Colors[colorScheme].background}
        textColor={Colors[colorScheme].text}
        confirmButtonColor="#dc3545"
        confirmTextColor="#fff"
        cancelButtonColor="#f1f3f5"
        cancelTextColor="#1f2937"
        onConfirm={confirmDelete}
        onCancel={() => setShowDeleteModal(false)}
      />
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
  typeRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    paddingBottom: 8,
  },
  typeChip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: "#f9fafb",
  },
  typeChipActive: {
    backgroundColor: "#fff",
    borderColor: "#6f42c1",
  },
  typeChipText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#6b7280",
  },
  typeChipTextActive: {
    color: "#4c2c79",
    fontWeight: "700",
  },
  typeChipDisabled: {
    opacity: 0.5,
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
  sessionCardLast: {
    backgroundColor: "#f8f9fa",
    borderBottomWidth: 0,
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
  sessionDetailMuted: {
    fontSize: 12,
    color: "#9ca3af",
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
  sheetContent: {
    gap: 12,
  },
  inputGroup: {
    gap: 6,
  },
  inputLabel: {
    fontSize: 12,
    fontWeight: "700",
    color: "#6b7280",
  },
  input: {
    borderWidth: 1,
    borderColor: "#e5e7eb",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  quantityPickerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 16,
    marginBottom: 8,
  },
  quantityButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#f0f0f0",
    alignItems: "center",
    justifyContent: "center",
  },
  quantityButtonDisabled: {
    opacity: 0.6,
  },
  quantityButtonText: {
    fontSize: 18,
    fontWeight: "700",
    color: "#333",
  },
  quantityButtonTextDisabled: {
    color: "#999",
  },
  quantityPickerValue: {
    fontSize: 16,
    fontWeight: "600",
    color: "#333",
  },
  dateTimeContainerWithPadding: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 12,
    marginBottom: 10,
    paddingTop: 20,
  },
  dateButton: {
    flex: 1,
    flexDirection: "row",
    gap: 8,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#d7dbe0",
    backgroundColor: "#f5f6f8",
  },
  rowBetween: {
    flexDirection: "row",
    gap: 12,
  },
  dateButtonDisabled: {
    opacity: 0.5,
  },
  checkboxRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  checkbox: {
    width: 18,
    height: 18,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: "#d1d5db",
    alignItems: "center",
    justifyContent: "center",
  },
  checkboxChecked: {
    backgroundColor: "#6f42c1",
    borderColor: "#6f42c1",
  },
  checkboxLabel: {
    fontSize: 12,
    color: "#6b7280",
    fontWeight: "600",
  },
  chipSection: {
    gap: 8,
  },
  chipLabel: {
    fontSize: 12,
    fontWeight: "700",
    color: "#6b7280",
  },
  chipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  chip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: "#f9fafb",
  },
  chipActive: {
    borderColor: "#6f42c1",
    backgroundColor: "#ede7f6",
  },
  chipText: {
    fontSize: 12,
    color: "#6b7280",
    fontWeight: "600",
  },
  chipTextActive: {
    color: "#4c2c79",
  },
  dateButtonText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#4a4f55",
  },
  selectedDateTime: {
    alignItems: "center",
    marginBottom: 16,
  },
  sleepSelectedDateTime: {
    alignItems: "center",
    marginBottom: 16,
  },
  selectedDate: {
    fontSize: 16,
    color: "#333",
    fontWeight: "600",
    marginBottom: 4,
  },
  sleepSelectedDate: {
    fontSize: 16,
    color: "#333",
    fontWeight: "600",
    marginBottom: 4,
    textTransform: "capitalize",
  },
  selectedTime: {
    fontSize: 20,
    color: "#374151",
    fontWeight: "600",
  },
  sleepSelectedTime: {
    fontSize: 20,
    color: "#374151",
    fontWeight: "600",
  },
});
