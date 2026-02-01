// components/forms/MilestonesForm.tsx
import React, { useState, useCallback } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Platform,
  Image,
} from "react-native";
import FontAwesome5 from "@expo/vector-icons/FontAwesome5";
import FontAwesome from "@expo/vector-icons/FontAwesome6";
import DateTimePicker from "@react-native-community/datetimepicker";
import * as ImagePicker from "expo-image-picker";
import * as FileSystem from "expo-file-system";
import { auth } from "@/config/firebase";
import { useBaby } from "@/contexts/BabyContext";
import { useModal } from "@/contexts/ModalContext";
import { useToast } from "@/contexts/ToastContext";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { Colors } from "@/constants/theme";
import { eventColors } from "@/constants/eventColors";
import {
  ajouterJalon,
  modifierJalon,
  supprimerJalon,
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

export type JalonType =
  | "dent"
  | "pas"
  | "sourire"
  | "mot"
  | "humeur"
  | "photo"
  | "autre";

export type MilestonesEditData = {
  id: string;
  typeJalon: JalonType;
  titre?: string;
  description?: string;
  note?: string;
  humeur?: 1 | 2 | 3 | 4 | 5;
  photos?: string[];
  date: Date | { seconds: number } | { toDate: () => Date };
};

export type MilestonesFormProps = {
  initialType?: JalonType;
  onSuccess?: () => void;
  onCancel?: () => void;
  isSubmitting: boolean;
  setIsSubmitting: (value: boolean) => void;
  onFormStepChange?: (inPicker: boolean) => void;
  editData?: MilestonesEditData;
  onDelete?: () => void;
};

// ============================================
// CONFIG
// ============================================

const TYPE_CONFIG: Record<
  JalonType,
  { label: string; color: string; icon: string; defaultTitle: string }
> = {
  dent: {
    label: "Première dent",
    color: eventColors.jalon.dark,
    icon: "tooth",
    defaultTitle: "Première dent",
  },
  pas: {
    label: "Premiers pas",
    color: eventColors.jalon.dark,
    icon: "shoe-prints",
    defaultTitle: "Premiers pas",
  },
  sourire: {
    label: "Premier sourire",
    color: eventColors.jalon.dark,
    icon: "face-smile",
    defaultTitle: "Premier sourire",
  },
  mot: {
    label: "Premiers mots",
    color: eventColors.jalon.dark,
    icon: "comment-dots",
    defaultTitle: "Premiers mots",
  },
  humeur: {
    label: "Humeur",
    color: eventColors.jalon.dark,
    icon: "heart",
    defaultTitle: "Humeur du jour",
  },
  photo: {
    label: "Moment photo",
    color: eventColors.jalon.dark,
    icon: "camera",
    defaultTitle: "Un beau moment",
  },
  autre: {
    label: "Autre moment",
    color: eventColors.jalon.dark,
    icon: "star",
    defaultTitle: "Moment important",
  },
};

const MOOD_OPTIONS: {
  value: 1 | 2 | 3 | 4 | 5;
  emoji: string;
  label: string;
}[] = [
  { value: 1, emoji: "😢", label: "Difficile" },
  { value: 2, emoji: "😐", label: "Mitigé" },
  { value: 3, emoji: "🙂", label: "OK" },
  { value: 4, emoji: "😄", label: "Content" },
  { value: 5, emoji: "🥰", label: "Rayonnant" },
];

const FIREBASE_STORAGE_BUCKET = "samaye-53723.firebasestorage.app";

// ============================================
// HELPERS
// ============================================

const toDate = (value: any): Date => {
  if (value?.seconds) return new Date(value.seconds * 1000);
  if (value?.toDate) return value.toDate();
  if (value instanceof Date) return value;
  return new Date(value);
};

const uploadMilestonePhoto = async (
  childId: string,
  uri: string,
  onProgress?: (progress: number) => void
): Promise<string> => {
  try {
    const extension = uri.split(".").pop()?.split("?")[0] || "jpg";
    const fileName = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const filePath = `children/${childId}/jalons/${fileName}.${extension}`;

    onProgress?.(10);

    const user = auth.currentUser;
    if (!user) {
      throw new Error("Utilisateur non connecté");
    }
    const token = await user.getIdToken();

    onProgress?.(20);

    const uploadUrl = `https://firebasestorage.googleapis.com/v0/b/${FIREBASE_STORAGE_BUCKET}/o?uploadType=media&name=${encodeURIComponent(filePath)}`;

    const response = await FileSystem.uploadAsync(uploadUrl, uri, {
      httpMethod: "POST",
      uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "image/jpeg",
      },
    });

    if (response.status !== 200) {
      throw new Error(`Upload failed with status ${response.status}`);
    }

    onProgress?.(80);

    const responseData = JSON.parse(response.body);
    const downloadURL = `https://firebasestorage.googleapis.com/v0/b/${FIREBASE_STORAGE_BUCKET}/o/${encodeURIComponent(responseData.name)}?alt=media&token=${responseData.downloadTokens}`;

    onProgress?.(100);
    return downloadURL;
  } catch (error) {
    console.error("[UPLOAD] Erreur:", error);
    throw error;
  }
};

