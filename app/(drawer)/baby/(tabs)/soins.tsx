import { SoinsEditData, SoinsType } from "@/components/forms/SoinsForm";
import { ThemedText } from "@/components/themed-text";
import { ConfirmModal } from "@/components/ui/ConfirmModal";
import { DateFilterBar, DateFilterValue } from "@/components/ui/DateFilterBar";
import { IconPulseDots } from "@/components/ui/IconPulseDtos";
import { LoadMoreButton } from "@/components/ui/LoadMoreButton";
import { eventColors } from "@/constants/eventColors";
import { MAX_AUTO_LOAD_ATTEMPTS } from "@/constants/pagination";
import { getNeutralColors } from "@/constants/dashboardColors";
import { Colors } from "@/constants/theme";
import { useBaby } from "@/contexts/BabyContext";
import { useSheet } from "@/contexts/SheetContext";
import { useToast } from "@/contexts/ToastContext";
import { useColorScheme } from "@/hooks/use-color-scheme";
import {
  supprimerTemperature,
  supprimerMedicament,
  supprimerSymptome,
  supprimerVaccin,
  supprimerVitamine,
} from "@/migration/eventsDoubleWriteService";
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
  BackHandler,
  FlatList,
  InteractionManager,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Calendar, DateData } from "react-native-calendars";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import ReanimatedSwipeable from "react-native-gesture-handler/ReanimatedSwipeable";
import { SafeAreaView } from "react-native-safe-area-context";
import { useHeaderLeft, useHeaderRight } from "../../_layout";

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
  const { showToast } = useToast();
  const navigation = useNavigation();
  const headerOwnerId = useRef(`soins-${Math.random().toString(36).slice(2)}`);

  const { openModal, editId, returnTo, type } = useLocalSearchParams();
  const returnTargetParam = Array.isArray(returnTo) ? returnTo[0] : returnTo;
  const sheetOwnerId = "soins";

  const [showCalendar, setShowCalendar] = useState(false);
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

  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [confirmDeleteType, setConfirmDeleteType] = useState<HealthType | null>(null);

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
    }, [handleCalendarPress, showCalendar, colorScheme, setHeaderRight, openAddModal]),
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
  }, [activeChild?.id, daysWindow, rangeEndDate]);

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
  }, [events, selectedFilter, selectedDate, showCalendar]);

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
    const task = InteractionManager.runAfterInteractions(() => {
      stashReturnTo();
      openSheet({
        ownerId: sheetOwnerId,
        formType: "soins",
        soinsType: pendingSoinsType,
        editData: pendingEditData ?? undefined,
        onSuccess: ensureTodayInRange,
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
    Haptics.selectionAsync();
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

  const handleDeleteRequest = useCallback((event: HealthEvent) => {
    setConfirmDeleteId(event.id);
    setConfirmDeleteType(event.type);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
  }, []);

  const handleDeleteConfirm = useCallback(async () => {
    if (!confirmDeleteId || !confirmDeleteType || !activeChild?.id) return;
    try {
      const supprimerMap: Record<HealthType, (childId: string, id: string) => Promise<void>> = {
        temperature: supprimerTemperature,
        medicament: supprimerMedicament,
        symptome: supprimerSymptome,
        vaccin: supprimerVaccin,
        vitamine: supprimerVitamine,
      };
      await supprimerMap[confirmDeleteType](activeChild.id, confirmDeleteId);
      showToast("Événement supprimé");
    } catch {
      showToast("Erreur lors de la suppression");
    } finally {
      setConfirmDeleteId(null);
      setConfirmDeleteType(null);
    }
  }, [confirmDeleteId, confirmDeleteType, activeChild?.id, showToast]);

  const renderEventItem = useCallback((event: HealthEvent) => {
    const time = toDate(event.date);
    const config = TYPE_CONFIG[event.type];
    return (
      <ReanimatedSwipeable
        key={event.id}
        friction={2}
        rightThreshold={40}
        overshootRight={false}
        renderRightActions={() => <DeleteAction onPress={() => handleDeleteRequest(event)} />}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Modifier cet événement"
          style={({ pressed }) => [
            styles.sessionCard,
            { backgroundColor: pressed ? nc.backgroundPressed : nc.backgroundCard },
            { borderColor: nc.borderLight },
          ]}
          onPress={() => openEditModal(event)}
        >
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
  }, [nc, openEditModal, buildDetails, handleDeleteRequest]);

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
                selected={selectedFilter as any}
                onSelect={handleFilterPress}
              />
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
                <Ionicons name="medkit-outline" size={64} color={nc.textMuted} />
                <ThemedText style={[styles.emptyText, { color: nc.textMuted }]}>
                  {events.length === 0
                    ? "Aucun soin enregistré"
                    : "Aucun soin pour ce filtre"}
                </ThemedText>
                {events.length === 0 && (
                  <Pressable
                    style={[styles.emptyAction, { backgroundColor: Colors[colorScheme].tint }]}
                    onPress={() => openAddModal("temperature")}
                    accessibilityRole="button"
                    accessibilityLabel="Enregistrer un soin"
                  >
                    <Text style={styles.emptyActionText}>Enregistrer un soin</Text>
                  </Pressable>
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
              />
            )
          ) : (
            <View style={styles.emptyContainer}>
              <IconPulseDots color={Colors[colorScheme].tint} />
            </View>
          )}
        </SafeAreaView>
        <ConfirmModal
          visible={confirmDeleteId !== null}
          title="Supprimer cet événement ?"
          message="Cette action est irréversible."
          confirmText="Supprimer"
          backgroundColor={Colors[colorScheme].background}
          textColor={Colors[colorScheme].text}
          confirmButtonColor="#ef4444"
          onConfirm={handleDeleteConfirm}
          onCancel={() => { setConfirmDeleteId(null); setConfirmDeleteType(null); }}
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
    gap: 12,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: "600",
  },
  emptyAction: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 12,
  },
  emptyActionText: {
    color: "#fff",
    fontWeight: "700",
    fontSize: 14,
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
});
