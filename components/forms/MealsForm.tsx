import { DateTimeSectionRow } from "@/components/ui/DateTimeSectionRow";
import { useRepeatPress } from "@/components/forms/useRepeatPress";
import { getAccentColors } from "@/components/ui/accentColors";
import { getNeutralColors, neutralColors } from "@/constants/dashboardColors";
import {
  ALLERGENES_OPTIONS,
  BIBERON_TYPE_OPTIONS,
  getMomentRepasFromHeure,
  MOMENT_REPAS_OPTIONS,
  QUANTITE_SOLIDE_OPTIONS,
  REACTION_OPTIONS,
  SOLIDE_TYPE_OPTIONS,
} from "@/constants/dashboardConfig";
import { eventColors } from "@/constants/eventColors";
import { useBaby } from "@/contexts/BabyContext";
import { useSheetDeleteWithUndo } from "@/hooks/useSheetDeleteWithUndo";
import { useModal } from "@/contexts/ModalContext";
import { useSuccessAnimation } from "@/contexts/SuccessAnimationContext";
import { useToast } from "@/contexts/ToastContext";
import { useColorScheme } from "@/hooks/use-color-scheme";
import {
  ajouterEvenementOptimistic,
  BiberonEvent,
  modifierEvenementOptimistic,
  SolideEvent,
  supprimerEvenement,
} from "@/services/eventsService";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import FontAwesome from "@expo/vector-icons/FontAwesome6";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  Pressable,
  View,
} from "react-native";
import { toDateOr } from "@/utils/date";
import * as Haptics from "expo-haptics";
import { useFormDirtyGuard } from "@/components/forms/formGuard";
import { SheetFooter } from "@/components/forms/SheetFooter";
import {
  adjustSide,
  clearNursingTimer,
  EMPTY_NURSING_TIMER,
  hasNursingProgress,
  loadLastBottle,
  loadNursingTimer,
  type NursingSide,
  type NursingTimerState,
  proposedMealDate,
  resetSide,
  resolveNursingDraftOnOpen,
  saveLastBottle,
  saveNursingTimer,
  sideSeconds,
  toggleSide,
} from "@/components/forms/nursingTimer";
import {
  NursingDraftBanner,
  NursingElapsedText,
} from "@/components/forms/NursingTimerDisplay";
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

