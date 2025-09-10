import { ajouterVaccin, modifierVaccin } from "@/services/vaccinsService";
import FontAwesome from "@expo/vector-icons/FontAwesome5";
import DateTimePicker from "@react-native-community/datetimepicker";
import { router, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import {
  FlatList,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import ModernActionButtons from "./components/ModernActionsButton";
import { Vaccin, VaccinGroup } from "./types/interfaces";

type Props = {
  vaccins: any[];
};

// Liste des vaccins pour enfants de 0 à 3 ans
const VACCINS_LIST = [
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
  "Méningocoque C",
  "DTCaP-Hib (rappel)",
  "ROR (2ème injection)",
  "Pneumocoque (rappel)",
  "Méningocoque C (rappel)",
  "DTCaP (rappel)",
  "Hépatite B",
  "BCG (Tuberculose)",
  "Varicelle",
  "Grippe saisonnière",
  "Autre vaccin",
];

export default function VaccinsScreen({ vaccins }: Props) {
  const [groupedVaccins, setGroupedVaccins] = useState<VaccinGroup[]>([]);
  const [expandedDays, setExpandedDays] = useState<Set<string>>(new Set());
  const [showModal, setShowModal] = useState<boolean>(false);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [editingVaccin, setEditingVaccin] = useState<Vaccin | null>(null);
  const [dateHeure, setDateHeure] = useState<Date>(new Date());
  const [showDate, setShowDate] = useState(false);
  const [showTime, setShowTime] = useState(false);
  const [selectedVaccin, setSelectedVaccin] = useState<string>("");
  const [showVaccinList, setShowVaccinList] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState<string>("");

  const { openModal } = useLocalSearchParams();

  useEffect(() => {
    if (openModal === "true") {
      const timer = setTimeout(() => {
        openModalHandler();
        router.replace("/immunos");
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [openModal]);

  useEffect(() => {
    const grouped = groupVaccinsByDay(vaccins);
    setGroupedVaccins(grouped);
  }, [vaccins]);

  const groupVaccinsByDay = (vaccins: Vaccin[]): VaccinGroup[] => {
    const groups: { [key: string]: Vaccin[] } = {};
    vaccins.forEach((vaccin) => {
      const date = new Date(vaccin.date?.seconds * 1000);
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, "0");
      const day = String(date.getDate()).padStart(2, "0");
      const dateKey = `${year}-${month}-${day}`;
      if (!groups[dateKey]) {
        groups[dateKey] = [];
      }
      groups[dateKey].push(vaccin);
    });
    return Object.entries(groups)
      .map(([dateKey, vaccins]) => {
        const date = new Date(dateKey);
        const lastVaccin = vaccins.reduce((latest, current) =>
          (current.date?.seconds || 0) > (latest.date?.seconds || 0) ? current : latest
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

  const toggleExpand = (dateKey: string) => {
    const newExpandedDays = new Set(expandedDays);
    if (newExpandedDays.has(dateKey)) {
      newExpandedDays.delete(dateKey);
    } else {
      newExpandedDays.add(dateKey);
    }
    setExpandedDays(newExpandedDays);
  };

  const openModalHandler = () => {
    const now = new Date();
    setDateHeure(new Date(now.getTime()));
    setSelectedVaccin("");
    setEditingVaccin(null);
    setIsSubmitting(false);
    setShowModal(true);
  };

  const openEditModal = (vaccin: Vaccin) => {
    setDateHeure(new Date(vaccin.date.seconds * 1000));
    setSelectedVaccin(vaccin.lib || "");
    setEditingVaccin(vaccin);
    setIsSubmitting(false);
    setShowModal(true);
  };

  const closeModal = () => {
    setShowModal(false);
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

  const handleSubmitVaccin = async () => {
    if (isSubmitting || !selectedVaccin.trim()) {
      return;
    }
    try {
      setIsSubmitting(true);
      if (editingVaccin) {
        await modifierVaccin(editingVaccin.id, {
          date: dateHeure,
          lib: selectedVaccin,
        });
      } else {
        await ajouterVaccin({
          date: dateHeure,
          lib: selectedVaccin,
        });
      }
      closeModal();
    } catch (error) {
      console.error("Erreur lors de la sauvegarde de la vaccination:", error);
    } finally {
      setIsSubmitting(false);
    }
  };

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
        newDate.setHours(selectedDate.getHours());
        newDate.setMinutes(selectedDate.getMinutes());
        return newDate;
      });
    }
  };

  const selectVaccin = (vaccin: string) => {
    setSelectedVaccin(vaccin);
    setShowVaccinList(false);
    setSearchQuery("");
    setTimeout(() => {
      setShowModal(true);
    }, 300);
  };

  const renderVaccinItem = (vaccin: Vaccin, isLast: boolean = false) => (
    <TouchableOpacity
      key={vaccin.id}
      style={[styles.vaccinItem, isLast && styles.lastVaccinItem]}
      onPress={() => openEditModal(vaccin)}
      activeOpacity={0.7}
    >
      <View style={styles.vaccinContent}>
        <FontAwesome
          name="clock"
          size={16}
          color={isLast ? "#9C27B0" : "#666"}
        />
        <View style={styles.vaccinInfo}>
          <Text style={[styles.vaccinName, isLast && styles.lastVaccinName]}>
            {vaccin.lib || "Vaccin non spécifié"}
          </Text>
          <Text style={[styles.timeText, isLast && styles.lastTimeText]}>
            {new Date(vaccin.date?.seconds * 1000).toLocaleTimeString("fr-FR", {
              hour: "2-digit",
              minute: "2-digit",
            })}
          </Text>
        </View>
        <View style={styles.vaccinActions}>
          {isLast && (
            <View style={styles.recentBadge}>
              <Text style={styles.recentText}>Récent</Text>
            </View>
          )}
          <FontAwesome name="edit" size={16} color="#9C27B0" style={styles.editIcon} />
        </View>
      </View>
    </TouchableOpacity>
  );

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

  const filteredVaccins = VACCINS_LIST.filter((vaccin) =>
    vaccin.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.addButton} onPress={openModalHandler}>
          <FontAwesome name="plus" size={16} color="white" />
          <Text style={styles.addButtonText}>Nouveau vaccin</Text>
        </TouchableOpacity>
      </View>
      <FlatList
        data={groupedVaccins}
        keyExtractor={(item) => item.date}
        renderItem={renderDayGroup}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <FontAwesome name="syringe" size={48} color="#ccc" />
            <Text style={styles.emptyText}>Aucun vaccin enregistré</Text>
            <Text style={styles.emptySubtext}>
              Ajoutez votre premier vaccin
            </Text>
          </View>
        }
      />
      {/* MODAL */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={showModal}
        onRequestClose={closeModal}
        presentationStyle="overFullScreen"
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <FontAwesome
                name={editingVaccin ? "edit" : "syringe"}
                size={24}
                color="#9C27B0"
              />
              <Text style={styles.modalTitle}>
                {editingVaccin ? "Modifier le vaccin" : "Nouveau vaccin"}
              </Text>
            </View>
            {/* Sélection du vaccin */}
            <Text style={styles.modalCategoryLabel}>Type de vaccin</Text>
            <TouchableOpacity
              style={[
                styles.vaccinSelector,
                isSubmitting && styles.vaccinSelectorDisabled,
              ]}
              onPress={() => {
                if (!isSubmitting) {
                  console.log("Closing main modal to open list");
                  setShowModal(false);
                  setTimeout(() => {
                    setShowVaccinList(true);
                    console.log("showVaccinList set to true");
                  }, 300);
                }
              }}
              disabled={isSubmitting}
            >
              <FontAwesome
                name="syringe"
                size={16}
                color={isSubmitting ? "#ccc" : "#9C27B0"}
              />
              <Text
                style={[
                  styles.vaccinSelectorText,
                  selectedVaccin && styles.vaccinSelectorTextSelected,
                  isSubmitting && styles.vaccinSelectorTextDisabled,
                ]}
              >
                {selectedVaccin || "Sélectionner un vaccin"}
              </Text>
              <FontAwesome
                name="chevron-down"
                size={16}
                color={isSubmitting ? "#ccc" : "#666"}
              />
            </TouchableOpacity>
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
            <View style={styles.actionButtonsContainer}>
              <ModernActionButtons
                onCancel={cancelForm}
                onValidate={handleSubmitVaccin}
                cancelText="Annuler"
                validateText={editingVaccin ? "Mettre à jour" : "Ajouter"}
                isLoading={isSubmitting}
                disabled={isSubmitting || !selectedVaccin.trim()}
                loadingText={editingVaccin ? "Mise à jour..." : "Ajout en cours..."}
              />
            </View>
          </View>
        </View>
      </Modal>
      {/* MODAL LISTE DES VACCINS */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={showVaccinList}
        onRequestClose={() => setShowVaccinList(false)}
        statusBarTranslucent={true}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.vaccinListModal}>
            <View style={styles.vaccinListHeader}>
              <Text style={styles.vaccinListTitle}>Sélectionner un vaccin</Text>
              <TouchableOpacity
                style={styles.closeButton}
                onPress={() => {
                  setShowVaccinList(false);
                  setSearchQuery("");
                  setTimeout(() => {
                    setShowModal(true);
                  }, 300);
                }}
              >
                <FontAwesome name="times" size={20} color="#666" />
              </TouchableOpacity>
            </View>
            <View style={styles.searchContainer}>
              <FontAwesome name="search" size={16} color="#666" style={styles.searchIcon} />
              <TextInput
                style={styles.searchInput}
                placeholder="Rechercher un vaccin..."
                value={searchQuery}
                onChangeText={setSearchQuery}
                autoFocus={true}
                returnKeyType="done"
                accessibilityLabel="Rechercher un vaccin"
                placeholderTextColor="#999"
              />
              {searchQuery.length > 0 && (
                <TouchableOpacity
                  style={styles.clearButton}
                  onPress={() => setSearchQuery("")}
                  accessibilityLabel="Effacer la recherche"
                >
                  <FontAwesome name="times-circle" size={16} color="#666" style={styles.clearIcon} />
                </TouchableOpacity>
              )}
            </View>
            <ScrollView style={styles.vaccinList} showsVerticalScrollIndicator={false}>
              {filteredVaccins.length > 0 ? (
                filteredVaccins.map((vaccin, index) => (
                  <TouchableOpacity
                    key={index}
                    style={[
                      styles.vaccinListItem,
                      selectedVaccin === vaccin && styles.vaccinListItemSelected,
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
                        selectedVaccin === vaccin && styles.vaccinListItemTextSelected,
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

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f8f9fa",
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
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 20,
  },
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
  expandedContent: {
    marginTop: 8,
  },
  separator: {
    height: 1,
    backgroundColor: "#eee",
    marginBottom: 12,
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
  emptyText: {
    fontSize: 18,
    color: "#666",
    marginTop: 16,
    fontWeight: "600",
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
  modalCategoryLabel: {
    alignSelf: "center",
    fontSize: 16,
    fontWeight: "600",
    color: "#333",
    marginBottom: 12,
    marginTop: 8,
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
  actionButtonsContainer: {
    paddingHorizontal: 20,
    paddingBottom: Platform.OS === "ios" ? 34 : 20,
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