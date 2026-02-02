import { ThemedText } from "@/components/themed-text";
import { DateFilterBar, DateFilterValue } from "@/components/ui/DateFilterBar";
import { IconPulseDots } from "@/components/ui/IconPulseDtos";
import { LoadMoreButton } from "@/components/ui/LoadMoreButton";
import {
  DiapersEditData,
  DiapersType,
  MictionCouleur,
  SelleConsistance,
  SelleQuantite,
} from "@/components/forms/DiapersForm";
import { eventColors } from "@/constants/eventColors";
import { MAX_AUTO_LOAD_ATTEMPTS } from "@/constants/pagination";
import { Colors } from "@/constants/theme";
import { useBaby } from "@/contexts/BabyContext";
import { useSheet } from "@/contexts/SheetContext";
import { useColorScheme } from "@/hooks/use-color-scheme";
import {
  ecouterMictionsHybrid as ecouterMictions,
  ecouterSellesHybrid as ecouterSelles,
  getNextEventDateBeforeHybrid,
  hasMoreEventsBeforeHybrid,
} from "@/migration/eventsHybridService";
import { Ionicons } from "@expo/vector-icons";
import FontAwesome from "@expo/vector-icons/FontAwesome5";
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
  View,
} from "react-native";
import { Calendar, DateData } from "react-native-calendars";
import { SafeAreaView } from "react-native-safe-area-context";
import { useHeaderLeft, useHeaderRight } from "../../_layout";

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
// COMPONENT
// ============================================

