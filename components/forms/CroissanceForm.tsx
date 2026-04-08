// components/forms/CroissanceForm.tsx
import { DateTimeSectionRow } from "@/components/ui/DateTimeSectionRow";
import { getAccentColors } from "@/components/ui/accentColors";
import { getNeutralColors } from "@/constants/dashboardColors";
import { eventColors } from "@/constants/eventColors";
import { useBaby } from "@/contexts/BabyContext";
import { useModal } from "@/contexts/ModalContext";
import { useSuccessAnimation } from "@/contexts/SuccessAnimationContext";
import { useToast } from "@/contexts/ToastContext";
import { useColorScheme } from "@/hooks/use-color-scheme";
import {
  ajouterEvenementOptimistic,
  modifierEvenementOptimistic,
  supprimerEvenement,
} from "@/services/eventsService";
import FontAwesome from "@expo/vector-icons/FontAwesome6";
import React, { useCallback, useEffect, useState } from "react";
import {
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

// Helper to remove undefined values from objects (Firebase doesn't accept undefined)
function removeUndefined<T extends Record<string, unknown>>(obj: T): T {
  return Object.fromEntries(
    Object.entries(obj).filter(([, v]) => v !== undefined),
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
  const nc = getNeutralColors(colorScheme);
  const accentColors = getAccentColors(
    eventColors.croissance.dark,
    colorScheme,
  );

  const isEditing = !!editData;

  // Form state
  const [dateHeure, setDateHeure] = useState<Date>(
    editData ? toDate(editData.date) : new Date(),
  );
  const [dateHeureDirty, setDateHeureDirty] = useState(false);
  const [tailleCm, setTailleCm] = useState<string>(
    editData?.tailleCm?.toString() ?? "",
  );
  const [poidsKg, setPoidsKg] = useState<string>(
    editData?.poidsKg?.toString() ?? "",
  );
  const [teteCm, setTeteCm] = useState<string>(
    editData?.teteCm?.toString() ?? "",
  );
  // ============================================
  // HANDLERS
  // ============================================

  const handleDateHeureChange = useCallback((nextDate: Date) => {
    setDateHeure(nextDate);
    setDateHeureDirty(true);
  }, []);

  useEffect(() => {
    if (!editData?.id) return;
    setDateHeure(toDate(editData.date));
    setDateHeureDirty(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editData?.id]);

  const handleSubmit = () => {
    if (!activeChild?.id || isSubmitting) return;

    const tailleValue = parseNumber(tailleCm);
    const poidsValue = parseNumber(poidsKg);
    const teteValue = parseNumber(teteCm);

    if (!tailleValue && !poidsValue && !teteValue) {
      showAlert("Attention", "Entrez au moins une mesure.");
      return;
    }

    setIsSubmitting(true);

    const dateToSave = !isEditing || dateHeureDirty ? dateHeure : undefined;
    const data = removeUndefined({
      type: "croissance" as const,
      date: dateToSave,
      tailleCm: tailleValue,
      poidsKg: poidsValue,
      teteCm: teteValue,
    });

    if (editData) {
      modifierEvenementOptimistic(activeChild.id, editData.id, data, editData);
      showSuccess("growth", "Mesure modifiée");
    } else {
      ajouterEvenementOptimistic(activeChild.id, data);
      showSuccess("growth", "Mesure ajoutée");
    }

    setIsSubmitting(false);
    onSuccess?.();
  };

  const handleDelete = () => {
    if (!editData || !activeChild?.id || isSubmitting) return;

    showConfirm(
      "Supprimer",
      "Voulez-vous vraiment supprimer cette mesure ?",
      async () => {
        try {
          setIsSubmitting(true);
          await supprimerEvenement(activeChild.id, editData.id);
          showToast("Mesure supprimée");
          onDelete?.();
        } catch (error) {
          console.error("Erreur suppression:", error);
          showAlert("Erreur", "Impossible de supprimer la mesure.");
        } finally {
          setIsSubmitting(false);
        }
      },
    );
  };

  // ============================================
  // RENDER
  // ============================================

  return (
    <View style={styles.sheetContent}>
      {/* Taille */}
      <View style={styles.inputGroup}>
        <Text style={[styles.inputLabel, { color: nc.textLight }]}>
          Taille (cm)
        </Text>
        <TextInput
          value={tailleCm}
          onChangeText={setTailleCm}
          placeholder="ex: 62.5"
          placeholderTextColor={nc.textMuted}
          keyboardType="decimal-pad"
          style={[
            styles.input,
            { borderColor: nc.border, color: nc.textStrong },
          ]}
          editable={!isSubmitting}
        />
      </View>

      {/* Poids */}
      <View style={styles.inputGroup}>
        <Text style={[styles.inputLabel, { color: nc.textLight }]}>
          Poids (kg)
        </Text>
        <TextInput
          value={poidsKg}
          onChangeText={setPoidsKg}
          placeholder="ex: 5.8"
          placeholderTextColor={nc.textMuted}
          keyboardType="decimal-pad"
          style={[
            styles.input,
            { borderColor: nc.border, color: nc.textStrong },
          ]}
          editable={!isSubmitting}
        />
      </View>

      {/* Tour de tête */}
      <View style={styles.inputGroup}>
        <Text style={[styles.inputLabel, { color: nc.textLight }]}>
          Tour de tête (cm)
        </Text>
        <TextInput
          value={teteCm}
          onChangeText={setTeteCm}
          placeholder="ex: 41"
          placeholderTextColor={nc.textMuted}
          keyboardType="decimal-pad"
          style={[
            styles.input,
            { borderColor: nc.border, color: nc.textStrong },
          ]}
          editable={!isSubmitting}
        />
      </View>

      {/* Date & Time */}
      <DateTimeSectionRow
        value={dateHeure}
        onChange={handleDateHeureChange}
        colorScheme={colorScheme}
        disabled={isSubmitting}
        onPickerToggle={onFormStepChange}
      />

      {/* Action Buttons */}
      <View style={styles.buttonsContainer}>
        <View style={styles.primaryRow}>
          <TouchableOpacity
            style={[
              styles.cancelButton,
              { backgroundColor: nc.background, borderColor: nc.border },
              isSubmitting && styles.buttonDisabled,
            ]}
            onPress={onCancel}
            disabled={isSubmitting}
            accessibilityLabel="Annuler"
          >
            <Text style={[styles.cancelText, { color: nc.textNormal }]}>
              Annuler
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.validateButton,
              { backgroundColor: accentColors.filledBg },
              isSubmitting && styles.buttonDisabled,
            ]}
            onPress={handleSubmit}
            disabled={isSubmitting}
            accessibilityLabel={isEditing ? "Enregistrer" : "Ajouter"}
          >
            <Text
              style={[
                styles.validateText,
                {
                  color: nc.white,
                },
              ]}
            >
              {isEditing ? "Enregistrer" : "Ajouter"}
            </Text>
          </TouchableOpacity>
        </View>

        {isEditing && (
          <TouchableOpacity
            style={[
              styles.deleteButton,
              isSubmitting && styles.buttonDisabled,
            ]}
            onPress={handleDelete}
            disabled={isSubmitting}
            accessibilityLabel="Supprimer"
          >
            <FontAwesome name="trash" size={14} color={nc.error} />
            <Text style={[styles.deleteText, { color: nc.error }]}>Supprimer</Text>
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
    marginBottom: 8,
    marginTop: 16,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  input: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
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
    borderWidth: 1,
    paddingVertical: 16,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 52,
  },
  cancelText: {
    fontSize: 16,
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
    fontWeight: "700",
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  deleteButton: {
    alignSelf: "center",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 12,
    paddingHorizontal: 16,
    gap: 8,
  },
  deleteText: {
    fontSize: 14,
    fontWeight: "700",
    letterSpacing: 0.2,
  },
});
