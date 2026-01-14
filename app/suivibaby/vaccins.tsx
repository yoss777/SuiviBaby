import { ThemedText } from "@/components/themed-text";
import { FormBottomSheet } from "@/components/ui/FormBottomSheet";
import { Colors } from "@/constants/theme";
import { useBaby } from "@/contexts/BabyContext";
import { useColorScheme } from "@/hooks/use-color-scheme";
import {
  ajouterVaccin,
  modifierVaccin,
  supprimerVaccin,
} from "@/migration/eventsDoubleWriteService";
import { Vaccin, VaccinGroup } from "@/types/interfaces";
import { Ionicons } from "@expo/vector-icons";
import FontAwesome from "@expo/vector-icons/FontAwesome5";
import BottomSheet from "@gorhom/bottom-sheet";
import DateTimePicker from "@react-native-community/datetimepicker";
import { router, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  FlatList,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
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

// Liste des vaccins pour enfants de 0 à 3 ans
const VACCINS_LIST = [
  "Bronchiolite",
  "Diphtérie, Tétanos, Coqueluche, Polio, Haemophilus (DTCaP-Hib)",
  "Pneumocoque (PCV13)",
  "Rotavirus",
  "DTCaP-Hib (2ème injection)",
  "Pneumocoque (2ème injection)",
  "Rotavirus (2ème dose)",
  "DTCaP-Hib (3ème injection)",
  "Pneumocoque (3ème injection)",
  "Rotavirus (3ème dose)",
  "ROR (Rougeole, Oreillons, Rubéole)",
  "ROR (2ème injection)",
  "Méningocoque A,C,W,Y",
  "Méningocoque A,C,W,Y (rappel)",
  "Méningocoque B",
  "Méningocoque B (rappel)",
  "DTCaP-Hib (rappel)",
  "Pneumocoque (rappel)",
  "DTCaP (rappel)",
  "Hépatite B",
  "BCG (Tuberculose)",
  "Varicelle",
  "Grippe saisonnière",
  "Autre vaccin",
];

type Props = {
  vaccins: Vaccin[];
};

// ============================================
// COMPONENT
// ============================================

export default function VaccinsScreen({ vaccins }: Props) {
  const { activeChild } = useBaby();
  const { setHeaderRight } = useHeaderRight();
  const colorScheme = useColorScheme() ?? "light";

  const [showCalendar, setShowCalendar] = useState(false);
  const [selectedFilter, setSelectedFilter] = useState<FilterType | null>(null);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  // États des données
  const [groupedVaccins, setGroupedVaccins] = useState<VaccinGroup[]>([]);
  const [expandedDays, setExpandedDays] = useState<Set<string>>(new Set());

  // États du formulaire
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [editingVaccin, setEditingVaccin] = useState<Vaccin | null>(null);
  const [dateHeure, setDateHeure] = useState<Date>(new Date());
  const [selectedVaccin, setSelectedVaccin] = useState<string>("");
  const [showVaccinList, setShowVaccinList] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState<string>("");

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

  // Gérer le bouton calendrier
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

  // Gérer l'ouverture du modal d'ajout
  const openAddModal = useCallback(() => {
    setDateHeure(new Date());
    setEditingVaccin(null);
    setIsSubmitting(false);
    setSelectedVaccin("");
    bottomSheetRef.current?.expand();
  }, []);

  // Définir les boutons du header (calendrier + ajouter)
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
        router.replace("/(drawer)/baby/immunos");
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [openModal, openAddModal]);

  // ============================================
  // EFFECTS - DATA LISTENERS
  // ============================================

  // Filtrage et regroupement par jour
  useEffect(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayTime = today.getTime();

    const filtered = vaccins.filter((vaccin) => {
      const vaccinDate = new Date(vaccin.date.seconds * 1000);
      vaccinDate.setHours(0, 0, 0, 0);
      const vaccinTime = vaccinDate.getTime();

      if (selectedDate) {
        const [calYear, calMonth, calDay] = selectedDate.split("-").map(Number);
        const calDate = new Date(calYear, calMonth - 1, calDay);
        calDate.setHours(0, 0, 0, 0);
        return vaccinTime === calDate.getTime();
      }

      switch (selectedFilter) {
        case "today":
          return vaccinTime === todayTime;
        case "past":
          return vaccinTime < todayTime;
        case null:
        default:
          return true;
      }
    });

    const grouped = groupVaccinsByDay(filtered);
    setGroupedVaccins(grouped);
  }, [vaccins, selectedFilter, selectedDate, showCalendar]);

  // ============================================
  // HELPERS - CALENDAR
  // ============================================

  const markedDates = useMemo(() => {
    const marked: Record<string, any> = {};

    vaccins.forEach((vaccin) => {
      const date = new Date(vaccin.date.seconds * 1000);
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
  }, [vaccins, selectedDate, colorScheme]);

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

  const groupVaccinsByDay = (vaccins: Vaccin[]): VaccinGroup[] => {
    const groups: { [key: string]: Vaccin[] } = {};

    vaccins.forEach((vaccin) => {
      const date = new Date(vaccin.date?.seconds * 1000);
      const dateKey = `${date.getFullYear()}-${String(
        date.getMonth() + 1
      ).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;

      if (!groups[dateKey]) {
        groups[dateKey] = [];
      }
      groups[dateKey].push(vaccin);
    });

    return Object.entries(groups)
      .map(([dateKey, vaccins]) => {
        const date = new Date(dateKey);
        const lastVaccin = vaccins.reduce((latest, current) =>
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
          vaccins: vaccins.sort(
            (a, b) => (b.date?.seconds || 0) - (a.date?.seconds || 0)
          ),
          lastVaccin,
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

  const selectVaccin = (vaccin: string) => {
    setSelectedVaccin(vaccin);
    setShowVaccinList(false);
    setSearchQuery("");
    setTimeout(() => {
      bottomSheetRef.current?.expand();
    }, 300);
  };

  const filteredVaccins = VACCINS_LIST.filter((vaccin) =>
    vaccin.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // ============================================
  // HANDLERS - MODAL
  // ============================================

  const openEditModal = (vaccin: Vaccin) => {
    setDateHeure(new Date(vaccin.date.seconds * 1000));
    setSelectedVaccin(vaccin.nomVaccin || vaccin.lib || "");
    setEditingVaccin(vaccin);
    setIsSubmitting(false);
    bottomSheetRef.current?.expand();
  };

  const closeModal = () => {
    bottomSheetRef.current?.close();
    setIsSubmitting(false);
    setEditingVaccin(null);
    setSelectedVaccin("");
    setShowVaccinList(false);
    setSearchQuery("");
    setTimeout(() => {
      setDateHeure(new Date());
    }, 100);
  };

  const cancelForm = useCallback(() => {
    closeModal();
  }, []);

  // ============================================
  // HANDLERS - CRUD
  // ============================================

  const handleSubmit = async () => {
    if (isSubmitting || !selectedVaccin.trim() || !activeChild) return;

    try {
      setIsSubmitting(true);

      if (editingVaccin) {
        await modifierVaccin(activeChild.id, editingVaccin.id, {
          date: dateHeure,
          lib: selectedVaccin,
        });
      } else {
        await ajouterVaccin(activeChild.id, {
          date: dateHeure,
          lib: selectedVaccin,
        });
      }

      closeModal();
    } catch (error) {
      console.error("Erreur lors de la sauvegarde du vaccin:", error);
      Alert.alert(
        "Erreur",
        "Impossible de sauvegarder le vaccin. Veuillez réessayer."
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (isSubmitting || !editingVaccin || !activeChild) return;

    Alert.alert("Suppression", "Voulez-vous vraiment supprimer ce vaccin ?", [
      {
        text: "Annuler",
        style: "cancel",
      },
      {
        text: "Supprimer",
        style: "destructive",
        onPress: async () => {
          try {
            setIsSubmitting(true);
            await supprimerVaccin(activeChild.id, editingVaccin.id);
            closeModal();
          } catch (error) {
            console.error("Erreur lors de la suppression:", error);
            Alert.alert(
              "Erreur",
              "Impossible de supprimer le vaccin. Veuillez réessayer."
            );
          } finally {
            setIsSubmitting(false);
          }
        },
      },
    ]);
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
  // RENDER - VACCIN ITEM
  // ============================================

  const renderVaccinItem = (vaccin: Vaccin, isLast: boolean = false) => (
    <TouchableOpacity
      key={vaccin.id}
      style={[styles.vaccinItem, isLast && styles.lastVaccinItem]}
      onPress={() => openEditModal(vaccin)}
      activeOpacity={0.7}
    >
      <View style={styles.vaccinContent}>
        <FontAwesome name="syringe" size={24} color="#9C27B0" />
        <View style={styles.vaccinInfo}>
          <Text style={[styles.vaccinName, isLast && styles.lastVaccinName]}>
            {vaccin.nomVaccin || vaccin.lib || "Vaccin non spécifié"}
          </Text>
          <Text style={[styles.timeText, isLast && styles.lastTimeText]}>
            {new Date(vaccin.date.seconds * 1000).toLocaleTimeString("fr-FR", {
              hour: "2-digit",
              minute: "2-digit",
            })}
          </Text>
        </View>
        {/* {isLast && (
          <View style={styles.recentBadge}>
            <Text style={styles.recentText}>Récent</Text>
          </View>
        )} */}
        <FontAwesome
          name="edit"
          size={18}
          color="#666"
          style={styles.editIcon}
        />
      </View>
    </TouchableOpacity>
  );

  // ============================================
  // RENDER - DAY GROUP
  // ============================================

  const renderDayGroup = ({ item }: { item: VaccinGroup }) => {
    const isExpanded = expandedDays.has(item.date);
    const hasMultipleVaccins = item.vaccins.length > 1;
    return (
      <View style={styles.dayCard}>
        <View style={styles.dayHeader}>
          <View style={styles.dayInfo}>
            <Text style={styles.dayDate}>{item.dateFormatted}</Text>
            <View style={styles.summaryInfo}>
              <FontAwesome name="syringe" size={14} color="#666" />
              <Text style={styles.summaryText}>
                {item.vaccins.length} vaccin
                {item.vaccins.length > 1 ? "s" : ""} reçu
                {item.vaccins.length > 1 ? "s" : ""}
              </Text>
            </View>
          </View>
          {hasMultipleVaccins && (
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
        {renderVaccinItem(item.lastVaccin, true)}
        {hasMultipleVaccins && isExpanded && (
          <View style={styles.expandedContent}>
            <View style={styles.separator} />
            <Text style={styles.historyLabel}>Historique du jour</Text>
            {item.vaccins
              .filter((vaccin) => vaccin.id !== item.lastVaccin.id)
              .map((vaccin) => renderVaccinItem(vaccin))}
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

        {/* Liste des vaccins */}
        {groupedVaccins.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Ionicons
              name="calendar-outline"
              size={64}
              color={Colors[colorScheme].tabIconDefault}
            />
            <ThemedText style={styles.emptyText}>
              {vaccins.length === 0
                ? "Aucun vaccin enregistré"
                : "Aucun vaccin pour ce filtre"}
            </ThemedText>
          </View>
        ) : (
          <FlatList
            data={groupedVaccins}
            keyExtractor={(item) => item.date}
            renderItem={renderDayGroup}
            showsVerticalScrollIndicator={false}
            style={styles.flatlistContent}
            contentContainerStyle={styles.listContent}
          />
        )}

        {/* Bottom Sheet d'ajout/édition */}
        <FormBottomSheet
          ref={bottomSheetRef}
          title={editingVaccin ? "Modifier le vaccin" : "Nouveau vaccin"}
          icon={editingVaccin ? "edit" : "syringe"}
          accentColor="#9C27B0"
          isEditing={!!editingVaccin}
          isSubmitting={isSubmitting}
          onSubmit={handleSubmit}
          onDelete={editingVaccin ? handleDelete : undefined}
          onCancel={cancelForm}
          onClose={() => {
            setIsSubmitting(false);
            setEditingVaccin(null);
          }}
        >
          {/* Sélecteur de vaccin */}
          <TouchableOpacity
            style={[
              styles.vaccinSelector,
              isSubmitting && styles.vaccinSelectorDisabled,
            ]}
            onPress={() => {
              if (!isSubmitting) {
                setShowVaccinList(true);
                bottomSheetRef.current?.close();
              }
            }}
            disabled={isSubmitting}
          >
            <FontAwesome name="list" size={20} color="#666" />
            <Text
              style={[
                styles.vaccinSelectorText,
                selectedVaccin && styles.vaccinSelectorTextSelected,
                isSubmitting && styles.vaccinSelectorTextDisabled,
              ]}
            >
              {selectedVaccin || "Sélectionner un vaccin"}
            </Text>
            <FontAwesome name="chevron-right" size={16} color="#999" />
          </TouchableOpacity>

          {/* Date & Heure */}
          <Text style={styles.modalCategoryLabel}>Date et heure</Text>
          <View style={styles.dateTimeContainer}>
            <TouchableOpacity
              style={[
                styles.dateButton,
                isSubmitting && styles.dateButtonDisabled,
              ]}
              onPress={() => !isSubmitting && setShowDate(true)}
              disabled={isSubmitting}
            >
              <FontAwesome name="calendar" size={16} color="#666" />
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
              onPress={() => !isSubmitting && setShowTime(true)}
              disabled={isSubmitting}
            >
              <FontAwesome name="clock" size={16} color="#666" />
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
                day: "numeric",
                month: "long",
                year: "numeric",
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
              display={Platform.OS === "ios" ? "spinner" : "default"}
              onChange={onChangeTime}
            />
          )}
        </FormBottomSheet>
      </SafeAreaView>

      {/* Modal de sélection de vaccin */}
      <Modal
        visible={showVaccinList}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowVaccinList(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.vaccinListModal}>
            <View style={styles.vaccinListHeader}>
              <Text style={styles.vaccinListTitle}>Sélectionner un vaccin</Text>
              <TouchableOpacity
                style={styles.closeButton}
                onPress={() => {
                  setShowVaccinList(false);
                  bottomSheetRef.current?.expand();
                }}
              >
                <FontAwesome name="times" size={20} color="#666" />
              </TouchableOpacity>
            </View>
            <View style={styles.searchContainer}>
              <FontAwesome
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
                  <FontAwesome
                    name="times-circle"
                    size={16}
                    color="#999"
                    style={styles.clearIcon}
                  />
                </TouchableOpacity>
              )}
            </View>
            <ScrollView
              style={styles.vaccinList}
              showsVerticalScrollIndicator={false}
            >
              {filteredVaccins.length > 0 ? (
                filteredVaccins.map((vaccin, index) => (
                  <TouchableOpacity
                    key={index}
                    style={[
                      styles.vaccinListItem,
                      selectedVaccin === vaccin &&
                        styles.vaccinListItemSelected,
                    ]}
                    onPress={() => selectVaccin(vaccin)}
                    activeOpacity={0.7}
                  >
                    <FontAwesome
                      name="syringe"
                      size={16}
                      color={selectedVaccin === vaccin ? "#9C27B0" : "#666"}
                    />
                    <Text
                      style={[
                        styles.vaccinListItemText,
                        selectedVaccin === vaccin &&
                          styles.vaccinListItemTextSelected,
                      ]}
                    >
                      {vaccin}
                    </Text>
                    {selectedVaccin === vaccin && (
                      <FontAwesome name="check" size={16} color="#9C27B0" />
                    )}
                  </TouchableOpacity>
                ))
              ) : (
                <Text style={styles.noResultsText}>Aucun vaccin trouvé</Text>
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>
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
  // Vaccin Item
  vaccinItem: {
    backgroundColor: "#f8f9fa",
    borderRadius: 8,
    padding: 12,
    marginBottom: 8,
  },
  lastVaccinItem: {
    backgroundColor: "#f3e5f5",
    borderLeftWidth: 4,
    borderLeftColor: "#9C27B0",
  },
  vaccinContent: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  timeText: {
    fontSize: 14,
    color: "#999",
  },
  lastTimeText: {
    color: "#666",
    fontWeight: "500",
  },
  vaccinActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },

  vaccinInfo: {
    flex: 1,
  },
  vaccinName: {
    fontSize: 16,
    fontWeight: "500",
    color: "#666",
    marginBottom: 2,
  },
  lastVaccinName: {
    color: "#333",
    fontWeight: "600",
  },
  recentBadge: {
    backgroundColor: "#9C27B0",
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
    marginTop: 8,
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
    color: "#9C27B0",
    fontWeight: "bold",
  },
  header: {
    padding: 16,
    paddingBottom: 8,
  },
  addButton: {
    backgroundColor: "#9C27B0",
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
  //////////////////////
  vaccinSelector: {
    backgroundColor: "#f8f9fa",
    padding: 16,
    borderRadius: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderWidth: 1,
    borderColor: "#e9ecef",
    marginBottom: 20,
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
  vaccinListModal: {
    width: "90%",
    maxHeight: "80%",
    backgroundColor: "white",
    borderRadius: 12,
    paddingBottom: 20,
  },
  vaccinListHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: "#eee",
  },
  vaccinListTitle: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#333",
  },
  closeButton: {
    padding: 8,
  },
  vaccinList: {
    maxHeight: 400,
  },
  vaccinListItem: {
    flexDirection: "row",
    alignItems: "center",
    padding: 16,
    gap: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#f0f0f0",
  },
  vaccinListItemSelected: {
    backgroundColor: "#f3e5f5",
  },
  vaccinListItemText: {
    flex: 1,
    fontSize: 16,
    color: "#333",
  },
  vaccinListItemTextSelected: {
    color: "#9C27B0",
    fontWeight: "500",
  },
  searchContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#f8f9fa",
    borderRadius: 12,
    paddingHorizontal: 12,
    marginHorizontal: 20,
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
  clearIcon: {
    marginLeft: 8,
  },
  noResultsText: {
    fontSize: 16,
    color: "#666",
    textAlign: "center",
    padding: 20,
  },
});
