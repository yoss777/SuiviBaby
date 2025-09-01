import { ajouterPompage, ecouterPompages } from "@/services/pompagesService";
import FontAwesome from "@expo/vector-icons/FontAwesome5";
import DateTimePicker from "@react-native-community/datetimepicker";
import { useCallback, useEffect, useState } from "react";
import {
  FlatList,
  Modal,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import ModernActionButtons from "../components/ModernActionsButton";

// Interface pour typer les données
interface Pompage {
  id: string;
  quantiteGauche: number;
  quantiteDroite: number;
  date: { seconds: number };
  createdAt: { seconds: number };
}

interface PompageGroup {
  date: string;
  dateFormatted: string;
  pompages: Pompage[];
  totalQuantityLeft: number;
  totalQuantityRight: number;
  totalQuantity: number;
  lastPompage: Pompage;
}

export default function PompagesScreen() {
  const [pompages, setPompages] = useState<Pompage[]>([]);
  const [groupedPompages, setGroupedPompages] = useState<PompageGroup[]>([]);
  const [expandedDays, setExpandedDays] = useState<Set<string>>(new Set());
  const [showModal, setShowModal] = useState<boolean>(false);

  // États du formulaire
  const [dateHeure, setDateHeure] = useState<Date>(new Date());
  const [showDate, setShowDate] = useState(false);
  const [showTime, setShowTime] = useState(false);
  const [quantiteGauche, setQuantiteGauche] = useState<number>(100);
  const [quantiteDroite, setQuantiteDroite] = useState<number>(100);

  // Écoute en temps réel
  useEffect(() => {
    const unsubscribe = ecouterPompages(setPompages);
    return () => unsubscribe();
  }, []);

  // Regroupement par jour
  useEffect(() => {
    const grouped = groupPompagesByDay(pompages);
    setGroupedPompages(grouped);
  }, [pompages]);

  const groupPompagesByDay = (pompages: Pompage[]): PompageGroup[] => {
    const groups: { [key: string]: Pompage[] } = {};

    pompages.forEach((pompage) => {
      const date = new Date(pompage.date?.seconds * 1000);
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, "0");
      const day = String(date.getDate()).padStart(2, "0");
      const dateKey = `${year}-${month}-${day}`;

      if (!groups[dateKey]) {
        groups[dateKey] = [];
      }
      groups[dateKey].push(pompage);
    });

    return Object.entries(groups)
      .map(([dateKey, pompages]) => {
        const date = new Date(dateKey);
        const totalQuantityLeft = pompages.reduce(
          (sum, pompage) => sum + (pompage.quantiteGauche || 0),
          0
        );
        const totalQuantityRight = pompages.reduce(
          (sum, pompage) => sum + (pompage.quantiteDroite || 0),
          0
        );
        const totalQuantity = totalQuantityLeft + totalQuantityRight;
        const lastPompage = pompages.reduce((latest, current) =>
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
          pompages: pompages.sort(
            (a, b) => (b.date?.seconds || 0) - (a.date?.seconds || 0)
          ),
          totalQuantityLeft,
          totalQuantityRight,
          totalQuantity,
          lastPompage,
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

  const toggleModal = () => {
    setShowModal(!showModal);
  };

  const cancelForm = useCallback(() => {
    setQuantiteGauche(100);
    setQuantiteDroite(100);
    setDateHeure(new Date());
    toggleModal();
  }, [toggleModal]);

  const handleAddPompage = async () => {
    await ajouterPompage({
      quantiteGauche,
      quantiteDroite,
      date: dateHeure,
    });
    toggleModal();
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

  const renderPompageItem = (pompage: Pompage, isLast: boolean = false) => (
    <View
      key={pompage.id}
      style={[styles.pompageItem, isLast && styles.lastPompageItem]}
    >
      <View style={styles.pompageHeader}>
        <View style={styles.timeContainer}>
          <FontAwesome
            name="clock"
            size={14}
            color={isLast ? "#28a745" : "#666"}
          />
          <Text style={[styles.timeText, isLast && styles.lastTimeText]}>
            {new Date(pompage.date?.seconds * 1000).toLocaleTimeString(
              "fr-FR",
              {
                hour: "2-digit",
                minute: "2-digit",
              }
            )}
          </Text>
        </View>
        {isLast && (
          <View style={styles.recentBadge}>
            <Text style={styles.recentText}>Récent</Text>
          </View>
        )}
      </View>

      <View style={styles.quantitiesContainer}>
        <View style={styles.quantityRow}>
          <View style={styles.quantityInfo}>
            <FontAwesome name="chevron-left" size={12} color="#666" />
            <Text style={styles.quantityLabel}>Gauche</Text>
          </View>
          <Text style={styles.quantityValue}>{pompage.quantiteGauche} ml</Text>
        </View>

        <View style={styles.quantityRow}>
          <View style={styles.quantityInfo}>
            <FontAwesome name="chevron-right" size={12} color="#666" />
            <Text style={styles.quantityLabel}>Droite</Text>
          </View>
          <Text style={styles.quantityValue}>{pompage.quantiteDroite} ml</Text>
        </View>

        <View style={styles.totalRow}>
          <Text style={styles.totalLabel}>Total</Text>
          <Text style={styles.totalValue}>
            {(pompage.quantiteGauche || 0) + (pompage.quantiteDroite || 0)} ml
          </Text>
        </View>
      </View>
    </View>
  );

  const renderDayGroup = ({ item }: { item: PompageGroup }) => {
    const isExpanded = expandedDays.has(item.date);
    const hasMultiplePompages = item.pompages.length > 1;

    return (
      <View style={styles.dayCard}>
        {/* En-tête du jour avec résumé */}
        <View style={styles.dayHeader}>
          <View style={styles.dayInfo}>
            <Text style={styles.dayDate}>{item.dateFormatted}</Text>
            <View style={styles.summaryInfo}>
              <FontAwesome name="pump-medical" size={14} color="#666" />
              <Text style={styles.summaryText}>
                {item.pompages.length} session
                {item.pompages.length > 1 ? "s" : ""} • {item.totalQuantity} ml
              </Text>
            </View>
            <View style={styles.dailySummary}>
              <View style={styles.dailyQuantityItem}>
                <Text style={styles.dailyQuantityLabel}>Gauche:</Text>
                <Text style={styles.dailyQuantityValue}>
                  {item.totalQuantityLeft} ml
                </Text>
              </View>
              <View style={styles.dailyQuantityItem}>
                <Text style={styles.dailyQuantityLabel}>Droite:</Text>
                <Text style={styles.dailyQuantityValue}>
                  {item.totalQuantityRight} ml
                </Text>
              </View>
            </View>
          </View>
          {hasMultiplePompages && (
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

        {/* Dernier pompage (toujours visible) */}
        {renderPompageItem(item.lastPompage, true)}

        {/* Pompages supplémentaires (repliables) */}
        {hasMultiplePompages && isExpanded && (
          <View style={styles.expandedContent}>
            <View style={styles.separator} />
            <Text style={styles.historyLabel}>Historique du jour</Text>
            {item.pompages
              .filter((pompage) => pompage.id !== item.lastPompage.id)
              .map((pompage) => renderPompageItem(pompage))}
          </View>
        )}
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.addButton} onPress={toggleModal}>
          <FontAwesome name="plus" size={16} color="white" />
          <Text style={styles.addButtonText}>Nouvelle session</Text>
        </TouchableOpacity>
      </View>

      <FlatList
        data={groupedPompages}
        keyExtractor={(item) => item.date}
        renderItem={renderDayGroup}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <FontAwesome name="pump-medical" size={48} color="#ccc" />
            <Text style={styles.emptyText}>Aucune session enregistrée</Text>
            <Text style={styles.emptySubtext}>
              Ajoutez votre première session tire-lait
            </Text>
          </View>
        }
      />

      {/* MODAL */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={showModal}
        onRequestClose={toggleModal}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <FontAwesome name="pump-medical" size={24} color="#28a745" />
              <Text style={styles.modalTitle}>Nouvelle session</Text>
            </View>

            {/* Quantité Sein Gauche */}
            <Text style={styles.modalCategoryLabel}>Quantité Sein Gauche</Text>
            <View style={styles.quantityRow}>
              <TouchableOpacity
                style={styles.quantityButton}
                onPress={() => setQuantiteGauche((q) => Math.max(0, q - 5))}
              >
                <Text style={styles.quantityButtonText}>-</Text>
              </TouchableOpacity>
              <Text style={styles.quantityValue}>{quantiteGauche} ml</Text>
              <TouchableOpacity
                style={styles.quantityButton}
                onPress={() => setQuantiteGauche((q) => q + 5)}
              >
                <Text style={styles.quantityButtonText}>+</Text>
              </TouchableOpacity>
            </View>

            {/* Quantité Sein Droit */}
            <Text style={styles.modalCategoryLabel}>Quantité Sein Droit</Text>
            <View style={styles.quantityRow}>
              <TouchableOpacity
                style={styles.quantityButton}
                onPress={() => setQuantiteDroite((q) => Math.max(0, q - 5))}
              >
                <Text style={styles.quantityButtonText}>-</Text>
              </TouchableOpacity>
              <Text style={styles.quantityValue}>{quantiteDroite} ml</Text>
              <TouchableOpacity
                style={styles.quantityButton}
                onPress={() => setQuantiteDroite((q) => q + 5)}
              >
                <Text style={styles.quantityButtonText}>+</Text>
              </TouchableOpacity>
            </View>

            {/* Date & Heure */}
            <Text style={styles.modalCategoryLabel}>Date & Heure</Text>
            <View style={styles.dateTimeContainer}>
              <TouchableOpacity
                style={styles.dateButton}
                onPress={() => setShowDate(true)}
              >
                <FontAwesome name="calendar-alt" size={16} color="#666" />
                <Text style={styles.dateButtonText}>Date</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.dateButton}
                onPress={() => setShowTime(true)}
              >
                <FontAwesome name="clock" size={16} color="#666" />
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
                onValidate={handleAddPompage}
                cancelText="Annuler"
                validateText="Ajouter"
              />
            </View>
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
    backgroundColor: "#28a745", // Couleur verte pour les pompages
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
    marginBottom: 16,
  },
  dayInfo: {
    flex: 1,
  },
  dayDate: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#333",
    marginBottom: 6,
  },
  summaryInfo: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 8,
  },
  summaryText: {
    fontSize: 14,
    color: "#666",
  },
  dailySummary: {
    flexDirection: "row",
    gap: 16,
  },
  dailyQuantityItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  dailyQuantityLabel: {
    fontSize: 12,
    color: "#666",
  },
  dailyQuantityValue: {
    fontSize: 12,
    color: "#28a745",
    fontWeight: "600",
  },
  expandButton: {
    padding: 8,
    borderRadius: 8,
    backgroundColor: "#f0f0f0",
  },
  pompageItem: {
    backgroundColor: "#f8f9fa",
    borderRadius: 12,
    padding: 14,
    marginBottom: 8,
  },
  lastPompageItem: {
    backgroundColor: "#f0f8f4",
    borderLeftWidth: 4,
    borderLeftColor: "#28a745",
  },
  pompageHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  timeContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  timeText: {
    fontSize: 16,
    fontWeight: "500",
    color: "#666",
  },
  lastTimeText: {
    color: "#333",
    fontWeight: "600",
  },
  recentBadge: {
    backgroundColor: "#28a745",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  recentText: {
    color: "white",
    fontSize: 12,
    fontWeight: "600",
  },
  quantitiesContainer: {
    gap: 8,
  },
  quantityRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 6,
    paddingHorizontal: 12,
    backgroundColor: "white",
    borderRadius: 8,
  },
  quantityInfo: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  quantityLabel: {
    fontSize: 14,
    color: "#666",
  },
  quantityValue: {
    fontSize: 14,
    color: "#333",
    fontWeight: "600",
  },
  totalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: "#28a745",
    borderRadius: 8,
    marginTop: 4,
  },
  totalLabel: {
    fontSize: 14,
    color: "white",
    fontWeight: "600",
  },
  totalValue: {
    fontSize: 16,
    color: "white",
    fontWeight: "bold",
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
  // Styles du modal
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
    fontSize: 16,
    fontWeight: "600",
    color: "#333",
    marginBottom: 12,
  },
  quantityButton: {
    backgroundColor: "#f0f0f0",
    padding: 12,
    borderRadius: 8,
    minWidth: 40,
    alignItems: "center",
  },
  quantityButtonText: {
    fontSize: 20,
    fontWeight: "bold",
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
  dateButtonText: {
    fontSize: 16,
    color: "#666",
    fontWeight: "500",
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
    color: "#28a745",
    fontWeight: "bold",
  },
  actionButtonsContainer: {
    paddingHorizontal: 20,
    paddingBottom: Platform.OS === "ios" ? 34 : 20,
  },
});
