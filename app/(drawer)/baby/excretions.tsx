import MictionsScreen from "@/app/suivibaby/mictions";
import SellesScreen from "@/app/suivibaby/selles";
import { FormBottomSheet } from "@/components/ui/FormBottomSheet";
import { Colors } from "@/constants/theme";
import { useBaby } from "@/contexts/BabyContext";
import { useColorScheme } from "@/hooks/use-color-scheme";
import {
  ajouterMiction,
  ajouterSelle,
  modifierMiction,
  modifierSelle,
  supprimerMiction,
  supprimerSelle,
} from "@/migration/eventsDoubleWriteService";
import {
  ecouterMictionsHybrid as ecouterMictions,
  ecouterSellesHybrid as ecouterSelles,
} from "@/migration/eventsHybridService";
import { Miction, Selle } from "@/types/interfaces";
import { Ionicons } from "@expo/vector-icons";
import FontAwesome from "@expo/vector-icons/FontAwesome5";
import BottomSheet from "@gorhom/bottom-sheet";
import DateTimePicker from "@react-native-community/datetimepicker";
import { router, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View
} from "react-native";
import { Calendar, DateData } from "react-native-calendars";
import { SafeAreaView } from "react-native-safe-area-context";
import { useHeaderRight } from "../_layout";

// ============================================
// TYPES
// ============================================
type FilterType = "today" | "past";

// ============================================
// COMPONENT
// ============================================

