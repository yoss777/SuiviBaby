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
  ajouterSommeil,
  modifierSommeil,
  supprimerSommeil,
} from "@/migration/eventsDoubleWriteService";
import {
  ecouterSommeilsHybrid,
  getNextEventDateBeforeHybrid,
  hasMoreEventsBeforeHybrid,
} from "@/migration/eventsHybridService";
import { SommeilEvent } from "@/services/eventsService";
import { Ionicons } from "@expo/vector-icons";
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
import { Calendar } from "react-native-calendars";
import { SafeAreaView } from "react-native-safe-area-context";
import { useHeaderLeft, useHeaderRight } from "../../_layout";

const LOCATION_OPTIONS: SommeilEvent["location"][] = [
  "lit",
  "cododo",
  "poussette",
  "voiture",
  "autre",
];
const QUALITY_OPTIONS: SommeilEvent["quality"][] = [
  "paisible",
  "agité",
  "mauvais",
];

type SleepItem = SommeilEvent & { id: string };

type FilterType = "today" | "past";

type SleepGroup = {
  date: string;
  sommeils: SleepItem[];
  totalMinutes: number;
  napsCount: number;
  nightsCount: number;
  lastSommeil: SleepItem;
};

const toDate = (value: any): Date => {
  if (!value) return new Date();
  if (value?.seconds) return new Date(value.seconds * 1000);
  if (value?.toDate) return value.toDate();
  if (value instanceof Date) return value;
  return new Date(value);
};

const formatTime = (date: Date) =>
  date.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });

