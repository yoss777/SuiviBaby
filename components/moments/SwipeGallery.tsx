import { eventColors } from "@/constants/eventColors";
import FontAwesome6 from "@expo/vector-icons/FontAwesome6";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Dimensions,
  FlatList,
  Image,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
  ViewToken,
} from "react-native";
import {
  Gesture,
  GestureDetector,
  GestureHandlerRootView,
} from "react-native-gesture-handler";
import Animated, {
  FadeIn,
  FadeOut,
  interpolate,
  runOnJS,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { CommentsBottomSheet } from "./CommentsBottomSheet";

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get("window");
const CARD_WIDTH = SCREEN_WIDTH * 0.85;
const CARD_HEIGHT = SCREEN_HEIGHT * 0.6;
const ITEM_WIDTH = SCREEN_WIDTH;
const SIDE_CARD_SCALE = 0.9;
const SIDE_CARD_OPACITY = 0.6;

const AnimatedFlatList = Animated.createAnimatedComponent(FlatList<GalleryItem>);

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
  onAddPhoto?: () => void;
  onEdit?: (photoId: string, photoIndex: number) => void;
  onLike?: (photoId: string) => void;
  onDownload?: (
    photoId: string,
    uri: string,
  ) => Promise<{ success: boolean; message: string }>;
  likesInfo?: Record<string, LikeInfo>;
  commentCounts?: Record<string, number>;
  currentUserName?: string;
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

// Animated card wrapper - must be a real component for hooks
const AnimatedCard = ({
  index,
  scrollX,
  children,
}: {
  index: number;
  scrollX: Animated.SharedValue<number>;
  children: React.ReactNode;
}) => {
  const animatedStyle = useAnimatedStyle(() => {
    const inputRange = [
      (index - 1) * ITEM_WIDTH,
      index * ITEM_WIDTH,
      (index + 1) * ITEM_WIDTH,
    ];
    const scale = interpolate(
      scrollX.value,
      inputRange,
      [SIDE_CARD_SCALE, 1, SIDE_CARD_SCALE],
      "clamp",
    );
    const opacity = interpolate(
      scrollX.value,
      inputRange,
      [SIDE_CARD_OPACITY, 1, SIDE_CARD_OPACITY],
      "clamp",
    );
    return { transform: [{ scale }], opacity };
  });

  return <Animated.View style={animatedStyle}>{children}</Animated.View>;
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
  const insets = useSafeAreaInsets();
  const flatListRef = useRef<FlatList>(null);

  // Horizontal scroll position for card animations
  const scrollX = useSharedValue(0);

  const onScroll = useAnimatedScrollHandler({
    onScroll: (event) => {
      scrollX.value = event.contentOffset.x;
    },
  });

  // Vertical swipe animation values
  const translateY = useSharedValue(0);
  const SWIPE_THRESHOLD = 80;

  // Local optimistic state for likes
  const [optimisticLikes, setOptimisticLikes] = useState<
    Record<string, { likedByMe: boolean; countDelta: number }>
  >({});

  // Reset optimistic state and translateY when gallery closes/opens
  useEffect(() => {
    if (!visible) {
      setOptimisticLikes({});
    }
    translateY.value = 0;
  }, [visible, translateY]);

  // Sort photos: most recent first
  const sortedPhotos = useMemo(() => {
    return [...photos].sort((a, b) => b.date.getTime() - a.date.getTime());
  }, [photos]);

  // Build gallery items: [Add Card?, ...photos]
  const galleryItems: GalleryItem[] = useMemo(() => {
    const items: GalleryItem[] = sortedPhotos.map((photo) => ({
      type: "photo",
      id: photo.id,
      photo,
    }));
    if (onAddPhoto) {
      items.unshift({ type: "add", id: "add-card" });
    }
    return items;
  }, [sortedPhotos, onAddPhoto]);

  // Current index in the gallery
  const [currentIndex, setCurrentIndex] = useState(onAddPhoto ? 1 : 0);

  // Comments bottom sheet state
  const [commentsVisible, setCommentsVisible] = useState(false);
  const [commentsPhotoId, setCommentsPhotoId] = useState<string | null>(null);
  const [commentsPhotoTitle, setCommentsPhotoTitle] = useState<
    string | undefined
  >(undefined);

  // Local toast state
  const [localToast, setLocalToast] = useState<string | null>(null);
  const toastTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Double tap heart animation state
  const [doubleTapHeartId, setDoubleTapHeartId] = useState<string | null>(null);
  const [imageErrorIds, setImageErrorIds] = useState<Record<string, boolean>>(
    {},
  );
  const heartScale = useSharedValue(0);
  const lastTapTimeRef = useRef<number>(0);
  const DOUBLE_TAP_DELAY = 300;

  // Track if initial position has been set
  const initialPositionSetRef = useRef(false);

  // Reset when gallery closes
  useEffect(() => {
    if (!visible) {
      initialPositionSetRef.current = false;
      setCommentsVisible(false);
      setCommentsPhotoId(null);
    }
  }, [visible]);

  // Calculate initial page index
  const computedInitialPage = useMemo(() => {
    if (initialIndex >= 0 && photos.length > 0) {
      const clickedPhoto = photos[initialIndex];
      const sortedIndex = sortedPhotos.findIndex(
        (p) => p.id === clickedPhoto?.id,
      );
      const baseIndex = onAddPhoto ? 1 : 0;
      return sortedIndex >= 0 ? sortedIndex + baseIndex : baseIndex;
    }
    return onAddPhoto ? 1 : 0;
  }, [initialIndex, photos, sortedPhotos, onAddPhoto]);

  // Scroll to initial position when gallery opens
  useEffect(() => {
    if (
      visible &&
      !initialPositionSetRef.current &&
      initialIndex >= 0 &&
      photos.length > 0
    ) {
      setCurrentIndex(computedInitialPage);
      initialPositionSetRef.current = true;
      setTimeout(() => {
        flatListRef.current?.scrollToIndex({
          index: computedInitialPage,
          animated: false,
        });
      }, 50);
    }
  }, [visible, initialIndex, photos, computedInitialPage]);

  // Handle viewable items change for FlatList
  const onViewableItemsChanged = useRef(
    ({ viewableItems }: { viewableItems: ViewToken[] }) => {
      if (viewableItems.length > 0 && viewableItems[0].index != null) {
        setCurrentIndex(viewableItems[0].index);
      }
    },
  ).current;

  const viewabilityConfig = useRef({
    itemVisiblePercentThreshold: 50,
  }).current;

  // Edit current photo
  const handleEdit = useCallback(() => {
    const item = galleryItems[currentIndex];
    if (item.type === "photo" && onEdit) {
      const offset = onAddPhoto ? 1 : 0;
      const photoIndex = currentIndex - offset;
      onClose();
      onEdit(item.photo.id, photoIndex);
    }
  }, [currentIndex, galleryItems, onClose, onEdit, onAddPhoto]);

  // Handle add photo
  const handleAddPhoto = useCallback(() => {
    if (!onAddPhoto) return;
    onClose();
    onAddPhoto();
  }, [onClose, onAddPhoto]);

  // Handle like with optimistic update
  const handleLike = useCallback(
    (photoId: string) => {
      const serverInfo = likesInfo[photoId] || {
        count: 0,
        likedByMe: false,
        likedByNames: [],
      };
      const optimistic = optimisticLikes[photoId];
      const currentLikedByMe = optimistic
        ? optimistic.likedByMe
        : serverInfo.likedByMe;

      const newLikedByMe = !currentLikedByMe;

      setOptimisticLikes((prev) => ({
        ...prev,
        [photoId]: {
          likedByMe: newLikedByMe,
          countDelta: newLikedByMe
            ? (prev[photoId]?.countDelta ?? 0) + (currentLikedByMe ? 0 : 1)
            : (prev[photoId]?.countDelta ?? 0) - (currentLikedByMe ? 1 : 0),
        },
      }));

      onLike?.(photoId);
    },
    [onLike, likesInfo, optimisticLikes],
  );

  // Handle double tap to like
  const handleDoubleTap = useCallback(
    (photoId: string) => {
      setDoubleTapHeartId(photoId);
      heartScale.value = withSequence(
        withSpring(1.2, { damping: 8, stiffness: 400 }),
        withSpring(1, { damping: 10, stiffness: 300 }),
      );

      setTimeout(() => {
        setDoubleTapHeartId(null);
        heartScale.value = 0;
      }, 800);

      handleLike(photoId);
    },
    [handleLike, heartScale],
  );

  // Animated style for double tap heart
  const heartAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: heartScale.value }],
    opacity: heartScale.value > 0 ? 1 : 0,
  }));

  // Handle comment
  const handleComment = useCallback((photoId: string, title?: string) => {
    setCommentsPhotoId(photoId);
    setCommentsPhotoTitle(title);
    setCommentsVisible(true);
  }, []);

  // Close comments
  const handleCloseComments = useCallback(() => {
    setCommentsVisible(false);
  }, []);

  // Open comments for current photo via swipe up
  const openCurrentPhotoComments = useCallback(() => {
    const item = galleryItems[currentIndex];
    if (item?.type === "photo") {
      handleComment(item.photo.id, item.photo.titre);
    }
  }, [currentIndex, galleryItems, handleComment]);

  // Vertical pan gesture for swipe up (comments) and swipe down (close)
  const verticalPanGesture = Gesture.Pan()
    .enabled(!commentsVisible)
    .activeOffsetY([-30, 30])
    .failOffsetX([-15, 15])
    .onUpdate((event) => {
      if (event.translationY > 0) {
        translateY.value = event.translationY * 0.5;
      }
    })
    .onEnd((event) => {
      const { translationY, velocityY } = event;

      if (translationY > SWIPE_THRESHOLD || velocityY > 500) {
        translateY.value = withTiming(SCREEN_HEIGHT, { duration: 200 });
        runOnJS(onClose)();
      } else if (translationY < -SWIPE_THRESHOLD || velocityY < -500) {
        runOnJS(openCurrentPhotoComments)();
      } else {
        translateY.value = withSpring(0);
      }
    });

  // Animated style for vertical drag
  const containerAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }));

  // Show local toast
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

  // Get photo info (with optimistic updates merged)
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

  // Handle tap on image - detect double tap
  const handleImageTap = useCallback(
    (photoId: string) => {
      const now = Date.now();
      if (now - lastTapTimeRef.current < DOUBLE_TAP_DELAY) {
        handleDoubleTap(photoId);
        lastTapTimeRef.current = 0;
      } else {
        lastTapTimeRef.current = now;
      }
    },
    [handleDoubleTap],
  );

  // Render a single gallery item
  const renderItem = useCallback(
    ({ item, index }: { item: GalleryItem; index: number }) => {
      if (item.type === "add") {
        return (
          <View style={styles.itemContainer}>
            <AnimatedCard index={index} scrollX={scrollX}>
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
      }

      const likeInfo = getPhotoInfo(item.photo.id);
      const commentCount = commentCounts[item.photo.id] || 0;

      return (
        <View style={styles.itemContainer}>
          <AnimatedCard index={index} scrollX={scrollX}>
            <View style={styles.cardWithSocial}>
              <Pressable
                style={styles.card}
                onPress={() => handleImageTap(item.photo.id)}
              >
                <Image
                  source={{ uri: item.photo.uri }}
                  style={styles.cardImage}
                  resizeMode="contain"
                  fadeDuration={0}
                  onError={() =>
                    setImageErrorIds((prev) => ({
                      ...prev,
                      [item.photo.id]: true,
                    }))
                  }
                />

                {imageErrorIds[item.photo.id] && (
                  <View style={styles.imageErrorOverlay}>
                    <Text style={styles.imageErrorText}>
                      Impossible d'afficher l'image
                    </Text>
                  </View>
                )}

                {/* Double tap heart animation */}
                {doubleTapHeartId === item.photo.id && (
                  <Animated.View
                    style={[styles.doubleTapHeart, heartAnimatedStyle]}
                  >
                    <FontAwesome6 name="heart" size={80} color="#ef4444" solid />
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
                      onPress={() =>
                        handleComment(item.photo.id, item.photo.titre)
                      }
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
    },
    [
      scrollX,
      getPhotoInfo,
      commentCounts,
      handleImageTap,
      handleLike,
      handleComment,
      handleAddPhoto,
      doubleTapHeartId,
      heartAnimatedStyle,
      imageErrorIds,
    ],
  );

  const getItemLayout = useCallback(
    (_: any, index: number) => ({
      length: ITEM_WIDTH,
      offset: ITEM_WIDTH * index,
      index,
    }),
    [],
  );

  if (!visible) return null;

  const currentItem = galleryItems[currentIndex] ?? galleryItems[0];

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <GestureHandlerRootView style={{ flex: 1 }}>
        <GestureDetector gesture={verticalPanGesture}>
          <Animated.View
            style={[
              styles.container,
              backgroundColor && { backgroundColor },
              containerAnimatedStyle,
            ]}
          >
            <View style={[styles.safeArea, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
              {/* Header */}
              <View style={styles.header}>
                <Pressable style={styles.closeButton} onPress={onClose}>
                  <FontAwesome6 name="xmark" size={20} color="#fff" />
                </Pressable>

                <View style={styles.headerTitleContainer}>
                  <Text style={styles.headerTitle}>
                    {currentItem.type === "add"
                      ? ""
                      : `${currentIndex} / ${sortedPhotos.length}`}
                  </Text>
                </View>

                {currentItem.type === "photo" ? (
                  <View style={styles.headerActions}>
                    {onEdit && (
                      <Pressable
                        style={({ pressed }) => [
                          styles.headerButton,
                          pressed && styles.headerButtonPressed,
                        ]}
                        onPress={handleEdit}
                      >
                        <FontAwesome6 name="pen" size={16} color="#fff" />
                      </Pressable>
                    )}
                    <Pressable
                      style={({ pressed }) => [
                        styles.headerButton,
                        pressed && styles.headerButtonPressed,
                      ]}
                      onPress={() =>
                        handleDownload(
                          currentItem.photo.id,
                          currentItem.photo.uri,
                        )
                      }
                    >
                      <FontAwesome6 name="download" size={16} color="#fff" />
                    </Pressable>
                  </View>
                ) : (
                  <View style={styles.headerActions} />
                )}
              </View>

              {/* FlatList Gallery */}
              <View style={styles.pagerWrapper}>
                <AnimatedFlatList
                  ref={flatListRef}
                  data={galleryItems}
                  renderItem={renderItem}
                  keyExtractor={(item: GalleryItem) => item.id}
                  horizontal
                  pagingEnabled
                  showsHorizontalScrollIndicator={false}
                  getItemLayout={getItemLayout}
                  onViewableItemsChanged={onViewableItemsChanged}
                  viewabilityConfig={viewabilityConfig}
                  initialScrollIndex={computedInitialPage}
                  decelerationRate="fast"
                  bounces={false}
                  onScroll={onScroll}
                  scrollEventThrottle={16}
                />
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
                        index === 0 && onAddPhoto && styles.dotAdd,
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

              {/* Vertical swipe hints */}
              <View style={styles.verticalHintsContainer}>
                {currentItem.type === "photo" && (
                  <View style={styles.verticalHint}>
                    <FontAwesome6
                      name="chevron-up"
                      size={10}
                      color="rgba(255,255,255,0.4)"
                    />
                    <Text style={styles.verticalHintText}>Commentaires</Text>
                  </View>
                )}
              </View>
            </View>

            {/* Comments Bottom Sheet */}
            <CommentsBottomSheet
              visible={commentsVisible}
              eventId={commentsPhotoId || ""}
              childId={childId}
              photoTitle={commentsPhotoTitle}
              onClose={handleCloseComments}
            />

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
          </Animated.View>
        </GestureDetector>
      </GestureHandlerRootView>
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
    justifyContent: "center",
  },
  itemContainer: {
    width: ITEM_WIDTH,
    alignItems: "center",
    justifyContent: "center",
  },
  cardWithSocial: {
    width: CARD_WIDTH,
  },
  card: {
    width: CARD_WIDTH,
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
    marginTop: 12,
    paddingHorizontal: 8,
    paddingBottom: 4,
  },
  cardImage: {
    width: CARD_WIDTH,
    height: CARD_HEIGHT,
  },
  imageErrorOverlay: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 16,
    backgroundColor: "rgba(0,0,0,0.35)",
  },
  imageErrorText: {
    color: "#fff",
    fontSize: 14,
    textAlign: "center",
  },
  doubleTapHeart: {
    position: "absolute",
    top: "50%",
    left: "50%",
    marginTop: -40,
    marginLeft: -40,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
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
  verticalHintsContainer: {
    alignItems: "center",
    paddingBottom: 8,
  },
  verticalHint: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  verticalHintText: {
    fontSize: 11,
    color: "rgba(255, 255, 255, 0.4)",
  },
});
