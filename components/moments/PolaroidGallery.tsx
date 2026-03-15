import { getNeutralColors } from "@/constants/dashboardColors";
import { eventColors } from "@/constants/eventColors";
import { NotificationType } from "@/contexts/MomentsNotificationContext";
import FontAwesome6 from "@expo/vector-icons/FontAwesome6";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Dimensions,
  Image,
  ImageErrorEventData,
  NativeSyntheticEvent,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import Animated, {
  FadeInDown,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from "react-native-reanimated";

const { width: SCREEN_WIDTH } = Dimensions.get("window");
const POLAROID_WIDTH = (SCREEN_WIDTH - 48 - 12) / 2;

type PhotoMilestone = {
  id: string;
  date: Date;
  photo: string;
  titre?: string;
  description?: string;
  typeJalon: string;
};

type LikeInfo = {
  count: number;
  likedByMe: boolean;
  likedByNames: string[];
};

type PolaroidGalleryProps = {
  photos: PhotoMilestone[];
  onPhotoPress: (photo: PhotoMilestone) => void;
  onPhotoLongPress?: (photo: PhotoMilestone) => void;
  onAddPhoto?: () => void;
  onSeeAll?: () => void;
  likesInfo?: Record<string, LikeInfo>;
  commentCounts?: Record<string, number>;
  newEventIds?: Set<string>;
  newEventTypes?: Map<string, NotificationType>;
  colorScheme?: "light" | "dark";
};

const formatDateShort = (date: Date) =>
  date.toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });

// Notification badge icon config
const NOTIF_ICON: Record<NotificationType, { name: string; solid: boolean }> = {
  photo: { name: 'star', solid: true },
  like: { name: 'heart', solid: true },
  comment: { name: 'comment', solid: true },
};
const NOTIF_COLOR = '#E8A85A'; // Amber warm — matches app accent

// Polaroid card component
const PolaroidCard = ({
  photo,
  index,
  onPress,
  onLongPress,
  likeCount,
  hasComments,
  notificationType,
  nc,
}: {
  photo: PhotoMilestone;
  index: number;
  onPress: () => void;
  onLongPress: () => void;
  likeCount?: number;
  isLikedByMe?: boolean;
  hasComments?: boolean;
  notificationType?: NotificationType;
  nc: ReturnType<typeof getNeutralColors>;
}) => {
  const hasLikes = (likeCount ?? 0) > 0;
  const [imageError, setImageError] = useState(false);

  const handleImageError = useCallback((_e: NativeSyntheticEvent<ImageErrorEventData>) => {
    setImageError(true);
  }, []);

  // Stable rotation based on photo ID hash
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

  useEffect(() => {
    opacity.value = withDelay(index * 100, withSpring(1));
    scale.value = withDelay(index * 100, withSpring(1, { damping: 12 }));
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
          { backgroundColor: nc.backgroundCard },
          pressed && styles.polaroidPressed,
        ]}
        accessibilityRole="button"
        accessibilityLabel={`Photo ${photo.titre || formatDateShort(photo.date)}`}
      >
        {/* Badge contextuel pour les nouvelles interactions */}
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

        <View
          style={[
            styles.polaroidImageContainer,
            { backgroundColor: nc.borderLight },
          ]}
        >
          {imageError ? (
            <View style={[styles.polaroidImage, styles.imagePlaceholder, { backgroundColor: nc.backgroundPressed }]}>
              <FontAwesome6 name="image" size={24} color={nc.textMuted} />
            </View>
          ) : (
            <Image source={{ uri: photo.photo }} style={styles.polaroidImage} onError={handleImageError} />
          )}
        </View>
        <View style={styles.polaroidCaption}>
          <View style={styles.captionRow}>
            <Text
              style={[styles.polaroidDate, { color: nc.textLight }]}
              numberOfLines={1}
            >
              {formatDateShort(photo.date)}
            </Text>
            <View style={styles.iconsRow}>
              {hasLikes && (
                <FontAwesome6 name="heart" size={10} color="#ef4444" solid />
              )}
              {hasComments && (
                <FontAwesome6 name="comment" size={10} color="#0a7ea4" solid />
              )}
            </View>
          </View>
          {photo.titre && (
            <Text
              style={[styles.polaroidTitle, { color: nc.textNormal }]}
              numberOfLines={1}
            >
              {photo.titre}
            </Text>
          )}
        </View>
      </Pressable>
    </Animated.View>
  );
};

// Empty state polaroid placeholder
const EmptyPolaroid = ({
  onPress,
  nc,
}: {
  onPress: () => void;
  nc: ReturnType<typeof getNeutralColors>;
}) => (
  <Animated.View
    entering={FadeInDown.delay(100).springify()}
    style={styles.polaroidWrapper}
  >
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.polaroid,
        { backgroundColor: nc.backgroundCard },
        styles.emptyPolaroid,
        { borderColor: nc.border },
        pressed && styles.polaroidPressed,
      ]}
      accessibilityRole="button"
      accessibilityLabel="Ajouter une photo souvenir"
    >
      <View
        style={[
          styles.polaroidImageContainer,
          styles.emptyImageContainer,
          { backgroundColor: nc.background },
        ]}
      >
        <FontAwesome6 name="camera" size={32} color={nc.textMuted} />
        <Text style={[styles.emptyImageText, { color: nc.textMuted }]}>
          Ajouter
        </Text>
      </View>
      <View style={styles.polaroidCaption}>
        <Text style={[styles.polaroidDate, { color: nc.textLight }]}>
          Nouveau souvenir
        </Text>
      </View>
    </Pressable>
  </Animated.View>
);

