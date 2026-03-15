import { SwipeGallery } from "@/components/moments";
import { getNeutralColors } from "@/constants/dashboardColors";
import { eventColors } from "@/constants/eventColors";
import { useAuth } from "@/contexts/AuthContext";
import { useBaby } from "@/contexts/BabyContext";
import { useSheet } from "@/contexts/SheetContext";
import { useToast } from "@/contexts/ToastContext";
import { useMomentsNotification, NotificationType } from "@/contexts/MomentsNotificationContext";
import { useChildPermissions } from "@/hooks/useChildPermissions";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { ecouterJalonsHybrid } from "@/migration/eventsHybridService";
import { JalonEvent } from "@/services/eventsService";
import {
  ecouterInteractionsSociales,
  getUserNames,
  toggleLike,
} from "@/services/socialService";
import { LikeInfo } from "@/types/social";
import FontAwesome6 from "@expo/vector-icons/FontAwesome6";
import Ionicons from "@expo/vector-icons/Ionicons";
import { HeaderBackButton } from "@react-navigation/elements";
import { useFocusEffect } from "@react-navigation/native";
import * as FileSystem from "expo-file-system";
import * as Haptics from "expo-haptics";
import * as MediaLibrary from "expo-media-library";
import { router } from "expo-router";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  BackHandler,
  Dimensions,
  Animated as RNAnimated,
  FlatList,
  Image,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
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
// STYLES (moved before components that reference them)
// ============================================

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
  },
  headerBlock: {
    marginBottom: 12,
    paddingHorizontal: 20,
    paddingTop: 20,
  },
  title: {
    fontSize: 26,
    fontWeight: "800",
  },
  subtitle: {
    fontSize: 13,
    marginTop: 4,
  },
  headerActions: {
    flexDirection: "row",
    alignItems: "center",
    paddingRight: 16,
  },
  headerButton: {
    paddingVertical: 8,
    paddingHorizontal: 8,
    borderRadius: 8,
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
  },
  daySeparatorText: {
    fontSize: 13,
    fontWeight: "600",
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
    borderRadius: 4,
    padding: 8,
    paddingBottom: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 4,
  },
  newBadge: {
    position: "absolute",
    top: 2,
    right: 2,
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: "center" as const,
    justifyContent: "center" as const,
    borderWidth: 2,
    zIndex: 10,
  },
  polaroidImageContainer: {
    width: "100%",
    aspectRatio: 1,
    borderRadius: 2,
    overflow: "hidden",
  },
  polaroidImage: {
    width: "100%",
    height: "100%",
  },
  imagePlaceholder: {
    alignItems: "center",
    justifyContent: "center",
  },
  polaroidCaption: {
    marginTop: 10,
    alignItems: "center",
  },
  captionRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    width: "100%",
    position: "relative",
  },
  iconsRow: {
    position: "absolute",
    right: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  polaroidDate: {
    fontSize: 11,
    fontStyle: "italic",
  },
  polaroidTitle: {
    fontSize: 12,
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
    marginTop: 16,
  },
  emptyStateText: {
    fontSize: 14,
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
  errorTitle: {
    fontSize: 16,
    fontWeight: "600",
    marginTop: 12,
  },
  retryButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: eventColors.jalon.dark,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 12,
    marginTop: 16,
  },
  retryButtonText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "600",
  },
  skeletonBlock: {
    borderRadius: 8,
    overflow: "hidden",
  },
  shimmerOverlay: {
    position: "absolute",
    top: 0,
    bottom: 0,
    width: 120,
  },
});

// ============================================
// SKELETON LOADING (P1)
// ============================================

