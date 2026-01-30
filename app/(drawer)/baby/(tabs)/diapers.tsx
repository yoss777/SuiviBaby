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
  getNextEventDateBeforeHybrid,
  hasMoreEventsBeforeHybrid,
} from "@/migration/eventsHybridService";
import { Ionicons } from "@expo/vector-icons";
import FontAwesome from "@expo/vector-icons/FontAwesome5";
import DateTimePicker from "@react-native-community/datetimepicker";
import { useNetInfo } from "@react-native-community/netinfo";
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

// Types pour les attributs miction/selle
type MictionCouleur = "claire" | "jaune" | "foncee" | "autre";
type SelleConsistance = "liquide" | "molle" | "normale" | "dure";
type SelleQuantite = "peu" | "moyen" | "beaucoup";

interface Excretion {
  id: string;
  type?: ExcretionType;
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
  const { openSheet, closeSheet, viewProps, isOpen } = useSheet();
  const headerOwnerId = useRef(
    `diapers-${Math.random().toString(36).slice(2)}`,
  );
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
  const [groupedExcretions, setGroupedExcretions] = useState<ExcretionGroup[]>(
    [],
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

  // États du formulaire
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [editingExcretion, setEditingExcretion] = useState<Excretion | null>(
    null,
  );
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [includeMiction, setIncludeMiction] = useState<boolean>(true);
  const [includeSelle, setIncludeSelle] = useState<boolean>(false);
  const [dateHeure, setDateHeure] = useState<Date>(new Date());

  // États des pickers
  const [showDate, setShowDate] = useState(false);
  const [showTime, setShowTime] = useState(false);

  // États des attributs miction
  const [mictionCouleur, setMictionCouleur] = useState<MictionCouleur | null>(
    null,
  );

  // États des attributs selle
  const [selleConsistance, setSelleConsistance] =
    useState<SelleConsistance | null>(null);
  const [selleQuantite, setSelleQuantite] = useState<SelleQuantite | null>(
    null,
  );

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
          today.getMonth() + 1,
        ).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
        setSelectedDate(todayString);
        setSelectedFilter(null);
      }

      return newValue;
    });
  }, []);

  const prepareAddModal = useCallback(
    (preferredType?: "mictions" | "selles") => {
      setDateHeure(new Date());
      setEditingExcretion(null);
      setIsSubmitting(false);

      // Réinitialiser tous les attributs
      setMictionCouleur(null);
      setSelleConsistance(null);
      setSelleQuantite(null);

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
    },
    [],
  );

  const openAddModal = useCallback(
    (preferredType?: "mictions" | "selles") => {
      prepareAddModal(preferredType);
      setPendingMode("add");
      setPendingOpen(true);
    },
    [prepareAddModal],
  );

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
    }, [colorScheme, returnTarget, setHeaderLeft]),
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
    }, [closeSheet, isOpen, returnTarget, router]),
  );

  useFocusEffect(
    useCallback(() => {
      if (openModal !== "true") return;
      setPendingMode("add");
      setPendingOpen(true);
    }, [openModal]),
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
    const target = excretions.find(
      (excretion) => excretion.id === normalizedId,
    );
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
        (a, b) => (b.date?.seconds || 0) - (a.date?.seconds || 0),
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
      { waitForServer: true, depuis: startOfRange, jusqu: endOfRange },
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
      { waitForServer: true, depuis: startOfRange, jusqu: endOfRange },
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
    [hasMore, activeChild?.id, autoLoadMoreAttempts, daysWindow, rangeEndDate],
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

  const groupExcretionsByDay = (excretions: Excretion[]): ExcretionGroup[] => {
    const groups: { [key: string]: Excretion[] } = {};

    excretions.forEach((excretion) => {
      const date = new Date(excretion.date?.seconds * 1000);
      const dateKey = `${date.getFullYear()}-${String(
        date.getMonth() + 1,
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
          (e) => e.type === "miction",
        ).length;
        const sellesCount = excretions.filter((e) => e.type === "selle").length;
        const lastExcretion = excretions.reduce((latest, current) =>
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
          excretions: excretions.sort(
            (a, b) => (b.date?.seconds || 0) - (a.date?.seconds || 0),
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
    if (type === "miction") return eventColors.miction.dark;
    if (type === "selle") return eventColors.selle.dark;
    return eventColors.default.dark;
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

    // Charger les attributs existants
    if (type === "miction") {
      setMictionCouleur(excretion.couleur || null);
      // Réinitialiser les attributs selle
      setSelleConsistance(null);
      setSelleQuantite(null);
    } else {
      setSelleConsistance(excretion.consistance || null);
      setSelleQuantite(excretion.quantite || null);
      // Réinitialiser les attributs miction
      setMictionCouleur(null);
    }

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
        "Veuillez sélectionner au moins un type (miction ou selle)",
      );
      return;
    }

    try {
      setIsSubmitting(true);

      if (editingExcretion) {
        // Mode édition : modifier l'excrétion existante
        const isMiction = editingExcretion.type === "miction";
        if (isMiction) {
          const mictionData: { date: Date; couleur?: MictionCouleur } = {
            date: dateHeure,
          };
          if (mictionCouleur) {
            mictionData.couleur = mictionCouleur;
          }
          await modifierMiction(
            activeChild.id,
            editingExcretion.id,
            mictionData,
          );
        } else {
          const selleData: {
            date: Date;
            consistance?: SelleConsistance;
            quantite?: SelleQuantite;
          } = {
            date: dateHeure,
          };
          if (selleConsistance) {
            selleData.consistance = selleConsistance;
          }
          if (selleQuantite) {
            selleData.quantite = selleQuantite;
          }
          await modifierSelle(activeChild.id, editingExcretion.id, selleData);
        }
      } else {
        // Mode ajout : ajouter une ou deux excrétions
        if (includeMiction) {
          const mictionData: { date: Date; couleur?: MictionCouleur } = {
            date: dateHeure,
          };
          if (mictionCouleur) {
            mictionData.couleur = mictionCouleur;
          }
          await ajouterMiction(activeChild.id, mictionData);
        }
        if (includeSelle) {
          const selleData: {
            date: Date;
            consistance?: SelleConsistance;
            quantite?: SelleQuantite;
          } = {
            date: dateHeure,
          };
          if (selleConsistance) {
            selleData.consistance = selleConsistance;
          }
          if (selleQuantite) {
            selleData.quantite = selleQuantite;
          }
          await ajouterSelle(activeChild.id, selleData);
        }
      }

      if (isOffline) {
        showToast(
          editingExcretion
            ? "Modification en attente de synchronisation"
            : "Ajout en attente de synchronisation",
        );
      }
      closeModal();
    } catch (error) {
      console.error("Erreur lors de la sauvegarde:", error);
      showAlert("Erreur", "Impossible de sauvegarder. Veuillez réessayer.");
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
                  color={includeMiction ? "white" : eventColors.miction.dark}
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
                  color={includeSelle ? "white" : eventColors.selle.dark}
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

        {/* Options pour Miction */}
        {includeMiction && (
          <>
            <Text style={styles.modalCategoryLabel}>Couleur de l'urine</Text>
            <Text style={styles.toggleSubtitle}>Optionnel</Text>
            <View style={styles.optionsRow}>
              {(
                [
                  { value: "claire", label: "Claire", color: "#e8f4f8" },
                  { value: "jaune", label: "Jaune", color: "#fff3cd" },
                  { value: "foncee", label: "Foncée", color: "#f5c87b" },
                  { value: "autre", label: "Autre", color: "#e0e0e0" },
                ] as const
              ).map((option) => (
                <TouchableOpacity
                  key={option.value}
                  style={[
                    styles.optionButton,
                    { backgroundColor: option.color },
                    mictionCouleur === option.value &&
                      styles.optionButtonSelected,
                    isSubmitting && styles.optionButtonDisabled,
                  ]}
                  onPress={() =>
                    setMictionCouleur((prev) =>
                      prev === option.value ? null : option.value,
                    )
                  }
                  disabled={isSubmitting}
                  activeOpacity={0.7}
                >
                  <Text
                    style={[
                      styles.optionText,
                      // mictionCouleur === option.value && styles.optionTextSelectedMiction,
                    ]}
                  >
                    {option.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </>
        )}

        {/* Options pour Selle */}
        {includeSelle && (
          <>
            <Text style={styles.modalCategoryLabel}>Consistance</Text>
            <Text style={styles.toggleSubtitle}>Optionnel</Text>
            <View style={styles.optionsRow}>
              {(
                [
                  { value: "liquide", label: "Liquide", icon: "tint" },
                  { value: "molle", label: "Molle", icon: "cloud" },
                  { value: "normale", label: "Normale", icon: "check-circle" },
                  { value: "dure", label: "Dure", icon: "circle" },
                ] as const
              ).map((option) => (
                <TouchableOpacity
                  key={option.value}
                  style={[
                    styles.optionButton,
                    styles.optionButtonSelle,
                    selleConsistance === option.value &&
                      styles.optionButtonSelectedSelle,
                    isSubmitting && styles.optionButtonDisabled,
                  ]}
                  onPress={() =>
                    setSelleConsistance((prev) =>
                      prev === option.value ? null : option.value,
                    )
                  }
                  disabled={isSubmitting}
                  activeOpacity={0.7}
                >
                  <FontAwesome
                    name={option.icon as any}
                    size={14}
                    color={
                      selleConsistance === option.value ? "white" : "#dc3545"
                    }
                    style={{ marginBottom: 4 }}
                  />
                  <Text
                    style={[
                      styles.optionText,
                      selleConsistance === option.value &&
                        styles.optionTextSelected,
                    ]}
                  >
                    {option.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.modalCategoryLabel}>Quantité</Text>
            <Text style={styles.toggleSubtitle}>Optionnel</Text>
            <View style={styles.optionsRow}>
              {(
                [
                  { value: "peu", label: "Peu" },
                  { value: "moyen", label: "Moyen" },
                  { value: "beaucoup", label: "Beaucoup" },
                ] as const
              ).map((option) => (
                <TouchableOpacity
                  key={option.value}
                  style={[
                    styles.optionButton,
                    styles.optionButtonSelle,
                    selleQuantite === option.value &&
                      styles.optionButtonSelectedSelle,
                    isSubmitting && styles.optionButtonDisabled,
                  ]}
                  onPress={() =>
                    setSelleQuantite((prev) =>
                      prev === option.value ? null : option.value,
                    )
                  }
                  disabled={isSubmitting}
                  activeOpacity={0.7}
                >
                  <Text
                    style={[
                      styles.optionText,
                      selleQuantite === option.value &&
                        styles.optionTextSelected,
                    ]}
                  >
                    {option.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </>
        )}

        <Text style={styles.modalCategoryLabel}>Date & Heure</Text>
        <View style={styles.dateTimeContainer}>
          <TouchableOpacity
            style={[
              styles.dateButton,
              isSubmitting && styles.dateButtonDisabled,
            ]}
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
            style={[
              styles.dateButton,
              isSubmitting && styles.dateButtonDisabled,
            ]}
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
          ? eventColors.default.dark
          : includeMiction
            ? eventColors.miction.dark
            : includeSelle
              ? eventColors.selle.dark
              : eventColors.default.dark,
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
    mictionCouleur,
    selleConsistance,
    selleQuantite,
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
          selectedDate.getDate(),
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
      const excretionColorKey: "miction" | "selle" =
        excretion.type === "miction" ? "miction" : "selle";

      return (
        <Pressable
          key={excretion.id}
          style={({ pressed }) => [
            styles.sessionCard,
            // isLast && {
            //   backgroundColor: eventColors[excretionColorKey].light + "40",
            //   borderBottomWidth: 0,
            // },
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
    [],
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
              {item.mictionsCount > 0 && (
                <View style={styles.dayStatItem}>
                  <Text
                    style={[
                      styles.dayStatValue,
                      { color: eventColors.miction.dark },
                    ]}
                  >
                    {item.mictionsCount}
                  </Text>
                  <Text style={styles.dayStatLabel}>
                    miction{item.mictionsCount > 1 ? "s" : ""}
                  </Text>
                </View>
              )}
              {item.mictionsCount > 0 && item.sellesCount > 0 && (
                <View style={styles.dayStatDivider} />
              )}
              {item.sellesCount > 0 && (
                <View style={styles.dayStatItem}>
                  <Text
                    style={[
                      styles.dayStatValue,
                      { color: eventColors.selle.dark },
                    ]}
                  >
                    {item.sellesCount}
                  </Text>
                  <Text style={styles.dayStatLabel}>
                    selle{item.sellesCount > 1 ? "s" : ""}
                  </Text>
                </View>
              )}
            </View>
          </View>

          {/* Stats breakdown */}
          {/* <View style={styles.statsBreakdown}>
            <View style={styles.statsBreakdownItem}>
              <View
                style={[
                  styles.statsBreakdownDot,
                  { backgroundColor: eventColors.miction.dark },
                ]}
              />
              <Text style={styles.statsBreakdownLabel}>Mictions</Text>
              <Text style={styles.statsBreakdownValue}>
                {item.mictionsCount}
              </Text>
            </View>
            <View style={styles.statsBreakdownItem}>
              <View
                style={[
                  styles.statsBreakdownDot,
                  { backgroundColor: eventColors.selle.dark },
                ]}
              />
              <Text style={styles.statsBreakdownLabel}>Selles</Text>
              <Text style={styles.statsBreakdownValue}>{item.sellesCount}</Text>
            </View>
          </View> */}

          {/* Sessions list */}
          <View style={styles.sessionsContainer}>
            {renderExcretionItem(item.lastExcretion, true)}

            {hasMultipleExcretions && (
              <>
                {isExpanded &&
                  item.excretions
                    .filter(
                      (excretion) => excretion.id !== item.lastExcretion.id,
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
    [expandedDays, renderExcretionItem, toggleExpand],
  );

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
    backgroundColor: eventColors.sommeil.light + "40",
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
    backgroundColor: eventColors.miction.dark,
  },

  typeButtonActiveSelle: {
    backgroundColor: eventColors.selle.dark,
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

  // Options Row (couleur miction, consistance selle, etc.)

  optionsRow: {
    flexDirection: "row",

    flexWrap: "wrap",

    justifyContent: "center",

    gap: 8,

    marginBottom: 16,

    paddingHorizontal: 8,
  },

  optionButton: {
    paddingHorizontal: 16,

    paddingVertical: 10,

    borderRadius: 20,

    borderWidth: 2,

    borderColor: "transparent",

    minWidth: 70,

    alignItems: "center",
  },

  optionButtonSelle: {
    backgroundColor: "#f8f9fa",

    borderColor: "#e0e0e0",
  },

  optionButtonSelected: {
    borderColor: eventColors.miction.dark,

    borderWidth: 2,

    shadowColor: eventColors.miction.dark,

    shadowOffset: { width: 0, height: 2 },

    shadowOpacity: 0.3,

    shadowRadius: 3,

    elevation: 3,
  },

  optionButtonSelectedSelle: {
    backgroundColor: eventColors.selle.dark,

    borderColor: eventColors.selle.dark,
  },

  optionButtonDisabled: {
    opacity: 0.5,
  },

  optionText: {
    fontSize: 14,

    fontWeight: "500",

    color: "#333",
  },

  optionTextSelected: {
    color: "white",

    fontWeight: "600",
  },

  optionTextSelectedMiction: {
    color: eventColors.miction.dark,

    fontWeight: "700",
  },

  warningText: {
    fontSize: 13,

    color: eventColors.selle.dark,

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
    color: "#374151",

    fontWeight: "600",
  },
});
