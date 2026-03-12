import { DateFilterBar, DateFilterValue } from "@/components/ui/DateFilterBar";
import { IconPulseDots } from "@/components/ui/IconPulseDtos";
import { LoadMoreButton } from "@/components/ui/LoadMoreButton";
import {
  JalonType,
  MilestonesEditData,
} from "@/components/forms/MilestonesForm";
import { eventColors } from "@/constants/eventColors";
import { MAX_AUTO_LOAD_ATTEMPTS } from "@/constants/pagination";
import { getNeutralColors } from "@/constants/dashboardColors";
import { Colors } from "@/constants/theme";
import { useBaby } from "@/contexts/BabyContext";
import { useSheet } from "@/contexts/SheetContext";
import { useColorScheme } from "@/hooks/use-color-scheme";
import {
  ecouterJalonsHybrid,
  getNextEventDateBeforeHybrid,
  hasMoreEventsBeforeHybrid,
} from "@/migration/eventsHybridService";
import { JalonEvent } from "@/services/eventsService";
import { Ionicons } from "@expo/vector-icons";
import FontAwesome from "@expo/vector-icons/FontAwesome6";
import { HeaderBackButton } from "@react-navigation/elements";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import { router, useLocalSearchParams } from "expo-router";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  BackHandler,
  FlatList,
  Image,
  InteractionManager,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Calendar, DateData } from "react-native-calendars";