function GallerySkeleton({ colorScheme }: { colorScheme: "light" | "dark" }) {
  const nc = getNeutralColors(colorScheme);
  const shimmerAnim = React.useRef(new RNAnimated.Value(0)).current;

  React.useEffect(() => {
    const loop = RNAnimated.loop(
      RNAnimated.timing(shimmerAnim, {
        toValue: 1,
        duration: 1200,
        useNativeDriver: true,
      }),
    );
    loop.start();
    return () => loop.stop();
  }, [shimmerAnim]);

  const shimmerTranslate = shimmerAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [-200, 200],
  });
  const shimmerBg = colorScheme === "dark" ? nc.shimmerDark : nc.shimmerLight;

  const Block = ({ width, height }: { width: number | string; height: number }) => (
    <View style={[styles.skeletonBlock, { width: width as number, height, backgroundColor: nc.borderLight, marginBottom: 10 }]}>
      <RNAnimated.View style={[styles.shimmerOverlay, { backgroundColor: shimmerBg, transform: [{ translateX: shimmerTranslate }] }]} />
    </View>
  );

  return (
    <View style={[styles.loadingContainer, { backgroundColor: nc.backgroundWarm }]}>
      <View style={{ width: "100%", padding: 20 }}>
        <Block width="50%" height={26} />
        <Block width="30%" height={14} />
        <View style={{ height: 20 }} />
        <View style={{ flexDirection: "row", gap: 12 }}>
          <View style={{ flex: 1 }}>
            <Block width="100%" height={POLAROID_WIDTH} />
            <Block width="60%" height={12} />
          </View>
          <View style={{ flex: 1 }}>
            <Block width="100%" height={POLAROID_WIDTH} />
            <Block width="60%" height={12} />
          </View>
        </View>
        <View style={{ height: 16 }} />
        <View style={{ flexDirection: "row", gap: 12 }}>
          <View style={{ flex: 1 }}>
            <Block width="100%" height={POLAROID_WIDTH} />
            <Block width="60%" height={12} />
          </View>
          <View style={{ flex: 1 }}>
            <Block width="100%" height={POLAROID_WIDTH} />
            <Block width="60%" height={12} />
          </View>
        </View>
      </View>
    </View>
  );
}

// ============================================
// POLAROID CARD COMPONENT
// ============================================

// Notification badge icon config
const NOTIF_ICON: Record<NotificationType, { name: string; solid: boolean }> = {
  photo: { name: 'star', solid: true },
  like: { name: 'heart', solid: true },
  comment: { name: 'comment', solid: true },
};
const NOTIF_COLOR = '#E8A85A';

