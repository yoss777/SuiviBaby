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
  ajouterVaccin,
  ajouterVitamine,
  modifierVaccin,
  modifierVitamine,
  supprimerVaccin,
  supprimerVitamine,
} from "@/migration/eventsDoubleWriteService";
import {
  ecouterVaccinsHybrid as ecouterVaccins,
  ecouterVitaminesHybrid as ecouterVitamines,
  getNextEventDateBeforeHybrid,
  hasMoreEventsBeforeHybrid,
} from "@/migration/eventsHybridService";
import { normalizeQuery } from "@/utils/text";
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
  TextInput,
  TouchableOpacity,
  View
} from "react-native";
import { Calendar, DateData } from "react-native-calendars";
import { SafeAreaView } from "react-native-safe-area-context";
import { useHeaderLeft, useHeaderRight } from "../../_layout";

// ============================================
// TYPES
// ============================================
type ImmunoType = "vitamine" | "vaccin";
type FilterType = "today" | "past";
type SheetStep = "form" | "vaccinPicker" | "vitaminePicker";

interface Immuno {
  id: string;
  type?: ImmunoType;
  date: { seconds: number };
  createdAt: { seconds: number };
  nomVaccin?: string;
  nomVitamine?: string;
  dosage?: string;
  lib?: string;
}

interface ImmunoGroup {
  date: string;
  dateFormatted: string;
  immunos: Immuno[];
  vitaminesCount: number;
  vaccinsCount: number;
  lastImmuno: Immuno;
}

// Liste des vaccins pour enfants de 0 à 3 ans
const VACCINS_LIST = [
  {
    nomVaccin: "BCG (Tuberculose)",
    dosage: null,
  },
  {
    nomVaccin: "Bronchiolite",
    dosage: null,
  },
  {
    nomVaccin: "DTCaP",
    dosage: "rappel",
  },
  {
    nomVaccin: "Diphtérie, Tétanos, Coqueluche, Polio, Haemophilus (DTCaP-Hib)",
    dosage: "1ère injection",
  },
  {
    nomVaccin: "Diphtérie, Tétanos, Coqueluche, Polio, Haemophilus (DTCaP-Hib)",
    dosage: "2ème injection",
  },
  {
    nomVaccin: "Diphtérie, Tétanos, Coqueluche, Polio, Haemophilus (DTCaP-Hib)",
    dosage: "3ème injection",
  },
  {
    nomVaccin: "Diphtérie, Tétanos, Coqueluche, Polio, Haemophilus (DTCaP-Hib)",
    dosage: "rappel",
  },
  {
    nomVaccin: "Grippe saisonnière",
    dosage: "",
  },
  {
    nomVaccin: "Hépatite B",
    dosage: "",
  },
  {
    nomVaccin: "Méningocoque A,C,W,Y",
    dosage: "1ère injection",
  },
  {
    nomVaccin: "Méningocoque A,C,W,Y",
    dosage: "rappel",
  },
  {
    nomVaccin: "Méningocoque B",
    dosage: "1ère injection",
  },
  {
    nomVaccin: "Méningocoque B",
    dosage: "rappel",
  },
  {
    nomVaccin: "Pneumocoque (PCV13)",
    dosage: "1ère injection",
  },
  {
    nomVaccin: "Pneumocoque (PCV13)",
    dosage: "2ème injection",
  },
  {
    nomVaccin: "Pneumocoque (PCV13)",
    dosage: "3ème injection",
  },
  {
    nomVaccin: "Pneumocoque (PCV13)",
    dosage: "rappel",
  },
  {
    nomVaccin: "ROR (Rougeole, Oreillons, Rubéole)",
    dosage: "1ère injection",
  },
  {
    nomVaccin: "ROR (Rougeole, Oreillons, Rubéole)",
    dosage: "2ème injection",
  },
  {
    nomVaccin: "Rotavirus",
    dosage: "1ère injection",
  },
  {
    nomVaccin: "Rotavirus",
    dosage: "2ème injection",
  },
  {
    nomVaccin: "Rotavirus",
    dosage: "3ème injection",
  },
  {
    nomVaccin: "Varicelle",
    dosage: "",
  },
  {
    nomVaccin: "Autre vaccin",
    dosage: "",
  },
];

const VITAMINES_LIST = ["Vitamine D", "Vitamine K"];

// ============================================
// COMPONENT
// ============================================

