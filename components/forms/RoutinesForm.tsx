// components/forms/RoutinesForm.tsx
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
import { useToast } from "@/contexts/ToastContext";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { Colors } from "@/constants/theme";
import { eventColors } from "@/constants/eventColors";
import {
  ajouterBain,
  ajouterSommeil,
  modifierBain,
  modifierSommeil,
  supprimerBain,
  supprimerSommeil,
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

export type RoutineType = "sommeil" | "bain";
export type SleepMode = "nap" | "night";
export type SleepLocation = "lit" | "cododo" | "poussette" | "voiture" | "autre";
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
  const colorScheme = useColorScheme() ?? "light";

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
    getInitialSheetType()
  );

  // Bain state
  const [dateHeure, setDateHeure] = useState<Date>(
    editData && editData.type === "bain" ? toDate(editData.date) : new Date()
  );
  const [dureeBain, setDureeBain] = useState<number>(
    (editData as any)?.duree ?? 10
  );
  const [temperatureEau, setTemperatureEau] = useState<number>(
    editData?.temperatureEau ?? 37
  );
  const [produits, setProduits] = useState<string>(editData?.produits ?? "");
  const [noteBain, setNoteBain] = useState<string>(
    editData?.type === "bain" ? editData.note ?? "" : ""
  );

  // Sommeil state
  const [heureDebut, setHeureDebut] = useState<Date>(
    editData?.heureDebut
      ? toDate(editData.heureDebut)
      : editData?.date
        ? toDate(editData.date)
        : new Date()
  );
  const [heureFin, setHeureFin] = useState<Date | null>(
    editData?.heureFin ? toDate(editData.heureFin) : null
  );
  const [isOngoing, setIsOngoing] = useState<boolean>(
    editData ? !editData.heureFin : false
  );
  const [isNap, setIsNap] = useState<boolean>(editData?.isNap ?? true);
  const [location, setLocation] = useState<SleepLocation | undefined>(
    editData?.location ?? undefined
  );
  const [quality, setQuality] = useState<SleepQuality | undefined>(
    editData?.quality ?? undefined
  );
  const [noteSommeil, setNoteSommeil] = useState<string>(
    editData?.type === "sommeil" ? editData.note ?? "" : ""
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
    [onFormStepChange]
  );

  const handleShowDate = useCallback(
    (show: boolean) => {
      setShowDate(show);
      handlePickerChange(show);
    },
    [handlePickerChange]
  );

  const handleShowTime = useCallback(
    (show: boolean) => {
      setShowTime(show);
      handlePickerChange(show);
    },
    [handlePickerChange]
  );

  const handleShowDateStart = useCallback(
    (show: boolean) => {
      setShowDateStart(show);
      handlePickerChange(show);
    },
    [handlePickerChange]
  );

  const handleShowTimeStart = useCallback(
    (show: boolean) => {
      setShowTimeStart(show);
      handlePickerChange(show);
    },
    [handlePickerChange]
  );

  const handleShowDateEnd = useCallback(
    (show: boolean) => {
      setShowDateEnd(show);
      handlePickerChange(show);
    },
    [handlePickerChange]
  );

  const handleShowTimeEnd = useCallback(
    (show: boolean) => {
      setShowTimeEnd(show);
      handlePickerChange(show);
    },
    [handlePickerChange]
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
          showToast("Bain modifié");
        } else {
          await ajouterBain(activeChild.id, data);
          showToast("Bain ajouté");
        }
      } else {
        // Sommeil
        if (!isOngoing && heureFin && heureFin.getTime() < heureDebut.getTime()) {
          showAlert(
            "Attention",
            "La date de fin ne peut pas être antérieure à la date de début."
          );
          setIsSubmitting(false);
          return;
        }

        // Prevent creating ongoing sleep if one already exists
        if (isOngoing && !editData && sommeilEnCours) {
          showAlert(
            "Attention",
            "Un sommeil est déjà en cours. Terminez-le avant d'en commencer un nouveau."
          );
          setIsSubmitting(false);
          return;
        }

        const fin = isOngoing ? null : (heureFin ?? undefined);
        const duree =
          heureDebut && fin
            ? Math.max(0, Math.round((fin.getTime() - heureDebut.getTime()) / 60000))
            : undefined;

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

        if (editData && editData.type === "sommeil") {
          await modifierSommeil(activeChild.id, editData.id, data);
          showToast("Sommeil modifié");
        } else {
          await ajouterSommeil(activeChild.id, data);
          showToast("Sommeil ajouté");
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
      }
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
              active && styles.typeChipActive,
              isDisabled && styles.typeChipDisabled,
            ]}
            disabled={isDisabled || isSubmitting}
            activeOpacity={0.7}
            onPress={() => handleSelectType(item.key as any)}
          >
            <Text
              style={[
                styles.typeChipText,
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
        <Text style={styles.chipLabel}>Lieu</Text>
        <View style={styles.chipRow}>
          {LOCATION_OPTIONS.map((option) => (
            <TouchableOpacity
              key={option}
              style={[styles.chip, location === option && styles.chipActive]}
              onPress={() => setLocation(location === option ? undefined : option)}
              disabled={isSubmitting}
            >
              <Text
                style={[
                  styles.chipText,
                  location === option && styles.chipTextActive,
                ]}
              >
                {option}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      <View style={styles.chipSection}>
        <Text style={styles.chipLabel}>Qualité</Text>
        <View style={styles.chipRow}>
          {QUALITY_OPTIONS.map((option) => (
            <TouchableOpacity
              key={option}
              style={[styles.chip, quality === option && styles.chipActive]}
              onPress={() => setQuality(quality === option ? undefined : option)}
              disabled={isSubmitting}
            >
              <Text
                style={[
                  styles.chipText,
                  quality === option && styles.chipTextActive,
                ]}
              >
                {option}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      <View style={styles.inputGroup}>
        <Text style={styles.inputLabel}>Note</Text>
        <TextInput
          value={noteSommeil}
          onChangeText={setNoteSommeil}
          placeholder="Ajouter une note"
          style={styles.input}
          editable={!isSubmitting}
        />
      </View>

      <View style={styles.rowBetween}>
        <TouchableOpacity
          style={styles.dateButton}
          onPress={() => handleShowDateStart(true)}
          disabled={isSubmitting}
        >
          <FontAwesome5
            name="calendar-alt"
            size={16}
            color={Colors[colorScheme].tint}
          />
          <Text style={styles.dateButtonText}>Date début</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.dateButton}
          onPress={() => handleShowTimeStart(true)}
          disabled={isSubmitting}
        >
          <FontAwesome5
            name="clock"
            size={16}
            color={Colors[colorScheme].tint}
          />
          <Text style={styles.dateButtonText}>Heure début</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.rowBetween}>
        <TouchableOpacity
          style={[styles.dateButton, isOngoing && styles.dateButtonDisabled]}
          onPress={() => {
            if (!isOngoing) {
              setHeureFin((prev) => prev ?? new Date());
              handleShowDateEnd(true);
            }
          }}
          disabled={isSubmitting || isOngoing}
        >
          <FontAwesome5
            name="calendar-alt"
            size={16}
            color={Colors[colorScheme].tint}
          />
          <Text style={styles.dateButtonText}>Date fin</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.dateButton, isOngoing && styles.dateButtonDisabled]}
          onPress={() => {
            if (!isOngoing) {
              setHeureFin((prev) => prev ?? new Date());
              handleShowTimeEnd(true);
            }
          }}
          disabled={isSubmitting || isOngoing}
        >
          <FontAwesome5
            name="clock"
            size={16}
            color={Colors[colorScheme].tint}
          />
          <Text style={styles.dateButtonText}>Heure fin</Text>
        </TouchableOpacity>
      </View>

      <TouchableOpacity
        style={styles.checkboxRow}
        onPress={() => setIsOngoing((prev) => !prev)}
        disabled={isSubmitting}
      >
        <View style={[styles.checkbox, isOngoing && styles.checkboxChecked]}>
          {isOngoing && <FontAwesome name="check" size={12} color="#fff" />}
        </View>
        <Text style={styles.checkboxLabel}>Sommeil en cours</Text>
      </TouchableOpacity>

      <View style={styles.sleepSelectedDateTime}>
        <Text style={styles.sleepSelectedDate}>{formatDateLabel(heureDebut)}</Text>
        <Text style={styles.sleepSelectedTime}>{formatTime(heureDebut)}</Text>
        {!isOngoing && heureFin && (
          <>
            {formatDateLabel(heureFin) !== formatDateLabel(heureDebut) && (
              <Text style={styles.sleepSelectedDate}>
                {formatDateLabel(heureFin)}
              </Text>
            )}
            <Text style={styles.sleepSelectedTime}>→ {formatTime(heureFin)}</Text>
          </>
        )}
      </View>

      {showDateStart && (
        <DateTimePicker
          value={heureDebut}
          mode="date"
          display={Platform.OS === "ios" ? "spinner" : "default"}
          onChange={(_, date) => {
            handleShowDateStart(false);
            if (date) {
              setHeureDebut((prev) => {
                const next = new Date(prev);
                next.setFullYear(date.getFullYear(), date.getMonth(), date.getDate());
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
          onChange={(_, date) => {
            handleShowDateEnd(false);
            if (date) {
              setHeureFin((prev) => {
                const base = prev ?? new Date();
                const next = new Date(base);
                next.setFullYear(date.getFullYear(), date.getMonth(), date.getDate());
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
        <Text style={styles.inputLabel}>Durée (minutes)</Text>
        <View style={styles.quantityPickerRow}>
          <TouchableOpacity
            style={[
              styles.quantityButton,
              isSubmitting && styles.quantityButtonDisabled,
            ]}
            onPress={() => setDureeBain((value) => Math.max(0, value - 5))}
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
          <Text style={styles.quantityPickerValue}>{dureeBain} min</Text>
          <TouchableOpacity
            style={[
              styles.quantityButton,
              isSubmitting && styles.quantityButtonDisabled,
            ]}
            onPress={() => setDureeBain((value) => value + 5)}
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
        <Text style={styles.inputLabel}>Température de l'eau (°C)</Text>
        <View style={styles.quantityPickerRow}>
          <TouchableOpacity
            style={[
              styles.quantityButton,
              isSubmitting && styles.quantityButtonDisabled,
            ]}
            onPress={() => setTemperatureEau((value) => Math.max(20, value - 1))}
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
          <Text style={styles.quantityPickerValue}>{temperatureEau}°C</Text>
          <TouchableOpacity
            style={[
              styles.quantityButton,
              isSubmitting && styles.quantityButtonDisabled,
            ]}
            onPress={() => setTemperatureEau((value) => Math.min(45, value + 1))}
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
        <Text style={styles.inputLabel}>Produits</Text>
        <TextInput
          value={produits}
          onChangeText={setProduits}
          placeholder="Gel lavant, huile..."
          style={styles.input}
          editable={!isSubmitting}
        />
      </View>

      <View style={styles.inputGroup}>
        <Text style={styles.inputLabel}>Note</Text>
        <TextInput
          value={noteBain}
          onChangeText={setNoteBain}
          placeholder="Ajouter une note"
          style={styles.input}
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
                next.setFullYear(date.getFullYear(), date.getMonth(), date.getDate());
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
    borderColor: "#e5e7eb",
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: "#f9fafb",
  },
  typeChipActive: {
    backgroundColor: "#fff",
    borderColor: "#6f42c1",
  },
  typeChipDisabled: {
    opacity: 0.5,
  },
  typeChipText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#6b7280",
  },
  typeChipTextActive: {
    color: "#4c2c79",
    fontWeight: "700",
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
  },
  // Chip section
  chipSection: {
    gap: 8,
  },
  chipLabel: {
    fontSize: 12,
    fontWeight: "700",
    color: "#6b7280",
  },
  chipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  chip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: "#f9fafb",
  },
  chipActive: {
    borderColor: "#6f42c1",
    backgroundColor: "#ede7f6",
  },
  chipText: {
    fontSize: 12,
    color: "#6b7280",
    fontWeight: "600",
  },
  chipTextActive: {
    color: "#4c2c79",
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
    borderColor: "#d7dbe0",
    backgroundColor: "#f5f6f8",
  },
  dateButtonDisabled: {
    opacity: 0.5,
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
  sleepSelectedDateTime: {
    alignItems: "center",
    marginBottom: 16,
  },
  selectedDate: {
    fontSize: 16,
    color: "#333",
    fontWeight: "600",
    marginBottom: 4,
  },
  sleepSelectedDate: {
    fontSize: 16,
    color: "#333",
    fontWeight: "600",
    marginBottom: 4,
    textTransform: "capitalize",
  },
  selectedTime: {
    fontSize: 20,
    color: "#374151",
    fontWeight: "600",
  },
  sleepSelectedTime: {
    fontSize: 20,
    color: "#374151",
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
    borderColor: "#d1d5db",
    alignItems: "center",
    justifyContent: "center",
  },
  checkboxChecked: {
    backgroundColor: "#6f42c1",
    borderColor: "#6f42c1",
  },
  checkboxLabel: {
    fontSize: 12,
    color: "#6b7280",
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
