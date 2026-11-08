import {
  InsightCard,
  MilestoneTimelineCard,
  PromenadeWidget,
  RecentEventsList,
  SleepWidget,
  StatsGroup,
  TipsCarousel,
  type StatItem,
} from "@/components/suivibaby/dashboard";
import { ReminderWarningWatcher } from "@/components/suivibaby/dashboard/ReminderWarningWatcher";
import { FirstTrackGuide } from "@/components/suivibaby/FirstTrackGuide";
import { ConfirmModal } from "@/components/ui/ConfirmModal";
import {
  getCategoryColors,
  getNeutralColors,
  itemColors,
} from "@/constants/dashboardColors";
import { MOMENT_REPAS_LABELS, MOOD_EMOJIS } from "@/constants/dashboardConfig";
import { useBaby } from "@/contexts/BabyContext";
import { useSheet } from "@/contexts/SheetContext";
import { useToast } from "@/contexts/ToastContext";
import { useDeleteWithUndo } from "@/hooks/useDeleteWithUndo";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { useCanManageContent } from "@/hooks/useCanManageContent";
import { useEventEditHandler } from "@/hooks/useEventEditHandler";
import { useForegroundServerRefresh } from "@/hooks/useForegroundServerRefresh";
import { useMergedOptimisticEvents } from "@/hooks/useMergedOptimisticEvents";
import { useCalendarDay } from "@/hooks/useMinuteTick";
import { useWeeklyInsightEvents, withLiveToday } from "@/hooks/useWeeklyInsightEvents";
import { useReminderScheduler } from "@/hooks/useReminderScheduler";
import { useSmartContent } from "@/hooks/useSmartContent";
import { getWeeklyEventsCache } from "@/services/weeklyEventsCache";
import { getOptimisticEntries, subscribe as subscribeOptimistic } from "@/services/optimisticEventsStore";
import { mergeOptimisticTemperatures } from "@/utils/mergeOptimisticTemperatures";
import { useStopTimedEventWithUndo } from "@/hooks/useStopTimedEventWithUndo";
import { MilestoneTimeline } from "@/components/suivibaby/MilestoneTimeline";
import { getAgeInWeeks } from "@/utils/ageUtils";
import { getDateTime, isValidDate, toDate } from "@/utils/date";
import { buildEventDetails, getDayLabel } from "@/utils/eventDisplay";
import { formatSleepLocationWithNote } from "@/utils/sleepDisplay";
import { ajouterEvenementOptimistic, ecouterEvenementsDuJour, obtenirEvenements, supprimerEvenement } from "@/services/eventsService";
import { obtenirPreferencesNotifications } from "@/services/userPreferencesService";
import { getPreferencesCache } from "@/services/userPreferencesCache";
import {
  buildTodayEventsData,
  getTodayEventsCache,
  getTodayTypes,
} from "@/services/todayEventsCache";
import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useFocusEffect } from "@react-navigation/native";
import * as Haptics from "expo-haptics";
import { useLocalSearchParams } from "expo-router";
import { useGuardedNavigation } from "@/hooks/useGuardedNavigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  BackHandler,
  Easing,
  Modal,
  Platform,
  RefreshControl,
  ScrollView,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { HomeSkeleton } from "@/components/suivibaby/home/HomeSkeleton";
import { HomeSmartContent } from "@/components/suivibaby/home/HomeSmartContent";
import { HomeMilestoneCelebration } from "@/components/suivibaby/home/HomeMilestoneCelebration";
import { homeStyles as styles } from "@/components/suivibaby/home/styles";
import { startLoop } from "@/utils/motion";

// ============================================
// SKELETON LOADING (P1)
// ============================================

// Instant render — no stagger animation (utilitaire dashboard, pas de delay)
function StaggeredCard({ children }: { index?: number; visible?: boolean; children: React.ReactNode }) {
  return <>{children}</>;
}

// ============================================
// CONSTANTS
// ============================================

const RECENT_EVENTS_CUTOFF_HOURS = 24;
const RECENT_EVENTS_MAX = 7;

// ============================================
// TYPES
// ============================================

interface DashboardData {
  tetees: any[];
  biberons: any[];
  solides: any[];
  pompages: any[];
  croissances: any[];
  sommeils: any[];
  bains: any[];
  mictions: any[];
  selles: any[];
  temperatures: any[];
  medicaments: any[];
  symptomes: any[];
  vitamines: any[];
  vaccins: any[];
  activites: any[];
  jalons: any[];
  nettoyagesNez: any[];
}

interface MealsStats {
  total: {
    count: number;
    quantity: number;
    lastTime?: string;
    lastTimestamp?: number;
  };
  seins: {
    count: number;
    lastTime?: string;
    lastTimestamp?: number;
  };
  biberons: {
    count: number;
    quantity: number;
    lastTime?: string;
    lastTimestamp?: number;
  };
  solides: {
    count: number;
    lastTime?: string;
    lastTimestamp?: number;
  };
  /** Last meal timestamp across all days (not just today) */
  lastAbsoluteTimestamp?: number;
}

interface TodayStats {
  meals: MealsStats;
  pompages: {
    count: number;
    quantity: number;
    lastTime?: string;
    lastTimestamp?: number;
  };
  sommeil: {
    count: number;
    totalMinutes: number;
    lastTime?: string;
    lastTimestamp?: number;
  };
  mictions: {
    count: number;
    lastTime?: string;
    lastTimestamp?: number;
    lastAbsoluteTimestamp?: number;
  };
  selles: {
    count: number;
    lastTime?: string;
    lastTimestamp?: number;
    lastAbsoluteTimestamp?: number;
  };
  vitamines: { count: number; lastTime?: string; lastTimestamp?: number };
  vaccins: { count: number; lastTime?: string; lastTimestamp?: number };
}


// ============================================
// COMPONENT
// ============================================