export default function ImmunizationsScreen() {
  const { activeChild } = useBaby();
  const { setHeaderRight } = useHeaderRight();
  const colorScheme = useColorScheme() ?? "light";
  const { openSheet, closeSheet, viewProps, isOpen } = useSheet();
  const headerOwnerId = useRef(
    `immunizations-${Math.random().toString(36).slice(2)}`,
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
  const [selectedType, setSelectedType] = useState<ImmunoType>("vitamine");
  const [layoutReady, setLayoutReady] = useState(false);
  const [pendingOpen, setPendingOpen] = useState(false);
  const [pendingMode, setPendingMode] = useState<"add" | "edit" | null>(null);
  const sheetOwnerId = "immunizations";
  const isSheetActive = viewProps?.ownerId === sheetOwnerId;

  // États des données
  const [immunos, setImmunos] = useState<Immuno[]>([]);
  const [groupedImmunos, setGroupedImmunos] = useState<ImmunoGroup[]>([]);
  const [expandedDays, setExpandedDays] = useState<Set<string>>(new Set());
  const [vitaminesLoaded, setVitaminesLoaded] = useState(false);
  const [vaccinsLoaded, setVaccinsLoaded] = useState(false);
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
  const [editingImmuno, setEditingImmuno] = useState<Immuno | null>(null);
  const [immunoType, setImmunoType] = useState<ImmunoType>("vitamine");
  const [dateHeure, setDateHeure] = useState<Date>(new Date());
  const [selectedVaccinName, setSelectedVaccinName] = useState<string>("");
  const [selectedVaccinDosage, setSelectedVaccinDosage] = useState<string>("");
  const [selectedVitamine, setSelectedVitamine] =
    useState<string>("Vitamine D");
  const [gouttesCount, setGouttesCount] = useState<number>(3);
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [sheetStep, setSheetStep] = useState<SheetStep>("form");
  const [showDeleteModal, setShowDeleteModal] = useState(false);

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
          today.getMonth() + 1,
        ).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
        setSelectedDate(todayString);
        setSelectedFilter(null);
      }

      return newValue;
    });
  }, []);

  const prepareAddModal = useCallback(
    (preferredType?: "vitamines" | "vaccins") => {
      setDateHeure(new Date());
      setEditingImmuno(null);
      setIsSubmitting(false);
      setSelectedVaccinName("");
      setSelectedVaccinDosage("");
      setSelectedVitamine("Vitamine D");
      setGouttesCount(3);
      setSearchQuery("");
      setSheetStep("form");

      // Si un type préféré est spécifié, l'utiliser
      // Sinon, utiliser le filtre actif
      const typeToUse =
        preferredType === "vaccins"
          ? "vaccin"
          : preferredType === "vitamines"
            ? "vitamine"
            : selectedType;

      setImmunoType(typeToUse);
    },
    [selectedType],
  );

  const openAddModal = useCallback(
    (preferredType?: "vitamines" | "vaccins") => {
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
    if (tab === "vaccins") {
      setImmunoType("vaccin");
    } else if (tab === "vitamines") {
      setImmunoType("vitamine");
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
        prepareAddModal(tab as "vitamines" | "vaccins" | undefined);
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
    const target = immunos.find((immuno) => immuno.id === normalizedId);
    if (!target) return;
    stashReturnTo();
    editIdRef.current = normalizedId;
    openEditModal(target);
    navigation.setParams({ openModal: undefined, editId: undefined });
  }, [editId, layoutReady, immunos, router, returnTo]);

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

    let vitaminesData: Immuno[] = [];
    let vaccinsData: Immuno[] = [];

    const mergeAndSortImmunos = () => {
      const merged = [...vitaminesData, ...vaccinsData].sort(
        (a, b) => (b.date?.seconds || 0) - (a.date?.seconds || 0),
      );
      setImmunos(merged);
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

    const unsubscribeVitamines = ecouterVitamines(
      activeChild.id,
      (vitamines) => {
        vitaminesData = vitamines.map((v) => ({
          ...v,
          type: "vitamine" as ImmunoType,
        }));
        setVitaminesLoaded(true);
        mergeAndSortImmunos();
      },
      { waitForServer: true, depuis: startOfRange, jusqu: endOfRange },
    );

    const unsubscribeVaccins = ecouterVaccins(
      activeChild.id,
      (vaccins) => {
        vaccinsData = vaccins.map((v) => ({
          ...v,
          type: "vaccin" as ImmunoType,
        }));
        setVaccinsLoaded(true);
        mergeAndSortImmunos();
      },
      { waitForServer: true, depuis: startOfRange, jusqu: endOfRange },
    );

    return () => {
      unsubscribeVitamines();
      unsubscribeVaccins();
    };
  }, [activeChild, daysWindow, rangeEndDate]);

  useEffect(() => {
    if (!activeChild?.id) return;
    setImmunos([]);
    setGroupedImmunos([]);
    setVitaminesLoaded(false);
    setVaccinsLoaded(false);
    setEmptyDelayDone(false);
    setDaysWindow(14);
    setRangeEndDate(null);
    setIsLoadingMore(false);
    setHasMore(true);
    setAutoLoadMore(false);
    setAutoLoadMoreAttempts(0);
    loadMoreVersionRef.current = 0;
    pendingLoadMoreRef.current = 0;
  }, [activeChild?.id]);

  const isImmunosLoading =
    selectedType === "vitamine" ? !vitaminesLoaded : !vaccinsLoaded;

  useEffect(() => {
    if (!activeChild?.id) return;
    let cancelled = false;
    const endOfToday = new Date();
    endOfToday.setHours(23, 59, 59, 999);
    const types = selectedType === "vitamine" ? "vitamine" : "vaccin";

    getNextEventDateBeforeHybrid(activeChild.id, types, endOfToday)
      .then((nextDate) => {
        if (cancelled) return;
        setDaysWindow(14);
        setRangeEndDate(nextDate ?? endOfToday);
      })
      .catch(() => {
        if (cancelled) return;
        setDaysWindow(14);
        setRangeEndDate(endOfToday);
      });

    return () => {
      cancelled = true;
    };
  }, [activeChild?.id, selectedType]);

  useEffect(() => {
    if (isImmunosLoading) {
      setEmptyDelayDone(false);
      return;
    }
    if (groupedImmunos.length > 0) {
      setEmptyDelayDone(true);
      return;
    }
    const timer = setTimeout(() => setEmptyDelayDone(true), 300);
    return () => clearTimeout(timer);
  }, [isImmunosLoading, groupedImmunos.length, selectedType]);

  const loadMoreStep = useCallback(
    async (auto = false) => {
      if (!hasMore || !activeChild?.id) return;
      setIsLoadingMore(true);
      pendingLoadMoreRef.current = 2;
      loadMoreVersionRef.current += 1;

      const endOfRange = rangeEndDate ? new Date(rangeEndDate) : new Date();
      endOfRange.setHours(23, 59, 59, 999);
      const startOfRange = new Date(endOfRange);
      startOfRange.setHours(0, 0, 0, 0);
      startOfRange.setDate(startOfRange.getDate() - (daysWindow - 1));
      const beforeDate = new Date(startOfRange.getTime() - 1);

      const types = selectedType === "vitamine" ? "vitamine" : "vaccin";
      const nextEventDate = await getNextEventDateBeforeHybrid(
        activeChild.id,
        types,
        beforeDate,
      );

      if (nextEventDate) {
        const startOfNext = new Date(nextEventDate);
        startOfNext.setHours(0, 0, 0, 0);
        const diffDays =
          Math.floor(
            (endOfRange.getTime() - startOfNext.getTime()) /
              (24 * 60 * 60 * 1000),
          ) + 1;
        setDaysWindow((prev) => Math.max(prev, diffDays));
      } else {
        setHasMore(false);
        pendingLoadMoreRef.current = 0;
        setIsLoadingMore(false);
        setAutoLoadMore(false);
      }

      if (!auto) {
        setAutoLoadMore(true);
        setAutoLoadMoreAttempts(0);
      }
    },
    [
      hasMore,
      activeChild?.id,
      daysWindow,
      rangeEndDate,
      selectedType,
      setHasMore,
    ],
  );

  const handleLoadMore = useCallback(() => {
    loadMoreStep(false);
  }, [loadMoreStep]);

  useEffect(() => {
    if (selectedFilter === "today" || selectedDate) return;
    if (
      !autoLoadMore &&
      !isImmunosLoading &&
      groupedImmunos.length === 0 &&
      hasMore
    ) {
      setAutoLoadMore(true);
      setAutoLoadMoreAttempts(0);
    }
  }, [
    autoLoadMore,
    isImmunosLoading,
    groupedImmunos.length,
    hasMore,
    selectedFilter,
    selectedDate,
  ]);

  useEffect(() => {
    if (!autoLoadMore) return;
    if (isImmunosLoading || isLoadingMore) return;
    if (groupedImmunos.length > 0 || !hasMore) {
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
    isImmunosLoading,
    isLoadingMore,
    groupedImmunos.length,
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

    const types = selectedType === "vitamine" ? "vitamine" : "vaccin";

    // Recalculer hasMore uniquement quand la fenêtre change pour éviter les requêtes inutiles.
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
  }, [activeChild?.id, daysWindow, selectedType, rangeEndDate]);

  // Filtrage et regroupement par jour
  useEffect(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayTime = today.getTime();

    // Filtrer par type sélectionné
    const filteredByType = immunos.filter(
      (immuno) => immuno.type === selectedType,
    );

    // Filtrer par date
    const filtered = filteredByType.filter((immuno) => {
      const immunoDate = new Date(immuno.date.seconds * 1000);
      immunoDate.setHours(0, 0, 0, 0);
      const immunoTime = immunoDate.getTime();

      if (selectedDate) {
        const [calYear, calMonth, calDay] = selectedDate.split("-").map(Number);
        const calDate = new Date(calYear, calMonth - 1, calDay);
        calDate.setHours(0, 0, 0, 0);
        return immunoTime === calDate.getTime();
      }

      switch (selectedFilter) {
        case "today":
          return immunoTime === todayTime;
        case "past":
          return immunoTime < todayTime;
        case null:
        default:
          return true;
      }
    });

    const grouped = groupImmunosByDay(filtered);
    setGroupedImmunos(grouped);
  }, [immunos, selectedFilter, selectedDate, selectedType]);

  // ============================================
  // HELPERS - CALENDAR
  // ============================================

  const markedDates = useMemo(() => {
    const marked: Record<string, any> = {};

    immunos.forEach((immuno) => {
      const date = new Date(immuno.date.seconds * 1000);
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
  }, [immunos, selectedDate, colorScheme]);

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

  const groupImmunosByDay = (immunos: Immuno[]): ImmunoGroup[] => {
    const groups: { [key: string]: Immuno[] } = {};

    immunos.forEach((immuno) => {
      const date = new Date(immuno.date?.seconds * 1000);
      const dateKey = `${date.getFullYear()}-${String(
        date.getMonth() + 1,
      ).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;

      if (!groups[dateKey]) {
        groups[dateKey] = [];
      }
      groups[dateKey].push(immuno);
    });

    return Object.entries(groups)
      .map(([dateKey, immunos]) => {
        const date = new Date(dateKey);
        const vitaminesCount = immunos.filter(
          (i) => i.type === "vitamine",
        ).length;
        const vaccinsCount = immunos.filter((i) => i.type === "vaccin").length;
        const lastImmuno = immunos.reduce((latest, current) =>
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
          immunos: immunos.sort(
            (a, b) => (b.date?.seconds || 0) - (a.date?.seconds || 0),
          ),
          vitaminesCount,
          vaccinsCount,
          lastImmuno,
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

  const getImmunoTypeLabel = (type?: ImmunoType): string => {
    if (!type) return "Inconnu";
    return type === "vitamine" ? "Vitamine" : "Vaccin";
  };

  const getImmunoIcon = (type?: ImmunoType): string => {
    if (type === "vitamine") return "pills";
    if (type === "vaccin") return "syringe";
    return "question";
  };

  const getImmunoColor = (type?: ImmunoType): string => {
    if (type === "vitamine") return eventColors.vitamine.dark;
    if (type === "vaccin") return eventColors.vaccin.dark;
    return eventColors.default.dark;
  };

  const getImmunoName = (immuno: Immuno): string => {
    if (immuno.type === "vaccin") {
      return immuno.nomVaccin || immuno.lib || "Vaccin non spécifié";
    }
    return immuno.nomVitamine || "Vitamine";
  };

  const deleteTargetLabel = editingImmuno
    ? `${getImmunoTypeLabel(editingImmuno.type)} "${getImmunoName(editingImmuno)}"`
    : "element";

  const getVaccinDisplay = (nomVaccin: string, dosage?: string | null) =>
    // dosage && dosage.length > 0 ? `${nomVaccin} (${dosage})` : nomVaccin;
    dosage && dosage.length > 0 ? `${nomVaccin} · ${dosage}` : nomVaccin;

  const selectVaccin = (vaccin: {
    nomVaccin: string;
    dosage: string | null;
  }) => {
    setSelectedVaccinName(vaccin.nomVaccin);
    setSelectedVaccinDosage(vaccin.dosage ?? "");
    setSearchQuery("");
    setSheetStep("form");
  };

  const selectVitamine = (vitamine: string) => {
    setSelectedVitamine(vitamine);
    setSearchQuery("");
    setSheetStep("form");
  };

  const filteredVaccins = VACCINS_LIST.filter((vaccin) =>
    normalizeQuery(vaccin.nomVaccin).includes(normalizeQuery(searchQuery)),
  );
  const filteredVitamines = VITAMINES_LIST.filter((vitamine) =>
    normalizeQuery(vitamine).includes(normalizeQuery(searchQuery)),
  );

  // ============================================
  // HANDLERS - MODAL
  // ============================================

  const openEditModal = (immuno: Immuno) => {
    setDateHeure(new Date(immuno.date.seconds * 1000));
    setEditingImmuno(immuno);
    setIsSubmitting(false);
    setSearchQuery("");
    setSheetStep("form");

    const type = immuno.type || "vitamine";
    setImmunoType(type);

    if (type === "vaccin") {
      setSelectedVaccinName(immuno.nomVaccin || immuno.lib || "");
      setSelectedVaccinDosage(immuno.dosage || "");
    } else {
      setSelectedVitamine(immuno.nomVitamine || "Vitamine D");
      const dosage = String(immuno.dosage || "");
      const match = dosage.match(/\d+/);
      setGouttesCount(match ? Number.parseInt(match[0], 10) : 3);
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

    // Validation pour les vaccins
    if (immunoType === "vaccin" && !selectedVaccinName.trim()) {
      showAlert("Attention", "Veuillez sélectionner un vaccin");
      return;
    }

    try {
      setIsSubmitting(true);

      const isVitamine = immunoType === "vitamine";
      const dataToSave = {
        date: dateHeure,
        ...(immunoType === "vitamine" && {
          nomVitamine: selectedVitamine || "Vitamine D",
          ...(selectedVitamine === "Vitamine D" && {
            dosage: `${gouttesCount} gouttes`,
          }),
        }),
        ...(immunoType === "vaccin" && {
          nomVaccin: selectedVaccinName,
          ...(selectedVaccinDosage && { dosage: selectedVaccinDosage }),
        }),
      };

      if (editingImmuno) {
        // Modification
        if (isVitamine) {
          await modifierVitamine(activeChild.id, editingImmuno.id, dataToSave);
        } else {
          await modifierVaccin(activeChild.id, editingImmuno.id, dataToSave);
        }
      } else {
        // Ajout
        if (isVitamine) {
          await ajouterVitamine(activeChild.id, dataToSave);
        } else {
          await ajouterVaccin(activeChild.id, dataToSave);
        }
      }

      if (isOffline) {
        showToast(
          editingImmuno
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
    if (isSubmitting || !editingImmuno || !activeChild) return;
    setShowDeleteModal(true);
  };

  const confirmDelete = async () => {
    if (isSubmitting || !editingImmuno || !activeChild) return;

    try {
      setIsSubmitting(true);
      const isVitamine = editingImmuno.type === "vitamine";
      if (isVitamine) {
        await supprimerVitamine(activeChild.id, editingImmuno.id);
      } else {
        await supprimerVaccin(activeChild.id, editingImmuno.id);
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
    if (sheetStep === "vaccinPicker") {
      return (
        <>
          <View style={styles.sheetBreadcrumb}>
            <Pressable
              style={styles.sheetBackButton}
              onPress={() => setSheetStep("form")}
            >
              <FontAwesome name="chevron-left" size={14} color="#666" />
              <Text style={styles.sheetBackText}>Retour</Text>
            </Pressable>
            <Text style={styles.sheetBreadcrumbText}>
              Immunos / Vaccins / Choisir
            </Text>
          </View>
          <View style={styles.searchContainer}>
            <FontAwesome
              name="search"
              size={16}
              color="#999"
              style={styles.searchIcon}
            />
            <TextInput
              style={styles.searchInput}
              placeholder="Rechercher un vaccin..."
              value={searchQuery}
              onChangeText={setSearchQuery}
              autoFocus={true}
            />
            {searchQuery && (
              <TouchableOpacity
                style={styles.clearButton}
                onPress={() => setSearchQuery("")}
              >
                <FontAwesome name="times-circle" size={16} color="#999" />
              </TouchableOpacity>
            )}
          </View>
          <View style={styles.vaccinList}>
            {filteredVaccins.length > 0 ? (
              filteredVaccins.map((vaccin, index) => {
                const vaccinName = getVaccinDisplay(
                  vaccin.nomVaccin,
                  vaccin.dosage,
                );
                const isSelected =
                  selectedVaccinName === vaccin.nomVaccin &&
                  (selectedVaccinDosage || "") === (vaccin.dosage ?? "");
                return (
                  <TouchableOpacity
                    key={index}
                    style={[
                      styles.vaccinListItem,
                      isSelected && {
                        backgroundColor: Colors[colorScheme].tint + "20",
                      },
                    ]}
                    onPress={() => selectVaccin(vaccin)}
                    activeOpacity={0.7}
                  >
                    <FontAwesome
                      name="syringe"
                      size={16}
                      color={isSelected ? Colors[colorScheme].tint : "#666"}
                      style={styles.vaccinListItemIcon}
                    />
                    <Text
                      style={[
                        styles.vaccinListItemText,
                        isSelected && { color: "#000000" },
                        isSelected && styles.vaccinListItemTextSelected,
                      ]}
                    >
                      {vaccinName}
                    </Text>
                    {isSelected && (
                      <FontAwesome
                        name="check"
                        size={16}
                        color={Colors[colorScheme].tint}
                      />
                    )}
                  </TouchableOpacity>
                );
              })
            ) : (
              <Text style={styles.noResultsText}>Aucun vaccin trouvé</Text>
            )}
          </View>
        </>
      );
    }
    if (sheetStep === "vitaminePicker") {
      return (
        <>
          <View style={styles.sheetBreadcrumb}>
            <Pressable
              style={styles.sheetBackButton}
              onPress={() => setSheetStep("form")}
            >
              <FontAwesome name="chevron-left" size={14} color="#666" />
              <Text style={styles.sheetBackText}>Retour</Text>
            </Pressable>
            <Text style={styles.sheetBreadcrumbText}>
              Immunos / Vitamines / Choisir
            </Text>
          </View>
          <View style={styles.searchContainer}>
            <FontAwesome
              name="search"
              size={16}
              color="#999"
              style={styles.searchIcon}
            />
            <TextInput
              style={styles.searchInput}
              placeholder="Rechercher une vitamine..."
              value={searchQuery}
              onChangeText={setSearchQuery}
              autoFocus={true}
            />
            {searchQuery && (
              <TouchableOpacity
                style={styles.clearButton}
                onPress={() => setSearchQuery("")}
              >
                <FontAwesome name="times-circle" size={16} color="#999" />
              </TouchableOpacity>
            )}
          </View>
          <View style={styles.vaccinList}>
            {filteredVitamines.length > 0 ? (
              filteredVitamines.map((vitamine) => (
                <TouchableOpacity
                  key={vitamine}
                  style={[
                    styles.vaccinListItem,
                    selectedVitamine === vitamine && {
                      backgroundColor: Colors[colorScheme].tint + "20",
                    },
                  ]}
                  onPress={() => selectVitamine(vitamine)}
                  activeOpacity={0.7}
                >
                  <FontAwesome
                    name="pills"
                    size={16}
                    color={
                      selectedVitamine === vitamine
                        ? Colors[colorScheme].tint
                        : "#666"
                    }
                    style={styles.vaccinListItemIcon}
                  />
                  <Text
                    style={[
                      styles.vaccinListItemText,
                      selectedVitamine === vitamine && {
                        color: "#000",
                      },
                      selectedVitamine === vitamine &&
                        styles.vaccinListItemTextSelected,
                    ]}
                  >
                    {vitamine}
                  </Text>
                  {selectedVitamine === vitamine && (
                    <FontAwesome
                      name="check"
                      size={16}
                      color={Colors[colorScheme].tint}
                    />
                  )}
                </TouchableOpacity>
              ))
            ) : (
              <Text style={styles.noResultsText}>Aucune vitamine trouvée</Text>
            )}
          </View>
        </>
      );
    }
    return (
      <>
        {immunoType === "vaccin" && (
          <TouchableOpacity
            style={[
              styles.vaccinSelector,
              isSubmitting && styles.vaccinSelectorDisabled,
            ]}
            onPress={() => {
              if (!isSubmitting) {
                setSearchQuery("");
                setSheetStep("vaccinPicker");
              }
            }}
            disabled={isSubmitting}
          >
            <FontAwesome name="list" size={20} color="#666" />
            <Text
              style={[
                styles.vaccinSelectorText,
                selectedVaccinName && styles.vaccinSelectorTextSelected,
                isSubmitting && styles.vaccinSelectorTextDisabled,
              ]}
            >
              {selectedVaccinName
                ? getVaccinDisplay(selectedVaccinName, selectedVaccinDosage)
                : "Sélectionner un vaccin"}
            </Text>
            <FontAwesome name="chevron-right" size={16} color="#999" />
          </TouchableOpacity>
        )}

        {immunoType === "vitamine" && (
          <TouchableOpacity
            style={[
              styles.vaccinSelector,
              isSubmitting && styles.vaccinSelectorDisabled,
            ]}
            onPress={() => {
              if (!isSubmitting) {
                setSearchQuery("");
                setSheetStep("vitaminePicker");
              }
            }}
            disabled={isSubmitting}
          >
            <FontAwesome name="list" size={20} color="#666" />
            <Text
              style={[
                styles.vaccinSelectorText,
                selectedVitamine && styles.vaccinSelectorTextSelected,
                isSubmitting && styles.vaccinSelectorTextDisabled,
              ]}
            >
              {selectedVitamine || "Choisir une vitamine"}
            </Text>
            <FontAwesome name="chevron-right" size={16} color="#999" />
          </TouchableOpacity>
        )}

        {immunoType === "vitamine" && selectedVitamine === "Vitamine D" && (
          <>
            <Text style={styles.modalCategoryLabel}>Quantité</Text>
            <View style={styles.quantityPickerRow}>
              <TouchableOpacity
                style={[
                  styles.quantityButton,
                  isSubmitting && styles.quantityButtonDisabled,
                ]}
                onPress={() =>
                  setGouttesCount((value) => Math.max(0, value - 1))
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
              <Text style={styles.quantityPickerValue}>
                {gouttesCount} gouttes
              </Text>
              <TouchableOpacity
                style={[
                  styles.quantityButton,
                  isSubmitting && styles.quantityButtonDisabled,
                ]}
                onPress={() => setGouttesCount((value) => value + 1)}
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
      title: editingImmuno
        ? `Modifier ${immunoType === "vitamine" ? "vitamine" : "vaccin"}`
        : immunoType === "vitamine"
          ? "Nouvelle vitamine"
          : "Nouveau vaccin",
      icon: immunoType === "vitamine" ? "pills" : "syringe",
      accentColor: immunoType === "vitamine" ? "#FF9800" : "#9C27B0",
      isEditing: !!editingImmuno,
      isSubmitting,
      showActions: sheetStep === "form",
      enablePanDownToClose: sheetStep === "form",
      enableOverDrag: sheetStep === "form",
      onSubmit: handleSubmit,
      onDelete: editingImmuno ? handleDelete : undefined,
      children: renderSheetContent(),
      onDismiss: () => {
        setIsSubmitting(false);
        setEditingImmuno(null);
        setSelectedVaccinName("");
        setSelectedVaccinDosage("");
        setSearchQuery("");
        setSheetStep("form");
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
    editingImmuno,
    immunoType,
    isSubmitting,
    selectedVaccinName,
    selectedVaccinDosage,
    selectedVitamine,
    gouttesCount,
    searchQuery,
    sheetStep,
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
  // RENDER - IMMUNO ITEM
  // ============================================

  const renderImmunoItem = useCallback(
    (immuno: Immuno, isLast: boolean = false) => {
      const color = getImmunoColor(immuno.type);
      const name = getImmunoName(immuno);
      const typeLabel = getImmunoTypeLabel(immuno.type);
      const immunoDate = new Date(immuno.date?.seconds * 1000);

      return (
        <Pressable
          key={immuno.id}
          style={({ pressed }) => [
            styles.sessionCard,
            // isLast && { backgroundColor: color + "15" },
            pressed && styles.sessionCardPressed,
          ]}
          onPress={() => openEditModal(immuno)}
        >
          <View style={styles.sessionTime}>
            <Text
              style={[
                styles.sessionTimeText,
                isLast && styles.sessionTimeTextLast,
              ]}
            >
              {immunoDate.toLocaleTimeString("fr-FR", {
                hour: "2-digit",
                minute: "2-digit",
              })}
            </Text>
          </View>

          <View style={styles.sessionContent}>
            <View
              style={[
                styles.sessionIconWrapper,
                { backgroundColor: color + "20" },
              ]}
            >
              <FontAwesome
                name={immuno.type === "vaccin" ? "syringe" : "pills"}
                size={14}
                color={color}
              />
            </View>
            <View style={styles.sessionDetails}>
              <Text style={styles.sessionType} numberOfLines={3}>
                {name}
              </Text>
              {immuno.dosage && (
                <Text style={styles.sessionDetailText}>{immuno.dosage}</Text>
              )}
            </View>
          </View>

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
    ({ item }: { item: ImmunoGroup }) => {
      const isExpanded = expandedDays.has(item.date);
      const hasMultipleImmunos = item.immunos.length > 1;
      const accentColor = getImmunoColor(selectedType);

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

      const typeLabel = selectedType === "vitamine" ? "vitamine" : "vaccin";
      const breakdownLabel =
        selectedType === "vitamine" ? "Vitamine" : "Vaccin";

      return (
        <View style={styles.daySection}>
          {/* Day Header with stats (pumping style) */}
          <View style={styles.dayHeader}>
            <Text style={styles.dayLabel}>{formatDayLabel()}</Text>
            <View style={styles.dayStats}>
              <View style={styles.dayStatItem}>
                <Text style={[styles.dayStatValue, { color: accentColor }]}>
                  {item.immunos.length}
                </Text>
                <Text style={styles.dayStatLabel}>
                  {typeLabel}
                  {item.immunos.length > 1 ? "s" : ""}
                </Text>
              </View>
            </View>
          </View>

          {/* <View style={styles.statsBreakdown}>
            <View style={styles.statsBreakdownItem}>
              <View
                style={[
                  styles.statsBreakdownDot,
                  { backgroundColor: accentColor },
                ]}
              />
              <Text style={styles.statsBreakdownLabel}>
                {breakdownLabel}
                {item.immunos.length > 1 ? "s" : ""}
              </Text>
              <Text style={styles.statsBreakdownValue}>
                {item.immunos.length}
              </Text>
            </View>
          </View> */}

          {/* Cards container */}
          <View style={styles.sessionsContainer}>
            {renderImmunoItem(item.lastImmuno, true)}

            {hasMultipleImmunos && (
              <>
                {isExpanded &&
                  item.immunos
                    .filter((immuno) => immuno.id !== item.lastImmuno.id)
                    .map((immuno) => renderImmunoItem(immuno, false))}

                <Pressable
                  style={styles.expandTrigger}
                  onPress={() => toggleExpand(item.date)}
                >
                  <Text
                    style={[styles.expandTriggerText, { color: accentColor }]}
                  >
                    {isExpanded
                      ? "Masquer"
                      : `${item.immunos.length - 1} autre${item.immunos.length > 2 ? "s" : ""} ${typeLabel}${item.immunos.length > 2 ? "s" : ""}`}
                  </Text>
                  <Ionicons
                    name={isExpanded ? "chevron-up" : "chevron-down"}
                    size={14}
                    color={accentColor}
                  />
                </Pressable>
              </>
            )}
          </View>
        </View>
      );
    },
    [expandedDays, renderImmunoItem, toggleExpand, selectedType],
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
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
              paddingRight: 16,
            }}
          >
            {/* Filtres */}
            <DateFilterBar
              selected={selectedFilter}
              onSelect={handleFilterPress}
            />
            {/* Switch Vitamines/Vaccins */}
            <View style={styles.typeSwitchContainer}>
              <TouchableOpacity
                onPress={() => setSelectedType("vitamine")}
                style={[
                  styles.typeSwitchButton,
                  styles.typeSwitchButtonLeft,
                  selectedType === "vitamine" &&
                    styles.typeSwitchButtonActiveVitamine,
                ]}
                activeOpacity={0.7}
              >
                <FontAwesome
                  name="pills"
                  size={16}
                  color={
                    selectedType === "vitamine"
                      ? "white"
                      : eventColors.vitamine.dark
                  }
                />
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => setSelectedType("vaccin")}
                style={[
                  styles.typeSwitchButton,
                  styles.typeSwitchButtonRight,
                  selectedType === "vaccin" &&
                    styles.typeSwitchButtonActiveVaccin,
                ]}
                activeOpacity={0.7}
              >
                <FontAwesome
                  name="syringe"
                  size={16}
                  color={
                    selectedType === "vaccin"
                      ? "white"
                      : eventColors.vaccin.dark
                  }
                />
              </TouchableOpacity>
            </View>
          </View>

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

        {/* Liste des immunisations */}
        {isImmunosLoading || !emptyDelayDone ? (
          <View style={styles.emptyContainer}>
            <IconPulseDots color={Colors[colorScheme].tint} />
          </View>
        ) : groupedImmunos.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Ionicons
              name="calendar-outline"
              size={64}
              color={Colors[colorScheme].tabIconDefault}
            />
            <ThemedText style={styles.emptyText}>
              {immunos.length === 0
                ? "Aucune immunisation"
                : selectedType === "vitamine"
                  ? "Aucune vitamine pour ce filtre"
                  : "Aucun vaccin pour ce filtre"}
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
            data={groupedImmunos}
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
          message={`Voulez-vous vraiment supprimer ${deleteTargetLabel} ?`}
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
    marginBottom: 20,
  },
  dayHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8,
    paddingHorizontal: 4,
  },
  dayLabel: {
    fontSize: 13,
    fontWeight: "600",
    color: "#6b7280",
    textTransform: "uppercase",
    letterSpacing: 0.5,
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
    color: "#9ca3af",
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

  // Form Content
  modalCategoryLabel: {
    alignSelf: "center",
    fontSize: 16,
    fontWeight: "600",
    color: "#333",
    paddingTop: 20,
    marginBottom: 10,
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

  // Vaccin Selector
  vaccinSelector: {
    backgroundColor: "#f8f9fa",
    padding: 16,
    borderRadius: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderWidth: 1,
    borderColor: "#e9ecef",
    marginBottom: 20,
  },
  vaccinSelectorDisabled: {
    backgroundColor: "#f5f5f5",
    opacity: 0.5,
  },
  vaccinSelectorText: {
    flex: 1,
    fontSize: 16,
    color: "#999",
  },
  vaccinSelectorTextSelected: {
    color: "#333",
    fontWeight: "500",
  },
  vaccinSelectorTextDisabled: {
    color: "#ccc",
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
    color: eventColors.default.dark,
    fontWeight: "bold",
  },

  // Vaccin Picker Header
  sheetBreadcrumb: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  sheetBackButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 6,
    paddingHorizontal: 4,
  },
  sheetBackText: {
    fontSize: 14,
    color: "#666",
    fontWeight: "600",
  },
  sheetBreadcrumbText: {
    fontSize: 12,
    color: "#999",
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  vaccinList: {
    paddingBottom: 8,
  },
  vaccinListItem: {
    flexDirection: "row",
    alignItems: "center",
    padding: 16,
    gap: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#f0f0f0",
    borderRadius: 12,
  },
  vaccinListItemIcon: {
    width: 18,
    textAlign: "center",
  },
  vaccinListItemSelected: {
    backgroundColor: "transparent",
  },
  vaccinListItemText: {
    flex: 1,
    fontSize: 16,
    color: "#333",
  },
  vaccinListItemTextSelected: {
    fontWeight: "600",
  },
  searchContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#f8f9fa",
    borderRadius: 12,
    paddingHorizontal: 12,
    marginVertical: 12,
    borderWidth: 1,
    borderColor: "#e9ecef",
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    color: "#333",
    paddingVertical: 10,
  },
  searchIcon: {
    marginRight: 8,
  },
  clearButton: {
    padding: 8,
  },
  clearIcon: {
    marginLeft: 8,
  },
  noResultsText: {
    fontSize: 16,
    color: "#666",
    textAlign: "center",
    padding: 20,
  },

  // Type Switch
  typeSwitchContainer: {
    flexDirection: "row",
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#d7dbe0",
    borderRadius: 20,
    padding: 3,
    marginLeft: 8,
  },
  typeSwitchButton: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    minWidth: 44,
  },
  typeSwitchButtonLeft: {
    // borderTopRightRadius: 0,
    // borderBottomRightRadius: 0,
  },
  typeSwitchButtonRight: {
    // borderTopLeftRadius: 0,
    // borderBottomLeftRadius: 0,
  },
  typeSwitchButtonActiveVitamine: {
    backgroundColor: eventColors.vitamine.dark,
  },
  typeSwitchButtonActiveVaccin: {
    backgroundColor: eventColors.vaccin.dark,
  },
});
