// Squelette de chargement des écrans de liste (repas, pompages, couches).
import { space } from "@/constants/tokens";
import React, { useEffect, useRef } from "react";
import { Animated, StyleSheet, View, type ViewStyle } from "react-native";

import { getNeutralColors } from "@/constants/dashboardColors";
import { startLoop } from "@/utils/motion";

import { eventListStyles } from "./styles";

type Props = {
  colorScheme: "light" | "dark";
  /** "bar" : barre de quantités (pompages) ; "icon" : icône + deux lignes (repas, couches). */
  variant: "bar" | "icon";
};

export const EventListSkeleton = React.memo(function EventListSkeleton({ colorScheme, variant }: Props) {
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
    startLoop(shimmer);
    return () => shimmer.stop();
  }, [shimmerAnim]);

  const shimmerTranslate = shimmerAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [-200, 200],
  });
  const shimmerBg = colorScheme === "dark" ? nc.shimmerDark : nc.shimmerLight;

  const block = (style: ViewStyle) => (
    <View style={[styles.skeletonBlock, { backgroundColor: nc.borderLight }, style]}>
      <Animated.View
        style={[
          styles.shimmerOverlay,
          { backgroundColor: shimmerBg, transform: [{ translateX: shimmerTranslate }] },
        ]}
      />
    </View>
  );

  const renderCard = (key: number) => (
    <View
      key={key}
      style={[
        eventListStyles.sessionCard,
        { borderColor: nc.borderLight, backgroundColor: nc.backgroundCard, shadowColor: nc.shadow },
      ]}
    >
      {block({ width: 44, height: 14 })}
      {variant === "bar" ? (
        <>
          <View style={{ flex: 1, gap: 6 }}>
            {block({ width: 120, height: 6, borderRadius: 3 })}
            {block({ width: 80, height: 12 })}
          </View>
          {block({ width: 40, height: 18 })}
        </>
      ) : (
        <>
          {block({ width: 32, height: 32, borderRadius: 8 })}
          <View style={{ flex: 1, gap: 6 }}>
            {block({ width: 60, height: 14 })}
            {block({ width: 140, height: 12 })}
          </View>
        </>
      )}
    </View>
  );

  return (
    <View style={styles.skeletonContainer} testID="event-list-skeleton">
      <View style={eventListStyles.daySection}>
        <View style={eventListStyles.dayHeader}>
          {block({ width: 80, height: 16 })}
          {block({ width: 40, height: 14 })}
        </View>
        <View style={eventListStyles.sessionsContainer}>
          {renderCard(1)}
          {renderCard(2)}
          {renderCard(3)}
        </View>
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  skeletonContainer: {
    paddingHorizontal: space.md,
    paddingTop: space.xs,
  },
  skeletonBlock: {
    borderRadius: 4,
    overflow: "hidden",
  },
  shimmerOverlay: {
    position: "absolute",
    top: 0,
    bottom: 0,
    width: 200,
  },
});