export const PolaroidGallery = ({
  photos,
  onPhotoPress,
  onPhotoLongPress,
  onAddPhoto,
  onSeeAll,
  likesInfo = {},
  commentCounts = {},
  newEventIds = new Set(),
  newEventTypes = new Map(),
  colorScheme = "light",
}: PolaroidGalleryProps) => {
  const nc = getNeutralColors(colorScheme);
  // If user can add photos: show 3 photos + add button (4 slots)
  // If user cannot (contributor): show 4 photos instead
  const maxPhotos = onAddPhoto ? 3 : 4;
  const displayPhotos = photos.slice(0, maxPhotos);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={[styles.title, { color: nc.textStrong }]}>Souvenirs</Text>
        {photos.length > 0 && onSeeAll && (
          <Pressable
            onPress={onSeeAll}
            style={styles.seeAllButton}
            accessibilityRole="link"
            accessibilityLabel="Voir tous les souvenirs"
          >
            <Text style={styles.seeAllText}>Voir tout</Text>
            <FontAwesome6
              name="chevron-right"
              size={10}
              color={eventColors.jalon.dark}
            />
          </Pressable>
        )}
      </View>

      <View style={styles.galleryGrid}>
        {displayPhotos.length === 0 ? (
          onAddPhoto ? (
            // Show two empty placeholders when user can add
            <>
              <EmptyPolaroid onPress={onAddPhoto} nc={nc} />
              <View style={[styles.polaroidWrapper, { opacity: 0.3 }]}>
                <View
                  style={[
                    styles.polaroid,
                    { backgroundColor: nc.backgroundCard },
                    styles.emptyPolaroid,
                    { borderColor: nc.border },
                  ]}
                >
                  <View
                    style={[
                      styles.polaroidImageContainer,
                      styles.emptyImageContainer,
                      { backgroundColor: nc.background },
                    ]}
                  >
                    <FontAwesome6
                      name="images"
                      size={24}
                      color={nc.border}
                    />
                  </View>
                  <View style={styles.polaroidCaption}>
                    <Text
                      style={[styles.polaroidDate, { color: nc.textMuted }]}
                    >
                      En attente...
                    </Text>
                  </View>
                </View>
              </View>
            </>
          ) : (
            // Contributor with no photos: show a simple empty state
            <View style={[styles.polaroidWrapper, { opacity: 0.5 }]}>
              <View
                style={[
                  styles.polaroid,
                  { backgroundColor: nc.backgroundCard },
                  styles.emptyPolaroid,
                  { borderColor: nc.border },
                ]}
              >
                <View
                  style={[
                    styles.polaroidImageContainer,
                    styles.emptyImageContainer,
                    { backgroundColor: nc.background },
                  ]}
                >
                  <FontAwesome6
                    name="images"
                    size={24}
                    color={nc.border}
                  />
                </View>
                <View style={styles.polaroidCaption}>
                  <Text style={[styles.polaroidDate, { color: nc.textMuted }]}>
                    Pas encore de souvenirs
                  </Text>
                </View>
              </View>
            </View>
          )
        ) : (
          <>
            {displayPhotos.map((photo, index) => (
              <PolaroidCard
                key={photo.id}
                photo={photo}
                index={index}
                onPress={() => onPhotoPress(photo)}
                onLongPress={() => onPhotoLongPress?.(photo)}
                likeCount={likesInfo[photo.id]?.count}
                isLikedByMe={likesInfo[photo.id]?.likedByMe}
                hasComments={(commentCounts[photo.id] ?? 0) > 0}
                notificationType={newEventIds.has(photo.id) ? newEventTypes.get(photo.id) : undefined}
                nc={nc}
              />
            ))}
            {/* Add button at the end - only for users who can add */}
            {onAddPhoto && <EmptyPolaroid onPress={onAddPhoto} nc={nc} />}
          </>
        )}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginHorizontal: 16,
    marginTop: 24,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 16,
  },
  title: {
    fontSize: 16,
    fontWeight: "700",
  },
  seeAllButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  seeAllText: {
    fontSize: 13,
    color: eventColors.jalon.dark,
    fontWeight: "600",
  },
  galleryGrid: {
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
  polaroidPressed: {
    transform: [{ scale: 0.98 }],
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
  emptyPolaroid: {
    borderWidth: 2,
    borderStyle: "dashed",
    shadowOpacity: 0.05,
  },
  polaroidImageContainer: {
    width: "100%",
    aspectRatio: 1,
    borderRadius: 2,
    overflow: "hidden",
  },
  emptyImageContainer: {
    alignItems: "center",
    justifyContent: "center",
  },
  emptyImageText: {
    fontSize: 12,
    marginTop: 8,
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
});
