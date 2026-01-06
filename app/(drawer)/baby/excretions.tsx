import MictionsScreen from "@/app/suivibaby/mictions";
import SellesScreen from "@/app/suivibaby/selles";
import ModernActionButtons from "@/components/suivibaby/ModernActionsButton";
import { useBaby } from "@/contexts/BabyContext";
import {
  ajouterMiction,
  ecouterMictions,
  modifierMiction,
  supprimerMiction,
} from "@/services/mictionsService";
import {
  ajouterSelle,
  ecouterSelles,
  modifierSelle,
  supprimerSelle,
} from "@/services/sellesService";
import { Miction, Selle } from "@/types/interfaces";
import FontAwesome from "@expo/vector-icons/FontAwesome5";
import DateTimePicker from "@react-native-community/datetimepicker";
import { router, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import {
  Alert,
  Modal,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

export default function ExcretionsScreen() {
  const { activeChild } = useBaby();
  const [mictions, setMictions] = useState<Miction[]>([]);
  const [selles, setSelles] = useState<Selle[]>([]);
  const [selectedTab, setSelectedTab] = useState<"mictions" | "selles">(
    "mictions"
  );

  // États du modal unifié
  const [showModal, setShowModal] = useState<boolean>(false);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [includeMiction, setIncludeMiction] = useState<boolean>(true);
  const [includeSelle, setIncludeSelle] = useState<boolean>(false);
  const [dateHeure, setDateHeure] = useState<Date>(new Date());
  const [showDate, setShowDate] = useState(false);
  const [showTime, setShowTime] = useState(false);

  // États pour l'édition
  const [editingMiction, setEditingMiction] = useState<Miction | null>(null);
  const [editingSelle, setEditingSelle] = useState<Selle | null>(null);

  // Récupérer les paramètres de l'URL
  const { tab, openModal } = useLocalSearchParams();

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
        openModalHandler(tab as "mictions" | "selles" | undefined);
        router.replace("/(drawer)/baby/excretions");
      }, 100);

      return () => clearTimeout(timer);
    }
  }, [openModal, tab]);

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

  const openModalHandler = (preferredType?: "mictions" | "selles") => {
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
    setShowModal(true);
  };

  const openEditModalFromMiction = (miction: Miction) => {
    setDateHeure(new Date(miction.date.seconds * 1000));
    setEditingMiction(miction);
    setEditingSelle(null);
    setIncludeMiction(true);
    setIncludeSelle(false);
    setIsSubmitting(false);
    setShowModal(true);
  };

  const openEditModalFromSelle = (selle: Selle) => {
    setDateHeure(new Date(selle.date.seconds * 1000));
    setEditingSelle(selle);
    setEditingMiction(null);
    setIncludeMiction(false);
    setIncludeSelle(true);
    setIsSubmitting(false);
    setShowModal(true);
  };

  const closeModal = () => {
    setShowModal(false);
    setIsSubmitting(false);
    setEditingMiction(null);
    setEditingSelle(null);
  };

  const cancelForm = useCallback(() => {
    closeModal();
  }, []);

  const handleSubmit = async () => {
    if (isSubmitting) {
      return;
    }

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
    if (isSubmitting) {
      return;
    }

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

  const isEditMode = editingMiction !== null || editingSelle !== null;

  return (
    <View style={{ flex: 1 }}>
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

      {/* BOUTON D'AJOUT */}
      <View style={styles.header}>
        <TouchableOpacity
          style={[
            styles.addButton,
            selectedTab === "mictions"
              ? styles.tabButtonActiveMictions
              : styles.tabButtonActiveSelles,
          ]}
          onPress={() => openModalHandler(selectedTab)}
          activeOpacity={0.7}
        >
          <FontAwesome name="plus" size={18} color="white" />
          <Text style={styles.addButtonText}>Ajouter une excrétion</Text>
        </TouchableOpacity>
      </View>

      {/* SCROLLVIEW DES LISTES */}
      <View style={styles.container}>
        {selectedTab === "mictions" ? (
          <MictionsScreen
            mictions={mictions}
            onEditMiction={openEditModalFromMiction}
          />
        ) : (
          <SellesScreen selles={selles} onEditSelle={openEditModalFromSelle} />
        )}
      </View>

      {/* MODAL UNIFIÉ */}
      <Modal
        visible={showModal}
        transparent={true}
        animationType="fade"
        onRequestClose={closeModal}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            {/* Header */}
            <View style={styles.modalHeader}>
              <FontAwesome
                name={isEditMode ? "edit" : "plus-circle"}
                size={24}
                color="#4A90E2"
              />
              <Text style={styles.modalTitle}>
                {isEditMode ? "Modifier" : "Ajouter une excrétion"}
              </Text>
            </View>

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

            {/* Sélecteurs de date et heure */}
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

            {/* Date et heure sélectionnées */}
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

            {/* DateTimePickers */}
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

            {/* Boutons d'action */}
            <View style={styles.actionButtonsContainer}>
              <ModernActionButtons
                onCancel={cancelForm}
                onValidate={handleSubmit}
                onDelete={isEditMode ? handleDelete : undefined}
                cancelText="Annuler"
                validateText={isEditMode ? "Mettre à jour" : "Ajouter"}
                isLoading={isSubmitting}
                disabled={
                  isSubmitting ||
                  (!isEditMode && !includeMiction && !includeSelle)
                }
                loadingText={
                  isEditMode ? "Mise à jour..." : "Ajout en cours..."
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
    backgroundColor: "#f8f9fa",
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
  tabButtonActiveMictions: {
    backgroundColor: "#17a2b8",
  },
  tabButtonActiveSelles: {
    backgroundColor: "#dc3545",
  },
  tabText: {
    fontSize: 16,
    color: "#333",
    fontWeight: "bold",
  },
  tabTextActive: {
    color: "white",
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
  actionButtonsContainer: {
    paddingHorizontal: 20,
    paddingBottom: Platform.OS === "ios" ? 34 : 20,
  },
});
