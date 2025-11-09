import FontAwesome from "@expo/vector-icons/FontAwesome6";
import DateTimePicker from "@react-native-community/datetimepicker";
import { router, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
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
import {
  ajouterTetee,
  ecouterTetees,
  modifierTetee,
  supprimerTetee,
} from "../../services/teteesService";
import ModernActionButtons from "../components/ModernActionsButton";

// Interface pour typer les données (avec optionnel pour compatibilité avec anciennes données)
interface Tetee {
  id: string;
  type?: "seins" | "biberons"; // Optionnel pour éviter les erreurs sur anciennes données
  quantite?: number | null; // Optionnel pour compatibilité
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
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [editingTetee, setEditingTetee] = useState<Tetee | null>(null);

  // États du formulaire
  const [dateHeure, setDateHeure] = useState<Date>(new Date());
  const [showDate, setShowDate] = useState(false);
  const [showTime, setShowTime] = useState(false);
  const [typeTetee, setTypeTetee] = useState<"seins" | "biberons">("seins");
  const [quantite, setQuantite] = useState<number>(100);

  // Récupérer les paramètres de l'URL
  const { openModal } = useLocalSearchParams();

  // interval ref pour la gestion du picker
const intervalRef = useRef<number | undefined>(undefined);

  // Ouvrir automatiquement le modal si le paramètre openModal est présent
  useEffect(() => {
    if (openModal === "true") {
      const timer = setTimeout(() => {
        openModalHandler();
        router.replace("/tetees");
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [openModal]);

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

  // Nettoyage de l'intervalle lors du démontage
  useEffect(() => {
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, []);

  const handlePressIn = (action: () => void) => {
    action();

    let speed = 200; // Démarre lentement

    const accelerate = () => {
      action();
      if (speed > 50) {
        speed -= 20; // Accélère progressivement
        clearInterval(intervalRef.current);
        intervalRef.current = setInterval(accelerate, speed);
      }
    };

    intervalRef.current = setInterval(accelerate, speed);
  };

  const handlePressOut = () => {
    // Arrête la répétition quand l'utilisateur relâche
   if (intervalRef.current !== undefined) {
    clearInterval(intervalRef.current);
    intervalRef.current = undefined;
  }
  };

  const groupTeteesByDay = (tetees: Tetee[]): TeteeGroup[] => {
    const groups: { [key: string]: Tetee[] } = {};

    tetees.forEach((tetee) => {
      const date = new Date(tetee.date?.seconds * 1000);
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, "0");
      const day = String(date.getDate()).padStart(2, "0");
      const dateKey = `${year}-${month}-${day}`;

      if (!groups[dateKey]) {
        groups[dateKey] = [];
      }
      groups[dateKey].push(tetee);
    });

    return Object.entries(groups)
      .map(([dateKey, tetees]) => {
        const date = new Date(dateKey);
        // Correction : Vérification pour quantite undefined/null
        const totalQuantity = tetees.reduce((sum, tetee) => {
          const q = tetee.quantite;
          return sum + (typeof q === "number" ? q : 0);
        }, 0);
        const lastTetee = tetees.reduce((latest, current) =>
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
          tetees: tetees.sort(
            (a, b) => (b.date?.seconds || 0) - (a.date?.seconds || 0)
          ),
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

  const openModalHandler = () => {
    const now = new Date();
    setDateHeure(new Date(now.getTime()));
    setTypeTetee("seins");
    setQuantite(100);
    setIsSubmitting(false);
    setEditingTetee(null);
    setShowModal(true);
  };

  const openEditModal = (tetee: Tetee) => {
    setDateHeure(new Date(tetee.date.seconds * 1000));

    // Correction : Gestion si type est undefined (anciennes données)
    const safeType = tetee.type || "seins"; // Défaut à "seins" pour anciennes tétées
    setTypeTetee(safeType as "seins" | "biberons");

    // Correction : Gestion si quantite est undefined/null
    const safeQuantite = tetee.quantite ?? 100;
    setQuantite(safeQuantite);

    setEditingTetee(tetee);
    setIsSubmitting(false);
    setShowModal(true);
  };

  const closeModal = () => {
    setShowModal(false);
    setIsSubmitting(false);
    setEditingTetee(null);
  };

  const cancelForm = useCallback(() => {
    closeModal();
  }, []);

  const handleSubmitTetee = async () => {
    if (isSubmitting) {
      return;
    }

    try {
      setIsSubmitting(true);

      const dataToSave = {
        type: typeTetee,
        quantite: typeTetee === "seins" ? null : quantite,
        date: dateHeure,
      };

      if (editingTetee) {
        await modifierTetee(editingTetee.id, dataToSave);
      } else {
        await ajouterTetee(dataToSave);
      }

      closeModal();
    } catch (error) {
      console.error("Erreur lors de la sauvegarde de la tétée:", error);
      // Optionnel : ajouter une alerte utilisateur ici
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteTetee = async () => {
    if (isSubmitting) {
      return;
    }

    try {
      setIsSubmitting(true);

      if (editingTetee) {
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
                await supprimerTetee(editingTetee.id);
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
        newDate.setHours(selectedDate.getHours(), selectedDate.getMinutes());
        return newDate;
      });
    }
  };

  const renderTeteeItem = (tetee: Tetee, isLast: boolean = false) => {
    // Correction clé : Vérification pour éviter charAt sur undefined
    const typeDisplay = tetee.type
      ? tetee.type.charAt(0).toUpperCase() + tetee.type.slice(1)
      : "Inconnu"; // Ou "Seins" si vous voulez mapper les anciennes valeurs

    const quantityDisplay =
      tetee.quantite !== null && tetee.quantite !== undefined
        ? `${tetee.quantite} ml`
        : "N/A";

    return (
      <TouchableOpacity
        key={tetee.id}
        style={[styles.teteeItem, isLast && styles.lastTeteeItem]}
        onPress={() => openEditModal(tetee)}
        activeOpacity={0.7}
      >
        <View style={styles.teteeContent}>
          <View style={styles.teteeInfo}>
            <View style={styles.infoRow}>
              <FontAwesome name="clock" size={16} color="#666" />
              <Text style={styles.timeText}>
                {new Date(tetee.date?.seconds * 1000).toLocaleTimeString(
                  "fr-FR",
                  {
                    hour: "2-digit",
                    minute: "2-digit",
                  }
                )}
              </Text>
            </View>
            <View style={styles.infoRow}>
              <FontAwesome
                name={
                  tetee.type === "seins" ? "person-breastfeeding" : "jar-wheat"
                }
                size={16}
                color="#666"
              />
              <Text style={styles.seinText}>{typeDisplay}</Text>
            </View>
          </View>
          <View style={styles.teteeActions}>
            <View style={styles.quantityBadge}>
              <Text style={styles.quantityText}>{quantityDisplay}</Text>
            </View>
            <FontAwesome
              name="edit"
              size={16}
              color="#4A90E2"
              style={styles.editIcon}
            />
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  const renderDayGroup = ({ item }: { item: TeteeGroup }) => {
    const isExpanded = expandedDays.has(item.date);
    const hasMultipleTetees = item.tetees.length > 1;

    return (
      <View style={styles.dayCard}>
        <View style={styles.dayHeader}>
          <View style={styles.dayInfo}>
            <Text style={styles.dayDate}>{item.dateFormatted}</Text>
            <View style={styles.summaryInfo}>
              <Text style={styles.summaryText}>
                {item.tetees.length} tétée{item.tetees.length > 1 ? "s" : ""} •{" "}
                {item.totalQuantity} ml total
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
        {renderTeteeItem(item.lastTetee, true)}
        {hasMultipleTetees && isExpanded && (
          <View style={styles.expandedContent}>
            <View style={styles.separator} />
            <Text style={styles.historyLabel}>Historique du jour</Text>
            {item.tetees
              .filter((tetee) => tetee.id !== item.lastTetee.id)
              .map((tetee) => renderTeteeItem(tetee))}
          </View>
        )}
      </View>
    );
  };

  const isQuantiteVisible = typeTetee === "biberons";

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.addButton} onPress={openModalHandler}>
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
            <Text style={styles.emptySubtext}>
              Ajoutez votre première tétée
            </Text>
          </View>
        }
      />

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
                name={editingTetee ? "edit" : "baby"}
                size={24}
                color="#4A90E2"
              />
              <Text style={styles.modalTitle}>
                {editingTetee ? "Modifier la tétée" : "Nouvelle tétée"}
              </Text>
              {editingTetee && (
                <TouchableOpacity onPress={handleDeleteTetee}>
                  <FontAwesome name="trash" size={24} color="red" />
                </TouchableOpacity>
              )}
            </View>

            <Text style={styles.modalCategoryLabel}>Type de tétée</Text>
            <View style={styles.typeRow}>
              {["seins", "biberons"].map((t) => (
                <TouchableOpacity
                  key={t}
                  style={[
                    styles.typeButton,
                    typeTetee === t && styles.typeButtonActive,
                    isSubmitting && styles.typeButtonDisabled,
                  ]}
                  onPress={() => {
                    setTypeTetee(t as "seins" | "biberons");
                    if (t === "seins") setQuantite(100); // Réinitialiser si seins
                  }}
                  disabled={isSubmitting}
                >
                  <Text
                    style={[
                      styles.typeText,
                      typeTetee === t && styles.typeTextActive,
                      isSubmitting && styles.typeTextDisabled,
                    ]}
                  >
                    {t.charAt(0).toUpperCase() + t.slice(1)}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {isQuantiteVisible && (
              <>
                <Text style={styles.modalCategoryLabel}>Quantité</Text>
                <View style={styles.quantityRow}>
                  <TouchableOpacity
                    style={[
                      styles.quantityButton,
                      isSubmitting && styles.quantityButtonDisabled,
                    ]}
                    // onPress={() => setQuantite((q) => Math.max(0, q - 5))}
                    onPressIn={() =>
                      handlePressIn(() =>
                        setQuantite((q) => Math.max(0, q - 5))
                      )
                    }
                    onPressOut={handlePressOut}
                    disabled={isSubmitting}
                  >
                    <Text
                      style={[
                        styles.quantityButtonText,
                        isSubmitting && styles.quantityButtonTextDisabled,
                      ]}
                    >
                      -
                    </Text>
                  </TouchableOpacity>
                  <Text style={styles.quantityValue}>{quantite} ml</Text>
                  <TouchableOpacity
                    style={[
                      styles.quantityButton,
                      isSubmitting && styles.quantityButtonDisabled,
                    ]}
                    // onPress={() => setQuantite((q) => q + 5)}
                    onPressIn={() =>
                      handlePressIn(() =>
                        setQuantite((q) => Math.max(0, q + 5))
                      )
                    }
                    onPressOut={handlePressOut}
                    disabled={isSubmitting}
                  >
                    <Text
                      style={[
                        styles.quantityButtonText,
                        isSubmitting && styles.quantityButtonTextDisabled,
                      ]}
                    >
                      +
                    </Text>
                  </TouchableOpacity>
                </View>
              </>
            )}
            {!isQuantiteVisible && (
              <View style={styles.quantityNA}>
                <Text style={styles.quantityNAText}>Quantité : N/A</Text>
              </View>
            )}

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
                onValidate={handleSubmitTetee}
                cancelText="Annuler"
                validateText={editingTetee ? "Mettre à jour" : "Ajouter"}
                isLoading={isSubmitting}
                disabled={isSubmitting}
                loadingText={
                  editingTetee ? "Mise à jour..." : "Ajout en cours..."
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
    marginBottom: 6,
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
  teteeActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
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
  typeRow: {
    flexDirection: "row",
    justifyContent: "space-around",
    marginBottom: 20,
  },
  typeButton: {
    padding: 12,
    backgroundColor: "#f0f0f0",
    borderRadius: 12,
    minWidth: 120,
    alignItems: "center",
  },
  typeButtonActive: {
    backgroundColor: "#4A90E2",
  },
  typeButtonDisabled: {
    backgroundColor: "#f8f8f8",
    opacity: 0.5,
  },
  typeText: {
    fontSize: 16,
    color: "#666",
    textTransform: "capitalize",
  },
  typeTextActive: {
    color: "white",
    fontWeight: "bold",
  },
  typeTextDisabled: {
    color: "#ccc",
  },
  quantityNA: {
    alignItems: "center",
    marginBottom: 20,
  },
  quantityNAText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#999",
  },
  quantityRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 20,
  },
  quantityButton: {
    backgroundColor: "#f0f0f0",
    padding: 12,
    borderRadius: 8,
    minWidth: 40,
    alignItems: "center",
  },
  quantityButtonDisabled: {
    backgroundColor: "#f8f8f8",
    opacity: 0.5,
  },
  quantityButtonText: {
    fontSize: 20,
    fontWeight: "bold",
    color: "#666",
  },
  quantityButtonTextDisabled: {
    color: "#ccc",
  },
  quantityValue: {
    fontSize: 20,
    marginHorizontal: 20,
    fontWeight: "bold",
    color: "#000000",
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
  dateButtonDisabled: {
    backgroundColor: "#f5f5f5",
    opacity: 0.5,
  },
  dateButtonText: {
    fontSize: 16,
    color: "#666",
  },
  dateButtonTextDisabled: {
    color: "#ccc",
  },
  selectedDateTime: {
    alignItems: "center",
    marginBottom: 20,
  },
  selectedDate: {
    fontSize: 16,
    color: "#333",
    fontWeight: "600",
    marginBottom: 4,
  },
  selectedTime: {
    fontSize: 20,
    color: "#004cdaff",
    fontWeight: "bold",
  },
  actionButtonsContainer: {
    paddingHorizontal: 20,
    paddingBottom: Platform.OS === "ios" ? 34 : 20,
  },
});