export default function HomeDashboard() {
  const { push: guardedPush } = useGuardedNavigation();
  const { activeChild, reminderPreferences } = useBaby();
  const { firstTrack } = useLocalSearchParams<{ firstTrack?: string }>();
  const [showFirstTrackGuide, setShowFirstTrackGuide] = useState(firstTrack === "true");
  const colorScheme = useColorScheme() ?? "light";
  const nc = getNeutralColors(colorScheme);
  const cat = getCategoryColors(colorScheme);
  const headerOwnerId = useRef(`home-${Math.random().toString(36).slice(2)}`);
  const { openSheet: openSheetRaw } = useSheet();
  const { showToast } = useToast();
  const scheduleDelete = useDeleteWithUndo();
  // R7: Reminder prefs come from BabyContext's real-time listener (no extra Firestore read)
  const remindersEnabled = reminderPreferences.enabled;
  const reminderThresholds = reminderPreferences.thresholds;
  const [showRecentHint, setShowRecentHint] = useState(false);
  const {
    mergedEvents: mergedTodayEvents,
    setFirestoreEvents,
    refreshMerged,
  } = useMergedOptimisticEvents<any>({
    childId: activeChild?.id,
  });

  const [refreshTick, setRefreshTick] = useState(0);
  const [loadError, setLoadError] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [dismissedInsightIds, setDismissedInsightIds] = useState<Set<string>>(new Set());
  const canManageContent = useCanManageContent();

  const [showMilestonesModal, setShowMilestonesModal] = useState(false);
  const lastBackPressRef = useRef(0);

  const [deleteConfirm, setDeleteConfirm] = useState<{
    visible: boolean;
    event: any | null;
  }>({ visible: false, event: null });
  const [softDeletedIds, setSoftDeletedIds] = useState<Set<string>>(new Set());
  const softDeletedIdsRef = useRef<Set<string>>(new Set());
  // Keep ref in sync with state for use in closures (scheduleMerge)
  softDeletedIdsRef.current = softDeletedIds;
  const prefsCached = getPreferencesCache();
  const [tipsEnabled, setTipsEnabled] = useState(prefsCached?.tips ?? true);
  const [insightsEnabled, setInsightsEnabled] = useState(prefsCached?.insights ?? true);
  const [correlationsEnabled, setCorrelationsEnabled] = useState(prefsCached?.correlations ?? true);

  // États des données — initialisés depuis le cache boot pour éviter le flash
  const emptyData: DashboardData = {
    tetees: [],
    biberons: [],
    solides: [],
    pompages: [],
    croissances: [],
    mictions: [],
    selles: [],
    sommeils: [],
    bains: [],
    temperatures: [],
    medicaments: [],
    symptomes: [],
    vitamines: [],
    vaccins: [],
    activites: [],
    jalons: [],
    nettoyagesNez: [],
  };
  const initialCache = activeChild?.id ? getTodayEventsCache(activeChild.id) : null;
  const [data, setData] = useState<DashboardData>(
    initialCache ? { ...emptyData, ...initialCache } : emptyData,
  );

  const [todayStats, setTodayStats] = useState<TodayStats>({
    meals: {
      total: { count: 0, quantity: 0 },
      seins: { count: 0 },
      biberons: { count: 0, quantity: 0 },
      solides: { count: 0 },
    },
    pompages: { count: 0, quantity: 0 },
    sommeil: { count: 0, totalMinutes: 0 },
    mictions: { count: 0 },
    selles: { count: 0 },
    vitamines: { count: 0 },
    vaccins: { count: 0 },
  });

  // S7.6 : l'accueil ne porte plus le tick à la minute (chaque widget qui
  // affiche l'heure a le sien) ; il ne suit que le changement de jour.
  const currentDay = useCalendarDay();
  const hasInitialCache = !!initialCache;
  const [loading, setLoading] = useState({
    tetees: !hasInitialCache,
    biberons: !hasInitialCache,
    solides: !hasInitialCache,
    pompages: !hasInitialCache,
    croissances: !hasInitialCache,
    sommeils: !hasInitialCache,
    bains: !hasInitialCache,
    mictions: !hasInitialCache,
    selles: !hasInitialCache,
    temperatures: !hasInitialCache,
    medicaments: !hasInitialCache,
    symptomes: !hasInitialCache,
    vitamines: !hasInitialCache,
    vaccins: !hasInitialCache,
    activites: !hasInitialCache,
    jalons: !hasInitialCache,
    nettoyagesNez: !hasInitialCache,
  });

  // Global loaded state for entrance animations
  const isDataLoaded = useMemo(() => {
    return (
      !loading.tetees &&
      !loading.biberons &&
      !loading.pompages &&
      !loading.mictions &&
      !loading.selles &&
      !loading.vitamines &&
      !loading.vaccins &&
      !loading.sommeils &&
      !loading.jalons
    );
  }, [loading]);

  const handleRefresh = useCallback(async () => {
    if (!activeChild?.id) return;
    setIsRefreshing(true);
    try {
      // Fetch one-shot depuis le serveur sans recréer le listener
      // Le listener existant continue de tourner et recevra les updates
      const freshEvents = await obtenirEvenements(activeChild.id, {
        type: getTodayTypes() as any,
        depuis: (() => { const d = new Date(); d.setDate(d.getDate() - 1); d.setHours(0,0,0,0); return d; })(),
        jusqu: (() => { const d = new Date(); d.setDate(d.getDate() + 1); return new Date(d.getTime() - 1); })(),
      });
      setFirestoreEvents(freshEvents, { preserveExisting: true });
    } catch {
      // Le listener existant garde les données en cache
    } finally {
      setIsRefreshing(false);
    }
  }, [activeChild?.id, setFirestoreEvents]);

  useForegroundServerRefresh({
    enabled: !!activeChild?.id,
    childId: activeChild?.id,
    refresh: async () => {
      if (!activeChild?.id) return [];
      const depuis = new Date();
      depuis.setDate(depuis.getDate() - 1);
      depuis.setHours(0, 0, 0, 0);
      const jusqu = new Date();
      jusqu.setDate(jusqu.getDate() + 1);
      jusqu.setHours(0, 0, 0, 0);
      const jusquInclusive = new Date(jusqu.getTime() - 1);
      return obtenirEvenements(activeChild.id, {
        type: getTodayTypes() as any,
        depuis,
        jusqu: jusquInclusive,
        source: "server",
      });
    },
    apply: (freshEvents) => {
      setFirestoreEvents(freshEvents);
    },
  });

  const openSheet = useCallback(
    (props: Parameters<typeof openSheetRaw>[0]) => {
      openSheetRaw({
        ...props,
        onSuccess: () => {
          (props as any).onSuccess?.();
          showToast("Enregistré ✓");
        },
      });
    },
    [openSheetRaw],
  );

  const handleEventDelete = useCallback((event: any) => {
    if (event.id?.startsWith?.('__optimistic_')) {
      showToast('Enregistrement en cours...');
      return;
    }
    setDeleteConfirm({ visible: true, event });
  }, [showToast]);

  const confirmDelete = useCallback(async () => {
    if (!activeChild?.id || !deleteConfirm.event?.id) return;
    const eventId = deleteConfirm.event.id;
    setDeleteConfirm({ visible: false, event: null });
    // P5: soft-delete + undo
    setSoftDeletedIds((prev) => new Set(prev).add(eventId));
    const childId = activeChild.id;
    // La suppression part après le délai d'annulation, ou tout de suite si
    // l'app passe en arrière-plan ; « Réessayer » relance sans fermeture périmée.
    scheduleDelete({
      message: "Événement supprimé",
      onUndo: () => {
        setSoftDeletedIds((prev) => {
          const next = new Set(prev);
          next.delete(eventId);
          return next;
        });
      },
      run: () => supprimerEvenement(childId, eventId),
      onRestore: () => {
        setSoftDeletedIds((prev) => {
          const next = new Set(prev);
          next.delete(eventId);
          return next;
        });
      },
      onHide: () => {
        setSoftDeletedIds((prev) => new Set(prev).add(eventId));
      },
    });
  }, [activeChild?.id, deleteConfirm.event, scheduleDelete]);

  const cancelDelete = useCallback(() => {
    setDeleteConfirm({ visible: false, event: null });
  }, []);

  useFocusEffect(
    useCallback(() => {
      if (Platform.OS !== "android") {
        return undefined;
      }

      const handleBackPress = () => {
        if (showMilestonesModal) {
          setShowMilestonesModal(false);
          return true;
        }

        if (deleteConfirm.visible) {
          cancelDelete();
          return true;
        }

        const now = Date.now();
        if (now - lastBackPressRef.current < 2000) {
          BackHandler.exitApp();
          return true;
        }

        lastBackPressRef.current = now;
        showToast("Appuyez encore une fois pour fermer");
        return true;
      };

      const subscription = BackHandler.addEventListener(
        "hardwareBackPress",
        handleBackPress,
      );

      return () => {
        subscription.remove();
        lastBackPressRef.current = 0;
      };
    }, [cancelDelete, deleteConfirm.visible, showMilestonesModal, showToast]),
  );

  const formatTime = useCallback((date: Date) => {
    if (!isValidDate(date)) return "--:--";
    return date.toLocaleTimeString("fr-FR", {
      hour: "2-digit",
      minute: "2-digit",
    });
  }, []);

  const formatDuration = useCallback((minutes?: number) => {
    if (!minutes || minutes <= 0) return "0 min";
    if (minutes < 60) return `${minutes} min`;
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return m > 0 ? `${h}h${String(m).padStart(2, "0")}` : `${h}h`;
  }, []);

  const buildDetails = useCallback(
    (event: any) => buildEventDetails(event, { toDate, formatDuration }),
    [formatDuration],
  );


  const handleViewAllPress = useCallback(() => {
    guardedPush("/baby/chrono" as any);
  }, [guardedPush]);

  const recentEvents = useMemo(() => {
    // Candidats triés du plus récent au plus ancien : la fenêtre des 24 h et la
    // limite sont appliquées par RecentEventsList (tick à la minute interne).
    const merged = [
      ...data.tetees,
      ...data.biberons,
      ...data.solides,
      ...data.pompages,
      ...data.croissances,
      ...data.sommeils,
      ...data.bains,
      ...data.mictions,
      ...data.selles,
      ...data.temperatures,
      ...data.medicaments,
      ...data.symptomes,
      ...data.vitamines,
      ...data.vaccins,
      ...data.activites,
      ...data.jalons,
      ...data.nettoyagesNez,
    ].map((event) => ({
      ...event,
      type: event.type,
      date: event.date,
    }));

    const filtered = merged
      .filter((event) => !softDeletedIds.has(event.id))
      .sort((a, b) => getDateTime(b.date) - getDateTime(a.date));
    return filtered;
  }, [
    data.biberons,
    data.solides,
    data.croissances,
    data.mictions,
    data.pompages,
    data.sommeils,
    data.bains,
    data.selles,
    data.temperatures,
    data.medicaments,
    data.symptomes,
    data.tetees,
    data.vaccins,
    data.vitamines,
    data.activites,
    data.jalons,
    data.nettoyagesNez,
    softDeletedIds,
  ]);

  // P3: detect empty state (no events at all today)
  const hasAnyTodayData = useMemo(() => {
    return (
      todayStats.meals.total.count > 0 ||
      todayStats.pompages.count > 0 ||
      todayStats.sommeil.count > 0 ||
      todayStats.mictions.count > 0 ||
      todayStats.selles.count > 0 ||
      recentEvents.length > 0
    );
  }, [todayStats, recentEvents]);

  // Schedule/cancel local reminder notifications based on prefs + last event timestamps
  useReminderScheduler(
    activeChild?.id,
    activeChild?.name,
    reminderPreferences,
    todayStats,
  );

  // Load tips preference from notification settings (re-check on screen focus)
  useFocusEffect(
    useCallback(() => {
      let mounted = true;
      obtenirPreferencesNotifications()
        .then((prefs) => {
          if (!mounted) return;
          setTipsEnabled((prev) => prev === prefs.tips ? prev : prefs.tips);
          setInsightsEnabled((prev) => prev === (prefs.insights ?? true) ? prev : (prefs.insights ?? true));
          setCorrelationsEnabled((prev) => prev === (prefs.correlations ?? true) ? prev : (prefs.correlations ?? true));
        })
        .catch(() => {});
      return () => { mounted = false; };
    }, []),
  );

  // Load dismissed insight IDs from storage
  useEffect(() => {
    AsyncStorage.getItem("@dismissed_insights")
      .then((raw) => {
        if (raw) setDismissedInsightIds(new Set(JSON.parse(raw)));
      })
      .catch(() => {});
  }, []);

  const handleDismissInsight = useCallback((insightId: string) => {
    setDismissedInsightIds((prev) => {
      const next = new Set(prev);
      next.add(insightId);
      AsyncStorage.setItem("@dismissed_insights", JSON.stringify([...next])).catch(() => {});
      return next;
    });
  }, []);

  // Smart Content : 7 derniers jours pour le moteur d'insights. Lecture
  // différée après le premier rendu, filtrée par type, en cache par jour
  // (voir hooks/useWeeklyInsightEvents.ts).
  const weeklyEvents = useWeeklyInsightEvents(activeChild?.id, refreshTick);

  // Températures optimistes ou en file hors ligne : elles comptent pour l'alerte
  // santé dès la saisie (lecture seule de l'API publique du store optimiste).
  const [optimisticTick, setOptimisticTick] = useState(0);
  useEffect(() => subscribeOptimistic(() => setOptimisticTick((t) => t + 1)), []);
  const allEventsForInsights = useMemo(
    () =>
      activeChild?.id
        ? mergeOptimisticTemperatures(
            withLiveToday(weeklyEvents, mergedTodayEvents as any[]),
            getOptimisticEntries(activeChild.id),
            toDate,
          )
        : weeklyEvents,
    // optimisticTick : le store n'est pas réactif par lui-même.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [weeklyEvents, mergedTodayEvents, activeChild?.id, optimisticTick],
  );

  // Semaine chargée (cache rempli) : condition pour évaluer série et nuits longues.
  const weeklyLoaded = useMemo(
    () => (activeChild?.id ? getWeeklyEventsCache(activeChild.id) !== null : false),
    // weeklyEvents : le cache n'est pas réactif, son remplissage change cette référence.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [weeklyEvents, activeChild?.id],
  );

  const smartContent = useSmartContent({
    events: allEventsForInsights,
    childId: activeChild?.id ?? null,
    babyBirthDate: activeChild?.birthDate ?? null,
    babyName: activeChild?.name ?? "",
    tipsEnabled,
    insightsEnabled,
    correlationsEnabled,
  });

  const todayJalons = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    return data.jalons.filter((item) => {
      if (softDeletedIds.has(item.id)) return false;
      const date = toDate(item.date);
      return date >= today && date < tomorrow;
    });
  }, [data.jalons, softDeletedIds]);

  const todayMoodEvent = useMemo(() => {
    const moods = todayJalons
      .filter((item) => item.typeJalon === "humeur")
      .sort((a, b) => getDateTime(b.date) - getDateTime(a.date));
    return moods[0] ?? null;
  }, [todayJalons]);

  const handleSetMood = useCallback(
    (value: 1 | 2 | 3 | 4 | 5) => {
      if (!activeChild?.id) return;
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      ajouterEvenementOptimistic(activeChild.id, {
        type: "jalon",
        typeJalon: "humeur",
        humeur: value,
        titre: "Humeur du jour",
        date: new Date(),
      });
      showToast("Humeur enregistrée");
    },
    [activeChild?.id, showToast],
  );
  const sommeilEnCours = useMemo(() => {
    return data.sommeils.find((item) => {
      if (softDeletedIds.has(item.id) || item.heureFin || !item.heureDebut) {
        return false;
      }
      return isValidDate(toDate(item.heureDebut));
    });
  }, [data.sommeils, softDeletedIds]);

  // Promenade en cours detection (same pattern as sommeil)
  const promenadeEnCours = useMemo(() => {
    return data.activites.find(
      (item: any) => {
        if (
          softDeletedIds.has(item.id) ||
          item.typeActivite !== "promenade" ||
          !item.heureDebut ||
          item.heureFin
        ) {
          return false;
        }
        return isValidDate(toDate(item.heureDebut));
      },
    );
  }, [data.activites, softDeletedIds]);

  const handleEventEdit = useEventEditHandler(
    openSheet,
    toDate,
    headerOwnerId,
    sommeilEnCours,
    promenadeEnCours,
    showToast,
  );

  const stableOnEventPress = useMemo(
    () => (canManageContent ? handleEventEdit : undefined),
    [canManageContent, handleEventEdit],
  );
  const stableOnEventDelete = useMemo(
    () => (canManageContent ? handleEventDelete : undefined),
    [canManageContent, handleEventDelete],
  );

  // Début des activités en cours (ms) : les widgets calculent eux-mêmes la durée.
  const sleepStartTs = useMemo(() => {
    if (!sommeilEnCours?.heureDebut) return undefined;
    const start = toDate(sommeilEnCours.heureDebut);
    return isValidDate(start) ? start.getTime() : undefined;
  }, [sommeilEnCours]);
  const promenadeStartTs = useMemo(() => {
    if (!promenadeEnCours?.heureDebut) return undefined;
    const start = toDate(promenadeEnCours.heureDebut);
    return isValidDate(start) ? start.getTime() : undefined;
  }, [promenadeEnCours]);

  // Shared pulse animation for all active widgets (sleep + promenade sync)
  const sharedPulseAnim = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    const hasActiveWidget = !!sommeilEnCours || !!promenadeEnCours;
    if (hasActiveWidget) {
      const pulse = Animated.loop(
        Animated.sequence([
          Animated.timing(sharedPulseAnim, {
            toValue: 1.02,
            duration: 1500,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.timing(sharedPulseAnim, {
            toValue: 1,
            duration: 1500,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
        ]),
      );
      startLoop(pulse);
      return () => pulse.stop();
    } else {
      sharedPulseAnim.setValue(1);
    }
  }, [!!sommeilEnCours, !!promenadeEnCours, sharedPulseAnim]);

  // ============================================
  // STATS GROUPS DATA
  // ============================================

  // Alimentation Group
  const alimentationGroup = useMemo((): {
    summary: React.ReactNode;
    timeSinceTimestamp?: number;
    timeSinceLabel?: string;
    lastTime?: string;
    warnings: { timestamp?: number; thresholdMs: number | null }[];
    items: StatItem[];
  } => {
    const biberonQty = todayStats.meals.biberons.quantity;
    const pompageQty = todayStats.pompages.quantity;

    // Check for meal warning — threshold "repas" covers biberon, tétée, solide
    const repasThresholdMs =
      remindersEnabled && reminderThresholds.repas > 0
        ? reminderThresholds.repas * 60 * 60 * 1000
        : null;
    const mealsLastTs =
      todayStats.meals.total.lastTimestamp ??
      todayStats.meals.lastAbsoluteTimestamp;

    // Check for pompage warning
    const pompagesThresholdMs =
      remindersEnabled && reminderThresholds.pompages > 0
        ? reminderThresholds.pompages * 60 * 60 * 1000
        : null;
    const pompageLastTs = todayStats.pompages.lastTimestamp;
    // Les dépassements sont évalués par StatsGroup (tick à la minute interne).
    const warnings = [
      { timestamp: mealsLastTs, thresholdMs: repasThresholdMs },
      { timestamp: pompageLastTs, thresholdMs: pompagesThresholdMs },
    ];

    // Count unique meals: events within 30 min = 1 meal
    const MEAL_GROUP_MS = 30 * 60 * 1000;
    const today = new Date();
    const startOfToday = new Date(
      today.getFullYear(),
      today.getMonth(),
      today.getDate(),
    );
    const endOfToday = new Date(
      today.getFullYear(),
      today.getMonth(),
      today.getDate() + 1,
    );
    // Only count lait maternel/infantile biberons as meals (not eau, jus, autre)
    const mealBiberons = data.biberons.filter(
      (e: any) => !e.typeBiberon || e.typeBiberon === "lait_maternel" || e.typeBiberon === "lait_infantile",
    );
    const allMealTimestamps = [
      ...data.tetees,
      ...mealBiberons,
      ...data.solides,
    ]
      .map((e) => toDate(e.date).getTime())
      .filter((t) => t >= startOfToday.getTime() && t < endOfToday.getTime())
      .sort((a, b) => a - b);
    let mealCount = 0;
    let lastMealGroupTs = -Infinity;
    for (const ts of allMealTimestamps) {
      if (ts - lastMealGroupTs > MEAL_GROUP_MS) {
        mealCount++;
        lastMealGroupTs = ts;
      }
    }

    // Use only meals timestamp (not pompages) for "il y a" display
    const mealsTimestampToday = todayStats.meals.total.lastTimestamp;
    const displayTimestamp =
      mealsTimestampToday ?? todayStats.meals.lastAbsoluteTimestamp;
    const lastTime =
      displayTimestamp !== undefined
        ? formatTime(new Date(displayTimestamp))
        : undefined;

    const summaryParts = [`${mealCount} repas`];
    if (biberonQty > 0) summaryParts.push(`${biberonQty}ml bib`);
    if (pompageQty > 0) summaryParts.push(`${pompageQty}ml pomp`);
    const summaryNode = summaryParts.join(" · ");

    return {
      summary: summaryNode,
      timeSinceTimestamp: displayTimestamp,
      lastTime,
      warnings,
      items: [
        {
          key: "seins",
          label: "Tétées",
          value: todayStats.meals.seins.count,
          unit: "fois",
          icon: "person-breastfeeding",
          color: itemColors.tetee,
          lastTimestamp: todayStats.meals.seins.lastTimestamp,
          onPress: canManageContent
            ? () => guardedPush("/baby/stats?tab=tetees&returnTo=home" as any)
            : undefined,
        },
        {
          key: "biberons",
          label: "Biberons",
          value:
            todayStats.meals.biberons.count > 0
              ? `${todayStats.meals.biberons.count} • ${todayStats.meals.biberons.quantity}ml`
              : "0",
          icon: "baby-bottle",
          iconType: "mc" as const,
          color: itemColors.biberon,
          lastTimestamp: todayStats.meals.biberons.lastTimestamp,
          onPress: canManageContent
            ? () => guardedPush("/baby/stats?tab=biberons&returnTo=home" as any)
            : undefined,
        },
        {
          key: "solides",
          label: "Solides",
          value: todayStats.meals.solides.count,
          unit: "fois",
          icon: "bowl-food",
          color: itemColors.solide,
          lastTimestamp: todayStats.meals.solides.lastTimestamp,
          onPress: canManageContent
            ? () => guardedPush("/baby/stats?tab=solides&returnTo=home" as any)
            : undefined,
        },
        {
          key: "pompages",
          label: "Tire-lait",
          value:
            todayStats.pompages.count > 0
              ? `${todayStats.pompages.count} • ${todayStats.pompages.quantity}ml`
              : "0",
          icon: "pump-medical",
          color: itemColors.pompage,
          lastTimestamp: todayStats.pompages.lastTimestamp,
          onPress: canManageContent
            ? () => guardedPush("/baby/stats?tab=pompages&returnTo=home" as any)
            : undefined,
        },
      ],
    };
  }, [guardedPush, 
    todayStats,
    data.tetees,
    data.biberons,
    data.solides,
    formatTime,
    canManageContent,
    remindersEnabled,
    reminderThresholds.repas,
    reminderThresholds.pompages,
  ]);

  // Santé Group (Couches + Vitamines + Vaccins)
  const santeGroup = useMemo((): {
    summary: string;
    timeSinceTimestamp?: number;
    timeSinceLabel?: string;
    lastTime?: string;
    warnings: { timestamp?: number; thresholdMs: number | null }[];
    items: StatItem[];
  } => {
    const mictionCount = todayStats.mictions.count;
    const selleCount = todayStats.selles.count;
    const vitamineCount = todayStats.vitamines.count;
    const vaccinCount = todayStats.vaccins.count;

    // Check for warnings — based on most recent change (miction OR selle)
    const changesThresholdMs =
      remindersEnabled && reminderThresholds.changes > 0
        ? reminderThresholds.changes * 60 * 60 * 1000
        : null;

    const lastChangeTimestamp = Math.max(
      todayStats.mictions.lastTimestamp ?? 0,
      todayStats.selles.lastTimestamp ?? 0,
    );
    const warnings = [
      {
        timestamp: lastChangeTimestamp > 0 ? lastChangeTimestamp : undefined,
        thresholdMs: changesThresholdMs,
      },
    ];

    // Use only changes (mictions/selles) timestamp for "il y a" display (not vitamines/vaccins)
    const changesTimestampsToday = [
      todayStats.mictions.lastTimestamp,
      todayStats.selles.lastTimestamp,
    ].filter((t): t is number => !!t);
    const mostRecentChangeToday =
      changesTimestampsToday.length > 0
        ? Math.max(...changesTimestampsToday)
        : undefined;

    // Use absolute timestamp for mictions/selles if no activity today
    const absoluteTimestamps = [
      todayStats.mictions.lastAbsoluteTimestamp,
      todayStats.selles.lastAbsoluteTimestamp,
    ].filter((t): t is number => !!t);
    const mostRecentAbsolute =
      absoluteTimestamps.length > 0
        ? Math.max(...absoluteTimestamps)
        : undefined;

    const displayTimestamp = mostRecentChangeToday ?? mostRecentAbsolute;
    const lastTime =
      displayTimestamp !== undefined
        ? formatTime(new Date(displayTimestamp))
        : undefined;

    // Count unique changes: miction + selle within 2 min = 1 change
    const CHANGE_GROUP_MS = 2 * 60 * 1000;
    const today = new Date();
    const startOfToday = new Date(
      today.getFullYear(),
      today.getMonth(),
      today.getDate(),
    );
    const endOfToday = new Date(
      today.getFullYear(),
      today.getMonth(),
      today.getDate() + 1,
    );
    const allChangeTimestamps = [...data.mictions, ...data.selles]
      .map((e) => toDate(e.date).getTime())
      .filter((t) => t >= startOfToday.getTime() && t < endOfToday.getTime())
      .sort((a, b) => a - b);
    let changeCount = 0;
    let lastChangeGroupTs = -Infinity;
    for (const ts of allChangeTimestamps) {
      if (ts - lastChangeGroupTs > CHANGE_GROUP_MS) {
        changeCount++;
        lastChangeGroupTs = ts;
      }
    }

    const summaryParts = [`${changeCount} change${changeCount > 1 ? "s" : ""}`];
    if (vitamineCount > 0)
      summaryParts.push(
        `${vitamineCount} vitamine${vitamineCount > 1 ? "s" : ""}`,
      );
    if (vaccinCount > 0)
      summaryParts.push(`${vaccinCount} vaccin${vaccinCount > 1 ? "s" : ""}`);

    return {
      summary: summaryParts.join(" · "),
      timeSinceTimestamp: displayTimestamp,
      lastTime,
      warnings,
      items: [
        {
          key: "mictions",
          label: "Mictions",
          value: mictionCount,
          unit: "fois",
          icon: "water",
          color: itemColors.miction,
          lastTimestamp: todayStats.mictions.lastTimestamp,
          onPress: canManageContent
            ? () =>
                guardedPush("/baby/diapers?tab=mictions&returnTo=home" as any)
            : undefined,
        },
        {
          key: "selles",
          label: "Selles",
          value: selleCount,
          unit: "fois",
          icon: "poop",
          color: itemColors.selle,
          lastTimestamp: todayStats.selles.lastTimestamp,
          onPress: canManageContent
            ? () => guardedPush("/baby/diapers?tab=selles&returnTo=home" as any)
            : undefined,
        },
        {
          key: "vitamines",
          label: "Vitamines",
          value: vitamineCount,
          unit: vitamineCount > 1 ? "prises" : "prise",
          icon: "pills",
          color: itemColors.vitamine,
          lastTimestamp: todayStats.vitamines.lastTimestamp,
          onPress: canManageContent
            ? () =>
                guardedPush("/baby/soins?type=vitamine&returnTo=home" as any)
            : undefined,
        },
        {
          key: "vaccins",
          label: "Vaccins",
          value: vaccinCount,
          unit: vaccinCount > 1 ? "reçus" : "reçu",
          icon: "syringe",
          color: itemColors.vaccin,
          lastTimestamp: todayStats.vaccins.lastTimestamp,
          onPress: canManageContent
            ? () => guardedPush("/baby/soins?type=vaccin&returnTo=home" as any)
            : undefined,
        },
      ],
    };
  }, [guardedPush, 
    todayStats,
    data.mictions,
    data.selles,
    formatTime,
    remindersEnabled,
    reminderThresholds.changes,
    canManageContent,
  ]);

  const handleStartSleep = useCallback(
    (isNap: boolean) => {
      if (!activeChild?.id || sommeilEnCours) return;
      ajouterEvenementOptimistic(activeChild.id, {
        type: "sommeil" as const,
        heureDebut: new Date(),
        date: new Date(),
        isNap,
      });
      showToast(isNap ? "Sieste démarrée" : "Nuit démarrée");
    },
    [activeChild?.id, sommeilEnCours, showToast],
  );

  const stopTimedEventWithUndo = useStopTimedEventWithUndo<any>({
    childId: activeChild?.id,
    getSuccessLabel: (event, { isUnderOneMinute }) => {
      const shortSuffix = isUnderOneMinute ? " (moins d'1 min)" : "";
      if (event.type === "sommeil") {
        return `${event.isNap ? "Sieste terminée" : "Nuit terminée"}${shortSuffix}`;
      }
      return `Promenade terminée${shortSuffix}`;
    },
  });

  // Tap direct — écrit heureFin/duree immédiatement, sans passer par la sheet.
  // Toast Annuler (5 s) : rouvre l'event via 2ᵉ écriture (heureFin/duree → null).
  const handleStopSleep = useCallback(() => {
    stopTimedEventWithUndo(sommeilEnCours);
  }, [sommeilEnCours, stopTimedEventWithUndo]);

  const handleEditSleepInSheet = useCallback(() => {
    if (!activeChild?.id || !sommeilEnCours?.id) return;
    if (sommeilEnCours.id.startsWith('__optimistic_')) {
      showToast('Enregistrement en cours...');
      return;
    }
    const start = toDate(sommeilEnCours.heureDebut);

    openSheet({
      ownerId: headerOwnerId.current,
      formType: "routines",
      routineType: "sommeil",
      sleepMode: sommeilEnCours.isNap ? "nap" : "night",
      editData: {
        id: sommeilEnCours.id,
        type: "sommeil",
        date: start,
        heureDebut: start,
        isNap: sommeilEnCours.isNap,
        location: sommeilEnCours.location,
        quality: sommeilEnCours.quality,
        note: sommeilEnCours.note,
      },
      sommeilEnCours,
    });
  }, [activeChild?.id, sommeilEnCours, openSheet, showToast]);

  // Promenade start/stop handlers
  const handleStartPromenade = useCallback(() => {
    if (!activeChild?.id || promenadeEnCours) return;
    ajouterEvenementOptimistic(activeChild.id, {
      type: "activite" as const,
      typeActivite: "promenade",
      heureDebut: new Date(),
      date: new Date(),
    });
    showToast("Promenade démarrée");
  }, [activeChild?.id, promenadeEnCours, showToast]);

  const handleStopPromenade = useCallback(() => {
    stopTimedEventWithUndo(promenadeEnCours);
  }, [promenadeEnCours, stopTimedEventWithUndo]);

  const handleEditPromenadeInSheet = useCallback(() => {
    if (!activeChild?.id || !promenadeEnCours?.id) return;
    if (promenadeEnCours.id.startsWith('__optimistic_')) {
      showToast('Enregistrement en cours...');
      return;
    }
    const start = toDate(promenadeEnCours.heureDebut);

    openSheet({
      ownerId: headerOwnerId.current,
      formType: "activities",
      activiteType: "promenade",
      editData: {
        id: promenadeEnCours.id,
        typeActivite: "promenade",
        date: start,
        heureDebut: start,
        description: promenadeEnCours.description ?? promenadeEnCours.note,
      },
      promenadeEnCours,
    });
  }, [activeChild?.id, promenadeEnCours, openSheet, showToast]);

  // ============================================
  // EFFECTS
  // ============================================

  useEffect(() => {
    let cancelled = false;
    const HINT_STORAGE_KEY = "home:recentHintCount";
    const MAX_HINT_SHOWS = 3;

    const loadHintState = async () => {
      try {
        const raw = await AsyncStorage.getItem(HINT_STORAGE_KEY);
        if (cancelled) return;
        const current = raw ? Number.parseInt(raw, 10) : 0;
        if (Number.isNaN(current) || current >= MAX_HINT_SHOWS) return;
        setShowRecentHint(true);
        await AsyncStorage.setItem(HINT_STORAGE_KEY, String(current + 1));
      } catch {
        if (!cancelled) setShowRecentHint(true);
      }
    };

    loadHintState();
    return () => {
      cancelled = true;
    };
  }, []);

  // R7: Reminder prefs are now read from BabyContext (real-time, no extra Firestore read)

  // ============================================
  // EFFECTS - DATA LISTENERS
  // ============================================

  // Écoute en temps réel de toutes les données
  // Re-subscribe when day changes to get fresh "today" range
  useEffect(() => {
    if (!activeChild?.id) return;
    setLoadError(false);

    const handleListenerError = () => {
      setLoadError(true);
      setLoading({
        tetees: false,
        biberons: false,
        solides: false,
        pompages: false,
        croissances: false,
        sommeils: false,
        bains: false,
        mictions: false,
        selles: false,
        temperatures: false,
        medicaments: false,
        symptomes: false,
        vitamines: false,
        vaccins: false,
        activites: false,
        jalons: false,
        nettoyagesNez: false,
      });
      setIsRefreshing(false);
    };

    const cached = getTodayEventsCache(activeChild.id);

    // Si on a le cache, l'utiliser immédiatement sans afficher de loading
    if (cached) {
      setData((prev) => ({ ...prev, ...cached }));
      setLoading({
        tetees: false,
        biberons: false,
        solides: false,
        pompages: false,
        croissances: false,
        sommeils: false,
        bains: false,
        mictions: false,
        selles: false,
        temperatures: false,
        medicaments: false,
        symptomes: false,
        vitamines: false,
        vaccins: false,
        activites: false,
        jalons: false,
        nettoyagesNez: false,
      });
    } else {
      // Pas de cache, afficher le loading
      setLoading({
        tetees: true,
        biberons: true,
        solides: true,
        pompages: true,
        croissances: true,
        sommeils: true,
        bains: true,
        mictions: true,
        selles: true,
        temperatures: true,
        medicaments: true,
        symptomes: true,
        vitamines: true,
        vaccins: true,
        activites: true,
        jalons: true,
        nettoyagesNez: true,
      });
    }

    let loadingSet = false;

    const unsubscribe = ecouterEvenementsDuJour(
      activeChild.id,
      (events) => {
        setFirestoreEvents(events);
        if (!loadingSet) {
          loadingSet = true;
          setLoading({
            tetees: false,
            biberons: false,
            solides: false,
            pompages: false,
            croissances: false,
            sommeils: false,
            bains: false,
            mictions: false,
            selles: false,
            temperatures: false,
            medicaments: false,
            symptomes: false,
            vitamines: false,
            vaccins: false,
            activites: false,
            jalons: false,
            nettoyagesNez: false,
          });
        }
      },
      { waitForServer: true },
      handleListenerError,
    );

    return () => {
      unsubscribe();
    };
    // Note: refreshTick retiré des deps — le refresh utilise un fetch one-shot
    // (handleRefresh) au lieu de recréer le listener, ce qui évitait un flash vide.
  }, [activeChild?.id, currentDay, setFirestoreEvents]);

  useEffect(() => {
    const todayData = buildTodayEventsData(mergedTodayEvents as any[]);
    setData((prev) => ({ ...prev, ...todayData }));
    setSoftDeletedIds((prev) => {
      if (prev.size === 0) return prev;
      const dataIds = new Set((mergedTodayEvents as any[]).map((e: any) => e.id));
      const next = new Set<string>();
      prev.forEach((id) => {
        if (id && dataIds.has(id)) next.add(id);
      });
      return next.size === prev.size ? prev : next;
    });
  }, [mergedTodayEvents]);

  // Re-merge on tab focus — frozen tabs miss state updates
  useFocusEffect(
    useCallback(() => {
      refreshMerged();
    }, [refreshMerged]),
  );

  useEffect(() => {
    if (!activeChild?.id) return;
    const cached = getTodayEventsCache(activeChild.id);
    setData(cached ? { ...emptyData, ...cached } : emptyData);
    setSoftDeletedIds(new Set());
    // Note: pas de setFirestoreEvents([]) ici — le hook useMergedOptimisticEvents
    // se reset déjà quand childId change (useEffect interne ligne 106-123).
    // Un reset explicite ici créait un état vide transitoire.
  }, [activeChild?.id]);

  // ============================================
  // EFFECTS - STATS CALCULATION
  // ============================================

  // Calcul des statistiques du jour
  useEffect(() => {
    const today = new Date();
    const startOfToday = new Date(
      today.getFullYear(),
      today.getMonth(),
      today.getDate(),
    );
    const endOfToday = new Date(
      today.getFullYear(),
      today.getMonth(),
      today.getDate() + 1,
    );

    // Filtrer les entrées pour ne garder que celles d'aujourd'hui
    // (exclut aussi les events en cours de soft-delete pour cohérence avec la timeline)
    const filterToday = (items: any[]) =>
      items.filter((item) => {
        if (softDeletedIdsRef.current.has(item.id)) return false;
        const itemDate = toDate(item.date);
        return itemDate >= startOfToday && itemDate < endOfToday;
      });

    // Exclure les events optimistic des calculs de timestamps pour les notifications
    const excludeOptimistic = (items: any[]) =>
      items.filter((item) => !item.id?.startsWith?.('__optimistic_'));

    // Filtre spécial pour le sommeil : inclure les sessions qui chevauchent aujourd'hui
    // (ex: nuit commencée hier à 21h et terminée aujourd'hui à 6h)
    const filterTodaySleep = (items: any[]) =>
      items.filter((item) => {
        if (softDeletedIdsRef.current.has(item.id)) return false;
        const start = item.heureDebut
          ? toDate(item.heureDebut)
          : toDate(item.date);
        const end = item.heureFin ? toDate(item.heureFin) : new Date();
        // Inclure si le sommeil chevauche aujourd'hui
        return start < endOfToday && end >= startOfToday;
      });

    const todayTetees = filterToday(data.tetees);
    const todayBiberons = filterToday(data.biberons);
    const todaySolides = filterToday(data.solides);
    const todayPompages = filterToday(data.pompages);
    const todaySommeils = filterTodaySleep(data.sommeils);
    const todayMictions = filterToday(data.mictions);
    const todaySelles = filterToday(data.selles);
    const todayVitamines = filterToday(data.vitamines);
    const todayVaccins = filterToday(data.vaccins);

    // Repas - Seins (OLD: type="seins" ou pas de type, NEW: type="tetee")
    const seinsToday = todayTetees.filter(
      (t) => !t.type || t.type === "seins" || t.type === "tetee",
    );

    // Repas - Biberons
    const biberonsToday = todayBiberons;

    // Calculer les statistiques pour les repas seins
    const lastSeins =
      seinsToday.length > 0
        ? seinsToday.reduce((latest, current) =>
            getDateTime(current.date) > getDateTime(latest.date)
              ? current
              : latest,
          )
        : null;

    // Calculer les statistiques pour les repas biberons
    const biberonsQuantity = biberonsToday.reduce(
      (sum, b) => sum + (b.quantite || 0),
      0,
    );
    const lastBiberons =
      biberonsToday.length > 0
        ? biberonsToday.reduce((latest, current) =>
            getDateTime(current.date) > getDateTime(latest.date)
              ? current
              : latest,
          )
        : null;

    // Calculer les statistiques pour les solides
    const lastSolide =
      todaySolides.length > 0
        ? todaySolides.reduce((latest, current) =>
            getDateTime(current.date) > getDateTime(latest.date)
              ? current
              : latest,
          )
        : null;

    // Calculer les statistiques totales pour tous les repas
    const allMeals = [...todayTetees, ...todayBiberons, ...todaySolides];
    const totalMealsQuantity = biberonsQuantity; // Seuls les biberons ont une quantité mesurable
    const confirmedMeals = excludeOptimistic(allMeals);
    const lastMealOverall =
      confirmedMeals.length > 0
        ? confirmedMeals.reduce((latest, current) =>
            getDateTime(current.date) > getDateTime(latest.date)
              ? current
              : latest,
          )
        : null;

    // Calculer les statistiques pour les pompages
    const pompagesQuantity = todayPompages.reduce(
      (sum, p) => sum + ((p.quantiteDroite || 0) + (p.quantiteGauche || 0)),
      0,
    );
    const confirmedPompages = excludeOptimistic(todayPompages);
    const lastPompage =
      confirmedPompages.length > 0
        ? confirmedPompages.reduce((latest, current) =>
            getDateTime(current.date) > getDateTime(latest.date)
              ? current
              : latest,
          )
        : null;

    // Calculer le sommeil total en ne comptant que la portion d'aujourd'hui
    const totalSleepMinutes = todaySommeils.reduce((sum, item) => {
      const start = item.heureDebut
        ? toDate(item.heureDebut)
        : toDate(item.date);
      const end = item.heureFin ? toDate(item.heureFin) : new Date();

      // Ne compter que la portion qui tombe aujourd'hui
      const effectiveStart = Math.max(start.getTime(), startOfToday.getTime());
      const effectiveEnd = Math.min(end.getTime(), endOfToday.getTime());
      const todayMinutes = Math.round((effectiveEnd - effectiveStart) / 60000);

      return sum + Math.max(0, todayMinutes);
    }, 0);

    const lastSommeil =
      todaySommeils.length > 0
        ? todaySommeils.reduce((latest, current) =>
            getDateTime(current.date) > getDateTime(latest.date)
              ? current
              : latest,
          )
        : null;

    // Calculer les dernières activités (aujourd'hui)
    const confirmedMictions = excludeOptimistic(todayMictions);
    const lastMiction =
      confirmedMictions.length > 0
        ? confirmedMictions.reduce((latest, current) =>
            getDateTime(current.date) > getDateTime(latest.date)
              ? current
              : latest,
          )
        : null;

    const confirmedSelles = excludeOptimistic(todaySelles);
    const lastSelle =
      confirmedSelles.length > 0
        ? confirmedSelles.reduce((latest, current) =>
            getDateTime(current.date) > getDateTime(latest.date)
              ? current
              : latest,
          )
        : null;

    // Calculer le dernier événement absolu (tous jours confondus) pour alimentation et santé
    const allMealsAbsolute = excludeOptimistic([
      ...data.tetees,
      ...data.biberons,
      ...data.solides,
    ]);
    const lastMealAbsolute =
      allMealsAbsolute.length > 0
        ? allMealsAbsolute.reduce((latest, current) =>
            getDateTime(current.date) > getDateTime(latest.date)
              ? current
              : latest,
          )
        : null;

    const lastMictionAbsolute =
      excludeOptimistic(data.mictions).length > 0
        ? excludeOptimistic(data.mictions).reduce((latest, current) =>
            getDateTime(current.date) > getDateTime(latest.date)
              ? current
              : latest,
          )
        : null;

    const lastSelleAbsolute =
      excludeOptimistic(data.selles).length > 0
        ? excludeOptimistic(data.selles).reduce((latest, current) =>
            getDateTime(current.date) > getDateTime(latest.date)
              ? current
              : latest,
          )
        : null;

    const confirmedVitamines = excludeOptimistic(todayVitamines);
    const lastVitamine =
      confirmedVitamines.length > 0
        ? confirmedVitamines.reduce((latest, current) =>
            getDateTime(current.date) > getDateTime(latest.date)
              ? current
              : latest,
          )
        : null;

    const lastVaccin =
      todayVaccins.length > 0
        ? todayVaccins.reduce((latest, current) =>
            getDateTime(current.date) > getDateTime(latest.date)
              ? current
              : latest,
          )
        : null;

    // Helpers pour formater le temps
    const formatTime = (item: any) => {
      if (!item?.date) return undefined;
      const dateObj = toDate(item.date);
      return dateObj.toLocaleTimeString("fr-FR", {
        hour: "2-digit",
        minute: "2-digit",
      });
    };

    const getTimestamp = (item: any) => {
      if (!item?.date) return undefined;
      return toDate(item.date).getTime();
    };

    setTodayStats({
      meals: {
        total: {
          count: allMeals.length,
          quantity: totalMealsQuantity,
          lastTime: formatTime(lastMealOverall),
          lastTimestamp: getTimestamp(lastMealOverall),
        },
        seins: {
          count: seinsToday.length,
          lastTime: formatTime(lastSeins),
          lastTimestamp: getTimestamp(lastSeins),
        },
        biberons: {
          count: biberonsToday.length,
          quantity: biberonsQuantity,
          lastTime: formatTime(lastBiberons),
          lastTimestamp: getTimestamp(lastBiberons),
        },
        solides: {
          count: todaySolides.length,
          lastTime: formatTime(lastSolide),
          lastTimestamp: getTimestamp(lastSolide),
        },
        lastAbsoluteTimestamp: getTimestamp(lastMealAbsolute),
      },
      pompages: {
        count: todayPompages.length,
        quantity: pompagesQuantity,
        lastTime: formatTime(lastPompage),
        lastTimestamp: getTimestamp(lastPompage),
      },
      sommeil: {
        count: todaySommeils.length,
        totalMinutes: totalSleepMinutes,
        lastTime: formatTime(lastSommeil),
        lastTimestamp: getTimestamp(lastSommeil),
      },
      mictions: {
        count: todayMictions.length,
        lastTime: formatTime(lastMiction),
        lastTimestamp: getTimestamp(lastMiction),
        lastAbsoluteTimestamp: getTimestamp(lastMictionAbsolute),
      },
      selles: {
        count: todaySelles.length,
        lastTime: formatTime(lastSelle),
        lastTimestamp: getTimestamp(lastSelle),
        lastAbsoluteTimestamp: getTimestamp(lastSelleAbsolute),
      },
      vitamines: {
        count: todayVitamines.length,
        lastTime: formatTime(lastVitamine),
        lastTimestamp: getTimestamp(lastVitamine),
      },
      vaccins: {
        count: todayVaccins.length,
        lastTime: formatTime(lastVaccin),
        lastTimestamp: getTimestamp(lastVaccin),
      },
    });
  }, [data, softDeletedIds]);

  // ============================================
  // HELPERS - UI
  // ============================================

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 6) return "Bonne nuit";
    if (hour < 12) return "Bonjour";
    if (hour < 18) return "Bon après-midi";
    return "Bonsoir";
  };

  const showSleep = canManageContent || !!sommeilEnCours;
  const showPromenade = canManageContent || !!promenadeEnCours;
  const showMood = canManageContent;

  // ============================================
  // RENDER
  // ============================================

  // Loading state - skeleton shimmer (P1)
  if (!isDataLoaded) {
    return <HomeSkeleton colorScheme={colorScheme} />;
  }

  return (
    <View style={styles.screen}>
      <ReminderWarningWatcher
        childId={activeChild?.id}
        remindersEnabled={remindersEnabled}
        thresholds={reminderThresholds}
        lastMictionTs={todayStats.mictions.lastTimestamp}
        lastSelleTs={todayStats.selles.lastTimestamp}
        mealsLastTs={
          todayStats.meals.total.lastTimestamp ??
          todayStats.meals.lastAbsoluteTimestamp
        }
        lastPompageTs={todayStats.pompages.lastTimestamp}
        showToast={showToast}
      />
      <ScrollView
        style={[styles.container, { backgroundColor: nc.background }]}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={handleRefresh}
            tintColor={cat.alimentation.primary}
          />
        }
      >
        {/* En-tête avec salutation */}
        <View style={styles.headerRow}>
          <View style={styles.header}>
            <Text style={[styles.greeting, { color: nc.textStrong }]}>
              {getGreeting()}
            </Text>
            <Text style={[styles.date, { color: nc.textLight }]}>
              {new Date().toLocaleDateString("fr-FR", {
                weekday: "long",
                day: "numeric",
                month: "long",
              })}
            </Text>
          </View>
        </View>

        {/* Guide premier tracking (onboarding J0) */}
        {showFirstTrackGuide && (
          <FirstTrackGuide onDismiss={() => setShowFirstTrackGuide(false)} />
        )}

        {/* Tips carousel — skeleton while loading (P1) */}
        {isDataLoaded && smartContent.isLoading && (
          <View style={{ paddingHorizontal: 20, marginBottom: 12 }}>
            <View
              style={{
                height: 140,
                borderRadius: 12,
                backgroundColor: nc.borderLight,
              }}
              accessibilityLabel="Chargement des conseils"
            />
          </View>
        )}

        {/* Tips carousel — hero position */}
        {isDataLoaded &&
          !smartContent.isLoading &&
          smartContent.availableTips.length > 0 && (
            <View style={{ paddingHorizontal: 20, marginBottom: 16 }}>
              <TipsCarousel
                tips={smartContent.availableTips}
                bookmarkedIds={smartContent.userContent.bookmarks}
                onRead={(tip) => {
                  openSheetRaw({
                    ownerId: activeChild?.id ?? "",
                    formType: "content" as const,
                    tipId: tip.id,
                  });
                }}
                onDismiss={smartContent.dismissTip}
                onBookmark={(tipId) => {
                  if (smartContent.userContent.bookmarks.includes(tipId)) {
                    smartContent.removeBookmark(tipId);
                  } else {
                    smartContent.bookmarkTip(tipId);
                  }
                }}
                colorScheme={colorScheme}
              />
            </View>
          )}

        {/* Résumé du jour */}
        <View style={styles.section}>
          <View>
            <Text
              style={[styles.sectionTitle, { color: nc.textStrong }]}
            >{`Résumé d'aujourd'hui`}</Text>
          </View>

          {/* Alimentation Group */}
          <StaggeredCard>
            <View style={styles.statsGroupContainer}>
              <StatsGroup
                title="Alimentation"
                icon="utensils"
                color={cat.alimentation.primary}
                backgroundColor={cat.alimentation.background}
                borderColor={cat.alimentation.border}
                summary={alimentationGroup.summary}
                lastActivity={alimentationGroup.lastTime}
                timeSinceTimestamp={alimentationGroup.timeSinceTimestamp}
                timeSinceLabel={alimentationGroup.timeSinceLabel}
                warnings={alimentationGroup.warnings}
                items={alimentationGroup.items}
                colorScheme={colorScheme}
              />
            </View>
          </StaggeredCard>

          {/* Santé Group (Couches + Vitamines + Vaccins) */}
          <StaggeredCard>
            <View style={styles.statsGroupContainer}>
              <StatsGroup
                title="Santé & Hygiène"
                icon="heart-pulse"
                color={cat.sante.primary}
                backgroundColor={cat.sante.background}
                borderColor={cat.sante.border}
                summary={santeGroup.summary}
                lastActivity={santeGroup.lastTime}
                timeSinceTimestamp={santeGroup.timeSinceTimestamp}
                timeSinceLabel={santeGroup.timeSinceLabel}
                warnings={santeGroup.warnings}
                items={santeGroup.items}
                colorScheme={colorScheme}
              />
            </View>
          </StaggeredCard>

          {/* Sommeil Section */}
          {showSleep && (
            <StaggeredCard>
              <View style={styles.statsGroupContainer}>
                <SleepWidget
                  isActive={!!sommeilEnCours}
                  isNap={sommeilEnCours?.isNap}
                  startTimestamp={sleepStartTs}
                  startTime={
                    sommeilEnCours?.heureDebut
                      ? formatTime(toDate(sommeilEnCours.heureDebut))
                      : undefined
                  }
                  onStartSleep={handleStartSleep}
                  onStopSleep={handleStopSleep}
                  onEditSleep={handleEditSleepInSheet}
                  showStopButton={canManageContent}
                  colorScheme={colorScheme}
                  sharedPulseAnim={sharedPulseAnim}
                />
              </View>
            </StaggeredCard>
          )}

          {/* Promenade Section */}
          {showPromenade && (
            <StaggeredCard>
              <View style={styles.statsGroupContainer}>
                <PromenadeWidget
                  isActive={!!promenadeEnCours}
                  startTimestamp={promenadeStartTs}
                  startTime={
                    promenadeEnCours?.heureDebut
                      ? formatTime(toDate(promenadeEnCours.heureDebut))
                      : undefined
                  }
                  onStart={handleStartPromenade}
                  onStop={handleStopPromenade}
                  onEdit={handleEditPromenadeInSheet}
                  showStopButton={canManageContent}
                  colorScheme={colorScheme}
                  sharedPulseAnim={sharedPulseAnim}
                />
              </View>
            </StaggeredCard>
          )}

          {/* Humeur du jour */}
          {showMood && (
            <StaggeredCard>
              <View style={styles.statsGroupContainer}>
                <View
                  style={[
                    styles.moodCard,
                    {
                      backgroundColor: cat.moments.background,
                      borderColor: cat.moments.border,
                    },
                  ]}
                >
                  <Text style={[styles.moodLabel, { color: nc.textLight }]}>
                    Humeur du jour
                  </Text>
                  <View style={styles.moodEmojisRow}>
                    {Object.entries(MOOD_EMOJIS).map(([key, emoji]) => {
                      const moodValue = Number(key) as 1 | 2 | 3 | 4 | 5;
                      const isSelected = todayMoodEvent?.humeur === moodValue;
                      return (
                        <TouchableOpacity
                          key={key}
                          style={[
                            styles.moodEmojiButton,
                            { backgroundColor: nc.backgroundCard },
                            isSelected && [
                              styles.moodEmojiSelected,
                              {
                                backgroundColor: `${cat.moments.primary}20`,
                                borderColor: cat.moments.primary,
                              },
                            ],
                          ]}
                          onPress={() => handleSetMood(moodValue)}
                          activeOpacity={0.7}
                          accessibilityLabel={`Humeur ${moodValue} sur 5`}
                          accessibilityState={{ selected: isSelected }}
                        >
                          <Text style={styles.moodEmojiText}>{emoji}</Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </View>
              </View>
            </StaggeredCard>
          )}
        </View>

        {/* Smart Content: Insights + Correlations + Milestones */}
        {isDataLoaded && !smartContent.isLoading && (
          <HomeSmartContent
            smartContent={smartContent}
            dismissedInsightIds={dismissedInsightIds}
            hasAnyTodayData={hasAnyTodayData}
            activeChildBirthDate={activeChild?.birthDate}
            onOpenInsightTip={(tipId) =>
              openSheetRaw({
                ownerId: activeChild?.id ?? "",
                formType: "content" as const,
                tipId,
              })
            }
            onDismissInsight={handleDismissInsight}
            onShowMilestonesModal={() => setShowMilestonesModal(true)}
            colorScheme={colorScheme}
            StaggeredCard={StaggeredCard}
          />
        )}

        {/* Chronologie récente */}
        <StaggeredCard>
          <RecentEventsList
            events={recentEvents}
            loading={!isDataLoaded}
            showHint={showRecentHint && canManageContent}
            colorScheme={colorScheme}
            cutoffHours={RECENT_EVENTS_CUTOFF_HOURS}
            maxEvents={RECENT_EVENTS_MAX}
            onEventPress={stableOnEventPress}
            onEventDelete={stableOnEventDelete}
            onViewAllPress={handleViewAllPress}
            toDate={toDate}
            formatTime={formatTime}
            formatDuration={formatDuration}
            buildDetails={buildDetails}
            getDayLabel={getDayLabel}
          />
        </StaggeredCard>
      </ScrollView>
      {/* Célébration d'un jalon : une par jour et par enfant, jamais sur l'alerte fièvre ni une feuille */}
      <HomeMilestoneCelebration
        childId={activeChild?.id}
        childName={activeChild?.name}
        events={allEventsForInsights}
        weeklyLoaded={weeklyLoaded}
        blocked={showFirstTrackGuide || showMilestonesModal || deleteConfirm.visible}
      />
      <ConfirmModal
        visible={deleteConfirm.visible}
        title="Supprimer cet événement ?"
        message="Cette action est irréversible."
        confirmText="Supprimer"
        backgroundColor={nc.backgroundCard}
        textColor={nc.textStrong}
        confirmButtonColor={nc.error}
        onConfirm={confirmDelete}
        onCancel={cancelDelete}
      />

      {/* Milestones Timeline Modal */}
      <Modal
        visible={showMilestonesModal}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowMilestonesModal(false)}
      >
        <View style={[styles.screen, { backgroundColor: nc.background }]}>
          <View style={styles.milestonesModalHeader}>
            <Text style={[styles.milestonesModalTitle, { color: nc.textStrong }]}>
              {"Jalons de développement"}
            </Text>
            <TouchableOpacity
              onPress={() => setShowMilestonesModal(false)}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              accessibilityRole="button"
              accessibilityLabel="Fermer"
            >
              <Ionicons name="close" size={24} color={nc.textStrong} />
            </TouchableOpacity>
          </View>
          <MilestoneTimeline
            milestones={smartContent.allMilestones}
            ageWeeks={activeChild?.birthDate ? getAgeInWeeks(activeChild.birthDate) : 0}
            milestoneStatuses={smartContent.userContent.milestoneStatuses ?? {}}
            onStatusChange={canManageContent ? smartContent.updateMilestoneStatus : undefined}
            colorScheme={colorScheme}
          />
        </View>
      </Modal>
    </View>
  );
}
