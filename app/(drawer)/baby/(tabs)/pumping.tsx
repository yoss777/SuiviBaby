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
  ajouterPompage,
  modifierPompage,
  supprimerPompage,
} from "@/migration/eventsDoubleWriteService";
import {
  ecouterPompagesHybrid as ecouterPompages,
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
  const { openSheet, closeSheet, viewProps, isOpen } = useSheet();
  const { showAlert } = useModal();
  const headerOwnerId = useRef(
    `pumping-${Math.random().toString(36).slice(2)}`,
  );
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
  const sheetOwnerId = "pumping";
  const isSheetActive = viewProps?.ownerId === sheetOwnerId;

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

  // États du formulaire
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [editingPompage, setEditingPompage] = useState<Pompage | null>(null);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [dateHeure, setDateHeure] = useState<Date>(new Date());
  const [quantiteGauche, setQuantiteGauche] = useState<number>(100);
  const [quantiteDroite, setQuantiteDroite] = useState<number>(100);
  const [useLeftBreast, setUseLeftBreast] = useState(true);
  const [useRightBreast, setUseRightBreast] = useState(true);
  const lastLeftQuantityRef = useRef<number>(100);
  const lastRightQuantityRef = useRef<number>(100);

  // États des pickers
  const [showDate, setShowDate] = useState(false);
  const [showTime, setShowTime] = useState(false);

  // Récupérer les paramètres de l'URL
  const { openModal, editId, returnTo } = useLocalSearchParams();
  const returnTargetParam = Array.isArray(returnTo) ? returnTo[0] : returnTo;

  const editIdRef = useRef<string | null>(null);
  const returnToRef = useRef<string | null>(null);

  // Ref pour la gestion du picker avec accélération
  const intervalRef = useRef<number | undefined>(undefined);

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

  const prepareAddModal = useCallback(() => {
    setDateHeure(new Date());
    setEditingPompage(null);
    setIsSubmitting(false);
    setQuantiteGauche(100);
    setQuantiteDroite(100);
    setUseLeftBreast(true);
    setUseRightBreast(true);
    lastLeftQuantityRef.current = 100;
    lastRightQuantityRef.current = 100;
  }, []);

  const openAddModal = useCallback(() => {
    prepareAddModal();
    setPendingMode("add");
    setPendingOpen(true);
  }, [prepareAddModal]);

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
      setPendingMode("add");
      setPendingOpen(true);
    }, [openModal]),
  );

  useEffect(() => {
    if (!pendingOpen || !layoutReady) return;
    const task = InteractionManager.runAfterInteractions(() => {
      stashReturnTo();
      if (pendingMode !== "edit") {
        prepareAddModal();
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
    router,
    returnTo,
    prepareAddModal,
    openSheet,
  ]);

  useEffect(() => {
    if (!editId || !layoutReady) return;
    const normalizedId = Array.isArray(editId) ? editId[0] : editId;
    if (!normalizedId || editIdRef.current === normalizedId) return;
    const target = pompages.find((pompage) => pompage.id === normalizedId);
    if (!target) return;
    stashReturnTo();
    editIdRef.current = normalizedId;
    openEditModal(target);
    navigation.setParams({ openModal: undefined, editId: undefined });
  }, [editId, layoutReady, pompages, router, returnTo]);

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

  // Nettoyage de l'intervalle lors du démontage
  useEffect(() => {
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, []);

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
  // HELPERS - QUANTITY PICKER
  // ============================================

  const handlePressIn = (action: () => void) => {
    action();

    let speed = 200;

    const accelerate = () => {
      action();
      if (speed > 50) {
        speed -= 20;
        clearInterval(intervalRef.current);
        intervalRef.current = setInterval(accelerate, speed);
      }
    };

    intervalRef.current = setInterval(accelerate, speed);
  };

  const handlePressOut = () => {
    if (intervalRef.current !== undefined) {
      clearInterval(intervalRef.current);
      intervalRef.current = undefined;
    }
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

  const openEditModal = (pompage: Pompage) => {
    setDateHeure(new Date(pompage.date.seconds * 1000));
    setQuantiteGauche(pompage.quantiteGauche);
    setQuantiteDroite(pompage.quantiteDroite);
    lastLeftQuantityRef.current = pompage.quantiteGauche ?? 0;
    lastRightQuantityRef.current = pompage.quantiteDroite ?? 0;
    const hasLeft = (pompage.quantiteGauche ?? 0) > 0;
    const hasRight = (pompage.quantiteDroite ?? 0) > 0;
    if (!hasLeft && !hasRight) {
      setUseLeftBreast(true);
      setUseRightBreast(true);
    } else {
      setUseLeftBreast(hasLeft);
      setUseRightBreast(hasRight);
    }
    setEditingPompage(pompage);
    setIsSubmitting(false);
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
    if (!useLeftBreast && !useRightBreast) {
      showAlert("Attention", "Sélectionnez au moins un sein.");
      return;
    }

    try {
      setIsSubmitting(true);

      const dataToSave = {
        quantiteGauche: useLeftBreast ? quantiteGauche : 0,
        quantiteDroite: useRightBreast ? quantiteDroite : 0,
        date: dateHeure,
      };

      if (editingPompage) {
        await modifierPompage(activeChild.id, editingPompage.id, dataToSave);
      } else {
        await ajouterPompage(activeChild.id, dataToSave);
      }

      if (isOffline) {
        showToast(
          editingPompage
            ? "Modification en attente de synchronisation"
            : "Ajout en attente de synchronisation",
        );
      }
      closeModal();
    } catch (error) {
      console.error("Erreur lors de la sauvegarde du pompage:", error);
      showAlert(
        "Erreur",
        "Impossible de sauvegarder le pompage. Veuillez réessayer.",
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = () => {
    if (isSubmitting || !editingPompage || !activeChild) return;
    setShowDeleteModal(true);
  };

  const confirmDelete = async () => {
    if (isSubmitting || !editingPompage || !activeChild) return;

    try {
      setIsSubmitting(true);
      await supprimerPompage(activeChild.id, editingPompage.id);
      if (isOffline) {
        showToast("Suppression en attente de synchronisation");
      }
      setShowDeleteModal(false);
      closeModal();
    } catch (error) {
      console.error("Erreur lors de la suppression:", error);
      showAlert(
        "Erreur",
        "Impossible de supprimer le pompage. Veuillez réessayer.",
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  function renderSheetContent() {
    const toggleLeftBreast = () => {
      if (isSubmitting) return;
      setUseLeftBreast((prev) => {
        if (prev && !useRightBreast) return prev;
        const next = !prev;
        setQuantiteGauche((q) => {
          if (next) {
            return lastLeftQuantityRef.current > 0
              ? lastLeftQuantityRef.current
              : 100;
          }
          lastLeftQuantityRef.current = q;
          return 0;
        });
        return next;
      });
    };
    const toggleRightBreast = () => {
      if (isSubmitting) return;
      setUseRightBreast((prev) => {
        if (prev && !useLeftBreast) return prev;
        const next = !prev;
        setQuantiteDroite((q) => {
          if (next) {
            return lastRightQuantityRef.current > 0
              ? lastRightQuantityRef.current
              : 100;
          }
          lastRightQuantityRef.current = q;
          return 0;
        });
        return next;
      });
    };

    return (
      <>
        <Text style={styles.modalCategoryLabel}>Seins</Text>
        <View style={styles.breastToggleRow}>
          <TouchableOpacity
            style={[
              styles.breastToggleButton,
              useLeftBreast && {
                backgroundColor: Colors[colorScheme].tint,
                borderColor: Colors[colorScheme].tint,
              },
            ]}
            onPress={toggleLeftBreast}
            disabled={isSubmitting}
          >
            <Text
              style={[
                styles.breastToggleText,
                useLeftBreast && styles.breastToggleTextActive,
              ]}
            >
              Gauche
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[
              styles.breastToggleButton,
              useRightBreast && {
                backgroundColor: Colors[colorScheme].tint,
                borderColor: Colors[colorScheme].tint,
              },
            ]}
            onPress={toggleRightBreast}
            disabled={isSubmitting}
          >
            <Text
              style={[
                styles.breastToggleText,
                useRightBreast && styles.breastToggleTextActive,
              ]}
            >
              Droit
            </Text>
          </TouchableOpacity>
        </View>

        {useLeftBreast && (
          <>
            <Text style={styles.modalCategoryLabel}>Quantité Sein Gauche</Text>
            <View style={styles.quantityPickerRow}>
              <TouchableOpacity
                style={[
                  styles.quantityButton,
                  isSubmitting && styles.quantityButtonDisabled,
                ]}
                onPressIn={() =>
                  handlePressIn(() =>
                    setQuantiteGauche((q) => Math.max(0, q - 5)),
                  )
                }
                onPressOut={handlePressOut}
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
                {quantiteGauche} ml
              </Text>
              <TouchableOpacity
                style={[
                  styles.quantityButton,
                  isSubmitting && styles.quantityButtonDisabled,
                ]}
                onPressIn={() =>
                  handlePressIn(() => setQuantiteGauche((q) => q + 5))
                }
                onPressOut={handlePressOut}
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

        {useRightBreast && (
          <>
            <Text style={styles.modalCategoryLabel}>Quantité Sein Droit</Text>
            <View style={styles.quantityPickerRow}>
              <TouchableOpacity
                style={[
                  styles.quantityButton,
                  isSubmitting && styles.quantityButtonDisabled,
                ]}
                onPressIn={() =>
                  handlePressIn(() =>
                    setQuantiteDroite((q) => Math.max(0, q - 5)),
                  )
                }
                onPressOut={handlePressOut}
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
                {quantiteDroite} ml
              </Text>
              <TouchableOpacity
                style={[
                  styles.quantityButton,
                  isSubmitting && styles.quantityButtonDisabled,
                ]}
                onPressIn={() =>
                  handlePressIn(() => setQuantiteDroite((q) => q + 5))
                }
                onPressOut={handlePressOut}
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
    const returnTarget = returnTargetParam ?? returnToRef.current;
    return {
      ownerId: sheetOwnerId,
      title: editingPompage ? "Modifier la session" : "Nouvelle session",
      icon: "pump-medical",
      accentColor: eventColors.pumping.dark,
      isEditing: !!editingPompage,
      isSubmitting,
      onSubmit: handleSubmit,
      onDelete: editingPompage ? handleDelete : undefined,
      children: renderSheetContent(),
      onDismiss: () => {
        setIsSubmitting(false);
        setEditingPompage(null);
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
    editingPompage,
    isSubmitting,
    quantiteGauche,
    quantiteDroite,
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
        <ConfirmModal
          visible={showDeleteModal}
          title="Suppression"
          message="Voulez-vous vraiment supprimer ce pompage ?"
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
  // Modal Content
  modalCategoryLabel: {
    alignSelf: "center",
    fontSize: 16,
    fontWeight: "600",
    color: "#333",
    paddingTop: 20,
    marginBottom: 10,
  },
  // Quantity Picker
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
  breastToggleRow: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 12,
    marginBottom: 12,
  },
  breastToggleButton: {
    paddingVertical: 8,
    paddingHorizontal: 18,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#d7dbe0",
    backgroundColor: "#f5f6f8",
  },
  breastToggleText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#666",
  },
  breastToggleTextActive: {
    color: "#fff",
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
