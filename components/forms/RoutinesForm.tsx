// components/forms/RoutinesForm.tsx
import { Colors } from "@/constants/theme";
import { getNeutralColors } from "@/constants/dashboardColors";
import { useBaby } from "@/contexts/BabyContext";
import { useModal } from "@/contexts/ModalContext";
import { useSuccessAnimation } from "@/contexts/SuccessAnimationContext";
import { useToast } from "@/contexts/ToastContext";
import { useColorScheme } from "@/hooks/use-color-scheme";
import {
  ajouterBain,
  ajouterSommeil,
  modifierBain,
  modifierSommeil,
  supprimerBain,
  supprimerSommeil,
} from "@/migration/eventsDoubleWriteService";
import { obtenirEvenements, EventType } from "@/services/eventsService";
import FontAwesome5 from "@expo/vector-icons/FontAwesome5";
import FontAwesome from "@expo/vector-icons/FontAwesome6";
import DateTimePicker from "@react-native-community/datetimepicker";
import React, { useCallback, useState } from "react";
import {
  Platform,
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

export type RoutineType = "sommeil" | "bain";
export type SleepMode = "nap" | "night";
export type SleepLocation =
  | "lit"
  | "cododo"
  | "poussette"
  | "voiture"
  | "autre";
export type SleepQuality = "paisible" | "agité" | "mauvais";

export type RoutinesEditData = {
  id: string;
  type: RoutineType;
  date: Date | { seconds: number } | { toDate: () => Date };
  // Sommeil fields
  heureDebut?: Date | { seconds: number } | { toDate: () => Date };
  heureFin?: Date | { seconds: number } | { toDate: () => Date } | null;
  isNap?: boolean;
  location?: SleepLocation;
  quality?: SleepQuality;
  duree?: number;
  // Bain fields
  temperatureEau?: number;
  produits?: string;
  // Common
  note?: string;
};

export type RoutinesFormProps = {
  initialType?: RoutineType;
  initialSleepMode?: SleepMode;
  onSuccess?: () => void;
  onCancel?: () => void;
  isSubmitting: boolean;
  setIsSubmitting: (value: boolean) => void;
  onFormStepChange?: (inPicker: boolean) => void;
  editData?: RoutinesEditData;
  onDelete?: () => void;
  // For checking if there's an ongoing sleep
  sommeilEnCours?: { id: string } | null;
};

// ============================================
// CONSTANTS
// ============================================

const LOCATION_OPTIONS: SleepLocation[] = [
  "lit",
  "cododo",
  "poussette",
  "voiture",
  "autre",
];

const QUALITY_OPTIONS: SleepQuality[] = ["paisible", "agité", "mauvais"];

// ============================================
// HELPERS
// ============================================

const toDate = (value: any): Date => {
  if (value?.seconds) return new Date(value.seconds * 1000);
  if (value?.toDate) return value.toDate();
  if (value instanceof Date) return value;
  return new Date(value);
};

const formatTime = (date: Date) =>
  date.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });

