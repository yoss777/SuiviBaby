import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useEffect, useRef } from "react";
import { Animated, Easing } from "react-native";

export function IconLoader({
  name = "baby-bottle",
  size = 22,
  color = "#fff",
}: {
  name?: any;
  size?: number;
  color?: string;
}) {
  const scale = useRef(new Animated.Value(0.9)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(scale, { toValue: 1.08, duration: 420, easing: Easing.out(Easing.quad), useNativeDriver: true }),
        Animated.timing(scale, { toValue: 0.9, duration: 420, easing: Easing.in(Easing.quad), useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [scale]);

  return (
    <Animated.View style={{ transform: [{ scale }] }}>
      <MaterialCommunityIcons name={name} size={size} color={color} />
    </Animated.View>
  );
}
