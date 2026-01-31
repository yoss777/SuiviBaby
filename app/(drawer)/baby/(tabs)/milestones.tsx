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
  ajouterJalon,
  modifierJalon,
  supprimerJalon,
} from "@/migration/eventsDoubleWriteService";
import {
  ecouterJalonsHybrid,
  getNextEventDateBeforeHybrid,
  hasMoreEventsBeforeHybrid,
} from "@/migration/eventsHybridService";
import { JalonEvent } from "@/services/eventsService";
import { Ionicons } from "@expo/vector-icons";
import FontAwesome5 from "@expo/vector-icons/FontAwesome5";
import FontAwesome from "@expo/vector-icons/FontAwesome6";
import DateTimePicker from "@react-native-community/datetimepicker";
import { HeaderBackButton } from "@react-navigation/elements";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import * as ImagePicker from "expo-image-picker";
import { router, useLocalSearchParams } from "expo-router";
import * as FileSystem from "expo-file-system";
import { auth } from "@/config/firebase";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  BackHandler,
  FlatList,
  Image,
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

type JalonType =
  | "dent"
  | "pas"
  | "sourire"
  | "mot"
  | "humeur"
  | "photo"
  | "autre";

type FilterType = "today" | "past";

type MilestoneEventWithId = JalonEvent & { id: string };

type MilestoneGroup = {
  date: string;
  events: MilestoneEventWithId[];
  counts: Record<JalonType, number>;
  lastEvent: MilestoneEventWithId;
};

const TYPE_CONFIG: Record<
  JalonType,
  { label: string; color: string; icon: string; defaultTitle: string }
> = {
  dent: {
    label: "Première dent",
    color: eventColors.jalon.dark,
    icon: "tooth",
    defaultTitle: "Première dent",
  },
  pas: {
    label: "Premiers pas",
    color: eventColors.jalon.dark,
    icon: "shoe-prints",
    defaultTitle: "Premiers pas",
  },
  sourire: {
    label: "Premier sourire",
    color: eventColors.jalon.dark,
    icon: "face-smile",
    defaultTitle: "Premier sourire",
  },
  mot: {
    label: "Premiers mots",
    color: eventColors.jalon.dark,
    icon: "comment-dots",
    defaultTitle: "Premiers mots",
  },
  humeur: {
    label: "Humeur",
    color: eventColors.jalon.dark,
    icon: "heart",
    defaultTitle: "Humeur du jour",
  },
  photo: {
    label: "Moment photo",
    color: eventColors.jalon.dark,
    icon: "camera",
    defaultTitle: "Un beau moment",
  },
  autre: {
    label: "Autre moment",
    color: eventColors.jalon.dark,
    icon: "star",
    defaultTitle: "Moment important",
  },
};

const MOOD_OPTIONS: {
  value: 1 | 2 | 3 | 4 | 5;
  emoji: string;
  label: string;
}[] = [
  { value: 1, emoji: "😢", label: "Difficile" },
  { value: 2, emoji: "😐", label: "Mitigé" },
  { value: 3, emoji: "🙂", label: "OK" },
  { value: 4, emoji: "😄", label: "Content" },
  { value: 5, emoji: "🥰", label: "Rayonnant" },
];