const formatDateLabel = (date: Date) =>
  date.toLocaleDateString("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });

// ============================================
// COMPONENT
// ============================================

export const RoutinesForm: React.FC<RoutinesFormProps> = ({
  initialType = "sommeil",
  initialSleepMode = "nap",
  onSuccess,
  onCancel,
  isSubmitting,
  setIsSubmitting,
  onFormStepChange,
  editData,
  onDelete,
  sommeilEnCours,
}) => {
  const { activeChild } = useBaby();
  const { showAlert, showConfirm } = useModal();
  const { showToast } = useToast();
  const { showSuccess } = useSuccessAnimation();
  const colorScheme = useColorScheme() ?? "light";
  const nc = getNeutralColors(colorScheme);

  const isEditing = !!editData;
  const isEditingBain = isEditing && editData.type === "bain";
  const isEditingSommeil = isEditing && editData.type === "sommeil";

  // Determine initial sheet type
  const getInitialSheetType = (): "nap" | "night" | "bain" => {
    if (editData) {
      if (editData.type === "bain") return "bain";
      return editData.isNap === false ? "night" : "nap";
    }
    if (initialType === "bain") return "bain";
    return initialSleepMode === "night" ? "night" : "nap";
  };

  // Form state
  const [sheetType, setSheetType] = useState<"nap" | "night" | "bain">(
    getInitialSheetType(),
  );

  // Bain state
  const [dateHeure, setDateHeure] = useState<Date>(
    editData && editData.type === "bain" ? toDate(editData.date) : new Date(),
  );
  const [dureeBain, setDureeBain] = useState<number>(
    (editData as any)?.duree ?? 10,
  );
  const [temperatureEau, setTemperatureEau] = useState<number>(
    editData?.temperatureEau ?? 37,
  );
  const [produits, setProduits] = useState<string>(editData?.produits ?? "");
  const [noteBain, setNoteBain] = useState<string>(
    editData?.type === "bain" ? (editData.note ?? "") : "",
  );

  // Sommeil state
  const [heureDebut, setHeureDebut] = useState<Date>(
    editData?.heureDebut
      ? toDate(editData.heureDebut)
      : editData?.date
        ? toDate(editData.date)
        : new Date(),
  );
  const [heureFin, setHeureFin] = useState<Date | null>(
    editData?.heureFin ? toDate(editData.heureFin) : null,
  );
  const [isOngoing, setIsOngoing] = useState<boolean>(
    editData ? !editData.heureFin : false,
  );
  const [isNap, setIsNap] = useState<boolean>(editData?.isNap ?? true);
  const [location, setLocation] = useState<SleepLocation | undefined>(
    editData?.location ?? undefined,
  );
  const [quality, setQuality] = useState<SleepQuality | undefined>(
    editData?.quality ?? undefined,
  );
  const [noteSommeil, setNoteSommeil] = useState<string>(
    editData?.type === "sommeil" ? (editData.note ?? "") : "",
  );

  // Date/Time picker visibility
  const [showDate, setShowDate] = useState(false);
  const [showTime, setShowTime] = useState(false);
  const [showDateStart, setShowDateStart] = useState(false);
  const [showTimeStart, setShowTimeStart] = useState(false);
  const [showDateEnd, setShowDateEnd] = useState(false);
  const [showTimeEnd, setShowTimeEnd] = useState(false);

  // Notify parent when picker visibility changes
  const handlePickerChange = useCallback(
    (show: boolean) => {
      onFormStepChange?.(show);
    },
    [onFormStepChange],
  );

  const handleShowDate = useCallback(
    (show: boolean) => {
      setShowDate(show);
      handlePickerChange(show);
    },
    [handlePickerChange],
  );

  const handleShowTime = useCallback(
    (show: boolean) => {
      setShowTime(show);
      handlePickerChange(show);
    },
    [handlePickerChange],
  );

  const handleShowDateStart = useCallback(
    (show: boolean) => {
      setShowDateStart(show);
      handlePickerChange(show);
    },
    [handlePickerChange],
  );

  const handleShowTimeStart = useCallback(
    (show: boolean) => {
      setShowTimeStart(show);
      handlePickerChange(show);
    },
    [handlePickerChange],
  );

  const handleShowDateEnd = useCallback(
    (show: boolean) => {
      setShowDateEnd(show);
      handlePickerChange(show);
    },
    [handlePickerChange],
  );

  const handleShowTimeEnd = useCallback(
    (show: boolean) => {
      setShowTimeEnd(show);
      handlePickerChange(show);
    },
    [handlePickerChange],
  );

  // ============================================
  // TYPE SELECTION
  // ============================================

  const handleSelectType = (next: "nap" | "night" | "bain") => {
    if (isEditingBain && next !== "bain") return;
    if (isEditingSommeil && next === "bain") return;

    if (next === "bain") {
      if (sheetType !== "bain") {
        // Reset bain form
        setDateHeure(new Date());
        setDureeBain(10);
        setTemperatureEau(37);
        setProduits("");
        setNoteBain("");
      }
      setSheetType("bain");
      return;
    }

    if (sheetType === "bain") {
      // Reset sleep form
      setHeureDebut(new Date());
      setHeureFin(null);
      setIsOngoing(false);
      setLocation(undefined);
      setQuality(undefined);
      setNoteSommeil("");
    }
    setSheetType(next);
    setIsNap(next === "nap");
  };

  // ============================================
  // HANDLERS
  // ============================================

  const handleSubmit = async () => {
    if (!activeChild?.id || isSubmitting) return;

    try {
      setIsSubmitting(true);

      if (sheetType === "bain") {
        const data = removeUndefined({
          date: dateHeure,
          duree: dureeBain > 0 ? dureeBain : undefined,
          temperatureEau: temperatureEau > 0 ? temperatureEau : undefined,
          produits: produits.trim() ? produits.trim() : undefined,
          note: noteBain.trim() ? noteBain.trim() : undefined,
        });

        if (editData && editData.type === "bain") {
          await modifierBain(activeChild.id, editData.id, data);
          showSuccess("bath", "Bain modifié");
        } else {
          await ajouterBain(activeChild.id, data);
          showSuccess("bath", "Bain ajouté");
        }
      } else {
        // Sommeil
        if (
          !isOngoing &&
          heureFin &&
          heureFin.getTime() < heureDebut.getTime()
        ) {
          showAlert(
            "Attention",
            "La date de fin ne peut pas être antérieure à la date de début.",
          );
          setIsSubmitting(false);
          return;
        }

        // Prevent creating ongoing sleep if one already exists (unless editing the same sleep)
        if (isOngoing && !isEditing) {
          // If sommeilEnCours prop is provided, use it; otherwise query Firestore
          let hasOngoingSleep = !!sommeilEnCours;
          if (!sommeilEnCours && activeChild?.id) {
            const recentSleeps = await obtenirEvenements(activeChild.id, {
              type: "sommeil" as EventType,
              limite: 5,
            });
            hasOngoingSleep = recentSleeps.some(
              (e: any) => e.heureDebut && !e.heureFin,
            );
          }
          if (hasOngoingSleep) {
            showAlert(
              "Attention",
              "Un sommeil est déjà en cours. Terminez-le avant d'en commencer un nouveau.",
            );
            setIsSubmitting(false);
            return;
          }
        }
        const isEditingSameOngoingSleep = editData && sommeilEnCours && editData.id === sommeilEnCours.id;
        if (isOngoing && sommeilEnCours && isEditing && !isEditingSameOngoingSleep) {
          showAlert(
            "Attention",
            "Un sommeil est déjà en cours. Terminez-le avant d'en commencer un nouveau.",
          );
          setIsSubmitting(false);
          return;
        }

        const fin = isOngoing ? null : (heureFin ?? undefined);
        const duree =
          heureDebut && fin
            ? Math.max(
                1,
                Math.round((fin.getTime() - heureDebut.getTime()) / 60000),
              )
            : undefined;

        if (editData && editData.type === "sommeil") {
          // For editing, we need to explicitly send null to delete fields
          const editDataToSend: any = {
            date: heureDebut,
            heureDebut: heureDebut,
            heureFin: isOngoing ? null : fin, // null will trigger deleteField() in service
            duree: isOngoing ? null : duree, // null will trigger deleteField() in service
            isNap: sheetType === "nap",
            location: location ?? undefined,
            quality: quality ?? undefined,
            note: noteSommeil.trim() ? noteSommeil.trim() : undefined,
          };
          // Remove undefined but keep null values
          const cleanedEditData = Object.fromEntries(
            Object.entries(editDataToSend).filter(([, v]) => v !== undefined),
          );
          await modifierSommeil(activeChild.id, editData.id, cleanedEditData);
          showSuccess("sleep", "Sommeil modifié");
        } else {
          // For new entries, just remove undefined values
          const data = removeUndefined({
            date: heureDebut,
            heureDebut: heureDebut,
            heureFin: fin ?? undefined,
            duree,
            isNap: sheetType === "nap",
            location: location ?? undefined,
            quality: quality ?? undefined,
            note: noteSommeil.trim() ? noteSommeil.trim() : undefined,
          });
          await ajouterSommeil(activeChild.id, data);
          showSuccess("sleep", "Sommeil ajouté");
        }
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

    const typeLabel = editData.type === "bain" ? "ce bain" : "ce sommeil";
    showConfirm(
      "Supprimer",
      `Voulez-vous vraiment supprimer ${typeLabel} ?`,
      async () => {
        try {
          setIsSubmitting(true);
          if (editData.type === "bain") {
            await supprimerBain(activeChild.id, editData.id);
            showToast("Bain supprimé");
          } else {
            await supprimerSommeil(activeChild.id, editData.id);
            showToast("Sommeil supprimé");
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
  // RENDER - TYPE PICKER
  // ============================================

  const renderTypePicker = () => (
    <View style={styles.typeRow}>
      {[
        { key: "nap", label: "Sieste" },
        { key: "night", label: "Nuit" },
        { key: "bain", label: "Bain" },
      ].map((item) => {
        const active = sheetType === item.key;
        const isDisabled = isEditingBain
          ? item.key !== "bain"
          : isEditingSommeil
            ? item.key === "bain"
            : false;
        return (
          <TouchableOpacity
            key={item.key}
            style={[
              styles.typeChip,
              {
                backgroundColor: active ? nc.backgroundCard : nc.background,
                borderColor: active ? "#6f42c1" : nc.border,
              },
              isDisabled && styles.typeChipDisabled,
            ]}
            disabled={isDisabled || isSubmitting}
            activeOpacity={0.7}
            onPress={() => handleSelectType(item.key as any)}
            accessibilityLabel={item.label}
            hitSlop={8}
          >
            <Text
              style={[
                styles.typeChipText,
                { color: active ? "#4c2c79" : nc.textLight },
                active && styles.typeChipTextActive,
              ]}
            >
              {item.label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );

  // ============================================
  // RENDER - SOMMEIL FORM
  // ============================================

  const renderSommeilForm = () => (
    <>
      <View style={styles.chipSection}>
        <Text style={[styles.chipLabel, { color: nc.textLight }]}>Lieu</Text>
        <View style={styles.chipRow}>
          {LOCATION_OPTIONS.map((option) => (
            <TouchableOpacity
              key={option}
              style={[
                styles.chip,
                {
                  backgroundColor: location === option ? "#ede7f6" : nc.background,
                  borderColor: location === option ? "#6f42c1" : nc.border,
                },
              ]}
              onPress={() =>
                setLocation(location === option ? undefined : option)
              }
              disabled={isSubmitting}
              accessibilityLabel={option}
              hitSlop={8}
            >
              <Text
                style={[
                  styles.chipText,
                  { color: location === option ? "#4c2c79" : nc.textLight },
                ]}
              >
                {option}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      <View style={styles.chipSection}>
        <Text style={[styles.chipLabel, { color: nc.textLight }]}>Qualité</Text>
        <View style={styles.chipRow}>
          {QUALITY_OPTIONS.map((option) => (
            <TouchableOpacity
              key={option}
              style={[
                styles.chip,
                {
                  backgroundColor: quality === option ? "#ede7f6" : nc.background,
                  borderColor: quality === option ? "#6f42c1" : nc.border,
                },
              ]}
              onPress={() =>
                setQuality(quality === option ? undefined : option)
              }
              disabled={isSubmitting}
              accessibilityLabel={option}
              hitSlop={8}
            >
              <Text
                style={[
                  styles.chipText,
                  { color: quality === option ? "#4c2c79" : nc.textLight },
                ]}
              >
                {option}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      <View style={styles.inputGroup}>
        <Text style={[styles.inputLabel, { color: nc.textLight }]}>Note</Text>
        <TextInput
          value={noteSommeil}
          onChangeText={setNoteSommeil}
          placeholder="Ajouter une note"
          placeholderTextColor={nc.textMuted}
          style={[styles.input, { borderColor: nc.border, color: nc.textStrong }]}
          editable={!isSubmitting}
        />
      </View>

      <View style={styles.rowBetween}>
        <TouchableOpacity
          style={[
            styles.dateButton,
            { borderColor: nc.border, backgroundColor: nc.background },
          ]}
          onPress={() => handleShowDateStart(true)}
          disabled={isSubmitting}
          accessibilityLabel="Choisir la date de début"
          hitSlop={8}
        >
          <FontAwesome5
            name="calendar-alt"
            size={16}
            color={Colors[colorScheme].tint}
          />
          <Text style={[styles.dateButtonText, { color: nc.textNormal }]}>Date début</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[
            styles.dateButton,
            { borderColor: nc.border, backgroundColor: nc.background },
          ]}
          onPress={() => handleShowTimeStart(true)}
          disabled={isSubmitting}
          accessibilityLabel="Choisir l'heure de début"
          hitSlop={8}
        >
          <FontAwesome5
            name="clock"
            size={16}
            color={Colors[colorScheme].tint}
          />
          <Text style={[styles.dateButtonText, { color: nc.textNormal }]}>Heure début</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.rowBetween}>
        <TouchableOpacity
          style={[
            styles.dateButton,
            { borderColor: nc.border, backgroundColor: nc.background },
            isOngoing && styles.dateButtonDisabled,
          ]}
          onPress={() => {
            if (!isOngoing) {
              setHeureFin((prev) => prev ?? new Date());
              handleShowDateEnd(true);
            }
          }}
          disabled={isSubmitting || isOngoing}
          accessibilityLabel="Choisir la date de fin"
          hitSlop={8}
        >
          <FontAwesome5
            name="calendar-alt"
            size={16}
            color={Colors[colorScheme].tint}
          />
          <Text style={[styles.dateButtonText, { color: nc.textNormal }]}>Date fin</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[
            styles.dateButton,
            { borderColor: nc.border, backgroundColor: nc.background },
            isOngoing && styles.dateButtonDisabled,
          ]}
          onPress={() => {
            if (!isOngoing) {
              setHeureFin((prev) => prev ?? new Date());
              handleShowTimeEnd(true);
            }
          }}
          disabled={isSubmitting || isOngoing}
          accessibilityLabel="Choisir l'heure de fin"
          hitSlop={8}
        >
          <FontAwesome5
            name="clock"
            size={16}
            color={Colors[colorScheme].tint}
          />
          <Text style={[styles.dateButtonText, { color: nc.textNormal }]}>Heure fin</Text>
        </TouchableOpacity>
      </View>

      <TouchableOpacity
        style={styles.checkboxRow}
        onPress={() => setIsOngoing((prev) => !prev)}
        disabled={isSubmitting}
        accessibilityLabel="Sommeil en cours"
      >
        <View style={[
          styles.checkbox,
          { borderColor: nc.border },
          isOngoing && styles.checkboxChecked,
        ]}>
          {isOngoing && <FontAwesome name="check" size={12} color="#fff" />}
        </View>
        <Text style={[styles.checkboxLabel, { color: nc.textLight }]}>Sommeil en cours</Text>
      </TouchableOpacity>

      <View style={styles.sleepSelectedDateTime}>
        <Text style={[styles.sleepSelectedDate, { color: nc.textStrong }]}>
          {formatDateLabel(heureDebut)}
        </Text>
        <Text style={[styles.sleepSelectedTime, { color: nc.textStrong }]}>{formatTime(heureDebut)}</Text>
        {!isOngoing && heureFin && (
          <>
            {formatDateLabel(heureFin) !== formatDateLabel(heureDebut) && (
              <Text style={[styles.sleepSelectedDate, { color: nc.textStrong }]}>
                {formatDateLabel(heureFin)}
              </Text>
            )}
            <Text style={[styles.sleepSelectedTime, { color: nc.textStrong }]}>
              → {formatTime(heureFin)}
            </Text>
          </>
        )}
      </View>

      {showDateStart && (
        <DateTimePicker
          value={heureDebut}
          mode="date"
          display={Platform.OS === "ios" ? "spinner" : "default"}
          themeVariant={colorScheme}
          onChange={(_, date) => {
            handleShowDateStart(false);
            if (date) {
              setHeureDebut((prev) => {
                const next = new Date(prev);
                next.setFullYear(
                  date.getFullYear(),
                  date.getMonth(),
                  date.getDate(),
                );
                return next;
              });
            }
          }}
        />
      )}
      {showTimeStart && (
        <DateTimePicker
          value={heureDebut}
          mode="time"
          is24Hour
          display={Platform.OS === "ios" ? "spinner" : "default"}
          themeVariant={colorScheme}
          onChange={(_, date) => {
            handleShowTimeStart(false);
            if (date) {
              setHeureDebut((prev) => {
                const next = new Date(prev);
                next.setHours(date.getHours(), date.getMinutes(), 0, 0);
                return next;
              });
            }
          }}
        />
      )}
      {showDateEnd && heureFin && (
        <DateTimePicker
          value={heureFin}
          mode="date"
          display={Platform.OS === "ios" ? "spinner" : "default"}
          themeVariant={colorScheme}
          onChange={(_, date) => {
            handleShowDateEnd(false);
            if (date) {
              setHeureFin((prev) => {
                const base = prev ?? new Date();
                const next = new Date(base);
                next.setFullYear(
                  date.getFullYear(),
                  date.getMonth(),
                  date.getDate(),
                );
                return next;
              });
            }
          }}
        />
      )}
      {showTimeEnd && heureFin && (
        <DateTimePicker
          value={heureFin}
          mode="time"
          is24Hour
          display={Platform.OS === "ios" ? "spinner" : "default"}
          themeVariant={colorScheme}
          onChange={(_, date) => {
            handleShowTimeEnd(false);
            if (date) {
              setHeureFin((prev) => {
                const base = prev ?? new Date();
                const next = new Date(base);
                next.setHours(date.getHours(), date.getMinutes(), 0, 0);
                return next;
              });
            }
          }}
        />
      )}
    </>
  );

  // ============================================
  // RENDER - BAIN FORM
  // ============================================

  const renderBainForm = () => (
    <>
      <View style={styles.inputGroup}>
        <Text style={[styles.inputLabel, { color: nc.textLight }]}>Durée (minutes)</Text>
        <View style={styles.quantityPickerRow}>
          <TouchableOpacity
            style={[
              styles.quantityButton,
              { backgroundColor: nc.backgroundPressed },
              isSubmitting && styles.quantityButtonDisabled,
            ]}
            onPress={() => setDureeBain((value) => Math.max(0, value - 5))}
            disabled={isSubmitting}
            accessibilityLabel="Diminuer"
          >
            <Text
              style={[
                styles.quantityButtonText,
                { color: nc.textStrong },
                isSubmitting && styles.quantityButtonTextDisabled,
              ]}
            >
              -
            </Text>
          </TouchableOpacity>
          <Text style={[styles.quantityPickerValue, { color: nc.textStrong }]}>{dureeBain} min</Text>
          <TouchableOpacity
            style={[
              styles.quantityButton,
              { backgroundColor: nc.backgroundPressed },
              isSubmitting && styles.quantityButtonDisabled,
            ]}
            onPress={() => setDureeBain((value) => value + 5)}
            disabled={isSubmitting}
            accessibilityLabel="Augmenter"
          >
            <Text
              style={[
                styles.quantityButtonText,
                { color: nc.textStrong },
                isSubmitting && styles.quantityButtonTextDisabled,
              ]}
            >
              +
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.inputGroup}>
        <Text style={[styles.inputLabel, { color: nc.textLight }]}>Température de l'eau (°C)</Text>
        <View style={styles.quantityPickerRow}>
          <TouchableOpacity
            style={[
              styles.quantityButton,
              { backgroundColor: nc.backgroundPressed },
              isSubmitting && styles.quantityButtonDisabled,
            ]}
            onPress={() =>
              setTemperatureEau((value) => Math.max(35, value - 0.5))
            }
            disabled={isSubmitting}
            accessibilityLabel="Diminuer"
          >
            <Text
              style={[
                styles.quantityButtonText,
                { color: nc.textStrong },
                isSubmitting && styles.quantityButtonTextDisabled,
              ]}
            >
              -
            </Text>
          </TouchableOpacity>
          <Text style={[styles.quantityPickerValue, { color: nc.textStrong }]}>
            {temperatureEau.toFixed(1)}°C
          </Text>
          <TouchableOpacity
            style={[
              styles.quantityButton,
              { backgroundColor: nc.backgroundPressed },
              isSubmitting && styles.quantityButtonDisabled,
            ]}
            onPress={() =>
              setTemperatureEau((value) => Math.min(40, value + 0.5))
            }
            disabled={isSubmitting}
            accessibilityLabel="Augmenter"
          >
            <Text
              style={[
                styles.quantityButtonText,
                { color: nc.textStrong },
                isSubmitting && styles.quantityButtonTextDisabled,
              ]}
            >
              +
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.inputGroup}>
        <Text style={[styles.inputLabel, { color: nc.textLight }]}>Produits</Text>
        <TextInput
          value={produits}
          onChangeText={setProduits}
          placeholder="Gel lavant, huile..."
          placeholderTextColor={nc.textMuted}
          style={[styles.input, { borderColor: nc.border, color: nc.textStrong }]}
          editable={!isSubmitting}
        />
      </View>

      <View style={styles.inputGroup}>
        <Text style={[styles.inputLabel, { color: nc.textLight }]}>Note</Text>
        <TextInput
          value={noteBain}
          onChangeText={setNoteBain}
          placeholder="Ajouter une note"
          placeholderTextColor={nc.textMuted}
          style={[styles.input, { borderColor: nc.border, color: nc.textStrong }]}
          editable={!isSubmitting}
        />
      </View>

      <View style={styles.dateTimeContainerWithPadding}>
        <TouchableOpacity
          style={[
            styles.dateButton,
            { borderColor: nc.border, backgroundColor: nc.background },
          ]}
          onPress={() => handleShowDate(true)}
          disabled={isSubmitting}
          accessibilityLabel="Choisir la date"
          hitSlop={8}
        >
          <FontAwesome5
            name="calendar-alt"
            size={16}
            color={Colors[colorScheme].tint}
          />
          <Text style={[styles.dateButtonText, { color: nc.textNormal }]}>Date</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[
            styles.dateButton,
            { borderColor: nc.border, backgroundColor: nc.background },
          ]}
          onPress={() => handleShowTime(true)}
          disabled={isSubmitting}
          accessibilityLabel="Choisir l'heure"
          hitSlop={8}
        >
          <FontAwesome5
            name="clock"
            size={16}
            color={Colors[colorScheme].tint}
          />
          <Text style={[styles.dateButtonText, { color: nc.textNormal }]}>Heure</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.selectedDateTime}>
        <Text style={[styles.selectedDate, { color: nc.textStrong }]} numberOfLines={1} adjustsFontSizeToFit>
          {dateHeure.toLocaleDateString("fr-FR", {
            weekday: "long",
            year: "numeric",
            month: "long",
            day: "numeric",
          })}
        </Text>
        <Text style={[styles.selectedTime, { color: nc.textStrong }]}>
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
          themeVariant={colorScheme}
          onChange={(_, date) => {
            handleShowDate(false);
            if (date) {
              setDateHeure((prev) => {
                const next = new Date(prev);
                next.setFullYear(
                  date.getFullYear(),
                  date.getMonth(),
                  date.getDate(),
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
          themeVariant={colorScheme}
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
    </>
  );

  // ============================================
  // RENDER
  // ============================================

  return (
    <View style={styles.sheetContent}>
      {renderTypePicker()}

      {sheetType === "bain" ? renderBainForm() : renderSommeilForm()}

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
            <Text style={[styles.cancelText, { color: nc.textNormal }]}>Annuler</Text>
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
            <Text style={[
              styles.validateText,
              { color: colorScheme === "dark" ? Colors[colorScheme].background : nc.white },
            ]}>
              {isEditing ? "Enregistrer" : "Ajouter"}
            </Text>
          </TouchableOpacity>
        </View>

        {isEditing && (
          <TouchableOpacity
            style={[
              styles.deleteButton,
              { backgroundColor: nc.errorBg },
              isSubmitting && styles.buttonDisabled,
            ]}
            onPress={handleDelete}
            disabled={isSubmitting}
            accessibilityLabel="Supprimer"
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
  // Type selector
  typeRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    paddingBottom: 8,
  },
  typeChip: {
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  typeChipActive: {
    // backgroundColor and borderColor applied inline
  },
  typeChipDisabled: {
    opacity: 0.5,
  },
  typeChipText: {
    fontSize: 12,
    fontWeight: "600",
  },
  typeChipTextActive: {
    fontWeight: "700",
  },
  // Input group
  inputGroup: {
    gap: 6,
  },
  inputLabel: {
    fontSize: 12,
    fontWeight: "700",
  },
  input: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  // Chip section
  chipSection: {
    gap: 8,
  },
  chipLabel: {
    fontSize: 12,
    fontWeight: "700",
  },
  chipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  chip: {
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  chipActive: {
    // backgroundColor and borderColor applied inline
  },
  chipText: {
    fontSize: 12,
    fontWeight: "600",
  },
  chipTextActive: {
    // color applied inline
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
  quantityPickerValue: {
    fontSize: 16,
    fontWeight: "600",
  },
  // Date/Time
  rowBetween: {
    flexDirection: "row",
    gap: 12,
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
  },
  dateButtonDisabled: {
    opacity: 0.5,
  },
  dateButtonText: {
    fontSize: 14,
    fontWeight: "600",
  },
  selectedDateTime: {
    alignItems: "center",
    marginBottom: 16,
  },
  sleepSelectedDateTime: {
    alignItems: "center",
    marginBottom: 16,
  },
  selectedDate: {
    fontSize: 16,
    fontWeight: "600",
    marginBottom: 4,
  },
  sleepSelectedDate: {
    fontSize: 16,
    fontWeight: "600",
    marginBottom: 4,
    textTransform: "capitalize",
  },
  selectedTime: {
    fontSize: 20,
    fontWeight: "600",
  },
  sleepSelectedTime: {
    fontSize: 20,
    fontWeight: "600",
  },
  // Checkbox
  checkboxRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  checkbox: {
    width: 18,
    height: 18,
    borderRadius: 4,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  checkboxChecked: {
    backgroundColor: "#6f42c1",
    borderColor: "#6f42c1",
  },
  checkboxLabel: {
    fontSize: 12,
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
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#f1b1b1",
    gap: 8,
  },
  deleteText: {
    fontSize: 14,
    color: "#dc3545",
    fontWeight: "700",
    letterSpacing: 0.2,
  },
});
