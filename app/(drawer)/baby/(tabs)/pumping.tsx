import { PumpingEditData } from "@/components/forms/PumpingForm";
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
  ecouterPompagesHybrid as ecouterPompages,
  getNextEventDateBeforeHybrid,
  hasMoreEventsBeforeHybrid,
} from "@/migration/eventsHybridService";
import { Ionicons } from "@expo/vector-icons";
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
  dateFormatted: string;
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
  const { openSheet, closeSheet, isOpen } = useSheet();
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
  const [pompages, setPompages] = useState<Pompage[]>([]);
  const [groupedPompages, setGroupedPompages] = useState<PompageGroup[]>([]);
  const [expandedDays, setExpandedDays] = useState<Set<string>>(new Set());
  const [pompagesLoaded, setPompagesLoaded] = useState(false);
  const [emptyDelayDone, setEmptyDelayDone] = useState(false);
  const [daysWindow, setDaysWindow] = useState(14);
  const [rangeEndDate, setRangeEndDate] = useState<Date | null>(null);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [autoLoadMore, setAutoLoadMore] = useState(false);
  const [autoLoadMoreAttempts, setAutoLoadMoreAttempts] = useState(0);
  const loadMoreVersionRef = useRef(0);
  const pendingLoadMoreRef = useRef(0);

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

  // Définir les boutons du header (calendrier + ajouter)
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
    date: new Date(pompage.date.seconds * 1000),
    quantiteGauche: pompage.quantiteGauche,
    quantiteDroite: pompage.quantiteDroite,
  }), []);

  useEffect(() => {
    if (!pendingOpen || !layoutReady) return;
    const returnTarget = returnTargetParam ?? returnToRef.current;
    const task = InteractionManager.runAfterInteractions(() => {
      stashReturnTo();
      openSheet({
        ownerId: sheetOwnerId,
        formType: "pumping",
        editData: pendingEditData ?? undefined,
        onSuccess: ensureTodayInRange,
        onDismiss: () => {
          editIdRef.current = null;
          maybeReturnTo(returnTarget);
        },
      });
      navigation.setParams({ openModal: undefined, editId: undefined });
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
    ensureTodayInRange,
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
    navigation.setParams({ openModal: undefined, editId: undefined });
  }, [editId, layoutReady, pompages, buildEditData]);

  // ============================================
  // EFFECTS - DATA LISTENERS
  // ============================================

  // Écoute en temps réel
  useEffect(() => {
    if (!activeChild?.id) return;
    const versionAtSubscribe = loadMoreVersionRef.current;
    const endOfRange = rangeEndDate ? new Date(rangeEndDate) : new Date();
    endOfRange.setHours(23, 59, 59, 999);
    const startOfRange = new Date(endOfRange);
    startOfRange.setHours(0, 0, 0, 0);
    startOfRange.setDate(startOfRange.getDate() - (daysWindow - 1));

    const unsubscribe = ecouterPompages(
      activeChild.id,
      (data) => {
        setPompages(data);
        setPompagesLoaded(true);
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
    );
    return () => unsubscribe();
  }, [activeChild, daysWindow, rangeEndDate]);

  useEffect(() => {
    if (!activeChild?.id) return;
    setPompages([]);
    setGroupedPompages([]);
    setPompagesLoaded(false);
    setEmptyDelayDone(false);
    setDaysWindow(14);
    setRangeEndDate(null);
    setIsLoadingMore(false);
    setHasMore(true);
    loadMoreVersionRef.current = 0;
    pendingLoadMoreRef.current = 0;
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

  const loadMoreStep = useCallback(
    async (auto = false) => {
      if (!hasMore || !activeChild?.id) return;
      setIsLoadingMore(true);
      pendingLoadMoreRef.current = 1;
      loadMoreVersionRef.current += 1;

      // Si on a déjà essayé plusieurs fois sans succès, on saute directement au prochain événement
      if (auto && autoLoadMoreAttempts >= MAX_AUTO_LOAD_ATTEMPTS - 1) {
        const endOfRange = rangeEndDate ? new Date(rangeEndDate) : new Date();
        endOfRange.setHours(23, 59, 59, 999);
        const startOfRange = new Date(endOfRange);
        startOfRange.setHours(0, 0, 0, 0);
        startOfRange.setDate(startOfRange.getDate() - (daysWindow - 1));
        const beforeDate = new Date(startOfRange.getTime() - 1);

        const nextEventDate = await getNextEventDateBeforeHybrid(
          activeChild.id,
          "pompage",
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
      const pompageDate = new Date(pompage.date.seconds * 1000);
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
  }, [pompages, selectedFilter, selectedDate, showCalendar]);

  // ============================================
  // HELPERS - CALENDAR
  // ============================================

  // Préparer les dates marquées pour le calendrier
  const markedDates = useMemo(() => {
    const marked: Record<string, any> = {};

    pompages.forEach((pompage) => {
      const date = new Date(pompage.date.seconds * 1000);
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

  const handleDateSelect = (day: DateData) => {
    setSelectedDate(day.dateString);
    setExpandedDays(new Set([day.dateString]));
  };

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
          dateFormatted: date.toLocaleDateString("fr-FR", {
            weekday: "long",
            day: "numeric",
            month: "long",
            year: "numeric",
          }),
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

  const toggleExpand = (dateKey: string) => {
    const newExpandedDays = new Set(expandedDays);
    if (newExpandedDays.has(dateKey)) {
      newExpandedDays.delete(dateKey);
    } else {
      newExpandedDays.add(dateKey);
    }
    setExpandedDays(newExpandedDays);
  };

  // ============================================
  // HANDLERS - MODAL
  // ============================================

  const openEditModal = useCallback((pompage: Pompage) => {
    setPendingEditData(buildEditData(pompage));
    setPendingOpen(true);
  }, [buildEditData]);

  const normalizeParam = (value: string | string[] | undefined) =>
    Array.isArray(value) ? value[0] : value;

  const stashReturnTo = () => {
    const target = normalizeParam(returnTo);
    if (!target) return;
    if (target === "home" || target === "chrono" || target === "journal") {
      returnToRef.current = target;
      return;
    }
    returnToRef.current = null;
  };

  useEffect(() => {
    stashReturnTo();
  }, [returnTo]);

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

  const renderPompageItem = (pompage: Pompage, isLast: boolean = false) => {
    const totalQty =
      (pompage.quantiteGauche || 0) + (pompage.quantiteDroite || 0);
    const leftPercent =
      totalQty > 0 ? (pompage.quantiteGauche / totalQty) * 100 : 50;
    const pompageTime = new Date(pompage.date?.seconds * 1000);

    return (
      <Pressable
        key={pompage.id}
        style={({ pressed }) => [
          styles.sessionCard,
          // isLast && styles.sessionCardLast,
          pressed && styles.sessionCardPressed,
        ]}
        onPress={() => openEditModal(pompage)}
      >
        {/* Time badge */}
        <View style={styles.sessionTime}>
          <Text
            style={[
              styles.sessionTimeText,
              isLast && styles.sessionTimeTextLast,
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
              <Text style={styles.quantityLabelText}>G</Text>
              <Text style={styles.quantityLabelValue}>
                {pompage.quantiteGauche} ml
              </Text>
            </View>
            <View style={styles.quantityLabelItem}>
              <View style={[styles.quantityDot, styles.quantityDotRight]} />
              <Text style={styles.quantityLabelText}>D</Text>
              <Text style={styles.quantityLabelValue}>
                {pompage.quantiteDroite} ml
              </Text>
            </View>
          </View>
        </View>

        {/* Total */}
        <View style={styles.sessionTotal}>
          <Text style={styles.sessionTotalValue}>{totalQty}</Text>
          <Text style={styles.sessionTotalUnit}>ml</Text>
        </View>

        {/* Chevron */}
        <Ionicons name="chevron-forward" size={18} color="#d1d5db" />
      </Pressable>
    );
  };

  // ============================================
  // RENDER - DAY GROUP
  // ============================================

  const renderDayGroup = ({ item }: { item: PompageGroup }) => {
    const isExpanded = expandedDays.has(item.date);
    const hasMultiplePompages = item.pompages.length > 1;

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
              <Text style={styles.dayStatValue}>{item.pompages.length}</Text>
              <Text style={styles.dayStatLabel}>
                session{item.pompages.length > 1 ? "s" : ""}
              </Text>
            </View>
            <View style={styles.dayStatDivider} />
            <View style={styles.dayStatItem}>
              <Text style={[styles.dayStatValue, styles.dayStatValueAccent]}>
                {item.totalQuantity}
              </Text>
              <Text style={styles.dayStatLabel}>ml total</Text>
            </View>
          </View>
        </View>

        {/* Stats breakdown */}
        <View style={styles.statsBreakdown}>
          <View style={styles.statsBreakdownItem}>
            <View
              style={[styles.statsBreakdownDot, { backgroundColor: "#10b981" }]}
            />
            <Text style={styles.statsBreakdownLabel}>Gauche</Text>
            <Text style={styles.statsBreakdownValue}>
              {item.totalQuantityLeft} ml
            </Text>
          </View>
          <View style={styles.statsBreakdownItem}>
            <View
              style={[styles.statsBreakdownDot, { backgroundColor: "#6366f1" }]}
            />
            <Text style={styles.statsBreakdownLabel}>Droite</Text>
            <Text style={styles.statsBreakdownValue}>
              {item.totalQuantityRight} ml
            </Text>
          </View>
        </View>

        {/* Sessions list */}
        <View style={styles.sessionsContainer}>
          {renderPompageItem(item.lastPompage, true)}

          {hasMultiplePompages && (
            <>
              {isExpanded &&
                item.pompages
                  .filter((pompage) => pompage.id !== item.lastPompage.id)
                  .map((pompage) => renderPompageItem(pompage, false))}

              <Pressable
                style={styles.expandTrigger}
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
  };

  // ============================================
  // RENDER - MAIN
  // ============================================

  return (
    <View style={styles.container}>
      <SafeAreaView
        style={[
          { flex: 1 },
          // { backgroundColor: Colors[colorScheme].background },
        ]}
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

        {/* Liste des pompages */}
        {pompagesLoaded && emptyDelayDone ? (
          groupedPompages.length === 0 ? (
            <View style={styles.emptyContainer}>
              <Ionicons
                name="calendar-outline"
                size={64}
                color={Colors[colorScheme].tabIconDefault}
              />
              <ThemedText style={styles.emptyText}>
                {pompages.length === 0
                  ? "Aucune session enregistrée"
                  : "Aucune session pour ce filtre"}
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
              data={groupedPompages}
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
          )
        ) : (
          <View style={styles.emptyContainer}>
            <IconPulseDots color={Colors[colorScheme].tint} />
          </View>
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
  dayStatValueAccent: {
    color: eventColors.pumping.dark,
  },
  dayStatLabel: {
    fontSize: 11,
    color: "#9ca3af",
  },
  dayStatDivider: {
    width: 1,
    height: 24,
    backgroundColor: "#e5e7eb",
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
  sessionCardLast: {
    backgroundColor: eventColors.pumping.light + "40",
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
  sessionTimeTextLast: {
    color: "#374151",
    fontWeight: "600",
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
    backgroundColor: "#10b981",
  },
  quantityBarRight: {
    backgroundColor: "#6366f1",
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
    backgroundColor: "#10b981",
  },
  quantityDotRight: {
    backgroundColor: "#6366f1",
  },
  quantityLabelText: {
    fontSize: 11,
    fontWeight: "500",
    color: "#9ca3af",
  },
  quantityLabelValue: {
    fontSize: 11,
    fontWeight: "600",
    color: "#4b5563",
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
    color: "#9ca3af",
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
    color: eventColors.pumping.dark,
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
