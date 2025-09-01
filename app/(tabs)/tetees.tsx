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
  View
} from "react-native";
import { ajouterTetee, ecouterTetees } from "../../services/teteesService";
import ModernActionButtons from "../components/ModernActionsButton";

// Interface pour typer les données
interface Tetee {
  id: string;
  sein: "sein gauche" | "sein droit" | "seins + biberon";
  quantite: number;
  date: { seconds: number };
  createdAt: { seconds: number };
}

interface TeteeGroup {
  date: string;
  dateFormatted: string;
  tetees: Tetee[];
  totalQuantity: number;
  lastTetee: Tetee;
}

export default function TeteesScreen() {
  const [tetees, setTetees] = useState<Tetee[]>([]);
  const [groupedTetees, setGroupedTetees] = useState<TeteeGroup[]>([]);
  const [expandedDays, setExpandedDays] = useState<Set<string>>(new Set());
  const [showModal, setShowModal] = useState<boolean>(false);

  // États du formulaire
  const [dateHeure, setDateHeure] = useState<Date>(new Date());
  const [showDate, setShowDate] = useState(false);
  const [showTime, setShowTime] = useState(false);
  const [sein, setSein] = useState<"sein gauche" | "sein droit" | "seins + biberon">("seins + biberon");
  const [quantite, setQuantite] = useState<number>(50);

  // Écoute en temps réel
  useEffect(() => {
    const unsubscribe = ecouterTetees(setTetees);
    return () => unsubscribe();
  }, []);

  // Regroupement par jour
  useEffect(() => {
    const grouped = groupTeteesByDay(tetees);
    setGroupedTetees(grouped);
  }, [tetees]);

  const groupTeteesByDay = (tetees: Tetee[]): TeteeGroup[] => {
    const groups: { [key: string]: Tetee[] } = {};
    
    tetees.forEach((tetee) => {
      const date = new Date(tetee.date?.seconds * 1000);
      const dateKey = date.toISOString().split('T')[0];
      
      if (!groups[dateKey]) {
        groups[dateKey] = [];
      }
      groups[dateKey].push(tetee);
    });

    return Object.entries(groups)
      .map(([dateKey, tetees]) => {
        const date = new Date(dateKey);
        const totalQuantity = tetees.reduce((sum, tetee) => sum + (tetee.quantite || 0), 0);
        const lastTetee = tetees.reduce((latest, current) => 
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
          tetees: tetees.sort((a, b) => (b.date?.seconds || 0) - (a.date?.seconds || 0)),
          totalQuantity,
          lastTetee,
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
    setQuantite(50);
    setDateHeure(new Date());
    toggleModal();
  }, [toggleModal]);

  const handleAddTetee = async () => {
    await ajouterTetee({
      sein,
      quantite,
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

  const renderTeteeItem = (tetee: Tetee, isLast: boolean = false) => (
    <View 
      key={tetee.id} 
      style={[styles.teteeItem, isLast && styles.lastTeteeItem]}
    >
      <View style={styles.teteeContent}>
        <View style={styles.teteeInfo}>
          <View style={styles.infoRow}>
            <FontAwesome name="clock" size={16} color="#666" />
            <Text style={styles.timeText}>
              {new Date(tetee.date?.seconds * 1000).toLocaleTimeString("fr-FR", {
                hour: "2-digit",
                minute: "2-digit",
              })}
            </Text>
          </View>
          <View style={styles.infoRow}>
            <FontAwesome name="leaf" size={14} color="#666" />
            <Text style={styles.seinText}>{tetee.sein}</Text>
          </View>
        </View>
        <View style={styles.quantityBadge}>
          <Text style={styles.quantityText}>{tetee.quantite} ml</Text>
        </View>
      </View>
    </View>
  );

  const renderDayGroup = ({ item }: { item: TeteeGroup }) => {
    const isExpanded = expandedDays.has(item.date);
    const hasMultipleTetees = item.tetees.length > 1;

    return (
      <View style={styles.dayCard}>
        {/* En-tête du jour */}
        <View style={styles.dayHeader}>
          <View style={styles.dayInfo}>
            <Text style={styles.dayDate}>{item.dateFormatted}</Text>
            <View style={styles.summaryInfo}>
              <Text style={styles.summaryText}>
                {item.tetees.length} tétée{item.tetees.length > 1 ? 's' : ''} • {item.totalQuantity} ml total
              </Text>
            </View>
          </View>
          {hasMultipleTetees && (
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

        {/* Dernière tétée (toujours visible) */}
        {renderTeteeItem(item.lastTetee, true)}

        {/* Tétées supplémentaires (repliables) */}
        {hasMultipleTetees && isExpanded && (
          <View style={styles.expandedContent}>
            <View style={styles.separator} />
            <Text style={styles.historyLabel}>Historique du jour</Text>
            {item.tetees
              .filter(tetee => tetee.id !== item.lastTetee.id)
              .map(tetee => renderTeteeItem(tetee))}
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
          <Text style={styles.addButtonText}>Nouvelle tétée</Text>
        </TouchableOpacity>
      </View>

      <FlatList
        data={groupedTetees}
        keyExtractor={(item) => item.date}
        renderItem={renderDayGroup}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <FontAwesome name="baby" size={48} color="#ccc" />
            <Text style={styles.emptyText}>Aucune tétée enregistrée</Text>
            <Text style={styles.emptySubtext}>Ajoutez votre première tétée</Text>
          </View>
        }
      />

      {/* MODAL (inchangée) */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={showModal}
        onRequestClose={toggleModal}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalCategoryLabel}>Ajouter une tétée</Text>
            
            {/* Sélection du sein */}
            <View style={styles.seinRow}>
              {["sein gauche", "sein droit"].map((s) => (
                <TouchableOpacity
                  key={s}
                  style={[
                    styles.seinButton,
                    sein === s && styles.seinButtonActive,
                  ]}
                  onPress={() => setSein(s as any)}
                >
                  <Text
                    style={[
                      styles.seinText,
                      sein === s && styles.seinTextActive,
                    ]}
                  >
                    {s}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Quantité */}
            <Text style={styles.modalCategoryLabel}>Quantité</Text>
            <View style={styles.quantityRow}>
              <TouchableOpacity
                style={styles.quantityButton}
                onPress={() => setQuantite((q) => Math.max(0, q - 5))}
              >
                <Text style={styles.quantityButtonText}>-</Text>
              </TouchableOpacity>
              <Text style={styles.quantityValue}>{quantite} ml</Text>
              <TouchableOpacity
                style={styles.quantityButton}
                onPress={() => setQuantite((q) => q + 5)}
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
                <Text style={styles.dateButtonText}>Choisir la Date</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.dateButton}
                onPress={() => setShowTime(true)}
              >
                <Text style={styles.dateButtonText}>{`Choisir l'Heure`}</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.selectedDateTime}>
              <Text style={styles.subtitle}>
                {dateHeure.toLocaleDateString("fr-FR", {
                  weekday: "long",
                  year: "numeric",
                  month: "long",
                  day: "numeric",
                })}
              </Text>
              <Text style={styles.subtitle}>
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
                onValidate={handleAddTetee}
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
    backgroundColor: "#4A90E2",
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
  teteeItem: {
    backgroundColor: "#f8f9fa",
    borderRadius: 8,
    padding: 12,
    marginBottom: 8,
  },
  lastTeteeItem: {
    backgroundColor: "#e8f4fd",
    borderLeftWidth: 4,
    borderLeftColor: "#4A90E2",
  },
  teteeContent: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  teteeInfo: {
    flex: 1,
  },
  infoRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 4,
    gap: 8,
  },
  timeText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#333",
  },
  seinText: {
    fontSize: 14,
    color: "#666",
    textTransform: "capitalize",
  },
  quantityBadge: {
    backgroundColor: "#4A90E2",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
  },
  quantityText: {
    color: "white",
    fontSize: 14,
    fontWeight: "600",
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
  // Styles du modal (simplifiés)
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
  modalCategoryLabel: {
    fontSize: 18,
    alignSelf: "center",
    fontWeight: "bold",
    paddingVertical: 10,
  },
  seinRow: {
    flexDirection: "row",
    justifyContent: "space-around",
    marginBottom: 20,
  },
  seinButton: {
    padding: 12,
    backgroundColor: "#f0f0f0",
    borderRadius: 12,
    minWidth: 120,
    alignItems: "center",
  },
  seinButtonActive: {
    backgroundColor: "#4A90E2",
  },
  seinTextActive: {
    color: "white",
    fontWeight: "bold",
  },
  quantityRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    marginVertical: 20,
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
  quantityValue: {
    fontSize: 20,
    marginHorizontal: 20,
    fontWeight: "bold",
  },
  dateTimeContainer: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 10,
    marginBottom: 10,
  },
  dateButton: {
    backgroundColor: "#f0f0f0",
    padding: 12,
    borderRadius: 8,
    alignItems: "center",
    flex: 1,
  },
  dateButtonText: {
    fontSize: 16,
  },
  selectedDateTime: {
    alignItems: "center",
    marginBottom: 20,
  },
  subtitle: {
    fontSize: 14,
    color: "#004cdaff",
    marginBottom: 4,
  },
  actionButtonsContainer: {
    paddingHorizontal: 20,
    paddingBottom: Platform.OS === "ios" ? 34 : 20,
  },
});