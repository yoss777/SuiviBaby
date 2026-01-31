import { useEffect } from "react";
import { StyleSheet } from "react-native";
import Animated, {
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withTiming,
} from "react-native-reanimated";

type FloatingParticleProps = {
  size: number;
  x: number;
  y: number;
  color: string;
  delay?: number;
  duration?: number;
};

export const FloatingParticle = ({
  size,
  x,
  y,
  color,
  delay = 0,
  duration = 4000,
}: FloatingParticleProps) => {
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = withDelay(
      delay,
      withRepeat(withTiming(1, { duration }), -1, true)
    );
  }, [delay, duration, progress]);

  const animatedStyle = useAnimatedStyle(() => {
    const translateY = interpolate(progress.value, [0, 1], [0, -14]);
    const opacity = interpolate(progress.value, [0, 1], [0.35, 0.8]);
    return {
      transform: [{ translateY }],
      opacity,
    };
  });

  return (
    <Animated.View
      style={[
        styles.particle,
        { width: size, height: size, left: x, top: y, backgroundColor: color },
        animatedStyle,
      ]}
    />
  );
};

const styles = StyleSheet.create({
  particle: {
    position: "absolute",
    borderRadius: 999,
  },
});
