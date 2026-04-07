// components/forms/RoutinesForm.tsx
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
  EventType,
  modifierEvenementOptimistic,
  obtenirEvenements,
  supprimerEvenement,
} from "@/services/eventsService";
import FontAwesome from "@expo/vector-icons/FontAwesome6";
import React, { useCallback, useEffect, useRef, useState } from "react";
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

export type RoutineType = "sommeil" | "bain" | "nettoyage_nez";
export type SleepMode = "nap" | "night";
export type SleepLocation =
  | "lit"
  | "cododo"
  | "poussette"
  | "voiture"
  | "dans les bras"
  | "autre";
export type SleepQuality = "paisible" | "agité" | "mauvais";
export type NezMethode = "serum" | "mouche_bebe" | "coton" | "autre";
export type NezResultat =
  | "efficace"
  | "mucus_clair"
  | "mucus_epais"
  | "mucus_colore";

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
  // Nettoyage nez fields
  methode?: NezMethode;
  resultat?: NezResultat;
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
  onSheetTypeChange?: (sheetType: "nap" | "night" | "bain" | "nez") => void;
};

// ============================================
// CONSTANTS
// ============================================

const LOCATION_OPTIONS: SleepLocation[] = [
  "lit",
  "cododo",
  "poussette",
  "voiture",
  "dans les bras",
  "autre",
];

const QUALITY_OPTIONS: SleepQuality[] = ["paisible", "agité", "mauvais"];

const METHODE_NEZ_OPTIONS: { value: NezMethode; label: string }[] = [
  { value: "serum", label: "Sérum physiologique" },
  { value: "mouche_bebe", label: "Mouche-bébé" },
  { value: "coton", label: "Coton / mouchoir" },
  { value: "autre", label: "Autre" },
];

