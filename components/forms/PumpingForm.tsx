import { pressedOpacity, RIPPLE_CLIP, usePressRipple } from "@/components/ui/pressFeedback";
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

import { DateTimeSectionRow } from "@/components/ui/DateTimeSectionRow";
import { SheetFooter } from "@/components/forms/SheetFooter";
import { useFormDirtyGuard } from "@/components/forms/formGuard";
import { useRepeatPress } from "@/components/forms/useRepeatPress";
import { NUMERIC_BOUNDS } from "@/utils/eventBounds";
import FontAwesome6 from "@expo/vector-icons/FontAwesome6";

// Bornes CF (parité serveur). Same value sur les deux côtés.
const PUMP_MAX = NUMERIC_BOUNDS.pompage.quantiteGauche.max;
import { useCallback, useRef, useState } from "react";
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  Pressable,
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
  const ripple = usePressRipple();
  const { activeChild } = useBaby();
  const { showAlert } = useModal();
  const deleteFromSheet = useSheetDeleteWithUndo();
  const { showSuccess } = useSuccessAnimation();
  const colorScheme = useColorScheme() ?? "light";
  const nc = getNeutralColors(colorScheme);
  const accentColors = getAccentColors(
    eventColors.pumping.dark,
    colorScheme,
  );

  const isEditing = !!editData;

  // Form state
  const [useLeftBreast, setUseLeftBreast] = useState(
    editData ? (editData.quantiteGauche ?? 0) > 0 : true,
  );
  const [useRightBreast, setUseRightBreast] = useState(
    editData ? (editData.quantiteDroite ?? 0) > 0 : true,
  );
  const [quantiteGauche, setQuantiteGauche] = useState(
    editData?.quantiteGauche ?? 100,
  );
  const [quantiteDroite, setQuantiteDroite] = useState(
    editData?.quantiteDroite ?? 100,
  );
  const [dateHeure, setDateHeure] = useState(editData?.date ?? new Date());
  const [dateHeureDirty, setDateHeureDirty] = useState(false);

  // Refs for quantity memory
  const lastLeftQuantityRef = useRef(quantiteGauche);
  const lastRightQuantityRef = useRef(quantiteDroite);

  // +/− : un pas au relâchement, répétition accélérée à l'appui long.
  const repeatPress = useRepeatPress();

  const handleDateHeureChange = useCallback((nextDate: Date) => {
    setDateHeure(nextDate);
    setDateHeureDirty(true);
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

  // Submit handler
  // Garde-fou : la feuille demande confirmation avant de fermer une saisie modifiée.
  useFormDirtyGuard({ useLeftBreast, useRightBreast, quantiteGauche, quantiteDroite, dateHeure });

  const handleSubmit = () => {
    if (!activeChild?.id || isSubmitting) return;
    if (!useLeftBreast && !useRightBreast) {
      showAlert("Erreur", "Sélectionnez au moins un sein.");
      return;
    }

    setIsSubmitting(true);
    const dateToSave = !isEditing || dateHeureDirty ? dateHeure : undefined;
    const data = {
      type: "pompage" as const,
      quantiteGauche: useLeftBreast ? quantiteGauche : 0,
      quantiteDroite: useRightBreast ? quantiteDroite : 0,
      date: dateToSave,
    };

    if (isEditing && editData) {
      modifierEvenementOptimistic(activeChild.id, editData.id, data, editData);
      showSuccess("pumping", "Session modifiée");
    } else {
      ajouterEvenementOptimistic(activeChild.id, data);
      showSuccess("pumping", "Session enregistrée");
    }

    setIsSubmitting(false);
    onSuccess();
  };

  // Delete handler
  // Suppression immédiate + toast « Annuler » (8 s), comme dans les listes :
  // pas de modale « irréversible » (audit UI/UX V3, R-P1-12).
  const handleDelete = () => {
    if (!activeChild?.id || !editData?.id || isSubmitting) return;
    const childId = activeChild.id;
    const id = editData.id;
    deleteFromSheet({
      id,
      message: "Session supprimée",
      run: () => supprimerEvenement(childId, id),
      close: onDelete,
    });
  };

  return (
    <View style={styles.container}>
      {/* Breast selection */}
      <Text style={[styles.categoryLabel, { color: nc.textLight }]}>Seins</Text>
      <View style={styles.breastToggleRow}>
        <Pressable
          android_ripple={ripple}
          style={({ pressed }) => [
            styles.breastToggleButton,
            { borderColor: nc.border, backgroundColor: nc.background },
            useLeftBreast && {
              backgroundColor: accentColors.softBg,
              borderColor: accentColors.softBorder,
            },
            pressedOpacity(pressed, 0.2),
          ]}
          onPress={toggleLeftBreast}
          disabled={isSubmitting}
          accessibilityLabel="Sein gauche"
          accessibilityRole="button"
          accessibilityState={{
            selected: useLeftBreast,
            disabled: isSubmitting,
          }}
        >
          <Text
            style={[
              styles.breastToggleText,
              { color: nc.textLight },
              useLeftBreast && {
                color: accentColors.softText,
              },
            ]}
          >
            Gauche
          </Text>
        </Pressable>
        <Pressable
          android_ripple={ripple}
          style={({ pressed }) => [
            styles.breastToggleButton,
            { borderColor: nc.border, backgroundColor: nc.background },
            useRightBreast && {
              backgroundColor: accentColors.softBg,
              borderColor: accentColors.softBorder,
            },
            pressedOpacity(pressed, 0.2),
          ]}
          onPress={toggleRightBreast}
          disabled={isSubmitting}
          accessibilityLabel="Sein droit"
          accessibilityRole="button"
          accessibilityState={{
            selected: useRightBreast,
            disabled: isSubmitting,
          }}
        >
          <Text
            style={[
              styles.breastToggleText,
              { color: nc.textLight },
              useRightBreast && {
                color: accentColors.softText,
              },
            ]}
          >
            Droit
          </Text>
        </Pressable>
      </View>

      {/* Left breast quantity */}
      {useLeftBreast && (
        <>
          <Text style={[styles.categoryLabel, { color: nc.textLight }]}>
            Quantité Sein Gauche
          </Text>
          <View style={styles.quantityPickerRow}>
            <Pressable
              android_ripple={ripple}
              style={({ pressed }) => [
                styles.quantityButton,
                { backgroundColor: nc.backgroundPressed },
                isSubmitting && styles.quantityButtonDisabled,
                pressedOpacity(pressed, 0.2),
              ]}
              {...repeatPress(() =>
                  setQuantiteGauche((q) => Math.max(0, q - 5)))}
              disabled={isSubmitting}
              accessibilityLabel="Diminuer quantité gauche"
            >
              <Text
                style={[
                  styles.quantityButtonText,
                  { color: nc.textStrong },
                  isSubmitting && { color: nc.textLight },
                ]}
              >
                -
              </Text>
            </Pressable>
            <Text
              style={[styles.quantityPickerValue, { color: nc.textStrong }]}
            >
              {quantiteGauche} ml
            </Text>
            <Pressable
              android_ripple={ripple}
              style={({ pressed }) => [
                styles.quantityButton,
                { backgroundColor: nc.backgroundPressed },
                isSubmitting && styles.quantityButtonDisabled,
                pressedOpacity(pressed, 0.2),
              ]}
              {...repeatPress(() => setQuantiteGauche((q) => Math.min(PUMP_MAX, q + 5)))}
              disabled={isSubmitting}
              accessibilityLabel="Augmenter quantité gauche"
            >
              <Text
                style={[
                  styles.quantityButtonText,
                  { color: nc.textStrong },
                  isSubmitting && { color: nc.textLight },
                ]}
              >
                +
              </Text>
            </Pressable>
          </View>
        </>
      )}

      {/* Right breast quantity */}
      {useRightBreast && (
        <>
          <Text style={[styles.categoryLabel, { color: nc.textLight }]}>
            Quantité Sein Droit
          </Text>
          <View style={styles.quantityPickerRow}>
            <Pressable
              android_ripple={ripple}
              style={({ pressed }) => [
                styles.quantityButton,
                { backgroundColor: nc.backgroundPressed },
                isSubmitting && styles.quantityButtonDisabled,
                pressedOpacity(pressed, 0.2),
              ]}
              {...repeatPress(() =>
                  setQuantiteDroite((q) => Math.max(0, q - 5)))}
              disabled={isSubmitting}
              accessibilityLabel="Diminuer quantité droite"
            >
              <Text
                style={[
                  styles.quantityButtonText,
                  { color: nc.textStrong },
                  isSubmitting && { color: nc.textLight },
                ]}
              >
                -
              </Text>
            </Pressable>
            <Text
              style={[styles.quantityPickerValue, { color: nc.textStrong }]}
            >
              {quantiteDroite} ml
            </Text>
            <Pressable
              android_ripple={ripple}
              style={({ pressed }) => [
                styles.quantityButton,
                { backgroundColor: nc.backgroundPressed },
                isSubmitting && styles.quantityButtonDisabled,
                pressedOpacity(pressed, 0.2),
              ]}
              {...repeatPress(() => setQuantiteDroite((q) => Math.min(PUMP_MAX, q + 5)))}
              disabled={isSubmitting}
              accessibilityLabel="Augmenter quantité droite"
            >
              <Text
                style={[
                  styles.quantityButtonText,
                  { color: nc.textStrong },
                  isSubmitting && { color: nc.textLight },
                ]}
              >
                +
              </Text>
            </Pressable>
          </View>
        </>
      )}

      {/* Date/Time */}
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

      {/* Action buttons */}
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
            {isSubmitting ? (
              <ActivityIndicator
                color={accentColors.filledText}
                size="small"
              />
            ) : (
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
            )}
          </Pressable>
        </View>
        </SheetFooter>

        {isEditing && onDelete && (
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
            <FontAwesome6 name="trash" size={14} color={nc.error} />
            <Text style={[styles.deleteText, { color: nc.errorText }]}>Supprimer</Text>
          </Pressable>
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
    fontSize: 12,
    fontWeight: "700",
    marginBottom: 8,
    marginTop: 16,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  // Breast toggle
  breastToggleRow: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 12,
    marginBottom: 12,
  },
  breastToggleButton: {
    ...RIPPLE_CLIP,
    paddingVertical: 8,
    paddingHorizontal: 18,
    borderRadius: 999,
    borderWidth: 1,
  },
  breastToggleText: {
    fontSize: 14,
    fontWeight: "600",
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
    ...RIPPLE_CLIP,
    // Cible >= 44 pt (48 dp Android), utilisable d'une main.
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
  },
  quantityButtonDisabled: {
    opacity: 0.6,
  },
  quantityButtonText: {
    fontSize: 18,
    fontWeight: "700",
  },
  quantityPickerValue: {
    fontSize: 16,
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
