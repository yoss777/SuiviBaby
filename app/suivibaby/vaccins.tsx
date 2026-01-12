import { FormBottomSheet } from "@/components/ui/FormBottomSheet";
import { useBaby } from "@/contexts/BabyContext";
import {
  ajouterVaccin,
  modifierVaccin,
  supprimerVaccin,
} from "@/migration/eventsDoubleWriteService";
import { Vaccin, VaccinGroup } from "@/types/interfaces";
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
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

type Props = {
  vaccins: any[];
};

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

export default function VaccinsScreen({ vaccins }: Props) {
  const { activeChild } = useBaby();
  const [groupedVaccins, setGroupedVaccins] = useState<VaccinGroup[]>([]);
  const [expandedDays, setExpandedDays] = useState<Set<string>>(new Set());
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [editingVaccin, setEditingVaccin] = useState<Vaccin | null>(null);
  const [dateHeure, setDateHeure] = useState<Date>(new Date());
  const [showDate, setShowDate] = useState(false);
  const [showTime, setShowTime] = useState(false);
  const [selectedVaccin, setSelectedVaccin] = useState<string>("");
  const [showVaccinList, setShowVaccinList] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState<string>("");

  // Ref pour le BottomSheet
  const bottomSheetRef = useRef<BottomSheet>(null);

  // Snap points pour le BottomSheet
  const snapPoints = useMemo(() => ["75%", "90%"], []);

  const { openModal } = useLocalSearchParams();

  useEffect(() => {
    if (openModal === "true") {
      const timer = setTimeout(() => {
        openModalHandler();
        router.replace("/(drawer)/baby/immunos");
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
    bottomSheetRef.current?.expand();
  };

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

  const handleSubmitVaccin = async () => {
    if (isSubmitting || !selectedVaccin.trim()) {
      return;
    }
    try {
      setIsSubmitting(true);

      if (!activeChild) {
        throw new Error("Aucun enfant sélectionné");
      }

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
      console.error("Erreur lors de la sauvegarde de la vaccination:", error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteVaccin = async () => {
    if (isSubmitting) {
      return;
    }

    try {
      setIsSubmitting(true);

      if (editingVaccin) {
        Alert.alert("Suppression", "Voulez-vous vraiment vous supprimer ?", [
          {
            text: "Annuler",
            style: "cancel",
          },
          {
            text: "Supprimer",
            style: "destructive",
            onPress: async () => {
              try {
                if (!activeChild) return;
                await supprimerVaccin(activeChild.id, editingVaccin.id);
                closeModal();
              } catch (error) {
                Alert.alert(
                  "Erreur",
                  "Impossible de se supprimer. Veuillez réessayer plus tard."
                );
              }
            },
          },
        ]);
      } else {
        throw new Error("Aucune miction sélectionnée pour la suppression.");
      }
    } catch (error) {
      console.error("Erreur lors de la sauvegarde de la miction:", error);
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
      bottomSheetRef.current?.expand();
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
        {isLast && (
          <View style={styles.recentBadge}>
            <Text style={styles.recentText}>Récent</Text>
          </View>
        )}
        <FontAwesome name="edit" size={18} color="#666" style={styles.editIcon} />
      </View>
    </TouchableOpacity>
  );

  const filteredVaccins = VACCINS_LIST.filter((vaccin) =>
    vaccin.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.addButton}
          onPress={openModalHandler}
          activeOpacity={0.7}
        >
          <FontAwesome name="plus" size={16} color="white" />
          <Text style={styles.addButtonText}>Ajouter un vaccin</Text>
        </TouchableOpacity>
      </View>
      <FlatList
        data={groupedVaccins}
        keyExtractor={(item) => item.date}
        renderItem={({ item: group }) => (
          <View style={styles.dayCard}>
            <TouchableOpacity
              style={styles.dayHeader}
              onPress={() => toggleExpand(group.date)}
              activeOpacity={0.7}
            >
              <View style={styles.dayInfo}>
                <Text style={styles.dayDate}>{group.dateFormatted}</Text>
                <View style={styles.summaryInfo}>
                  <FontAwesome name="syringe" size={14} color="#666" />
                  <Text style={styles.summaryText}>
                    {group.vaccins.length} vaccin
                    {group.vaccins.length > 1 ? "s" : ""}
                  </Text>
                </View>
              </View>
              <TouchableOpacity
                style={styles.expandButton}
                onPress={() => toggleExpand(group.date)}
              >
                <FontAwesome
                  name={expandedDays.has(group.date) ? "chevron-up" : "chevron-down"}
                  size={16}
                  color="#666"
                />
              </TouchableOpacity>
            </TouchableOpacity>
            {renderVaccinItem(group.lastVaccin, true)}
            {expandedDays.has(group.date) && group.vaccins.length > 1 && (
              <View style={styles.expandedContent}>
                <View style={styles.separator} />
                <Text style={styles.historyLabel}>Historique</Text>
                {group.vaccins.slice(1).map((vaccin) => renderVaccinItem(vaccin))}
              </View>
            )}
          </View>
        )}
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <FontAwesome name="syringe" size={64} color="#ddd" />
            <Text style={styles.emptyText}>Aucun vaccin enregistré</Text>
            <Text style={styles.emptySubtext}>
              Ajoutez votre premier vaccin !
            </Text>
          </View>
        }
      />

      {/* Bottom Sheet d'ajout/édition */}
      <FormBottomSheet
        ref={bottomSheetRef}
        title={editingVaccin ? "Modifier le vaccin" : "Nouveau vaccin"}
        icon={editingVaccin ? "edit" : "syringe"}
        accentColor="#9C27B0"
        isEditing={!!editingVaccin}
        isSubmitting={isSubmitting}
        onSubmit={handleSubmitVaccin}
        onDelete={editingVaccin ? handleDeleteVaccin : undefined}
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
              <FontAwesome name="search" size={16} color="#999" style={styles.searchIcon} />
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
                  <FontAwesome name="times-circle" size={16} color="#999" style={styles.clearIcon} />
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