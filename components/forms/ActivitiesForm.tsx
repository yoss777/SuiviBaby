// components/forms/ActivitiesForm.tsx
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
import { eventColors } from "@/constants/eventColors";
import {
  ajouterActivite,
  modifierActivite,
  supprimerActivite,
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

export type ActiviteType =
  | "tummyTime"
  | "jeux"
  | "lecture"
  | "promenade"
  | "massage"
  | "musique"
  | "eveil"
  | "sortie"
  | "autre";

export type ActivitiesEditData = {
  id: string;
  typeActivite: ActiviteType;
  duree?: number;
  description?: string;
  date: Date | { seconds: number } | { toDate: () => Date };
};

export type ActivitiesFormProps = {
  initialType?: ActiviteType;
  onSuccess?: () => void;
  onCancel?: () => void;
  isSubmitting: boolean;
  setIsSubmitting: (value: boolean) => void;
  onFormStepChange?: (inPicker: boolean) => void;
  editData?: ActivitiesEditData;
  onDelete?: () => void;
};

// ============================================
// CONFIG
// ============================================

const TYPE_CONFIG: Record<
  ActiviteType,
  { label: string; color: string; icon: string }
> = {
  tummyTime: {
    label: "Tummy Time",
    color: eventColors.activite.dark,
    icon: "baby",
  },
  jeux: {
    label: "Jeux",
    color: eventColors.activite.dark,
    icon: "puzzle-piece",
  },
  lecture: {
    label: "Lecture",
    color: eventColors.activite.dark,
    icon: "book",
  },
  promenade: {
    label: "Promenade",
    color: eventColors.activite.dark,
    icon: "person-walking",
  },
  massage: {
    label: "Massage",
    color: eventColors.activite.dark,
    icon: "hand",
  },
  musique: {
    label: "Musique",
    color: eventColors.activite.dark,
    icon: "music",
  },
  eveil: {
    label: "Éveil sensoriel",
    color: eventColors.activite.dark,
    icon: "lightbulb",
  },
  sortie: {
    label: "Sortie",
    color: eventColors.activite.dark,
    icon: "door-open",
  },
  autre: {
    label: "Autre",
    color: eventColors.activite.dark,
    icon: "ellipsis",
  },
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

// ============================================
// COMPONENT
// ============================================

export const ActivitiesForm: React.FC<ActivitiesFormProps> = ({
  initialType = "tummyTime",
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

  // Form state with undefined value handling
  const [typeActivite, setTypeActivite] = useState<ActiviteType>(
    editData?.typeActivite ?? initialType
  );
  const [duree, setDuree] = useState<number>(editData?.duree ?? 15);
  const [description, setDescription] = useState<string>(
    editData?.description ?? ""
  );
  const [dateHeure, setDateHeure] = useState<Date>(
    editData ? toDate(editData.date) : new Date()
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
    try {
      setIsSubmitting(true);
      const data = removeUndefined({
        date: dateHeure,
        typeActivite,
        duree: duree || undefined,
        description: description.trim() ? description.trim() : undefined,
        note: description.trim() ? description.trim() : undefined,
      });

      if (editData) {
        await modifierActivite(activeChild.id, editData.id, data);
        showToast("Activité modifiée");
        showSuccess("activity", "Activité modifiée");
      } else {
        await ajouterActivite(activeChild.id, data);
        showToast("Activité ajoutée");
        showSuccess("activity", "Activité ajoutée");
      }

      onSuccess?.();
    } catch (error) {
      console.error("Erreur lors de la sauvegarde:", error);
      showAlert("Erreur", "Impossible de sauvegarder.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = () => {
    if (!editData || !activeChild?.id || isSubmitting) return;

    showConfirm(
      "Supprimer",
      "Voulez-vous vraiment supprimer cette activité ?",
      async () => {
        try {
          setIsSubmitting(true);
        await supprimerActivite(activeChild.id, editData.id);
        showToast("Activité supprimée");
        showSuccess("activity", "Activité supprimée");
        onDelete?.();
        } catch (error) {
          console.error("Erreur suppression:", error);
          showAlert("Erreur", "Impossible de supprimer.");
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
      <View style={styles.inputGroup}>
        <Text style={styles.inputLabel}>Type d&apos;activité</Text>
        <View style={styles.typeRow}>
          {(Object.keys(TYPE_CONFIG) as ActiviteType[]).map((type) => {
            const config = TYPE_CONFIG[type];
            const active = typeActivite === type;
            return (
              <TouchableOpacity
                key={type}
                style={[styles.typeChip, active && styles.typeChipActive]}
                onPress={() => setTypeActivite(type)}
                disabled={isSubmitting}
              >
                <Text
                  style={[
                    styles.typeChipText,
                    active && styles.typeChipTextActive,
                  ]}
                >
                  {config.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      <View style={styles.inputGroup}>
        <Text style={styles.inputLabel}>Durée (minutes)</Text>
        <View style={styles.quantityPickerRow}>
          <TouchableOpacity
            style={[
              styles.quantityButton,
              isSubmitting && styles.quantityButtonDisabled,
            ]}
            onPress={() => setDuree((value) => Math.max(0, value - 5))}
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
          <Text style={styles.quantityPickerValue}>{duree} min</Text>
          <TouchableOpacity
            style={[
              styles.quantityButton,
              isSubmitting && styles.quantityButtonDisabled,
            ]}
            onPress={() => setDuree((value) => value + 5)}
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
      </View>

      <View style={styles.inputGroup}>
        <Text style={styles.inputLabel}>Description</Text>
        <TextInput
          value={description}
          onChangeText={setDescription}
          placeholder="Ajouter une description..."
          style={styles.input}
          multiline
          editable={!isSubmitting}
        />
      </View>

      <View style={styles.dateTimeContainerWithPadding}>
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
// STYLES - EXACTLY MATCHING activities.tsx
// ============================================

const styles = StyleSheet.create({
  sheetContent: {
    gap: 12,
  },
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
  },
  typeRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    paddingBottom: 8,
  },
  typeChip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: "#f9fafb",
  },
  typeChipActive: {
    backgroundColor: "#fff",
    borderColor: eventColors.activite.dark,
  },
  typeChipText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#6b7280",
  },
  typeChipTextActive: {
    color: eventColors.activite.dark,
    fontWeight: "700",
  },
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
  dateTimeContainerWithPadding: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 12,
    marginBottom: 10,
    paddingTop: 20,
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
