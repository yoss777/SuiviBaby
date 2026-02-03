import {
  ConfettiBurst,
  // FloatingActionButton, // Commented - keeping animation for later use
  HeroMoodCard,
  PolaroidGallery,
  SwipeGallery,
  VerticalMoodTimeline,
  WeekMoodOverview,
} from "@/components/moments";
import { IconPulseDots } from "@/components/ui/IconPulseDtos";
import { eventColors } from "@/constants/eventColors";
import { Colors } from "@/constants/theme";
import { useAuth } from "@/contexts/AuthContext";
import { useBaby } from "@/contexts/BabyContext";
import { useSheet } from "@/contexts/SheetContext";
import { useToast } from "@/contexts/ToastContext";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { ajouterJalon } from "@/migration/eventsDoubleWriteService";
import { ecouterJalonsHybrid } from "@/migration/eventsHybridService";
import { JalonEvent } from "@/services/eventsService";
import {
  ecouterInteractionsSociales,
  toggleLike,
} from "@/services/socialService";
import { LikeInfo } from "@/types/social";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";
import * as FileSystem from "expo-file-system";
import * as MediaLibrary from "expo-media-library";
import { router } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import Animated, { FadeIn, FadeInUp } from "react-native-reanimated";
import { SafeAreaView } from "react-native-safe-area-context";
import { useHeaderRight } from "../../_layout";

// ============================================
// TYPES
// ============================================

type MilestoneEventWithId = JalonEvent & { id: string };

type MoodEntry = {
  id: string;
  date: Date;
  humeur: 1 | 2 | 3 | 4 | 5;
};

type PhotoMilestone = {
  id: string;
  date: Date;
  photo: string;
  titre?: string;
  description?: string;
  typeJalon: string;
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

const formatTime = (date: Date) =>
  date.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });

const isToday = (date: Date) => {
  const today = new Date();
  return (
    date.getDate() === today.getDate() &&
    date.getMonth() === today.getMonth() &&
    date.getFullYear() === today.getFullYear()
  );
};

// ============================================
// MAIN COMPONENT
// ============================================

