// app/(drawer)/baby/(tabs)/home/HomeSkeleton.tsx
//
// Loading placeholder for the home tab. Pure UI: a few rounded blocks
// with a shimmer animation. Extracted from home.tsx (S3-T1a) to keep the
// orchestration component focused on data flow rather than rendering.
//
// The animation is a single Animated.loop driving a translateX on a
// gradient overlay — no Reanimated, no Skia. Cheap on every device.

import { getNeutralColors } from "@/constants/dashboardColors";
import { useEffect, useRef } from "react";
import { Animated, View } from "react-native";

interface HomeSkeletonProps {
  colorScheme: "light" | "dark";
}

export function HomeSkeleton({ colorScheme }: HomeSkeletonProps) {
  const nc = getNeutralColors(colorScheme);
  const shimmerAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(shimmerAnim, {
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

  const Block = ({
    width,
    height,
  }: {
    width: number | string;
    height: number;
  }) => (
    <View
      style={{
        width: width as number,
        height,
        backgroundColor: nc.borderLight,
        borderRadius: 8,
        overflow: "hidden",
        marginBottom: 10,
      }}
    >
      <Animated.View
        style={{
          position: "absolute",
          top: 0,
          bottom: 0,
          width: 120,
          backgroundColor: shimmerBg,
          transform: [{ translateX: shimmerTranslate }],
        }}
      />
    </View>
  );

  return (
    <View
      style={{
        flex: 1,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: nc.background,
      }}
    >
      <View style={{ width: "100%", padding: 20 }}>
        <Block width="60%" height={24} />
        <Block width="40%" height={14} />
        <View style={{ height: 16 }} />
        <Block width="100%" height={80} />
        <View style={{ height: 12 }} />
        <Block width="100%" height={80} />
        <View style={{ height: 12 }} />
        <Block width="100%" height={60} />
        <View style={{ height: 12 }} />
        <Block width="100%" height={60} />
      </View>
    </View>
  );
}
