// components/forms/DiapersForm.tsx
import { DateTimeSectionRow } from "@/components/ui/DateTimeSectionRow";
import { SheetFooter } from "@/components/forms/SheetFooter";
import { useFormDirtyGuard } from "@/components/forms/formGuard";
import { getAccentColors } from "@/components/ui/accentColors";
import { getNeutralColors } from "@/constants/dashboardColors";
import { eventColors } from "@/constants/eventColors";
import { useBaby } from "@/contexts/BabyContext";
import { useSheetDeleteWithUndo } from "@/hooks/useSheetDeleteWithUndo";
import { useModal } from "@/contexts/ModalContext";
import { useSuccessAnimation } from "@/contexts/SuccessAnimationContext";
import { useColorScheme } from "@/hooks/use-color-scheme";
import {
  ajouterEvenementOptimistic,
  modifierEvenementOptimistic,
  supprimerEvenement,
} from "@/services/eventsService";
import FontAwesome from "@expo/vector-icons/FontAwesome6";
import React, { useCallback, useState } from "react";
import { StyleSheet, Text, Pressable, View } from "react-native";
import { toDateOr } from "@/utils/date";
import { pressedOpacity, RIPPLE_CLIP, usePressRipple } from "@/components/ui/pressFeedback";

// Helper to remove undefined values from objects (Firebase doesn't accept undefined)
function removeUndefined<T extends Record<string, unknown>>(obj: T): T {
  return Object.fromEntries(
    Object.entries(obj).filter(([, v]) => v !== undefined),
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
  const ripple = usePressRipple();
  const { activeChild } = useBaby();
  const { showAlert } = useModal();
  const deleteFromSheet = useSheetDeleteWithUndo();
  const { showSuccess } = useSuccessAnimation();
  const colorScheme = useColorScheme() ?? "light";
  const nc = getNeutralColors(colorScheme);

  const isEditing = !!editData;

  // Form state
  const [includeMiction, setIncludeMiction] = useState<boolean>(
    editData ? editData.type === "miction" : initialType === "miction",
  );
  const [includeSelle, setIncludeSelle] = useState<boolean>(
    editData ? editData.type === "selle" : initialType === "selle",
  );
  const mictionAccentColors = getAccentColors(
    eventColors.miction.dark,
    colorScheme,
  );
  const selleAccentColors = getAccentColors(
    eventColors.selle.dark,
    colorScheme,
  );
  const accentColors = getAccentColors(
    includeSelle && !includeMiction
      ? eventColors.selle.dark
      : eventColors.miction.dark,
    colorScheme,
  );
  const [dateHeure, setDateHeure] = useState<Date>(
    editData ? toDateOr(editData.date, new Date()) : new Date(),
  );
  const [dateHeureDirty, setDateHeureDirty] = useState(false);

  // Miction attributes
  const [mictionCouleur, setMictionCouleur] = useState<MictionCouleur | null>(
    editData?.couleur ?? null,
  );

  // Selle attributes
  const [selleConsistance, setSelleConsistance] =
    useState<SelleConsistance | null>(editData?.consistance ?? null);
  const [selleQuantite, setSelleQuantite] = useState<SelleQuantite | null>(
    editData?.quantite ?? null,
  );

  // ============================================
  // HANDLERS
  // ============================================

  const handleDateHeureChange = useCallback((nextDate: Date) => {
    setDateHeure(nextDate);
    setDateHeureDirty(true);
  }, []);

  // Garde-fou : la feuille demande confirmation avant de fermer une saisie modifiée.
  useFormDirtyGuard({ includeMiction, includeSelle, dateHeure, mictionCouleur, selleConsistance, selleQuantite });

  const handleSubmit = () => {
    if (!activeChild?.id || isSubmitting) return;

    // Verify at least one type is selected
    if (!includeMiction && !includeSelle) {
      showAlert(
        "Attention",
        "Sélectionnez au moins un type : pipi ou selle.",
      );
      return;
    }

    setIsSubmitting(true);

    const dateToSave = !isEditing || dateHeureDirty ? dateHeure : undefined;
    let successMessage = "";
    if (editData) {
      // Edit mode: modify existing excretion
      const isMiction = editData.type === "miction";
      if (isMiction) {
        const mictionData = removeUndefined({
          type: "miction" as const,
          date: dateToSave,
          couleur: mictionCouleur ?? undefined,
        });
        modifierEvenementOptimistic(
          activeChild.id,
          editData.id,
          mictionData,
          editData,
        );
        successMessage = "Pipi modifié";
      } else {
        const selleData = removeUndefined({
          type: "selle" as const,
          date: dateToSave,
          consistance: selleConsistance ?? undefined,
          quantite: selleQuantite ?? undefined,
        });
        modifierEvenementOptimistic(
          activeChild.id,
          editData.id,
          selleData,
          editData,
        );
        successMessage = "Selle modifiée";
      }
    } else {
      // Add mode: add one or two excretions
      if (includeMiction) {
        const mictionData = removeUndefined({
          type: "miction" as const,
          date: dateToSave,
          couleur: mictionCouleur ?? undefined,
        });
        ajouterEvenementOptimistic(activeChild.id, mictionData);
      }
      if (includeSelle) {
        const selleData = removeUndefined({
          type: "selle" as const,
          date: dateToSave,
          consistance: selleConsistance ?? undefined,
          quantite: selleQuantite ?? undefined,
        });
        ajouterEvenementOptimistic(activeChild.id, selleData);
      }
      successMessage =
        includeMiction && includeSelle
          ? "Pipi et selle ajoutés"
          : includeMiction
            ? "Pipi ajouté"
            : "Selle ajoutée";
    }

    // Afficher l'animation de succès avant de fermer le formulaire
    showSuccess("diaper", successMessage);

    setIsSubmitting(false);
    onSuccess?.();
  };

  // Suppression immédiate + toast « Annuler » (8 s), comme dans les listes :
  // pas de modale « irréversible » (audit UI/UX V3, R-P1-12).
  const handleDelete = () => {
    if (!editData || !activeChild?.id || isSubmitting) return;
    const childId = activeChild.id;
    const id = editData.id;
    deleteFromSheet({
      id,
      message:
        editData.type === "miction" ? "Pipi supprimé" : "Selle supprimée",
      run: () => supprimerEvenement(childId, id),
      close: onDelete,
    });
  };

  // ============================================
  // RENDER
  // ============================================

  return (
    <View style={styles.sheetContent}>
      {/* Type selection - only in add mode */}
      {!isEditing && (
        <>
          <Text style={[styles.inputLabel, { color: nc.textLight }]}>
            Type d&apos;excrétion
          </Text>
          <Text style={[styles.toggleSubtitle, { color: nc.textLight }]}>
            Vous pouvez sélectionner les deux si nécessaire
          </Text>
          <View style={styles.typeRow}>
            <Pressable
              android_ripple={ripple}
              style={({ pressed }) => [
                styles.typeButton,
                { backgroundColor: nc.background, borderColor: nc.border },
                includeMiction && {
                  backgroundColor: mictionAccentColors.softBg,
                  borderColor: mictionAccentColors.softBorder,
                },
                isSubmitting && styles.typeButtonDisabled,
                pressedOpacity(pressed),
              ]}
              onPress={() => setIncludeMiction((prev) => !prev)}
              disabled={isSubmitting}
              accessibilityLabel="Pipi"
              accessibilityRole="button"
              accessibilityState={{
                selected: includeMiction,
                disabled: isSubmitting,
              }}
              hitSlop={8}
            >
              <FontAwesome
                name="water"
                size={18}
                color={
                  includeMiction
                    ? mictionAccentColors.softText
                    : eventColors.miction.dark
                }
              />
              <Text
                style={[
                  styles.typeText,
                  { color: nc.textLight },
                  includeMiction && styles.typeTextActive,
                  includeMiction && { color: mictionAccentColors.softText },
                  isSubmitting && { color: nc.textLight },
                ]}
              >
                Pipi
              </Text>
            </Pressable>

            <Pressable
              android_ripple={ripple}
              style={({ pressed }) => [
                styles.typeButton,
                { backgroundColor: nc.background, borderColor: nc.border },
                includeSelle && {
                  backgroundColor: selleAccentColors.softBg,
                  borderColor: selleAccentColors.softBorder,
                },
                isSubmitting && styles.typeButtonDisabled,
                pressedOpacity(pressed),
              ]}
              onPress={() => setIncludeSelle((prev) => !prev)}
              disabled={isSubmitting}
              accessibilityLabel="Selle"
              accessibilityRole="button"
              accessibilityState={{
                selected: includeSelle,
                disabled: isSubmitting,
              }}
              hitSlop={8}
            >
              <FontAwesome
                name="poop"
                size={18}
                color={
                  includeSelle
                    ? selleAccentColors.softText
                    : eventColors.selle.dark
                }
              />
              <Text
                style={[
                  styles.typeText,
                  { color: nc.textLight },
                  includeSelle && styles.typeTextActive,
                  includeSelle && { color: selleAccentColors.softText },
                  isSubmitting && { color: nc.textLight },
                ]}
              >
                Selle
              </Text>
            </Pressable>
          </View>
        </>
      )}

      {/* Miction options */}
      {includeMiction && (
        <>
          <Text style={[styles.inputLabel, { color: nc.textLight }]}>
            Couleur de l&apos;urine
          </Text>
          <Text style={[styles.toggleSubtitle, { color: nc.textLight }]}>
            Optionnel
          </Text>
          <View style={styles.optionsRow}>
            {(
              [
                { value: "claire", label: "Claire", color: "#e8f4f8" },
                { value: "jaune", label: "Jaune", color: "#fff3cd" },
                { value: "foncee", label: "Foncée", color: "#f5c87b" },
                { value: "autre", label: "Autre", color: "#e0e0e0" },
              ] as const
            ).map((option) => (
              <Pressable
                android_ripple={ripple}
                key={option.value}
                style={({ pressed }) => [
                  styles.optionButton,
                  styles.optionButtonSelle,
                  { backgroundColor: nc.background, borderColor: nc.border },
                  mictionCouleur === option.value && {
                    backgroundColor: option.color,
                    borderColor: mictionAccentColors.softBorder,
                  },
                  isSubmitting && styles.optionButtonDisabled,
                  pressedOpacity(pressed),
                ]}
                onPress={() =>
                  setMictionCouleur((prev) =>
                    prev === option.value ? null : option.value,
                  )
                }
                disabled={isSubmitting}
                accessibilityLabel={option.label}
                accessibilityRole="button"
                accessibilityState={{
                  selected: mictionCouleur === option.value,
                  disabled: isSubmitting,
                }}
              >
                <Text
                  style={[
                    styles.optionText,
                    {
                      color:
                        mictionCouleur === option.value
                          ? "#333"
                          : nc.textNormal,
                    },
                  ]}
                >
                  {option.label}
                </Text>
              </Pressable>
            ))}
          </View>
        </>
      )}

      {/* Selle options */}
      {includeSelle && (
        <>
          <Text style={[styles.inputLabel, { color: nc.textLight }]}>
            Consistance
          </Text>
          <Text style={[styles.toggleSubtitle, { color: nc.textLight }]}>
            Optionnel
          </Text>
          <View style={styles.optionsRow}>
            {(
              [
                { value: "liquide", label: "Liquide" },
                { value: "molle", label: "Molle" },
                { value: "normale", label: "Normale" },
                { value: "dure", label: "Dure" },
              ] as const
            ).map((option) => (
              <Pressable
                android_ripple={ripple}
                key={option.value}
                style={({ pressed }) => [
                  styles.optionButton,
                  styles.optionButtonSelle,
                  { backgroundColor: nc.background, borderColor: nc.border },
                  selleConsistance === option.value && {
                    backgroundColor: selleAccentColors.softBg,
                    borderColor: selleAccentColors.softBorder,
                  },
                  isSubmitting && styles.optionButtonDisabled,
                  pressedOpacity(pressed),
                ]}
                onPress={() =>
                  setSelleConsistance((prev) =>
                    prev === option.value ? null : option.value,
                  )
                }
                disabled={isSubmitting}
                accessibilityLabel={option.label}
                accessibilityRole="button"
                accessibilityState={{
                  selected: selleConsistance === option.value,
                  disabled: isSubmitting,
                }}
              >
                <Text
                  style={[
                    styles.optionText,
                    { color: nc.textStrong },
                    selleConsistance === option.value &&
                      styles.optionTextSelected,
                    selleConsistance === option.value && {
                      color: selleAccentColors.softText,
                    },
                  ]}
                >
                  {option.label}
                </Text>
              </Pressable>
            ))}
          </View>

          <Text style={[styles.inputLabel, { color: nc.textLight }]}>
            Quantité
          </Text>
          <Text style={[styles.toggleSubtitle, { color: nc.textLight }]}>
            Optionnel
          </Text>
          <View style={styles.optionsRow}>
            {(
              [
                { value: "peu", label: "Peu" },
                { value: "moyen", label: "Moyen" },
                { value: "beaucoup", label: "Beaucoup" },
              ] as const
            ).map((option) => (
              <Pressable
                android_ripple={ripple}
                key={option.value}
                style={({ pressed }) => [
                  styles.optionButton,
                  styles.optionButtonSelle,
                  { backgroundColor: nc.background, borderColor: nc.border },
                  selleQuantite === option.value && {
                    backgroundColor: selleAccentColors.softBg,
                    borderColor: selleAccentColors.softBorder,
                  },
                  isSubmitting && styles.optionButtonDisabled,
                  pressedOpacity(pressed),
                ]}
                onPress={() =>
                  setSelleQuantite((prev) =>
                    prev === option.value ? null : option.value,
                  )
                }
                disabled={isSubmitting}
                accessibilityLabel={option.label}
                accessibilityRole="button"
                accessibilityState={{
                  selected: selleQuantite === option.value,
                  disabled: isSubmitting,
                }}
              >
                <Text
                  style={[
                    styles.optionText,
                    { color: nc.textStrong },
                    selleQuantite === option.value && styles.optionTextSelected,
                    selleQuantite === option.value && {
                      color: selleAccentColors.softText,
                    },
                  ]}
                >
                  {option.label}
                </Text>
              </Pressable>
            ))}
          </View>
        </>
      )}

      {/* Date & Time */}
      <DateTimeSectionRow
        value={dateHeure}
        onChange={handleDateHeureChange}
        colorScheme={colorScheme}
        disabled={isSubmitting}
        onPickerToggle={onFormStepChange}
        // Un repas, une couche ou un tirage ne se saisit pas au futur : évite
        // un mauvais jour choisi d'un pouce ensommeillé.
        maximumDate={new Date()}
      />

      {/* Action Buttons */}
      <View style={styles.buttonsContainer}>
        {/* Pied collant : Annuler / Ajouter toujours visibles dans la feuille. */}
        <SheetFooter>
        <View style={styles.primaryRow}>
          <Pressable
            android_ripple={ripple}
            style={({ pressed }) => [
              styles.cancelButton,
              { backgroundColor: nc.background, borderColor: nc.border },
              isSubmitting && styles.buttonDisabled,
              pressedOpacity(pressed, 0.2),
            ]}
            onPress={onCancel}
            disabled={isSubmitting}
            accessibilityLabel="Annuler"
          >
            <Text style={[styles.cancelText, { color: nc.textNormal }]}>
              Annuler
            </Text>
          </Pressable>

          <Pressable
            android_ripple={ripple}
            style={({ pressed }) => [
              styles.validateButton,
              { backgroundColor: accentColors.filledBg },
              isSubmitting && styles.buttonDisabled,
              pressedOpacity(pressed, 0.2),
            ]}
            onPress={handleSubmit}
            disabled={isSubmitting}
            accessibilityLabel={isEditing ? "Enregistrer" : "Ajouter"}
          >
            <Text
              style={[
                styles.validateText,
                {
                  color: accentColors.filledText,
                },
              ]}
            >
              {isEditing ? "Enregistrer" : "Ajouter"}
            </Text>
          </Pressable>
        </View>
        </SheetFooter>

        {isEditing && (
          <Pressable
            android_ripple={ripple}
            style={({ pressed }) => [
              styles.deleteButton, isSubmitting && styles.buttonDisabled,
              pressedOpacity(pressed, 0.2),
            ]}
            onPress={handleDelete}
            disabled={isSubmitting}
            accessibilityLabel="Supprimer"
          >
            <FontAwesome name="trash" size={14} color={nc.error} />
            <Text style={[styles.deleteText, { color: nc.errorText }]}>
              Supprimer
            </Text>
          </Pressable>
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
    fontSize: 12,
    fontWeight: "700",
    marginBottom: 8,
    marginTop: 16,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  toggleSubtitle: {
    fontSize: 13,
    textAlign: "center",
    marginBottom: 8,
  },
  // Type Selection
  typeRow: {
    flexDirection: "row",
    justifyContent: "center",
    marginBottom: 16,
    gap: 8,
  },
  typeButton: {
    ...RIPPLE_CLIP,
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 12,
    paddingHorizontal: 10,
    borderRadius: 20,
    borderWidth: 1,
  },
  typeButtonDisabled: {
    opacity: 0.5,
  },
  typeText: {
    fontSize: 13,
    fontWeight: "600",
    textAlign: "center",
  },
  typeTextActive: {
    fontWeight: "bold",
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
    ...RIPPLE_CLIP,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "transparent",
    minWidth: 64,
    alignItems: "center",
    justifyContent: "center",
  },
  optionButtonSelle: {
    borderWidth: 1,
  },
  optionButtonDisabled: {
    opacity: 0.5,
  },
  optionText: {
    fontSize: 14,
    fontWeight: "500",
    textAlign: "center",
  },
  optionTextSelected: {
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
    ...RIPPLE_CLIP,
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
    ...RIPPLE_CLIP,
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
