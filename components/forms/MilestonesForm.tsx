// components/forms/MilestonesForm.tsx
import { DateTimeSectionRow } from "@/components/ui/DateTimeSectionRow";
import { getAccentColors } from "@/components/ui/accentColors";
import { auth } from "@/config/firebase";
import { getNeutralColors } from "@/constants/dashboardColors";
import { eventColors } from "@/constants/eventColors";
import { useBaby } from "@/contexts/BabyContext";
import { useModal } from "@/contexts/ModalContext";
import { useSuccessAnimation } from "@/contexts/SuccessAnimationContext";
import { useToast } from "@/contexts/ToastContext";
import { useColorScheme } from "@/hooks/use-color-scheme";
import {
  ajouterEvenementOptimistic,
  modifierEvenementOptimistic,
  supprimerJalon,
} from "@/services/eventsService";
import FontAwesome5 from "@expo/vector-icons/FontAwesome5";
import FontAwesome from "@expo/vector-icons/FontAwesome6";
import * as FileSystem from "expo-file-system";
import * as ImageManipulator from "expo-image-manipulator";
import * as ImagePicker from "expo-image-picker";
import React, { useCallback, useEffect, useState } from "react";
import {
  Image,
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
    label: "Nouvelle dent",
    color: eventColors.jalon.dark,
    icon: "tooth",
    defaultTitle: "Nouvelle dent",
  },
  pas: {
    label: "Nouveau pas",
    color: eventColors.jalon.dark,
    icon: "shoe-prints",
    defaultTitle: "Nouveau pas",
  },
  sourire: {
    label: "Nouveau sourire",
    color: eventColors.jalon.dark,
    icon: "face-smile",
    defaultTitle: "Nouveau sourire",
  },
  mot: {
    label: "Nouveau mot",
    color: eventColors.jalon.dark,
    icon: "comment-dots",
    defaultTitle: "Nouveau mot",
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

const MAX_IMAGE_WIDTH = 1500;
const IMAGE_QUALITY = 0.8;

const compressImage = async (uri: string): Promise<string> => {
  const result = await ImageManipulator.manipulateAsync(
    uri,
    [{ resize: { width: MAX_IMAGE_WIDTH } }],
    { compress: IMAGE_QUALITY, format: ImageManipulator.SaveFormat.JPEG },
  );
  return result.uri;
};

const uploadMilestonePhoto = async (
  childId: string,
  uri: string,
  onProgress?: (progress: number) => void,
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
  const { showSuccess } = useSuccessAnimation();
  const colorScheme = useColorScheme() ?? "light";
  const nc = getNeutralColors(colorScheme);
  const accentColors = getAccentColors(eventColors.jalon.dark, colorScheme);

  const isEditing = !!editData;

  // Form state with undefined value handling
  const [typeJalon, setTypeJalon] = useState<JalonType>(
    editData?.typeJalon ?? initialType,
  );
  const [title, setTitle] = useState<string>(
    editData?.typeJalon === "autre" ? (editData?.titre ?? "") : "",
  );
  const [titleTouched, setTitleTouched] = useState(!!editData?.titre);
  const [titleError, setTitleError] = useState(false);
  const [description, setDescription] = useState<string>(
    editData?.description ?? "",
  );
  const [note, setNote] = useState<string>(editData?.note ?? "");
  const [dateHeure, setDateHeure] = useState<Date>(
    editData ? toDate(editData.date) : new Date(),
  );
  const [dateHeureDirty, setDateHeureDirty] = useState(false);
  const [mood, setMood] = useState<1 | 2 | 3 | 4 | 5 | null>(
    editData?.humeur ?? null,
  );
  const [photoUri, setPhotoUri] = useState<string | null>(
    editData?.photos?.[0] ?? null,
  );
  const [photoUploading, setPhotoUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
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
        quality: 1, // Full quality, compression done by ImageManipulator
        allowsEditing: true, // User can optionally crop (no forced ratio)
      });

      if (!result.canceled && result.assets?.[0]?.uri) {
        // Compress image before storing
        const compressedUri = await compressImage(result.assets[0].uri);
        setPhotoUri(compressedUri);
      }
    } catch (error) {
      console.error("Erreur sélection photo:", error);
      showAlert("Erreur", "Impossible d'ajouter la photo.");
    }
  }, [showAlert]);

  const handleDateHeureChange = useCallback((nextDate: Date) => {
    setDateHeure(nextDate);
    setDateHeureDirty(true);
  }, []);

  useEffect(() => {
    if (!editData?.id) return;
    setDateHeure(toDate(editData.date));
    setDateHeureDirty(false);
  }, [editData?.id, editData?.date]);

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

    if (typeJalon === "photo" && !photoUri) {
      showAlert("Photo requise", "Ajoutez une photo pour ce moment.");
      return;
    }

    if (typeJalon === "humeur" && !mood) {
      showAlert("Humeur requise", "Sélectionnez une humeur.");
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
          (progress) => setUploadProgress(Math.round(progress)),
        );
        photoUrls = [uploadedUrl];
      }

      const titreToSave =
        typeJalon === "autre" && title.trim()
          ? title.trim()
          : TYPE_CONFIG[typeJalon].defaultTitle;

      const data = removeUndefined({
        type: "jalon" as const,
        date: !isEditing || dateHeureDirty ? dateHeure : undefined,
        typeJalon,
        titre: titreToSave,
        description: description.trim() ? description.trim() : undefined,
        note: note.trim() ? note.trim() : undefined,
        humeur: mood ?? undefined,
        photos: photoUrls,
      });

      if (editData) {
        modifierEvenementOptimistic(activeChild.id, editData.id, data, editData);
        showSuccess("milestone", "Jalon modifié");
      } else {
        ajouterEvenementOptimistic(activeChild.id, data);
        showSuccess("milestone", "Jalon ajouté");
      }

      setPhotoUploading(false);
      setIsSubmitting(false);
      onSuccess?.();
    } catch (error) {
      console.error("Erreur lors de la sauvegarde:", error);
      showAlert("Erreur", "Impossible de sauvegarder.");
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
      },
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
              style={[
                styles.typeChip,
                { borderColor: nc.border, backgroundColor: nc.background },
                active && {
                  backgroundColor: accentColors.softBg,
                  borderColor: accentColors.softBorder,
                },
              ]}
              onPress={() => handleTypeChange(type)}
              disabled={isSubmitting}
              accessibilityLabel={`Type ${config.label}`}
              accessibilityRole="button"
              accessibilityState={{
                selected: active,
                disabled: isSubmitting,
              }}
              hitSlop={8}
            >
              <Text
                style={[
                  styles.typeChipText,
                  { color: nc.textLight },
                  active && styles.typeChipTextActive,
                  active && { color: accentColors.softText },
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
          <Text style={[styles.inputLabel, { color: nc.textLight }]}>
            Titre
          </Text>
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
            placeholderTextColor={nc.textMuted}
            style={[
              styles.input,
              { borderColor: nc.border, color: nc.textStrong },
              titleError && styles.inputError,
            ]}
            editable={!isSubmitting}
          />
        </View>
      )}

      {/* Description */}
      <View style={styles.inputGroup}>
        <Text style={[styles.inputLabel, { color: nc.textLight }]}>
          Description
        </Text>
        <TextInput
          value={description}
          onChangeText={setDescription}
          placeholder="Ajouter un détail ou un souvenir..."
          placeholderTextColor={nc.textMuted}
          style={[
            styles.noteInput,
            { borderColor: nc.border, color: nc.textStrong },
          ]}
          multiline
          editable={!isSubmitting}
        />
      </View>

      {/* Humeur (si type humeur) */}
      {typeJalon === "humeur" && (
        <View style={styles.chipSection}>
          <Text style={[styles.chipLabel, { color: nc.textLight }]}>
            Humeur
          </Text>
          <View style={styles.chipRow}>
            {MOOD_OPTIONS.map((option) => {
              const active = mood === option.value;
              return (
                <TouchableOpacity
                  key={option.value}
                  style={[
                    styles.moodChip,
                    { borderColor: nc.border, backgroundColor: nc.background },
                    active && {
                      backgroundColor: accentColors.softBg,
                      borderColor: accentColors.softBorder,
                    },
                  ]}
                  onPress={() => setMood(option.value)}
                  disabled={isSubmitting}
                  accessibilityLabel={`Humeur ${option.label}`}
                  accessibilityRole="button"
                  accessibilityState={{
                    selected: active,
                    disabled: isSubmitting,
                  }}
                  hitSlop={8}
                >
                  <Text style={styles.moodEmoji}>{option.emoji}</Text>
                  <Text
                    style={[
                      styles.moodLabel,
                      { color: nc.textLight },
                      active && { color: accentColors.softText },
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
        <Text style={[styles.inputLabel, { color: nc.textLight }]}>Photo</Text>
        {photoUri ? (
          <View style={styles.photoPreviewContainer}>
            <Image
              source={{ uri: photoUri }}
              style={[styles.photoPreview, { backgroundColor: nc.background }]}
            />
            <TouchableOpacity
              style={[
                styles.photoRemoveButton,
                { backgroundColor: nc.backgroundCard },
              ]}
              onPress={() => setPhotoUri(null)}
              activeOpacity={0.8}
              disabled={isSubmitting}
              accessibilityLabel="Retirer la photo"
              hitSlop={8}
            >
              <FontAwesome name="xmark" size={12} color="#dc3545" />
            </TouchableOpacity>
            {photoUploading && (
              <Text
                style={[
                  styles.photoUploading,
                  { color: eventColors.jalon.dark },
                ]}
              >
                Téléversement...{" "}
                {uploadProgress > 0 ? `${uploadProgress}%` : ""}
              </Text>
            )}
          </View>
        ) : (
          <TouchableOpacity
            style={[
              styles.photoPlaceholder,
              { borderColor: nc.border, backgroundColor: nc.background },
            ]}
            onPress={handlePickPhoto}
            activeOpacity={0.8}
            disabled={isSubmitting}
            accessibilityLabel="Ajouter une photo"
          >
            <FontAwesome5 name="camera" size={20} color={nc.textMuted} />
            <Text
              style={[styles.photoPlaceholderText, { color: nc.textMuted }]}
            >
              Ajouter une photo
            </Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Note */}
      <View style={styles.inputGroup}>
        <Text style={[styles.inputLabel, { color: nc.textLight }]}>Note</Text>
        <TextInput
          value={note}
          onChangeText={setNote}
          placeholder="Ajouter une note personnelle..."
          placeholderTextColor={nc.textMuted}
          style={[
            styles.noteInput,
            { borderColor: nc.border, color: nc.textStrong },
          ]}
          multiline
          editable={!isSubmitting}
        />
      </View>

      {/* Date et Heure */}
      <DateTimeSectionRow
        value={dateHeure}
        onChange={handleDateHeureChange}
        colorScheme={colorScheme}
        disabled={isSubmitting}
        onPickerToggle={onFormStepChange}
      />

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
              { backgroundColor: accentColors.filledBg },
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
    fontSize: 14,
  },
  inputError: {
    borderColor: "#dc3545",
  },
  noteInput: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
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
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  typeChipText: {
    fontSize: 12,
    fontWeight: "600",
    textAlign: "center",
  },
  typeChipTextActive: {
    fontWeight: "700",
  },
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
  moodChip: {
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 12,
    borderWidth: 1,
    minWidth: 68,
  },
  moodEmoji: {
    fontSize: 18,
  },
  moodLabel: {
    fontSize: 11,
    fontWeight: "600",
    textAlign: "center",
  },
  photoPreviewContainer: {
    position: "relative" as const,
    alignSelf: "center",
  },
  photoPreview: {
    width: 160,
    height: 120,
    borderRadius: 12,
  },
  photoRemoveButton: {
    position: "absolute" as const,
    top: -8,
    right: -8,
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: "center" as const,
    justifyContent: "center" as const,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
    elevation: 3,
  },
  photoPlaceholder: {
    height: 80,
    borderRadius: 12,
    borderWidth: 1,
    borderStyle: "dashed" as const,
    alignItems: "center" as const,
    justifyContent: "center" as const,
    gap: 6,
  },
  photoPlaceholderText: {
    fontSize: 13,
    fontWeight: "500" as const,
  },
  photoUploading: {
    fontSize: 12,
    textAlign: "center" as const,
    marginTop: 6,
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
