import { MigrationBanner } from "@/components/migration";
import { VoiceCommandButton } from "@/components/suivibaby/VoiceCommandButton";
import { Colors } from "@/constants/theme";
import { useBaby } from "@/contexts/BabyContext";
import { useToast } from "@/contexts/ToastContext";
import { useColorScheme } from "@/hooks/use-color-scheme";
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
  ActivityIndicator,
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
  mictions: any[];
  selles: any[];
  vitamines: any[];
  vaccins: any[];
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
  const [headerMicVisible, setHeaderMicVisible] = useState(false);
  const headerMicVisibleRef = useRef(false);
  const headerRowLayoutRef = useRef<{ y: number; height: number } | null>(null);
  const scrollYRef = useRef(0);

  // États des données
  const [data, setData] = useState<DashboardData>({
    tetees: [],
    biberons: [],
    pompages: [],
    mictions: [],
    selles: [],
    vitamines: [],
    vaccins: [],
  });

  const [todayStats, setTodayStats] = useState<TodayStats>({
    meals: {
      total: { count: 0, quantity: 0 },
      seins: { count: 0 },
      biberons: { count: 0, quantity: 0 },
    },
    pompages: { count: 0, quantity: 0 },
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
  const [loading, setLoading] = useState({
    tetees: true,
    biberons: true,
    pompages: true,
    mictions: true,
    selles: true,
    vitamines: true,
    vaccins: true,
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

  const buildDetails = useCallback((event: any) => {
    switch (event.type) {
      case "biberon":
        return event.quantite ? `${event.quantite} ml` : undefined;
      case "tetee": {
        const left = event.dureeGauche ? `G ${event.dureeGauche}m` : null;
        const right = event.dureeDroite ? `D ${event.dureeDroite}m` : null;
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
      case "vaccin":
        return event.nomVaccin || "Vaccin";
      default:
        return undefined;
    }
  }, []);

  const EVENT_CONFIG: Record<
    string,
    { label: string; icon: { lib: "fa6" | "mci"; name: string }; color: string }
  > = {
    tetee: {
      label: "Tétée",
      icon: { lib: "fa6", name: "person-breastfeeding" },
      color: "#E91E63",
    },
    biberon: {
      label: "Biberon",
      icon: { lib: "mci", name: "baby-bottle" },
      color: "#FF5722",
    },
    pompage: {
      label: "Pompage",
      icon: { lib: "fa6", name: "pump-medical" },
      color: "#28a745",
    },
    miction: {
      label: "Miction",
      icon: { lib: "fa6", name: "water" },
      color: "#17a2b8",
    },
    selle: {
      label: "Selle",
      icon: { lib: "fa6", name: "poop" },
      color: "#dc3545",
    },
    vitamine: {
      label: "Vitamine",
      icon: { lib: "fa6", name: "pills" },
      color: "#FF9800",
    },
    vaccin: {
      label: "Vaccin",
      icon: { lib: "fa6", name: "syringe" },
      color: "#9C27B0",
    },
  };

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
      case "miction":
        return `/baby/diapers?tab=mictions&editId=${id}&returnTo=home`;
      case "selle":
        return `/baby/diapers?tab=selles&editId=${id}&returnTo=home`;
      case "vaccin":
        return `/baby/immunizations?tab=vaccins&editId=${id}&returnTo=home`;
      case "vitamine":
        return `/baby/immunizations?tab=vitamines&editId=${id}&returnTo=home`;
      default:
        return null;
    }
  }

  const renderEventIcon = useCallback(
    (config: { lib: "fa6" | "mci"; name: string }, color: string) => {
      if (config.lib === "mci") {
        return (
          <MaterialCommunityIcons
            name={config.name as any}
            size={14}
            color={color}
          />
        );
      }
      return <FontAwesome name={config.name as any} size={14} color={color} />;
    },
    [],
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
    const cutoff = new Date(currentTime.getTime() - 24 * 60 * 60 * 1000);
    const merged = [
      ...data.tetees,
      ...data.biberons,
      ...data.pompages,
      ...data.mictions,
      ...data.selles,
      ...data.vitamines,
      ...data.vaccins,
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
    data.selles,
    data.tetees,
    data.vaccins,
    data.vitamines,
    currentTime,
    toDate,
  ]);

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

  const updateHeaderMicVisibility = useCallback(
    (scrollY: number, layout: { y: number; height: number }) => {
      const threshold = layout.y + layout.height - 8;
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
    },
    [headerMicOpacity, inlineMicOpacity],
  );

  const handleScroll = useCallback(
    (event: any) => {
      const scrollY = event.nativeEvent.contentOffset.y || 0;
      scrollYRef.current = scrollY;
      const layout = headerRowLayoutRef.current;
      if (!layout) return;
      updateHeaderMicVisibility(scrollY, layout);
    },
    [updateHeaderMicVisibility],
  );

  useEffect(() => {
    const layout = headerRowLayoutRef.current;
    if (!layout) return;
    updateHeaderMicVisibility(scrollYRef.current, layout);
  }, [updateHeaderMicVisibility]);

  useFocusEffect(
    useCallback(() => {
      const headerButtons = (
        <Animated.View
          style={{
            flexDirection: "row",
            alignItems: "center",
            paddingRight: 16,
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
      );

      setHeaderRight(headerButtons, headerOwnerId.current);

      return () => {
        setHeaderRight(null, headerOwnerId.current);
      };
    }, [colorScheme, headerMicOpacity, headerMicVisible, setHeaderRight]),
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
        } catch (error) {
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
      mictions: true,
      selles: true,
      vitamines: true,
      vaccins: true,
    });

    const cached = getTodayEventsCache(activeChild.id);
    if (cached) {
      setData((prev) => ({ ...prev, ...cached }));
      setLoading((prev) => ({
        ...prev,
        tetees: false,
        biberons: false,
        pompages: false,
        mictions: false,
        selles: false,
        vitamines: false,
        vaccins: false,
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
          mictions: false,
          selles: false,
          vitamines: false,
          vaccins: false,
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
      if (!item?.date?.seconds) return undefined;
      return new Date(item.date.seconds * 1000).toLocaleTimeString("fr-FR", {
        hour: "2-digit",
        minute: "2-digit",
      });
    };

    const getTimestamp = (item: any) => {
      if (!item?.date?.seconds) return undefined;
      return item.date.seconds * 1000;
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
  }, [data]);

  // ============================================
  // HELPERS - UI
  // ============================================

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return "Bonjour";
    if (hour < 18) return "Bon après-midi";
    return "Bonsoir";
  };

  const getTimeSinceLastActivity = (lastTimestamp?: number) => {
    if (!lastTimestamp || isNaN(lastTimestamp)) return null;

    const now = new Date(currentTime.getTime());
    const actionTime = new Date(lastTimestamp);

    const nowTotalMinutes = Math.floor(now.getTime() / (1000 * 60));
    const actionTotalMinutes = Math.floor(actionTime.getTime() / (1000 * 60));

    const diffMinutes = nowTotalMinutes - actionTotalMinutes;

    if (diffMinutes < 0) return null;

    if (diffMinutes === 0) {
      return "à l'instant";
    }

    const diffHours = Math.floor(diffMinutes / 60);
    const remainingMinutes = diffMinutes % 60;

    if (diffHours > 0) {
      return `il y a ${diffHours}h${
        remainingMinutes > 0 ? ` ${remainingMinutes}min` : ""
      }`;
    }

    return `il y a ${diffMinutes}min`;
  };

  // ============================================
  // COMPONENTS - CARDS
  // ============================================

  const StatsCard = ({
    title,
    value,
    unit,
    icon,
    color,
    lastActivity,
    lastTimestamp,
    onPress,
    addEvent,
  }: any) => {
    const lastSessionDate = currentTime.getTime() - (lastTimestamp || 0);
    const thresholdHours =
      title === "Alimentation"
        ? reminderThresholds.repas
        : title === "Pompages"
          ? reminderThresholds.pompages
          : title === "Mictions"
            ? reminderThresholds.mictions
            : title === "Selles"
              ? reminderThresholds.selles
              : null;
    const warnThreshold =
      remindersEnabled && thresholdHours && thresholdHours > 0
        ? thresholdHours * 60 * 60 * 1000
        : null;

    return (
      <TouchableOpacity
        activeOpacity={0.7}
        onPress={onPress}
        style={styles.statsCard}
      >
        <View style={styles.statsHeader}>
          {title === "Biberons" ? (
            <MaterialCommunityIcons
              name="baby-bottle"
              size={20}
              color={color}
            />
          ) : (
            <FontAwesome name={icon} size={20} color={color} />
          )}
          <Text style={styles.statsTitle}>{title}</Text>
          {/* {addEvent && (
            <FontAwesome
              name="plus"
              size={18}
              color={Colors[colorScheme].tabIconDefault}
              style={{ marginLeft: "auto" }}
            />
          )} */}
        </View>
        <Text style={[styles.statsValue, { color }]}>
          {value} {unit}
        </Text>
        {lastActivity && (
          <Text style={styles.statsLastActivity}>
            Dernière fois: {lastActivity}
          </Text>
        )}
        {lastTimestamp &&
        warnThreshold !== null &&
        lastSessionDate > warnThreshold ? (
          <Text style={[styles.statsTimeSince, { color: "#dc3545" }]}>
            {/* {"⚠️ "}{getTimeSinceLastActivity(lastTimestamp)} */}
            {getTimeSinceLastActivity(lastTimestamp)}
          </Text>
        ) : (
          lastTimestamp && (
            <Text style={styles.statsTimeSince}>
              {getTimeSinceLastActivity(lastTimestamp)}
            </Text>
          )
        )}
      </TouchableOpacity>
    );
  };

  const LoadingCard = () => (
    <View style={styles.statsCard}>
      <View style={[styles.statsHeader, { opacity: 0.5 }]}>
        <View
          style={{
            width: 20,
            height: 20,
            backgroundColor: "#e9ecef",
            borderRadius: 10,
          }}
        />
        <View
          style={{
            width: 60,
            height: 12,
            backgroundColor: "#e9ecef",
            borderRadius: 6,
          }}
        />
      </View>
      <View
        style={{
          alignItems: "center",
          justifyContent: "center",
          paddingVertical: 10,
        }}
      >
        <ActivityIndicator size="small" color="#6c757d" />
      </View>
    </View>
  );

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
          updateHeaderMicVisibility(scrollYRef.current, { y, height });
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
            <LoadingCard />
          ) : (
            <StatsCard
              title="Alimentation"
              value={todayStats.meals.total.count}
              unit="repas"
              icon="baby"
              color="#4A90E2"
              lastActivity={todayStats.meals.total.lastTime}
              lastTimestamp={todayStats.meals.total.lastTimestamp}
              onPress={() => router.push("/baby/meals" as any)}
            />
          )}

          {loading.pompages ? (
            <LoadingCard />
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
              addEvent={true}
            />
          )}
        </View>

        {/* Repas - Détail par type */}
        <View style={styles.statsGrid}>
          {loading.tetees || loading.biberons ? (
            <>
              <LoadingCard />
              <LoadingCard />
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
            <LoadingCard />
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
                  "/baby/immunizations?tab=vitamines&openModal=true&returnTo=home" as any,
                )
              }
              addEvent={true}
            />
          )}
          {loading.vaccins ? (
            <LoadingCard />
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
                  "/baby/immunizations?tab=vaccins&openModal=true&returnTo=home" as any,
                )
              }
              addEvent={true}
            />
          )}
        </View>
      </View>

      {/* Activités physiologiques */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Activités physiologiques</Text>
        <View style={styles.statsGrid}>
          {loading.mictions ? (
            <LoadingCard />
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
              addEvent={true}
            />
          )}
          {loading.selles ? (
            <LoadingCard />
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
              addEvent={true}
            />
          )}
        </View>
      </View>

      {/* Chronologie récente */}
      <View style={styles.section}>
        <View style={styles.sectionHeaderRow}>
          <Text style={[styles.sectionTitle, styles.sectionTitleInline]}>
            Évènements récents
          </Text>
          <TouchableOpacity
            onPress={() => router.push("/baby/chrono" as any)}
            activeOpacity={0.8}
          >
            <Text style={styles.sectionLink}>Voir tout</Text>
          </TouchableOpacity>
        </View>
        {showRecentHint && recentEvents.length > 0 && (
          <Text style={styles.recentHint}>
            Maintenir un événement pour le modifier
          </Text>
        )}

        {loading.tetees &&
        loading.biberons &&
        loading.pompages &&
        loading.mictions &&
        loading.selles &&
        loading.vitamines &&
        loading.vaccins ? (
          <View style={styles.recentLoading}>
            <ActivityIndicator size="small" color={Colors[colorScheme].tint} />
            <Text style={styles.recentLoadingText}>Chargement...</Text>
          </View>
        ) : recentEvents.length === 0 ? (
          <Text style={styles.recentEmpty}>
            Aucun événement aujourd&apos;hui.
          </Text>
        ) : (
          recentEvents.map((event, index) => {
            const config = EVENT_CONFIG[event.type] || {
              label: event.type,
              icon: { lib: "fa6", name: "circle" },
              color: Colors[colorScheme].tint,
            };
            const date = toDate(event.date);
            const details = buildDetails(event);
            const borderColor = `${Colors[colorScheme].tabIconDefault}30`;

            // Check if we need to show a day separator
            const currentDayLabel = getDayLabel(date);
            const prevEvent = index > 0 ? recentEvents[index - 1] : null;
            const prevDayLabel = prevEvent
              ? getDayLabel(toDate(prevEvent.date))
              : null;
            const showDaySeparator =
              currentDayLabel !== "Aujourd'hui" &&
              (index === 0 || currentDayLabel !== prevDayLabel);

            return (
              <React.Fragment key={event.id ?? `${event.type}-${event.date}`}>
                {showDaySeparator && (
                  <View style={styles.daySeparator}>
                    <View
                      style={[
                        styles.daySeparatorLine,
                        { backgroundColor: borderColor },
                      ]}
                    />
                    <Text
                      style={[
                        styles.daySeparatorText,
                        { color: Colors[colorScheme].tabIconDefault },
                      ]}
                    >
                      {currentDayLabel}
                    </Text>
                    <View
                      style={[
                        styles.daySeparatorLine,
                        { backgroundColor: borderColor },
                      ]}
                    />
                  </View>
                )}
                <TouchableOpacity
                  style={styles.recentRow}
                  activeOpacity={0.85}
                  onLongPress={() => {
                    const route = getEditRoute(event);
                    if (route) router.push(route as any);
                  }}
                >
                  <View style={styles.recentTimelineColumn}>
                    <View
                      style={[
                        styles.recentDot,
                        { backgroundColor: config.color },
                      ]}
                    />
                    <View
                      style={[
                        styles.recentLine,
                        { backgroundColor: borderColor },
                        index === recentEvents.length - 1 &&
                          styles.recentLineLast,
                      ]}
                    />
                  </View>
                  <Text
                    style={[
                      styles.recentTimeLeft,
                      { color: Colors[colorScheme].tabIconDefault },
                    ]}
                  >
                    {formatTime(date)}
                  </Text>
                  <View
                    style={[
                      styles.recentCard,
                      {
                        borderColor,
                        backgroundColor: Colors[colorScheme].background,
                      },
                    ]}
                  >
                    <View style={styles.recentTitleRow}>
                      {renderEventIcon(config.icon, config.color)}
                      <Text
                        style={[
                          styles.recentTitle,
                          { color: Colors[colorScheme].text },
                        ]}
                      >
                        {config.label}
                      </Text>
                      {/* <FontAwesome
                        name="pen-to-square"
                        size={14}
                        color={Colors[colorScheme].tabIconDefault}
                        style={{ marginLeft: "auto" }}
                      /> */}
                    </View>
                    {details ? (
                      <Text
                        style={[
                          styles.recentDetails,
                          { color: Colors[colorScheme].tabIconDefault },
                        ]}
                      >
                        {details}
                      </Text>
                    ) : null}
                  </View>
                </TouchableOpacity>
              </React.Fragment>
            );
          })
        )}
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
    backgroundColor: "#f8f9fa",
  },
  header: {
    padding: 20,
    paddingBottom: 10,
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
  sectionHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginHorizontal: 20,
    marginBottom: 16,
  },
  sectionLink: {
    fontSize: 13,
    fontWeight: "600",
    color: "#0a7ea4",
  },
  statsGrid: {
    flexDirection: "row",
    paddingHorizontal: 20,
    gap: 12,
    marginBottom: 12,
  },
  recentLoading: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginHorizontal: 20,
  },
  recentLoadingText: {
    fontSize: 13,
    color: "#6c757d",
  },
  recentEmpty: {
    fontSize: 13,
    color: "#6c757d",
    marginHorizontal: 20,
  },
  recentRow: {
    flexDirection: "row",
    gap: 12,
    marginBottom: 14,
    marginHorizontal: 20,
  },
  recentTimelineColumn: {
    width: 20,
    alignItems: "center",
  },
  recentDot: {
    width: 10,
    height: 10,
    borderRadius: 999,
    marginTop: 6,
  },
  recentLine: {
    width: 2,
    flex: 1,
    marginTop: 4,
  },
  recentLineLast: {
    backgroundColor: "transparent",
  },
  recentCard: {
    flex: 1,
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 1,
  },
  recentHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  recentHint: {
    marginTop: -2,
    marginBottom: 8,
    marginHorizontal: 20,
    fontSize: 12,
    color: "#9aa0a6",
    fontWeight: "500",
  },
  recentTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    // justifyContent: "space-between",
    gap: 8,
  },
  recentTitle: {
    fontSize: 15,
    fontWeight: "700",
  },
  recentTime: {
    fontSize: 12,
    fontWeight: "600",
  },
  recentTimeLeft: {
    fontSize: 12,
    fontWeight: "600",
    width: 42,
    marginTop: 6,
  },
  recentDetails: {
    marginTop: 6,
    fontSize: 12,
  },
  daySeparator: {
    flexDirection: "row",
    alignItems: "center",
    marginHorizontal: 20,
    marginBottom: 14,
    gap: 12,
  },
  daySeparatorLine: {
    flex: 1,
    height: 1,
  },
  daySeparatorText: {
    fontSize: 13,
    fontWeight: "600",
    textTransform: "capitalize",
  },
  statsCard: {
    flex: 1,
    backgroundColor: "white",
    padding: 16,
    borderRadius: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  statsHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 8,
    gap: 8,
  },
  statsTitle: {
    fontSize: 14,
    color: "#6c757d",
    fontWeight: "500",
  },
  statsValue: {
    fontSize: 24,
    fontWeight: "700",
    marginBottom: 4,
  },
  statsLastActivity: {
    fontSize: 12,
    color: "#6c757d",
  },
  statsTimeSince: {
    fontSize: 11,
    color: "#28a745",
    fontWeight: "500",
  },
  quickActionsContainer: {
    paddingHorizontal: 20,
    gap: 12,
  },
  quickActionCard: {
    backgroundColor: "white",
    padding: 16,
    borderRadius: 12,
    borderLeftWidth: 4,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  quickActionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  quickActionContent: {
    flex: 1,
  },
  quickActionTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: "#212529",
    marginBottom: 2,
  },
  quickActionSubtitle: {
    fontSize: 13,
    color: "#6c757d",
  },
  badge: {
    minWidth: 24,
    height: 24,
    borderRadius: 12,
    justifyContent: "center",
    alignItems: "center",
  },
  badgeText: {
    color: "white",
    fontSize: 12,
    fontWeight: "600",
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
