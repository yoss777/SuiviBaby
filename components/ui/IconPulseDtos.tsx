import { FontAwesome6 } from "@expo/vector-icons";
import React, { useEffect, useRef } from "react";
import { Animated, Easing, View } from "react-native";

type IconPulseDotsProps = {
  icons?: React.ComponentProps<typeof FontAwesome6>["name"][];
  size?: number;
  color?: string;
  gap?: number;
  cycleDurationMs?: number;
  minOpacity?: number;
  maxOpacity?: number;
  minScale?: number;
  maxScale?: number;
  spread?: number;
};

export function IconPulseDots({
  icons = ["person-breastfeeding", "pump-medical", "pills", "syringe", "toilet"],
  size = 24,
  color = "#ffffff",
  gap = 20,
  cycleDurationMs = 2000,
  minOpacity = 0.35,
  maxOpacity = 1,
  minScale = 0.85,
  maxScale = 1.18,
  spread = 0.8,
}: IconPulseDotsProps) {
  const t = useRef(new Animated.Value(0)).current;
  const n = icons.length;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(t, {
        toValue: 1,
        duration: cycleDurationMs,
        easing: Easing.linear,
        useNativeDriver: true,
      }),
      // important pour éviter certains resets visibles selon versions RN
      { resetBeforeIteration: true }
    );

    loop.start();
    return () => loop.stop();
  }, [t, cycleDurationMs]);

  // 0 -> n (on inclut n pour que la "fin" corresponde au wrap)
  const pos = t.interpolate({
    inputRange: [0, 1],
    outputRange: [0, n],
  });

  const triangle = (center: number) =>
    pos.interpolate({
      inputRange: [center - spread, center, center + spread],
      outputRange: [0, 1, 0],
      extrapolate: "clamp",
    });

  return (
    <View style={{ flexDirection: "row", alignItems: "center" }}>
      {icons.map((iconName, i) => {
        // Wrap-around: on fait monter l’icône i aussi quand pos est près de i+n ou i-n
        const intensityRaw = Animated.add(
          Animated.add(triangle(i), triangle(i + n)),
          triangle(i - n)
        );

        // clamp 0..1 (car on a additionné)
        const intensity = intensityRaw.interpolate({
          inputRange: [0, 1],
          outputRange: [0, 1],
          extrapolate: "clamp",
        });

        const opacity = intensity.interpolate({
          inputRange: [0, 1],
          outputRange: [minOpacity, maxOpacity],
          extrapolate: "clamp",
        });

        const scale = intensity.interpolate({
          inputRange: [0, 1],
          outputRange: [minScale, maxScale],
          extrapolate: "clamp",
        });

        return (
          <Animated.View
            key={`${String(iconName)}-${i}`}
            style={{
              marginLeft: i === 0 ? 0 : gap,
              opacity,
              transform: [{ scale }],
            }}
          >
            <FontAwesome6 name={iconName} size={size} color={color} />
          </Animated.View>
        );
      })}
    </View>
  );
}
