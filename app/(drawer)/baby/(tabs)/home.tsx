import { MigrationBanner } from "@/components/migration";
import {
  MoodCard,
  RecentEventsList,
  SleepWidget,
  StatsCard,
  StatsCardSkeleton,
} from "@/components/suivibaby/dashboard";
import { VoiceCommandButton } from "@/components/suivibaby/VoiceCommandButton";
import { MOOD_EMOJIS, QUICK_ADD_ACTIONS } from "@/constants/dashboardConfig";
import { eventColors } from "@/constants/eventColors";
import { Colors } from "@/constants/theme";
import { useBaby } from "@/contexts/BabyContext";
import { useSheet } from "@/contexts/SheetContext";
import { useToast } from "@/contexts/ToastContext";
import { useColorScheme } from "@/hooks/use-color-scheme";
import {
  ajouterJalon,
  ajouterSommeil,
  modifierJalon,
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
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Animated,
  AppState,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useHeaderRight } from "../../_layout";

// ============================================
// TYPES
// ============================================

interface DashboardData {
  tetees: any[];
  biberons: any[];
  pompages: any[];
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
// COMPONENT
// ============================================

export default function HomeDashboard() {
  const { activeChild } = useBaby();
  const { setHeaderRight } = useHeaderRight();
  const colorScheme = useColorScheme() ?? "light";
  const headerOwnerId = useRef(`home-${Math.random().toString(36).slice(2)}`);
  const { openSheet, closeSheet, isOpen } = useSheet();
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

  // États des données
  const [data, setData] = useState<DashboardData>({
    tetees: [],
    biberons: [],
    pompages: [],
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
    pompages: true,
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

  const buildDetails = useCallback((event: any) => {
    switch (event.type) {
      case "biberon":
        return event.quantite ? `${event.quantite} ml` : undefined;
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
        const parts = [
          event.duree ? `${event.duree} min` : null,
          event.description,
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
  }, [formatDuration, toDate]);

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
    const cutoff = new Date(currentTime.getTime() - 24 * 60 * 60 * 1000);
    const merged = [
      ...data.tetees,
      ...data.biberons,
      ...data.pompages,
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
      .slice(0, 10);
  }, [
    data.biberons,
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

  const lastJalon = useMemo(() => {
    if (todayJalons.length === 0) return null;
    return todayJalons.reduce((latest, current) =>
      toDate(current.date).getTime() > toDate(latest.date).getTime()
        ? current
        : latest,
    );
  }, [todayJalons, toDate]);

  const handleSetMood = useCallback(
    async (value: 1 | 2 | 3 | 4 | 5) => {
      if (!activeChild?.id || isMoodSaving) return;
      try {
        setIsMoodSaving(true);
        const now = new Date();
        const dataToSave = {
          date: now,
          typeJalon: "humeur" as const,
          humeur: value,
          titre: "Humeur du jour",
        };
        let moodId = todayMoodEvent?.id ?? null;
        if (moodId) {
          await modifierJalon(activeChild.id, moodId, dataToSave);
        } else {
          moodId = await ajouterJalon(activeChild.id, dataToSave);
        }

        if (!moodId) {
          showToast("Impossible d'enregistrer l'humeur.");
        }
      } catch {
        showToast("Impossible d'enregistrer l'humeur.");
      } finally {
        setIsMoodSaving(false);
      }
    },
    [activeChild?.id, isMoodSaving, todayMoodEvent, showToast],
  );
  const sommeilEnCours = useMemo(() => {
    return data.sommeils.find((item) => !item.heureFin && item.heureDebut);
  }, [data.sommeils]);

  const elapsedSleepMinutes = useMemo(() => {
    if (!sommeilEnCours?.heureDebut) return 0;
    const start = toDate(sommeilEnCours.heureDebut);
    return Math.max(
      0,
      Math.round((currentTime.getTime() - start.getTime()) / 60000),
    );
  }, [sommeilEnCours, currentTime, toDate]);

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
      const encodedId = encodeURIComponent(sommeilEnCours.id);
      router.push(`/baby/routines?editId=${encodedId}&returnTo=home` as any);
    } catch (error) {
      console.error("Erreur arrêt sommeil:", error);
      showToast("Impossible d'arrêter le sommeil");
    }
  }, [activeChild?.id, sommeilEnCours, showToast, toDate]);

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
      if (isOpen) {
        pendingQuickAddRouteRef.current = route;
        closeSheet();
        return;
      }
      router.push(route as any);
    },
    [closeSheet, isOpen],
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
      pompages: true,
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
        pompages: false,
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
          pompages: false,
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
  }, [activeChild, currentDay]);

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

