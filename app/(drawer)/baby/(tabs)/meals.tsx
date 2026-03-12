import { ConfirmModal } from "@/components/ui/ConfirmModal";
import { DateFilterBar } from "@/components/ui/DateFilterBar";
import { IconPulseDots } from "@/components/ui/IconPulseDtos";
import { LoadMoreButton } from "@/components/ui/LoadMoreButton";
import {
  BIBERON_TYPE_LABELS,
  MOMENT_REPAS_LABELS,
  SOLIDE_TYPE_LABELS,
} from "@/constants/dashboardConfig";
import { eventColors } from "@/constants/eventColors";
import { MAX_AUTO_LOAD_ATTEMPTS } from "@/constants/pagination";
import { getNeutralColors } from "@/constants/dashboardColors";
import { Colors } from "@/constants/theme";
import { useAuth } from "@/contexts/AuthContext";
import { useBaby } from "@/contexts/BabyContext";
import { useSheet } from "@/contexts/SheetContext";
import { useToast } from "@/contexts/ToastContext";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { useChildPermissions } from "@/hooks/useChildPermissions";
import {
  ecouterBiberonsHybrid as ecouterBiberons,
  ecouterSolidesHybrid as ecouterSolides,
  ecouterTeteesHybrid as ecouterTetees,
  getNextEventDateBeforeHybrid,
  hasMoreEventsBeforeHybrid,
} from "@/migration/eventsHybridService";
import { BiberonEvent, SolideEvent, supprimerEvenement } from "@/services/eventsService";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import FontAwesome from "@expo/vector-icons/FontAwesome6";
import { HeaderBackButton } from "@react-navigation/elements";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import { router, useLocalSearchParams } from "expo-router";
import * as Haptics from "expo-haptics";
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
import {
  GestureHandlerRootView,
} from "react-native-gesture-handler";
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
      accessibilityLabel="Supprimer ce repas"
    >
      <Ionicons name="trash-outline" size={20} color="#fff" />
      <Text style={styles.deleteActionText}>Supprimer</Text>
    </Pressable>
  );
});

