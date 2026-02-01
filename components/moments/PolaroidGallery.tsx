import { eventColors } from "@/constants/eventColors";
import FontAwesome6 from "@expo/vector-icons/FontAwesome6";
import { router } from "expo-router";
import { useEffect, useMemo } from "react";
import {
  Dimensions,
  FlatList,
  Image,
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
  withSpring,
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
  onAddPhoto: () => void;
  onSeeAll?: () => void;
  likesInfo?: Record<string, LikeInfo>;
};

const formatDateShort = (date: Date) =>
  date.toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });

// Polaroid card component
const PolaroidCard = ({
  photo,
  index,
  onPress,
  onLongPress,
  isLikedByMe,
}: {
  photo: PhotoMilestone;
  index: number;
  onPress: () => void;
  onLongPress: () => void;
  isLikedByMe?: boolean;
}) => {
  // Random rotation for each card
  const rotation = useMemo(() => {
    const rotations = [-3, 2, -2, 3, -1, 1];
    return rotations[index % rotations.length];
  }, [index]);

  const scale = useSharedValue(0.8);
  const opacity = useSharedValue(0);

  useEffect(() => {
    opacity.value = withDelay(index * 100, withSpring(1));
    scale.value = withDelay(index * 100, withSpring(1, { damping: 12 }));
  }, []);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [
      { scale: scale.value },
      { rotate: `${rotation}deg` },
    ],
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
          {isLikedByMe && (
            <View style={styles.likeOverlay}>
              <FontAwesome6 name="heart" size={14} color="#ef4444" solid />
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

// Empty state polaroid placeholder
const EmptyPolaroid = ({ onPress }: { onPress: () => void }) => (
  <Animated.View
    entering={FadeInDown.delay(100).springify()}
    style={styles.polaroidWrapper}
  >
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.polaroid,
        styles.emptyPolaroid,
        pressed && styles.polaroidPressed,
      ]}
    >
      <View style={[styles.polaroidImageContainer, styles.emptyImageContainer]}>
        <FontAwesome6 name="camera" size={32} color="#d1d5db" />
        <Text style={styles.emptyImageText}>Ajouter</Text>
      </View>
      <View style={styles.polaroidCaption}>
        <Text style={styles.polaroidDate}>Nouveau souvenir</Text>
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
}: PolaroidGalleryProps) => {
  // Show max 3 photos + add button at the end (4 items total)
  const displayPhotos = photos.slice(0, 3);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Souvenirs</Text>
        {photos.length > 0 && onSeeAll && (
          <Pressable
            onPress={onSeeAll}
            style={styles.seeAllButton}
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
          // Show two empty placeholders
          <>
            <EmptyPolaroid onPress={onAddPhoto} />
            <View style={[styles.polaroidWrapper, { opacity: 0.3 }]}>
              <View style={[styles.polaroid, styles.emptyPolaroid]}>
                <View style={[styles.polaroidImageContainer, styles.emptyImageContainer]}>
                  <FontAwesome6 name="images" size={24} color="#e5e7eb" />
                </View>
                <View style={styles.polaroidCaption}>
                  <Text style={[styles.polaroidDate, { color: "#d1d5db" }]}>
                    En attente...
                  </Text>
                </View>
              </View>
            </View>
          </>
        ) : (
          <>
            {displayPhotos.map((photo, index) => (
              <PolaroidCard
                key={photo.id}
                photo={photo}
                index={index}
                onPress={() => onPhotoPress(photo)}
                onLongPress={() => onPhotoLongPress?.(photo)}
                isLikedByMe={likesInfo[photo.id]?.likedByMe}
              />
            ))}
            {/* Add button always at the end */}
            <EmptyPolaroid onPress={onAddPhoto} />
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
    color: "#1f2937",
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
  emptyPolaroid: {
    borderWidth: 2,
    borderColor: "#e5e7eb",
    borderStyle: "dashed",
    shadowOpacity: 0.05,
  },
  polaroidImageContainer: {
    width: "100%",
    aspectRatio: 1,
    borderRadius: 2,
    overflow: "hidden",
    backgroundColor: "#f3f4f6",
  },
  emptyImageContainer: {
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#fafafa",
  },
  emptyImageText: {
    fontSize: 12,
    color: "#9ca3af",
    marginTop: 8,
  },
  polaroidImage: {
    width: "100%",
    height: "100%",
  },
  likeOverlay: {
    position: "absolute",
    top: 6,
    right: 6,
    width: 24,
    height: 24,
    borderRadius: 12,
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
});
