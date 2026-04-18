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
import { FirstTrackGuide } from "@/components/suivibaby/FirstTrackGuide";
import { GlobalFAB } from "@/components/suivibaby/GlobalFAB";
import { VoiceCommandButton } from "@/components/suivibaby/VoiceCommandButton";
import { ConfirmModal } from "@/components/ui/ConfirmModal";
import {
  getCategoryColors,
  getNeutralColors,
  itemColors,
} from "@/constants/dashboardColors";
import { MOMENT_REPAS_LABELS, MOOD_EMOJIS } from "@/constants/dashboardConfig";
import { Colors } from "@/constants/theme";
import { useAuth } from "@/contexts/AuthContext";
import { useBaby } from "@/contexts/BabyContext";
import { useSheet } from "@/contexts/SheetContext";
import { useToast } from "@/contexts/ToastContext";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { useChildPermissions } from "@/hooks/useChildPermissions";
import { useMergedOptimisticEvents } from "@/hooks/useMergedOptimisticEvents";
import { useReminderScheduler } from "@/hooks/useReminderScheduler";
import { useSmartContent } from "@/hooks/useSmartContent";
import { MilestoneTimeline } from "@/components/suivibaby/MilestoneTimeline";
import { getAgeInWeeks } from "@/utils/ageUtils";
import { isValidDate, toDate as parseDate } from "@/utils/date";
import { ajouterEvenementOptimistic, ecouterEvenementsDuJour, obtenirEvenements, supprimerEvenement } from "@/services/eventsService";
import { obtenirPreferencesNotifications } from "@/services/userPreferencesService";
import { getPreferencesCache, getPermissionsCache } from "@/services/userPreferencesCache";
import {
  buildTodayEventsData,
  getTodayEventsCache,
  getTodayTypes,
} from "@/services/todayEventsCache";
import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useFocusEffect } from "@react-navigation/native";
import * as Haptics from "expo-haptics";
import { router, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  AppState,
  BackHandler,
  Easing,
  Modal,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useHeaderRight } from "../../_layout";

// ============================================
// SKELETON LOADING (P1)
// ============================================

function HomeSkeleton({ colorScheme }: { colorScheme: "light" | "dark" }) {
  const nc = getNeutralColors(colorScheme);
  const shimmerAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(shimmerAnim, {
        toValue: 1,
        duration: 1200,
        useNativeDriver: true,
      }),
    );
    loop.start();
    return () => loop.stop();
  }, [shimmerAnim]);

  const shimmerTranslate = shimmerAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [-200, 200],
  });
  const shimmerBg = colorScheme === "dark" ? nc.shimmerDark : nc.shimmerLight;

  const Block = ({
    width,
    height,
  }: {
    width: number | string;
    height: number;
  }) => (
    <View
      style={{
        width: width as number,
        height,
        backgroundColor: nc.borderLight,
        borderRadius: 8,
        overflow: "hidden",
        marginBottom: 10,
      }}
    >
      <Animated.View
        style={{
          position: "absolute",
          top: 0,
          bottom: 0,
          width: 120,
          backgroundColor: shimmerBg,
          transform: [{ translateX: shimmerTranslate }],
        }}
      />
    </View>
  );

  return (
    <View
      style={{
        flex: 1,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: nc.background,
      }}
    >
      <View style={{ width: "100%", padding: 20 }}>
        <Block width="60%" height={24} />
        <Block width="40%" height={14} />
        <View style={{ height: 16 }} />
        <Block width="100%" height={80} />
        <View style={{ height: 12 }} />
        <Block width="100%" height={80} />
        <View style={{ height: 12 }} />
        <Block width="100%" height={60} />
        <View style={{ height: 12 }} />
        <Block width="100%" height={60} />
      </View>
    </View>
  );
}

// Instant render — no stagger animation (utilitaire dashboard, pas de delay)
function StaggeredCard({ children }: { index?: number; visible?: boolean; children: React.ReactNode }) {
  return <>{children}</>;
}

// ============================================
// CONSTANTS
// ============================================

const RECENT_EVENTS_CUTOFF_HOURS = 24;
const RECENT_EVENTS_MAX = 7;

const BIBERON_TYPE_LABELS: Record<string, string> = {
  lait_maternel: "Lait maternel",
  lait_infantile: "Lait infantile",
  eau: "Eau",
  jus: "Jus",
  autre: "Autre",
};

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
// HOOKS
// ============================================

