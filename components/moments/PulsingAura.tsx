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
    scale1.value = withRepeat(
      withSequence(
        withTiming(1.3, { duration: 2000, easing: Easing.inOut(Easing.ease) }),
        withTiming(1, { duration: 2000, easing: Easing.inOut(Easing.ease) })
      ),
      -1
    );
    opacity1.value = withRepeat(
      withSequence(
        withTiming(0.2, { duration: 2000 }),
        withTiming(0.6, { duration: 2000 })
      ),
      -1
    );

    scale2.value = withRepeat(
      withSequence(
        withTiming(1.5, { duration: 2500, easing: Easing.inOut(Easing.ease) }),
        withTiming(1, { duration: 2500, easing: Easing.inOut(Easing.ease) })
      ),
      -1
    );
    opacity2.value = withRepeat(
      withSequence(
        withTiming(0.1, { duration: 2500 }),
        withTiming(0.4, { duration: 2500 })
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