import { SafeAreaView } from "react-native-safe-area-context";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import ReanimatedSwipeable from "react-native-gesture-handler/ReanimatedSwipeable";
import { useHeaderLeft, useHeaderRight } from "../../_layout";
import { ConfirmModal } from "@/components/ui/ConfirmModal";
import { supprimerJalon } from "@/migration/eventsDoubleWriteService";
import * as Haptics from "expo-haptics";

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
    label: "Première dent",
    color: eventColors.jalon.dark,
    icon: "tooth",
    defaultTitle: "Première dent",
  },
  pas: {
    label: "Premiers pas",
    color: eventColors.jalon.dark,
    icon: "shoe-prints",
    defaultTitle: "Premiers pas",
  },
  sourire: {
    label: "Premier sourire",
    color: eventColors.jalon.dark,
    icon: "face-smile",
    defaultTitle: "Premier sourire",
  },
  mot: {
    label: "Premiers mots",
    color: eventColors.jalon.dark,
    icon: "comment-dots",
    defaultTitle: "Premiers mots",
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
      accessibilityLabel="Supprimer ce jalon"
    >
      <Ionicons name="trash-outline" size={20} color="#fff" />
      <Text style={styles.deleteActionText}>Supprimer</Text>
    </Pressable>
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
  const navigation = useNavigation();
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

  const [events, setEvents] = useState<MilestoneEventWithId[]>([]);
  const [groupedEvents, setGroupedEvents] = useState<MilestoneGroup[]>([]);
  const [expandedDays, setExpandedDays] = useState<Set<string>>(new Set());
  const [loaded, setLoaded] = useState({ jalons: false });
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
    event: MilestoneEventWithId | null;
  }>({ visible: false, event: null });

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
      setPendingJalonType(event.typeJalon);
      setPendingEditData(buildEditData(event));
      setShowCalendar(false);
      setPendingOpen(true);
    },
    [buildEditData]
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

  const handleAddPress = useCallback(() => {
    openAddModal("dent");
  }, [openAddModal]);

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
            onPress={handleAddPress}
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
    }, [
      handleCalendarPress,
      handleAddPress,
      showCalendar,
      colorScheme,
      setHeaderRight,
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

    const versionAtSubscribe = loadMoreVersionRef.current;
    const endOfRange = rangeEndDate ? new Date(rangeEndDate) : new Date();
    endOfRange.setHours(23, 59, 59, 999);
    const startOfRange = new Date(endOfRange);
    startOfRange.setHours(0, 0, 0, 0);
    startOfRange.setDate(startOfRange.getDate() - (daysWindow - 1));

    const unsubscribe = ecouterJalonsHybrid(
      activeChild.id,
      (data) => {
        setEvents(data as MilestoneEventWithId[]);
        setLoaded({ jalons: true });

        if (
          pendingLoadMoreRef.current > 0 &&
          versionAtSubscribe === loadMoreVersionRef.current
        ) {
          pendingLoadMoreRef.current = 0;
          setIsLoadingMore(false);
        }
      },
      { waitForServer: true, depuis: startOfRange, jusqu: endOfRange }
    );

    return () => unsubscribe();
  }, [activeChild?.id, daysWindow, rangeEndDate]);

  useEffect(() => {
    if (!activeChild?.id) return;

    setEvents([]);
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
    if (!selectedFilter && !selectedDate) return events;

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayTime = today.getTime();

    return events.filter((item) => {
      const date = toDate(item.date);
      date.setHours(0, 0, 0, 0);
      const time = date.getTime();
      if (selectedFilter === "today") return time === todayTime;
      if (selectedFilter === "past") return time < todayTime;
      if (selectedDate) return formatDateKey(date) === selectedDate;
      return true;
    });
  }, [events, selectedFilter, selectedDate]);

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
    hasMoreEventsBeforeHybrid(activeChild.id, ["jalon"], beforeDate)
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
        const nextEventDate = await getNextEventDateBeforeHybrid(
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
    const task = InteractionManager.runAfterInteractions(() => {
      stashReturnTo();
      openSheet({
        ownerId: sheetOwnerId,
        formType: "milestones",
        jalonType: pendingJalonType,
        editData: pendingEditData ?? undefined,
        onSuccess: ensureTodayInRange,
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

  // ============================================
  // RENDER HELPERS
  // ============================================
  const renderEventItem = (event: MilestoneEventWithId, isLast = false) => {
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
        renderRightActions={() => (
          <DeleteAction onPress={() => handleEventDelete(event)} />
        )}
        friction={2}
        rightThreshold={40}
        overshootRight={false}
      >
        <Pressable
          style={({ pressed }) => [
            styles.sessionCard,
            pressed && styles.sessionCardPressed,
          ]}
          onPress={() => openEditModal(event)}
          accessibilityRole="button"
          accessibilityLabel="Modifier ce jalon"
        >
          <View style={styles.sessionTime}>
            <Text
              style={[
                styles.sessionTimeText,
                isLast && styles.sessionTimeTextLast,
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
                <Text style={styles.sessionType}>{titleText}</Text>
              ) : null}
              {event.description ? (
                <Text style={styles.sessionDetailText}>{event.description}</Text>
              ) : null}
              {event.typeJalon === "humeur" && moodEmoji ? (
                <Text style={styles.sessionMood}>{moodEmoji}</Text>
              ) : null}
            </View>
            {event.photos?.[0] ? (
              <Image
                source={{ uri: event.photos[0] }}
                style={styles.sessionPhoto}
              />
            ) : null}
          </View>
          <Ionicons name="chevron-forward" size={18} color="#d1d5db" />
        </Pressable>
      </ReanimatedSwipeable>
    );
  };

  const toggleExpand = (dateKey: string) => {
    setExpandedDays((prev) => {
      const next = new Set(prev);
      if (next.has(dateKey)) {
        next.delete(dateKey);
      } else {
        next.add(dateKey);
      }
      return next;
    });
  };

  const handleEventDelete = useCallback((event: MilestoneEventWithId) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setDeleteConfirm({ visible: true, event });
  }, []);

  const confirmDelete = useCallback(async () => {
    if (!activeChild?.id || !deleteConfirm.event?.id) return;
    const eventId = deleteConfirm.event.id;
    setDeleteConfirm({ visible: false, event: null });
    try {
      await supprimerJalon(activeChild.id, eventId);
    } catch {
      // silently fail
    }
  }, [activeChild?.id, deleteConfirm.event]);

  const cancelDelete = useCallback(() => {
    setDeleteConfirm({ visible: false, event: null });
  }, []);

  const renderDayGroup = ({ item }: { item: MilestoneGroup }) => {
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
          <Text style={styles.dayLabel}>{dayLabel}</Text>
          <View style={styles.dayStats}>
            <View style={styles.dayStatItem}>
              <Text style={styles.dayStatValue}>{item.events.length}</Text>
              <Text style={styles.dayStatLabel}>
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
                <Text style={styles.statsBreakdownLabel}>
                  {TYPE_CONFIG[type].label}
                  {item.counts[type] > 1 ? "s" : ""}
                </Text>
                <Text style={styles.statsBreakdownValue}>
                  {item.counts[type]}
                </Text>
              </View>
            ))}
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
          <DateFilterBar
            selected={selectedFilter}
            onSelect={handleFilterPress}
          />
          {showCalendar && (
            <View style={styles.calendarContainer}>
              <Calendar
                current={selectedDate || undefined}
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

        {loaded.jalons && emptyDelayDone ? (
          groupedEvents.length === 0 ? (
            <View style={styles.emptyContainer}>
              <Ionicons
                name="calendar-outline"
                size={64}
                color={Colors[colorScheme].tabIconDefault}
              />
              <Text style={styles.emptyText}>
                {events.length === 0
                  ? "Aucun jalon enregistré"
                  : "Aucun jalon pour ce filtre"}
              </Text>
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
            />
          )
        ) : (
          <View style={styles.loadingContainer}>
            <IconPulseDots color={Colors[colorScheme].tint} />
            <Text style={styles.loadingText}>Chargement des jalons…</Text>
          </View>
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
    </GestureHandlerRootView>
  );
}

// ============================================
// STYLES
// ============================================

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f8f9fa",
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
    borderBottomColor: "#e0e0e0",
  },
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 80,
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
    gap: 2,
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
  sessionMood: {
    fontSize: 16,
  },
  sessionPhoto: {
    width: 44,
    height: 44,
    borderRadius: 10,
    backgroundColor: "#f3f4f6",
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
