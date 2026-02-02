import { eventColors } from "@/constants/eventColors";
import FontAwesome6 from "@expo/vector-icons/FontAwesome6";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Dimensions,
  Image,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import PagerView, {
  PagerViewOnPageScrollEventData,
  PagerViewOnPageSelectedEventData,
} from "react-native-pager-view";
import Animated, {
  FadeIn,
  FadeOut,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
} from "react-native-reanimated";
import { SafeAreaView } from "react-native-safe-area-context";
import { CommentsBottomSheet } from "./CommentsBottomSheet";

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get("window");
const CARD_WIDTH = SCREEN_WIDTH * 0.85;
const CARD_HEIGHT = SCREEN_HEIGHT * 0.6;
const SIDE_CARD_SCALE = 0.15;
// Calculate page margin to show adjacent cards (must be integer)
const PAGE_MARGIN = Math.round((SCREEN_WIDTH - CARD_WIDTH) / 2 - 20);

type PhotoItem = {
  id: string;
  uri: string;
  date: Date;
  titre?: string;
};

type LikeInfo = {
  count: number;
  likedByMe: boolean;
  likedByNames: string[]; // Ex: ["Papa", "Mamie", "Tata"]
};

type SwipeGalleryProps = {
  photos: PhotoItem[];
  initialIndex: number;
  visible: boolean;
  childId: string;
  backgroundColor?: string;
  onClose: () => void;
  onAddPhoto: () => void;
  onEdit?: (photoId: string) => void;
  onLike?: (photoId: string) => void;
  onDownload?: (
    photoId: string,
    uri: string,
  ) => Promise<{ success: boolean; message: string }>;
  likesInfo?: Record<string, LikeInfo>;
  commentCounts?: Record<string, number>;
  currentUserName?: string; // Name to display when user likes (e.g., "Moi", "Papa")
};

// Format date for overlay
const formatDate = (date: Date) => {
  return date.toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

// Format date short for title fallback
const formatDateShort = (date: Date) =>
  date.toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });

type GalleryItem =
  | { type: "add"; id: string }
  | { type: "photo"; id: string; photo: PhotoItem };

// Animated card wrapper component
const AnimatedCard = ({
  children,
  index,
  scrollOffset,
  currentPage,
}: {
  children: React.ReactNode;
  index: number;
  scrollOffset: Animated.SharedValue<number>;
  currentPage: Animated.SharedValue<number>;
}) => {
  const animatedStyle = useAnimatedStyle(() => {
    const position = index - currentPage.value - scrollOffset.value;

    const scale = interpolate(
      position,
      [-1, 0, 1],
      [SIDE_CARD_SCALE, 1, SIDE_CARD_SCALE],
      "clamp",
    );

    const opacity = interpolate(position, [-1, 0, 1], [0.7, 1, 0.7], "clamp");

    return {
      transform: [{ scale }],
      opacity,
    };
  });

  return (
    <Animated.View style={[styles.cardWrapper, animatedStyle]}>
      {children}
    </Animated.View>
  );
};

// Format likes text
const formatLikesText = (likeInfo: LikeInfo): string => {
  if (likeInfo.count === 0) return "";
  if (likeInfo.likedByNames.length === 0) {
    return `${likeInfo.count} j'aime`;
  }
  if (likeInfo.likedByNames.length === 1) {
    return `Aimé par ${likeInfo.likedByNames[0]}`;
  }
  if (likeInfo.likedByNames.length === 2) {
    return `Aimé par ${likeInfo.likedByNames[0]} et ${likeInfo.likedByNames[1]}`;
  }
  const othersCount = likeInfo.count - 2;
  return `Aimé par ${likeInfo.likedByNames[0]}, ${likeInfo.likedByNames[1]} et ${othersCount} autre${othersCount > 1 ? "s" : ""}`;
};