export default function ExcretionsScreen() {
  const { activeChild } = useBaby();
  const { setHeaderRight } = useHeaderRight();
  const colorScheme = useColorScheme() ?? "light";
  
  const [mictions, setMictions] = useState<Miction[]>([]);
  const [selles, setSelles] = useState<Selle[]>([]);
  const [selectedTab, setSelectedTab] = useState<"mictions" | "selles">("mictions");

  const [showCalendar, setShowCalendar] = useState(false);
  const [selectedFilter, setSelectedFilter] = useState<FilterType | null>(null);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  // États du modal unifié
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [includeMiction, setIncludeMiction] = useState<boolean>(true);
  const [includeSelle, setIncludeSelle] = useState<boolean>(false);
  const [dateHeure, setDateHeure] = useState<Date>(new Date());
  const [showDate, setShowDate] = useState(false);
  const [showTime, setShowTime] = useState(false);

  // États pour l'édition
  const [editingMiction, setEditingMiction] = useState<Miction | null>(null);
  const [editingSelle, setEditingSelle] = useState<Selle | null>(null);

  // Ref pour le BottomSheet
  const bottomSheetRef = useRef<BottomSheet>(null);

  // Récupérer les paramètres de l'URL
  const { tab, openModal } = useLocalSearchParams();

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

  const openAddModal = useCallback((preferredType?: "mictions" | "selles") => {
    const now = new Date();
    setDateHeure(new Date(now.getTime()));

    // Définir les toggles selon le type préféré
    if (preferredType === "selles") {
      setIncludeMiction(false);
      setIncludeSelle(true);
    } else if (preferredType === "mictions") {
      setIncludeMiction(true);
      setIncludeSelle(false);
    } else {
      // Par défaut, miction est sélectionné
      setIncludeMiction(true);
      setIncludeSelle(false);
    }

    setEditingMiction(null);
    setEditingSelle(null);
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
        <Pressable onPress={() => openAddModal(selectedTab)} style={styles.headerButton}>
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
    selectedTab,
  ]);

  // ============================================
  // EFFECTS - URL PARAMS & DATA
  // ============================================

  // Définir l'onglet initial en fonction du paramètre
  useEffect(() => {
    if (tab === "selles") {
      setSelectedTab("selles");
    } else if (tab === "mictions") {
      setSelectedTab("mictions");
    }
  }, [tab]);

  // Ouvrir automatiquement le modal si le paramètre openModal est présent
  useEffect(() => {
    if (openModal === "true") {
      const timer = setTimeout(() => {
        openAddModal(tab as "mictions" | "selles" | undefined);
        router.replace("/(drawer)/baby/excretions");
      }, 100);

      return () => clearTimeout(timer);
    }
  }, [openModal, tab, openAddModal]);

  // écoute en temps réel des mictions
  useEffect(() => {
    if (!activeChild?.id) return;
    const unsubscribeMictions = ecouterMictions(activeChild.id, setMictions);
    return () => unsubscribeMictions();
  }, [activeChild]);

  // écoute en temps réel des selles
  useEffect(() => {
    if (!activeChild?.id) return;
    const unsubscribeSelles = ecouterSelles(activeChild.id, setSelles);
    return () => unsubscribeSelles();
  }, [activeChild]);

  // ============================================
  // HELPERS - CALENDAR
  // ============================================

  const markedDates = useMemo(() => {
    const marked: Record<string, any> = {};
    const dataToMark = selectedTab === "mictions" ? mictions : selles;

    dataToMark.forEach((item) => {
      const date = new Date(item.date.seconds * 1000);
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
  }, [selectedTab === "mictions" ? mictions : selles, selectedDate, colorScheme, selectedTab]);

  const handleDateSelect = (day: DateData) => {
    setSelectedDate(day.dateString);
  };

  const handleFilterPress = (filter: FilterType) => {
    setSelectedFilter(filter);
    setSelectedDate(null);
    setShowCalendar(false);
  };

  // ============================================
  // HANDLERS - MODAL
  // ============================================

  const openEditModalFromMiction = useCallback((miction: Miction) => {
    setDateHeure(new Date(miction.date.seconds * 1000));
    setEditingMiction(miction);
    setEditingSelle(null);
    setIncludeMiction(true);
    setIncludeSelle(false);
    setIsSubmitting(false);
    bottomSheetRef.current?.expand();
  }, []);

  const openEditModalFromSelle = useCallback((selle: Selle) => {
    setDateHeure(new Date(selle.date.seconds * 1000));
    setEditingSelle(selle);
    setEditingMiction(null);
    setIncludeMiction(false);
    setIncludeSelle(true);
    setIsSubmitting(false);
    bottomSheetRef.current?.expand();
  }, []);

  const closeModal = () => {
    bottomSheetRef.current?.close();
    setIsSubmitting(false);
    setEditingMiction(null);
    setEditingSelle(null);
  };

  const cancelForm = useCallback(() => {
    closeModal();
  }, []);

  // ============================================
  // HANDLERS - CRUD
  // ============================================

  const handleSubmit = async () => {
    if (isSubmitting) return;

    // Vérifier qu'au moins un type est sélectionné
    if (!includeMiction && !includeSelle) {
      Alert.alert(
        "Attention",
        "Veuillez sélectionner au moins un type (miction ou selle)"
      );
      return;
    }

    try {
      setIsSubmitting(true);

      if (!activeChild) {
        throw new Error("Aucun enfant sélectionné");
      }

      // Mode édition
      if (editingMiction) {
        await modifierMiction(activeChild.id, editingMiction.id, {
          date: dateHeure,
        });
      } else if (editingSelle) {
        await modifierSelle(activeChild.id, editingSelle.id, {
          date: dateHeure,
        });
      }
      // Mode ajout
      else {
        if (includeMiction) {
          await ajouterMiction(activeChild.id, {
            date: dateHeure,
          });
        }
        if (includeSelle) {
          await ajouterSelle(activeChild.id, {
            date: dateHeure,
          });
        }
      }

      closeModal();
    } catch (error) {
      console.error("Erreur lors de la sauvegarde:", error);
      Alert.alert("Erreur", "Impossible de sauvegarder. Veuillez réessayer.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (isSubmitting) return;

    try {
      setIsSubmitting(true);

      if (editingMiction) {
        Alert.alert("Suppression", "Voulez-vous vraiment supprimer ?", [
          {
            text: "Annuler",
            style: "cancel",
            onPress: () => setIsSubmitting(false),
          },
          {
            text: "Supprimer",
            style: "destructive",
            onPress: async () => {
              try {
                if (!activeChild) return;
                await supprimerMiction(activeChild.id, editingMiction.id);
                closeModal();
              } catch (error) {
                Alert.alert(
                  "Erreur",
                  "Impossible de supprimer. Veuillez réessayer."
                );
                setIsSubmitting(false);
              }
            },
          },
        ]);
      } else if (editingSelle) {
        Alert.alert("Suppression", "Voulez-vous vraiment supprimer ?", [
          {
            text: "Annuler",
            style: "cancel",
            onPress: () => setIsSubmitting(false),
          },
          {
            text: "Supprimer",
            style: "destructive",
            onPress: async () => {
              try {
                if (!activeChild) return;
                await supprimerSelle(activeChild.id, editingSelle.id);
                closeModal();
              } catch (error) {
                Alert.alert(
                  "Erreur",
                  "Impossible de supprimer. Veuillez réessayer."
                );
                setIsSubmitting(false);
              }
            },
          },
        ]);
      }
    } catch (error) {
      console.error("Erreur lors de la suppression:", error);
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

  const isEditMode = editingMiction !== null || editingSelle !== null;

  // ============================================
  // RENDER - MAIN
  // ============================================

  return (
    <View style={{ flex: 1 }}>
      <SafeAreaView
        style={[
          { flex: 1 },
          { backgroundColor: Colors[colorScheme].background },
        ]}
        edges={["bottom"]}
      >
        <View>
          {/* BOUTONS DE SÉLECTION */}
          <View style={styles.tabContainer}>
            <TouchableOpacity
              style={[
                styles.tabButton,
                selectedTab === "mictions" && styles.tabButtonActive,
              ]}
              onPress={() => setSelectedTab("mictions")}
            >
              <Text
                style={[
                  styles.tabText,
                  selectedTab === "mictions" && styles.tabTextActive,
                ]}
              >
                Mictions
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.tabButton,
                selectedTab === "selles" && styles.tabButtonActive,
              ]}
              onPress={() => setSelectedTab("selles")}
            >
              <Text
                style={[
                  styles.tabText,
                  selectedTab === "selles" && styles.tabTextActive,
                ]}
              >
                Selles
              </Text>
            </TouchableOpacity>
          </View>

          {/* Filtres */}
          {/* <ScrollView
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
          </ScrollView> */}

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

        {/* CONTENU */}
        <View style={styles.container}>
          {selectedTab === "mictions" ? (
            <MictionsScreen
              mictions={mictions}
              selectedFilter={selectedFilter}
              selectedDate={selectedDate}
              onEditMiction={openEditModalFromMiction}
            />
          ) : (
            <SellesScreen
              selles={selles}
              selectedFilter={selectedFilter}
              selectedDate={selectedDate}
              onEditSelle={openEditModalFromSelle}
            />
          )}
        </View>
      </SafeAreaView>

      {/* Bottom Sheet unifié */}
      <FormBottomSheet
        ref={bottomSheetRef}
        title={isEditMode ? "Modifier" : "Ajouter une excrétion"}
        icon={isEditMode ? "edit" : "plus-circle"}
        accentColor={selectedTab === "mictions" ? "#17a2b8" : "#dc3545"}
        isEditing={isEditMode}
        isSubmitting={isSubmitting}
        onSubmit={handleSubmit}
        onDelete={isEditMode ? handleDelete : undefined}
        onCancel={cancelForm}
        onClose={() => {
          setIsSubmitting(false);
          setEditingMiction(null);
          setEditingSelle(null);
        }}
      >
        {/* Toggles de sélection (uniquement en mode ajout) */}
        {!isEditMode && (
          <>
            <Text style={styles.toggleLabel}>
              Sélectionnez au moins un type :
            </Text>
            <View style={styles.toggleContainer}>
              <TouchableOpacity
                style={[
                  styles.toggleButton,
                  includeMiction && styles.toggleButtonActiveMiction,
                ]}
                onPress={() => setIncludeMiction(!includeMiction)}
                disabled={isSubmitting}
              >
                <FontAwesome
                  name="water"
                  size={16}
                  color={includeMiction ? "white" : "#17a2b8"}
                />
                <Text
                  style={[
                    styles.toggleText,
                    includeMiction && styles.toggleTextActive,
                  ]}
                >
                  Miction
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.toggleButton,
                  includeSelle && styles.toggleButtonActiveSelle,
                ]}
                onPress={() => setIncludeSelle(!includeSelle)}
                disabled={isSubmitting}
              >
                <FontAwesome
                  name="circle"
                  size={16}
                  color={includeSelle ? "white" : "#dc3545"}
                />
                <Text
                  style={[
                    styles.toggleText,
                    includeSelle && styles.toggleTextActive,
                  ]}
                >
                  Selle
                </Text>
              </TouchableOpacity>
            </View>
            {!includeMiction && !includeSelle && (
              <Text style={styles.warningText}>
                ⚠️ Veuillez sélectionner au moins un type
              </Text>
            )}
          </>
        )}

        {/* Label pour le mode édition */}
        {isEditMode && (
          <View style={styles.editModeLabel}>
            <FontAwesome
              name={editingMiction ? "water" : "circle"}
              size={16}
              color={editingMiction ? "#17a2b8" : "#dc3545"}
            />
            <Text style={styles.editModeLabelText}>
              Modification : {editingMiction ? "Miction" : "Selle"}
            </Text>
          </View>
        )}

        {/* Date & Heure */}
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
              name="calendar"
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
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f8f9fa",
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
  tabContainer: {
    flexDirection: "row",
    justifyContent: "center",
    paddingTop: 10,
    gap: 10,
    backgroundColor: "#f8f9fa",
  },
  tabButton: {
    paddingVertical: 10,
    paddingHorizontal: 20,
    backgroundColor: "#eee",
    borderRadius: 12,
  },
  tabButtonActive: {
    backgroundColor: "#4A90E2",
  },
  tabText: {
    fontSize: 16,
    color: "#333",
    fontWeight: "bold",
  },
  tabTextActive: {
    color: "white",
  },
  modalCategoryLabel: {
    alignSelf: "center",
    fontSize: 16,
    fontWeight: "600",
    color: "#333",
    marginBottom: 12,
  },
  toggleLabel: {
    fontSize: 14,
    fontWeight: "600",
    color: "#666",
    marginBottom: 12,
    textAlign: "center",
  },
  toggleContainer: {
    flexDirection: "row",
    gap: 12,
    marginBottom: 12,
  },
  toggleButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: "#e9ecef",
    backgroundColor: "#f8f9fa",
  },
  toggleButtonActiveMiction: {
    backgroundColor: "#17a2b8",
    borderColor: "#17a2b8",
  },
  toggleButtonActiveSelle: {
    backgroundColor: "#dc3545",
    borderColor: "#dc3545",
  },
  toggleText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#666",
  },
  toggleTextActive: {
    color: "white",
  },
  warningText: {
    fontSize: 13,
    color: "#dc3545",
    textAlign: "center",
    marginBottom: 12,
    fontWeight: "500",
  },
  editModeLabel: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: "#f8f9fa",
    borderRadius: 8,
    marginBottom: 20,
  },
  editModeLabelText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#666",
  },
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
    color: "#4A90E2",
    fontWeight: "bold",
  },
});