const RESULTAT_NEZ_OPTIONS: { value: NezResultat; label: string }[] = [
  { value: "efficace", label: "Efficace" },
  { value: "mucus_clair", label: "Mucus clair" },
  { value: "mucus_epais", label: "Mucus épais" },
  { value: "mucus_colore", label: "Mucus coloré" },
];

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
  onSheetTypeChange,
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

  const isEditingNez = isEditing && editData.type === "nettoyage_nez";

  // Determine initial sheet type
  const getInitialSheetType = (): "nap" | "night" | "bain" | "nez" => {
    if (editData) {
      if (editData.type === "bain") return "bain";
      if (editData.type === "nettoyage_nez") return "nez";
      return editData.isNap === false ? "night" : "nap";
    }
    if (initialType === "bain") return "bain";
    if (initialType === "nettoyage_nez") return "nez";
    return initialSleepMode === "night" ? "night" : "nap";
  };

  // Form state
  const [sheetType, setSheetType] = useState<"nap" | "night" | "bain" | "nez">(
    getInitialSheetType(),
  );
  const routineAccent =
    sheetType === "bain"
      ? eventColors.bain.dark
      : sheetType === "nez"
        ? eventColors.nettoyage_nez.dark
        : eventColors.sommeil.dark;
  const chipActiveColors = getAccentColors(routineAccent, colorScheme);

  // Bain state
  const [dateHeure, setDateHeure] = useState<Date>(
    editData && editData.type === "bain" ? toDate(editData.date) : new Date(),
  );
  const [dateHeureDirty, setDateHeureDirty] = useState(false);
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

  // Nettoyage nez state
  const [dateNez, setDateNez] = useState<Date>(
    editData && editData.type === "nettoyage_nez"
      ? toDate(editData.date)
      : new Date(),
  );
  const [dateNezDirty, setDateNezDirty] = useState(false);
  const [methodeNez, setMethodeNez] = useState<NezMethode | undefined>(
    editData?.methode ?? undefined,
  );
  const [resultatNez, setResultatNez] = useState<NezResultat | undefined>(
    editData?.resultat ?? undefined,
  );
  const [noteNez, setNoteNez] = useState<string>(
    editData?.type === "nettoyage_nez" ? (editData.note ?? "") : "",
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
  const [chronoDirty, setChronoDirty] = useState(false);
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

  // Long press acceleration refs
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handlePressIn = useCallback((action: () => void) => {
    action();
    timeoutRef.current = setTimeout(() => {
      intervalRef.current = setInterval(action, 100);
    }, 400);
  }, []);

  const handlePressOut = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  const handleDateHeureChange = useCallback((nextDate: Date) => {
    setDateHeure(nextDate);
    setDateHeureDirty(true);
  }, []);

  const handleDateNezChange = useCallback((nextDate: Date) => {
    setDateNez(nextDate);
    setDateNezDirty(true);
  }, []);

  const handleHeureDebutChange = useCallback((nextDate: Date) => {
    setHeureDebut(nextDate);
    setChronoDirty(true);
  }, []);

  const handleHeureFinChange = useCallback((nextDate: Date | null) => {
    setHeureFin(nextDate);
    setChronoDirty(true);
  }, []);

  const handleOngoingChange = useCallback((nextOngoing: boolean) => {
    setIsOngoing(nextOngoing);
    setChronoDirty(true);
  }, []);

  useEffect(() => {
    if (!editData?.id) return;
    if (editData.type === "bain") {
      setDateHeure(toDate(editData.date));
      setDateHeureDirty(false);
    }
    if (editData.type === "nettoyage_nez") {
      setDateNez(toDate(editData.date));
      setDateNezDirty(false);
    }
    if (editData.type === "sommeil") {
      setHeureDebut(
        editData.heureDebut
          ? toDate(editData.heureDebut)
          : toDate(editData.date),
      );
      setHeureFin(editData.heureFin ? toDate(editData.heureFin) : null);
      setIsOngoing(!editData.heureFin);
      setChronoDirty(false);
    }
  }, [
    editData?.id,
    editData?.type,
    editData?.date,
    editData?.heureDebut,
    editData?.heureFin,
  ]);

  // ============================================
  // TYPE SELECTION
  // ============================================

  const handleSelectType = (next: "nap" | "night" | "bain" | "nez") => {
    if (isEditingBain && next !== "bain") return;
    if (isEditingNez && next !== "nez") return;
    if (isEditingSommeil && (next === "bain" || next === "nez")) return;

    if (next === "nez") {
      if (sheetType !== "nez") {
        setDateNez(new Date());
        setMethodeNez(undefined);
        setResultatNez(undefined);
        setNoteNez("");
      }
      setSheetType("nez");
      onSheetTypeChange?.("nez");
      return;
    }

    if (next === "bain") {
      if (sheetType !== "bain") {
        setDateHeure(new Date());
        setDureeBain(10);
        setTemperatureEau(37);
        setProduits("");
        setNoteBain("");
      }
      setSheetType("bain");
      onSheetTypeChange?.("bain");
      return;
    }

    if (sheetType === "bain" || sheetType === "nez") {
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
    onSheetTypeChange?.(next);
  };

  // ============================================
  // HANDLERS
  // ============================================

  const handleSubmit = async () => {
    if (!activeChild?.id || isSubmitting) return;

    setIsSubmitting(true);

    if (sheetType === "nez") {
      const data = removeUndefined({
        type: "nettoyage_nez" as const,
        date:
          !isEditing || editData?.type !== "nettoyage_nez" || dateNezDirty
            ? dateNez
            : undefined,
        methode: methodeNez ?? undefined,
        resultat: resultatNez ?? undefined,
        note: noteNez.trim() ? noteNez.trim() : undefined,
      });

      if (editData && editData.type === "nettoyage_nez") {
        modifierEvenementOptimistic(
          activeChild.id,
          editData.id,
          data,
          editData,
        );
        showSuccess("default", "Nettoyage nez modifié");
      } else {
        ajouterEvenementOptimistic(activeChild.id, data);
        showSuccess("default", "Nettoyage nez ajouté");
      }
    } else if (sheetType === "bain") {
      const data = removeUndefined({
        type: "bain" as const,
        date:
          !isEditing || editData?.type !== "bain" || dateHeureDirty
            ? dateHeure
            : undefined,
        duree: dureeBain > 0 ? dureeBain : undefined,
        temperatureEau: temperatureEau > 0 ? temperatureEau : undefined,
        produits: produits.trim() ? produits.trim() : undefined,
        note: noteBain.trim() ? noteBain.trim() : undefined,
      });

      if (editData && editData.type === "bain") {
        modifierEvenementOptimistic(
          activeChild.id,
          editData.id,
          data,
          editData,
        );
        showSuccess("bath", "Bain modifié");
      } else {
        ajouterEvenementOptimistic(activeChild.id, data);
        showSuccess("bath", "Bain ajouté");
      }
    } else {
      // Sommeil
      if (!isOngoing && heureFin && heureFin.getTime() < heureDebut.getTime()) {
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
      const isEditingSameOngoingSleep =
        editData && sommeilEnCours && editData.id === sommeilEnCours.id;
      if (
        isOngoing &&
        sommeilEnCours &&
        isEditing &&
        !isEditingSameOngoingSleep
      ) {
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
        const shouldSendChronoDate = chronoDirty;
        // For editing, we need to explicitly send null to delete fields
        const editDataToSend: any = {
          type: "sommeil" as const,
          date: shouldSendChronoDate ? heureDebut : undefined,
          heureDebut: shouldSendChronoDate ? heureDebut : undefined,
          heureFin: chronoDirty ? (isOngoing ? null : fin) : undefined, // null will trigger deleteField() in service
          duree: chronoDirty ? (isOngoing ? null : duree) : undefined, // null will trigger deleteField() in service
          isNap: sheetType === "nap",
          location: location ?? undefined,
          quality: quality ?? undefined,
          note: noteSommeil.trim() ? noteSommeil.trim() : undefined,
        };
        // Remove undefined but keep null values
        const cleanedEditData = Object.fromEntries(
          Object.entries(editDataToSend).filter(([, v]) => v !== undefined),
        );
        modifierEvenementOptimistic(
          activeChild.id,
          editData.id,
          cleanedEditData,
          editData,
        );
        showSuccess("sleep", "Sommeil modifié");
      } else {
        // For new entries, just remove undefined values
        const data = removeUndefined({
          type: "sommeil" as const,
          date: heureDebut,
          heureDebut: heureDebut,
          heureFin: fin ?? undefined,
          duree,
          isNap: sheetType === "nap",
          location: location ?? undefined,
          quality: quality ?? undefined,
          note: noteSommeil.trim() ? noteSommeil.trim() : undefined,
        });
        ajouterEvenementOptimistic(activeChild.id, data);
        showSuccess("sleep", "Sommeil ajouté");
      }
    }

    setIsSubmitting(false);
    onSuccess?.();
  };

  const handleDelete = () => {
    if (!editData || !activeChild?.id || isSubmitting) return;

    const typeLabel =
      editData.type === "nettoyage_nez"
        ? "ce nettoyage de nez"
        : editData.type === "bain"
          ? "ce bain"
          : "ce sommeil";
    showConfirm(
      "Supprimer",
      `Voulez-vous vraiment supprimer ${typeLabel} ?`,
      async () => {
        try {
          setIsSubmitting(true);
          await supprimerEvenement(activeChild.id, editData.id);
          if (editData.type === "nettoyage_nez") {
            showToast("Nettoyage nez supprimé");
          } else if (editData.type === "bain") {
            showToast("Bain supprimé");
          } else {
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
        { key: "nez", label: "Nez" },
      ].map((item) => {
        const active = sheetType === item.key;
        const isDisabled = isEditingBain
          ? item.key !== "bain"
          : isEditingNez
            ? item.key !== "nez"
            : isEditingSommeil
              ? item.key === "bain" || item.key === "nez"
              : false;
        return (
          <TouchableOpacity
            key={item.key}
            style={[
              styles.typeChip,
              {
                backgroundColor: active ? chipActiveColors.bg : nc.background,
                borderColor: active ? chipActiveColors.border : nc.border,
              },
              isDisabled && styles.typeChipDisabled,
            ]}
            disabled={isDisabled || isSubmitting}
            activeOpacity={0.7}
            onPress={() => handleSelectType(item.key as any)}
            accessibilityLabel={item.label}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            hitSlop={8}
          >
            <Text
              style={[
                styles.typeChipText,
                { color: active ? chipActiveColors.text : nc.textLight },
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
                  backgroundColor:
                    location === option ? chipActiveColors.bg : nc.background,
                  borderColor:
                    location === option ? chipActiveColors.border : nc.border,
                },
              ]}
              onPress={() =>
                setLocation(location === option ? undefined : option)
              }
              disabled={isSubmitting}
              accessibilityLabel={option}
              accessibilityRole="button"
              accessibilityState={{ selected: location === option }}
              hitSlop={8}
            >
              <Text
                style={[
                  styles.chipText,
                  {
                    color:
                      location === option
                        ? chipActiveColors.text
                        : nc.textLight,
                  },
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
                  backgroundColor:
                    quality === option ? chipActiveColors.bg : nc.background,
                  borderColor:
                    quality === option ? chipActiveColors.border : nc.border,
                },
              ]}
              onPress={() =>
                setQuality(quality === option ? undefined : option)
              }
              disabled={isSubmitting}
              accessibilityLabel={option}
              accessibilityRole="button"
              accessibilityState={{ selected: quality === option }}
              hitSlop={8}
            >
              <Text
                style={[
                  styles.chipText,
                  {
                    color:
                      quality === option ? chipActiveColors.text : nc.textLight,
                  },
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
          style={[
            styles.input,
            { borderColor: nc.border, color: nc.textStrong },
          ]}
          editable={!isSubmitting}
        />
      </View>

      {/* Horaires */}
      <DateTimeSectionRow
        chrono
        chronoLabel="Horaires"
        heureDebut={heureDebut}
        heureFin={heureFin}
        onHeureDebutChange={handleHeureDebutChange}
        onHeureFinChange={handleHeureFinChange}
        showStartDate
        startDateLabel="Date début"
        showEndDate
        endDateLabel="Date fin"
        showOngoingToggle
        isOngoing={isOngoing}
        onOngoingChange={handleOngoingChange}
        ongoingLabel="En cours"
        ongoingActiveColors={chipActiveColors}
        showDuration
        colorScheme={colorScheme}
        disabled={isSubmitting}
        onPickerToggle={onFormStepChange}
      />
    </>
  );

  // ============================================
  // RENDER - NETTOYAGE NEZ FORM
  // ============================================

  const renderNezForm = () => (
    <>
      <View style={styles.chipSection}>
        <Text style={[styles.chipLabel, { color: nc.textLight }]}>Méthode</Text>
        <View style={styles.chipRow}>
          {METHODE_NEZ_OPTIONS.map((option) => (
            <TouchableOpacity
              key={option.value}
              style={[
                styles.chip,
                {
                  backgroundColor:
                    methodeNez === option.value
                      ? chipActiveColors.bg
                      : nc.background,
                  borderColor:
                    methodeNez === option.value
                      ? chipActiveColors.border
                      : nc.border,
                },
              ]}
              onPress={() =>
                setMethodeNez(
                  methodeNez === option.value ? undefined : option.value,
                )
              }
              disabled={isSubmitting}
              accessibilityLabel={option.label}
              accessibilityRole="button"
              accessibilityState={{ selected: methodeNez === option.value }}
              hitSlop={8}
            >
              <Text
                style={[
                  styles.chipText,
                  {
                    color:
                      methodeNez === option.value
                        ? chipActiveColors.text
                        : nc.textLight,
                  },
                ]}
              >
                {option.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      <View style={styles.chipSection}>
        <Text style={[styles.chipLabel, { color: nc.textLight }]}>
          Résultat
        </Text>
        <View style={styles.chipRow}>
          {RESULTAT_NEZ_OPTIONS.map((option) => (
            <TouchableOpacity
              key={option.value}
              style={[
                styles.chip,
                {
                  backgroundColor:
                    resultatNez === option.value
                      ? chipActiveColors.bg
                      : nc.background,
                  borderColor:
                    resultatNez === option.value
                      ? chipActiveColors.border
                      : nc.border,
                },
              ]}
              onPress={() =>
                setResultatNez(
                  resultatNez === option.value ? undefined : option.value,
                )
              }
              disabled={isSubmitting}
              accessibilityLabel={option.label}
              accessibilityRole="button"
              accessibilityState={{ selected: resultatNez === option.value }}
              hitSlop={8}
            >
              <Text
                style={[
                  styles.chipText,
                  {
                    color:
                      resultatNez === option.value
                        ? chipActiveColors.text
                        : nc.textLight,
                  },
                ]}
              >
                {option.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      <View style={styles.inputGroup}>
        <Text style={[styles.inputLabel, { color: nc.textLight }]}>Note</Text>
        <TextInput
          value={noteNez}
          onChangeText={setNoteNez}
          placeholder="Ajouter une note"
          placeholderTextColor={nc.textMuted}
          style={[
            styles.input,
            { borderColor: nc.border, color: nc.textStrong },
          ]}
          editable={!isSubmitting}
        />
      </View>

      <DateTimeSectionRow
        value={dateNez}
        onChange={handleDateNezChange}
        colorScheme={colorScheme}
        disabled={isSubmitting}
        onPickerToggle={onFormStepChange}
      />
    </>
  );

  // ============================================
  // RENDER - BAIN FORM
  // ============================================

  const renderBainForm = () => (
    <>
      <View style={styles.inputGroup}>
        <Text style={[styles.inputLabel, { color: nc.textLight }]}>
          Durée (minutes)
        </Text>
        <View style={styles.quantityPickerRow}>
          <TouchableOpacity
            style={[
              styles.quantityButton,
              { backgroundColor: nc.backgroundPressed },
              isSubmitting && styles.quantityButtonDisabled,
            ]}
            onPressIn={() =>
              handlePressIn(() =>
                setDureeBain((value) => Math.max(0, value - 5)),
              )
            }
            onPressOut={handlePressOut}
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
            {dureeBain} min
          </Text>
          <TouchableOpacity
            style={[
              styles.quantityButton,
              { backgroundColor: nc.backgroundPressed },
              isSubmitting && styles.quantityButtonDisabled,
            ]}
            onPressIn={() =>
              handlePressIn(() => setDureeBain((value) => value + 5))
            }
            onPressOut={handlePressOut}
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
        <Text style={[styles.inputLabel, { color: nc.textLight }]}>
          {`Température de l'eau (°C)`}
        </Text>
        <View style={styles.quantityPickerRow}>
          <TouchableOpacity
            style={[
              styles.quantityButton,
              { backgroundColor: nc.backgroundPressed },
              isSubmitting && styles.quantityButtonDisabled,
            ]}
            onPressIn={() =>
              handlePressIn(() =>
                setTemperatureEau((value) => Math.max(35, value - 0.5)),
              )
            }
            onPressOut={handlePressOut}
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
            onPressIn={() =>
              handlePressIn(() =>
                setTemperatureEau((value) => Math.min(40, value + 0.5)),
              )
            }
            onPressOut={handlePressOut}
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
        <Text style={[styles.inputLabel, { color: nc.textLight }]}>
          Produits
        </Text>
        <TextInput
          value={produits}
          onChangeText={setProduits}
          placeholder="Gel lavant, huile..."
          placeholderTextColor={nc.textMuted}
          style={[
            styles.input,
            { borderColor: nc.border, color: nc.textStrong },
          ]}
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
          style={[
            styles.input,
            { borderColor: nc.border, color: nc.textStrong },
          ]}
          editable={!isSubmitting}
        />
      </View>

      <DateTimeSectionRow
        value={dateHeure}
        onChange={handleDateHeureChange}
        colorScheme={colorScheme}
        disabled={isSubmitting}
        onPickerToggle={onFormStepChange}
      />
    </>
  );

  // ============================================
  // RENDER
  // ============================================

  return (
    <View style={styles.sheetContent}>
      {renderTypePicker()}

      {sheetType === "nez"
        ? renderNezForm()
        : sheetType === "bain"
          ? renderBainForm()
          : renderSommeilForm()}

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
              { backgroundColor: chipActiveColors.filledBg },
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
            style={[styles.deleteButton, isSubmitting && styles.buttonDisabled]}
            onPress={handleDelete}
            disabled={isSubmitting}
            accessibilityLabel="Supprimer"
          >
            <FontAwesome name="trash" size={14} color={nc.error} />
            <Text style={[styles.deleteText, { color: nc.error }]}>
              Supprimer
            </Text>
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
    alignItems: "center",
    justifyContent: "center",
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
    textAlign: "center",
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
  },
  // Chip section
  chipSection: {
    gap: 8,
  },
  chipLabel: {
    fontSize: 12,
    fontWeight: "700",
    marginBottom: 8,
    marginTop: 16,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  chipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  chip: {
    borderRadius: 999,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  chipActive: {
    // backgroundColor and borderColor applied inline
  },
  chipText: {
    fontSize: 12,
    fontWeight: "600",
    textAlign: "center",
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