const MAX_BIBERON_ML = 300;
const DEFAULT_BIBERON_ML = 100;
const BIBERON_STEP_ML = 10;
const BIBERON_PRESETS_ML = [60, 90, 120, 150, 180] as const;
export const NURSING_PAUSED_CLOSE_TOAST = "Tétée en pause — reprenez-la depuis l'accueil";

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
  const ripple = usePressRipple();
  const rippleBorderless = { ...ripple, borderless: true };
  const { activeChild } = useBaby();
  const { showAlert } = useModal();
  const deleteFromSheet = useSheetDeleteWithUndo();
  const { showToast } = useToast();
  const { showSuccess } = useSuccessAnimation();
  const colorScheme = useColorScheme() ?? "light";
  const nc = getNeutralColors(colorScheme);
  const accentColors = getAccentColors(eventColors.meal.dark, colorScheme);

  const isEditing = !!editData;

  // Form state
  const [mealType, setMealType] = useState<MealType>(
    editData?.type ?? initialType,
  );
  const [dateHeure, setDateHeure] = useState<Date>(
    editData?.date ? toDateOr(editData.date, new Date()) : new Date(),
  );
  const [dateHeureDirty, setDateHeureDirty] = useState(false);

  // Tetee state : chrono basé sur des horodatages, persisté par enfant (la
  // tétée continue d'être chronométrée si la feuille se ferme).
  const childId = activeChild?.id;
  const [timer, setTimer] = useState<NursingTimerState>(() => ({
    ...EMPTY_NURSING_TIMER,
    leftSeconds: editData?.dureeGauche ? editData.dureeGauche * 60 : 0,
    rightSeconds: editData?.dureeDroite ? editData.dureeDroite * 60 : 0,
  }));
  // Le temps qui défile est affiché par <NursingElapsedText>, qui porte seul
  // son intervalle : ce formulaire ne se re-rend pas à chaque seconde.
  const runningSide = timer.runningSide;
  // Brouillon de tétée trouvé alors que la feuille est ouverte pour un
  // biberon ou un solide : proposé dans un bandeau, jamais imposé.
  const [pendingDraft, setPendingDraft] = useState<NursingTimerState | null>(null);
  const mealTypeRef = useRef(mealType);
  useEffect(() => {
    mealTypeRef.current = mealType;
  }, [mealType]);
  const timerRef = useRef(timer);
  useEffect(() => {
    timerRef.current = timer;
  }, [timer]);
  const timerLoadedRef = useRef(isEditing);
  const submittedRef = useRef(false);

  // Biberon state
  const [quantite, setQuantite] = useState<number>(
    Math.min(editData?.quantite ?? DEFAULT_BIBERON_ML, MAX_BIBERON_ML),
  );
  // Tant que la quantité n'a pas été touchée, elle peut être préremplie avec
  // celle du dernier biberon de l'enfant (chargée de façon asynchrone).
  const initialQuantiteRef = useRef(quantite);
  const quantiteTouchedRef = useRef(isEditing);
  useEffect(() => {
    if (quantite !== initialQuantiteRef.current) quantiteTouchedRef.current = true;
  }, [quantite]);
  const [typeBiberon, setTypeBiberon] = useState<BiberonEvent["typeBiberon"]>(
    editData?.typeBiberon ?? "lait_maternel",
  );

  // Solide state
  const [typeSolide, setTypeSolide] = useState<SolideEvent["typeSolide"]>(
    editData?.typeSolide ?? "puree",
  );
  const [momentRepas, setMomentRepas] = useState<SolideEvent["momentRepas"]>(
    editData?.momentRepas ?? getMomentRepasFromHeure(dateHeure),
  );
  // Tant que l'utilisateur n'a pas choisi un moment lui-même, il suit l'heure
  // du formulaire : saisir un repas oublié à 8h doit proposer petit-déjeuner.
  const [momentRepasDirty, setMomentRepasDirty] = useState(false);
  const [ingredients, setIngredients] = useState(editData?.ingredients ?? "");
  const [quantiteSolide, setQuantiteSolide] = useState<SolideEvent["quantite"]>(
    editData?.quantiteSolide ?? "moyen",
  );
  const hasNewFoodName = Boolean(editData?.nomNouvelAliment?.trim());
  const [nouveauAliment, setNouveauAliment] = useState(
    (editData?.nouveauAliment ?? false) && hasNewFoodName,
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
  const [aime, setAime] = useState<boolean | undefined>(
    typeof editData?.aime === "boolean" ? editData.aime : undefined,
  );

  // +/− : un pas au relâchement, répétition accélérée à l'appui long.
  const repeatPress = useRepeatPress();

  const handleDateHeureChange = useCallback(
    (nextDate: Date) => {
      setDateHeure(nextDate);
      setDateHeureDirty(true);
      if (!editData?.id && !momentRepasDirty) {
        setMomentRepas(getMomentRepasFromHeure(nextDate));
      }
    },
    [editData?.id, momentRepasDirty],
  );

  // ============================================
  // HANDLERS - Chronomètre tétée
  // ============================================

  const updateTimer = useCallback(
    (fn: (state: NursingTimerState, at: number) => NursingTimerState) => {
      const at = Date.now();
      setTimer((prev) => fn(prev, at));
    },
    [],
  );

  const toggleChrono = (side: NursingSide) => {
    const willRun = timer.runningSide !== side;
    Haptics.impactAsync(
      willRun ? Haptics.ImpactFeedbackStyle.Medium : Haptics.ImpactFeedbackStyle.Light,
    ).catch(() => {});
    updateTimer((state, at) => toggleSide(state, side, at));
  };

  // Remise à zéro : jamais d'un seul geste (bouton écarté de lecture/pause et
  // confirmation), pour ne pas perdre un minutage en visant la pause.
  const resetChrono = (side: NursingSide) => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
    showAlert(
      side === "left" ? "Remettre à zéro le côté gauche ?" : "Remettre à zéro le côté droit ?",
      "Le temps compté pour ce côté sera effacé.",
      [
        { text: "Annuler", style: "cancel" },
        {
          text: "Remettre à zéro",
          style: "destructive",
          onPress: () => updateTimer((state, at) => resetSide(state, side, at)),
        },
      ],
    );
  };

  const adjustChrono = (side: NursingSide, deltaSeconds: number) =>
    updateTimer((state, at) => adjustSide(state, side, deltaSeconds, at));

  const pauseChrono = useCallback(() => {
    updateTimer((state, at) =>
      state.runningSide ? toggleSide(state, state.runningSide, at) : state,
    );
  }, [updateTimer]);

  // Quitter la tétée pour un autre type met le chrono en pause (temps conservé).
  useEffect(() => {
    if (mealType !== "tetee" && timerRef.current.runningSide) {
      pauseChrono();
    }
  }, [mealType, pauseChrono]);

  // Reprise d'un chrono laissé en cours (feuille fermée, app relancée) et
  // préremplissage du biberon avec la dernière quantité donnée.
  const [restoredVersion, setRestoredVersion] = useState(0);
  useEffect(() => {
    if (isEditing || !childId) {
      timerLoadedRef.current = true;
      return;
    }
    let cancelled = false;
    Promise.all([loadNursingTimer(childId), loadLastBottle(childId)]).then(
      ([draft, lastBottle]) => {
        if (cancelled) return;
        timerLoadedRef.current = true;
        let restored = false;
        // Le type demandé à l'ouverture est toujours respecté : une feuille
        // ouverte pour un biberon reste sur Biberon, la tétée est proposée
        // dans un bandeau. L'heure n'est jamais modifiée ici (voir
        // proposedMealDate : l'heure de début ne vaut que pour une tétée).
        const opening = resolveNursingDraftOnOpen({
          draft,
          currentType: mealTypeRef.current,
          isEditing,
          formHasProgress: hasNursingProgress(timerRef.current),
        });
        if (opening === "resume" && draft) {
          setTimer(draft);
        } else if (opening === "offer" && draft) {
          setPendingDraft(draft);
        } else if (hasNursingProgress(timerRef.current)) {
          // Un chrono démarré avant la fin du chargement est enregistré tout de suite.
          saveNursingTimer(childId, timerRef.current);
        }
        if (lastBottle && !quantiteTouchedRef.current) {
          setQuantite(Math.min(MAX_BIBERON_ML, Math.max(0, lastBottle.quantite)));
          const lastType = lastBottle.typeBiberon;
          if (lastType && BIBERON_TYPE_OPTIONS.some((o) => o.value === lastType)) {
            setTypeBiberon(lastType as BiberonEvent["typeBiberon"]);
          }
          restored = true;
        }
        if (restored) setRestoredVersion((v) => v + 1);
      },
    );
    return () => {
      cancelled = true;
    };
    // Chargé une seule fois par montage (la feuille est remontée à chaque ouverture).
  }, [isEditing, childId]);

  // Persistance du chrono à chaque changement (nouvelle tétée uniquement).
  useEffect(() => {
    if (isEditing || !childId || !timerLoadedRef.current || submittedRef.current) return;
    saveNursingTimer(childId, timer);
  }, [timer, isEditing, childId]);

  // Feuille fermée avec une tétée non enregistrée : le dire. En marche, le
  // chrono continue ; en pause, le brouillon attend sur l'Accueil (bandeau
  // avec l'heure d'effacement) au lieu de disparaître en silence.
  useEffect(
    () => () => {
      if (isEditing || submittedRef.current) return;
      if (timerRef.current.runningSide) {
        showToast("La tétée reste chronométrée : rouvrez Repas pour la terminer.");
      } else if (hasNursingProgress(timerRef.current)) {
        showToast(NURSING_PAUSED_CLOSE_TOAST, 4000);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  // Reprendre le brouillon proposé dans le bandeau (ou en passant sur Tétée).
  const resumePendingDraft = useCallback(() => {
    if (!pendingDraft) return;
    if (!hasNursingProgress(timerRef.current)) setTimer(pendingDraft);
    setPendingDraft(null);
    setMealType("tetee");
  }, [pendingDraft]);

  const selectMealType = (next: MealType) => {
    if (next === "tetee" && pendingDraft) {
      resumePendingDraft();
      return;
    }
    setMealType(next);
  };

  // Abandonner une tétée lancée par erreur : efface le brouillon (confirmé).
  const discardNursingDraft = useCallback(() => {
    if (!childId) return;
    showAlert(
      "Abandonner la tétée ?",
      "Le temps chronométré sera effacé. Rien n'est enregistré dans le journal.",
      [
        { text: "Garder", style: "cancel" },
        {
          text: "Abandonner",
          style: "destructive",
          onPress: () => {
            setPendingDraft(null);
            setTimer((prev) => (hasNursingProgress(prev) ? EMPTY_NURSING_TIMER : prev));
            clearNursingTimer(childId);
          },
        },
      ],
    );
  }, [childId, showAlert]);

  // Heure proposée : celle du début du chrono pour une tétée (si l'heure n'a
  // pas été choisie), sinon celle du formulaire. Jamais pour un autre type.
  const effectiveDate = proposedMealDate({
    mealType,
    timer,
    dateTouched: dateHeureDirty || isEditing,
    fallback: dateHeure,
  });

  // Garde-fou de saisie : seules les valeurs saisies comptent. Le type de
  // repas (onglet) n'en fait pas partie, et l'heure n'est « modifiée » que si
  // l'utilisateur l'a choisie. En création, le chrono n'en fait pas partie
  // non plus : il est déjà sauvegardé et repris à la réouverture.
  const { resetBaseline } = useFormDirtyGuard({
    // En édition, changer le type change vraiment l'événement enregistré.
    mealType: isEditing ? mealType : undefined,
    dateHeureDirty,
    quantite,
    typeBiberon,
    typeSolide,
    momentRepas,
    ingredients,
    quantiteSolide,
    nouveauAliment,
    nomNouvelAliment,
    allergenes,
    reaction,
    aime,
    leftSeconds: isEditing ? timer.leftSeconds : 0,
    rightSeconds: isEditing ? timer.rightSeconds : 0,
  });
  useEffect(() => {
    if (restoredVersion > 0) resetBaseline();
  }, [restoredVersion, resetBaseline]);

  // ============================================
  // SUBMIT / DELETE
  // ============================================

  const handleSubmit = () => {
    if (!activeChild?.id || isSubmitting) return;

    setIsSubmitting(true);

    const dateToSave = !isEditing || dateHeureDirty ? effectiveDate : undefined;

    if (mealType === "tetee") {
      // Temps figé à l'instant de l'envoi (le côté en cours compris).
      const at = Date.now();
      const finalLeft = sideSeconds(timer, "left", at);
      const finalRight = sideSeconds(timer, "right", at);
      const leftMinutes = Math.round(finalLeft / 60);
      const rightMinutes = Math.round(finalRight / 60);
      const dataToSave = removeUndefined({
        type: mealType,
        quantite: null,
        coteGauche: finalLeft > 0,
        coteDroit: finalRight > 0,
        dureeGauche: leftMinutes > 0 ? leftMinutes : undefined,
        dureeDroite: rightMinutes > 0 ? rightMinutes : undefined,
        date: dateToSave,
      });

      if (isEditing && editData?.id) {
        modifierEvenementOptimistic(
          activeChild.id,
          editData.id,
          dataToSave,
          editData,
        );
        showSuccess("meal", "Tétée modifiée");
      } else {
        ajouterEvenementOptimistic(activeChild.id, dataToSave);
        showSuccess("meal", "Tétée enregistrée");
        submittedRef.current = true;
        clearNursingTimer(activeChild.id);
      }
    } else if (mealType === "biberon") {
      const dataToSave = removeUndefined({
        type: mealType,
        quantite,
        typeBiberon,
        date: dateToSave,
      });

      if (isEditing && editData?.id) {
        modifierEvenementOptimistic(
          activeChild.id,
          editData.id,
          dataToSave,
          editData,
        );
        showSuccess("meal", "Biberon modifié");
      } else {
        ajouterEvenementOptimistic(activeChild.id, dataToSave);
        showSuccess("meal", "Biberon enregistré");
        saveLastBottle(activeChild.id, { quantite, typeBiberon });
      }
    } else if (mealType === "solide") {
      const trimmedIngredients = ingredients.trim();
      const trimmedNomNouvelAliment = nomNouvelAliment.trim();

      if (nouveauAliment && !trimmedNomNouvelAliment) {
        showAlert("Erreur", "Indiquez le nouvel aliment introduit.");
        setIsSubmitting(false);
        return;
      }

      const dataToSave = removeUndefined({
        type: mealType,
        typeSolide,
        momentRepas,
        ingredients:
          trimmedIngredients || (isEditing ? null : undefined),
        quantite: quantiteSolide,
        nouveauAliment,
        nomNouvelAliment: nouveauAliment
          ? trimmedNomNouvelAliment
          : isEditing
            ? null
            : undefined,
        allergenes:
          nouveauAliment && allergenes.length > 0
            ? allergenes
            : isEditing
              ? null
              : undefined,
        reaction: nouveauAliment
          ? reaction
          : isEditing
            ? null
            : undefined,
        aime: aime ?? (editData ? null : undefined),
        date: dateToSave,
      });

      if (isEditing && editData?.id) {
        modifierEvenementOptimistic(
          activeChild.id,
          editData.id,
          dataToSave as any,
          editData,
        );
        showSuccess("meal", "Repas solide modifié");
      } else {
        ajouterEvenementOptimistic(activeChild.id, dataToSave);
        showSuccess("meal", "Repas solide enregistré");
      }
    }

    setIsSubmitting(false);
    onSuccess();
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
        editData.type === "tetee"
          ? "Tétée supprimée"
          : editData.type === "biberon"
            ? "Biberon supprimé"
            : editData.type === "solide"
              ? "Repas solide supprimé"
              : "Repas supprimé",
      run: () => supprimerEvenement(childId, id),
      close: onDelete,
    });
  };

  // ============================================
  // RENDER
  // ============================================

  return (
    <View style={styles.container}>
      {/* Tétée en cours alors que la feuille est ouverte pour autre chose. */}
      {pendingDraft && mealType !== "tetee" && (
        <NursingDraftBanner
          draft={pendingDraft}
          colors={{
            background: accentColors.softBg,
            border: accentColors.softBorder,
            text: nc.textStrong,
            actionText: accentColors.softText,
            mutedText: nc.textNormal, // ≥ 4.5:1 sur softBg (textLight : 4,21:1)
          }}
          onResume={resumePendingDraft}
          onDiscard={discardNursingDraft}
          disabled={isSubmitting}
        />
      )}

      {/* Type selector */}
      <Text style={[styles.categoryLabel, { color: nc.textLight }]}>
        Type de repas
      </Text>
      <View style={styles.typeRow}>
        <Pressable
          android_ripple={ripple}
          style={({ pressed }) => [
            styles.typeChip,
            { backgroundColor: nc.background, borderColor: nc.border },
            mealType === "tetee" && {
              backgroundColor: accentColors.softBg,
              borderColor: accentColors.softBorder,
            },
            isSubmitting && styles.typeChipDisabled,
            pressedOpacity(pressed, 0.2),
          ]}
          onPress={() => selectMealType("tetee")}
          disabled={isSubmitting}
          accessibilityLabel="Type tétée"
          accessibilityRole="button"
          accessibilityState={{
            selected: mealType === "tetee",
            disabled: isSubmitting,
          }}
        >
          <FontAwesome
            name="person-breastfeeding"
            size={16}
            color={mealType === "tetee" ? accentColors.softText : nc.textLight}
          />
          <Text
            style={[
              styles.typeChipText,
              { color: nc.textLight },
              mealType === "tetee" && styles.typeChipTextActive,
              mealType === "tetee" && { color: accentColors.softText },
            ]}
          >
            Tétée
          </Text>
        </Pressable>

        <Pressable
          android_ripple={ripple}
          style={({ pressed }) => [
            styles.typeChip,
            { backgroundColor: nc.background, borderColor: nc.border },
            mealType === "biberon" && {
              backgroundColor: accentColors.softBg,
              borderColor: accentColors.softBorder,
            },
            isSubmitting && styles.typeChipDisabled,
            pressedOpacity(pressed, 0.2),
          ]}
          onPress={() => {
            selectMealType("biberon");
          }}
          disabled={isSubmitting}
          accessibilityLabel="Type biberon"
          accessibilityRole="button"
          accessibilityState={{
            selected: mealType === "biberon",
            disabled: isSubmitting,
          }}
        >
          <MaterialCommunityIcons
            name="baby-bottle"
            size={18}
            color={mealType === "biberon" ? accentColors.softText : nc.textLight}
          />
          <Text
            style={[
              styles.typeChipText,
              { color: nc.textLight },
              mealType === "biberon" && styles.typeChipTextActive,
              mealType === "biberon" && { color: accentColors.softText },
            ]}
          >
            Biberon
          </Text>
        </Pressable>

        <Pressable
          android_ripple={ripple}
          style={({ pressed }) => [
            styles.typeChip,
            { backgroundColor: nc.background, borderColor: nc.border },
            mealType === "solide" && {
              backgroundColor: accentColors.softBg,
              borderColor: accentColors.softBorder,
            },
            isSubmitting && styles.typeChipDisabled,
            pressedOpacity(pressed, 0.2),
          ]}
          onPress={() => {
            selectMealType("solide");
          }}
          disabled={isSubmitting}
          accessibilityLabel="Type solide"
          accessibilityRole="button"
          accessibilityState={{
            selected: mealType === "solide",
            disabled: isSubmitting,
          }}
        >
          <FontAwesome
            name="bowl-food"
            size={16}
            color={mealType === "solide" ? accentColors.softText : nc.textLight}
          />
          <Text
            style={[
              styles.typeChipText,
              { color: nc.textLight },
              mealType === "solide" && styles.typeChipTextActive,
              mealType === "solide" && { color: accentColors.softText },
            ]}
          >
            Solide
          </Text>
        </Pressable>
      </View>

      {/* BIBERON FORM */}
      {mealType === "biberon" && (
        <>
          <Text style={[styles.categoryLabel, { color: nc.textLight }]}>
            Type de biberon
          </Text>
          <View style={styles.biberonTypeGrid}>
            {BIBERON_TYPE_OPTIONS.map((option) => (
              <Pressable
                android_ripple={ripple}
                key={option.value}
                style={({ pressed }) => [
                  styles.biberonTypeChip,
                  { backgroundColor: nc.background, borderColor: nc.border },
                  typeBiberon === option.value && {
                    backgroundColor: accentColors.softBg,
                    borderColor: accentColors.softBorder,
                  },
                  isSubmitting && styles.chipDisabled,
                  pressedOpacity(pressed, 0.2),
                ]}
                onPress={() => setTypeBiberon(option.value)}
                disabled={isSubmitting}
                accessibilityLabel={`Type ${option.label}`}
                accessibilityRole="button"
                accessibilityState={{
                  selected: typeBiberon === option.value,
                  disabled: isSubmitting,
                }}
                hitSlop={8}
              >
                <Text
                  style={[
                    styles.biberonTypeChipText,
                    { color: nc.textLight },
                    typeBiberon === option.value &&
                      styles.biberonTypeChipTextActive,
                    typeBiberon === option.value && {
                      color: accentColors.softText,
                    },
                  ]}
                >
                  {option.label}
                </Text>
              </Pressable>
            ))}
          </View>

          <Text style={[styles.categoryLabel, { color: nc.textLight }]}>
            Quantité
          </Text>
          <View style={styles.quantityRow}>
            <Pressable
              android_ripple={ripple}
              style={({ pressed }) => [
                styles.quantityButton,
                { backgroundColor: nc.backgroundPressed },
                (isSubmitting || quantite <= 0) && styles.buttonDisabled,
                pressedOpacity(pressed, 0.2),
              ]}
              {...repeatPress(() =>
                setQuantite((q) => Math.max(0, q - BIBERON_STEP_ML)),
              )}
              disabled={isSubmitting || quantite <= 0}
              accessibilityRole="button"
              accessibilityLabel={`Retirer ${BIBERON_STEP_ML} ml`}
              accessibilityState={{ disabled: isSubmitting || quantite <= 0 }}
            >
              <Text
                style={[styles.quantityButtonText, { color: nc.textStrong }]}
              >
                −
              </Text>
            </Pressable>
            <Text
              style={[styles.quantityValue, { color: nc.textStrong }]}
              accessible
              accessibilityRole="adjustable"
              accessibilityLabel="Quantité du biberon"
              accessibilityValue={{ text: `${quantite} millilitres` }}
              accessibilityActions={[
                { name: "increment", label: "Augmenter" },
                { name: "decrement", label: "Diminuer" },
              ]}
              onAccessibilityAction={(event) => {
                if (isSubmitting) return;
                if (event.nativeEvent.actionName === "increment") {
                  setQuantite((q) => Math.min(MAX_BIBERON_ML, q + BIBERON_STEP_ML));
                } else if (event.nativeEvent.actionName === "decrement") {
                  setQuantite((q) => Math.max(0, q - BIBERON_STEP_ML));
                }
              }}
            >
              {quantite} ml
            </Text>
            <Pressable
              android_ripple={ripple}
              style={({ pressed }) => [
                styles.quantityButton,
                { backgroundColor: nc.backgroundPressed },
                quantite >= MAX_BIBERON_ML && styles.quantityButtonDisabled,
                isSubmitting && styles.buttonDisabled,
                pressedOpacity(pressed, 0.2),
              ]}
              {...repeatPress(() =>
                setQuantite((q) => Math.min(MAX_BIBERON_ML, q + BIBERON_STEP_ML)),
              )}
              disabled={isSubmitting || quantite >= MAX_BIBERON_ML}
              accessibilityRole="button"
              accessibilityLabel={`Ajouter ${BIBERON_STEP_ML} ml`}
              accessibilityState={{
                disabled: isSubmitting || quantite >= MAX_BIBERON_ML,
              }}
            >
              <Text
                style={[styles.quantityButtonText, { color: nc.textStrong }]}
              >
                +
              </Text>
            </Pressable>
          </View>
          {/* Quantités courantes : un seul toucher au lieu de dix appuis. */}
          <View style={styles.presetRow}>
            {BIBERON_PRESETS_ML.map((preset) => {
              const selected = quantite === preset;
              return (
                <Pressable
                  android_ripple={ripple}
                  key={preset}
                  style={({ pressed }) => [
                    styles.presetChip,
                    { backgroundColor: nc.background, borderColor: nc.border },
                    selected && {
                      backgroundColor: accentColors.softBg,
                      borderColor: accentColors.softBorder,
                    },
                    isSubmitting && styles.chipDisabled,
                    pressedOpacity(pressed, 0.2),
                  ]}
                  onPress={() => setQuantite(preset)}
                  disabled={isSubmitting}
                  accessibilityRole="button"
                  accessibilityLabel={`${preset} ml`}
                  accessibilityState={{ selected, disabled: isSubmitting }}
                >
                  <Text
                    style={[
                      styles.presetChipText,
                      { color: selected ? accentColors.softText : nc.textNormal },
                    ]}
                  >
                    {preset}
                  </Text>
                </Pressable>
              );
            })}
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
            {(["left", "right"] as const).map((side) => {
              const sideLabel = side === "left" ? "gauche" : "droit";
              // Temps figé (hors segment en cours) : suffit pour les libellés et
              // l'état des boutons, sans dépendre de l'horloge qui défile.
              const countedSeconds = side === "left" ? timer.leftSeconds : timer.rightSeconds;
              const isRunning = runningSide === side;
              const hasTime = countedSeconds > 0 || isRunning;
              // Édition : le chrono ne tourne pas, le temps figé est le temps affiché.
              const minutes = Math.round(countedSeconds / 60);
              return (
                <View
                  key={side}
                  style={[
                    styles.chronoCard,
                    { backgroundColor: nc.background, borderColor: nc.border },
                    isRunning && { borderColor: accentColors.softBorder },
                  ]}
                >
                  <Text style={[styles.chronoLabel, { color: nc.textLight }]}>
                    {side === "left" ? "Gauche" : "Droit"}
                  </Text>
                  <NursingElapsedText
                    timer={timer}
                    side={side}
                    style={[styles.chronoTime, { color: nc.textStrong }]}
                    a11yPrefix={`Côté ${sideLabel}`}
                  />
                  {isEditing ? (
                    <View style={styles.chronoAdjustRow}>
                      <Pressable
                        android_ripple={ripple}
                        style={({ pressed }) => [
                          styles.chronoAdjustButton,
                          {
                            backgroundColor: nc.backgroundCard,
                            borderColor: nc.border,
                          },
                          isSubmitting && styles.buttonDisabled,
                          pressedOpacity(pressed, 0.2),
                        ]}
                        {...repeatPress(() => adjustChrono(side, -60))}
                        disabled={isSubmitting}
                        accessibilityRole="button"
                        accessibilityLabel={`Retirer une minute au côté ${sideLabel}`}
                        accessibilityState={{ disabled: isSubmitting }}
                      >
                        <Text
                          style={[
                            styles.chronoAdjustButtonText,
                            { color: nc.textStrong },
                          ]}
                        >
                          −
                        </Text>
                      </Pressable>
                      <Text
                        style={[styles.chronoAdjustValue, { color: nc.textStrong }]}
                      >
                        {minutes} min
                      </Text>
                      <Pressable
                        android_ripple={ripple}
                        style={({ pressed }) => [
                          styles.chronoAdjustButton,
                          {
                            backgroundColor: nc.backgroundCard,
                            borderColor: nc.border,
                          },
                          isSubmitting && styles.buttonDisabled,
                          pressedOpacity(pressed, 0.2),
                        ]}
                        {...repeatPress(() => adjustChrono(side, 60))}
                        disabled={isSubmitting}
                        accessibilityRole="button"
                        accessibilityLabel={`Ajouter une minute au côté ${sideLabel}`}
                        accessibilityState={{ disabled: isSubmitting }}
                      >
                        <Text
                          style={[
                            styles.chronoAdjustButtonText,
                            { color: nc.textStrong },
                          ]}
                        >
                          +
                        </Text>
                      </Pressable>
                    </View>
                  ) : (
                    <View style={styles.chronoControlRow}>
                      {/* Lecture / pause : grande cible, seule action principale. */}
                      <Pressable
                        android_ripple={ripple}
                        style={({ pressed }) => [
                          styles.chronoControlButton,
                          {
                            backgroundColor: nc.backgroundCard,
                            borderColor: nc.border,
                          },
                          isRunning && {
                            backgroundColor: accentColors.softBg,
                            borderColor: accentColors.softBorder,
                          },
                          pressedOpacity(pressed, 0.2),
                        ]}
                        onPress={() => toggleChrono(side)}
                        disabled={isSubmitting}
                        hitSlop={6}
                        accessibilityRole="button"
                        accessibilityLabel={
                          isRunning
                            ? `Mettre en pause le côté ${sideLabel}`
                            : countedSeconds > 0
                              ? `Reprendre le côté ${sideLabel}`
                              : `Démarrer le côté ${sideLabel}`
                        }
                        accessibilityState={{
                          selected: isRunning,
                          disabled: isSubmitting,
                        }}
                      >
                        <Ionicons
                          name={isRunning ? "pause" : "play"}
                          size={24}
                          color={isRunning ? accentColors.softText : nc.textStrong}
                        />
                      </Pressable>
                      {/* Remise à zéro : petite, écartée, et confirmée. */}
                      <Pressable
                        android_ripple={rippleBorderless}
                        style={({ pressed }) => [
                          styles.chronoResetButton,
                          !hasTime && styles.chronoControlButtonDisabled,
                          pressedOpacity(pressed, 0.2),
                        ]}
                        onPress={() => resetChrono(side)}
                        disabled={isSubmitting || !hasTime}
                        accessibilityRole="button"
                        accessibilityLabel={`Remettre à zéro le côté ${sideLabel}`}
                        accessibilityHint="Demande une confirmation"
                        accessibilityState={{
                          disabled: isSubmitting || !hasTime,
                        }}
                      >
                        <Ionicons
                          name="refresh"
                          size={18}
                          color={!hasTime ? nc.textMuted : nc.textLight}
                        />
                      </Pressable>
                    </View>
                  )}
                </View>
              );
            })}
          </View>

          <View style={styles.chronoTotalRow}>
            <Text style={[styles.chronoTotalLabel, { color: nc.textLight }]}>
              Total
            </Text>
            <NursingElapsedText
              timer={timer}
              style={[styles.chronoTotalValue, { color: nc.textStrong }]}
              a11yPrefix="Durée totale"
            />
          </View>
          {!isEditing && runningSide && (
            <Text style={[styles.chronoHint, { color: nc.textLight }]}>
              Le chrono continue même si vous fermez cette fenêtre.
            </Text>
          )}
          {/* Tétée lancée par erreur : on peut l'abandonner (confirmé). */}
          {!isEditing && hasNursingProgress(timer) && (
            <Pressable
              android_ripple={ripple}
              style={({ pressed }) => [styles.chronoDiscardButton, pressedOpacity(pressed, 0.2)]}
              onPress={discardNursingDraft}
              disabled={isSubmitting}
              accessibilityRole="button"
              accessibilityLabel="Abandonner la tétée"
              accessibilityHint="Efface le chrono, demande une confirmation"
              accessibilityState={{ disabled: isSubmitting }}
            >
              <Text style={[styles.chronoDiscardText, { color: nc.textLight }]}>
                Abandonner la tétée
              </Text>
            </Pressable>
          )}
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
              <Pressable
                android_ripple={ripple}
                key={option.value}
                style={({ pressed }) => [
                  styles.solideTypeChip,
                  { backgroundColor: nc.background, borderColor: nc.border },
                  typeSolide === option.value && {
                    backgroundColor: accentColors.softBg,
                    borderColor: accentColors.softBorder,
                  },
                  isSubmitting && styles.chipDisabled,
                  pressedOpacity(pressed, 0.2),
                ]}
                onPress={() => setTypeSolide(option.value)}
                disabled={isSubmitting}
                accessibilityLabel={`Type ${option.label}`}
                accessibilityRole="button"
                accessibilityState={{
                  selected: typeSolide === option.value,
                  disabled: isSubmitting,
                }}
              >
                <FontAwesome
                  name={option.icon as any}
                  size={14}
                  color={
                    typeSolide === option.value
                      ? accentColors.softText
                      : nc.textLight
                  }
                />
                <Text
                  style={[
                    styles.solideTypeChipText,
                    { color: nc.textLight },
                    typeSolide === option.value &&
                      styles.solideTypeChipTextActive,
                    typeSolide === option.value && {
                      color: accentColors.softText,
                    },
                  ]}
                >
                  {option.label}
                </Text>
              </Pressable>
            ))}
          </View>

          {/* Moment du repas */}
          <Text style={[styles.categoryLabel, { color: nc.textLight }]}>
            Moment du repas
          </Text>
          <View style={styles.momentRepasGrid}>
            {MOMENT_REPAS_OPTIONS.map((option) => (
              <Pressable
                android_ripple={ripple}
                key={option.value}
                style={({ pressed }) => [
                  styles.momentRepasChip,
                  { backgroundColor: nc.background, borderColor: nc.border },
                  momentRepas === option.value && {
                    backgroundColor: accentColors.softBg,
                    borderColor: accentColors.softBorder,
                  },
                  isSubmitting && styles.chipDisabled,
                  pressedOpacity(pressed, 0.2),
                ]}
                onPress={() => {
                  setMomentRepas(option.value);
                  setMomentRepasDirty(true);
                }}
                disabled={isSubmitting}
                accessibilityLabel={`Moment ${option.label}`}
                accessibilityRole="button"
                accessibilityState={{
                  selected: momentRepas === option.value,
                  disabled: isSubmitting,
                }}
              >
                <FontAwesome
                  name={option.icon as any}
                  size={12}
                  color={
                    momentRepas === option.value
                      ? accentColors.softText
                      : nc.textLight
                  }
                />
                <Text
                  style={[
                    styles.momentRepasChipText,
                    { color: nc.textLight },
                    momentRepas === option.value &&
                      styles.momentRepasChipTextActive,
                    momentRepas === option.value && {
                      color: accentColors.softText,
                    },
                  ]}
                >
                  {option.label}
                </Text>
              </Pressable>
            ))}
          </View>

          {/* Quantité mangée */}
          <Text style={[styles.categoryLabel, { color: nc.textLight }]}>
            Quantité mangée
          </Text>
          <View style={styles.quantiteSolideRow}>
            {QUANTITE_SOLIDE_OPTIONS.map((option) => (
              <Pressable
                android_ripple={ripple}
                key={option.value}
                style={({ pressed }) => [
                  styles.quantiteSolideChip,
                  { backgroundColor: nc.background, borderColor: nc.border },
                  quantiteSolide === option.value && {
                    backgroundColor: accentColors.softBg,
                    borderColor: accentColors.softBorder,
                  },
                  isSubmitting && styles.chipDisabled,
                  pressedOpacity(pressed, 0.2),
                ]}
                onPress={() => setQuantiteSolide(option.value)}
                disabled={isSubmitting}
                accessibilityLabel={`Quantité ${option.label}`}
                accessibilityRole="button"
                accessibilityState={{
                  selected: quantiteSolide === option.value,
                  disabled: isSubmitting,
                }}
              >
                <Text
                  style={[
                    styles.quantiteSolideChipText,
                    { color: nc.textStrong },
                    quantiteSolide === option.value &&
                      styles.quantiteSolideChipTextActive,
                    quantiteSolide === option.value && {
                      color: accentColors.softText,
                    },
                  ]}
                >
                  {option.label}
                </Text>
                <Text
                  style={[
                    styles.quantiteSolideDesc,
                    { color: nc.textLight },
                    quantiteSolide === option.value &&
                      styles.quantiteSolideDescActive,
                    quantiteSolide === option.value && {
                      color: accentColors.softText,
                    },
                  ]}
                >
                  {option.description}
                </Text>
              </Pressable>
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
            maxLength={500}
          />

          {/* Nouvel aliment */}
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
                color={nouveauAliment ? eventColors.meal.dark : nc.textMuted}
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
              thumbColor={nouveauAliment ? eventColors.meal.dark : nc.textMuted}
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
                  isSubmitting && styles.ingredientsInputDisabled,
                ]}
                placeholder="Nom de l'aliment (ex: avocat, fraise, poire...)"
                placeholderTextColor={nc.textMuted}
                value={nomNouvelAliment}
                onChangeText={setNomNouvelAliment}
                editable={!isSubmitting}
                maxLength={100}
              />

              <Text style={[styles.categoryLabel, { color: nc.textLight }]}>
                Allergènes potentiels
              </Text>
              <View style={styles.allergenesGrid}>
                {ALLERGENES_OPTIONS.map((option) => {
                  const isSelected = allergenes.includes(option.value);
                  return (
                    <Pressable
                      android_ripple={ripple}
                      key={option.value}
                      style={({ pressed }) => [
                        styles.allergeneChip,
                        {
                          backgroundColor: nc.backgroundPressed,
                          borderColor: nc.border,
                        },
                        isSelected && styles.allergeneChipActive,
                        isSubmitting && styles.chipDisabled,
                        pressedOpacity(pressed, 0.2),
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
                      accessibilityLabel={`Allergène ${option.label}`}
                      accessibilityRole="button"
                      accessibilityState={{
                        selected: isSelected,
                        disabled: isSubmitting,
                      }}
                    >
                      <Text style={styles.allergeneEmoji}>{option.emoji}</Text>
                      <Text
                        style={[
                          styles.allergeneText,
                          { color: nc.textLight },
                          isSelected && styles.allergeneTextActive,
                        ]}
                      >
                        {option.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>

              <Text style={[styles.categoryLabel, { color: nc.textLight }]}>
                Réaction observée
              </Text>
              <View style={styles.reactionRow}>
                {REACTION_OPTIONS.map((option) => (
                  <Pressable
                    android_ripple={ripple}
                    key={option.value}
                    style={({ pressed }) => [
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
                      pressedOpacity(pressed, 0.2),
                    ]}
                    onPress={() => setReaction(option.value)}
                    disabled={isSubmitting}
                    accessibilityLabel={`Réaction ${option.label}`}
                    accessibilityRole="button"
                    accessibilityState={{
                      selected: reaction === option.value,
                      disabled: isSubmitting,
                    }}
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
                  </Pressable>
                ))}
              </View>
            </>
          )}

          {/* A aimé ? */}
          <Text style={[styles.categoryLabel, { color: nc.textLight }]}>
            A aimé ?
          </Text>
          <View style={styles.aimeRow}>
            <Pressable
              android_ripple={ripple}
              style={({ pressed }) => [
                styles.aimeButton,
                { backgroundColor: nc.backgroundPressed },
                aime === true && styles.aimeButtonActiveYes,
                isSubmitting && styles.buttonDisabled,
                pressedOpacity(pressed, 0.2),
              ]}
              onPress={() => setAime(aime === true ? undefined : true)}
              disabled={isSubmitting}
              accessibilityLabel="A aimé ce plat"
              accessibilityRole="button"
              accessibilityState={{
                selected: aime === true,
                disabled: isSubmitting,
              }}
            >
              <FontAwesome
                name="thumbs-up"
                size={20}
                color={aime === true ? "white" : nc.successText}
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
            </Pressable>
            <Pressable
              android_ripple={ripple}
              style={({ pressed }) => [
                styles.aimeButton,
                { backgroundColor: nc.backgroundPressed },
                aime === false && styles.aimeButtonActiveNo,
                isSubmitting && styles.buttonDisabled,
                pressedOpacity(pressed, 0.2),
              ]}
              onPress={() => setAime(aime === false ? undefined : false)}
              disabled={isSubmitting}
              accessibilityLabel="N'a pas aimé ce plat"
              accessibilityRole="button"
              accessibilityState={{
                selected: aime === false,
                disabled: isSubmitting,
              }}
            >
              <FontAwesome
                name="thumbs-down"
                size={20}
                color={aime === false ? "white" : nc.errorText}
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
            </Pressable>
          </View>
        </>
      )}

      {/* DATE/TIME PICKER */}
      <DateTimeSectionRow
        value={effectiveDate}
        onChange={handleDateHeureChange}
        colorScheme={colorScheme}
        disabled={isSubmitting}
        onPickerToggle={onFormStepChange}
        // Un repas, une couche ou un tirage ne se saisit pas au futur : évite
        // un mauvais jour choisi d'un pouce ensommeillé.
        maximumDate={new Date()}
      />

      {/* ACTION BUTTONS */}
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
              <ActivityIndicator size="small" color={accentColors.filledText} />
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
            <FontAwesome name="trash" size={14} color={nc.error} />
            <Text style={[styles.deleteText, { color: nc.errorText }]}>
              Supprimer
            </Text>
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
    ...RIPPLE_CLIP,
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 12,
    paddingHorizontal: 8,
    borderRadius: 20,
    borderWidth: 1,
  },
  typeChipDisabled: {
    opacity: 0.5,
  },
  typeChipText: {
    fontSize: 13,
    fontWeight: "600",
    textAlign: "center",
  },
  typeChipTextActive: {
    fontWeight: "700",
  },

  // Biberon
  biberonTypeGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 8,
  },
  biberonTypeChip: {
    ...RIPPLE_CLIP,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 16,
    borderWidth: 1,
  },
  biberonTypeChipDisabled: {
    opacity: 0.5,
  },
  biberonTypeChipText: {
    fontSize: 13,
    fontWeight: "500",
    textAlign: "center",
  },
  biberonTypeChipTextActive: {
    fontWeight: "700",
  },
  chipTextActive: {
    fontWeight: "700",
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
    ...RIPPLE_CLIP,
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
  quantityButtonTextDisabled: {
    opacity: 0.5,
  },
  quantityValue: {
    fontSize: 20,
    fontWeight: "700",
    minWidth: 80,
    textAlign: "center",
  },
  presetRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    gap: 8,
    marginBottom: 8,
  },
  presetChip: {
    ...RIPPLE_CLIP,
    minWidth: 52,
    minHeight: 44,
    paddingHorizontal: 12,
    borderRadius: 22,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  presetChipText: {
    fontSize: 15,
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
    alignItems: "center",
    // Remise à zéro écartée du bouton lecture/pause.
    gap: 20,
  },
  chronoControlButton: {
    ...RIPPLE_CLIP,
    width: 56,
    height: 56,
    borderRadius: 28,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  chronoResetButton: {
    ...RIPPLE_CLIP,
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
  },
  chronoHint: {
    fontSize: 13,
    textAlign: "center",
  },
  chronoDiscardButton: {
    alignSelf: "center",
    minHeight: 44,
    paddingHorizontal: 16,
    justifyContent: "center",
  },
  chronoDiscardText: {
    fontSize: 14,
    fontWeight: "600",
    textDecorationLine: "underline",
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
    ...RIPPLE_CLIP,
    width: 44,
    height: 44,
    borderRadius: 22,
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
    ...RIPPLE_CLIP,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 20,
    borderWidth: 1,
  },
  solideTypeChipDisabled: {
    opacity: 0.5,
  },
  solideTypeChipText: {
    fontSize: 13,
    fontWeight: "600",
    textAlign: "center",
  },
  solideTypeChipTextActive: {
    fontWeight: "700",
  },

  momentRepasGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 8,
  },
  momentRepasChip: {
    ...RIPPLE_CLIP,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 16,
    borderWidth: 1,
  },
  momentRepasChipDisabled: {
    opacity: 0.5,
  },
  momentRepasChipText: {
    fontSize: 12,
    fontWeight: "500",
    textAlign: "center",
  },
  momentRepasChipTextActive: {
    fontWeight: "700",
  },

  quantiteSolideRow: {
    flexDirection: "row",
    gap: 10,
    marginBottom: 8,
  },
  quantiteSolideChip: {
    ...RIPPLE_CLIP,
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 12,
    paddingHorizontal: 8,
    borderRadius: 12,
    borderWidth: 1,
  },
  quantiteSolideChipDisabled: {
    opacity: 0.5,
  },
  quantiteSolideChipText: {
    width: "100%",
    fontSize: 14,
    fontWeight: "600",
    textAlign: "center",
  },
  quantiteSolideChipTextActive: {
    fontWeight: "700",
  },
  quantiteSolideDesc: {
    width: "100%",
    fontSize: 12,
    marginTop: 2,
    textAlign: "center",
  },
  quantiteSolideDescActive: {
    fontWeight: "600",
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
    ...RIPPLE_CLIP,
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
    ...RIPPLE_CLIP,
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderRadius: 12,
    borderWidth: 1,
  },
  reactionChipDisabled: {
    opacity: 0.5,
  },
  reactionChipText: {
    width: "100%",
    fontSize: 12,
    fontWeight: "500",
    textAlign: "center",
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
    ...RIPPLE_CLIP,
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
  // Aplats sous texte blanc : green-700 (5.02:1) et destructive red-600 (4.83:1).
  aimeButtonActiveYes: {
    backgroundColor: "#15803d",
    borderColor: "#166534",
  },
  aimeButtonActiveNo: {
    backgroundColor: neutralColors.destructive,
    borderColor: "#b91c1c",
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
