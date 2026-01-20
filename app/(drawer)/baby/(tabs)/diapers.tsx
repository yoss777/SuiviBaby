import { ThemedText } from "@/components/themed-text";
import { ConfirmModal } from "@/components/ui/ConfirmModal";
import { IconPulseDots } from "@/components/ui/IconPulseDtos";
import { LoadMoreButton } from "@/components/ui/LoadMoreButton";
import { MAX_AUTO_LOAD_ATTEMPTS } from "@/constants/pagination";
import { Colors } from "@/constants/theme";
import { useBaby } from "@/contexts/BabyContext";
import { useModal } from "@/contexts/ModalContext";
import { useSheet } from "@/contexts/SheetContext";
import { useToast } from "@/contexts/ToastContext";
import { useColorScheme } from "@/hooks/use-color-scheme";
import {
  ajouterMiction,
  ajouterSelle,
  modifierMiction,
  modifierSelle,
  supprimerMiction,
  supprimerSelle,
} from "@/migration/eventsDoubleWriteService";
import {
  ecouterMictionsHybrid as ecouterMictions,
  ecouterSellesHybrid as ecouterSelles,
  hasMoreEventsBeforeHybrid,
  getNextEventDateBeforeHybrid,
} from "@/migration/eventsHybridService";
import { Ionicons } from "@expo/vector-icons";
import FontAwesome from "@expo/vector-icons/FontAwesome5";
import DateTimePicker from "@react-native-community/datetimepicker";
import { HeaderBackButton } from "@react-navigation/elements";
import { useNetInfo } from "@react-native-community/netinfo";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import { router, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  BackHandler,
  FlatList,
  InteractionManager,
  Platform,
  Pressable,
  ScrollView,
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
type ExcretionType = "miction" | "selle";
type FilterType = "today" | "past";

interface Excretion {
  id: string;
  type?: ExcretionType;
  date: { seconds: number };
  createdAt: { seconds: number };
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
  const { openSheet, closeSheet, viewProps, isOpen } = useSheet();
  const headerOwnerId = useRef(`diapers-${Math.random().toString(36).slice(2)}`);
  const { showAlert } = useModal();
  const navigation = useNavigation();
  const { setHeaderLeft } = useHeaderLeft();
  const { showToast } = useToast();
  const netInfo = useNetInfo();
  const isOffline =
    netInfo.isInternetReachable === false || netInfo.isConnected === false;

  const [showCalendar, setShowCalendar] = useState(false);
  const [selectedFilter, setSelectedFilter] = useState<FilterType | null>(null);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [layoutReady, setLayoutReady] = useState(false);
  const [pendingOpen, setPendingOpen] = useState(false);
  const [pendingMode, setPendingMode] = useState<"add" | "edit" | null>(null);
  const sheetOwnerId = "diapers";
  const isSheetActive = viewProps?.ownerId === sheetOwnerId;

  // États des données
  const [excretions, setExcretions] = useState<Excretion[]>([]);
  const [groupedExcretions, setGroupedExcretions] = useState<ExcretionGroup[]>([]);
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

  // États du formulaire
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [editingExcretion, setEditingExcretion] = useState<Excretion | null>(null);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [includeMiction, setIncludeMiction] = useState<boolean>(true);
  const [includeSelle, setIncludeSelle] = useState<boolean>(false);
  const [dateHeure, setDateHeure] = useState<Date>(new Date());

  // États des pickers
  const [showDate, setShowDate] = useState(false);
  const [showTime, setShowTime] = useState(false);

  // Récupérer les paramètres de l'URL
  const { tab, openModal, editId, returnTo } = useLocalSearchParams();
  const returnTarget = Array.isArray(returnTo) ? returnTo[0] : returnTo;

  const editIdRef = useRef<string | null>(null);
  const returnToRef = useRef<string | null>(null);


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
        setSelectedFilter(null);
      }

      return newValue;
    });
  }, []);

  const prepareAddModal = useCallback((preferredType?: "mictions" | "selles") => {
    setDateHeure(new Date());
    setEditingExcretion(null);
    setIsSubmitting(false);

    if (preferredType === "selles") {
      setIncludeMiction(false);
      setIncludeSelle(true);
    } else if (preferredType === "mictions") {
      setIncludeMiction(true);
      setIncludeSelle(false);
    } else {
      setIncludeMiction(true);
      setIncludeSelle(false);
    }
  }, []);

  const openAddModal = useCallback((preferredType?: "mictions" | "selles") => {
    prepareAddModal(preferredType);
    setPendingMode("add");
    setPendingOpen(true);
  }, [prepareAddModal]);

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
      setIncludeMiction(false);
      setIncludeSelle(true);
    } else if (tab === "mictions") {
      setIncludeMiction(true);
      setIncludeSelle(false);
    }
  }, [tab]);

  useFocusEffect(
    useCallback(() => {
      const backButton = (
        <HeaderBackButton
          onPress={() => {
            if (returnTarget === "home") {
              router.replace("/baby/home");
              return;
            }
            if (returnTarget === "chrono") {
              router.replace("/baby/chrono");
              return;
            }
            if (returnTarget === "journal") {
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
    }, [colorScheme, returnTarget, setHeaderLeft])
  );

  useFocusEffect(
    useCallback(() => {
      const onBackPress = () => {
        if (isOpen) {
          closeSheet();
          return true;
        }
        if (returnTarget === "home") {
          router.replace("/baby/home");
          return true;
        }
        if (returnTarget === "chrono") {
          router.replace("/baby/chrono");
          return true;
        }
        if (returnTarget === "journal") {
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
    }, [closeSheet, isOpen, returnTarget, router])
  );

  useFocusEffect(
    useCallback(() => {
      if (openModal !== "true") return;
      setPendingMode("add");
      setPendingOpen(true);
    }, [openModal])
  );

  useEffect(() => {
    if (!pendingOpen || !layoutReady) return;
    const task = InteractionManager.runAfterInteractions(() => {
      stashReturnTo();
      if (pendingMode !== "edit") {
        prepareAddModal(tab as "mictions" | "selles" | undefined);
      }
      openSheet(buildSheetProps());
      navigation.setParams({ openModal: undefined, editId: undefined });
      setPendingOpen(false);
      setPendingMode(null);
    });
    return () => task.cancel?.();
  }, [
    pendingOpen,
    layoutReady,
    pendingMode,
    tab,
    router,
    returnTo,
    prepareAddModal,
    openSheet,
  ]);

  useEffect(() => {
    if (!editId || !layoutReady) return;
    const normalizedId = Array.isArray(editId) ? editId[0] : editId;
    if (!normalizedId || editIdRef.current === normalizedId) return;
    const target = excretions.find((excretion) => excretion.id === normalizedId);
    if (!target) return;
    stashReturnTo();
    editIdRef.current = normalizedId;
    openEditModal(target);
    navigation.setParams({ openModal: undefined, editId: undefined });
  }, [editId, layoutReady, excretions, router, returnTo]);

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
          type: "miction" as ExcretionType,
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
          type: "selle" as ExcretionType,
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
          ["miction", "selle"],
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
    [
      hasMore,
      activeChild?.id,
      autoLoadMoreAttempts,
      daysWindow,
      rangeEndDate,
    ],
  );

  const handleLoadMore = useCallback(() => {
    loadMoreStep(false);
  }, [loadMoreStep]);

  useEffect(() => {
    if (selectedFilter === "today" || selectedDate) return;
    if (!autoLoadMore && !isExcretionsLoading && groupedExcretions.length === 0 && hasMore) {
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

    // Recalculer hasMore uniquement quand la fenêtre change pour éviter les requêtes inutiles.
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

  // Filtrage et regroupement par jour avec useMemo pour éviter les re-renders
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

      switch (selectedFilter) {
        case "today":
          return excretionTime === todayTime;
        case "past":
          return excretionTime < todayTime;
        case null:
        default:
          return true;
      }
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
    }, [applyTodayFilter, selectedDate, selectedFilter])
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
        const mictionsCount = excretions.filter(e => e.type === "miction").length;
        const sellesCount = excretions.filter(e => e.type === "selle").length;
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
    setExpandedDays(prev => {
      const newExpandedDays = new Set(prev);
      if (newExpandedDays.has(dateKey)) {
        newExpandedDays.delete(dateKey);
      } else {
        newExpandedDays.add(dateKey);
      }
      return newExpandedDays;
    });
  }, []);

  const getExcretionTypeLabel = (type?: ExcretionType): string => {
    if (!type) return "Inconnu";
    return type === "miction" ? "Miction" : "Selle";
  };

  const getExcretionIcon = (type?: ExcretionType): string => {
    if (type === "miction") return "water";
    if (type === "selle") return "poop";
    return "question";
  };

  const getExcretionColor = (type?: ExcretionType): string => {
    if (type === "miction") return "#17a2b8";
    if (type === "selle") return "#dc3545";
    return "#666";
  };

  // ============================================
  // HANDLERS - MODAL
  // ============================================

  const openEditModal = (excretion: Excretion) => {
    setDateHeure(new Date(excretion.date.seconds * 1000));
    setEditingExcretion(excretion);
    setIsSubmitting(false);

    // En mode édition, on ne sélectionne que le type de l'excrétion
    const type = excretion.type || "miction";
    setIncludeMiction(type === "miction");
    setIncludeSelle(type === "selle");
    setPendingMode("edit");
    setPendingOpen(true);
  };

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

  const closeModal = () => {
    closeSheet();
  };

  // ============================================
  // HANDLERS - CRUD
  // ============================================

  const handleSubmit = async () => {
    if (isSubmitting || !activeChild) return;

    // Vérifier qu'au moins un type est sélectionné
    if (!includeMiction && !includeSelle) {
      showAlert(
        "Attention",
        "Veuillez sélectionner au moins un type (miction ou selle)"
      );
      return;
    }

    try {
      setIsSubmitting(true);

      const dataToSave = {
        date: dateHeure,
      };

      if (editingExcretion) {
        // Mode édition : modifier l'excrétion existante
        const isMiction = editingExcretion.type === "miction";
        if (isMiction) {
          await modifierMiction(activeChild.id, editingExcretion.id, dataToSave);
        } else {
          await modifierSelle(activeChild.id, editingExcretion.id, dataToSave);
        }
      } else {
        // Mode ajout : ajouter une ou deux excrétions
        if (includeMiction) {
          await ajouterMiction(activeChild.id, dataToSave);
        }
        if (includeSelle) {
          await ajouterSelle(activeChild.id, dataToSave);
        }
      }

      if (isOffline) {
        showToast(
          editingExcretion
            ? "Modification en attente de synchronisation"
            : "Ajout en attente de synchronisation"
        );
      }
      closeModal();
    } catch (error) {
      console.error("Erreur lors de la sauvegarde:", error);
      showAlert(
        "Erreur",
        "Impossible de sauvegarder. Veuillez réessayer."
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = () => {
    if (isSubmitting || !editingExcretion || !activeChild) return;
    setShowDeleteModal(true);
  };

  const confirmDelete = async () => {
    if (isSubmitting || !editingExcretion || !activeChild) return;

    try {
      setIsSubmitting(true);
      const isMiction = editingExcretion.type === "miction";
      if (isMiction) {
        await supprimerMiction(activeChild.id, editingExcretion.id);
      } else {
        await supprimerSelle(activeChild.id, editingExcretion.id);
      }
      if (isOffline) {
        showToast("Suppression en attente de synchronisation");
      }
      setShowDeleteModal(false);
      closeModal();
    } catch (error) {
      console.error("Erreur lors de la suppression:", error);
      showAlert("Erreur", "Impossible de supprimer. Veuillez réessayer.");
    } finally {
      setIsSubmitting(false);
    }
  };

  function renderSheetContent() {
    return (
      <>
      {!editingExcretion && (
        <>
          <Text style={styles.modalCategoryLabel}>Type d'excrétion</Text>
          <Text style={styles.toggleSubtitle}>
            Vous pouvez sélectionner les deux si nécessaire
          </Text>
          <View style={styles.typeRow}>
            <TouchableOpacity
              style={[
                styles.typeButton,
                includeMiction && styles.typeButtonActiveMiction,
                isSubmitting && styles.typeButtonDisabled,
              ]}
              onPress={() => setIncludeMiction((prev) => !prev)}
              disabled={isSubmitting}
              activeOpacity={0.7}
            >
              <FontAwesome
                name="water"
                size={18}
                color={includeMiction ? "white" : "#17a2b8"}
              />
              <Text
                style={[
                  styles.typeText,
                  includeMiction && styles.typeTextActive,
                  isSubmitting && styles.typeTextDisabled,
                ]}
              >
                Miction
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.typeButton,
                includeSelle && styles.typeButtonActiveSelle,
                isSubmitting && styles.typeButtonDisabled,
              ]}
              onPress={() => setIncludeSelle((prev) => !prev)}
              disabled={isSubmitting}
              activeOpacity={0.7}
            >
              <FontAwesome
                name="poop"
                size={18}
                color={includeSelle ? "white" : "#dc3545"}
              />
              <Text
                style={[
                  styles.typeText,
                  includeSelle && styles.typeTextActive,
                  isSubmitting && styles.typeTextDisabled,
                ]}
              >
                Selle
              </Text>
            </TouchableOpacity>
          </View>
        </>
      )}

      <Text style={styles.modalCategoryLabel}>Date & Heure</Text>
      <View style={styles.dateTimeContainer}>
        <TouchableOpacity
          style={[styles.dateButton, isSubmitting && styles.dateButtonDisabled]}
          onPress={() => setShowDate(true)}
          disabled={isSubmitting}
        >
          <FontAwesome
            name="calendar-alt"
            size={16}
            color={isSubmitting ? "#ccc" : Colors[colorScheme].tint}
          />
          <Text
            style={[
              styles.dateButtonText,
              isSubmitting && styles.dateButtonTextDisabled,
            ]}
          >
            Date
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.dateButton, isSubmitting && styles.dateButtonDisabled]}
          onPress={() => setShowTime(true)}
          disabled={isSubmitting}
        >
          <FontAwesome
            name="clock"
            size={16}
            color={isSubmitting ? "#ccc" : Colors[colorScheme].tint}
          />
          <Text
            style={[
              styles.dateButtonText,
              isSubmitting && styles.dateButtonTextDisabled,
            ]}
          >
            Heure
          </Text>
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
          onChange={onChangeDate}
        />
      )}
      {showTime && (
        <DateTimePicker
          value={dateHeure}
          mode="time"
          is24Hour={true}
          display={Platform.OS === "ios" ? "spinner" : "default"}
          onChange={onChangeTime}
        />
      )}
      </>
    );
  }

  function buildSheetProps() {
    const returnTarget = normalizeParam(returnTo) ?? returnToRef.current;
    return {
      ownerId: sheetOwnerId,
      title: editingExcretion
        ? `Modifier ${editingExcretion.type === "miction" ? "miction" : "selle"}`
        : "Nouvelle excrétion",
      icon: "toilet",
      accentColor:
        includeMiction && includeSelle
          ? "#6c757d"
          : includeMiction
          ? "#17a2b8"
          : includeSelle
          ? "#dc3545"
          : "#6c757d",
      isEditing: !!editingExcretion,
      isSubmitting,
      onSubmit: handleSubmit,
      onDelete: editingExcretion ? handleDelete : undefined,
      children: renderSheetContent(),
      onDismiss: () => {
        setIsSubmitting(false);
        setEditingExcretion(null);
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
    editingExcretion,
    isSubmitting,
    includeMiction,
    includeSelle,
    dateHeure,
    showDate,
    showTime,
  ]);

  // ============================================
  // HANDLERS - DATE/TIME PICKERS
  // ============================================

  const onChangeDate = (event: any, selectedDate?: Date) => {
    setShowDate(false);
    if (selectedDate) {
      setDateHeure((prev) => {
        const newDate = new Date(prev);
        newDate.setFullYear(
          selectedDate.getFullYear(),
          selectedDate.getMonth(),
          selectedDate.getDate()
        );
        return newDate;
      });
    }
  };

  const onChangeTime = (event: any, selectedDate?: Date) => {
    setShowTime(false);
    if (selectedDate) {
      setDateHeure((prev) => {
        const newDate = new Date(prev);
        newDate.setHours(selectedDate.getHours(), selectedDate.getMinutes());
        return newDate;
      });
    }
  };

  // ============================================
  // RENDER - EXCRETION ITEM
  // ============================================

  const renderExcretionItem = useCallback((excretion: Excretion, isLast: boolean = false) => {
    const typeLabel = getExcretionTypeLabel(excretion.type);
    const color = getExcretionColor(excretion.type);

    return (
      <TouchableOpacity
        key={excretion.id}
        style={[styles.excretionItem, isLast && styles.lastExcretionItem]}
        onPress={() => openEditModal(excretion)}
        activeOpacity={0.7}
      >
        <View style={styles.excretionContent}>
          <View style={[styles.avatar, { backgroundColor: color }]}>
            <FontAwesome
              name={getExcretionIcon(excretion.type)}
              size={20}
              color="#ffffff"
            />
          </View>
          <View style={styles.excretionInfo}>
            <View style={styles.infoRow}>
              <Text style={styles.excretionTypeText}>{typeLabel}</Text>
            </View>
            <View style={styles.infoRow}>
              <Text style={styles.timeText}>
                {new Date(excretion.date?.seconds * 1000).toLocaleTimeString(
                  "fr-FR",
                  {
                    hour: "2-digit",
                    minute: "2-digit",
                  }
                )}
              </Text>
            </View>
          </View>
          <View style={styles.excretionActions}>
            <FontAwesome
              name="edit"
              size={16}
              color={color}
              style={styles.editIcon}
            />
          </View>
        </View>
      </TouchableOpacity>
    );
  }, []);

  // ============================================
  // RENDER - DAY GROUP
  // ============================================

  const renderDayGroup = useCallback(({ item }: { item: ExcretionGroup }) => {
    const isExpanded = expandedDays.has(item.date);
    const hasMultipleExcretions = item.excretions.length > 1;

    return (
      <View style={styles.dayCard}>
        <View style={styles.dayHeader}>
          <View style={styles.dayInfo}>
            <Text style={styles.dayDate}>{item.dateFormatted}</Text>
            <View style={styles.summaryInfo}>
              <View style={styles.summaryRow}>
                {item.mictionsCount > 0 && (
                  <View style={styles.summaryBadge}>
                    <FontAwesome name="water" size={12} color="#17a2b8" />
                    <Text style={styles.summaryText}>
                      {item.mictionsCount} miction{item.mictionsCount > 1 ? "s" : ""}
                    </Text>
                  </View>
                )}
                {item.sellesCount > 0 && (
                  <View style={styles.summaryBadge}>
                    <FontAwesome name="poop" size={12} color="#dc3545" />
                    <Text style={styles.summaryText}>
                      {item.sellesCount} selle{item.sellesCount > 1 ? "s" : ""}
                    </Text>
                  </View>
                )}
              </View>
            </View>
          </View>
          {hasMultipleExcretions && (
            <TouchableOpacity
              style={styles.expandButton}
              onPress={() => toggleExpand(item.date)}
            >
              <FontAwesome
                name={isExpanded ? "chevron-up" : "chevron-down"}
                size={16}
                color="#666"
              />
            </TouchableOpacity>
          )}
        </View>
        {renderExcretionItem(item.lastExcretion, true)}
        {hasMultipleExcretions && isExpanded && (
          <View style={styles.expandedContent}>
            <View style={styles.separator} />
            <Text style={styles.historyLabel}>Historique du jour</Text>
            {item.excretions
              .filter((excretion) => excretion.id !== item.lastExcretion.id)
              .map((excretion) => renderExcretionItem(excretion))}
          </View>
        )}
      </View>
    );
  }, [expandedDays, renderExcretionItem, toggleExpand]);

  // ============================================
  // RENDER - MAIN
  // ============================================

  return (
    <View style={styles.container}>
      <SafeAreaView
        style={[
          { flex: 1 },
          { backgroundColor: Colors[colorScheme].background },
        ]}
        edges={["bottom"]}
        onLayout={() => setLayoutReady(true)}
      >
        <View>
          {/* Filtres */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.filterContainer}
            contentContainerStyle={styles.filterContent}
          >
            <Pressable
              onPress={() => handleFilterPress("today")}
              style={[
                styles.filterButton,
                selectedFilter === "today" && {
                  backgroundColor: Colors[colorScheme].tint,
                },
              ]}
            >
              <ThemedText
                style={[
                  styles.filterText,
                  selectedFilter === "today" && styles.filterTextActive,
                ]}
              >
                Aujourd&apos;hui
              </ThemedText>
            </Pressable>

            <Pressable
              onPress={() => handleFilterPress("past")}
              style={[
                styles.filterButton,
                selectedFilter === "past" && {
                  backgroundColor: Colors[colorScheme].tint,
                },
              ]}
            >
              <ThemedText
                style={[
                  styles.filterText,
                  selectedFilter === "past" && styles.filterTextActive,
                ]}
              >
                Passés
              </ThemedText>
            </Pressable>
          </ScrollView>

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
        <ConfirmModal
          visible={showDeleteModal}
          title="Suppression"
          message="Voulez-vous vraiment supprimer ?"
          confirmText="Supprimer"
          cancelText="Annuler"
          backgroundColor={Colors[colorScheme].background}
          textColor={Colors[colorScheme].text}
          onCancel={() => setShowDeleteModal(false)}
          onConfirm={confirmDelete}
        />
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
    paddingVertical: 16,
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
  // Filter Bar
  filterContainer: {
    borderBottomWidth: 1,
    borderBottomColor: "#e0e0e0",
  },
  filterContent: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 8,
  },
  filterButton: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 20,
    backgroundColor: "#f0f0f0",
    alignItems: "center",
    justifyContent: "center",
  },
  filterText: {
    fontSize: 14,
    fontWeight: "600",
  },
  filterTextActive: {
    color: "#fff",
  },
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 20,
  },

  // Day Card
  dayCard: {
    backgroundColor: "white",
    marginBottom: 12,
    borderRadius: 12,
    padding: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  dayHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  dayInfo: {
    flex: 1,
  },
  dayDate: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#333",
    marginBottom: 4,
  },
  summaryInfo: {
    flexDirection: "column",
    gap: 4,
  },
  summaryRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  summaryBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#f8f9fa",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  summaryText: {
    fontSize: 13,
    color: "#666",
    fontWeight: "500",
  },
  expandButton: {
    padding: 8,
    borderRadius: 8,
    backgroundColor: "#f0f0f0",
  },

  // Excretion Item
  excretionItem: {
    backgroundColor: "#f8f9fa",
    borderRadius: 8,
    padding: 12,
    marginBottom: 8,
  },
  lastExcretionItem: {
    backgroundColor: "#e8f4fd",
    borderLeftWidth: 4,
    borderLeftColor: "#4A90E2",
  },
  excretionContent: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
  },
  excretionInfo: {
    flex: 1,
  },
  infoRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 2,
  },
  timeText: {
    fontSize: 14,
    color: "#666",
  },
  excretionTypeText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#333",
  },
  excretionActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  editIcon: {
    opacity: 0.7,
  },

  // Expanded Content
  expandedContent: {
    marginTop: 8,
  },
  separator: {
    height: 1,
    backgroundColor: "#eee",
    marginBottom: 12,
  },
  historyLabel: {
    fontSize: 12,
    color: "#999",
    marginBottom: 8,
    textTransform: "uppercase",
    letterSpacing: 0.5,
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

  // Modal Content
  modalCategoryLabel: {
    alignSelf: "center",
    fontSize: 16,
    fontWeight: "600",
    color: "#333",
    paddingTop: 20,
    marginBottom: 10,
  },

  // Type Selection
  typeRow: {
    flexDirection: "row",
    justifyContent: "space-around",
    marginBottom: 16,
    gap: 12,
  },
  typeButton: {
    flex: 1,
    flexDirection: "column",
    alignItems: "center",
    gap: 8,
    padding: 16,
    backgroundColor: "#f0f0f0",
    borderRadius: 12,
  },
  typeButtonActiveMiction: {
    backgroundColor: "#17a2b8",
  },
  typeButtonActiveSelle: {
    backgroundColor: "#dc3545",
  },
  typeButtonDisabled: {
    backgroundColor: "#f8f8f8",
    opacity: 0.5,
  },
  typeText: {
    fontSize: 16,
    color: "#666",
    fontWeight: "500",
  },
  typeTextActive: {
    color: "white",
    fontWeight: "bold",
  },
  typeTextDisabled: {
    color: "#ccc",
  },
  toggleSubtitle: {
    fontSize: 13,
    color: "#999",
    textAlign: "center",
    marginBottom: 12,
  },
  warningText: {
    fontSize: 13,
    color: "#dc3545",
    textAlign: "center",
    marginTop: 8,
    marginBottom: 12,
    fontWeight: "500",
  },
  editModeLabel: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: "#f8f9fa",
    borderRadius: 8,
    marginBottom: 20,
  },
  editModeLabelText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#666",
  },

  // Date/Time
  dateTimeContainer: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 12,
    marginBottom: 10,
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
  dateButtonDisabled: {
    backgroundColor: "#f5f5f5",
    opacity: 0.5,
  },
  dateButtonText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#4a4f55",
  },
  dateButtonTextDisabled: {
    color: "#ccc",
  },
  selectedDateTime: {
    alignItems: "center",
    marginBottom: 16,
  },
  selectedDate: {
    fontSize: 16,
    color: "#333",
    fontWeight: "600",
    marginBottom: 4,
  },
  selectedTime: {
    fontSize: 20,
    color: "#004cdaff",
    fontWeight: "bold",
  },
  avatar: {
    width: 46,
    height: 46,
    borderRadius: 28,
    alignItems: "center",
    justifyContent: "center",
  },
});