const formatDateKey = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(
    date.getDate(),
  ).padStart(2, "0")}`;

const formatTime = (date: Date) =>
  date.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });

const toDate = (value: any) => {
  if (value?.seconds) return new Date(value.seconds * 1000);
  if (value?.toDate) return value.toDate();
  if (value instanceof Date) return value;
  return new Date(value);
};

const FIREBASE_STORAGE_BUCKET = "samaye-53723.firebasestorage.app";

const uploadMilestonePhoto = async (
  childId: string,
  uri: string,
  onProgress?: (progress: number) => void
): Promise<string> => {
  try {
    console.log("[UPLOAD] Début upload photo pour child:", childId);
    console.log("[UPLOAD] URI:", uri);

    // Déterminer l'extension du fichier
    const extension = uri.split(".").pop()?.split("?")[0] || "jpg";
    const fileName = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const filePath = `children/${childId}/jalons/${fileName}.${extension}`;
    console.log("[UPLOAD] Path cible:", filePath);

    // Lire le fichier en base64 avec expo-file-system
    console.log("[UPLOAD] Lecture du fichier en base64...");
    const base64Data = await FileSystem.readAsStringAsync(uri, {
      encoding: FileSystem.EncodingType.Base64,
    });
    console.log("[UPLOAD] Fichier lu, taille base64:", base64Data.length);

    onProgress?.(10);

    // Obtenir le token d'authentification
    const user = auth.currentUser;
    if (!user) {
      throw new Error("Utilisateur non connecté");
    }
    const token = await user.getIdToken();
    console.log("[UPLOAD] Token obtenu");

    onProgress?.(20);

    // Upload via l'API REST de Firebase Storage
    const uploadUrl = `https://firebasestorage.googleapis.com/v0/b/${FIREBASE_STORAGE_BUCKET}/o?uploadType=media&name=${encodeURIComponent(filePath)}`;

    console.log("[UPLOAD] Démarrage upload REST API...");

    const response = await FileSystem.uploadAsync(uploadUrl, uri, {
      httpMethod: "POST",
      uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "image/jpeg",
      },
    });

    console.log("[UPLOAD] Réponse status:", response.status);

    if (response.status !== 200) {
      console.error("[UPLOAD] Erreur réponse:", response.body);
      throw new Error(`Upload failed with status ${response.status}`);
    }

    onProgress?.(80);

    // Parser la réponse pour obtenir le nom du fichier
    const responseData = JSON.parse(response.body);
    console.log("[UPLOAD] Upload terminé, fichier:", responseData.name);

    // Construire l'URL de téléchargement
    const downloadURL = `https://firebasestorage.googleapis.com/v0/b/${FIREBASE_STORAGE_BUCKET}/o/${encodeURIComponent(responseData.name)}?alt=media&token=${responseData.downloadTokens}`;
    console.log("[UPLOAD] URL obtenue:", downloadURL);

    onProgress?.(100);
    return downloadURL;
  } catch (error) {
    console.error("[UPLOAD] Erreur:", error);
    console.error("[UPLOAD] Code:", (error as any).code);
    console.error("[UPLOAD] Message:", (error as any).message);
    throw error;
  }
};

// ============================================
// COMPONENT
// ============================================