const PolaroidCard = React.memo(function PolaroidCard({
  photo,
  index,
  onPhotoPress,
  onPhotoEdit,
  canEdit,
  likeCount,
  hasComments,
  notificationType,
  nc,
}: {
  photo: PhotoMilestone;
  index: number;
  onPhotoPress: (photo: PhotoMilestone) => void;
  onPhotoEdit: (photoId: string) => void;
  canEdit: boolean;
  likeCount?: number;
  hasComments?: boolean;
  notificationType?: NotificationType;
  nc: ReturnType<typeof getNeutralColors>;
}) {
  const hasLikes = (likeCount ?? 0) > 0;
  const [imageError, setImageError] = useState(false);

  const rotation = useMemo(() => {
    let hash = 0;
    for (let i = 0; i < photo.id.length; i++) {
      hash = ((hash << 5) - hash + photo.id.charCodeAt(i)) | 0;
    }
    const rotations = [-3, 2, -2, 3, -1, 1];
    return rotations[Math.abs(hash) % rotations.length];
  }, [photo.id]);

  const scale = useSharedValue(0.8);
  const opacity = useSharedValue(0);
  const pressScale = useSharedValue(1);

  // Pulse animation for notification badge
  const badgePulse = useSharedValue(1);
  useEffect(() => {
    if (notificationType) {
      badgePulse.value = withRepeat(
        withSequence(
          withTiming(1.15, { duration: 800 }),
          withTiming(1, { duration: 800 }),
        ),
        -1,
        true,
      );
    }
  }, [notificationType, badgePulse]);

  const badgeAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: badgePulse.value }],
  }));

  const clampedIndex = Math.min(index, 5);
  useEffect(() => {
    opacity.value = withDelay(clampedIndex * 50, withSpring(1));
    scale.value = withDelay(clampedIndex * 50, withSpring(1, { damping: 12 }));
  }, []);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [
      { scale: scale.value * pressScale.value },
      { rotate: `${rotation}deg` },
    ],
  }));

  const handlePress = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onPhotoPress(photo);
  }, [onPhotoPress, photo]);

  const handleLongPress = useCallback(() => {
    if (canEdit) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      onPhotoEdit(photo.id);
    }
  }, [canEdit, onPhotoEdit, photo.id]);

  return (
    <Animated.View style={[styles.polaroidWrapper, animatedStyle]}>
      <Pressable
        onPress={handlePress}
        onLongPress={canEdit ? handleLongPress : undefined}
        delayLongPress={400}
        onPressIn={() => { pressScale.value = withSpring(0.97, { damping: 15 }); }}
        onPressOut={() => { pressScale.value = withSpring(1, { damping: 15 }); }}
        style={[styles.polaroid, { backgroundColor: nc.backgroundCard }]}
        accessibilityRole="button"
        accessibilityLabel={`Photo ${photo.titre || formatDateShort(photo.date)}${hasLikes ? ", aimée" : ""}${hasComments ? ", commentée" : ""}`}
        accessibilityHint={canEdit ? "Appuyez longuement pour modifier" : "Appuyez pour voir en plein écran"}
      >
        {notificationType && (
          <Animated.View
            style={[
              styles.newBadge,
              { borderColor: nc.backgroundCard, backgroundColor: NOTIF_COLOR },
              badgeAnimatedStyle,
            ]}
          >
            <FontAwesome6
              name={NOTIF_ICON[notificationType].name}
              size={8}
              color="#fff"
              solid={NOTIF_ICON[notificationType].solid}
            />
          </Animated.View>
        )}

        <View style={[styles.polaroidImageContainer, { backgroundColor: nc.borderLight }]}>
          {imageError ? (
            <View style={[styles.polaroidImage, styles.imagePlaceholder, { backgroundColor: nc.backgroundPressed }]}>
              <FontAwesome6 name="image" size={24} color={nc.textMuted} />
            </View>
          ) : (
            <Image
              source={{ uri: photo.photo }}
              style={styles.polaroidImage}
              resizeMode="cover"
              onError={() => setImageError(true)}
            />
          )}
        </View>
        <View style={styles.polaroidCaption}>
          <View style={styles.captionRow}>
            <Text style={[styles.polaroidDate, { color: nc.textLight }]} numberOfLines={1}>
              {formatDateShort(photo.date)}
            </Text>
            <View style={styles.iconsRow}>
              {hasLikes && (
                <FontAwesome6 name="heart" size={10} color={nc.error} solid />
              )}
              {hasComments && (
                <FontAwesome6 name="comment" size={10} color={nc.todayAccent} solid />
              )}
            </View>
          </View>
          {photo.titre && (
            <Text style={[styles.polaroidTitle, { color: nc.textNormal }]} numberOfLines={1}>
              {photo.titre}
            </Text>
          )}
        </View>
      </Pressable>
    </Animated.View>
  );
});

// ============================================
// MAIN COMPONENT
// ============================================

