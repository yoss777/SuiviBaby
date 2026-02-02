import { ActivitiesEditData, ActiviteType } from "@/components/forms/ActivitiesForm";
import { ThemedText } from "@/components/themed-text";
import { DateFilterBar } from "@/components/ui/DateFilterBar";
import { IconPulseDots } from "@/components/ui/IconPulseDtos";
import { LoadMoreButton } from "@/components/ui/LoadMoreButton";
import { eventColors } from "@/constants/eventColors";
import { MAX_AUTO_LOAD_ATTEMPTS } from "@/constants/pagination";
import { Colors } from "@/constants/theme";
import { useBaby } from "@/contexts/BabyContext";
import { useSheet } from "@/contexts/SheetContext";
import { useColorScheme } from "@/hooks/use-color-scheme";
import {
  ecouterActivitesHybrid,
  getNextEventDateBeforeHybrid,
  hasMoreEventsBeforeHybrid,
} from "@/migration/eventsHybridService";
import { ActiviteEvent } from "@/services/eventsService";
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

// ============================================
// COMPONENT
// ============================================

export default function ActivitiesScreen() {
  const { activeChild } = useBaby();
  const { setHeaderRight } = useHeaderRight();
  const { setHeaderLeft } = useHeaderLeft();
  const colorScheme = useColorScheme() ?? "light";
  const { openSheet, closeSheet, isOpen } = useSheet();
  const navigation = useNavigation();
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
  const loadMoreVersionRef = useRef(0);
  const pendingLoadMoreRef = useRef(0);

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
          <Pressable onPress={() => openAddModal("tummyTime")} style={styles.headerButton}>
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
      openAddModal,
      showCalendar,
      colorScheme,
      setHeaderRight,
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
    const versionAtSubscribe = loadMoreVersionRef.current;
    const endOfRange = rangeEndDate ? new Date(rangeEndDate) : new Date();
    endOfRange.setHours(23, 59, 59, 999);
    const startOfRange = new Date(endOfRange);
    startOfRange.setHours(0, 0, 0, 0);
    startOfRange.setDate(startOfRange.getDate() - (daysWindow - 1));

    const unsubscribe = ecouterActivitesHybrid(
      activeChild.id,
      (data) => {
        setEvents(data as ActivityEventWithId[]);
        setLoaded({ activites: true });

        if (
          pendingLoadMoreRef.current > 0 &&
          versionAtSubscribe === loadMoreVersionRef.current
        ) {
          pendingLoadMoreRef.current = 0;
          setIsLoadingMore(false);
        }
      },
      { waitForServer: true, depuis: startOfRange, jusqu: endOfRange },
    );

    return () => {
      unsubscribe();
    };
  }, [activeChild?.id, daysWindow, rangeEndDate]);

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
        selectedTextColor: "#ffffff",
      };
    }
    if (selectedFilter === "today" && !selectedDate) {
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
  }, [events, selectedFilter, selectedDate, showCalendar]);

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
    const task = InteractionManager.runAfterInteractions(() => {
      stashReturnTo();
      openSheet({
        ownerId: sheetOwnerId,
        formType: "activities",
        activiteType: pendingActiviteType,
        editData: pendingEditData ?? undefined,
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
  const buildDetails = (event: ActivityEventWithId) => {
    const parts = [
      event.duree ? formatDuration(event.duree) : null,
      event.description,
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

  const renderEventItem = (event: ActivityEventWithId, isLast = false) => {
    const time = toDate(event.date);
    const config = TYPE_CONFIG[event.typeActivite as ActiviteType];
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
          <Text
            style={[
              styles.sessionTimeText,
              isLast && styles.sessionTimeTextLast,
            ]}
          >
            {formatTime(time)}
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
            <Text style={styles.sessionType}>{config.label}</Text>
            {buildDetails(event) && (
              <Text style={styles.sessionDetailText}>
                {buildDetails(event)}
              </Text>
            )}
          </View>
        </View>
        <Ionicons name="chevron-forward" size={18} color="#d1d5db" />
      </Pressable>
    );
  };

  const renderDayGroup = ({ item }: { item: ActivityGroup }) => {
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

    return (
      <View style={styles.dayGroup}>
        <View style={styles.dayHeader}>
          <Text style={styles.dayLabel}>{dayLabel}</Text>
          <View style={styles.dayStats}>
            <View style={styles.dayStatItem}>
              <Text style={styles.dayStatValue}>{item.events.length}</Text>
              <Text style={styles.dayStatLabel}>
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
                <Text style={styles.statsBreakdownLabel}>{config.label}</Text>
                <Text style={styles.statsBreakdownValue}>{count}</Text>
              </View>
            );
          })}
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
                onPress={() => openAddModal("tummyTime")}
              >
                <FontAwesome
                  name="baby"
                  size={14}
                  color={Colors[colorScheme].tint}
                />
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.quickActionButton}
                onPress={() => openAddModal("jeux")}
              >
                <FontAwesome
                  name="puzzle-piece"
                  size={14}
                  color={Colors[colorScheme].tint}
                />
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.quickActionButton}
                onPress={() => openAddModal("promenade")}
              >
                <FontAwesome
                  name="person-walking"
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
                  ? "Aucune activité enregistrée"
                  : "Aucune activité pour ce filtre"}
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
                  hasMore={hasMore}
                  loading={isLoadingMore}
                  onPress={handleLoadMore}
                  text="Voir plus"
                  accentColor={Colors[colorScheme].tint}
                />
              }
            />
          )
        ) : (
          <View style={styles.loadingContainer}>
            <IconPulseDots color={Colors[colorScheme].tint} />
            <Text style={styles.loadingText}>Chargement des activités…</Text>
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
