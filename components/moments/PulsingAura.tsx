import { useEffect } from "react";
import { StyleSheet, View } from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from "react-native-reanimated";

type PulsingAuraProps = {
  color: string;
  size?: number;
};

export const PulsingAura = ({ color, size = 120 }: PulsingAuraProps) => {
  const scale1 = useSharedValue(1);
  const scale2 = useSharedValue(1);
  const opacity1 = useSharedValue(0.6);
  const opacity2 = useSharedValue(0.4);

  useEffect(() => {
    // Inner circle — faster, tighter pulse (breathing rhythm)
    scale1.value = withRepeat(
      withSequence(
        withTiming(1.35, { duration: 1250, easing: Easing.inOut(Easing.ease) }),
        withTiming(1, { duration: 1250, easing: Easing.inOut(Easing.ease) })
      ),
      -1
    );
    opacity1.value = withRepeat(
      withSequence(
        withTiming(0.25, { duration: 1250 }),
        withTiming(0.65, { duration: 1250 })
      ),
      -1
    );

    // Outer circle — slower, wider wave (offset creates depth)
    scale2.value = withRepeat(
      withSequence(
        withTiming(1.55, { duration: 1750, easing: Easing.inOut(Easing.ease) }),
        withTiming(1, { duration: 1750, easing: Easing.inOut(Easing.ease) })
      ),
      -1
    );
    opacity2.value = withRepeat(
      withSequence(
        withTiming(0.1, { duration: 1750 }),
        withTiming(0.45, { duration: 1750 })
      ),
      -1
    );
  }, []);

  const auraStyle1 = useAnimatedStyle(() => ({
    transform: [{ scale: scale1.value }],
    opacity: opacity1.value,
  }));

  const auraStyle2 = useAnimatedStyle(() => ({
    transform: [{ scale: scale2.value }],
    opacity: opacity2.value,
  }));

  return (
    <View style={[styles.auraContainer, { width: size * 2, height: size * 2 }]}>
      <Animated.View
        style={[
          styles.auraCircle,
          { width: size * 1.5, height: size * 1.5, backgroundColor: color },
          auraStyle2,
        ]}
      />
      <Animated.View
        style={[
          styles.auraCircle,
          { width: size * 1.2, height: size * 1.2, backgroundColor: color },
          auraStyle1,
        ]}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  auraContainer: {
    position: "absolute",
    alignItems: "center",
    justifyContent: "center",
  },
  auraCircle: {
    position: "absolute",
    borderRadius: 999,
  },
});
