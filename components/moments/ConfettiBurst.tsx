import { useEffect, useMemo } from "react";
import { StyleSheet } from "react-native";
import Animated, {
  Easing,
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from "react-native-reanimated";

type ConfettiBurstProps = {
  trigger: number; // Change this value to trigger animation
  onComplete?: () => void;
};

const CONFETTI_COLORS = [
  "#ec4899", // pink
  "#8b5cf6", // purple
  "#3b82f6", // blue
  "#22c55e", // green
  "#f59e0b", // amber
  "#ef4444", // red
];

const CONFETTI_COUNT = 12;

type ConfettiPieceProps = {
  index: number;
  color: string;
  trigger: number;
  config: {
    angle: number;
    distance: number;
    rotationSpeed: number;
    delay: number;
    size: number;
    isCircle: boolean;
  };
};

const ConfettiPiece = ({ color, trigger, config }: ConfettiPieceProps) => {
  const progress = useSharedValue(0);
  const { angle, distance, rotationSpeed, delay, size, isCircle } = config;

  useEffect(() => {
    if (trigger > 0) {
      progress.value = 0;
      progress.value = withDelay(
        delay,
        withTiming(1, { duration: 800, easing: Easing.out(Easing.cubic) })
      );
    }
  }, [trigger]);

  const animatedStyle = useAnimatedStyle(() => {
    const translateX =
      Math.cos((angle * Math.PI) / 180) * distance * progress.value;
    const translateY =
      Math.sin((angle * Math.PI) / 180) * distance * progress.value -
      20 * progress.value + // Initial upward motion
      40 * progress.value * progress.value; // Gravity effect
    const scale = interpolate(progress.value, [0, 0.2, 1], [0, 1, 0.3]);
    const opacity = interpolate(progress.value, [0, 0.1, 0.8, 1], [0, 1, 1, 0]);
    const rotation = rotationSpeed * progress.value;

    return {
      transform: [
        { translateX },
        { translateY },
        { scale },
        { rotate: `${rotation}deg` },
      ],
      opacity,
    };
  });

  return (
    <Animated.View
      style={[
        styles.confettiPiece,
        {
          width: size,
          height: isCircle ? size : size * 1.5,
          borderRadius: isCircle ? size / 2 : 2,
          backgroundColor: color,
        },
        animatedStyle,
      ]}
    />
  );
};

export const ConfettiBurst = ({ trigger, onComplete }: ConfettiBurstProps) => {
  const opacity = useSharedValue(1);

  // Pre-generate random configs for each piece when trigger changes
  const confettiConfigs = useMemo(() => {
    return Array.from({ length: CONFETTI_COUNT }).map((_, index) => ({
      angle: (index / CONFETTI_COUNT) * 360 + Math.random() * 30 - 15,
      distance: 60 + Math.random() * 40,
      rotationSpeed: Math.random() * 720 - 360,
      delay: Math.random() * 100,
      size: 6 + Math.random() * 4,
      isCircle: Math.random() > 0.5,
    }));
  }, [trigger]);

  useEffect(() => {
    if (trigger > 0) {
      opacity.value = 1;
      opacity.value = withDelay(
        700,
        withTiming(0, { duration: 200 }, (finished) => {
          if (finished && onComplete) {
            runOnJS(onComplete)();
          }
        })
      );
    }
  }, [trigger]);

  const containerStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
  }));

  if (trigger === 0) return null;

  return (
    <Animated.View style={[styles.container, containerStyle]}>
      {confettiConfigs.map((config, index) => (
        <ConfettiPiece
          key={`${trigger}-${index}`}
          index={index}
          color={CONFETTI_COLORS[index % CONFETTI_COLORS.length]}
          trigger={trigger}
          config={config}
        />
      ))}
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: "absolute",
    alignItems: "center",
    justifyContent: "center",
    width: 200,
    height: 200,
    pointerEvents: "none",
  },
  confettiPiece: {
    position: "absolute",
  },
});
