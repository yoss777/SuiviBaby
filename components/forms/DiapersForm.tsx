// components/forms/DiapersForm.tsx
import React, { useState, useCallback } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Platform,
} from "react-native";
import FontAwesome5 from "@expo/vector-icons/FontAwesome5";
import FontAwesome from "@expo/vector-icons/FontAwesome6";
import DateTimePicker from "@react-native-community/datetimepicker";
import { useBaby } from "@/contexts/BabyContext";
import { useModal } from "@/contexts/ModalContext";
import { useToast } from "@/contexts/ToastContext";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { Colors } from "@/constants/theme";
import { eventColors } from "@/constants/eventColors";
import {
  ajouterMiction,
  ajouterSelle,
  modifierMiction,
  modifierSelle,
  supprimerMiction,
  supprimerSelle,
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

export type DiapersType = "miction" | "selle";
export type MictionCouleur = "claire" | "jaune" | "foncee" | "autre";
export type SelleConsistance = "liquide" | "molle" | "normale" | "dure";
export type SelleQuantite = "peu" | "moyen" | "beaucoup";

export type DiapersEditData = {
  id: string;
  type: DiapersType;
  date: Date | { seconds: number } | { toDate: () => Date };
  // Miction attributes
  couleur?: MictionCouleur;
  // Selle attributes
  consistance?: SelleConsistance;
  quantite?: SelleQuantite;
};

export type DiapersFormProps = {
  initialType?: DiapersType;
  onSuccess?: () => void;
  onCancel?: () => void;
  isSubmitting: boolean;
  setIsSubmitting: (value: boolean) => void;
  onFormStepChange?: (inPicker: boolean) => void;
  editData?: DiapersEditData;
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

// ============================================
// COMPONENT
// ============================================

export const DiapersForm: React.FC<DiapersFormProps> = ({
  initialType = "miction",
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
  const colorScheme = useColorScheme() ?? "light";

  const isEditing = !!editData;

  // Form state
  const [includeMiction, setIncludeMiction] = useState<boolean>(
    editData ? editData.type === "miction" : initialType === "miction"
  );
  const [includeSelle, setIncludeSelle] = useState<boolean>(
    editData ? editData.type === "selle" : initialType === "selle"
  );
  const [dateHeure, setDateHeure] = useState<Date>(
    editData ? toDate(editData.date) : new Date()
  );
  const [showDate, setShowDate] = useState(false);
  const [showTime, setShowTime] = useState(false);

  // Miction attributes
  const [mictionCouleur, setMictionCouleur] = useState<MictionCouleur | null>(
    editData?.couleur ?? null
  );

  // Selle attributes
  const [selleConsistance, setSelleConsistance] = useState<SelleConsistance | null>(
    editData?.consistance ?? null
  );
  const [selleQuantite, setSelleQuantite] = useState<SelleQuantite | null>(
    editData?.quantite ?? null
  );

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

    // Verify at least one type is selected
    if (!includeMiction && !includeSelle) {
      showAlert(
        "Attention",
        "Veuillez sélectionner au moins un type (miction ou selle)"
      );
      return;
    }

    try {
      setIsSubmitting(true);

      if (editData) {
        // Edit mode: modify existing excretion
        const isMiction = editData.type === "miction";
        if (isMiction) {
          const mictionData = removeUndefined({
            date: dateHeure,
            couleur: mictionCouleur ?? undefined,
          });
          await modifierMiction(activeChild.id, editData.id, mictionData);
          showToast("Miction modifiée");
        } else {
          const selleData = removeUndefined({
            date: dateHeure,
            consistance: selleConsistance ?? undefined,
            quantite: selleQuantite ?? undefined,
          });
          await modifierSelle(activeChild.id, editData.id, selleData);
          showToast("Selle modifiée");
        }
      } else {
        // Add mode: add one or two excretions
        if (includeMiction) {
          const mictionData = removeUndefined({
            date: dateHeure,
            couleur: mictionCouleur ?? undefined,
          });
          await ajouterMiction(activeChild.id, mictionData);
        }
        if (includeSelle) {
          const selleData = removeUndefined({
            date: dateHeure,
            consistance: selleConsistance ?? undefined,
            quantite: selleQuantite ?? undefined,
          });
          await ajouterSelle(activeChild.id, selleData);
        }
        showToast(
          includeMiction && includeSelle
            ? "Miction et selle ajoutées"
            : includeMiction
              ? "Miction ajoutée"
              : "Selle ajoutée"
        );
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

    const typeLabel = editData.type === "miction" ? "cette miction" : "cette selle";
    showConfirm(
      "Supprimer",
      `Voulez-vous vraiment supprimer ${typeLabel} ?`,
      async () => {
        try {
          setIsSubmitting(true);
          if (editData.type === "miction") {
            await supprimerMiction(activeChild.id, editData.id);
            showToast("Miction supprimée");
          } else {
            await supprimerSelle(activeChild.id, editData.id);
            showToast("Selle supprimée");
          }
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
      {/* Type selection - only in add mode */}
      {!isEditing && (
        <>
          <Text style={styles.inputLabel}>Type d'excrétion</Text>
          <Text style={styles.toggleSubtitle}>
            Vous pouvez sélectionner les deux si nécessaire
          </Text>
          <View style={styles.typeRow}>
            <TouchableOpacity
              style={[
                styles.typeButton,
                includeMiction && styles.typeButtonActiveMiction,
                isSubmitting && styles.typeButtonDisabled,
              ]}
              onPress={() => setIncludeMiction((prev) => !prev)}
              disabled={isSubmitting}
              activeOpacity={0.7}
            >
              <FontAwesome5
                name="water"
                size={18}
                color={includeMiction ? "white" : eventColors.miction.dark}
              />
              <Text
                style={[
                  styles.typeText,
                  includeMiction && styles.typeTextActive,
                  isSubmitting && styles.typeTextDisabled,
                ]}
              >
                Miction
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.typeButton,
                includeSelle && styles.typeButtonActiveSelle,
                isSubmitting && styles.typeButtonDisabled,
              ]}
              onPress={() => setIncludeSelle((prev) => !prev)}
              disabled={isSubmitting}
              activeOpacity={0.7}
            >
              <FontAwesome5
                name="poop"
                size={18}
                color={includeSelle ? "white" : eventColors.selle.dark}
              />
              <Text
                style={[
                  styles.typeText,
                  includeSelle && styles.typeTextActive,
                  isSubmitting && styles.typeTextDisabled,
                ]}
              >
                Selle
              </Text>
            </TouchableOpacity>
          </View>
        </>
      )}

      {/* Miction options */}
      {includeMiction && (
        <>
          <Text style={styles.inputLabel}>Couleur de l'urine</Text>
          <Text style={styles.toggleSubtitle}>Optionnel</Text>
          <View style={styles.optionsRow}>
            {(
              [
                { value: "claire", label: "Claire", color: "#e8f4f8" },
                { value: "jaune", label: "Jaune", color: "#fff3cd" },
                { value: "foncee", label: "Foncée", color: "#f5c87b" },
                { value: "autre", label: "Autre", color: "#e0e0e0" },
              ] as const
            ).map((option) => (
              <TouchableOpacity
                key={option.value}
                style={[
                  styles.optionButton,
                  { backgroundColor: option.color },
                  mictionCouleur === option.value && styles.optionButtonSelected,
                  isSubmitting && styles.optionButtonDisabled,
                ]}
                onPress={() =>
                  setMictionCouleur((prev) =>
                    prev === option.value ? null : option.value
                  )
                }
                disabled={isSubmitting}
                activeOpacity={0.7}
              >
                <Text style={styles.optionText}>{option.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </>
      )}

      {/* Selle options */}
      {includeSelle && (
        <>
          <Text style={styles.inputLabel}>Consistance</Text>
          <Text style={styles.toggleSubtitle}>Optionnel</Text>
          <View style={styles.optionsRow}>
            {(
              [
                { value: "liquide", label: "Liquide", icon: "tint" },
                { value: "molle", label: "Molle", icon: "cloud" },
                { value: "normale", label: "Normale", icon: "check-circle" },
                { value: "dure", label: "Dure", icon: "circle" },
              ] as const
            ).map((option) => (
              <TouchableOpacity
                key={option.value}
                style={[
                  styles.optionButton,
                  styles.optionButtonSelle,
                  selleConsistance === option.value && styles.optionButtonSelectedSelle,
                  isSubmitting && styles.optionButtonDisabled,
                ]}
                onPress={() =>
                  setSelleConsistance((prev) =>
                    prev === option.value ? null : option.value
                  )
                }
                disabled={isSubmitting}
                activeOpacity={0.7}
              >
                <FontAwesome5
                  name={option.icon}
                  size={14}
                  color={selleConsistance === option.value ? "white" : "#dc3545"}
                  style={{ marginBottom: 4 }}
                />
                <Text
                  style={[
                    styles.optionText,
                    selleConsistance === option.value && styles.optionTextSelected,
                  ]}
                >
                  {option.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={styles.inputLabel}>Quantité</Text>
          <Text style={styles.toggleSubtitle}>Optionnel</Text>
          <View style={styles.optionsRow}>
            {(
              [
                { value: "peu", label: "Peu" },
                { value: "moyen", label: "Moyen" },
                { value: "beaucoup", label: "Beaucoup" },
              ] as const
            ).map((option) => (
              <TouchableOpacity
                key={option.value}
                style={[
                  styles.optionButton,
                  styles.optionButtonSelle,
                  selleQuantite === option.value && styles.optionButtonSelectedSelle,
                  isSubmitting && styles.optionButtonDisabled,
                ]}
                onPress={() =>
                  setSelleQuantite((prev) =>
                    prev === option.value ? null : option.value
                  )
                }
                disabled={isSubmitting}
                activeOpacity={0.7}
              >
                <Text
                  style={[
                    styles.optionText,
                    selleQuantite === option.value && styles.optionTextSelected,
                  ]}
                >
                  {option.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </>
      )}

      {/* Date & Time */}
      <Text style={styles.inputLabel}>Date & Heure</Text>
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
  inputLabel: {
    alignSelf: "center",
    fontSize: 16,
    fontWeight: "600",
    color: "#333",
    paddingTop: 8,
  },
  toggleSubtitle: {
    fontSize: 13,
    color: "#999",
    textAlign: "center",
    marginBottom: 8,
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
  typeButtonActiveMiction: {
    backgroundColor: eventColors.miction.dark,
  },
  typeButtonActiveSelle: {
    backgroundColor: eventColors.selle.dark,
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
  // Options Row
  optionsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    gap: 8,
    marginBottom: 16,
    paddingHorizontal: 8,
  },
  optionButton: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    borderWidth: 2,
    borderColor: "transparent",
    minWidth: 70,
    alignItems: "center",
  },
  optionButtonSelle: {
    backgroundColor: "#f8f9fa",
    borderColor: "#e0e0e0",
  },
  optionButtonSelected: {
    borderColor: eventColors.miction.dark,
    borderWidth: 2,
    shadowColor: eventColors.miction.dark,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 3,
    elevation: 3,
  },
  optionButtonSelectedSelle: {
    backgroundColor: eventColors.selle.dark,
    borderColor: eventColors.selle.dark,
  },
  optionButtonDisabled: {
    opacity: 0.5,
  },
  optionText: {
    fontSize: 14,
    fontWeight: "500",
    color: "#333",
  },
  optionTextSelected: {
    color: "white",
    fontWeight: "600",
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