const formatDateLabel = (date: Date) =>
  date.toLocaleDateString("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });

const formatDuration = (minutes?: number) => {
  if (!minutes) return "0 min";
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m > 0 ? `${h}h${String(m).padStart(2, "0")}` : `${h}h`;
};

const formatDateKey = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;

export default function SommeilScreen() {
  const { activeChild } = useBaby();
  const { setHeaderRight } = useHeaderRight();
  const { setHeaderLeft } = useHeaderLeft();
  const colorScheme = useColorScheme() ?? "light";
  const colors = Colors[colorScheme];
  const { openSheet, closeSheet, viewProps, isOpen } = useSheet();
  const { showAlert } = useModal();
  const { openModal, editId, returnTo } = useLocalSearchParams();
  const navigation = useNavigation();

  const sheetOwnerId = "sommeil";
  const isSheetActive = viewProps?.ownerId === sheetOwnerId;
  const returnToRef = useRef<string | null>(null);
  const editIdRef = useRef<string | null>(null);
  const headerOwnerId = useRef(
    `sommeil-${Math.random().toString(36).slice(2)}`,
  );

  const [loading, setLoading] = useState(true);
  const [sommeils, setSommeils] = useState<SleepItem[]>([]);
  const [groupedSommeils, setGroupedSommeils] = useState<SleepGroup[]>([]);
  const [sommeilsLoaded, setSommeilsLoaded] = useState(false);
  const [emptyDelayDone, setEmptyDelayDone] = useState(false);
  const [editingSommeil, setEditingSommeil] = useState<SleepItem | null>(null);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showCalendar, setShowCalendar] = useState(false);
  const [selectedFilter, setSelectedFilter] = useState<FilterType | null>(null);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [daysWindow, setDaysWindow] = useState(14);
  const [rangeEndDate, setRangeEndDate] = useState<Date | null>(null);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [autoLoadMore, setAutoLoadMore] = useState(false);
  const [autoLoadMoreAttempts, setAutoLoadMoreAttempts] = useState(0);
  const [layoutReady, setLayoutReady] = useState(false);
  const [pendingOpen, setPendingOpen] = useState(false);
  const [pendingMode, setPendingMode] = useState<"add" | "edit" | null>(null);
  const [expandedDays, setExpandedDays] = useState<Set<string>>(new Set());
  const loadMoreVersionRef = useRef(0);
  const pendingLoadMoreRef = useRef(0);

  const [heureDebut, setHeureDebut] = useState<Date>(new Date());
  const [heureFin, setHeureFin] = useState<Date | null>(null);
  const [isOngoing, setIsOngoing] = useState(false);
  const [isNap, setIsNap] = useState(true);
  const [location, setLocation] = useState<SommeilEvent["location"]>();
  const [quality, setQuality] = useState<SommeilEvent["quality"]>();
  const [note, setNote] = useState("");

  const [showDateStart, setShowDateStart] = useState(false);
  const [showTimeStart, setShowTimeStart] = useState(false);
  const [showDateEnd, setShowDateEnd] = useState(false);
  const [showTimeEnd, setShowTimeEnd] = useState(false);

  const [now, setNow] = useState(new Date());

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
    } else if (target === "chrono" || target === "journal") {
      router.replace("/baby/chrono");
    }
  }, []);

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
      setHeaderLeft(backButton, "sommeil");
      return () => {
        setHeaderLeft(null, "sommeil");
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

  useEffect(() => {
    if (!activeChild?.id) return;
    const endOfRange = rangeEndDate ? new Date(rangeEndDate) : new Date();
    endOfRange.setHours(23, 59, 59, 999);
    const startOfRange = new Date(endOfRange);
    startOfRange.setHours(0, 0, 0, 0);
    startOfRange.setDate(startOfRange.getDate() - (daysWindow - 1));

    const versionAtSubscribe = loadMoreVersionRef.current;
    const unsubscribe = ecouterSommeilsHybrid(
      activeChild.id,
      (data) => {
        const formatted = data
          .map((item: any) => ({
            ...item,
            id: item.id,
          }))
          .sort(
            (a: any, b: any) =>
              toDate(b.date).getTime() - toDate(a.date).getTime(),
          );
        setSommeils(formatted);
        setSommeilsLoaded(true);
        setLoading(false);
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
      { depuis: startOfRange, waitForServer: true },
    );

    return () => unsubscribe();
  }, [activeChild?.id, daysWindow, rangeEndDate]);

  useEffect(() => {
    if (!activeChild?.id) return;
    setSommeils([]);
    setGroupedSommeils([]);
    setSommeilsLoaded(false);
    setEmptyDelayDone(false);
    setLoading(true);
    setDaysWindow(14);
    setRangeEndDate(null);
    setIsLoadingMore(false);
    setHasMore(true);
    setExpandedDays(new Set());
    loadMoreVersionRef.current = 0;
    pendingLoadMoreRef.current = 0;
  }, [activeChild?.id]);

  useEffect(() => {
    if (!sommeilsLoaded) {
      setEmptyDelayDone(false);
      return;
    }
    if (groupedSommeils.length > 0) {
      setEmptyDelayDone(true);
      return;
    }
    const timer = setTimeout(() => setEmptyDelayDone(true), 300);
    return () => clearTimeout(timer);
  }, [sommeilsLoaded, groupedSommeils.length]);

  const sommeilEnCours = useMemo(() => {
    return sommeils.find((item) => !item.heureFin && item.heureDebut);
  }, [sommeils]);

  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | null = null;
    if (sommeilEnCours) {
      timer = setInterval(() => setNow(new Date()), 60000);
    }
    return () => {
      if (timer) clearInterval(timer);
    };
  }, [sommeilEnCours]);

  const elapsedMinutes = useMemo(() => {
    if (!sommeilEnCours?.heureDebut) return 0;
    const start = toDate(sommeilEnCours.heureDebut);
    return Math.max(0, Math.round((now.getTime() - start.getTime()) / 60000));
  }, [sommeilEnCours, now]);

  const filteredSommeils = useMemo(() => {
    if (!selectedFilter && !selectedDate) return sommeils;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayTime = today.getTime();
    const selectedDateValue = selectedDate
      ? new Date(
          Number(selectedDate.split("-")[0]),
          Number(selectedDate.split("-")[1]) - 1,
          Number(selectedDate.split("-")[2]),
        ).getTime()
      : null;

    return sommeils.filter((item) => {
      const date = toDate(item.date);
      const itemDay = new Date(
        date.getFullYear(),
        date.getMonth(),
        date.getDate(),
      ).getTime();

      if (selectedDateValue !== null) {
        return itemDay === selectedDateValue;
      }
      if (selectedFilter === "today") {
        return itemDay === todayTime;
      }
      if (selectedFilter === "past") {
        return itemDay < todayTime;
      }
      return true;
    });
  }, [sommeils, selectedDate, selectedFilter]);

  useEffect(() => {
    const groupMap: Record<string, SleepItem[]> = {};
    filteredSommeils.forEach((item) => {
      const date = toDate(item.date);
      const dateKey = formatDateKey(date);
      if (!groupMap[dateKey]) groupMap[dateKey] = [];
      groupMap[dateKey].push(item);
    });

    const groups = Object.entries(groupMap)
      .map(([dateKey, items]) => {
        const sorted = items.sort(
          (a, b) => toDate(b.date).getTime() - toDate(a.date).getTime(),
        );
        const totalMinutes = sorted.reduce((sum, item) => {
          if (item.duree) return sum + item.duree;
          const start = item.heureDebut
            ? toDate(item.heureDebut)
            : toDate(item.date);
          const end = item.heureFin ? toDate(item.heureFin) : new Date();
          return (
            sum +
            Math.max(0, Math.round((end.getTime() - start.getTime()) / 60000))
          );
        }, 0);
        const napsCount = sorted.filter((item) => item.isNap).length;
        const nightsCount = sorted.length - napsCount;
        return {
          date: dateKey,
          sommeils: sorted,
          totalMinutes,
          napsCount,
          nightsCount,
          lastSommeil: sorted[0],
        } as SleepGroup;
      })
      .sort((a, b) => (a.date < b.date ? 1 : -1));

    setGroupedSommeils(groups);
  }, [filteredSommeils]);

  const markedDates = useMemo(() => {
    const marked: Record<
      string,
      {
        marked?: boolean;
        dotColor?: string;
        selected?: boolean;
        selectedColor?: string;
        selectedTextColor?: string;
      }
    > = {};

    sommeils.forEach((item) => {
      const date = toDate(item.date);
      const key = formatDateKey(date);
      marked[key] = {
        ...(marked[key] || {}),
        marked: true,
        dotColor: eventColors.sommeil.dark,
      };
    });

    if (selectedDate) {
      marked[selectedDate] = {
        ...(marked[selectedDate] || {}),
        selected: true,
        selectedColor: Colors[colorScheme].tint,
        selectedTextColor: "#ffffff",
      };
    }

    if (selectedFilter === "today") {
      const todayKey = formatDateKey(new Date());
      marked[todayKey] = {
        ...(marked[todayKey] || {}),
        selected: true,
        selectedColor: Colors[colorScheme].tint,
        selectedTextColor: "#ffffff",
      };
    }

    return marked;
  }, [sommeils, selectedDate, selectedFilter, colorScheme]);

  const prepareAddModal = useCallback(() => {
    setEditingSommeil(null);
    setIsSubmitting(false);
    setHeureDebut(new Date());
    setHeureFin(null);
    setIsOngoing(false);
    setIsNap(true);
    setLocation(undefined);
    setQuality(undefined);
    setNote("");
    editIdRef.current = null;
  }, []);

  const openAddModal = useCallback(() => {
    prepareAddModal();
    setPendingMode("add");
    setPendingOpen(true);
  }, [prepareAddModal]);

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
          <Pressable onPress={openAddModal} style={styles.headerButton}>
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

  const openEditModal = useCallback((item: SleepItem) => {
    const debut = item.heureDebut ? toDate(item.heureDebut) : toDate(item.date);
    const fin = item.heureFin ? toDate(item.heureFin) : null;
    setHeureDebut(debut);
    setHeureFin(fin);
    setIsOngoing(!fin);
    setIsNap(item.isNap ?? true);
    setLocation(item.location);
    setQuality(item.quality);
    setNote(item.note ?? "");
    setEditingSommeil(item);
    editIdRef.current = item.id;
    setPendingMode("edit");
    setPendingOpen(true);
  }, []);

  const handleSubmit = async () => {
    if (!activeChild?.id || isSubmitting) return;
    try {
      setIsSubmitting(true);
      const fin = isOngoing ? undefined : (heureFin ?? undefined);
      const start = heureDebut;
      const dataToSave = {
        heureDebut: start,
        heureFin: fin,
        duree:
          start && fin
            ? Math.max(0, Math.round((fin.getTime() - start.getTime()) / 60000))
            : undefined,
        location,
        quality,
        isNap,
        date: start,
        note: note.trim() ? note.trim() : undefined,
      };

      if (editingSommeil) {
        await modifierSommeil(activeChild.id, editingSommeil.id, dataToSave);
      } else {
        await ajouterSommeil(activeChild.id, dataToSave);
      }

      closeSheet();
    } catch (error) {
      console.error("Erreur lors de la sauvegarde du sommeil:", error);
      showAlert("Erreur", "Impossible de sauvegarder le sommeil.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = () => {
    if (!editingSommeil || isSubmitting) return;
    setShowDeleteModal(true);
  };

  const confirmDelete = async () => {
    if (!editingSommeil || !activeChild?.id || isSubmitting) return;
    try {
      setIsSubmitting(true);
      await supprimerSommeil(activeChild.id, editingSommeil.id);
      closeSheet();
    } catch (error) {
      console.error("Erreur lors de la suppression du sommeil:", error);
      showAlert("Erreur", "Impossible de supprimer le sommeil.");
    } finally {
      setIsSubmitting(false);
      setShowDeleteModal(false);
    }
  };

  const handleStartSleep = async (nap: boolean) => {
    if (!activeChild?.id || sommeilEnCours) return;
    try {
      await ajouterSommeil(activeChild.id, {
        heureDebut: new Date(),
        isNap: nap,
      });
    } catch (error) {
      console.error("Erreur démarrage sommeil:", error);
      showAlert("Erreur", "Impossible de démarrer le sommeil.");
    }
  };

  const handleStopSleep = async () => {
    if (!activeChild?.id || !sommeilEnCours) return;
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
      openEditModal({
        ...sommeilEnCours,
        heureFin: fin,
        duree,
      } as SleepItem);
    } catch (error) {
      console.error("Erreur arrêt sommeil:", error);
      showAlert("Erreur", "Impossible d'arrêter le sommeil.");
    }
  };

  const renderSheetContent = () => (
    <View style={styles.sheetContent}>
      <View style={styles.segmentRow}>
        <TouchableOpacity
          style={[
            styles.segmentButton,
            isNap && styles.segmentActive,
            isNap && { borderColor: eventColors.sommeil.dark },
          ]}
          onPress={() => setIsNap(true)}
        >
          <Text style={[styles.segmentText, isNap && styles.segmentTextActive]}>
            Sieste
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[
            styles.segmentButton,
            !isNap && styles.segmentActive,
            !isNap && { borderColor: eventColors.sommeil.dark },
          ]}
          onPress={() => setIsNap(false)}
        >
          <Text
            style={[styles.segmentText, !isNap && styles.segmentTextActive]}
          >
            Nuit
          </Text>
        </TouchableOpacity>
      </View>

      <View style={styles.rowBetween}>
        <TouchableOpacity
          style={styles.dateButton}
          onPress={() => setShowDateStart(true)}
        >
          <Text style={styles.dateButtonText}>Date début</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.dateButton}
          onPress={() => setShowTimeStart(true)}
        >
          <Text style={styles.dateButtonText}>Heure début</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.rowBetween}>
        <TouchableOpacity
          style={[styles.dateButton, isOngoing && styles.dateButtonDisabled]}
          onPress={() => {
            if (!isOngoing) {
              setHeureFin((prev) => prev ?? new Date());
              setShowDateEnd(true);
            }
          }}
        >
          <Text style={styles.dateButtonText}>Date fin</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.dateButton, isOngoing && styles.dateButtonDisabled]}
          onPress={() => {
            if (!isOngoing) {
              setHeureFin((prev) => prev ?? new Date());
              setShowTimeEnd(true);
            }
          }}
        >
          <Text style={styles.dateButtonText}>Heure fin</Text>
        </TouchableOpacity>
      </View>

      <TouchableOpacity
        style={styles.checkboxRow}
        onPress={() => setIsOngoing((prev) => !prev)}
      >
        <View style={[styles.checkbox, isOngoing && styles.checkboxChecked]}>
          {isOngoing && <FontAwesome name="check" size={12} color="#fff" />}
        </View>
        <Text style={styles.checkboxLabel}>Sommeil en cours</Text>
      </TouchableOpacity>

      <View style={styles.selectedDateTime}>
        <Text style={styles.selectedDate}>{formatDateLabel(heureDebut)}</Text>
        <Text style={styles.selectedTime}>{formatTime(heureDebut)}</Text>
        {!isOngoing && heureFin && (
          <Text style={styles.selectedTime}>→ {formatTime(heureFin)}</Text>
        )}
      </View>

      {showDateStart && (
        <DateTimePicker
          value={heureDebut}
          mode="date"
          display={Platform.OS === "ios" ? "spinner" : "default"}
          onChange={(_, date) => {
            setShowDateStart(false);
            if (date) {
              setHeureDebut((prev) => {
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
      {showTimeStart && (
        <DateTimePicker
          value={heureDebut}
          mode="time"
          is24Hour
          display={Platform.OS === "ios" ? "spinner" : "default"}
          onChange={(_, date) => {
            setShowTimeStart(false);
            if (date) {
              setHeureDebut((prev) => {
                const next = new Date(prev);
                next.setHours(date.getHours(), date.getMinutes(), 0, 0);
                return next;
              });
            }
          }}
        />
      )}
      {showDateEnd && heureFin && (
        <DateTimePicker
          value={heureFin}
          mode="date"
          display={Platform.OS === "ios" ? "spinner" : "default"}
          onChange={(_, date) => {
            setShowDateEnd(false);
            if (date) {
              setHeureFin((prev) => {
                const base = prev ?? new Date();
                const next = new Date(base);
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
      {showTimeEnd && heureFin && (
        <DateTimePicker
          value={heureFin}
          mode="time"
          is24Hour
          display={Platform.OS === "ios" ? "spinner" : "default"}
          onChange={(_, date) => {
            setShowTimeEnd(false);
            if (date) {
              setHeureFin((prev) => {
                const base = prev ?? new Date();
                const next = new Date(base);
                next.setHours(date.getHours(), date.getMinutes(), 0, 0);
                return next;
              });
            }
          }}
        />
      )}

      <View style={styles.chipSection}>
        <Text style={styles.chipLabel}>Lieu</Text>
        <View style={styles.chipRow}>
          {LOCATION_OPTIONS.map((option) => (
            <TouchableOpacity
              key={option}
              style={[styles.chip, location === option && styles.chipActive]}
              onPress={() => setLocation(option)}
            >
              <Text
                style={[
                  styles.chipText,
                  location === option && styles.chipTextActive,
                ]}
              >
                {option}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      <View style={styles.chipSection}>
        <Text style={styles.chipLabel}>Qualité</Text>
        <View style={styles.chipRow}>
          {QUALITY_OPTIONS.map((option) => (
            <TouchableOpacity
              key={option}
              style={[styles.chip, quality === option && styles.chipActive]}
              onPress={() => setQuality(option)}
            >
              <Text
                style={[
                  styles.chipText,
                  quality === option && styles.chipTextActive,
                ]}
              >
                {option}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      <View style={styles.inputGroup}>
        <Text style={styles.inputLabel}>Note</Text>
        <TextInput
          value={note}
          onChangeText={setNote}
          placeholder="Ajouter une note"
          style={styles.input}
        />
      </View>
    </View>
  );

  function buildSheetProps() {
    const returnTarget = normalizeParam(returnTo) ?? returnToRef.current;
    return {
      ownerId: sheetOwnerId,
      title: editingSommeil ? "Modifier le sommeil" : "Nouveau sommeil",
      icon: "bed",
      accentColor: eventColors.sommeil.dark,
      isEditing: !!editingSommeil,
      isSubmitting,
      onSubmit: handleSubmit,
      onDelete: editingSommeil ? handleDelete : undefined,
      children: renderSheetContent(),
      onDismiss: () => {
        setIsSubmitting(false);
        setEditingSommeil(null);
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
    editingSommeil,
    isSubmitting,
    heureDebut,
    heureFin,
    isOngoing,
    isNap,
    location,
    quality,
    note,
    returnTo,
    showDateStart,
    showTimeStart,
    showDateEnd,
    showTimeEnd,
  ]);

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
    navigation,
    openSheet,
    prepareAddModal,
  ]);

  useEffect(() => {
    if (!editId || !layoutReady) return;
    const normalizedId = Array.isArray(editId) ? editId[0] : editId;
    if (!normalizedId || editIdRef.current === normalizedId) return;
    const match = sommeils.find((item) => item.id === normalizedId);
    if (!match) return;
    stashReturnTo();
    editIdRef.current = normalizedId;
    openEditModal(match);
    navigation.setParams({ openModal: undefined, editId: undefined });
  }, [
    editId,
    layoutReady,
    sommeils,
    router,
    returnTo,
    navigation,
    openEditModal,
  ]);

  useFocusEffect(
    useCallback(() => {
      if (!selectedFilter && !selectedDate) {
        applyTodayFilter();
      }
    }, [applyTodayFilter, selectedDate, selectedFilter]),
  );

  const renderSleepItem = ({ item }: { item: SleepItem }) => {
    const start = item.heureDebut ? toDate(item.heureDebut) : toDate(item.date);
    const end = item.heureFin ? toDate(item.heureFin) : null;
    const duration =
      item.duree ??
      (end ? Math.round((end.getTime() - start.getTime()) / 60000) : 0);
    return { start, end, duration };
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

  const renderSleepSession = (sleep: SleepItem, isLast: boolean = false) => {
    const { start, end, duration } = renderSleepItem({ item: sleep });
    const metaParts = [
      sleep.location ? sleep.location : null,
      sleep.quality ? sleep.quality : null,
    ].filter(Boolean);

    return (
      <Pressable
        key={sleep.id}
        style={({ pressed }) => [
          styles.sessionCard,
          // isLast && styles.sessionCardLast,
          pressed && styles.sessionCardPressed,
        ]}
        onPress={() => openEditModal(sleep)}
      >
        <View style={styles.sessionTime}>
          <Text
            style={[
              styles.sessionTimeText,
              isLast && styles.sessionTimeTextLast,
            ]}
          >
            {formatTime(start)}
          </Text>
        </View>

        <View
          style={[
            styles.sessionIconWrapper,
            { backgroundColor: eventColors.sommeil.light },
          ]}
        >
          <Text
            style={[
              styles.sleepIconText,
              !sleep.isNap && styles.sleepIconTextNight,
            ]}
          >
            {sleep.isNap ? "Zz" : "Zzz"}
          </Text>
        </View>

        <View style={styles.sessionContent}>
          <View style={styles.sessionDetails}>
            <Text style={styles.sessionType}>
              {sleep.isNap ? "Sieste" : "Nuit"}
            </Text>
            <Text style={styles.sessionDetailText}>
              {end ? `Fin ${formatTime(end)}` : ""}
            </Text>
            {metaParts.length > 0 && (
              <Text style={styles.sessionDetailMuted}>
                {metaParts.join(" · ")}
              </Text>
            )}
          </View>
        </View>

        <View style={styles.sessionTotal}>
          <Text style={styles.sessionTotalValue}>
            {formatDuration(duration)}
          </Text>
        </View>

        <Ionicons name="chevron-forward" size={18} color="#d1d5db" />
      </Pressable>
    );
  };

  const renderDayGroup = ({ item }: { item: SleepGroup }) => {
    const [year, month, day] = item.date.split("-").map(Number);
    const date = new Date(year, month - 1, day);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    const formatDayLabel = () => {
      if (date.toDateString() === today.toDateString()) {
        return "Aujourd'hui";
      }
      if (date.toDateString() === yesterday.toDateString()) {
        return "Hier";
      }
      return date.toLocaleDateString("fr-FR", {
        weekday: "short",
        day: "numeric",
        month: "short",
      });
    };

    const isExpanded = expandedDays.has(item.date);
    const hasMultiple = item.sommeils.length > 1;

    return (
      <View style={styles.daySection}>
        <View style={styles.dayHeader}>
          <Text style={styles.dayLabel}>{formatDayLabel()}</Text>
          {/* <Text style={styles.dayLabel}>
            {formatDayLabel() === "Aujourd'hui" ? "" : formatDayLabel()}
          </Text> */}
          <View style={styles.dayStats}>
            <View style={styles.dayStatItem}>
              <Text style={styles.dayStatValue}>{item.sommeils.length}</Text>
              <Text style={styles.dayStatLabel}>
                sommeil{item.sommeils.length > 1 ? "s" : ""}
              </Text>
            </View>
            <View style={styles.dayStatDivider} />
            <View style={styles.dayStatItem}>
              <Text style={[styles.dayStatValue, styles.dayStatValueAccent]}>
                {formatDuration(item.totalMinutes)}
              </Text>
              <Text style={styles.dayStatLabel}>total</Text>
            </View>
          </View>
        </View>

        <View style={styles.statsBreakdown}>
          <View style={styles.statsBreakdownItem}>
            <View
              style={[
                styles.statsBreakdownDot,
                { backgroundColor: eventColors.sommeil.dark },
              ]}
            />
            <Text style={styles.statsBreakdownLabel}>
              Sieste{item.napsCount > 1 ? "s" : ""}
            </Text>
            <Text style={styles.statsBreakdownValue}>{item.napsCount}</Text>
          </View>
          <View style={styles.statsBreakdownItem}>
            <View
              style={[styles.statsBreakdownDot, { backgroundColor: "#6366f1" }]}
            />
            <Text style={styles.statsBreakdownLabel}>
              Nuit{item.nightsCount > 1 ? "s" : ""}
            </Text>
            <Text style={styles.statsBreakdownValue}>{item.nightsCount}</Text>
          </View>
        </View>

        <View style={styles.sessionsContainer}>
          {renderSleepSession(item.lastSommeil, true)}

          {hasMultiple && (
            <>
              {isExpanded &&
                item.sommeils
                  .filter((sleep) => sleep.id !== item.lastSommeil.id)
                  .map((sleep) => renderSleepSession(sleep, false))}
              <Pressable
                style={styles.expandTrigger}
                onPress={() => toggleExpand(item.date)}
              >
                <Text style={styles.expandTriggerText}>
                  {isExpanded
                    ? "Masquer"
                    : `${item.sommeils.length - 1} autre${item.sommeils.length > 2 ? "s" : ""} sommeil${item.sommeils.length > 2 ? "s" : ""}`}
                </Text>
                <Ionicons
                  name={isExpanded ? "chevron-up" : "chevron-down"}
                  size={14}
                  color={eventColors.sommeil.dark}
                />
              </Pressable>
            </>
          )}
        </View>
      </View>
    );
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

  const handleDateSelect = (day: { dateString: string }) => {
    setSelectedDate(day.dateString);
    setSelectedFilter(null);
    setShowCalendar(false);
    setExpandedDays(new Set([day.dateString]));
  };

  const loadMoreStep = useCallback(
    async (auto = false) => {
      if (!hasMore || !activeChild?.id) return;
      setIsLoadingMore(true);
      pendingLoadMoreRef.current = 1;
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
          "sommeil",
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
    if (!activeChild?.id) return;
    let cancelled = false;
    const endOfRange = rangeEndDate ? new Date(rangeEndDate) : new Date();
    endOfRange.setHours(23, 59, 59, 999);
    const startOfRange = new Date(endOfRange);
    startOfRange.setHours(0, 0, 0, 0);
    startOfRange.setDate(startOfRange.getDate() - (daysWindow - 1));
    const beforeDate = new Date(startOfRange.getTime() - 1);

    setHasMore(true);
    hasMoreEventsBeforeHybrid(activeChild.id, "sommeil", beforeDate)
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

  useEffect(() => {
    if (selectedFilter === "today" || selectedDate) return;
    if (
      !autoLoadMore &&
      sommeilsLoaded &&
      groupedSommeils.length === 0 &&
      hasMore
    ) {
      setAutoLoadMore(true);
      setAutoLoadMoreAttempts(0);
    }
  }, [
    autoLoadMore,
    loading,
    sommeilsLoaded,
    groupedSommeils.length,
    hasMore,
    selectedFilter,
    selectedDate,
  ]);

  useEffect(() => {
    if (!autoLoadMore) return;
    if (!sommeilsLoaded || loading || isLoadingMore) return;
    if (groupedSommeils.length > 0 || !hasMore) {
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
    sommeilsLoaded,
    loading,
    isLoadingMore,
    groupedSommeils.length,
    hasMore,
    autoLoadMoreAttempts,
    loadMoreStep,
  ]);

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <SafeAreaView
        style={styles.safeArea}
        edges={["bottom"]}
        onLayout={() => setLayoutReady(true)}
      >
        {/* <View style={styles.headerBlock}>
          <Text style={[styles.title, { color: colors.text }]}>Sommeil</Text>
          <Text style={[styles.subtitle, { color: colors.tabIconDefault }]}>
            Siestes et nuits
          </Text>
        </View> */}

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

        {sommeilEnCours && (
          <View style={styles.timerCard}>
            <Text style={styles.timerTitle}>
              {sommeilEnCours.isNap ? "Sieste" : "Nuit"} en cours
            </Text>
            <Text style={styles.timerValue}>
              {formatDuration(elapsedMinutes)}
            </Text>
            <Text style={styles.timerSubtitle}>
              Début {formatTime(toDate(sommeilEnCours.heureDebut))}
            </Text>
            <TouchableOpacity
              style={styles.timerButtonStop}
              onPress={handleStopSleep}
            >
              <Text style={styles.timerButtonText}>Terminer</Text>
            </TouchableOpacity>
          </View>
        )}

        {sommeilsLoaded && emptyDelayDone ? (
          groupedSommeils.length === 0 ? (
            <View style={styles.emptyContainer}>
              <Ionicons
                name="calendar-outline"
                size={64}
                color={Colors[colorScheme].tabIconDefault}
              />
              <ThemedText style={styles.emptyText}>
                {sommeils.length === 0
                  ? "Aucun sommeil enregistré"
                  : "Aucun sommeil pour ce filtre"}
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
              data={groupedSommeils}
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
        message="Cette entrée de sommeil sera supprimée définitivement."
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
  screen: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
  },
  headerBlock: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 8,
  },
  title: {
    fontSize: 22,
    fontWeight: "700",
  },
  subtitle: {
    fontSize: 13,
    marginTop: 4,
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
  timerCard: {
    marginHorizontal: 20,
    marginBottom: 16,
    borderRadius: 18,
    padding: 16,
    backgroundColor: "#f5f0ff",
    gap: 8,
  },
  timerTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#4c2c79",
  },
  timerValue: {
    fontSize: 28,
    fontWeight: "700",
    color: "#4c2c79",
  },
  timerSubtitle: {
    fontSize: 12,
    color: "#6b5c85",
  },
  timerActions: {
    flexDirection: "row",
    gap: 10,
    marginTop: 6,
  },
  timerButtonPrimary: {
    flex: 1,
    backgroundColor: "#6f42c1",
    paddingVertical: 10,
    borderRadius: 12,
    alignItems: "center",
  },
  timerButtonSecondary: {
    flex: 1,
    backgroundColor: "#efe7ff",
    paddingVertical: 10,
    borderRadius: 12,
    alignItems: "center",
  },
  timerButtonStop: {
    marginTop: 8,
    backgroundColor: "#6f42c1",
    paddingVertical: 10,
    borderRadius: 12,
    alignItems: "center",
  },
  timerButtonText: {
    color: "#fff",
    fontWeight: "700",
  },
  timerButtonTextSecondary: {
    color: "#6f42c1",
    fontWeight: "700",
  },
  loadingContainer: {
    paddingVertical: 40,
    alignItems: "center",
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
  dayStatValueAccent: {
    color: eventColors.sommeil.dark,
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
    backgroundColor: eventColors.sommeil.light + "40",
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
  sleepIconText: {
    fontSize: 11,
    fontWeight: "700",
    color: eventColors.sommeil.dark,
  },
  sleepIconTextNight: {
    fontSize: 12,
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
  sessionDetailMuted: {
    fontSize: 12,
    color: "#9ca3af",
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
    color: eventColors.sommeil.dark,
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
    color: eventColors.sommeil.dark,
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
  segmentRow: {
    flexDirection: "row",
    gap: 8,
  },
  segmentButton: {
    flex: 1,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    paddingVertical: 8,
    alignItems: "center",
    backgroundColor: "#f9fafb",
  },
  segmentActive: {
    backgroundColor: "#fff",
    borderWidth: 1,
  },
  segmentText: {
    fontSize: 13,
    color: "#6b7280",
    fontWeight: "600",
  },
  segmentTextActive: {
    color: "#4c2c79",
    fontWeight: "700",
  },
  rowBetween: {
    flexDirection: "row",
    gap: 10,
  },
  dateButton: {
    flex: 1,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    paddingVertical: 10,
    alignItems: "center",
  },
  dateButtonDisabled: {
    opacity: 0.5,
  },
  dateButtonText: {
    fontSize: 12,
    color: "#6b7280",
    fontWeight: "600",
  },
  checkboxRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  checkbox: {
    width: 18,
    height: 18,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: "#d1d5db",
    alignItems: "center",
    justifyContent: "center",
  },
  checkboxChecked: {
    backgroundColor: "#6f42c1",
    borderColor: "#6f42c1",
  },
  checkboxLabel: {
    fontSize: 12,
    color: "#6b7280",
    fontWeight: "600",
  },
  selectedDateTime: {
    alignItems: "center",
    gap: 4,
  },
  selectedDate: {
    fontSize: 13,
    fontWeight: "600",
    color: "#4b5563",
    textTransform: "capitalize",
  },
  selectedTime: {
    fontSize: 14,
    fontWeight: "700",
    color: "#4c2c79",
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
  inputGroup: {
    gap: 6,
  },
  inputLabel: {
    fontSize: 12,
    fontWeight: "700",
    color: "#6b7280",
  },
  input: {
    borderWidth: 1,
    borderColor: "#e5e7eb",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
});
