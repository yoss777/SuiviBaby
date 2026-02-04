// components/forms/CroissanceForm.tsx
import React, { useState, useCallback } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Platform,
} from "react-native";
import FontAwesome5 from "@expo/vector-icons/FontAwesome5";
import FontAwesome from "@expo/vector-icons/FontAwesome6";
import DateTimePicker from "@react-native-community/datetimepicker";
import { useBaby } from "@/contexts/BabyContext";
import { useModal } from "@/contexts/ModalContext";
import { useSuccessAnimation } from "@/contexts/SuccessAnimationContext";
import { useToast } from "@/contexts/ToastContext";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { Colors } from "@/constants/theme";
import {
  ajouterCroissance,
  modifierCroissance,
  supprimerCroissance,
} from "@/migration/eventsDoubleWriteService";

// Helper to remove undefined values from objects (Firebase doesn't accept undefined)
function removeUndefined<T extends Record<string, unknown>>(obj: T): T {
  return Object.fromEntries(
    Object.entries(obj).filter(([, v]) => v !== undefined)
  ) as T;
}

// ============================================
// TYPES
// ============================================

export type CroissanceEditData = {
  id: string;
  date: Date | { seconds: number } | { toDate: () => Date };
  tailleCm?: number;
  poidsKg?: number;
  teteCm?: number;
};

export type CroissanceFormProps = {
  onSuccess?: () => void;
  onCancel?: () => void;
  isSubmitting: boolean;
  setIsSubmitting: (value: boolean) => void;
  onFormStepChange?: (inPicker: boolean) => void;
  editData?: CroissanceEditData;
  onDelete?: () => void;
};

// ============================================
// HELPERS
// ============================================

const toDate = (value: any): Date => {
  if (value?.seconds) return new Date(value.seconds * 1000);
  if (value?.toDate) return value.toDate();
  if (value instanceof Date) return value;
  return new Date(value);
};

const parseNumber = (value: string): number | undefined => {
  const trimmed = value.trim().replace(",", ".");
  if (!trimmed) return undefined;
  const parsed = parseFloat(trimmed);
  return Number.isNaN(parsed) ? undefined : parsed;
};

// ============================================
// COMPONENT
// ============================================