// ============================================
// COMPONENT
// ============================================

export const MilestonesForm: React.FC<MilestonesFormProps> = ({
  initialType = "dent",
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
  const colorScheme = useColorScheme() ?? "light";
  const colors = Colors[colorScheme];

  const isEditing = !!editData;

  // Form state with undefined value handling
  const [typeJalon, setTypeJalon] = useState<JalonType>(
    editData?.typeJalon ?? initialType
  );
  const [title, setTitle] = useState<string>(
    editData?.typeJalon === "autre" ? (editData?.titre ?? "") : ""
  );
  const [titleTouched, setTitleTouched] = useState(!!editData?.titre);
  const [titleError, setTitleError] = useState(false);
  const [description, setDescription] = useState<string>(
    editData?.description ?? ""
  );
  const [note, setNote] = useState<string>(editData?.note ?? "");
  const [dateHeure, setDateHeure] = useState<Date>(
    editData ? toDate(editData.date) : new Date()
  );
  const [mood, setMood] = useState<1 | 2 | 3 | 4 | 5 | null>(
    editData?.humeur ?? null
  );
  const [photoUri, setPhotoUri] = useState<string | null>(
    editData?.photos?.[0] ?? null
  );
  const [photoUploading, setPhotoUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [showDate, setShowDate] = useState(false);
  const [showTime, setShowTime] = useState(false);

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

  // Reset title when type changes
  const handleTypeChange = useCallback((type: JalonType) => {
    setTypeJalon(type);
    if (type !== "autre") {
      setTitle("");
      setTitleTouched(false);
      setTitleError(false);
    }
  }, []);

  // Photo picker
  const handlePickPhoto = useCallback(async () => {
    try {
      const permission =
        await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        showAlert("Accès refusé", "Autorisez l'accès aux photos.");
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        quality: 0.8,
        allowsEditing: true,
        aspect: [4, 3],
      });

      if (!result.canceled && result.assets?.[0]?.uri) {
        setPhotoUri(result.assets[0].uri);
      }
    } catch (error) {
      console.error("Erreur sélection photo:", error);
      showAlert("Erreur", "Impossible d'ajouter la photo.");
    }
  }, [showAlert]);

  // ============================================
  // HANDLERS
  // ============================================

  const handleSubmit = async () => {
    if (!activeChild?.id || isSubmitting) return;

    if (typeJalon === "autre" && !title.trim()) {
      setTitleError(true);
      showAlert("Titre requis", "Ajoutez un titre pour Autre moment.");
      return;
    }

    try {
      setIsSubmitting(true);
      let photoUrls: string[] | undefined = photoUri ? [photoUri] : undefined;

      if (photoUri && !photoUri.startsWith("http")) {
        setPhotoUploading(true);
        setUploadProgress(0);
        const uploadedUrl = await uploadMilestonePhoto(
          activeChild.id,
          photoUri,
          (progress) => setUploadProgress(Math.round(progress))
        );
        photoUrls = [uploadedUrl];
      }

      const titreToSave =
        typeJalon === "autre" && title.trim()
          ? title.trim()
          : TYPE_CONFIG[typeJalon].defaultTitle;

      const data = removeUndefined({
        date: dateHeure,
        typeJalon,
        titre: titreToSave,
        description: description.trim() ? description.trim() : undefined,
        note: note.trim() ? note.trim() : undefined,
        humeur: mood ?? undefined,
        photos: photoUrls,
      });

      if (editData) {
        await modifierJalon(activeChild.id, editData.id, data);
        showToast("Jalon modifié");
      } else {
        await ajouterJalon(activeChild.id, data);
        showToast("Jalon ajouté");
      }

      onSuccess?.();
    } catch (error) {
      console.error("Erreur lors de la sauvegarde:", error);
      showAlert("Erreur", "Impossible de sauvegarder.");
    } finally {
      setPhotoUploading(false);
      setIsSubmitting(false);
    }
  };

  const handleDelete = () => {
    if (!editData || !activeChild?.id || isSubmitting) return;

    showConfirm(
      "Supprimer",
      "Voulez-vous vraiment supprimer ce jalon ?",
      async () => {
        try {
          setIsSubmitting(true);
          await supprimerJalon(activeChild.id, editData.id);
          showToast("Jalon supprimé");
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
      {/* Type Picker */}
      <View style={styles.typeRow}>
        {(Object.keys(TYPE_CONFIG) as JalonType[]).map((type) => {
          const config = TYPE_CONFIG[type];
          const active = typeJalon === type;
          return (
            <TouchableOpacity
              key={type}
              style={[styles.typeChip, active && styles.typeChipActive]}
              onPress={() => handleTypeChange(type)}
              disabled={isSubmitting}
            >
              <Text
                style={[
                  styles.typeChipText,
                  active && styles.typeChipTextActive,
                ]}
              >
                {config.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Titre (seulement pour Autre moment) */}
      {typeJalon === "autre" && (
        <View style={styles.inputGroup}>
          <Text style={styles.inputLabel}>Titre</Text>
          <TextInput
            value={title}
            onChangeText={(value) => {
              setTitle(value);
              setTitleTouched(true);
              if (value.trim()) {
                setTitleError(false);
              }
            }}
            placeholder="Ajouter un titre"
            style={[styles.input, titleError && styles.inputError]}
            editable={!isSubmitting}
          />
        </View>
      )}

      {/* Description */}
      <View style={styles.inputGroup}>
        <Text style={styles.inputLabel}>Description</Text>
        <TextInput
          value={description}
          onChangeText={setDescription}
          placeholder="Ajouter un détail ou un souvenir..."
          style={styles.noteInput}
          multiline
          editable={!isSubmitting}
        />
      </View>

      {/* Humeur (si type humeur) */}
      {typeJalon === "humeur" && (
        <View style={styles.chipSection}>
          <Text style={styles.chipLabel}>Humeur</Text>
          <View style={styles.chipRow}>
            {MOOD_OPTIONS.map((option) => {
              const active = mood === option.value;
              return (
                <TouchableOpacity
                  key={option.value}
                  style={[styles.moodChip, active && styles.moodChipActive]}
                  onPress={() => setMood(option.value)}
                  disabled={isSubmitting}
                >
                  <Text style={styles.moodEmoji}>{option.emoji}</Text>
                  <Text
                    style={[
                      styles.moodLabel,
                      active && styles.moodLabelActive,
                    ]}
                  >
                    {option.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      )}

      {/* Photo */}
      <View style={styles.inputGroup}>
        <Text style={styles.inputLabel}>Photo</Text>
        <View style={styles.photoRow}>
          {photoUri ? (
            <Image source={{ uri: photoUri }} style={styles.photoPreview} />
          ) : (
            <View style={styles.photoPlaceholder}>
              <FontAwesome name="image" size={18} color="#c7cbd1" />
              <Text style={styles.photoPlaceholderText}>Aucune photo</Text>
            </View>
          )}
          <View style={styles.photoActions}>
            <TouchableOpacity
              style={styles.photoButton}
              onPress={handlePickPhoto}
              activeOpacity={0.8}
              disabled={isSubmitting}
            >
              <FontAwesome5 name="camera" size={14} color={colors.text} />
              <Text style={styles.photoButtonText}>Ajouter</Text>
            </TouchableOpacity>
            {photoUri && (
              <TouchableOpacity
                style={styles.photoButtonSecondary}
                onPress={() => setPhotoUri(null)}
                activeOpacity={0.8}
                disabled={isSubmitting}
              >
                <Text style={styles.photoButtonSecondaryText}>Retirer</Text>
              </TouchableOpacity>
            )}
            {photoUploading && (
              <Text style={styles.photoUploading}>
                Téléversement... {uploadProgress > 0 ? `${uploadProgress}%` : ""}
              </Text>
            )}
          </View>
        </View>
      </View>

      {/* Note */}
      <View style={styles.inputGroup}>
        <Text style={styles.inputLabel}>Note</Text>
        <TextInput
          value={note}
          onChangeText={setNote}
          placeholder="Ajouter une note personnelle..."
          style={styles.noteInput}
          multiline
          editable={!isSubmitting}
        />
      </View>

      {/* Date et Heure */}
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

      {/* Date/heure sélectionnée */}
      <View style={styles.selectedDateTime}>
        <Text style={styles.selectedDate}>
          {`${dateHeure.toLocaleDateString("fr-FR", {
            weekday: "long",
            day: "numeric",
            month: "long",
          })} ${dateHeure.getFullYear()}`}
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
// STYLES - EXACTLY MATCHING milestones.tsx
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
    color: "#6b7280",
  },
  input: {
    borderWidth: 1,
    borderColor: "#e5e7eb",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: "#111827",
  },
  inputError: {
    borderColor: "#dc3545",
  },
  noteInput: {
    borderWidth: 1,
    borderColor: "#e5e7eb",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: "#111827",
    minHeight: 80,
    textAlignVertical: "top",
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
    borderColor: "#e5e7eb",
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: "#f9fafb",
  },
  typeChipActive: {
    backgroundColor: "#fff",
    borderColor: eventColors.jalon.dark,
  },
  typeChipText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#6b7280",
  },
  typeChipTextActive: {
    color: eventColors.jalon.dark,
    fontWeight: "700",
  },
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
  moodChip: {
    alignItems: "center",
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    backgroundColor: "#f9fafb",
    minWidth: 68,
  },
  moodChipActive: {
    borderColor: eventColors.jalon.dark,
    backgroundColor: "#ede7f6",
  },
  moodEmoji: {
    fontSize: 18,
  },
  moodLabel: {
    fontSize: 11,
    color: "#6b7280",
    fontWeight: "600",
  },
  moodLabelActive: {
    color: eventColors.jalon.dark,
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
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#d7dbe0",
    backgroundColor: "#f5f6f8",
    paddingVertical: 12,
    alignItems: "center",
    justifyContent: "center",
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
  photoRow: {
    flexDirection: "row",
    gap: 12,
    alignItems: "center",
  },
  photoPreview: {
    width: 88,
    height: 66,
    borderRadius: 12,
    backgroundColor: "#f3f4f6",
  },
  photoPlaceholder: {
    width: 88,
    height: 66,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    backgroundColor: "#f9fafb",
  },
  photoPlaceholderText: {
    fontSize: 11,
    color: "#9ca3af",
  },
  photoActions: {
    gap: 8,
    flex: 1,
  },
  photoButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    backgroundColor: "#fff",
  },
  photoButtonText: {
    fontSize: 13,
    color: "#111827",
    fontWeight: "600",
  },
  photoButtonSecondary: {
    alignSelf: "flex-start",
  },
  photoButtonSecondaryText: {
    fontSize: 12,
    color: "#9ca3af",
  },
  photoUploading: {
    fontSize: 12,
    color: eventColors.jalon.dark,
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
