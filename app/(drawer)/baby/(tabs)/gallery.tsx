import { canManageEvents } from "@/utils/eventPermissions";
import { SwipeGallery } from "@/components/moments";
import { GalleryGridSkeleton } from "@/components/gallery/GalleryGridSkeleton";
import {
  GRID_GAP,
  NUM_COLUMNS,
  THUMB_SIZE,
  getGalleryViewState,
} from "@/components/gallery/galleryGrid";
import { PhotoImage } from "@/components/ui/PhotoImage";
import { getAccentColors } from "@/components/ui/accentColors";
import { getNeutralColors, neutralColors, itemColors } from "@/constants/dashboardColors";
import { eventColors } from "@/constants/eventColors";
import { Colors } from "@/constants/theme";
import { useAuth } from "@/contexts/AuthContext";
import { useBaby } from "@/contexts/BabyContext";
import { useModal } from "@/contexts/ModalContext";
import { useSheet } from "@/contexts/SheetContext";
import { useToast } from "@/contexts/ToastContext";
import { useMomentsNotification, NotificationType } from "@/contexts/MomentsNotificationContext";
import { useChildPermissions } from "@/hooks/useChildPermissions";
import { useForegroundServerRefresh } from "@/hooks/useForegroundServerRefresh";
import { useHiddenPhotos } from "@/hooks/useHiddenPhotos";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { obtenirEvenements } from "@/services/eventsService";
import { useGalleryMilestones, GALLERY_PAGE_SIZE, type GalleryMilestoneEvent } from "@/hooks/useGalleryMilestones";
import { useSocialInteractions } from "@/contexts/SocialInteractionsContext";
import { getAuthenticatedPhotoSource } from "@/utils/photoStorage";
import { getUserNames, toggleLike } from "@/services/socialService";
import FontAwesome6 from "@expo/vector-icons/FontAwesome6";
import Ionicons from "@expo/vector-icons/Ionicons";
import { HeaderBackButton } from "expo-router/react-navigation";
import { useFocusEffect } from "expo-router/react-navigation";
import * as FileSystem from "expo-file-system/legacy";
import * as Haptics from "expo-haptics";
import * as MediaLibrary from "expo-media-library/legacy";
import { router, useLocalSearchParams } from "expo-router";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  BackHandler,
  ActivityIndicator,
  Animated as RNAnimated,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useHeaderLeft, useHeaderRight } from "../../_layout";
import { startLoop } from "@/utils/motion";
import { toDate } from "@/utils/date";


// ============================================
// TYPES
// ============================================

type MilestoneEventWithId = GalleryMilestoneEvent;

type PhotoMilestone = {
  id: string;
  /** Clé de rendu stable (idempotencyKey) : la vignette n'est pas recréée à la confirmation. */
  key: string;
  date: Date;
  photo: string;
  titre?: string;
  description?: string;
  typeJalon: string;
  userId?: string;
};

type GalleryListItem =
  | {
      type: "month";
      key: string;
      label: string;
      count: number;
    }
  | {
      type: "row";
      key: string;
      photos: PhotoMilestone[];
    };

// ============================================
// HELPERS
// ============================================

const MONTH_NAMES = [
  "Janvier", "Février", "Mars", "Avril", "Mai", "Juin",
  "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre",
];

const getMonthKey = (date: Date): string => {
  return `${date.getFullYear()}-${String(date.getMonth()).padStart(2, "0")}`;
};

const getMonthLabel = (date: Date): string => {
  return `${MONTH_NAMES[date.getMonth()]} ${date.getFullYear()}`;
};

// ============================================
// NOTIFICATION BADGE CONFIG
// ============================================