export default function MomentsScreen() {
  const { activeChild } = useBaby();
  const { userName } = useAuth();
  const { setHeaderRight } = useHeaderRight();
  const { showToast } = useToast();
  const { openSheet } = useSheet();
  const colorScheme = useColorScheme() ?? "light";
  const headerOwnerId = useRef(
    `moments-${Math.random().toString(36).slice(2)}`,
  );
  const sheetOwnerId = "moments";

  const [events, setEvents] = useState<MilestoneEventWithId[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [galleryVisible, setGalleryVisible] = useState(false);
  const [galleryInitialIndex, setGalleryInitialIndex] = useState(0);
  const [isMoodSaving, setIsMoodSaving] = useState(false);
  const [confettiTrigger, setConfettiTrigger] = useState(0);
  const [refreshTick, setRefreshTick] = useState(0);

  // Social interactions state
  const [likesInfo, setLikesInfo] = useState<Record<string, LikeInfo>>({});
  const [commentCounts, setCommentCounts] = useState<Record<string, number>>(
    {},
  );

  const refreshToday = useCallback(() => {
    setRefreshTick((prev) => prev + 1);
  }, []);

  // Data processing
  const { moods, allPhotoMilestones, displayedPhotoMilestones, currentMood } =
    useMemo(() => {
      const moodEntries: MoodEntry[] = [];
      const photos: PhotoMilestone[] = [];
      let latestMood: MoodEntry | null = null;

      events.forEach((event) => {
        const eventDate = toDate(event.date);

        // Moods
        if (event.typeJalon === "humeur" && event.humeur) {
          const entry: MoodEntry = {
            id: event.id,
            date: eventDate,
            humeur: event.humeur as 1 | 2 | 3 | 4 | 5,
          };
          moodEntries.push(entry);
          if (!latestMood || eventDate > latestMood.date) {
            latestMood = entry;
          }
        }

        // Photos
        if (event.photos && event.photos.length > 0) {
          photos.push({
            id: event.id,
            date: eventDate,
            photo: event.photos[0],
            titre: event.titre,
            description: event.description,
            typeJalon: event.typeJalon,
          });
        }
      });

      const sortedPhotos = photos.sort(
        (a, b) => b.date.getTime() - a.date.getTime(),
      );

      return {
        moods: moodEntries,
        allPhotoMilestones: sortedPhotos,
        displayedPhotoMilestones: sortedPhotos.slice(0, 3),
        currentMood: latestMood,
      };
    }, [events]);

  // Get today's latest mood for hero card
  const todayMood = useMemo(() => {
    if (!currentMood) return null;
    return isToday(currentMood.date) ? currentMood : null;
  }, [currentMood]);

  // Navigation handler for header button (must be defined before useFocusEffect)
  const handleAddMilestone = useCallback(() => {
    openSheet({
      ownerId: sheetOwnerId,
      formType: "milestones",
      jalonType: "autre",
      onSuccess: refreshToday,
    });
  }, [openSheet, refreshToday]);

  // Header setup
  useFocusEffect(
    useCallback(() => {
      const addButton = (
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            paddingRight: 16,
            gap: 0,
          }}
        >
          <Pressable onPress={handleAddMilestone} style={styles.headerButton}>
            <Ionicons name="add" size={24} color={Colors[colorScheme].tint} />
          </Pressable>
        </View>
      );
      setHeaderRight(addButton, headerOwnerId.current);

      return () => {
        setHeaderRight(null, headerOwnerId.current);
      };
    }, [colorScheme, setHeaderRight, handleAddMilestone]),
  );

  // Data loading - load all milestones (no date limit) to ensure we always have 3 photos
  useEffect(() => {
    if (!activeChild?.id) return;

    const unsubscribe = ecouterJalonsHybrid(
      activeChild.id,
      (data) => {
        setEvents(data as MilestoneEventWithId[]);
        setLoaded(true);
      },
      { waitForServer: true },
    );

    return () => unsubscribe();
  }, [activeChild?.id, refreshTick]);

  // Social interactions listener
  useEffect(() => {
    if (!activeChild?.id || allPhotoMilestones.length === 0) return;

    const eventIds = allPhotoMilestones.map((p) => p.id);

    const unsubscribe = ecouterInteractionsSociales(
      activeChild.id,
      eventIds,
      (newLikesInfo) => setLikesInfo(newLikesInfo),
      (newCommentCounts) => setCommentCounts(newCommentCounts),
    );

    return () => unsubscribe();
  }, [activeChild?.id, allPhotoMilestones]);

  // Navigation handlers
  const handleAddMood = useCallback(
    async (mood?: 1 | 2 | 3 | 4 | 5) => {
      // Si un mood est passé, on enregistre directement
      if (mood && activeChild?.id && !isMoodSaving) {
        try {
          setIsMoodSaving(true);
          const now = new Date();
          const dataToSave = {
            date: now,
            typeJalon: "humeur" as const,
            humeur: mood,
            titre: "Humeur du jour",
          };
          const moodId = await ajouterJalon(activeChild.id, dataToSave);
          if (moodId) {
            // Trigger confetti on success
            setConfettiTrigger((prev) => prev + 1);
          } else {
            showToast("Impossible d'enregistrer l'humeur.");
          }
        } catch {
          showToast("Impossible d'enregistrer l'humeur.");
        } finally {
          setIsMoodSaving(false);
        }
      } else if (!mood) {
        // Sinon, on ouvre le modal
        openSheet({
          ownerId: sheetOwnerId,
          formType: "milestones",
          jalonType: "humeur",
          onSuccess: refreshToday,
        });
      }
    },
    [activeChild?.id, isMoodSaving, showToast, openSheet, refreshToday],
  );

  const handleAddPhoto = useCallback(() => {
    openSheet({
      ownerId: sheetOwnerId,
      formType: "milestones",
      jalonType: "photo",
      onSuccess: refreshToday,
    });
  }, [openSheet, refreshToday]);

  const handlePhotoPress = useCallback(
    (photo: PhotoMilestone) => {
      const index = allPhotoMilestones.findIndex((p) => p.id === photo.id);
      setGalleryInitialIndex(index >= 0 ? index : 0);
      setGalleryVisible(true);
    },
    [allPhotoMilestones],
  );

  const handleSeeAll = useCallback(() => {
    // Navigate to the gallery screen
    router.push("/baby/gallery");
  }, []);

  // Edit photo handler - finds the full event and opens form sheet
  const handleEditPhoto = useCallback(
    (photoId: string, photoIndex: number) => {
      const event = events.find((e) => e.id === photoId);
      if (!event) return;

      // Callback to reopen gallery at the same position when user cancels
      const reopenGallery = () => {
        setGalleryInitialIndex(photoIndex);
        setGalleryVisible(true);
      };

      openSheet({
        ownerId: sheetOwnerId,
        formType: "milestones",
        jalonType: event.typeJalon as
          | "dent"
          | "pas"
          | "sourire"
          | "mot"
          | "humeur"
          | "photo"
          | "autre",
        onSuccess: refreshToday,
        onCancel: reopenGallery,
        editData: {
          id: event.id,
          typeJalon: event.typeJalon as
            | "dent"
            | "pas"
            | "sourire"
            | "mot"
            | "humeur"
            | "photo"
            | "autre",
          titre: event.titre,
          description: event.description,
          note: event.note,
          humeur: event.humeur,
          photos: event.photos,
          date: toDate(event.date),
        },
      });
    },
    [events, openSheet, refreshToday],
  );

  // Social handlers
  const handleLike = useCallback(
    async (photoId: string) => {
      if (!activeChild?.id) return;
      try {
        await toggleLike(photoId, activeChild.id, userName ?? "Moi");
      } catch {
        showToast("Impossible d'enregistrer le like");
      }
    },
    [activeChild?.id, userName, showToast],
  );

  const handleDownload = useCallback(
    async (
      photoId: string,
      uri: string,
    ): Promise<{ success: boolean; message: string }> => {
      try {
        // Demander la permission d'accès à la galerie (addOnly pour iOS)
        const { status } = await MediaLibrary.requestPermissionsAsync(false);
        if (status !== "granted") {
          return {
            success: false,
            message: "Permission refusée pour accéder à la galerie",
          };
        }

        // Télécharger l'image localement
        const filename = `moment_${photoId}_${Date.now()}.jpg`;
        const localUri = FileSystem.documentDirectory + filename;

        const downloadResult = await FileSystem.downloadAsync(uri, localUri);

        if (downloadResult.status === 200) {
          // Sauvegarder dans la galerie avec createAssetAsync
          await MediaLibrary.createAssetAsync(downloadResult.uri);

          // Nettoyer le fichier temporaire
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

  // Loading state
  if (!loaded) {
    return (
      <View style={styles.loadingContainer}>
        <IconPulseDots color={eventColors.jalon.dark} />
        <Text style={styles.loadingText}>Chargement des moments...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <SafeAreaView style={styles.safeArea} edges={["bottom"]}>
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.scrollContent}
        >
          {/* Hero Mood Card */}
          <Animated.View entering={FadeIn.duration(500)}>
            <View style={styles.heroCardWrapper}>
              <HeroMoodCard
                mood={todayMood?.humeur ?? null}
                babyName={activeChild?.prenom ?? "Bébé"}
                time={todayMood ? formatTime(todayMood.date) : undefined}
                onAddMood={handleAddMood}
              />
              <View style={styles.confettiContainer}>
                <ConfettiBurst trigger={confettiTrigger} />
              </View>
            </View>
          </Animated.View>

          {/* Vertical Timeline */}
          <Animated.View entering={FadeInUp.delay(150).springify()}>
            <VerticalMoodTimeline moods={moods} />
          </Animated.View>

          {/* Week Overview */}
          <Animated.View entering={FadeInUp.delay(250).springify()}>
            <WeekMoodOverview moods={moods} />
          </Animated.View>

          {/* Polaroid Gallery */}
          <Animated.View entering={FadeInUp.delay(350).springify()}>
            <PolaroidGallery
              photos={displayedPhotoMilestones}
              onPhotoPress={handlePhotoPress}
              onAddPhoto={handleAddPhoto}
              onSeeAll={handleSeeAll}
              likesInfo={likesInfo}
              commentCounts={commentCounts}
            />
          </Animated.View>

          {/* Bottom padding */}
          <View style={{ height: 24 }} />
        </ScrollView>
      </SafeAreaView>

      {/* Floating Action Button - commented for now, keeping animation for later use
      <FloatingActionButton
        onMoodPress={handleAddMood}
        onPhotoPress={handleAddPhoto}
        onMilestonePress={handleAddMilestone}
      />
      */}

      {/* Swipe Gallery */}
      <SwipeGallery
        photos={allPhotoMilestones.map((p) => ({
          id: p.id,
          uri: p.photo,
          date: p.date,
          titre: p.titre,
        }))}
        initialIndex={galleryInitialIndex}
        visible={galleryVisible}
        childId={activeChild?.id ?? ""}
        backgroundColor="rgba(60, 50, 40, 0.97)"
        onClose={handleCloseGallery}
        onAddPhoto={handleAddPhoto}
        onEdit={handleEditPhoto}
        onLike={handleLike}
        onDownload={handleDownload}
        likesInfo={likesInfo}
        commentCounts={commentCounts}
        currentUserName={userName ?? "Moi"}
      />
    </View>
  );
}

// ============================================
// STYLES
// ============================================

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#FDF8F3",
  },
  safeArea: {
    flex: 1,
  },
  scrollContent: {
    paddingTop: 16,
    paddingBottom: 20,
    paddingHorizontal: 4,
  },
  loadingContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FDF8F3",
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    color: "#6b7280",
  },
  heroCardWrapper: {
    position: "relative",
    overflow: "visible",
  },
  confettiContainer: {
    position: "absolute",
    top: -20,
    right: 190,
    zIndex: 1000,
    pointerEvents: "none",
  },
  headerButton: {
    paddingVertical: 8,
    borderRadius: 8,
    paddingHorizontal: 8,
  },
});