export default function DiapersScreen() {
  const { activeChild } = useBaby();
  const { setHeaderRight } = useHeaderRight();
  const colorScheme = useColorScheme() ?? "light";
  const { openSheet, closeSheet, isOpen } = useSheet();
  const headerOwnerId = useRef(
    `diapers-${Math.random().toString(36).slice(2)}`
  );
  const navigation = useNavigation();
  const { setHeaderLeft } = useHeaderLeft();

  const [showCalendar, setShowCalendar] = useState(false);
  const [selectedFilter, setSelectedFilter] = useState<DateFilterValue>("today");
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [layoutReady, setLayoutReady] = useState(false);
  const [pendingOpen, setPendingOpen] = useState(false);
  const sheetOwnerId = "diapers";

  // États des données
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

  // Récupérer les paramètres de l'URL
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
          <Pressable onPress={() => openAddModal()} style={styles.headerButton}>
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
      showCalendar,
      colorScheme,
      setHeaderRight,
      openAddModal,
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
        (endOfToday.getTime() - prev.getTime()) / (24 * 60 * 60 * 1000),
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
    const task = InteractionManager.runAfterInteractions(() => {
      stashReturnTo();
      openSheet({
        ownerId: sheetOwnerId,
        formType: "diapers",
        diapersType: pendingDiapersType,
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
  }, [activeChild, daysWindow, rangeEndDate]);

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

      if (auto && autoLoadMoreAttempts >= MAX_AUTO_LOAD_ATTEMPTS - 1) {
        const endOfRange = rangeEndDate ? new Date(rangeEndDate) : new Date();
        endOfRange.setHours(23, 59, 59, 999);
        const startOfRange = new Date(endOfRange);
        startOfRange.setHours(0, 0, 0, 0);
        startOfRange.setDate(startOfRange.getDate() - (daysWindow - 1));
        const beforeDate = new Date(startOfRange.getTime() - 1);

        const nextEventDate = await getNextEventDateBeforeHybrid(
          activeChild.id,
          ["miction", "selle"],
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

  // Filtrage et regroupement par jour
  useEffect(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayTime = today.getTime();

    const filtered = excretions.filter((excretion) => {
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

    const grouped = groupExcretionsByDay(filtered);
    setGroupedExcretions(grouped);
  }, [excretions, selectedFilter, selectedDate]);

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

  const handleDateSelect = (day: DateData) => {
    setSelectedDate(day.dateString);
    setExpandedDays(new Set([day.dateString]));
  };

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
    }, [applyTodayFilter, selectedDate])
  );

  // ============================================
  // HELPERS - GROUPING
  // ============================================

  const groupExcretionsByDay = (excretions: Excretion[]): ExcretionGroup[] => {
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
      .map(([dateKey, excretions]) => {
        const date = new Date(dateKey);
        const mictionsCount = excretions.filter(
          (e) => e.type === "miction"
        ).length;
        const sellesCount = excretions.filter((e) => e.type === "selle").length;
        const lastExcretion = excretions.reduce((latest, current) =>
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
          excretions: excretions.sort(
            (a, b) => (b.date?.seconds || 0) - (a.date?.seconds || 0)
          ),
          mictionsCount,
          sellesCount,
          lastExcretion,
        };
      })
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  };

  // ============================================
  // HELPERS - UI
  // ============================================

  const toggleExpand = useCallback((dateKey: string) => {
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

  const getExcretionTypeLabel = (type?: DiapersType): string => {
    if (!type) return "Inconnu";
    return type === "miction" ? "Miction" : "Selle";
  };

  const getExcretionIcon = (type?: DiapersType): string => {
    if (type === "miction") return "water";
    if (type === "selle") return "poop";
    return "question";
  };

  const getExcretionColor = (type?: DiapersType): string => {
    if (type === "miction") return eventColors.miction.dark;
    if (type === "selle") return eventColors.selle.dark;
    return eventColors.default.dark;
  };

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
                ? "Foncée"
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
        <Pressable
          key={excretion.id}
          style={({ pressed }) => [
            styles.sessionCard,
            pressed && styles.sessionCardPressed,
          ]}
          onPress={() => openEditModal(excretion)}
        >
          {/* Time badge */}
          <View style={styles.sessionTime}>
            <Text
              style={[
                styles.sessionTimeText,
                isLast && styles.sessionTimeTextLast,
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
              <Text style={styles.sessionType}>{typeLabel}</Text>
              {detailsText.length > 0 && (
                <Text style={styles.sessionDetailText}>{detailsText}</Text>
              )}
            </View>
          </View>

          {/* Chevron */}
          <Ionicons name="chevron-forward" size={18} color="#d1d5db" />
        </Pressable>
      );
    },
    [openEditModal]
  );

  // ============================================
  // RENDER - DAY GROUP
  // ============================================

  const renderDayGroup = useCallback(
    ({ item }: { item: ExcretionGroup }) => {
      const isExpanded = expandedDays.has(item.date);
      const hasMultipleExcretions = item.excretions.length > 1;

      // Format date intelligently
      const formatDayLabel = () => {
        const today = new Date();
        const yesterday = new Date(today);
        yesterday.setDate(yesterday.getDate() - 1);
        const itemDate = new Date(item.date);

        if (itemDate.toDateString() === today.toDateString()) {
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
            <Text style={styles.dayLabel}>{formatDayLabel()}</Text>
            <View style={styles.dayStats}>
              <View style={styles.dayStatItem}>
                <Text style={styles.dayStatValue}>
                  {item.mictionsCount + item.sellesCount}
                </Text>
                <Text style={styles.dayStatLabel}>
                  excrétion{item.mictionsCount + item.sellesCount > 1 ? "s" : ""}
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
                <Text style={styles.statsBreakdownLabel}>
                  Miction{item.mictionsCount > 1 ? "s" : ""}
                </Text>
                <Text style={styles.statsBreakdownValue}>
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
                <Text style={styles.statsBreakdownLabel}>
                  Selle{item.sellesCount > 1 ? "s" : ""}
                </Text>
                <Text style={styles.statsBreakdownValue}>
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
                  style={styles.expandTrigger}
                  onPress={() => toggleExpand(item.date)}
                >
                  <Text style={styles.expandTriggerText}>
                    {isExpanded
                      ? "Masquer"
                      : `${item.excretions.length - 1} autre${item.excretions.length > 2 ? "s" : ""} excrétion${item.excretions.length > 2 ? "s" : ""}`}
                  </Text>
                  <Ionicons
                    name={isExpanded ? "chevron-up" : "chevron-down"}
                    size={14}
                    color={eventColors.miction.dark}
                  />
                </Pressable>
              </>
            )}
          </View>
        </View>
      );
    },
    [expandedDays, renderExcretionItem, toggleExpand]
  );

  // ============================================
  // RENDER - MAIN
  // ============================================

  return (
    <View style={styles.container}>
      <SafeAreaView
        style={[{ flex: 1 }]}
        edges={["bottom"]}
        onLayout={() => setLayoutReady(true)}
      >
        <View>
          {/* Filtres */}
          <DateFilterBar
            selected={selectedFilter}
            onSelect={handleFilterPress}
          />

          {/* Calendrier */}
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

        {/* Liste des excrétions */}
        {isExcretionsLoading || !emptyDelayDone ? (
          <View style={styles.emptyContainer}>
            <IconPulseDots color={Colors[colorScheme].tint} />
          </View>
        ) : groupedExcretions.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Ionicons
              name="calendar-outline"
              size={64}
              color={Colors[colorScheme].tabIconDefault}
            />

            <ThemedText style={styles.emptyText}>
              {excretions.length === 0
                ? "Aucune excrétion"
                : "Aucune excrétion pour ce filtre"}
            </ThemedText>

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
            style={styles.flatlistContent}
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
        )}
      </SafeAreaView>
    </View>
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
  flatlistContent: {
    paddingBottom: 8,
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
    borderBottomColor: "#e0e0e0",
  },
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 20,
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
    color: "#6b7280",
  },
  statsBreakdownValue: {
    fontSize: 12,
    fontWeight: "600",
    color: "#374151",
  },
  // Sessions container
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
  // Session Card
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
    color: "#111827",
  },
  sessionDetailText: {
    fontSize: 12,
    color: "#6b7280",
    marginTop: 2,
  },
  // Expand trigger
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
    color: eventColors.miction.dark,
  },
  // Empty State
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