export default function GalleryScreen() {
  const { activeChild } = useBaby();
  const { userName, firebaseUser } = useAuth();
  const { showToast } = useToast();
  const { newEventIds, newEventTypes, markMomentsAsSeen, markEventAsSeen } = useMomentsNotification();
  const { openSheet, closeSheet, isOpen } = useSheet();
  const colorScheme = useColorScheme() ?? "light";
  const nc = getNeutralColors(colorScheme);
  const { setHeaderLeft } = useHeaderLeft();
  const { setHeaderRight } = useHeaderRight();
  const headerOwnerId = useRef("gallery-header");
  const sheetOwnerId = "gallery";
  const permissions = useChildPermissions(activeChild?.id, firebaseUser?.uid);
  const canManageContent =
    permissions.role === "owner" || permissions.role === "admin";

  const [events, setEvents] = useState<MilestoneEventWithId[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [retryCount, setRetryCount] = useState(0);
  const [galleryVisible, setGalleryVisible] = useState(false);
  const [galleryInitialIndex, setGalleryInitialIndex] = useState(0);
  const isMountedRef = useRef(true);

  // Social interactions state
  const [likesInfo, setLikesInfo] = useState<Record<string, LikeInfo>>({});
  const [commentCounts, setCommentCounts] = useState<Record<string, number>>(
    {},
  );
  // Author names for photos not by current user
  const [authorNames, setAuthorNames] = useState<Record<string, string>>({});

  // Unmount tracking
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  // Navigation handlers
  const handleAddPhoto = useCallback(() => {
    if (!canManageContent) return;
    openSheet({
      ownerId: sheetOwnerId,
      formType: "milestones",
      jalonType: "photo",
      onSuccess: () => showToast("Souvenir enregistré"),
    });
  }, [canManageContent, openSheet, showToast]);

  // Header left - back button
  useFocusEffect(
    useCallback(() => {
      const backButton = (
        <HeaderBackButton
          onPress={() => router.back()}
          tintColor={nc.textStrong}
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
      if (!canManageContent) {
        setHeaderRight(null, headerOwnerId.current);
        return () => {
          setHeaderRight(null, headerOwnerId.current);
        };
      }
      const headerButtons = (
        <View style={styles.headerActions}>
          <Pressable
            onPress={handleAddPhoto}
            style={styles.headerButton}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            accessibilityRole="button"
            accessibilityLabel="Ajouter un souvenir photo"
          >
            <Ionicons name="add" size={24} color={nc.todayAccent} />
          </Pressable>
        </View>
      );

      setHeaderRight(headerButtons, headerOwnerId.current);

      return () => {
        setHeaderRight(null, headerOwnerId.current);
      };
    }, [canManageContent, colorScheme, setHeaderRight, handleAddPhoto]),
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

  // Marquer les moments comme vus quand on quitte la galerie
  useFocusEffect(
    useCallback(() => {
      return () => {
        markMomentsAsSeen();
      };
    }, [markMomentsAsSeen]),
  );

  // Extract photos from events
  const allPhotoMilestones = useMemo(() => {
    const photos: PhotoMilestone[] = [];

    events.forEach((event) => {
      const eventDate = toDate(event.date);
      if (event.photos && event.photos.length > 0) {
        // Pour les jalons de type "photo", utiliser la description comme titre si elle existe
        // Pour "autre" et autres types, garder le titre original
        const photoTitre =
          event.typeJalon === "photo" && event.description
            ? event.description
            : event.titre;

        photos.push({
          id: event.id,
          date: eventDate,
          photo: event.photos[0],
          titre: photoTitre,
          description: event.description,
          typeJalon: event.typeJalon,
          userId: event.userId,
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

    setLoadError(false);
    const unsubscribe = ecouterJalonsHybrid(
      activeChild.id,
      (data) => {
        if (!isMountedRef.current) return;
        setEvents(data as MilestoneEventWithId[]);
        setLoaded(true);
        setLoadError(false);
      },
      { waitForServer: true },
      (error) => {
        console.error("[Gallery] Erreur listener jalons:", error);
        if (!isMountedRef.current) return;
        setLoaded(true);
        setLoadError(true);
      },
    );

    return () => unsubscribe();
  }, [activeChild?.id, retryCount]);

  // Stable keys for dependency tracking
  const photoIdsKey = useMemo(
    () => allPhotoMilestones.map((p) => p.id).join(","),
    [allPhotoMilestones],
  );
  const otherUserIdsKey = useMemo(() => {
    if (!firebaseUser?.uid) return "";
    return [...new Set(
      allPhotoMilestones
        .filter((p) => p.userId && p.userId !== firebaseUser.uid)
        .map((p) => p.userId!),
    )].join(",");
  }, [allPhotoMilestones, firebaseUser?.uid]);

  // Resolve author names for photos not by current user
  useEffect(() => {
    if (!otherUserIdsKey) return;
    let cancelled = false;
    const userIds = otherUserIdsKey.split(",");
    getUserNames(userIds).then((namesMap) => {
      if (cancelled) return;
      const names: Record<string, string> = {};
      namesMap.forEach((name, uid) => {
        names[uid] = name;
      });
      setAuthorNames(names);
    });
    return () => { cancelled = true; };
  }, [otherUserIdsKey]);

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

  const handlePhotoPress = useCallback(
    (photo: PhotoMilestone) => {
      const index = allPhotoMilestones.findIndex((p) => p.id === photo.id);
      setGalleryInitialIndex(index >= 0 ? index : 0);
      setGalleryVisible(true);
    },
    [allPhotoMilestones],
  );

  const handleEditPhoto = useCallback(
    (photoId: string, _photoIndex?: number) => {
      if (!canManageContent) return;
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
        onSuccess: () => showToast("Souvenir modifié"),
      });
    },
    [events, openSheet, canManageContent, showToast],
  );

  // Social handlers
  const handleLike = useCallback(
    async (photoId: string) => {
      if (!activeChild?.id) return;
      try {
        await toggleLike(photoId, activeChild.id, userName ?? "Moi");
      } catch (error) {
        console.error("[Gallery] Erreur like:", error);
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
          const result = {
            success: false,
            message: "Permission refusée pour accéder à la galerie",
          };
          showToast(result.message);
          return result;
        }

        if (!FileSystem.cacheDirectory) {
          const result = { success: false, message: "Stockage temporaire indisponible" };
          showToast(result.message);
          return result;
        }

        const filename = `moment_${photoId}_${Date.now()}.jpg`;
        const localUri = FileSystem.cacheDirectory + filename;

        const downloadResult = await FileSystem.downloadAsync(uri, localUri);

        if (downloadResult.status === 200) {
          await MediaLibrary.createAssetAsync(downloadResult.uri);
          await FileSystem.deleteAsync(downloadResult.uri, {
            idempotent: true,
          });
          const result = {
            success: true,
            message: "Photo enregistrée dans la galerie",
          };
          if (isMountedRef.current) showToast(result.message);
          return result;
        } else {
          const result = { success: false, message: "Échec du téléchargement" };
          showToast(result.message);
          return result;
        }
      } catch (error) {
        console.error("Erreur lors du téléchargement:", error);
        const result = {
          success: false,
          message: "Impossible de télécharger la photo",
        };
        showToast(result.message);
        return result;
      }
    },
    [showToast],
  );

  // Retry loading after error
  const handleRetry = useCallback(() => {
    setLoaded(false);
    setLoadError(false);
    setEvents([]);
    setRetryCount((c) => c + 1);
  }, []);

  const handleCloseGallery = useCallback(() => {
    setGalleryVisible(false);
  }, []);

  // Memoize photos for SwipeGallery to avoid re-creating array each render
  const swipeGalleryPhotos = useMemo(
    () =>
      allPhotoMilestones.map((p) => ({
        id: p.id,
        uri: p.photo,
        date: p.date,
        titre: p.titre,
        userId: p.userId,
      })),
    [allPhotoMilestones],
  );

  // Render photo grid for a day
  const renderDayGroup = useCallback(({
    item,
  }: {
    item: { label: string; date: Date; photos: PhotoMilestone[] };
  }) => (
    <View style={styles.dayGroup}>
      <View style={styles.daySeparator}>
        <View style={[styles.daySeparatorLine, { backgroundColor: nc.border }]} />
        <Text style={[styles.daySeparatorText, { color: nc.textLight }]}>{item.label}</Text>
        <View style={[styles.daySeparatorLine, { backgroundColor: nc.border }]} />
      </View>
      <View style={styles.photoGrid}>
        {item.photos.map((photo, index) => (
          <PolaroidCard
            key={photo.id}
            photo={photo}
            index={index}
            onPhotoPress={handlePhotoPress}
            onPhotoEdit={handleEditPhoto}
            canEdit={canManageContent}
            likeCount={likesInfo[photo.id]?.count}
            hasComments={(commentCounts[photo.id] ?? 0) > 0}
            notificationType={newEventIds.has(photo.id) ? newEventTypes.get(photo.id) : undefined}
            nc={nc}
          />
        ))}
      </View>
    </View>
  ), [handlePhotoPress, canManageContent, handleEditPhoto, likesInfo, commentCounts, newEventIds, newEventTypes, nc]);

  // P9b: Pull-to-refresh
  const [isRefreshing, setIsRefreshing] = useState(false);
  const handleRefresh = useCallback(() => {
    setIsRefreshing(true);
    setRetryCount((c) => c + 1);
    setTimeout(() => setIsRefreshing(false), 800);
  }, []);

  // Loading state - P1: skeleton shimmer
  if (!loaded) {
    return <GallerySkeleton colorScheme={colorScheme} />;
  }

  // Error state with retry
  if (loadError && events.length === 0) {
    return (
      <View style={[styles.loadingContainer, { backgroundColor: nc.backgroundWarm }]}>
        <FontAwesome6 name="triangle-exclamation" size={32} color={nc.warning} />
        <Text style={[styles.errorTitle, { color: nc.textStrong }]}>Impossible de charger</Text>
        <Text style={[styles.loadingText, { color: nc.textLight }]}>Vérifiez votre connexion</Text>
        <Pressable onPress={handleRetry} style={styles.retryButton} accessibilityRole="button" accessibilityLabel="Réessayer le chargement">
          <FontAwesome6 name="arrow-rotate-right" size={14} color="#fff" />
          <Text style={styles.retryButtonText}>Réessayer</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: nc.backgroundWarm }]}>
      <SafeAreaView style={styles.safeArea} edges={["bottom"]}>
        {/* Header block - aligned with croissance.tsx */}
        <View style={styles.headerBlock}>
          <Text style={[styles.title, { color: nc.textStrong }]}>Souvenirs</Text>
          <Text style={[styles.subtitle, { color: nc.textLight }]}>
            {allPhotoMilestones.length} photo
            {allPhotoMilestones.length > 1 ? "s" : ""}
          </Text>
        </View>

        {/* Content */}
        {allPhotoMilestones.length === 0 ? (
          <View style={styles.emptyState}>
            <FontAwesome6 name="images" size={48} color={nc.textMuted} />
            <Text style={[styles.emptyStateTitle, { color: nc.textStrong }]}>Aucun souvenir</Text>
            <Text style={[styles.emptyStateText, { color: nc.textLight }]}>
              {canManageContent
                ? "Ajoutez votre premier souvenir photo"
                : "Les souvenirs partagés apparaîtront ici"}
            </Text>
            {canManageContent && (
              <Pressable onPress={handleAddPhoto} style={styles.emptyStateButton} accessibilityRole="button" accessibilityLabel="Ajouter un souvenir photo">
                <FontAwesome6 name="camera" size={16} color="#fff" />
                <Text style={styles.emptyStateButtonText}>
                  Ajouter un souvenir
                </Text>
              </Pressable>
            )}
          </View>
        ) : (
          <FlatList
            data={groupedPhotos}
            keyExtractor={(item) => item.date.toISOString().slice(0, 10)}
            renderItem={renderDayGroup}
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
            initialNumToRender={5}
            maxToRenderPerBatch={3}
            windowSize={5}
            removeClippedSubviews={true}
            refreshControl={
              <RefreshControl refreshing={isRefreshing} onRefresh={handleRefresh} />
            }
          />
        )}
      </SafeAreaView>

      {/* Swipe Gallery */}
      <SwipeGallery
        photos={swipeGalleryPhotos}
        initialIndex={galleryInitialIndex}
        visible={galleryVisible}
        childId={activeChild?.id || "unknown"}
        backgroundColor={colorScheme === "dark" ? "rgba(10, 10, 15, 0.97)" : "rgba(60, 50, 40, 0.97)"}
        onClose={handleCloseGallery}
        onAddPhoto={canManageContent ? handleAddPhoto : undefined}
        onEdit={canManageContent ? handleEditPhoto : undefined}
        onLike={handleLike}
        onDownload={handleDownload}
        onMarkSeen={markEventAsSeen}
        newEventIds={newEventIds}
        likesInfo={likesInfo}
        commentCounts={commentCounts}
        currentUserName={userName ?? "Moi"}
        authorNames={authorNames}
        currentUserId={firebaseUser?.uid}
      />
    </View>
  );
}