export default function MilestonesScreen() {
  const { activeChild } = useBaby();
  const { setHeaderRight } = useHeaderRight();
  const { setHeaderLeft } = useHeaderLeft();
  const colorScheme = useColorScheme() ?? "light";
  const colors = Colors[colorScheme];
  const { openSheet, closeSheet, viewProps, isOpen } = useSheet();
  const { showAlert } = useModal();
  const navigation = useNavigation();
  const headerOwnerId = useRef(
    `milestones-${Math.random().toString(36).slice(2)}`,
  );

  const { openModal, editId, returnTo, type } = useLocalSearchParams();
  const returnTargetParam = Array.isArray(returnTo) ? returnTo[0] : returnTo;
  const sheetOwnerId = "milestones";
  const isSheetActive = viewProps?.ownerId === sheetOwnerId;

  const [showCalendar, setShowCalendar] = useState(false);
  const [selectedFilter, setSelectedFilter] = useState<FilterType | null>(null);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [layoutReady, setLayoutReady] = useState(false);
  const [pendingOpen, setPendingOpen] = useState(false);
  const [pendingMode, setPendingMode] = useState<"add" | "edit" | null>(null);

  const [events, setEvents] = useState<MilestoneEventWithId[]>([]);
  const [groupedEvents, setGroupedEvents] = useState<MilestoneGroup[]>([]);
  const [expandedDays, setExpandedDays] = useState<Set<string>>(new Set());
  const [loaded, setLoaded] = useState({ jalons: false });
  const [emptyDelayDone, setEmptyDelayDone] = useState(false);
  const [daysWindow, setDaysWindow] = useState(14);
  const [rangeEndDate, setRangeEndDate] = useState<Date | null>(null);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [autoLoadMore, setAutoLoadMore] = useState(false);
  const [autoLoadMoreAttempts, setAutoLoadMoreAttempts] = useState(0);
  const loadMoreVersionRef = useRef(0);
  const pendingLoadMoreRef = useRef(0);

  const [editingMilestone, setEditingMilestone] =
    useState<MilestoneEventWithId | null>(null);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [typeJalon, setTypeJalon] = useState<JalonType>("dent");
  const [title, setTitle] = useState("");
  const [titleTouched, setTitleTouched] = useState(false);
  const [titleError, setTitleError] = useState(false);
  const [description, setDescription] = useState("");
  const [note, setNote] = useState("");
  const [dateHeure, setDateHeure] = useState<Date>(new Date());
  const [showDate, setShowDate] = useState(false);
  const [showTime, setShowTime] = useState(false);
  const [mood, setMood] = useState<1 | 2 | 3 | 4 | 5 | null>(null);
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [photoUploading, setPhotoUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);

  const editIdRef = useRef<string | null>(null);
  const returnToRef = useRef<string | null>(null);
  const pendingTypeRef = useRef<JalonType | null>(null);

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
        setExpandedDays(new Set([formatDateKey(today)]));
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

  const handleAddPress = useCallback(() => {
    pendingTypeRef.current = "dent";
    setPendingMode("add");
    setPendingOpen(true);
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
          <Pressable onPress={handleAddPress} style={styles.headerButton}>
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
      handleAddPress,
      showCalendar,
      colorScheme,
      setHeaderRight,
    ]),
  );

  useFocusEffect(
    useCallback(() => {
      const returnTarget = returnTargetParam ?? returnToRef.current;
      const backButton = (
        <HeaderBackButton
          onPress={() => {
            if (returnTarget === "home") {
              router.replace("/baby/home");
              return;
            }
            if (returnTarget === "chrono" || returnTarget === "journal") {
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
        const returnTarget = returnTargetParam ?? returnToRef.current;
        if (returnTarget === "home") {
          router.replace("/baby/home");
          return true;
        }
        if (returnTarget === "chrono" || returnTarget === "journal") {
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

    const unsubscribe = ecouterJalonsHybrid(
      activeChild.id,
      (data) => {
        setEvents(data as MilestoneEventWithId[]);
        setLoaded({ jalons: true });

        if (
          pendingLoadMoreRef.current > 0 &&
          versionAtSubscribe === loadMoreVersionRef.current
        ) {
          pendingLoadMoreRef.current = 0;
          setIsLoadingMore(false);
        }
      },
      { waitForServer: true, depuis: startOfRange, jusqu: endOfRange },
    );

    return () => unsubscribe();
  }, [activeChild?.id, daysWindow, rangeEndDate]);

  useEffect(() => {
    if (!activeChild?.id) return;

    setEvents([]);
    setGroupedEvents([]);
    setLoaded({ jalons: false });
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
    if (!loaded.jalons) {
      setEmptyDelayDone(false);
      return;
    }
    if (groupedEvents.length > 0) {
      setEmptyDelayDone(true);
      return;
    }
    const timer = setTimeout(() => setEmptyDelayDone(true), 300);
    return () => clearTimeout(timer);
  }, [loaded.jalons, groupedEvents.length]);

  // ============================================
  // FILTERS
  // ============================================
  useFocusEffect(
    useCallback(() => {
      if (!selectedFilter && !selectedDate) {
        applyTodayFilter();
      }
    }, [applyTodayFilter, selectedDate, selectedFilter]),
  );

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

  const handleDateSelect = (day: DateData) => {
    setSelectedDate(day.dateString);
    setSelectedFilter(null);
    setShowCalendar(false);
    setExpandedDays(new Set([day.dateString]));
  };

  const filteredEvents = useMemo(() => {
    if (!selectedFilter && !selectedDate) return events;

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayTime = today.getTime();

    return events.filter((item) => {
      const date = toDate(item.date);
      date.setHours(0, 0, 0, 0);
      const time = date.getTime();
      if (selectedFilter === "today") return time === todayTime;
      if (selectedFilter === "past") return time < todayTime;
      if (selectedDate) return formatDateKey(date) === selectedDate;
      return true;
    });
  }, [events, selectedFilter, selectedDate]);

  useEffect(() => {
    const groups: Record<string, MilestoneGroup> = {};
    filteredEvents.forEach((event) => {
      const key = formatDateKey(toDate(event.date));
      if (!groups[key]) {
        groups[key] = {
          date: key,
          events: [],
          counts: {
            dent: 0,
            pas: 0,
            sourire: 0,
            mot: 0,
            humeur: 0,
            photo: 0,
            autre: 0,
          },
          lastEvent: event,
        };
      }
      groups[key].events.push(event);
      groups[key].counts[event.typeJalon] += 1;
      if (toDate(event.date) > toDate(groups[key].lastEvent.date)) {
        groups[key].lastEvent = event;
      }
    });

    const sorted = Object.values(groups).sort(
      (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
    );

    sorted.forEach((group) => {
      group.events.sort(
        (a, b) => toDate(b.date).getTime() - toDate(a.date).getTime(),
      );
    });

    setGroupedEvents(sorted);
  }, [filteredEvents]);

  // ============================================
  // LOAD MORE
  // ============================================
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
    hasMoreEventsBeforeHybrid(activeChild.id, ["jalon"], beforeDate)
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
          ["jalon"],
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
    if (loaded.jalons && groupedEvents.length === 0 && hasMore) {
      setAutoLoadMore(true);
      setAutoLoadMoreAttempts(0);
    }
  }, [
    loaded.jalons,
    groupedEvents.length,
    hasMore,
    selectedFilter,
    selectedDate,
  ]);

  useEffect(() => {
    if (!autoLoadMore) return;
    if (!loaded.jalons || isLoadingMore) return;
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
    loaded.jalons,
    isLoadingMore,
    groupedEvents.length,
    hasMore,
    autoLoadMoreAttempts,
    loadMoreStep,
  ]);

  // ============================================
  // FORM HELPERS
  // ============================================
  const resetForm = useCallback(() => {
    setTypeJalon("dent");
    setTitle("");
    setTitleTouched(false);
    setTitleError(false);
    setDescription("");
    setNote("");
    setDateHeure(new Date());
    setMood(null);
    setPhotoUri(null);
    setPhotoUploading(false);
    setUploadProgress(0);
    setShowDate(false);
    setShowTime(false);
    setEditingMilestone(null);
  }, []);

  useEffect(() => {
    if (typeJalon !== "autre") {
      setTitle("");
      setTitleTouched(false);
      setTitleError(false);
    }
  }, [typeJalon]);

  const handlePickPhoto = useCallback(async () => {
    try {
      const permission =
        await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        showAlert("Accès refusé", "Autorisez l'accès aux photos.");
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        quality: 0.8,
        allowsEditing: true,
        aspect: [4, 3],
      });

      if (!result.canceled && result.assets?.[0]?.uri) {
        setPhotoUri(result.assets[0].uri);
      }
    } catch (error) {
      console.error("Erreur sélection photo:", error);
      showAlert("Erreur", "Impossible d'ajouter la photo.");
    }
  }, [showAlert]);

  const renderSheetContent = useCallback(() => {
    return (
      <View style={styles.sheetContent}>
        {/* Type Picker en premier */}
        <View style={styles.typeRow}>
          {(Object.keys(TYPE_CONFIG) as JalonType[]).map((type) => {
            const config = TYPE_CONFIG[type];
            const active = typeJalon === type;
            return (
              <TouchableOpacity
                key={type}
                style={[styles.typeChip, active && styles.typeChipActive]}
                onPress={() => {
                  setTypeJalon(type);
                  if (type === "autre") {
                    setTitle("");
                    setTitleTouched(false);
                  } else {
                    setTitle("");
                    setTitleTouched(false);
                  }
                }}
              >
                <Text
                  style={[
                    styles.typeChipText,
                    active && styles.typeChipTextActive,
                  ]}
                >
                  {config.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Titre (seulement pour Autre moment) */}
        {typeJalon === "autre" && (
          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>Titre</Text>
            <TextInput
              value={title}
              onChangeText={(value) => {
                setTitle(value);
                setTitleTouched(true);
                if (value.trim()) {
                  setTitleError(false);
                }
              }}
              placeholder="Ajouter un titre"
              style={[styles.input, titleError && styles.inputError]}
            />
          </View>
        )}

        {/* Description */}
        <View style={styles.inputGroup}>
          <Text style={styles.inputLabel}>Description</Text>
          <TextInput
            value={description}
            onChangeText={setDescription}
            placeholder="Ajouter un détail ou un souvenir..."
            style={styles.noteInput}
            multiline
          />
        </View>

        {/* Humeur (si type humeur) */}
        {typeJalon === "humeur" && (
          <View style={styles.chipSection}>
            <Text style={styles.chipLabel}>Humeur</Text>
            <View style={styles.chipRow}>
              {MOOD_OPTIONS.map((option) => {
                const active = mood === option.value;
                return (
                  <TouchableOpacity
                    key={option.value}
                    style={[styles.moodChip, active && styles.moodChipActive]}
                    onPress={() => setMood(option.value)}
                  >
                    <Text style={styles.moodEmoji}>{option.emoji}</Text>
                    <Text
                      style={[
                        styles.moodLabel,
                        active && styles.moodLabelActive,
                      ]}
                    >
                      {option.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        )}

        {/* Photo */}
        <View style={styles.inputGroup}>
          <Text style={styles.inputLabel}>Photo</Text>
          <View style={styles.photoRow}>
            {photoUri ? (
              <Image source={{ uri: photoUri }} style={styles.photoPreview} />
            ) : (
              <View style={styles.photoPlaceholder}>
                <FontAwesome name="image" size={18} color="#c7cbd1" />
                <Text style={styles.photoPlaceholderText}>Aucune photo</Text>
              </View>
            )}
            <View style={styles.photoActions}>
              <TouchableOpacity
                style={styles.photoButton}
                onPress={handlePickPhoto}
                activeOpacity={0.8}
              >
                <FontAwesome5 name="camera" size={14} color={colors.text} />
                <Text style={styles.photoButtonText}>Ajouter</Text>
              </TouchableOpacity>
              {photoUri ? (
                <TouchableOpacity
                  style={styles.photoButtonSecondary}
                  onPress={() => setPhotoUri(null)}
                  activeOpacity={0.8}
                >
                  <Text style={styles.photoButtonSecondaryText}>Retirer</Text>
                </TouchableOpacity>
              ) : null}
              {photoUploading ? (
                <Text style={styles.photoUploading}>
                  Téléversement... {uploadProgress > 0 ? `${uploadProgress}%` : ""}
                </Text>
              ) : null}
            </View>
          </View>
        </View>

        {/* Note */}
        <View style={styles.inputGroup}>
          <Text style={styles.inputLabel}>Note</Text>
          <TextInput
            value={note}
            onChangeText={setNote}
            placeholder="Ajouter une note personnelle..."
            style={styles.noteInput}
            multiline
          />
        </View>

        {/* Date et Heure */}
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

        {/* Date/heure sélectionnée */}
        <View style={styles.selectedDateTime}>
          <Text style={styles.selectedDate}>
            {`${dateHeure.toLocaleDateString("fr-FR", {
              weekday: "long",
              day: "numeric",
              month: "long",
            })} ${dateHeure.getFullYear()}`}
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
  }, [
    colors.text,
    dateHeure,
    description,
    handlePickPhoto,
    mood,
    note,
    photoUri,
    photoUploading,
    uploadProgress,
    showDate,
    showTime,
    title,
    titleTouched,
    typeJalon,
    colorScheme,
  ]);

  // ============================================
  // SUBMIT / DELETE
  // ============================================
  const handleSubmit = useCallback(async () => {
    if (!activeChild?.id || isSubmitting) return;
    try {
    if (typeJalon === "autre" && !title.trim()) {
      setTitleError(true);
      showAlert("Titre requis", "Ajoutez un titre pour Autre moment.");
      return;
    }
      setIsSubmitting(true);
      let photoUrls: string[] | undefined = photoUri ? [photoUri] : undefined;

      if (photoUri && !photoUri.startsWith("http")) {
        setPhotoUploading(true);
        setUploadProgress(0);
        const uploadedUrl = await uploadMilestonePhoto(
          activeChild.id,
          photoUri,
          (progress) => setUploadProgress(Math.round(progress))
        );
        photoUrls = [uploadedUrl];
      }

      const data = {
        date: dateHeure,
        typeJalon,
        titre:
          typeJalon === "autre" && title.trim() ? title.trim() : undefined,
        description: description.trim() ? description.trim() : undefined,
        note: note.trim() ? note.trim() : undefined,
        humeur: mood ?? undefined,
        photos: photoUrls,
      };

      if (editingMilestone) {
        await modifierJalon(activeChild.id, editingMilestone.id, data);
      } else {
        await ajouterJalon(activeChild.id, data);
      }

      closeSheet();
    } catch (error) {
      console.error("Erreur lors de la sauvegarde:", error);
      showAlert("Erreur", "Impossible de sauvegarder.");
    } finally {
      setPhotoUploading(false);
      setIsSubmitting(false);
    }
  }, [
    activeChild?.id,
    closeSheet,
    dateHeure,
    description,
    editingMilestone,
    isSubmitting,
    mood,
    note,
    photoUri,
    showAlert,
    title,
    typeJalon,
  ]);

  const confirmDelete = async () => {
    if (!editingMilestone || !activeChild?.id || isSubmitting) return;
    try {
      setIsSubmitting(true);
      await supprimerJalon(activeChild.id, editingMilestone.id);
      closeSheet();
    } catch (error) {
      console.error("Erreur suppression:", error);
      showAlert("Erreur", "Impossible de supprimer.");
    } finally {
      setIsSubmitting(false);
      setShowDeleteModal(false);
    }
  };

  const buildSheetProps = useCallback(() => {
    const isEditing = !!editingMilestone;
    const returnTarget = returnTargetParam ?? returnToRef.current;
    return {
      ownerId: sheetOwnerId,
      title: isEditing ? "Modifier le jalon" : "Nouveau jalon",
      icon: "star",
      accentColor: eventColors.jalon.dark,
      isEditing,
      isSubmitting,
      showActions: true,
      onSubmit: handleSubmit,
      onDelete: isEditing ? () => setShowDeleteModal(true) : undefined,
      onDismiss: () => {
        setIsSubmitting(false);
        editIdRef.current = null;
        setEditingMilestone(null);
        maybeReturnTo(returnTarget);
      },
      children: renderSheetContent(),
    };
  }, [
    editingMilestone,
    handleSubmit,
    isSubmitting,
    maybeReturnTo,
    returnTargetParam,
    renderSheetContent,
  ]);

  const openEditModal = useCallback((event: MilestoneEventWithId) => {
    setEditingMilestone(event);
    setTypeJalon(event.typeJalon);
    if (event.typeJalon === "autre") {
      setTitle(event.titre ?? "");
      setTitleTouched(true);
    } else {
      setTitle("");
      setTitleTouched(false);
    }
    setDescription(event.description ?? "");
    setNote(event.note ?? "");
    setDateHeure(toDate(event.date));
    setMood(event.humeur ?? null);
    setPhotoUri(event.photos?.[0] ?? null);
    setShowDate(false);
    setShowTime(false);
    setShowCalendar(false);
    setIsSubmitting(false);
    setPendingMode("edit");
    setPendingOpen(true);
  }, []);

  useEffect(() => {
    if (!isSheetActive) return;
    openSheet(buildSheetProps());
  }, [isSheetActive, openSheet, buildSheetProps]);

  useFocusEffect(
    useCallback(() => {
      if (openModal !== "true") return;
      const normalizedType = normalizeParam(type);
      pendingTypeRef.current =
        normalizedType && Object.keys(TYPE_CONFIG).includes(normalizedType)
          ? (normalizedType as JalonType)
          : "dent";
      setPendingMode("add");
      setPendingOpen(true);
    }, [openModal, type]),
  );

  useEffect(() => {
    if (!pendingOpen || !layoutReady) return;
    const task = InteractionManager.runAfterInteractions(() => {
      stashReturnTo();
      if (pendingMode !== "edit") {
        const pendingType = pendingTypeRef.current ?? "dent";
        resetForm();
        setTypeJalon(pendingType);
      }
      openSheet(buildSheetProps());
      navigation.setParams({
        openModal: undefined,
        editId: undefined,
        type: undefined,
        mode: undefined,
      });
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
    returnTargetParam,
    buildSheetProps,
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
    navigation.setParams({
      openModal: undefined,
      editId: undefined,
      type: undefined,
      mode: undefined,
    });
  }, [editId, layoutReady, events, navigation, openEditModal, stashReturnTo]);

  const markedDates = useMemo(() => {
    const marked: Record<string, any> = {};
    events.forEach((item) => {
      const dateKey = formatDateKey(toDate(item.date));
      marked[dateKey] = {
        marked: true,
        dotColor: eventColors.jalon.dark,
      };
    });
    if (selectedDate) {
      marked[selectedDate] = {
        ...marked[selectedDate],
        selected: true,
        selectedColor: Colors[colorScheme].tint,
        selectedTextColor: "#ffffff",
      };
    }
    if (selectedFilter === "today") {
      const todayKey = formatDateKey(new Date());
      marked[todayKey] = {
        ...marked[todayKey],
        selected: true,
        selectedColor: Colors[colorScheme].tint,
        selectedTextColor: "#ffffff",
      };
    }
    return marked;
  }, [events, selectedDate, selectedFilter, colorScheme]);

  // ============================================
  // RENDER HELPERS
  // ============================================
  const renderEventItem = (event: MilestoneEventWithId, isLast = false) => {
    const config = TYPE_CONFIG[event.typeJalon];
    const date = toDate(event.date);
    const moodEmoji =
      typeof event.humeur === "number"
        ? MOOD_OPTIONS.find((m) => m.value === event.humeur)?.emoji
        : null;
    const titleText =
      event.typeJalon === "autre"
        ? event.titre ?? TYPE_CONFIG.autre.label
        : TYPE_CONFIG[event.typeJalon].label;
    return (
      <Pressable
        key={event.id}
        style={({ pressed }) => [
          styles.sessionCard,
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
            {formatTime(date)}
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
        <View style={styles.sessionContent}>
        <View style={styles.sessionDetails}>
          {titleText ? (
            <Text style={styles.sessionType}>{titleText}</Text>
          ) : null}
          {event.description ? (
            <Text style={styles.sessionDetailText}>{event.description}</Text>
          ) : null}
          {event.typeJalon === "humeur" && moodEmoji ? (
            <Text style={styles.sessionMood}>{moodEmoji}</Text>
          ) : null}
        </View>
          {event.photos?.[0] ? (
            <Image
              source={{ uri: event.photos[0] }}
              style={styles.sessionPhoto}
            />
          ) : null}
        </View>
        <Ionicons name="chevron-forward" size={18} color="#d1d5db" />
      </Pressable>
    );
  };

  const toggleExpand = (dateKey: string) => {
    setExpandedDays((prev) => {
      const next = new Set(prev);
      if (next.has(dateKey)) {
        next.delete(dateKey);
      } else {
        next.add(dateKey);
      }
      return next;
    });
  };

  const renderDayGroup = ({ item }: { item: MilestoneGroup }) => {
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
    return (
      <View style={styles.dayGroup}>
        <View style={styles.dayHeader}>
          <Text style={styles.dayLabel}>{dayLabel}</Text>
          <View style={styles.dayStats}>
            <View style={styles.dayStatItem}>
              <Text style={styles.dayStatValue}>{item.events.length}</Text>
              <Text style={styles.dayStatLabel}>
                jalon{item.events.length > 1 ? "s" : ""}
              </Text>
            </View>
          </View>
        </View>

        <View style={styles.statsBreakdown}>
          {(Object.keys(TYPE_CONFIG) as JalonType[])
            .filter((type) => item.counts[type] > 0)
            .map((type) => (
              <View key={type} style={styles.statsBreakdownItem}>
                <View
                  style={[
                    styles.statsBreakdownDot,
                    { backgroundColor: TYPE_CONFIG[type].color },
                  ]}
                />
                <Text style={styles.statsBreakdownLabel}>
                  {TYPE_CONFIG[type].label}
                  {item.counts[type] > 1 ? "s" : ""}
                </Text>
                <Text style={styles.statsBreakdownValue}>
                  {item.counts[type]}
                </Text>
              </View>
            ))}
        </View>

        <View style={styles.dayContent}>
          <View style={styles.sessionsContainer}>
            {renderEventItem(item.lastEvent, true)}
            {item.events.length > 1 &&
              isExpanded &&
              item.events
                .filter((evt) => evt.id !== item.lastEvent.id)
                .map((evt) => renderEventItem(evt, false))}
            {item.events.length > 1 && (
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
                    : `${item.events.length - 1} autre${
                        item.events.length > 2 ? "s" : ""
                      } jalon${item.events.length > 2 ? "s" : ""}`}
                </Text>
                <Ionicons
                  name={isExpanded ? "chevron-up" : "chevron-down"}
                  size={14}
                  color={Colors[colorScheme].tint}
                />
              </Pressable>
            )}
          </View>
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
        style={styles.safeArea}
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
                current={selectedDate || undefined}
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

        {loaded.jalons && emptyDelayDone ? (
          groupedEvents.length === 0 ? (
            <View style={styles.emptyContainer}>
              <IconPulseDots color={Colors[colorScheme].tint} />
              <Text style={styles.emptyText}>
                {events.length === 0
                  ? "Aucun jalon enregistré"
                  : "Aucun jalon pour ce filtre"}
              </Text>
            </View>
          ) : (
            <FlatList
              data={groupedEvents}
              keyExtractor={(item) => item.date}
              renderItem={renderDayGroup}
              showsVerticalScrollIndicator={false}
              contentContainerStyle={styles.listContent}
              ListFooterComponent={
                <LoadMoreButton
                  loading={isLoadingMore || autoLoadMore}
                  hasMore={hasMore}
                  onPress={handleLoadMore}
                  accentColor={Colors[colorScheme].tint}
                />
              }
            />
          )
        ) : (
          <View style={styles.loadingContainer}>
            <IconPulseDots color={Colors[colorScheme].tint} />
            <Text style={styles.loadingText}>Chargement des jalons…</Text>
          </View>
        )}
      </SafeAreaView>

      <ConfirmModal
        visible={showDeleteModal}
        title="Supprimer"
        message="Ce jalon sera supprimé définitivement."
        confirmText="Supprimer"
        cancelText="Annuler"
        backgroundColor={Colors[colorScheme].background}
        textColor={Colors[colorScheme].text}
        confirmButtonColor="#dc3545"
        confirmTextColor="#fff"
        cancelButtonColor="#f1f3f5"
        cancelTextColor="#1f2937"
        onConfirm={confirmDelete}
        onCancel={() => setShowDeleteModal(false)}
      />
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
  safeArea: {
    flex: 1,
  },
  headerButtons: {
    flexDirection: "row",
    alignItems: "center",
    paddingRight: 16,
    gap: 0,
  },
  headerButton: {
    paddingHorizontal: 8,
    paddingVertical: 8,
    borderRadius: 8,
  },
  calendarContainer: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: "#e0e0e0",
  },
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 40,
  },
  loadingContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingTop: 24,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    color: "#6b7280",
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
  dayGroup: {
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
  dayContent: {
    gap: 10,
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
  sessionContent: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
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
  sessionTitle: {
    fontSize: 13,
    fontWeight: "600",
    color: "#374151",
  },
  sessionDetailText: {
    fontSize: 12,
    color: "#6b7280",
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
  sessionMood: {
    fontSize: 16,
  },
  sessionPhoto: {
    width: 44,
    height: 44,
    borderRadius: 10,
    backgroundColor: "#f3f4f6",
  },
  sheetContent: {
    gap: 12,
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
    fontSize: 14,
    color: "#111827",
  },
  inputError: {
    borderColor: "#dc3545",
  },
  noteInput: {
    borderWidth: 1,
    borderColor: "#e5e7eb",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: "#111827",
    minHeight: 80,
    textAlignVertical: "top",
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
    borderColor: eventColors.jalon.dark,
  },
  typeChipText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#6b7280",
  },
  typeChipTextActive: {
    color: eventColors.jalon.dark,
    fontWeight: "700",
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
  moodChip: {
    alignItems: "center",
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    backgroundColor: "#f9fafb",
    minWidth: 68,
  },
  moodChipActive: {
    borderColor: eventColors.jalon.dark,
    backgroundColor: "#ede7f6",
  },
  moodEmoji: {
    fontSize: 18,
  },
  moodLabel: {
    fontSize: 11,
    color: "#6b7280",
    fontWeight: "600",
  },
  moodLabelActive: {
    color: eventColors.jalon.dark,
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
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#d7dbe0",
    backgroundColor: "#f5f6f8",
    paddingVertical: 12,
    alignItems: "center",
    justifyContent: "center",
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
    color: "#333",
    fontWeight: "600",
    marginBottom: 4,
    textTransform: "capitalize",
  },
  selectedTime: {
    fontSize: 20,
    color: "#374151",
    fontWeight: "600",
  },
  photoRow: {
    flexDirection: "row",
    gap: 12,
    alignItems: "center",
  },
  photoPreview: {
    width: 88,
    height: 66,
    borderRadius: 12,
    backgroundColor: "#f3f4f6",
  },
  photoPlaceholder: {
    width: 88,
    height: 66,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    backgroundColor: "#f9fafb",
  },
  photoPlaceholderText: {
    fontSize: 11,
    color: "#9ca3af",
  },
  photoActions: {
    gap: 8,
    flex: 1,
  },
  photoButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    backgroundColor: "#fff",
  },
  photoButtonText: {
    fontSize: 13,
    color: "#111827",
    fontWeight: "600",
  },
  photoButtonSecondary: {
    alignSelf: "flex-start",
  },
  photoButtonSecondaryText: {
    fontSize: 12,
    color: "#9ca3af",
  },
  photoUploading: {
    fontSize: 12,
    color: eventColors.jalon.dark,
  },
});
