import {
  ConfettiBurst,
  // FloatingActionButton, // Commented - keeping animation for later use
  HeroMoodCard,
  MomentsSkeletonLoader,
  PolaroidGallery,
  SwipeGallery,
  VerticalMoodTimeline,
  WeekMoodOverview,
} from "@/components/moments";
import { getNeutralColors } from "@/constants/dashboardColors";
import { Colors } from "@/constants/theme";
import { useAuth } from "@/contexts/AuthContext";
import { useBaby } from "@/contexts/BabyContext";
import { useSheet } from "@/contexts/SheetContext";
import { useMomentsNotification } from "@/contexts/MomentsNotificationContext";
import { useToast } from "@/contexts/ToastContext";
import { useChildPermissions } from "@/hooks/useChildPermissions";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { ajouterJalon } from "@/migration/eventsDoubleWriteService";
import { ecouterJalonsHybrid } from "@/migration/eventsHybridService";
import { JalonEvent } from "@/services/eventsService";
import {
  ecouterInteractionsSociales,
  getUserNames,
  toggleLike,
} from "@/services/socialService";
import { LikeInfo } from "@/types/social";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";
import * as FileSystem from "expo-file-system";
import * as Haptics from "expo-haptics";
import * as MediaLibrary from "expo-media-library";
import { router } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
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
  userId?: string;
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
  const { userName, firebaseUser } = useAuth();
  const { setHeaderRight } = useHeaderRight();
  const { showToast } = useToast();
  const { openSheet } = useSheet();
  const { newEventIds } = useMomentsNotification();
  const colorScheme = useColorScheme() ?? "light";
  const nc = getNeutralColors(colorScheme);
  const headerOwnerId = useRef("moments-header");
  const sheetOwnerId = "moments";
  const permissions = useChildPermissions(activeChild?.id, firebaseUser?.uid);
  const canManageContent =
    permissions.role === "owner" || permissions.role === "admin";

  const [events, setEvents] = useState<MilestoneEventWithId[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [galleryVisible, setGalleryVisible] = useState(false);
  const [galleryInitialIndex, setGalleryInitialIndex] = useState(0);
  const [isMoodSaving, setIsMoodSaving] = useState(false);
  const [confettiTrigger, setConfettiTrigger] = useState(0);
  const [refreshTick, setRefreshTick] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Social interactions state
  const [likesInfo, setLikesInfo] = useState<Record<string, LikeInfo>>({});
  const [commentCounts, setCommentCounts] = useState<Record<string, number>>(
    {},
  );
  // Author names for photos not by current user
  const [authorNames, setAuthorNames] = useState<Record<string, string>>({});

  const refreshToday = useCallback(() => {
    setRefreshTick((prev) => prev + 1);
  }, []);

  const handleRefresh = useCallback(() => {
    setIsRefreshing(true);
    setRefreshTick((prev) => prev + 1);
    setTimeout(() => setIsRefreshing(false), 800);
  }, []);

  // Mood data processing (separate from photos to avoid cross-invalidation)
  const { moods, currentMood } = useMemo((): {
    moods: MoodEntry[];
    currentMood: MoodEntry | null;
  } => {
    const moodEntries: MoodEntry[] = [];
    let latestMood: MoodEntry | null = null;

    events.forEach((event) => {
      if (event.typeJalon === "humeur" && event.humeur) {
        const entry: MoodEntry = {
          id: event.id,
          date: toDate(event.date),
          humeur: event.humeur as 1 | 2 | 3 | 4 | 5,
        };
        moodEntries.push(entry);
        if (!latestMood || entry.date > latestMood.date) {
          latestMood = entry;
        }
      }
    });

    return { moods: moodEntries, currentMood: latestMood };
  }, [events]);

  // Photo data processing
  const { allPhotoMilestones, displayedPhotoMilestones } = useMemo(() => {
    const photos: PhotoMilestone[] = [];

    events.forEach((event) => {
      if (event.photos && event.photos.length > 0) {
        const photoTitre =
          event.typeJalon === "photo" && event.description
            ? event.description
            : event.titre;

        photos.push({
          id: event.id,
          date: toDate(event.date),
          photo: event.photos[0],
          titre: photoTitre,
          description: event.description,
          typeJalon: event.typeJalon,
          userId: event.userId,
        });
      }
    });

    const sortedPhotos = photos.sort(
      (a, b) => b.date.getTime() - a.date.getTime(),
    );

    return {
      allPhotoMilestones: sortedPhotos,
      displayedPhotoMilestones: sortedPhotos.slice(0, 3),
    };
  }, [events]);

  // Get today's latest mood for hero card
  const todayMood = useMemo(() => {
    if (!currentMood) return null;
    return isToday(currentMood.date) ? currentMood : null;
  }, [currentMood]);

  // Navigation handler for header button (must be defined before useFocusEffect)
  const handleAddMilestone = useCallback(() => {
    if (!canManageContent) return;
    openSheet({
      ownerId: sheetOwnerId,
      formType: "milestones",
      jalonType: "autre",
      onSuccess: refreshToday,
    });
  }, [canManageContent, openSheet, refreshToday]);

  // Header setup
  useFocusEffect(
    useCallback(() => {
      if (!canManageContent) {
        setHeaderRight(null, headerOwnerId.current);
        return () => {
          setHeaderRight(null, headerOwnerId.current);
        };
      }
      const addButton = (
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            paddingRight: 16,
            gap: 0,
          }}
        >
          <Pressable
            onPress={handleAddMilestone}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            style={styles.headerButton}
            accessibilityRole="button"
            accessibilityLabel="Ajouter un souvenir"
          >
            <Ionicons name="add" size={24} color={Colors[colorScheme].tint} />
          </Pressable>
        </View>
      );
      setHeaderRight(addButton, headerOwnerId.current);

      return () => {
        setHeaderRight(null, headerOwnerId.current);
      };
    }, [canManageContent, colorScheme, setHeaderRight, handleAddMilestone]),
  );

  // Data loading - load most recent milestones (limited to 100 for performance)
  useEffect(() => {
    if (!activeChild?.id) return;

    const unsubscribe = ecouterJalonsHybrid(
      activeChild.id,
      (data) => {
        setEvents(data as MilestoneEventWithId[]);
        setLoaded(true);
      },
      { waitForServer: true, limite: 100 },
      () => {
        // On error, mark as loaded to exit skeleton (show empty state vs infinite loading)
        setLoaded(true);
      },
    );

    return () => unsubscribe();
  }, [activeChild?.id, refreshTick]);

  // Stable key of other user IDs — only re-fetch names when the set changes
  const otherUserIdsKey = useMemo(() => {
    if (!firebaseUser?.uid || allPhotoMilestones.length === 0) return "";
    const ids = [
      ...new Set(
        allPhotoMilestones
          .filter((p) => p.userId && p.userId !== firebaseUser.uid)
          .map((p) => p.userId!),
      ),
    ];
    return ids.sort().join(",");
  }, [firebaseUser?.uid, allPhotoMilestones]);

  // Resolve author names for photos not by current user
  useEffect(() => {
    if (!otherUserIdsKey) return;
    const otherUserIds = otherUserIdsKey.split(",");
    getUserNames(otherUserIds).then((namesMap) => {
      const names: Record<string, string> = {};
      namesMap.forEach((name, uid) => {
        names[uid] = name;
      });
      setAuthorNames(names);
    });
  }, [otherUserIdsKey]);

  // Stable key of photo IDs for social listener — avoids re-subscribing on every events update
  const photoIdsKey = useMemo(() => {
    return allPhotoMilestones.map((p) => p.id).join(",");
  }, [allPhotoMilestones]);

  // Social interactions listener
  useEffect(() => {
    if (!activeChild?.id || !photoIdsKey) return;

    const eventIds = photoIdsKey.split(",");

    const unsubscribe = ecouterInteractionsSociales(
      activeChild.id,
      eventIds,
      (newLikesInfo) => setLikesInfo(newLikesInfo),
      (newCommentCounts) => setCommentCounts(newCommentCounts),
    );

    return () => unsubscribe();
  }, [activeChild?.id, photoIdsKey]);

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
          await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          const moodId = await ajouterJalon(activeChild.id, dataToSave);
          if (moodId) {
            setConfettiTrigger((prev) => prev + 1);
            showToast("Humeur enregistrée");
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
        await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        await toggleLike(photoId, activeChild.id, userName ?? "Moi");
      } catch (error) {
        console.error("[Moments] Erreur like:", error);
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

        // Télécharger l'image localement (cacheDirectory pour ne pas bloater iCloud)
        const filename = `moment_${photoId}_${Date.now()}.jpg`;
        const localUri = FileSystem.cacheDirectory + filename;

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
    return <MomentsSkeletonLoader colorScheme={colorScheme} />;
  }

  return (
    <View style={[styles.container, { backgroundColor: nc.background }]}>
      <SafeAreaView style={styles.safeArea} edges={["bottom"]}>
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.scrollContent}
          refreshControl={
            <RefreshControl
              refreshing={isRefreshing}
              onRefresh={handleRefresh}
            />
          }
        >
          {/* Hero Mood Card */}
          <Animated.View entering={FadeIn.duration(400)}>
            <View style={styles.heroCardWrapper}>
              <HeroMoodCard
                mood={todayMood?.humeur ?? null}
                babyName={"Bébé"}
                time={todayMood ? formatTime(todayMood.date) : undefined}
                onAddMood={handleAddMood}
                canEditMood={canManageContent}
                colorScheme={colorScheme}
              />
              <View style={styles.confettiContainer}>
                <ConfettiBurst trigger={confettiTrigger} />
              </View>
            </View>
          </Animated.View>

          {/* Vertical Timeline */}
          <Animated.View entering={FadeInUp.delay(50).springify()}>
            <VerticalMoodTimeline moods={moods} colorScheme={colorScheme} />
          </Animated.View>

          {/* Week Overview */}
          <Animated.View entering={FadeInUp.delay(100).springify()}>
            <WeekMoodOverview moods={moods} colorScheme={colorScheme} />
          </Animated.View>

          {/* Polaroid Gallery */}
          <Animated.View entering={FadeInUp.delay(150).springify()}>
            <PolaroidGallery
              photos={
                canManageContent
                  ? displayedPhotoMilestones
                  : allPhotoMilestones.slice(0, 4)
              }
              onPhotoPress={handlePhotoPress}
              onAddPhoto={canManageContent ? handleAddPhoto : undefined}
              onSeeAll={handleSeeAll}
              likesInfo={likesInfo}
              commentCounts={commentCounts}
              newEventIds={newEventIds}
              colorScheme={colorScheme}
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
          userId: p.userId,
        }))}
        initialIndex={galleryInitialIndex}
        visible={galleryVisible}
        childId={activeChild?.id ?? ""}
        backgroundColor="rgba(60, 50, 40, 0.97)"
        onClose={handleCloseGallery}
        onAddPhoto={canManageContent ? handleAddPhoto : undefined}
        onEdit={canManageContent ? handleEditPhoto : undefined}
        onLike={handleLike}
        onDownload={handleDownload}
        likesInfo={likesInfo}
        commentCounts={commentCounts}
        currentUserName={userName ?? "Moi"}
        authorNames={authorNames}
        currentUserId={firebaseUser?.uid}
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
  },
  safeArea: {
    flex: 1,
  },
  scrollContent: {
    paddingTop: 16,
    paddingBottom: 20,
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
