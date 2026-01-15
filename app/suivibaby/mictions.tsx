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
  ajouterMiction,
  modifierMiction,
  supprimerMiction,
} from "@/migration/eventsDoubleWriteService";
import { Ionicons } from "@expo/vector-icons";
import FontAwesome from "@expo/vector-icons/FontAwesome5";
import BottomSheet from "@gorhom/bottom-sheet";
import DateTimePicker from "@react-native-community/datetimepicker";
import { useNetInfo } from "@react-native-community/netinfo";
import { router, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  FlatList,
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
import { useHeaderRight } from "../(drawer)/_layout";

// ============================================
// TYPES
// ============================================
type FilterType = "today" | "past";

interface Miction {
  id: string;
  date: { seconds: number };
  createdAt: { seconds: number };
}

interface MictionGroup {
  date: string;
  dateFormatted: string;
  mictions: Miction[];
  lastMiction: Miction;
}

type Props = {
  mictions: Miction[];
};

// ============================================
// COMPONENT
// ============================================

export default function MictionsScreen({ mictions }: Props) {
  const { activeChild } = useBaby();
  const { setHeaderRight } = useHeaderRight();
  const colorScheme = useColorScheme() ?? "light";
  const { showToast } = useToast();
  const netInfo = useNetInfo();
  const isOffline =
    netInfo.isInternetReachable === false || netInfo.isConnected === false;

  const [showCalendar, setShowCalendar] = useState(false);
  const [selectedFilter, setSelectedFilter] = useState<FilterType | null>(null);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  // États des données
  const [groupedMictions, setGroupedMictions] = useState<MictionGroup[]>([]);
  const [expandedDays, setExpandedDays] = useState<Set<string>>(new Set());
  const [mictionsLoaded, setMictionsLoaded] = useState(false);
  const [emptyDelayDone, setEmptyDelayDone] = useState(false);
  const [daysWindow, setDaysWindow] = useState(14);
  const [hasMore, setHasMore] = useState(true);
  const [autoLoadMore, setAutoLoadMore] = useState(false);
  const [autoLoadMoreAttempts, setAutoLoadMoreAttempts] = useState(0);

  // États du formulaire
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [editingMiction, setEditingMiction] = useState<Miction | null>(null);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [dateHeure, setDateHeure] = useState<Date>(new Date());

  // États des pickers
  const [showDate, setShowDate] = useState(false);
  const [showTime, setShowTime] = useState(false);

  // Récupérer les paramètres de l'URL
  const { openModal } = useLocalSearchParams();

  // Ref pour le BottomSheet
  const bottomSheetRef = useRef<BottomSheet>(null);

  // ============================================
  // EFFECTS - HEADER
  // ============================================

  const handleCalendarPress = useCallback(() => {
    setShowCalendar((prev) => {
      const newValue = !prev;

      if (newValue) {
        const today = new Date();
        const todayString = `${today.getFullYear()}-${String(
          today.getMonth() + 1
        ).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
        setSelectedDate(todayString);
        setSelectedFilter(null);
      }

      return newValue;
    });
  }, []);

  const openAddModal = useCallback(() => {
    setDateHeure(new Date());
    setEditingMiction(null);
    setIsSubmitting(false);
    bottomSheetRef.current?.expand();
  }, []);

  useEffect(() => {
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
        <Pressable onPress={() => openAddModal()} style={styles.headerButton}>
          <Ionicons name="add" size={24} color={Colors[colorScheme].tint} />
        </Pressable>
      </View>
    );

    setHeaderRight(headerButtons);

    return () => {
      setHeaderRight(null);
    };
  }, [
    handleCalendarPress,
    showCalendar,
    colorScheme,
    setHeaderRight,
    openAddModal,
  ]);

  // ============================================
  // EFFECTS - URL PARAMS
  // ============================================

  useEffect(() => {
    if (openModal === "true") {
      const timer = setTimeout(() => {
        openAddModal();
        router.replace("/(drawer)/baby/excretions");
      }, 100);

      return () => clearTimeout(timer);
    }
  }, [openModal, openAddModal]);

  useEffect(() => {
    setMictionsLoaded(false);
    setEmptyDelayDone(false);
    setDaysWindow(14);
    setHasMore(true);
    setAutoLoadMore(false);
    setAutoLoadMoreAttempts(0);
  }, [activeChild?.id]);

  useEffect(() => {
    if (!activeChild?.id) return;
    setMictionsLoaded(true);
  }, [activeChild?.id, mictions]);

  useEffect(() => {
    if (!mictionsLoaded) {
      setEmptyDelayDone(false);
      return;
    }
    if (groupedMictions.length > 0) {
      setEmptyDelayDone(true);
      return;
    }
    const timer = setTimeout(() => setEmptyDelayDone(true), 300);
    return () => clearTimeout(timer);
  }, [mictionsLoaded, groupedMictions.length]);

  const startOfRange = useMemo(() => {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    start.setDate(start.getDate() - (daysWindow - 1));
    return start;
  }, [daysWindow]);

  const visibleMictions = useMemo(
    () =>
      mictions.filter((miction) => {
        const mictionDate = new Date(miction.date.seconds * 1000);
        return mictionDate >= startOfRange;
      }),
    [mictions, startOfRange]
  );

  useEffect(() => {
    if (!mictionsLoaded) return;
    // Recalculer hasMore uniquement quand la fenêtre change pour éviter les rafraîchissements inutiles.
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    start.setDate(start.getDate() - (daysWindow - 1));
    const hasOlder = mictions.some((miction) => {
      const mictionDate = new Date(miction.date.seconds * 1000);
      return mictionDate < start;
    });
    setHasMore(hasOlder);
  }, [daysWindow, mictionsLoaded]);

  const handleLoadMore = useCallback(() => {
    if (!hasMore) return;
    setAutoLoadMore(true);
    setAutoLoadMoreAttempts(0);
    setDaysWindow((prev) => prev + 14);
  }, [hasMore]);

  useEffect(() => {
    if (selectedFilter === "today" || selectedDate) return;
    if (!autoLoadMore && mictionsLoaded && groupedMictions.length === 0 && hasMore) {
      setAutoLoadMore(true);
      setAutoLoadMoreAttempts(0);
    }
  }, [
    autoLoadMore,
    mictionsLoaded,
    groupedMictions.length,
    hasMore,
    selectedFilter,
    selectedDate,
  ]);

  useEffect(() => {
    if (!autoLoadMore) return;
    if (!mictionsLoaded) return;
    if (groupedMictions.length > 0 || !hasMore) {
      setAutoLoadMore(false);
      setAutoLoadMoreAttempts(0);
      return;
    }
    if (autoLoadMoreAttempts >= MAX_AUTO_LOAD_ATTEMPTS) {
      setAutoLoadMore(false);
      return;
    }
    setAutoLoadMoreAttempts((prev) => prev + 1);
    setDaysWindow((prev) => prev + 14);
  }, [
    autoLoadMore,
    mictionsLoaded,
    groupedMictions.length,
    hasMore,
    autoLoadMoreAttempts,
  ]);

  // ============================================
  // EFFECTS - DATA LISTENERS
  // ============================================

  useEffect(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayTime = today.getTime();

    const filtered = visibleMictions.filter((miction) => {
      const mictionDate = new Date(miction.date.seconds * 1000);
      mictionDate.setHours(0, 0, 0, 0);
      const mictionTime = mictionDate.getTime();

      if (selectedDate) {
        const [calYear, calMonth, calDay] = selectedDate.split("-").map(Number);
        const calDate = new Date(calYear, calMonth - 1, calDay);
        calDate.setHours(0, 0, 0, 0);
        return mictionTime === calDate.getTime();
      }

      switch (selectedFilter) {
        case "today":
          return mictionTime === todayTime;
        case "past":
          return mictionTime < todayTime;
        case null:
        default:
          return true;
      }
    });

    const grouped = groupMictionsByDay(filtered);
    setGroupedMictions(grouped);
  }, [visibleMictions, selectedFilter, selectedDate, showCalendar]);

  // ============================================
  // HELPERS - CALENDAR
  // ============================================

  const markedDates = useMemo(() => {
    const marked: Record<string, any> = {};

    visibleMictions.forEach((miction) => {
      const date = new Date(miction.date.seconds * 1000);
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, "0");
      const day = String(date.getDate()).padStart(2, "0");
      const dateKey = `${year}-${month}-${day}`;

      marked[dateKey] = {
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
  }, [visibleMictions, selectedDate, colorScheme]);

  const handleDateSelect = (day: DateData) => {
    setSelectedDate(day.dateString);
    setExpandedDays(new Set([day.dateString]));
  };

  const handleFilterPress = (filter: FilterType) => {
    setSelectedFilter(filter);
    setSelectedDate(null);
    setShowCalendar(false);

    if (filter === "today") {
      const today = new Date();
      const todayKey = `${today.getFullYear()}-${String(
        today.getMonth() + 1
      ).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
      setExpandedDays(new Set([todayKey]));
    } else {
      setExpandedDays(new Set());
    }
  };

  // ============================================
  // HELPERS - GROUPING
  // ============================================

  const groupMictionsByDay = (mictions: Miction[]): MictionGroup[] => {
    const groups: { [key: string]: Miction[] } = {};

    mictions.forEach((miction) => {
      const date = new Date(miction.date?.seconds * 1000);
      const dateKey = `${date.getFullYear()}-${String(
        date.getMonth() + 1
      ).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;

      if (!groups[dateKey]) {
        groups[dateKey] = [];
      }
      groups[dateKey].push(miction);
    });

    return Object.entries(groups)
      .map(([dateKey, mictions]) => {
        const date = new Date(dateKey);
        const lastMiction = mictions.reduce((latest, current) =>
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
          mictions: mictions.sort(
            (a, b) => (b.date?.seconds || 0) - (a.date?.seconds || 0)
          ),
          lastMiction,
        };
      })
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
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

  // ============================================
  // HANDLERS - MODAL
  // ============================================

  const openEditModal = (miction: Miction) => {
    setDateHeure(new Date(miction.date.seconds * 1000));
    setEditingMiction(miction);
    setIsSubmitting(false);
    bottomSheetRef.current?.expand();
  };

  const closeModal = () => {
    bottomSheetRef.current?.close();
    setIsSubmitting(false);
    setEditingMiction(null);
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

      if (editingMiction) {
        await modifierMiction(activeChild.id, editingMiction.id, {
          date: dateHeure,
        });
      } else {
        await ajouterMiction(activeChild.id, {
          date: dateHeure,
        });
      }

      if (isOffline) {
        showToast(
          editingMiction
            ? "Modification en attente de synchronisation"
            : "Ajout en attente de synchronisation"
        );
      }
      closeModal();
    } catch (error) {
      console.error("Erreur lors de la sauvegarde de la miction:", error);
      Alert.alert(
        "Erreur",
        "Impossible de sauvegarder la miction. Veuillez réessayer."
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = () => {
    if (isSubmitting || !editingMiction || !activeChild) return;
    setShowDeleteModal(true);
  };

  const confirmDelete = async () => {
    if (isSubmitting || !editingMiction || !activeChild) return;

    try {
      setIsSubmitting(true);
      await supprimerMiction(activeChild.id, editingMiction.id);
      if (isOffline) {
        showToast("Suppression en attente de synchronisation");
      }
      setShowDeleteModal(false);
      closeModal();
    } catch (error) {
      console.error("Erreur lors de la suppression:", error);
      Alert.alert("Erreur", "Impossible de supprimer la miction. Veuillez réessayer.");
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
  // RENDER - MICTION ITEM
  // ============================================

  const renderMictionItem = (miction: Miction, isLast: boolean = false) => (
    <TouchableOpacity
      key={miction.id}
      style={[styles.mictionItem, isLast && styles.lastMictionItem]}
      onPress={() => openEditModal(miction)}
      activeOpacity={0.7}
    >
      <View style={styles.mictionContent}>
        <FontAwesome
          name="clock"
          size={16}
          color={isLast ? "#17a2b8" : "#666"}
        />
        <Text style={[styles.timeText, isLast && styles.lastTimeText]}>
          {new Date(miction.date?.seconds * 1000).toLocaleTimeString("fr-FR", {
            hour: "2-digit",
            minute: "2-digit",
          })}
        </Text>
        <View style={styles.mictionActions}>
          {/* {isLast && (
            <View style={styles.recentBadge}>
              <Text style={styles.recentText}>Récent</Text>
            </View>
          )} */}
          <FontAwesome
            name="edit"
            size={16}
            color="#17a2b8"
            style={styles.editIcon}
          />
        </View>
      </View>
    </TouchableOpacity>
  );

  // ============================================
  // RENDER - DAY GROUP
  // ============================================

const renderDayGroup = ({ item }: { item: MictionGroup }) => {
    const isExpanded = expandedDays.has(item.date);
    const hasMultipleMictions = item.mictions.length > 1;

    return (
      <View style={styles.dayCard}>
        <View style={styles.dayHeader}>
          <View style={styles.dayInfo}>
            <Text style={styles.dayDate}>{item.dateFormatted}</Text>
            <View style={styles.summaryInfo}>
              <FontAwesome name="water" size={14} color="#666" />
              <Text style={styles.summaryText}>
                {item.mictions.length} miction{item.mictions.length > 1 ? "s" : ""}
              </Text>
            </View>
          </View>
          {hasMultipleMictions && (
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

        {renderMictionItem(item.lastMiction, true)}

        {hasMultipleMictions && isExpanded && (
          <View style={styles.expandedContent}>
            <View style={styles.separator} />
            <Text style={styles.historyLabel}>Historique du jour</Text>
            {item.mictions
              .filter((miction) => miction.id !== item.lastMiction.id)
              .map((miction) => renderMictionItem(miction))}
          </View>
        )}
      </View>
    );
  };

  // ============================================
  // RENDER - MAIN
  // ============================================

  return (
    <View style={styles.container}>
      <SafeAreaView
        style={[
          { flex: 1 },
          { backgroundColor: Colors[colorScheme].background },
        ]}
        edges={["bottom"]}
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

        {/* Liste des mictions */}
        {!mictionsLoaded || !emptyDelayDone ? (
          <View style={styles.emptyContainer}>
            <IconPulseDots color={Colors[colorScheme].tint} />
          </View>
        ) : groupedMictions.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Ionicons
              name="calendar-outline"
              size={64}
              color={Colors[colorScheme].tabIconDefault}
            />
            <ThemedText style={styles.emptyText}>
              {mictions.length === 0
                ? "Aucune miction enregistrée"
                : "Aucune miction pour ce filtre"}
            </ThemedText>
            {!(selectedFilter === "today" || selectedDate) && (
              <LoadMoreButton
                hasMore={hasMore}
                loading={false}
                onPress={handleLoadMore}
                text="Voir plus (14 jours)"
                accentColor={Colors[colorScheme].tint}
              />
            )}
          </View>
        ) : (
          <FlatList
            data={groupedMictions}
            keyExtractor={(item) => item.date}
            renderItem={renderDayGroup}
            showsVerticalScrollIndicator={false}
            style={styles.flatlistContent}
            contentContainerStyle={styles.listContent}
            ListFooterComponent={
              selectedFilter === "today" || selectedDate ? null : (
                <LoadMoreButton
                  hasMore={hasMore}
                  loading={false}
                  onPress={handleLoadMore}
                  text="Voir plus (14 jours)"
                  accentColor={Colors[colorScheme].tint}
                />
              )
            }
          />
        )}

        {/* Bottom Sheet */}
        <FormBottomSheet
          ref={bottomSheetRef}
          title={editingMiction ? "Modifier la miction" : "Nouvelle miction"}
          icon={editingMiction ? "edit" : "tint"}
          accentColor="#17a2b8"
          isEditing={!!editingMiction}
          isSubmitting={isSubmitting}
          onSubmit={handleSubmit}
          onDelete={editingMiction ? handleDelete : undefined}
          onCancel={cancelForm}
          onClose={() => {
            setIsSubmitting(false);
            setEditingMiction(null);
          }}
        >
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
          message="Voulez-vous vraiment supprimer cette miction ?"
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
  filterText: {
    fontSize: 14,
    fontWeight: "600",
  },
  filterTextActive: {
    color: "#fff",
  },
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 20,
  },
  // Section
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
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  summaryText: {
    fontSize: 14,
    color: "#666",
  },
  expandButton: {
    padding: 8,
    borderRadius: 8,
    backgroundColor: "#f0f0f0",
  },
  // Miction Item
  mictionItem: {
    backgroundColor: "#f8f9fa",
    borderRadius: 8,
    padding: 12,
    marginBottom: 8,
  },
  lastMictionItem: {
    backgroundColor: "#e3f2fd",
    borderLeftWidth: 4,
    borderLeftColor: "#17a2b8",
  },
  mictionContent: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  timeText: {
    fontSize: 16,
    fontWeight: "500",
    color: "#666",
    flex: 1,
  },
  lastTimeText: {
    color: "#333",
    fontWeight: "600",
  },
  mictionActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  recentBadge: {
    backgroundColor: "#dc3545",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  recentText: {
    color: "white",
    fontSize: 12,
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
  // Empty State
  emptyContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingBottom: 100,
  },
  emptyText: {
    fontSize: 18,
    color: "#666",
    marginTop: 16,
    fontWeight: "600",
  },
  // Modal Content
  modalCategoryLabel: {
    alignSelf: "center",
    fontSize: 16,
    fontWeight: "600",
    color: "#333",
    marginBottom: 12,
  },
  // Date/Time
  dateTimeContainer: {
    flexDirection: "row",
    gap: 12,
    marginBottom: 20,
  },
  dateButton: {
    backgroundColor: "#f8f9fa",
    padding: 16,
    borderRadius: 12,
    alignItems: "center",
    flex: 1,
    flexDirection: "row",
    justifyContent: "center",
    gap: 8,
    borderWidth: 1,
    borderColor: "#e9ecef",
  },
  dateButtonDisabled: {
    backgroundColor: "#f5f5f5",
    opacity: 0.5,
  },
  dateButtonText: {
    fontSize: 16,
    color: "#666",
    fontWeight: "500",
  },
  dateButtonTextDisabled: {
    color: "#ccc",
  },
  selectedDateTime: {
    backgroundColor: "#f8f9fa",
    padding: 16,
    borderRadius: 12,
    alignItems: "center",
    marginBottom: 20,
    borderWidth: 1,
    borderColor: "#e9ecef",
  },
  selectedDate: {
    fontSize: 16,
    color: "#333",
    fontWeight: "600",
    marginBottom: 4,
  },
  selectedTime: {
    fontSize: 20,
    color: "#dc3545",
    fontWeight: "bold",
  },
  header: {
    padding: 16,
    paddingBottom: 8,
  },
  addButton: {
    backgroundColor: "#dc3545",
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
  historyLabel: {
    fontSize: 12,
    color: "#999",
    marginBottom: 8,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  emptyState: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 60,
  },
  emptySubtext: {
    fontSize: 14,
    color: "#999",
    marginTop: 4,
  },
  modalOverlay: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "rgba(0,0,0,0.5)",
  },
  modalContent: {
    width: "90%",
    paddingHorizontal: 20,
    paddingTop: 20,
    backgroundColor: "white",
    borderRadius: 12,
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    marginBottom: 20,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: "bold",
    color: "#333",
  },
  actionButtonsContainer: {
    paddingHorizontal: 20,
    paddingBottom: Platform.OS === "ios" ? 34 : 20,
  },
});
