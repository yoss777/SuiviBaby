import { getNeutralColors } from "@/constants/dashboardColors";
import { useEffect, useRef } from "react";
import { Animated, Dimensions, StyleSheet, View } from "react-native";

const { width: SCREEN_WIDTH } = Dimensions.get("window");
const POLAROID_WIDTH = (SCREEN_WIDTH - 48 - 12) / 2;

type MomentsSkeletonLoaderProps = {
  colorScheme?: "light" | "dark";
};

export const MomentsSkeletonLoader = ({
  colorScheme = "light",
}: MomentsSkeletonLoaderProps) => {
  const nc = getNeutralColors(colorScheme);
  const shimmerAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const shimmer = Animated.loop(
      Animated.timing(shimmerAnim, {
        toValue: 1,
        duration: 1200,
        useNativeDriver: true,
      }),
    );
    shimmer.start();
    return () => shimmer.stop();
  }, [shimmerAnim]);

  const shimmerTranslate = shimmerAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [-200, 200],
  });
  const shimmerBg =
    colorScheme === "dark"
      ? "rgba(255, 255, 255, 0.08)"
      : "rgba(255, 255, 255, 0.4)";

  const shimmerStyle = [
    styles.shimmerOverlay,
    { backgroundColor: shimmerBg, transform: [{ translateX: shimmerTranslate }] },
  ];

  return (
    <View
      style={[styles.container, { backgroundColor: nc.background }]}
      accessibilityLabel="Chargement en cours"
    >
      {/* Hero card skeleton */}
      <View
        style={[styles.heroSkeleton, { backgroundColor: nc.borderLight }]}
      >
        <Animated.View style={shimmerStyle} />
      </View>

      {/* Week overview skeleton */}
      <View
        style={[styles.weekSkeleton, { backgroundColor: nc.backgroundCard }]}
      >
        <View style={[styles.weekTitle, { backgroundColor: nc.borderLight }]}>
          <Animated.View style={shimmerStyle} />
        </View>
        <View style={styles.weekCircles}>
          {Array.from({ length: 7 }).map((_, i) => (
            <View
              key={i}
              style={[styles.weekCircle, { backgroundColor: nc.borderLight }]}
            >
              <Animated.View style={shimmerStyle} />
            </View>
          ))}
        </View>
      </View>

      {/* Polaroid gallery skeleton */}
      <View style={styles.gallerySkeleton}>
        <View style={[styles.galleryTitle, { backgroundColor: nc.borderLight }]}>
          <Animated.View style={shimmerStyle} />
        </View>
        <View style={styles.galleryRow}>
          {[0, 1].map((i) => (
            <View
              key={i}
              style={[styles.polaroidSkeleton, { backgroundColor: nc.backgroundCard }]}
            >
              <View
                style={[styles.polaroidImage, { backgroundColor: nc.borderLight }]}
              >
                <Animated.View style={shimmerStyle} />
              </View>
              <View
                style={[styles.polaroidCaption, { backgroundColor: nc.borderLight }]}
              >
                <Animated.View style={shimmerStyle} />
              </View>
            </View>
          ))}
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingTop: 16,
  },
  shimmerOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    width: 100,
  },
  // Hero card
  heroSkeleton: {
    marginHorizontal: 16,
    height: 220,
    borderRadius: 28,
    overflow: "hidden",
  },
  // Week overview
  weekSkeleton: {
    marginHorizontal: 16,
    marginTop: 24,
    borderRadius: 20,
    padding: 16,
  },
  weekTitle: {
    height: 14,
    width: 120,
    borderRadius: 7,
    marginBottom: 16,
    overflow: "hidden",
  },
  weekCircles: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  weekCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    overflow: "hidden",
  },
  // Gallery
  gallerySkeleton: {
    marginHorizontal: 16,
    marginTop: 24,
  },
  galleryTitle: {
    height: 14,
    width: 80,
    borderRadius: 7,
    marginBottom: 16,
    overflow: "hidden",
  },
  galleryRow: {
    flexDirection: "row",
    gap: 12,
  },
  polaroidSkeleton: {
    width: POLAROID_WIDTH,
    borderRadius: 4,
    padding: 8,
    paddingBottom: 12,
  },
  polaroidImage: {
    width: "100%",
    aspectRatio: 1,
    borderRadius: 2,
    overflow: "hidden",
  },
  polaroidCaption: {
    height: 10,
    width: "60%",
    borderRadius: 5,
    marginTop: 10,
    alignSelf: "center",
    overflow: "hidden",
  },
});
