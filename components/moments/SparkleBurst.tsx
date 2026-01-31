import { useEffect } from "react";
import { StyleSheet, View } from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming,
} from "react-native-reanimated";

// Utility function
const withAlpha = (hex: string, alpha: number) => {
  const safeHex = hex.replace("#", "");
  if (safeHex.length !== 6) return hex;
  const r = parseInt(safeHex.slice(0, 2), 16);
  const g = parseInt(safeHex.slice(2, 4), 16);
  const b = parseInt(safeHex.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
};

type SparkleBurstProps = {
  color: string;
  size?: number;
};

export const SparkleBurst = ({ color, size = 80 }: SparkleBurstProps) => {
  const scale = useSharedValue(0.6);
  const opacity = useSharedValue(0);
  const rotation = useSharedValue(0);

  useEffect(() => {
    scale.value = withSequence(
      withSpring(1, { damping: 10, stiffness: 120 }),
      withTiming(1.15, { duration: 600 })
    );
    opacity.value = withSequence(
      withTiming(1, { duration: 200 }),
      withTiming(0, { duration: 800 })
    );
    rotation.value = withTiming(25, { duration: 900 });
  }, [opacity, rotation, scale]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ scale: scale.value }, { rotate: `${rotation.value}deg` }],
  }));

  return (
    <Animated.View
      pointerEvents="none"
      style={[styles.sparkleBurst, animatedStyle, { width: size, height: size }]}
    >
      <View
        style={[
          styles.sparkleLine,
          { backgroundColor: withAlpha(color, 0.6), width: size * 0.6 },
        ]}
      />
      <View
        style={[
          styles.sparkleLine,
          styles.sparkleLineAlt,
          { backgroundColor: withAlpha(color, 0.4), width: size * 0.45 },
        ]}
      />
      <View
        style={[styles.sparkleDot, { backgroundColor: withAlpha(color, 0.7) }]}
      />
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  sparkleBurst: {
    position: "absolute",
    right: -10,
    top: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  sparkleLine: {
    height: 3,
    borderRadius: 999,
  },
  sparkleLineAlt: {
    marginTop: 12,
    transform: [{ rotate: "45deg" }],
  },
  sparkleDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginTop: 8,
  },
});
