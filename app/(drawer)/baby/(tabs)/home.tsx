import { MigrationBanner } from "@/components/migration";
import {
  RecentEventsList,
  SleepWidget,
  StatsGroup,
  type StatItem,
} from "@/components/suivibaby/dashboard";
import { IconPulseDots } from "@/components/ui/IconPulseDtos";
import { VoiceCommandButton } from "@/components/suivibaby/VoiceCommandButton";
import {
  categoryColors,
  itemColors,
  neutralColors,
} from "@/constants/dashboardColors";
import {
  MOMENT_REPAS_LABELS,
  MOOD_EMOJIS,
  QUICK_ADD_ACTIONS,
} from "@/constants/dashboardConfig";
import { Colors } from "@/constants/theme";
import { useBaby } from "@/contexts/BabyContext";
import { useSheet } from "@/contexts/SheetContext";
import { useToast } from "@/contexts/ToastContext";
import { useColorScheme } from "@/hooks/use-color-scheme";
import {
  ajouterJalon,
  ajouterSommeil,
  modifierSommeil,
} from "@/migration/eventsDoubleWriteService";
import { ecouterEvenementsDuJourHybrid } from "@/migration/eventsHybridService";
import {
  buildTodayEventsData,
  getTodayEventsCache,
} from "@/services/todayEventsCache";
import { obtenirPreferencesNotifications } from "@/services/userPreferencesService";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import FontAwesome from "@expo/vector-icons/FontAwesome6";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useFocusEffect } from "@react-navigation/native";
import { router } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  AppState,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import * as Haptics from "expo-haptics";
import { useHeaderRight } from "../../_layout";

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
  mictions: { count: number; lastTime?: string; lastTimestamp?: number };
  selles: { count: number; lastTime?: string; lastTimestamp?: number };
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
) {
  return useCallback(
    (event: any) => {
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
            },
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
              location: event.lieu,
              quality: event.qualite,
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
    [openSheet, toDate, headerOwnerId, sommeilEnCours],
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
  const { activeChild } = useBaby();
  const { setHeaderRight } = useHeaderRight();
  const colorScheme = useColorScheme() ?? "light";
  const headerOwnerId = useRef(`home-${Math.random().toString(36).slice(2)}`);
  const { openSheet: openSheetRaw, closeSheet, isOpen } = useSheet();
  const { showToast } = useToast();
  const warningStateRef = useRef<
    Record<string, { miction?: number; selle?: number }>
  >({});
  const [remindersEnabled, setRemindersEnabled] = useState(true);
  const [reminderThresholds, setReminderThresholds] = useState({
    repas: 0,
    pompages: 0,
    mictions: 0,
    selles: 0,
    vitamines: 0,
  });
  const [showRecentHint, setShowRecentHint] = useState(false);
  const headerMicOpacity = useRef(new Animated.Value(0)).current;
  const inlineMicOpacity = useRef(new Animated.Value(1)).current;
  const headerAddOpacity = useRef(new Animated.Value(0)).current;
  const [headerMicVisible, setHeaderMicVisible] = useState(false);
  const [headerAddVisible, setHeaderAddVisible] = useState(false);
  const headerMicVisibleRef = useRef(false);
  const headerAddVisibleRef = useRef(false);
  const headerRowLayoutRef = useRef<{ y: number; height: number } | null>(null);
  const activitiesLayoutRef = useRef<{ y: number; height: number } | null>(
    null,
  );
  const scrollYRef = useRef(0);
  const pendingQuickAddRouteRef = useRef<string | null>(null);
  const [refreshTick, setRefreshTick] = useState(0);

  // États des données
  const [data, setData] = useState<DashboardData>({
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
  });

  const [todayStats, setTodayStats] = useState<TodayStats>({
    meals: {
      total: { count: 0, quantity: 0 },
      seins: { count: 0 },
      biberons: { count: 0, quantity: 0 },
    },
    pompages: { count: 0, quantity: 0 },
    sommeil: { count: 0, totalMinutes: 0 },
    mictions: { count: 0 },
    selles: { count: 0 },
    vitamines: { count: 0 },
    vaccins: { count: 0 },
  });

  const [currentTime, setCurrentTime] = useState(new Date());
  const [isMoodSaving, setIsMoodSaving] = useState(false);
  // Track current day to detect day changes (for listener refresh)
  const [currentDay, setCurrentDay] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${now.getMonth()}-${now.getDate()}`;
  });
  const [loading, setLoading] = useState({
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

  const triggerRefresh = useCallback(() => {
    setRefreshTick((prev) => prev + 1);
  }, []);

  const openSheet = useCallback(
    (props: Parameters<typeof openSheetRaw>[0]) => {
      openSheetRaw({
        ...props,
        onSuccess: () => {
          props.onSuccess?.();
          triggerRefresh();
        },
      });
    },
    [openSheetRaw, triggerRefresh],
  );

  const toDate = useCallback((value: any) => {
    if (value?.seconds) return new Date(value.seconds * 1000);
    if (value?.toDate) return value.toDate();
    if (value instanceof Date) return value;
    return new Date(value);
  }, []);

  const formatTime = useCallback((date: Date) => {
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

  const BIBERON_TYPE_LABELS: Record<string, string> = {
    lait_maternel: "Lait maternel",
    lait_infantile: "Lait infantile",
    eau: "Eau",
    jus: "Jus",
    autre: "Autre",
  };

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
          const momentLabel = event.momentRepas
            ? MOMENT_REPAS_LABELS[event.momentRepas]
            : null;
          const quantity = event.quantiteSolide ?? event.quantite;
          const line2 =
            momentLabel || quantity
              ? `${momentLabel ?? ""}${momentLabel && quantity ? " · " : ""}${quantity ?? ""}`
              : null;
          const dishName = event.nomNouvelAliment || event.ingredients || "";
          const likeLabel =
            event.aime === undefined
              ? null
              : event.aime
                ? dishName
                  ? `A aimé ce plat : ${dishName}`
                  : "A aimé son plat"
                : dishName
                  ? `N'a pas aimé ce plat : ${dishName}`
                  : "N'a pas aimé le plat";
          const line3 = likeLabel || null;
          const parts = [line2, line3].filter(Boolean);
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

          const parts = [
            end ? formatDuration(duration) : null, // Only show duration if sleep is finished
            event.location,
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
            event.duree ? `${event.duree} min` : null,
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
    ].map((event) => ({
      ...event,
      type: event.type,
      date: event.date,
    }));

    return merged
      .filter((event) => toDate(event.date) >= cutoff)
      .sort((a, b) => toDate(b.date).getTime() - toDate(a.date).getTime())
      .slice(0, RECENT_EVENTS_MAX);
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
    currentTime,
    toDate,
  ]);

  const todayJalons = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    return data.jalons.filter((item) => {
      const date = toDate(item.date);
      return date >= today && date < tomorrow;
    });
  }, [data.jalons, toDate]);

  const todayMoodEvent = useMemo(() => {
    const moods = todayJalons
      .filter((item) => item.typeJalon === "humeur")
      .sort((a, b) => toDate(b.date).getTime() - toDate(a.date).getTime());
    return moods[0] ?? null;
  }, [todayJalons, toDate]);

  const handleSetMood = useCallback(
    async (value: 1 | 2 | 3 | 4 | 5) => {
      if (!activeChild?.id || isMoodSaving) return;
      // Haptic feedback on selection
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      try {
        setIsMoodSaving(true);
        const now = new Date();
        const dataToSave = {
          date: now,
          typeJalon: "humeur" as const,
          humeur: value,
          titre: "Humeur du jour",
        };
        // Toujours ajouter une nouvelle entrée (l'enfant peut changer d'humeur plusieurs fois par jour)
        const moodId = await ajouterJalon(activeChild.id, dataToSave);

        if (!moodId) {
          showToast("Impossible d'enregistrer l'humeur.");
        }
      } catch {
        showToast("Impossible d'enregistrer l'humeur.");
      } finally {
        setIsMoodSaving(false);
      }
    },
    [activeChild?.id, isMoodSaving, showToast],
  );
  const sommeilEnCours = useMemo(() => {
    return data.sommeils.find((item) => !item.heureFin && item.heureDebut);
  }, [data.sommeils]);

  const handleEventEdit = useEventEditHandler(
    openSheet,
    toDate,
    headerOwnerId,
    sommeilEnCours,
  );

  const elapsedSleepMinutes = useMemo(() => {
    if (!sommeilEnCours?.heureDebut) return 0;
    const start = toDate(sommeilEnCours.heureDebut);
    return Math.max(
      0,
      Math.round((currentTime.getTime() - start.getTime()) / 60000),
    );
  }, [sommeilEnCours, currentTime, toDate]);

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
    summary: string;
    timeSince?: string;
    lastTime?: string;
    items: StatItem[];
  } => {
    const totalCount = todayStats.meals.total.count;
    const biberonQty = todayStats.meals.biberons.quantity;
    const pompageQty = todayStats.pompages.quantity;

    // Find most recent timestamp across all feeding types
    const timestamps = [
      todayStats.meals.total.lastTimestamp,
      todayStats.pompages.lastTimestamp,
    ].filter((t): t is number => !!t);
    const mostRecent =
      timestamps.length > 0 ? Math.max(...timestamps) : undefined;
    const lastTime =
      mostRecent !== undefined ? formatTime(new Date(mostRecent)) : undefined;

    const summaryParts = [`${totalCount} repas`];
    if (biberonQty > 0) summaryParts.push(`${biberonQty}ml bib.`);
    if (pompageQty > 0) summaryParts.push(`${pompageQty}ml tiré`);

    return {
      summary: summaryParts.join(" • "),
      timeSince: getTimeSince(mostRecent),
      lastTime,
      items: [
        {
          key: "seins",
          label: "Tétées",
          value: todayStats.meals.seins.count,
          unit: "fois",
          icon: "person-breastfeeding",
          color: itemColors.tetee,
          lastTimestamp: todayStats.meals.seins.lastTimestamp,
          onPress: () =>
            openSheet({
              ownerId: headerOwnerId.current,
              formType: "meals",
              mealType: "tetee",
            }),
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
          onPress: () =>
            openSheet({
              ownerId: headerOwnerId.current,
              formType: "meals",
              mealType: "biberon",
            }),
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
          onPress: () =>
            openSheet({
              ownerId: headerOwnerId.current,
              formType: "pumping",
            }),
        },
      ],
    };
  }, [todayStats, getTimeSince, openSheet, formatTime]);

  // Santé Group (Couches + Vitamines + Vaccins)
  const santeGroup = useMemo((): {
    summary: string;
    timeSince?: string;
    lastTime?: string;
    isWarning: boolean;
    items: StatItem[];
  } => {
    const mictionCount = todayStats.mictions.count;
    const selleCount = todayStats.selles.count;
    const vitamineCount = todayStats.vitamines.count;
    const vaccinCount = todayStats.vaccins.count;

    // Check for warnings
    const mictionThresholdMs =
      remindersEnabled && reminderThresholds.mictions > 0
        ? reminderThresholds.mictions * 60 * 60 * 1000
        : null;
    const selleThresholdMs =
      remindersEnabled && reminderThresholds.selles > 0
        ? reminderThresholds.selles * 60 * 60 * 1000
        : null;

    const now = currentTime.getTime();
    const mictionWarning =
      mictionThresholdMs !== null &&
      todayStats.mictions.lastTimestamp &&
      now - todayStats.mictions.lastTimestamp > mictionThresholdMs;
    const selleWarning =
      selleThresholdMs !== null &&
      todayStats.selles.lastTimestamp &&
      now - todayStats.selles.lastTimestamp > selleThresholdMs;

    const isWarning = !!(mictionWarning || selleWarning);

    // Find most recent timestamp
    const timestamps = [
      todayStats.mictions.lastTimestamp,
      todayStats.selles.lastTimestamp,
      todayStats.vitamines.lastTimestamp,
      todayStats.vaccins.lastTimestamp,
    ].filter((t): t is number => !!t);
    const mostRecent =
      timestamps.length > 0 ? Math.max(...timestamps) : undefined;
    const lastTime =
      mostRecent !== undefined ? formatTime(new Date(mostRecent)) : undefined;

    const summaryParts = [
      `${mictionCount + selleCount} change${mictionCount + selleCount > 1 ? "s" : ""}`,
    ];
    if (vitamineCount > 0) summaryParts.push(`${vitamineCount} vit.`);
    if (vaccinCount > 0) summaryParts.push(`${vaccinCount} vacc.`);

    return {
      summary: summaryParts.join(" • "),
      timeSince: getTimeSince(mostRecent),
      lastTime,
      isWarning,
      items: [
        {
          key: "mictions",
          label: "Pipis",
          value: mictionCount,
          unit: "fois",
          icon: "droplet",
          color: itemColors.miction,
          lastTimestamp: todayStats.mictions.lastTimestamp,
          onPress: () =>
            openSheet({
              ownerId: headerOwnerId.current,
              formType: "diapers",
              diapersType: "miction",
            }),
        },
        {
          key: "selles",
          label: "Selles",
          value: selleCount,
          unit: "fois",
          icon: "poop",
          color: itemColors.selle,
          lastTimestamp: todayStats.selles.lastTimestamp,
          onPress: () =>
            openSheet({
              ownerId: headerOwnerId.current,
              formType: "diapers",
              diapersType: "selle",
            }),
        },
        {
          key: "vitamines",
          label: "Vitamines",
          value: vitamineCount,
          unit: vitamineCount > 1 ? "prises" : "prise",
          icon: "pills",
          color: itemColors.vitamine,
          lastTimestamp: todayStats.vitamines.lastTimestamp,
          onPress: () =>
            openSheet({
              ownerId: headerOwnerId.current,
              formType: "soins",
              soinsType: "vitamine",
            }),
        },
        {
          key: "vaccins",
          label: "Vaccins",
          value: vaccinCount,
          unit: vaccinCount > 1 ? "reçus" : "reçu",
          icon: "syringe",
          color: itemColors.vaccin,
          lastTimestamp: todayStats.vaccins.lastTimestamp,
          onPress: () =>
            openSheet({
              ownerId: headerOwnerId.current,
              formType: "soins",
              soinsType: "vaccin",
            }),
        },
      ],
    };
  }, [
    todayStats,
    getTimeSince,
    openSheet,
    formatTime,
    remindersEnabled,
    reminderThresholds.mictions,
    reminderThresholds.selles,
    currentTime,
  ]);

  const handleStartSleep = useCallback(
    async (isNap: boolean) => {
      if (!activeChild?.id || sommeilEnCours) return;
      try {
        await ajouterSommeil(activeChild.id, {
          heureDebut: new Date(),
          isNap,
        });
      } catch (error) {
        console.error("Erreur démarrage sommeil:", error);
        showToast("Impossible de démarrer le sommeil");
      }
    },
    [activeChild?.id, sommeilEnCours, showToast],
  );

  const handleStopSleep = useCallback(async () => {
    if (!activeChild?.id || !sommeilEnCours?.id) return;
    try {
      const fin = new Date();
      const start = toDate(sommeilEnCours.heureDebut);
      const duree = Math.max(
        0,
        Math.round((fin.getTime() - start.getTime()) / 60000),
      );
      await modifierSommeil(activeChild.id, sommeilEnCours.id, {
        heureFin: fin,
        duree,
      });
      // Open the form sheet to edit the completed sleep
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
          heureFin: fin,
          isNap: sommeilEnCours.isNap,
          location: sommeilEnCours.lieu,
          quality: sommeilEnCours.qualite,
          note: sommeilEnCours.note,
          duree,
        },
      });
    } catch (error) {
      console.error("Erreur arrêt sommeil:", error);
      showToast("Impossible d'arrêter le sommeil");
    }
  }, [activeChild?.id, sommeilEnCours, showToast, toDate, openSheet]);

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
    const mictionThresholdHours = reminderThresholds.mictions || 0;
    const selleThresholdHours = reminderThresholds.selles || 0;
    const mictionThresholdMs =
      mictionThresholdHours > 0 ? mictionThresholdHours * 60 * 60 * 1000 : null;
    const selleThresholdMs =
      selleThresholdHours > 0 ? selleThresholdHours * 60 * 60 * 1000 : null;

    const mictionTs = todayStats.mictions.lastTimestamp;
    const selleTs = todayStats.selles.lastTimestamp;
    const mictionExceeded =
      remindersEnabled &&
      mictionThresholdMs !== null &&
      !!mictionTs &&
      now - mictionTs > mictionThresholdMs;
    const selleExceeded =
      remindersEnabled &&
      selleThresholdMs !== null &&
      !!selleTs &&
      now - selleTs > selleThresholdMs;
    const mictionNotified = mictionTs && warningState.miction === mictionTs;
    const selleNotified = selleTs && warningState.selle === selleTs;
    const mictionHoursLabel = `${mictionThresholdHours}h`;
    const selleHoursLabel = `${selleThresholdHours}h`;

    if (
      mictionExceeded &&
      !mictionNotified &&
      selleExceeded &&
      !selleNotified
    ) {
      showToast(
        `⚠️ Attention: plus de ${mictionHoursLabel} depuis le dernier pipi, ${selleHoursLabel} depuis le dernier popo.`,
        3200,
        "top",
      );
      warningState.miction = mictionTs;
      warningState.selle = selleTs;
      return;
    }

    if (mictionExceeded && !mictionNotified) {
      showToast(
        `⚠️ Attention: plus de ${mictionHoursLabel} depuis le dernier pipi.`,
        3200,
        "top",
      );
      warningState.miction = mictionTs;
    }

    if (selleExceeded && !selleNotified) {
      showToast(
        `⚠️ Attention: plus de ${selleHoursLabel} depuis le dernier popo.`,
        3200,
        "top",
      );
      warningState.selle = selleTs;
    }
  }, [
    activeChild?.id,
    currentTime,
    remindersEnabled,
    reminderThresholds.mictions,
    reminderThresholds.selles,
    todayStats.mictions.lastTimestamp,
    todayStats.selles.lastTimestamp,
    showToast,
  ]);

  const updateHeaderControls = useCallback(
    (
      scrollY: number,
      headerLayout: { y: number; height: number } | null,
      activitiesLayout: { y: number; height: number } | null,
    ) => {
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

      if (activitiesLayout) {
        const threshold = activitiesLayout.y + activitiesLayout.height * 0.5;
        const fadeRange = 70;
        const fadeStart = threshold - fadeRange;
        const progress = Math.max(
          0,
          Math.min(1, (scrollY - fadeStart) / fadeRange),
        );
        headerAddOpacity.setValue(progress);

        const shouldShow = progress > 0.05;
        if (shouldShow !== headerAddVisibleRef.current) {
          headerAddVisibleRef.current = shouldShow;
          setHeaderAddVisible(shouldShow);
        }
      }
    },
    [headerAddOpacity, headerMicOpacity, inlineMicOpacity],
  );

  const handleScroll = useCallback(
    (event: any) => {
      const scrollY = event.nativeEvent.contentOffset.y || 0;
      scrollYRef.current = scrollY;
      updateHeaderControls(
        scrollY,
        headerRowLayoutRef.current,
        activitiesLayoutRef.current,
      );
    },
    [updateHeaderControls],
  );

  useEffect(() => {
    updateHeaderControls(
      scrollYRef.current,
      headerRowLayoutRef.current,
      activitiesLayoutRef.current,
    );
  }, [updateHeaderControls]);

  useEffect(() => {
    if (isOpen) return;
    if (!pendingQuickAddRouteRef.current) return;
    const route = pendingQuickAddRouteRef.current;
    pendingQuickAddRouteRef.current = null;
    router.push(route as any);
  }, [isOpen]);

  const handleQuickAddPress = useCallback(
    (route: string) => {
      // Special handling for soins types: open form sheet directly without navigation
      const soinsTypeMatch = route.match(/soins\?type=(\w+)/);
      if (soinsTypeMatch) {
        const soinsType = soinsTypeMatch[1] as
          | "temperature"
          | "medicament"
          | "symptome"
          | "vaccin"
          | "vitamine";
        openSheet({
          ownerId: headerOwnerId.current,
          formType: "soins",
          soinsType,
        });
        return;
      }

      // Special handling for meals types: open form sheet directly without navigation
      const mealsTypeMatch = route.match(/meals\?tab=(\w+)/);
      if (mealsTypeMatch) {
        const tabName = mealsTypeMatch[1];
        // Map tab names to meal types
        const mealTypeMap: Record<string, "tetee" | "biberon" | "solide"> = {
          seins: "tetee",
          tetee: "tetee",
          biberons: "biberon",
          biberon: "biberon",
          solide: "solide",
          solides: "solide",
        };
        const mealType = mealTypeMap[tabName];
        if (mealType) {
          openSheet({
            ownerId: headerOwnerId.current,
            formType: "meals",
            mealType,
          });
          return;
        }
      }

      // Special handling for pumping: open form sheet directly without navigation
      if (route.includes("pumping") && route.includes("openModal=true")) {
        openSheet({
          ownerId: headerOwnerId.current,
          formType: "pumping",
        });
        return;
      }

      // Special handling for activities: open form sheet directly without navigation
      if (route.includes("activities") && route.includes("openModal=true")) {
        openSheet({
          ownerId: headerOwnerId.current,
          formType: "activities",
          activiteType: "tummyTime",
        });
        return;
      }

      // Special handling for milestones: open form sheet directly without navigation
      const milestonesTypeMatch = route.match(/milestones\?type=(\w+)/);
      if (milestonesTypeMatch) {
        const jalonType = milestonesTypeMatch[1] as
          | "dent"
          | "pas"
          | "sourire"
          | "mot"
          | "humeur"
          | "photo"
          | "autre";
        openSheet({
          ownerId: headerOwnerId.current,
          formType: "milestones",
          jalonType,
        });
        return;
      }
      if (route.includes("milestones") && route.includes("openModal=true")) {
        openSheet({
          ownerId: headerOwnerId.current,
          formType: "milestones",
          jalonType: "photo",
        });
        return;
      }

      // Special handling for diapers types: open form sheet directly without navigation
      const diapersTypeMatch = route.match(/diapers\?tab=(\w+)/);
      if (diapersTypeMatch) {
        const tabName = diapersTypeMatch[1];
        const diapersTypeMap: Record<string, "miction" | "selle"> = {
          mictions: "miction",
          miction: "miction",
          selles: "selle",
          selle: "selle",
        };
        const diapersType = diapersTypeMap[tabName];
        if (diapersType) {
          openSheet({
            ownerId: headerOwnerId.current,
            formType: "diapers",
            diapersType,
          });
          return;
        }
      }

      // Special handling for routines: open form sheet directly without navigation
      if (route.includes("routines") && route.includes("openModal=true")) {
        const typeMatch = route.match(/type=(\w+)/);
        const routineType = typeMatch?.[1] as "sommeil" | "bain" | undefined;
        if (routineType === "sommeil") {
          openSheet({
            ownerId: headerOwnerId.current,
            formType: "routines",
            routineType: "sommeil",
            sleepMode: "nap",
            sommeilEnCours,
          });
          return;
        }
        if (routineType === "bain") {
          openSheet({
            ownerId: headerOwnerId.current,
            formType: "routines",
            routineType: "bain",
          });
          return;
        }
      }

      // Special handling for croissance: open form sheet directly without navigation
      if (route.includes("croissance") && route.includes("openModal=true")) {
        openSheet({
          ownerId: headerOwnerId.current,
          formType: "croissance",
        });
        return;
      }

      // Default behavior for other routes
      if (isOpen) {
        pendingQuickAddRouteRef.current = route;
        closeSheet();
        return;
      }
      router.push(route as any);
    },
    [closeSheet, isOpen, openSheet, sommeilEnCours],
  );

  const openQuickAddSheet = useCallback(() => {
    openSheet({
      ownerId: "home-quick-add",
      title: "Ajouter un evenement",
      icon: "plus",
      accentColor: Colors[colorScheme].tint,
      showActions: false,
      onSubmit: () => {},
      snapPoints: ["55%", "75%"],
      children: (
        <View style={styles.quickSheetList}>
          {QUICK_ADD_ACTIONS.map((action) => (
            <TouchableOpacity
              key={action.key}
              style={styles.quickSheetItem}
              onPress={() => handleQuickAddPress(action.route)}
              activeOpacity={0.8}
              accessibilityRole="button"
              accessibilityLabel={`Ajouter ${action.label}`}
            >
              <View style={styles.quickSheetIcon}>
                {action.icon.type === "mc" ? (
                  <MaterialCommunityIcons
                    name={action.icon.name as any}
                    size={18}
                    color={action.icon.color}
                  />
                ) : (
                  <FontAwesome
                    name={action.icon.name as any}
                    size={18}
                    color={action.icon.color}
                  />
                )}
              </View>
              <Text
                style={[
                  styles.quickSheetLabel,
                  { color: Colors[colorScheme].text },
                ]}
              >
                {action.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      ),
    });
  }, [colorScheme, handleQuickAddPress, openSheet]);

  useFocusEffect(
    useCallback(() => {
      const headerButtons = (
        <Animated.View
          style={{
            flexDirection: "row",
            alignItems: "center",
            paddingRight: 16,
          }}
          pointerEvents={headerMicVisible || headerAddVisible ? "auto" : "none"}
        >
          <Animated.View
            style={{
              opacity: headerAddOpacity,
              marginRight: 8,
            }}
            pointerEvents={headerAddVisible ? "auto" : "none"}
          >
            <TouchableOpacity
              onPress={openQuickAddSheet}
              style={styles.headerActionButton}
              activeOpacity={0.8}
            >
              <FontAwesome
                name="plus"
                size={18}
                color={Colors[colorScheme].tint}
              />
            </TouchableOpacity>
          </Animated.View>
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
      headerAddOpacity,
      headerAddVisible,
      headerMicOpacity,
      headerMicVisible,
      openQuickAddSheet,
      setHeaderRight,
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

  useFocusEffect(
    useCallback(() => {
      let isActive = true;

      const loadReminders = async () => {
        try {
          const prefs = await obtenirPreferencesNotifications();
          if (!isActive) return;
          setRemindersEnabled(prefs.reminders?.enabled ?? true);
          setReminderThresholds({
            repas: prefs.reminders?.thresholds?.repas ?? 0,
            pompages: prefs.reminders?.thresholds?.pompages ?? 0,
            mictions: prefs.reminders?.thresholds?.mictions ?? 0,
            selles: prefs.reminders?.thresholds?.selles ?? 0,
            vitamines: prefs.reminders?.thresholds?.vitamines ?? 0,
          });
        } catch {
          if (!isActive) return;
          setRemindersEnabled(true);
        }
      };

      loadReminders();

      return () => {
        isActive = false;
      };
    }, []),
  );

  // ============================================
  // EFFECTS - DATA LISTENERS
  // ============================================

  // Écoute en temps réel de toutes les données
  // Re-subscribe when day changes to get fresh "today" range
  useEffect(() => {
    if (!activeChild?.id) return;

    // Reset loading state on day change to show fresh data
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
    });

    const cached = getTodayEventsCache(activeChild.id);
    if (cached) {
      setData((prev) => ({ ...prev, ...cached }));
      setLoading((prev) => ({
        ...prev,
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
      }));
    }

    const unsubscribe = ecouterEvenementsDuJourHybrid(
      activeChild.id,
      (events) => {
        const todayData = buildTodayEventsData(events);
        setData((prev) => ({ ...prev, ...todayData }));
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
        });
      },
      { waitForServer: true },
    );

    return () => {
      unsubscribe();
    };
  }, [activeChild, currentDay, refreshTick]);

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
    const filterToday = (items: any[]) =>
      items.filter((item) => {
        const itemDate = item.date?.seconds
          ? new Date(item.date.seconds * 1000)
          : new Date(item.date);
        return itemDate >= startOfToday && itemDate < endOfToday;
      });

    // Filtre spécial pour le sommeil : inclure les sessions qui chevauchent aujourd'hui
    // (ex: nuit commencée hier à 21h et terminée aujourd'hui à 6h)
    const filterTodaySleep = (items: any[]) =>
      items.filter((item) => {
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
            (current.date?.seconds || 0) > (latest.date?.seconds || 0)
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
            (current.date?.seconds || 0) > (latest.date?.seconds || 0)
              ? current
              : latest,
          )
        : null;

    // Calculer les statistiques totales pour tous les repas
    const allMeals = [...todayTetees, ...todayBiberons, ...todaySolides];
    const totalMealsQuantity = biberonsQuantity; // Seuls les biberons ont une quantité mesurable
    const lastMealOverall =
      allMeals.length > 0
        ? allMeals.reduce((latest, current) =>
            (current.date?.seconds || 0) > (latest.date?.seconds || 0)
              ? current
              : latest,
          )
        : null;

    // Calculer les statistiques pour les pompages
    const pompagesQuantity = todayPompages.reduce(
      (sum, p) => sum + ((p.quantiteDroite || 0) + (p.quantiteGauche || 0)),
      0,
    );
    const lastPompage =
      todayPompages.length > 0
        ? todayPompages.reduce((latest, current) =>
            (current.date?.seconds || 0) > (latest.date?.seconds || 0)
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
            (current.date?.seconds || 0) > (latest.date?.seconds || 0)
              ? current
              : latest,
          )
        : null;

    // Calculer les dernières activités
    const lastMiction =
      todayMictions.length > 0
        ? todayMictions.reduce((latest, current) =>
            (current.date?.seconds || 0) > (latest.date?.seconds || 0)
              ? current
              : latest,
          )
        : null;

    const lastSelle =
      todaySelles.length > 0
        ? todaySelles.reduce((latest, current) =>
            (current.date?.seconds || 0) > (latest.date?.seconds || 0)
              ? current
              : latest,
          )
        : null;

    const lastVitamine =
      todayVitamines.length > 0
        ? todayVitamines.reduce((latest, current) =>
            (current.date?.seconds || 0) > (latest.date?.seconds || 0)
              ? current
              : latest,
          )
        : null;

    const lastVaccin =
      todayVaccins.length > 0
        ? todayVaccins.reduce((latest, current) =>
            (current.date?.seconds || 0) > (latest.date?.seconds || 0)
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
      },
      selles: {
        count: todaySelles.length,
        lastTime: formatTime(lastSelle),
        lastTimestamp: getTimestamp(lastSelle),
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
  }, [data, toDate]);

  // ============================================
  // HELPERS - UI
  // ============================================

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return "Bonjour";
    if (hour < 18) return "Bon après-midi";
    return "Bonsoir";
  };

  // ============================================
  // RENDER
  // ============================================

  // Loading state - show spinner until data is ready
  if (!isDataLoaded) {
    return (
      <View style={styles.loadingContainer}>
        <IconPulseDots color={categoryColors.alimentation.primary} />
        <Text style={styles.loadingText}>Chargement...</Text>
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      showsVerticalScrollIndicator={false}
      onScroll={handleScroll}
      scrollEventThrottle={16}
    >
      {/* Bannière de migration */}
      {activeChild?.id && <MigrationBanner childId={activeChild.id} />}

      {/* En-tête avec salutation */}
      <View
        style={{
          marginBottom: 8,
          flexDirection: "row",
          justifyContent: "space-between",
          alignItems: "center",
          marginRight: 50,
        }}
        onLayout={(event) => {
          const { y, height } = event.nativeEvent.layout;
          headerRowLayoutRef.current = { y, height };
          updateHeaderControls(
            scrollYRef.current,
            { y, height },
            activitiesLayoutRef.current,
          );
        }}
      >
        <View style={styles.header}>
          <Text style={styles.greeting}>{getGreeting()}</Text>
          <Text style={styles.date}>
            {new Date().toLocaleDateString("fr-FR", {
              weekday: "long",
              day: "numeric",
              month: "long",
            })}
          </Text>
        </View>
        <Animated.View style={{ paddingTop: 10, opacity: inlineMicOpacity }}>
          <VoiceCommandButton
            size={40}
            color={Colors[colorScheme].tint}
            showTestToggle={false}
          />
        </Animated.View>
      </View>

      {/* Résumé du jour */}
      <View style={styles.section}>
        <View>
          <Text style={styles.sectionTitle}>{`Résumé d'aujourd'hui`}</Text>
        </View>

        {/* Alimentation Group */}
        <View style={styles.statsGroupContainer}>
          <StatsGroup
            title="Alimentation"
            icon="utensils"
            color={categoryColors.alimentation.primary}
            backgroundColor={categoryColors.alimentation.background}
            borderColor={categoryColors.alimentation.border}
            summary={alimentationGroup.summary}
            lastActivity={alimentationGroup.lastTime}
            timeSince={alimentationGroup.timeSince}
            items={alimentationGroup.items}
            currentTime={currentTime}
            onAddPress={() =>
              openSheet({
                ownerId: headerOwnerId.current,
                formType: "meals",
                mealType: "tetee",
              })
            }
            onHeaderPress={() =>
              router.push("/baby/stats?tab=tetees&returnTo=home" as any)
            }
          />
        </View>

        {/* Santé Group (Couches + Vitamines + Vaccins) */}
        <View
          style={styles.statsGroupContainer}
          onLayout={(event) => {
            const { y, height } = event.nativeEvent.layout;
            activitiesLayoutRef.current = { y, height };
            updateHeaderControls(
              scrollYRef.current,
              headerRowLayoutRef.current,
              {
                y,
                height,
              },
            );
          }}
        >
          <StatsGroup
            title="Santé & Hygiène"
            icon="heart-pulse"
            color={categoryColors.sante.primary}
            backgroundColor={categoryColors.sante.background}
            borderColor={categoryColors.sante.border}
            summary={santeGroup.summary}
            lastActivity={santeGroup.lastTime}
            timeSince={santeGroup.timeSince}
            isWarning={santeGroup.isWarning}
            items={santeGroup.items}
            currentTime={currentTime}
            onAddPress={() =>
              openSheet({
                ownerId: headerOwnerId.current,
                formType: "diapers",
                diapersType: "miction",
              })
            }
          />
        </View>

        {/* Sommeil Section */}
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
          />
        </View>

        {/* Humeur & Jalons - Bloc unifié 2 colonnes */}
        <View style={styles.statsGroupContainer}>
          <View style={styles.moodJalonsCard}>
            {/* Section Humeur */}
            <View style={styles.moodJalonsSection}>
              <Text style={styles.moodJalonsLabel}>Humeur du jour</Text>
              <View style={styles.moodEmojisRow}>
                {Object.entries(MOOD_EMOJIS).map(([key, emoji]) => {
                  const moodValue = Number(key) as 1 | 2 | 3 | 4 | 5;
                  const isSelected = todayMoodEvent?.humeur === moodValue;
                  const isCurrentlySaving = isMoodSaving && isSelected;
                  return (
                    <TouchableOpacity
                      key={key}
                      style={[
                        styles.moodEmojiButton,
                        isSelected && styles.moodEmojiSelected,
                      ]}
                      onPress={() => handleSetMood(moodValue)}
                      disabled={isMoodSaving}
                      activeOpacity={0.7}
                      accessibilityLabel={`Humeur ${moodValue} sur 5`}
                      accessibilityState={{ selected: isSelected }}
                    >
                      {isCurrentlySaving ? (
                        <ActivityIndicator
                          size="small"
                          color={categoryColors.moments.primary}
                        />
                      ) : (
                        <Text style={styles.moodEmojiText}>{emoji}</Text>
                      )}
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>

            {/* Séparateur vertical */}
            <View style={styles.moodJalonsDivider} />

            {/* Section Jalons */}
            <TouchableOpacity
              style={styles.jalonsSection}
              onPress={() => router.push("/baby/moments" as any)}
              activeOpacity={0.7}
            >
              <Text style={styles.jalonsLabel}>Jalons</Text>
              <View style={styles.jalonsValueRow}>
                {todayJalons.length > 0 ? (
                  <Text style={styles.jalonsSummary}>{todayJalons.length}</Text>
                ) : (
                  <>
                    <FontAwesome
                      name="star"
                      size={16}
                      color={categoryColors.moments.primary}
                    />
                    <Text style={styles.jalonsEmptyText}>Ajouter</Text>
                  </>
                )}
                <FontAwesome
                  name="chevron-right"
                  size={12}
                  color={neutralColors.textMuted}
                  style={styles.jalonsChevron}
                />
              </View>
            </TouchableOpacity>
          </View>
        </View>
      </View>

      {/* Chronologie récente */}
      <View>
        <RecentEventsList
          events={recentEvents}
          showHint={showRecentHint}
          colorScheme={colorScheme}
          currentTime={currentTime}
          onEventLongPress={handleEventEdit}
          onViewAllPress={() => router.push("/baby/chrono" as any)}
          toDate={toDate}
          formatTime={formatTime}
          formatDuration={formatDuration}
          buildDetails={buildDetails}
          getDayLabel={getDayLabel}
        />
      </View>
    </ScrollView>
  );
}

// ============================================
// STYLES
// ============================================

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: neutralColors.background,
  },
  loadingContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: neutralColors.background,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    color: neutralColors.textLight,
  },
  header: {
    padding: 20,
    paddingBottom: 10,
  },
  headerActionButton: {
    padding: 6,
  },
  greeting: {
    fontSize: 28,
    fontWeight: "700",
    color: neutralColors.textStrong,
    marginBottom: 4,
  },
  date: {
    fontSize: 16,
    color: neutralColors.textLight,
    textTransform: "capitalize",
  },
  section: {
    marginBottom: 8,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: "600",
    color: neutralColors.textStrong,
    marginHorizontal: 20,
    marginBottom: 16,
  },
  sectionTitleInline: {
    marginHorizontal: 0,
    marginBottom: 0,
  },
  quickSheetList: {
    gap: 10,
    paddingBottom: 8,
  },
  quickSheetItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 12,
    backgroundColor: neutralColors.backgroundPressed,
    borderWidth: 1,
    borderColor: neutralColors.border,
  },
  quickSheetIcon: {
    width: 28,
    height: 28,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: neutralColors.backgroundCard,
  },
  quickSheetLabel: {
    fontSize: 15,
    fontWeight: "600",
  },
  statsGrid: {
    flexDirection: "row",
    paddingHorizontal: 20,
    gap: 12,
    marginBottom: 12,
  },
  statsGroupContainer: {
    paddingHorizontal: 20,
    marginBottom: 12,
  },
  statsButton: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: neutralColors.backgroundCard,
    marginHorizontal: 20,
    padding: 16,
    borderRadius: 12,
    gap: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  statsButtonText: {
    flex: 1,
    fontSize: 16,
    color: neutralColors.textNormal,
    fontWeight: "500",
  },
  // Mood & Jalons unified card styles
  moodJalonsCard: {
    backgroundColor: categoryColors.moments.background,
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: categoryColors.moments.border,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
    flexDirection: "row",
    alignItems: "flex-start",
  },
  moodJalonsSection: {
    flex: 7,
    paddingVertical: 2,
    paddingRight: 10,
  },
  moodJalonsDivider: {
    width: 1,
    alignSelf: "stretch",
    backgroundColor: categoryColors.moments.border,
  },
  moodJalonsLabel: {
    marginBottom: 6,
    fontSize: 13,
    fontWeight: "600",
    color: neutralColors.textLight,
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
    backgroundColor: neutralColors.backgroundCard,
  },
  moodEmojiSelected: {
    backgroundColor: `${categoryColors.moments.primary}20`,
    borderWidth: 2,
    borderColor: categoryColors.moments.primary,
  },
  moodEmojiText: {
    fontSize: 22,
  },
  jalonsSection: {
    flex: 3,
    paddingVertical: 2,
    paddingHorizontal: 12,
    alignItems: "center",
  },
  jalonsLabel: {
    marginBottom: 6,
    fontSize: 13,
    fontWeight: "600",
    color: neutralColors.textLight,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  jalonsValueRow: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  jalonsSummary: {
    fontSize: 18,
    fontWeight: "700",
    color: neutralColors.textStrong,
  },
  jalonsEmptyText: {
    fontSize: 13,
    fontWeight: "600",
    color: categoryColors.moments.primary,
    marginTop: 4,
  },
  jalonsChevron: {
    marginTop: 4,
  },
});
