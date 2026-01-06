import ModernActionButtons from "@/components/suivibaby/ModernActionsButton";
import { useBaby } from "@/contexts/BabyContext";
import {
  ajouterSelle,
  modifierSelle,
  supprimerSelle,
} from "@/services/sellesService";
import FontAwesome from "@expo/vector-icons/FontAwesome5";
import DateTimePicker from "@react-native-community/datetimepicker";
import { useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import {
  Alert,
  FlatList,
  Modal,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

type Props = {
  selles: any[];
  onEditSelle?: (selle: Selle) => void;
};

// Interface pour typer les données
interface Selle {
  id: string;
  date: { seconds: number };
  createdAt: { seconds: number };
}

interface SelleGroup {
  date: string;
  dateFormatted: string;
  selles: Selle[];
  lastSelle: Selle;
}

export default function SellesScreen({ selles, onEditSelle }: Props) {
  const { activeChild } = useBaby();
  const [groupedSelles, setGroupedSelles] = useState<SelleGroup[]>([]);
  const [expandedDays, setExpandedDays] = useState<Set<string>>(new Set());
  const [showModal, setShowModal] = useState<boolean>(false);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [editingSelle, setEditingSelle] = useState<Selle | null>(null);

  // États du formulaire
  const [dateHeure, setDateHeure] = useState<Date>(new Date());
  const [showDate, setShowDate] = useState(false);
  const [showTime, setShowTime] = useState(false);

  // Récupérer les paramètres de l'URL
  const { openModal } = useLocalSearchParams();

  // Ouvrir automatiquement le modal si le paramètre openModal est présent
  // useEffect(() => {
  //   if (openModal === "true" && onEditSelle) {
  //     const timer = setTimeout(() => {
  //       openModalHandler();
  //       router.replace("/excretions?openModal=true&tab=selles");
  //     }, 100);

  //     return () => clearTimeout(timer);
  //   }
  // }, [openModal, onEditSelle]);

  // Regroupement par jour
  useEffect(() => {
    const grouped = groupSellesByDay(selles);
    setGroupedSelles(grouped);
  }, [selles]);

  const groupSellesByDay = (selles: Selle[]): SelleGroup[] => {
    const groups: { [key: string]: Selle[] } = {};

    selles.forEach((selle) => {
      const date = new Date(selle.date?.seconds * 1000);
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, "0");
      const day = String(date.getDate()).padStart(2, "0");
      const dateKey = `${year}-${month}-${day}`;

      if (!groups[dateKey]) {
        groups[dateKey] = [];
      }
      groups[dateKey].push(selle);
    });

    return Object.entries(groups)
      .map(([dateKey, selles]) => {
        const date = new Date(dateKey);
        const lastSelle = selles.reduce((latest, current) =>
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
          selles: selles.sort(
            (a, b) => (b.date?.seconds || 0) - (a.date?.seconds || 0)
          ),
          lastSelle,
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
    setEditingSelle(null);
    setIsSubmitting(false);
    setShowModal(true);
  };

  const openEditModal = (selle: Selle) => {
    setDateHeure(new Date(selle.date.seconds * 1000));
    setEditingSelle(selle);
    setIsSubmitting(false);
    setShowModal(true);
  };

  const closeModal = () => {
    setShowModal(false);
    setIsSubmitting(false);
    setEditingSelle(null);
  };

  const cancelForm = useCallback(() => {
    closeModal();
  }, []);

  const handleSubmitSelle = async () => {
    if (isSubmitting) {
      return;
    }

    try {
      setIsSubmitting(true);

      if (!activeChild) {
        throw new Error("Aucun enfant sélectionné");
      }

      if (editingSelle) {
        await modifierSelle(activeChild.id, editingSelle.id, {
          date: dateHeure,
        });
      } else {
        await ajouterSelle(activeChild.id, {
          date: dateHeure,
        });
      }

      closeModal();
    } catch (error) {
      console.error("Erreur lors de la sauvegarde de la selle:", error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteSelle = async () => {
    if (isSubmitting) {
      return;
    }

    try {
      setIsSubmitting(true);

      if (editingSelle) {
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
                await supprimerSelle(activeChild.id, editingSelle.id);
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

  const renderSelleItem = (selle: Selle, isLast: boolean = false) => (
    <TouchableOpacity
      key={selle.id}
      style={[styles.selleItem, isLast && styles.lastSelleItem]}
      onPress={() => openEditModal(selle)}
      activeOpacity={0.7}
    >
      <View style={styles.selleContent}>
        <FontAwesome
          name="clock"
          size={16}
          color={isLast ? "#dc3545" : "#666"}
        />
        <Text style={[styles.timeText, isLast && styles.lastTimeText]}>
          {new Date(selle.date?.seconds * 1000).toLocaleTimeString("fr-FR", {
            hour: "2-digit",
            minute: "2-digit",
          })}
        </Text>
        <View style={styles.selleActions}>
          {isLast && (
            <View style={styles.recentBadge}>
              <Text style={styles.recentText}>Récent</Text>
            </View>
          )}
          <FontAwesome
            name="edit"
            size={16}
            color="#dc3545"
            style={styles.editIcon}
          />
        </View>
      </View>
    </TouchableOpacity>
  );

  const renderDayGroup = ({ item }: { item: SelleGroup }) => {
    const isExpanded = expandedDays.has(item.date);
    const hasMultipleSelles = item.selles.length > 1;

    return (
      <View style={styles.dayCard}>
        <View style={styles.dayHeader}>
          <View style={styles.dayInfo}>
            <Text style={styles.dayDate}>{item.dateFormatted}</Text>
            <View style={styles.summaryInfo}>
              <FontAwesome name="circle" size={14} color="#666" />
              <Text style={styles.summaryText}>
                {item.selles.length} selle{item.selles.length > 1 ? "s" : ""}
              </Text>
            </View>
          </View>
          {hasMultipleSelles && (
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

        {renderSelleItem(item.lastSelle, true)}

        {hasMultipleSelles && isExpanded && (
          <View style={styles.expandedContent}>
            <View style={styles.separator} />
            <Text style={styles.historyLabel}>Historique du jour</Text>
            {item.selles
              .filter((selle) => selle.id !== item.lastSelle.id)
              .map((selle) => renderSelleItem(selle))}
          </View>
        )}
      </View>
    );
  };

  return (
    <View style={styles.container}>
      {/* <View style={styles.header} /> */}

      <FlatList
        data={groupedSelles}
        keyExtractor={(item) => item.date}
        renderItem={renderDayGroup}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <FontAwesome name="circle" size={48} color="#ccc" />
            <Text style={styles.emptyText}>Aucune selle enregistrée</Text>
            <Text style={styles.emptySubtext}>
              Ajoutez votre première selle
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
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <FontAwesome
                name={editingSelle ? "edit" : "circle"}
                size={20}
                color="#dc3545"
              />
              <Text style={styles.modalTitle}>
                {editingSelle ? "Modifier la selle" : "Nouvelle selle"}
              </Text>
              {editingSelle && (
                <TouchableOpacity onPress={handleDeleteSelle}>
                  <FontAwesome name="trash" size={24} color="red" />
                </TouchableOpacity>
              )}
            </View>

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
                onValidate={handleSubmitSelle}
                cancelText="Annuler"
                validateText={editingSelle ? "Mettre à jour" : "Ajouter"}
                isLoading={isSubmitting}
                disabled={isSubmitting}
                loadingText={
                  editingSelle ? "Mise à jour..." : "Ajout en cours..."
                }
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
  selleItem: {
    backgroundColor: "#f8f9fa",
    borderRadius: 8,
    padding: 12,
    marginBottom: 8,
  },
  lastSelleItem: {
    backgroundColor: "#fdf2f2",
    borderLeftWidth: 4,
    borderLeftColor: "#dc3545",
  },
  selleContent: {
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
  selleActions: {
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
    color: "#dc3545",
    fontWeight: "bold",
  },
  actionButtonsContainer: {
    paddingHorizontal: 20,
    paddingBottom: Platform.OS === "ios" ? 34 : 20,
  },
});
