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
  ajouterBiberon,
  ajouterTetee,
  modifierBiberon,
  modifierTetee,
  supprimerTetee,
} from "@/migration/eventsDoubleWriteService";
import {
  ecouterBiberonsHybrid as ecouterBiberons,
  ecouterTeteesHybrid as ecouterTetees,
  getNextEventDateBeforeHybrid,
  hasMoreEventsBeforeHybrid,
} from "@/migration/eventsHybridService";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import FontAwesome from "@expo/vector-icons/FontAwesome6";
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
type MealType = "tetee" | "biberon";
type FilterType = "today" | "past";

interface Meal {
  id: string;
  type?: MealType;
  quantite?: number | null;
  coteGauche?: boolean;
  coteDroit?: boolean;
  dureeGauche?: number;
  dureeDroite?: number;
  date: { seconds: number };
  createdAt: { seconds: number };
}

interface MealGroup {
  date: string;
  dateFormatted: string;
  meals: Meal[];
  totalQuantity: number;
  lastMeal: Meal;
}

// ============================================
// COMPONENT
// ============================================

export default function MealsScreen() {
  const { activeChild } = useBaby();
  const { setHeaderRight } = useHeaderRight();
  const colorScheme = useColorScheme() ?? "light";
  const { openSheet, closeSheet, viewProps, isOpen } = useSheet();
  const { showAlert } = useModal();
  const { showToast } = useToast();
  const headerOwnerId = useRef(`meals-${Math.random().toString(36).slice(2)}`);
  const navigation = useNavigation();
  const { setHeaderLeft } = useHeaderLeft();
  const netInfo = useNetInfo();
  const isOffline =
    netInfo.isInternetReachable === false || netInfo.isConnected === false;

  const [showCalendar, setShowCalendar] = useState(false);
  const [selectedFilter, setSelectedFilter] = useState<FilterType | null>(null);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  // États des données
  const [meals, setMeals] = useState<Meal[]>([]);
  const [groupedMeals, setGroupedMeals] = useState<MealGroup[]>([]);
  const [expandedDays, setExpandedDays] = useState<Set<string>>(new Set());
  const [teteesLoaded, setTeteesLoaded] = useState(false);
  const [biberonsLoaded, setBiberonsLoaded] = useState(false);
  const [emptyDelayDone, setEmptyDelayDone] = useState(false);
  const [daysWindow, setDaysWindow] = useState(14);
  const [rangeEndDate, setRangeEndDate] = useState<Date | null>(null);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [autoLoadMore, setAutoLoadMore] = useState(false);
  const [autoLoadMoreAttempts, setAutoLoadMoreAttempts] = useState(0);
  const loadMoreVersionRef = useRef(0);
  const pendingLoadMoreRef = useRef(0);
  const [pendingMode, setPendingMode] = useState<"add" | "edit" | null>(null);

  // États du formulaire
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [editingMeal, setEditingMeal] = useState<Meal | null>(null);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [mealType, setMealType] = useState<MealType>("tetee");
  const [layoutReady, setLayoutReady] = useState(false);
  const [pendingOpen, setPendingOpen] = useState(false);
  const [dateHeure, setDateHeure] = useState<Date>(new Date());
  const [quantite, setQuantite] = useState<number>(100);
  const [leftSeconds, setLeftSeconds] = useState(0);
  const [rightSeconds, setRightSeconds] = useState(0);
  const [runningSide, setRunningSide] = useState<"left" | "right" | null>(null);
  const sheetOwnerId = "meals";
  const isSheetActive = viewProps?.ownerId === sheetOwnerId;

  // États des pickers
  const [showDate, setShowDate] = useState(false);
  const [showTime, setShowTime] = useState(false);

  // Récupérer les paramètres de l'URL
  const { tab, openModal, editId, returnTo } = useLocalSearchParams();
  const returnTargetParam = Array.isArray(returnTo) ? returnTo[0] : returnTo;

  const editIdRef = useRef<string | null>(null);
  const returnToRef = useRef<string | null>(null);

  // Ref pour la gestion du picker avec accélération
  const intervalRef = useRef<number | undefined>(undefined);
  const timerIntervalRef = useRef<number | undefined>(undefined);
  const timerTickRef = useRef<number | null>(null);

  // ============================================
  // EFFECTS - URL PARAMS
  // ============================================

  // Gérer le bouton calendrier
  const handleCalendarPress = useCallback(() => {
    setShowCalendar((prev) => {
      const newValue = !prev;

      // Si on ouvre le calendrier, sélectionner la date du jour par défaut et réinitialiser le filtre
      if (newValue) {
        const today = new Date();
        const todayString = `${today.getFullYear()}-${String(
          today.getMonth() + 1,
        ).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
        setSelectedDate(todayString);
        setSelectedFilter(null);
      }
      // Ne plus réinitialiser la date sélectionnée lors de la fermeture du calendrier

      return newValue;
    });
  }, []);

  const prepareAddModal = useCallback(
    (preferredType?: "seins" | "biberons") => {
      setDateHeure(new Date());
      setEditingMeal(null);
      setIsSubmitting(false);
      setLeftSeconds(0);
      setRightSeconds(0);
      setRunningSide(null);

      if (preferredType === "seins") {
        setMealType("tetee");
      } else if (preferredType === "biberons") {
        setMealType("biberon");
        setQuantite(100);
      } else {
        setMealType("tetee");
      }
    },
    [],
  );

  const openAddModal = useCallback(
    (preferredType?: "seins" | "biberons") => {
      prepareAddModal(preferredType);
      setPendingMode("add");
      setPendingOpen(true);
    },
    [prepareAddModal],
  );

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
          {/* <VoiceCommandButton
          size={18}
          color={Colors[colorScheme].tint}
          showTestToggle={false}
        /> */}

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

  // Définir l'onglet initial en fonction du paramètre
  useEffect(() => {
    if (tab === "seins") {
      setMealType("tetee");
    } else if (tab === "biberons") {
      setMealType("biberon");
    }
  }, [tab]);

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
        prepareAddModal(tab as "seins" | "biberons" | undefined);
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
    openSheet,
    prepareAddModal,
  ]);

  useEffect(() => {
    if (!editId || !layoutReady) return;
    const normalizedId = Array.isArray(editId) ? editId[0] : editId;
    if (!normalizedId || editIdRef.current === normalizedId) return;
    const target = meals.find((meal) => meal.id === normalizedId);
    if (!target) return;
    stashReturnTo();
    editIdRef.current = normalizedId;
    openEditModal(target);
    navigation.setParams({ openModal: undefined, editId: undefined });
  }, [editId, layoutReady, meals, router, returnTo]);

  // ============================================
  // EFFECTS - DATA LISTENERS
  // ============================================

  // Écoute en temps réel - Tétées ET Biberons
  useEffect(() => {
    if (!activeChild?.id) return;
    const versionAtSubscribe = loadMoreVersionRef.current;
    const endOfRange = rangeEndDate ? new Date(rangeEndDate) : new Date();
    endOfRange.setHours(23, 59, 59, 999);
    const startOfRange = new Date(endOfRange);
    startOfRange.setHours(0, 0, 0, 0);
    startOfRange.setDate(startOfRange.getDate() - (daysWindow - 1));

    let teteesData: Meal[] = [];
    let biberonsData: Meal[] = [];

    const mergeAndSortMeals = () => {
      const merged = [...teteesData, ...biberonsData].sort(
        (a, b) => (b.date?.seconds || 0) - (a.date?.seconds || 0),
      );
      setMeals(merged);
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

    const unsubscribeTetees = ecouterTetees(
      activeChild.id,
      (tetees) => {
        teteesData = tetees;
        setTeteesLoaded(true);
        mergeAndSortMeals();
      },
      { waitForServer: true, depuis: startOfRange, jusqu: endOfRange },
    );

    const unsubscribeBiberons = ecouterBiberons(
      activeChild.id,
      (biberons) => {
        biberonsData = biberons;
        setBiberonsLoaded(true);
        mergeAndSortMeals();
      },
      { waitForServer: true, depuis: startOfRange, jusqu: endOfRange },
    );

    return () => {
      unsubscribeTetees();
      unsubscribeBiberons();
    };
  }, [activeChild, daysWindow, rangeEndDate]);

  useEffect(() => {
    if (!activeChild?.id) return;
    setMeals([]);
    setGroupedMeals([]);
    setTeteesLoaded(false);
    setBiberonsLoaded(false);
    setEmptyDelayDone(false);
    setDaysWindow(14);
    setRangeEndDate(null);
    setIsLoadingMore(false);
    setHasMore(true);
    loadMoreVersionRef.current = 0;
    pendingLoadMoreRef.current = 0;
    setLeftSeconds(0);
    setRightSeconds(0);
    setRunningSide(null);
  }, [activeChild?.id]);

  const isMealsLoading = !(teteesLoaded && biberonsLoaded);
  const mealsLoaded = !isMealsLoading;

  useEffect(() => {
    if (!mealsLoaded) {
      setEmptyDelayDone(false);
      return;
    }
    if (groupedMeals.length > 0) {
      setEmptyDelayDone(true);
      return;
    }
    const timer = setTimeout(() => setEmptyDelayDone(true), 300);
    return () => clearTimeout(timer);
  }, [mealsLoaded, groupedMeals.length]);

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
          ["tetee", "biberon"],
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
      !isMealsLoading &&
      groupedMeals.length === 0 &&
      hasMore
    ) {
      setAutoLoadMore(true);
      setAutoLoadMoreAttempts(0);
    }
  }, [
    autoLoadMore,
    isMealsLoading,
    groupedMeals.length,
    hasMore,
    selectedFilter,
    selectedDate,
  ]);

  useEffect(() => {
    if (!autoLoadMore) return;
    if (isMealsLoading || isLoadingMore) return;
    if (groupedMeals.length > 0 || !hasMore) {
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
    isMealsLoading,
    isLoadingMore,
    groupedMeals.length,
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
    hasMoreEventsBeforeHybrid(activeChild.id, ["tetee", "biberon"], beforeDate)
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

    // Filtrer les repas en fonction du filtre sélectionné ou de la date du calendrier
    const filtered = meals.filter((meal) => {
      const mealDate = new Date(meal.date.seconds * 1000);
      mealDate.setHours(0, 0, 0, 0);
      const mealTime = mealDate.getTime();

      // Si une date est sélectionnée dans le calendrier (peu importe si le calendrier est ouvert ou fermé)
      if (selectedDate) {
        const [calYear, calMonth, calDay] = selectedDate.split("-").map(Number);
        const calDate = new Date(calYear, calMonth - 1, calDay);
        calDate.setHours(0, 0, 0, 0);
        return mealTime === calDate.getTime();
      }

      // Sinon, appliquer le filtre sélectionné
      switch (selectedFilter) {
        case "today":
          return mealTime === todayTime;
        case "past":
          return mealTime < todayTime;
        case null:
        default:
          return true; // Afficher tous les repas par défaut
      }
    });

    const grouped = groupMealsByDay(filtered);
    setGroupedMeals(grouped);
  }, [meals, selectedFilter, selectedDate, showCalendar]);

  // Nettoyage de l'intervalle lors du démontage
  useEffect(() => {
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
      if (timerIntervalRef.current) {
        clearInterval(timerIntervalRef.current);
      }
    };
  }, []);

  // ============================================
  // HELPERS - CALENDAR
  // ============================================

  // Préparer les dates marquées pour le calendrier
  const markedDates = useMemo(() => {
    const marked: Record<string, any> = {};

    meals.forEach((meal) => {
      // Convertir le timestamp en date
      const date = new Date(meal.date.seconds * 1000);

      // Créer la clé au format YYYY-MM-DD
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, "0");
      const day = String(date.getDate()).padStart(2, "0");
      const dateKey = `${year}-${month}-${day}`;

      marked[dateKey] = {
        marked: true,
        dotColor: Colors[colorScheme].tint,
      };
    });

    // Marquer la date sélectionnée
    if (selectedDate) {
      marked[selectedDate] = {
        ...marked[selectedDate],
        selected: true,
        selectedColor: Colors[colorScheme].tint,
      };
    }

    return marked;
  }, [meals, selectedDate, colorScheme]);

  const handleDateSelect = (day: DateData) => {
    setSelectedDate(day.dateString);
    // Déployer automatiquement la carte du jour sélectionné
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
    // Si on clique sur "Aujourd'hui", déployer automatiquement la carte du jour
    if (filter === "today") {
      applyTodayFilter();
      return;
    }

    setSelectedFilter(filter);
    setSelectedDate(null);
    setShowCalendar(false);
    // Réinitialiser l'expansion pour les autres filtres
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

  const groupMealsByDay = (meals: Meal[]): MealGroup[] => {
    const groups: { [key: string]: Meal[] } = {};

    meals.forEach((meal) => {
      const date = new Date(meal.date?.seconds * 1000);
      const dateKey = `${date.getFullYear()}-${String(
        date.getMonth() + 1,
      ).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;

      if (!groups[dateKey]) {
        groups[dateKey] = [];
      }
      groups[dateKey].push(meal);
    });

    return Object.entries(groups)
      .map(([dateKey, meals]) => {
        const date = new Date(dateKey);
        const totalQuantity = meals.reduce((sum, meal) => {
          const q = meal.quantite;
          return sum + (typeof q === "number" ? q : 0);
        }, 0);
        const lastMeal = meals.reduce((latest, current) =>
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
          meals: meals.sort(
            (a, b) => (b.date?.seconds || 0) - (a.date?.seconds || 0),
          ),
          totalQuantity,
          lastMeal,
        };
      })
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  };

  // ============================================
  // HELPERS - QUANTITY PICKER
  // ============================================

  const handlePressIn = (action: () => void) => {
    action();

    let speed = 200; // Démarre lentement

    const accelerate = () => {
      action();
      if (speed > 50) {
        speed -= 20; // Accélère progressivement
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

  const openEditModal = (meal: Meal) => {
    setDateHeure(new Date(meal.date.seconds * 1000));
    setEditingMeal(meal);
    setIsSubmitting(false);
    setPendingMode("edit");

    // Déterminer le type (avec fallback pour anciennes données)
    const type = meal.type || "tetee";
    setMealType(type);

    // Quantité (avec fallback)
    const quantity = meal.quantite ?? 100;
    setQuantite(quantity);

    const leftDuration = Math.max(0, Math.round((meal.dureeGauche ?? 0) * 60));
    const rightDuration = Math.max(0, Math.round((meal.dureeDroite ?? 0) * 60));
    setLeftSeconds(leftDuration);
    setRightSeconds(rightDuration);
    setRunningSide(null);
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
    setRunningSide(null);
    closeSheet();
  };

  // ============================================
  // HANDLERS - CRUD
  // ============================================

  const handleSubmit = async () => {
    if (isSubmitting || !activeChild) return;

    try {
      setIsSubmitting(true);

      const isTetee = mealType === "tetee";
      const leftMinutes = Math.round(leftSeconds / 60);
      const rightMinutes = Math.round(rightSeconds / 60);
      const dataToSave = {
        type: mealType,
        quantite: isTetee ? null : quantite,
        coteGauche: isTetee ? leftSeconds > 0 : undefined,
        coteDroit: isTetee ? rightSeconds > 0 : undefined,
        dureeGauche: isTetee && leftMinutes > 0 ? leftMinutes : undefined,
        dureeDroite: isTetee && rightMinutes > 0 ? rightMinutes : undefined,
        date: dateHeure,
      };

      if (editingMeal) {
        // Modification
        if (isTetee) {
          await modifierTetee(activeChild.id, editingMeal.id, dataToSave);
        } else {
          await modifierBiberon(activeChild.id, editingMeal.id, dataToSave);
        }
      } else {
        // Ajout
        if (isTetee) {
          await ajouterTetee(activeChild.id, dataToSave);
        } else {
          await ajouterBiberon(activeChild.id, dataToSave);
        }
      }

      if (isOffline) {
        showToast(
          editingMeal
            ? "Modification en attente de synchronisation"
            : "Ajout en attente de synchronisation",
        );
      }
      closeModal();
    } catch (error) {
      console.error("Erreur lors de la sauvegarde du repas:", error);
      showAlert(
        "Erreur",
        "Impossible de sauvegarder le repas. Veuillez réessayer.",
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = () => {
    if (isSubmitting || !editingMeal || !activeChild) return;
    setShowDeleteModal(true);
  };

  const confirmDelete = async () => {
    if (isSubmitting || !editingMeal || !activeChild) return;

    try {
      setIsSubmitting(true);
      await supprimerTetee(activeChild.id, editingMeal.id);
      if (isOffline) {
        showToast("Suppression en attente de synchronisation");
      }
      setShowDeleteModal(false);
      closeModal();
    } catch (error) {
      console.error("Erreur lors de la suppression:", error);
      showAlert(
        "Erreur",
        "Impossible de supprimer le repas. Veuillez réessayer.",
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const formatDuration = (totalSeconds: number) => {
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = Math.max(0, totalSeconds % 60);
    return `${minutes}:${String(seconds).padStart(2, "0")}`;
  };

  const toggleChrono = (side: "left" | "right") => {
    if (isSubmitting || editingMeal) return;
    setRunningSide((prev) => (prev === side ? null : side));
  };

  const resetChrono = (side: "left" | "right") => {
    if (isSubmitting) return;
    if (side === "left") {
      setLeftSeconds(0);
    } else {
      setRightSeconds(0);
    }
    setRunningSide((prev) => (prev === side ? null : prev));
  };

  useEffect(() => {
    if (mealType !== "tetee") {
      setRunningSide(null);
    }
  }, [mealType]);

  useEffect(() => {
    if (!runningSide || mealType !== "tetee" || editingMeal) {
      if (timerIntervalRef.current) {
        clearInterval(timerIntervalRef.current);
        timerIntervalRef.current = undefined;
      }
      timerTickRef.current = null;
      return;
    }

    timerTickRef.current = Date.now();
    timerIntervalRef.current = setInterval(() => {
      const now = Date.now();
      const lastTick = timerTickRef.current ?? now;
      const deltaSeconds = Math.floor((now - lastTick) / 1000);
      if (deltaSeconds <= 0) return;
      timerTickRef.current = lastTick + deltaSeconds * 1000;
      if (runningSide === "left") {
        setLeftSeconds((prev) => prev + deltaSeconds);
      } else {
        setRightSeconds((prev) => prev + deltaSeconds);
      }
    }, 500);

    return () => {
      if (timerIntervalRef.current) {
        clearInterval(timerIntervalRef.current);
        timerIntervalRef.current = undefined;
      }
      timerTickRef.current = null;
    };
  }, [runningSide, mealType, editingMeal]);

  function renderSheetContent() {
    const totalSeconds = leftSeconds + rightSeconds;
    return (
      <>
        <Text style={styles.modalCategoryLabel}>Type de repas</Text>
        <View style={styles.typeRow}>
          <TouchableOpacity
            style={[
              styles.typeButton,
              mealType === "tetee" && styles.typeButtonActive,
              isSubmitting && styles.typeButtonDisabled,
            ]}
            onPress={() => setMealType("tetee")}
            disabled={isSubmitting}
          >
            <FontAwesome
              name="person-breastfeeding"
              size={20}
              color={mealType === "tetee" ? "white" : "#666"}
            />
            <Text
              style={[
                styles.typeText,
                mealType === "tetee" && styles.typeTextActive,
                isSubmitting && styles.typeTextDisabled,
              ]}
            >
              Seins
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.typeButton,
              mealType === "biberon" && styles.typeButtonActive,
              isSubmitting && styles.typeButtonDisabled,
            ]}
            onPress={() => {
              setMealType("biberon");
              setQuantite(100);
              setRunningSide(null);
            }}
            disabled={isSubmitting}
          >
            <FontAwesome
              name="jar-wheat"
              size={20}
              color={mealType === "biberon" ? "white" : "#666"}
            />
            <Text
              style={[
                styles.typeText,
                mealType === "biberon" && styles.typeTextActive,
                isSubmitting && styles.typeTextDisabled,
              ]}
            >
              Biberon
            </Text>
          </TouchableOpacity>
        </View>

        {isQuantityVisible ? (
          <>
            <Text style={styles.modalCategoryLabel}>Quantité</Text>
            <View style={styles.quantityRow}>
              <TouchableOpacity
                style={[
                  styles.quantityButton,
                  isSubmitting && styles.quantityButtonDisabled,
                ]}
                onPressIn={() =>
                  handlePressIn(() => setQuantite((q) => Math.max(0, q - 5)))
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
              <Text style={styles.quantityValue}>{quantite} ml</Text>
              <TouchableOpacity
                style={[
                  styles.quantityButton,
                  isSubmitting && styles.quantityButtonDisabled,
                ]}
                onPressIn={() => handlePressIn(() => setQuantite((q) => q + 5))}
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
        ) : (
          <>
            <Text style={styles.modalCategoryLabel}>Chronomètre tétée</Text>
            <View style={styles.chronoContainer}>
              <View style={styles.chronoCard}>
                <Text style={styles.chronoLabel}>Gauche</Text>
                <Text style={styles.chronoTime}>
                  {formatDuration(leftSeconds)}
                </Text>
                {editingMeal ? (
                  <View style={styles.chronoAdjustRow}>
                    <TouchableOpacity
                      style={[
                        styles.chronoAdjustButton,
                        isSubmitting && styles.chronoAdjustButtonDisabled,
                      ]}
                      onPressIn={() =>
                        handlePressIn(() =>
                          setLeftSeconds((prev) => Math.max(0, prev - 60)),
                        )
                      }
                      onPressOut={handlePressOut}
                      disabled={isSubmitting}
                    >
                      <Text style={styles.chronoAdjustButtonText}>-</Text>
                    </TouchableOpacity>
                    <Text style={styles.chronoAdjustValue}>
                      {Math.round(leftSeconds / 60)} min
                    </Text>
                    <TouchableOpacity
                      style={[
                        styles.chronoAdjustButton,
                        isSubmitting && styles.chronoAdjustButtonDisabled,
                      ]}
                      onPressIn={() =>
                        handlePressIn(() => setLeftSeconds((prev) => prev + 60))
                      }
                      onPressOut={handlePressOut}
                      disabled={isSubmitting}
                    >
                      <Text style={styles.chronoAdjustButtonText}>+</Text>
                    </TouchableOpacity>
                  </View>
                ) : (
                  <View style={styles.chronoControlRow}>
                    <TouchableOpacity
                      style={[
                        styles.chronoControlButton,
                        runningSide === "left" &&
                          styles.chronoControlButtonActive,
                      ]}
                      onPress={() => toggleChrono("left")}
                      disabled={isSubmitting}
                    >
                      <Ionicons
                        name={runningSide === "left" ? "pause" : "play"}
                        size={16}
                        color={runningSide === "left" ? "white" : "#333"}
                      />
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[
                        styles.chronoControlButton,
                        leftSeconds === 0 && styles.chronoControlButtonDisabled,
                      ]}
                      onPress={() => resetChrono("left")}
                      disabled={isSubmitting || leftSeconds === 0}
                    >
                      <Ionicons
                        name="refresh"
                        size={16}
                        color={leftSeconds === 0 ? "#999" : "#333"}
                      />
                    </TouchableOpacity>
                  </View>
                )}
              </View>

              <View style={styles.chronoCard}>
                <Text style={styles.chronoLabel}>Droit</Text>
                <Text style={styles.chronoTime}>
                  {formatDuration(rightSeconds)}
                </Text>
                {editingMeal ? (
                  <View style={styles.chronoAdjustRow}>
                    <TouchableOpacity
                      style={[
                        styles.chronoAdjustButton,
                        isSubmitting && styles.chronoAdjustButtonDisabled,
                      ]}
                      onPressIn={() =>
                        handlePressIn(() =>
                          setRightSeconds((prev) => Math.max(0, prev - 60)),
                        )
                      }
                      onPressOut={handlePressOut}
                      disabled={isSubmitting}
                    >
                      <Text style={styles.chronoAdjustButtonText}>-</Text>
                    </TouchableOpacity>
                    <Text style={styles.chronoAdjustValue}>
                      {Math.round(rightSeconds / 60)} min
                    </Text>
                    <TouchableOpacity
                      style={[
                        styles.chronoAdjustButton,
                        isSubmitting && styles.chronoAdjustButtonDisabled,
                      ]}
                      onPressIn={() =>
                        handlePressIn(() =>
                          setRightSeconds((prev) => prev + 60),
                        )
                      }
                      onPressOut={handlePressOut}
                      disabled={isSubmitting}
                    >
                      <Text style={styles.chronoAdjustButtonText}>+</Text>
                    </TouchableOpacity>
                  </View>
                ) : (
                  <View style={styles.chronoControlRow}>
                    <TouchableOpacity
                      style={[
                        styles.chronoControlButton,
                        runningSide === "right" &&
                          styles.chronoControlButtonActive,
                      ]}
                      onPress={() => toggleChrono("right")}
                      disabled={isSubmitting}
                    >
                      <Ionicons
                        name={runningSide === "right" ? "pause" : "play"}
                        size={16}
                        color={runningSide === "right" ? "white" : "#333"}
                      />
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[
                        styles.chronoControlButton,
                        rightSeconds === 0 &&
                          styles.chronoControlButtonDisabled,
                      ]}
                      onPress={() => resetChrono("right")}
                      disabled={isSubmitting || rightSeconds === 0}
                    >
                      <Ionicons
                        name="refresh"
                        size={16}
                        color={rightSeconds === 0 ? "#999" : "#333"}
                      />
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            </View>

            <View style={styles.chronoTotalRow}>
              <Text style={styles.chronoTotalLabel}>Total</Text>
              <Text style={styles.chronoTotalValue}>
                {formatDuration(totalSeconds)}
              </Text>
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
      title: editingMeal ? "Modifier le repas" : "Nouveau repas",
      icon: "baby",
      accentColor: eventColors.meal.dark,
      isEditing: !!editingMeal,
      isSubmitting,
      onSubmit: handleSubmit,
      onDelete: editingMeal ? handleDelete : undefined,
      children: renderSheetContent(),
      onDismiss: () => {
        setIsSubmitting(false);
        setEditingMeal(null);
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
    editingMeal,
    isSubmitting,
    mealType,
    quantite,
    leftSeconds,
    rightSeconds,
    runningSide,
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
  // RENDER - MEAL ITEM
  // ============================================

  const renderMealItem = (meal: Meal, isLast: boolean = false) => {
    const mealTime = new Date(meal.date?.seconds * 1000);
    const isTetee = meal.type === "tetee";
    const leftDuration = meal.dureeGauche ?? 0;
    const rightDuration = meal.dureeDroite ?? 0;
    const totalDuration = leftDuration + rightDuration;
    const hasDuration = leftDuration > 0 || rightDuration > 0;

    return (
      <Pressable
        key={meal.id}
        style={({ pressed }) => [
          styles.sessionCard,
          // isLast && { backgroundColor: eventColors.meal.light + "60" },
          pressed && styles.sessionCardPressed,
        ]}
        onPress={() => openEditModal(meal)}
      >
        {/* Time badge */}
        <View style={styles.sessionTime}>
          <Text
            style={[
              styles.sessionTimeText,
              isLast && styles.sessionTimeTextLast,
            ]}
          >
            {mealTime.toLocaleTimeString("fr-FR", {
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
              { backgroundColor: eventColors.meal.light },
            ]}
          >
            {isTetee ? (
              <FontAwesome
                name="person-breastfeeding"
                size={14}
                color={eventColors.meal.dark}
              />
            ) : (
              <MaterialCommunityIcons
                name="baby-bottle"
                size={16}
                color={eventColors.meal.dark}
              />
            )}
          </View>
          <View style={styles.sessionDetails}>
            <Text style={styles.sessionType}>
              {isTetee ? "Tétée" : "Biberon"}
            </Text>
            {isTetee ? (
              <>
                {hasDuration && (
                  <>
                    <View style={styles.durationBar}>
                      <View
                        style={[
                          styles.durationBarLeft,
                          { flex: leftDuration || 1 },
                        ]}
                      />
                      <View
                        style={[
                          styles.durationBarRight,
                          { flex: rightDuration || 1 },
                        ]}
                      />
                    </View>
                    <View style={styles.durationLabels}>
                      <View style={styles.durationLabelItem}>
                        <View
                          style={[styles.durationDot, styles.durationDotLeft]}
                        />
                        <Text style={styles.durationLabelText}>G</Text>
                        <Text style={styles.durationLabelValue}>
                          {leftDuration} min
                        </Text>
                      </View>
                      <View style={styles.durationLabelItem}>
                        <View
                          style={[styles.durationDot, styles.durationDotRight]}
                        />
                        <Text style={styles.durationLabelText}>D</Text>
                        <Text style={styles.durationLabelValue}>
                          {rightDuration} min
                        </Text>
                      </View>
                    </View>
                  </>
                )}
              </>
            ) : (
              meal.quantite && (
                <Text style={styles.sessionDetailText}>{meal.quantite} ml</Text>
              )
            )}
          </View>
        </View>

        {isTetee && hasDuration && (
          <View style={styles.sessionTotal}>
            <Text style={styles.sessionTotalValue}>{totalDuration}</Text>
            <Text style={styles.sessionTotalUnit}>min</Text>
          </View>
        )}

        {/* Chevron */}
        <Ionicons name="chevron-forward" size={18} color="#d1d5db" />
      </Pressable>
    );
  };

  // ============================================
  // RENDER - DAY GROUP
  // ============================================

  const renderDayGroup = ({ item }: { item: MealGroup }) => {
    const isExpanded = expandedDays.has(item.date);
    const hasMultipleMeals = item.meals.length > 1;
    const teteesCount = item.meals.filter((m) => m.type === "tetee").length;
    const biberonsCount = item.meals.filter((m) => m.type === "biberon").length;

    // Format date: "Aujourd'hui", "Hier", or "Lun. 23 janv."
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
              <Text style={styles.dayStatValue}>{item.meals.length}</Text>
              <Text style={styles.dayStatLabel}>repas</Text>
            </View>
          </View>
        </View>

        {/* Stats breakdown */}
        <View style={styles.statsBreakdown}>
          <View style={styles.statsBreakdownItem}>
            <View
              style={[
                styles.statsBreakdownDot,
                { backgroundColor: eventColors.meal.dark },
              ]}
            />
            <Text style={styles.statsBreakdownLabel}>
              Tétée{teteesCount > 1 ? "s" : ""}
            </Text>
            <Text style={styles.statsBreakdownValue}>{teteesCount}</Text>
          </View>
          <View style={styles.statsBreakdownItem}>
            <View
              style={[styles.statsBreakdownDot, { backgroundColor: "#6366f1" }]}
            />
            <Text style={styles.statsBreakdownLabel}>
              Biberon{biberonsCount > 1 ? "s" : ""}
            </Text>
            <Text style={styles.statsBreakdownValue}>{biberonsCount}</Text>
            {biberonsCount > 0 && (
              <Text style={styles.statsBreakdownLabel}>·</Text>
            )}
            <Text
              style={[
                styles.statsBreakdownLabel,
                { color: eventColors.meal.dark, fontWeight: "600" },
              ]}
            >
              {biberonsCount > 0 ? `${item.totalQuantity} ml` : ""}
            </Text>
          </View>
        </View>

        {/* Sessions list */}
        <View style={styles.sessionsContainer}>
          {renderMealItem(item.lastMeal, true)}

          {hasMultipleMeals && (
            <>
              {isExpanded &&
                item.meals
                  .filter((meal) => meal.id !== item.lastMeal.id)
                  .map((meal) => renderMealItem(meal, false))}

              <Pressable
                style={styles.expandTrigger}
                onPress={() => toggleExpand(item.date)}
              >
                <Text style={styles.expandTriggerText}>
                  {isExpanded
                    ? "Masquer"
                    : `${item.meals.length - 1} autre${item.meals.length > 2 ? "s" : ""} repas`}
                </Text>
                <Ionicons
                  name={isExpanded ? "chevron-up" : "chevron-down"}
                  size={14}
                  color={eventColors.meal.dark}
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

  const isQuantityVisible = mealType === "biberon";

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

        {/* Liste des repas */}
        {isMealsLoading || !emptyDelayDone ? (
          <View style={styles.emptyContainer}>
            <IconPulseDots color={Colors[colorScheme].tint} />
          </View>
        ) : groupedMeals.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Ionicons
              name="calendar-outline"
              size={64}
              color={Colors[colorScheme].tabIconDefault}
            />
            <ThemedText style={styles.emptyText}>
              {meals.length === 0
                ? "Aucun repas"
                : "Aucun repas pour ce filtre"}
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
            data={groupedMeals}
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
          message="Voulez-vous vraiment supprimer ce repas ?"
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
    // marginRight: 8,
  },
  headerButtonPressed: {
    opacity: 0.6,
  },
  calendarContainer: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: "#e0e0e0",
  },
  // Filter Bar
  addButton: {
    backgroundColor: "#4A90E2",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 12,
    gap: 8,
  },
  addButtonText: {
    color: "white",
    fontSize: 16,
    fontWeight: "600",
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

  // Stats Breakdown
  statsBreakdown: {
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
    marginBottom: 10,
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

  // Sessions Container
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
  durationBar: {
    flexDirection: "row",
    height: 6,
    borderRadius: 3,
    overflow: "hidden",
  },
  durationBarLeft: {
    backgroundColor: "#10b981",
  },
  durationBarRight: {
    backgroundColor: "#6366f1",
  },
  durationLabels: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  durationLabelItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  durationDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  durationDotLeft: {
    backgroundColor: "#10b981",
  },
  durationDotRight: {
    backgroundColor: "#6366f1",
  },
  durationLabelText: {
    fontSize: 11,
    fontWeight: "500",
    color: "#9ca3af",
  },
  durationLabelValue: {
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
    color: eventColors.meal.dark,
  },
  sessionTotalUnit: {
    fontSize: 11,
    fontWeight: "500",
    color: "#9ca3af",
  },

  // Expand Trigger
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
    color: eventColors.meal.dark,
  },

  // Empty State
  emptyState: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 60,
  },
  emptyText: {
    fontSize: 18,
    color: "#666",
    marginTop: 16,
    fontWeight: "600",
  },
  emptySubtext: {
    fontSize: 14,
    color: "#999",
    marginTop: 4,
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
  typeButtonActive: {
    backgroundColor: eventColors.meal.dark,
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

  // Quantity
  quantityNA: {
    alignItems: "center",
    marginBottom: 16,
  },
  quantityNAText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#999",
  },
  quantityRow: {
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
  quantityValue: {
    fontSize: 16,
    fontWeight: "600",
    color: "#333",
  },

  // Chrono (tétée)
  chronoContainer: {
    flexDirection: "row",
    gap: 12,
    marginBottom: 12,
  },
  chronoCard: {
    flex: 1,
    backgroundColor: "#f7f7f8",
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 10,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
  chronoLabel: {
    fontSize: 12,
    fontWeight: "600",
    color: "#6b7280",
    marginBottom: 6,
  },
  chronoTime: {
    fontSize: 22,
    fontWeight: "700",
    color: "#111827",
    marginBottom: 8,
  },
  chronoControlRow: {
    flexDirection: "row",
    gap: 10,
  },
  chronoControlButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#e5e7eb",
    alignItems: "center",
    justifyContent: "center",
  },
  chronoControlButtonActive: {
    backgroundColor: eventColors.meal.dark,
    borderColor: eventColors.meal.dark,
  },
  chronoControlButtonDisabled: {
    backgroundColor: "#f3f4f6",
    borderColor: "#e5e7eb",
  },
  chronoAdjustRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  chronoAdjustButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#e5e7eb",
    alignItems: "center",
    justifyContent: "center",
  },
  chronoAdjustButtonDisabled: {
    opacity: 0.6,
  },
  chronoAdjustButtonText: {
    fontSize: 16,
    fontWeight: "700",
    color: "#333",
  },
  chronoAdjustValue: {
    fontSize: 13,
    fontWeight: "600",
    color: "#374151",
  },
  chronoTotalRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginBottom: 16,
  },
  chronoTotalLabel: {
    fontSize: 13,
    fontWeight: "600",
    color: "#6b7280",
  },
  chronoTotalValue: {
    fontSize: 16,
    fontWeight: "700",
    color: "#111827",
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
  emptyContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
});
