import { Colors } from "@/constants/theme";
import { eventColors } from "@/constants/eventColors";
import { useBaby } from "@/contexts/BabyContext";
import { useModal } from "@/contexts/ModalContext";
import { useSuccessAnimation } from "@/contexts/SuccessAnimationContext";
import { useToast } from "@/contexts/ToastContext";
import { useColorScheme } from "@/hooks/use-color-scheme";
import {
  ajouterVaccin,
  ajouterVitamine,
  modifierVaccin,
  modifierVitamine,
  supprimerVaccin,
  supprimerVitamine,
} from "@/migration/eventsDoubleWriteService";
import { normalizeQuery } from "@/utils/text";

// Helper to remove undefined values from objects (Firebase doesn't accept undefined)
function removeUndefined<T extends Record<string, unknown>>(obj: T): T {
  return Object.fromEntries(
    Object.entries(obj).filter(([, v]) => v !== undefined)
  ) as T;
}
import FontAwesome5 from "@expo/vector-icons/FontAwesome5";
import DateTimePicker from "@react-native-community/datetimepicker";
import { useCallback, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

// ============================================
// TYPES
// ============================================

export type ImmunizationType = "vaccin" | "vitamine";

// Initial data for editing an existing immunization
export interface ImmunizationEditData {
  id: string;
  date: Date;
  // Vaccin fields
  nomVaccin?: string;
  vaccinDosage?: string;
  // Vitamine fields
  nomVitamine?: string;
  gouttesCount?: number;
  vitamineDosage?: string;
}

export interface ImmunizationFormProps {
  type: ImmunizationType;
  onSuccess: () => void;
  onCancel: () => void;
  isSubmitting: boolean;
  setIsSubmitting: (value: boolean) => void;
  onFormStepChange?: (isInPicker: boolean) => void;
  // Edit mode props
  editData?: ImmunizationEditData;
  onDelete?: () => void;
}

type FormStep = "form" | "vaccinPicker" | "vitaminePicker";

// ============================================
// CONSTANTS
// ============================================

const VACCINS_LIST = [
  { nomVaccin: "BCG (Tuberculose)", dosage: null },
  { nomVaccin: "Bronchiolite", dosage: null },
  { nomVaccin: "DTCaP", dosage: "rappel" },
  { nomVaccin: "Diphtérie, Tétanos, Coqueluche, Polio, Haemophilus (DTCaP-Hib)", dosage: "1ère injection" },
  { nomVaccin: "Diphtérie, Tétanos, Coqueluche, Polio, Haemophilus (DTCaP-Hib)", dosage: "2ème injection" },
  { nomVaccin: "Diphtérie, Tétanos, Coqueluche, Polio, Haemophilus (DTCaP-Hib)", dosage: "3ème injection" },
  { nomVaccin: "Diphtérie, Tétanos, Coqueluche, Polio, Haemophilus (DTCaP-Hib)", dosage: "rappel" },
  { nomVaccin: "Grippe saisonnière", dosage: "" },
  { nomVaccin: "Hépatite B", dosage: "" },
  { nomVaccin: "Méningocoque A,C,W,Y", dosage: "1ère injection" },
  { nomVaccin: "Méningocoque A,C,W,Y", dosage: "rappel" },
  { nomVaccin: "Méningocoque B", dosage: "1ère injection" },
  { nomVaccin: "Méningocoque B", dosage: "rappel" },
  { nomVaccin: "Pneumocoque (PCV13)", dosage: "1ère injection" },
  { nomVaccin: "Pneumocoque (PCV13)", dosage: "2ème injection" },
  { nomVaccin: "Pneumocoque (PCV13)", dosage: "3ème injection" },
  { nomVaccin: "Pneumocoque (PCV13)", dosage: "rappel" },
  { nomVaccin: "ROR (Rougeole, Oreillons, Rubéole)", dosage: "1ère injection" },
  { nomVaccin: "ROR (Rougeole, Oreillons, Rubéole)", dosage: "2ème injection" },
  { nomVaccin: "Rotavirus", dosage: "1ère injection" },
  { nomVaccin: "Rotavirus", dosage: "2ème injection" },
  { nomVaccin: "Rotavirus", dosage: "3ème injection" },
  { nomVaccin: "Varicelle", dosage: "" },
  { nomVaccin: "Autre vaccin", dosage: "" },
];

const VITAMINES_LIST = ["Vitamine D", "Vitamine K", "Autre vitamine"];

// ============================================
// HELPERS
// ============================================

const getVaccinDisplay = (nomVaccin: string, dosage?: string | null) =>
  dosage ? `${nomVaccin} - ${dosage}` : nomVaccin;

// ============================================
// COMPONENT
// ============================================

export function ImmunizationForm({
  type,
  onSuccess,
  onCancel,
  isSubmitting,
  setIsSubmitting,
  onFormStepChange,
  editData,
  onDelete,
}: ImmunizationFormProps) {
  const { activeChild } = useBaby();
  const { showAlert } = useModal();
  const { showToast } = useToast();
  const { showSuccess } = useSuccessAnimation();
  const colorScheme = useColorScheme() ?? "light";

  const isEditing = !!editData;

  // Form state
  const [formStep, setFormStepInternal] = useState<FormStep>("form");

  // Wrapper to notify parent of step changes
  const setFormStep = useCallback((step: FormStep) => {
    setFormStepInternal(step);
    onFormStepChange?.(step !== "form");
  }, [onFormStepChange]);
  const [dateHeure, setDateHeure] = useState<Date>(editData?.date ?? new Date());
  const [showDate, setShowDate] = useState(false);
  const [showTime, setShowTime] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  // Vaccin state
  const [vaccinName, setVaccinName] = useState(editData?.nomVaccin ?? "");
  const [vaccinDosage, setVaccinDosage] = useState(editData?.vaccinDosage ?? "");
  const [vaccinCustomName, setVaccinCustomName] = useState("");

  // Vitamine state
  const [vitamineName, setVitamineName] = useState(
    editData?.nomVitamine ?? (type === "vitamine" ? "Vitamine D" : "")
  );
  const [vitamineDosage, setVitamineDosage] = useState(editData?.vitamineDosage ?? "");
  const [vitamineCustomName, setVitamineCustomName] = useState("");
  const [gouttesCount, setGouttesCount] = useState(editData?.gouttesCount ?? 3);

  // Long press acceleration
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  // Filtered lists
  const filteredVaccins = useMemo(
    () =>
      VACCINS_LIST.filter((vaccin) =>
        normalizeQuery(vaccin.nomVaccin).includes(normalizeQuery(searchQuery)),
      ),
    [searchQuery],
  );

  const filteredVitamines = useMemo(
    () =>
      VITAMINES_LIST.filter((vitamine) =>
        normalizeQuery(vitamine).includes(normalizeQuery(searchQuery)),
      ),
    [searchQuery],
  );

  // Handlers
  const handleSubmit = async () => {
    if (isSubmitting || !activeChild?.id) return;

    try {
      setIsSubmitting(true);
      const common = { date: dateHeure };

      if (type === "vaccin") {
        const normalizedVaccinName =
          vaccinName === "Autre vaccin" ? vaccinCustomName : vaccinName;
        if (!normalizedVaccinName.trim()) {
          showAlert("Erreur", "Indiquez un vaccin.");
          setIsSubmitting(false);
          return;
        }
        const finalDosage = vaccinDosage.trim() || undefined;
        const vaccinData = removeUndefined({
          ...common,
          nomVaccin: normalizedVaccinName.trim(),
          dosage: finalDosage,
        });

        if (isEditing && editData?.id) {
          await modifierVaccin(activeChild.id, editData.id, vaccinData);
          showToast("Vaccin modifié");
          showSuccess("vaccine", "Vaccin modifié");
        } else {
          await ajouterVaccin(activeChild.id, vaccinData);
          showToast("Vaccin enregistré");
          showSuccess("vaccine", "Vaccin enregistré");
        }
      } else {
        const normalizedVitamineName =
          vitamineName === "Autre vitamine" ? vitamineCustomName : vitamineName;
        if (!normalizedVitamineName.trim()) {
          showAlert("Erreur", "Indiquez une vitamine.");
          setIsSubmitting(false);
          return;
        }
        const computedDosage =
          vitamineName === "Vitamine D" || vitamineName === "Vitamine K"
            ? `${gouttesCount} gouttes`
            : vitamineDosage.trim() || undefined;
        const vitamineData = removeUndefined({
          ...common,
          nomVitamine: normalizedVitamineName.trim(),
          dosage: computedDosage,
        });

        if (isEditing && editData?.id) {
          await modifierVitamine(activeChild.id, editData.id, vitamineData);
          showToast("Vitamine modifiée");
          showSuccess("vitamin", "Vitamine modifiée");
        } else {
          await ajouterVitamine(activeChild.id, vitamineData);
          showToast("Vitamine enregistrée");
          showSuccess("vitamin", "Vitamine enregistrée");
        }
      }

      onSuccess();
    } catch (error) {
      console.error("Erreur lors de la sauvegarde:", error);
      showAlert("Erreur", "Impossible de sauvegarder. Veuillez réessayer.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (isSubmitting || !activeChild?.id || !editData?.id) return;

    try {
      setIsSubmitting(true);
      if (type === "vaccin") {
        await supprimerVaccin(activeChild.id, editData.id);
        showToast("Vaccin supprimé");
        showSuccess("vaccine", "Vaccin supprimé");
      } else {
        await supprimerVitamine(activeChild.id, editData.id);
        showToast("Vitamine supprimée");
        showSuccess("vitamin", "Vitamine supprimée");
      }
      onDelete?.();
    } catch (error) {
      console.error("Erreur lors de la suppression:", error);
      showAlert("Erreur", "Impossible de supprimer. Veuillez réessayer.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const onChangeDate = (event: any, selectedDate?: Date) => {
    setShowDate(false);
    if (selectedDate) {
      setDateHeure((prev) => {
        const newDate = new Date(prev);
        newDate.setFullYear(
          selectedDate.getFullYear(),
          selectedDate.getMonth(),
          selectedDate.getDate(),
        );
        return newDate;
      });
    }
  };

  const onChangeTime = (event: any, selectedDate?: Date) => {
    setShowTime(false);
    if (selectedDate) {
      setDateHeure((prev) => {
        const newDate = new Date(prev);
        newDate.setHours(selectedDate.getHours(), selectedDate.getMinutes());
        return newDate;
      });
    }
  };

  const selectVaccin = (vaccin: { nomVaccin: string; dosage: string | null }) => {
    setVaccinName(vaccin.nomVaccin);
    setVaccinDosage(vaccin.dosage ?? "");
    setSearchQuery("");
    setFormStep("form");
  };

  const selectVitamine = (vitamine: string) => {
    setVitamineName(vitamine);
    if (vitamine !== "Autre vitamine") {
      setVitamineCustomName("");
    }
    setSearchQuery("");
    setFormStep("form");
  };

  // Expose step for parent to know if we're in picker mode
  const isInPickerStep = formStep !== "form";

  // ============================================
  // RENDER - VACCIN PICKER
  // ============================================

  if (formStep === "vaccinPicker") {
    return (
      <View style={styles.pickerContainer}>
        <View style={styles.sheetBreadcrumb}>
          <Pressable
            style={styles.sheetBackButton}
            onPress={() => setFormStep("form")}
          >
            <FontAwesome5 name="chevron-left" size={14} color="#666" />
            <Text style={styles.sheetBackText}>Retour</Text>
          </Pressable>
          <Text style={styles.sheetBreadcrumbText}>Choisir un vaccin</Text>
        </View>
        <View style={styles.searchContainer}>
          <FontAwesome5
            name="search"
            size={16}
            color="#999"
            style={styles.searchIcon}
          />
          <TextInput
            style={styles.searchInput}
            placeholder="Rechercher un vaccin..."
            value={searchQuery}
            onChangeText={setSearchQuery}
            autoFocus
          />
          {searchQuery ? (
            <TouchableOpacity
              style={styles.clearButton}
              onPress={() => setSearchQuery("")}
            >
              <FontAwesome5 name="times-circle" size={16} color="#999" />
            </TouchableOpacity>
          ) : null}
        </View>
        <ScrollView style={styles.vaccinList}>
          {filteredVaccins.length > 0 ? (
            filteredVaccins.map((vaccin, index) => {
              const isSelected =
                vaccinName === vaccin.nomVaccin &&
                (vaccinDosage || "") === (vaccin.dosage ?? "");
              return (
                <TouchableOpacity
                  key={`${vaccin.nomVaccin}-${vaccin.dosage}-${index}`}
                  style={[
                    styles.vaccinListItem,
                    isSelected && {
                      backgroundColor: Colors[colorScheme].tint + "20",
                    },
                  ]}
                  onPress={() => selectVaccin(vaccin)}
                >
                  <FontAwesome5
                    name="syringe"
                    size={16}
                    color={isSelected ? Colors[colorScheme].tint : "#666"}
                    style={styles.vaccinListItemIcon}
                  />
                  <View style={styles.vaccinListItemTextWrap}>
                    <Text
                      style={[
                        styles.vaccinListItemText,
                        isSelected && styles.vaccinListItemTextSelected,
                      ]}
                    >
                      {vaccin.nomVaccin}
                    </Text>
                    {vaccin.dosage ? (
                      <Text style={styles.vaccinListItemSubtext}>
                        {vaccin.dosage}
                      </Text>
                    ) : null}
                  </View>
                  {isSelected && (
                    <FontAwesome5
                      name="check"
                      size={16}
                      color={Colors[colorScheme].tint}
                    />
                  )}
                </TouchableOpacity>
              );
            })
          ) : (
            <Text style={styles.noResultsText}>Aucun vaccin trouvé</Text>
          )}
        </ScrollView>
      </View>
    );
  }

  // ============================================
  // RENDER - VITAMINE PICKER
  // ============================================

  if (formStep === "vitaminePicker") {
    return (
      <View style={styles.pickerContainer}>
        <View style={styles.sheetBreadcrumb}>
          <Pressable
            style={styles.sheetBackButton}
            onPress={() => setFormStep("form")}
          >
            <FontAwesome5 name="chevron-left" size={14} color="#666" />
            <Text style={styles.sheetBackText}>Retour</Text>
          </Pressable>
          <Text style={styles.sheetBreadcrumbText}>Choisir une vitamine</Text>
        </View>
        <View style={styles.searchContainer}>
          <FontAwesome5
            name="search"
            size={16}
            color="#999"
            style={styles.searchIcon}
          />
          <TextInput
            style={styles.searchInput}
            placeholder="Rechercher une vitamine..."
            value={searchQuery}
            onChangeText={setSearchQuery}
            autoFocus
          />
          {searchQuery ? (
            <TouchableOpacity
              style={styles.clearButton}
              onPress={() => setSearchQuery("")}
            >
              <FontAwesome5 name="times-circle" size={16} color="#999" />
            </TouchableOpacity>
          ) : null}
        </View>
        <ScrollView style={styles.vaccinList}>
          {filteredVitamines.length > 0 ? (
            filteredVitamines.map((vitamine) => {
              const isSelected = vitamineName === vitamine;
              return (
                <TouchableOpacity
                  key={vitamine}
                  style={[
                    styles.vaccinListItem,
                    isSelected && {
                      backgroundColor: Colors[colorScheme].tint + "20",
                    },
                  ]}
                  onPress={() => selectVitamine(vitamine)}
                >
                  <FontAwesome5
                    name="pills"
                    size={16}
                    color={isSelected ? Colors[colorScheme].tint : "#666"}
                    style={styles.vaccinListItemIcon}
                  />
                  <Text
                    style={[
                      styles.vaccinListItemText,
                      isSelected && styles.vaccinListItemTextSelected,
                    ]}
                  >
                    {vitamine}
                  </Text>
                  {isSelected && (
                    <FontAwesome5
                      name="check"
                      size={16}
                      color={Colors[colorScheme].tint}
                    />
                  )}
                </TouchableOpacity>
              );
            })
          ) : (
            <Text style={styles.noResultsText}>Aucune vitamine trouvée</Text>
          )}
        </ScrollView>
      </View>
    );
  }

  // ============================================
  // RENDER - MAIN FORM
  // ============================================

  return (
    <View style={styles.formContainer}>
      {/* Vaccin form */}
      {type === "vaccin" && (
        <>
          <TouchableOpacity
            style={[
              styles.vaccinSelector,
              isSubmitting && styles.vaccinSelectorDisabled,
            ]}
            onPress={() => {
              if (isSubmitting) return;
              setSearchQuery("");
              setFormStep("vaccinPicker");
            }}
            disabled={isSubmitting}
          >
            <FontAwesome5 name="syringe" size={16} color="#666" />
            <Text
              style={[
                styles.vaccinSelectorText,
                vaccinName && styles.vaccinSelectorTextSelected,
              ]}
            >
              {vaccinName || "Sélectionner un vaccin"}
            </Text>
            <FontAwesome5 name="chevron-right" size={14} color="#999" />
          </TouchableOpacity>

          {vaccinName === "Autre vaccin" && (
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Nom du vaccin</Text>
              <TextInput
                value={vaccinCustomName}
                onChangeText={setVaccinCustomName}
                placeholder="Nom du vaccin"
                style={styles.input}
                editable={!isSubmitting}
              />
            </View>
          )}

          {vaccinName && vaccinName !== "Autre vaccin" && vaccinDosage ? (
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Dose</Text>
              <Text style={styles.readOnlyValue}>{vaccinDosage}</Text>
            </View>
          ) : null}

          {vaccinName === "Autre vaccin" && (
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Dose</Text>
              <TextInput
                value={vaccinDosage}
                onChangeText={setVaccinDosage}
                placeholder="1ère injection"
                style={styles.input}
                editable={!isSubmitting}
              />
            </View>
          )}
        </>
      )}

      {/* Vitamine form */}
      {type === "vitamine" && (
        <>
          <TouchableOpacity
            style={[
              styles.vaccinSelector,
              isSubmitting && styles.vaccinSelectorDisabled,
            ]}
            onPress={() => {
              if (isSubmitting) return;
              setSearchQuery("");
              setFormStep("vitaminePicker");
            }}
            disabled={isSubmitting}
          >
            <FontAwesome5 name="pills" size={16} color="#666" />
            <Text
              style={[
                styles.vaccinSelectorText,
                vitamineName && styles.vaccinSelectorTextSelected,
              ]}
            >
              {vitamineName || "Sélectionner une vitamine"}
            </Text>
            <FontAwesome5 name="chevron-right" size={14} color="#999" />
          </TouchableOpacity>

          {vitamineName === "Autre vitamine" && (
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Nom de la vitamine</Text>
              <TextInput
                value={vitamineCustomName}
                onChangeText={setVitamineCustomName}
                placeholder="Nom de la vitamine"
                style={styles.input}
                editable={!isSubmitting}
              />
            </View>
          )}

          {(vitamineName === "Vitamine D" || vitamineName === "Vitamine K") && (
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Quantité</Text>
              <View style={styles.quantityPickerRow}>
                <TouchableOpacity
                  style={[
                    styles.quantityButton,
                    isSubmitting && styles.quantityButtonDisabled,
                  ]}
                  onPressIn={() =>
                    handlePressIn(() =>
                      setGouttesCount((value) => Math.max(0, value - 1)),
                    )
                  }
                  onPressOut={handlePressOut}
                  disabled={isSubmitting}
                >
                  <Text style={styles.quantityButtonText}>-</Text>
                </TouchableOpacity>
                <Text style={styles.quantityPickerValue}>
                  {gouttesCount} gouttes
                </Text>
                <TouchableOpacity
                  style={[
                    styles.quantityButton,
                    isSubmitting && styles.quantityButtonDisabled,
                  ]}
                  onPressIn={() =>
                    handlePressIn(() => setGouttesCount((value) => value + 1))
                  }
                  onPressOut={handlePressOut}
                  disabled={isSubmitting}
                >
                  <Text style={styles.quantityButtonText}>+</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}

          {vitamineName &&
            vitamineName !== "Vitamine D" &&
            vitamineName !== "Vitamine K" &&
            vitamineName !== "Autre vitamine" && (
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Dosage</Text>
                <TextInput
                  value={vitamineDosage}
                  onChangeText={setVitamineDosage}
                  placeholder="1 goutte"
                  style={styles.input}
                  editable={!isSubmitting}
                />
              </View>
            )}
        </>
      )}

      {/* Date & Time */}
      <View style={styles.dateTimeSection}>
        <View style={styles.dateTimeContainer}>
          <TouchableOpacity
            style={styles.dateButton}
            onPress={() => setShowDate(true)}
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
            onPress={() => setShowTime(true)}
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
      </View>

      {showDate && (
        <DateTimePicker
          value={dateHeure}
          mode="date"
          display={Platform.OS === "ios" ? "spinner" : "default"}
          onChange={onChangeDate}
        />
      )}
      {showTime && (
        <DateTimePicker
          value={dateHeure}
          mode="time"
          is24Hour
          display={Platform.OS === "ios" ? "spinner" : "default"}
          onChange={onChangeTime}
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
            {isSubmitting ? (
              <ActivityIndicator size="small" color="white" />
            ) : (
              <Text style={styles.validateText}>
                {isEditing ? "Enregistrer" : "Ajouter"}
              </Text>
            )}
          </TouchableOpacity>
        </View>

        {isEditing && onDelete && (
          <TouchableOpacity
            style={[styles.deleteButton, isSubmitting && styles.buttonDisabled]}
            onPress={handleDelete}
            disabled={isSubmitting}
          >
            <FontAwesome5 name="trash" size={14} color="#dc3545" />
            <Text style={styles.deleteText}>Supprimer</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

// ============================================
// Hook to get form step state
// ============================================

export function useImmunizationFormStep() {
  const [formStep, setFormStep] = useState<FormStep>("form");
  return { formStep, setFormStep, isInPickerStep: formStep !== "form" };
}

// ============================================
// STYLES
// ============================================

const styles = StyleSheet.create({
  formContainer: {
    gap: 12,
  },
  pickerContainer: {
    flex: 1,
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
  readOnlyValue: {
    borderWidth: 1,
    borderColor: "#e5e7eb",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: "#4b5563",
    backgroundColor: "#f9fafb",
  },
  vaccinSelector: {
    backgroundColor: "#f8f9fa",
    padding: 16,
    borderRadius: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderWidth: 1,
    borderColor: "#e9ecef",
    marginBottom: 8,
  },
  vaccinSelectorDisabled: {
    backgroundColor: "#f5f5f5",
    opacity: 0.5,
  },
  vaccinSelectorText: {
    flex: 1,
    fontSize: 16,
    color: "#999",
  },
  vaccinSelectorTextSelected: {
    color: "#333",
    fontWeight: "500",
  },
  quantityPickerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 16,
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
  quantityPickerValue: {
    fontSize: 16,
    fontWeight: "600",
    color: "#333",
    minWidth: 100,
    textAlign: "center",
  },
  dateTimeSection: {
    paddingTop: 20,
  },
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
    fontWeight: "600",
    color: "#333",
    marginBottom: 4,
  },
  selectedTime: {
    fontSize: 20,
    fontWeight: "600",
    color: "#374151",
  },
  sheetBreadcrumb: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  sheetBackButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 6,
    paddingHorizontal: 4,
  },
  sheetBackText: {
    fontSize: 14,
    color: "#666",
    fontWeight: "600",
  },
  sheetBreadcrumbText: {
    fontSize: 12,
    color: "#999",
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  searchContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#f8f9fa",
    borderRadius: 12,
    paddingHorizontal: 12,
    marginVertical: 12,
    borderWidth: 1,
    borderColor: "#e9ecef",
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    color: "#333",
    paddingVertical: 10,
  },
  searchIcon: {
    marginRight: 8,
  },
  clearButton: {
    padding: 4,
  },
  vaccinList: {
    flex: 1,
  },
  vaccinListItem: {
    flexDirection: "row",
    alignItems: "center",
    padding: 16,
    gap: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#f0f0f0",
    borderRadius: 12,
  },
  vaccinListItemIcon: {
    width: 18,
    textAlign: "center",
  },
  vaccinListItemText: {
    flex: 1,
    fontSize: 16,
    color: "#333",
  },
  vaccinListItemTextWrap: {
    flex: 1,
    gap: 2,
  },
  vaccinListItemSubtext: {
    fontSize: 12,
    color: "#6b7280",
  },
  vaccinListItemTextSelected: {
    fontWeight: "600",
  },
  noResultsText: {
    fontSize: 16,
    color: "#666",
    textAlign: "center",
    padding: 20,
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