function useEventEditHandler(
  openSheet: (props: any) => void,
  toDate: (value: any) => Date,
  headerOwnerId: React.MutableRefObject<string>,
  sommeilEnCours: any,
  promenadeEnCours: any,
  showToast?: (msg: string) => void,
) {
  return useCallback(
    (event: any) => {
      if (event.id?.startsWith?.('__optimistic_')) {
        showToast?.('Enregistrement en cours...');
        return;
      }
      if (!event.id) {
        const route = getEditRoute(event);
        if (route) router.push(route as any);
        return;
      }

      const handlers: Record<string, () => void> = {
        temperature: () =>
          openSheet({
            ownerId: headerOwnerId.current,
            formType: "soins",
            soinsType: "temperature",
            editData: {
              id: event.id,
              type: "temperature",
              date: toDate(event.date),
              valeur: event.valeur,
              modePrise: event.modePrise,
              note: event.note,
            },
          }),
        medicament: () =>
          openSheet({
            ownerId: headerOwnerId.current,
            formType: "soins",
            soinsType: "medicament",
            editData: {
              id: event.id,
              type: "medicament",
              date: toDate(event.date),
              nomMedicament: event.nomMedicament,
              dosage: event.dosage,
              voie: event.voie,
              note: event.note,
            },
          }),
        symptome: () =>
          openSheet({
            ownerId: headerOwnerId.current,
            formType: "soins",
            soinsType: "symptome",
            editData: {
              id: event.id,
              type: "symptome",
              date: toDate(event.date),
              symptomes: event.symptomes,
              intensite: event.intensite,
              note: event.note,
            },
          }),
        vaccin: () =>
          openSheet({
            ownerId: headerOwnerId.current,
            formType: "soins",
            soinsType: "vaccin",
            editData: {
              id: event.id,
              type: "vaccin",
              date: toDate(event.date),
              nomVaccin: event.nomVaccin || event.lib || "",
              dosage: event.dosage || "",
              note: event.note,
            },
          }),
        vitamine: () =>
          openSheet({
            ownerId: headerOwnerId.current,
            formType: "soins",
            soinsType: "vitamine",
            editData: {
              id: event.id,
              type: "vitamine",
              date: toDate(event.date),
              nomVitamine: event.nomVitamine || "Vitamine D",
              dosage: event.dosage,
              note: event.note,
            },
          }),
        tetee: () =>
          openSheet({
            ownerId: headerOwnerId.current,
            formType: "meals",
            mealType: "tetee",
            editData: {
              id: event.id,
              type: "tetee",
              date: toDate(event.date),
              dureeGauche: event.dureeGauche,
              dureeDroite: event.dureeDroite,
            },
          }),
        biberon: () =>
          openSheet({
            ownerId: headerOwnerId.current,
            formType: "meals",
            mealType: "biberon",
            editData: {
              id: event.id,
              type: "biberon",
              date: toDate(event.date),
              quantite: event.quantite,
              typeBiberon: event.typeBiberon,
            },
          }),
        solide: () =>
          openSheet({
            ownerId: headerOwnerId.current,
            formType: "meals",
            mealType: "solide",
            editData: {
              id: event.id,
              type: "solide",
              date: toDate(event.date),
              typeSolide: event.typeSolide,
              momentRepas: event.momentRepas,
              ingredients: event.ingredients,
              quantiteSolide: event.quantite,
              nouveauAliment: event.nouveauAliment,
              nomNouvelAliment: event.nomNouvelAliment,
              allergenes: event.allergenes,
              reaction: event.reaction,
              aime: event.aime,
            },
          }),
        pompage: () =>
          openSheet({
            ownerId: headerOwnerId.current,
            formType: "pumping",
            editData: {
              id: event.id,
              date: toDate(event.date),
              quantiteGauche: event.quantiteGauche,
              quantiteDroite: event.quantiteDroite,
              duree: event.duree,
              note: event.note,
            },
          }),
        activite: () =>
          openSheet({
            ownerId: headerOwnerId.current,
            formType: "activities",
            activiteType: event.typeActivite ?? "tummyTime",
            editData: {
              id: event.id,
              typeActivite: event.typeActivite ?? "tummyTime",
              duree: event.duree,
              description: event.description ?? event.note,
              date: toDate(event.date),
              heureDebut: event.heureDebut ? toDate(event.heureDebut) : undefined,
              heureFin: event.heureFin ? toDate(event.heureFin) : undefined,
            },
            promenadeEnCours: promenadeEnCours ?? null,
          }),
        jalon: () =>
          openSheet({
            ownerId: headerOwnerId.current,
            formType: "milestones",
            jalonType: event.typeJalon ?? "photo",
            editData: {
              id: event.id,
              typeJalon: event.typeJalon ?? "photo",
              titre: event.titre,
              description: event.description,
              note: event.note,
              humeur: event.humeur,
              photos: event.photos,
              date: toDate(event.date),
            },
          }),
        miction: () =>
          openSheet({
            ownerId: headerOwnerId.current,
            formType: "diapers",
            diapersType: "miction",
            editData: {
              id: event.id,
              type: "miction",
              date: toDate(event.date),
              couleur: event.couleur,
            },
          }),
        selle: () =>
          openSheet({
            ownerId: headerOwnerId.current,
            formType: "diapers",
            diapersType: "selle",
            editData: {
              id: event.id,
              type: "selle",
              date: toDate(event.date),
              consistance: event.consistance,
              quantite: event.quantite,
            },
          }),
        sommeil: () =>
          openSheet({
            ownerId: headerOwnerId.current,
            formType: "routines",
            routineType: "sommeil",
            sleepMode: event.isNap ? "nap" : "night",
            editData: {
              id: event.id,
              type: "sommeil",
              date: toDate(event.heureDebut),
              heureDebut: toDate(event.heureDebut),
              heureFin: event.heureFin ? toDate(event.heureFin) : undefined,
              isNap: event.isNap,
              location: event.location,
              quality: event.quality,
              note: event.note,
            },
            sommeilEnCours,
          }),
        bain: () =>
          openSheet({
            ownerId: headerOwnerId.current,
            formType: "routines",
            routineType: "bain",
            editData: {
              id: event.id,
              type: "bain",
              date: toDate(event.date),
              duree: event.duree,
              temperatureEau: event.temperature,
              note: event.note,
            },
          }),
        nettoyage_nez: () =>
          openSheet({
            ownerId: headerOwnerId.current,
            formType: "routines",
            routineType: "nettoyage_nez",
            editData: {
              id: event.id,
              type: "nettoyage_nez",
              date: toDate(event.date),
              methode: event.methode,
              resultat: event.resultat,
              note: event.note,
            },
          }),
        croissance: () =>
          openSheet({
            ownerId: headerOwnerId.current,
            formType: "croissance",
            editData: {
              id: event.id,
              date: toDate(event.date),
              tailleCm: event.tailleCm,
              poidsKg: event.poidsKg,
              teteCm: event.teteCm,
            },
          }),
      };

      const handler = handlers[event.type];
      if (handler) {
        handler();
      } else {
        const route = getEditRoute(event);
        if (route) router.push(route as any);
      }
    },
    [openSheet, toDate, headerOwnerId, sommeilEnCours, promenadeEnCours],
  );
}

