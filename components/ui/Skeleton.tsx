// components/ui/Skeleton.tsx
// Reusable loading placeholders: a shimmering block and a list of card-like
// rows. The shimmer is decorative, so it is switched off in night mode and
// when the OS "reduce motion" setting is on (static blocks remain).
// Screen readers get a single "Chargement" label instead of empty shapes.
import { getNeutralColors } from "@/constants/dashboardColors";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { useNightMode } from "@/hooks/useNightMode";
import { useEffect, useRef, useState } from "react";
import {
  AccessibilityInfo,
  Animated,
  type DimensionValue,
  StyleSheet,
  View,
  type ViewStyle,
} from "react-native";

function useShimmer(): Animated.AnimatedInterpolation<number> | null {
  const { animations } = useNightMode();
  const [reduceMotion, setReduceMotion] = useState(false);
  const progress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    let mounted = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((enabled) => mounted && setReduceMotion(enabled))
      .catch(() => {});
    const sub = AccessibilityInfo.addEventListener("reduceMotionChanged", setReduceMotion);
    return () => {
      mounted = false;
      sub?.remove();
    };
  }, []);

  const enabled = animations.decorative && !reduceMotion;
  useEffect(() => {
    if (!enabled) return;
    const loop = Animated.loop(
      // Decorative loop: must not hold InteractionManager tasks forever.
      Animated.timing(progress, {
        toValue: 1,
        duration: 1200,
        useNativeDriver: true,
        isInteraction: false,
      }),
    );
    loop.start();
    return () => loop.stop();
  }, [enabled, progress]);

  if (!enabled) return null;
  return progress.interpolate({ inputRange: [0, 1], outputRange: [-240, 240] });
}

interface SkeletonBlockProps {
  width?: DimensionValue;
  height: number;
  radius?: number;
  style?: ViewStyle;
}

export function SkeletonBlock({ width = "100%", height, radius = 8, style }: SkeletonBlockProps) {
  const colorScheme = useColorScheme() ?? "light";
  const nc = getNeutralColors(colorScheme);
  const translateX = useShimmer();
  const shimmer = colorScheme === "dark" ? nc.shimmerDark : nc.shimmerLight;

  return (
    <View
      style={[
        { width, height, borderRadius: radius, backgroundColor: nc.borderLight, overflow: "hidden" },
        style,
      ]}
      importantForAccessibility="no-hide-descendants"
      accessibilityElementsHidden
    >
      {translateX && (
        <Animated.View
          style={[
            StyleSheet.absoluteFill,
            { width: "60%", backgroundColor: shimmer, transform: [{ translateX }] },
          ]}
        />
      )}
    </View>
  );
}

interface SkeletonListProps {
  /** Number of placeholder rows. */
  rows?: number;
  /** Show a leading avatar circle on each row. */
  avatar?: boolean;
  style?: ViewStyle;
}

/** Card-like rows matching list screens (title + subtitle, optional avatar). */
export function SkeletonList({ rows = 3, avatar = false, style }: SkeletonListProps) {
  const colorScheme = useColorScheme() ?? "light";
  const nc = getNeutralColors(colorScheme);

  return (
    <View
      style={[styles.list, style]}
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel="Chargement"
    >
      {Array.from({ length: rows }, (_, index) => (
        <View
          key={index}
          style={[styles.row, { backgroundColor: nc.backgroundCard, borderColor: nc.border }]}
        >
          {avatar && <SkeletonBlock width={40} height={40} radius={20} />}
          <View style={styles.texts}>
            <SkeletonBlock width="55%" height={14} />
            <SkeletonBlock width="80%" height={12} />
          </View>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  list: {
    gap: 12,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
  },
  texts: {
    flex: 1,
    gap: 8,
  },
});