export const CroissanceForm: React.FC<CroissanceFormProps> = ({
  onSuccess,
  onCancel,
  isSubmitting,
  setIsSubmitting,
  onFormStepChange,
  editData,
  onDelete,
}) => {
  const { activeChild } = useBaby();
  const { showAlert, showConfirm } = useModal();
  const { showToast } = useToast();
  const { showSuccess } = useSuccessAnimation();
  const colorScheme = useColorScheme() ?? "light";

  const isEditing = !!editData;

  // Form state
  const [dateHeure, setDateHeure] = useState<Date>(
    editData ? toDate(editData.date) : new Date()
  );
  const [tailleCm, setTailleCm] = useState<string>(
    editData?.tailleCm?.toString() ?? ""
  );
  const [poidsKg, setPoidsKg] = useState<string>(
    editData?.poidsKg?.toString() ?? ""
  );
  const [teteCm, setTeteCm] = useState<string>(
    editData?.teteCm?.toString() ?? ""
  );
  const [showDate, setShowDate] = useState(false);
  const [showTime, setShowTime] = useState(false);

  // Notify parent when picker visibility changes
  const handleShowDate = useCallback(
    (show: boolean) => {
      setShowDate(show);
      onFormStepChange?.(show || showTime);
    },
    [showTime, onFormStepChange]
  );

  const handleShowTime = useCallback(
    (show: boolean) => {
      setShowTime(show);
      onFormStepChange?.(show || showDate);
    },
    [showDate, onFormStepChange]
  );

  // ============================================
  // HANDLERS
  // ============================================

  const handleSubmit = async () => {
    if (!activeChild?.id || isSubmitting) return;

    const tailleValue = parseNumber(tailleCm);
    const poidsValue = parseNumber(poidsKg);
    const teteValue = parseNumber(teteCm);

    if (!tailleValue && !poidsValue && !teteValue) {
      showAlert("Attention", "Entrez au moins une mesure.");
      return;
    }

    try {
      setIsSubmitting(true);

      const data = removeUndefined({
        date: dateHeure,
        tailleCm: tailleValue,
        poidsKg: poidsValue,
        teteCm: teteValue,
      });

      if (editData) {
        await modifierCroissance(activeChild.id, editData.id, data);
        showToast("Mesure modifiée");
        showSuccess("growth", "Mesure modifiée");
      } else {
        await ajouterCroissance(activeChild.id, data);
        showToast("Mesure ajoutée");
        showSuccess("growth", "Mesure ajoutée");
      }

      onSuccess?.();
    } catch (error) {
      console.error("Erreur lors de la sauvegarde:", error);
      showAlert("Erreur", "Impossible de sauvegarder la mesure.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = () => {
    if (!editData || !activeChild?.id || isSubmitting) return;

    showConfirm(
      "Supprimer",
      "Voulez-vous vraiment supprimer cette mesure ?",
      async () => {
        try {
          setIsSubmitting(true);
          await supprimerCroissance(activeChild.id, editData.id);
          showToast("Mesure supprimée");
          showSuccess("growth", "Mesure supprimée");
          onDelete?.();
        } catch (error) {
          console.error("Erreur suppression:", error);
          showAlert("Erreur", "Impossible de supprimer la mesure.");
        } finally {
          setIsSubmitting(false);
        }
      }
    );
  };

  // ============================================
  // RENDER
  // ============================================

  return (
    <View style={styles.sheetContent}>
      {/* Taille */}
      <View style={styles.inputGroup}>
        <Text style={styles.inputLabel}>Taille (cm)</Text>
        <TextInput
          value={tailleCm}
          onChangeText={setTailleCm}
          placeholder="ex: 62.5"
          keyboardType="decimal-pad"
          style={styles.input}
          editable={!isSubmitting}
        />
      </View>

      {/* Poids */}
      <View style={styles.inputGroup}>
        <Text style={styles.inputLabel}>Poids (kg)</Text>
        <TextInput
          value={poidsKg}
          onChangeText={setPoidsKg}
          placeholder="ex: 5.8"
          keyboardType="decimal-pad"
          style={styles.input}
          editable={!isSubmitting}
        />
      </View>

      {/* Tour de tête */}
      <View style={styles.inputGroup}>
        <Text style={styles.inputLabel}>Tour de tête (cm)</Text>
        <TextInput
          value={teteCm}
          onChangeText={setTeteCm}
          placeholder="ex: 41"
          keyboardType="decimal-pad"
          style={styles.input}
          editable={!isSubmitting}
        />
      </View>

      {/* Date & Time */}
      <View style={styles.dateTimeContainer}>
        <TouchableOpacity
          style={styles.dateButton}
          onPress={() => handleShowDate(true)}
          disabled={isSubmitting}
        >
          <FontAwesome5
            name="calendar-alt"
            size={16}
            color={Colors[colorScheme].tint}
          />
          <Text style={styles.dateButtonText}>Date</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.dateButton}
          onPress={() => handleShowTime(true)}
          disabled={isSubmitting}
        >
          <FontAwesome5
            name="clock"
            size={16}
            color={Colors[colorScheme].tint}
          />
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
          onChange={(_, date) => {
            handleShowDate(false);
            if (date) {
              setDateHeure((prev) => {
                const next = new Date(prev);
                next.setFullYear(
                  date.getFullYear(),
                  date.getMonth(),
                  date.getDate()
                );
                return next;
              });
            }
          }}
        />
      )}
      {showTime && (
        <DateTimePicker
          value={dateHeure}
          mode="time"
          is24Hour
          display={Platform.OS === "ios" ? "spinner" : "default"}
          onChange={(_, date) => {
            handleShowTime(false);
            if (date) {
              setDateHeure((prev) => {
                const next = new Date(prev);
                next.setHours(date.getHours(), date.getMinutes(), 0, 0);
                return next;
              });
            }
          }}
        />
      )}

      {/* Action Buttons */}
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
            <Text style={styles.validateText}>
              {isEditing ? "Enregistrer" : "Ajouter"}
            </Text>
          </TouchableOpacity>
        </View>

        {isEditing && (
          <TouchableOpacity
            style={[styles.deleteButton, isSubmitting && styles.buttonDisabled]}
            onPress={handleDelete}
            disabled={isSubmitting}
          >
            <FontAwesome name="trash" size={14} color="#dc3545" />
            <Text style={styles.deleteText}>Supprimer</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
};

// ============================================
// STYLES - MATCHING OTHER FORMS
// ============================================

const styles = StyleSheet.create({
  sheetContent: {
    gap: 12,
  },
  // Input group
  inputGroup: {
    gap: 6,
  },
  inputLabel: {
    fontSize: 12,
    fontWeight: "700",
    color: "#6b7280",
  },
  input: {
    borderWidth: 1,
    borderColor: "#e5e7eb",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
  },
  // Date/Time
  dateTimeContainer: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 12,
    marginBottom: 10,
    paddingTop: 12,
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
  dateButtonText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#4a4f55",
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
