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

type FloatingBlobProps = {
  size: number;
  x: number;
  y: number;
  color: string;
  delay?: number;
  duration?: number;
};

export const FloatingBlob = ({
  size,
  x,
  y,
  color,
  delay = 0,
  duration = 9000,
}: FloatingBlobProps) => {
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = withDelay(
      delay,
      withRepeat(withTiming(1, { duration }), -1, true)
    );
  }, [delay, duration, progress]);

  const animatedStyle = useAnimatedStyle(() => {
    const translateX = interpolate(progress.value, [0, 1], [0, 14]);
    const translateY = interpolate(progress.value, [0, 1], [0, -18]);
    const scale = interpolate(progress.value, [0, 1], [1, 1.06]);
    return {
      transform: [{ translateX }, { translateY }, { scale }],
      opacity: interpolate(progress.value, [0, 1], [0.55, 0.85]),
    };
  });

  return (
    <Animated.View
      style={[
        styles.floatingBlob,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          left: x,
          top: y,
          backgroundColor: color,
        },
        animatedStyle,
      ]}
    />
  );
};

const styles = StyleSheet.create({
  floatingBlob: {
    position: "absolute",
    borderRadius: 999,
  },
});
