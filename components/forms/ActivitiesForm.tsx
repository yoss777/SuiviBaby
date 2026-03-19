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
import * as Haptics from "expo-haptics";
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
import { getNeutralColors } from "@/constants/dashboardColors";
import {
  ajouterActivite,
  modifierActivite,
  supprimerActivite,
} from "@/migration/eventsDoubleWriteService";
import { obtenirEvenements } from "@/services/eventsService";
import type { EventType } from "@/services/eventsService";

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
  heureDebut?: Date | { seconds: number } | { toDate: () => Date };
  heureFin?: Date | { seconds: number } | { toDate: () => Date };
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
  promenadeEnCours?: { id: string } | null;
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
  promenadeEnCours,
}) => {
  const { activeChild } = useBaby();
  const { showAlert, showConfirm } = useModal();
  const { showToast } = useToast();
  const { showSuccess } = useSuccessAnimation();
  const colorScheme = useColorScheme() ?? "light";
  const nc = getNeutralColors(colorScheme);
  const isDark = colorScheme === "dark";

  // Chip colors aligned with RoutinesForm pattern
  const chipActiveColors = isDark
    ? { bg: eventColors.activite.dark + "30", border: "#6EE7B7", text: "#A7F3D0" }
    : { bg: "#ECFDF5", border: eventColors.activite.dark, text: "#065F46" };

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

  // Promenade always uses heureDebut/heureFin pickers (like sommeil)
  const isChronoMode = typeActivite === "promenade";
  const hasEditHeureFin = !!editData?.heureFin;
  const [isOngoing, setIsOngoing] = useState(
    isChronoMode && !!editData?.heureDebut && !editData?.heureFin,
  );
  const [heureDebut, setHeureDebut] = useState<Date>(
    editData?.heureDebut ? toDate(editData.heureDebut) : new Date(),
  );
  const [heureFin, setHeureFin] = useState<Date | null>(
    editData?.heureFin ? toDate(editData.heureFin) : null,
  );
  const [showChronoDate, setShowChronoDate] = useState(false);
  const [showStartPicker, setShowStartPicker] = useState(false);
  const [showEndPicker, setShowEndPicker] = useState(false);

  // Auto-compute duree from heureDebut/heureFin in chrono mode
  const chronoDuree = isChronoMode && heureFin
    ? Math.max(1, Math.round((heureFin.getTime() - heureDebut.getTime()) / 60000))
    : duree;

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
    if (isChronoMode && !isOngoing && heureFin && heureFin <= heureDebut) {
      showAlert("Erreur", "L'heure de fin doit être après l'heure de début.");
      return;
    }
    try {
      setIsSubmitting(true);

      // Prevent duplicate ongoing promenade (same pattern as RoutinesForm for sleep)
      if (isChronoMode && isOngoing && !isEditing) {
        let hasOngoing = !!promenadeEnCours;
        if (!promenadeEnCours && activeChild?.id) {
          const recentActivites = await obtenirEvenements(activeChild.id, {
            type: "activite" as EventType,
            limite: 10,
          });
          hasOngoing = recentActivites.some(
            (e: any) => e.typeActivite === "promenade" && e.heureDebut && !e.heureFin,
          );
        }
        if (hasOngoing) {
          showAlert(
            "Attention",
            "Une promenade est déjà en cours. Terminez-la avant d'en commencer une nouvelle.",
          );
          setIsSubmitting(false);
          return;
        }
      }
      const isEditingSamePromenade = editData && promenadeEnCours && editData.id === promenadeEnCours.id;
      if (isChronoMode && isOngoing && isEditing && !isEditingSamePromenade) {
        showAlert(
          "Attention",
          "Une autre promenade est déjà en cours. Terminez-la d'abord.",
        );
        setIsSubmitting(false);
        return;
      }
      // Build data — iso sommeil pattern: null for ongoing fields, undefined to omit
      const fin = isOngoing ? null : (heureFin ?? undefined);
      const computedDuree = heureDebut && fin
        ? Math.max(1, Math.round((fin.getTime() - heureDebut.getTime()) / 60000))
        : undefined;

      if (isChronoMode && editData) {
        // Edit mode: keep null values to trigger deleteField (iso modifierSommeil)
        const editPayload: Record<string, any> = {
          date: heureDebut,
          typeActivite,
          heureDebut,
          heureFin: isOngoing ? null : fin,
          duree: isOngoing ? null : computedDuree,
          description: description.trim() || undefined,
          note: description.trim() || undefined,
        };
        // Remove undefined but KEEP null (CF converts null → deleteField)
        const cleanedPayload = Object.fromEntries(
          Object.entries(editPayload).filter(([, v]) => v !== undefined),
        );
        await modifierActivite(activeChild.id, editData.id, cleanedPayload);
        showSuccess("activity", "Promenade modifiée");
      } else if (isChronoMode) {
        // Create mode: use removeUndefined (no null needed for new events)
        const data = removeUndefined({
          date: heureDebut,
          typeActivite,
          heureDebut,
          heureFin: fin ?? undefined,
          duree: computedDuree,
          description: description.trim() || undefined,
          note: description.trim() || undefined,
        });
        await ajouterActivite(activeChild.id, data);
        showSuccess("activity", "Promenade ajoutée");
      } else {
        // Non-chrono activities
        const data = removeUndefined({
          date: dateHeure,
          typeActivite,
          duree: duree || undefined,
          description: description.trim() || undefined,
          note: description.trim() || undefined,
        });
        if (editData) {
          await modifierActivite(activeChild.id, editData.id, data);
          showSuccess("activity", "Activité modifiée");
        } else {
          await ajouterActivite(activeChild.id, data);
          showSuccess("activity", "Activité ajoutée");
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

    showConfirm(
      "Supprimer",
      "Voulez-vous vraiment supprimer cette activité ?",
      async () => {
        try {
          setIsSubmitting(true);
        await supprimerActivite(activeChild.id, editData.id);
        showToast("Activité supprimée");
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
        <Text style={[styles.inputLabel, { color: nc.textLight }]}>
          Type d&apos;activité
        </Text>
        <View style={styles.typeRow}>
          {(Object.keys(TYPE_CONFIG) as ActiviteType[]).map((type) => {
            const config = TYPE_CONFIG[type];
            const active = typeActivite === type;
            return (
              <TouchableOpacity
                key={type}
                style={[
                  styles.typeChip,
                  { borderColor: nc.border, backgroundColor: nc.background },
                  active && {
                    backgroundColor: chipActiveColors.bg,
                    borderColor: chipActiveColors.border,
                  },
                ]}
                onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setTypeActivite(type); }}
                disabled={isSubmitting}
                accessibilityLabel={config.label}
                hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
              >
                <Text
                  style={[
                    styles.typeChipText,
                    { color: nc.textLight },
                    active && {
                      color: chipActiveColors.text,
                      fontWeight: "700",
                    },
                  ]}
                >
                  {config.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      {/* Chrono mode: date + heureDebut/heureFin pickers (promenade) */}
      {isChronoMode ? (
        <View style={styles.inputGroup}>
          {/* Date */}
          <Text style={[styles.inputLabel, { color: nc.textLight }]}>
            {"Date"}
          </Text>
          <TouchableOpacity
            style={[
              styles.chronoRow,
              { borderColor: nc.border, backgroundColor: nc.background },
            ]}
            onPress={() => {
              setShowChronoDate(true);
              onFormStepChange?.(true);
            }}
            disabled={isSubmitting}
            accessibilityLabel="Modifier la date"
            accessibilityHint="Ouvre le sélecteur de date"
          >
            <FontAwesome5 name="calendar-alt" size={14} color={Colors[colorScheme].tint} />
            <Text style={[styles.chronoValue, { color: nc.textStrong, fontSize: 15, fontWeight: "500" }]}>
              {heureDebut.toLocaleDateString("fr-FR", {
                weekday: "long",
                day: "numeric",
                month: "long",
              })}
            </Text>
          </TouchableOpacity>
          {showChronoDate && (
            <DateTimePicker
              value={heureDebut}
              mode="date"
              display={Platform.OS === "ios" ? "spinner" : "default"}
              themeVariant={colorScheme}
              onChange={(_, date) => {
                setShowChronoDate(false);
                onFormStepChange?.(false);
                if (date) {
                  // Update date on both heureDebut and heureFin, keep times
                  setHeureDebut((prev) => {
                    const next = new Date(prev);
                    next.setFullYear(date.getFullYear(), date.getMonth(), date.getDate());
                    return next;
                  });
                  setHeureFin((prev) => {
                    if (!prev) return prev;
                    const next = new Date(prev);
                    next.setFullYear(date.getFullYear(), date.getMonth(), date.getDate());
                    return next;
                  });
                }
              }}
            />
          )}

          {/* Horaires */}
          <Text style={[styles.inputLabel, { color: nc.textLight, marginTop: 8 }]}>
            {"Horaires"}
          </Text>

          {/* Heure de début */}
          <TouchableOpacity
            style={[
              styles.chronoRow,
              { borderColor: nc.border, backgroundColor: nc.background },
            ]}
            onPress={() => {
              setShowStartPicker(true);
              onFormStepChange?.(true);
            }}
            disabled={isSubmitting}
            accessibilityLabel="Modifier l'heure de début"
            accessibilityHint="Ouvre le sélecteur d'heure"
          >
            <Text style={[styles.chronoLabel, { color: nc.textLight }]}>
              {"Début"}
            </Text>
            <Text style={[styles.chronoValue, { color: nc.textStrong }]}>
              {heureDebut.toLocaleTimeString("fr-FR", {
                hour: "2-digit",
                minute: "2-digit",
              })}
            </Text>
          </TouchableOpacity>

          {/* En cours toggle */}
          <TouchableOpacity
            style={[
              styles.chronoRow,
              {
                borderColor: isOngoing ? chipActiveColors.border : nc.border,
                backgroundColor: isOngoing ? chipActiveColors.bg : nc.background,
              },
            ]}
            onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setIsOngoing((prev) => !prev); }}
            disabled={isSubmitting}
            accessibilityRole="switch"
            accessibilityLabel="Promenade en cours"
            accessibilityState={{ checked: isOngoing }}
            accessibilityHint="Active si la promenade est toujours en cours"
          >
            <Text style={[styles.chronoLabel, { color: isOngoing ? chipActiveColors.text : nc.textLight }]}>
              {"En cours"}
            </Text>
            <FontAwesome5
              name={isOngoing ? "toggle-on" : "toggle-off"}
              size={22}
              color={isOngoing ? chipActiveColors.border : nc.textMuted}
            />
          </TouchableOpacity>

          {/* Heure de fin (hidden if ongoing) */}
          {!isOngoing && (
            <>
              <TouchableOpacity
                style={[
                  styles.chronoRow,
                  { borderColor: nc.border, backgroundColor: nc.background },
                ]}
                onPress={() => {
                  setShowEndPicker(true);
                  onFormStepChange?.(true);
                }}
                disabled={isSubmitting}
                accessibilityLabel="Modifier l'heure de fin"
                accessibilityHint="Ouvre le sélecteur d'heure"
              >
                <Text style={[styles.chronoLabel, { color: nc.textLight }]}>
                  {"Fin"}
                </Text>
                <Text style={[styles.chronoValue, { color: nc.textStrong }]}>
                  {(heureFin ?? new Date()).toLocaleTimeString("fr-FR", {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </Text>
              </TouchableOpacity>

              {/* Durée calculée */}
              <View style={styles.chronoDureeRow}>
                <FontAwesome5 name="clock" size={12} color={nc.textMuted} />
                <Text style={[styles.chronoDureeText, { color: nc.textMuted }]}>
                  {`Durée : ${chronoDuree} min`}
                </Text>
              </View>
            </>
          )}

          {/* Start time picker */}
          {showStartPicker && (
            <DateTimePicker
              value={heureDebut}
              mode="time"
              is24Hour
              display={Platform.OS === "ios" ? "spinner" : "default"}
              themeVariant={colorScheme}
              onChange={(_, date) => {
                setShowStartPicker(false);
                onFormStepChange?.(false);
                if (date) {
                  setHeureDebut(date);
                  // Push heureFin if it would be before new heureDebut
                  if (heureFin && date >= heureFin) {
                    setHeureFin(new Date(date.getTime() + 60000));
                  }
                }
              }}
            />
          )}
          {/* End time picker */}
          {showEndPicker && (
            <DateTimePicker
              value={heureFin ?? new Date()}
              mode="time"
              is24Hour
              minimumDate={heureDebut}
              display={Platform.OS === "ios" ? "spinner" : "default"}
              themeVariant={colorScheme}
              onChange={(_, date) => {
                setShowEndPicker(false);
                onFormStepChange?.(false);
                if (date) {
                  // Ensure heureFin is after heureDebut
                  setHeureFin(date > heureDebut ? date : new Date(heureDebut.getTime() + 60000));
                }
              }}
            />
          )}
        </View>
      ) : (
        /* Standard mode: duration stepper */
        <View style={styles.inputGroup}>
          <Text style={[styles.inputLabel, { color: nc.textLight }]}>
            {"Durée (minutes)"}
          </Text>
          <View style={styles.quantityPickerRow}>
            <TouchableOpacity
              style={[
                styles.quantityButton,
                { backgroundColor: nc.backgroundPressed },
                isSubmitting && styles.quantityButtonDisabled,
              ]}
              onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setDuree((value) => Math.max(0, value - 5)); }}
              disabled={isSubmitting}
              accessibilityLabel="Diminuer la durée"
            >
              <Text
                style={[
                  styles.quantityButtonText,
                  { color: nc.textStrong },
                  isSubmitting && { color: nc.textMuted },
                ]}
              >
                -
              </Text>
            </TouchableOpacity>
            <Text style={[styles.quantityPickerValue, { color: nc.textStrong }]}>
              {duree} min
            </Text>
            <TouchableOpacity
              style={[
                styles.quantityButton,
                { backgroundColor: nc.backgroundPressed },
                isSubmitting && styles.quantityButtonDisabled,
              ]}
              onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setDuree((value) => value + 5); }}
              disabled={isSubmitting}
              accessibilityLabel="Augmenter la durée"
            >
              <Text
                style={[
                  styles.quantityButtonText,
                  { color: nc.textStrong },
                  isSubmitting && { color: nc.textMuted },
                ]}
              >
                +
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      <View style={styles.inputGroup}>
        <Text style={[styles.inputLabel, { color: nc.textLight }]}>
          {"Description"}
        </Text>
        <TextInput
          value={description}
          onChangeText={setDescription}
          placeholder="Ajouter une description..."
          placeholderTextColor={nc.textMuted}
          style={[
            styles.input,
            { borderColor: nc.border, color: nc.textStrong },
          ]}
          multiline
          editable={!isSubmitting}
        />
      </View>

      {/* Standard date/time pickers (hidden in chrono mode) */}
      {!isChronoMode && (
        <>
          <View style={styles.dateTimeContainerWithPadding}>
            <TouchableOpacity
              style={[
                styles.dateButton,
                { borderColor: nc.border, backgroundColor: nc.background },
              ]}
              onPress={() => handleShowDate(true)}
              disabled={isSubmitting}
              accessibilityLabel="Choisir la date"
              hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
            >
              <FontAwesome5
                name="calendar-alt"
                size={16}
                color={Colors[colorScheme].tint}
              />
              <Text style={[styles.dateButtonText, { color: nc.textNormal }]}>
                Date
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.dateButton,
                { borderColor: nc.border, backgroundColor: nc.background },
              ]}
              onPress={() => handleShowTime(true)}
              disabled={isSubmitting}
              accessibilityLabel="Choisir l'heure"
              hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
            >
              <FontAwesome5
                name="clock"
                size={16}
                color={Colors[colorScheme].tint}
              />
              <Text style={[styles.dateButtonText, { color: nc.textNormal }]}>
                Heure
              </Text>
            </TouchableOpacity>
          </View>

          <View style={styles.selectedDateTime}>
            <Text
              style={[styles.selectedDate, { color: nc.textStrong }]}
              numberOfLines={1}
              adjustsFontSizeToFit
            >
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
      )}

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
              { backgroundColor: Colors[colorScheme].tint },
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
                  color:
                    colorScheme === "dark"
                      ? Colors[colorScheme].background
                      : nc.white,
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
              { backgroundColor: nc.errorBg, borderColor: nc.error + "40" },
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
  },
  input: {
    borderWidth: 1,
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
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  typeChipText: {
    fontSize: 12,
    fontWeight: "600",
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
  dateButtonText: {
    fontSize: 14,
    fontWeight: "600",
  },
  selectedDateTime: {
    alignItems: "center",
    marginBottom: 16,
  },
  selectedDate: {
    fontSize: 16,
    fontWeight: "600",
    marginBottom: 4,
  },
  selectedTime: {
    fontSize: 20,
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
    gap: 8,
  },
  deleteText: {
    fontSize: 14,
    fontWeight: "700",
    letterSpacing: 0.2,
  },
  // Chrono mode styles (promenade)
  chronoRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1,
    marginBottom: 6,
  },
  chronoLabel: {
    fontSize: 14,
    fontWeight: "500",
  },
  chronoValue: {
    fontSize: 18,
    fontWeight: "700",
  },
  chronoDureeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingTop: 4,
  },
  chronoDureeText: {
    fontSize: 13,
    fontWeight: "500",
  },
});
