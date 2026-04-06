import { useCallback, useState } from "react";
import { ajouterEvenementOptimistic } from "@/services/eventsService";
import { toggleLike } from "@/services/socialService";
import { JalonEvent } from "@/services/eventsService";
import { toDate } from "@/hooks/useMomentsData";
import type { AnySheetProps } from "@/contexts/SheetContext";
import type { JalonType, MilestonesEditData } from "@/components/forms/MilestonesForm";
import * as FileSystem from "expo-file-system";
import * as Haptics from "expo-haptics";
import * as MediaLibrary from "expo-media-library";
import { router } from "expo-router";

type MilestoneEventWithId = JalonEvent & { id: string };

type UseMomentsActionsParams = {
  childId: string | undefined;
  userName: string | null | undefined;
  events: MilestoneEventWithId[];
  openSheet: (props: AnySheetProps) => void;
  showToast: (message: string) => void;
  onSuccess: () => void;
  canManageContent: boolean;
};

const SHEET_OWNER_ID = "moments";

export function useMomentsActions({
  childId,
  userName,
  events,
  openSheet,
  showToast,
  onSuccess,
  canManageContent,
}: UseMomentsActionsParams) {
  const [isMoodSaving, setIsMoodSaving] = useState(false);
  const [confettiTrigger, setConfettiTrigger] = useState(0);
  const [galleryVisible, setGalleryVisible] = useState(false);
  const [galleryInitialIndex, setGalleryInitialIndex] = useState(0);

  const handleAddMilestone = useCallback(() => {
    if (!canManageContent) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    openSheet({
      ownerId: SHEET_OWNER_ID,
      formType: "milestones" as const,
      jalonType: "autre",
      onSuccess,
    });
  }, [canManageContent, openSheet, onSuccess]);

  const handleAddMood = useCallback(
    async (mood?: 1 | 2 | 3 | 4 | 5) => {
      if (mood && childId && !isMoodSaving) {
        try {
          setIsMoodSaving(true);
          const dataToSave = {
            type: "jalon" as const,
            date: new Date(),
            typeJalon: "humeur" as const,
            humeur: mood,
            titre: "Humeur du jour",
          };
          await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          ajouterEvenementOptimistic(childId, dataToSave);
          setConfettiTrigger((prev) => prev + 1);
          showToast("Humeur enregistrée");
        } catch {
          showToast("Impossible d'enregistrer l'humeur.");
        } finally {
          setIsMoodSaving(false);
        }
      } else if (!mood) {
        openSheet({
          ownerId: SHEET_OWNER_ID,
          formType: "milestones" as const,
          jalonType: "humeur",
          onSuccess,
        });
      }
    },
    [childId, isMoodSaving, showToast, openSheet, onSuccess],
  );

  const handleAddPhoto = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    openSheet({
      ownerId: SHEET_OWNER_ID,
      formType: "milestones" as const,
      jalonType: "photo",
      onSuccess,
    });
  }, [openSheet, onSuccess]);

  const handlePhotoPress = useCallback(
    (photo: { id: string }, allPhotos: { id: string }[]) => {
      const index = allPhotos.findIndex((p) => p.id === photo.id);
      setGalleryInitialIndex(index >= 0 ? index : 0);
      setGalleryVisible(true);
    },
    [],
  );

  const handleSeeAll = useCallback(() => {
    router.push("/baby/gallery");
  }, []);

  const handleEditPhoto = useCallback(
    (photoId: string, photoIndex: number) => {
      if (photoId?.startsWith?.('__optimistic_')) {
        showToast('Enregistrement en cours...');
        return;
      }
      const event = events.find((e) => e.id === photoId);
      if (!event) return;

      const reopenGallery = () => {
        setGalleryInitialIndex(photoIndex);
        setGalleryVisible(true);
      };

      openSheet({
        ownerId: SHEET_OWNER_ID,
        formType: "milestones" as const,
        jalonType: event.typeJalon as JalonType,
        onSuccess,
        onCancel: reopenGallery,
        editData: {
          id: event.id,
          typeJalon: event.typeJalon as JalonType,
          titre: event.titre,
          description: event.description,
          note: event.note,
          humeur: event.humeur,
          photos: event.photos,
          date: toDate(event.date),
        },
      });
    },
    [events, openSheet, onSuccess],
  );

  const handleLike = useCallback(
    async (photoId: string) => {
      if (!childId) return;
      try {
        await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        await toggleLike(photoId, childId, userName ?? "Moi");
      } catch (error) {
        console.error("[Moments] Erreur like:", error);
        showToast("Impossible d'enregistrer le like");
      }
    },
    [childId, userName, showToast],
  );

  const handleDownload = useCallback(
    async (
      photoId: string,
      uri: string,
    ): Promise<{ success: boolean; message: string }> => {
      try {
        const { status } = await MediaLibrary.requestPermissionsAsync(false);
        if (status !== "granted") {
          return {
            success: false,
            message: "Permission refusée pour accéder à la galerie",
          };
        }

        const filename = `moment_${photoId}_${Date.now()}.jpg`;
        const localUri = FileSystem.cacheDirectory + filename;
        const downloadResult = await FileSystem.downloadAsync(uri, localUri);

        if (downloadResult.status === 200) {
          await MediaLibrary.createAssetAsync(downloadResult.uri);
          await FileSystem.deleteAsync(downloadResult.uri, {
            idempotent: true,
          });
          return {
            success: true,
            message: "Photo enregistrée dans la galerie",
          };
        } else {
          return { success: false, message: "Échec du téléchargement" };
        }
      } catch (error) {
        console.error("Erreur lors du téléchargement:", error);
        return {
          success: false,
          message: "Impossible de télécharger la photo",
        };
      }
    },
    [],
  );

  const handleCloseGallery = useCallback(() => {
    setGalleryVisible(false);
  }, []);

  return {
    isMoodSaving,
    confettiTrigger,
    galleryVisible,
    galleryInitialIndex,
    handleAddMilestone,
    handleAddMood,
    handleAddPhoto,
    handlePhotoPress,
    handleSeeAll,
    handleEditPhoto,
    handleLike,
    handleDownload,
    handleCloseGallery,
  };
}
