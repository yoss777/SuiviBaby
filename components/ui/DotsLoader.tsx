import { useEffect, useMemo } from "react";
import { Animated, Easing, StyleSheet, View } from "react-native";

export function DotsLoader({
  size = 6,
  gap = 6,
  // color = "#111827",
  color = "#ffffff",
}: {
  size?: number;
  gap?: number;
  color?: string;
}) {
  const values = useMemo(
    () => [new Animated.Value(0.4), new Animated.Value(0.4), new Animated.Value(0.4)],
    []
  );

  useEffect(() => {
    const animations = values.map((v, i) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(i * 120),
          Animated.timing(v, {
            toValue: 1,
            duration: 360,
            easing: Easing.out(Easing.quad),
            useNativeDriver: true,
          }),
          Animated.timing(v, {
            toValue: 0.4,
            duration: 360,
            easing: Easing.in(Easing.quad),
            useNativeDriver: true,
          }),
        ])
      )
    );
    animations.forEach(a => a.start());
    return () => animations.forEach(a => a.stop());
  }, [values]);

  return (
    <View style={styles.row}>
      {values.map((opacity, idx) => (
        <Animated.View
          key={idx}
          style={{
            width: size,
            height: size,
            borderRadius: size / 2,
            backgroundColor: color,
            opacity,
            marginLeft: idx === 0 ? 0 : gap,
          }}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center" },
});