export const SwipeGallery = ({
  photos,
  initialIndex,
  visible,
  childId,
  backgroundColor,
  onClose,
  onAddPhoto,
  onEdit,
  onLike,
  onDownload,
  likesInfo = {},
  commentCounts = {},
  currentUserName = "Moi",
}: SwipeGalleryProps) => {
  const pagerRef = useRef<PagerView>(null);
  const scrollOffset = useSharedValue(0);
  const currentPage = useSharedValue(1);

  // Local optimistic state for likes (merges with props)
  const [optimisticLikes, setOptimisticLikes] = useState<
    Record<string, { likedByMe: boolean; countDelta: number }>
  >({});

  // Reset optimistic state when gallery closes or likesInfo changes from parent
  useEffect(() => {
    if (!visible) {
      setOptimisticLikes({});
    }
  }, [visible]);

  // Sort photos: most recent first
  const sortedPhotos = useMemo(() => {
    return [...photos].sort((a, b) => b.date.getTime() - a.date.getTime());
  }, [photos]);

  // Build gallery items: [Add Card, ...photos]
  const galleryItems: GalleryItem[] = useMemo(() => {
    const items: GalleryItem[] = [{ type: "add", id: "add-card" }];
    sortedPhotos.forEach((photo) => {
      items.push({ type: "photo", id: photo.id, photo });
    });
    return items;
  }, [sortedPhotos]);

  // Current index in the gallery
  const [currentIndex, setCurrentIndex] = useState(1);
  const [showOverlay, setShowOverlay] = useState(false);
  const overlayTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Comments bottom sheet state
  const [commentsVisible, setCommentsVisible] = useState(false);
  const [commentsPhotoId, setCommentsPhotoId] = useState<string | null>(null);
  const [commentsPhotoTitle, setCommentsPhotoTitle] = useState<
    string | undefined
  >(undefined);

  // Local toast state (to show inside the modal)
  const [localToast, setLocalToast] = useState<string | null>(null);
  const toastTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Track if initial position has been set for this gallery session
  const initialPositionSetRef = useRef(false);

  // Reset when gallery closes
  useEffect(() => {
    if (!visible) {
      initialPositionSetRef.current = false;
    }
  }, [visible]);

  // Find the initial position based on the photo clicked - only once when gallery opens
  useEffect(() => {
    if (
      visible &&
      !initialPositionSetRef.current &&
      initialIndex >= 0 &&
      photos.length > 0
    ) {
      const clickedPhoto = photos[initialIndex];
      const sortedIndex = sortedPhotos.findIndex(
        (p) => p.id === clickedPhoto?.id,
      );
      // +1 because index 0 is the "Add" card
      const targetIndex = sortedIndex >= 0 ? sortedIndex + 1 : 1;
      setCurrentIndex(targetIndex);
      currentPage.value = targetIndex;
      initialPositionSetRef.current = true;
      // Set initial page after a short delay to ensure pager is mounted
      setTimeout(() => {
        pagerRef.current?.setPageWithoutAnimation(targetIndex);
      }, 50);
    }
  }, [visible, initialIndex, photos, sortedPhotos, currentPage]);

  // Clear overlay timeout on unmount
  useEffect(() => {
    return () => {
      if (overlayTimeoutRef.current) {
        clearTimeout(overlayTimeoutRef.current);
      }
    };
  }, []);

  // Handle tap to show overlay
  const handleTap = useCallback(() => {
    setShowOverlay(true);

    if (overlayTimeoutRef.current) {
      clearTimeout(overlayTimeoutRef.current);
    }

    overlayTimeoutRef.current = setTimeout(() => {
      setShowOverlay(false);
    }, 2000);
  }, []);

  // Handle page scroll for animations
  const onPageScroll = useCallback(
    (e: { nativeEvent: PagerViewOnPageScrollEventData }) => {
      const { position, offset } = e.nativeEvent;
      currentPage.value = position;
      scrollOffset.value = offset;
    },
    [currentPage, scrollOffset],
  );

  // Handle page change
  const onPageSelected = useCallback(
    (e: { nativeEvent: PagerViewOnPageSelectedEventData }) => {
      const newIndex = e.nativeEvent.position;
      setCurrentIndex(newIndex);
      setShowOverlay(false);
    },
    [],
  );

  // Edit current photo
  const handleEdit = useCallback(() => {
    const item = galleryItems[currentIndex];
    if (item.type === "photo") {
      onClose();
      onEdit?.(item.photo.id);
    }
  }, [currentIndex, galleryItems, onClose, onEdit]);

  // Handle add photo
  const handleAddPhoto = useCallback(() => {
    onClose();
    onAddPhoto();
  }, [onClose, onAddPhoto]);

  // Render add card
  const renderAddCard = (index: number) => (
    <View key="add-card" style={styles.pageContainer}>
      <AnimatedCard
        index={index}
        scrollOffset={scrollOffset}
        currentPage={currentPage}
      >
        <Pressable
          style={[styles.card, styles.addCard]}
          onPress={handleAddPhoto}
        >
          <View style={styles.addCardContent}>
            <View style={styles.addIconCircle}>
              <FontAwesome6
                name="plus"
                size={32}
                color={eventColors.jalon.dark}
              />
            </View>
            <Text style={styles.addCardTitle}>Nouveau souvenir</Text>
            <Text style={styles.addCardSubtitle}>Ajoutez une photo</Text>
          </View>
        </Pressable>
      </AnimatedCard>
    </View>
  );

  // Handle like with optimistic update
  const handleLike = useCallback(
    (photoId: string) => {
      // Get current state (considering optimistic updates)
      const serverInfo = likesInfo[photoId] || {
        count: 0,
        likedByMe: false,
        likedByNames: [],
      };
      const optimistic = optimisticLikes[photoId];
      const currentLikedByMe = optimistic
        ? optimistic.likedByMe
        : serverInfo.likedByMe;

      // Toggle like
      const newLikedByMe = !currentLikedByMe;

      // Update optimistic state immediately
      setOptimisticLikes((prev) => ({
        ...prev,
        [photoId]: {
          likedByMe: newLikedByMe,
          countDelta: newLikedByMe
            ? (prev[photoId]?.countDelta ?? 0) + (currentLikedByMe ? 0 : 1)
            : (prev[photoId]?.countDelta ?? 0) - (currentLikedByMe ? 1 : 0),
        },
      }));

      // Call parent callback for persistence (can handle offline queue)
      onLike?.(photoId);
    },
    [onLike, likesInfo, optimisticLikes],
  );

  // Handle comment - open bottom sheet
  const handleComment = useCallback((photoId: string, title?: string) => {
    setCommentsPhotoId(photoId);
    setCommentsPhotoTitle(title);
    setCommentsVisible(true);
  }, []);

  // Close comments bottom sheet
  const handleCloseComments = useCallback(() => {
    setCommentsVisible(false);
  }, []);

  // Show local toast inside the modal
  const showLocalToast = useCallback((message: string) => {
    if (toastTimeoutRef.current) {
      clearTimeout(toastTimeoutRef.current);
    }
    setLocalToast(message);
    toastTimeoutRef.current = setTimeout(() => {
      setLocalToast(null);
      toastTimeoutRef.current = null;
    }, 2600);
  }, []);

  // Handle download
  const handleDownload = useCallback(
    async (photoId: string, uri: string) => {
      if (!onDownload) return;
      const result = await onDownload(photoId, uri);
      showLocalToast(result.message);
    },
    [onDownload, showLocalToast],
  );

  // Get photo info for a specific photo (with optimistic updates merged)
  const getPhotoInfo = useCallback(
    (photoId: string) => {
      const serverInfo = likesInfo[photoId] || {
        count: 0,
        likedByMe: false,
        likedByNames: [],
      };
      const optimistic = optimisticLikes[photoId];

      if (optimistic) {
        const newLikedByMe = optimistic.likedByMe;
        const wasLikedByMe = serverInfo.likedByMe;

        let updatedNames = [...serverInfo.likedByNames];
        if (newLikedByMe && !wasLikedByMe) {
          // Always use "Moi" for current user to avoid flash when server responds
          updatedNames = [
            "Moi",
            ...updatedNames.filter((name) => name !== "Moi"),
          ];
        } else if (!newLikedByMe && wasLikedByMe) {
          updatedNames = updatedNames.filter((name) => name !== "Moi");
        }

        return {
          count: Math.max(0, serverInfo.count + optimistic.countDelta),
          likedByMe: newLikedByMe,
          likedByNames: updatedNames,
        };
      }
      return serverInfo;
    },
    [likesInfo, optimisticLikes],
  );

  // Render photo card
  const renderPhotoCard = (
    item: GalleryItem & { type: "photo" },
    index: number,
  ) => {
    const likeInfo = getPhotoInfo(item.photo.id);
    const commentCount = commentCounts[item.photo.id] || 0;

    return (
      <View key={item.id} style={styles.pageContainer}>
        <AnimatedCard
          index={index}
          scrollOffset={scrollOffset}
          currentPage={currentPage}
        >
          <View style={styles.cardWithSocial}>
            <Pressable style={styles.card} onPress={handleTap}>
              <Image
                source={{ uri: item.photo.uri }}
                style={styles.cardImage}
                resizeMode="cover"
              />

              {/* Overlay with info */}
              {showOverlay && currentIndex === index && (
                <Animated.View
                  entering={FadeIn.duration(200)}
                  exiting={FadeOut.duration(300)}
                  style={styles.overlay}
                >
                  <View style={styles.overlayContent}>
                    {item.photo.titre && (
                      <Text style={styles.overlayTitle}>
                        {item.photo.titre}
                      </Text>
                    )}
                    <Text style={styles.overlayDate}>
                      {formatDate(item.photo.date)}
                    </Text>
                  </View>
                </Animated.View>
              )}
            </Pressable>

            {/* Social bar below the image */}
            <View style={styles.cardSocialBar}>
              <View style={styles.socialBarRow}>
                <View style={styles.socialBarActions}>
                  <Pressable
                    style={({ pressed }) => [
                      styles.socialBarButton,
                      pressed && styles.socialBarButtonPressed,
                    ]}
                    onPress={() => handleLike(item.photo.id)}
                  >
                    <FontAwesome6
                      name="heart"
                      size={22}
                      color={likeInfo.likedByMe ? "#ef4444" : "#fff"}
                      solid={likeInfo.likedByMe}
                    />
                  </Pressable>
                  <Pressable
                    style={({ pressed }) => [
                      styles.socialBarButton,
                      pressed && styles.socialBarButtonPressed,
                    ]}
                    onPress={() => handleComment(item.photo.id, item.photo.titre)}
                  >
                    <FontAwesome6 name="comment" size={22} color="#fff" />
                    {commentCount > 0 && <View style={styles.commentDot} />}
                  </Pressable>
                </View>
                <View style={styles.photoInfoContainer}>
                  <Text style={styles.photoDate}>
                    {formatDateShort(item.photo.date)}
                  </Text>
                  {item.photo.titre && (
                    <Text style={styles.photoTitle} numberOfLines={1}>
                      {item.photo.titre}
                    </Text>
                  )}
                </View>
              </View>
              {likeInfo.count > 0 && (
                <Text style={styles.likesText}>
                  {formatLikesText(likeInfo)}
                </Text>
              )}
            </View>
          </View>
        </AnimatedCard>
      </View>
    );
  };

  if (!visible) return null;

  const currentItem = galleryItems[currentIndex] ?? galleryItems[0];

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={[styles.container, backgroundColor && { backgroundColor }]}>
        <SafeAreaView style={styles.safeArea} edges={["top", "bottom"]}>
          {/* Header */}
          <View style={styles.header}>
            <Pressable style={styles.closeButton} onPress={onClose}>
              <FontAwesome6 name="xmark" size={20} color="#fff" />
            </Pressable>

            <View style={styles.headerTitleContainer}>
              <Text style={styles.headerTitle}>
                {currentIndex === 0
                  ? ""
                  : `${currentIndex} / ${sortedPhotos.length}`}
              </Text>
            </View>

            {currentItem.type === "photo" ? (
              <View style={styles.headerActions}>
                {/* <Pressable
                  style={({ pressed }) => [
                    styles.headerButton,
                    pressed && styles.headerButtonPressed,
                  ]}
                  onPress={handleEdit}
                >
                  <FontAwesome6 name="pen" size={16} color="#fff" />
                </Pressable> */}
                <Pressable
                  style={({ pressed }) => [
                    styles.headerButton,
                    pressed && styles.headerButtonPressed,
                  ]}
                  onPress={() =>
                    handleDownload(currentItem.photo.id, currentItem.photo.uri)
                  }
                >
                  <FontAwesome6 name="download" size={16} color="#fff" />
                </Pressable>
              </View>
            ) : (
              <View style={styles.headerActions} />
            )}
          </View>

          {/* PagerView */}
          <View style={styles.pagerWrapper}>
            <PagerView
              ref={pagerRef}
              style={styles.pager}
              initialPage={1}
              onPageScroll={onPageScroll}
              onPageSelected={onPageSelected}
              overdrag={true}
              offscreenPageLimit={2}
              pageMargin={PAGE_MARGIN}
            >
              {galleryItems.map((item, index) =>
                item.type === "add"
                  ? renderAddCard(index)
                  : renderPhotoCard(item, index),
              )}
            </PagerView>
          </View>

          {/* Dots - only show if 10 or fewer items */}
          {galleryItems.length <= 10 && (
            <View style={styles.dotsContainer}>
              {galleryItems.map((_, index) => (
                <View
                  key={index}
                  style={[
                    styles.dot,
                    index === currentIndex && styles.dotActive,
                    index === 0 && styles.dotAdd,
                  ]}
                />
              ))}
            </View>
          )}

          {/* Swipe hints */}
          <View style={styles.hintsContainer}>
            {currentIndex > 0 && (
              <View style={styles.hint}>
                <FontAwesome6
                  name="chevron-left"
                  size={12}
                  color="rgba(255,255,255,0.5)"
                />
                <Text style={styles.hintText}>Plus récent</Text>
              </View>
            )}
            <View style={{ flex: 1 }} />
            {currentIndex < galleryItems.length - 1 && (
              <View style={styles.hint}>
                <Text style={styles.hintText}>Plus ancien</Text>
                <FontAwesome6
                  name="chevron-right"
                  size={12}
                  color="rgba(255,255,255,0.5)"
                />
              </View>
            )}
          </View>
        </SafeAreaView>

        {/* Comments Bottom Sheet */}
        {commentsPhotoId && (
          <CommentsBottomSheet
            visible={commentsVisible}
            eventId={commentsPhotoId}
            childId={childId}
            photoTitle={commentsPhotoTitle}
            onClose={handleCloseComments}
          />
        )}

        {/* Local Toast */}
        {localToast && (
          <Animated.View
            entering={FadeIn.duration(200)}
            exiting={FadeOut.duration(200)}
            style={styles.localToast}
          >
            <Text style={styles.localToastText}>{localToast}</Text>
          </Animated.View>
        )}
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.95)",
  },
  safeArea: {
    flex: 1,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  closeButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(255, 255, 255, 0.1)",
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitleContainer: {
    position: "absolute",
    left: 0,
    right: 0,
    alignItems: "center",
    pointerEvents: "none",
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: "#fff",
  },
  headerActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  headerButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(255, 255, 255, 0.1)",
    alignItems: "center",
    justifyContent: "center",
  },
  headerButtonPressed: {
    transform: [{ scale: 0.9 }],
    opacity: 0.7,
  },
  pagerWrapper: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    overflow: "visible",
  },
  pager: {
    width: SCREEN_WIDTH,
    height: CARD_HEIGHT + 80,
    overflow: "visible",
  },
  pageContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    overflow: "visible",
  },
  cardWrapper: {
    width: CARD_WIDTH,
    height: CARD_HEIGHT + 60, // Card + social bar height
    overflow: "visible",
  },
  cardWithSocial: {
    width: "100%",
    height: "100%",
  },
  card: {
    width: "100%",
    height: CARD_HEIGHT,
    borderRadius: 20,
    overflow: "hidden",
    backgroundColor: "#1a1a1a",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.3,
    shadowRadius: 20,
    elevation: 10,
  },
  cardSocialBar: {
    marginTop: 15,
    height: 45,
    paddingHorizontal: 8,
  },
  cardImage: {
    width: "100%",
    height: "100%",
  },
  overlay: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    paddingBottom: 24,
    paddingTop: 60,
    paddingHorizontal: 20,
  },
  overlayContent: {
    backgroundColor: "rgba(0, 0, 0, 0.7)",
    borderRadius: 12,
    padding: 16,
  },
  overlayTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#fff",
    marginBottom: 4,
  },
  overlayDate: {
    fontSize: 14,
    color: "rgba(255, 255, 255, 0.8)",
  },
  addCard: {
    backgroundColor: "#1f2937",
    borderWidth: 2,
    borderColor: "rgba(255, 255, 255, 0.1)",
    borderStyle: "dashed",
  },
  addCardContent: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  addIconCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: eventColors.jalon.light,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 24,
  },
  addCardTitle: {
    fontSize: 22,
    fontWeight: "700",
    color: "#fff",
    marginBottom: 8,
  },
  addCardSubtitle: {
    fontSize: 15,
    color: "rgba(255, 255, 255, 0.6)",
  },
  dotsContainer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 16,
    gap: 8,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "rgba(255, 255, 255, 0.3)",
  },
  dotActive: {
    backgroundColor: "#fff",
    width: 24,
  },
  dotAdd: {
    backgroundColor: eventColors.jalon.dark,
  },
  hintsContainer: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 24,
    paddingBottom: 16,
  },
  hint: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  hintText: {
    fontSize: 12,
    color: "rgba(255, 255, 255, 0.5)",
  },
  socialBarRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  socialBarActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  photoInfoContainer: {
    flex: 1,
    alignItems: "flex-end",
    marginLeft: 12,
  },
  photoDate: {
    fontSize: 11,
    color: "rgba(255, 255, 255, 0.6)",
    fontStyle: "italic",
  },
  photoTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: "rgba(255, 255, 255, 0.9)",
    textAlign: "right",
    marginTop: 2,
  },
  socialBarButton: {
    padding: 4,
  },
  socialBarButtonPressed: {
    transform: [{ scale: 0.9 }],
    opacity: 0.8,
  },
  likesText: {
    fontSize: 13,
    color: "rgba(255, 255, 255, 0.85)",
    marginTop: 4,
    fontWeight: "500",
  },
  commentDot: {
    position: "absolute",
    top: 2,
    right: 2,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: eventColors.jalon.dark,
  },
  localToast: {
    position: "absolute",
    bottom: 100,
    alignSelf: "center",
    backgroundColor: "rgba(20, 20, 20, 0.92)",
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 999,
    maxWidth: "90%",
  },
  localToastText: {
    color: "#fff",
    fontSize: 13,
    fontWeight: "600",
  },
});