function getEditRoute(event: any): string | null {
  if (!event.id) return null;
  const id = encodeURIComponent(event.id);
  switch (event.type) {
    case "tetee":
      return `/baby/meals?tab=seins&editId=${id}&returnTo=home`;
    case "biberon":
      return `/baby/meals?tab=biberons&editId=${id}&returnTo=home`;
    case "pompage":
      return `/baby/pumping?editId=${id}&returnTo=home`;
    case "sommeil":
      return `/baby/routines?editId=${id}&returnTo=home`;
    case "bain":
    case "nettoyage_nez":
      return `/baby/routines?editId=${id}&returnTo=home`;
    case "temperature":
    case "medicament":
    case "symptome":
    case "vaccin":
    case "vitamine":
      return `/baby/soins?editId=${id}&returnTo=home`;
    case "miction":
      return `/baby/diapers?tab=mictions&editId=${id}&returnTo=home`;
    case "selle":
      return `/baby/diapers?tab=selles&editId=${id}&returnTo=home`;
    case "activite":
      return `/baby/activities?editId=${id}&returnTo=home`;
    case "jalon":
      return `/baby/milestones?editId=${id}&returnTo=home`;
    default:
      return null;
  }
}

// ============================================
// COMPONENT
// ============================================

export default function HomeDashboard() {
  const { activeChild, reminderPreferences } = useBaby();
  const { firebaseUser } = useAuth();
  const { firstTrack } = useLocalSearchParams<{ firstTrack?: string }>();
  const [showFirstTrackGuide, setShowFirstTrackGuide] = useState(firstTrack === "true");
  const { setHeaderRight } = useHeaderRight();
  const colorScheme = useColorScheme() ?? "light";
  const nc = getNeutralColors(colorScheme);
  const cat = getCategoryColors(colorScheme);
  const headerOwnerId = useRef(`home-${Math.random().toString(36).slice(2)}`);
  const { openSheet: openSheetRaw } = useSheet();
  const { showToast, showUndoToast, showActionToast } = useToast();
  const warningStateRef = useRef<
    Record<
      string,
      { change?: number; repas?: number; pompage?: number }
    >
  >({});
  // R7: Reminder prefs come from BabyContext's real-time listener (no extra Firestore read)
  const remindersEnabled = reminderPreferences.enabled;
  const reminderThresholds = reminderPreferences.thresholds;
  const [showRecentHint, setShowRecentHint] = useState(false);
  const headerMicOpacity = useRef(new Animated.Value(0)).current;
  const inlineMicOpacity = useRef(new Animated.Value(1)).current;
  const [headerMicVisible, setHeaderMicVisible] = useState(false);
  const headerMicVisibleRef = useRef(false);
  const headerRowLayoutRef = useRef<{ y: number; height: number } | null>(null);
  const scrollYRef = useRef(0);
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
  const permsCached = getPermissionsCache();
  const permissions = useChildPermissions(activeChild?.id, firebaseUser?.uid);
  const canManageContent = permissions.loading && permsCached
    ? permsCached.canManageContent
    : permissions.role === "owner" || permissions.role === "admin";

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

  const [currentTime, setCurrentTime] = useState(new Date());
  // Track current day to detect day changes (for listener refresh)
  const [currentDay, setCurrentDay] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${now.getMonth()}-${now.getDate()}`;
  });
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
    const timer = setTimeout(async () => {
      try {
        await supprimerEvenement(activeChild.id!, eventId);
      } catch {
        setSoftDeletedIds((prev) => {
          const next = new Set(prev);
          next.delete(eventId);
          return next;
        });
        // P27: error retry toast
        showActionToast("Erreur lors de la suppression", "Réessayer", () =>
          confirmDelete(),
        );
      }
    }, 3000);
    showUndoToast("Événement supprimé", () => {
      clearTimeout(timer);
      setSoftDeletedIds((prev) => {
        const next = new Set(prev);
        next.delete(eventId);
        return next;
      });
    });
  }, [
    activeChild?.id,
    deleteConfirm.event,
    showUndoToast,
    showActionToast,
  ]);

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

  const toDate = useCallback((value: any) => {
    return parseDate(value);
  }, []);

  const getDateTime = useCallback(
    (value: any) => {
      const date = toDate(value);
      const time = date.getTime();
      return Number.isNaN(time) ? 0 : time;
    },
    [toDate],
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
    (event: any) => {
      switch (event.type) {
        case "biberon": {
          const typeLabel = event.typeBiberon
            ? BIBERON_TYPE_LABELS[event.typeBiberon]
            : null;
          const quantity = event.quantite ? `${event.quantite} ml` : null;
          const parts = [typeLabel, quantity].filter(Boolean);
          return parts.length > 0 ? parts.join(" · ") : undefined;
        }
        case "solide": {
          const typeLabels: Record<string, string> = {
            puree: "Purée",
            compote: "Compote",
            cereales: "Céréales",
            yaourt: "Yaourt",
            morceaux: "Morceaux",
            autre: "Autre",
          };
          const qtyLabels: Record<string, string> = {
            peu: "Un peu",
            moyen: "Moyen",
            beaucoup: "Beaucoup",
          };
          const momentLabel = event.momentRepas
            ? MOMENT_REPAS_LABELS[event.momentRepas]
            : null;
          const qtyLabel = event.quantite
            ? `Qté : ${qtyLabels[event.quantite]}`
            : null;
          const typeLabel = event.typeSolide
            ? typeLabels[event.typeSolide]
            : null;
          const line1Parts = [momentLabel, typeLabel, qtyLabel].filter(Boolean);
          const line1 = line1Parts.length > 0 ? line1Parts.join(" · ") : null;
          const ingredients =
            typeof event.ingredients === "string"
              ? event.ingredients.trim()
              : "";
          const newFood =
            event.nouveauAliment &&
            typeof event.nomNouvelAliment === "string"
              ? event.nomNouvelAliment.trim()
              : "";
          const hasLike = typeof event.aime === "boolean";
          const likeTarget = ingredients || newFood;
          const likeSubject =
            !ingredients && newFood ? "ce nouveau plat" : "ce plat";
          const likeLabel =
            hasLike
              ? `${event.aime ? "A aimé" : "N'a pas aimé"} ${likeSubject}${
                  likeTarget ? ` : ${likeTarget}` : ""
                }`
              : null;
          const parts = [
            line1,
            likeLabel,
            ingredients && (!hasLike || likeTarget !== ingredients)
              ? `Ingrédients : ${ingredients}`
              : null,
            newFood && (!hasLike || likeTarget !== newFood)
              ? `Nouvel aliment : ${newFood}`
              : null,
          ].filter(Boolean);
          return parts.length > 0 ? parts.join("\n") : undefined;
        }
        case "tetee": {
          const left = event.dureeGauche ? `G ${event.dureeGauche} min` : null;
          const right = event.dureeDroite ? `D ${event.dureeDroite} min` : null;
          const parts = [left, right].filter(Boolean);
          return parts.length > 0 ? parts.join(" • ") : undefined;
        }
        case "pompage": {
          const left = event.quantiteGauche
            ? `G ${event.quantiteGauche} ml`
            : null;
          const right = event.quantiteDroite
            ? `D ${event.quantiteDroite} ml`
            : null;
          const parts = [left, right].filter(Boolean);
          return parts.length > 0 ? parts.join(" • ") : undefined;
        }
        case "croissance": {
          const parts = [
            event.poidsKg ? `${event.poidsKg} kg` : null,
            event.tailleCm ? `${event.tailleCm} cm` : null,
            event.teteCm ? `PC ${event.teteCm} cm` : null,
          ].filter(Boolean);
          return parts.length > 0 ? parts.join(" · ") : undefined;
        }
        case "miction":
          return event.volume ? `${event.volume} ml` : event.couleur;
        case "selle":
          return event.consistance || event.couleur;
        case "vitamine": {
          const name = event.nomVitamine || "Vitamine";
          return event.dosage ? `${name} · ${event.dosage}` : name;
        }
        case "sommeil": {
          const start = event.heureDebut
            ? toDate(event.heureDebut)
            : toDate(event.date);
          const end = event.heureFin ? toDate(event.heureFin) : null;
          const duration =
            event.duree ??
            (end ? Math.round((end.getTime() - start.getTime()) / 60000) : 0);

          const locationLabel =
            event.location === "autre" && event.note
              ? event.note
              : event.location;
          const parts = [
            end ? formatDuration(duration) : null, // Only show duration if sleep is finished
            locationLabel,
            event.quality,
          ].filter(Boolean);
          return parts.length > 0 ? parts.join(" · ") : undefined;
        }
        case "bain": {
          const parts = [
            event.duree ? `${event.duree} min` : null,
            event.temperatureEau ? `${event.temperatureEau}°C` : null,
          ].filter(Boolean);
          return parts.length > 0 ? parts.join(" · ") : undefined;
        }
        case "nettoyage_nez": {
          const methodeLabels: Record<string, string> = {
            serum: "Sérum",
            mouche_bebe: "Mouche-bébé",
            coton: "Coton",
            autre: "Autre",
          };
          const resultatLabels: Record<string, string> = {
            efficace: "Efficace",
            mucus_clair: "Clair",
            mucus_epais: "Épais",
            mucus_colore: "Coloré",
          };
          const parts = [
            event.methode ? methodeLabels[event.methode] : null,
            event.resultat ? resultatLabels[event.resultat] : null,
          ].filter(Boolean);
          return parts.length > 0 ? parts.join(" · ") : undefined;
        }
        case "temperature": {
          const value =
            typeof event.valeur === "number" ? `${event.valeur}°C` : undefined;
          const parts = [value, event.modePrise].filter(Boolean);
          return parts.length > 0 ? parts.join(" · ") : undefined;
        }
        case "medicament": {
          const name = event.nomMedicament || "Médicament";
          return event.dosage ? `${name} · ${event.dosage}` : name;
        }
        case "symptome": {
          const list = Array.isArray(event.symptomes)
            ? event.symptomes.join(", ")
            : undefined;
          const parts = [list, event.intensite].filter(Boolean);
          return parts.length > 0 ? parts.join(" · ") : undefined;
        }
        case "vaccin":
          const name = event.nomVaccin || "Vaccin";
          return event.dosage ? `${name} · ${event.dosage}` : name;
        case "activite": {
          const isOther = event.typeActivite === "autre";
          const parts = [
            event.duree ? formatDuration(event.duree) : null,
            isOther ? null : event.description,
          ].filter(Boolean);
          return parts.length > 0 ? parts.join(" · ") : undefined;
        }
        case "jalon": {
          if (event.typeJalon === "humeur") {
            return typeof event.humeur === "number"
              ? MOOD_EMOJIS[event.humeur]
              : undefined;
          }
          return event.description || undefined;
        }
        default:
          return undefined;
      }
    },
    [formatDuration, toDate],
  );

  const getDayLabel = useCallback((date: Date) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    const eventDay = new Date(date);
    eventDay.setHours(0, 0, 0, 0);

    if (eventDay.getTime() === today.getTime()) {
      return "Aujourd'hui";
    }
    if (eventDay.getTime() === yesterday.getTime()) {
      return "Hier";
    }
    return date.toLocaleDateString("fr-FR", {
      weekday: "long",
      day: "numeric",
      month: "long",
    });
  }, []);

  const handleViewAllPress = useCallback(() => {
    router.push("/baby/chrono" as any);
  }, []);

  const recentEvents = useMemo(() => {
    const cutoff = new Date(
      currentTime.getTime() - RECENT_EVENTS_CUTOFF_HOURS * 60 * 60 * 1000,
    );
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
      .filter(
        (event) =>
          toDate(event.date) >= cutoff && !softDeletedIds.has(event.id),
      )
      .sort((a, b) => toDate(b.date).getTime() - toDate(a.date).getTime())
      .slice(0, RECENT_EVENTS_MAX);
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
    currentTime,
    toDate,
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

  // Smart Content: load last 7 days of events for insight engine
  const [weeklyEvents, setWeeklyEvents] = useState<{
    id: string;
    type: string;
    date: Date;
    quality?: string;
    location?: string;
    isNap?: boolean;
    duree?: number;
    heureDebut?: Date;
    heureFin?: Date;
    typeSolide?: string;
    nouveauAliment?: boolean;
    nomNouvelAliment?: string;
    reaction?: string;
    quantiteMl?: number;
    valeur?: number;
    jalonType?: string;
    titre?: string;
  }[]>([]);

  useEffect(() => {
    if (!activeChild?.id) return;
    let cancelled = false;
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    sevenDaysAgo.setHours(0, 0, 0, 0);

    obtenirEvenements(activeChild.id, { depuis: sevenDaysAgo })
      .then((events) => {
        if (cancelled) return;
        setWeeklyEvents(
          events.map((e: any) => ({
            id: e.id ?? "",
            type: e.type,
            date: toDate(e.date),
            quality: e.quality,
            location: e.location,
            isNap: e.isNap,
            duree: e.duree,
            heureDebut: e.heureDebut ? toDate(e.heureDebut) : undefined,
            heureFin: e.heureFin ? toDate(e.heureFin) : undefined,
            typeSolide: e.typeSolide,
            nouveauAliment: e.nouveauAliment,
            nomNouvelAliment: e.nomNouvelAliment,
            reaction: e.reaction,
            quantiteMl: e.quantiteMl,
            valeur: e.valeur,
            jalonType: e.typeJalon ?? e.jalonType,
            titre: e.titre,
          })),
        );
      })
      .catch(console.warn);

    return () => { cancelled = true; };
  }, [activeChild?.id, refreshTick, toDate]);

  const allEventsForInsights = weeklyEvents;

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
  }, [data.jalons, toDate, softDeletedIds]);

  const todayMoodEvent = useMemo(() => {
    const moods = todayJalons
      .filter((item) => item.typeJalon === "humeur")
      .sort((a, b) => toDate(b.date).getTime() - toDate(a.date).getTime());
    return moods[0] ?? null;
  }, [todayJalons, toDate]);

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
  }, [data.sommeils, softDeletedIds, toDate]);

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
  }, [data.activites, softDeletedIds, toDate]);

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

  const elapsedSleepMinutes = useMemo(() => {
    if (!sommeilEnCours?.heureDebut) return 0;
    const start = toDate(sommeilEnCours.heureDebut);
    if (!isValidDate(start)) return 0;
    return Math.max(
      0,
      Math.round((currentTime.getTime() - start.getTime()) / 60000),
    );
  }, [sommeilEnCours, currentTime, toDate]);

  const elapsedPromenadeMinutes = useMemo(() => {
    if (!promenadeEnCours?.heureDebut) return 0;
    const start = toDate(promenadeEnCours.heureDebut);
    if (!isValidDate(start)) return 0;
    return Math.max(
      0,
      Math.round((currentTime.getTime() - start.getTime()) / 60000),
    );
  }, [promenadeEnCours, currentTime, toDate]);

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
      pulse.start();
      return () => pulse.stop();
    } else {
      sharedPulseAnim.setValue(1);
    }
  }, [!!sommeilEnCours, !!promenadeEnCours, sharedPulseAnim]);

  // ============================================
  // STATS GROUPS DATA
  // ============================================

  const getTimeSince = useCallback(
    (timestamp?: number): string | undefined => {
      if (!timestamp || isNaN(timestamp)) return undefined;
      const diffMinutes = Math.floor(
        (currentTime.getTime() - timestamp) / (1000 * 60),
      );
      if (diffMinutes < 0) return undefined;
      if (diffMinutes === 0) return "à l'instant";
      const diffHours = Math.floor(diffMinutes / 60);
      const remainingMinutes = diffMinutes % 60;
      if (diffHours > 0) {
        return `il y a ${diffHours}h${remainingMinutes > 0 ? `${remainingMinutes}` : ""}`;
      }
      return `il y a ${diffMinutes}min`;
    },
    [currentTime],
  );

  // Alimentation Group
  const alimentationGroup = useMemo((): {
    summary: React.ReactNode;
    timeSince?: string;
    timeSinceLabel?: string;
    lastTime?: string;
    isWarning: boolean;
    items: StatItem[];
  } => {
    const biberonQty = todayStats.meals.biberons.quantity;
    const pompageQty = todayStats.pompages.quantity;

    // Check for meal warning — threshold "repas" covers biberon, tétée, solide
    const repasThresholdMs =
      remindersEnabled && reminderThresholds.repas > 0
        ? reminderThresholds.repas * 60 * 60 * 1000
        : null;
    const now = currentTime.getTime();
    const mealsLastTs =
      todayStats.meals.total.lastTimestamp ??
      todayStats.meals.lastAbsoluteTimestamp;
    const repasWarning =
      repasThresholdMs !== null &&
      !!mealsLastTs &&
      now - mealsLastTs > repasThresholdMs;

    // Check for pompage warning
    const pompagesThresholdMs =
      remindersEnabled && reminderThresholds.pompages > 0
        ? reminderThresholds.pompages * 60 * 60 * 1000
        : null;
    const pompageLastTs = todayStats.pompages.lastTimestamp;
    const pompageWarning =
      pompagesThresholdMs !== null &&
      !!pompageLastTs &&
      now - pompageLastTs > pompagesThresholdMs;

    const isWarning = !!(repasWarning || pompageWarning);

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
      timeSince: getTimeSince(displayTimestamp),
      lastTime,
      isWarning,
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
            ? () => router.push("/baby/stats?tab=tetees&returnTo=home" as any)
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
            ? () => router.push("/baby/stats?tab=biberons&returnTo=home" as any)
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
            ? () => router.push("/baby/stats?tab=solides&returnTo=home" as any)
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
            ? () => router.push("/baby/stats?tab=pompages&returnTo=home" as any)
            : undefined,
        },
      ],
    };
  }, [
    todayStats,
    data.tetees,
    data.biberons,
    data.solides,
    toDate,
    getTimeSince,
    formatTime,
    canManageContent,
    remindersEnabled,
    reminderThresholds.repas,
    reminderThresholds.pompages,
    currentTime,
  ]);

  // Santé Group (Couches + Vitamines + Vaccins)
  const santeGroup = useMemo((): {
    summary: string;
    timeSince?: string;
    timeSinceLabel?: string;
    lastTime?: string;
    isWarning: boolean;
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

    const now = currentTime.getTime();
    const lastChangeTimestamp = Math.max(
      todayStats.mictions.lastTimestamp ?? 0,
      todayStats.selles.lastTimestamp ?? 0,
    );
    const isWarning =
      changesThresholdMs !== null &&
      lastChangeTimestamp > 0 &&
      now - lastChangeTimestamp > changesThresholdMs;

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
      timeSince: getTimeSince(displayTimestamp),
      lastTime,
      isWarning,
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
                router.push("/baby/diapers?tab=mictions&returnTo=home" as any)
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
            ? () => router.push("/baby/diapers?tab=selles&returnTo=home" as any)
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
                router.push("/baby/soins?type=vitamine&returnTo=home" as any)
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
            ? () => router.push("/baby/soins?type=vaccin&returnTo=home" as any)
            : undefined,
        },
      ],
    };
  }, [
    todayStats,
    data.mictions,
    data.selles,
    toDate,
    getTimeSince,
    formatTime,
    remindersEnabled,
    reminderThresholds.changes,
    currentTime,
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

  const handleStopSleep = useCallback(() => {
    if (!activeChild?.id || !sommeilEnCours?.id) return;
    if (sommeilEnCours.id.startsWith('__optimistic_')) {
      showToast('Enregistrement en cours...');
      return;
    }
    const start = toDate(sommeilEnCours.heureDebut);

    // Open the form with heureFin pre-filled so it's ready to terminate
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
        heureFin: new Date(),
        isNap: sommeilEnCours.isNap,
        location: sommeilEnCours.location,
        quality: sommeilEnCours.quality,
        note: sommeilEnCours.note,
      },
      sommeilEnCours,
    });
  }, [activeChild?.id, sommeilEnCours, toDate, openSheet, showToast]);

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
        heureFin: new Date(),
        duree: Math.max(
          1,
          Math.round((Date.now() - start.getTime()) / 60000),
        ),
        description: promenadeEnCours.description,
      },
      promenadeEnCours,
    });
  }, [activeChild?.id, promenadeEnCours, toDate, openSheet, showToast]);

  // ============================================
  // EFFECTS - TIMER
  // ============================================

  // Timer intelligent qui écoute les changements d'état de l'app
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;

    const updateTime = () => {
      const now = new Date();
      setCurrentTime(now);
      // Check if day changed to refresh the listener
      const newDay = `${now.getFullYear()}-${now.getMonth()}-${now.getDate()}`;
      setCurrentDay((prev) => (prev !== newDay ? newDay : prev));
      scheduleNextUpdate();
    };

    const scheduleNextUpdate = () => {
      if (timer) {
        clearTimeout(timer);
      }

      const now = new Date();
      const millisecondsUntilNextMinute =
        (60 - now.getSeconds()) * 1000 - now.getMilliseconds();

      timer = setTimeout(() => {
        updateTime();
      }, millisecondsUntilNextMinute);
    };

    const handleAppStateChange = (nextAppState: string) => {
      if (nextAppState === "active") {
        // On app foreground, update time and check day change
        const now = new Date();
        setCurrentTime(now);
        const newDay = `${now.getFullYear()}-${now.getMonth()}-${now.getDate()}`;
        setCurrentDay((prev) => (prev !== newDay ? newDay : prev));
        scheduleNextUpdate();
      }
    };

    const subscription = AppState.addEventListener(
      "change",
      handleAppStateChange,
    );

    updateTime();

    return () => {
      if (timer) {
        clearTimeout(timer);
      }
      subscription?.remove();
    };
  }, []);

  useEffect(() => {
    if (!activeChild?.id) return;

    const childKey = activeChild.id;
    if (!warningStateRef.current[childKey]) {
      warningStateRef.current[childKey] = {};
    }
    const warningState = warningStateRef.current[childKey];
    const now = currentTime.getTime();
    const changesThresholdHours = reminderThresholds.changes || 0;
    const changesThresholdMs =
      changesThresholdHours > 0 ? changesThresholdHours * 60 * 60 * 1000 : null;

    const lastChangeTs = Math.max(
      todayStats.mictions.lastTimestamp ?? 0,
      todayStats.selles.lastTimestamp ?? 0,
    );
    const changeExceeded =
      remindersEnabled &&
      changesThresholdMs !== null &&
      lastChangeTs > 0 &&
      now - lastChangeTs > changesThresholdMs;
    const changeNotified = lastChangeTs > 0 && warningState.change === lastChangeTs;
    const changesHoursLabel = `${changesThresholdHours}h`;

    if (changeExceeded && !changeNotified) {
      showToast(
        `⚠️ Attention: plus de ${changesHoursLabel} depuis le dernier change.`,
        3200,
        "top",
      );
      warningState.change = lastChangeTs;
    }

    // Repas warning
    const repasThresholdHours = reminderThresholds.repas || 0;
    const repasThresholdMs =
      repasThresholdHours > 0 ? repasThresholdHours * 60 * 60 * 1000 : null;
    const repasTs =
      todayStats.meals.total.lastTimestamp ??
      todayStats.meals.lastAbsoluteTimestamp;
    const repasExceeded =
      remindersEnabled &&
      repasThresholdMs !== null &&
      !!repasTs &&
      now - repasTs > repasThresholdMs;
    const repasNotified = repasTs && warningState.repas === repasTs;

    if (repasExceeded && !repasNotified) {
      showToast(
        `⚠️ Attention: plus de ${repasThresholdHours}h depuis le dernier repas.`,
        3200,
        "top",
      );
      warningState.repas = repasTs;
    }

    // Pompages warning
    const pompagesThresholdHours = reminderThresholds.pompages || 0;
    const pompagesThresholdMs =
      pompagesThresholdHours > 0
        ? pompagesThresholdHours * 60 * 60 * 1000
        : null;
    const pompageTs = todayStats.pompages.lastTimestamp;
    const pompageExceeded =
      remindersEnabled &&
      pompagesThresholdMs !== null &&
      !!pompageTs &&
      now - pompageTs > pompagesThresholdMs;
    const pompageNotified = pompageTs && warningState.pompage === pompageTs;

    if (pompageExceeded && !pompageNotified) {
      showToast(
        `⚠️ Attention: plus de ${pompagesThresholdHours}h depuis le dernier pompage.`,
        3200,
        "top",
      );
      warningState.pompage = pompageTs;
    }
  }, [
    activeChild?.id,
    currentTime,
    remindersEnabled,
    reminderThresholds.changes,
    reminderThresholds.repas,
    reminderThresholds.pompages,
    todayStats.mictions.lastTimestamp,
    todayStats.selles.lastTimestamp,
    todayStats.meals.total.lastTimestamp,
    todayStats.meals.lastAbsoluteTimestamp,
    todayStats.pompages.lastTimestamp,
    showToast,
  ]);

  const updateHeaderControls = useCallback(
    (scrollY: number, headerLayout: { y: number; height: number } | null) => {
      if (headerLayout) {
        const threshold = headerLayout.y + headerLayout.height - 8;
        const fadeRange = 70;
        const fadeStart = threshold - fadeRange;
        const progress = Math.max(
          0,
          Math.min(1, (scrollY - fadeStart) / fadeRange),
        );
        const nextHeaderOpacity = progress;
        const nextInlineOpacity = 1 - progress;
        headerMicOpacity.setValue(nextHeaderOpacity);
        inlineMicOpacity.setValue(nextInlineOpacity);

        const shouldShow = nextHeaderOpacity > 0.05;
        if (shouldShow !== headerMicVisibleRef.current) {
          headerMicVisibleRef.current = shouldShow;
          setHeaderMicVisible(shouldShow);
        }
      }
    },
    [headerMicOpacity, inlineMicOpacity],
  );

  const handleScroll = useCallback(
    (event: any) => {
      const scrollY = event.nativeEvent.contentOffset.y || 0;
      scrollYRef.current = scrollY;
      updateHeaderControls(scrollY, headerRowLayoutRef.current);
    },
    [updateHeaderControls],
  );

  useEffect(() => {
    updateHeaderControls(scrollYRef.current, headerRowLayoutRef.current);
  }, [updateHeaderControls]);

  useFocusEffect(
    useCallback(() => {
      if (!canManageContent) {
        setHeaderRight(null, headerOwnerId.current);
        return () => {
          setHeaderRight(null, headerOwnerId.current);
        };
      }
      const headerButtons = (
        <Animated.View
          style={{
            flexDirection: "row",
            alignItems: "center",
            paddingRight: 16,
          }}
          pointerEvents={headerMicVisible ? "auto" : "none"}
        >
          <Animated.View
            style={{
              opacity: headerMicOpacity,
            }}
            pointerEvents={headerMicVisible ? "auto" : "none"}
          >
            <VoiceCommandButton
              size={18}
              color={Colors[colorScheme].tint}
              showTestToggle={false}
            />
          </Animated.View>
        </Animated.View>
      );

      setHeaderRight(headerButtons, headerOwnerId.current);

      return () => {
        setHeaderRight(null, headerOwnerId.current);
      };
    }, [
      colorScheme,
      headerMicOpacity,
      headerMicVisible,
      setHeaderRight,
      canManageContent,
    ]),
  );

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
  }, [data, getDateTime, toDate, softDeletedIds]);

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
      <ScrollView
        style={[styles.container, { backgroundColor: nc.background }]}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        onScroll={handleScroll}
        scrollEventThrottle={32}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={handleRefresh}
            tintColor={cat.alimentation.primary}
          />
        }
      >
        {/* En-tête avec salutation */}
        <View
          style={styles.headerRow}
          onLayout={(event) => {
            const { y, height } = event.nativeEvent.layout;
            headerRowLayoutRef.current = { y, height };
            updateHeaderControls(scrollYRef.current, { y, height });
          }}
        >
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
          {canManageContent && (
            <Animated.View
              style={[styles.inlineMicContainer, { opacity: inlineMicOpacity }]}
            >
              <VoiceCommandButton
                size={40}
                color={Colors[colorScheme].tint}
                showTestToggle={false}
              />
            </Animated.View>
          )}
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
                timeSince={alimentationGroup.timeSince}
                timeSinceLabel={alimentationGroup.timeSinceLabel}
                isWarning={alimentationGroup.isWarning}
                items={alimentationGroup.items}
                currentTime={currentTime}
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
                timeSince={santeGroup.timeSince}
                timeSinceLabel={santeGroup.timeSinceLabel}
                isWarning={santeGroup.isWarning}
                items={santeGroup.items}
                currentTime={currentTime}
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
                  elapsedMinutes={elapsedSleepMinutes}
                  startTime={
                    sommeilEnCours?.heureDebut
                      ? formatTime(toDate(sommeilEnCours.heureDebut))
                      : undefined
                  }
                  onStartSleep={handleStartSleep}
                  onStopSleep={handleStopSleep}
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
                  elapsedMinutes={elapsedPromenadeMinutes}
                  startTime={
                    promenadeEnCours?.heureDebut
                      ? formatTime(toDate(promenadeEnCours.heureDebut))
                      : undefined
                  }
                  onStart={handleStartPromenade}
                  onStop={handleStopPromenade}
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

        {/* Smart Content: Insights + Tips + Milestones */}
        {isDataLoaded && !smartContent.isLoading && (
          <View style={{ paddingHorizontal: 20, gap: 12, marginBottom: 12 }}>
            {/* Data-driven insights */}
            {hasAnyTodayData && smartContent.insights
              .filter((ins) => !dismissedInsightIds.has(ins.id))
              .map((insight, i) => (
              <StaggeredCard
                key={insight.id}
              >
                <InsightCard
                  insight={insight}
                  onDismiss={handleDismissInsight}
                  onLearnMore={(ins) => {
                    if (ins.relatedTipId) {
                      openSheetRaw({
                        ownerId: activeChild?.id ?? "",
                        formType: "content" as const,
                        tipId: ins.relatedTipId,
                      });
                    }
                  }}
                  colorScheme={colorScheme}
                />
              </StaggeredCard>
            ))}

            {/* Cross-data correlations */}
            {hasAnyTodayData && smartContent.correlations
              .filter((corr) => !dismissedInsightIds.has(corr.id))
              .map((corr, i) => (
              <StaggeredCard key={corr.id}>
                <InsightCard insight={corr} onDismiss={handleDismissInsight} colorScheme={colorScheme} />
              </StaggeredCard>
            ))}

            {/* Upcoming milestones */}
            {smartContent.upcomingMilestones.length > 0 && (
              <StaggeredCard>
                <MilestoneTimelineCard
                  milestones={smartContent.upcomingMilestones}
                  ageWeeks={
                    activeChild?.birthDate
                      ? Math.floor(
                          (Date.now() -
                            new Date(
                              activeChild.birthDate
                                .split("/")
                                .reverse()
                                .join("-"),
                            ).getTime()) /
                            (7 * 24 * 60 * 60 * 1000),
                        )
                      : 0
                  }
                  onViewAll={() => setShowMilestonesModal(true)}
                  colorScheme={colorScheme}
                />
              </StaggeredCard>
            )}
          </View>
        )}

        {/* Chronologie récente */}
        <StaggeredCard>
          <RecentEventsList
            events={recentEvents}
            loading={!isDataLoaded}
            showHint={showRecentHint && canManageContent}
            colorScheme={colorScheme}
            currentTime={currentTime}
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
      {canManageContent && <GlobalFAB />}
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

// ============================================
// STYLES
// ============================================

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  container: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 100,
  },
  headerRow: {
    marginBottom: 8,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginRight: 50,
  },
  header: {
    padding: 20,
    paddingBottom: 10,
  },
  inlineMicContainer: {
    paddingTop: 10,
  },
  greeting: {
    fontSize: 28,
    fontWeight: "700",
    marginBottom: 4,
  },
  date: {
    fontSize: 16,
    textTransform: "capitalize",
  },
  section: {
    marginBottom: 8,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: "600",
    marginHorizontal: 20,
    marginBottom: 16,
  },
  sectionTitleInline: {
    marginHorizontal: 0,
    marginBottom: 0,
  },
  statsGroupContainer: {
    paddingHorizontal: 20,
    marginBottom: 12,
  },
  // Mood card styles
  moodCard: {
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderWidth: 1,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
  moodLabel: {
    marginBottom: 6,
    fontSize: 13,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  moodEmojisRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 4,
  },
  moodEmojiButton: {
    flex: 1,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 10,
  },
  moodEmojiSelected: {
    borderWidth: 2,
  },
  moodEmojiText: {
    fontSize: 22,
  },
  milestonesModalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 12,
  },
  milestonesModalTitle: {
    fontSize: 20,
    fontWeight: "700",
  },
});
