import { FormBottomSheet } from "@/components/ui/FormBottomSheet";
import { useBaby } from "@/contexts/BabyContext";
import {
  ajouterBiberon,
  ajouterTetee,
  modifierBiberon,
  modifierTetee,
  supprimerTetee,
} from "@/migration/eventsDoubleWriteService";
import {
  ecouterBiberonsHybrid as ecouterBiberons,
  ecouterTeteesHybrid as ecouterTetees,
} from "@/migration/eventsHybridService";
import FontAwesome from "@expo/vector-icons/FontAwesome6";
import BottomSheet from "@gorhom/bottom-sheet";
import DateTimePicker from "@react-native-community/datetimepicker";
import { router, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Alert,
  FlatList,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

// ============================================
// TYPES
// ============================================

type MealType = "tetee" | "biberon";

interface Meal {
  id: string;
  type?: MealType;
  quantite?: number | null;
  date: { seconds: number };
  createdAt: { seconds: number };
}

interface MealGroup {
  date: string;
  dateFormatted: string;
  meals: Meal[];
  totalQuantity: number;
  lastMeal: Meal;
}

// ============================================
// COMPONENT
// ============================================

export default function RepasScreen() {
  const { activeChild } = useBaby();

  // États des données
  const [meals, setMeals] = useState<Meal[]>([]);
  const [groupedMeals, setGroupedMeals] = useState<MealGroup[]>([]);
  const [expandedDays, setExpandedDays] = useState<Set<string>>(new Set());

  // États du formulaire
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [editingMeal, setEditingMeal] = useState<Meal | null>(null);
  const [mealType, setMealType] = useState<MealType>("tetee");
  const [dateHeure, setDateHeure] = useState<Date>(new Date());
  const [quantite, setQuantite] = useState<number>(100);

  // États des pickers
  const [showDate, setShowDate] = useState(false);
  const [showTime, setShowTime] = useState(false);

  // Récupérer les paramètres de l'URL
  const { tab, openModal } = useLocalSearchParams();

  // Ref pour la gestion du picker avec accélération
  const intervalRef = useRef<number | undefined>(undefined);

  // Ref pour le BottomSheet
  const bottomSheetRef = useRef<BottomSheet>(null);

  // ============================================
  // EFFECTS - URL PARAMS
  // ============================================

  // Définir l'onglet initial en fonction du paramètre
  useEffect(() => {
    if (tab === "seins") {
      setMealType("tetee");
    } else if (tab === "biberons") {
      setMealType("biberon");
    }
  }, [tab]);

  // Ouvrir automatiquement le modal si le paramètre openModal est présent
  useEffect(() => {
    if (openModal === "true") {
      const timer = setTimeout(() => {
        openAddModal(tab as "seins" | "biberons" | undefined);
        router.replace("/(drawer)/baby/repas");
      }, 100);

      return () => clearTimeout(timer);
    }
  }, [openModal, tab]);

  // ============================================
  // EFFECTS - DATA LISTENERS
  // ============================================

  // Écoute en temps réel - Tétées ET Biberons
  useEffect(() => {
    if (!activeChild?.id) return;

    let teteesData: Meal[] = [];
    let biberonsData: Meal[] = [];

    const mergeAndSortMeals = () => {
      const merged = [...teteesData, ...biberonsData].sort(
        (a, b) => (b.date?.seconds || 0) - (a.date?.seconds || 0)
      );
      setMeals(merged);
    };

    const unsubscribeTetees = ecouterTetees(activeChild.id, (tetees) => {
      teteesData = tetees;
      mergeAndSortMeals();
    });

    const unsubscribeBiberons = ecouterBiberons(activeChild.id, (biberons) => {
      biberonsData = biberons;
      mergeAndSortMeals();
    });

    return () => {
      unsubscribeTetees();
      unsubscribeBiberons();
    };
  }, [activeChild]);

  // Regroupement par jour
  useEffect(() => {
    const grouped = groupMealsByDay(meals);
    setGroupedMeals(grouped);
  }, [meals]);

  // Nettoyage de l'intervalle lors du démontage
  useEffect(() => {
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, []);

  // ============================================
  // HELPERS - GROUPING
  // ============================================

  const groupMealsByDay = (meals: Meal[]): MealGroup[] => {
    const groups: { [key: string]: Meal[] } = {};

    meals.forEach((meal) => {
      const date = new Date(meal.date?.seconds * 1000);
      const dateKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;

      if (!groups[dateKey]) {
        groups[dateKey] = [];
      }
      groups[dateKey].push(meal);
    });

    return Object.entries(groups)
      .map(([dateKey, meals]) => {
        const date = new Date(dateKey);
        const totalQuantity = meals.reduce((sum, meal) => {
          const q = meal.quantite;
          return sum + (typeof q === "number" ? q : 0);
        }, 0);
        const lastMeal = meals.reduce((latest, current) =>
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
          meals: meals.sort(
            (a, b) => (b.date?.seconds || 0) - (a.date?.seconds || 0)
          ),
          totalQuantity,
          lastMeal,
        };
      })
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  };

  // ============================================
  // HELPERS - QUANTITY PICKER
  // ============================================

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
    if (intervalRef.current !== undefined) {
      clearInterval(intervalRef.current);
      intervalRef.current = undefined;
    }
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

  const getMealTypeLabel = (type?: MealType): string => {
    if (!type) return "Inconnu";
    return type === "tetee" ? "Sein" : "Biberon";
  };

  const getMealIcon = (type?: MealType): string => {
    if (type === "tetee") return "person-breastfeeding";
    if (type === "biberon") return "jar-wheat";
    return "utensils";
  };

  // ============================================
  // HANDLERS - MODAL
  // ============================================

  const openAddModal = (preferredType?: "seins" | "biberons") => {
    setDateHeure(new Date());
    setEditingMeal(null);
    setIsSubmitting(false);

    if (preferredType === "seins") {
      setMealType("tetee");
    } else if (preferredType === "biberons") {
      setMealType("biberon");
      setQuantite(100);
    } else {
      setMealType("tetee");
    }

    bottomSheetRef.current?.expand();
  };

  const openEditModal = (meal: Meal) => {
    setDateHeure(new Date(meal.date.seconds * 1000));
    setEditingMeal(meal);
    setIsSubmitting(false);

    // Déterminer le type (avec fallback pour anciennes données)
    const type = meal.type || "tetee";
    setMealType(type);

    // Quantité (avec fallback)
    const quantity = meal.quantite ?? 100;
    setQuantite(quantity);

    bottomSheetRef.current?.expand();
  };

  const closeModal = () => {
    bottomSheetRef.current?.close();
    setIsSubmitting(false);
    setEditingMeal(null);
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

      const isTetee = mealType === "tetee";
      const dataToSave = {
        type: mealType,
        quantite: isTetee ? null : quantite,
        date: dateHeure,
      };

      if (editingMeal) {
        // Modification
        if (isTetee) {
          await modifierTetee(activeChild.id, editingMeal.id, dataToSave);
        } else {
          await modifierBiberon(activeChild.id, editingMeal.id, dataToSave);
        }
      } else {
        // Ajout
        if (isTetee) {
          await ajouterTetee(activeChild.id, dataToSave);
        } else {
          await ajouterBiberon(activeChild.id, dataToSave);
        }
      }

      closeModal();
    } catch (error) {
      console.error("Erreur lors de la sauvegarde du repas:", error);
      Alert.alert(
        "Erreur",
        "Impossible de sauvegarder le repas. Veuillez réessayer."
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (isSubmitting || !editingMeal || !activeChild) return;

    Alert.alert(
      "Suppression",
      "Voulez-vous vraiment supprimer ce repas ?",
      [
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
              await supprimerTetee(activeChild.id, editingMeal.id);
              closeModal();
            } catch (error) {
              console.error("Erreur lors de la suppression:", error);
              Alert.alert(
                "Erreur",
                "Impossible de supprimer le repas. Veuillez réessayer."
              );
            } finally {
              setIsSubmitting(false);
            }
          },
        },
      ]
    );
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
  // RENDER - MEAL ITEM
  // ============================================

  const renderMealItem = (meal: Meal, isLast: boolean = false) => {
    const typeLabel = getMealTypeLabel(meal.type);
    const quantityDisplay =
      meal.quantite !== null && meal.quantite !== undefined
        ? `${meal.quantite} ml`
        : "N/A";

    return (
      <TouchableOpacity
        key={meal.id}
        style={[styles.mealItem, isLast && styles.lastMealItem]}
        onPress={() => openEditModal(meal)}
        activeOpacity={0.7}
      >
        <View style={styles.mealContent}>
          <View style={styles.mealInfo}>
            <View style={styles.infoRow}>
              <FontAwesome name="clock" size={16} color="#666" />
              <Text style={styles.timeText}>
                {new Date(meal.date?.seconds * 1000).toLocaleTimeString(
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
                name={getMealIcon(meal.type)}
                size={16}
                color="#666"
              />
              <Text style={styles.mealTypeText}>{typeLabel}</Text>
            </View>
          </View>
          <View style={styles.mealActions}>
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

  // ============================================
  // RENDER - DAY GROUP
  // ============================================

  const renderDayGroup = ({ item }: { item: MealGroup }) => {
    const isExpanded = expandedDays.has(item.date);
    const hasMultipleMeals = item.meals.length > 1;

    return (
      <View style={styles.dayCard}>
        <View style={styles.dayHeader}>
          <View style={styles.dayInfo}>
            <Text style={styles.dayDate}>{item.dateFormatted}</Text>
            <View style={styles.summaryInfo}>
              <Text style={styles.summaryText}>
                {item.meals.length} repas • {item.totalQuantity} ml total
              </Text>
            </View>
          </View>
          {hasMultipleMeals && (
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
        {renderMealItem(item.lastMeal, true)}
        {hasMultipleMeals && isExpanded && (
          <View style={styles.expandedContent}>
            <View style={styles.separator} />
            <Text style={styles.historyLabel}>Historique du jour</Text>
            {item.meals
              .filter((meal) => meal.id !== item.lastMeal.id)
              .map((meal) => renderMealItem(meal))}
          </View>
        )}
      </View>
    );
  };

  // ============================================
  // RENDER - MAIN
  // ============================================

  const isQuantityVisible = mealType === "biberon";

  return (
    <View style={styles.container}>
      {/* Header avec bouton d'ajout */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.addButton} onPress={() => openAddModal()}>
          <FontAwesome name="plus" size={16} color="white" />
          <Text style={styles.addButtonText}>Ajouter un repas</Text>
        </TouchableOpacity>
      </View>

      {/* Liste des repas groupés par jour */}
      <FlatList
        data={groupedMeals}
        keyExtractor={(item) => item.date}
        renderItem={renderDayGroup}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <FontAwesome name="baby" size={48} color="#ccc" />
            <Text style={styles.emptyText}>Aucun repas enregistré</Text>
            <Text style={styles.emptySubtext}>
              Ajoutez votre premier repas
            </Text>
          </View>
        }
      />

      {/* Bottom Sheet d'ajout/édition */}
      <FormBottomSheet
        ref={bottomSheetRef}
        title={editingMeal ? "Modifier le repas" : "Nouveau repas"}
        icon="baby"
        accentColor="#4A90E2"
        isEditing={!!editingMeal}
        isSubmitting={isSubmitting}
        onSubmit={handleSubmit}
        onDelete={editingMeal ? handleDelete : undefined}
        onCancel={cancelForm}
        onClose={() => {
          setIsSubmitting(false);
          setEditingMeal(null);
        }}
      >
        {/* Sélection du type de repas */}
            <Text style={styles.modalCategoryLabel}>Type de repas</Text>
            <View style={styles.typeRow}>
              <TouchableOpacity
                style={[
                  styles.typeButton,
                  mealType === "tetee" && styles.typeButtonActive,
                  isSubmitting && styles.typeButtonDisabled,
                ]}
                onPress={() => setMealType("tetee")}
                disabled={isSubmitting}
              >
                <FontAwesome
                  name="person-breastfeeding"
                  size={20}
                  color={mealType === "tetee" ? "white" : "#666"}
                />
                <Text
                  style={[
                    styles.typeText,
                    mealType === "tetee" && styles.typeTextActive,
                    isSubmitting && styles.typeTextDisabled,
                  ]}
                >
                  Seins
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.typeButton,
                  mealType === "biberon" && styles.typeButtonActive,
                  isSubmitting && styles.typeButtonDisabled,
                ]}
                onPress={() => {
                  setMealType("biberon");
                  setQuantite(100);
                }}
                disabled={isSubmitting}
              >
                <FontAwesome
                  name="jar-wheat"
                  size={20}
                  color={mealType === "biberon" ? "white" : "#666"}
                />
                <Text
                  style={[
                    styles.typeText,
                    mealType === "biberon" && styles.typeTextActive,
                    isSubmitting && styles.typeTextDisabled,
                  ]}
                >
                  Biberon
                </Text>
              </TouchableOpacity>
            </View>

            {/* Quantité (si biberon) */}
            {isQuantityVisible ? (
              <>
                <Text style={styles.modalCategoryLabel}>Quantité</Text>
                <View style={styles.quantityRow}>
                  <TouchableOpacity
                    style={[
                      styles.quantityButton,
                      isSubmitting && styles.quantityButtonDisabled,
                    ]}
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
                    onPressIn={() =>
                      handlePressIn(() => setQuantite((q) => q + 5))
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
            ) : (
              <View style={styles.quantityNA}>
                <Text style={styles.quantityNAText}>Quantité : N/A</Text>
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

            {/* Date/Time Pickers */}
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

// ============================================
// STYLES
// ============================================

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

  // Meal Item
  mealItem: {
    backgroundColor: "#f8f9fa",
    borderRadius: 8,
    padding: 12,
    marginBottom: 8,
  },
  lastMealItem: {
    backgroundColor: "#e8f4fd",
    borderLeftWidth: 4,
    borderLeftColor: "#4A90E2",
  },
  mealContent: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  mealInfo: {
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
  mealTypeText: {
    fontSize: 14,
    color: "#666",
  },
  mealActions: {
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

  // Expanded Content
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

  // Empty State
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

  // Modal Content
  modalCategoryLabel: {
    alignSelf: "center",
    fontSize: 16,
    fontWeight: "600",
    color: "#333",
    marginBottom: 10,
  },

  // Type Selection
  typeRow: {
    flexDirection: "row",
    justifyContent: "space-around",
    marginBottom: 16,
    gap: 12,
  },
  typeButton: {
    flex: 1,
    flexDirection: "column",
    alignItems: "center",
    gap: 8,
    padding: 16,
    backgroundColor: "#f0f0f0",
    borderRadius: 12,
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
    fontWeight: "500",
  },
  typeTextActive: {
    color: "white",
    fontWeight: "bold",
  },
  typeTextDisabled: {
    color: "#ccc",
  },

  // Quantity
  quantityNA: {
    alignItems: "center",
    marginBottom: 16,
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
    marginBottom: 16,
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

  // Date/Time
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
    marginTop: 4,
  },
  dateButtonTextDisabled: {
    color: "#ccc",
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
  },
  selectedTime: {
    fontSize: 20,
    color: "#004cdaff",
    fontWeight: "bold",
  },
});
