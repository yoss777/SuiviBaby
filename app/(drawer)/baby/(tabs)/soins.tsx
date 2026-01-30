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
import { useColorScheme } from "@/hooks/use-color-scheme";
import {
  ajouterMedicament,
  ajouterSymptome,
  ajouterTemperature,
  ajouterVaccin,
  ajouterVitamine,
  modifierMedicament,
  modifierSymptome,
  modifierTemperature,
  modifierVaccin,
  modifierVitamine,
  supprimerMedicament,
  supprimerSymptome,
  supprimerTemperature,
  supprimerVaccin,
  supprimerVitamine,
} from "@/migration/eventsDoubleWriteService";
import {
  ecouterMedicamentsHybrid,
  ecouterSymptomesHybrid,
  ecouterTemperaturesHybrid,
  ecouterVaccinsHybrid,
  ecouterVitaminesHybrid,
  getNextEventDateBeforeHybrid,
  hasMoreEventsBeforeHybrid,
} from "@/migration/eventsHybridService";
import { normalizeQuery } from "@/utils/text";
import { Ionicons } from "@expo/vector-icons";
import FontAwesome5 from "@expo/vector-icons/FontAwesome5";
import FontAwesome from "@expo/vector-icons/FontAwesome6";
import DateTimePicker from "@react-native-community/datetimepicker";
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
  View,
} from "react-native";
import { Calendar, DateData } from "react-native-calendars";
import { SafeAreaView } from "react-native-safe-area-context";
import { useHeaderLeft, useHeaderRight } from "../../_layout";

// ============================================
// TYPES
// ============================================
type HealthType =
  | "temperature"
  | "medicament"
  | "symptome"
  | "vaccin"
  | "vitamine";
type FilterType = "today" | "past";
type SheetStep = "form" | "vaccinPicker" | "vitaminePicker";

type HealthEvent = {
  id: string;
  type: HealthType;
  date: { seconds: number } | Date;
  createdAt?: { seconds: number } | Date;
  note?: string;
  valeur?: number;
  modePrise?: "rectale" | "axillaire" | "auriculaire" | "frontale" | "autre";
  nomMedicament?: string;
  dosage?: string;
  voie?: "orale" | "topique" | "inhalation" | "autre";
  symptomes?: string[];
  intensite?: "leger" | "modere" | "fort";
  nomVaccin?: string;
  nomVitamine?: string;
};

type HealthGroup = {
  date: string;
  events: HealthEvent[];
  counts: Record<HealthType, number>;
  lastEvent: HealthEvent;
};

const TYPE_CONFIG: Record<
  HealthType,
  { label: string; color: string; icon: string }
> = {
  temperature: {
    label: "Température",
    color: eventColors.temperature.dark,
    icon: "temperature-half",
  },
  medicament: {
    label: "Médicament",
    color: eventColors.medicament.dark,
    icon: "pills",
  },
  symptome: {
    label: "Symptôme",
    color: eventColors.symptome.dark,
    icon: "virus",
  },
  vaccin: {
    label: "Vaccin",
    color: eventColors.vaccin.dark,
    icon: "syringe",
  },
  vitamine: {
    label: "Vitamine",
    color: eventColors.vitamine.dark,
    icon: "pills",
  },
};

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

const VITAMINES_LIST = ["Vitamine D", "Vitamine K", "Autre vitamine"];

const MODE_TEMPERATURE = [
  "rectale",
  "axillaire",
  "auriculaire",
  "frontale",
  "autre",
];
const VOIES_MEDICAMENT = ["orale", "topique", "inhalation", "autre"];
const INTENSITES = ["leger", "modere", "fort"];
const SYMPTOMES_OPTIONS = [
  "fièvre",
  "toux",
  "nez bouché",
  "vomis",
  "diarrhée",
  "dents",
  "autre",
];

// ============================================
// HELPERS
// ============================================
const toDate = (value: any): Date => {
  if (!value) return new Date();
  if (value?.seconds) return new Date(value.seconds * 1000);
  if (value?.toDate) return value.toDate();
  if (value instanceof Date) return value;
  return new Date(value);
};

const formatDateKey = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;

const formatDayLabel = (date: Date) =>
  date.toLocaleDateString("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });

const formatTime = (date: Date) =>
  date.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });

const formatTemperature = (value?: number) =>
  typeof value === "number" ? `${value}°C` : "";

const getVaccinDisplay = (nomVaccin: string, dosage?: string | null) =>
  dosage ? `${nomVaccin} - ${dosage}` : nomVaccin;

// ============================================
// COMPONENT
// ============================================

