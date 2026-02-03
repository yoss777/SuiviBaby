import { SwipeGallery } from "@/components/moments";
import { IconPulseDots } from "@/components/ui/IconPulseDtos";
import { eventColors } from "@/constants/eventColors";
import { Colors } from "@/constants/theme";
import { useAuth } from "@/contexts/AuthContext";
import { useBaby } from "@/contexts/BabyContext";
import { useSheet } from "@/contexts/SheetContext";
import { useToast } from "@/contexts/ToastContext";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { ecouterJalonsHybrid } from "@/migration/eventsHybridService";
import { JalonEvent } from "@/services/eventsService";
import {
  ecouterInteractionsSociales,
  toggleLike,
} from "@/services/socialService";
import { LikeInfo } from "@/types/social";
import FontAwesome6 from "@expo/vector-icons/FontAwesome6";
import { HeaderBackButton } from "@react-navigation/elements";
import { useFocusEffect } from "@react-navigation/native";
import * as FileSystem from "expo-file-system";
import * as MediaLibrary from "expo-media-library";
import { router } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  BackHandler,
  Dimensions,
  FlatList,
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSpring,
} from "react-native-reanimated";
import { SafeAreaView } from "react-native-safe-area-context";
import { useHeaderLeft, useHeaderRight } from "../_layout";

const { width: SCREEN_WIDTH } = Dimensions.get("window");
const POLAROID_WIDTH = (SCREEN_WIDTH - 40 - 12) / 2;

// ============================================
// TYPES
// ============================================

type MilestoneEventWithId = JalonEvent & { id: string };

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

const formatDateShort = (date: Date) =>
  date.toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });

const getDayLabel = (date: Date): string => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  const eventDay = new Date(date);
  eventDay.setHours(0, 0, 0, 0);

  if (eventDay.getTime() === today.getTime()) {
    return "Aujourd'hui";
  }
  if (eventDay.getTime() === yesterday.getTime()) {
    return "Hier";
  }
  return date.toLocaleDateString("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
};

// ============================================
// POLAROID CARD COMPONENT
// ============================================

const PolaroidCard = ({
  photo,
  index,
  onPress,
  onLongPress,
  isLikedByMe,
  hasComments,
}: {
  photo: PhotoMilestone;
  index: number;
  onPress: () => void;
  onLongPress: () => void;
  isLikedByMe?: boolean;
  hasComments?: boolean;
}) => {
  const rotation = useMemo(() => {
    const rotations = [-3, 2, -2, 3, -1, 1];
    return rotations[index % rotations.length];
  }, [index]);

  const scale = useSharedValue(0.8);
  const opacity = useSharedValue(0);

  useEffect(() => {
    opacity.value = withDelay(index * 50, withSpring(1));
    scale.value = withDelay(index * 50, withSpring(1, { damping: 12 }));
  }, []);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ scale: scale.value }, { rotate: `${rotation}deg` }],
  }));

  return (
    <Animated.View style={[styles.polaroidWrapper, animatedStyle]}>
      <Pressable
        onPress={onPress}
        onLongPress={onLongPress}
        delayLongPress={400}
        style={({ pressed }) => [
          styles.polaroid,
          pressed && styles.polaroidPressed,
        ]}
      >
        <View style={styles.polaroidImageContainer}>
          <Image source={{ uri: photo.photo }} style={styles.polaroidImage} />
          {(isLikedByMe || hasComments) && (
            <View style={styles.overlayContainer}>
              {hasComments && (
                <View style={styles.iconOverlay}>
                  <FontAwesome6
                    name="comment"
                    size={12}
                    color="#0a7ea4"
                    solid
                  />
                </View>
              )}
              {isLikedByMe && (
                <View style={styles.iconOverlay}>
                  <FontAwesome6 name="heart" size={12} color="#ef4444" solid />
                </View>
              )}
            </View>
          )}
        </View>
        <View style={styles.polaroidCaption}>
          <Text style={styles.polaroidDate} numberOfLines={1}>
            {formatDateShort(photo.date)}
          </Text>
          {photo.titre && (
            <Text style={styles.polaroidTitle} numberOfLines={1}>
              {photo.titre}
            </Text>
          )}
        </View>
      </Pressable>
    </Animated.View>
  );
};

// ============================================
// MAIN COMPONENT
// ============================================

