import { getNeutralColors } from "@/constants/dashboardColors";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { startLoop } from "@/utils/motion";
import React, { memo, useEffect, useRef } from "react";
import { Animated, StyleSheet, View } from "react-native";

import { GRID_GAP, NUM_COLUMNS, THUMB_SIZE } from "./galleryGrid";

const SKELETON_ROWS = 5;

/**
 * Squelette de la galerie : mêmes colonnes et même taille de cellule que la
 * grille de photos. Le reflet défile en boucle (`startLoop`) ; avec
 * « Réduire les animations » il reste statique.
 */
export const GalleryGridSkeleton = memo(function GalleryGridSkeleton({
  rows = SKELETON_ROWS,
  thumbSize = THUMB_SIZE,
}: {
  rows?: number;
  thumbSize?: number;
}) {
  const colorScheme = useColorScheme() ?? "light";
  const nc = getNeutralColors(colorScheme);
  const shimmer = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(shimmer, { toValue: 1, duration: 1200, useNativeDriver: true }),
    );
    startLoop(loop);
    return () => loop.stop();
  }, [shimmer]);

  const translateX = shimmer.interpolate({
    inputRange: [0, 1],
    outputRange: [-thumbSize, thumbSize],
  });
  const shimmerColor = colorScheme === "dark" ? nc.shimmerDark : nc.shimmerLight;

  return (
    <View
      testID="gallery-skeleton"
      style={[styles.container, { backgroundColor: nc.backgroundWarm }]}
      accessible
      accessibilityLabel="Chargement des photos"
      accessibilityState={{ busy: true }}
    >
      <View style={styles.header}>
        <View style={[styles.titleBlock, { backgroundColor: nc.borderLight }]} />
        <View style={[styles.subtitleBlock, { backgroundColor: nc.borderLight }]} />
      </View>
      <View style={styles.grid}>
        {Array.from({ length: rows }).map((_, row) => (
          <View key={row} style={styles.row}>
            {Array.from({ length: NUM_COLUMNS }).map((__, col) => (
              <View
                key={col}
                testID="gallery-skeleton-cell"
                style={[
                  styles.cell,
                  { width: thumbSize, height: thumbSize, backgroundColor: nc.borderLight },
                ]}
              >
                <Animated.View
                  style={[
                    styles.shimmer,
                    { width: thumbSize / 2, backgroundColor: shimmerColor, transform: [{ translateX }] },
                  ]}
                />
              </View>
            ))}
          </View>
        ))}
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { paddingHorizontal: 20, paddingTop: 20, marginBottom: 16 },
  titleBlock: { width: "45%", height: 26, borderRadius: 8 },
  subtitleBlock: { width: "25%", height: 14, borderRadius: 6, marginTop: 8 },
  grid: { gap: GRID_GAP },
  row: { flexDirection: "row", gap: GRID_GAP },
  cell: { borderRadius: 2, overflow: "hidden" },
  shimmer: { position: "absolute", top: 0, bottom: 0, opacity: 0.6 },
});