export default function SoinsScreen() {
  const { activeChild } = useBaby();
  const { setHeaderRight } = useHeaderRight();
  const { setHeaderLeft } = useHeaderLeft();
  const colorScheme = useColorScheme() ?? "light";
  const colors = Colors[colorScheme];
  const { openSheet, closeSheet, viewProps, isOpen } = useSheet();
  const { showAlert } = useModal();
  const navigation = useNavigation();
  const headerOwnerId = useRef(`soins-${Math.random().toString(36).slice(2)}`);

  const { openModal, editId, returnTo, type } = useLocalSearchParams();
  const sheetOwnerId = "soins";
  const isSheetActive = viewProps?.ownerId === sheetOwnerId;

  const [showCalendar, setShowCalendar] = useState(false);
  const [selectedFilter, setSelectedFilter] = useState<FilterType | null>(null);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [selectedType, setSelectedType] = useState<HealthType>("temperature");
  const [sheetStep, setSheetStep] = useState<SheetStep>("form");
  const [searchQuery, setSearchQuery] = useState("");
  const [layoutReady, setLayoutReady] = useState(false);
  const [pendingOpen, setPendingOpen] = useState(false);
  const [pendingMode, setPendingMode] = useState<"add" | "edit" | null>(null);

  const [events, setEvents] = useState<HealthEvent[]>([]);
  const [groupedEvents, setGroupedEvents] = useState<HealthGroup[]>([]);
  const [expandedDays, setExpandedDays] = useState<Set<string>>(new Set());
  const [loaded, setLoaded] = useState({
    temperature: false,
    medicament: false,
    symptome: false,
    vaccin: false,
    vitamine: false,
  });
  const [emptyDelayDone, setEmptyDelayDone] = useState(false);
  const [daysWindow, setDaysWindow] = useState(14);
  const [rangeEndDate, setRangeEndDate] = useState<Date | null>(null);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [autoLoadMore, setAutoLoadMore] = useState(false);
  const [autoLoadMoreAttempts, setAutoLoadMoreAttempts] = useState(0);
  const loadMoreVersionRef = useRef(0);
  const pendingLoadMoreRef = useRef(0);

  const [editingEvent, setEditingEvent] = useState<HealthEvent | null>(null);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [dateHeure, setDateHeure] = useState<Date>(new Date());
  const [showDate, setShowDate] = useState(false);
  const [showTime, setShowTime] = useState(false);

  const [temperatureValue, setTemperatureValue] = useState(36.8);
  const [temperatureMode, setTemperatureMode] =
    useState<HealthEvent["modePrise"]>();
  const [medicamentName, setMedicamentName] = useState("");
  const [medicamentDosage, setMedicamentDosage] = useState("");
  const [medicamentVoie, setMedicamentVoie] = useState<HealthEvent["voie"]>();
  const [symptomes, setSymptomes] = useState<string[]>([]);
  const [symptomeAutre, setSymptomeAutre] = useState("");
  const [symptomeIntensite, setSymptomeIntensite] =
    useState<HealthEvent["intensite"]>();
  const [vaccinName, setVaccinName] = useState("");
  const [vaccinDosage, setVaccinDosage] = useState("");
  const [vaccinCustomName, setVaccinCustomName] = useState("");
  const [vitamineName, setVitamineName] = useState("Vitamine D");
  const [vitamineDosage, setVitamineDosage] = useState("");
  const [vitamineCustomName, setVitamineCustomName] = useState("");
  const [gouttesCount, setGouttesCount] = useState(3);
  const [note, setNote] = useState("");

  const editIdRef = useRef<string | null>(null);
  const returnToRef = useRef<string | null>(null);
  const intervalRef = useRef<number | undefined>(undefined);
  const pendingTypeRef = useRef<HealthType | null>(null);

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

  const maybeReturnTo = useCallback((targetOverride?: string | null) => {
    const target = targetOverride ?? returnToRef.current;
    returnToRef.current = null;
    if (target === "home") {
      router.replace("/baby/home");
    } else if (target === "chrono" || target === "journal") {
      router.replace("/baby/chrono");
    }
  }, []);

  const handlePressIn = useCallback((action: () => void) => {
    if (intervalRef.current !== undefined) {
      clearInterval(intervalRef.current);
      intervalRef.current = undefined;
    }
    action();

    let speed = 200;
    const accelerate = () => {
      action();
      if (speed > 50) {
        speed -= 20;
        if (intervalRef.current !== undefined) {
          clearInterval(intervalRef.current);
        }
        intervalRef.current = setInterval(accelerate, speed);
      }
    };

    intervalRef.current = setInterval(accelerate, speed);
  }, []);

  const handlePressOut = useCallback(() => {
    if (intervalRef.current !== undefined) {
      clearInterval(intervalRef.current);
      intervalRef.current = undefined;
    }
  }, []);

  const filteredVaccins = useMemo(
    () =>
      VACCINS_LIST.filter((vaccin) =>
        normalizeQuery(vaccin.nomVaccin).includes(normalizeQuery(searchQuery)),
      ),
    [searchQuery],
  );

  const filteredVitamines = useMemo(
    () =>
      VITAMINES_LIST.filter((vitamine) =>
        normalizeQuery(vitamine).includes(normalizeQuery(searchQuery)),
      ),
    [searchQuery],
  );

  // ============================================
  // HEADER
  // ============================================
  const handleCalendarPress = useCallback(() => {
    setShowCalendar((prev) => {
      const nextValue = !prev;
      if (nextValue) {
        const today = new Date();
        setSelectedDate(formatDateKey(today));
        setSelectedFilter(null);
      }
      return nextValue;
    });
  }, []);

  const applyTodayFilter = useCallback(() => {
    const todayKey = formatDateKey(new Date());
    setSelectedFilter("today");
    setSelectedDate(null);
    setShowCalendar(false);
    setExpandedDays(new Set([todayKey]));
  }, []);

  useFocusEffect(
    useCallback(() => {
      const headerButtons = (
        <View style={styles.headerButtons}>
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
          <Pressable
            onPress={() => {
              setPendingMode("add");
              setPendingOpen(true);
            }}
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
    }, [handleCalendarPress, showCalendar, colorScheme, setHeaderRight]),
  );

  useFocusEffect(
    useCallback(() => {
      const backButton = (
        <HeaderBackButton
          onPress={() => {
            const target = normalizeParam(returnTo) ?? returnToRef.current;
            if (target === "home") {
              router.replace("/baby/home");
              return;
            }
            if (target === "chrono" || target === "journal") {
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
    }, [colorScheme, returnTo, setHeaderLeft]),
  );

  useFocusEffect(
    useCallback(() => {
      const onBackPress = () => {
        if (isOpen) {
          closeSheet();
          return true;
        }
        const target = normalizeParam(returnTo) ?? returnToRef.current;
        if (target === "home") {
          router.replace("/baby/home");
          return true;
        }
        if (target === "chrono" || target === "journal") {
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
    }, [closeSheet, isOpen, returnTo]),
  );

  // ============================================
  // DATA LISTENERS
  // ============================================
  useEffect(() => {
    if (!activeChild?.id) return;
    const versionAtSubscribe = loadMoreVersionRef.current;
    const endOfRange = rangeEndDate ? new Date(rangeEndDate) : new Date();
    endOfRange.setHours(23, 59, 59, 999);
    const startOfRange = new Date(endOfRange);
    startOfRange.setHours(0, 0, 0, 0);
    startOfRange.setDate(startOfRange.getDate() - (daysWindow - 1));

    let temperaturesData: HealthEvent[] = [];
    let medicamentsData: HealthEvent[] = [];
    let symptomesData: HealthEvent[] = [];
    let vaccinsData: HealthEvent[] = [];
    let vitaminesData: HealthEvent[] = [];

    const merge = () => {
      const merged = [
        ...temperaturesData,
        ...medicamentsData,
        ...symptomesData,
        ...vaccinsData,
        ...vitaminesData,
      ].sort((a, b) => toDate(b.date).getTime() - toDate(a.date).getTime());
      setEvents(merged);

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

    const unsubscribeTemperatures = ecouterTemperaturesHybrid(
      activeChild.id,
      (data) => {
        temperaturesData = data as HealthEvent[];
        setLoaded((prev) => ({ ...prev, temperature: true }));
        merge();
      },
      { waitForServer: true, depuis: startOfRange, jusqu: endOfRange },
    );
    const unsubscribeMedicaments = ecouterMedicamentsHybrid(
      activeChild.id,
      (data) => {
        medicamentsData = data as HealthEvent[];
        setLoaded((prev) => ({ ...prev, medicament: true }));
        merge();
      },
      { waitForServer: true, depuis: startOfRange, jusqu: endOfRange },
    );
    const unsubscribeSymptomes = ecouterSymptomesHybrid(
      activeChild.id,
      (data) => {
        symptomesData = data as HealthEvent[];
        setLoaded((prev) => ({ ...prev, symptome: true }));
        merge();
      },
      { waitForServer: true, depuis: startOfRange, jusqu: endOfRange },
    );
    const unsubscribeVaccins = ecouterVaccinsHybrid(
      activeChild.id,
      (data) => {
        vaccinsData = data as HealthEvent[];
        setLoaded((prev) => ({ ...prev, vaccin: true }));
        merge();
      },
      { waitForServer: true, depuis: startOfRange, jusqu: endOfRange },
    );
    const unsubscribeVitamines = ecouterVitaminesHybrid(
      activeChild.id,
      (data) => {
        vitaminesData = data as HealthEvent[];
        setLoaded((prev) => ({ ...prev, vitamine: true }));
        merge();
      },
      { waitForServer: true, depuis: startOfRange, jusqu: endOfRange },
    );

    return () => {
      unsubscribeTemperatures();
      unsubscribeMedicaments();
      unsubscribeSymptomes();
      unsubscribeVaccins();
      unsubscribeVitamines();
    };
  }, [activeChild?.id, daysWindow, rangeEndDate]);

  useEffect(() => {
    if (!activeChild?.id) return;
    setEvents([]);
    setGroupedEvents([]);
    setLoaded({
      temperature: false,
      medicament: false,
      symptome: false,
      vaccin: false,
      vitamine: false,
    });
    setEmptyDelayDone(false);
    setDaysWindow(14);
    setRangeEndDate(null);
    setIsLoadingMore(false);
    setHasMore(true);
    setExpandedDays(new Set());
    loadMoreVersionRef.current = 0;
    pendingLoadMoreRef.current = 0;
  }, [activeChild?.id]);

  useEffect(() => {
    if (!Object.values(loaded).every(Boolean)) {
      setEmptyDelayDone(false);
      return;
    }
    if (groupedEvents.length > 0) {
      setEmptyDelayDone(true);
      return;
    }
    const timer = setTimeout(() => setEmptyDelayDone(true), 300);
    return () => clearTimeout(timer);
  }, [loaded, groupedEvents.length]);

  useEffect(() => {
    if (!activeChild?.id) return;
    let cancelled = false;
    const endOfRange = rangeEndDate ? new Date(rangeEndDate) : new Date();
    endOfRange.setHours(23, 59, 59, 999);
    const startOfRange = new Date(endOfRange);
    startOfRange.setHours(0, 0, 0, 0);
    startOfRange.setDate(startOfRange.getDate() - (daysWindow - 1));
    const beforeDate = new Date(startOfRange.getTime() - 1);
    const types: HealthType[] = [
      "temperature",
      "medicament",
      "symptome",
      "vaccin",
      "vitamine",
    ];

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
  }, [activeChild?.id, daysWindow, rangeEndDate]);

  // ============================================
  // FILTERS + GROUPING
  // ============================================
  const markedDates = useMemo(() => {
    const marked: Record<string, any> = {};
    events.forEach((item) => {
      const date = toDate(item.date);
      const key = formatDateKey(date);
      marked[key] = {
        ...(marked[key] || {}),
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
  }, [events, selectedDate, colorScheme]);

  const handleDateSelect = (day: DateData) => {
    setSelectedDate(day.dateString);
    setSelectedFilter(null);
    setShowCalendar(false);
    setExpandedDays(new Set([day.dateString]));
  };

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

  useEffect(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayTime = today.getTime();

    const filtered = events.filter((item) => {
      const date = toDate(item.date);
      date.setHours(0, 0, 0, 0);
      const time = date.getTime();

      if (selectedDate) {
        const [year, month, day] = selectedDate.split("-").map(Number);
        const selected = new Date(year, month - 1, day);
        selected.setHours(0, 0, 0, 0);
        return time === selected.getTime();
      }

      if (selectedFilter === "today") return time === todayTime;
      if (selectedFilter === "past") return time < todayTime;
      return true;
    });

    const groups: Record<string, HealthEvent[]> = {};
    filtered.forEach((item) => {
      const date = toDate(item.date);
      const key = formatDateKey(date);
      if (!groups[key]) groups[key] = [];
      groups[key].push(item);
    });

    const grouped = Object.entries(groups)
      .map(([date, items]) => {
        const sorted = items.sort(
          (a, b) => toDate(b.date).getTime() - toDate(a.date).getTime(),
        );
        const counts = {
          temperature: 0,
          medicament: 0,
          symptome: 0,
          vaccin: 0,
          vitamine: 0,
        } as Record<HealthType, number>;
        sorted.forEach((item) => {
          counts[item.type] += 1;
        });
        return {
          date,
          events: sorted,
          counts,
          lastEvent: sorted[0],
        };
      })
      .sort((a, b) => (a.date < b.date ? 1 : -1));

    setGroupedEvents(grouped);
  }, [events, selectedFilter, selectedDate, showCalendar]);

  const loadMoreStep = useCallback(
    async (auto = false) => {
      if (!hasMore || !activeChild?.id) return;
      setIsLoadingMore(true);
      pendingLoadMoreRef.current = 5;
      loadMoreVersionRef.current += 1;

      if (auto && autoLoadMoreAttempts >= MAX_AUTO_LOAD_ATTEMPTS - 1) {
        const endOfRange = rangeEndDate ? new Date(rangeEndDate) : new Date();
        endOfRange.setHours(23, 59, 59, 999);
        const startOfRange = new Date(endOfRange);
        startOfRange.setHours(0, 0, 0, 0);
        startOfRange.setDate(startOfRange.getDate() - (daysWindow - 1));
        const beforeDate = new Date(startOfRange.getTime() - 1);
        const types: HealthType[] = [
          "temperature",
          "medicament",
          "symptome",
          "vaccin",
          "vitamine",
        ];
        const nextEventDate = await getNextEventDateBeforeHybrid(
          activeChild.id,
          types,
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
      Object.values(loaded).every(Boolean) &&
      groupedEvents.length === 0 &&
      hasMore
    ) {
      setAutoLoadMore(true);
      setAutoLoadMoreAttempts(0);
    }
  }, [loaded, groupedEvents.length, hasMore, selectedFilter, selectedDate]);

  useEffect(() => {
    if (!autoLoadMore) return;
    if (!Object.values(loaded).every(Boolean) || isLoadingMore) return;
    if (groupedEvents.length > 0 || !hasMore) {
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
    loaded,
    isLoadingMore,
    groupedEvents.length,
    hasMore,
    autoLoadMoreAttempts,
    loadMoreStep,
  ]);

  // ============================================
  // SHEET LOGIC
  // ============================================
  const resetForm = useCallback((nextType: HealthType = "temperature") => {
    setSelectedType(nextType);
    setSheetStep("form");
    setSearchQuery("");
    setDateHeure(new Date());
    setTemperatureValue(36.8);
    setTemperatureMode(undefined);
    setMedicamentName("");
    setMedicamentDosage("");
    setMedicamentVoie(undefined);
    setSymptomes([]);
    setSymptomeAutre("");
    setSymptomeIntensite(undefined);
    setVaccinName("");
    setVaccinDosage("");
    setVaccinCustomName("");
    setVitamineName(nextType === "vitamine" ? "Vitamine D" : "");
    setVitamineDosage("");
    setVitamineCustomName("");
    setGouttesCount(3);
    setNote("");
    setEditingEvent(null);
  }, []);

  const openEditModal = useCallback((item: HealthEvent) => {
    setEditingEvent(item);
    setSelectedType(item.type);
    setSheetStep("form");
    setSearchQuery("");
    setDateHeure(toDate(item.date));
    setNote(item.note ?? "");
    setIsSubmitting(false);

    if (item.type === "temperature") {
      setTemperatureValue(typeof item.valeur === "number" ? item.valeur : 36.8);
      setTemperatureMode(item.modePrise);
    }
    if (item.type === "medicament") {
      setMedicamentName(item.nomMedicament ?? "");
      setMedicamentDosage(item.dosage ?? "");
      setMedicamentVoie(item.voie);
    }
    if (item.type === "symptome") {
      setSymptomes(Array.isArray(item.symptomes) ? item.symptomes : []);
      setSymptomeIntensite(item.intensite);
    }
    if (item.type === "vaccin") {
      const vaccinLabel = item.nomVaccin ?? "";
      const isKnownVaccin = VACCINS_LIST.some(
        (vaccin) => vaccin.nomVaccin === vaccinLabel,
      );
      if (vaccinLabel && !isKnownVaccin) {
        setVaccinName("Autre vaccin");
        setVaccinCustomName(vaccinLabel);
      } else {
        setVaccinName(vaccinLabel);
        setVaccinCustomName("");
      }
      setVaccinDosage(item.dosage ?? "");
    }
    if (item.type === "vitamine") {
      const vitamineLabel = item.nomVitamine ?? "";
      const isKnownVitamine = VITAMINES_LIST.includes(vitamineLabel);
      if (vitamineLabel && !isKnownVitamine) {
        setVitamineName("Autre vitamine");
        setVitamineCustomName(vitamineLabel);
      } else {
        setVitamineName(vitamineLabel);
        setVitamineCustomName("");
      }
      setVitamineDosage(item.dosage ?? "");
      const match = item.dosage?.match(/(\d+)\s*gouttes?/i);
      if (match) {
        setGouttesCount(parseInt(match[1], 10));
      }
    }

    setPendingMode("edit");
    setPendingOpen(true);
  }, []);

  function buildSheetProps() {
    const returnTarget = normalizeParam(returnTo) ?? returnToRef.current;
    return {
      ownerId: sheetOwnerId,
      title: editingEvent ? "Modifier" : "Nouveau",
      icon: "prescription-bottle",
      accentColor: Colors[colorScheme].tint,
      isEditing: !!editingEvent,
      isSubmitting,
      showActions: sheetStep === "form",
      enablePanDownToClose: sheetStep === "form",
      enableOverDrag: sheetStep === "form",
      onSubmit: handleSubmit,
      onDelete: editingEvent ? () => setShowDeleteModal(true) : undefined,
      children: renderSheetContent(),
      onDismiss: () => {
        setIsSubmitting(false);
        setEditingEvent(null);
        editIdRef.current = null;
        setSheetStep("form");
        setSearchQuery("");
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
    dateHeure,
    selectedType,
    temperatureValue,
    temperatureMode,
    medicamentName,
    medicamentDosage,
    medicamentVoie,
    symptomes,
    symptomeAutre,
    symptomeIntensite,
    vaccinName,
    vaccinDosage,
    vaccinCustomName,
    vitamineName,
    vitamineDosage,
    vitamineCustomName,
    gouttesCount,
    note,
    showDate,
    showTime,
    sheetStep,
    searchQuery,
  ]);

  useFocusEffect(
    useCallback(() => {
      if (openModal !== "true") return;
      const normalizedType = normalizeParam(type);
      pendingTypeRef.current =
        normalizedType &&
        [
          "temperature",
          "medicament",
          "symptome",
          "vaccin",
          "vitamine",
        ].includes(normalizedType)
          ? (normalizedType as HealthType)
          : null;
      setPendingMode("add");
      setPendingOpen(true);
    }, [openModal, type]),
  );

  useEffect(() => {
    if (!pendingOpen || !layoutReady) return;
    const task = InteractionManager.runAfterInteractions(() => {
      stashReturnTo();
      if (pendingMode !== "edit") {
        resetForm(pendingTypeRef.current ?? "temperature");
      }
      openSheet(buildSheetProps());
      navigation.setParams({ openModal: undefined, editId: undefined });
      setPendingOpen(false);
      setPendingMode(null);
      pendingTypeRef.current = null;
    });
    return () => task.cancel?.();
  }, [
    pendingOpen,
    layoutReady,
    pendingMode,
    navigation,
    resetForm,
    stashReturnTo,
    openSheet,
  ]);

  useEffect(() => {
    if (!editId || !layoutReady) return;
    const normalizedId = Array.isArray(editId) ? editId[0] : editId;
    if (!normalizedId || editIdRef.current === normalizedId) return;
    const target = events.find((evt) => evt.id === normalizedId);
    if (!target) return;
    stashReturnTo();
    editIdRef.current = normalizedId;
    openEditModal(target);
    navigation.setParams({ openModal: undefined, editId: undefined });
  }, [editId, layoutReady, events, navigation, openEditModal, stashReturnTo]);

  useEffect(() => {
    return () => {
      if (intervalRef.current !== undefined) {
        clearInterval(intervalRef.current);
        intervalRef.current = undefined;
      }
    };
  }, []);

  // ============================================
  // SUBMIT / DELETE
  // ============================================
  const handleSubmit = async () => {
    if (!activeChild?.id || isSubmitting) return;
    try {
      setIsSubmitting(true);
      const common = {
        date: dateHeure,
        note: note.trim() ? note.trim() : undefined,
      };

      if (selectedType === "temperature") {
        const valeur = Number(temperatureValue);
        if (Number.isNaN(valeur) || valeur < 34 || valeur > 45) {
          showAlert("Erreur", "Indiquez une température valide.");
          return;
        }
        if (editingEvent) {
          await modifierTemperature(activeChild.id, editingEvent.id, {
            ...common,
            valeur,
            modePrise: temperatureMode,
          });
        } else {
          await ajouterTemperature(activeChild.id, {
            ...common,
            valeur,
            modePrise: temperatureMode,
          });
        }
      }

      if (selectedType === "medicament") {
        if (!medicamentName.trim()) {
          showAlert("Erreur", "Indiquez un médicament.");
          return;
        }
        if (editingEvent) {
          await modifierMedicament(activeChild.id, editingEvent.id, {
            ...common,
            nomMedicament: medicamentName.trim(),
            dosage: medicamentDosage.trim() || undefined,
            voie: medicamentVoie,
          });
        } else {
          await ajouterMedicament(activeChild.id, {
            ...common,
            nomMedicament: medicamentName.trim(),
            dosage: medicamentDosage.trim() || undefined,
            voie: medicamentVoie,
          });
        }
      }

      if (selectedType === "symptome") {
        const list = [...symptomes];
        if (symptomeAutre.trim()) list.push(symptomeAutre.trim());
        if (list.length === 0) {
          showAlert("Erreur", "Sélectionnez au moins un symptôme.");
          return;
        }
        if (editingEvent) {
          await modifierSymptome(activeChild.id, editingEvent.id, {
            ...common,
            symptomes: list,
            intensite: symptomeIntensite,
          });
        } else {
          await ajouterSymptome(activeChild.id, {
            ...common,
            symptomes: list,
            intensite: symptomeIntensite,
          });
        }
      }

      if (selectedType === "vaccin") {
        const normalizedVaccinName =
          vaccinName === "Autre vaccin" ? vaccinCustomName : vaccinName;
        if (!normalizedVaccinName.trim()) {
          showAlert("Erreur", "Indiquez un vaccin.");
          return;
        }
        const finalDosage =
          vaccinName === "Autre vaccin"
            ? vaccinDosage.trim() || undefined
            : vaccinDosage.trim() || undefined;
        if (editingEvent) {
          await modifierVaccin(activeChild.id, editingEvent.id, {
            ...common,
            nomVaccin: normalizedVaccinName.trim(),
            dosage: finalDosage,
          });
        } else {
          await ajouterVaccin(activeChild.id, {
            ...common,
            nomVaccin: normalizedVaccinName.trim(),
            dosage: finalDosage,
          });
        }
      }

      if (selectedType === "vitamine") {
        const normalizedVitamineName =
          vitamineName === "Autre vitamine" ? vitamineCustomName : vitamineName;
        if (!normalizedVitamineName.trim()) {
          showAlert("Erreur", "Indiquez une vitamine.");
          return;
        }
        const computedDosage =
          vitamineName === "Vitamine D" || vitamineName === "Vitamine K"
            ? `${gouttesCount} gouttes`
            : vitamineDosage.trim() || undefined;
        if (editingEvent) {
          await modifierVitamine(activeChild.id, editingEvent.id, {
            ...common,
            nomVitamine: normalizedVitamineName.trim(),
            dosage: computedDosage,
          });
        } else {
          await ajouterVitamine(activeChild.id, {
            ...common,
            nomVitamine: normalizedVitamineName.trim(),
            dosage: computedDosage,
          });
        }
      }

      closeSheet();
    } catch (error) {
      console.error("Erreur lors de la sauvegarde:", error);
      showAlert("Erreur", "Impossible de sauvegarder.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const confirmDelete = async () => {
    if (!editingEvent || !activeChild?.id || isSubmitting) return;
    try {
      setIsSubmitting(true);
      if (editingEvent.type === "temperature") {
        await supprimerTemperature(activeChild.id, editingEvent.id);
      } else if (editingEvent.type === "medicament") {
        await supprimerMedicament(activeChild.id, editingEvent.id);
      } else if (editingEvent.type === "symptome") {
        await supprimerSymptome(activeChild.id, editingEvent.id);
      } else if (editingEvent.type === "vaccin") {
        await supprimerVaccin(activeChild.id, editingEvent.id);
      } else if (editingEvent.type === "vitamine") {
        await supprimerVitamine(activeChild.id, editingEvent.id);
      }
      closeSheet();
    } catch (error) {
      console.error("Erreur suppression:", error);
      showAlert("Erreur", "Impossible de supprimer.");
    } finally {
      setIsSubmitting(false);
      setShowDeleteModal(false);
    }
  };

  const renderSheetContent = () => {
    if (sheetStep === "vaccinPicker") {
      return (
        <>
          <View style={styles.sheetBreadcrumb}>
            <Pressable
              style={styles.sheetBackButton}
              onPress={() => setSheetStep("form")}
            >
              <FontAwesome5 name="chevron-left" size={14} color="#666" />
              <Text style={styles.sheetBackText}>Retour</Text>
            </Pressable>
            <Text style={styles.sheetBreadcrumbText}>
              Soins / Vaccins / Choisir
            </Text>
          </View>
          <View style={styles.searchContainer}>
            <FontAwesome5
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
                <FontAwesome5 name="times-circle" size={16} color="#999" />
              </TouchableOpacity>
            )}
          </View>
          <View style={styles.vaccinList}>
            {filteredVaccins.length > 0 ? (
              filteredVaccins.map((vaccin, index) => {
                const vaccinNameDisplay = getVaccinDisplay(
                  vaccin.nomVaccin,
                  vaccin.dosage,
                );
                const isSelected =
                  vaccinName === vaccin.nomVaccin &&
                  (vaccinDosage || "") === (vaccin.dosage ?? "");
                return (
                  <TouchableOpacity
                    key={`${vaccin.nomVaccin}-${index}`}
                    style={[
                      styles.vaccinListItem,
                      isSelected && {
                        backgroundColor: Colors[colorScheme].tint + "20",
                      },
                    ]}
                    onPress={() => {
                      setVaccinName(vaccin.nomVaccin);
                      setVaccinDosage(vaccin.dosage ?? "");
                      if (vaccin.nomVaccin !== "Autre vaccin") {
                        setVaccinCustomName("");
                      }
                      setSheetStep("form");
                      setSearchQuery("");
                    }}
                    activeOpacity={0.7}
                  >
                    <FontAwesome5
                      name="syringe"
                      size={16}
                      color={isSelected ? Colors[colorScheme].tint : "#666"}
                      style={styles.vaccinListItemIcon}
                    />
                    <View style={styles.vaccinListItemTextWrap}>
                      <Text
                        style={[
                          styles.vaccinListItemText,
                          isSelected && { color: "#000000" },
                          isSelected && styles.vaccinListItemTextSelected,
                        ]}
                      >
                        {vaccin.nomVaccin}
                      </Text>
                      {!!vaccin.dosage && (
                        <Text style={styles.vaccinListItemSubtext}>
                          Dose : {vaccin.dosage}
                        </Text>
                      )}
                    </View>
                    {isSelected && (
                      <FontAwesome5
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
              <FontAwesome5 name="chevron-left" size={14} color="#666" />
              <Text style={styles.sheetBackText}>Retour</Text>
            </Pressable>
            <Text style={styles.sheetBreadcrumbText}>
              Soins / Vitamines / Choisir
            </Text>
          </View>
          <View style={styles.searchContainer}>
            <FontAwesome5
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
                <FontAwesome5 name="times-circle" size={16} color="#999" />
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
                    vitamineName === vitamine && {
                      backgroundColor: Colors[colorScheme].tint + "20",
                    },
                  ]}
                  onPress={() => {
                    setVitamineName(vitamine);
                    if (vitamine !== "Autre vitamine") {
                      setVitamineCustomName("");
                    }
                    setSheetStep("form");
                    setSearchQuery("");
                  }}
                  activeOpacity={0.7}
                >
                  <FontAwesome5
                    name="pills"
                    size={16}
                    color={
                      vitamineName === vitamine
                        ? Colors[colorScheme].tint
                        : "#666"
                    }
                    style={styles.vaccinListItemIcon}
                  />
                  <Text
                    style={[
                      styles.vaccinListItemText,
                      vitamineName === vitamine && { color: "#000000" },
                      vitamineName === vitamine &&
                        styles.vaccinListItemTextSelected,
                    ]}
                  >
                    {vitamine}
                  </Text>
                  {vitamineName === vitamine && (
                    <FontAwesome5
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

    const isEditing = !!editingEvent;
    return (
      <View style={styles.sheetContent}>
        <View style={styles.typeRow}>
          {(
            [
              "temperature",
              "medicament",
              "symptome",
              "vaccin",
              "vitamine",
            ] as HealthType[]
          ).map((type) => {
            const active = selectedType === type;
            const isDisabled = isEditing && !active;
            return (
              <TouchableOpacity
                key={type}
                style={[
                  styles.typeChip,
                  active && styles.typeChipActive,
                  isDisabled && styles.typeChipDisabled,
                ]}
                disabled={isDisabled}
                activeOpacity={1}
                onPress={() => {
                  if (isEditing) return;
                  setSelectedType(type);
                  setSheetStep("form");
                  setSearchQuery("");
                  if (type === "vitamine" && !vitamineName) {
                    setVitamineName("Vitamine D");
                  }
                }}
              >
                <Text
                  style={[
                    styles.typeChipText,
                    active && styles.typeChipTextActive,
                  ]}
                >
                  {TYPE_CONFIG[type].label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {selectedType === "temperature" && (
          <>
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Température (°C)</Text>
              <View style={styles.quantityPickerRow}>
                <TouchableOpacity
                  style={[
                    styles.quantityButton,
                    isSubmitting && styles.quantityButtonDisabled,
                  ]}
                  onPressIn={() =>
                    handlePressIn(() =>
                      setTemperatureValue((value) =>
                        Math.max(34, Math.round((value - 0.1) * 10) / 10),
                      ),
                    )
                  }
                  onPressOut={handlePressOut}
                  disabled={isSubmitting || temperatureValue <= 34}
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
                  {temperatureValue.toFixed(1)}°C
                </Text>
                <TouchableOpacity
                  style={[
                    styles.quantityButton,
                    isSubmitting && styles.quantityButtonDisabled,
                  ]}
                  onPressIn={() =>
                    handlePressIn(() =>
                      setTemperatureValue((value) =>
                        Math.min(45, Math.round((value + 0.1) * 10) / 10),
                      ),
                    )
                  }
                  onPressOut={handlePressOut}
                  disabled={isSubmitting || temperatureValue >= 45}
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
            </View>
            <View style={styles.chipSection}>
              <Text style={styles.chipLabel}>Mode de prise</Text>
              <View style={styles.chipRow}>
                {MODE_TEMPERATURE.map((mode) => (
                  <TouchableOpacity
                    key={mode}
                    style={[
                      styles.chip,
                      temperatureMode === mode && styles.chipActive,
                    ]}
                    onPress={() =>
                      setTemperatureMode(
                        temperatureMode === mode ? undefined : (mode as any),
                      )
                    }
                  >
                    <Text
                      style={[
                        styles.chipText,
                        temperatureMode === mode && styles.chipTextActive,
                      ]}
                    >
                      {mode}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          </>
        )}

        {selectedType === "medicament" && (
          <>
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Médicament</Text>
              <TextInput
                value={medicamentName}
                onChangeText={setMedicamentName}
                placeholder="Paracétamol"
                style={styles.input}
              />
            </View>
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Dosage</Text>
              <TextInput
                value={medicamentDosage}
                onChangeText={setMedicamentDosage}
                placeholder="5 ml"
                style={styles.input}
              />
            </View>
            <View style={styles.chipSection}>
              <Text style={styles.chipLabel}>Voie</Text>
              <View style={styles.chipRow}>
                {VOIES_MEDICAMENT.map((voie) => (
                  <TouchableOpacity
                    key={voie}
                    style={[
                      styles.chip,
                      medicamentVoie === voie && styles.chipActive,
                    ]}
                    onPress={() =>
                      setMedicamentVoie(
                        medicamentVoie === voie ? undefined : (voie as any),
                      )
                    }
                  >
                    <Text
                      style={[
                        styles.chipText,
                        medicamentVoie === voie && styles.chipTextActive,
                      ]}
                    >
                      {voie}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          </>
        )}

        {selectedType === "symptome" && (
          <>
            <View style={styles.chipSection}>
              <Text style={styles.chipLabel}>Symptômes</Text>
              <View style={styles.chipRow}>
                {SYMPTOMES_OPTIONS.map((symptome) => {
                  const active = symptomes.includes(symptome);
                  return (
                    <TouchableOpacity
                      key={symptome}
                      style={[styles.chip, active && styles.chipActive]}
                      onPress={() => {
                        setSymptomes((prev) =>
                          prev.includes(symptome)
                            ? prev.filter((item) => item !== symptome)
                            : [...prev, symptome],
                        );
                      }}
                    >
                      <Text
                        style={[
                          styles.chipText,
                          active && styles.chipTextActive,
                        ]}
                      >
                        {symptome}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Autre symptôme</Text>
              <TextInput
                value={symptomeAutre}
                onChangeText={setSymptomeAutre}
                placeholder="Préciser"
                style={styles.input}
              />
            </View>
            <View style={styles.chipSection}>
              <Text style={styles.chipLabel}>Intensité</Text>
              <View style={styles.chipRow}>
                {INTENSITES.map((item) => (
                  <TouchableOpacity
                    key={item}
                    style={[
                      styles.chip,
                      symptomeIntensite === item && styles.chipActive,
                    ]}
                    onPress={() =>
                      setSymptomeIntensite(
                        symptomeIntensite === item ? undefined : (item as any),
                      )
                    }
                  >
                    <Text
                      style={[
                        styles.chipText,
                        symptomeIntensite === item && styles.chipTextActive,
                      ]}
                    >
                      {item}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          </>
        )}

        {selectedType === "vaccin" && (
          <>
            <TouchableOpacity
              style={[
                styles.vaccinSelector,
                isSubmitting && styles.vaccinSelectorDisabled,
              ]}
              onPress={() => {
                if (isSubmitting) return;
                setSearchQuery("");
                setSheetStep("vaccinPicker");
              }}
              activeOpacity={0.7}
            >
              <FontAwesome5
                name="syringe"
                size={16}
                color="#666"
                style={styles.vaccinListItemIcon}
              />
              <Text
                style={[
                  styles.vaccinSelectorText,
                  vaccinName && styles.vaccinSelectorTextSelected,
                  isSubmitting && styles.vaccinSelectorTextDisabled,
                ]}
              >
                {vaccinName ? vaccinName : "Sélectionner un vaccin"}
              </Text>
              <FontAwesome5 name="chevron-right" size={14} color="#999" />
            </TouchableOpacity>
            {vaccinName === "Autre vaccin" && (
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Nom du vaccin</Text>
                <TextInput
                  value={vaccinCustomName}
                  onChangeText={setVaccinCustomName}
                  placeholder="Nom du vaccin"
                  style={styles.input}
                />
              </View>
            )}
            {vaccinName ? (
              vaccinName === "Autre vaccin" ? (
                <View style={styles.inputGroup}>
                  <Text style={styles.inputLabel}>Dose</Text>
                  <TextInput
                    value={vaccinDosage}
                    onChangeText={setVaccinDosage}
                    placeholder="1ère injection"
                    style={styles.input}
                  />
                </View>
              ) : (
                <View style={styles.inputGroup}>
                  <Text style={styles.inputLabel}>Dose</Text>
                  <Text style={styles.readOnlyValue}>
                    {vaccinDosage || "—"}
                  </Text>
                </View>
              )
            ) : null}
          </>
        )}

        {selectedType === "vitamine" && (
          <>
            <TouchableOpacity
              style={[
                styles.vaccinSelector,
                isSubmitting && styles.vaccinSelectorDisabled,
              ]}
              onPress={() => {
                if (isSubmitting) return;
                setSearchQuery("");
                setSheetStep("vitaminePicker");
              }}
              activeOpacity={0.7}
            >
              <FontAwesome5
                name="pills"
                size={16}
                color="#666"
                style={styles.vaccinListItemIcon}
              />
              <Text
                style={[
                  styles.vaccinSelectorText,
                  vitamineName && styles.vaccinSelectorTextSelected,
                  isSubmitting && styles.vaccinSelectorTextDisabled,
                ]}
              >
                {vitamineName ? vitamineName : "Sélectionner une vitamine"}
              </Text>
              <FontAwesome5 name="chevron-right" size={14} color="#999" />
            </TouchableOpacity>
            {vitamineName === "Autre vitamine" && (
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Nom de la vitamine</Text>
                <TextInput
                  value={vitamineCustomName}
                  onChangeText={setVitamineCustomName}
                  placeholder="Nom de la vitamine"
                  style={styles.input}
                />
              </View>
            )}
            {(vitamineName === "Vitamine D" ||
              vitamineName === "Vitamine K") && (
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Quantité</Text>
                <View style={styles.quantityPickerRow}>
                  <TouchableOpacity
                    style={[
                      styles.quantityButton,
                      isSubmitting && styles.quantityButtonDisabled,
                    ]}
                    onPressIn={() =>
                      handlePressIn(() =>
                        setGouttesCount((value) => Math.max(0, value - 1)),
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
                    {gouttesCount} gouttes
                  </Text>
                  <TouchableOpacity
                    style={[
                      styles.quantityButton,
                      isSubmitting && styles.quantityButtonDisabled,
                    ]}
                    onPressIn={() =>
                      handlePressIn(() => setGouttesCount((value) => value + 1))
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
              </View>
            )}
            {vitamineName !== "Vitamine D" && vitamineName !== "Vitamine K" && (
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Dosage</Text>
                <TextInput
                  value={vitamineDosage}
                  onChangeText={setVitamineDosage}
                  placeholder="1 goutte"
                  style={styles.input}
                />
              </View>
            )}
          </>
        )}

        <View style={[styles.inputGroup, { marginTop: 12 }]}>
          <Text style={styles.inputLabel}>Note</Text>
          <TextInput
            value={note}
            onChangeText={setNote}
            placeholder="Ajouter une note"
            style={styles.input}
          />
        </View>

        <View style={styles.dateTimeContainerWithPadding}>
          <TouchableOpacity
            style={styles.dateButton}
            onPress={() => setShowDate(true)}
          >
            <FontAwesome5
              name="calendar-alt"
              size={16}
              color={Colors[colorScheme].tint}
            />
            <Text style={styles.dateButtonText}>Date</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.dateButton}
            onPress={() => setShowTime(true)}
          >
            <FontAwesome5
              name="clock"
              size={16}
              color={Colors[colorScheme].tint}
            />
            <Text style={styles.dateButtonText}>Heure</Text>
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
            onChange={(_, date) => {
              setShowDate(false);
              if (date) {
                setDateHeure((prev) => {
                  const next = new Date(prev);
                  next.setFullYear(
                    date.getFullYear(),
                    date.getMonth(),
                    date.getDate(),
                  );
                  return next;
                });
              }
            }}
          />
        )}
        {showTime && (
          <DateTimePicker
            value={dateHeure}
            mode="time"
            is24Hour
            display={Platform.OS === "ios" ? "spinner" : "default"}
            onChange={(_, date) => {
              setShowTime(false);
              if (date) {
                setDateHeure((prev) => {
                  const next = new Date(prev);
                  next.setHours(date.getHours(), date.getMinutes(), 0, 0);
                  return next;
                });
              }
            }}
          />
        )}
      </View>
    );
  };

  // ============================================
  // RENDER HELPERS
  // ============================================
  const buildDetails = (event: HealthEvent) => {
    if (event.type === "temperature") {
      return [formatTemperature(event.valeur), event.modePrise]
        .filter(Boolean)
        .join(" · ");
    }
    if (event.type === "medicament") {
      return [event.nomMedicament, event.dosage, event.voie]
        .filter(Boolean)
        .join(" · ");
    }
    if (event.type === "symptome") {
      const list = event.symptomes?.join(", ");
      return [list, event.intensite].filter(Boolean).join(" · ");
    }
    if (event.type === "vaccin") {
      return [event.nomVaccin, event.dosage].filter(Boolean).join(" · ");
    }
    if (event.type === "vitamine") {
      return [event.nomVitamine, event.dosage].filter(Boolean).join(" · ");
    }
    return "";
  };

  const toggleExpand = useCallback((date: string) => {
    setExpandedDays((prev) => {
      const next = new Set(prev);
      if (next.has(date)) {
        next.delete(date);
      } else {
        next.add(date);
      }
      return next;
    });
  }, []);

  const renderEventItem = (event: HealthEvent, isLast = false) => {
    const time = toDate(event.date);
    const config = TYPE_CONFIG[event.type];
    return (
      <Pressable
        key={event.id}
        style={({ pressed }) => [
          styles.sessionCard,
          // isLast && styles.sessionCardLast,
          pressed && styles.sessionCardPressed,
        ]}
        onPress={() => openEditModal(event)}
      >
        <View style={styles.sessionTime}>
          <Text
            style={[
              styles.sessionTimeText,
              isLast && styles.sessionTimeTextLast,
            ]}
          >
            {formatTime(time)}
          </Text>
        </View>
        <View
          style={[
            styles.sessionIconWrapper,
            { backgroundColor: `${config.color}20` },
          ]}
        >
          <FontAwesome
            name={config.icon as any}
            size={14}
            color={config.color}
          />
        </View>
        <View style={styles.sessionDetails}>
          <Text style={styles.sessionType}>{config.label}</Text>
          <Text style={styles.sessionDetailText}>{buildDetails(event)}</Text>
        </View>
        <Ionicons name="chevron-forward" size={18} color="#d1d5db" />
      </Pressable>
    );
  };

  const renderDayGroup = ({ item }: { item: HealthGroup }) => {
    const [year, month, day] = item.date.split("-").map(Number);
    const date = new Date(year, month - 1, day);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    const dayLabel =
      date.toDateString() === today.toDateString()
        ? "Aujourd'hui"
        : date.toDateString() === yesterday.toDateString()
          ? "Hier"
          : date.toLocaleDateString("fr-FR", {
              weekday: "short",
              day: "numeric",
              month: "short",
            });

    const isExpanded = expandedDays.has(item.date);
    const hasMultiple = item.events.length > 1;

    return (
      <View style={styles.daySection}>
        <View style={styles.dayHeader}>
          <Text style={styles.dayLabel}>{dayLabel}</Text>
          <View style={styles.dayStats}>
            <View style={styles.dayStatItem}>
              <Text style={styles.dayStatValue}>{item.events.length}</Text>
              <Text style={styles.dayStatLabel}>
                évènement{item.events.length > 1 ? "s" : ""}
              </Text>
            </View>
          </View>
        </View>

        <View style={styles.statsBreakdown}>
          {(Object.keys(TYPE_CONFIG) as HealthType[]).map((type) => {
            const count = item.counts[type];
            if (!count) return null;
            return (
              <View key={type} style={styles.statsBreakdownItem}>
                <View
                  style={[
                    styles.statsBreakdownDot,
                    { backgroundColor: TYPE_CONFIG[type].color },
                  ]}
                />
                <Text style={styles.statsBreakdownLabel}>
                  {TYPE_CONFIG[type].label}
                  {count > 1 ? "s" : ""}
                </Text>
                <Text style={styles.statsBreakdownValue}>{count}</Text>
              </View>
            );
          })}
        </View>

        <View style={styles.sessionsContainer}>
          {renderEventItem(item.lastEvent, true)}
          {hasMultiple && (
            <>
              {isExpanded &&
                item.events
                  .filter((evt) => evt.id !== item.lastEvent.id)
                  .map((evt) => renderEventItem(evt, false))}
              <Pressable
                style={styles.expandTrigger}
                onPress={() => toggleExpand(item.date)}
              >
                <Text
                  style={[
                    styles.expandTriggerText,
                    { color: Colors[colorScheme].tint },
                  ]}
                >
                  {isExpanded
                    ? "Masquer"
                    : `${item.events.length - 1} autre${item.events.length > 2 ? "s" : ""} événement${item.events.length > 2 ? "s" : ""}`}
                </Text>
                <Ionicons
                  name={isExpanded ? "chevron-up" : "chevron-down"}
                  size={14}
                  color={Colors[colorScheme].tint}
                />
              </Pressable>
            </>
          )}
        </View>
      </View>
    );
  };

  // ============================================
  // RENDER
  // ============================================
  return (
    <View style={styles.container}>
      <SafeAreaView
        style={{ flex: 1 }}
        edges={["bottom"]}
        onLayout={() => setLayoutReady(true)}
      >
        <View>
          <DateFilterBar
            selected={selectedFilter}
            onSelect={handleFilterPress}
          />
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

        {Object.values(loaded).every(Boolean) && emptyDelayDone ? (
          groupedEvents.length === 0 ? (
            <View style={styles.emptyContainer}>
              <Ionicons
                name="calendar-outline"
                size={64}
                color={Colors[colorScheme].tabIconDefault}
              />
              <ThemedText style={styles.emptyText}>
                {events.length === 0
                  ? "Aucun événement enregistré"
                  : "Aucun événement pour ce filtre"}
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
              data={groupedEvents}
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
      </SafeAreaView>

      <ConfirmModal
        visible={showDeleteModal}
        title="Supprimer"
        message="Cet événement sera supprimé définitivement."
        confirmText="Supprimer"
        cancelText="Annuler"
        confirmButtonColor="#dc3545"
        confirmTextColor="#fff"
        cancelButtonColor="#f1f3f5"
        cancelTextColor="#1f2937"
        backgroundColor={colors.background}
        textColor={colors.text}
        onCancel={() => setShowDeleteModal(false)}
        onConfirm={confirmDelete}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f8f9fa",
  },
  headerButtons: {
    flexDirection: "row",
    alignItems: "center",
    paddingRight: 16,
    gap: 0,
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
  flatlistContent: {
    paddingBottom: 8,
  },
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 20,
  },
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
  dayStatLabel: {
    fontSize: 11,
    color: "#9ca3af",
  },
  statsBreakdown: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
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
    backgroundColor: "#f8f9fa",
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
  sheetContent: {
    gap: 12,
  },
  typeRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    paddingBottom: 8,
  },
  typeChip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: "#f9fafb",
  },
  typeChipActive: {
    backgroundColor: "#fff",
    borderColor: "#6f42c1",
  },
  typeChipDisabled: {
    opacity: 0.4,
  },
  typeChipText: {
    fontSize: 12,
    color: "#6b7280",
    fontWeight: "600",
  },
  typeChipTextActive: {
    color: "#4c2c79",
    fontWeight: "700",
  },
  dateTimeContainer: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 12,
    marginBottom: 10,
  },
  dateTimeContainerWithPadding: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 12,
    marginBottom: 10,
    paddingTop: 20,
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
  dateButtonText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#4a4f55",
  },
  selectedDateTime: {
    alignItems: "center",
    marginBottom: 16,
  },
  selectedDate: {
    fontSize: 16,
    fontWeight: "600",
    color: "#333",
    marginBottom: 4,
  },
  selectedTime: {
    fontSize: 20,
    fontWeight: "600",
    color: "#374151",
  },
  vaccinSelector: {
    backgroundColor: "#f8f9fa",
    padding: 16,
    borderRadius: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderWidth: 1,
    borderColor: "#e9ecef",
    marginBottom: 8,
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
    fontSize: 16,
    color: "#333",
  },
  vaccinListItemTextWrap: {
    flex: 1,
    gap: 2,
  },
  vaccinListItemSubtext: {
    fontSize: 12,
    color: "#6b7280",
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
  noResultsText: {
    fontSize: 16,
    color: "#666",
    textAlign: "center",
    padding: 20,
  },
  inputGroup: {
    gap: 6,
  },
  inputLabel: {
    fontSize: 12,
    fontWeight: "700",
    color: "#6b7280",
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
  input: {
    borderWidth: 1,
    borderColor: "#e5e7eb",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  readOnlyValue: {
    borderWidth: 1,
    borderColor: "#e5e7eb",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: "#4b5563",
    backgroundColor: "#f9fafb",
  },
  chipSection: {
    gap: 8,
  },
  chipLabel: {
    fontSize: 12,
    fontWeight: "700",
    color: "#6b7280",
  },
  chipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  chip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: "#f9fafb",
  },
  chipActive: {
    borderColor: "#6f42c1",
    backgroundColor: "#ede7f6",
  },
  chipText: {
    fontSize: 12,
    color: "#6b7280",
    fontWeight: "600",
  },
  chipTextActive: {
    color: "#4c2c79",
  },
});