// ============================================
// TYPES
// ============================================
type MealType = "tetee" | "biberon" | "solide";
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
  // Champs spécifiques aux biberons
  typeBiberon?: BiberonEvent["typeBiberon"];
  // Champs spécifiques aux solides
  typeSolide?: SolideEvent["typeSolide"];
  momentRepas?: SolideEvent["momentRepas"];
  ingredients?: string;
  nouveauAliment?: boolean;
  nomNouvelAliment?: string;
  allergenes?: string[];
  reaction?: SolideEvent["reaction"];
  aime?: boolean;
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
  const { firebaseUser } = useAuth();
  const { setHeaderRight } = useHeaderRight();
  const colorScheme = useColorScheme() ?? "light";
  const nc = getNeutralColors(colorScheme);
  const { openSheet, closeSheet, isOpen } = useSheet();
  const { showToast } = useToast();
  const permissions = useChildPermissions(activeChild?.id, firebaseUser?.uid);
  const canManageContent =
    permissions.role === "owner" || permissions.role === "admin";
  const headerOwnerId = useRef(`meals-${Math.random().toString(36).slice(2)}`);
  const navigation = useNavigation();
  const { setHeaderLeft } = useHeaderLeft();
  const sheetOwnerId = "meals";

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

  // États du formulaire (simplifié - le MealsForm gère les détails)
  const [mealType, setMealType] = useState<MealType>("tetee");
  const [layoutReady, setLayoutReady] = useState(false);
  const [pendingOpen, setPendingOpen] = useState(false);
  const [pendingEditData, setPendingEditData] = useState<Meal | null>(null);

  // États spécifiques aux solides (pour le listener)
  const [solidesLoaded, setSolidesLoaded] = useState(false);

  const [deleteConfirm, setDeleteConfirm] = useState<{
    visible: boolean;
    meal: Meal | null;
  }>({ visible: false, meal: null });

  // Récupérer les paramètres de l'URL
  const { tab, openModal, editId, returnTo } = useLocalSearchParams();
  const returnTargetParam = Array.isArray(returnTo) ? returnTo[0] : returnTo;

  const editIdRef = useRef<string | null>(null);
  const returnToRef = useRef<string | null>(null);

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

  const openAddModal = useCallback((preferredType?: "seins" | "biberons") => {
    const type: MealType =
      preferredType === "seins"
        ? "tetee"
        : preferredType === "biberons"
          ? "biberon"
          : "tetee";
    setMealType(type);
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
          {/* <VoiceCommandButton
          size={18}
          color={Colors[colorScheme].tint}
          showTestToggle={false}
        /> */}

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
            onPress={() => openAddModal()}
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
      const type: MealType =
        tab === "seins" ? "tetee" : tab === "biberons" ? "biberon" : "tetee";
      setMealType(type);
      setPendingEditData(null);
      setPendingOpen(true);
    }, [openModal, tab]),
  );

  // Helper pour construire editData depuis un Meal
  const buildEditData = useCallback(
    (meal: Meal) => ({
      id: meal.id,
      type: meal.type || ("tetee" as MealType),
      date: new Date(meal.date.seconds * 1000),
      dureeGauche: meal.dureeGauche,
      dureeDroite: meal.dureeDroite,
      quantite: typeof meal.quantite === "number" ? meal.quantite : undefined,
      typeBiberon: meal.typeBiberon,
      typeSolide: meal.typeSolide,
      momentRepas: meal.momentRepas,
      ingredients: meal.ingredients,
      quantiteSolide: meal.quantite as SolideEvent["quantite"],
      nouveauAliment: meal.nouveauAliment,
      nomNouvelAliment: meal.nomNouvelAliment,
      allergenes: meal.allergenes,
      reaction: meal.reaction,
      aime: meal.aime,
    }),
    [],
  );

  useEffect(() => {
    if (!pendingOpen || !layoutReady) return;
    const task = InteractionManager.runAfterInteractions(() => {
      stashReturnTo();
      const returnTarget = returnTargetParam ?? returnToRef.current;

      openSheet({
        ownerId: sheetOwnerId,
        formType: "meals",
        mealType: pendingEditData?.type || mealType,
        editData: pendingEditData ? buildEditData(pendingEditData) : undefined,
        onSuccess: ensureTodayInRange,
        onDismiss: () => {
          editIdRef.current = null;
          maybeReturnTo(returnTarget);
        },
      });
      navigation.setParams({ openModal: undefined, editId: undefined } as any);
      setPendingOpen(false);
      setPendingEditData(null);
    });
    return () => task.cancel?.();
  }, [
    pendingOpen,
    layoutReady,
    mealType,
    pendingEditData,
    openSheet,
    navigation,
    buildEditData,
    // @ts-expect-error — ensureTodayInRange is a useCallback declared later in the component
    ensureTodayInRange,
  ]);

  useEffect(() => {
    if (!editId || !layoutReady) return;
    const normalizedId = Array.isArray(editId) ? editId[0] : editId;
    if (!normalizedId || editIdRef.current === normalizedId) return;
    const target = meals.find((meal) => meal.id === normalizedId);
    if (!target) return;
    stashReturnTo();
    editIdRef.current = normalizedId;
    setPendingEditData(target);
    setPendingOpen(true);
    navigation.setParams({ openModal: undefined, editId: undefined } as any);
  }, [editId, layoutReady, meals, navigation]);

  // ============================================
  // EFFECTS - DATA LISTENERS
  // ============================================

  // Écoute en temps réel - Tétées, Biberons ET Solides
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
    let solidesData: Meal[] = [];

    const mergeAndSortMeals = () => {
      const merged = [...teteesData, ...biberonsData, ...solidesData].sort(
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

    const unsubscribeSolides = ecouterSolides(
      activeChild.id,
      (solides) => {
        solidesData = solides;
        setSolidesLoaded(true);
        mergeAndSortMeals();
      },
      { waitForServer: true, depuis: startOfRange, jusqu: endOfRange },
    );

    return () => {
      unsubscribeTetees();
      unsubscribeBiberons();
      unsubscribeSolides();
    };
  }, [activeChild, daysWindow, rangeEndDate]);

  useEffect(() => {
    if (!activeChild?.id) return;
    setMeals([]);
    setGroupedMeals([]);
    setTeteesLoaded(false);
    setBiberonsLoaded(false);
    setSolidesLoaded(false);
    setEmptyDelayDone(false);
    setDaysWindow(14);
    setRangeEndDate(null);
    setIsLoadingMore(false);
    setHasMore(true);
    loadMoreVersionRef.current = 0;
    pendingLoadMoreRef.current = 0;
  }, [activeChild?.id]);

  const isMealsLoading = !(teteesLoaded && biberonsLoaded && solidesLoaded);
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
      pendingLoadMoreRef.current = 3;
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
          ["tetee", "biberon", "solide"],
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
    hasMoreEventsBeforeHybrid(
      activeChild.id,
      ["tetee", "biberon", "solide"],
      beforeDate,
    )
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
  }, [meals, selectedFilter, selectedDate]);

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

  const handleDateSelect = useCallback((day: DateData) => {
    setSelectedDate(day.dateString);
    setSelectedFilter(null);
    setShowCalendar(false);
    setExpandedDays(new Set([day.dateString]));
  }, []);

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

  const handleFilterPress = useCallback((filter: FilterType) => {
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
  // HELPERS - UI
  // ============================================

  const toggleExpand = useCallback((dateKey: string) => {
    Haptics.selectionAsync();
    setExpandedDays((prev) => {
      const next = new Set(prev);
      if (next.has(dateKey)) {
        next.delete(dateKey);
      } else {
        next.add(dateKey);
      }
      return next;
    });
  }, []);

  // ============================================
  // HANDLERS - MODAL
  // ============================================

  const openEditModal = useCallback((meal: Meal) => {
    setPendingEditData(meal);
    setPendingOpen(true);
  }, []);

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
    } else if (target === "chrono") {
      router.replace("/baby/chrono");
    } else if (target === "journal") {
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
  // HANDLERS - DELETE
  // ============================================

  const handleMealDelete = useCallback((meal: Meal) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setDeleteConfirm({ visible: true, meal });
  }, []);

  const confirmDelete = useCallback(async () => {
    if (!activeChild?.id || !deleteConfirm.meal?.id) return;
    const mealId = deleteConfirm.meal.id;
    setDeleteConfirm({ visible: false, meal: null });
    try {
      await supprimerEvenement(activeChild.id, mealId);
      showToast("Repas supprimé");
    } catch {
      showToast("Impossible de supprimer ce repas");
    }
  }, [activeChild?.id, deleteConfirm.meal, showToast]);

  const cancelDelete = useCallback(() => {
    setDeleteConfirm({ visible: false, meal: null });
  }, []);

  // ============================================
  // RENDER - MEAL ITEM
  // ============================================

  const renderMealItem = useCallback((meal: Meal, isLatest: boolean = false) => {
    const mealTime = new Date(meal.date?.seconds * 1000);
    const isTetee = meal.type === "tetee";
    const isBiberon = meal.type === "biberon";
    const isSolide = meal.type === "solide";
    const leftDuration = meal.dureeGauche ?? 0;
    const rightDuration = meal.dureeDroite ?? 0;
    const totalDuration = leftDuration + rightDuration;
    const hasDuration = leftDuration > 0 || rightDuration > 0;

    const getIcon = () => {
      if (isTetee) {
        return (
          <FontAwesome
            name="person-breastfeeding"
            size={14}
            color={eventColors.meal.dark}
          />
        );
      }
      if (isBiberon) {
        return (
          <MaterialCommunityIcons
            name="baby-bottle"
            size={16}
            color={eventColors.meal.dark}
          />
        );
      }
      return <FontAwesome name="bowl-food" size={14} color="#8BC34A" />;
    };

    const getTypeLabel = () => {
      if (isTetee) return "Tétée";
      if (isBiberon) return "Biberon";
      if (isSolide && meal.typeSolide) {
        return SOLIDE_TYPE_LABELS[meal.typeSolide] || "Solide";
      }
      return "Solide";
    };

    return (
      <ReanimatedSwipeable
        key={meal.id}
        renderRightActions={
          canManageContent && meal.id
            ? () => <DeleteAction onPress={() => handleMealDelete(meal)} />
            : undefined
        }
        friction={2}
        rightThreshold={40}
        overshootRight={false}
        enabled={canManageContent && !!meal.id}
      >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Modifier ce repas"
        style={({ pressed }) => [
          styles.sessionCard,
          {
            borderColor: nc.borderLight,
            backgroundColor: pressed ? nc.backgroundPressed : nc.backgroundCard,
          },
        ]}
        onPress={() => openEditModal(meal)}
      >
        {/* Time badge */}
        <View style={styles.sessionTime}>
          <Text
            style={[
              styles.sessionTimeText,
              { color: nc.textMuted },
              isLatest && { color: nc.textNormal, fontWeight: "600" },
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
              {
                backgroundColor: isSolide ? "#8BC34A1A" : `${eventColors.meal.dark}1A`,
              },
            ]}
          >
            {getIcon()}
          </View>
          <View style={styles.sessionDetails}>
            <Text style={[styles.sessionType, { color: nc.textStrong }]}>{getTypeLabel()}</Text>
            {isTetee && !hasDuration && (
              <Text style={[styles.sessionDetailText, { color: nc.textMuted }]}>
                {meal.coteGauche && meal.coteDroit
                  ? "Sein gauche · Sein droit"
                  : meal.coteGauche
                  ? "Sein gauche"
                  : meal.coteDroit
                  ? "Sein droit"
                  : "Durée non renseignée"}
              </Text>
            )}
            {isTetee && hasDuration && (
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
                    <Text style={[styles.durationLabelText, { color: nc.textMuted }]}>G</Text>
                    <Text style={[styles.durationLabelValue, { color: nc.textNormal }]}>
                      {leftDuration} min
                    </Text>
                  </View>
                  <View style={styles.durationLabelItem}>
                    <View
                      style={[styles.durationDot, styles.durationDotRight]}
                    />
                    <Text style={[styles.durationLabelText, { color: nc.textMuted }]}>D</Text>
                    <Text style={[styles.durationLabelValue, { color: nc.textNormal }]}>
                      {rightDuration} min
                    </Text>
                  </View>
                </View>
              </>
            )}
            {isBiberon && (
              <Text style={[styles.sessionDetailText, { color: nc.textLight }]}>
                {meal.typeBiberon && BIBERON_TYPE_LABELS[meal.typeBiberon]
                  ? BIBERON_TYPE_LABELS[meal.typeBiberon]
                  : "lait infantile"}
                {meal.quantite ? ` · ${meal.quantite} ml` : ""}
              </Text>
            )}
            {isSolide && (
              <View style={styles.solideDetailsRow}>
                {meal.momentRepas && (
                  <Text style={[styles.sessionDetailText, { color: nc.textLight }]}>
                    {MOMENT_REPAS_LABELS[meal.momentRepas]}
                    {" · "}
                    {(meal as any).quantiteSolide ?? meal.quantite ?? ""}
                  </Text>
                )}
                {(meal.aime !== undefined || meal.nouveauAliment) && (
                  <View
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 6,
                      flexWrap: "wrap",
                    }}
                  >
                    {meal.aime !== undefined && (
                      <Text
                        style={[
                          styles.sessionDetailText,
                          {
                            color: meal.aime ? "#16a34a" : "#dc2626",
                          },
                        ]}
                      >
                        {(() => {
                          const dishName =
                            meal.nomNouvelAliment || meal.ingredients || "";
                          if (meal.aime) {
                            return dishName
                              ? `A aimé ce plat : ${dishName}`
                              : "A aimé son plat";
                          }
                          return dishName
                            ? `N'a pas aimé ce plat : ${dishName}`
                            : "N'a pas aimé le plat";
                        })()}
                      </Text>
                    )}
                  </View>
                )}
              </View>
            )}
          </View>
        </View>

        {isTetee && hasDuration && (
          <View style={styles.sessionTotal}>
            <Text style={styles.sessionTotalValue}>{totalDuration}</Text>
            <Text style={[styles.sessionTotalUnit, { color: nc.textMuted }]}>min</Text>
          </View>
        )}

        {/* Edit icon */}
        <Ionicons name="create-outline" size={18} color={nc.textMuted} />
      </Pressable>
      </ReanimatedSwipeable>
    );
  }, [nc, canManageContent, handleMealDelete, openEditModal]);

  // ============================================
  // RENDER - DAY GROUP
  // ============================================

  const renderDayGroup = useCallback(({ item }: { item: MealGroup }) => {
    const isExpanded = expandedDays.has(item.date);
    const hasMultipleMeals = item.meals.length > 1;
    const teteesCount = item.meals.filter((m) => m.type === "tetee").length;
    const biberonsCount = item.meals.filter((m) => m.type === "biberon").length;
    const solidesCount = item.meals.filter((m) => m.type === "solide").length;

    // Format date: "Aujourd'hui", "Hier", or "Lun. 23 janv."
    const formatDayLabel = () => {
      const today = new Date();
      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);
      const itemDate = new Date(item.date);

      if (itemDate.toDateString() === today.toDateString() && selectedFilter !== "today") {
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
          <Text style={[styles.dayLabel, { color: nc.textStrong }]}>{formatDayLabel()}</Text>
          <View style={styles.dayStats}>
            <View style={styles.dayStatItem}>
              <Text style={[styles.dayStatValue, { color: nc.textStrong }]}>{item.meals.length}</Text>
              <Text style={[styles.dayStatLabel, { color: nc.textMuted }]}>repas</Text>
            </View>
          </View>
        </View>

        {/* Stats breakdown */}
        <View style={styles.statsBreakdown}>
          {teteesCount > 0 && (
            <View style={styles.statsBreakdownItem}>
              <View
                style={[
                  styles.statsBreakdownDot,
                  { backgroundColor: eventColors.meal.dark },
                ]}
              />
              <Text style={[styles.statsBreakdownLabel, { color: nc.textLight }]}>
                Tétée{teteesCount > 1 ? "s" : ""}
              </Text>
              <Text style={[styles.statsBreakdownValue, { color: nc.textNormal }]}>{teteesCount}</Text>
            </View>
          )}
          {biberonsCount > 0 && (
            <View style={styles.statsBreakdownItem}>
              <View
                style={[
                  styles.statsBreakdownDot,
                  { backgroundColor: "#6366f1" },
                ]}
              />
              <Text style={[styles.statsBreakdownLabel, { color: nc.textLight }]}>
                Biberon{biberonsCount > 1 ? "s" : ""}
              </Text>
              <Text style={[styles.statsBreakdownValue, { color: nc.textNormal }]}>{biberonsCount}</Text>
              <Text style={[styles.statsBreakdownLabel, { color: nc.textLight }]}>·</Text>
              <Text
                style={[
                  styles.statsBreakdownLabel,
                  { color: eventColors.meal.dark, fontWeight: "600" },
                ]}
              >
                {item.totalQuantity} ml
              </Text>
            </View>
          )}
          {solidesCount > 0 && (
            <View style={styles.statsBreakdownItem}>
              <View
                style={[
                  styles.statsBreakdownDot,
                  { backgroundColor: "#8BC34A" },
                ]}
              />
              <Text style={[styles.statsBreakdownLabel, { color: nc.textLight }]}>
                Solide{solidesCount > 1 ? "s" : ""}
              </Text>
              <Text style={[styles.statsBreakdownValue, { color: nc.textNormal }]}>{solidesCount}</Text>
            </View>
          )}
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
                style={({ pressed }) => [
                  styles.expandTrigger,
                  { borderColor: nc.borderLight, backgroundColor: pressed ? nc.backgroundPressed : nc.backgroundCard },
                ]}
                onPress={() => toggleExpand(item.date)}
                accessibilityRole="button"
                accessibilityLabel={isExpanded ? "Masquer les repas" : `Voir ${item.meals.length - 1} autre${item.meals.length > 2 ? "s" : ""} repas`}
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
  }, [expandedDays, nc, renderMealItem, toggleExpand, selectedFilter]);

  // ============================================
  // RENDER - MAIN
  // ============================================

  return (
    <GestureHandlerRootView style={[styles.container, { backgroundColor: nc.background }]}>
      <SafeAreaView
        style={{ flex: 1 }}
        edges={["bottom"]}
        onLayout={() => setLayoutReady(true)}
      >
        <View>
          {/* Filtres */}
          <DateFilterBar
            selected={selectedFilter as any}
            onSelect={handleFilterPress}
          />

          {/* Calendrier */}
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

        {/* Liste des repas */}
        {isMealsLoading || !emptyDelayDone ? (
          <View style={styles.emptyContainer}>
            <IconPulseDots color={Colors[colorScheme].tint} />
          </View>
        ) : (
          <FlatList
            data={groupedMeals}
            keyExtractor={(item) => item.date}
            renderItem={renderDayGroup}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={[styles.listContent, { flexGrow: 1 }]}
            ListEmptyComponent={
              <View style={styles.emptyContainer}>
                <Ionicons
                  name="restaurant-outline"
                  size={64}
                  color={Colors[colorScheme].tabIconDefault}
                />
                <Text style={[styles.emptyText, { color: nc.textNormal }]}>
                  {meals.length === 0
                    ? "Aucun repas enregistré"
                    : "Aucun repas pour ce filtre"}
                </Text>
                {meals.length === 0 && (
                  <Pressable
                    onPress={() => openAddModal()}
                    style={[styles.emptyAddButton, { backgroundColor: Colors[colorScheme].tint }]}
                    accessibilityRole="button"
                    accessibilityLabel="Ajouter le premier repas"
                  >
                    <Ionicons name="add" size={16} color="#fff" />
                    <Text style={styles.emptyAddButtonText}>Ajouter un repas</Text>
                  </Pressable>
                )}
                {!(selectedFilter === "today" || selectedDate) && meals.length > 0 && (
                  <LoadMoreButton
                    hasMore={hasMore}
                    loading={isLoadingMore}
                    onPress={handleLoadMore}
                    text="Voir plus"
                    accentColor={Colors[colorScheme].tint}
                  />
                )}
              </View>
            }
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

      <ConfirmModal
        visible={deleteConfirm.visible}
        title="Supprimer ce repas ?"
        message="Cette action est irréversible."
        confirmText="Supprimer"
        cancelText="Annuler"
        backgroundColor={nc.backgroundCard}
        textColor={nc.textStrong}
        confirmButtonColor="#ef4444"
        onConfirm={confirmDelete}
        onCancel={cancelDelete}
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
  },
  headerButton: {
    paddingVertical: 8,
    borderRadius: 8,
    paddingHorizontal: 8,
    // marginRight: 8,
  },
  calendarContainer: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderBottomWidth: 1,
  },
  listContent: {
    paddingHorizontal: 16,
    paddingTop: 8,
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
  },
  statsBreakdownValue: {
    fontSize: 12,
    fontWeight: "600",
  },

  // Sessions Container
  sessionsContainer: {
    gap: 2,
  },

  // Session Card
  sessionCard: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 14,
    paddingHorizontal: 16,
    gap: 12,
    borderRadius: 14,
    borderWidth: 1,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 3,
    elevation: 1,
  },
  sessionTime: {
    width: 52,
  },
  sessionTimeText: {
    fontSize: 13,
    fontWeight: "500",
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
  },
  sessionDetailText: {
    fontSize: 12,
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
  },
  durationLabelValue: {
    fontSize: 11,
    fontWeight: "600",
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
  },

  // Expand Trigger
  expandTrigger: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    paddingVertical: 12,
    borderRadius: 14,
    borderWidth: 1,
  },
  expandTriggerText: {
    fontSize: 13,
    fontWeight: "500",
    color: eventColors.meal.dark,
  },

  emptyText: {
    fontSize: 18,
    fontWeight: "600",
  },

  emptyContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
  },

  emptyAddButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 24,
    marginTop: 4,
  },

  emptyAddButtonText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "600",
  },

  // Solide list item
  solideDetailsRow: {
    flexDirection: "column",
    alignItems: "flex-start",
    gap: 2,
  },

  // Swipe-to-delete
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