const NOTIF_ICON: Record<NotificationType, { name: string; solid: boolean }> = {
  photo: { name: 'star', solid: true },
  like: { name: 'heart', solid: true },
  comment: { name: 'comment', solid: true },
};
const NOTIF_COLOR = itemColors.jalon;

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
  footerLoader: {
    paddingVertical: 16,
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
    marginBottom: 4,
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
    paddingBottom: 40,
  },
  // Month header
  monthHeader: {
    flexDirection: "row",
    alignItems: "baseline",
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  monthLabel: {
    fontSize: 15,
    fontWeight: "600",
  },
  monthCount: {
    fontSize: 13,
    fontWeight: "400",
    marginLeft: 8,
  },
  // Grid
  monthGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: GRID_GAP,
  },
  // Thumbnail
  thumbContainer: {
    width: THUMB_SIZE,
    height: THUMB_SIZE,
    borderRadius: 2,
    overflow: "hidden",
  },
  thumbImage: {
    width: "100%",
    height: "100%",
  },
  thumbPlaceholder: {
    width: "100%",
    height: "100%",
    alignItems: "center",
    justifyContent: "center",
  },
  // Overlays on thumbnail
  notifBadge: {
    position: "absolute",
    top: 4,
    right: 4,
    width: 18,
    height: 18,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 10,
  },
  likeOverlay: {
    position: "absolute",
    bottom: 4,
    left: 4,
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    backgroundColor: "rgba(0,0,0,0.45)",
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 8,
  },
  likeOverlayText: {
    color: neutralColors.white,
    fontSize: 12,
    fontWeight: "600",
  },
  // Empty / error states
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
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 12,
    marginTop: 24,
  },
  emptyStateButtonText: {
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
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 12,
    marginTop: 16,
  },
  retryButtonText: {
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
// THUMBNAIL COMPONENT
// ============================================

const PhotoThumbnail = React.memo(function PhotoThumbnail({
  photo,
  onPhotoPress,
  onPhotoEdit,
  canEdit,
  likeCount,
  commentCount,
  notificationType,
  nc,
}: {
  photo: PhotoMilestone;
  onPhotoPress: (photo: PhotoMilestone) => void;
  onPhotoEdit: (photoId: string) => void;
  canEdit: boolean;
  likeCount?: number;
  commentCount?: number;
  notificationType?: NotificationType;
  nc: ReturnType<typeof getNeutralColors>;
}) {
  const hasLikes = (likeCount ?? 0) > 0;
  const hasComments = (commentCount ?? 0) > 0;
  const hasSocialInfo = hasLikes || hasComments;
  const [imageError, setImageError] = useState(false);

  // Pulse animation for notification badge
  const badgePulse = useRef(new RNAnimated.Value(1)).current;
  useEffect(() => {
    if (!notificationType) return;
    const loop = RNAnimated.loop(
      RNAnimated.sequence([
        RNAnimated.timing(badgePulse, { toValue: 1.25, duration: 800, useNativeDriver: true }),
        RNAnimated.timing(badgePulse, { toValue: 1, duration: 800, useNativeDriver: true }),
      ]),
    );
    startLoop(loop);
    return () => loop.stop();
  }, [notificationType, badgePulse]);

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
    <Pressable
      onPress={handlePress}
      onLongPress={canEdit ? handleLongPress : undefined}
      delayLongPress={400}
      style={[styles.thumbContainer, { backgroundColor: nc.borderLight }]}
      accessibilityRole="button"
      accessibilityLabel={`Photo${photo.titre ? ` ${photo.titre}` : ""}${hasLikes ? ", aimée" : ""}`}
      accessibilityHint={canEdit ? "Appuyez longuement pour modifier" : "Appuyez pour voir en plein écran"}
    >
      {imageError ? (
        <View style={[styles.thumbPlaceholder, { backgroundColor: nc.backgroundPressed }]}>
          <FontAwesome6 name="image" size={20} color={nc.textMuted} />
        </View>
      ) : (
        <PhotoImage
          photoRef={photo.photo}
          thumbnail
          style={styles.thumbImage}
          resizeMode="cover"
          onError={() => setImageError(true)}
        />
      )}

      {/* Notification badge with pulse */}
      {notificationType && (
        <RNAnimated.View style={[styles.notifBadge, { backgroundColor: NOTIF_COLOR, transform: [{ scale: badgePulse }] }]}>
          <FontAwesome6
            name={NOTIF_ICON[notificationType].name}
            size={8}
            color={neutralColors.white}
            solid={NOTIF_ICON[notificationType].solid}
          />
        </RNAnimated.View>
      )}

      {/* Social overlay */}
      {hasSocialInfo && (
        <View style={styles.likeOverlay}>
          {hasLikes && (
            <>
              <FontAwesome6 name="heart" size={8} color={neutralColors.white} solid />
              <Text style={styles.likeOverlayText}>{likeCount}</Text>
            </>
          )}
          {hasComments && (
            <>
              <FontAwesome6 name="comment" size={8} color={neutralColors.white} solid />
              <Text style={styles.likeOverlayText}>{commentCount}</Text>
            </>
          )}
        </View>
      )}
    </Pressable>
  );
});

