import { useCallback, useEffect } from "react";
import { StyleSheet, View } from "react-native";
import Animated, {
  Easing,
  useAnimatedProps,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSequence,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import Svg, {
  Circle,
  Defs,
  G,
  LinearGradient,
  Path,
  Stop,
} from "react-native-svg";

const AnimatedPath = Animated.createAnimatedComponent(Path);
const AnimatedG = Animated.createAnimatedComponent(G);

interface LogoAnimationProps {
  size?: number;
  loop?: boolean;
  onAnimationComplete?: () => void;
}

export default function LogoAnimation({
  size = 200,
  loop = false,
  onAnimationComplete,
}: LogoAnimationProps) {
  // Animation values
  const backgroundScale = useSharedValue(0.02);
  const backgroundOpacity = useSharedValue(0);
  const lineProgress = useSharedValue(0);
  const leafOpacity = useSharedValue(0);
  const leafScale = useSharedValue(0.3);
  const plusScale = useSharedValue(0);
  const plusOpacity = useSharedValue(0);

  // Path lengths (measured more accurately)
  // Keep large dash lengths to ensure full reveal without computing exact path length
  const linePathLength = 1400;

  const resetAnimation = useCallback(() => {
    "worklet";
    backgroundScale.value = 0.02;
    backgroundOpacity.value = 0;
    lineProgress.value = 0;
    leafOpacity.value = 0;
    leafScale.value = 0.3;
    plusScale.value = 0;
    plusOpacity.value = 0;
  }, [backgroundScale, lineProgress, leafOpacity, leafScale, plusScale, plusOpacity, backgroundOpacity]);

  const startAnimation = useCallback(() => {
    // 1. Background white circle grows from center (point to full size)
    backgroundOpacity.value = withTiming(1, { duration: 120 });
    backgroundScale.value = withSequence(
      withTiming(1.04, { duration: 650, easing: Easing.out(Easing.cubic) }),
      withTiming(1, { duration: 200, easing: Easing.out(Easing.quad) })
    );

    // 2. Curve draws from left to right
    lineProgress.value = withDelay(
      450,
      withTiming(1, {
        duration: 1500,
        easing: Easing.inOut(Easing.quad),
      })
    );

    // 4. Leaves grow from hand
    leafOpacity.value = withDelay(1850, withTiming(1, { duration: 350 }));
    leafScale.value = withDelay(
      1850,
      withSpring(1, { damping: 12, stiffness: 100 })
    );

    // 5. Plus icon pops at the end
    plusOpacity.value = withDelay(2200, withTiming(1, { duration: 180 }));
    plusScale.value = withDelay(
      2200,
      withSequence(
        withSpring(1.3, { damping: 6, stiffness: 250 }),
        withSpring(1, { damping: 8, stiffness: 150 })
      )
    );
  }, [backgroundScale, lineProgress, leafOpacity, leafScale, plusScale, plusOpacity, backgroundOpacity]);

  useEffect(() => {
    startAnimation();

    if (loop) {
      const interval = setInterval(() => {
        resetAnimation();
        setTimeout(() => {
          startAnimation();
        }, 100);
      }, 3500);
      return () => clearInterval(interval);
    }

    // Callback when animation completes
    if (onAnimationComplete) {
      const timeout = setTimeout(() => {
        onAnimationComplete();
      }, 2500);
      return () => clearTimeout(timeout);
    }
  }, [loop, startAnimation, resetAnimation, onAnimationComplete]);

  // Animated props for the heartbeat curve
  const lineAnimatedProps = useAnimatedProps(() => ({
    strokeDashoffset: linePathLength * (1 - lineProgress.value),
  }));

  // Animated style for background
  const backgroundAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: backgroundScale.value }],
    opacity: backgroundOpacity.value,
  }));

  // Animated props for leaves
  const leafAnimatedProps = useAnimatedProps(() => ({
    opacity: leafOpacity.value,
    transform: [{ scale: leafScale.value }],
  }));

  // Animated style for plus icon
  const plusAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: plusScale.value }],
    opacity: plusOpacity.value,
  }));

  // Heartbeat/ECG curve - matches the logo more closely
  // Starts with flat line, then V shape (down-up), small bump, then curves up into hand
  const linePath = `
    M 18 118
    H 55
    L 70 118
    L 88 70
    L 110 156
    L 132 94
    L 148 118
    H 160
    Q 176 118 188 105
    Q 201 90 203 70
    Q 204 54 194 46
    Q 183 38 170 52
    Q 162 62 162 74
  `;

  // Main leaf (center)
  const leaf1Path = `
    M 164 74
    Q 152 48 158 26
    Q 166 8 185 6
    Q 202 6 206 24
    Q 210 44 196 60
    Q 184 76 164 74
    Z
  `;

  // Right leaf
  const leaf2Path = `
    M 176 70
    Q 192 48 216 44
    Q 234 44 236 58
    Q 238 72 220 78
    Q 200 86 184 78
    Q 178 76 176 70
    Z
  `;

  // Small bottom-right leaf
  const leaf3Path = `
    M 184 84
    Q 200 74 220 78
    Q 232 82 230 96
    Q 228 110 210 108
    Q 194 106 184 84
    Z
  `;

  return (
    <View style={[styles.container, { width: size, height: size }]}>
      {/* White background that scales up from center point */}
      <Animated.View style={[styles.background, backgroundAnimatedStyle]}>
        <View
          style={[
            styles.whiteCircle,
            {
              width: size * 0.86,
              height: size * 0.86,
              borderRadius: size * 0.24,
            },
          ]}
        />
      </Animated.View>

      {/* SVG Logo */}
      <Svg width={size} height={size} viewBox="0 0 240 240" style={styles.svg}>
        <Defs>
          <LinearGradient id="curveGradient" x1="0%" y1="50%" x2="100%" y2="50%">
            <Stop offset="0%" stopColor="#26A69A" />
            <Stop offset="60%" stopColor="#1E8C80" />
            <Stop offset="100%" stopColor="#17756B" />
          </LinearGradient>
          <LinearGradient id="leafGradient" x1="20%" y1="100%" x2="80%" y2="0%">
            <Stop offset="0%" stopColor="#1E8C80" />
            <Stop offset="55%" stopColor="#17756B" />
            <Stop offset="100%" stopColor="#0F5A52" />
          </LinearGradient>
        </Defs>

        {/* Single continuous line: ECG + hand plate */}
        <AnimatedPath
          d={linePath}
          stroke="url(#curveGradient)"
          strokeWidth={12}
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
          strokeDasharray={linePathLength}
          animatedProps={lineAnimatedProps}
        />

        {/* Leaves - grow from hand */}
          <AnimatedG animatedProps={leafAnimatedProps} originX={182} originY={92}>
          <Path d={leaf1Path} fill="url(#leafGradient)" />
          <Path d={leaf2Path} fill="url(#leafGradient)" />
          <Path d={leaf3Path} fill="url(#leafGradient)" />
          <Path
            d="M 174 70 Q 176 54 190 30"
            stroke="rgba(255,255,255,0.7)"
            strokeWidth={2.4}
            strokeLinecap="round"
            fill="none"
          />
          <Path
            d="M 186 70 Q 204 58 224 56"
            stroke="rgba(255,255,255,0.6)"
            strokeWidth={2}
            strokeLinecap="round"
            fill="none"
          />
          <Path
            d="M 190 90 Q 208 86 220 92"
            stroke="rgba(255,255,255,0.55)"
            strokeWidth={1.8}
            strokeLinecap="round"
            fill="none"
          />
        </AnimatedG>
      </Svg>

      {/* Plus icon that pops at the end */}
      <Animated.View
        style={[
          styles.plusContainer,
          plusAnimatedStyle,
          {
            right: size * 0.085,
            bottom: size * 0.195,
          },
        ]}
      >
        <Svg width={size * 0.24} height={size * 0.24} viewBox="0 0 50 50">
          <Circle cx="25" cy="25" r="24" fill="#7B9FD4" />
          <Circle cx="25" cy="25" r="22" fill="#8FAEE0" />
          <Path
            d="M 25 13 L 25 37 M 13 25 L 37 25"
            stroke="white"
            strokeWidth={5}
            strokeLinecap="round"
          />
        </Svg>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    justifyContent: "center",
    alignItems: "center",
  },
  background: {
    position: "absolute",
    justifyContent: "center",
    alignItems: "center",
  },
  whiteCircle: {
    backgroundColor: "white",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 8,
  },
  svg: {
    position: "absolute",
  },
  plusContainer: {
    position: "absolute",
  },
});
