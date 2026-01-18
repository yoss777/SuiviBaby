import { ThemedText } from "@/components/themed-text";
import { ConfirmModal } from "@/components/ui/ConfirmModal";
import { FormBottomSheet } from "@/components/ui/FormBottomSheet";
import { IconPulseDots } from "@/components/ui/IconPulseDtos";
import { LoadMoreButton } from "@/components/ui/LoadMoreButton";
import { MAX_AUTO_LOAD_ATTEMPTS } from "@/constants/pagination";
import { Colors } from "@/constants/theme";
import { useBaby } from "@/contexts/BabyContext";
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
  hasMoreEventsBeforeHybrid,
} from "@/migration/eventsHybridService";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import FontAwesome from "@expo/vector-icons/FontAwesome6";
import BottomSheet from "@gorhom/bottom-sheet";
import DateTimePicker from "@react-native-community/datetimepicker";
import { useNetInfo } from "@react-native-community/netinfo";
import { useFocusEffect } from "@react-navigation/native";
import { router, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
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
import { useHeaderRight } from "../_layout";

// ============================================
// TYPES
// ============================================
type MealType = "tetee" | "biberon";
type FilterType = "today" | "past";

interface Meal {
  id: string;
  type?: MealType;
  quantite?: number | null;
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
  const { showToast } = useToast();
  const headerOwnerId = useRef(`meals-${Math.random().toString(36).slice(2)}`);
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
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [autoLoadMore, setAutoLoadMore] = useState(false);
  const [autoLoadMoreAttempts, setAutoLoadMoreAttempts] = useState(0);
  const loadMoreVersionRef = useRef(0);
  const pendingLoadMoreRef = useRef(0);

  // États du formulaire
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [editingMeal, setEditingMeal] = useState<Meal | null>(null);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [mealType, setMealType] = useState<MealType>("tetee");
  const [layoutReady, setLayoutReady] = useState(false);
  const [pendingOpen, setPendingOpen] = useState(false);
  const [dateHeure, setDateHeure] = useState<Date>(new Date());
  const [quantite, setQuantite] = useState<number>(100);

  // États des pickers
  const [showDate, setShowDate] = useState(false);
  const [showTime, setShowTime] = useState(false);

  // Récupérer les paramètres de l'URL
  const { tab, openModal, editId } = useLocalSearchParams();
  const editIdRef = useRef<string | null>(null);

  // Ref pour la gestion du picker avec accélération
  const intervalRef = useRef<number | undefined>(undefined);

  // Ref pour le BottomSheet
  const bottomSheetRef = useRef<BottomSheet>(null);

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
          today.getMonth() + 1
        ).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
        setSelectedDate(todayString);
        setSelectedFilter(null);
      }
      // Ne plus réinitialiser la date sélectionnée lors de la fermeture du calendrier

      return newValue;
    });
  }, []);

  // Gérer l'ouverture du modal d'ajout
  const expandBottomSheet = useCallback(() => {
    bottomSheetRef.current?.expand();
    setTimeout(() => bottomSheetRef.current?.expand(), 250);
  }, []);

  const openAddModal = useCallback((preferredType?: "seins" | "biberons") => {
    setDateHeure(new Date());
    setEditingMeal(null);
    setIsSubmitting(false);

    if (preferredType === "seins") {
      setMealType("tetee");
    } else if (preferredType === "biberons") {
      setMealType("biberon");
      setQuantite(100);
    } else {
      setMealType("tetee");
    }

    expandBottomSheet();
  }, [expandBottomSheet]);

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
    ])
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

  // Ouvrir automatiquement le modal si le paramètre openModal est présent
  useFocusEffect(
    useCallback(() => {
      if (openModal !== "true") return;
      setPendingOpen(true);
    }, [openModal])
  );

  useEffect(() => {
    if (!pendingOpen || !layoutReady) return;
    const task = InteractionManager.runAfterInteractions(() => {
      openAddModal(tab as "seins" | "biberons" | undefined);
      router.replace("/(drawer)/baby/meals");
      setPendingOpen(false);
    });
    return () => task.cancel?.();
  }, [pendingOpen, layoutReady, tab, openAddModal, router]);

  useEffect(() => {
    if (!editId || !layoutReady) return;
    const normalizedId = Array.isArray(editId) ? editId[0] : editId;
    if (!normalizedId || editIdRef.current === normalizedId) return;
    const target = meals.find((meal) => meal.id === normalizedId);
    if (!target) return;
    editIdRef.current = normalizedId;
    openEditModal(target);
    router.replace("/(drawer)/baby/meals");
  }, [editId, layoutReady, meals, router]);

  // ============================================
  // EFFECTS - DATA LISTENERS
  // ============================================

  // Écoute en temps réel - Tétées ET Biberons
  useEffect(() => {
    if (!activeChild?.id) return;
    const versionAtSubscribe = loadMoreVersionRef.current;
    const endOfToday = new Date();
    endOfToday.setHours(23, 59, 59, 999);
    const startOfRange = new Date();
    startOfRange.setHours(0, 0, 0, 0);
    startOfRange.setDate(startOfRange.getDate() - (daysWindow - 1));

    let teteesData: Meal[] = [];
    let biberonsData: Meal[] = [];

    const mergeAndSortMeals = () => {
      const merged = [...teteesData, ...biberonsData].sort(
        (a, b) => (b.date?.seconds || 0) - (a.date?.seconds || 0)
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
      { waitForServer: true, depuis: startOfRange, jusqu: endOfToday }
    );

    const unsubscribeBiberons = ecouterBiberons(
      activeChild.id,
      (biberons) => {
        biberonsData = biberons;
        setBiberonsLoaded(true);
        mergeAndSortMeals();
      },
      { waitForServer: true, depuis: startOfRange, jusqu: endOfToday }
    );

    return () => {
      unsubscribeTetees();
      unsubscribeBiberons();
    };
  }, [activeChild, daysWindow]);

  useEffect(() => {
    if (!activeChild?.id) return;
    setMeals([]);
    setGroupedMeals([]);
    setTeteesLoaded(false);
    setBiberonsLoaded(false);
    setEmptyDelayDone(false);
    setDaysWindow(14);
    setIsLoadingMore(false);
    setHasMore(true);
    loadMoreVersionRef.current = 0;
    pendingLoadMoreRef.current = 0;
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

  const loadMoreStep = useCallback((auto = false) => {
    if (!hasMore) return;
    setIsLoadingMore(true);
    pendingLoadMoreRef.current = 2;
    loadMoreVersionRef.current += 1;
    setDaysWindow((prev) => prev + 14);
    if (!auto) {
      setAutoLoadMore(true);
      setAutoLoadMoreAttempts(0);
    }
  }, [hasMore]);

  const handleLoadMore = useCallback(() => {
    loadMoreStep(false);
  }, [loadMoreStep]);

  useEffect(() => {
    if (selectedFilter === "today" || selectedDate) return;
    if (!autoLoadMore && !isMealsLoading && groupedMeals.length === 0 && hasMore) {
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
    const startOfRange = new Date();
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
  }, [activeChild?.id, daysWindow]);

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
      today.getMonth() + 1
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
    }, [applyTodayFilter, selectedDate, selectedFilter])
  );

  // ============================================
  // HELPERS - GROUPING
  // ============================================

  const groupMealsByDay = (meals: Meal[]): MealGroup[] => {
    const groups: { [key: string]: Meal[] } = {};

    meals.forEach((meal) => {
      const date = new Date(meal.date?.seconds * 1000);
      const dateKey = `${date.getFullYear()}-${String(
        date.getMonth() + 1
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
          meals: meals.sort(
            (a, b) => (b.date?.seconds || 0) - (a.date?.seconds || 0)
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

  const getMealTypeLabel = (type?: MealType): string => {
    if (!type) return "Inconnu";
    return type === "tetee" ? "Sein" : "Biberon";
  };

  const getMealIcon = (type?: MealType) => {
    switch (type) {
      case "tetee":
        return {
          lib: "FontAwesome",
          name: "person-breastfeeding",
        };
      case "biberon":
        return {
          lib: "MaterialCommunityIcons",
          name: "baby-bottle",
        };
      default:
        return {
          lib: "FontAwesome",
          name: "utensils",
        };
    }
  };

  // ============================================
  // HANDLERS - MODAL
  // ============================================

  const openEditModal = (meal: Meal) => {
    setDateHeure(new Date(meal.date.seconds * 1000));
    setEditingMeal(meal);
    setIsSubmitting(false);

    // Déterminer le type (avec fallback pour anciennes données)
    const type = meal.type || "tetee";
    setMealType(type);

    // Quantité (avec fallback)
    const quantity = meal.quantite ?? 100;
    setQuantite(quantity);

    bottomSheetRef.current?.expand();
  };

  const closeModal = () => {
    bottomSheetRef.current?.close();
    setIsSubmitting(false);
    setEditingMeal(null);
  };

  const cancelForm = useCallback(() => {
    closeModal();
  }, []);

  // ============================================
  // HANDLERS - CRUD
  // ============================================

  const handleSubmit = async () => {
    if (isSubmitting || !activeChild) return;

    try {
      setIsSubmitting(true);

      const isTetee = mealType === "tetee";
      const dataToSave = {
        type: mealType,
        quantite: isTetee ? null : quantite,
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
            : "Ajout en attente de synchronisation"
        );
      }
      closeModal();
    } catch (error) {
      console.error("Erreur lors de la sauvegarde du repas:", error);
      Alert.alert(
        "Erreur",
        "Impossible de sauvegarder le repas. Veuillez réessayer."
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
      Alert.alert("Erreur", "Impossible de supprimer le repas. Veuillez réessayer.");
    } finally {
      setIsSubmitting(false);
    }
  };

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
  // RENDER - MEAL ITEM
  // ============================================

  const renderMealItem = (meal: Meal, isLast: boolean = false) => {
    const typeLabel = getMealTypeLabel(meal.type);
    const icon = getMealIcon(meal.type);

    const quantityDisplay =
      meal.quantite !== null && meal.quantite !== undefined
        ? `${meal.quantite} ml`
        : "N/A";

    return (
      <TouchableOpacity
        key={meal.id}
        style={[styles.mealItem, isLast && styles.lastMealItem]}
        onPress={() => openEditModal(meal)}
        activeOpacity={0.7}
      >
        <View style={styles.mealContent}>
          <View style={[styles.avatar, { backgroundColor: "#4A90E2" }]}>
            {icon.lib === "FontAwesome" ? (
              <FontAwesome name={icon.name} size={20} color="#fff" />
            ) : (
              <MaterialCommunityIcons name={icon.name} size={20} color="#fff" />
            )}
          </View>
          <View style={styles.mealInfo}>
            <View style={styles.infoRow}>
              <Text style={styles.mealTypeText}>
                Quantité : {quantityDisplay}
              </Text>
            </View>
            <View style={styles.infoRow}>
              <Text style={styles.timeText}>
                {new Date(meal.date?.seconds * 1000).toLocaleTimeString(
                  "fr-FR",
                  {
                    hour: "2-digit",
                    minute: "2-digit",
                  }
                )}
              </Text>
            </View>
          </View>
          <View style={styles.mealActions}>
            <FontAwesome
              name="edit"
              size={16}
              color="#4A90E2"
              style={styles.editIcon}
            />
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  // ============================================
  // RENDER - DAY GROUP
  // ============================================

  const renderDayGroup = ({ item }: { item: MealGroup }) => {
    const isExpanded = expandedDays.has(item.date);
    const hasMultipleMeals = item.meals.length > 1;

    return (
      <View style={styles.dayCard}>
        <View style={styles.dayHeader}>
          <View style={styles.dayInfo}>
            <Text style={styles.dayDate}>{item.dateFormatted}</Text>
            <View style={styles.summaryInfo}>
              <View style={styles.summaryRow}>
                <View style={styles.summaryBadge}>
                  <FontAwesome name="baby" size={14} color="#4A90E2" />
                  <Text style={styles.summaryText}>
                    {item.meals.length} repas
                  </Text>
                </View>
              </View>
            </View>
            <View style={styles.dailySummary}>
              <View style={styles.dailyQuantityItem}>
                {item.totalQuantity > 0 ? (
                  <Text style={styles.dailyQuantityLabel}>
                    Biberon(s) :{" "}
                    <Text style={styles.dailyQuantityValue}>
                      {item.totalQuantity} ml
                    </Text>
                  </Text>
                ) : (
                  <Text style={styles.dailyQuantityLabel}>0 biberon</Text>
                )}
              </View>
            </View>
          </View>
          {hasMultipleMeals && (
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
        {renderMealItem(item.lastMeal, true)}
        {hasMultipleMeals && isExpanded && (
          <View style={styles.expandedContent}>
            <View style={styles.separator} />
            <Text style={styles.historyLabel}>Historique du jour</Text>
            {item.meals
              .filter((meal) => meal.id !== item.lastMeal.id)
              .map((meal) => renderMealItem(meal))}
          </View>
        )}
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
                text="Voir plus (14 jours)"
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
                  text="Voir plus (14 jours)"
                  accentColor={Colors[colorScheme].tint}
                />
              )
            }
          />
        )}

        {/* Bottom Sheet d'ajout/édition */}
        <FormBottomSheet
          ref={bottomSheetRef}
          title={editingMeal ? "Modifier le repas" : "Nouveau repas"}
          icon="baby"
          accentColor="#4A90E2"
          isEditing={!!editingMeal}
          isSubmitting={isSubmitting}
          onSubmit={handleSubmit}
          onDelete={editingMeal ? handleDelete : undefined}
          onCancel={cancelForm}
          onClose={() => {
            setIsSubmitting(false);
            setEditingMeal(null);
          }}
        >
          {/* Sélection du type de repas */}
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

          {/* Quantité (si biberon) */}
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
                  onPressIn={() =>
                    handlePressIn(() => setQuantite((q) => q + 5))
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
          ) : (
            <View style={styles.quantityNA}>
              <Text style={styles.quantityNAText}>Quantité : N/A</Text>
            </View>
          )}

          {/* Date & Heure */}
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
                color={isSubmitting ? "#ccc" : "#666"}
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
                color={isSubmitting ? "#ccc" : "#666"}
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

          {/* Date/Time Pickers */}
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
        </FormBottomSheet>

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
    paddingVertical: 16,
    // paddingBottom: 8,
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
  filterButtonActive: {
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  filterText: {
    fontSize: 14,
    fontWeight: "600",
  },
  filterTextActive: {
    color: "#fff",
  },
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
    marginBottom: 8,
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
    fontSize: 14,
    color: "#666",
  },
  dailySummary: {
    flexDirection: "row",
    gap: 16,
  },
  dailyQuantityItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  dailyQuantityLabel: {
    fontSize: 12,
    color: "#666",
  },
  dailyQuantityValue: {
    fontSize: 12,
    color: "#4A90E2",
    fontWeight: "600",
  },
  expandButton: {
    padding: 8,
    borderRadius: 8,
    backgroundColor: "#f0f0f0",
  },
  // Meal Section
  section: {
    marginBottom: 24,
  },
  dateHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 12,
    paddingHorizontal: 16,
    marginBottom: 12,
    borderRadius: 12,
    borderLeftWidth: 4,
  },
  dateText: {
    fontSize: 16,
    fontWeight: "600",
    textTransform: "capitalize",
  },
  // Meal Item
  mealItem: {
    backgroundColor: "#f8f9fa",
    borderRadius: 8,
    padding: 12,
    marginBottom: 8,
  },
  lastMealItem: {
    backgroundColor: "#e8f4fd",
    borderLeftWidth: 4,
    borderLeftColor: "#4A90E2",
  },
  mealContent: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
  },
  mealInfo: {
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
  mealTypeText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#333",
  },
  mealActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  quantityBadge: {
    backgroundColor: "#4A90E2",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
  },
  quantityText: {
    color: "white",
    fontSize: 14,
    fontWeight: "600",
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
    backgroundColor: "#4A90E2",
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
    marginBottom: 16,
  },
  quantityButton: {
    backgroundColor: "#f0f0f0",
    padding: 12,
    borderRadius: 8,
    minWidth: 40,
    alignItems: "center",
  },
  quantityButtonDisabled: {
    backgroundColor: "#f8f8f8",
    opacity: 0.5,
  },
  quantityButtonText: {
    fontSize: 20,
    fontWeight: "bold",
    color: "#666",
  },
  quantityButtonTextDisabled: {
    color: "#ccc",
  },
  quantityValue: {
    fontSize: 20,
    marginHorizontal: 20,
    fontWeight: "bold",
    color: "#000000",
  },

  // Date/Time
  dateTimeContainer: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 10,
    marginBottom: 10,
  },
  dateButton: {
    backgroundColor: "#f0f0f0",
    padding: 12,
    borderRadius: 8,
    alignItems: "center",
    flex: 1,
  },
  dateButtonDisabled: {
    backgroundColor: "#f5f5f5",
    opacity: 0.5,
  },
  dateButtonText: {
    fontSize: 16,
    color: "#666",
    marginTop: 4,
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
  // autres...
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    flexWrap: "wrap",
  },
  avatar: {
    width: 46,
    height: 46,
    borderRadius: 28,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
});
