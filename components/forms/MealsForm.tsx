import { DateTimeSectionRow } from "@/components/ui/DateTimeSectionRow";
import { getNeutralColors } from "@/constants/dashboardColors";
import {
  ALLERGENES_OPTIONS,
  BIBERON_TYPE_OPTIONS,
  MOMENT_REPAS_OPTIONS,
  QUANTITE_SOLIDE_OPTIONS,
  REACTION_OPTIONS,
  SOLIDE_TYPE_OPTIONS,
} from "@/constants/dashboardConfig";
import { eventColors } from "@/constants/eventColors";
import { Colors } from "@/constants/theme";
import { useBaby } from "@/contexts/BabyContext";
import { useModal } from "@/contexts/ModalContext";
import { useSuccessAnimation } from "@/contexts/SuccessAnimationContext";
import { useToast } from "@/contexts/ToastContext";
import { useColorScheme } from "@/hooks/use-color-scheme";
import {
  ajouterEvenementOptimistic,
  modifierEvenementOptimistic,
  supprimerBiberon,
  supprimerSolide,
  supprimerTetee,
} from "@/migration/eventsDoubleWriteService";
import { BiberonEvent, SolideEvent } from "@/services/eventsService";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import FontAwesome from "@expo/vector-icons/FontAwesome6";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  StyleSheet,
  Switch,
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

export type MealType = "tetee" | "biberon" | "solide";

export interface MealsEditData {
  id: string;
  type: MealType;
  date: Date;
  // Tetee fields
  dureeGauche?: number;
  dureeDroite?: number;
  // Biberon fields
  quantite?: number;
  typeBiberon?: BiberonEvent["typeBiberon"];
  // Solide fields
  typeSolide?: SolideEvent["typeSolide"];
  momentRepas?: SolideEvent["momentRepas"];
  ingredients?: string;
  quantiteSolide?: SolideEvent["quantite"];
  nouveauAliment?: boolean;
  nomNouvelAliment?: string;
  allergenes?: string[];
  reaction?: SolideEvent["reaction"];
  aime?: boolean;
}

export interface MealsFormProps {
  initialType?: MealType;
  onSuccess: () => void;
  onCancel: () => void;
  isSubmitting: boolean;
  setIsSubmitting: (value: boolean) => void;
  onFormStepChange?: (isInPicker: boolean) => void;
  editData?: MealsEditData;
  onDelete?: () => void;
}

// ============================================
// HELPERS
// ============================================

function formatDuration(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
}

// ============================================
// COMPONENT
// ============================================