    const todayTetees = filterToday(data.tetees);
    const todayBiberons = filterToday(data.biberons);
    const todayPompages = filterToday(data.pompages);
    const todaySommeils = filterToday(data.sommeils);
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
    const allMeals = [...todayTetees, ...todayBiberons];
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

    const totalSleepMinutes = todaySommeils.reduce((sum, item) => {
      if (item.duree) return sum + item.duree;
      const start = item.heureDebut
        ? toDate(item.heureDebut)
        : toDate(item.date);
      const end = item.heureFin ? toDate(item.heureFin) : new Date();
      return (
        sum + Math.max(0, Math.round((end.getTime() - start.getTime()) / 60000))
      );
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
        <Text style={styles.sectionTitle}>{`Résumé d'aujourd'hui`}</Text>

        {/* Repas & Pompages - Vue d'ensemble */}
        <View style={styles.statsGrid}>
          {loading.tetees ? (
            <StatsCardSkeleton />
          ) : (
            <StatsCard
              title="Alimentation"
              value={todayStats.meals.total.count}
              unit="repas"
              icon="baby"
              color="#4A90E2"
              lastActivity={todayStats.meals.total.lastTime}
              lastTimestamp={todayStats.meals.total.lastTimestamp}
              onPress={() =>
                router.push("/baby/stats?tab=tetees&returnTo=home" as any)
              }
              remindersEnabled={remindersEnabled}
              reminderThreshold={reminderThresholds.repas}
              currentTime={currentTime}
            />
          )}

          {loading.pompages ? (
            <StatsCardSkeleton />
          ) : (
            <StatsCard
              title="Pompages"
              value={`${todayStats.pompages.count} • ${todayStats.pompages.quantity}`}
              unit="ml"
              icon="pump-medical"
              color="#28a745"
              lastActivity={todayStats.pompages.lastTime}
              lastTimestamp={todayStats.pompages.lastTimestamp}
              onPress={() =>
                router.push("/baby/pumping?openModal=true&returnTo=home" as any)
              }
              remindersEnabled={remindersEnabled}
              reminderThreshold={reminderThresholds.pompages}
              currentTime={currentTime}
            />
          )}
        </View>

        <View style={styles.statsGrid}>
          {loading.sommeils ? (
            <StatsCardSkeleton />
          ) : (
            <StatsCard
              title="Sommeil"
              value={formatDuration(todayStats.sommeil.totalMinutes)}
              unit=""
              icon="bed"
              color="#6f42c1"
              lastActivity={todayStats.sommeil.lastTime}
              lastTimestamp={todayStats.sommeil.lastTimestamp}
              onPress={() =>
                router.push(
                  "/baby/routines?type=sommeil&openModal=true&returnTo=home" as any,
                )
              }
              addEvent={true}
            />
          )}
          {loading.sommeils ? (
            <StatsCardSkeleton />
          ) : (
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
          )}
        </View>

        <View style={styles.statsGrid}>
          {loading.jalons ? (
            <StatsCardSkeleton />
          ) : (
            <MoodCard
              currentMood={todayMoodEvent?.humeur ?? null}
              onSelectMood={handleSetMood}
              isLoading={isMoodSaving}
            />
          )}
          {loading.jalons ? (
            <StatsCardSkeleton />
          ) : (
            <StatsCard
              title="Jalons"
              value={todayJalons.length}
              unit={todayJalons.length > 1 ? "moments" : "moment"}
              icon="star"
              color={eventColors.jalon.dark}
              lastActivity={
                lastJalon ? formatTime(toDate(lastJalon.date)) : undefined
              }
              lastTimestamp={
                lastJalon ? toDate(lastJalon.date).getTime() : undefined
              }
              onPress={() =>
                router.push("/baby/milestones?returnTo=home" as any)
              }
              addEvent={true}
            />
          )}
        </View>

        {/* Repas - Détail par type */}
        <View style={styles.statsGrid}>
          {loading.tetees || loading.biberons ? (
            <>
              <StatsCardSkeleton />
              <StatsCardSkeleton />
            </>
          ) : (
            <>
              <StatsCard
                title="Seins"
                value={todayStats.meals.seins.count}
                unit={todayStats.meals.seins.count > 1 ? "fois" : "fois"}
                icon="person-breastfeeding"
                color="#E91E63"
                lastActivity={todayStats.meals.seins.lastTime}
                lastTimestamp={todayStats.meals.seins.lastTimestamp}
                onPress={() =>
                  router.push(
                    "/baby/meals?tab=seins&openModal=true&returnTo=home" as any,
                  )
                }
                addEvent={true}
              />
              <StatsCard
                title="Biberons"
                value={`${todayStats.meals.biberons.count} • ${todayStats.meals.biberons.quantity}ml`}
                unit=""
                icon="jar-wheat"
                color="#FF5722"
                lastActivity={todayStats.meals.biberons.lastTime}
                lastTimestamp={todayStats.meals.biberons.lastTimestamp}
                onPress={() =>
                  router.push(
                    "/baby/meals?tab=biberons&openModal=true&returnTo=home" as any,
                  )
                }
                addEvent={true}
              />
            </>
          )}
        </View>

        {/* Immunité et soins */}
        <View style={styles.statsGrid}>
          {loading.vitamines ? (
            <StatsCardSkeleton />
          ) : (
            <StatsCard
              title="Vitamines"
              value={todayStats.vitamines.count}
              unit={todayStats.vitamines.count > 1 ? "prises" : "prise"}
              icon="pills"
              color="#FF9800"
              lastActivity={todayStats.vitamines.lastTime}
              lastTimestamp={todayStats.vitamines.lastTimestamp}
              onPress={() =>
                router.push(
                  "/baby/soins?type=vitamine&openModal=true&returnTo=home" as any,
                )
              }
              addEvent={true}
            />
          )}
          {loading.vaccins ? (
            <StatsCardSkeleton />
          ) : (
            <StatsCard
              title="Vaccins"
              value={todayStats.vaccins.count}
              unit={todayStats.vaccins.count > 1 ? "reçus" : "reçu"}
              icon="syringe"
              color="#9C27B0"
              lastActivity={todayStats.vaccins.lastTime}
              lastTimestamp={todayStats.vaccins.lastTimestamp}
              onPress={() =>
                router.push(
                  "/baby/soins?type=vaccin&openModal=true&returnTo=home" as any,
                )
              }
              addEvent={true}
            />
          )}
        </View>
      </View>

      {/* Activités physiologiques */}
      <View
        style={styles.section}
        onLayout={(event) => {
          const { y, height } = event.nativeEvent.layout;
          activitiesLayoutRef.current = { y, height };
          updateHeaderControls(scrollYRef.current, headerRowLayoutRef.current, {
            y,
            height,
          });
        }}
      >
        <Text style={styles.sectionTitle}>Activités physiologiques</Text>
        <View style={styles.statsGrid}>
          {loading.mictions ? (
            <StatsCardSkeleton />
          ) : (
            <StatsCard
              title="Mictions"
              value={todayStats.mictions.count}
              unit="fois"
              icon="water"
              color="#17a2b8"
              lastActivity={todayStats.mictions.lastTime}
              lastTimestamp={todayStats.mictions.lastTimestamp}
              onPress={() =>
                router.push(
                  "/baby/diapers?tab=mictions&openModal=true&returnTo=home" as any,
                )
              }
              remindersEnabled={remindersEnabled}
              reminderThreshold={reminderThresholds.mictions}
              currentTime={currentTime}
            />
          )}
          {loading.selles ? (
            <StatsCardSkeleton />
          ) : (
            <StatsCard
              title="Selles"
              value={todayStats.selles.count}
              unit="fois"
              icon="poop"
              color="#dc3545"
              lastActivity={todayStats.selles.lastTime}
              lastTimestamp={todayStats.selles.lastTimestamp}
              onPress={() =>
                router.push(
                  "/baby/diapers?tab=selles&openModal=true&returnTo=home" as any,
                )
              }
              remindersEnabled={remindersEnabled}
              reminderThreshold={reminderThresholds.selles}
              currentTime={currentTime}
            />
          )}
        </View>
      </View>

      {/* Chronologie récente */}
      <RecentEventsList
        events={recentEvents}
        loading={
          loading.tetees &&
          loading.biberons &&
          loading.pompages &&
          loading.mictions &&
          loading.selles &&
          loading.vitamines &&
          loading.vaccins &&
          loading.sommeils &&
          loading.temperatures &&
          loading.medicaments &&
          loading.symptomes &&
          loading.jalons
        }
        showHint={showRecentHint}
        colorScheme={colorScheme}
        currentTime={currentTime}
        onEventLongPress={(event) => {
          const route = getEditRoute(event);
          if (route) router.push(route as any);
        }}
        onViewAllPress={() => router.push("/baby/chrono" as any)}
        toDate={toDate}
        formatTime={formatTime}
        formatDuration={formatDuration}
        buildDetails={buildDetails}
        getDayLabel={getDayLabel}
      />
    </ScrollView>
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
    color: "#212529",
    marginBottom: 4,
  },
  date: {
    fontSize: 16,
    color: "#6c757d",
    textTransform: "capitalize",
  },
  section: {
    marginBottom: 8,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: "600",
    color: "#212529",
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
    backgroundColor: "#f5f6f8",
    borderWidth: 1,
    borderColor: "#e4e7eb",
  },
  quickSheetIcon: {
    width: 28,
    height: 28,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#ffffff",
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
  statsButton: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "white",
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
    color: "#495057",
    fontWeight: "500",
  },
});
