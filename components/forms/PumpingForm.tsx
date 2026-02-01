import { Colors } from "@/constants/theme";
import { eventColors } from "@/constants/eventColors";
import { useBaby } from "@/contexts/BabyContext";
import { useModal } from "@/contexts/ModalContext";
import { useToast } from "@/contexts/ToastContext";
import { useColorScheme } from "@/hooks/use-color-scheme";
import {
  ajouterPompage,
  modifierPompage,
  supprimerPompage,
} from "@/migration/eventsDoubleWriteService";

import FontAwesome5 from "@expo/vector-icons/FontAwesome5";
import DateTimePicker from "@react-native-community/datetimepicker";
import { useCallback, useRef, useState } from "react";
import {
  ActivityIndicator,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

// ============================================
// TYPES
// ============================================

export interface PumpingEditData {
  id: string;
  date: Date;
  quantiteGauche?: number;
  quantiteDroite?: number;
  duree?: number;
  note?: string;
}

export interface PumpingFormProps {
  onSuccess: () => void;
  onCancel: () => void;
  isSubmitting: boolean;
  setIsSubmitting: (value: boolean) => void;
  onFormStepChange?: (isInPicker: boolean) => void;
  editData?: PumpingEditData;
  onDelete?: () => void;
}

// ============================================
// COMPONENT
// ============================================

export function PumpingForm({
  onSuccess,
  onCancel,
  isSubmitting,
  setIsSubmitting,
  onFormStepChange,
  editData,
  onDelete,
}: PumpingFormProps) {
  const { activeChild } = useBaby();
  const { showAlert, showConfirm } = useModal();
  const { showToast } = useToast();
  const colorScheme = useColorScheme() ?? "light";

  const isEditing = !!editData;

  // Form state
  const [useLeftBreast, setUseLeftBreast] = useState(
    editData ? (editData.quantiteGauche ?? 0) > 0 : true
  );
  const [useRightBreast, setUseRightBreast] = useState(
    editData ? (editData.quantiteDroite ?? 0) > 0 : true
  );
  const [quantiteGauche, setQuantiteGauche] = useState(
    editData?.quantiteGauche ?? 100
  );
  const [quantiteDroite, setQuantiteDroite] = useState(
    editData?.quantiteDroite ?? 100
  );
  const [dateHeure, setDateHeure] = useState(editData?.date ?? new Date());

  // Date/Time picker state
  const [showDate, setShowDate] = useState(false);
  const [showTime, setShowTime] = useState(false);

  // Refs for quantity memory
  const lastLeftQuantityRef = useRef(quantiteGauche);
  const lastRightQuantityRef = useRef(quantiteDroite);

  // Long press acceleration
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handlePressIn = useCallback((action: () => void) => {
    action();
    timeoutRef.current = setTimeout(() => {
      intervalRef.current = setInterval(action, 100);
    }, 400);
  }, []);

  const handlePressOut = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  // Toggle functions
  const toggleLeftBreast = () => {
    if (isSubmitting) return;
    setUseLeftBreast((prev) => {
      if (prev && !useRightBreast) return prev;
      const next = !prev;
      setQuantiteGauche((q) => {
        if (next) {
          return lastLeftQuantityRef.current > 0
            ? lastLeftQuantityRef.current
            : 100;
        }
        lastLeftQuantityRef.current = q;
        return 0;
      });
      return next;
    });
  };

  const toggleRightBreast = () => {
    if (isSubmitting) return;
    setUseRightBreast((prev) => {
      if (prev && !useLeftBreast) return prev;
      const next = !prev;
      setQuantiteDroite((q) => {
        if (next) {
          return lastRightQuantityRef.current > 0
            ? lastRightQuantityRef.current
            : 100;
        }
        lastRightQuantityRef.current = q;
        return 0;
      });
      return next;
    });
  };

  // Date/Time handlers
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

  // Submit handler
  const handleSubmit = async () => {
    if (!activeChild?.id || isSubmitting) return;
    if (!useLeftBreast && !useRightBreast) {
      showAlert("Erreur", "Sélectionnez au moins un sein.");
      return;
    }

    try {
      setIsSubmitting(true);
      const data = {
        quantiteGauche: useLeftBreast ? quantiteGauche : 0,
        quantiteDroite: useRightBreast ? quantiteDroite : 0,
        date: dateHeure,
      };

      if (isEditing && editData) {
        await modifierPompage(activeChild.id, editData.id, data);
        showToast("Session modifiée");
      } else {
        await ajouterPompage(activeChild.id, data);
        showToast("Session enregistrée");
      }

      onSuccess();
    } catch (error) {
      console.error("Erreur lors de la sauvegarde:", error);
      showAlert("Erreur", "Impossible de sauvegarder.");
    } finally {
      setIsSubmitting(false);
    }
  };

  // Delete handler
  const handleDelete = () => {
    if (!activeChild?.id || !editData?.id || isSubmitting) return;

    showConfirm(
      "Supprimer",
      "Voulez-vous vraiment supprimer cette session ?",
      async () => {
        try {
          setIsSubmitting(true);
          await supprimerPompage(activeChild.id, editData.id);
          showToast("Session supprimée");
          onDelete?.();
        } catch (error) {
          console.error("Erreur lors de la suppression:", error);
          showAlert("Erreur", "Impossible de supprimer.");
        } finally {
          setIsSubmitting(false);
        }
      }
    );
  };

  return (
    <View style={styles.container}>
      {/* Breast selection */}
      <Text style={styles.categoryLabel}>Seins</Text>
      <View style={styles.breastToggleRow}>
        <TouchableOpacity
          style={[
            styles.breastToggleButton,
            useLeftBreast && {
              backgroundColor: Colors[colorScheme].tint,
              borderColor: Colors[colorScheme].tint,
            },
          ]}
          onPress={toggleLeftBreast}
          disabled={isSubmitting}
        >
          <Text
            style={[
              styles.breastToggleText,
              useLeftBreast && styles.breastToggleTextActive,
            ]}
          >
            Gauche
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[
            styles.breastToggleButton,
            useRightBreast && {
              backgroundColor: Colors[colorScheme].tint,
              borderColor: Colors[colorScheme].tint,
            },
          ]}
          onPress={toggleRightBreast}
          disabled={isSubmitting}
        >
          <Text
            style={[
              styles.breastToggleText,
              useRightBreast && styles.breastToggleTextActive,
            ]}
          >
            Droit
          </Text>
        </TouchableOpacity>
      </View>

      {/* Left breast quantity */}
      {useLeftBreast && (
        <>
          <Text style={styles.categoryLabel}>Quantité Sein Gauche</Text>
          <View style={styles.quantityPickerRow}>
            <TouchableOpacity
              style={[
                styles.quantityButton,
                isSubmitting && styles.quantityButtonDisabled,
              ]}
              onPressIn={() =>
                handlePressIn(() =>
                  setQuantiteGauche((q) => Math.max(0, q - 5))
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
            <Text style={styles.quantityPickerValue}>{quantiteGauche} ml</Text>
            <TouchableOpacity
              style={[
                styles.quantityButton,
                isSubmitting && styles.quantityButtonDisabled,
              ]}
              onPressIn={() =>
                handlePressIn(() => setQuantiteGauche((q) => q + 5))
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

      {/* Right breast quantity */}
      {useRightBreast && (
        <>
          <Text style={styles.categoryLabel}>Quantité Sein Droit</Text>
          <View style={styles.quantityPickerRow}>
            <TouchableOpacity
              style={[
                styles.quantityButton,
                isSubmitting && styles.quantityButtonDisabled,
              ]}
              onPressIn={() =>
                handlePressIn(() =>
                  setQuantiteDroite((q) => Math.max(0, q - 5))
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
            <Text style={styles.quantityPickerValue}>{quantiteDroite} ml</Text>
            <TouchableOpacity
              style={[
                styles.quantityButton,
                isSubmitting && styles.quantityButtonDisabled,
              ]}
              onPressIn={() =>
                handlePressIn(() => setQuantiteDroite((q) => q + 5))
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

      {/* Date/Time */}
      <Text style={styles.categoryLabel}>Date & Heure</Text>
      <View style={styles.dateTimeContainer}>
        <TouchableOpacity
          style={[
            styles.dateButton,
            isSubmitting && styles.dateButtonDisabled,
          ]}
          onPress={() => setShowDate(true)}
          disabled={isSubmitting}
        >
          <FontAwesome5
            name="calendar-alt"
            size={16}
            color={isSubmitting ? "#ccc" : Colors[colorScheme].tint}
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
          <FontAwesome5
            name="clock"
            size={16}
            color={isSubmitting ? "#ccc" : Colors[colorScheme].tint}
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

      {/* Action buttons */}
      <View style={styles.buttonsContainer}>
        <View style={styles.primaryRow}>
          <TouchableOpacity
            style={[styles.cancelButton, isSubmitting && styles.buttonDisabled]}
            onPress={onCancel}
            disabled={isSubmitting}
          >
            <Text style={styles.cancelText}>Annuler</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[
              styles.validateButton,
              { backgroundColor: Colors[colorScheme].tint },
              isSubmitting && styles.buttonDisabled,
            ]}
            onPress={handleSubmit}
            disabled={isSubmitting}
          >
            {isSubmitting ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <Text style={styles.validateText}>
                {isEditing ? "Enregistrer" : "Ajouter"}
              </Text>
            )}
          </TouchableOpacity>
        </View>

        {isEditing && onDelete && (
          <TouchableOpacity
            style={[styles.deleteButton, isSubmitting && styles.buttonDisabled]}
            onPress={handleDelete}
            disabled={isSubmitting}
          >
            <FontAwesome5 name="trash" size={14} color="#dc3545" />
            <Text style={styles.deleteText}>Supprimer</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

// ============================================
// STYLES
// ============================================

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  // Category label
  categoryLabel: {
    alignSelf: "center",
    fontSize: 16,
    fontWeight: "600",
    color: "#333",
    paddingTop: 20,
    marginBottom: 10,
  },
  // Breast toggle
  breastToggleRow: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 12,
    marginBottom: 12,
  },
  breastToggleButton: {
    paddingVertical: 8,
    paddingHorizontal: 18,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#d7dbe0",
    backgroundColor: "#f5f6f8",
  },
  breastToggleText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#666",
  },
  breastToggleTextActive: {
    color: "#fff",
  },
  // Quantity picker
  quantityPickerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 16,
    marginBottom: 8,
  },
  quantityButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#f0f0f0",
    alignItems: "center",
    justifyContent: "center",
  },
  quantityButtonDisabled: {
    opacity: 0.6,
  },
  quantityButtonText: {
    fontSize: 18,
    fontWeight: "700",
    color: "#333",
  },
  quantityButtonTextDisabled: {
    color: "#999",
  },
  quantityPickerValue: {
    fontSize: 16,
    fontWeight: "600",
    color: "#333",
  },
  // Date/Time
  dateTimeContainer: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 12,
    marginBottom: 10,
  },
  dateButton: {
    flex: 1,
    flexDirection: "row",
    gap: 8,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#d7dbe0",
    backgroundColor: "#f5f6f8",
  },
  dateButtonDisabled: {
    backgroundColor: "#f5f5f5",
    opacity: 0.5,
  },
  dateButtonText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#4a4f55",
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
    color: "#374151",
    fontWeight: "600",
  },
  // Action buttons
  buttonsContainer: {
    gap: 12,
    marginTop: 16,
  },
  primaryRow: {
    flexDirection: "row",
    gap: 12,
  },
  cancelButton: {
    flex: 1,
    backgroundColor: "#f5f6f8",
    borderWidth: 1,
    borderColor: "#d7dbe0",
    paddingVertical: 16,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 52,
  },
  cancelText: {
    fontSize: 16,
    color: "#4a4f55",
    fontWeight: "600",
  },
  validateButton: {
    flex: 1,
    paddingVertical: 16,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 52,
  },
  validateText: {
    fontSize: 16,
    color: "#fff",
    fontWeight: "700",
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  deleteButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#f1b1b1",
    backgroundColor: "#fff5f5",
    gap: 8,
  },
  deleteText: {
    fontSize: 14,
    color: "#dc3545",
    fontWeight: "700",
    letterSpacing: 0.2,
  },
});