export function MealsForm({
  initialType = "tetee",
  onSuccess,
  onCancel,
  isSubmitting,
  setIsSubmitting,
  onFormStepChange,
  editData,
  onDelete,
}: MealsFormProps) {
  const { activeChild } = useBaby();
  const { showAlert, showConfirm } = useModal();
  const { showToast } = useToast();
  const { showSuccess } = useSuccessAnimation();
  const colorScheme = useColorScheme() ?? "light";
  const nc = getNeutralColors(colorScheme);

  const isEditing = !!editData;

  // Form state
  const [mealType, setMealType] = useState<MealType>(
    editData?.type ?? initialType,
  );
  const [dateHeure, setDateHeure] = useState<Date>(
    editData?.date ?? new Date(),
  );

  // Tetee state
  const [leftSeconds, setLeftSeconds] = useState(
    editData?.dureeGauche ? editData.dureeGauche * 60 : 0,
  );
  const [rightSeconds, setRightSeconds] = useState(
    editData?.dureeDroite ? editData.dureeDroite * 60 : 0,
  );
  const [runningSide, setRunningSide] = useState<"left" | "right" | null>(null);

  // Biberon state
  const [quantite, setQuantite] = useState<number>(editData?.quantite ?? 100);
  const [typeBiberon, setTypeBiberon] = useState<BiberonEvent["typeBiberon"]>(
    editData?.typeBiberon ?? "lait_maternel",
  );

  // Solide state
  const [typeSolide, setTypeSolide] = useState<SolideEvent["typeSolide"]>(
    editData?.typeSolide ?? "puree",
  );
  const [momentRepas, setMomentRepas] = useState<SolideEvent["momentRepas"]>(
    editData?.momentRepas ?? "dejeuner",
  );
  const [ingredients, setIngredients] = useState(editData?.ingredients ?? "");
  const [quantiteSolide, setQuantiteSolide] = useState<SolideEvent["quantite"]>(
    editData?.quantiteSolide ?? "moyen",
  );
  const hasDishName = Boolean(editData?.nomNouvelAliment?.trim());
  const [nouveauAliment, setNouveauAliment] = useState(
    (editData?.nouveauAliment ?? false) && hasDishName,
  );
  const [nomNouvelAliment, setNomNouvelAliment] = useState(
    editData?.nomNouvelAliment ?? "",
  );
  const [allergenes, setAllergenes] = useState<string[]>(
    editData?.allergenes ?? [],
  );
  const [reaction, setReaction] = useState<SolideEvent["reaction"]>(
    editData?.reaction ?? "aucune",
  );
  const [aime, setAime] = useState<boolean | undefined>(editData?.aime);

  useEffect(() => {
    if (!nouveauAliment && nomNouvelAliment) {
      setNomNouvelAliment("");
    }
  }, [nouveauAliment, nomNouvelAliment]);

  // Long press acceleration refs
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const timerIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const timerTickRef = useRef<number | null>(null);

  // ============================================
  // HANDLERS - Long press acceleration
  // ============================================

  const handlePressIn = useCallback((action: () => void) => {
    action();
    timeoutRef.current = setTimeout(() => {
      intervalRef.current = setInterval(action, 100);
    }, 400);
  }, []);

  const handlePressOut = useCallback(() => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    if (intervalRef.current) clearInterval(intervalRef.current);
  }, []);

  // ============================================
  // HANDLERS - Chronomètre tétée
  // ============================================

  const toggleChrono = (side: "left" | "right") => {
    setRunningSide((prev) => (prev === side ? null : side));
  };

  const resetChrono = (side: "left" | "right") => {
    if (side === "left") setLeftSeconds(0);
    else setRightSeconds(0);
    setRunningSide((prev) => (prev === side ? null : prev));
  };

  // Stop chrono when changing meal type
  useEffect(() => {
    if (mealType !== "tetee") {
      setRunningSide(null);
    }
  }, [mealType]);

  // Chrono timer effect
  useEffect(() => {
    if (!runningSide || mealType !== "tetee" || isEditing) {
      if (timerIntervalRef.current) {
        clearInterval(timerIntervalRef.current);
        timerIntervalRef.current = null;
      }
      timerTickRef.current = null;
      return;
    }

    timerTickRef.current = Date.now();
    timerIntervalRef.current = setInterval(() => {
      const now = Date.now();
      const lastTick = timerTickRef.current ?? now;
      const deltaSeconds = Math.floor((now - lastTick) / 1000);
      if (deltaSeconds <= 0) return;
      timerTickRef.current = lastTick + deltaSeconds * 1000;
      if (runningSide === "left") {
        setLeftSeconds((prev) => prev + deltaSeconds);
      } else {
        setRightSeconds((prev) => prev + deltaSeconds);
      }
    }, 500);

    return () => {
      if (timerIntervalRef.current) {
        clearInterval(timerIntervalRef.current);
        timerIntervalRef.current = null;
      }
      timerTickRef.current = null;
    };
  }, [runningSide, mealType, isEditing]);

  // ============================================
  // SUBMIT / DELETE
  // ============================================

  const handleSubmit = () => {
    if (!activeChild?.id || isSubmitting) return;

    setIsSubmitting(true);

    if (mealType === "tetee") {
      const leftMinutes = Math.round(leftSeconds / 60);
      const rightMinutes = Math.round(rightSeconds / 60);
      const dataToSave = removeUndefined({
        type: mealType,
        quantite: null,
        coteGauche: leftSeconds > 0,
        coteDroit: rightSeconds > 0,
        dureeGauche: leftMinutes > 0 ? leftMinutes : undefined,
        dureeDroite: rightMinutes > 0 ? rightMinutes : undefined,
        date: dateHeure,
      });

      if (isEditing && editData?.id) {
        modifierEvenementOptimistic(activeChild.id, editData.id, dataToSave, editData);
        showSuccess("meal", "Tétée modifiée");
      } else {
        ajouterEvenementOptimistic(activeChild.id, dataToSave);
        showSuccess("meal", "Tétée enregistrée");
      }
    } else if (mealType === "biberon") {
      const dataToSave = removeUndefined({
        type: mealType,
        quantite,
        typeBiberon,
        date: dateHeure,
      });

      if (isEditing && editData?.id) {
        modifierEvenementOptimistic(activeChild.id, editData.id, dataToSave, editData);
        showSuccess("meal", "Biberon modifié");
      } else {
        ajouterEvenementOptimistic(activeChild.id, dataToSave);
        showSuccess("meal", "Biberon enregistré");
      }
    } else if (mealType === "solide") {
      const dataToSave = removeUndefined({
        type: mealType,
        typeSolide,
        momentRepas,
        ingredients: ingredients.trim() || undefined,
        quantite: quantiteSolide,
        nouveauAliment: typeSolide === "autre" ? nouveauAliment : false,
        nomNouvelAliment:
          typeSolide === "autre" && nouveauAliment && nomNouvelAliment.trim()
            ? nomNouvelAliment.trim()
            : "",
        allergenes:
          typeSolide === "autre" && nouveauAliment && allergenes.length > 0
            ? allergenes
            : undefined,
        reaction:
          typeSolide === "autre" && nouveauAliment ? reaction : undefined,
        aime: aime ?? (editData ? null : undefined),
        date: dateHeure,
      });

      if (isEditing && editData?.id) {
        modifierEvenementOptimistic(activeChild.id, editData.id, dataToSave as any, editData);
        showSuccess("meal", "Repas solide modifié");
      } else {
        ajouterEvenementOptimistic(activeChild.id, dataToSave);
        showSuccess("meal", "Repas solide enregistré");
      }
    }

    setIsSubmitting(false);
    onSuccess();
  };

  const handleDelete = () => {
    if (!editData || !activeChild?.id || isSubmitting) return;

    showConfirm(
      "Supprimer",
      "Voulez-vous vraiment supprimer ce repas ?",
      async () => {
        try {
          setIsSubmitting(true);
          if (editData.type === "tetee") {
            await supprimerTetee(activeChild.id, editData.id);
            showToast("Tétée supprimée");
          } else if (editData.type === "biberon") {
            await supprimerBiberon(activeChild.id, editData.id);
            showToast("Biberon supprimé");
          } else if (editData.type === "solide") {
            await supprimerSolide(activeChild.id, editData.id);
            showToast("Repas solide supprimé");
          }
          onDelete?.();
        } catch (error) {
          console.error("Erreur suppression:", error);
          showAlert("Erreur", "Impossible de supprimer.");
        } finally {
          setIsSubmitting(false);
        }
      },
    );
  };

  // ============================================
  // RENDER
  // ============================================

  const totalSeconds = leftSeconds + rightSeconds;

  return (
    <View style={styles.container}>
      {/* Type selector */}
      <Text style={[styles.categoryLabel, { color: nc.textLight }]}>
        Type de repas
      </Text>
      <View style={styles.typeRow}>
        <TouchableOpacity
          style={[
            styles.typeChip,
            { backgroundColor: nc.backgroundPressed },
            mealType === "tetee" && styles.typeChipActive,
            isSubmitting && styles.typeChipDisabled,
          ]}
          onPress={() => setMealType("tetee")}
          disabled={isSubmitting}
          accessibilityLabel="Type tétée"
        >
          <FontAwesome
            name="person-breastfeeding"
            size={16}
            color={mealType === "tetee" ? "white" : nc.textLight}
          />
          <Text
            style={[
              styles.typeChipText,
              { color: nc.textLight },
              mealType === "tetee" && styles.typeChipTextActive,
            ]}
          >
            Tétée
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            styles.typeChip,
            { backgroundColor: nc.backgroundPressed },
            mealType === "biberon" && styles.typeChipActive,
            isSubmitting && styles.typeChipDisabled,
          ]}
          onPress={() => {
            setMealType("biberon");
            setRunningSide(null);
          }}
          disabled={isSubmitting}
          accessibilityLabel="Type biberon"
        >
          <MaterialCommunityIcons
            name="baby-bottle"
            size={18}
            color={mealType === "biberon" ? "white" : nc.textLight}
          />
          <Text
            style={[
              styles.typeChipText,
              { color: nc.textLight },
              mealType === "biberon" && styles.typeChipTextActive,
            ]}
          >
            Biberon
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            styles.typeChip,
            { backgroundColor: nc.backgroundPressed },
            mealType === "solide" && styles.typeChipActive,
            isSubmitting && styles.typeChipDisabled,
          ]}
          onPress={() => {
            setMealType("solide");
            setRunningSide(null);
          }}
          disabled={isSubmitting}
          accessibilityLabel="Type solide"
        >
          <FontAwesome
            name="bowl-food"
            size={16}
            color={mealType === "solide" ? "white" : nc.textLight}
          />
          <Text
            style={[
              styles.typeChipText,
              { color: nc.textLight },
              mealType === "solide" && styles.typeChipTextActive,
            ]}
          >
            Solide
          </Text>
        </TouchableOpacity>
      </View>

      {/* BIBERON FORM */}
      {mealType === "biberon" && (
        <>
          <Text style={[styles.categoryLabel, { color: nc.textLight }]}>
            Type de biberon
          </Text>
          <View style={styles.biberonTypeGrid}>
            {BIBERON_TYPE_OPTIONS.map((option) => (
              <TouchableOpacity
                key={option.value}
                style={[
                  styles.biberonTypeChip,
                  { backgroundColor: nc.backgroundPressed },
                  typeBiberon === option.value && styles.biberonTypeChipActive,
                  isSubmitting && styles.chipDisabled,
                ]}
                onPress={() => setTypeBiberon(option.value)}
                disabled={isSubmitting}
                accessibilityLabel={`Type ${option.label}`}
                hitSlop={8}
              >
                <Text
                  style={[
                    styles.biberonTypeChipText,
                    { color: nc.textLight },
                    typeBiberon === option.value &&
                      styles.biberonTypeChipTextActive,
                  ]}
                >
                  {option.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={[styles.categoryLabel, { color: nc.textLight }]}>
            Quantité
          </Text>
          <View style={styles.quantityRow}>
            <TouchableOpacity
              style={[
                styles.quantityButton,
                { backgroundColor: nc.backgroundPressed },
                isSubmitting && styles.buttonDisabled,
              ]}
              onPressIn={() =>
                handlePressIn(() => setQuantite((q) => Math.max(0, q - 5)))
              }
              onPressOut={handlePressOut}
              disabled={isSubmitting}
              accessibilityLabel="Diminuer la quantité"
            >
              <Text
                style={[styles.quantityButtonText, { color: nc.textStrong }]}
              >
                -
              </Text>
            </TouchableOpacity>
            <Text style={[styles.quantityValue, { color: nc.textStrong }]}>
              {quantite} ml
            </Text>
            <TouchableOpacity
              style={[
                styles.quantityButton,
                { backgroundColor: nc.backgroundPressed },
                isSubmitting && styles.buttonDisabled,
              ]}
              onPressIn={() => handlePressIn(() => setQuantite((q) => q + 5))}
              onPressOut={handlePressOut}
              disabled={isSubmitting}
              accessibilityLabel="Augmenter la quantité"
            >
              <Text
                style={[styles.quantityButtonText, { color: nc.textStrong }]}
              >
                +
              </Text>
            </TouchableOpacity>
          </View>
        </>
      )}

      {/* TETEE FORM */}
      {mealType === "tetee" && (
        <>
          <Text style={[styles.categoryLabel, { color: nc.textLight }]}>
            Chronomètre tétée
          </Text>
          <View style={styles.chronoContainer}>
            {/* Left side */}
            <View
              style={[
                styles.chronoCard,
                { backgroundColor: nc.background, borderColor: nc.border },
              ]}
            >
              <Text style={[styles.chronoLabel, { color: nc.textLight }]}>
                Gauche
              </Text>
              <Text style={[styles.chronoTime, { color: nc.textStrong }]}>
                {formatDuration(leftSeconds)}
              </Text>
              {isEditing ? (
                <View style={styles.chronoAdjustRow}>
                  <TouchableOpacity
                    style={[
                      styles.chronoAdjustButton,
                      {
                        backgroundColor: nc.backgroundCard,
                        borderColor: nc.border,
                      },
                      isSubmitting && styles.buttonDisabled,
                    ]}
                    onPressIn={() =>
                      handlePressIn(() =>
                        setLeftSeconds((prev) => Math.max(0, prev - 60)),
                      )
                    }
                    onPressOut={handlePressOut}
                    disabled={isSubmitting}
                  >
                    <Text
                      style={[
                        styles.chronoAdjustButtonText,
                        { color: nc.textStrong },
                      ]}
                    >
                      -
                    </Text>
                  </TouchableOpacity>
                  <Text
                    style={[styles.chronoAdjustValue, { color: nc.textStrong }]}
                  >
                    {Math.round(leftSeconds / 60)} min
                  </Text>
                  <TouchableOpacity
                    style={[
                      styles.chronoAdjustButton,
                      {
                        backgroundColor: nc.backgroundCard,
                        borderColor: nc.border,
                      },
                      isSubmitting && styles.buttonDisabled,
                    ]}
                    onPressIn={() =>
                      handlePressIn(() => setLeftSeconds((prev) => prev + 60))
                    }
                    onPressOut={handlePressOut}
                    disabled={isSubmitting}
                  >
                    <Text
                      style={[
                        styles.chronoAdjustButtonText,
                        { color: nc.textStrong },
                      ]}
                    >
                      +
                    </Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <View style={styles.chronoControlRow}>
                  <TouchableOpacity
                    style={[
                      styles.chronoControlButton,
                      {
                        backgroundColor: nc.backgroundCard,
                        borderColor: nc.border,
                      },
                      runningSide === "left" &&
                        styles.chronoControlButtonActive,
                    ]}
                    onPress={() => toggleChrono("left")}
                    disabled={isSubmitting}
                  >
                    <Ionicons
                      name={runningSide === "left" ? "pause" : "play"}
                      size={16}
                      color={runningSide === "left" ? "white" : nc.textStrong}
                    />
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[
                      styles.chronoControlButton,
                      {
                        backgroundColor: nc.backgroundCard,
                        borderColor: nc.border,
                      },
                      leftSeconds === 0 && styles.chronoControlButtonDisabled,
                    ]}
                    onPress={() => resetChrono("left")}
                    disabled={isSubmitting || leftSeconds === 0}
                  >
                    <Ionicons
                      name="refresh"
                      size={16}
                      color={leftSeconds === 0 ? nc.textMuted : nc.textStrong}
                    />
                  </TouchableOpacity>
                </View>
              )}
            </View>

            {/* Right side */}
            <View
              style={[
                styles.chronoCard,
                { backgroundColor: nc.background, borderColor: nc.border },
              ]}
            >
              <Text style={[styles.chronoLabel, { color: nc.textLight }]}>
                Droit
              </Text>
              <Text style={[styles.chronoTime, { color: nc.textStrong }]}>
                {formatDuration(rightSeconds)}
              </Text>
              {isEditing ? (
                <View style={styles.chronoAdjustRow}>
                  <TouchableOpacity
                    style={[
                      styles.chronoAdjustButton,
                      {
                        backgroundColor: nc.backgroundCard,
                        borderColor: nc.border,
                      },
                      isSubmitting && styles.buttonDisabled,
                    ]}
                    onPressIn={() =>
                      handlePressIn(() =>
                        setRightSeconds((prev) => Math.max(0, prev - 60)),
                      )
                    }
                    onPressOut={handlePressOut}
                    disabled={isSubmitting}
                  >
                    <Text
                      style={[
                        styles.chronoAdjustButtonText,
                        { color: nc.textStrong },
                      ]}
                    >
                      -
                    </Text>
                  </TouchableOpacity>
                  <Text
                    style={[styles.chronoAdjustValue, { color: nc.textStrong }]}
                  >
                    {Math.round(rightSeconds / 60)} min
                  </Text>
                  <TouchableOpacity
                    style={[
                      styles.chronoAdjustButton,
                      {
                        backgroundColor: nc.backgroundCard,
                        borderColor: nc.border,
                      },
                      isSubmitting && styles.buttonDisabled,
                    ]}
                    onPressIn={() =>
                      handlePressIn(() => setRightSeconds((prev) => prev + 60))
                    }
                    onPressOut={handlePressOut}
                    disabled={isSubmitting}
                  >
                    <Text
                      style={[
                        styles.chronoAdjustButtonText,
                        { color: nc.textStrong },
                      ]}
                    >
                      +
                    </Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <View style={styles.chronoControlRow}>
                  <TouchableOpacity
                    style={[
                      styles.chronoControlButton,
                      {
                        backgroundColor: nc.backgroundCard,
                        borderColor: nc.border,
                      },
                      runningSide === "right" &&
                        styles.chronoControlButtonActive,
                    ]}
                    onPress={() => toggleChrono("right")}
                    disabled={isSubmitting}
                  >
                    <Ionicons
                      name={runningSide === "right" ? "pause" : "play"}
                      size={16}
                      color={runningSide === "right" ? "white" : nc.textStrong}
                    />
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[
                      styles.chronoControlButton,
                      {
                        backgroundColor: nc.backgroundCard,
                        borderColor: nc.border,
                      },
                      rightSeconds === 0 && styles.chronoControlButtonDisabled,
                    ]}
                    onPress={() => resetChrono("right")}
                    disabled={isSubmitting || rightSeconds === 0}
                  >
                    <Ionicons
                      name="refresh"
                      size={16}
                      color={rightSeconds === 0 ? nc.textMuted : nc.textStrong}
                    />
                  </TouchableOpacity>
                </View>
              )}
            </View>
          </View>

          <View style={styles.chronoTotalRow}>
            <Text style={[styles.chronoTotalLabel, { color: nc.textLight }]}>
              Total
            </Text>
            <Text style={[styles.chronoTotalValue, { color: nc.textStrong }]}>
              {formatDuration(totalSeconds)}
            </Text>
          </View>
        </>
      )}

      {/* SOLIDE FORM */}
      {mealType === "solide" && (
        <>
          {/* Type de solide */}
          <Text style={[styles.categoryLabel, { color: nc.textLight }]}>
            Type d&apos;aliment
          </Text>
          <View style={styles.solideTypeGrid}>
            {SOLIDE_TYPE_OPTIONS.map((option) => (
              <TouchableOpacity
                key={option.value}
                style={[
                  styles.solideTypeChip,
                  { backgroundColor: nc.backgroundPressed },
                  typeSolide === option.value && styles.solideTypeChipActive,
                  isSubmitting && styles.chipDisabled,
                ]}
                onPress={() => setTypeSolide(option.value)}
                disabled={isSubmitting}
              >
                <FontAwesome
                  name={option.icon as any}
                  size={14}
                  color={typeSolide === option.value ? "white" : nc.textLight}
                />
                <Text
                  style={[
                    styles.solideTypeChipText,
                    { color: nc.textLight },
                    typeSolide === option.value &&
                      styles.solideTypeChipTextActive,
                  ]}
                >
                  {option.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Moment du repas */}
          <Text style={[styles.categoryLabel, { color: nc.textLight }]}>
            Moment du repas
          </Text>
          <View style={styles.momentRepasGrid}>
            {MOMENT_REPAS_OPTIONS.map((option) => (
              <TouchableOpacity
                key={option.value}
                style={[
                  styles.momentRepasChip,
                  { backgroundColor: nc.backgroundPressed },
                  momentRepas === option.value && styles.momentRepasChipActive,
                  isSubmitting && styles.chipDisabled,
                ]}
                onPress={() => setMomentRepas(option.value)}
                disabled={isSubmitting}
              >
                <FontAwesome
                  name={option.icon as any}
                  size={12}
                  color={momentRepas === option.value ? "white" : nc.textLight}
                />
                <Text
                  style={[
                    styles.momentRepasChipText,
                    { color: nc.textLight },
                    momentRepas === option.value &&
                      styles.momentRepasChipTextActive,
                  ]}
                >
                  {option.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Quantité mangée */}
          <Text style={[styles.categoryLabel, { color: nc.textLight }]}>
            Quantité mangée
          </Text>
          <View style={styles.quantiteSolideRow}>
            {QUANTITE_SOLIDE_OPTIONS.map((option) => (
              <TouchableOpacity
                key={option.value}
                style={[
                  styles.quantiteSolideChip,
                  { backgroundColor: nc.backgroundPressed },
                  quantiteSolide === option.value &&
                    styles.quantiteSolideChipActive,
                  isSubmitting && styles.chipDisabled,
                ]}
                onPress={() => setQuantiteSolide(option.value)}
                disabled={isSubmitting}
              >
                <Text
                  style={[
                    styles.quantiteSolideChipText,
                    { color: nc.textStrong },
                    quantiteSolide === option.value &&
                      styles.quantiteSolideChipTextActive,
                  ]}
                >
                  {option.label}
                </Text>
                <Text
                  style={[
                    styles.quantiteSolideDesc,
                    { color: nc.textMuted },
                    quantiteSolide === option.value &&
                      styles.quantiteSolideDescActive,
                  ]}
                >
                  {option.description}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Ingrédients */}
          <Text style={[styles.categoryLabel, { color: nc.textLight }]}>
            Ingrédients
          </Text>
          <TextInput
            style={[
              styles.ingredientsInput,
              {
                backgroundColor: nc.background,
                borderColor: nc.border,
                color: nc.textStrong,
              },
              isSubmitting && styles.ingredientsInputDisabled,
            ]}
            placeholder="Ex: carottes, pommes de terre..."
            placeholderTextColor={nc.textMuted}
            value={ingredients}
            onChangeText={setIngredients}
            editable={!isSubmitting}
            multiline
          />

          {/* Nouvel aliment (visible uniquement si type = autre) */}
          {typeSolide === "autre" && (
            <>
              <View
                style={[
                  styles.nouveauAlimentRow,
                  nouveauAliment && styles.nouveauAlimentRowActive,
                ]}
              >
                <View style={styles.nouveauAlimentLabel}>
                  <FontAwesome
                    name="star"
                    size={16}
                    color={
                      nouveauAliment ? eventColors.meal.dark : nc.textMuted
                    }
                  />
                  <Text
                    style={[
                      styles.nouveauAlimentText,
                      { color: nc.textLight },
                      nouveauAliment && styles.nouveauAlimentTextActive,
                    ]}
                  >
                    Nouvel aliment ?
                  </Text>
                </View>
                <Switch
                  value={nouveauAliment}
                  onValueChange={setNouveauAliment}
                  disabled={isSubmitting}
                  trackColor={{
                    false: nc.border,
                    true: `${eventColors.meal.dark}80`,
                  }}
                  thumbColor={
                    nouveauAliment ? eventColors.meal.dark : nc.textMuted
                  }
                />
              </View>

              {nouveauAliment && (
                <>
                  <TextInput
                    style={[
                      styles.ingredientsInput,
                      {
                        backgroundColor: nc.background,
                        borderColor: nc.border,
                        color: nc.textStrong,
                      },
                    ]}
                    placeholder="Nom de l'aliment (ex: avocat, fraise...)"
                    placeholderTextColor={nc.textMuted}
                    value={nomNouvelAliment}
                    onChangeText={setNomNouvelAliment}
                    editable={!isSubmitting}
                  />

                  <Text style={[styles.categoryLabel, { color: nc.textLight }]}>
                    Allergènes potentiels
                  </Text>
                  <View style={styles.allergenesGrid}>
                    {ALLERGENES_OPTIONS.map((option) => {
                      const isSelected = allergenes.includes(option.value);
                      return (
                        <TouchableOpacity
                          key={option.value}
                          style={[
                            styles.allergeneChip,
                            {
                              backgroundColor: nc.backgroundPressed,
                              borderColor: nc.border,
                            },
                            isSelected && styles.allergeneChipActive,
                            isSubmitting && styles.chipDisabled,
                          ]}
                          onPress={() => {
                            if (isSelected) {
                              setAllergenes(
                                allergenes.filter((a) => a !== option.value),
                              );
                            } else {
                              setAllergenes([...allergenes, option.value]);
                            }
                          }}
                          disabled={isSubmitting}
                        >
                          <Text style={styles.allergeneEmoji}>
                            {option.emoji}
                          </Text>
                          <Text
                            style={[
                              styles.allergeneText,
                              { color: nc.textLight },
                              isSelected && styles.allergeneTextActive,
                            ]}
                          >
                            {option.label}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>

                  <Text style={[styles.categoryLabel, { color: nc.textLight }]}>
                    Réaction observée
                  </Text>
                  <View style={styles.reactionRow}>
                    {REACTION_OPTIONS.map((option) => (
                      <TouchableOpacity
                        key={option.value}
                        style={[
                          styles.reactionChip,
                          {
                            backgroundColor: nc.backgroundPressed,
                            borderColor: nc.border,
                          },
                          reaction === option.value && {
                            backgroundColor: option.color,
                            borderColor: option.color,
                          },
                          isSubmitting && styles.chipDisabled,
                        ]}
                        onPress={() => setReaction(option.value)}
                        disabled={isSubmitting}
                      >
                        <Text
                          style={[
                            styles.reactionChipText,
                            { color: nc.textLight },
                            reaction === option.value &&
                              styles.reactionChipTextActive,
                          ]}
                        >
                          {option.label}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </>
              )}
            </>
          )}

          {/* A aimé ? */}
          <Text style={[styles.categoryLabel, { color: nc.textLight }]}>
            A aimé ?
          </Text>
          <View style={styles.aimeRow}>
            <TouchableOpacity
              style={[
                styles.aimeButton,
                { backgroundColor: nc.backgroundPressed },
                aime === true && styles.aimeButtonActiveYes,
                isSubmitting && styles.buttonDisabled,
              ]}
              onPress={() => setAime(aime === true ? undefined : true)}
              disabled={isSubmitting}
            >
              <FontAwesome
                name="thumbs-up"
                size={20}
                color={aime === true ? "white" : "#22c55e"}
              />
              <Text
                style={[
                  styles.aimeButtonText,
                  { color: nc.textLight },
                  aime === true && styles.aimeButtonTextActive,
                ]}
              >
                Oui
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.aimeButton,
                { backgroundColor: nc.backgroundPressed },
                aime === false && styles.aimeButtonActiveNo,
                isSubmitting && styles.buttonDisabled,
              ]}
              onPress={() => setAime(aime === false ? undefined : false)}
              disabled={isSubmitting}
            >
              <FontAwesome
                name="thumbs-down"
                size={20}
                color={aime === false ? "white" : "#ef4444"}
              />
              <Text
                style={[
                  styles.aimeButtonText,
                  { color: nc.textLight },
                  aime === false && styles.aimeButtonTextActive,
                ]}
              >
                Non
              </Text>
            </TouchableOpacity>
          </View>
        </>
      )}

      {/* DATE/TIME PICKER */}
      <DateTimeSectionRow
        value={dateHeure}
        onChange={setDateHeure}
        colorScheme={colorScheme}
        disabled={isSubmitting}
        onPickerToggle={onFormStepChange}
      />

      {/* ACTION BUTTONS */}
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
              { backgroundColor: Colors[colorScheme].tint },
              isSubmitting && styles.buttonDisabled,
            ]}
            onPress={handleSubmit}
            disabled={isSubmitting}
            accessibilityLabel={isEditing ? "Enregistrer" : "Ajouter"}
          >
            {isSubmitting ? (
              <ActivityIndicator
                size="small"
                color={nc.white}
              />
            ) : (
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
            )}
          </TouchableOpacity>
        </View>

        {isEditing && onDelete && (
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
}

// ============================================
// STYLES
// ============================================

const styles = StyleSheet.create({
  container: {
    flex: 1,
    gap: 12,
  },
  categoryLabel: {
    fontSize: 12,
    fontWeight: "700",
    marginBottom: 8,
    marginTop: 16,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  typeRow: {
    flexDirection: "row",
    gap: 8,
  },
  typeChip: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 12,
    paddingHorizontal: 8,
    borderRadius: 20,
  },
  typeChipActive: {
    backgroundColor: eventColors.meal.dark,
  },
  typeChipDisabled: {
    opacity: 0.5,
  },
  typeChipText: {
    fontSize: 13,
    fontWeight: "600",
  },
  typeChipTextActive: {
    color: "white",
  },

  // Biberon
  biberonTypeGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 8,
  },
  biberonTypeChip: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 16,
  },
  biberonTypeChipActive: {
    backgroundColor: eventColors.meal.dark,
  },
  biberonTypeChipDisabled: {
    opacity: 0.5,
  },
  biberonTypeChipText: {
    fontSize: 13,
    fontWeight: "500",
  },
  biberonTypeChipTextActive: {
    color: "white",
  },
  chipTextActive: {
    color: "white",
  },
  chipDisabled: {
    opacity: 0.5,
  },

  // Quantity
  quantityRow: {
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
  quantityButtonTextDisabled: {
    opacity: 0.5,
  },
  quantityValue: {
    fontSize: 16,
    fontWeight: "600",
  },

  // Chrono (tétée)
  chronoContainer: {
    flexDirection: "row",
    gap: 12,
    marginBottom: 12,
  },
  chronoCard: {
    flex: 1,
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 10,
    alignItems: "center",
    borderWidth: 1,
  },
  chronoLabel: {
    fontSize: 12,
    fontWeight: "600",
    marginBottom: 6,
  },
  chronoTime: {
    fontSize: 22,
    fontWeight: "700",
    marginBottom: 8,
  },
  chronoControlRow: {
    flexDirection: "row",
    gap: 10,
  },
  chronoControlButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  chronoControlButtonActive: {
    backgroundColor: eventColors.meal.dark,
    borderColor: eventColors.meal.dark,
  },
  chronoControlButtonDisabled: {
    opacity: 0.5,
  },
  chronoAdjustRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  chronoAdjustButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  chronoAdjustButtonDisabled: {
    opacity: 0.6,
  },
  chronoAdjustButtonText: {
    fontSize: 16,
    fontWeight: "700",
  },
  chronoAdjustValue: {
    fontSize: 13,
    fontWeight: "600",
  },
  chronoTotalRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginBottom: 16,
  },
  chronoTotalLabel: {
    fontSize: 13,
    fontWeight: "600",
  },
  chronoTotalValue: {
    fontSize: 16,
    fontWeight: "700",
  },

  // Solide Form Styles
  solideTypeGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 8,
  },
  solideTypeChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 20,
  },
  solideTypeChipActive: {
    backgroundColor: eventColors.meal.dark,
  },
  solideTypeChipDisabled: {
    opacity: 0.5,
  },
  solideTypeChipText: {
    fontSize: 13,
    fontWeight: "600",
  },
  solideTypeChipTextActive: {
    color: "white",
  },

  momentRepasGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 8,
  },
  momentRepasChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 16,
  },
  momentRepasChipActive: {
    backgroundColor: eventColors.meal.dark,
  },
  momentRepasChipDisabled: {
    opacity: 0.5,
  },
  momentRepasChipText: {
    fontSize: 12,
    fontWeight: "500",
  },
  momentRepasChipTextActive: {
    color: "white",
  },

  quantiteSolideRow: {
    flexDirection: "row",
    gap: 10,
    marginBottom: 8,
  },
  quantiteSolideChip: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 12,
    paddingHorizontal: 8,
    borderRadius: 12,
  },
  quantiteSolideChipActive: {
    backgroundColor: eventColors.meal.dark,
  },
  quantiteSolideChipDisabled: {
    opacity: 0.5,
  },
  quantiteSolideChipText: {
    fontSize: 14,
    fontWeight: "600",
  },
  quantiteSolideChipTextActive: {
    color: "white",
  },
  quantiteSolideDesc: {
    fontSize: 10,
    marginTop: 2,
  },
  quantiteSolideDescActive: {
    color: "rgba(255,255,255,0.8)",
  },

  ingredientsInput: {
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 14,
    minHeight: 60,
    textAlignVertical: "top",
    marginBottom: 8,
  },
  ingredientsInputDisabled: {
    opacity: 0.5,
  },

  nouveauAlimentRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 8,
    marginBottom: 8,
  },
  nouveauAlimentRowActive: {},
  nouveauAlimentLabel: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  nouveauAlimentText: {
    fontSize: 14,
    fontWeight: "600",
  },
  nouveauAlimentTextActive: {
    color: eventColors.meal.dark,
  },

  allergenesGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 8,
  },
  allergeneChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 16,
    borderWidth: 1,
  },
  allergeneChipActive: {
    backgroundColor: "#fef3c7",
    borderColor: "#f59e0b",
  },
  allergeneChipDisabled: {
    opacity: 0.5,
  },
  allergeneEmoji: {
    fontSize: 14,
  },
  allergeneText: {
    fontSize: 12,
    fontWeight: "500",
  },
  allergeneTextActive: {
    color: "#92400e",
    fontWeight: "600",
  },

  reactionRow: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 8,
  },
  reactionChip: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderRadius: 12,
    borderWidth: 1,
  },
  reactionChipDisabled: {
    opacity: 0.5,
  },
  reactionChipText: {
    fontSize: 12,
    fontWeight: "500",
  },
  reactionChipTextActive: {
    color: "white",
    fontWeight: "600",
  },

  aimeRow: {
    flexDirection: "row",
    gap: 12,
    marginBottom: 8,
  },
  aimeButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: "transparent",
  },
  aimeButtonActiveYes: {
    backgroundColor: "#22c55e",
    borderColor: "#16a34a",
  },
  aimeButtonActiveNo: {
    backgroundColor: "#ef4444",
    borderColor: "#dc2626",
  },
  aimeButtonDisabled: {
    opacity: 0.5,
  },
  aimeButtonText: {
    fontSize: 14,
    fontWeight: "600",
  },
  aimeButtonTextActive: {
    color: "white",
  },

  // Buttons
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
  textDisabled: {
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