// ============================================
// MAIN COMPONENT
// ============================================

export default function GalleryScreen() {
  const { activeChild } = useBaby();
  const { userName, firebaseUser } = useAuth();
  const { showAlert } = useModal();
  const { showToast } = useToast();
  const hiddenPhotoIds = useHiddenPhotos();
  const { newEventIds, newEventTypes, markEventAsSeen, markMomentsAsSeen } = useMomentsNotification();
  const { openSheet, closeSheet, isOpen } = useSheet();
  const colorScheme = useColorScheme() ?? "light";
  const nc = getNeutralColors(colorScheme);
  const jalonFill = getAccentColors(eventColors.jalon.dark, colorScheme);
  const { setHeaderLeft } = useHeaderLeft();
  const { setHeaderRight } = useHeaderRight();
  const headerOwnerId = useRef("gallery-header");
  const sheetOwnerId = "gallery";
  const permissions = useChildPermissions(activeChild?.id, firebaseUser?.uid);
  const canManageContent = canManageEvents(permissions.role);

  // Onglet masqué : router.back() suivrait l'historique des onglets (Accueil).
  // On revient donc explicitement à l'écran d'origine (Plus ou Moments).
  const { returnTo } = useLocalSearchParams<{ returnTo?: string | string[] }>();
  const returnTarget = Array.isArray(returnTo) ? returnTo[0] : returnTo;
  const goBack = useCallback(() => {
    router.replace(returnTarget === "plus" ? "/baby/plus" : "/baby/moments");
  }, [returnTarget]);

  // S7.4 : jalons paginés par 60 (première page en direct, suite au défilement).
  const {
    events,
    loaded,
    loadError,
    hasMore,
    loadingMore,
    loadMoreFailed,
    loadMore,
    reload,
    retry,
    applyFirstPageResult,
  } = useGalleryMilestones(activeChild?.id);
  const [galleryVisible, setGalleryVisible] = useState(false);
  const [galleryInitialIndex, setGalleryInitialIndex] = useState(0);
  const isMountedRef = useRef(true);

  // Likes / commentaires : écouteurs partagés par enfant (S7.2)
  const { likesInfo, commentCounts } = useSocialInteractions();
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
          onPress={goBack}
          tintColor={nc.textStrong}
        />
      );
      setHeaderLeft(backButton, headerOwnerId.current);

      return () => {
        setHeaderLeft(null, headerOwnerId.current);
      };
    }, [colorScheme, goBack, setHeaderLeft]),
  );

  // Header right - mark all read + add button
  const hasNotifications = newEventIds.size > 0;

  const handleMarkAllRead = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    markMomentsAsSeen();
  }, [markMomentsAsSeen]);

  useFocusEffect(
    useCallback(() => {
      const headerButtons = (
        <View style={styles.headerActions}>
          {hasNotifications && (
            <Pressable
              onPress={handleMarkAllRead}
              style={styles.headerButton}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              accessibilityRole="button"
              accessibilityLabel="Tout marquer comme lu"
              accessibilityHint="Supprime tous les badges de notification"
            >
              <Ionicons name="checkmark-done" size={22} color={Colors[colorScheme].tint} />
            </Pressable>
          )}
          {canManageContent && (
            <Pressable
              onPress={handleAddPhoto}
              style={styles.headerButton}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              accessibilityRole="button"
              accessibilityLabel="Ajouter un souvenir photo"
            >
              <Ionicons name="add" size={24} color={Colors[colorScheme].tint} />
            </Pressable>
          )}
        </View>
      );

      setHeaderRight(headerButtons, headerOwnerId.current);

      return () => {
        setHeaderRight(null, headerOwnerId.current);
      };
    }, [canManageContent, hasNotifications, colorScheme, setHeaderRight, handleAddPhoto, handleMarkAllRead]),
  );

  // Handle hardware back button
  useFocusEffect(
    useCallback(() => {
      const onBackPress = () => {
        if (isOpen) {
          closeSheet();
          return true;
        }
        goBack();
        return true;
      };

      const subscription = BackHandler.addEventListener(
        "hardwareBackPress",
        onBackPress,
      );
      return () => subscription.remove();
    }, [closeSheet, goBack, isOpen]),
  );

  // Ne PAS appeler markMomentsAsSeen à la sortie — les badges restent
  // jusqu'à ce que l'utilisateur tape sur chaque photo (markEventAsSeen)

  // Extract photos from events (filter hidden + reported)
  const allPhotoMilestones = useMemo(() => {
    const photos: PhotoMilestone[] = [];

    events.forEach((event) => {
      // Skip hidden photos (hide-for-me) and globally reported photos
      if (hiddenPhotoIds.has(event.id)) return;
      if ((event as any).reported === true) return;

      const eventDate = toDate(event.date);
      if (event.photos && event.photos.length > 0) {
        const photoTitre =
          event.typeJalon === "photo" && event.description
            ? event.description
            : event.titre;

        photos.push({
          id: event.id,
          key: (event as { idempotencyKey?: string }).idempotencyKey ?? event.id,
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
  }, [events, hiddenPhotoIds]);

  // Group photos by month, then flatten into virtualized headers + rows.
  const galleryListItems = useMemo<GalleryListItem[]>(() => {
    const items: GalleryListItem[] = [];
    const monthCounts = new Map<string, number>();
    allPhotoMilestones.forEach((photo) => {
      const monthKey = getMonthKey(photo.date);
      monthCounts.set(monthKey, (monthCounts.get(monthKey) ?? 0) + 1);
    });

    let currentMonthKey: string | null = null;
    let currentRow: PhotoMilestone[] = [];

    allPhotoMilestones.forEach((photo) => {
      const monthKey = getMonthKey(photo.date);

      if (currentMonthKey !== monthKey) {
        if (currentRow.length > 0 && currentMonthKey) {
          items.push({
            type: "row",
            key: `${currentMonthKey}-row-${items.length}`,
            photos: currentRow,
          });
          currentRow = [];
        }

        currentMonthKey = monthKey;
        items.push({
          type: "month",
          key: `month-${monthKey}`,
          label: getMonthLabel(photo.date),
          count: monthCounts.get(monthKey) ?? 0,
        });
      }

      currentRow.push(photo);
      if (currentRow.length === NUM_COLUMNS && currentMonthKey) {
        items.push({
          type: "row",
          key: `${currentMonthKey}-row-${photo.id}`,
          photos: currentRow,
        });
        currentRow = [];
      }
    });

    if (currentRow.length > 0 && currentMonthKey) {
      items.push({
        type: "row",
        key: `${currentMonthKey}-row-last`,
        photos: currentRow,
      });
    }

    return items;
  }, [allPhotoMilestones]);

  useForegroundServerRefresh({
    enabled: !!activeChild?.id,
    childId: activeChild?.id,
    refresh: async () => {
      if (!activeChild?.id) return [];
      return obtenirEvenements(activeChild.id, {
        type: "jalon",
        limite: GALLERY_PAGE_SIZE,
        source: "server",
      }) as Promise<MilestoneEventWithId[]>;
    },
    apply: (freshEvents) => {
      if (!isMountedRef.current) return;
      applyFirstPageResult(freshEvents);
    },
  });

  // Stable key for dependency tracking
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

  // Une page de 60 jalons peut contenir peu de photos (humeurs, dents sans
  // photo...) : on complète tant que la grille serait presque vide.
  useEffect(() => {
    if (loaded && hasMore && allPhotoMilestones.length < 18) loadMore();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- relancé à chaque page reçue
  }, [loaded, hasMore, events.length]);

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
      if (photoId?.startsWith?.('__optimistic_')) {
        showToast('Enregistrement en cours...');
        return;
      }
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

        const source = await getAuthenticatedPhotoSource(uri);
        if (!source) {
          const result = { success: false, message: "Photo indisponible" };
          showToast(result.message);
          return result;
        }

        const downloadResult = await FileSystem.downloadAsync(source.uri, localUri, {
          headers: source.headers,
        });

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
  const handleRetry = retry;

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

  const renderGalleryItem = useCallback(({
    item,
  }: {
    item: GalleryListItem;
  }) => {
    if (item.type === "month") {
      return (
        <View style={styles.monthHeader}>
          <Text style={[styles.monthLabel, { color: nc.textStrong }]}>{item.label}</Text>
          <Text style={[styles.monthCount, { color: nc.textLight }]}>
            {item.count} photo{item.count > 1 ? "s" : ""}
          </Text>
        </View>
      );
    }

    return (
      <View style={styles.monthGrid}>
        {item.photos.map((photo) => (
          <PhotoThumbnail
            key={photo.key}
            photo={photo}
            onPhotoPress={handlePhotoPress}
            onPhotoEdit={handleEditPhoto}
            canEdit={canManageContent}
            likeCount={likesInfo[photo.id]?.count}
            commentCount={commentCounts[photo.id]}
            notificationType={newEventIds.has(photo.id) ? newEventTypes.get(photo.id) : undefined}
            nc={nc}
          />
        ))}
        {item.photos.length < NUM_COLUMNS &&
          Array.from({ length: NUM_COLUMNS - item.photos.length }).map((_, index) => (
            <View key={`spacer-${index}`} style={styles.thumbContainer} />
          ))}
      </View>
    );
  }, [handlePhotoPress, canManageContent, handleEditPhoto, likesInfo, commentCounts, newEventIds, newEventTypes, nc]);

  // Pull-to-refresh
  const [isRefreshing, setIsRefreshing] = useState(false);
  const handleRefresh = useCallback(() => {
    setIsRefreshing(true);
    reload();
    setTimeout(() => setIsRefreshing(false), 800);
  }, [reload]);

  // Squelette tant que la première page n'est pas chargée ; le message « aucun
  // souvenir » seulement une fois chargée sans photo.
  const viewState = getGalleryViewState({
    loaded,
    loadError,
    eventCount: events.length,
    photoCount: allPhotoMilestones.length,
    hasMore,
    loadMoreFailed,
  });

  // Loading state - skeleton shimmer
  if (viewState === "loading") {
    return <GalleryGridSkeleton />;
  }

  // Error state with retry
  if (viewState === "error") {
    return (
      <View style={[styles.loadingContainer, { backgroundColor: nc.backgroundWarm }]}>
        <FontAwesome6 name="triangle-exclamation" size={32} color={nc.warning} />
        <Text style={[styles.errorTitle, { color: nc.textStrong }]}>Impossible de charger</Text>
        <Text style={[styles.loadingText, { color: nc.textLight }]}>Vérifiez votre connexion</Text>
        <Pressable onPress={handleRetry} style={[styles.retryButton, { backgroundColor: jalonFill.filledBg }]} accessibilityRole="button" accessibilityLabel="Réessayer le chargement">
          <FontAwesome6 name="arrow-rotate-right" size={14} color={jalonFill.filledText} />
          <Text style={[styles.retryButtonText, { color: jalonFill.filledText }]}>Réessayer</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: nc.backgroundWarm }]}>
      <SafeAreaView style={styles.safeArea} edges={["bottom"]}>
        {/* Header block */}
        <View style={styles.headerBlock}>
          <Text style={[styles.title, { color: nc.textStrong }]}>Souvenirs</Text>
          <Text style={[styles.subtitle, { color: nc.textLight }]}>
            {allPhotoMilestones.length}
            {hasMore ? "+" : ""} photo
            {allPhotoMilestones.length > 1 ? "s" : ""}
          </Text>
        </View>

        {/* Content */}
        {viewState === "empty" ? (
          <View style={styles.emptyState}>
            <FontAwesome6 name="images" size={48} color={nc.textMuted} />
            <Text style={[styles.emptyStateTitle, { color: nc.textStrong }]}>Aucun souvenir</Text>
            <Text style={[styles.emptyStateText, { color: nc.textLight }]}>
              {canManageContent
                ? "Ajoutez votre premier souvenir photo"
                : "Les souvenirs partagés apparaîtront ici"}
            </Text>
            {canManageContent && (
              <Pressable onPress={handleAddPhoto} style={[styles.emptyStateButton, { backgroundColor: jalonFill.filledBg }]} accessibilityRole="button" accessibilityLabel="Ajouter un souvenir photo">
                <FontAwesome6 name="camera" size={16} color={jalonFill.filledText} />
                <Text style={[styles.emptyStateButtonText, { color: jalonFill.filledText }]}>
                  Ajouter un souvenir
                </Text>
              </Pressable>
            )}
          </View>
        ) : (
          <FlatList
            data={galleryListItems}
            keyExtractor={(item) => item.key}
            renderItem={renderGalleryItem}
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
            initialNumToRender={18}
            maxToRenderPerBatch={12}
            windowSize={7}
            removeClippedSubviews={true}
            onEndReached={hasMore ? loadMore : undefined}
            onEndReachedThreshold={0.6}
            ListFooterComponent={
              loadingMore ? (
                <ActivityIndicator
                  style={styles.footerLoader}
                  color={nc.textMuted}
                  accessibilityLabel="Chargement des photos suivantes"
                />
              ) : undefined
            }
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
        role={permissions.role}
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