export default function GalleryScreen() {
  const { activeChild } = useBaby();
  const { userName } = useAuth();
  const { showToast } = useToast();
  const { openSheet, closeSheet, isOpen } = useSheet();
  const colorScheme = useColorScheme() ?? "light";
  const { setHeaderLeft } = useHeaderLeft();
  const { setHeaderRight } = useHeaderRight();
  const headerOwnerId = useRef(
    `gallery-${Math.random().toString(36).slice(2)}`,
  );
  const sheetOwnerId = "gallery";

  const [events, setEvents] = useState<MilestoneEventWithId[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [galleryVisible, setGalleryVisible] = useState(false);
  const [galleryInitialIndex, setGalleryInitialIndex] = useState(0);
  const [refreshTick, setRefreshTick] = useState(0);

  // Social interactions state
  const [likesInfo, setLikesInfo] = useState<Record<string, LikeInfo>>({});
  const [commentCounts, setCommentCounts] = useState<Record<string, number>>(
    {},
  );

  const refreshData = useCallback(() => {
    setRefreshTick((prev) => prev + 1);
  }, []);

  // Navigation handlers
  const handleAddPhoto = useCallback(() => {
    openSheet({
      ownerId: sheetOwnerId,
      formType: "milestones",
      jalonType: "photo",
      onSuccess: refreshData,
    });
  }, [openSheet, refreshData]);

  // Header left - back button
  useFocusEffect(
    useCallback(() => {
      const backButton = (
        <HeaderBackButton
          onPress={() => router.back()}
          tintColor={Colors[colorScheme].text}
        />
      );
      setHeaderLeft(backButton, headerOwnerId.current);

      return () => {
        setHeaderLeft(null, headerOwnerId.current);
      };
    }, [colorScheme, setHeaderLeft]),
  );

  // Header right - add button
  useFocusEffect(
    useCallback(() => {
      const headerButtons = (
        <View style={styles.headerActions}>
          <Pressable onPress={handleAddPhoto} style={styles.headerButton}>
            <FontAwesome6
              name="plus"
              size={20}
              color={Colors[colorScheme].tint}
            />
          </Pressable>
        </View>
      );

      setHeaderRight(headerButtons, headerOwnerId.current);

      return () => {
        setHeaderRight(null, headerOwnerId.current);
      };
    }, [colorScheme, setHeaderRight, handleAddPhoto]),
  );

  // Handle hardware back button
  useFocusEffect(
    useCallback(() => {
      const onBackPress = () => {
        if (isOpen) {
          closeSheet();
          return true;
        }
        router.back();
        return true;
      };

      const subscription = BackHandler.addEventListener(
        "hardwareBackPress",
        onBackPress,
      );
      return () => subscription.remove();
    }, [closeSheet, isOpen]),
  );

  // Extract photos from events
  const allPhotoMilestones = useMemo(() => {
    const photos: PhotoMilestone[] = [];

    events.forEach((event) => {
      const eventDate = toDate(event.date);
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

    return photos.sort((a, b) => b.date.getTime() - a.date.getTime());
  }, [events]);

  // Group photos by day
  const groupedPhotos = useMemo(() => {
    const groups: { label: string; date: Date; photos: PhotoMilestone[] }[] =
      [];
    let currentGroup: {
      label: string;
      date: Date;
      photos: PhotoMilestone[];
    } | null = null;

    allPhotoMilestones.forEach((photo) => {
      const dayLabel = getDayLabel(photo.date);

      if (!currentGroup || currentGroup.label !== dayLabel) {
        currentGroup = { label: dayLabel, date: photo.date, photos: [] };
        groups.push(currentGroup);
      }

      currentGroup.photos.push(photo);
    });

    return groups;
  }, [allPhotoMilestones]);

  // Data loading - load all jalons (not just 30 days)
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

  const handlePhotoPress = useCallback(
    (photo: PhotoMilestone) => {
      const index = allPhotoMilestones.findIndex((p) => p.id === photo.id);
      setGalleryInitialIndex(index >= 0 ? index : 0);
      setGalleryVisible(true);
    },
    [allPhotoMilestones],
  );

  const handleEditPhoto = useCallback(
    (photoId: string) => {
      const event = events.find((e) => e.id === photoId);
      if (!event) return;

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
        onSuccess: refreshData,
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
    [events, openSheet, refreshData],
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
        const { status } = await MediaLibrary.requestPermissionsAsync(false);
        if (status !== "granted") {
          return {
            success: false,
            message: "Permission refusée pour accéder à la galerie",
          };
        }

        const filename = `moment_${photoId}_${Date.now()}.jpg`;
        const localUri = FileSystem.documentDirectory + filename;

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

  // Render day separator
  const renderDaySeparator = (label: string) => (
    <View style={styles.daySeparator}>
      <View style={styles.daySeparatorLine} />
      <Text style={styles.daySeparatorText}>{label}</Text>
      <View style={styles.daySeparatorLine} />
    </View>
  );

  // Render photo grid for a day
  const renderDayGroup = ({
    item,
  }: {
    item: { label: string; date: Date; photos: PhotoMilestone[] };
  }) => (
    <View style={styles.dayGroup}>
      {renderDaySeparator(item.label)}
      <View style={styles.photoGrid}>
        {item.photos.map((photo, index) => (
          <PolaroidCard
            key={photo.id}
            photo={photo}
            index={index}
            onPress={() => handlePhotoPress(photo)}
            onLongPress={() => handleEditPhoto(photo.id)}
            isLikedByMe={likesInfo[photo.id]?.likedByMe}
            hasComments={(commentCounts[photo.id] ?? 0) > 0}
          />
        ))}
      </View>
    </View>
  );

  // Loading state
  if (!loaded) {
    return (
      <View style={styles.loadingContainer}>
        <IconPulseDots color={eventColors.jalon.dark} />
        <Text style={styles.loadingText}>Chargement des souvenirs...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <SafeAreaView style={styles.safeArea} edges={["bottom"]}>
        {/* Header block - aligned with croissance.tsx */}
        <View style={styles.headerBlock}>
          <Text style={styles.title}>Souvenirs</Text>
          <Text style={styles.subtitle}>
            {allPhotoMilestones.length} photo
            {allPhotoMilestones.length > 1 ? "s" : ""}
          </Text>
        </View>

        {/* Content */}
        {allPhotoMilestones.length === 0 ? (
          <View style={styles.emptyState}>
            <FontAwesome6 name="images" size={48} color="#d1d5db" />
            <Text style={styles.emptyStateTitle}>Aucun souvenir</Text>
            <Text style={styles.emptyStateText}>
              Ajoutez votre premier souvenir photo
            </Text>
            <Pressable onPress={handleAddPhoto} style={styles.emptyStateButton}>
              <FontAwesome6 name="camera" size={16} color="#fff" />
              <Text style={styles.emptyStateButtonText}>
                Ajouter un souvenir
              </Text>
            </Pressable>
          </View>
        ) : (
          <FlatList
            data={groupedPhotos}
            keyExtractor={(item) => item.label}
            renderItem={renderDayGroup}
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
          />
        )}
      </SafeAreaView>

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
  headerBlock: {
    marginBottom: 12,
    paddingHorizontal: 20,
    paddingTop: 20,
  },
  title: {
    fontSize: 26,
    fontWeight: "800",
    color: "#1f2937",
  },
  subtitle: {
    fontSize: 13,
    color: "#6b7280",
    marginTop: 4,
  },
  headerActions: {
    flexDirection: "row",
    alignItems: "center",
    paddingRight: 16,
  },
  headerButton: {
    padding: 8,
  },
  listContent: {
    paddingHorizontal: 20,
    paddingBottom: 40,
  },
  dayGroup: {
    marginTop: 8,
  },
  daySeparator: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 16,
    gap: 12,
  },
  daySeparatorLine: {
    flex: 1,
    height: 1,
    backgroundColor: "#e5e7eb",
  },
  daySeparatorText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#6b7280",
    textTransform: "capitalize",
  },
  photoGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
  },
  polaroidWrapper: {
    width: POLAROID_WIDTH,
  },
  polaroid: {
    backgroundColor: "#fff",
    borderRadius: 4,
    padding: 8,
    paddingBottom: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 4,
  },
  polaroidPressed: {
    transform: [{ scale: 0.98 }],
  },
  polaroidImageContainer: {
    width: "100%",
    aspectRatio: 1,
    borderRadius: 2,
    overflow: "hidden",
    backgroundColor: "#f3f4f6",
  },
  polaroidImage: {
    width: "100%",
    height: "100%",
  },
  overlayContainer: {
    position: "absolute",
    top: 6,
    right: 6,
    flexDirection: "row",
    gap: 4,
  },
  iconOverlay: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: "rgba(255, 255, 255, 0.9)",
    alignItems: "center",
    justifyContent: "center",
  },
  polaroidCaption: {
    marginTop: 10,
    alignItems: "center",
  },
  polaroidDate: {
    fontSize: 11,
    color: "#6b7280",
    fontStyle: "italic",
  },
  polaroidTitle: {
    fontSize: 12,
    color: "#374151",
    fontWeight: "500",
    marginTop: 2,
  },
  emptyState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 32,
  },
  emptyStateTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: "#374151",
    marginTop: 16,
  },
  emptyStateText: {
    fontSize: 14,
    color: "#6b7280",
    marginTop: 8,
    textAlign: "center",
  },
  emptyStateButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: eventColors.jalon.dark,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 12,
    marginTop: 24,
  },
  emptyStateButtonText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "600",
  },
});
